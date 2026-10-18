package com.utility.devoptions

import android.os.Bundle
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lifecycle.addObserver(viewModel)

        billingManager = BillingManager(applicationContext)
        adManager = (application as DevOptionsApplication).adManager
        adManager.setAdsRemoved(billingManager.isAdsRemoved.value)
        adManager.initializeConsentAndAds(this)

        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isAdsRemoved by billingManager.isAdsRemoved.collectAsState()
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
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openDeveloperOptions(this@MainActivity))
                        }
                    },
                    onOpenUsbDebugging = {
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openUsbDebugging(this@MainActivity))
                        }
                    },
                    onOpenWirelessDebugging = {
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
                        viewModel.refreshAll()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar(getString(R.string.status_updated))
                        }
                    }
                )
            }
        }
    }

    override fun onDestroy() {
        lifecycle.removeObserver(viewModel)
        if (::adManager.isInitialized) adManager.onActivityDestroyed(this)
        super.onDestroy()
    }
}
