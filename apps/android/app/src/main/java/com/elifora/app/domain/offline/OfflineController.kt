package com.elifora.app.domain.offline

import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/** Pending intent only. Every bind/sync resolves live membership and actor. */
class OfflineController(private val store: OfflineDraftStore,
    private val resolve: suspend (ActiveTenantContext) -> OfflineIdentity,
    private val clock: () -> Instant = Instant::now) {
    private val mutable = MutableStateFlow<OfflineState>(OfflineState.Locked)
    val state = mutable.asStateFlow()
    private var identity: OfflineIdentity? = null
    private var context: ActiveTenantContext? = null
    private var generation = 0
    private val mutex = Mutex()
    fun conceal() { generation++; identity = null; context = null; mutable.value = OfflineState.Locked }
    suspend fun bind(next: ActiveTenantContext) {
        conceal(); val g = generation
        try {
            val selected = resolve(next); val drafts = store.read(selected)
            if (g != generation) return
            identity = selected; context = next; mutable.value = OfflineState.Ready(selected, drafts)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (g == generation) mutable.value = OfflineState.Failure("AUTHORITY_EXPIRED") }
    }
    suspend fun capture(domain: DraftDomain, payload: String, mutationId: String, entityId: String?, version: Long?): OfflineDraft = mutex.withLock {
        val selected = identity ?: error("AUTHORITY_EXPIRED"); val g = generation
        val existing = store.read(selected).firstOrNull { it.mutationId == mutationId }
        val now = clock().toString()
        require(existing == null || existing.payloadHash == offlineHash(payload) && existing.domain == domain) { "PAYLOAD_CHANGED" }
        val draft = existing ?: OfflineDraft(mutationId, mutationId, domain, selected, entityId, version, null, null, now, now, payload, offlineHash(payload))
        check(g == generation && identity == selected) { "AUTHORITY_EXPIRED" }
        store.put(draft.copy(status = SyncState.PENDING_SYNC, updatedAt = now))
        val refreshed = store.read(selected)
        if (g == generation && identity == selected) mutable.value = OfflineState.Ready(selected, refreshed)
        draft
    }
    suspend fun accepted(draft: OfflineDraft, correlationId: String? = null) = mutex.withLock {
        // A late response can be safely recovered on next login; never publish it
        // into the state of an account that signed out or changed organizations.
        if (identity != draft.identity) return@withLock
        val g = generation
        store.put(draft.copy(status = SyncState.SYNCED, updatedAt = clock().toString(), correlationId = correlationId))
        val refreshed = store.read(draft.identity)
        if (g == generation && identity == draft.identity) mutable.value = OfflineState.Ready(draft.identity, refreshed)
    }
    suspend fun sync(dispatcher: OfflineDispatcher, limit: Int = 10) = mutex.withLock {
        require(limit in 1..10)
        val selected = identity ?: error("AUTHORITY_EXPIRED"); val tenant = context ?: error("AUTHORITY_EXPIRED"); val g = generation
        val drafts = store.read(selected); val states = drafts.associate { it.draftId to it.status }.toMutableMap()
        var attempted = 0
        val ordered = mutableListOf<OfflineDraft>(); val visited = mutableSetOf<String>(); val visiting = mutableSetOf<String>()
        val byId = drafts.associateBy { it.draftId }
        fun visit(draft: OfflineDraft) {
            if (draft.draftId in visited || !visiting.add(draft.draftId)) return
            draft.dependencies.forEach { id -> byId[id]?.let(::visit) }
            visiting.remove(draft.draftId); visited.add(draft.draftId); ordered.add(draft)
        }
        drafts.forEach(::visit)
        for (original in ordered) {
            if (attempted >= limit || g != generation) break
            if (original.status !in setOf(SyncState.LOCAL, SyncState.PENDING_SYNC, SyncState.SYNCING, SyncState.DEPENDENCY_BLOCKED)) continue
            if (original.nextAttemptAt?.let { Instant.parse(it) > clock() } == true) continue
            var draft = original.copy(updatedAt = clock().toString())
            try {
                check(resolve(tenant) == selected && g == generation) { "WORKSPACE_CHANGED" }
                check(draft.payloadHash == offlineHash(draft.payload)) { "PAYLOAD_CHANGED" }
                draft = if (draft.dependencies.any { states[it] != SyncState.SYNCED }) draft.copy(status = SyncState.DEPENDENCY_BLOCKED, conflict = ConflictType.DEPENDENCY_FAILED)
                else if (draft.domain !in setOf(DraftDomain.HAIR_CORE, DraftDomain.HAIR_OBSERVATION, DraftDomain.HAIR_PHYSICAL_TEST, DraftDomain.HAIR_HISTORY)) draft.copy(status = SyncState.REVIEW_REQUIRED)
                else {
                    draft = draft.copy(status = SyncState.SYNCING, attemptCount = draft.attemptCount + 1, nextAttemptAt = null)
                    store.put(draft)
                    val result = dispatcher.dispatch(draft)
                    check(g == generation && identity == selected && resolve(tenant) == selected) { "WORKSPACE_CHANGED" }
                    draft.copy(status = SyncState.SYNCED, conflict = null, correlationId = result.correlationId)
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) {
                val code = failure.message.orEmpty()
                draft = when (code) {
                    "NETWORK_ERROR" -> draft.copy(status = SyncState.PENDING_SYNC, nextAttemptAt = clock().plusSeconds(minOf(300, 1L shl minOf(8, draft.attemptCount))).toString())
                    "PAYLOAD_CHANGED" -> draft.copy(status = SyncState.REJECTED, conflict = ConflictType.PAYLOAD_CHANGED)
                    "CONFLICT", "LIVE_SESSION_CONFLICT" -> draft.copy(status = SyncState.CONFLICT, conflict = ConflictType.VERSION_CHANGED)
                    "SUBSCRIPTION_RESTRICTED", "FEATURE_UNAVAILABLE", "QUOTA_UNKNOWN", "QUOTA_EXCEEDED" -> draft.copy(status = SyncState.REVIEW_REQUIRED, conflict = ConflictType.SUBSCRIPTION_CHANGED)
                    "WORKSPACE_CHANGED" -> draft.copy(status = SyncState.REJECTED, conflict = ConflictType.WORKSPACE_CHANGED)
                    else -> draft.copy(status = SyncState.REJECTED, conflict = ConflictType.AUTHORITY_EXPIRED)
                }
            }
            store.put(draft); states[draft.draftId] = draft.status; attempted++
        }
        val refreshed = store.read(selected)
        if (g == generation && identity == selected) mutable.value = OfflineState.Ready(selected, refreshed)
        attempted
    }
}
