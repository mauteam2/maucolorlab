package com.elifora.app.domain.finance

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.math.BigInteger
import java.util.UUID

data class Money(val currency: String, val minorUnits: BigInteger, val exponent: Int) {
    init { require(currency in setOf("TRY", "EUR", "USD", "GBP", "JPY", "KWD") && exponent in 0..4) }
    fun display(): String {
        val scale = BigInteger.TEN.pow(exponent)
        val value = minorUnits.abs()
        val fraction = if (exponent == 0) "" else "," + value.mod(scale).toString().padStart(exponent, '0')
        return (if (minorUnits.signum() < 0) "−" else "") + value.divide(scale).toString() + fraction + " " + currency
    }
}
data class ClientBalance(val clientId: String, val name: String, val balance: Money, val availableCredit: Money, val outstanding: Money)
data class AppointmentPaymentState(val appointmentId: String, val chargeId: String, val gross: Money, val remaining: Money?, val refunded: Money, val reversed: Boolean)
data class FinanceSummary(val serviceCharges: Money, val payments: Money, val deposits: Money, val refunds: Money, val expenses: Money?)
data class CashSessionStatus(val id: String, val status: String, val expected: Money?, val counted: Money?, val difference: Money?)
data class FinanceBundle(val enabled: Boolean, val summary: FinanceSummary, val clients: List<ClientBalance>, val appointments: List<AppointmentPaymentState>, val cashSessions: List<CashSessionStatus>)
interface FinanceRepository { suspend fun load(context: ActiveTenantContext, clientId: String?, appointmentId: String?): FinanceBundle }
sealed interface FinanceState {
    data object Closed : FinanceState
    data object Loading : FinanceState
    data class Ready(val data: FinanceBundle) : FinanceState
    data class Error(val failure: ClientFailure) : FinanceState
}
class FinanceController(private val repository: FinanceRepository) {
    private val mutable = MutableStateFlow<FinanceState>(FinanceState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    fun conceal() { generation++; mutable.value = FinanceState.Closed }
    fun invalidate() { conceal(); context = null }
    fun bind(next: ActiveTenantContext) { if (context?.reference != next.reference || context?.organizationId != next.organizationId) invalidate(); context = next }
    suspend fun open(clientId: String? = null, appointmentId: String? = null) {
        val selected = context ?: return
        val current = ++generation
        mutable.value = FinanceState.Loading
        try {
            if ("finance.view" !in selected.permissions) throw ClientFailure("FORBIDDEN")
            listOfNotNull(clientId, appointmentId).forEach { UUID.fromString(it) }
            val data = repository.load(selected, clientId, appointmentId)
            if (current == generation && context?.reference == selected.reference) mutable.value = FinanceState.Ready(data)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (current == generation) mutable.value = FinanceState.Error(failure) }
        catch (_: IllegalArgumentException) { if (current == generation) mutable.value = FinanceState.Error(ClientFailure("VALIDATION_FAILED")) }
        catch (_: Exception) { if (current == generation) mutable.value = FinanceState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
