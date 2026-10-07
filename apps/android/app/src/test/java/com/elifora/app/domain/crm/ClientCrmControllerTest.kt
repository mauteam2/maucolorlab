package com.elifora.app.domain.crm

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class ClientCrmControllerTest {
    private val id = "a4000000-0000-4000-8000-000000000031"
    private val context = ActiveTenantContext("membership", "organization", "Salon", "location", "Branch", "owner", "active", setOf("crm.read", "crm.actions.manage"))
    private val summary = CrmSummary(id, id, RelationshipStatus.NEW, 0, null, null, 0, 0, null, null, PreferenceSource.UNKNOWN, "INSUFFICIENT_DATA", null, emptyList())
    private val action = CrmAction("a4000000-0000-4000-8000-000000000601", id, CrmActionKind.REBOOK, CrmActionStatus.OPEN, CrmActionStatus.OPEN, 1, "2026-10-07T09:00:00Z", null)
    private var waits: CompletableDeferred<Unit>? = null
    private var failure: ClientFailure? = null
    private var loads = 0
    private val transitions = mutableListOf<Triple<CrmAction, CrmActionStatus, String>>()
    private val repository = object : ClientCrmRepository {
        override suspend fun load(context: ActiveTenantContext, clientId: String, offset: Int): CrmBundle {
            loads++; waits?.await(); failure?.let { throw it }
            return CrmBundle(summary, emptyList(), offset == 0, listOf(action), false, offset)
        }
        override suspend fun transition(context: ActiveTenantContext, action: CrmAction, status: CrmActionStatus, mutationId: String) {
            transitions.add(Triple(action, status, mutationId)); failure?.let { throw it }
        }
    }
    @Test fun unknownHistoryRemainsExplicit() = runBlocking { val c=ClientCrmController(repository); c.bind(context); c.open(id); val s=(c.state.value as ClientCrmState.Ready).data.summary;assertEquals(PreferenceSource.UNKNOWN,s.preferenceSource);assertNull(s.averageIntervalDays);assertEquals(0,s.completedVisits) }
    @Test fun noPermissionNeverReads() = runBlocking { val c=ClientCrmController(repository);c.bind(context.copy(permissions=emptySet()));c.open(id);assertEquals(0,loads);assertEquals("FORBIDDEN",(c.state.value as ClientCrmState.Error).failure.code) }
    @Test fun invalidPaginationNeverReads() = runBlocking { val c=ClientCrmController(repository);c.bind(context);c.open(id,10001);assertEquals(0,loads) }
    @Test fun backgroundConcealDiscardsLateResult() = runBlocking { val c=ClientCrmController(repository);c.bind(context);waits=CompletableDeferred();val job=launch {c.open(id)};yield();c.conceal();waits!!.complete(Unit);job.join();assertEquals(ClientCrmState.Closed,c.state.value) }
    @Test fun workspaceChangeDiscardsLateResult() = runBlocking { val c=ClientCrmController(repository);c.bind(context);waits=CompletableDeferred();val job=launch {c.open(id)};yield();c.bind(context.copy(locationId="other"));waits!!.complete(Unit);job.join();assertEquals(ClientCrmState.Closed,c.state.value) }
    @Test fun revokedReadReleasesNoSnapshot() = runBlocking {val c=ClientCrmController(repository);c.bind(context);failure=ClientFailure("MEMBERSHIP_REVOKED");c.open(id);assertEquals("MEMBERSHIP_REVOKED",(c.state.value as ClientCrmState.Error).failure.code)}
    @Test fun paginationReachesRepository() = runBlocking {val c=ClientCrmController(repository);c.bind(context);c.open(id,20);assertEquals(20,(c.state.value as ClientCrmState.Ready).data.offset)}
    @Test fun actionTransitionRequiresCurrentVisibleActionAndPermission() = runBlocking {val c=ClientCrmController(repository);c.bind(context);c.open(id);c.transition(action.copy(id=id),CrmActionStatus.DONE);assertTrue(transitions.isEmpty());c.bind(context.copy(permissions=setOf("crm.read")));c.transition(action,CrmActionStatus.DONE);assertTrue(transitions.isEmpty())}
    @Test fun completionUsesVersionAndFreshRead() = runBlocking {val c=ClientCrmController(repository);c.bind(context);c.open(id);c.transition(action,CrmActionStatus.DONE);assertEquals(2,loads);assertEquals(action,transitions.single().first);assertEquals(CrmActionStatus.DONE,transitions.single().second);assertNotNull(java.util.UUID.fromString(transitions.single().third))}
}
