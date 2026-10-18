> **Current release facts (verified from Gradle):** package `com.utility.devoptions`; version `1.0.4` (`20261019`); compile/target SDK 36; current minimum SDK 24. Google Play Automatic Protection’s documented API 24 minimum means API 21–23 support must not be enabled until the protection trade-off is explicitly approved. The in-app locale selector advertises seven complete resource sets: English, Russian, Hindi, Spanish, French, Arabic, and Simplified Chinese. Each advertised locale contains the complete translatable UI key set and matching format placeholders. Nine previously partial locale sets have been removed from the app picker, locale configuration, source resources, and Web Studio exporter. The added translations were machine-generated and still need native-speaker review before being described as publication-quality.

Developers Options Shortcut — Android utility and Studio
A native Android application built with Kotlin and Jetpack Compose (Material 3), currently configured for API 24+ (Android 7.0+) while the Automatic Protection compatibility decision is pending. API 21–23 support remains intentionally disabled until the security trade-off is approved. Features include OEM intent fallbacks, status inspection, Google AdMob, and a Web Studio project exporter.
User Review & Critical Decisions
> [!IMPORTANT]
> The following product decisions were confirmed during the specification interview and revisions:
Current Gradle configuration (verified): `minSdk = 24`, `targetSdk = 36`, `compileSdk = 36`, application ID `com.utility.devoptions`, version `1.0.4` / code `20261019`. API 24 excludes Android 5.0–6.0 (API 21–23). A lower minimum would broaden compatibility but conflicts with the documented API 24 minimum for Google Play Automatic Protection if that protection is required. Do not claim a global device-reach percentage without current Google Play Console device data.
Confirmed Multi-Tier OEM Intent Routing:
Standard Android AOSP: `Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS`
Xiaomi / HyperOS / MIUI: Component `com.android.settings/.DevelopmentSettings` & `com.miui.securitycenter`
Samsung One UI: `com.android.settings.DevelopmentSettings`
Huawei EMUI / HarmonyOS: `com.android.settings.DevelopmentSettings`
Ultimate Fallback: `Settings.ACTION_DEVICE_INFO_SETTINGS` ("About Phone") accompanied by an interactive Material 3 dialog/snackbar explaining the "Tap Build Number 7 times" unlock procedure.
Confirmed Version-Guarded APIs:
`Build.VERSION.SECURITY_PATCH`: Guarded with `SDK_INT >= Build.VERSION_CODES.M` (API 23).
Material You Dynamic Colors: Guarded with `SDK_INT >= Build.VERSION_CODES.S` (API 31); fallback to custom Material 3 Dark/Light palettes for Android 7.0 through 11.
Edge-to-Edge: `androidx.activity:activity-compose` `enableEdgeToEdge()` with backward-compatible system scrims across all API levels.
Settings.Global vs Settings.Secure: Safe fallback for content resolver settings across API 24+.
Confirmed AdMob Setup:
Anchored adaptive banner at bottom.
Preloaded Interstitial Ad triggered on every 3rd action tap with strict fail-open execution (user always lands in settings even if ad fails or is skipped).
UMP Consent readiness in `MainActivity`.
---
1. Overview & Core Concept
What It Does: Provides instant 1-tap direct access to Developer Options on supported Android versions (Android 7.0+; API 21–23 support pending approval) and major phone brands, with real-time status inspection of USB Debugging (`ADB_ENABLED`) and Developer Mode (`DEVELOPMENT_SETTINGS_ENABLED`).
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
Feature	Android 7.0–11 (API 24–30)	Android 12–14 (API 31–34)	Android 15 (API 35)
Material 3 Theme	Curated Deep M3 Palette	Dynamic Material You Colors	Dynamic M3 + Native Edge-to-Edge
Security Patch	Guarded API (or "Pre-Marshmallow")	Full Month-Year Patch String	Full Month-Year Patch String
Intent Handling	OEM Intent Fallback Chain	OEM Intent Fallback Chain	OEM Intent Fallback Chain
Edge-to-Edge	Backward-compatible System Scrim	WindowInsetsPadding	Enforced Edge-to-Edge
Settings Resolution	`Settings.Global` query	`Settings.Global` query	`Settings.Global` query
---
3. Key Product Decisions & Trade-Offs
Decision 1: Supporting API 24 as minSdk
Chosen Approach: keep `minSdk = 24` until the Automatic Protection decision is explicitly approved.
Why: This is the currently configured, protection-compatible minimum; restoring API 21–23 would cover older devices but conflicts with the documented API 24 protection requirement if protection remains required.
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
│              Android Architecture (API 24+; target SDK 36)              │
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
`app/build.gradle.kts`: `compileSdk = 36`, `minSdk = 24`, `targetSdk = 36`, pinned NDK `27.2.12479018`, dependencies for `play-services-ads:23.6.0`, `androidx.compose.material3:1.3.1`, `androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7`, `androidx.activity:activity-compose:1.9.3`.
`settings.gradle.kts`: Google Maven, MavenCentral, Gradle Plugin Portal.
Android Manifest:
`AndroidManifest.xml`: Permissions (`INTERNET`, `ACCESS_NETWORK_STATE`), AdMob Application ID meta-data, exported launcher activity.
Native Kotlin Source Code (`com.utility.devoptions`):
`data/model/DevStatusState.kt`: Immutable UI state models.
`util/IntentHelper.kt`: Resilient OEM Intent routing engine (AOSP, Xiaomi/HyperOS, Samsung, Huawei, fallback to About Phone).
`viewmodel/DeveloperOptionsViewModel.kt`: StateFlow view model reading `Settings.Global` and `Build` specs with version guarding.
`ui/theme/Color.kt`, `Type.kt`, `Theme.kt`: Dynamic Material You (Android 12+) with curated fallback colors (Android 7.0–11).
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


## Release audit notes (2026-10-18)

- The current API 24 minimum is retained pending an explicit decision on whether worldwide support for Android 5.0–6.0 (API 21–23) takes priority over Google Play Automatic Protection. The app-specific Play Console toggle was not directly accessible during this repository audit.
- Release builds request `ndk.debugSymbolLevel = "FULL"` and pin NDK `27.2.12479018` so CI has ABI strip tools. The latest verified build still reports that `libandroidx.graphics.path.so` has already-stripped native debug metadata for all packaged ABIs; CI records this as unresolved and the signed-release workflow continues to block publication while symbols are missing.
- Native UI locale choices are limited to English, Russian, Hindi, Spanish, French, Arabic (RTL), and Simplified Chinese. All seven have complete string-resource key coverage and format-placeholder checks. Hindi, Spanish, French, Arabic, and Simplified Chinese translations are machine-generated and need native-speaker review; resource completeness does not prove linguistic QA or live-ad verification.
- AdMob, UMP consent and encrypted billing preferences remain in the project; the PR’s CI checks presence but does not prove that live ads were served or that consent works end-to-end on a device.
