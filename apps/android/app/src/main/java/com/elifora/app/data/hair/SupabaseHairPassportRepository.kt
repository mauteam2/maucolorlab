package com.elifora.app.data.hair

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import com.elifora.app.domain.hair.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import org.json.JSONObject

/** Uses the published RLS-protected read RPC and rechecks selected membership before returning protected data. */
class SupabaseHairPassportRepository(
    private val rpc: suspend (String) -> HttpReply,
    private val memberships: suspend () -> List<ActiveTenantContext>,
) : HairPassportRepository {
    override suspend fun read(context: ActiveTenantContext, client: Client, offsets: HairOffsets): HairReadResult {
        if (context.membershipStatus != "active") throw HairFailure("MEMBERSHIP_REVOKED")
        if (client.organizationId != context.organizationId) throw HairFailure("FORBIDDEN")
        val correlationId = UUID.randomUUID().toString()
        val options = JSONObject().put("include_archived", client.status.name == "ARCHIVED").put("page_size", 10)
            .put("observations_offset", offsets.observations).put("tests_offset", offsets.tests).put("history_offset", offsets.history)
        val request = JSONObject().put("p_membership_id", context.membershipId).put("p_location_id", context.locationId)
            .put("p_client_id", client.id).put("p_options", options).put("p_correlation_id", correlationId)
        val reply = rpc(request.toString())
        if (reply.status !in 200..299) throw HairFailure(when (reply.status) { 401 -> "SESSION_EXPIRED"; 403 -> "FORBIDDEN"; else -> "NETWORK_ERROR" }, reply.correlationId)
        val result = try {
            val body = JSONObject(reply.body)
            if (UUID.fromString(body.getString("correlationId")).toString() != correlationId) throw IllegalArgumentException("Correlation mismatch")
            if (body.has("code")) {
                val code = body.getString("code")
                if (code == "HAIR_PASSPORT_NOT_FOUND") HairReadResult.Empty else throw HairFailure(code, correlationId)
            } else HairReadResult.Snapshot(parsePassport(body.getJSONObject("data"), client, offsets))
        } catch (failure: HairFailure) { throw failure }
        catch (_: Exception) { throw HairFailure("NETWORK_ERROR", correlationId) }
        val selected = memberships().find { it.reference == context.reference && it.organizationId == context.organizationId && it.membershipStatus == "active" }
            ?: throw HairFailure("MEMBERSHIP_REVOKED", correlationId)
        if (!selected.permissions.containsAll(setOf("clients.read", "hair_passport.read"))) throw HairFailure("FORBIDDEN", correlationId)
        return result
    }
}

