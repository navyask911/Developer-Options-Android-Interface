package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.widget.Toast

object IntentHelper {

    sealed class OpenResult {
        data object Success : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class Error(val exception: Throwable) : OpenResult()
    }

    /**
     * Attempts to open Developer Options across diverse Android versions (API 21 - API 35)
     * and OEM custom skins (Oppo, Realme, OnePlus, Samsung, Xiaomi, Huawei, AOSP).
     * If Developer Options are disabled (OFF), it proactively redirects the user to the
     * build/version info screen to tap 'Version No.' 7 times, avoiding native OS intercepts.
     */
    fun openDeveloperOptions(context: Context): OpenResult {
        // Query the state of development settings to know if developer options is currently ON
        val isDevEnabled = try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1
        } catch (_: Exception) {
            false
        }

        if (!isDevEnabled) {
            // Target the OnePlus/OPPO Version screen component, falling back to ACTION_DEVICE_INFO_SETTINGS
            val buildIntentsToTry = arrayOf(
                // 1. OnePlus/OPPO Version Screen (AboutDeviceVersionActivity)
                Intent().apply {
                    component = ComponentName(
                        "com.android.settings",
                        "com.oplus.settings.feature.deviceinfo.AboutDeviceVersionActivity"
                    )
                },
                // 2. Alternate package container for OnePlus/OPPO Settings
                Intent().apply {
                    component = ComponentName(
                        "com.oplus.settings",
                        "com.oplus.settings.feature.deviceinfo.AboutDeviceVersionActivity"
                    )
                },
                // 3. Fallback to standard Device Info/About Phone Settings
                Intent(Settings.ACTION_DEVICE_INFO_SETTINGS)
            )

            var launchedVersionPage = false
            for (intent in buildIntentsToTry) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    launchedVersionPage = true
                    break
                } catch (_: Exception) {
                    // Try next fallback
                }
            }

            if (launchedVersionPage) {
                try {
                    Toast.makeText(
                        context,
                        "Please tap 'Version No.' 7 times to enable Developer Options!",
                        Toast.LENGTH_LONG
                    ).show()
                } catch (_: Exception) {}
                return OpenResult.FallbackToDeviceInfo("Please tap 'Version No.' 7 times to enable Developer Options!")
            }
        }

        // If developer options is already enabled (ON), launch the settings page directly
        val intentsToTry = arrayOf(
            // 1. Primary standard intent
            Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS),

            // 2. Direct Dashboard Activity component launch fallback
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$DevelopmentSettingsDashboardActivity"
                )
            },
            
            // 3. Direct Development Settings component fallback
            Intent().apply {
                component = ComponentName(
                    "com.android.settings",
                    "com.android.settings.DevelopmentSettings"
                )
            }
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
                "Please tap 'Version No.' 7 times to enable Developer Options!"
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
