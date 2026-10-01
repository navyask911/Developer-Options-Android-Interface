package com.utility.devoptions

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import com.utility.devoptions.ads.AdManager
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import com.utility.devoptions.util.IntentHelper
import com.utility.devoptions.viewmodel.DeveloperOptionsViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private lateinit var adManager: AdManager

    override fun onCreate(savedInstanceState: Bundle?) {
        // Enforce modern Edge-to-Edge across Android 15 down to Android 5.0
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Register ViewModel as lifecycle observer to trigger onResume auto-refresh
        lifecycle.addObserver(viewModel)

        // Initialize AdMob & UMP Consent
        adManager = AdManager(applicationContext)
        adManager.initializeConsentAndAds(this)

        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()

                MainScreen(
                    uiState = uiState,
                    snackbarHostState = snackbarHostState,
                    onOpenDeveloperOptions = {
                        viewModel.incrementClickCount()
                        // AdMob frequency cap: triggers ad every 3rd tap, with fail-open guarantee
                        adManager.handleActionClick(this@MainActivity) {
                            when (val result = IntentHelper.openDeveloperOptions(this@MainActivity)) {
                                is IntentHelper.OpenResult.Success -> {
                                    // Successfully dispatched intent to Developer Options
                                }
                                is IntentHelper.OpenResult.FallbackToDeviceInfo -> {
                                    coroutineScope.launch {
                                        snackbarHostState.showSnackbar(result.reason)
                                    }
                                }
                                is IntentHelper.OpenResult.Error -> {
                                    coroutineScope.launch {
                                        snackbarHostState.showSnackbar(
                                            "Could not open Settings: ${result.exception.localizedMessage ?: "Unknown error"}"
                                        )
                                    }
                                }
                            }
                        }
                    },
                    onShareApp = {
                        IntentHelper.shareApplication(this@MainActivity)
                    },
                    onManualRefresh = {
                        viewModel.refreshAll()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Developer status and device diagnostics updated.")
                        }
                    }
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        lifecycle.removeObserver(viewModel)
    }
}
