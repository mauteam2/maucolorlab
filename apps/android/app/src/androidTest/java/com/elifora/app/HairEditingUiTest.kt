package com.elifora.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.elifora.app.domain.auth.ActiveTenantContext
import com.elifora.app.domain.clients.Client
import com.elifora.app.domain.clients.ClientStatus
import com.elifora.app.domain.hair.*
import com.elifora.app.ui.HairEditorScreen
import com.elifora.app.ui.theme.EliforaTheme
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class HairEditingUiTest {
    @get:Rule val composeRule = createComposeRule()
    private val id = "b5000000-0000-4000-8000-000000000001"
    private val context = ActiveTenantContext(id, id, "Salon", id, "Bolu", "owner", "active",
        setOf("clients.read", "hair_passport.read", "hair_passport.create", "hair_passport.add_observation"))
    private val client = Client(id, id, "Ayşe", "0532", null, null, ClientStatus.ACTIVE, 1,
        "2026-09-10T12:00:00Z", "2026-09-10T12:00:00Z")
    private fun text(resource: Int) = InstrumentationRegistry.getInstrumentation().targetContext.getString(resource)
    private fun render(controller: HairPassportController) {
        composeRule.setContent {
            val state by controller.state.collectAsState()
            EliforaTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
                (state as? HairState.Editing)?.let { HairEditorScreen(it, controller) }
            } }
        }
    }

    @Test fun observationRequiresExplicitProfessionalAcknowledgement() {
        var writes = 0
        val passport = HairPassport(id, id, false, "2026-09-10T12:00:00Z",
            HairAssessment(AssessmentState.NOT_ASSESSED, null, null), emptyList(),
            HairPage(emptyList(), 0, 10, false, null), HairPage(emptyList(), 0, 10, false, null),
            HairPage(emptyList(), 0, 10, false, null))
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Snapshot(passport) },
            HairMutationRepository { _, _ -> writes++ })
        runBlocking { controller.bind(context); controller.open(client); controller.begin(HairAction.OBSERVATION) }
        render(controller)
        composeRule.onNodeWithText(text(R.string.hair_edit_save)).performScrollTo().performClick()
        composeRule.onNodeWithText(text(R.string.hair_edit_attestation_invalid)).assertExists()
        composeRule.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun uncertainCreationDisablesCancellationAndRetriesSameRequest() {
        val sent = mutableListOf<HairCommand>()
        val controller = HairPassportController(HairPassportRepository { _, _, _ -> HairReadResult.Empty },
            HairMutationRepository { _, command -> sent += command; throw HairFailure("NETWORK_ERROR") })
        runBlocking { controller.bind(context); controller.open(client); controller.begin(HairAction.CREATE) }
        render(controller)
        composeRule.onNodeWithText(text(R.string.hair_edit_save)).performScrollTo().performClick()
        composeRule.onNodeWithText(text(R.string.hair_edit_uncertain)).assertExists()
        composeRule.onNodeWithText(text(R.string.hair_edit_cancel)).assertIsNotEnabled()
        composeRule.onNodeWithText(text(R.string.hair_edit_retry)).performScrollTo().performClick()
        composeRule.runOnIdle { assertEquals(2, sent.size); assertEquals(sent[0], sent[1]) }
    }
}
