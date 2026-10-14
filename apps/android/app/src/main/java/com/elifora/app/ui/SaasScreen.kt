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
                Text(stringResource(R.string.saas_state, account.status.name))
                account.planLabel?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
                account.entitlements.forEach { feature ->
                    Text("${feature.capability.name}: ${stringResource(if (feature.creationAllowed) R.string.saas_available else R.string.saas_unavailable)}")
                }
                account.quotas.forEach { quota ->
                    Text("${quota.code}: ${quota.used ?: stringResource(R.string.saas_unknown)} / ${quota.limit ?: stringResource(R.string.saas_no_limit)}")
                    if (quota.status in setOf("EXCEEDED", "AT_LIMIT")) Text(stringResource(R.string.saas_limit_reached))
                }
                Text(stringResource(R.string.saas_disclaimer))
            }
        }
    }
}
