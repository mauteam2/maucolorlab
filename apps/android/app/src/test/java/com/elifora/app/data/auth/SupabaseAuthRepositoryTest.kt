package com.elifora.app.data.auth

import com.elifora.app.domain.auth.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SupabaseAuthRepositoryTest {
    private class MemoryStore : SessionStore {
        var value: String? = null
        override fun read() = value
        override fun write(value: String?) { this.value = value }
    }
    private class Transport : AuthTransport {
        val paths = mutableListOf<String>()
        val tokens = mutableListOf<String?>()
        val replies = ArrayDeque<HttpReply>()
        override suspend fun request(method: String, path: String, token: String?, body: String?): HttpReply {
            paths.add(path); tokens.add(token)
            return replies.removeFirst()
        }
    }
    private val transport = Transport()
    private val store = MemoryStore()
    private var now = 1000L
    private val repository = SupabaseAuthRepository(transport, store) { now }
    private fun token(suffix: String = "1") = HttpReply(200,
        """{"access_token":"access-$suffix","refresh_token":"refresh-$suffix","expires_in":120}""", "correlation")
    private fun user() = HttpReply(200, """{"id":"10000000-0000-4000-8000-000000000001"}""", "correlation")
    private suspend fun login() {
        transport.replies.add(token())
        repository.signIn("person@example.test", "test-password")
    }
    @Test fun signInUsesRealProviderPasswordEndpoint() = runBlocking {
        login()
        assertEquals(listOf("/auth/v1/token?grant_type=password"), transport.paths)
        assertNotNull(store.value)
    }
    @Test fun processRestoreValidatesUserOnServer() = runBlocking {
        login(); transport.replies.add(user())
        val restored = SupabaseAuthRepository(transport, store) { now }
        assertTrue(restored.restore())
        assertEquals("/auth/v1/user", transport.paths.last())
    }
    @Test fun expiredAccessRotatesRefreshTokenBeforeRequestAndPersists() = runBlocking {
        login(); now = 1121
        transport.replies.add(token("2")); transport.replies.add(user())
        assertTrue(repository.restore())
        assertEquals(listOf("/auth/v1/token?grant_type=password", "/auth/v1/token?grant_type=refresh_token", "/auth/v1/user"), transport.paths)
        assertTrue(transport.tokens.last() == "access-2")
        assertTrue(JSONObject(store.value!!).getString("refresh_token") == "refresh-2")
    }
    @Test fun unauthorizedUserRequestRefreshesAndRetriesOnce() = runBlocking {
        login()
        transport.replies.add(HttpReply(401, "{}", "correlation"))
        transport.replies.add(token("2")); transport.replies.add(user())
        assertTrue(repository.restore())
        assertEquals(2, transport.paths.count { it == "/auth/v1/user" })
    }
    @Test fun invalidRefreshClearsSessionAndPreservesCorrelation() = runBlocking {
        login(); now = 1121
        transport.replies.add(HttpReply(400, "{}", "provider-operation"))
        try { repository.restore(); fail("Expected session expiration") }
        catch (failure: AccessFailure) {
            assertEquals(ErrorCode.SESSION_EXPIRED, failure.code)
            assertEquals("provider-operation", failure.correlationId)
        }
        assertNull(store.value)
        assertFalse(repository.restore())
    }
    @Test fun transientRefreshFailureRetainsEncryptedSessionForRetry() = runBlocking {
        login(); now = 1121
        transport.replies.add(HttpReply(503, "{}", "correlation"))
        try { repository.restore(); fail("Expected network error") }
        catch (failure: AccessFailure) { assertEquals(ErrorCode.NETWORK_ERROR, failure.code) }
        assertNotNull(store.value)
        transport.replies.add(token("2")); transport.replies.add(user())
        assertTrue(repository.restore())
    }
    @Test fun invalidPasswordDoesNotPersistSession() = runBlocking {
        transport.replies.add(HttpReply(400, "{}", "correlation"))
        try { repository.signIn("person@example.test", "wrong"); fail("Expected denial") }
        catch (failure: AccessFailure) { assertEquals(ErrorCode.INVALID_CREDENTIALS, failure.code) }
        assertNull(store.value)
    }
    @Test fun workspaceReadUsesOnlyParameterlessRpcAndBearerSession() = runBlocking {
        login()
        transport.replies.add(HttpReply(200, """[{
            "membership_id":"40000000-0000-4000-8000-000000000001",
            "organization_id":"20000000-0000-4000-8000-000000000001",
            "organization_name":"Salon A",
            "location_id":"30000000-0000-4000-8000-000000000001",
            "location_name":"Bolu","role":"owner","membership_status":"active",
            "permissions":["memberships.read"]
        }]""", "correlation"))
        val contexts = repository.list()
        assertEquals("/rest/v1/rpc/list_workspace_contexts", transport.paths.last())
        assertTrue(transport.tokens.last() == "access-1")
        assertEquals(setOf("memberships.read"), contexts.single().permissions)
    }
    @Test fun logoutClearsLocalSessionEvenWhenProviderFails() = runBlocking {
        login()
        transport.replies.add(HttpReply(503, "{}", "correlation"))
        repository.logout()
        assertNull(store.value)
        assertFalse(repository.restore())
        assertEquals("/auth/v1/logout?scope=local", transport.paths.last())
    }
    @Test fun corruptSavedSessionCannotAuthenticate() = runBlocking {
        store.value = "corrupt"
        assertFalse(repository.restore())
        assertNull(store.value)
        assertTrue(transport.paths.isEmpty())
    }
}
