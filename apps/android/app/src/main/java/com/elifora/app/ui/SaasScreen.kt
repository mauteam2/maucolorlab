package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.elifora.app.R
import com.elifora.app.domain.saas.*
import kotlinx.coroutines.launch

@Composable
fun SaasScreen(controller: SaasController) {
    val state by controller.state.collectAsState()
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { scope.launch { controller.open() } }) { Text(stringResource(R.string.saas_open)) }
        when (val current = state) {
            SaasState.Closed -> Unit
            SaasState.Loading -> CircularProgressIndicator()
            is SaasState.Error -> Text(stringResource(R.string.saas_error), color = MaterialTheme.colorScheme.error)
            is SaasState.Ready -> {
                val account = current.account
                Text(stringResource(R.string.saas_title), style = MaterialTheme.typography.headlineSmall)
                Text(stringResource(R.string.saas_state, saasLabel(account.status.name)))
                account.planLabel?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
                account.entitlements.forEach { feature ->
                    Text("${saasLabel(feature.capability.name)}: ${stringResource(if (feature.creationAllowed) R.string.saas_available else R.string.saas_unavailable)}")
                }
                account.quotas.forEach { quota ->
                    Text("${saasLabel(quota.code)}: ${quota.used ?: stringResource(R.string.saas_unknown)} / ${quota.limit ?: stringResource(if (quota.configured) R.string.saas_no_limit else R.string.saas_unknown)}")
                    if (quota.status in setOf("EXCEEDED", "AT_LIMIT")) Text(stringResource(R.string.saas_limit_reached))
                }
                Text(stringResource(R.string.saas_disclaimer))
            }
        }
    }
}

@Composable
private fun saasLabel(code: String): String = stringResource(when (code) {
    "ACTIVE" -> R.string.saas_label_active
    "TRIAL" -> R.string.saas_label_trial
    "GRACE" -> R.string.saas_label_grace
    "PAST_DUE" -> R.string.saas_label_past_due
    "SUSPENDED" -> R.string.saas_label_suspended
    "CANCELLED" -> R.string.saas_label_cancelled
    "UNCONFIGURED" -> R.string.saas_label_unconfigured
    "EXPIRED" -> R.string.saas_label_expired
    "TRIAL_EXPIRED" -> R.string.saas_label_trial_expired
    "COLOR_ENGINE" -> R.string.saas_label_color_engine
    "BRAND_ADAPTER" -> R.string.saas_label_brand_adapter
    "LIVE_SESSION" -> R.string.saas_label_live_session
    "CRM" -> R.string.saas_label_crm
    "STOCK" -> R.string.saas_label_stock
    "FINANCE" -> R.string.saas_label_finance
    "COSTING" -> R.string.saas_label_costing
    "COMMISSION" -> R.string.saas_label_commission
    "REPORTING" -> R.string.saas_label_reporting
    "AI_GATEWAY" -> R.string.saas_label_ai_gateway
    "LOCATIONS" -> R.string.saas_label_locations
    "ACTIVE_MEMBERS" -> R.string.saas_label_active_members
    "STORAGE_BYTES" -> R.string.saas_label_storage_bytes
    "ENGINE_EXECUTIONS" -> R.string.saas_label_engine_executions
    else -> R.string.saas_unknown
})
