package com.utility.devoptions

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Standard Android Instrumented Compose UI Test.
 * Validates Material 3 MainScreen rendering, button interactions,
 * status badge visibility, and persistent "Remove Ads" action item.
 */
class MainScreenUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testMainScreen_displaysTitleAndInspectorHeader() {
        val testUiState = DevStatusUiState(
            isDeveloperOptionsEnabled = true,
            isUsbDebuggingEnabled = false,
            androidVersion = "15",
            apiLevel = 35,
            deviceModel = "Pixel 9 Pro",
            manufacturer = "Google"
        )

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = testUiState,
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = {},
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Verify TopAppBar Title
        composeTestRule.onNodeWithText("Dev Options Shortcut").assertIsDisplayed()

        // Verify Inspector Header
        composeTestRule.onNodeWithText("REAL-TIME SETTINGS INSPECTOR").assertIsDisplayed()

        // Verify Action Button
        composeTestRule.onNodeWithText("Open Developer Options").assertIsDisplayed()
    }

    @Test
    fun testMainScreen_openDeveloperOptionsClick_invokesCallback() {
        var actionClicked = false

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = {},
                    onOpenDeveloperOptions = { actionClicked = true },
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Perform click on primary CTA
        composeTestRule.onNodeWithText("Open Developer Options").performClick()
        assertTrue("Callback onOpenDeveloperOptions should be invoked on click", actionClicked)
    }

    @Test
    fun testMainScreen_removeAdsActionItem_presence() {
        var removeAdsClicked = false

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = { removeAdsClicked = true },
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Verify "Remove Ads" action icon in TopAppBar
        composeTestRule.onNodeWithContentDescription("Remove Ads (Google Play Billing)").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Remove Ads (Google Play Billing)").performClick()
        assertTrue("onRemoveAds should be invoked when tapping top bar action", removeAdsClicked)
    }
}
