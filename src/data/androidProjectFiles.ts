export interface AndroidFile {
  path: string;
  name: string;
  category: 'gradle' | 'manifest' | 'kotlin' | 'res' | 'docs';
  language: 'kotlin' | 'groovy' | 'xml' | 'toml' | 'properties' | 'markdown';
  content: string;
  description: string;
}

export const ANDROID_FILES: AndroidFile[] = [
  {
    path: 'build.gradle.kts',
    name: 'build.gradle.kts (Root)',
    category: 'gradle',
    language: 'kotlin',
    description: 'Top-level Gradle build configuration with Android & Kotlin Compose plugins',
    content: `// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
`
  },
  {
    path: 'settings.gradle.kts',
    name: 'settings.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    description: 'Plugin and dependency repository definitions with Google and MavenCentral',
    content: `pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\\\.android.*")
                includeGroupByRegex("com\\\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DevOptionsShortcut"
include(":app")
`
  },
  {
    path: 'gradle/libs.versions.toml',
    name: 'libs.versions.toml',
    category: 'gradle',
    language: 'toml',
    description: 'Modern version catalog for clean Gradle dependency management',
    content: `[versions]
agp = "8.7.2"
kotlin = "2.0.21"
coreKtx = "1.15.0"
lifecycleRuntimeKtx = "2.8.7"
activityCompose = "1.9.3"
composeBom = "2024.11.00"
material3 = "1.3.1"
playServicesAds = "23.6.0"
userMessagingPlatform = "3.1.0"
coroutines = "1.9.0"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycleRuntimeKtx" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycleRuntimeKtx" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-ui-graphics = { group = "androidx.compose.ui", name = "ui-graphics" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3", version.ref = "material3" }
androidx-compose-material-icons-extended = { group = "androidx.compose.material", name = "material-icons-extended" }
play-services-ads = { group = "com.google.android.gms", name = "play-services-ads", version.ref = "playServicesAds" }
user-messaging-platform = { group = "com.google.android.ump", name = "user-messaging-platform", version.ref = "userMessagingPlatform" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
`
  },
  {
    path: 'gradle.properties',
    name: 'gradle.properties',
    category: 'gradle',
    language: 'properties',
    description: 'JVM arguments and AndroidX build optimization flags',
    content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`
  },
  {
    path: 'app/build.gradle.kts',
    name: 'app/build.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    description: 'App module configuration: compileSdk 35, minSdk 21, Compose, and AdMob 23.6.0',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.utility.devoptions"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.utility.devoptions"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)

    // Google Mobile Ads & UMP Consent
    implementation(libs.play.services.ads)
    implementation(libs.user.messaging.platform)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
`
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    name: 'AndroidManifest.xml',
    category: 'manifest',
    language: 'xml',
    description: 'Android manifest with INTERNET permissions, AdMob App ID meta-data, and exported activity',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Network permissions for Google Mobile Ads & Play Store redirect -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.DevOptions"
        tools:targetApi="35">

        <!-- Google AdMob Production Application ID -->
        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-4783826505860771~9544574215" />

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/Theme.DevOptions"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/MainActivity.kt',
    name: 'MainActivity.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'ComponentActivity with edge-to-edge, lifecycle observer, AdMob preloading, and 3-tap frequency cap',
    content: `package com.utility.devoptions

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import com.utility.devoptions.ads.AdManager
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import com.utility.devoptions.util.IntentHelper
import com.utility.devoptions.viewmodel.DeveloperOptionsViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private lateinit var adManager: AdManager

    override fun onCreate(savedInstanceState: Bundle?) {
        // Enforce modern Edge-to-Edge across Android 15 down to Android 5.0
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // Register ViewModel as lifecycle observer to trigger onResume auto-refresh
        lifecycle.addObserver(viewModel)

        // Initialize AdMob & UMP Consent
        adManager = AdManager(applicationContext)
        adManager.initializeConsentAndAds(this)

        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()

                MainScreen(
                    uiState = uiState,
                    snackbarHostState = snackbarHostState,
                    onOpenDeveloperOptions = {
                        viewModel.incrementClickCount()
                        // AdMob frequency cap: triggers ad every 3rd tap, with fail-open guarantee
                        adManager.handleActionClick(this@MainActivity) {
                            when (val result = IntentHelper.openDeveloperOptions(this@MainActivity)) {
                                is IntentHelper.OpenResult.Success -> {
                                    // Successfully dispatched intent to Developer Options
                                }
                                is IntentHelper.OpenResult.FallbackToDeviceInfo -> {
                                    coroutineScope.launch {
                                        snackbarHostState.showSnackbar(result.reason)
                                    }
                                }
                                is IntentHelper.OpenResult.Error -> {
                                    coroutineScope.launch {
                                        snackbarHostState.showSnackbar(
                                            "Could not open Settings: \${result.exception.localizedMessage ?: "Unknown error"}"
                                        )
                                    }
                                }
                            }
                        }
                    },
                    onShareApp = {
                        IntentHelper.shareApplication(this@MainActivity)
                    },
                    onManualRefresh = {
                        viewModel.refreshAll()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Developer status and device diagnostics updated.")
                        }
                    }
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        lifecycle.removeObserver(viewModel)
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/viewmodel/DeveloperOptionsViewModel.kt',
    name: 'DeveloperOptionsViewModel.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'StateFlow ViewModel querying Settings.Global and system hardware specs with onResume lifecycle refresh',
    content: `package com.utility.devoptions.viewmodel

import android.app.Application
import android.content.ContentResolver
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.viewModelScope
import com.utility.devoptions.data.model.DevStatusUiState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * ViewModel responsible for reading real-time Android developer settings and device specifications.
 * Implements [DefaultLifecycleObserver] so statuses automatically refresh upon returning to the app in onResume().
 */
class DeveloperOptionsViewModel(application: Application) :
    AndroidViewModel(application), DefaultLifecycleObserver {

    private val _uiState = MutableStateFlow(DevStatusUiState())
    val uiState: StateFlow<DevStatusUiState> = _uiState.asStateFlow()

    init {
        refreshAll()
    }

    /**
     * Called automatically when the Activity enters the foreground (onResume).
     * Instantly updates Developer Options & USB Debugging status without requiring app reload.
     */
    override fun onResume(owner: LifecycleOwner) {
        refreshStatusOnly()
    }

    /**
     * Refreshes both hardware specifications and real-time settings.
     */
    fun refreshAll() {
        viewModelScope.launch {
            val contentResolver = getApplication<Application>().contentResolver
            val (devOptionsOn, isUnlocked) = queryDevelopmentSettings(contentResolver)
            val usbDebuggingOn = queryAdbEnabled(contentResolver)

            val securityPatch = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Build.VERSION.SECURITY_PATCH
            } else {
                "Not available (< API 23)"
            }

            val cpuAbi = if (Build.SUPPORTED_ABIS.isNotEmpty()) {
                Build.SUPPORTED_ABIS.joinToString(", ")
            } else {
                Build.CPU_ABI ?: "Unknown"
            }

            _uiState.update { current ->
                current.copy(
                    isDeveloperOptionsEnabled = devOptionsOn,
                    isUsbDebuggingEnabled = usbDebuggingOn,
                    isDeveloperOptionsUnlocked = isUnlocked,
                    deviceModel = Build.MODEL ?: "Unknown",
                    manufacturer = Build.MANUFACTURER?.replaceFirstChar { it.uppercase() } ?: "Unknown",
                    brand = Build.BRAND?.replaceFirstChar { it.uppercase() } ?: "Unknown",
                    androidVersion = Build.VERSION.RELEASE ?: "Unknown",
                    apiLevel = Build.VERSION.SDK_INT,
                    buildNumber = Build.DISPLAY ?: Build.ID ?: "Unknown",
                    securityPatch = securityPatch,
                    cpuAbi = cpuAbi,
                    hardware = Build.HARDWARE ?: "Unknown",
                    isLoading = false,
                    lastRefreshedTimestamp = System.currentTimeMillis()
                )
            }
        }
    }

    /**
     * Fast query executed on lifecycle resume.
     */
    fun refreshStatusOnly() {
        viewModelScope.launch {
            val contentResolver = getApplication<Application>().contentResolver
            val (devOptionsOn, isUnlocked) = queryDevelopmentSettings(contentResolver)
            val usbDebuggingOn = queryAdbEnabled(contentResolver)

            _uiState.update { current ->
                current.copy(
                    isDeveloperOptionsEnabled = devOptionsOn,
                    isUsbDebuggingEnabled = usbDebuggingOn,
                    isDeveloperOptionsUnlocked = isUnlocked,
                    lastRefreshedTimestamp = System.currentTimeMillis()
                )
            }
        }
    }

    fun incrementClickCount() {
        _uiState.update { it.copy(clickCount = it.clickCount + 1) }
    }

    fun setUserNotice(message: String?) {
        _uiState.update { it.copy(userNoticeMessage = message) }
    }

    /**
     * Safely queries Settings.Global.DEVELOPMENT_SETTINGS_ENABLED with backwards-compatible fallback.
     * Returns Pair(isEnabled, isUnlocked/queryable).
     */
    private fun queryDevelopmentSettings(resolver: ContentResolver): Pair<Boolean, Boolean> {
        return try {
            val value = Settings.Global.getInt(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0)
            Pair(value == 1, true)
        } catch (_: Settings.SettingNotFoundException) {
            // Setting doesn't exist yet (means Developer Options was never enabled or is locked)
            Pair(false, false)
        } catch (_: SecurityException) {
            // Some restricted OEM profiles
            Pair(false, false)
        } catch (_: Exception) {
            Pair(false, false)
        }
    }

    /**
     * Safely queries Settings.Global.ADB_ENABLED.
     */
    private fun queryAdbEnabled(resolver: ContentResolver): Boolean {
        return try {
            val value = Settings.Global.getInt(resolver, Settings.Global.ADB_ENABLED, 0)
            value == 1
        } catch (_: Exception) {
            false
        }
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ads/AdManager.kt',
    name: 'AdManager.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'AdMob SDK manager with UMP consent, adaptive banner support, and preloaded interstitial ads with 3-tap frequency cap',
    content: `package com.utility.devoptions.ads

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
                        Log.w(TAG, "Consent form error: \${formError.message}")
                    }
                    if (consentInformation.canRequestAds()) {
                        initializeMobileAds(onReady)
                    }
                }
            },
            { requestConsentError ->
                Log.w(TAG, "Consent request error: \${requestConsentError.message}")
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
                    Log.w(TAG, "Interstitial ad failed to load: \${loadAdError.message}")
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
                    Log.w(TAG, "Interstitial failed to show: \${adError.message}")
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
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/util/IntentHelper.kt',
    name: 'IntentHelper.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Resilient multi-tier OEM intent router with AOSP, Xiaomi, Samsung, Huawei fallbacks and About Phone unlock guidance',
    content: `package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

object IntentHelper {

    sealed class OpenResult {
        data object Success : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class Error(val exception: Throwable) : OpenResult()
    }

    /**
     * Attempts to open Developer Options across diverse Android versions (API 21 - API 35)
     * and OEM custom skins (Samsung, Xiaomi/HyperOS, Huawei, AOSP).
     * If all attempts fail (or developer mode is locked), falls back to About Phone so user can unlock it.
     */
    fun openDeveloperOptions(context: Context): OpenResult {
        // Attempt 1: Standard Android AOSP action
        try {
            val aospIntent = Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (aospIntent.resolveActivity(context.packageManager) != null) {
                context.startActivity(aospIntent)
                return OpenResult.Success
            }
        } catch (_: ActivityNotFoundException) {
            // Proceed to OEM fallbacks
        } catch (e: SecurityException) {
            // Some OEMs protect the standard action
        }

        // Attempt 2: OEM-specific direct component names
        val manufacturer = Build.MANUFACTURER.lowercase()
        val oemIntents = mutableListOf<Intent>()

        // Xiaomi / HyperOS / MIUI
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.Settings\\$DevelopmentSettingsDashboardActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Samsung One UI
        if (manufacturer.contains("samsung")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.Settings\\$DevelopmentSettingsActivity")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Huawei EMUI / HarmonyOS
        if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            oemIntents.add(
                Intent().apply {
                    component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }

        // Generic fallback components across vendors
        oemIntents.add(
            Intent().apply {
                component = ComponentName("com.android.settings", "com.android.settings.Settings\\$DevelopmentSettingsDashboardActivity")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
        oemIntents.add(
            Intent().apply {
                component = ComponentName("com.android.settings", "com.android.settings.DevelopmentSettings")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )

        for (intent in oemIntents) {
            try {
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    return OpenResult.Success
                }
            } catch (_: Exception) {
                // Keep testing next fallback
            }
        }

        // Final Fallback: Open Device Info ("About Phone") so user can tap Build Number 7 times
        return try {
            val aboutPhoneIntent = Intent(Settings.ACTION_DEVICE_INFO_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(aboutPhoneIntent)
            OpenResult.FallbackToDeviceInfo(
                "Developer Options is not unlocked or unavailable. Opening About Phone: tap 'Build Number' 7 times to enable."
            )
        } catch (e: Exception) {
            OpenResult.Error(e)
        }
    }

    /**
     * Native share sheet to share the application on Google Play Store.
     */
    fun shareApplication(context: Context) {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Dev Options Shortcut for Android")
            putExtra(
                Intent.EXTRA_TEXT,
                "Easily access Developer Options and monitor USB Debugging status on Android: " +
                        "https://play.google.com/store/apps/details?id=\${context.packageName}"
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooserIntent = Intent.createChooser(shareIntent, "Share Dev Options Shortcut").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooserIntent)
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt',
    name: 'MainScreen.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Jetpack Compose Material 3 main screen with real-time cards, adaptive banner, and status badges',
    content: `package com.utility.devoptions.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DeveloperMode
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.components.BannerAdView
import com.utility.devoptions.ui.components.DeviceInfoCard
import com.utility.devoptions.ui.components.StatusBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    uiState: DevStatusUiState,
    snackbarHostState: SnackbarHostState,
    onOpenDeveloperOptions: () -> Unit,
    onShareApp: () -> Unit,
    onManualRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.DeveloperMode,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Dev Options Shortcut",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onManualRefresh) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh Status"
                        )
                    }
                    IconButton(onClick = onShareApp) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = "Share Application"
                        )
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            // Anchored adaptive banner ad compliant with Google AdMob policies
            BannerAdView()
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Live Status Section
            Text(
                text = "REAL-TIME SETTINGS INSPECTOR",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                letterSpacing = 1.sp
            )

            // Developer Options Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Code,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Developer Options",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Settings.Global.DEVELOPMENT_SETTINGS_ENABLED",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }
                    StatusBadge(isEnabled = uiState.isDeveloperOptionsEnabled)
                }
            }

            // USB Debugging Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.secondaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Usb,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "USB Debugging",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Settings.Global.ADB_ENABLED",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }
                    StatusBadge(isEnabled = uiState.isUsbDebuggingEnabled)
                }
            }

            // Primary Launch Action Button
            Button(
                onClick = onOpenDeveloperOptions,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Open Developer Options",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            // Secondary Quick Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onManualRefresh,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Refresh Status", fontSize = 13.sp)
                }

                OutlinedButton(
                    onClick = onShareApp,
                    modifier = Modifier
                        .weight(1f)
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share App", fontSize = 13.sp)
                }
            }

            // How to Unlock Guide Card (Crucial for first-time users)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Build,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "How to Unlock Developer Options",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "1. Open Device Settings > About Phone (or System Info).\\n" +
                                "2. Locate 'Build Number' and tap it 7 times in a row.\\n" +
                                "3. Enter your PIN/Pattern when prompted.\\n" +
                                "4. Return to this app — Developer Options will be permanently unlocked!",
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
                    )
                }
            }

            // Device Info & Diagnostics Card (Complies with Google Play Minimum Functionality policy)
            DeviceInfoCard(uiState = uiState)

            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/components/StatusBadge.kt',
    name: 'StatusBadge.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Accessible status indicator badge with icon and label',
    content: `package com.utility.devoptions.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RemoveCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.ui.theme.StatusActiveContainer
import com.utility.devoptions.ui.theme.StatusActiveGreen
import com.utility.devoptions.ui.theme.StatusActiveText
import com.utility.devoptions.ui.theme.StatusInactiveContainer
import com.utility.devoptions.ui.theme.StatusInactiveGray
import com.utility.devoptions.ui.theme.StatusInactiveText

@Composable
fun StatusBadge(
    isEnabled: Boolean,
    modifier: Modifier = Modifier
) {
    val bgColor = if (isEnabled) StatusActiveContainer else StatusInactiveContainer
    val contentColor = if (isEnabled) StatusActiveText else StatusInactiveText
    val dotColor = if (isEnabled) StatusActiveGreen else StatusInactiveGray
    val labelText = if (isEnabled) "ACTIVE (ON)" else "DISABLED (OFF)"

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bgColor)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(dotColor)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Icon(
            imageVector = if (isEnabled) Icons.Filled.CheckCircle else Icons.Filled.RemoveCircleOutline,
            contentDescription = null,
            tint = dotColor,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = labelText,
            color = contentColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp
        )
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/components/DeviceInfoCard.kt',
    name: 'DeviceInfoCard.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'System specifications card complying with Google Play Minimum Functionality policy',
    content: `package com.utility.devoptions.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.data.model.DevStatusUiState

@Composable
fun DeviceInfoCard(
    uiState: DevStatusUiState,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text(
                    text = "Device Hardware & OS Details",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
            
            Text(
                text = "System parameters inspected directly from android.os.Build",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = 2.dp, bottom = 12.dp)
            )

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                thickness = 1.dp
            )

            Spacer(modifier = Modifier.height(8.dp))

            SpecRow(label = "Android Version", value = "Android \${uiState.androidVersion} (API \${uiState.apiLevel})")
            SpecRow(label = "Device Model", value = "\${uiState.manufacturer} \${uiState.deviceModel}")
            SpecRow(label = "Brand / Hardware", value = "\${uiState.brand} / \${uiState.hardware}")
            SpecRow(label = "Security Patch", value = uiState.securityPatch)
            SpecRow(label = "Build Number", value = uiState.buildNumber, isMonospace = true)
            SpecRow(label = "CPU Architecture", value = uiState.cpuAbi, isMonospace = true)
        }
    }
}

@Composable
private fun SpecRow(
    label: String,
    value: String,
    isMonospace: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
        )
        Text(
            text = value.ifEmpty { "—" },
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = if (isMonospace) FontFamily.Monospace else FontFamily.Default,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/components/BannerAdView.kt',
    name: 'BannerAdView.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'AndroidView hosting Google AdMob adaptive banner with lifecycle binding',
    content: `package com.utility.devoptions.ui.components

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.utility.devoptions.ads.AdManager

@Composable
fun BannerAdView(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val screenWidthDp = configuration.screenWidthDp

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
        contentAlignment = Alignment.Center
    ) {
        AndroidView(
            modifier = Modifier.fillMaxWidth(),
            factory = { ctx ->
                AdView(ctx).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                    adUnitId = AdManager.BANNER_ID
                    val adSize = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(ctx, screenWidthDp)
                    setAdSize(adSize)
                    loadAd(AdRequest.Builder().build())
                }
            },
            update = { adView ->
                // Banner view maintained across recompositions
            }
        )
    }
}
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/theme/Theme.kt',
    name: 'Theme.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Dynamic Material 3 theme on Android 12+ (API 31+) with fallback dark/light schemes for API 21-30',
    content: `package com.utility.devoptions.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryPurpleDark,
    secondary = SecondaryTealDark,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    outline = DarkOutline
)

private val LightColorScheme = lightColorScheme(
    primary = PrimaryPurple,
    secondary = SecondaryTeal,
    background = LightBackground,
    surface = LightSurface,
    surfaceVariant = LightSurfaceVariant,
    outline = LightOutline
)

@Composable
fun DevOptionsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
`
  },
  {
    path: 'app/src/main/res/values/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'String resources and AdMob test IDs',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Dev Options Shortcut</string>
    <string name="open_dev_options">Open Developer Options</string>
    <string name="dev_options_status">Developer Options</string>
    <string name="usb_debugging_status">USB Debugging</string>
    <string name="status_enabled">Enabled (Active)</string>
    <string name="status_disabled">Disabled (Inactive)</string>
    <string name="status_unknown">Unknown</string>
    <string name="device_specs_title">Device Hardware &amp; OS</string>
    <string name="how_to_unlock_title">How to Unlock Developer Options</string>
    <string name="how_to_unlock_desc">If Developer Options is locked on this device, go to About Phone and tap 'Build Number' 7 times consecutively.</string>
    <string name="dev_options_not_found">Developer Options not found or locked. Opening About Phone…</string>
    <string name="share_app">Share App</string>
    <string name="share_subject">Quick Developer Options Shortcut for Android</string>
    <string name="share_message">Directly open Developer Options and inspect USB Debugging on your phone: https://play.google.com/store/apps/details?id=com.utility.devoptions</string>
    <string name="admob_banner_id">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id">ca-app-pub-4783826505860771/6316609796</string>
</resources>
`
  },
  {
    path: 'README.md',
    name: 'README.md (Android Studio Guide)',
    category: 'docs',
    language: 'markdown',
    description: 'Complete build, Gradle compilation, and Play Store release guide',
    content: `# Dev Options Shortcut — Native Android Studio Project

A production-ready native Android utility application written in Kotlin with Jetpack Compose (Material 3), modern ViewModel architecture, lifecycle-based real-time status inspection, and Google AdMob SDK integration.

## Key Technical Specifications
- **Package Name**: \`com.utility.devoptions\`
- **Compile SDK**: \`35\` (Android 15)
- **Min SDK**: \`21\` (Android 5.0 Lollipop — 99.8% global device reach)
- **Target SDK**: \`35\` (Fully compliant with Google Play target API requirements)
- **Architecture**: Modern Android Architecture (MVVM) with StateFlow and Coroutines
- **UI Framework**: Jetpack Compose with Material 3 Dynamic Color support and dark/light fallbacks

## How to Import & Build in Android Studio
1. Open Android Studio Ladybug (2024.2+) or newer.
2. Select File > Open and choose this directory.
3. Allow Gradle to sync dependencies via gradle/libs.versions.toml.
4. Run \`./gradlew assembleDebug\` to build the debug APK.
`
  }
];
