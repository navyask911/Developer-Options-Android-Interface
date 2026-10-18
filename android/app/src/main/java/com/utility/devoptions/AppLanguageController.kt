package com.utility.devoptions

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

/** Centralized per-app locale and first-launch language suggestion policy. */
object AppLanguageController {
    private const val PREFS_NAME = "app_language_preferences"
    private const val KEY_INITIALIZED = "initialized"
    private const val KEY_SELECTED_TAG = "selected_language_tag"
    private const val KEY_PENDING_SUGGESTION = "pending_language_suggestion"
    private const val KEY_SUGGESTION_HANDLED = "language_suggestion_handled"

    val supportedLanguageTags: Set<String> get() = LanguagePolicy.supportedLanguageTags

    fun initialize(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val currentlyApplied = AppCompatDelegate.getApplicationLocales()
        // Preserve an unhandled suggestion if Android kills the process before the dialog appears.
        if (prefs.getBoolean(KEY_INITIALIZED, false)) {
            if (!currentlyApplied.isEmpty) prefs.edit().remove(KEY_SELECTED_TAG).apply()
            return
        }
        // Respect a locale selected outside the app before first launch.
        if (!currentlyApplied.isEmpty) {
            prefs.edit().remove(KEY_SELECTED_TAG).putBoolean(KEY_INITIALIZED, true)
                .putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
            return
        }
        if (prefs.getString(KEY_SELECTED_TAG, null) == "system") {
            prefs.edit().remove(KEY_PENDING_SUGGESTION).putBoolean(KEY_INITIALIZED, true)
                .putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
            return
        }
        val preferredTags = LocaleListCompat.getAdjustedDefault().toLanguageTags()
            .split(',').filter { it.isNotBlank() }
        val suggestion = LanguagePolicy.suggestLanguage(
            preferredLanguageTags = preferredTags,
            currentLanguageTag = "en",
            hasExplicitLanguagePreference = false,
            alreadyHandled = false
        )
        prefs.edit().putBoolean(KEY_INITIALIZED, true).putString(KEY_PENDING_SUGGESTION, suggestion)
            .putBoolean(KEY_SUGGESTION_HANDLED, suggestion == null).apply()
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("en"))
    }

    fun selectLanguage(context: Context, languageTag: String) {
        val normalizedTag = if (languageTag == "system") {
            "system"
        } else {
            LanguagePolicy.canonicalSupportedLanguageTag(languageTag)
                ?: throw IllegalArgumentException("Unsupported language tag: $languageTag")
        }
        val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_PENDING_SUGGESTION)
            .putBoolean(KEY_SUGGESTION_HANDLED, true)
        if (normalizedTag == "system") editor.putString(KEY_SELECTED_TAG, "system")
        else editor.remove(KEY_SELECTED_TAG)
        editor.apply()
        applyLocale(normalizedTag)
    }

    fun handleSuggestion(context: Context, acceptedLanguageTag: String?) {
        val selected = acceptedLanguageTag?.let(LanguagePolicy::canonicalSupportedLanguageTag) ?: "en"
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_SELECTED_TAG)
            .remove(KEY_PENDING_SUGGESTION).putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
        applyLocale(selected)
    }

    fun pendingSuggestion(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_SUGGESTION_HANDLED, false)) return null
        val pending = prefs.getString(KEY_PENDING_SUGGESTION, null) ?: return null
        val supportedPending = LanguagePolicy.canonicalSupportedLanguageTag(pending) ?: return null
        return supportedPending.takeIf { currentLanguageTag(context) != it }
    }

    fun currentLanguageTag(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_SELECTED_TAG, null) == "system") return "system"
        val locales = AppCompatDelegate.getApplicationLocales()
        if (!locales.isEmpty) {
            val tag = locales[0]?.toLanguageTag()
            if (tag != null) {
                LanguagePolicy.canonicalSupportedLanguageTag(tag)?.let { return it }
            }
        }
        return "system"
    }

    private fun applyLocale(languageTag: String) {
        val locales = if (languageTag == "system") LocaleListCompat.getEmptyLocaleList()
        else LocaleListCompat.forLanguageTags(languageTag)
        AppCompatDelegate.setApplicationLocales(locales)
    }
}

/** Pure policy unit-tested independently of Android framework state. */
object LanguagePolicy {
    // Keep this list synchronized with locale_config.xml, the language picker, and values-* resources.
    val supportedLanguageTags: Set<String> = linkedSetOf(
        "en", "ru", "hi", "es", "fr", "ar", "pt-BR", "de", "ja", "zh-CN", "kn", "ta", "te"
    )

    fun canonicalSupportedLanguageTag(languageTag: String): String? {
        val requested = Locale.forLanguageTag(languageTag).toLanguageTag()
        return supportedLanguageTags.firstOrNull { it.equals(requested, ignoreCase = true) }
            ?: supportedLanguageTags.firstOrNull {
                it.substringBefore('-').equals(requested.substringBefore('-'), ignoreCase = true)
            }
    }

    fun suggestLanguage(
        preferredLanguageTags: List<String>,
        currentLanguageTag: String,
        hasExplicitLanguagePreference: Boolean,
        alreadyHandled: Boolean
    ): String? {
        if (hasExplicitLanguagePreference || alreadyHandled) return null
        val current = canonicalSupportedLanguageTag(currentLanguageTag)
            ?: currentLanguageTag.lowercase(Locale.ROOT)
        val candidate = preferredLanguageTags.asSequence()
            .mapNotNull(::canonicalSupportedLanguageTag)
            .firstOrNull()
        return candidate?.takeIf { !it.equals(current, ignoreCase = true) }
    }
}
