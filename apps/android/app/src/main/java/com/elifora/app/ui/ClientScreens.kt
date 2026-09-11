package com.elifora.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elifora.app.R
import com.elifora.app.domain.clients.*
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@Composable
fun ClientScreens(controller: ClientController, permissions: Set<String>) {
    val state by controller.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val list = { scope.launch { controller.list() }; Unit }
    val current = (state as? ClientState.Ready)?.content
    BackHandler(current != null && current !is ClientContent.Directory && current !is ClientContent.Empty, onBack = list)
    Text(stringResource(R.string.clients_title), style = MaterialTheme.typography.headlineMedium)
    when (val value = state) {
        ClientState.Loading -> { CircularProgressIndicator(); Text(stringResource(R.string.auth_loading)) }
        ClientState.Saving -> { CircularProgressIndicator(); Text(stringResource(R.string.clients_saving)) }
        is ClientState.Error -> {
            Text(stringResource(clientErrorResource(value.failure.code)), color = MaterialTheme.colorScheme.error)
            Text(stringResource(R.string.clients_correlation, value.failure.correlationId), style = MaterialTheme.typography.labelSmall)
            OutlinedButton(onClick = { scope.launch { controller.retry() } }) { Text(stringResource(R.string.auth_retry)) }
            TextButton(onClick = list) { Text(stringResource(R.string.clients_back)) }
        }
        is ClientState.Ready -> when (val content = value.content) {
            is ClientContent.Directory -> DirectoryScreen(content.filter, content.items, content.hasMore, permissions, controller)
            is ClientContent.Empty -> DirectoryScreen(content.filter, emptyList(), false, permissions, controller)
            is ClientContent.Editing -> {
                TextButton(onClick = list) { Text(stringResource(R.string.clients_back)) }
                DraftScreen(content.draft, controller)
            }
            is ClientContent.DuplicateReview -> {
                Text(stringResource(R.string.clients_duplicate), style = MaterialTheme.typography.titleLarge)
                Text(stringResource(R.string.clients_duplicate_help))
                content.candidates.forEach { candidate ->
                    OutlinedCard(onClick = { scope.launch { controller.open(candidate.summary.id) } }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Summary(candidate.summary)
                            Text(stringResource(if ("PHONE" in candidate.signals) R.string.clients_same_phone else R.string.clients_similar))
                            Text(stringResource(R.string.clients_open_existing))
                        }
                    }
                }
                Button(onClick = { scope.launch { controller.save(confirm = true) } }) { Text(stringResource(R.string.clients_confirm_separate)) }
                OutlinedButton(onClick = controller::reviewAgain) { Text(stringResource(R.string.clients_review_again)) }
            }
            is ClientContent.Detail -> {
                val client = content.client
                TextButton(onClick = list) { Text(stringResource(R.string.clients_back)) }
                Text(client.fullName, style = MaterialTheme.typography.headlineMedium)
                Text(stringResource(if (client.status == ClientStatus.ACTIVE) R.string.clients_active else R.string.clients_archived))
                DetailField(R.string.clients_phone, client.phone)
                DetailField(R.string.clients_email, client.email)
                DetailField(R.string.clients_birth, client.birthDate)
                DetailField(R.string.clients_created, displayDate(client.createdAt))
                DetailField(R.string.clients_updated, displayDate(client.updatedAt))
                if (client.status == ClientStatus.ACTIVE && "clients.update" in permissions)
                    Button(onClick = { controller.edit(client) }) { Text(stringResource(R.string.clients_edit)) }
                if ("clients.archive" in permissions) {
                    OutlinedButton(onClick = { if (client.status == ClientStatus.ACTIVE) controller.requestArchive(client) else scope.launch { controller.restore(client) } }) {
                        Text(stringResource(if (client.status == ClientStatus.ACTIVE) R.string.clients_archive else R.string.clients_restore))
                    }
                }
                if (content.confirmArchive) AlertDialog(onDismissRequest = controller::cancelArchive,
                    title = { Text(stringResource(R.string.clients_archive_question)) }, text = { Text(stringResource(R.string.clients_archive_help)) },
                    confirmButton = { TextButton(onClick = { scope.launch { controller.archive() } }) { Text(stringResource(R.string.clients_archive_confirm)) } },
                    dismissButton = { TextButton(onClick = controller::cancelArchive) { Text(stringResource(R.string.clients_cancel)) } })
            }
        }
    }
}
@Composable
private fun DirectoryScreen(filter: ClientCommand.ListClients, items: List<ClientSummary>, hasMore: Boolean, permissions: Set<String>, controller: ClientController) {
    val scope = rememberCoroutineScope()
    var query by remember(filter.query) { mutableStateOf(filter.query) }
    if ("clients.create" in permissions) Button(onClick = controller::create) { Text(stringResource(R.string.clients_new)) }
    OutlinedTextField(query, { if (it.length <= 80) query = it }, label = { Text(stringResource(R.string.clients_search)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedButton(onClick = { scope.launch { controller.list(query, filter.status) } }) { Text(stringResource(R.string.clients_search_action)) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ClientStatus.entries.forEach { status -> FilterChip(selected = filter.status == status, onClick = { scope.launch { controller.list(query, status) } },
            label = { Text(stringResource(if (status == ClientStatus.ACTIVE) R.string.clients_active else R.string.clients_archived)) }) }
    }
    if (items.isEmpty()) { Text(stringResource(R.string.clients_empty), style = MaterialTheme.typography.titleLarge); Text(stringResource(R.string.clients_empty_help)) }
    items.forEach { client -> OutlinedCard(onClick = { scope.launch { controller.open(client.id) } }, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Summary(client) }
    } }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(enabled = filter.offset > 0, onClick = { scope.launch { controller.list(filter.query, filter.status, (filter.offset - 25).coerceAtLeast(0)) } }) { Text(stringResource(R.string.clients_previous)) }
        OutlinedButton(enabled = hasMore && filter.offset < 10000, onClick = { scope.launch { controller.list(filter.query, filter.status, filter.offset + 25) } }) { Text(stringResource(R.string.clients_next)) }
    }
}
@Composable
private fun Summary(client: ClientSummary) {
    Text(client.fullName, style = MaterialTheme.typography.titleMedium)
    Text(client.phoneMasked)
    if (client.status == ClientStatus.ARCHIVED) Text(stringResource(R.string.clients_archived))
    Text(stringResource(R.string.clients_last_updated, displayDate(client.updatedAt)), style = MaterialTheme.typography.bodySmall)
}
@Composable
private fun DraftScreen(draft: ClientDraft, controller: ClientController) {
    val scope = rememberCoroutineScope()
    Text(stringResource(if (draft.clientId == null) R.string.clients_new else R.string.clients_edit), style = MaterialTheme.typography.titleLarge)
    OutlinedTextField(draft.fullName, { if (it.length <= 160) controller.draft(draft.copy(fullName = it)) }, label = { Text(stringResource(R.string.clients_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(draft.phone, { if (it.length <= 40) controller.draft(draft.copy(phone = it)) }, label = { Text(stringResource(R.string.clients_phone_required)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
    Text(stringResource(R.string.clients_phone_hint), style = MaterialTheme.typography.bodySmall)
    OutlinedTextField(draft.email, { if (it.length <= 254) controller.draft(draft.copy(email = it)) }, label = { Text(stringResource(R.string.clients_email)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(draft.birthDate, { if (it.length <= 10) controller.draft(draft.copy(birthDate = it)) }, label = { Text(stringResource(R.string.clients_birth)) }, supportingText = { Text(stringResource(R.string.clients_date_hint)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii), modifier = Modifier.fillMaxWidth())
    Button(onClick = { scope.launch { controller.save() } }) { Text(stringResource(if (draft.clientId == null) R.string.clients_create else R.string.clients_save)) }
}
@Composable
private fun DetailField(label: Int, value: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(stringResource(label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value ?: stringResource(R.string.clients_not_added)) }
}
private fun displayDate(value: String) = runCatching { OffsetDateTime.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }.getOrDefault(value)
private fun clientErrorResource(code: String) = when (code) {
    "VALIDATION_FAILED" -> R.string.clients_validation
    "CLIENT_NOT_FOUND" -> R.string.clients_not_found
    "CLIENT_ARCHIVED" -> R.string.clients_archived_error
    "CONFLICT" -> R.string.clients_conflict
    "DUPLICATE_CONFIRMATION_INVALID" -> R.string.clients_review_expired
    "UNAUTHENTICATED", "SESSION_EXPIRED" -> R.string.auth_expired
    "FORBIDDEN", "TENANT_CONTEXT_INVALID", "MEMBERSHIP_REVOKED" -> R.string.workspace_invalid
    else -> R.string.auth_network
}
