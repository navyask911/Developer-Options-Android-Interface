package com.utility.devoptions.viewmodel

import android.app.Application
import android.content.ContentResolver
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.viewModelScope
import com.utility.devoptions.data.model.DevStatusUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * ViewModel responsible for reading real-time Android developer settings and device specifications.
 * Implements [DefaultLifecycleObserver] so statuses automatically refresh upon returning to the app in onResume().
 */
class DeveloperOptionsViewModel(application: Application) :
    AndroidViewModel(application), DefaultLifecycleObserver {

    private val _uiState = MutableStateFlow(DevStatusUiState())
    val uiState: StateFlow<DevStatusUiState> = _uiState.asStateFlow()

    init {
        refreshAll()
    }

    /**
     * Called automatically when the Activity enters the foreground (onResume).
     * Instantly updates Developer Options & USB Debugging status without requiring app reload.
     */
    override fun onResume(owner: LifecycleOwner) {
        refreshStatusOnly()
    }

    /**
     * Refreshes both hardware specifications and real-time settings.
     */
    fun refreshAll() {
        viewModelScope.launch {
            val contentResolver = getApplication<Application>().contentResolver
            val (devOptionsOn, isUnlocked) = queryDevelopmentSettings(contentResolver)
            val usbDebuggingOn = queryAdbEnabled(contentResolver)

            val securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Build.VERSION.SECURITY_PATCH
            } else {
                "Not available (< API 23)"
            }

            val cpuAbi = if (Build.SUPPORTED_ABIS.isNotEmpty()) {
                Build.SUPPORTED_ABIS.joinToString(", ")
            } else {
                Build.CPU_ABI ?: "Unknown"
            }

            _uiState.update { current ->
                current.copy(
                    isDeveloperOptionsEnabled = devOptionsOn,
                    isUsbDebuggingEnabled = usbDebuggingOn,
                    isDeveloperOptionsUnlocked = isUnlocked,
                    deviceModel = Build.MODEL ?: "Unknown",
                    manufacturer = Build.MANUFACTURER?.replaceFirstChar { it.uppercase() } ?: "Unknown",
                    brand = Build.BRAND?.replaceFirstChar { it.uppercase() } ?: "Unknown",
                    androidVersion = Build.VERSION.RELEASE ?: "Unknown",
                    apiLevel = Build.VERSION.SDK_INT,
                    buildNumber = Build.DISPLAY ?: Build.ID ?: "Unknown",
                    securityPatch = securityPatch,
                    cpuAbi = cpuAbi,
                    hardware = Build.HARDWARE ?: "Unknown",
                    isLoading = false,
                    lastRefreshedTimestamp = System.currentTimeMillis()
                )
            }
        }
    }

    /**
     * Fast query executed on lifecycle resume.
     */
    fun refreshStatusOnly() {
        viewModelScope.launch {
            val contentResolver = getApplication<Application>().contentResolver
            val (devOptionsOn, isUnlocked) = queryDevelopmentSettings(contentResolver)
            val usbDebuggingOn = queryAdbEnabled(contentResolver)

            _uiState.update { current ->
                current.copy(
                    isDeveloperOptionsEnabled = devOptionsOn,
                    isUsbDebuggingEnabled = usbDebuggingOn,
                    isDeveloperOptionsUnlocked = isUnlocked,
                    lastRefreshedTimestamp = System.currentTimeMillis()
                )
            }
        }
    }

    fun incrementClickCount() {
        _uiState.update { it.copy(clickCount = it.clickCount + 1) }
    }

    fun setUserNotice(message: String?) {
        _uiState.update { it.copy(userNoticeMessage = message) }
    }

    /**
     * Safely queries Settings.Global.DEVELOPMENT_SETTINGS_ENABLED with backwards-compatible fallback.
     * Returns Pair(isEnabled, isUnlocked/queryable).
     */
    private fun queryDevelopmentSettings(resolver: ContentResolver): Pair<Boolean, Boolean> {
        return try {
            val value = Settings.Global.getInt(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0)
            Pair(value == 1, true)
        } catch (_: Settings.SettingNotFoundException) {
            // Setting doesn't exist yet (means Developer Options was never enabled or is locked)
            Pair(false, false)
        } catch (_: SecurityException) {
            // Some restricted OEM profiles
            Pair(false, false)
        } catch (_: Exception) {
            Pair(false, false)
        }
    }

    /**
     * Safely queries Settings.Global.ADB_ENABLED.
     */
    private fun queryAdbEnabled(resolver: ContentResolver): Boolean {
        return try {
            val value = Settings.Global.getInt(resolver, Settings.Global.ADB_ENABLED, 0)
            value == 1
        } catch (_: Exception) {
            false
        }
    }
}
