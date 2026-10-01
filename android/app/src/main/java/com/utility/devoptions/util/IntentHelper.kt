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
     * and OEM custom skins (Samsung, Xiaomi/HyperOS, Huawei, AOSP).
     * If all attempts fail (or developer mode is locked), falls back to About Phone so user can unlock it.
     */
    fun openDeveloperOptions(context: Context): OpenResult {
        // Attempt 1: Standard Android AOSP action
        try {
            val aospIntent = Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (aospIntent.resolveActivity(context.packageManager) != null) {
                context.startActivity(aospIntent)
                return OpenResult.Success
            }
        } catch (_: ActivityNotFoundException) {
            // Proceed to OEM fallbacks
        } catch (e: SecurityException) {
            // Some OEMs protect the standard action
        }

        // Attempt 2: OEM-specific direct component names
        val manufacturer = Build.MANUFACTURER.lowercase()
        val oemIntents = mutableListOf<Intent>()

        // Xiaomi / HyperOS / MIUI
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.Settings\$DevelopmentSettingsDashboardActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Samsung One UI
        if (manufacturer.contains("samsung")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.Settings\$DevelopmentSettingsActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Huawei EMUI / HarmonyOS
        if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Generic fallback components across vendors
        oemIntents.add(
            Intent().apply {
                component = ComponentName("com.android.settings", "com.android.settings.Settings\$DevelopmentSettingsDashboardActivity")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
        oemIntents.add(
            Intent().apply {
                component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )

        for (intent in oemIntents) {
            try {
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    return OpenResult.Success
                }
            } catch (_: Exception) {
                // Keep testing next fallback
            }
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
            OpenResult.Error(e)
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
