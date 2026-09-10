package com.elifora.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.elifora.app.R
import com.elifora.app.domain.auth.*
import com.elifora.app.ui.theme.EliforaTheme
import kotlinx.coroutines.flow.StateFlow

@Composable
fun EliforaApp(
    states: StateFlow<WorkspaceState>,
    signIn: (String, String) -> Unit, select: (String) -> Unit,
    retry: () -> Unit, change: () -> Unit, logout: () -> Unit,
) {
    val state by states.collectAsStateWithLifecycle()
    EliforaTheme {
        Scaffold { padding ->
            Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 40.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Text(stringResource(R.string.app_name), color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.titleLarge)
                when (val current = state) {
                    WorkspaceState.LoadingSession, WorkspaceState.LoadingMemberships -> {
                        CircularProgressIndicator()
                        Text(stringResource(R.string.auth_loading))
                    }
                    is WorkspaceState.SignedOut -> SignInForm(current.error, signIn)
                    WorkspaceState.SessionExpired -> SignInForm(ErrorCode.SESSION_EXPIRED, signIn)
                    is WorkspaceState.Ready -> {
                        Text(current.context.organizationName, style = MaterialTheme.typography.headlineMedium)
                        Text(current.context.locationName, style = MaterialTheme.typography.titleLarge)
                        Text(roleLabel(current.context.role))
                        Text(stringResource(R.string.workspace_ready))
                        OutlinedButton(onClick = change) { Text(stringResource(R.string.workspace_change)) }
                    }
                    is WorkspaceState.SelectingWorkspace -> {
                        Text(stringResource(R.string.workspace_select), style = MaterialTheme.typography.headlineMedium)
                        if (current.reason != null) Text(stringResource(R.string.workspace_invalid))
                        current.contexts.forEach { context ->
                            OutlinedButton(onClick = { select(context.reference) }, modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(8.dp)) {
                                    Text(context.organizationName)
                                    Text(context.locationName)
                                    Text(roleLabel(context.role))
                                }
                            }
                        }
                    }
                    is WorkspaceState.NoMembership -> {
                        Text(stringResource(R.string.workspace_empty), style = MaterialTheme.typography.headlineMedium)
                        Text(stringResource(R.string.workspace_empty_detail))
                        OutlinedButton(onClick = retry) { Text(stringResource(R.string.auth_retry)) }
                    }
                    is WorkspaceState.Error -> {
                        Text(errorLabel(current.failure.code))
                        OutlinedButton(onClick = retry) { Text(stringResource(R.string.auth_retry)) }
                    }
                }
                if (state !is WorkspaceState.SignedOut && state !is WorkspaceState.SessionExpired &&
                    state !is WorkspaceState.LoadingSession && state !is WorkspaceState.LoadingMemberships) {
                    Button(onClick = logout) { Text(stringResource(R.string.auth_logout)) }
                }
            }
        }
    }
}
@Composable
private fun SignInForm(error: ErrorCode?, signIn: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    // Password is intentionally never saved across activity/process recreation.
    var password by remember { mutableStateOf("") }
    Text(stringResource(R.string.auth_welcome), style = MaterialTheme.typography.headlineMedium)
    Text(stringResource(R.string.auth_intro))
    if (error != null) Text(errorLabel(error), color = MaterialTheme.colorScheme.error)
    OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.auth_email)) },
        singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth())
    OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.auth_password)) },
        singleLine = true, visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
    Button(onClick = { signIn(email, password); password = "" }, enabled = email.isNotBlank() && password.isNotBlank()) {
        Text(stringResource(R.string.auth_sign_in))
    }
}
@Composable
private fun roleLabel(role: String): String = stringResource(when (role) {
    "owner" -> R.string.role_owner
    "manager" -> R.string.role_manager
    "colorist" -> R.string.role_colorist
    "assistant" -> R.string.role_assistant
    else -> R.string.role_reception
})
@Composable
private fun errorLabel(code: ErrorCode): String = stringResource(when (code) {
    ErrorCode.INVALID_CREDENTIALS -> R.string.auth_invalid
    ErrorCode.SESSION_EXPIRED, ErrorCode.UNAUTHENTICATED -> R.string.auth_expired
    ErrorCode.FORBIDDEN, ErrorCode.MEMBERSHIP_REVOKED, ErrorCode.TENANT_CONTEXT_INVALID -> R.string.workspace_invalid
    ErrorCode.CONFIGURATION_ERROR -> R.string.auth_configuration
    else -> R.string.auth_network
})
