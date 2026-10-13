package com.elifora.app.domain.reporting

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.ClientFailure
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.math.BigDecimal

enum class ReportKind { OVERVIEW, APPOINTMENTS, CLIENTS, SERVICES, TEAM, FINANCE, STOCK, TECHNICAL }
enum class ReportPeriodKind { TODAY, YESTERDAY, THIS_WEEK, LAST_WEEK, THIS_MONTH, LAST_MONTH, CUSTOM }
data class ReportFilter(val kind: ReportKind = ReportKind.OVERVIEW, val period: ReportPeriodKind = ReportPeriodKind.TODAY,
    val from: String? = null, val until: String? = null)
data class ReportMetric(val name: String, val value: BigDecimal?, val unit: String, val denominator: BigDecimal?, val sourceDomain: String)
data class ReportDates(val timezone: String, val start: String, val end: String, val previousStart: String, val previousEnd: String)
data class ReportFreshness(val status: String, val updatedAt: String, val pendingEvents: java.math.BigInteger, val metricVersion: Int)
data class ReportBundle(val kind: ReportKind, val selfOnly: Boolean, val staffUserId: String?, val currency: String,
    val dates: ReportDates, val freshness: ReportFreshness, val metrics: List<ReportMetric>)
interface ReportingRepository { suspend fun load(context: ActiveTenantContext, filter: ReportFilter): ReportBundle }
sealed interface ReportingState {
    data object Closed : ReportingState
    data object Loading : ReportingState
    data class Ready(val report: ReportBundle) : ReportingState
    data class Error(val failure: ClientFailure) : ReportingState
}
class ReportingController(private val repository: ReportingRepository) {
    private val mutable = MutableStateFlow<ReportingState>(ReportingState.Closed)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var generation = 0
    fun conceal() { generation++; mutable.value = ReportingState.Closed }
    fun invalidate() { conceal(); context = null }
    fun bind(next: ActiveTenantContext) { if (context != next) invalidate(); context = next }
    suspend fun open(filter: ReportFilter = ReportFilter()) {
        val selected = context ?: return
        val token = ++generation; mutable.value = ReportingState.Loading
        try {
            if ("reports.read" !in selected.permissions) throw ClientFailure("FORBIDDEN")
            val data = repository.load(selected, filter)
            if (generation == token && context == selected) mutable.value = ReportingState.Ready(data)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ClientFailure) { if (generation == token) mutable.value = ReportingState.Error(failure) }
        catch (_: Exception) { if (generation == token) mutable.value = ReportingState.Error(ClientFailure("NETWORK_ERROR")) }
    }
}
