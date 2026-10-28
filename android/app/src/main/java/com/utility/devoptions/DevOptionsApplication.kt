package com.utility.devoptions

import android.app.Application
import android.util.Log
import com.utility.devoptions.ads.AdManager

class DevOptionsApplication : Application() {
    /** Keeps ad and consent state stable across locale-driven Activity recreation. */
    val adManager: AdManager by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        AdManager(applicationContext)
    }

    override fun onCreate() {
        super.onCreate()
        try {
            AppLanguageController.initialize(this)
        } catch (e: Exception) {
            Log.e("DevOptionsApplication", "Locale initialization unavailable", e)
        }
    }
}