private fun JSONObject.uuid(key: String) = UUID.fromString(getString(key)).toString()
private fun JSONObject.optionalString(key: String): String? = if (isNull(key)) null else getString(key)
private fun JSONObject.optionalUuid(key: String): String? = if (isNull(key)) null else uuid(key)
private fun String.timestamp(): String = OffsetDateTime.parse(this).toString()
private fun String.calendarDate(): String = LocalDate.parse(this).toString()
private fun <T> JSONObject.page(key: String, offset: Int, parser: (JSONObject) -> T): HairPage<T> {
    val value = getJSONObject(key)
    val size = value.getInt("page_size")
    val actualOffset = value.getInt("offset")
    val hasMore = value.getBoolean("has_more")
    val next = if (value.isNull("next_offset")) null else value.getInt("next_offset")
    require(size == 10 && actualOffset == offset && next == if (hasMore) offset + size else null)
    val array = value.getJSONArray("items")
    require(array.length() <= size)
    return HairPage(List(array.length()) { parser(array.getJSONObject(it)) }, actualOffset, size, hasMore, next)
}
private fun parsePassport(data: JSONObject, client: Client, offsets: HairOffsets): HairPassport {
    val passport = data.getJSONObject("passport")
    require(passport.uuid("client_id") == client.id)
    require(passport.getString("client_status") == client.status.name)
    val regions = data.getJSONArray("regions").let { array -> List(array.length()) { parseRegion(array.getJSONObject(it)) } }
    val regionIds = regions.map { it.id }.toSet()
    require(regionIds.size == regions.size)
    val core = parseAssessment(data.getJSONObject("core"))
    val observations = data.page("observations", offsets.observations, ::parseObservation)
    val tests = data.page("physical_tests", offsets.tests, ::parseTest)
    val history = data.page("history", offsets.history, ::parseHistory)
    require(observations.items.all { it.regionId == null || it.regionId in regionIds })
    require(tests.items.all { it.regionId == null || it.regionId in regionIds })
    require(history.items.all { item -> item.regionIds.all { it in regionIds } })
    val status = passport.getString("status")
    require(status == "ACTIVE" || status == "ARCHIVED")
    return HairPassport(passport.uuid("id"), client.id, status == "ARCHIVED",
        passport.getString("updated_at").timestamp(), core, regions, observations, tests, history, passport.getLong("version").also { require(it > 0) })
}
internal fun parseAssessment(value: JSONObject): HairAssessment {
    val state = AssessmentState.valueOf(value.getString("state"))
    return when (state) {
        AssessmentState.NOT_ASSESSED -> { require(value.isNull("observation")); HairAssessment(state, null, null) }
        AssessmentState.ASSESSED -> parseObservation(value.getJSONObject("observation")).let { HairAssessment(state, it.values, it.evidence) }
        AssessmentState.UNVERIFIED -> HairAssessment(state, parseTechnical(value.getJSONObject("values")), null)
    }
}
internal fun parseRegion(value: JSONObject): HairRegion {
    val status = value.getString("status")
    require(status == "ACTIVE" || status == "ARCHIVED")
    return HairRegion(value.uuid("id"), RegionType.valueOf(value.getString("type")),
        value.optionalString("label"), status == "ARCHIVED", parseAssessment(value.getJSONObject("assessment")), value.getLong("version").also { require(it > 0) })
}
private fun parseTechnical(value: JSONObject): HairTechnicalValues {
    val facts = HairField.entries.associateWith { field ->
        val json = value.getJSONObject(field.name.lowercase())
        val state = FactState.valueOf(json.getString("state"))
        val fact = HairFact(state, if (json.isNull("value")) null else json.get("value").toString())
        require((state == FactState.KNOWN) == (fact.value != null))
        fact
    }
    return HairTechnicalValues(facts, value.optionalString("technical_notes"), value.optionalString("integrity_notes"))
}
private fun parseEvidence(value: JSONObject): HairEvidence {
    val confidence = value.getJSONObject("confidence")
    val confidenceState = FactState.valueOf(confidence.getString("state"))
    val confidenceValue = if (confidenceState == FactState.KNOWN) confidence.getDouble("value").also { require(it in 0.0..1.0) } else null
    val observed = value.getJSONObject("observed_at")
    val observedState = FactState.valueOf(observed.getString("state"))
    val observedAt = if (observedState == FactState.KNOWN) observed.getString("value").timestamp() else null
    return HairEvidence(EvidenceSource.valueOf(value.getString("source")), confidenceValue,
        value.optionalUuid("verified_by"), observedAt, value.optionalString("context"))
}
internal fun parseObservation(value: JSONObject) = HairObservation(value.uuid("id"), value.optionalUuid("region_id"),
    value.getString("recorded_at").timestamp(), parseTechnical(value), parseEvidence(value.getJSONObject("evidence")))
internal fun parseTest(value: JSONObject): HairPhysicalTest {
    val result = value.getJSONObject("result")
    val state = FactState.valueOf(result.getString("state"))
    require(state != FactState.NOT_ASSESSED)
    val fact = HairFact(state, if (result.isNull("value")) null else result.get("value").toString())
    require((state == FactState.KNOWN) == (fact.value != null))
    val evidence = parseEvidence(value.getJSONObject("evidence"))
    require(evidence.source == EvidenceSource.PHYSICAL_TEST)
    return HairPhysicalTest(value.uuid("id"), value.optionalUuid("region_id"), PhysicalTestType.valueOf(value.getString("type")),
        fact, value.getString("performed_at").timestamp(), value.uuid("performed_by"),
        value.optionalString("notes"), evidence)
}
internal fun parseHistory(value: JSONObject): HairHistoryEvent {
    val dateJson = value.getJSONObject("performed_on")
    val dateState = HistoryDateState.valueOf(dateJson.getString("state"))
    val dateValue = if (dateJson.isNull("value")) null else dateJson.getString("value").calendarDate()
    require((dateState == HistoryDateState.UNKNOWN) == (dateValue == null))
    val productJson = value.getJSONObject("product")
    val productState = FactState.valueOf(productJson.getString("state"))
    val product = HairFact(productState, if (productJson.isNull("value")) null else productJson.getString("value"))
    require((productState == FactState.KNOWN) == (product.value != null))
    val regionArray = value.getJSONArray("region_ids")
    val regionIds = List(regionArray.length()) { UUID.fromString(regionArray.getString(it)).toString() }
    require(regionIds.size == regionIds.toSet().size)
    return HairHistoryEvent(value.uuid("id"), HistoryCategory.valueOf(value.getString("category")), HairHistoryDate(dateState, dateValue), product,
        value.getString("description"), regionIds, value.optionalString("attributed_salon"), value.optionalString("attributed_professional"),
        parseEvidence(value.getJSONObject("evidence")))
}
