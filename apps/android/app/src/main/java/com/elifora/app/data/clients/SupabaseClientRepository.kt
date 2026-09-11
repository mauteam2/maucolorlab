package com.elifora.app.data.clients

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.*
import org.json.JSONObject
import java.util.UUID

/** Calls only the approved RPC using the shared authenticated transport, never privileged credentials. */
class SupabaseClientRepository(private val rpc: suspend (String) -> HttpReply) : ClientRepository {
    override suspend fun execute(context: ActiveTenantContext, command: ClientCommand): ClientReply {
        val payload = JSONObject()
        val operation = when (command) {
            is ClientCommand.ListClients -> { payload.put("query", command.query).put("status", command.status.name).put("offset", command.offset).put("limit", 25); "list" }
            is ClientCommand.Detail -> { payload.put("client_id", command.id); "detail" }
            is ClientCommand.Save -> {
                val draft = command.draft
                payload.put("full_name", draft.fullName).put("phone", draft.phone).put("phone_region", "TR")
                    .put("email", draft.email).put("birth_date", draft.birthDate).put("request_id", draft.requestId)
                command.confirmationToken?.let { payload.put("confirmation_token", it) }
                if (draft.clientId != null) { payload.put("client_id", draft.clientId).put("expected_version", draft.expectedVersion); "update" } else "create"
            }
            is ClientCommand.Lifecycle -> { payload.put("client_id", command.client.id).put("expected_version", command.client.version).put("request_id", command.requestId); if (command.restore) "restore" else "archive" }
        }
        val correlationId = UUID.randomUUID().toString()
        val reply = rpc(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId)
            .put("p_operation", operation).put("p_payload", payload).put("p_correlation_id", correlationId).toString())
        if (reply.status !in 200..299) throw ClientFailure(when (reply.status) { 401 -> "SESSION_EXPIRED"; 403 -> "FORBIDDEN"; else -> "NETWORK_ERROR" }, reply.correlationId)
        try {
            val body = JSONObject(reply.body)
            val correlation = UUID.fromString(body.getString("correlationId")).toString()
            if (body.has("code")) {
                val code = body.getString("code")
                if (code != "DUPLICATE_CLIENT_CANDIDATES") throw ClientFailure(code, correlation)
                val candidates = body.getJSONArray("candidates")
                return ClientReply.Duplicate(List(candidates.length()) { index ->
                    val row = candidates.getJSONObject(index)
                    val signals = row.getJSONArray("signals")
                    DuplicateCandidate(summary(row), (0 until signals.length()).map { signals.getString(it) }.toSet())
                }, UUID.fromString(body.getString("confirmation_token")).toString(), correlation)
            }
            val data = body.getJSONObject("data")
            if (operation == "list") {
                val items = data.getJSONArray("items")
                return ClientReply.Directory(List(items.length()) { summary(items.getJSONObject(it)) }, data.getBoolean("has_more"))
            }
            fun optional(key: String) = if (data.isNull(key)) null else data.getString(key)
            return ClientReply.Saved(Client(data.getString("id"), data.getString("organization_id"), data.getString("full_name"), data.getString("phone"),
                optional("email"), optional("birth_date"), ClientStatus.valueOf(data.getString("status")), data.getLong("version"), data.getString("created_at"), data.getString("updated_at")))
        } catch (failure: ClientFailure) { throw failure }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR", correlationId) }
    }
    private fun summary(row: JSONObject) = ClientSummary(UUID.fromString(row.getString("id")).toString(), row.getString("full_name"), row.getString("phone_masked"), ClientStatus.valueOf(row.getString("status")), row.getString("updated_at"))
}
