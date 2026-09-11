package com.elifora.app.domain.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class WorkspaceControllerTest {
    private val a = ActiveTenantContext("membership-a", "org-a", "Salon A", "loc-a", "Bolu", "owner", "active", setOf("membership.read"))
    private val b = a.copy(locationId = "loc-b", locationName = "İzmit")
    private class FakeAuth : AuthRepository {
        var signedIn = false
        var failure: AccessFailure? = null
        var loggedOut = false
        override suspend fun restore(): Boolean { failure?.let { throw it }; return signedIn }
        override suspend fun signIn(email: String, password: String) { failure?.let { throw it }; signedIn = true }
        override suspend fun logout() { loggedOut = true; signedIn = false }
    }
    private class ReferenceStore : WorkspaceReferenceStore { override var reference: String? = null }
    private val auth = FakeAuth()
    private val store = ReferenceStore()
    private var rows = listOf(a)
    private var listFailure: AccessFailure? = null
    private val controller = WorkspaceController(auth, WorkspaceRepository { listFailure?.let { throw it }; rows }, store)

    @Test fun initialStateIsLoading() { assertEquals(WorkspaceState.LoadingSession, controller.state.value) }
    @Test fun periodicRefreshKeepsReadyUntilDecisionAndStillRevokes() = runBlocking {
        auth.signedIn = true
        var gate: CompletableDeferred<Unit>? = null
        val current = WorkspaceController(auth, WorkspaceRepository { gate?.await(); rows }, store)
        current.restore(); gate = CompletableDeferred()
        val refresh = launch { current.refresh() }; yield()
        assertEquals(WorkspaceState.Ready(a), current.state.value)
        rows = emptyList(); gate!!.complete(Unit); refresh.join()
        assertTrue(current.state.value is WorkspaceState.NoMembership)
    }
    @Test fun missingSessionClearsReference() = runBlocking {
        store.reference = a.reference
        controller.restore()
        assertEquals(WorkspaceState.SignedOut(), controller.state.value)
        assertNull(store.reference)
    }
    @Test fun loginBootstrapsAndAutoSelects() = runBlocking {
        controller.signIn("person@example.test", "test-password")
        assertEquals(WorkspaceState.Ready(a), controller.state.value)
        assertEquals(a.reference, store.reference)
    }
    @Test fun multipleLocationsRequireSelection() = runBlocking {
        rows = listOf(a, b); auth.signedIn = true
        controller.restore()
        assertTrue(controller.state.value is WorkspaceState.SelectingWorkspace)
        controller.select(b.reference)
        assertEquals(WorkspaceState.Ready(b), controller.state.value)
    }
    @Test fun processRecreationRevalidatesSavedReference() = runBlocking {
        rows = listOf(a, b); auth.signedIn = true; store.reference = b.reference
        val recreated = WorkspaceController(auth, WorkspaceRepository { rows }, store)
        assertEquals(WorkspaceState.LoadingSession, recreated.state.value)
        recreated.restore()
        assertEquals(WorkspaceState.Ready(b), recreated.state.value)
    }
    @Test fun invalidReferenceDoesNotAutoSelectRemainingWorkspace() = runBlocking {
        auth.signedIn = true; store.reference = "foreign-membership:foreign-location"
        controller.restore()
        assertEquals(WorkspaceState.SelectingWorkspace(rows, ErrorCode.TENANT_CONTEXT_INVALID), controller.state.value)
        assertNull(store.reference)
    }
    @Test fun manipulatedSelectionIsValidatedAgainstFreshRows() = runBlocking {
        auth.signedIn = true; rows = listOf(a, b); controller.restore()
        rows = listOf(a)
        controller.select(b.reference)
        assertTrue(controller.state.value is WorkspaceState.SelectingWorkspace)
        assertNull(store.reference)
    }
    @Test fun revocationRemovesAccessWithoutDeletingAccount() = runBlocking {
        auth.signedIn = true; controller.restore()
        rows = emptyList(); controller.restore()
        assertEquals(WorkspaceState.NoMembership(ErrorCode.MEMBERSHIP_REVOKED), controller.state.value)
        assertTrue(auth.signedIn); assertNull(store.reference)
    }
    @Test fun emptyMembershipHasItsOwnState() = runBlocking {
        auth.signedIn = true; rows = emptyList(); controller.restore()
        assertEquals(WorkspaceState.NoMembership(), controller.state.value)
    }
    @Test fun expiredSessionClearsSelection() = runBlocking {
        auth.signedIn = true; controller.restore()
        auth.failure = AccessFailure(ErrorCode.SESSION_EXPIRED); controller.restore()
        assertEquals(WorkspaceState.SessionExpired, controller.state.value)
        assertNull(store.reference)
    }
    @Test fun invalidCredentialsRemainSignedOut() = runBlocking {
        auth.failure = AccessFailure(ErrorCode.INVALID_CREDENTIALS)
        controller.signIn("person@example.test", "wrong")
        assertEquals(WorkspaceState.SignedOut(ErrorCode.INVALID_CREDENTIALS), controller.state.value)
    }
    @Test fun networkFailureHidesWorkspaceAndRetryRevalidates() = runBlocking {
        auth.signedIn = true; controller.restore()
        listFailure = AccessFailure(ErrorCode.NETWORK_ERROR)
        controller.restore()
        assertTrue(controller.state.value is WorkspaceState.Error)
        listFailure = null; controller.restore()
        assertEquals(WorkspaceState.Ready(a), controller.state.value)
    }
    @Test fun logoutClearsSessionAndReference() = runBlocking {
        auth.signedIn = true; controller.restore(); controller.logout()
        assertTrue(auth.loggedOut); assertNull(store.reference)
        assertEquals(WorkspaceState.SignedOut(), controller.state.value)
    }
    @Test fun changeWorkspaceDoesNotImmediatelyAutoSelectAgain() = runBlocking {
        auth.signedIn = true; controller.restore(); controller.changeWorkspace(); controller.restore()
        assertTrue(controller.state.value is WorkspaceState.SelectingWorkspace)
    }
    @Test fun backgroundedRequestCannotRestoreReady() = runBlocking {
        auth.signedIn = true
        val gate = CompletableDeferred<Unit>()
        val pending = WorkspaceController(auth, WorkspaceRepository { gate.await(); rows }, store)
        val job = launch { pending.restore() }
        yield()
        assertEquals(WorkspaceState.LoadingMemberships, pending.state.value)
        pending.conceal(); gate.complete(Unit); job.join()
        assertEquals(WorkspaceState.LoadingSession, pending.state.value)
    }
    @Test fun logoutWinsOverPendingBootstrap() = runBlocking {
        auth.signedIn = true
        val gate = CompletableDeferred<Unit>()
        val pending = WorkspaceController(auth, WorkspaceRepository { gate.await(); rows }, store)
        val restore = launch { pending.restore() }; yield()
        val logout = launch { pending.logout() }; yield()
        gate.complete(Unit); restore.join(); logout.join()
        assertEquals(WorkspaceState.SignedOut(), pending.state.value)
        assertNull(store.reference)
    }
}
