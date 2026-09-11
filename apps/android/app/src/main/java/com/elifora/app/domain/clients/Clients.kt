package com.elifora.app.domain.clients

import com.elifora.app.domain.auth.ActiveTenantContext
import java.time.LocalDate
import java.util.UUID

enum class ClientStatus { ACTIVE, ARCHIVED }
data class ClientSummary(val id: String, val fullName: String, val phoneMasked: String, val status: ClientStatus, val updatedAt: String)
data class Client(val id: String, val organizationId: String, val fullName: String, val phone: String,
    val email: String?, val birthDate: String?, val status: ClientStatus, val version: Long,
    val createdAt: String, val updatedAt: String)
data class DuplicateCandidate(val summary: ClientSummary, val signals: Set<String>)
data class ClientDraft(val fullName: String = "", val phone: String = "", val email: String = "", val birthDate: String = "",
    val clientId: String? = null, val expectedVersion: Long? = null, val requestId: String = UUID.randomUUID().toString()) {
    fun isValid(today: LocalDate = LocalDate.now()): Boolean = fullName.trim().length in 2..160 &&
        phone.trim().length in 8..40 && (email.isBlank() || (email.length <= 254 && Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+").matches(email))) &&
        (birthDate.isBlank() || runCatching { LocalDate.parse(birthDate).let { it >= LocalDate.of(1900, 1, 1) && it <= today } }.getOrDefault(false))
}
sealed interface ClientCommand {
    data class ListClients(val query: String = "", val status: ClientStatus = ClientStatus.ACTIVE, val offset: Int = 0) : ClientCommand
    data class Detail(val id: String) : ClientCommand
    data class Save(val draft: ClientDraft, val confirmationToken: String? = null) : ClientCommand
    data class Lifecycle(val client: Client, val restore: Boolean, val requestId: String = UUID.randomUUID().toString()) : ClientCommand
}
sealed interface ClientReply {
    data class Directory(val items: List<ClientSummary>, val hasMore: Boolean) : ClientReply
    data class Saved(val client: Client) : ClientReply
    data class Duplicate(val candidates: List<DuplicateCandidate>, val token: String, val correlationId: String) : ClientReply
}
class ClientFailure(val code: String, val correlationId: String = UUID.randomUUID().toString()) : Exception(code)
fun interface ClientRepository { suspend fun execute(context: ActiveTenantContext, command: ClientCommand): ClientReply }

sealed interface ClientContent {
    data class Directory(val items: List<ClientSummary>, val hasMore: Boolean, val filter: ClientCommand.ListClients) : ClientContent
    data class Empty(val filter: ClientCommand.ListClients) : ClientContent
    data class Detail(val client: Client, val confirmArchive: Boolean = false) : ClientContent
    data class Editing(val draft: ClientDraft) : ClientContent
    data class DuplicateReview(val draft: ClientDraft, val candidates: List<DuplicateCandidate>, val token: String) : ClientContent
}
sealed interface ClientState {
    data object Loading : ClientState
    data object Saving : ClientState
    data class Ready(val content: ClientContent) : ClientState
    data class Error(val failure: ClientFailure) : ClientState
}
