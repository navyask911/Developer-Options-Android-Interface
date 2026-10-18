package com.utility.devoptions

import android.app.Application
import com.utility.devoptions.ads.AdManager

class DevOptionsApplication : Application() {
    /**
     * Keep consent/ad lifecycle state stable across AppCompat locale-driven Activity recreation.
     * AdManager receives only application context for SDK initialization; UMP form presentation
     * uses the current, live Activity supplied to initializeConsentAndAds().
     */
    val adManager: AdManager by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AdManager(applicationContext)
    }

    override fun onCreate() {
        super.onCreate()
        AppLanguageController.initialize(this)
    }
}
