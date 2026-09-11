package com.elifora.app.domain.clients

import com.elifora.app.domain.auth.AccessFailure
import com.elifora.app.domain.auth.ActiveTenantContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/** Retains drafts only in memory; every resume must revalidate through the server before revealing them. */
class ClientController(private val repository: ClientRepository) {
    private val mutable = MutableStateFlow<ClientState>(ClientState.Loading)
    val state = mutable.asStateFlow()
    private var context: ActiveTenantContext? = null
    private var content: ClientContent? = null
    private var lastCommand: ClientCommand = ClientCommand.ListClients()
    private var generation = 0
    private val mutex = Mutex()
    fun conceal() { generation++; mutable.value = ClientState.Loading }
    fun invalidate() { conceal(); context = null; content = null; lastCommand = ClientCommand.ListClients() }
    suspend fun bind(next: ActiveTenantContext) {
        if (context?.reference != next.reference || context?.organizationId != next.organizationId) invalidate()
        context = next
        val previous = content
        val check = when (previous) {
            is ClientContent.Detail -> ClientCommand.Detail(previous.client.id)
            is ClientContent.Editing -> previous.draft.clientId?.let { ClientCommand.Detail(it) } ?: ClientCommand.ListClients()
            is ClientContent.DuplicateReview -> previous.draft.clientId?.let { ClientCommand.Detail(it) } ?: ClientCommand.ListClients()
            is ClientContent.Directory -> previous.filter
            is ClientContent.Empty -> previous.filter
            null -> ClientCommand.ListClients()
        }
        run(check, resume = previous)
    }
    suspend fun list(query: String = "", status: ClientStatus = ClientStatus.ACTIVE, offset: Int = 0) = run(ClientCommand.ListClients(query, status, offset))
    suspend fun open(id: String) = run(ClientCommand.Detail(id))
    fun create() { if (allowed("clients.create")) show(ClientContent.Editing(ClientDraft())) }
    fun edit(client: Client) {
        if (allowed("clients.update") && client.status == ClientStatus.ACTIVE)
            show(ClientContent.Editing(ClientDraft(client.fullName, client.phone, client.email.orEmpty(), client.birthDate.orEmpty(), client.id, client.version)))
    }
    fun draft(value: ClientDraft) { show(ClientContent.Editing(value.copy(requestId = UUID.randomUUID().toString()))) }
    fun reviewAgain() { (content as? ClientContent.DuplicateReview)?.let { show(ClientContent.Editing(it.draft)) } }
    suspend fun save(confirm: Boolean = false) {
        val current = content
        val draft = when (current) { is ClientContent.Editing -> current.draft; is ClientContent.DuplicateReview -> current.draft; else -> return }
        if (!draft.isValid()) { mutable.value = ClientState.Error(ClientFailure("VALIDATION_FAILED")); return }
        run(ClientCommand.Save(draft, if (confirm) (current as? ClientContent.DuplicateReview)?.token else null))
    }
    fun requestArchive(client: Client) { if (allowed("clients.archive")) show(ClientContent.Detail(client, true)) }
    fun cancelArchive() { (content as? ClientContent.Detail)?.let { show(it.copy(confirmArchive = false)) } }
    suspend fun archive() {
        val detail = content as? ClientContent.Detail ?: return
        if (detail.confirmArchive) run(ClientCommand.Lifecycle(detail.client, false))
    }
    suspend fun restore(client: Client) = run(ClientCommand.Lifecycle(client, true))
    suspend fun retry() {
        if ((mutable.value as? ClientState.Error)?.failure?.code == "VALIDATION_FAILED") {
            context?.let { bind(it) }; return
        }
        run(lastCommand)
    }
    private fun show(value: ClientContent) { content = value; mutable.value = ClientState.Ready(value) }
    private fun allowed(permission: String): Boolean {
        if (context?.permissions?.contains(permission) == true) return true
        mutable.value = ClientState.Error(ClientFailure("FORBIDDEN")); return false
    }
    private suspend fun run(command: ClientCommand, resume: ClientContent? = null) {
        val selected = context ?: return
        val permission = when (command) { is ClientCommand.Save -> if (command.draft.clientId == null) "clients.create" else "clients.update"; is ClientCommand.Lifecycle -> "clients.archive"; else -> "clients.read" }
        if (!allowed(permission)) return
        val current = ++generation
        if (resume == null) lastCommand = command
        mutable.value = if (command is ClientCommand.Save || command is ClientCommand.Lifecycle) ClientState.Saving else ClientState.Loading
        mutex.withLock {
            if (current != generation) return
            try {
                val reply = repository.execute(selected, command)
                if (current != generation) return
                val next = when (reply) {
                    is ClientReply.Directory -> {
                        val filter = command as? ClientCommand.ListClients ?: ClientCommand.ListClients()
                        if (reply.items.isEmpty()) ClientContent.Empty(filter) else ClientContent.Directory(reply.items, reply.hasMore, filter)
                    }
                    is ClientReply.Saved -> ClientContent.Detail(reply.client)
                    is ClientReply.Duplicate -> ClientContent.DuplicateReview((command as ClientCommand.Save).draft, reply.candidates, reply.token)
                }
                val draft = when (resume) { is ClientContent.Editing -> resume.draft; is ClientContent.DuplicateReview -> resume.draft; else -> null }
                if (draft != null && !allowed(if (draft.clientId == null) "clients.create" else "clients.update")) { content = null; return }
                show(if (draft != null) resume!! else next)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: ClientFailure) { if (current == generation) fail(failure) }
            catch (failure: AccessFailure) { if (current == generation) fail(ClientFailure(failure.code.name, failure.correlationId)) }
            catch (_: Exception) { if (current == generation) fail(ClientFailure("NETWORK_ERROR")) }
        }
    }
    private fun fail(failure: ClientFailure) {
        if (failure.code in setOf("UNAUTHENTICATED", "SESSION_EXPIRED", "MEMBERSHIP_REVOKED", "TENANT_CONTEXT_INVALID", "FORBIDDEN")) { content = null; lastCommand = ClientCommand.ListClients() }
        mutable.value = ClientState.Error(failure)
    }
}
