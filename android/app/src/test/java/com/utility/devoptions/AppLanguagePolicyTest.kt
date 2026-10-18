package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguagePolicyTest {
    @Test
    fun supportedLocaleSetMatchesPublishedLocaleSet() {
        assertEquals(setOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN"), LanguagePolicy.supportedLanguageTags)
    }

    @Test
    fun regionalDeviceLocaleMapsToSupportedLanguage() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("ru-RU", "en-US"), "en", false, false))
        assertEquals("es", LanguagePolicy.suggestLanguage(listOf("es-MX"), "en", false, false))
        assertEquals("zh-CN", LanguagePolicy.suggestLanguage(listOf("zh-TW"), "en", false, false))
    }

    @Test
    fun choosesFirstSupportedLocaleInDevicePreferenceOrder() {
        assertEquals("hi", LanguagePolicy.suggestLanguage(listOf("ta-IN", "hi-IN", "en-IN"), "en", false, false))
        assertEquals("fr", LanguagePolicy.suggestLanguage(listOf("fr-CA", "ar-EG"), "en", false, false))
    }

    @Test
    fun doesNotSuggestSameLanguageOrWhenAlreadyHandled() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("en-US"), "en", false, false))
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", false, true))
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", true, false))
    }

    @Test
    fun unsupportedLocalesAreNotOfferedInThePickerPolicy() {
        assertNull(LanguagePolicy.canonicalSupportedTag("pt-BR"))
        assertNull(LanguagePolicy.suggestLanguage(listOf("pt-BR"), "en", false, false))
    }
}
