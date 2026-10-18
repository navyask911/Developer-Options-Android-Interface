package com.utility.devoptions
import com.utility.devoptions.util.ExternalActions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
class ExternalActionsPolicyTest {
 @Test fun listingUsesTheExpectedApplicationAndUrls() {
  assertEquals("market://details?id=com.utility.devoptions", ExternalActions.MARKET_URI)
  assertEquals("https://play.google.com/store/apps/details?id=com.utility.devoptions", ExternalActions.HTTPS_URI)
 }
 @Test fun httpsFallbackRunsOnlyIfMarketLaunchFails() {
  var webCalled=false
  assertTrue(ExternalActions.launchWithFallback({true},{webCalled=true;true}))
  assertFalse(webCalled)
  assertTrue(ExternalActions.launchWithFallback({false},{webCalled=true;true}))
  assertTrue(webCalled)
  assertFalse(ExternalActions.launchWithFallback({false},{false}))
 }
}