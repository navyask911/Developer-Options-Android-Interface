package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguagePolicyTest {
    @Test
    fun suggestsSupportedRussianWhenDevicePrefersRussianAndAppUsesEnglish() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("ru-RU", "en-US"), "en", false, false))
    }

    @Test
    fun doesNotSuggestWhenPrimarySupportedDeviceLanguageMatchesCurrentLanguage() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("en-US", "ru-RU"), "en", false, false))
    }

    @Test
    fun doesNotSuggestUnsupportedLanguage() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", false, false))
    }

    @Test
    fun mayUseNextPreferredSupportedLanguageWhenPrimaryLanguageIsUnsupported() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("fr-FR", "ru-RU"), "en", false, false))
    }

    @Test
    fun explicitPreferenceSuppressesSuggestion() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("ru-RU"), "en", true, false))
    }

    @Test
    fun handledSuggestionIsNotShownAgain() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("ru-RU"), "en", false, true))
    }
}
