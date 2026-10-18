package com.utility.devoptions

import android.app.Application

class DevOptionsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppLanguageController.initialize(this)
    }
}
