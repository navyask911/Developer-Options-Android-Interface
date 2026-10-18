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
        assertNull(LanguagePolicy.suggestLanguage(listOf("it-IT"), "en", false, false))
    }

    @Test
    fun mayUseNextPreferredSupportedLanguageWhenPrimaryLanguageIsUnsupported() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("xx-ZZ", "ru-RU"), "en", false, false))
    }

    @Test
    fun supportsRegionalTagsAndReturnsConfiguredLocaleTag() {
        assertEquals("pt-BR", LanguagePolicy.canonicalSupportedLanguageTag("pt-BR"))
        assertEquals("pt-BR", LanguagePolicy.canonicalSupportedLanguageTag("pt-PT"))
        assertEquals("zh-CN", LanguagePolicy.canonicalSupportedLanguageTag("zh-TW"))
        assertEquals("hi", LanguagePolicy.canonicalSupportedLanguageTag("hi-IN"))
    }

    @Test
    fun suggestsFirstSupportedLanguageFromTheDeviceLocaleList() {
        assertEquals("hi", LanguagePolicy.suggestLanguage(listOf("xx-ZZ", "hi-IN"), "en", false, false))
        assertEquals("pt-BR", LanguagePolicy.suggestLanguage(listOf("pt-PT", "en-US"), "en", false, false))
    }

    @Test
    fun unsupportedLanguageIsNotAccepted() {
        assertNull(LanguagePolicy.canonicalSupportedLanguageTag("it-IT"))
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
