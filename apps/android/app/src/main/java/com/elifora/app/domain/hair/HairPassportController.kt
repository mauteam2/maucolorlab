package com.elifora.app.domain.hair

import com.elifora.app.domain.auth.AccessFailure
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Holds no persistent technical cache. Every bind and refresh conceals the prior snapshot first. */
class HairPassportController(private val repository: HairPassportRepository) {
    private val mutable = MutableStateFlow<HairState>(HairState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var selected: Client? = null
    private var offsets = HairOffsets()
    private var generation = 0

    fun conceal() { generation++; if (selected != null) mutable.value = HairState.Loading }
    fun invalidate() { generation++; context = null; selected = null; offsets = HairOffsets(); mutable.value = HairState.Closed }
    fun close() { generation++; selected = null; offsets = HairOffsets(); mutable.value = HairState.Closed }
    suspend fun bind(next: ActiveTenantContext) {
        if (context?.reference != next.reference || context?.organizationId != next.organizationId) {
            invalidate()
        }
        context = next
        if (selected != null) refresh()
    }
    suspend fun open(client: Client) { selected = client; offsets = HairOffsets(); refresh() }
    suspend fun refresh() {
        val client = selected ?: return
        val currentContext = context ?: run { mutable.value = HairState.Forbidden; return }
        val current = ++generation
        mutable.value = HairState.Loading
        if (!currentContext.permissions.containsAll(setOf("clients.read", "hair_passport.read"))) {
            if (current == generation) mutable.value = HairState.Forbidden
            return
        }
        try {
            val result = repository.read(currentContext, client, offsets)
            if (current != generation) return
            mutable.value = when (result) {
                is HairReadResult.Snapshot -> HairState.Ready(client, result.passport)
                HairReadResult.Empty -> HairState.EmptyPassport(client)
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: HairFailure) { if (current == generation) fail(failure.code, failure.correlationId) }
        catch (failure: AccessFailure) { if (current == generation) fail(failure.code.name, failure.correlationId) }
        catch (_: Exception) { if (current == generation) mutable.value = HairState.Error("NETWORK_ERROR", null) }
    }
    suspend fun page(kind: HairPageKind, nextOffset: Int) {
        if (nextOffset !in 0..10000) return
        offsets = when (kind) {
            HairPageKind.OBSERVATIONS -> offsets.copy(observations = nextOffset)
            HairPageKind.TESTS -> offsets.copy(tests = nextOffset)
            HairPageKind.HISTORY -> offsets.copy(history = nextOffset)
        }
        refresh()
    }
    private fun fail(code: String, correlationId: String?) {
        mutable.value = when (code) {
            "FORBIDDEN", "MEMBERSHIP_REQUIRED" -> HairState.Forbidden
            "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID" -> HairState.MembershipRevoked
            "UNAUTHENTICATED", "SESSION_EXPIRED" -> HairState.SessionExpired
            else -> HairState.Error(code, correlationId)
        }
    }
}
