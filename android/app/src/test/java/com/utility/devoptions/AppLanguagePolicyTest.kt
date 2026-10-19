package com.utility.devoptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
class AppLanguagePolicyTest {
 @Test fun supportsSixteenCompleteLocales() { assertEquals(setOf("en","ru","hi","es","fr","ar","zh-CN","bn","de","id","it","ja","ko","pt-BR","tr","vi"),LanguagePolicy.supportedLanguageTags) }
 @Test fun regionalTagsNeverCrossScriptOrPortugueseRegion() { assertEquals("es",LanguagePolicy.canonicalSupportedTag("es-MX")); assertEquals("hi",LanguagePolicy.canonicalSupportedTag("hi-IN")); assertEquals("pt-BR",LanguagePolicy.canonicalSupportedTag("pt-BR")); assertEquals("zh-CN",LanguagePolicy.canonicalSupportedTag("zh-Hans-CN")); assertNull(LanguagePolicy.canonicalSupportedTag("zh-TW")); assertNull(LanguagePolicy.canonicalSupportedTag("zh-HK")); assertNull(LanguagePolicy.canonicalSupportedTag("pt-PT")) }
 @Test fun suggestionsRespectPreferenceOrderAndHandledState() { assertEquals("hi",LanguagePolicy.suggestLanguage(listOf("ta-IN","hi-IN","en-IN"),"en",false,false)); assertEquals("fr",LanguagePolicy.suggestLanguage(listOf("fr-CA","ar-EG"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("ta-IN","xx-ZZ"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("en-US"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"),"en",false,true)) }
}