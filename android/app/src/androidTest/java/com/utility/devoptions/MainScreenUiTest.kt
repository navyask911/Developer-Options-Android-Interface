package com.utility.devoptions

import android.content.res.Configuration
import java.util.Locale
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
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
import androidx.compose.ui.test.performScrollTo
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
        val activePromptState = mutableStateOf<AppPrompt?>(AppPrompt.OFFLINE)
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = activePromptState.value,
                    onDismissAppPrompt = {
                        dismissed = it == AppPrompt.OFFLINE
                        activePromptState.value = null
                    },
                    onOpenInternetSettings = {
                        settingsRequested = true
                        activePromptState.value = null
                    }
                )
            }
        }
        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not now").performClick()
        assertTrue("Not now dismisses without ending the Activity", dismissed)
        assertEquals(0, composeTestRule.onAllNodesWithText("You're offline").fetchSemanticsNodes().size)

        // Re-open a fresh prompt to verify network settings require an explicit tap.
        composeTestRule.runOnIdle { activePromptState.value = AppPrompt.OFFLINE }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Internet settings").performClick()
        assertTrue("Network settings open only after an explicit tap", settingsRequested)
        assertEquals(0, composeTestRule.onAllNodesWithText("You're offline").fetchSemanticsNodes().size)
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
        composeTestRule.onNodeWithText("You are offline. Ads and some online features may be unavailable until you reconnect. The app remains usable offline; reconnect only when you need an online feature.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlinePromptUsesUnverifiedCopyWhenBillingCannotBeConfirmed() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    adsRemovalEntitlementKnown = false,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }
        composeTestRule.onNodeWithText("You are offline, so the app cannot currently verify your ad-removal status. No purchase is being assumed. You can keep using available offline features and reconnect later if you need an online feature.").assertIsDisplayed()
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


    @Test
    fun longRussianActionLabelsRemainVisibleAndClickableOnCompactLayoutAndLargeText() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val russianConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("ru"))
        }
        val russianContext = baseContext.createConfigurationContext(russianConfiguration)
        val refreshLabel = russianContext.getString(R.string.refresh_status)
        val shareLabel = russianContext.getString(R.string.share_app)
        var refreshClicked = false
        var shareClicked = false

        composeTestRule.setContent {
            val currentDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalContext provides russianContext,
                LocalConfiguration provides russianConfiguration,
                LocalDensity provides Density(density = currentDensity.density, fontScale = 1.35f)
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(320.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = { shareClicked = true },
                        onManualRefresh = { refreshClicked = true }
                    )
                }
            }
        }

        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed().performClick()
        assertTrue("Refresh remains clickable with a long Russian label", refreshClicked)
        assertTrue("Share remains clickable with a long Russian label", shareClicked)
    }

    @Test
    fun longGermanActionLabelsRemainVisibleOnCompactLayout() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val germanConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("de"))
        }
        val germanContext = baseContext.createConfigurationContext(germanConfiguration)
        val refreshLabel = germanContext.getString(R.string.refresh_status)
        val shareLabel = germanContext.getString(R.string.share_app)

        composeTestRule.setContent {
            CompositionLocalProvider(
                LocalContext provides germanContext,
                LocalConfiguration provides germanConfiguration
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(320.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = {},
                        onManualRefresh = {}
                    )
                }
            }
        }
        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed()
    }

    @Test
    fun longRussianActionLabelsRemainVisibleAndClickableInSideBySideLayout() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val russianConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("ru"))
        }
        val russianContext = baseContext.createConfigurationContext(russianConfiguration)
        val refreshLabel = russianContext.getString(R.string.refresh_status)
        val shareLabel = russianContext.getString(R.string.share_app)
        var refreshClicked = false
        var shareClicked = false

        composeTestRule.setContent {
            val currentDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalContext provides russianContext,
                LocalConfiguration provides russianConfiguration,
                LocalDensity provides Density(density = currentDensity.density, fontScale = 1f)
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(393.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = { shareClicked = true },
                        onManualRefresh = { refreshClicked = true }
                    )
                }
            }
        }

        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed().performClick()
        assertTrue("Refresh remains clickable in the side-by-side Russian layout", refreshClicked)
        assertTrue("Share remains clickable in the side-by-side Russian layout", shareClicked)
    }

}
