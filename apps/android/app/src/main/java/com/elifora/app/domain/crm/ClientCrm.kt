package com.elifora.app.domain.crm

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

enum class RelationshipStatus { NEW, ACTIVE, RETURNING, OVERDUE, INACTIVE, UPCOMING, FOLLOW_UP_REQUIRED }
enum class PreferenceSource { MANUAL_PREFERENCE, HISTORICAL_PATTERN, UNKNOWN }
enum class CrmActionStatus { OPEN, SNOOZED, DONE, DISMISSED }
enum class CrmActionKind { REBOOK, WIN_BACK, CARE_CHECK, COLOR_FOLLOWUP, RECOVERY_REASSESSMENT, DUPLICATE_REVIEW }
data class NextAppointment(val id: String, val startsAt: String, val service: String, val staff: String)
data class CrmSummary(val clientId: String, val requestedClientId: String, val relationshipStatus: RelationshipStatus,
    val completedVisits: Int, val lastVisitAt: String?, val daysSinceLastVisit: Int?, val cancellations: Int, val noShows: Int,
    val averageIntervalDays: Double?, val preferredStaffName: String?, val preferenceSource: PreferenceSource,
    val returnSignal: String, val nextAppointment: NextAppointment?, val technicalFollowups: List<String>)
data class TimelineEvent(val key: String, val type: String, val timestamp: String, val summary: String, val visibility: String,
    val sourceDomain: String, val sourceId: String, val sourceClientId: String)
data class CrmAction(val id: String, val clientId: String, val kind: CrmActionKind, val status: CrmActionStatus,
    val effectiveStatus: CrmActionStatus, val version: Long, val dueAt: String, val snoozedUntil: String?)
data class CrmBundle(val summary: CrmSummary, val timeline: List<TimelineEvent>, val timelineHasMore: Boolean,
    val actions: List<CrmAction>, val actionsHaveMore: Boolean, val offset: Int)
interface ClientCrmRepository {
    suspend fun load(context: ActiveTenantContext, clientId: String, offset: Int): CrmBundle
    suspend fun transition(context: ActiveTenantContext, action: CrmAction, status: CrmActionStatus, mutationId: String)
}
sealed interface ClientCrmState {
    data object Closed : ClientCrmState
    data object Loading : ClientCrmState
    data class Ready(val data: CrmBundle) : ClientCrmState
    data class Error(val failure: ClientFailure) : ClientCrmState
}
/** Every resume hides the snapshot; the repository revalidates membership before release. */
class ClientCrmController(private val repository: ClientCrmRepository) {
    private val mutable = MutableStateFlow<ClientCrmState>(ClientCrmState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    private var clientId: String? = null
    private var pending: Pair<String, String>? = null
    fun conceal() { generation++; mutable.value = ClientCrmState.Closed }
    fun invalidate() { conceal(); context = null; clientId = null; pending = null }
    fun bind(next: ActiveTenantContext) {
        if (context?.reference != next.reference || context?.organizationId != next.organizationId) invalidate()
        context = next
    }
    suspend fun open(id: String, offset: Int = 0) {
        val selected = context ?: return
        if ("crm.read" !in selected.permissions) { mutable.value = ClientCrmState.Error(ClientFailure("FORBIDDEN")); return }
        if (offset !in 0..10000 || runCatching { UUID.fromString(id) }.isFailure) { mutable.value = ClientCrmState.Error(ClientFailure("VALIDATION_FAILED")); return }
        clientId = id
        val current = ++generation
        mutable.value = ClientCrmState.Loading
        try {
            val data = repository.load(selected, id, offset)
            if (current == generation && selected.reference == context?.reference) mutable.value = ClientCrmState.Ready(data)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (current == generation) mutable.value = ClientCrmState.Error(failure) }
        catch (_: Exception) { if (current == generation) mutable.value = ClientCrmState.Error(ClientFailure("NETWORK_ERROR")) }
    }
    suspend fun transition(action: CrmAction, status: CrmActionStatus) {
        val selected = context ?: return
        val data = (mutable.value as? ClientCrmState.Ready)?.data ?: return
        if ("crm.actions.manage" !in selected.permissions || status !in setOf(CrmActionStatus.DONE, CrmActionStatus.DISMISSED) ||
            action !in data.actions || action.status in setOf(CrmActionStatus.DONE, CrmActionStatus.DISMISSED)) return
        val key = "${action.id}:${action.version}:$status"
        if (pending?.first != key) pending = key to UUID.randomUUID().toString()
        val current = ++generation
        mutable.value = ClientCrmState.Loading
        try {
            repository.transition(selected, action, status, pending!!.second)
            if (current == generation) { pending = null; clientId?.let { open(it, data.offset) } }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (current == generation) mutable.value = ClientCrmState.Error(failure) }
        catch (_: Exception) { if (current == generation) mutable.value = ClientCrmState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
