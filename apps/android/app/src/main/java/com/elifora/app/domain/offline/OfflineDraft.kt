package com.elifora.app.domain.offline

import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

enum class SyncState { LOCAL, PENDING_SYNC, SYNCING, SYNCED, CONFLICT, REJECTED, REVIEW_REQUIRED, DEPENDENCY_BLOCKED }
enum class ConflictType { VERSION_CHANGED, CONTROL_EPOCH_CHANGED, AUTHORITY_EXPIRED, WORKSPACE_CHANGED, PAYLOAD_CHANGED, DEPENDENCY_FAILED, AVAILABILITY_CHANGED, SUBSCRIPTION_CHANGED, STOCK_CHANGED, CASH_CHANGED, VALIDATION_FAILED }
enum class DraftDomain { HAIR_CORE, HAIR_OBSERVATION, HAIR_PHYSICAL_TEST, HAIR_HISTORY, LIVE, CLIENT, CRM, APPOINTMENT, COLOR_TARGET, STOCK_COUNT, STOCK_INTAKE, STOCK_USAGE, PAYMENT, EXPENSE, CASH_CLOSE }
data class OfflineIdentity(val organizationId: String, val locationId: String, val userId: String, val deviceId: String, val membershipId: String) {
    val reference get() = "$membershipId:$locationId"
    init { listOf(organizationId, locationId, userId, deviceId, membershipId).forEach(UUID::fromString) }
}
data class OfflineDraft(
    val draftId: String, val mutationId: String, val domain: DraftDomain, val identity: OfflineIdentity,
    val entityId: String?, val baseVersion: Long?, val sessionId: String?, val controlEpoch: Long?,
    val createdAt: String, val updatedAt: String, val payload: String, val payloadHash: String,
    val status: SyncState = SyncState.LOCAL, val dependencies: List<String> = emptyList(),
    val attemptCount: Int = 0, val nextAttemptAt: String? = null, val conflict: ConflictType? = null, val correlationId: String? = null,
) {
    init {
        UUID.fromString(draftId); UUID.fromString(mutationId)
        entityId?.let(UUID::fromString); sessionId?.let(UUID::fromString); correlationId?.let(UUID::fromString)
        Instant.parse(createdAt); Instant.parse(updatedAt); nextAttemptAt?.let(Instant::parse)
        require(baseVersion == null || baseVersion > 0); require(controlEpoch == null || controlEpoch > 0)
        require(dependencies.size <= 10 && draftId !in dependencies); dependencies.forEach(UUID::fromString)
        require(attemptCount >= 0 && payload.toByteArray(Charsets.UTF_8).size <= 65536)
        require(payloadHash == offlineHash(payload))
    }
}
fun offlineHash(payload: String) = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
interface OfflineDraftStore {
    suspend fun read(identity: OfflineIdentity): List<OfflineDraft>
    suspend fun put(draft: OfflineDraft)
    suspend fun remove(identity: OfflineIdentity, draftId: String)
}
sealed interface OfflineState {
    data object Locked : OfflineState
    data class Ready(val identity: OfflineIdentity, val drafts: List<OfflineDraft>) : OfflineState
    data class Failure(val code: String) : OfflineState
}
data class SyncAcceptance(val correlationId: String?)
fun interface OfflineDispatcher { suspend fun dispatch(draft: OfflineDraft): SyncAcceptance }
