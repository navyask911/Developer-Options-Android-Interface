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

    val supportedLanguageTags: Set<String> = LanguagePolicy.supportedLanguageTags

    fun initialize(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val currentlyApplied = AppCompatDelegate.getApplicationLocales()
        if (prefs.getBoolean(KEY_INITIALIZED, false)) {
            if (!currentlyApplied.isEmpty) prefs.edit().remove(KEY_SELECTED_TAG).apply()
            return
        }
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
        require(languageTag == "system" || languageTag in supportedLanguageTags) {
            "Unsupported language tag: $languageTag"
        }
        val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_PENDING_SUGGESTION)
            .putBoolean(KEY_SUGGESTION_HANDLED, true)
        if (languageTag == "system") editor.putString(KEY_SELECTED_TAG, "system")
        else editor.remove(KEY_SELECTED_TAG)
        editor.apply()
        applyLocale(languageTag)
    }

    fun handleSuggestion(context: Context, acceptedLanguageTag: String?) {
        val selected = acceptedLanguageTag?.takeIf { it in supportedLanguageTags } ?: "en"
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_SELECTED_TAG)
            .remove(KEY_PENDING_SUGGESTION).putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
        applyLocale(selected)
    }

    fun pendingSuggestion(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_SUGGESTION_HANDLED, false)) return null
        val pending = prefs.getString(KEY_PENDING_SUGGESTION, null) ?: return null
        if (pending !in supportedLanguageTags) return null
        return pending.takeIf { currentLanguageTag(context) != it }
    }

    fun currentLanguageTag(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_SELECTED_TAG, null) == "system") return "system"
        val locales = AppCompatDelegate.getApplicationLocales()
        if (!locales.isEmpty) {
            return locales[0]?.toLanguageTag()
                ?.let { LanguagePolicy.canonicalSupportedTag(it) } ?: "system"
        }
        return "system"
    }

    private fun applyLocale(languageTag: String) {
        val locales = if (languageTag == "system") LocaleListCompat.getEmptyLocaleList()
        else LocaleListCompat.forLanguageTags(languageTag)
        AppCompatDelegate.setApplicationLocales(locales)
    }
}

/** Pure locale policy with regional-tag fallback; unit-tested without Android framework state. */
object LanguagePolicy {
    val supportedLanguageTags: Set<String> = linkedSetOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi")

    fun canonicalSupportedTag(languageTag: String): String? {
        val requested = Locale.forLanguageTag(languageTag.replace('_', '-'))
        val canonical = requested.toLanguageTag()
        supportedLanguageTags.firstOrNull { it.equals(canonical, ignoreCase = true) }?.let { return it }
        val language = requested.language.lowercase(Locale.ROOT)
        val region = requested.country.uppercase(Locale.ROOT)
        val script = requested.script
        if (language == "zh") {
            if (script.equals("Hant", true) || region in setOf("TW", "HK", "MO")) return null
            if (script.equals("Hans", true) || region == "CN" || region.isBlank()) return "zh-CN"
            return null
        }
        if (language == "pt") {
            if (region == "PT") return null
            if (region == "BR" || region.isBlank()) return "pt-BR"
            return null
        }
        return supportedLanguageTags.firstOrNull { Locale.forLanguageTag(it).language.equals(language, true) }
    }

    fun suggestLanguage(
        preferredLanguageTags: List<String>,
        currentLanguageTag: String,
        hasExplicitLanguagePreference: Boolean,
        alreadyHandled: Boolean
    ): String? {
        if (hasExplicitLanguagePreference || alreadyHandled) return null
        val current = canonicalSupportedTag(currentLanguageTag)
            ?: currentLanguageTag.substringBefore('-').lowercase(Locale.ROOT)
        val candidate = preferredLanguageTags.firstNotNullOfOrNull { canonicalSupportedTag(it) }
        return candidate?.takeIf { !it.equals(current, ignoreCase = true) }
    }
}
