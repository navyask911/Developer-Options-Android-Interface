package com.utility.devoptions.data.model

import androidx.compose.runtime.Immutable

/**
 * Immutable UI state model representing current Developer status and Device specifications.
 */
@Immutable
data class DevStatusUiState(
    val isDeveloperOptionsEnabled: Boolean = false,
    val isUsbDebuggingEnabled: Boolean = false,
    val isDeveloperOptionsUnlocked: Boolean = true,
    val deviceModel: String = "",
    val manufacturer: String = "",
    val brand: String = "",
    val androidVersion: String = "",
    val apiLevel: Int = 0,
    val buildNumber: String = "",
    val securityPatch: String = "",
    val cpuAbi: String = "",
    val hardware: String = "",
    val clickCount: Int = 0,
    val isLoading: Boolean = false,
    val userNoticeMessage: String? = null,
    val lastRefreshedTimestamp: Long = System.currentTimeMillis()
)
