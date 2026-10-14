package com.elifora.app.domain.saas

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.math.BigInteger

enum class SubscriptionState { UNCONFIGURED, ACTIVE, TRIAL, PAST_DUE, GRACE, SUSPENDED, CANCELLED, EXPIRED, TRIAL_EXPIRED }
enum class Capability { COLOR_ENGINE, BRAND_ADAPTER, LIVE_SESSION, CRM, STOCK, FINANCE, COSTING, COMMISSION, REPORTING, AI_GATEWAY }
data class Entitlement(val capability: Capability, val configured: Boolean, val enabled: Boolean, val creationAllowed: Boolean, val reason: String?)
data class Quota(val code: String, val configured: Boolean, val limit: BigInteger?, val used: BigInteger?, val status: String)
data class UsagePeriod(val id: String, val start: String, val end: String)
data class SaaSAccount(val organizationId: String, val locationId: String, val version: Long, val status: SubscriptionState,
    val managementAllowed: Boolean, val planLabel: String?, val period: UsagePeriod?, val entitlements: List<Entitlement>, val quotas: List<Quota>, val observedAt: String)
interface SaasRepository { suspend fun load(context: ActiveTenantContext): SaaSAccount }
sealed interface SaasState {
    data object Closed : SaasState
    data object Loading : SaasState
    data class Ready(val account: SaaSAccount) : SaasState
    data class Error(val failure: ClientFailure) : SaasState
}
class SaasController(private val repository: SaasRepository) {
    private val mutable = MutableStateFlow<SaasState>(SaasState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    fun conceal() { generation++; mutable.value = SaasState.Closed }
    fun invalidate() { conceal(); context = null }
    fun bind(next: ActiveTenantContext) { if (next != context) invalidate(); context = next }
    // UI guidance only. Every critical write still checks live DB authority.
    fun canCreate(capability: Capability) = (mutable.value as? SaasState.Ready)?.account?.entitlements?.any { it.capability == capability && it.creationAllowed } == true
    suspend fun open() {
        val selected = context ?: return
        val token = ++generation; mutable.value = SaasState.Loading
        try {
            if ("saas.entitlements.read" !in selected.permissions) throw ClientFailure("FORBIDDEN")
            val account = repository.load(selected)
            if (token == generation && context == selected) mutable.value = SaasState.Ready(account)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (token == generation) mutable.value = SaasState.Error(failure) }
        catch (_: Exception) { if (token == generation) mutable.value = SaasState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
