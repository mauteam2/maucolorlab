package com.elifora.app.data.hair

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.hair.*
import java.util.UUID
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

class SupabaseHairMutationRepository(
    private val rpc: suspend (String, String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>,
    private val actor: suspend () -> String,
) : HairMutationRepository {
    override suspend fun mutate(context: ActiveTenantContext, command: HairCommand) {
        verify(context, command.write.action)
        val actorId = if (command.write is HairWrite.Observation) actor() else null
        val correlation = UUID.randomUUID().toString()
        val request = JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId)
            .put("p_client_id", command.clientId).put("p_correlation_id", correlation)
        val (name, payload) = payload(command)
        request.put("p_payload", payload)
        if (command.write is HairWrite.Core) request.put("p_operation", coreOperation(command.write.action))
        val reply = rpc(name, request.toString())
        if (reply.status !in 200..299) throw HairFailure(when (reply.status) { 401 -> "SESSION_EXPIRED"; 403 -> "FORBIDDEN"; else -> "NETWORK_ERROR" }, correlation)
        try {
            val envelope = JSONObject(reply.body)
            require(envelope.getString("correlationId") == correlation)
            if (envelope.has("code")) throw HairFailure(envelope.getString("code"), correlation)
            validateResult(envelope.getJSONObject("data"), command, context, actorId)
        } catch (failure: HairFailure) { throw failure }
        catch (_: Exception) { throw HairFailure("NETWORK_ERROR", correlation) }
        verify(context, command.write.action)
    }
    private suspend fun verify(context: ActiveTenantContext, action: HairAction) {
        val current = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" }
            ?: throw HairFailure("MEMBERSHIP_REVOKED")
        if (!current.permissions.containsAll(setOf("clients.read", "hair_passport.read", action.permission))) throw HairFailure("FORBIDDEN")
    }
    private fun validateResult(data: JSONObject, command: HairCommand, context: ActiveTenantContext, actorId: String?) {
        if (command.write is HairWrite.Observation) {
            val write = command.write
            require(data.getString("client_id") == command.clientId && data.getLong("target_version") == write.version + 1)
            UUID.fromString(data.getString("passport_id"))
            val raw = data.getJSONObject("observation")
            val observation = parseObservation(raw)
            val evidence = raw.getJSONObject("evidence")
            require(observation.regionId == write.regionId && raw.getString("recorded_by") == actorId && evidence.getString("recorded_by") == actorId)
            require(observation.evidence.source == EvidenceSource.PROFESSIONAL_VERIFIED && observation.evidence.verifiedBy == actorId)
            require(evidence.getString("location_id") == context.locationId && evidence.getJSONObject("observed_at").getString("value") == evidence.getString("recorded_at"))
            require(observation.evidence.confidence == write.confidence)
            require(write.technical.facts.all { (field, fact) ->
                val actual = observation.values.facts[field]
                actual?.state == fact.state && (actual.value == fact.value || (fact.value?.toDoubleOrNull() != null && actual.value?.toDoubleOrNull() == fact.value.toDoubleOrNull()))
            })
            return
        }
        val write = command.write as HairWrite.Core
        if (write.action in listOf(HairAction.CREATE, HairAction.CORE)) {
            require(data.getString("kind") == "PASSPORT")
            val passport = data.getJSONObject("passport")
            UUID.fromString(passport.getString("id"))
            require(passport.getString("client_id") == command.clientId && passport.getString("status") == "ACTIVE" && passport.getString("client_status") == "ACTIVE")
            require(passport.getLong("version") == if (write.action == HairAction.CREATE) 1L else write.version!! + 1)
            parseAssessment(data.getJSONObject("core"))
            val regions = data.getJSONArray("regions").let { array -> List(array.length()) { parseRegion(array.getJSONObject(it)) } }
            if (write.action == HairAction.CREATE) require(regions.size == 3 && regions.map { it.type }.toSet() == setOf(RegionType.ROOT, RegionType.MID_LENGTHS, RegionType.ENDS) && regions.all { !it.archived && it.version == 1L })
            else require(regions.isEmpty())
        } else {
            require(data.getString("kind") == "REGION" && data.getString("client_id") == command.clientId)
            UUID.fromString(data.getString("passport_id"))
            val region = parseRegion(data.getJSONObject("region"))
            require(!region.archived)
            if (write.action == HairAction.REGION_EDIT) require(region.id == write.regionId && region.version == write.version!! + 1)
            else require(region.type == write.regionType && region.version == 1L)
        }
    }
}
internal fun coreOperation(action: HairAction) = when (action) {
    HairAction.CREATE -> "create_passport"
    HairAction.CORE -> "update_passport"
    HairAction.REGION_CREATE -> "create_region"
    HairAction.REGION_EDIT -> "update_region"
    else -> error("Not a core operation")
}
internal fun technicalJson(patch: TechnicalPatch) = JSONObject().apply {
    patch.facts.forEach { (field, fact) ->
        val value = fact.value?.let { if (field in listOf(HairField.NATURAL_LEVEL, HairField.PERCEIVED_LEVEL, HairField.GREY_RATIO)) it.toDouble() else it }
        put(field.name.lowercase(), JSONObject().put("state", fact.state.name).put("value", value ?: JSONObject.NULL))
    }
    patch.notes.forEach { (note, value) -> put(if (note == HairNote.TECHNICAL) "technical_notes" else "integrity_notes", value ?: JSONObject.NULL) }
}
internal fun payload(command: HairCommand): Pair<String, JSONObject> {
    val value = JSONObject().put("request_id", command.requestId)
    when (val write = command.write) {
        is HairWrite.Core -> {
            write.version?.let { value.put("expected_version", it) }
            write.regionId?.let { value.put("region_id", it) }
            if (write.action == HairAction.REGION_CREATE) value.put("region_type", write.regionType!!.name)
            if (write.includeLabel) value.put("label", write.label ?: JSONObject.NULL)
            if (!write.technical.isEmpty) value.put("technical", technicalJson(write.technical))
        }
        is HairWrite.Observation -> {
            value.put("expected_version", write.version).put("technical", technicalJson(write.technical))
            write.regionId?.let { value.put("region_id", it) }
            val evidence = JSONObject().put("source", "PROFESSIONAL_VERIFIED").put("attestation", "PERSONALLY_ASSESSED")
            write.confidence?.let { evidence.put("confidence", JSONObject().put("state", "KNOWN").put("value", it)) }
            value.put("evidence", evidence)
            return "hair_observation_operation" to value
        }
    }
    return "hair_core_operation" to value
}
