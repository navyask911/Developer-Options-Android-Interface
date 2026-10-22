package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguagePolicyTest {
    @Test
    fun supportsAllNineteenBundledLocales() {
        assertEquals(
            setOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi", "kn", "ta", "te"),
            LanguagePolicy.supportedLanguageTags
        )
    }

    @Test
    fun normalizesRegionalTagsWithoutCrossingScriptOrPortugueseRegion() {
        assertEquals("es", LanguagePolicy.canonicalSupportedTag("es-MX"))
        assertEquals("hi", LanguagePolicy.canonicalSupportedTag("hi-IN"))
        assertEquals("pt-BR", LanguagePolicy.canonicalSupportedTag("pt-BR"))
        assertNull(LanguagePolicy.canonicalSupportedTag("pt-PT"))
        assertEquals("zh-CN", LanguagePolicy.canonicalSupportedTag("zh-Hans-CN"))
        assertNull(LanguagePolicy.canonicalSupportedTag("zh-TW"))
        assertNull(LanguagePolicy.canonicalSupportedTag("zh-HK"))
        assertEquals("kn", LanguagePolicy.canonicalSupportedTag("kn-IN"))
        assertEquals("ta", LanguagePolicy.canonicalSupportedTag("ta-IN"))
        assertEquals("te", LanguagePolicy.canonicalSupportedTag("te-IN"))
    }

    @Test
    fun suggestionsRespectPreferenceOrderAndConfiguredFallbacks() {
        assertEquals("ta", LanguagePolicy.suggestLanguage(listOf("ta-IN", "hi-IN", "en-IN"), "en", false, false))
        assertEquals("fr", LanguagePolicy.suggestLanguage(listOf("fr-CA", "ar-EG"), "en", false, false))
        assertNull(LanguagePolicy.suggestLanguage(listOf("xx-ZZ"), "en", false, false))
        assertNull(LanguagePolicy.suggestLanguage(listOf("en-US"), "en", false, false))
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", false, true))
        assertNull(LanguagePolicy.suggestLanguage(listOf("ta-IN"), "en", true, false))
    }

    @Test
    fun longFormCanonicalizationAliasMatchesTheMainPolicy() {
        assertEquals("pt-BR", LanguagePolicy.canonicalSupportedLanguageTag("pt-BR"))
        assertEquals("kn", LanguagePolicy.canonicalSupportedLanguageTag("kn-IN"))
        assertNull(LanguagePolicy.canonicalSupportedLanguageTag("zh-TW"))
    }
}
