package com.elifora.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class FoundationUiTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun showsProductIdentityAndSignedOutState() {
        composeRule.onNodeWithText("ELIFORA").assertIsDisplayed()
        composeRule.onNodeWithText(composeRule.activity.getString(R.string.auth_sign_in)).assertIsDisplayed()
    }
}
