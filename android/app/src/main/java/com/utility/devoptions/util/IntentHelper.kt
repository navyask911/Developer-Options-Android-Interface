package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.utility.devoptions.R

/** Public Android Settings intent routing. This helper never changes protected system settings. */
object IntentHelper {
    sealed class OpenResult {
        data object Success : OpenResult()
        data class SuccessWithMessage(val message: String) : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class GuideRequired(val reason: String) : OpenResult()
        data class Error(val exception: Throwable, val message: String = exception.localizedMessage ?: "") : OpenResult()
    }

    /** Launch Developer Options only when the system reports it enabled or its state is unknown. */
    fun openDeveloperOptions(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        return if (tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) == null) {
            OpenResult.Success
        } else {
            OpenResult.GuideRequired(context.getString(R.string.developer_options_unavailable_guide))
        }
    }

    fun openUsbDebugging(context: Context): OpenResult =
        when (val result = openDeveloperOptions(context)) {
            OpenResult.Success -> OpenResult.SuccessWithMessage(context.getString(R.string.usb_debugging_guidance))
            is OpenResult.GuideRequired -> result
            is OpenResult.Error -> result
            is OpenResult.FallbackToDeviceInfo -> result
            is OpenResult.SuccessWithMessage -> result
        }

    /** There is no verified public Wireless Debugging intent; use the standard Settings destinations. */
    fun openWirelessDebugging(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        val developmentFailure = tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
        if (developmentFailure == null) {
            val messageRes = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                R.string.wireless_debugging_guidance
            } else {
                R.string.wireless_debugging_unavailable
            }
            return OpenResult.SuccessWithMessage(context.getString(messageRes))
        }
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.wireless_debugging_fallback_guidance))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun openAboutPhone(context: Context): OpenResult {
        val aboutFailure = tryStart(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
        if (aboutFailure == null) return OpenResult.Success
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.about_phone_fallback_settings))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun shareApplication(context: Context): OpenResult {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.share_subject))
            putExtra(Intent.EXTRA_TEXT, context.getString(R.string.share_message, "com.utility.devoptions"))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(shareIntent, context.getString(R.string.share_app)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(chooser)
            OpenResult.Success
        } catch (e: ActivityNotFoundException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: SecurityException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: IllegalArgumentException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        }
    }

    private fun developmentSettingsEnabled(context: Context): Boolean? = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1
    } catch (_: Settings.SettingNotFoundException) {
        null
    } catch (_: SecurityException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    /** Returns null only when Android accepted the intent. */
    private fun tryStart(context: Context, intent: Intent): Throwable? = try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        e
    } catch (e: SecurityException) {
        e
    } catch (e: IllegalArgumentException) {
        e
    }
}
