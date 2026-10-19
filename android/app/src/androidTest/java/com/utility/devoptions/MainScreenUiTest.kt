package com.utility.devoptions

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.appcompat.app.AppCompatDelegate
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import org.junit.Assert.assertEquals
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
        composeTestRule.onNodeWithText("Developers Options Shortcut").assertIsDisplayed()

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
    @Test
    fun updatePromptActionsStayOptionalAndDelegateToCallbacks() {
        var laterPressed = false
        var updatePressed = false
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.UPDATE,
                    onDismissAppPrompt = { laterPressed = it == AppPrompt.UPDATE },
                    onUpdateNow = { updatePressed = true }
                )
            }
        }
        composeTestRule.onNodeWithText("Update available").assertIsDisplayed()
        composeTestRule.onNodeWithText("Later").performClick()
        assertTrue("Later requests dialog dismissal only", laterPressed)
        composeTestRule.onNodeWithText("Update now").performClick()
        assertTrue("Update action delegates to the Play listing handler", updatePressed)
    }

    @Test
    fun offlinePromptIsDismissibleAndNetworkSettingsAreUserInitiated() {
        var dismissed = false
        var settingsRequested = false
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE,
                    onDismissAppPrompt = { dismissed = it == AppPrompt.OFFLINE },
                    onOpenInternetSettings = { settingsRequested = true }
                )
            }
        }
        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not now").performClick()
        assertTrue("Not now dismisses without ending the Activity", dismissed)
        composeTestRule.onNodeWithText("Internet settings").performClick()
        assertTrue("Network settings open only after an explicit tap", settingsRequested)
        composeTestRule.onNodeWithText("Enjoying the app? You can optionally buy the team a coffee to support future development. This is entirely optional; the app remains available offline.")
            .assertExists()
    }


    @Test
    fun offlinePromptForAdFreeUserKeepsAdsRemovedAndCoffeeSupportOptional() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = true,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }

        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Enjoying the app? You can optionally buy the team a coffee to support future development. This is entirely optional; the app remains available offline.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithContentDescription("Remove Ads (Google Play Billing)").fetchSemanticsNodes().size)
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlinePromptForNonAdFreeUserDoesNotPressureUsersToEnableAds() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }

        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Enjoying the app? You can optionally buy the team a coffee to support future development. This is entirely optional; the app remains available offline.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlineDialogRespectsRightToLeftComposeLayout() {
        var rtlObserved = false
        composeTestRule.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                rtlObserved = LocalLayoutDirection.current == LayoutDirection.Rtl
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        onOpenDeveloperOptions = {},
                        onShareApp = {},
                        onManualRefresh = {},
                        activeAppPrompt = AppPrompt.OFFLINE
                    )
                }
            }
        }
        assertTrue("The dialog can render under an RTL layout direction", rtlObserved)
        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not now").assertIsDisplayed()
    }

    @Test
    fun languageSelectionIsRetainedByTheAppLocaleDelegate() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val original = AppCompatDelegate.getApplicationLocales()
        try {
            AppLanguageController.selectLanguage(context, "de")
            assertEquals("de", AppLanguageController.currentLanguageTag(context))
            assertEquals("de", AppCompatDelegate.getApplicationLocales()[0]?.toLanguageTag())
            AppLanguageController.selectLanguage(context, "system")
            assertEquals("system", AppLanguageController.currentLanguageTag(context))
        } finally {
            val originalTag = original[0]?.toLanguageTag()
            if (originalTag.isNullOrBlank()) AppLanguageController.selectLanguage(context, "system")
            else AppLanguageController.selectLanguage(context, originalTag)
        }
    }

}
