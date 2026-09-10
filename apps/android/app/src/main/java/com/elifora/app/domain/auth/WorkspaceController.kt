package com.elifora.app.domain.auth

import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class ErrorCode {
    UNAUTHENTICATED, SESSION_EXPIRED, MEMBERSHIP_REQUIRED, MEMBERSHIP_REVOKED,
    TENANT_CONTEXT_INVALID, FORBIDDEN, INVALID_CREDENTIALS, NETWORK_ERROR, CONFIGURATION_ERROR
}
class AccessFailure(val code: ErrorCode, val correlationId: String = UUID.randomUUID().toString()) : Exception(code.name)

data class ActiveTenantContext(
    val membershipId: String, val organizationId: String, val organizationName: String,
    val locationId: String, val locationName: String, val role: String,
    val membershipStatus: String, val permissions: Set<String>,
) {
    val reference: String get() = "$membershipId:$locationId"
}
interface AuthRepository {
    suspend fun restore(): Boolean
    suspend fun signIn(email: String, password: String)
    suspend fun logout()
}
fun interface WorkspaceRepository { suspend fun list(): List<ActiveTenantContext> }
interface WorkspaceReferenceStore {
    var reference: String?
}
sealed interface WorkspaceState {
    data object LoadingSession : WorkspaceState
    data class SignedOut(val error: ErrorCode? = null) : WorkspaceState
    data object LoadingMemberships : WorkspaceState
    data class SelectingWorkspace(val contexts: List<ActiveTenantContext>, val reason: ErrorCode? = null) : WorkspaceState
    data class Ready(val context: ActiveTenantContext) : WorkspaceState
    data class NoMembership(val reason: ErrorCode = ErrorCode.MEMBERSHIP_REQUIRED) : WorkspaceState
    data object SessionExpired : WorkspaceState
    data class Error(val failure: AccessFailure) : WorkspaceState
}

/** All input references are resolved again against fresh server results; never against UI state. */
class WorkspaceController(
    private val auth: AuthRepository,
    private val workspaces: WorkspaceRepository,
    private val store: WorkspaceReferenceStore,
) {
    private val mutableState = MutableStateFlow<WorkspaceState>(WorkspaceState.LoadingSession)
    val state = mutableState.asStateFlow()
    private val mutex = Mutex()
    private var generation = 0
    private var choosing = false

    // Called synchronously when backgrounding/logging out to discard any in-flight result.
    fun conceal() { generation++; mutableState.value = WorkspaceState.LoadingSession }

    suspend fun restore() = operation {
        if (!auth.restore()) {
            store.reference = null
            WorkspaceState.SignedOut()
        } else bootstrap()
    }
    suspend fun signIn(email: String, password: String) = operation {
        choosing = false
        store.reference = null
        auth.signIn(email.trim(), password)
        bootstrap()
    }
    suspend fun select(reference: String) = operation {
        if (!auth.restore()) throw AccessFailure(ErrorCode.UNAUTHENTICATED)
        choosing = false
        bootstrap(reference)
    }
    suspend fun changeWorkspace() = operation {
        choosing = true
        store.reference = null
        if (!auth.restore()) throw AccessFailure(ErrorCode.UNAUTHENTICATED)
        bootstrap()
    }
    suspend fun logout() {
        conceal()
        choosing = false
        mutex.withLock {
            store.reference = null
            try { auth.logout() } finally { mutableState.value = WorkspaceState.SignedOut() }
        }
    }
    private suspend fun bootstrap(requested: String? = store.reference): WorkspaceState {
        mutableState.value = WorkspaceState.LoadingMemberships
        val contexts = workspaces.list().filter { it.membershipStatus == "active" }
        val selected = requested?.let { ref -> contexts.find { it.reference == ref } }
        if (requested != null && selected == null) {
            store.reference = null
            return if (contexts.isEmpty()) WorkspaceState.NoMembership(ErrorCode.MEMBERSHIP_REVOKED)
            else WorkspaceState.SelectingWorkspace(contexts, ErrorCode.TENANT_CONTEXT_INVALID)
        }
        if (contexts.isEmpty()) { store.reference = null; return WorkspaceState.NoMembership() }
        val resolved = selected ?: contexts.singleOrNull()?.takeUnless { choosing }
        if (resolved != null) {
            store.reference = resolved.reference
            return WorkspaceState.Ready(resolved)
        }
        return WorkspaceState.SelectingWorkspace(contexts)
    }
    private suspend fun operation(block: suspend () -> WorkspaceState) {
        val current = ++generation
        mutableState.value = WorkspaceState.LoadingSession
        mutex.withLock {
            if (current != generation) return
            try {
                val next = block()
                if (current == generation) mutableState.value = next
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: AccessFailure) {
                if (current != generation) return
                mutableState.value = when (failure.code) {
                    ErrorCode.UNAUTHENTICATED -> { store.reference = null; WorkspaceState.SignedOut() }
                    ErrorCode.SESSION_EXPIRED -> { store.reference = null; WorkspaceState.SessionExpired }
                    ErrorCode.INVALID_CREDENTIALS -> WorkspaceState.SignedOut(failure.code)
                    else -> WorkspaceState.Error(failure)
                }
            } catch (_: Exception) {
                if (current == generation) mutableState.value = WorkspaceState.Error(AccessFailure(ErrorCode.NETWORK_ERROR))
            }
        }
    }
}
