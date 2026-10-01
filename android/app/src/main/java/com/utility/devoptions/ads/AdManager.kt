package com.utility.devoptions.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AdManager handles Google AdMob SDK initialization, UMP Consent,
 * and preloads Interstitial Ads with a strict 3-tap frequency cap.
 * Follows Google Play and AdMob Disallowed Implementation policies:
 * never blocks the user from entering Settings, even if ads fail or are dismissed.
 */
class AdManager(private val context: Context) {

    companion object {
        private const val TAG = "AdManager"
        const val APP_ID = "ca-app-pub-4783826505860771~9544574215"
        const val BANNER_ID = "ca-app-pub-4783826505860771/4624168456"
        const val INTERSTITIAL_ID = "ca-app-pub-4783826505860771/6316609796"
        const val TEST_APP_ID = APP_ID
        const val TEST_BANNER_ID = BANNER_ID
        const val TEST_INTERSTITIAL_ID = INTERSTITIAL_ID
        const val INTERSTITIAL_FREQUENCY_CAP = 3
    }

    private var interstitialAd: InterstitialAd? = null
    private var isAdLoading: Boolean = false
    private var clickCounter: Int = 0
    private val isMobileAdsInitializeCalled = AtomicBoolean(false)

    /**
     * Initializes UMP (User Messaging Platform) for GDPR/ePrivacy compliance,
     * and initializes MobileAds on consent completion.
     */
    fun initializeConsentAndAds(activity: Activity, onReady: () -> Unit = {}) {
        val params = ConsentRequestParameters.Builder()
            .setTagForUnderAgeOfConsent(false)
            .build()

        val consentInformation = UserMessagingPlatform.getConsentInformation(activity)
        consentInformation.requestConsentInfoUpdate(
            activity,
            params,
            {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
                    if (formError != null) {
                        Log.w(TAG, "Consent form error: ${formError.message}")
                    }
                    if (consentInformation.canRequestAds()) {
                        initializeMobileAds(onReady)
                    }
                }
            },
            { requestConsentError ->
                Log.w(TAG, "Consent request error: ${requestConsentError.message}")
                if (consentInformation.canRequestAds()) {
                    initializeMobileAds(onReady)
                }
            }
        )

        // Safety fallback: if consent already given previously
        if (consentInformation.canRequestAds()) {
            initializeMobileAds(onReady)
        }
    }

    private fun initializeMobileAds(onReady: () -> Unit) {
        if (isMobileAdsInitializeCalled.getAndSet(true)) {
            return
        }
        MobileAds.initialize(context) { status ->
            Log.d(TAG, "MobileAds initialized: $status")
            preloadInterstitial()
            onReady()
        }
    }

    /**
     * Preloads an interstitial ad in the background.
     */
    fun preloadInterstitial() {
        if (interstitialAd != null || isAdLoading) return

        isAdLoading = true
        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(
            context,
            TEST_INTERSTITIAL_ID,
            adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitialAd = ad
                    isAdLoading = false
                    Log.d(TAG, "Interstitial ad loaded successfully.")
                }

                override fun onAdFailedToLoad(loadAdError: LoadAdError) {
                    interstitialAd = null
                    isAdLoading = false
                    Log.w(TAG, "Interstitial ad failed to load: ${loadAdError.message}")
                }
            }
        )
    }

    /**
     * Intercepts action button clicks:
     * - Increments click counter
     * - If clickCount % 3 == 0 and ad is ready, displays the interstitial
     * - Automatically proceeds with [onProceed] whether the ad is dismissed, fails to show, or is not ready
     * - Strict fail-open guarantee: [onProceed] is ALWAYS executed.
     */
    fun handleActionClick(activity: Activity, onProceed: () -> Unit) {
        clickCounter++
        val shouldShowAd = (clickCounter % INTERSTITIAL_FREQUENCY_CAP == 0)

        val currentAd = interstitialAd
        if (shouldShowAd && currentAd != null) {
            currentAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    interstitialAd = null
                    preloadInterstitial()
                    onProceed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                    Log.w(TAG, "Interstitial failed to show: ${adError.message}")
                    interstitialAd = null
                    preloadInterstitial()
                    onProceed()
                }

                override fun onAdShowedFullScreenContent() {
                    Log.d(TAG, "Interstitial showed successfully.")
                }
            }
            currentAd.show(activity)
        } else {
            // Not every tap shows an ad, or ad is still loading -> immediately execute action!
            if (interstitialAd == null && !isAdLoading) {
                preloadInterstitial()
            }
            onProceed()
        }
    }
}
