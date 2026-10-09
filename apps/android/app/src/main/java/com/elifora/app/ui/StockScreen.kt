package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.elifora.app.R
import com.elifora.app.domain.stock.*
import kotlinx.coroutines.launch

@Composable
fun StockScreen(controller: StockController) {
    val state by controller.state.collectAsState()
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { scope.launch { controller.open(query = query) } }) { Text(stringResource(R.string.stock_open)) }
        when (val current = state) {
            StockState.Closed -> Unit
            StockState.Loading -> CircularProgressIndicator()
            is StockState.Error -> Text(stringResource(R.string.stock_error), color = MaterialTheme.colorScheme.error)
            is StockState.Ready -> {
                val data = current.data
                Text(stringResource(R.string.stock_title), style = MaterialTheme.typography.headlineSmall)
                if (!data.enabled) Text(stringResource(R.string.stock_not_enabled))
                else {
                    OutlinedTextField(query, { if (it.length <= 80) query = it }, label = { Text(stringResource(R.string.stock_search)) }, modifier = Modifier.fillMaxWidth())
                    Text(stringResource(R.string.stock_queue, data.pending, data.failed))
                    data.items.forEach { item ->
                        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(item.name, style = MaterialTheme.typography.titleMedium)
                            Text("${item.onHand?.toPlainString() ?: stringResource(R.string.stock_unknown)} ${when(item.unit) { StockUnit.GRAM -> "g"; StockUnit.MILLILITER -> "ml"; StockUnit.UNIT -> stringResource(R.string.stock_piece) }}")
                            Text(stringResource(when(item.status) { StockStatus.OK -> R.string.stock_ok; StockStatus.LOW -> R.string.stock_low; StockStatus.OUT -> R.string.stock_out; StockStatus.UNKNOWN -> R.string.stock_unknown }))
                            if (item.syncRequired) Text(stringResource(R.string.stock_sync))
                            OutlinedButton(onClick = { scope.launch { controller.open(item.id) } }) { Text(stringResource(R.string.stock_history)) }
                        } }
                    }
                    if (data.items.isEmpty()) Text(stringResource(R.string.stock_empty))
                    if (data.offset > 0) OutlinedButton(onClick = { scope.launch { controller.open(query = query, offset = (data.offset - 50).coerceAtLeast(0)) } }) { Text(stringResource(R.string.stock_previous)) }
                    if (data.items.size == 50 && data.offset < 9950) OutlinedButton(onClick = { scope.launch { controller.open(query = query, offset = data.offset + 50) } }) { Text(stringResource(R.string.stock_next)) }
                    if (data.items.size == 1) data.movements.forEach { movement -> Text("${movement.at} · ${movement.type} · ${movement.quantity.toPlainString()} ${movement.unit}\n${movement.reason}") }
                }
            }
        }
    }
}
