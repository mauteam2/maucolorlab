package com.elifora.app.domain.hair

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import com.elifora.app.domain.clients.ClientStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HairMutationControllerTest {
    private val id = "b5000000-0000-4000-8000-000000000001"
    private val context = ActiveTenantContext(id, id, "Salon", id, "Bolu", "owner", "active", setOf("clients.read", "hair_passport.read", "hair_passport.create", "hair_passport.update"))
    private val client = Client(id, id, "Ayşe", "0532", null, null, ClientStatus.ACTIVE, 1, "2026-09-10T12:00:00Z", "2026-09-10T12:00:00Z")
    private val snapshot = HairPassport(id, id, false, "2026-09-10T12:00:00Z", HairAssessment(AssessmentState.NOT_ASSESSED, null, null), emptyList(),
        HairPage(emptyList(), 0, 10, false, null), HairPage(emptyList(), 0, 10, false, null), HairPage(emptyList(), 0, 10, false, null))
    @Test fun creationReloadsOnlyServerConfirmedSnapshot() = runBlocking {
        var result: HairReadResult = HairReadResult.Empty
        var reads = 0
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> reads++; result }, HairMutationRepository { _, _ -> result = HairReadResult.Snapshot(snapshot) })
        controller.bind(context); controller.open(client); controller.begin(HairAction.CREATE)
        controller.save()
        assertEquals(2, reads)
        assertEquals(snapshot, (controller.state.value as HairState.Ready).passport)
    }
    @Test fun networkRetryFreezesPayloadAndRequestIdAcrossRevalidation() = runBlocking {
        val sent = mutableListOf<HairCommand>()
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Empty }, HairMutationRepository { _, command ->
            sent += command; if (sent.size == 1) throw HairFailure("NETWORK_ERROR")
        })
        controller.bind(context); controller.open(client); controller.begin(HairAction.CREATE); controller.save()
        assertTrue((controller.state.value as HairState.Editing).status is HairEditStatus.NetworkError)
        val prior = (controller.state.value as HairState.Editing).draft
        controller.change((prior as HairDraft.Core).copy(values = prior.values.copy(technicalNotes = "Changed")))
        controller.close()
        assertFalse(controller.canLeave)
        controller.conceal(); controller.bind(context); controller.save()
        assertEquals(sent[0], sent[1])
    }
    @Test fun conflictDoesNotOverwriteAndOffersFreshRead() = runBlocking {
        var writes = 0
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Empty }, HairMutationRepository { _, _ -> writes++; throw HairFailure("HAIR_PASSPORT_ALREADY_EXISTS") })
        controller.bind(context); controller.open(client); controller.begin(HairAction.CREATE); controller.save()
        assertTrue((controller.state.value as HairState.Editing).status is HairEditStatus.Conflict)
        controller.save(); assertEquals(1, writes)
        controller.reloadAfterConflict(); assertTrue(controller.state.value is HairState.EmptyPassport)
    }
    @Test fun readOnlyAndArchivedClientsCannotOpenMutation() = runBlocking {
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Snapshot(snapshot) }, HairMutationRepository { _, _ -> fail("must not write") })
        controller.bind(context.copy(permissions = setOf("clients.read", "hair_passport.read"))); controller.open(client)
        assertFalse(controller.can(HairAction.CORE)); controller.begin(HairAction.CORE)
        assertEquals(HairState.Forbidden, controller.state.value)
        controller.bind(context); controller.open(client.copy(status = ClientStatus.ARCHIVED))
        assertFalse(controller.can(HairAction.CORE))
    }
    @Test fun mutationRevocationConcealsFormAndProtectedSnapshot() = runBlocking {
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Empty }, HairMutationRepository { _, _ -> throw HairFailure("MEMBERSHIP_REVOKED") })
        controller.bind(context); controller.open(client); controller.begin(HairAction.CREATE); controller.save()
        assertEquals(HairState.MembershipRevoked, controller.state.value)
    }
}
