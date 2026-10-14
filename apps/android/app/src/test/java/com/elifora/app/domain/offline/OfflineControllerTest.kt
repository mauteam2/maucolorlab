package com.elifora.app.domain.offline

import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.UUID

class OfflineControllerTest {
    private fun id(n: Int) = "f8000000-0000-4000-8000-${n.toString().padStart(12, '0')}"
    private val identity = OfflineIdentity(id(1), id(2), id(3), id(4), id(5))
    private val context = ActiveTenantContext(id(5), id(1), "Synthetic salon", id(2), "Branch", "owner", "active", setOf("clients.read"))
    private class MemoryStore : OfflineDraftStore {
        val records = mutableMapOf<String, OfflineDraft>()
        override suspend fun read(identity: OfflineIdentity) = records.values.filter { it.identity == identity }.sortedBy { it.createdAt }
        override suspend fun put(draft: OfflineDraft) { val old = records[draft.draftId]; check(old == null || old.payloadHash == draft.payloadHash) { "PAYLOAD_CHANGED" }; records[draft.draftId] = draft }
        override suspend fun remove(identity: OfflineIdentity, draftId: String) { if (records[draftId]?.identity == identity) records.remove(draftId) }
    }
    @Test fun processRecreationRestoresOnlyAfterFreshIdentityResolution() = runBlocking {
        val store = MemoryStore(); val first = OfflineController(store, { identity })
        first.bind(context); val draft = first.capture(DraftDomain.HAIR_HISTORY, "{\"value\":null}", id(10), id(11), null)
        first.conceal(); assertEquals(OfflineState.Locked, first.state.value)
        val recreated = OfflineController(store, { identity }); assertEquals(OfflineState.Locked, recreated.state.value)
        recreated.bind(context); assertEquals(draft.mutationId, (recreated.state.value as OfflineState.Ready).drafts.single().mutationId)
    }
    @Test fun organizationSwitchAndOtherAccountCannotReadPriorDrafts() = runBlocking {
        val store = MemoryStore(); var selected = identity
        val controller = OfflineController(store, { selected }); controller.bind(context)
        controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(10), id(11), null)
        selected = identity.copy(userId = id(30)); controller.bind(context)
        assertTrue((controller.state.value as OfflineState.Ready).drafts.isEmpty())
        selected = identity.copy(organizationId = id(31)); controller.bind(context)
        assertTrue((controller.state.value as OfflineState.Ready).drafts.isEmpty())
        assertEquals(1, store.records.size)
    }
    @Test fun backgroundDiscardsDelayedPrivateRestore() = runBlocking {
        val gate = CompletableDeferred<Unit>(); val controller = OfflineController(MemoryStore(), { gate.await(); identity })
        val operation = async { controller.bind(context) }; kotlinx.coroutines.yield()
        controller.conceal(); gate.complete(Unit); operation.await()
        assertEquals(OfflineState.Locked, controller.state.value)
    }
    @Test fun networkLossRetriesOriginalIdentityAndBaseVersionDaysLater() = runBlocking {
        val store = MemoryStore(); var clock = Instant.parse("2026-10-14T12:00:00Z")
        val controller = OfflineController(store, { identity }, { clock }); controller.bind(context)
        val draft = controller.capture(DraftDomain.HAIR_CORE, "{\"expected_version\":2}", id(10), id(11), 2)
        val calls = mutableListOf<OfflineDraft>(); var fail = true
        val dispatch = OfflineDispatcher { calls += it; if (fail) error("NETWORK_ERROR"); SyncAcceptance(id(90)) }
        controller.sync(dispatch); assertEquals(SyncState.PENDING_SYNC, store.records[draft.draftId]?.status)
        assertEquals(0, controller.sync(dispatch)); clock = clock.plusSeconds(3 * 86400); fail = false
        val recreated = OfflineController(store, { identity }, { clock }); recreated.bind(context); recreated.sync(dispatch)
        assertEquals(SyncState.SYNCED, store.records[draft.draftId]?.status)
        assertEquals(calls[0].mutationId, calls[1].mutationId); assertEquals(2L, calls[1].baseVersion)
    }
    @Test fun staleVersionPreservesIntentForExplicitConflictReview() = runBlocking {
        val store = MemoryStore(); val controller = OfflineController(store, { identity }); controller.bind(context)
        val draft = controller.capture(DraftDomain.HAIR_CORE, "{}", id(10), id(11), 3)
        controller.sync(OfflineDispatcher { error("CONFLICT") })
        assertEquals(SyncState.CONFLICT, store.records[draft.draftId]?.status)
        assertEquals(ConflictType.VERSION_CHANGED, store.records[draft.draftId]?.conflict)
        assertEquals(draft.payload, store.records[draft.draftId]?.payload)
        assertEquals(0, controller.sync(OfflineDispatcher { fail("Conflict must not auto retry"); SyncAcceptance(null) }))
    }
    @Test fun payloadChangeRequiresExplicitNewMutationIdentity() = runBlocking {
        val controller = OfflineController(MemoryStore(), { identity }); controller.bind(context)
        controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(10), id(11), null)
        try { controller.capture(DraftDomain.HAIR_HISTORY, "{\"changed\":true}", id(10), id(11), null); fail("Identity reuse accepted") }
        catch (expected: IllegalArgumentException) { assertEquals("PAYLOAD_CHANGED", expected.message) }
    }
    @Test fun revokedMembershipRejectsPendingIntentWithoutDiscardingIt() = runBlocking {
        val store = MemoryStore(); var revoked = false
        val controller = OfflineController(store, { if (revoked) error("MEMBERSHIP_REVOKED"); identity }); controller.bind(context)
        val draft = controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(10), id(11), null); revoked = true
        controller.sync(OfflineDispatcher { fail("Revoked dispatch"); SyncAcceptance(null) })
        assertEquals(SyncState.REJECTED, store.records[draft.draftId]?.status); assertEquals(ConflictType.AUTHORITY_EXPIRED, store.records[draft.draftId]?.conflict)
    }
    @Test fun signoutAndLateSyncResponseDoNotReleasePrivateState() = runBlocking {
        val store = MemoryStore(); val gate = CompletableDeferred<Unit>(); val controller = OfflineController(store, { identity }); controller.bind(context)
        controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(10), id(11), null)
        val operation = async { controller.sync(OfflineDispatcher { gate.await(); SyncAcceptance(id(90)) }) }; kotlinx.coroutines.yield()
        controller.conceal(); gate.complete(Unit); operation.await(); assertEquals(OfflineState.Locked, controller.state.value)
    }
    @Test fun financialAndStockDraftsNeverBecomeOfflineCommits() = runBlocking {
        for (domain in listOf(DraftDomain.PAYMENT, DraftDomain.EXPENSE, DraftDomain.CASH_CLOSE, DraftDomain.STOCK_COUNT, DraftDomain.STOCK_INTAKE, DraftDomain.STOCK_USAGE)) {
            val store = MemoryStore(); val controller = OfflineController(store, { identity }); controller.bind(context)
            val draft = controller.capture(domain, "{}", UUID.randomUUID().toString(), id(11), 1)
            controller.sync(OfflineDispatcher { fail("Financial/stock auto commit"); SyncAcceptance(null) })
            assertEquals(SyncState.REVIEW_REQUIRED, store.records[draft.draftId]?.status)
        }
    }
    @Test fun dependencyFailureBlocksChild() = runBlocking {
        val store = MemoryStore(); val controller = OfflineController(store, { identity }); controller.bind(context)
        val parent = controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(10), id(11), null)
        val child = controller.capture(DraftDomain.HAIR_HISTORY, "{\"child\":true}", id(12), id(11), null)
        store.put(child.copy(dependencies = listOf(parent.draftId)))
        var calls = 0; controller.sync(OfflineDispatcher { calls++; error("FORBIDDEN") })
        assertEquals(1, calls); assertEquals(SyncState.DEPENDENCY_BLOCKED, store.records[child.draftId]?.status)
    }
    @Test fun batchIsBoundedAndStoppedProcessSyncingCanBeReplayed() = runBlocking {
        val store = MemoryStore(); val controller = OfflineController(store, { identity }); controller.bind(context)
        for (n in 10..21) controller.capture(DraftDomain.HAIR_HISTORY, "{}", id(n), id(50), null)
        store.records[id(10)] = store.records.getValue(id(10)).copy(status = SyncState.SYNCING)
        assertEquals(10, controller.sync(OfflineDispatcher { SyncAcceptance(null) }))
        assertEquals(2, store.records.values.count { it.status == SyncState.PENDING_SYNC })
    }
    @Test fun unknownAndMeasuredZeroHashesAreDifferent() { assertNotEquals(offlineHash("{\"value\":null}"), offlineHash("{\"value\":0}")) }
}
