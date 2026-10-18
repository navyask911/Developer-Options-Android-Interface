package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguagePolicyTest {
    @Test
    fun supportedLocaleSetMatchesPublishedLocaleSet() {
        assertEquals(setOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi"), LanguagePolicy.supportedLanguageTags)
    }

    @Test
    fun regionalDeviceLocaleMapsToSupportedLanguage() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("ru-RU", "en-US"), "en", false, false))
        assertEquals("es", LanguagePolicy.suggestLanguage(listOf("es-MX"), "en", false, false))
        assertEquals("zh-CN", LanguagePolicy.suggestLanguage(listOf("zh-TW"), "en", false, false))
        assertEquals("bn", LanguagePolicy.suggestLanguage(listOf("bn-BD"), "en", false, false))
        assertEquals("de", LanguagePolicy.suggestLanguage(listOf("de-DE"), "en", false, false))
        assertEquals("id", LanguagePolicy.suggestLanguage(listOf("id-ID"), "en", false, false))
        assertEquals("it", LanguagePolicy.suggestLanguage(listOf("it-IT"), "en", false, false))
        assertEquals("ja", LanguagePolicy.suggestLanguage(listOf("ja-JP"), "en", false, false))
        assertEquals("ko", LanguagePolicy.suggestLanguage(listOf("ko-KR"), "en", false, false))
        assertEquals("pt-BR", LanguagePolicy.suggestLanguage(listOf("pt-BR"), "en", false, false))
        assertEquals("tr", LanguagePolicy.suggestLanguage(listOf("tr-TR"), "en", false, false))
        assertEquals("vi", LanguagePolicy.suggestLanguage(listOf("vi-VN"), "en", false, false))
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
