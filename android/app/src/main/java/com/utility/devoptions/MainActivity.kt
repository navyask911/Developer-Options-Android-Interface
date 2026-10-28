package com.utility.devoptions

import android.os.Bundle
import android.util.Log
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
import androidx.lifecycle.lifecycleScope
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first

class MainActivity : AppCompatActivity() {
    companion object { private const val TAG = "MainActivity" }
    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private val adManager: AdManager by lazy(LazyThreadSafetyMode.NONE) {
        (application as DevOptionsApplication).adManager
    }
    private lateinit var billingManager: BillingManager
    private lateinit var appUpdateManager: AppUpdateManager
    private var connectivityManager: ConnectivityManager? = null
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
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        // BillingManager now performs keystore/cache reads on Dispatchers.IO.
        billingManager = BillingManager(applicationContext)
        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isAdsRemoved by billingManager.isAdsRemoved.collectAsState()
                val isAdsCacheLoaded by billingManager.cacheLoaded.collectAsState()
                val adsRemovalEntitlementKnown by billingManager.adsRemovalEntitlementKnown.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()
                var showEnablementGuide by remember { mutableStateOf(false) }
                var selectedLanguageTag by remember {
                    mutableStateOf(runCatching { AppLanguageController.currentLanguageTag(this@MainActivity) }.getOrDefault("system"))
                }
                var suggestedLanguageTag by remember {
                    mutableStateOf(runCatching { AppLanguageController.pendingSuggestion(this@MainActivity) }.getOrNull())
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
                    isAdsCacheLoaded = isAdsCacheLoaded,
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
                    shouldRequestAutomaticReview = sessionCount > 0 && validatedInternet && PromptPolicy.shouldRequestAutomaticReview(
                        sessionCount, promptPrefs.getInt("meaningful_actions", 0),
                        promptPrefs.getLong("auto_review_last_request", 0L),
                        promptPrefs.getLong("review_prompt_last_shown", 0L), promptNow
                    ),
                    onRequestAutomaticReview = { maybeLaunchAutomaticReview() }
                )
            }
        }

        // Optional network and ad SDK work is not part of the critical startup path.
        window.decorView.post {
            if (!isFinishing && !isDestroyed) initializeOptionalServices()
        }
        lifecycleScope.launch(Dispatchers.IO) {
            val count = try {
                val state = promptPrefs
                val value = state.getInt("session_count", 0).coerceAtLeast(0) + 1
                state.edit().putInt("session_count", value).apply()
                value
            } catch (e: Exception) {
                Log.w(TAG, "Cannot read prompt session count", e)
                1
            }
            withContext(Dispatchers.Main) {
                if (!isDestroyed) {
                    sessionCount = count
                    reconcilePrompt()
                }
            }
        }
    }

    private fun initializeOptionalServices() {
        try {
            appUpdateManager = AppUpdateManagerFactory.create(this)
            checkPlayUpdateAvailability()
        } catch (e: Exception) {
            Log.w(TAG, "Play update service unavailable", e)
        }
        lifecycleScope.launch {
            // Avoid a banner or ad request before we have loaded the local purchase cache.
            billingManager.cacheLoaded.first { it }
            if (isFinishing || isDestroyed) return@launch
            try {
                adManager.setAdsRemoved(billingManager.isAdsRemoved.value)
                adManager.initializeConsentAndAds(this@MainActivity, {}, onConsentFlowComplete = {
                    runOnUiThread {
                        if (!isDestroyed) {
                            consentUiResolved = true
                            reconcilePrompt()
                        }
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "Ad/consent SDK startup failed; app remains usable", e)
                consentUiResolved = true
                reconcilePrompt()
            }
        }
    }

    override fun onDestroy() {
        if (::billingManager.isInitialized) billingManager.close()
        runCatching { adManager.onActivityDestroyed(this) }
            .onFailure { Log.w(TAG, "Ad cleanup failed", it) }
        lifecycle.removeObserver(viewModel)
        super.onDestroy()
    }

    override fun onStart() { super.onStart(); registerConnectivityCallback(); refreshConnectivity() }
    override fun onResume() { super.onResume(); checkPlayUpdateAvailability(); refreshConnectivity(); maybeLaunchAutomaticReview() }
    override fun onStop() {
        networkCallback?.let { callback ->
            try { connectivityManager?.unregisterNetworkCallback(callback) }
            catch (e: Exception) { Log.w(TAG, "Network callback cleanup failed", e) }
        }
        networkCallback = null
        super.onStop()
    }
    private fun registerConnectivityCallback() {
        val manager = connectivityManager ?: return
        if (networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { refreshConnectivity() }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { refreshConnectivity() }
            override fun onLost(network: Network) { refreshConnectivity() }
        }
        networkCallback = callback
        try { manager.registerDefaultNetworkCallback(callback) }
        catch (e: Exception) {
            Log.w(TAG, "Network registration failed", e)
            networkCallback = null
        }
    }
    private fun refreshConnectivity() {
        val manager = connectivityManager ?: return
        val capabilities = try { manager.getNetworkCapabilities(manager.activeNetwork) }
            catch (e: Exception) { Log.w(TAG, "Network status unavailable", e); null }
        runOnUiThread {
            if (!isDestroyed) {
                validatedInternet = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
                reconcilePrompt()
            }
        }
    }
    private fun checkPlayUpdateAvailability() {
        if (!::appUpdateManager.isInitialized) return
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
        if (!consentUiResolved || sessionCount <= 0 || isFinishing || isDestroyed) return

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
        if (!consentUiResolved || sessionCount <= 0 || isFinishing || isDestroyed || automaticReviewInFlight || activePrompt != null || !validatedInternet) return
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
