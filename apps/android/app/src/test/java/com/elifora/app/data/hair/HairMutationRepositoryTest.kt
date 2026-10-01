package com.elifora.app.data.hair

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.hair.*
import java.io.File
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

internal fun contractFixture(name: String): JSONObject {
    val path = generateSequence(File(System.getProperty("user.dir") ?: ".")) { it.parentFile }
        .map { File(it, "contracts/fixtures/$name.json") }.first { it.isFile }
    return JSONObject(path.readText())
}
class HairMutationRepositoryTest {
    @Test fun professionalObservationUsesServerAttributionAndRejectsForgedVerifier() = runBlocking {
        val fixture = contractFixture("hair-observation-mutation")
        val user = fixture.getString("actor")
        val tenant = context.copy(locationId = fixture.getString("location"), permissions = context.permissions + "hair_passport.add_observation")
        val client = fixture.getJSONArray("valid").getJSONObject(2).getString("client_id")
        var forge = false
        val repository = SupabaseHairMutationRepository({ name, request ->
            assertEquals("hair_observation_operation", name)
            val body = JSONObject(request)
            val evidence = body.getJSONObject("p_payload").getJSONObject("evidence")
            assertEquals("PROFESSIONAL_VERIFIED", evidence.getString("source"))
            assertEquals("PERSONALLY_ASSESSED", evidence.getString("attestation"))
            assertFalse(evidence.has("verified_by")); assertFalse(evidence.has("observed_at"))
            val response = contractFixture("hair-observation-mutation").getJSONArray("results").getJSONObject(2)
            response.put("correlationId", body.getString("p_correlation_id"))
            if (forge) response.getJSONObject("data").getJSONObject("observation").getJSONObject("evidence").put("verified_by", id)
            HttpReply(200, response.toString(), body.getString("p_correlation_id"))
        }, { listOf(tenant) }, { user })
        val draft = HairDraft.Observation(1, value = FieldDraft(FactState.KNOWN, "5"), attested = true)
        repository.mutate(tenant, HairCommand(client, draft.write()))
        forge = true
        try { repository.mutate(tenant, HairCommand(client, draft.write())); fail("forged verifier") }
        catch (failure: HairFailure) { assertEquals("NETWORK_ERROR", failure.code) }
    }
    private val id = "b5000000-0000-4000-8000-000000000001"
    private val context = ActiveTenantContext(id, id, "Salon", id, "Bolu", "owner", "active", setOf("clients.read", "hair_passport.read", "hair_passport.create", "hair_passport.update"))
    @Test fun creationUsesExistingRpcAndServerDefaultRegions() = runBlocking {
        var calls = 0
        val repository = SupabaseHairMutationRepository({ name, request ->
            calls++; assertEquals("hair_core_operation", name)
            val body = JSONObject(request)
            assertEquals("create_passport", body.getString("p_operation"))
            assertEquals(context.membershipId, body.getString("p_membership_id"))
            assertFalse(body.getJSONObject("p_payload").has("organization_id"))
            assertFalse(body.getJSONObject("p_payload").has("technical"))
            val response = contractFixture("hair-core-mutation").getJSONObject("created")
            response.put("correlationId", body.getString("p_correlation_id"))
            HttpReply(200, response.toString(), body.getString("p_correlation_id"))
        }, { listOf(context) }, { id })
        val empty = TechnicalDraft.from(null)
        repository.mutate(context, HairCommand(id, HairDraft.Core(HairAction.CREATE, empty, empty).write()))
        assertEquals(1, calls)
    }
    @Test fun coreAndRegionPayloadsUseExactContractKeys() {
        val patch = TechnicalPatch(mapOf(HairField.NATURAL_LEVEL to HairFact(FactState.NOT_ASSESSED, null)), mapOf(HairNote.TECHNICAL to null))
        val core = payload(HairCommand(id, HairWrite.Core(HairAction.CORE, patch, 3, null, null, null, false))).second
        assertEquals(3L, core.getLong("expected_version"))
        assertEquals(setOf("natural_level", "technical_notes"), core.getJSONObject("technical").keys().asSequence().toSet())
        val region = payload(HairCommand(id, HairDraft.NewRegion(label = "Band").write())).second
        assertEquals("CUSTOM", region.getString("region_type")); assertEquals("Band", region.getString("label"))
        assertFalse(region.has("passport_id"))
    }
    @Test fun regionCreateAndUpdateValidateIdentityAndVersions() = runBlocking {
        val repository = SupabaseHairMutationRepository({ _, request ->
            val body = JSONObject(request)
            val response = contractFixture("hair-core-mutation").getJSONObject("region")
            if (body.getString("p_operation") == "update_region") response.getJSONObject("data").getJSONObject("region").put("version", 2)
            response.put("correlationId", body.getString("p_correlation_id"))
            HttpReply(200, response.toString(), body.getString("p_correlation_id"))
        }, { listOf(context) }, { id })
        repository.mutate(context, HairCommand(id, HairDraft.NewRegion(label = "Band").write()))
        val initial = TechnicalDraft.from(null)
        repository.mutate(context, HairCommand(id, HairDraft.Core(HairAction.REGION_EDIT, initial, initial, 1,
            "b5000000-0000-4000-8000-000000000003", "Old", "New", RegionType.CUSTOM).write()))
    }
    @Test fun revokedPermissionsAndMalformedConfirmationFailSafely() = runBlocking {
        val empty = TechnicalDraft.from(null)
        val command = HairCommand(id, HairDraft.Core(HairAction.CREATE, empty, empty).write())
        val revoked = SupabaseHairMutationRepository({ _, _ -> fail("RPC must not execute"); HttpReply(200, "{}", id) }, { emptyList() }, { id })
        try { revoked.mutate(context, command); fail("revoked") } catch (failure: HairFailure) { assertEquals("MEMBERSHIP_REVOKED", failure.code) }
        val malformed = SupabaseHairMutationRepository({ _, _ -> HttpReply(200, "{}", id) }, { listOf(context) }, { id })
        try { malformed.mutate(context, command); fail("unconfirmed") } catch (failure: HairFailure) { assertEquals("NETWORK_ERROR", failure.code) }
    }
}
