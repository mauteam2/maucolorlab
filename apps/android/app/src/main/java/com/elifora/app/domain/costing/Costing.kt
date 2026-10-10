package com.elifora.app.domain.costing

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import com.elifora.app.domain.finance.Money
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class CostStatus { KNOWN, PARTIAL, UNKNOWN, NOT_APPLICABLE }
enum class ProfitabilityStatus { COMPLETE, INCOMPLETE_COST, PARTIAL_COST, NOT_APPLICABLE }
data class ProfitabilityDetail(val chargeId: String, val appointmentId: String?, val serviceName: String?, val costStatus: CostStatus,
    val status: ProfitabilityStatus, val grossRevenue: Money, val netRevenue: Money, val tax: Money,
    val directCost: Money?, val grossContribution: Money?, val commission: Money?, val afterCommission: Money?, val marginBps: Int?) {
    init { require(costStatus == CostStatus.KNOWN || (directCost == null && grossContribution == null && afterCommission == null && marginBps == null)) }
}
data class OwnCommission(val id: String, val chargeId: String, val policyId: String, val policyVersion: Long, val serviceName: String?,
    val eligibleAt: String, val basis: Money, val accrued: Money, val adjustment: Money, val remaining: Money)
data class CostingBundle(val profitability: List<ProfitabilityDetail>, val ownCommission: List<OwnCommission>, val offset: Int, val total: Int)
interface CostingRepository { suspend fun load(context: ActiveTenantContext, ownCommission: Boolean, chargeId: String? = null, offset: Int = 0): CostingBundle }
sealed interface CostingState {
    data object Closed : CostingState
    data object Loading : CostingState
    data class Ready(val data: CostingBundle) : CostingState
    data class Error(val failure: ClientFailure) : CostingState
}
class CostingController(private val repository: CostingRepository) {
    private val mutable = MutableStateFlow<CostingState>(CostingState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    fun conceal() { generation++; mutable.value = CostingState.Closed }
    fun invalidate() { conceal(); context = null }
    fun bind(next: ActiveTenantContext) { if (context != next) invalidate(); context = next }
    suspend fun open(ownCommission: Boolean = true, chargeId: String? = null, offset: Int = 0) {
        val selected = context ?: return
        val current = ++generation
        mutable.value = CostingState.Loading
        try {
            if ((if (ownCommission) "commission.view_self" else "cost.view") !in selected.permissions) throw ClientFailure("FORBIDDEN")
            val data = repository.load(selected, ownCommission, chargeId, offset)
            if (current == generation && context == selected) mutable.value = CostingState.Ready(data)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (current == generation) mutable.value = CostingState.Error(failure) }
        catch (_: Exception) { if (current == generation) mutable.value = CostingState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
