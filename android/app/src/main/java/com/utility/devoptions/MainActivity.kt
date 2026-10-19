package com.utility.devoptions

import android.os.Bundle
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.review.ReviewManagerFactory
import com.utility.devoptions.util.ExternalActions
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.utility.devoptions.ads.AdManager
import com.utility.devoptions.data.billing.BillingManager
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import com.utility.devoptions.util.IntentHelper
import com.utility.devoptions.viewmodel.DeveloperOptionsViewModel
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private lateinit var adManager: AdManager
    private lateinit var billingManager: BillingManager
    private lateinit var appUpdateManager: AppUpdateManager
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var validatedInternet = false
    private var updateConfirmedByPlay = false
    private var consentUiResolved = false
    private var offlineShownThisSession = false
    private var automaticReviewInFlight = false
    private var activePrompt: AppPrompt? by mutableStateOf(null)
    private val promptPrefs by lazy { getSharedPreferences("app_prompt_state", Context.MODE_PRIVATE) }
    private var sessionCount = 0
    private val promptNow get() = System.currentTimeMillis()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lifecycle.addObserver(viewModel)

        appUpdateManager = AppUpdateManagerFactory.create(this)
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        sessionCount = promptPrefs.getInt("session_count", 0) + 1
        promptPrefs.edit().putInt("session_count", sessionCount).apply()
        billingManager = BillingManager(applicationContext)
        adManager = AdManager(applicationContext)
        adManager.setAdsRemoved(billingManager.isAdsRemoved.value)
        adManager.initializeConsentAndAds(this, {}, onConsentFlowComplete = {
            runOnUiThread {
                consentUiResolved = true
                reconcilePrompt()
            }
        })

        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isAdsRemoved by billingManager.isAdsRemoved.collectAsState()
                val adsRemovalEntitlementKnown by billingManager.adsRemovalEntitlementKnown.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()
                var showEnablementGuide by remember { mutableStateOf(false) }
                var selectedLanguageTag by remember {
                    mutableStateOf(AppLanguageController.currentLanguageTag(this@MainActivity))
                }
                var suggestedLanguageTag by remember {
                    mutableStateOf(AppLanguageController.pendingSuggestion(this@MainActivity))
                }

                LaunchedEffect(isAdsRemoved) { adManager.setAdsRemoved(isAdsRemoved) }

                val handleOpenResult: (IntentHelper.OpenResult) -> Unit = { result ->
                    when (result) {
                        IntentHelper.OpenResult.Success -> Unit
                        is IntentHelper.OpenResult.SuccessWithMessage -> {
                            coroutineScope.launch { snackbarHostState.showSnackbar(result.message) }
                        }
                        is IntentHelper.OpenResult.FallbackToDeviceInfo,
                        is IntentHelper.OpenResult.GuideRequired -> {
                            showEnablementGuide = true
                        }
                        is IntentHelper.OpenResult.Error -> {
                            showEnablementGuide = true
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    result.message.ifBlank { getString(R.string.settings_open_failed) }
                                )
                            }
                        }
                    }
                }

                MainScreen(
                    uiState = uiState,
                    snackbarHostState = snackbarHostState,
                    isAdsRemoved = isAdsRemoved,
                    adsRemovalEntitlementKnown = adsRemovalEntitlementKnown,
                    onRemoveAds = {
                        billingManager.launchPurchaseFlow(this@MainActivity) { success, msg ->
                            if (!success && msg != null) {
                                coroutineScope.launch {
                                    snackbarHostState.showSnackbar(getString(R.string.play_store_error_format, msg))
                                }
                            }
                        }
                    },
                    onOpenDeveloperOptions = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openDeveloperOptions(this@MainActivity))
                        }
                    },
                    onOpenUsbDebugging = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openUsbDebugging(this@MainActivity))
                        }
                    },
                    onOpenWirelessDebugging = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openWirelessDebugging(this@MainActivity))
                        }
                    },
                    onOpenAboutPhone = {
                        showEnablementGuide = false
                        handleOpenResult(IntentHelper.openAboutPhone(this@MainActivity))
                    },
                    showEnablementGuide = showEnablementGuide,
                    onDismissEnablementGuide = { showEnablementGuide = false },
                    selectedLanguageTag = selectedLanguageTag,
                    onSelectLanguage = { languageTag ->
                        AppLanguageController.selectLanguage(this@MainActivity, languageTag)
                        selectedLanguageTag = AppLanguageController.currentLanguageTag(this@MainActivity)
                        suggestedLanguageTag = AppLanguageController.pendingSuggestion(this@MainActivity)
                    },
                    suggestedLanguageTag = suggestedLanguageTag,
                    onLanguageSuggestionHandled = { acceptedLanguageTag ->
                        AppLanguageController.handleSuggestion(this@MainActivity, acceptedLanguageTag)
                        selectedLanguageTag = AppLanguageController.currentLanguageTag(this@MainActivity)
                        suggestedLanguageTag = null
                    },
                    onShareApp = {
                        val result = IntentHelper.shareApplication(this@MainActivity)
                        if (result is IntentHelper.OpenResult.Error) {
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    result.message.ifBlank { getString(R.string.settings_open_failed) }
                                )
                            }
                        }
                    },
                    onManualRefresh = {
                        recordMeaningfulAction()
                        viewModel.refreshAll()
                        coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.status_updated)) }
                    },
                    activeAppPrompt = activePrompt,
                    onDismissAppPrompt = { dismissPrompt(it) },
                    onUpdateNow = {
                        activePrompt = null
                        if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                    },
                    onOpenInternetSettings = {
                        if (ExternalActions.openNetworkSettings(this@MainActivity)) activePrompt = null
                        else coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.offline_settings_unavailable)) }
                    },
                    onReviewOnGooglePlay = {
                        activePrompt = null
                        promptPrefs.edit().putLong("auto_review_last_request", promptNow).apply()
                        try {
                            val manager = ReviewManagerFactory.create(this@MainActivity)
                            manager.requestReviewFlow().addOnSuccessListener { info ->
                                manager.launchReviewFlow(this@MainActivity, info).addOnCompleteListener { reconcilePrompt() }
                            }.addOnFailureListener {
                                if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                                reconcilePrompt()
                            }
                        } catch (_: Exception) {
                            if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                            reconcilePrompt()
                        }
                    },
                    onShareWithFriends = {
                        activePrompt = null
                        val shareResult = IntentHelper.shareApplication(this@MainActivity)
                        if (shareResult is IntentHelper.OpenResult.Error) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.share_unavailable)) }
                        reconcilePrompt()
                    },
                    onRateOnGooglePlay = {
                        if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                    },
                    shouldRequestAutomaticReview = validatedInternet && PromptPolicy.shouldRequestAutomaticReview(
                        sessionCount, promptPrefs.getInt("meaningful_actions", 0),
                        promptPrefs.getLong("auto_review_last_request", 0L),
                        promptPrefs.getLong("review_prompt_last_shown", 0L), promptNow
                    ),
                    onRequestAutomaticReview = { maybeLaunchAutomaticReview() }
                )
            }
        }
    }

    override fun onDestroy() {
        lifecycle.removeObserver(viewModel)
        super.onDestroy()
    }

    override fun onStart() { super.onStart(); registerConnectivityCallback(); refreshConnectivity() }
    override fun onResume() { super.onResume(); checkPlayUpdateAvailability(); refreshConnectivity(); maybeLaunchAutomaticReview() }
    override fun onStop() {
        networkCallback?.let { try { connectivityManager.unregisterNetworkCallback(it) } catch (_: Exception) {} }
        networkCallback = null
        super.onStop()
    }
    private fun registerConnectivityCallback() {
        if (networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { refreshConnectivity() }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { refreshConnectivity() }
            override fun onLost(network: Network) { refreshConnectivity() }
        }
        networkCallback = callback
        try { connectivityManager.registerDefaultNetworkCallback(callback) } catch (_: Exception) { networkCallback = null }
    }
    private fun refreshConnectivity() {
        val capabilities = try { connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork) } catch (_: Exception) { null }
        validatedInternet = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        runOnUiThread { reconcilePrompt() }
    }
    private fun checkPlayUpdateAvailability() {
        try {
            appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
                updateConfirmedByPlay = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                reconcilePrompt()
            }.addOnFailureListener { updateConfirmedByPlay = false; reconcilePrompt() }
        } catch (_: Exception) { updateConfirmedByPlay = false }
    }
    private fun dismissPrompt(prompt: AppPrompt) {
        if (prompt == AppPrompt.OFFLINE) offlineShownThisSession = true
        if (activePrompt == prompt) activePrompt = null
        reconcilePrompt()
    }
    private fun reconcilePrompt() {
        if (!consentUiResolved || isFinishing || isDestroyed) return

        val now = promptNow
        val selected = PromptPolicy.selectPrompt(
            current = activePrompt,
            consentResolved = consentUiResolved,
            updateConfirmed = updateConfirmedByPlay,
            lastUpdateShown = promptPrefs.getLong("update_prompt_last_shown", 0L),
            validatedInternet = validatedInternet,
            offlineShownThisSession = offlineShownThisSession,
            sessions = sessionCount,
            meaningfulActions = promptPrefs.getInt("meaningful_actions", 0),
            lastReviewPromptShown = promptPrefs.getLong("review_prompt_last_shown", 0L),
            lastAnyPromptShown = promptPrefs.getLong("last_any_prompt_shown", 0L),
            now = now
        )
        if (selected == activePrompt) return

        if (selected != null) {
            val editor = promptPrefs.edit().putLong("last_any_prompt_shown", now)
            when (selected) {
                AppPrompt.UPDATE -> editor.putLong("update_prompt_last_shown", now)
                AppPrompt.OFFLINE -> offlineShownThisSession = true
                AppPrompt.REVIEW -> editor.putLong("review_prompt_last_shown", now)
            }
            editor.apply()
        }
        activePrompt = selected
    }

    private fun recordMeaningfulAction() {
        promptPrefs.edit().putInt("meaningful_actions", promptPrefs.getInt("meaningful_actions", 0) + 1).apply()
    }
    private fun maybeLaunchAutomaticReview() {
        if (!consentUiResolved || isFinishing || isDestroyed || automaticReviewInFlight || activePrompt != null || !validatedInternet) return
        val now = promptNow
        if (!PromptPolicy.shouldRequestAutomaticReview(sessionCount, promptPrefs.getInt("meaningful_actions", 0),
                promptPrefs.getLong("auto_review_last_request", 0L), promptPrefs.getLong("review_prompt_last_shown", 0L), now) ||
            !PromptPolicy.cooldownElapsed(promptPrefs.getLong("last_any_prompt_shown", 0L), now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS)) return
        automaticReviewInFlight = true
        promptPrefs.edit().putLong("auto_review_last_request", now).putLong("last_any_prompt_shown", now).apply()
        try {
            val manager = ReviewManagerFactory.create(this)
            manager.requestReviewFlow().addOnSuccessListener { info ->
                manager.launchReviewFlow(this, info).addOnCompleteListener { automaticReviewInFlight = false }
            }.addOnFailureListener { automaticReviewInFlight = false }
        } catch (_: Exception) { automaticReviewInFlight = false }
    }
}
