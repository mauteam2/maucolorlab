package com.elifora.app.domain.hair

import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import com.elifora.app.domain.clients.ClientStatus
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HairPassportControllerTest {
    private val id = "b2000000-0000-4000-8000-000000000031"
    private val context = ActiveTenantContext(id, id, "Salon", id, "Bolu", "owner", "active", setOf("clients.read", "hair_passport.read"))
    private val client = Client(id, id, "Ayşe", "0532", null, null, ClientStatus.ACTIVE, 1, "2026-09-10T12:00:00Z", "2026-09-10T12:00:00Z")
    private val page = HairPage(emptyList<HairObservation>(), 0, 10, false, null)
    private val snapshot = HairPassport(id, id, false, "2026-09-10T12:00:00Z", HairAssessment(AssessmentState.NOT_ASSESSED, null, null),
        emptyList(), page, HairPage(emptyList(), 0, 10, false, null), HairPage(emptyList(), 0, 10, false, null))

    @Test fun loadsThenRefreshesCurrentPassport() = runBlocking {
        var calls = 0
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> calls++; HairReadResult.Snapshot(snapshot) })
        controller.bind(context)
        controller.open(client)
        assertTrue(controller.state.value is HairState.Ready)
        controller.conceal()
        assertEquals(HairState.Loading, controller.state.value)
        controller.refresh()
        assertTrue(controller.state.value is HairState.Ready)
        assertEquals(2, calls)
    }

    @Test fun mapsEmptyAndAccessFailuresWithoutPriorSnapshot() = runBlocking {
        val empty = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Empty })
        empty.bind(context); empty.open(client)
        assertTrue(empty.state.value is HairState.EmptyPassport)
        val forbidden = HairPassportController(HairPassportRepository { _, _, _ -> throw HairFailure("FORBIDDEN") })
        forbidden.bind(context); forbidden.open(client)
        assertEquals(HairState.Forbidden, forbidden.state.value)
        val revoked = HairPassportController(HairPassportRepository { _, _, _ -> throw HairFailure("MEMBERSHIP_REVOKED") })
        revoked.bind(context); revoked.open(client)
        assertEquals(HairState.MembershipRevoked, revoked.state.value)
        val expired = HairPassportController(HairPassportRepository { _, _, _ -> throw HairFailure("SESSION_EXPIRED") })
        expired.bind(context); expired.open(client)
        assertEquals(HairState.SessionExpired, expired.state.value)
        val network = HairPassportController(HairPassportRepository { _, _, _ -> throw HairFailure("NETWORK_ERROR") })
        network.bind(context); network.open(client)
        assertTrue(network.state.value is HairState.Error)
    }

    @Test fun contextLossConcealsPassport() = runBlocking {
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Snapshot(snapshot) })
        controller.bind(context); controller.open(client)
        controller.invalidate()
        assertEquals(HairState.Closed, controller.state.value)
        controller.bind(context.copy(membershipId = "b2000000-0000-4000-8000-000000000099"))
        assertEquals(HairState.Closed, controller.state.value)
    }

    @Test fun independentPagesAndRefreshKeepOffsets() = runBlocking {
        val seen = mutableListOf<HairOffsets>()
        val controller = HairPassportController(HairPassportRepository { _, _, offsets ->
            seen += offsets
            HairReadResult.Snapshot(snapshot)
        })
        controller.bind(context); controller.open(client)
        controller.page(HairPageKind.OBSERVATIONS, 10)
        controller.page(HairPageKind.HISTORY, 20)
        controller.refresh()
        assertEquals(HairOffsets(), seen[0])
        assertEquals(HairOffsets(observations = 10), seen[1])
        assertEquals(HairOffsets(observations = 10, history = 20), seen[2])
        assertEquals(seen[2], seen[3])
    }

    @Test fun missingPermissionNeverCallsRepository() = runBlocking {
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> fail("should not read"); HairReadResult.Empty })
        controller.bind(context.copy(permissions = setOf("clients.read")))
        controller.open(client)
        assertEquals(HairState.Forbidden, controller.state.value)
    }

    @Test fun refreshRevocationRemovesPreviouslyVisibleSnapshot() = runBlocking {
        var allowed = true
        val controller = HairPassportController(HairPassportRepository { _, _, _ ->
            if (!allowed) throw HairFailure("MEMBERSHIP_REVOKED")
            HairReadResult.Snapshot(snapshot)
        })
        controller.bind(context); controller.open(client)
        assertTrue(controller.state.value is HairState.Ready)
        allowed = false
        controller.refresh()
        assertEquals(HairState.MembershipRevoked, controller.state.value)
    }
}
