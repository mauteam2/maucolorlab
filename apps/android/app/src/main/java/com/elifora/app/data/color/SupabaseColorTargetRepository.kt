package com.elifora.app.data.color

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.color.*
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/** Target intent and historical reads only. Server evaluation/signing is not reimplemented on-device. */
class SupabaseColorTargetRepository(
    private val rpc: suspend (String, String) -> HttpReply,
    private val contexts: suspend () -> List<ActiveTenantContext>,
) : ColorTargetRepository {
    private suspend fun call(clientId: String, member: String, location: String, op: String, payload: JSONObject, plan: Boolean = false): JSONObject {
        suspend fun current(): ActiveTenantContext = contexts().first { it.membershipId == member && it.locationId == location && it.membershipStatus == "active" }.also {
            require(it.permissions.containsAll(setOf("clients.read", "hair_passport.read", if (op == "create") "color_plan.create" else "color_plan.read")))
        }
        val before = current()
        val result = rpc(if (plan) "color_plan_operation" else "color_target_operation", JSONObject().put("p_membership_id", UUID.fromString(member)).put("p_location_id", UUID.fromString(location)).put("p_client_id", UUID.fromString(clientId)).put("p_operation", op).put("p_payload", payload).put("p_correlation_id", UUID.randomUUID()).toString())
        require(result.status == 200)
        val data = JSONObject(result.body).getJSONObject("data")
        require(data.getString("clientId") == UUID.fromString(clientId).toString())
        require(current() == before)
        return data
    }
    override suspend fun save(clientId: String, requestId: String, definition: TargetDefinition, membershipId: String, locationId: String): String =
        call(clientId, membershipId, locationId, "create", JSONObject().put("request_id", UUID.fromString(requestId)).put("definition", encode(definition))).getString("id").also { UUID.fromString(it) }
    override suspend fun read(clientId: String, targetId: String, membershipId: String, locationId: String): TargetDefinition {
        val row = call(clientId, membershipId, locationId, "read", JSONObject().put("target_id", UUID.fromString(targetId)).put("include_archived", false))
        require(row.getString("id") == targetId)
        return parse(row.getJSONObject("definition"))
    }
    override suspend fun readPlan(clientId: String, planId: String, membershipId: String, locationId: String): ColorPlanSummary {
        val row = call(clientId, membershipId, locationId, "read", JSONObject().put("plan_id", UUID.fromString(planId)).put("include_archived", false), true)
        require(row.getString("id") == planId)
        val r = row.getJSONObject("result")
        val version = r.getString("engineVersion").also { require(it in setOf("color-engine/1.0.0", "color-engine/1.1.0")) }
        val status = r.getString("status").also { require(it in setOf("DRAFT", "REQUIRES_ASSESSMENT", "REQUIRES_TEST", "REQUIRES_RECOVERY", "BLOCKED_BY_RISK")) }
        val feasibility = r.getString("feasibility").also { require(it in setOf("DIRECT", "CONDITIONAL", "MULTI_STAGE", "MULTI_SESSION", "INFORMATION_REQUIRED", "RECOVERY_REQUIRED", "BLOCKED_BY_SAFETY_GATE")) }
        val risk = if (r.has("riskBand")) r.getString("riskBand").also { require(it in setOf("LOW", "MODERATE", "HIGH", "CRITICAL")) } else null
        val confidence = if (r.has("confidenceBand")) r.getString("confidenceBand").also { require(it in setOf("HIGH", "MEDIUM", "LOW", "INSUFFICIENT")) } else null
        if (version == "color-engine/1.1.0") require(risk != null && confidence != null && r.has("targetInterpretation"))
        return ColorPlanSummary(planId, row.getString("targetId"), version, status, feasibility, risk, confidence)
    }
    companion object {
        fun encode(t: TargetDefinition): JSONObject = JSONObject().put("schemaVersion", 1).put("mode", t.mode.name).put("globalIntent", t.globalIntent).put("regions", JSONArray(t.regions.map { r ->
            JSONObject().put("regionId", UUID.fromString(r.regionId)).put("level", r.level ?: JSONObject.NULL).put("toneFamily", r.toneFamily?.name ?: JSONObject.NULL).put("mixedFamilies", JSONArray(r.mixedFamilies.map { it.name }.sorted())).put("warmth", r.warmth).put("greyPriority", r.greyPriority).put("liftPriority", r.liftPriority).put("depositPriority", r.depositPriority).put("toneIntent", r.toneIntent).put("contrast", r.contrast).put("preserve", r.preserve).put("handling", r.handling).put("correction", r.correction).put("intermediateLevel", r.intermediateLevel ?: JSONObject.NULL)
        }))
        fun parse(t: JSONObject): TargetDefinition {
            require(t.keys().asSequence().toSet() == setOf("schemaVersion", "mode", "globalIntent", "regions") && t.get("schemaVersion") is Number && t.getDouble("schemaVersion") == 1.0)
            val rows = t.getJSONArray("regions")
            return TargetDefinition(TargetMode.valueOf(t.getString("mode")), t.getString("globalIntent"), List(rows.length()) { i ->
                val r = rows.getJSONObject(i)
                require(r.keys().asSequence().toSet() == setOf("regionId", "level", "toneFamily", "mixedFamilies", "warmth", "greyPriority", "liftPriority", "depositPriority", "toneIntent", "contrast", "preserve", "handling", "correction", "intermediateLevel"))
                require(r.get("preserve") is Boolean)
                fun number(k: String): Double? = if (r.isNull(k)) null else (r.get(k) as Number).toDouble()
                val mixed = r.getJSONArray("mixedFamilies")
                RegionalColorTarget(UUID.fromString(r.getString("regionId")).toString(), number("level"), if (r.isNull("toneFamily")) null else ToneFamily.valueOf(r.getString("toneFamily")), List(mixed.length()) { ToneFamily.valueOf(mixed.getString(it)) }, r.getString("warmth"), r.getString("greyPriority"), r.getString("liftPriority"), r.getString("depositPriority"), r.getString("toneIntent"), r.getString("contrast"), r.getBoolean("preserve"), r.getString("handling"), r.getString("correction"), number("intermediateLevel"))
            })
        }
    }
}
