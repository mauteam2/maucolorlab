package com.elifora.app.domain.clients

import com.elifora.app.domain.auth.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class ClientControllerTest {
    private val context = ActiveTenantContext("member-a", "org-a", "Salon", "loc-a", "Bolu", "owner", "active", setOf("clients.read", "clients.create", "clients.update", "clients.archive"))
    private val client = Client("client-a", "org-a", "Ayşe Yılmaz", "+905321234567", null, null, ClientStatus.ACTIVE, 1, "2026-09-11", "2026-09-11")
    private val summary = ClientSummary(client.id, client.fullName, "+90••••567", ClientStatus.ACTIVE, "2026-09-11")
    private val commands = mutableListOf<ClientCommand>()
    private var reply: ClientReply = ClientReply.Directory(listOf(summary), false)
    private var failure: Exception? = null
    private var pending: CompletableDeferred<Unit>? = null
    private val controller = ClientController(ClientRepository { _, command -> commands.add(command); pending?.await(); failure?.let { throw it }; reply })
    private fun content() = (controller.state.value as ClientState.Ready).content
    private suspend fun editing() { controller.bind(context); controller.create(); controller.draft(ClientDraft(fullName = "Ayşe Yılmaz", phone = "05321234567")) }
    @Test fun loadsActiveDirectory() = runBlocking {
        controller.bind(context); assertTrue(content() is ClientContent.Directory)
        assertEquals(ClientStatus.ACTIVE, (commands.single() as ClientCommand.ListClients).status)
    }
    @Test fun emptyHasExplicitState() = runBlocking {
        reply = ClientReply.Directory(emptyList(), false); controller.bind(context); assertTrue(content() is ClientContent.Empty)
    }
    @Test fun searchAndPaginationReachRepository() = runBlocking {
        controller.bind(context); controller.list("0532", ClientStatus.ARCHIVED, 25)
        assertEquals(ClientCommand.ListClients("0532", ClientStatus.ARCHIVED, 25), commands.last())
    }
    @Test fun requiredValidationDoesNotCallMutation() = runBlocking {
        controller.bind(context); controller.create(); controller.save()
        assertEquals("VALIDATION_FAILED", (controller.state.value as ClientState.Error).failure.code)
        assertEquals(1, commands.size)
    }
    @Test fun optionalEmailAndBirthDateAreValidated() {
        val draft = ClientDraft("Valid Name", "05321234567")
        assertTrue(draft.isValid()); assertFalse(draft.copy(email = "invalid").isValid())
        assertFalse(draft.copy(birthDate = "1990-02-30").isValid()); assertFalse(draft.copy(birthDate = "2999-01-01").isValid())
    }
    @Test fun normalCreateOpensDetail() = runBlocking {
        editing(); reply = ClientReply.Saved(client); controller.save(); assertEquals(client, (content() as ClientContent.Detail).client)
        assertNull((commands.last() as ClientCommand.Save).confirmationToken)
    }
    @Test fun duplicateBecomesReviewNotError() = runBlocking {
        editing(); reply = ClientReply.Duplicate(listOf(DuplicateCandidate(summary, setOf("PHONE"))), "review-token", "correlation")
        controller.save(); assertTrue(content() is ClientContent.DuplicateReview)
    }
    @Test fun explicitSeparatePersonSendsServerTokenAndSameRequestId() = runBlocking {
        editing(); reply = ClientReply.Duplicate(listOf(DuplicateCandidate(summary, setOf("PHONE"))), "review-token", "correlation")
        controller.save(); val original = commands.last() as ClientCommand.Save
        reply = ClientReply.Saved(client); controller.save(confirm = true)
        val confirmed = commands.last() as ClientCommand.Save
        assertEquals("review-token", confirmed.confirmationToken); assertEquals(original.draft.requestId, confirmed.draft.requestId)
    }
    @Test fun candidateNavigationFetchesExistingDetail() = runBlocking {
        editing(); reply = ClientReply.Duplicate(listOf(DuplicateCandidate(summary, setOf("PHONE"))), "token", "correlation"); controller.save()
        reply = ClientReply.Saved(client); controller.open(summary.id)
        assertEquals(ClientCommand.Detail(summary.id), commands.last()); assertTrue(content() is ClientContent.Detail)
    }
    @Test fun editKeepsExpectedVersion() = runBlocking {
        controller.bind(context); controller.edit(client); val draft = (content() as ClientContent.Editing).draft
        assertEquals(client.id, draft.clientId); assertEquals(1L, draft.expectedVersion)
        reply = ClientReply.Saved(client.copy(fullName = "Ayşe Demir", version = 2)); controller.draft(draft.copy(fullName = "Ayşe Demir")); controller.save()
        assertEquals("Ayşe Demir", (content() as ClientContent.Detail).client.fullName)
    }
    @Test fun changedPhoneReturnsToDuplicateReview() = runBlocking {
        controller.bind(context); controller.edit(client)
        controller.draft((content() as ClientContent.Editing).draft.copy(phone = "05329998877"))
        reply = ClientReply.Duplicate(listOf(DuplicateCandidate(summary, setOf("PHONE"))), "token", "correlation"); controller.save()
        assertEquals("05329998877", (commands.last() as ClientCommand.Save).draft.phone); assertTrue(content() is ClientContent.DuplicateReview)
    }
    @Test fun archiveRequiresConfirmation() = runBlocking {
        controller.bind(context); reply = ClientReply.Saved(client); controller.open(client.id); controller.archive()
        assertTrue(commands.last() is ClientCommand.Detail)
        controller.requestArchive(client); reply = ClientReply.Saved(client.copy(status = ClientStatus.ARCHIVED)); controller.archive()
        assertEquals(false, (commands.last() as ClientCommand.Lifecycle).restore); assertEquals(ClientStatus.ARCHIVED, (content() as ClientContent.Detail).client.status)
    }
    @Test fun restoreUsesVersionedService() = runBlocking {
        controller.bind(context); reply = ClientReply.Saved(client); controller.restore(client.copy(status = ClientStatus.ARCHIVED, version = 2))
        val command = commands.last() as ClientCommand.Lifecycle; assertTrue(command.restore); assertEquals(2, command.client.version)
    }
    @Test fun tenantChangeDiscardsDraft() = runBlocking {
        editing(); controller.bind(context.copy(membershipId = "b", organizationId = "org-b")); assertTrue(content() is ClientContent.Directory)
    }
    @Test fun revokedMembershipConcealsIdentity() = runBlocking {
        controller.bind(context); failure = ClientFailure("TENANT_CONTEXT_INVALID", "correlation"); controller.list()
        assertEquals("TENANT_CONTEXT_INVALID", (controller.state.value as ClientState.Error).failure.code)
        assertEquals("correlation", (controller.state.value as ClientState.Error).failure.correlationId)
    }
    @Test fun backgroundDiscardsLateResult() = runBlocking {
        controller.bind(context); pending = CompletableDeferred()
        val load = launch { controller.list() }; yield(); controller.conceal(); pending!!.complete(Unit); load.join()
        assertEquals(ClientState.Loading, controller.state.value)
    }
    @Test fun resumeRevalidatesBeforeRestoringDraft() = runBlocking {
        editing(); val draft = (content() as ClientContent.Editing).draft
        controller.conceal(); assertEquals(ClientState.Loading, controller.state.value)
        controller.bind(context); assertEquals(draft, (content() as ClientContent.Editing).draft)
        assertTrue(commands.last() is ClientCommand.ListClients)
    }
    @Test fun permissionDowngradeCannotRestoreEditForm() = runBlocking {
        editing(); controller.bind(context.copy(permissions = setOf("clients.read")))
        assertEquals("FORBIDDEN", (controller.state.value as ClientState.Error).failure.code)
    }
    @Test fun failedSaveRetryKeepsIdempotencyKey() = runBlocking {
        editing(); failure = ClientFailure("NETWORK_ERROR"); controller.save(); val original = commands.last()
        failure = null; reply = ClientReply.Saved(client); controller.retry(); assertEquals(original, commands.last())
    }
    @Test fun sharedAuthFailureIsMappedWithoutLosingCorrelation() = runBlocking {
        failure = AccessFailure(ErrorCode.SESSION_EXPIRED, "auth-correlation"); controller.bind(context)
        assertEquals("auth-correlation", (controller.state.value as ClientState.Error).failure.correlationId)
        assertEquals("SESSION_EXPIRED", (controller.state.value as ClientState.Error).failure.code)
    }
    @Test fun readOnlyCannotCreateOrArchive() = runBlocking {
        controller.bind(context.copy(permissions = setOf("clients.read"))); controller.create()
        assertEquals("FORBIDDEN", (controller.state.value as ClientState.Error).failure.code)
        controller.requestArchive(client); assertEquals(1, commands.size)
    }
    @Test fun archivedWhileBackgroundedCannotRestoreEditForm() = runBlocking {
        controller.bind(context); controller.edit(client); controller.conceal()
        reply = ClientReply.Saved(client.copy(status = ClientStatus.ARCHIVED, version = 2)); controller.bind(context)
        assertEquals(ClientStatus.ARCHIVED, (content() as ClientContent.Detail).client.status)
    }
    @Test fun periodicRefreshPreservesEditingButDenialConcealsIt() = runBlocking {
        editing(); val draft = content(); pending = CompletableDeferred()
        val refresh = launch { controller.bind(context, keepVisible = true) }; yield()
        assertEquals(draft, content())
        failure = ClientFailure("TENANT_CONTEXT_INVALID"); pending!!.complete(Unit); refresh.join()
        assertTrue(controller.state.value is ClientState.Error)
    }
}
