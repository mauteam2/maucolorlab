package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.elifora.app.R
import com.elifora.app.domain.reporting.*
import kotlinx.coroutines.launch

@Composable
fun ReportingScreen(controller: ReportingController) {
    val state by controller.state.collectAsState()
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { scope.launch { controller.open() } }) { Text(stringResource(R.string.reports_open)) }
        when (val current = state) {
            ReportingState.Closed -> Unit
            ReportingState.Loading -> CircularProgressIndicator()
            is ReportingState.Error -> Text(stringResource(R.string.reports_error), color = MaterialTheme.colorScheme.error)
            is ReportingState.Ready -> {
                val report = current.report
                Text(stringResource(R.string.reports_title), style = MaterialTheme.typography.headlineSmall)
                Text("${report.dates.start} – ${report.dates.end} · ${report.dates.timezone}")
                if (report.selfOnly) Text(stringResource(R.string.reports_self))
                if (report.freshness.status != "CURRENT") Text(stringResource(R.string.reports_stale, report.freshness.pendingEvents.toString()))
                report.metrics.filter { it.name in setOf("completed_visits", "recognized_net_revenue", "contribution_after_commission", "known_revenue_coverage_bps", "net_accrued_commission", "low_stock") }.forEach { metric ->
                    val label = when (metric.name) {
                        "completed_visits" -> R.string.reports_completed
                        "recognized_net_revenue" -> R.string.reports_revenue
                        "contribution_after_commission" -> R.string.reports_contribution
                        "known_revenue_coverage_bps" -> R.string.reports_coverage
                        "net_accrued_commission" -> R.string.reports_commission
                        else -> R.string.reports_stock
                    }
                    val value = when {
                        metric.value == null -> stringResource(R.string.reports_unknown)
                        metric.unit == "MONEY" -> metric.value.movePointLeft(if (report.currency == "JPY") 0 else if (report.currency == "KWD") 3 else 2).toPlainString() + " " + report.currency
                        metric.unit == "BPS" -> metric.value.movePointLeft(2).toPlainString() + "%"
                        else -> metric.value.toPlainString()
                    }
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) { Text(stringResource(label)); Text(value, style = MaterialTheme.typography.titleLarge) } }
                }
                Text(stringResource(R.string.reports_disclaimer))
            }
        }
    }
}
