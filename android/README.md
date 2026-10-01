# Dev Options Shortcut — Native Android Studio Project

A production-ready native Android utility application written in Kotlin with Jetpack Compose (Material 3), modern ViewModel architecture, lifecycle-based real-time status inspection, and Google AdMob SDK integration.

## Key Technical Specifications
- **Package Name**: `com.utility.devoptions`
- **Compile SDK**: `35` (Android 15)
- **Min SDK**: `21` (Android 5.0 Lollipop — 99.8% global device reach)
- **Target SDK**: `35` (Fully compliant with Google Play target API requirements)
- **Architecture**: Modern Android Architecture (MVVM) with StateFlow and Coroutines
- **UI Framework**: Jetpack Compose with Material 3 Dynamic Color support and dark/light fallbacks

---

## Project Structure
```
android/
├── build.gradle.kts                     # Project-level Gradle build configuration
├── settings.gradle.kts                  # Gradle settings & plugin repositories
├── gradle.properties                    # JVM args and AndroidX configuration
├── gradle/
│   └── libs.versions.toml              # Version catalog for dependency management
└── app/
    ├── build.gradle.kts                 # Application-level Gradle dependencies & SDK config
    ├── proguard-rules.pro               # Release optimization rules
    └── src/main/
        ├── AndroidManifest.xml          # Permissions, metadata & exported activity
        ├── res/
        │   ├── values/
        │   │   ├── strings.xml          # Translatable strings
        │   │   ├── colors.xml           # Fallback colors
        │   │   └── themes.xml           # System bar transparency & theming
        │   └── xml/
        │       ├── backup_rules.xml
        │       └── data_extraction_rules.xml
        └── java/com/utility/devoptions/
            ├── MainActivity.kt          # Edge-to-edge, lifecycle observer & ad controller
            ├── ads/
            │   └── AdManager.kt         # AdMob SDK, UMP consent & 3-tap frequency cap
            ├── data/model/
            │   └── DevStatusState.kt    # Immutable UI state models
            ├── util/
            │   └── IntentHelper.kt      # OEM intent router (AOSP, Xiaomi, Samsung, Huawei)
            ├── viewmodel/
            │   └── DeveloperOptionsViewModel.kt # Settings.Global inspector & device hardware
            └── ui/
                ├── components/
                │   ├── StatusBadge.kt   # High-contrast ON/OFF indicators
                │   ├── DeviceInfoCard.kt # System parameters (Play Store policy compliance)
                │   └── BannerAdView.kt  # Anchored adaptive banner ad wrapper
                ├── screens/
                │   └── MainScreen.kt    # Jetpack Compose Material 3 main screen
                └── theme/
                    ├── Color.kt         # M3 color tokens
                    ├── Type.kt          # M3 typography definitions
                    └── Theme.kt         # Dynamic Color (API 31+) & fallback theming
```

---

## How to Import & Build in Android Studio

1. Open **Android Studio Ladybug (2024.2+)** or newer.
2. Select **File > Open...** and choose the `android` folder.
3. Allow Gradle to sync dependencies via the version catalog (`gradle/libs.versions.toml`).
4. To build debug APK via command line:
   ```bash
   ./gradlew assembleDebug
   ```
   The APK will be generated at `app/build/outputs/apk/debug/app-debug.apk`.
5. To generate a release Android App Bundle (AAB) for Google Play:
   ```bash
   ./gradlew bundleRelease
   ```

---

## AdMob Production Configuration

The project files are configured with active production credentials:
- **Application ID** (`AndroidManifest.xml`): `ca-app-pub-4783826505860771~9544574215`
- **Banner Ad Unit ID** (`strings.xml` / `AdManager.kt`): `ca-app-pub-4783826505860771/4624168456`
- **Interstitial Ad Unit ID** (`strings.xml` / `AdManager.kt`): `ca-app-pub-4783826505860771/6316609796`

---

## Google Play Policy Compliance
- **Minimum Functionality Policy**: Single-button shortcut apps risk rejection as "webviews or low-utility shortcuts". This app exceeds guidelines by including an active **Device Hardware & OS Diagnostic Hub** (`android.os.Build`), real-time settings inspection, an interactive unlock guide, and dynamic lifecycle state synchronization.
- **AdMob Disallowed Implementation Policy**: The app does NOT display an interstitial on every tap. It enforces a strict **3-tap frequency cap** and guarantees **fail-open intent routing** (the user is never blocked from Settings if an ad fails to load or is dismissed).
