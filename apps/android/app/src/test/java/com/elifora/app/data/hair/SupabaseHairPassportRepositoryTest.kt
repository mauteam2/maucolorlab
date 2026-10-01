package com.elifora.app.data.hair

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import com.elifora.app.domain.clients.ClientStatus
import com.elifora.app.domain.hair.*
import java.io.File
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SupabaseHairPassportRepositoryTest {
    private val id = "b2000000-0000-4000-8000-000000000031"
    private val context = ActiveTenantContext("b2000000-0000-4000-8000-000000000021", "b2000000-0000-4000-8000-000000000001",
        "Salon", "b2000000-0000-4000-8000-000000000011", "Bolu", "owner", "active", setOf("clients.read", "hair_passport.read"))
    private val client = Client(id, context.organizationId, "Ayşe", "05321234567", null, null, ClientStatus.ACTIVE, 1,
        "2026-09-10T12:00:00Z", "2026-09-10T12:00:00Z")
    private val fixture by lazy {
        val path = generateSequence(File(System.getProperty("user.dir") ?: ".")) { it.parentFile }
            .map { File(it, "contracts/fixtures/hair-passport-read.json") }.first { it.isFile }
        JSONObject(path.readText())
    }

    private fun repository(section: String, membership: List<ActiveTenantContext> = listOf(context),
        mutate: (JSONObject) -> Unit = {}): SupabaseHairPassportRepository = SupabaseHairPassportRepository({ request ->
        val sent = JSONObject(request)
        assertEquals(context.membershipId, sent.getString("p_membership_id"))
        assertEquals(context.locationId, sent.getString("p_location_id"))
        assertEquals(id, sent.getString("p_client_id"))
        assertEquals(10, sent.getJSONObject("p_options").getInt("page_size"))
        val response = JSONObject(fixture.getJSONObject(section).toString())
        response.put("correlationId", sent.getString("p_correlation_id"))
        val data = response.getJSONObject("data")
        listOf("observations", "physical_tests", "history").forEach { data.getJSONObject(it).put("page_size", 10) }
        mutate(response)
        HttpReply(200, response.toString(), sent.getString("p_correlation_id"))
    }, { membership })

    @Test fun populatedSnapshotMapsAllReadSections() = runBlocking {
        val passport = (repository("populated").read(context, client, HairOffsets()) as HairReadResult.Snapshot).passport
        assertEquals(id, passport.clientId)
        assertEquals(AssessmentState.ASSESSED, passport.core.state)
        assertEquals(FactState.KNOWN, passport.core.values!!.facts[HairField.NATURAL_LEVEL]!!.state)
        assertEquals(FactState.UNKNOWN, passport.core.values.facts[HairField.POROSITY]!!.state)
        assertEquals(FactState.NOT_ASSESSED, passport.core.values.facts[HairField.PERCEIVED_LEVEL]!!.state)
        assertEquals(EvidenceSource.AI_ESTIMATE, passport.core.evidence!!.source)
        assertEquals(0.75, passport.core.evidence.confidence!!, 0.001)
        assertEquals(RegionType.ROOT, passport.regions.single().type)
        assertEquals(EvidenceSource.PROFESSIONAL_VERIFIED, passport.regions.single().assessment.evidence!!.source)
        assertEquals(context.membershipId, passport.regions.single().assessment.evidence!!.verifiedBy)
        assertEquals(2, passport.observations.items.size)
        assertEquals(EvidenceSource.AI_ESTIMATE, passport.observations.items.first().evidence.source)
        assertEquals(PhysicalTestType.STRAND, passport.tests.items.single().type)
        assertEquals(EvidenceSource.PHYSICAL_TEST, passport.tests.items.single().evidence.source)
        assertEquals(HistoryDateState.APPROXIMATE, passport.history.items.single().date.state)
        assertEquals(EvidenceSource.IMPORTED_UNVERIFIED, passport.history.items.single().evidence.source)
    }

    @Test fun emptyAndPartialSnapshotsStayExplicit() = runBlocking {
        val empty = (repository("empty").read(context, client, HairOffsets()) as HairReadResult.Snapshot).passport
        assertEquals(AssessmentState.NOT_ASSESSED, empty.core.state)
        assertTrue(empty.regions.isEmpty())
        assertTrue(empty.observations.items.isEmpty())
        val partial = (repository("populated", mutate = { response ->
            val data = response.getJSONObject("data")
            val region = data.getJSONArray("regions").getJSONObject(0)
            region.put("type", "CUSTOM").put("label", "Ön tutam")
            val evidence = data.getJSONObject("core").getJSONObject("observation").getJSONObject("evidence")
            evidence.getJSONObject("confidence").put("state", "UNKNOWN").put("value", JSONObject.NULL)
            val history = data.getJSONObject("history").getJSONArray("items").getJSONObject(0)
            history.getJSONObject("performed_on").put("state", "UNKNOWN").put("value", JSONObject.NULL)
        }).read(context, client, HairOffsets()) as HairReadResult.Snapshot).passport
        assertEquals("Ön tutam", partial.regions.single().label)
        assertEquals(RegionType.CUSTOM, partial.regions.single().type)
        assertNull(partial.core.evidence!!.confidence)
        assertEquals(HistoryDateState.UNKNOWN, partial.history.items.single().date.state)
        assertNull(partial.history.items.single().date.value)
    }

    @Test fun absentPassportMapsToEmptyOnlyAfterRevalidation() = runBlocking {
        val repository = SupabaseHairPassportRepository({ request ->
            val cid = JSONObject(request).getString("p_correlation_id")
            HttpReply(200, """{"code":"HAIR_PASSPORT_NOT_FOUND","correlationId":"$cid"}""", cid)
        }, { listOf(context) })
        assertEquals(HairReadResult.Empty, repository.read(context, client, HairOffsets()))
    }

    @Test fun revokedMembershipConcealsSnapshot() = runBlocking {
        try { repository("populated", emptyList()).read(context, client, HairOffsets()); fail("must revoke") }
        catch (failure: HairFailure) { assertEquals("MEMBERSHIP_REVOKED", failure.code) }
    }

    @Test fun permissionRemovalConcealsSnapshot() = runBlocking {
        try { repository("populated", listOf(context.copy(permissions = setOf("clients.read")))).read(context, client, HairOffsets()); fail("must forbid") }
        catch (failure: HairFailure) { assertEquals("FORBIDDEN", failure.code) }
    }

    @Test fun malformedOrTransportFailureFailsClosed() = runBlocking {
        val malformed = repository("populated", mutate = { it.getJSONObject("data").getJSONObject("passport").put("client_id", context.membershipId) })
        try { malformed.read(context, client, HairOffsets()); fail("must fail") }
        catch (failure: HairFailure) { assertEquals("NETWORK_ERROR", failure.code) }
        val network = SupabaseHairPassportRepository({ HttpReply(500, "private", "cid") }, { listOf(context) })
        try { network.read(context, client, HairOffsets()); fail("must fail") }
        catch (failure: HairFailure) { assertEquals("NETWORK_ERROR", failure.code); assertFalse(failure.message!!.contains("private")) }
    }
}
