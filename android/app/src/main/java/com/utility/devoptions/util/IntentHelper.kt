package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

object IntentHelper {

    sealed class OpenResult {
        data object Success : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class Error(val exception: Throwable) : OpenResult()
    }

    /**
     * Attempts to open Developer Options across diverse Android versions (API 21 - API 35)
     * and OEM custom skins (Oppo, Realme, OnePlus, Samsung, Xiaomi, Huawei, AOSP).
     * By attempting explicit dashboard components first and avoiding resolveActivity checks
     * (which are restricted by package visibility on Android 11+), this bypasses custom OS
     * interceptions that block opening settings when the master developer switch is OFF.
     */
    fun openDeveloperOptions(context: Context): OpenResult {
        val intentsToTry = arrayOf(
            // 1. Direct Dashboard Activity component launch (Oppo, Realme, OnePlus, Xiaomi)
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$DevelopmentSettingsDashboardActivity"
                )
            },
            
            // 2. Direct Development Settings component fallback
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.DevelopmentSettings"
                )
            },

            // 3. Samsung Settings component fallback
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$DevelopmentSettingsActivity"
                )
            },
            
            // 4. Primary standard intent
            Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
        )

        var launchedSuccessfully = false

        for (intent in intentsToTry) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                launchedSuccessfully = true
                break
            } catch (e: Exception) {
                // Continue trying fallbacks
            }
        }

        if (launchedSuccessfully) {
            return OpenResult.Success
        }

        // Final Fallback: Open Device Info ("About Phone") so user can tap Build Number 7 times
        return try {
            val aboutPhoneIntent = Intent(Settings.ACTION_DEVICE_INFO_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(aboutPhoneIntent)
            OpenResult.FallbackToDeviceInfo(
                "Developer Options is not unlocked or unavailable. Opening About Phone: tap 'Build Number' 7 times to enable."
            )
        } catch (e: Exception) {
            try {
                val settingsIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(settingsIntent)
                OpenResult.Success
            } catch (e2: Exception) {
                OpenResult.Error(e2)
            }
        }
    }

    /**
     * Native share sheet to share the application on Google Play Store.
     */
    fun shareApplication(context: Context) {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Dev Options Shortcut for Android")
            putExtra(
                Intent.EXTRA_TEXT,
                "Easily access Developer Options and monitor USB Debugging status on Android: " +
                        "https://play.google.com/store/apps/details?id=${context.packageName}"
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooserIntent = Intent.createChooser(shareIntent, "Share Dev Options Shortcut").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooserIntent)
    }
}
