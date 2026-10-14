package com.elifora.app.data.saas

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.saas.*
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.math.BigInteger
import java.time.OffsetDateTime
import java.util.UUID

class SupabaseSaasRepository(private val snapshot: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>) : SaasRepository {
    private fun id(value: String) = UUID.fromString(value).toString()
    private fun exact(row: JSONObject, key: String): BigInteger? {
        if (row.isNull(key)) return null
        require(row.get(key) is String)
        val value = row.getString(key); require(value.matches(Regex("(0|[1-9][0-9]{0,18})")))
        return BigInteger(value)
    }
    private fun decode(body: String, context: ActiveTenantContext): SaaSAccount {
        val envelope = JSONObject(body)
        if (envelope.has("code")) throw ClientFailure(envelope.getString("code"))
        val data = envelope.getJSONObject("data")
        require(data.keys().asSequence().toSet() == setOf("organization_id", "location_id", "version", "status", "entitlements", "management_allowed", "plan", "subscription", "period", "quotas", "observed_at", "diagnostics"))
        require(id(data.getString("organization_id")) == context.organizationId && id(data.getString("location_id")) == context.locationId)
        require(data.get("version") is Number && data.getLong("version") >= 0)
        val status = SubscriptionState.valueOf(data.getString("status")); val manage = data.getBoolean("management_allowed")
        require(!manage || context.role == "owner")
        if (!manage) require(data.isNull("plan") && data.isNull("subscription") && data.isNull("period") && data.isNull("diagnostics"))
        val features = data.getJSONArray("entitlements"); require(features.length() == 10)
        val entitlements = (0 until features.length()).map { index ->
            val row = features.getJSONObject(index)
            require(row.keys().asSequence().toSet() == setOf("capability", "configured", "enabled", "creation_allowed", "reason"))
            val configured = row.getBoolean("configured"); val enabled = row.getBoolean("enabled"); val creation = row.getBoolean("creation_allowed")
            require(!creation || configured && enabled && status in setOf(SubscriptionState.ACTIVE, SubscriptionState.TRIAL, SubscriptionState.GRACE))
            Entitlement(Capability.valueOf(row.getString("capability")), configured, enabled, creation, if (row.isNull("reason")) null else row.getString("reason"))
        }
        require(entitlements.map { it.capability }.toSet().size == 10)
        val rows = data.getJSONArray("quotas"); require(rows.length() <= 4 && (manage || rows.length() == 0))
        val quotas = (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index); require(row.keys().asSequence().toSet() == setOf("code", "configured", "limit", "used", "status"))
            val code = row.getString("code"); require(code in setOf("LOCATIONS", "ACTIVE_MEMBERS", "STORAGE_BYTES", "ENGINE_EXECUTIONS"))
            val limit = exact(row, "limit"); val used = exact(row, "used"); val configured = row.getBoolean("configured")
            val expected = when { !configured || used == null -> "UNKNOWN"; limit == null -> "UNCAPPED"; used > limit -> "EXCEEDED"; used == limit -> "AT_LIMIT"; else -> "AVAILABLE" }
            require(row.getString("status") == expected)
            Quota(code, configured, limit, used, expected)
        }
        require(quotas.map { it.code }.toSet().size == quotas.size)
        val period = if (data.isNull("period")) null else data.getJSONObject("period").let {
            require(it.keys().asSequence().toSet() == setOf("id", "start", "end"))
            require(OffsetDateTime.parse(it.getString("end")).isAfter(OffsetDateTime.parse(it.getString("start"))))
            UsagePeriod(id(it.getString("id")), it.getString("start"), it.getString("end"))
        }
        val label = if (data.isNull("plan")) null else data.getJSONObject("plan").let {
            require(it.keys().asSequence().toSet() == setOf("id", "code", "label", "development_only", "version_id", "version"))
            id(it.getString("id")); id(it.getString("version_id")); require(it.getString("code").matches(Regex("[A-Z][A-Z0-9_]{0,63}")))
            it.getString("label").also { label -> require(label.length in 1..120) }
        }
        if (!data.isNull("subscription")) data.getJSONObject("subscription").let {
            require(it.keys().asSequence().toSet() == setOf("status", "version", "subscription_id", "plan_version_id", "creation_allowed", "effective_from", "effective_until", "trial_end", "grace_end"))
            require(it.getLong("version") == data.getLong("version") && it.getString("status") == status.name)
            for (key in listOf("effective_from", "effective_until", "trial_end", "grace_end")) if (!it.isNull(key)) OffsetDateTime.parse(it.getString(key))
        }
        if (!data.isNull("diagnostics")) data.getJSONObject("diagnostics").let {
            require(it.keys().asSequence().toSet() == setOf("provider_rejected", "quota_rejections", "subscription_rejections", "usage_projection_mismatch"))
            for (key in listOf("provider_rejected", "quota_rejections", "subscription_rejections")) require(it.get(key) is Number && it.getLong(key) >= 0)
            require(it.get("usage_projection_mismatch") is Boolean)
        }
        OffsetDateTime.parse(data.getString("observed_at"))
        return SaaSAccount(context.organizationId, context.locationId, data.getLong("version"), status, manage, label, period, entitlements, quotas, data.getString("observed_at"))
    }
    override suspend fun load(context: ActiveTenantContext): SaaSAccount {
        suspend fun verify(): ActiveTenantContext {
            val current = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" } ?: throw ClientFailure("MEMBERSHIP_REVOKED")
            if ("saas.entitlements.read" !in current.permissions) throw ClientFailure("FORBIDDEN")
            return current
        }
        suspend fun read(): SaaSAccount {
            val reply = snapshot(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).toString())
            if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR")
            return decode(reply.body, context)
        }
        try {
            val before = verify(); val account = read(); val after = verify()
            if (before.permissions != after.permissions || before.role != after.role) throw ClientFailure("TENANT_CONTEXT_INVALID")
            val current = read()
            if (current.managementAllowed != account.managementAllowed) throw ClientFailure("TENANT_CONTEXT_INVALID")
            if (current.version != account.version || current.status != account.status) throw ClientFailure("SAAS_VERSION_CONFLICT")
            return account
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR") }
    }
}
