Dev Options Shortcut — Universal Android Version Support & Studio
A production-ready, policy-compliant native Android application built in Kotlin with Jetpack Compose (Material 3) supporting Android versions from API 21 (Android 5.0 Lollipop) through API 35 (Android 15) (99.8% global device reach), equipped with multi-tier OEM intent fallbacks (Samsung, Xiaomi, Huawei, AOSP), real-time status monitoring, Google AdMob SDK 23.+, and an interactive Web Simulator & Project Exporter.
User Review & Critical Decisions
> [!IMPORTANT]
> The following product decisions were confirmed during the specification interview and revisions:
Confirmed Universal Version Range: `minSdk = 21` (Android 5.0 Lollipop) to `targetSdk = 35` / `compileSdk = 35` (Android 15). Covers 99.8% of Android devices globally while satisfying Google Play's latest target API requirement.
Confirmed Multi-Tier OEM Intent Routing:
Standard Android AOSP: `Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS`
Xiaomi / HyperOS / MIUI: Component `com.android.settings/.DevelopmentSettings` & `com.miui.securitycenter`
Samsung One UI: `com.android.settings.DevelopmentSettings`
Huawei EMUI / HarmonyOS: `com.android.settings.DevelopmentSettings`
Ultimate Fallback: `Settings.ACTION_DEVICE_INFO_SETTINGS` ("About Phone") accompanied by an interactive Material 3 dialog/snackbar explaining the "Tap Build Number 7 times" unlock procedure.
Confirmed Version-Guarded APIs:
`Build.VERSION.SECURITY_PATCH`: Guarded with `SDK_INT >= Build.VERSION_CODES.M` (API 23).
Material You Dynamic Colors: Guarded with `SDK_INT >= Build.VERSION_CODES.S` (API 31); fallback to custom Material 3 Dark/Light palettes for Android 5.0 through 11.
Edge-to-Edge: `androidx.activity:activity-compose` `enableEdgeToEdge()` with backward-compatible system scrims across all API levels.
Settings.Global vs Settings.Secure: Safe fallback for content resolver settings across API 21+.
Confirmed AdMob Setup:
Anchored adaptive banner at bottom.
Preloaded Interstitial Ad triggered on every 3rd action tap with strict fail-open execution (user always lands in settings even if ad fails or is skipped).
UMP Consent readiness in `MainActivity`.
---
1. Overview & Core Concept
What It Does: Provides instant 1-tap direct access to Developer Options across all Android versions (Android 5.0 to 15) and major phone brands, with real-time status inspection of USB Debugging (`ADB_ENABLED`) and Developer Mode (`DEVELOPMENT_SETTINGS_ENABLED`).
Google Play Compliance: Avoids the "Minimum Functionality" rejection trap by pairing the shortcut launcher with a comprehensive hardware, OS, and SoC diagnostic hub (Device Model, Manufacturer, Android Version, Codename, API Level, Security Patch, SoC Architecture, and Build Fingerprint) plus a native Share intent.
Dynamic Lifecycle: Uses a `DefaultLifecycleObserver` in `onResume()` to instantaneously refresh status when the user toggles settings and returns to the app, with zero battery drain.
---
2. User Experience & Visual Design
Universal Material 3 Interface
Surface Elevation: High-contrast, tactile cards (`rounded-2xl` / `16dp`) utilizing M3 surface container tokens (`surfaceContainer`, `surfaceContainerHigh`).
Color Palette & Visual Cues:
Active Debugging / Developer Options ON: Emerald Green (`Color(0xFF10B981)`) with distinct checkmark icon and text label for color-blind accessibility.
Disabled / OFF: Slate Grey (`Color(0xFF64748B)`) with clear "Disabled" label.
Primary Action Tile: Prominent high-contrast CTA button with phone-to-settings arrow icon.
Brand & Device Specs: Clean, unboxed tabular specifications with subtle hairline dividers.
Cross-Version Compatibility Matrix
Feature	Android 5.0–11 (API 21–30)	Android 12–14 (API 31–34)	Android 15 (API 35)
Material 3 Theme	Curated Deep M3 Palette	Dynamic Material You Colors	Dynamic M3 + Native Edge-to-Edge
Security Patch	Guarded API (or "Pre-Marshmallow")	Full Month-Year Patch String	Full Month-Year Patch String
Intent Handling	OEM Intent Fallback Chain	OEM Intent Fallback Chain	OEM Intent Fallback Chain
Edge-to-Edge	Backward-compatible System Scrim	WindowInsetsPadding	Enforced Edge-to-Edge
Settings Resolution	`Settings.Global` query	`Settings.Global` query	`Settings.Global` query
---
3. Key Product Decisions & Trade-Offs
Decision 1: Supporting API 21 as minSdk
Chosen Approach: `minSdk = 21` using AndroidX Jetpack Compose 1.7+, Kotlin 2.0, and backward-compatible Activity Compose.
Why: Delivers universal compatibility covering 99.8% of smartphones in emerging and mature markets without sacrificing modern Jetpack Compose ergonomics.
Decision 2: Resilient OEM Intent Routing
Chosen Approach: Try standard AOSP intent -> catch `ActivityNotFoundException` -> try manufacturer-specific ComponentName -> catch -> fallback to About Phone with guided toast/dialog.
Why: Certain custom skins (MIUI, ColorOS, HyperOS, EMUI) rename or nest development settings behind proprietary packages. The fallback chain guarantees 100% crash immunity.
Decision 3: Interactive Web Simulator & Instant Project Export
Chosen Approach: Provide a responsive Web Studio showcasing the live Material 3 Android UI on an interactive mobile canvas with live toggle simulations, alongside a file-by-file code browser with copy buttons, and an automatic ZIP generator producing the ready-to-build Android Studio project.
Why: Allows immediate testing and inspection in the browser while providing the exact, ready-to-compile Gradle project for Android Studio.
---
4. Technical Architecture & Data Strategy
```
┌────────────────────────────────────────────────────────────────────────────┐
│              Universal Android Architecture (API 21 - API 35)              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
           ┌──────────────────────────┴──────────────────────────┐
           ▼                                                     ▼
┌─────────────────────────┐                           ┌───────────────────────┐
│      MainActivity       │                           │   Google Mobile Ads   │
│  - enableEdgeToEdge()   │                           │  - UMP Consent Hook   │
│  - LifecycleObserver    │◄───(onResume Refresh)─────│  - Adaptive Banner    │
│  - Intent Chain Handler │                           │  - Preload Interstitial
└──────────┬──────────────┘                           │  - 3-Tap Frequency    │
           │                                          └───────────────────────┘
           ▼
┌───────────────────────────────────┐
│     DeveloperOptionsViewModel     │
│  - Settings.Global Reader (Safe)  │
│  - Build Hardware Diagnostics     │
│  - _uiState: StateFlow<UiState>   │
└──────────┬────────────────────────┘
           │ (StateFlow emission)
           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Jetpack Compose Material 3                  │
│  ┌────────────────────────┐     ┌─────────────────────────┐ │
│  │ DeveloperStatusCard    │     │ DeviceDiagnosticsCard   │ │
│  │ - Developer Mode State │     │ - Manufacturer & Model  │ │
│  │ - USB Debugging State  │     │ - Android Version & API │ │
│  └────────────────────────┘     │ - Patch & Architecture  │ │
│  ┌────────────────────────┐     └─────────────────────────┘ │
│  │ Primary Launch Button  │     ┌─────────────────────────┐ │
│  │ - OEM Fallback Intent  │     │ AnchoredAdaptiveBanner  │ │
│  └────────────────────────┘     └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```
Deliverables & File Manifest
Gradle Build Configuration:
`build.gradle.kts` (Root): Android Gradle Plugin 8.7.0, Kotlin 2.0.21, Compose Compiler Plugin.
`app/build.gradle.kts`: `compileSdk = 35`, `minSdk = 21`, `targetSdk = 35`, dependencies for `play-services-ads:23.6.0`, `androidx.compose.material3:1.3.1`, `androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7`, `androidx.activity:activity-compose:1.9.3`.
`settings.gradle.kts`: Google Maven, MavenCentral, Gradle Plugin Portal.
Android Manifest:
`AndroidManifest.xml`: Permissions (`INTERNET`, `ACCESS_NETWORK_STATE`), AdMob Application ID meta-data, exported launcher activity.
Native Kotlin Source Code (`com.utility.devoptions`):
`data/model/DevStatusState.kt`: Immutable UI state models.
`util/IntentHelper.kt`: Resilient OEM Intent routing engine (AOSP, Xiaomi/HyperOS, Samsung, Huawei, fallback to About Phone).
`viewmodel/DeveloperOptionsViewModel.kt`: StateFlow view model reading `Settings.Global` and `Build` specs with version guarding.
`ui/theme/Color.kt`, `Type.kt`, `Theme.kt`: Dynamic Material You (Android 12+) with curated fallback colors (Android 5.0–11).
`ui/components/StatusBadge.kt`: Accessible status indicators.
`ui/components/DeviceInfoCard.kt`: Google Play compliant hardware & OS details.
`ui/components/BannerAdView.kt`: AndroidView adaptive banner container.
`ui/screens/MainScreen.kt`: Material 3 Scaffold, TopAppBar, Pull-to-refresh, Action button, Snackbar host.
`MainActivity.kt`: ComponentActivity, edge-to-edge, UMP initialization, preloaded interstitial ad with 3-tap frequency cap, onResume lifecycle observer.
Web Studio & Project Exporter:
Interactive Material 3 phone simulator.
Toggles to simulate Developer Options ON/OFF, USB Debugging ON/OFF, Locked State, and OEM Intent fallbacks.
Interactive source code explorer with syntax highlighting and instant file copy.
Downloadable Android Studio project ZIP button (generates a valid, complete `.zip` ready for Android Studio).
