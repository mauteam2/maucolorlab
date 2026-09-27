package com.elifora.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.elifora.app.domain.hair.*
import com.elifora.app.ui.PassportContent
import com.elifora.app.ui.theme.EliforaTheme
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test

class HairPassportUiTest {
    @get:Rule val composeRule = createComposeRule()

    @Test fun rendersUnknownFieldsAndEmptySections() {
        val facts = HairField.entries.associateWith { HairFact(FactState.NOT_ASSESSED, null) } +
            (HairField.POROSITY to HairFact(FactState.UNKNOWN, null))
        val passport = HairPassport("id", "client", false, "2026-09-10T12:00:00Z",
            HairAssessment(AssessmentState.UNVERIFIED, HairTechnicalValues(facts, null, null), null), emptyList(),
            HairPage(emptyList(), 0, 10, false, null), HairPage(emptyList(), 0, 10, false, null),
            HairPage(emptyList(), 0, 10, false, null))
        composeRule.setContent { EliforaTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            PassportContent(passport, {}, { _, _ -> })
        } } }
        val resources = InstrumentationRegistry.getInstrumentation().targetContext
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_state_unknown)).assertExists()
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_state_not_assessed), substring = true).assertExists()
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_section_count,
            resources.getString(R.string.hair_passport_regions), 0), substring = true).performClick()
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_no_regions)).assertExists()
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_section_count,
            resources.getString(R.string.hair_passport_tests), 0), substring = true).performClick()
        composeRule.onNodeWithText(resources.getString(R.string.hair_passport_no_tests)).assertExists()
    }
}
