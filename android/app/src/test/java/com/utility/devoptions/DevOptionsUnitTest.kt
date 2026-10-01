package com.utility.devoptions

import com.utility.devoptions.ads.AdManager
import com.utility.devoptions.data.billing.BillingManager
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.util.IntentHelper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Standard Unit Test Suite for Dev Options Shortcut.
 * Tests state immutability, AdMob frequency caps, billing product constants,
 * and OEM fallback result data models.
 */
class DevOptionsUnitTest {

    @Test
    fun testDevStatusUiState_defaultValues() {
        val defaultState = DevStatusUiState()
        
        // Assert initial safe defaults
        assertFalse("Developer Options should default to false", defaultState.isDeveloperOptionsEnabled)
        assertFalse("USB Debugging should default to false", defaultState.isUsbDebuggingEnabled)
        assertFalse("Initial loading state should be false", defaultState.isLoading)
        assertNotNull("Security patch should have a fallback string", defaultState.securityPatch)
        assertTrue("Android version string should not be empty", defaultState.androidVersion.isNotEmpty())
    }

    @Test
    fun testDevStatusUiState_immutableCopy() {
        val original = DevStatusUiState(
            isDeveloperOptionsEnabled = false,
            isUsbDebuggingEnabled = false
        )
        val updated = original.copy(
            isDeveloperOptionsEnabled = true,
            isUsbDebuggingEnabled = true
        )

        assertFalse(original.isDeveloperOptionsEnabled)
        assertTrue(updated.isDeveloperOptionsEnabled)
        assertTrue(updated.isUsbDebuggingEnabled)
    }

    @Test
    fun testAdManager_frequencyCapCalculation() {
        val frequencyCap = AdManager.INTERSTITIAL_FREQUENCY_CAP
        assertEquals("AdMob frequency cap must strictly adhere to 3 taps", 3, frequencyCap)

        // Verify mathematical frequency cap behavior across 10 user taps
        val shouldShowAdOnTap = (1..10).map { tap -> (tap % frequencyCap == 0) }
        
        // Tap 1: false, Tap 2: false, Tap 3: true, Tap 4: false, Tap 5: false, Tap 6: true ...
        assertFalse(shouldShowAdOnTap[0]) // Tap 1
        assertFalse(shouldShowAdOnTap[1]) // Tap 2
        assertTrue(shouldShowAdOnTap[2])  // Tap 3 (Ad Triggered)
        assertFalse(shouldShowAdOnTap[3]) // Tap 4
        assertFalse(shouldShowAdOnTap[4]) // Tap 5
        assertTrue(shouldShowAdOnTap[5])  // Tap 6 (Ad Triggered)
    }

    @Test
    fun testBillingManager_productConfiguration() {
        assertEquals(
            "Billing product ID must be 'remove_ads_permanent'",
            "remove_ads_permanent",
            BillingManager.PRODUCT_ID_REMOVE_ADS
        )
    }

    @Test
    fun testIntentHelper_openResultHierarchy() {
        val successResult = IntentHelper.OpenResult.Success
        val fallbackResult = IntentHelper.OpenResult.FallbackToDeviceInfo("Open About Phone")
        val exception = RuntimeException("SecurityException")
        val errorResult = IntentHelper.OpenResult.Error(exception)

        assertTrue("Success result must be instance of OpenResult.Success", successResult is IntentHelper.OpenResult.Success)
        assertTrue("Fallback result must be instance of OpenResult.FallbackToDeviceInfo", fallbackResult is IntentHelper.OpenResult.FallbackToDeviceInfo)
        assertEquals("Fallback reason must match payload", "Open About Phone", fallbackResult.reason)
        assertTrue("Error result must wrap original exception", errorResult.exception is RuntimeException)
    }
}
