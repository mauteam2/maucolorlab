package com.elifora.app.data.clients

import com.elifora.app.data.auth.HttpReply
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SupabaseClientRepositoryTest {
    private val id = "70000000-0000-4000-8000-000000000001"
    private val context = ActiveTenantContext(id, id, "Salon", id, "Bolu", "owner", "active", setOf("clients.read"))
    @Test fun serializesOnlyVerifiedScopeAndPublicCommand() = runBlocking {
        var sent = JSONObject()
        val repository = SupabaseClientRepository { body -> sent = JSONObject(body); HttpReply(200, """{"data":{"items":[],"has_more":false},"correlationId":"$id"}""", id) }
        val result = repository.execute(context, ClientCommand.ListClients("0532")) as ClientReply.Directory
        assertTrue(result.items.isEmpty()); assertEquals(id, sent.getString("p_membership_id")); assertEquals("list", sent.getString("p_operation"))
        assertFalse(sent.getJSONObject("p_payload").has("organization_id")); assertEquals("0532", sent.getJSONObject("p_payload").getString("query"))
    }
    @Test fun duplicateEnvelopeMapsToReview() = runBlocking {
        val repository = SupabaseClientRepository { HttpReply(200, """{"code":"DUPLICATE_CLIENT_CANDIDATES","candidates":[{"id":"$id","full_name":"Ayşe","phone_masked":"••567","status":"ACTIVE","updated_at":"2026-09-11","signals":["PHONE"]}],"confirmation_token":"$id","correlationId":"$id"}""", id) }
        val result = repository.execute(context, ClientCommand.Save(ClientDraft("Ayşe", "05321234567"))) as ClientReply.Duplicate
        assertEquals(id, result.token); assertEquals(setOf("PHONE"), result.candidates.single().signals); assertEquals(id, result.correlationId)
    }
    @Test fun stableDomainFailureKeepsCorrelation() = runBlocking {
        val repository = SupabaseClientRepository { HttpReply(200, """{"code":"CLIENT_NOT_FOUND","correlationId":"$id"}""", id) }
        try { repository.execute(context, ClientCommand.Detail(id)); fail("must fail") } catch (failure: ClientFailure) { assertEquals("CLIENT_NOT_FOUND", failure.code); assertEquals(id, failure.correlationId) }
    }
    @Test fun transportFailureDoesNotExposeProviderBody() = runBlocking {
        val repository = SupabaseClientRepository { HttpReply(403, "private provider body", id) }
        try { repository.execute(context, ClientCommand.ListClients()); fail("must fail") } catch (failure: ClientFailure) { assertEquals("FORBIDDEN", failure.code); assertFalse(failure.message!!.contains("private")) }
    }
    @Test fun malformedResponseFailsClosed() = runBlocking {
        val repository = SupabaseClientRepository { HttpReply(200, "{}", id) }
        try { repository.execute(context, ClientCommand.ListClients()); fail("must fail") } catch (failure: ClientFailure) { assertEquals("NETWORK_ERROR", failure.code) }
    }
}
