package com.elifora.app.data.auth

import com.elifora.app.domain.auth.*
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject

/** Supabase Auth REST adapter. No JWT claims are used as authorization evidence. */
class SupabaseAuthRepository(
    private val transport: AuthTransport,
    private val store: SessionStore,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) : AuthRepository, WorkspaceRepository {
    private val mutex = Mutex()
    // Do not make this a data class: its toString must never expose tokens.
    private class Session(val access: String, val refresh: String, val expiresAt: Long)
    private var session: Session? = null
    private var loaded = false

    private fun load() {
        if (loaded) return
        loaded = true
        val value = store.read() ?: return
        try {
            val json = JSONObject(value)
            session = Session(json.getString("access_token"), json.getString("refresh_token"), json.getLong("expires_at"))
        } catch (_: Exception) { clear() }
    }
    private fun clear() { session = null; loaded = true; store.write(null) }
    private fun save(reply: HttpReply) {
        val body = JSONObject(reply.body)
        val next = Session(body.getString("access_token"), body.getString("refresh_token"), nowSeconds() + body.getLong("expires_in"))
        store.write(JSONObject().put("access_token", next.access).put("refresh_token", next.refresh).put("expires_at", next.expiresAt).toString())
        session = next
        loaded = true
    }
    private fun requireSuccess(reply: HttpReply, denied: ErrorCode) {
        if (reply.status in 200..299) return
        val code = when {
            reply.status == 429 || reply.status >= 500 -> ErrorCode.NETWORK_ERROR
            reply.status == 401 || reply.status == 400 || reply.status == 422 -> denied
            reply.status == 403 -> ErrorCode.FORBIDDEN
            else -> ErrorCode.NETWORK_ERROR
        }
        throw AccessFailure(code, reply.correlationId)
    }
    private suspend fun refresh() {
        val current = session ?: throw AccessFailure(ErrorCode.UNAUTHENTICATED)
        val reply = transport.request("POST", "/auth/v1/token?grant_type=refresh_token", null,
            JSONObject().put("refresh_token", current.refresh).toString())
        try { requireSuccess(reply, ErrorCode.SESSION_EXPIRED) }
        catch (failure: AccessFailure) {
            if (failure.code == ErrorCode.SESSION_EXPIRED || failure.code == ErrorCode.FORBIDDEN) clear()
            throw failure
        }
        save(reply)
    }
    private suspend fun authenticated(method: String, path: String, body: String? = null): HttpReply {
        load()
        val current = session ?: throw AccessFailure(ErrorCode.UNAUTHENTICATED)
        if (current.expiresAt <= nowSeconds() + 60) refresh()
        var reply = transport.request(method, path, session!!.access, body)
        if (reply.status == 401) {
            refresh()
            reply = transport.request(method, path, session!!.access, body)
        }
        try { requireSuccess(reply, ErrorCode.SESSION_EXPIRED) }
        catch (failure: AccessFailure) {
            if (failure.code == ErrorCode.SESSION_EXPIRED) clear()
            throw failure
        }
        return reply
    }
    override suspend fun restore(): Boolean = mutex.withLock {
        load()
        if (session == null) return@withLock false
        val user = JSONObject(authenticated("GET", "/auth/v1/user").body)
        UUID.fromString(user.getString("id"))
        true
    }
    suspend fun clientOperation(body: String): HttpReply = mutex.withLock {
        authenticated("POST", "/rest/v1/rpc/client_operation", body)
    }
    override suspend fun signIn(email: String, password: String) = mutex.withLock {
        val reply = transport.request("POST", "/auth/v1/token?grant_type=password", null,
            JSONObject().put("email", email).put("password", password).toString())
        requireSuccess(reply, ErrorCode.INVALID_CREDENTIALS)
        save(reply)
    }
    override suspend fun list(): List<ActiveTenantContext> = mutex.withLock {
        val rows = JSONArray(authenticated("POST", "/rest/v1/rpc/list_workspace_contexts", "{}").body)
        List(rows.length()) { index ->
            val row = rows.getJSONObject(index)
            fun id(field: String) = UUID.fromString(row.getString(field)).toString()
            val permissions = row.getJSONArray("permissions")
            val role = row.getString("role")
            require(role in setOf("owner", "manager", "colorist", "assistant", "reception"))
            require(row.getString("membership_status") == "active")
            ActiveTenantContext(id("membership_id"), id("organization_id"), row.getString("organization_name"),
                id("location_id"), row.getString("location_name"), role, "active",
                (0 until permissions.length()).map { permissions.getString(it) }.toSet())
        }
    }
    override suspend fun logout() = mutex.withLock {
        load()
        val token = session?.access
        // Local sign-out succeeds even when the network is unavailable.
        clear()
        if (token != null) try { transport.request("POST", "/auth/v1/logout?scope=local", token, "{}") }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { /* No token or provider payload is logged. */ }
    }
}
