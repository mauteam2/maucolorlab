package com.elifora.app.data.crm

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.crm.*
import org.json.JSONObject
import java.time.OffsetDateTime
import java.util.UUID

/** Shared crm_read/crm_operation RPCs; no identity table or client-derived relationship rules. */
class SupabaseClientCrmRepository(private val read: suspend (String) -> HttpReply,
    private val write: suspend (String) -> HttpReply, private val memberships: suspend () -> List<ActiveTenantContext>) : ClientCrmRepository {
    private suspend fun verify(context: ActiveTenantContext, permission: String) {
        val fresh = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" }
            ?: throw ClientFailure("MEMBERSHIP_REVOKED")
        if (permission !in fresh.permissions) throw ClientFailure("FORBIDDEN")
    }
    private fun unwrap(reply: HttpReply, correlation: String): JSONObject {
        if (reply.status !in 200..299) throw ClientFailure(if (reply.status == 401) "SESSION_EXPIRED" else if (reply.status == 403) "FORBIDDEN" else "NETWORK_ERROR", correlation)
        val body = JSONObject(reply.body)
        if (body.has("code")) {
            val code = body.getString("code")
            val known = setOf("UNAUTHENTICATED", "SESSION_EXPIRED", "FORBIDDEN", "MEMBERSHIP_REQUIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "CRM_NOT_FOUND", "CRM_CONFLICT", "CRM_SIGNAL_CHANGED", "CRM_INVALID_TRANSITION", "CRM_REVIEW_EXPIRED", "CRM_DECISIONS_REQUIRED", "VALIDATION_FAILED", "NETWORK_ERROR")
            throw ClientFailure(if (code in known) code else "NETWORK_ERROR", correlation)
        }
        return body.getJSONObject("data")
    }
    private fun id(row: JSONObject, key: String) = UUID.fromString(row.getString(key)).toString()
    private fun optional(row: JSONObject, key: String) = if (row.isNull(key)) null else row.getString(key)
    private fun time(row: JSONObject, key: String) = OffsetDateTime.parse(row.getString(key)).toString()
    private suspend fun request(context: ActiveTenantContext, q: JSONObject, correlation: String) = unwrap(read(JSONObject()
        .put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_request", q).toString()), correlation)
    override suspend fun load(context: ActiveTenantContext, clientId: String, offset: Int): CrmBundle {
        val correlation = UUID.randomUUID().toString()
        try {
            require(offset in 0..10000)
            val requested = UUID.fromString(clientId).toString()
            verify(context, "crm.read")
            val overview = request(context, JSONObject().put("operation", "summary").put("client_id", requested), correlation)
            val s = overview.getJSONObject("summary")
            require(id(s, "organization_id") == context.organizationId && id(s, "location_id") == context.locationId && id(s, "requested_client_id") == requested)
            val canonical = id(s, "client_id")
            val family = s.getJSONArray("source_client_ids").let { values -> require(values.length() in 1..20); (0 until values.length()).map { UUID.fromString(values.getString(it)).toString() }.toSet() }
            require(canonical in family && s.getString("finance") == "NOT_AVAILABLE" && s.getString("recovery_state") == "NOT_ASSESSED")
            val staff = s.getJSONObject("preferred_staff")
            val next = if (s.isNull("upcoming_appointment")) null else s.getJSONObject("upcoming_appointment").let { n ->
                require(id(n, "client_id") in family && n.getString("status") in setOf("DRAFT", "CONFIRMED", "ARRIVED", "IN_SERVICE"))
                NextAppointment(id(n, "id"), time(n, "start_at"), n.getString("service_name"), n.getString("staff_name"))
            }
            val technical = s.getJSONArray("technical_followups").let { values -> require(values.length() <= 3); (0 until values.length()).map { values.getJSONObject(it).getString("kind").also { k -> require(k in setOf("CARE_CHECK_DUE", "COLOR_FOLLOWUP_DUE", "RECOVERY_REASSESSMENT_DUE")) } } }
            val counts = listOf("total_completed_visits", "cancellation_count", "no_show_count").map { s.getInt(it).also { n -> require(n >= 0) } }
            val days = if (s.isNull("days_since_last_visit")) null else s.getInt("days_since_last_visit").also { require(it >= 0) }
            val average = if (s.isNull("average_visit_interval_days")) null else s.getDouble("average_visit_interval_days").also { require(it.isFinite() && it >= 0) }
            val summary = CrmSummary(canonical, requested, RelationshipStatus.valueOf(s.getString("relationship_status")), counts[0], optional(s, "last_visit_at")?.let { OffsetDateTime.parse(it).toString() }, days, counts[1], counts[2], average,
                optional(staff, "name"), PreferenceSource.valueOf(staff.getString("source")), s.getJSONObject("return_signal").getString("status").also { require(it in setOf("INSUFFICIENT_DATA", "NOT_YET_DUE", "RETURN_WINDOW_OPEN", "OVERDUE", "ALREADY_BOOKED")) }, next, technical)
            val timeline = request(context, JSONObject().put("operation", "timeline").put("client_id", canonical).put("offset", offset).put("limit", 20), correlation)
            val events = timeline.getJSONArray("items").let { values -> require(values.length() <= 20); (0 until values.length()).map { index -> values.getJSONObject(index).let { row ->
                val sourceClient = id(row, "source_client_id"); require(sourceClient in family)
                val visibility = row.getString("visibility"); require(visibility in setOf("OPERATIONAL", "TECHNICAL", "RECEPTION", "PRIVATE_MANAGEMENT"))
                TimelineEvent(row.getString("event_key"), row.getString("event_type"), time(row, "timestamp"), row.getString("summary").also { require(it.length <= 4000) }, visibility, row.getString("source_domain"), id(row, "source_id"), sourceClient)
            } } }
            val actions = request(context, JSONObject().put("operation", "actions").put("client_id", canonical).put("offset", offset).put("limit", 20), correlation)
            val entries = actions.getJSONArray("items").let { values -> require(values.length() <= 20); (0 until values.length()).map { index -> values.getJSONObject(index).let { row ->
                require(id(row, "organization_id") == context.organizationId && id(row, "location_id") == context.locationId && id(row, "client_id") in family)
                CrmAction(id(row, "id"), id(row, "client_id"), CrmActionKind.valueOf(row.getString("kind")), CrmActionStatus.valueOf(row.getString("status")), CrmActionStatus.valueOf(row.getString("effective_status")), row.getLong("version").also { require(it > 0) }, time(row, "due_at"), optional(row, "snoozed_until")?.let { OffsetDateTime.parse(it).toString() })
            } } }
            require(timeline.getInt("offset") == offset && actions.getInt("offset") == offset)
            verify(context, "crm.read")
            return CrmBundle(summary, events, timeline.getBoolean("has_more"), entries, actions.getBoolean("has_more"), offset)
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR", correlation) }
    }
    override suspend fun transition(context: ActiveTenantContext, action: CrmAction, status: CrmActionStatus, mutationId: String) {
        val correlation = UUID.randomUUID().toString()
        try {
            require(status in setOf(CrmActionStatus.DONE, CrmActionStatus.DISMISSED))
            verify(context, "crm.actions.manage")
            val command = JSONObject().put("type", "ACTION_TRANSITION").put("mutation_id", UUID.fromString(mutationId).toString())
                .put("id", action.id).put("expected_version", action.version).put("status", status.name).put("snoozed_until", JSONObject.NULL)
            val result = unwrap(write(JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId).put("p_command", command).put("p_correlation_id", correlation).toString()), correlation)
            require(id(result, "id") == action.id && result.getLong("version") > action.version)
            verify(context, "crm.actions.manage")
        } catch (failure: ClientFailure) { throw failure }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { throw ClientFailure("NETWORK_ERROR", correlation) }
    }
}
