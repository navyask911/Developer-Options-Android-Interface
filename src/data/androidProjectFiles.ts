export interface AndroidFile {
  path: string;
  name: string;
  category: 'gradle' | 'manifest' | 'kotlin' | 'res' | 'docs';
  language: 'kotlin' | 'groovy' | 'xml' | 'toml' | 'properties' | 'markdown' | 'yaml' | 'bash' | 'powershell' | 'png';
  content: string;
  description: string;
  /** Public asset copied as binary data into the generated Android source ZIP. */
  binaryAsset?: string;
}

export const ANDROID_FILES: AndroidFile[] = [
  {
    path: '.github/workflows/build-apk.yml',
    name: 'build-apk.yml',
    category: 'docs',
    language: 'yaml',
    description: 'Automated GitHub Actions CI/CD workflow building and publishing app-debug.apk to GitHub Releases',
    content: `name: Build Debug APK

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    name: Test and build Debug APK
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 9.1.0
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '9.1.0'

      - name: Run standard unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle testDebugUnitTest --stacktrace --no-daemon

      - name: Build debug APK
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle assembleDebug --stacktrace --no-daemon

      - name: Verify APK
        run: test -s android/app/build/outputs/apk/debug/app-debug.apk

      - name: Upload debug APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
          retention-days: 14

  publish:
    name: Publish Debug APK (main branch only)
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download debug APK artifact
        uses: actions/download-artifact@v4
        with:
          name: app-debug-apk
          path: /tmp/apk_release

      - name: Publish APK to GitHub Releases
        env:
          GH_TOKEN: \${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          TAG_NAME="debug-apk-v1.0.\${{ github.run_number }}"
          APK_FILE="/tmp/apk_release/app-debug.apk"
          test -s "$APK_FILE"
          if gh release view "$TAG_NAME" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "::error::Release tag $TAG_NAME already exists; refusing to overwrite it."
            exit 1
          fi
          gh release create "$TAG_NAME" "$APK_FILE" \\
            --repo "$GITHUB_REPOSITORY" \\
            --title "Debug APK Build #\${{ github.run_number }}" \\
            --target "\${{ github.sha }}" \\
            --notes "Debug APK for testing only. This is not the signed production App Bundle."
`
  },
  {
    path: '.github/workflows/android-validation.yml',
    name: 'android-validation.yml',
    category: 'docs',
    language: 'yaml',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `name: Android Validation

on:
  pull_request:
    branches: [main]
    paths:
      - 'android/**'
      - 'src/**'
      - 'README.md'
      - 'index.html'
      - '.github/workflows/**'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: android-validation-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Unit tests, full locale coverage, and release-candidate inspection
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 9.1.0
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '9.1.0'

      - name: Validate all 19 offline locales and exported Android resources
        shell: bash
        run: |
          set -euo pipefail
          python3 scripts/validate_localization.py --check-export --report /tmp/locale-coverage.json | tee /tmp/locale-coverage.log

      - name: Validate launcher artwork and Play Store listing icon
        shell: bash
        run: |
          set -euo pipefail
          python3 -m venv /tmp/icon-validator-venv
          /tmp/icon-validator-venv/bin/python -m pip install --disable-pip-version-check Pillow
          /tmp/icon-validator-venv/bin/python scripts/validate_icons.py

      - name: Verify AdMob, UMP consent, and encrypted billing preferences remain configured
        shell: bash
        run: |
          set -euo pipefail
          grep -Fq 'com.google.android.gms.ads.APPLICATION_ID' android/app/src/main/AndroidManifest.xml
          grep -Fq 'ca-app-pub-4783826505860771~9544574215' android/app/src/main/AndroidManifest.xml
          grep -Fq 'com.google.android.ump' android/gradle/libs.versions.toml
          grep -Fq 'UserMessagingPlatform.loadAndShowConsentFormIfRequired' android/app/src/main/java/com/utility/devoptions/ads/AdManager.kt
          grep -Fq 'EncryptedSharedPreferences' android/app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt
          echo "AdMob, UMP consent, and encrypted billing preferences remain configured."

      - name: Install pinned Android NDK for native-symbol extraction
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          SDKMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort | tail -n1)"
          if [[ -z "$SDKMANAGER" || ! -x "$SDKMANAGER" ]]; then
            echo "::error::Android sdkmanager is unavailable."
            exit 1
          fi
          set +o pipefail
          yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/tmp/android-sdk-licenses.log 2>&1
          set -o pipefail
          "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "ndk;27.2.12479018"
          test -x "$ANDROID_HOME/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"

      - name: Verify WorkManager R8 full-mode rules
        run: |
          set -euo pipefail
          grep -Fqx -- '-keep class androidx.work.** { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep class * extends androidx.work.Worker { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep class androidx.work.impl.WorkDatabase { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep public class androidx.work.impl.databases.* { *; }' android/app/proguard-rules.pro

      - name: Run clean debug and release JVM unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle clean testDebugUnitTest testReleaseUnitTest --max-workers=1 --stacktrace --no-daemon

      - name: Verify optional Graphics Path JNI dependency is excluded
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:dependencyInsight --dependency androidx.compose.ui:ui-graphics-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/ui-graphics-release-dependency.txt
          if ! grep -Fq 'androidx.compose.ui:ui-graphics-android:1.6.8' /tmp/ui-graphics-release-dependency.txt; then
            echo "::error::Expected compatible Compose UI Graphics Android 1.6.8."
            exit 1
          fi
          gradle :app:dependencyInsight --dependency androidx.compose.material3:material3-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/material3-release-dependency.txt
          if ! grep -Fq 'androidx.compose.material3:material3-android:1.2.1' /tmp/material3-release-dependency.txt; then
            echo "::error::Expected Material 3 1.2.1 aligned with Compose BOM 2024.06.00."
            exit 1
          fi
          gradle :app:dependencies --configuration releaseRuntimeClasspath --console=plain | tee /tmp/release-runtime-dependencies.txt
          if grep -Fq 'androidx.graphics:graphics-path:' /tmp/release-runtime-dependencies.txt; then
            echo "::error::Graphics Path is still in releaseRuntimeClasspath; native-symbol blocker remains unresolved."
            exit 1
          fi
          if grep -R -n -E 'androidx[.]graphics[.]path|PathIterator|Path[.]iterate[[:space:]]*[(]' app/src/main/java/com/utility/devoptions; then
            echo "::error::App source uses PathIterator, which is not provided by the compatible Compose 1.6 line."
            exit 1
          fi
          echo "Compatible Compose 1.6.8 / Material 3 1.2.1 resolved, and graphics-path is absent from the release graph."
  
      - name: Enable KVM access for API instrumentation emulator
        shell: bash
        run: |
          set -euo pipefail
          if [[ ! -e /dev/kvm ]]; then
            echo "::error::/dev/kvm is unavailable on this runner; the required Android instrumentation tests cannot boot."
            exit 1
          fi
          sudo chmod 666 /dev/kvm
          if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
            echo "::error::The runner still cannot read/write /dev/kvm after granting ephemeral CI permissions."
            exit 1
          fi
          echo "KVM device is readable and writable by this ephemeral CI runner."

      - name: Run Compose instrumentation tests on API 30 x86 emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 30
          target: google_apis
          arch: x86
          profile: pixel_2
          disable-animations: true
          emulator-options: -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim
          script: |
            exec bash -euo pipefail -c 'cd "$GITHUB_WORKSPACE/android" && gradle connectedDebugAndroidTest --stacktrace --no-daemon'

      - name: Upload emulator instrumentation reports
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: android-instrumentation-results-v1.0.38
          path: |
            android/app/build/reports/androidTests/connected/**
            android/app/build/outputs/androidTest-results/connected/**
          if-no-files-found: warn
          retention-days: 14

      - name: Build unsigned release AAB and APK candidate for CI evidence
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
          RELEASE_SIGNING_MODE: unsigned
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:bundleRelease :app:assembleRelease --info --stacktrace --no-daemon 2>&1 | tee /tmp/android-release-build.log

      - name: Inspect actual AAB/APK metadata and strict native-symbol availability
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          APK_FILE="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
          if [[ -z "$AAB_FILE" || ! -s "$AAB_FILE" || -z "$APK_FILE" || ! -s "$APK_FILE" ]]; then
            echo "::error::Release AAB or APK is missing or empty."
            exit 1
          fi
          echo "AAB_SHA256=$(sha256sum "$AAB_FILE" | awk '{print $1}')"
          echo "AAB_SIZE_BYTES=$(stat -c '%s' "$AAB_FILE")"
          AAB_FILE="$(realpath "$AAB_FILE")"
          mkdir -p /tmp/bundletool-inspector
          cat > /tmp/bundletool-inspector/settings.gradle <<'GRADLE'
          rootProject.name = 'bundletool-inspector'
          GRADLE
          cat > /tmp/bundletool-inspector/build.gradle <<'GRADLE'
          repositories {
              google()
              mavenCentral()
          }
          configurations { bundletoolRuntime }
          dependencies {
              bundletoolRuntime 'com.android.tools.build:bundletool:1.18.3'
          }
          tasks.register('dumpAabManifest', JavaExec) {
              def bundlePath = System.getenv('AAB_FILE')
              def outputPath = System.getenv('AAB_MANIFEST_OUT')
              if (!bundlePath || !outputPath) {
                  throw new GradleException('AAB_FILE and AAB_MANIFEST_OUT must be set.')
              }
              classpath = configurations.bundletoolRuntime
              mainClass.set('com.android.tools.build.bundletool.BundleToolMain')
              args 'dump', 'manifest', "--bundle=\${bundlePath}", '--module=base'
              standardOutput = new FileOutputStream(outputPath)
          }
          GRADLE
          AAB_MANIFEST_OUT=/tmp/aab-manifest.xml
          export AAB_FILE AAB_MANIFEST_OUT
          if ! gradle -p /tmp/bundletool-inspector dumpAabManifest --no-daemon --console=plain; then
            echo "::error::Bundletool failed to inspect the actual AAB manifest."
            exit 1
          fi
          if [[ ! -s "$AAB_MANIFEST_OUT" ]]; then
            echo "::error::Bundletool did not produce an AAB manifest."
            exit 1
          fi
          EXPECTED_VERSION_CODE="$(sed -nE 's/^[[:space:]]*versionCode[[:space:]]*=[[:space:]]*([0-9]+).*/\\1/p' android/app/build.gradle.kts | head -n1)"
          EXPECTED_VERSION_NAME="$(sed -nE 's/^[[:space:]]*versionName[[:space:]]*=[[:space:]]*"([^"]+)".*/\\1/p' android/app/build.gradle.kts | head -n1)"
          if [[ -z "$EXPECTED_VERSION_CODE" || -z "$EXPECTED_VERSION_NAME" ]]; then
            echo "::error::Could not read release version metadata from android/app/build.gradle.kts."
            exit 1
          fi
          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq "android:versionName=\\"$EXPECTED_VERSION_NAME\\"" /tmp/aab-manifest.xml
          grep -Fq "android:versionCode=\\"$EXPECTED_VERSION_CODE\\"" /tmp/aab-manifest.xml
          grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          echo "Actual AAB manifest verified: package=com.utility.devoptions minSdk=24 versionName=$EXPECTED_VERSION_NAME versionCode=$EXPECTED_VERSION_CODE"
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          test -n "$AAPT" && test -x "$AAPT"
          "$AAPT" dump badging "$APK_FILE" | tee /tmp/release-apk-badging.txt >/dev/null
          grep -F "package: name='com.utility.devoptions' versionCode='$EXPECTED_VERSION_CODE' versionName='$EXPECTED_VERSION_NAME'" /tmp/release-apk-badging.txt
          grep -F "sdkVersion:'24'" /tmp/release-apk-badging.txt
          "$AAPT" dump badging "$APK_FILE" | grep -F "application-label:'Developers Options Shortcut'"
          FRAGMENT="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version 2>/dev/null | tr -d '\\r\\n' || true)"
          if [[ "$FRAGMENT" != "1.8.9" ]]; then
            echo "::error::Expected Fragment metadata 1.8.9 but got \${FRAGMENT:-<missing>}."
            exit 1
          fi
          echo "AAB Fragment metadata verified: $FRAGMENT"
          NATIVE_LIBS="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+[.]so$' || true)"
          SYMBOLS="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com[.]android[.]tools[.]build[.]debugsymbols/[^/]+/[^/]+[.](dbg|sym)$' || true)"
          REPORT=/tmp/native-symbol-report.txt
          : > "$REPORT"
          missing=0
          for abi in arm64-v8a armeabi-v7a x86 x86_64; do
            lib="base/lib/$abi/libandroidx.graphics.path.so"
            if grep -Fxq "$lib" <<< "$NATIVE_LIBS"; then
              missing=1
              echo "UNEXPECTED: $lib is still packaged even though the compatible Compose graph should not resolve graphics-path." | tee -a "$REPORT"
            else
              echo "CONFIRMED ABSENT: $lib" | tee -a "$REPORT"
            fi
          done
          if [[ -z "$NATIVE_LIBS" ]]; then
            echo "No native shared libraries are packaged; there are no native symbols to map." | tee -a "$REPORT"
          else
            printf '%s\\n' "$NATIVE_LIBS" | sort -u
            while IFS= read -r library; do
              [[ -n "$library" ]] || continue
              relative="\${library#base/lib/}"
              abi="\${relative%%/*}"
              filename="\${relative#*/}"
              stem="\${filename%.so}"
              symbol_dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
              found=0
              for symbol_name in "$stem.dbg" "$stem.sym" "$filename.dbg" "$filename.sym"; do
                if grep -Fxq "$symbol_dir/$symbol_name" <<< "$SYMBOLS"; then found=1; break; fi
              done
              if [[ "$found" -eq 0 ]]; then
                missing=1
                echo "MISSING: no matching native symbols for $library" | tee -a "$REPORT"
              fi
            done <<< "$NATIVE_LIBS"
          fi
          if [[ "$missing" -ne 0 ]]; then
            echo "::error::Strict native-symbol validation failed. Candidate blocked; signed release prohibited."
            exit 1
          fi
          echo "Strict native-symbol validation passed for every packaged native library."
          mkdir -p /tmp/release-candidate
          cp "$AAB_FILE" /tmp/release-candidate/release-candidate-v1.0.38.aab
          cp "$APK_FILE" /tmp/release-candidate/release-candidate-v1.0.38.apk
          cp /tmp/aab-manifest.xml /tmp/release-candidate/aab-manifest.xml
          cp /tmp/release-apk-badging.txt /tmp/release-candidate/release-apk-badging.txt
          cp "$REPORT" /tmp/release-candidate/native-symbol-report.txt
          cp /tmp/locale-coverage.json /tmp/release-candidate/locale-coverage.json

      - name: Upload CI evidence only (no Play Console publication)
        uses: actions/upload-artifact@v4
        with:
          name: android-validation-evidence-v1.0.38
          path: /tmp/release-candidate/
          if-no-files-found: error
          retention-days: 14
`,
  },
  {
    path: '.github/workflows/ci-release-gate.yml',
    name: 'ci-release-gate.yml',
    category: 'ci',
    language: 'yaml',
    description: 'Release gate with clean unit tests and built AAB metadata checks using the selected app version.',
    content: `name: Release Gate CI

on:
  push:
    branches:
      - fix/global-compatibility-localization-symbols-2026-10-18
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: release-gate-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Unit tests, locale coverage, dependencies, and AAB metadata
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 9.1.0
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '9.1.0'

      - name: Install Android NDK strip tools
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          SDKMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort | tail -n1)"
          if [[ -z "$SDKMANAGER" || ! -x "$SDKMANAGER" ]]; then
            echo "::error::Android sdkmanager is unavailable; cannot provision native strip tools."
            exit 1
          fi
          set +o pipefail
          yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/tmp/android-sdk-licenses.log 2>&1
          set -o pipefail
          "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "ndk;27.2.12479018"
          test -x "$ANDROID_HOME/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"
          echo "Pinned Android NDK strip tools are installed."

      - name: Run debug and release unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle clean testDebugUnitTest testReleaseUnitTest --max-workers=1 --stacktrace --no-daemon

      - name: Verify expanded Android locale resources and fallback policy
        run: python3 scripts/verify_android_locales.py

      - name: Verify selected Fragment runtime dependency
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:dependencyInsight --dependency androidx.fragment:fragment --configuration releaseRuntimeClasspath --console=plain | tee /tmp/fragment-release-dependency.txt
          if ! grep -Fq 'androidx.fragment:fragment:1.8.9' /tmp/fragment-release-dependency.txt; then
            echo "::error::Release runtime graph does not select androidx.fragment:fragment 1.8.9."
            exit 1
          fi
          echo "Resolved release runtime includes Fragment 1.8.9."

      - name: Verify optional Graphics Path JNI dependency is excluded
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:dependencyInsight --dependency androidx.compose.ui:ui-graphics-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/ui-graphics-release-dependency.txt
          if ! grep -Fq 'androidx.compose.ui:ui-graphics-android:1.6.8' /tmp/ui-graphics-release-dependency.txt; then
            echo "::error::Expected compatible Compose UI Graphics Android 1.6.8."
            exit 1
          fi
          gradle :app:dependencyInsight --dependency androidx.compose.material3:material3-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/material3-release-dependency.txt
          if ! grep -Fq 'androidx.compose.material3:material3-android:1.2.1' /tmp/material3-release-dependency.txt; then
            echo "::error::Expected Material 3 1.2.1 aligned with Compose BOM 2024.06.00."
            exit 1
          fi
          gradle :app:dependencies --configuration releaseRuntimeClasspath --console=plain | tee /tmp/release-runtime-dependencies.txt
          if grep -Fq 'androidx.graphics:graphics-path:' /tmp/release-runtime-dependencies.txt; then
            echo "::error::Graphics Path is still in releaseRuntimeClasspath; native-symbol blocker remains unresolved."
            exit 1
          fi
          if grep -R -n -E 'androidx[.]graphics[.]path|PathIterator|Path[.]iterate[[:space:]]*[(]' app/src/main/java/com/utility/devoptions; then
            echo "::error::App source uses PathIterator, which is not provided by the compatible Compose 1.6 line."
            exit 1
          fi
          echo "Compatible Compose 1.6.8 / Material 3 1.2.1 resolved, and graphics-path is absent from the release graph."
  
      - name: Build unsigned release AAB and APK without signing secrets
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
          RELEASE_SIGNING_MODE: unsigned
        run: gradle :app:bundleRelease :app:assembleRelease --stacktrace --no-daemon

      - name: Inspect actual AAB and enforce strict native-symbol availability
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          APK_FILE="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
          if [[ -z "$AAB_FILE" || ! -s "$AAB_FILE" || -z "$APK_FILE" || ! -s "$APK_FILE" ]]; then
            echo "::error::Release AAB or APK is missing or empty."
            exit 1
          fi
          echo "AAB_SHA256=$(sha256sum "$AAB_FILE" | awk '{print $1}')"
          echo "AAB_SIZE_BYTES=$(stat -c '%s' "$AAB_FILE")"
          AAB_FILE="$(realpath "$AAB_FILE")"
          mkdir -p /tmp/bundletool-inspector
          cat > /tmp/bundletool-inspector/settings.gradle <<'GRADLE'
          rootProject.name = 'bundletool-inspector'
          GRADLE
          cat > /tmp/bundletool-inspector/build.gradle <<'GRADLE'
          repositories {
              google()
              mavenCentral()
          }
          configurations { bundletoolRuntime }
          dependencies {
              bundletoolRuntime 'com.android.tools.build:bundletool:1.18.3'
          }
          tasks.register('dumpAabManifest', JavaExec) {
              def bundlePath = System.getenv('AAB_FILE')
              def outputPath = System.getenv('AAB_MANIFEST_OUT')
              if (!bundlePath || !outputPath) {
                  throw new GradleException('AAB_FILE and AAB_MANIFEST_OUT must be set.')
              }
              classpath = configurations.bundletoolRuntime
              mainClass.set('com.android.tools.build.bundletool.BundleToolMain')
              args 'dump', 'manifest', "--bundle=\${bundlePath}", '--module=base'
              standardOutput = new FileOutputStream(outputPath)
          }
          GRADLE
          AAB_MANIFEST_OUT=/tmp/aab-manifest.xml
          export AAB_FILE AAB_MANIFEST_OUT
          if ! gradle -p /tmp/bundletool-inspector dumpAabManifest --no-daemon --console=plain; then
            echo "::error::Bundletool failed to inspect the actual AAB manifest."
            exit 1
          fi
          if [[ ! -s "$AAB_MANIFEST_OUT" ]]; then
            echo "::error::Bundletool did not produce an AAB manifest."
            exit 1
          fi
          # Treat Gradle's release configuration as the source of truth to avoid stale
          # hard-coded version checks when versionCode/versionName are bumped.
          EXPECTED_VERSION_CODE="$(sed -nE 's/^[[:space:]]*versionCode[[:space:]]*=[[:space:]]*([0-9]+).*/\\1/p' android/app/build.gradle.kts | head -n1)"
          EXPECTED_VERSION_NAME="$(sed -nE 's/^[[:space:]]*versionName[[:space:]]*=[[:space:]]*"([^"]+)".*/\\1/p' android/app/build.gradle.kts | head -n1)"
          if [[ -z "$EXPECTED_VERSION_CODE" || -z "$EXPECTED_VERSION_NAME" ]]; then
            echo "::error::Could not read release version metadata from android/app/build.gradle.kts."
            exit 1
          fi

          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq "android:versionName=\\"$EXPECTED_VERSION_NAME\\"" /tmp/aab-manifest.xml
          grep -Fq "android:versionCode=\\"$EXPECTED_VERSION_CODE\\"" /tmp/aab-manifest.xml
          grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          echo "Actual AAB manifest verified: package=com.utility.devoptions minSdk=24 versionName=$EXPECTED_VERSION_NAME versionCode=$EXPECTED_VERSION_CODE"
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          test -n "$AAPT" && test -x "$AAPT"
          "$AAPT" dump badging "$APK_FILE" | tee /tmp/release-apk-badging.txt >/dev/null
          grep -F "package: name='com.utility.devoptions' versionCode='$EXPECTED_VERSION_CODE' versionName='$EXPECTED_VERSION_NAME'" /tmp/release-apk-badging.txt
          grep -F "sdkVersion:'24'" /tmp/release-apk-badging.txt
          FRAGMENT_VERSION="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version 2>/dev/null | tr -d '\\r\\n' || true)"
          if [[ "$FRAGMENT_VERSION" != "1.8.9" ]]; then
            echo "::error::Expected actual AAB to embed androidx.fragment:fragment 1.8.9."
            exit 1
          fi
          NATIVE_LIBS="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+[.]so$' || true)"
          SYMBOLS="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com[.]android[.]tools[.]build[.]debugsymbols/[^/]+/[^/]+[.](dbg|sym)$' || true)"
          REPORT=/tmp/native-symbol-report.txt
          : > "$REPORT"
          missing=0
          for abi in arm64-v8a armeabi-v7a x86 x86_64; do
            lib="base/lib/$abi/libandroidx.graphics.path.so"
            if grep -Fxq "$lib" <<< "$NATIVE_LIBS"; then
              missing=1
              echo "UNEXPECTED: $lib is still packaged even though the compatible Compose graph should not resolve graphics-path." | tee -a "$REPORT"
            else
              echo "CONFIRMED ABSENT: $lib" | tee -a "$REPORT"
            fi
          done
          if [[ -z "$NATIVE_LIBS" ]]; then
            echo "No native shared libraries are packaged; there are no native symbols to map." | tee -a "$REPORT"
          else
            printf '%s\\n' "$NATIVE_LIBS" | sort -u
            while IFS= read -r library; do
              [[ -n "$library" ]] || continue
              relative="\${library#base/lib/}"
              abi="\${relative%%/*}"
              filename="\${relative#*/}"
              stem="\${filename%.so}"
              symbol_dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
              found=0
              for symbol_name in "$stem.dbg" "$stem.sym" "$filename.dbg" "$filename.sym"; do
                if grep -Fxq "$symbol_dir/$symbol_name" <<< "$SYMBOLS"; then found=1; break; fi
              done
              if [[ "$found" -eq 0 ]]; then
                missing=1
                echo "MISSING: no matching native symbols for $library" | tee -a "$REPORT"
              fi
            done <<< "$NATIVE_LIBS"
          fi
          if [[ "$missing" -ne 0 ]]; then
            echo "::error::Strict native-symbol validation failed. Candidate blocked; signed release prohibited."
            exit 1
          fi
          echo "Strict native-symbol validation passed for every packaged native library."
          echo "Actual AAB metadata and strict native-symbol checks passed; signing remains protected."
          mkdir -p "$GITHUB_WORKSPACE/release-candidate"
          cp "$AAB_FILE" "$GITHUB_WORKSPACE/release-candidate/app-release-unsigned.aab"
          cp "$APK_FILE" "$GITHUB_WORKSPACE/release-candidate/app-release-unsigned.apk"
          cp /tmp/aab-manifest.xml /tmp/release-apk-badging.txt /tmp/native-symbol-report.txt "$GITHUB_WORKSPACE/release-candidate/"
          (
            cd "$GITHUB_WORKSPACE/release-candidate"
            sha256sum app-release-unsigned.aab app-release-unsigned.apk aab-manifest.xml release-apk-badging.txt native-symbol-report.txt > SHA256SUMS.txt
          )

      - name: Upload unsigned release candidate for download
        uses: actions/upload-artifact@v4
        with:
          name: unsigned-release-candidate-v1.0.38
          path: release-candidate/*
          if-no-files-found: error
          retention-days: 14
          compression-level: 0
`,
  },
  {
    path: '.github/workflows/build-release-aab.yml',
    name: 'build-release-aab.yml',
    category: 'docs',
    language: 'yaml',
    description: 'Automated GitHub Actions workflow building and signing production release AAB for Google Play Console',
    content: `name: Build & Sign Release AAB

# Production signing is only attempted on an explicitly marked release commit or manual dispatch.
# Ordinary pushes to main cannot publish a release.
on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - 'android/app/build.gradle.kts'
      - '.github/workflows/build-release-aab.yml'

permissions:
  contents: write

jobs:
  build:
    name: Test, inspect, sign, and publish App Bundle
    if: github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || contains(github.event.head_commit.message, '[publish-production]'))
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 9.1.0
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '9.1.0'

      - name: Install Android NDK strip tools
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          SDKMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort | tail -n1)"
          if [[ -z "$SDKMANAGER" || ! -x "$SDKMANAGER" ]]; then
            echo "::error::Android sdkmanager is unavailable; cannot provision native strip tools."
            exit 1
          fi
          set +o pipefail
          yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/tmp/android-sdk-licenses.log 2>&1
          set -o pipefail
          "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "ndk;27.2.12479018"
          test -x "$ANDROID_HOME/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"
          echo "Pinned Android NDK strip tools are installed."

      - name: Prevent reuse of release-v1.0.38 tag
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          set -euo pipefail
          if gh release view release-v1.0.38 --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "::error::release-v1.0.38 already exists. Approve the minSdk/Automatic Protection trade-off, select a higher unused version code, and update every metadata/tag expectation before signing."
            exit 1
          fi

      - name: Verify WorkManager R8 full-mode rules
        run: |
          set -euo pipefail
          grep -Fqx -- '-keep class androidx.work.** { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep class * extends androidx.work.Worker { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep class androidx.work.impl.WorkDatabase { *; }' android/app/proguard-rules.pro
          grep -Fqx -- '-keep public class androidx.work.impl.databases.* { *; }' android/app/proguard-rules.pro

      - name: Run clean debug and release JVM unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle clean testDebugUnitTest testReleaseUnitTest --max-workers=1 --stacktrace --no-daemon

      - name: Verify release dependencies
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:dependencyInsight --dependency androidx.fragment:fragment --configuration releaseRuntimeClasspath --console=plain | tee /tmp/fragment-release-dependency.txt
          if ! grep -Fq 'androidx.fragment:fragment:1.8.9' /tmp/fragment-release-dependency.txt; then
            echo "::error::Release runtime graph does not select androidx.fragment:fragment 1.8.9."
            exit 1
          fi
          gradle :app:dependencyInsight --dependency androidx.compose.ui:ui-graphics-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/ui-graphics-release-dependency.txt
          if ! grep -Fq 'androidx.compose.ui:ui-graphics-android:1.6.8' /tmp/ui-graphics-release-dependency.txt; then
            echo "::error::Expected compatible Compose UI Graphics Android 1.6.8."
            exit 1
          fi
          gradle :app:dependencyInsight --dependency androidx.compose.material3:material3-android --configuration releaseRuntimeClasspath --console=plain | tee /tmp/material3-release-dependency.txt
          if ! grep -Fq 'androidx.compose.material3:material3-android:1.2.1' /tmp/material3-release-dependency.txt; then
            echo "::error::Expected Material 3 1.2.1 aligned with Compose BOM 2024.06.00."
            exit 1
          fi
          gradle :app:dependencies --configuration releaseRuntimeClasspath --console=plain | tee /tmp/release-runtime-dependencies.txt
          if grep -Fq 'androidx.graphics:graphics-path:' /tmp/release-runtime-dependencies.txt; then
            echo "::error::Graphics Path is still in releaseRuntimeClasspath; native-symbol blocker remains unresolved."
            exit 1
          fi
          if grep -R -n -E 'androidx[.]graphics[.]path|PathIterator|Path[.]iterate[[:space:]]*[(]' app/src/main/java/com/utility/devoptions; then
            echo "::error::App source uses PathIterator, which is not provided by the compatible Compose 1.6 line."
            exit 1
          fi
          echo "Compatible Compose 1.6.8 / Material 3 1.2.1 resolved, and graphics-path is absent from the release graph."
  
      - name: Build unsigned AAB and APK for pre-sign validation
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
          RELEASE_SIGNING_MODE: unsigned
        shell: bash
        run: gradle clean :app:bundleRelease :app:assembleRelease --info --stacktrace --no-daemon 2>&1 | tee /tmp/unsigned-release-preflight.log

      - name: Validate unsigned AAB, version metadata, and strict native symbols before signing
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          APK_FILE="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
          if [[ -z "$AAB_FILE" || ! -s "$AAB_FILE" || -z "$APK_FILE" || ! -s "$APK_FILE" ]]; then
            echo "::error::Unsigned preflight AAB or APK is missing."
            exit 1
          fi
          echo "Unsigned preflight AAB_SHA256=$(sha256sum "$AAB_FILE" | awk '{print $1}')"
          AAB_FILE="$(realpath "$AAB_FILE")"
          mkdir -p /tmp/bundletool-inspector
          cat > /tmp/bundletool-inspector/settings.gradle <<'GRADLE'
          rootProject.name = 'bundletool-inspector'
          GRADLE
          cat > /tmp/bundletool-inspector/build.gradle <<'GRADLE'
          repositories {
              google()
              mavenCentral()
          }
          configurations { bundletoolRuntime }
          dependencies {
              bundletoolRuntime 'com.android.tools.build:bundletool:1.18.3'
          }
          tasks.register('dumpAabManifest', JavaExec) {
              def bundlePath = System.getenv('AAB_FILE')
              def outputPath = System.getenv('AAB_MANIFEST_OUT')
              if (!bundlePath || !outputPath) {
                  throw new GradleException('AAB_FILE and AAB_MANIFEST_OUT must be set.')
              }
              classpath = configurations.bundletoolRuntime
              mainClass.set('com.android.tools.build.bundletool.BundleToolMain')
              args 'dump', 'manifest', "--bundle=\${bundlePath}", '--module=base'
              standardOutput = new FileOutputStream(outputPath)
          }
          GRADLE
          AAB_MANIFEST_OUT=/tmp/aab-manifest.xml
          export AAB_FILE AAB_MANIFEST_OUT
          if ! gradle -p /tmp/bundletool-inspector dumpAabManifest --no-daemon --console=plain; then
            echo "::error::Bundletool failed to inspect the actual AAB manifest."
            exit 1
          fi
          if [[ ! -s "$AAB_MANIFEST_OUT" ]]; then
            echo "::error::Bundletool did not produce an AAB manifest."
            exit 1
          fi
          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionName="1.0.38"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionCode="20261028"' /tmp/aab-manifest.xml
          grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          echo "Actual AAB manifest verified: package=com.utility.devoptions minSdk=24 versionName=1.0.38 versionCode=20261028"
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          test -n "$AAPT" && test -x "$AAPT"
          "$AAPT" dump badging "$APK_FILE" | tee /tmp/release-apk-badging.txt >/dev/null
          grep -F "package: name='com.utility.devoptions' versionCode='20261028' versionName='1.0.38'" /tmp/release-apk-badging.txt
          grep -F "sdkVersion:'24'" /tmp/release-apk-badging.txt
          FRAGMENT="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version 2>/dev/null | tr -d '\\r\\n' || true)"
          if [[ "$FRAGMENT" != "1.8.9" ]]; then
            echo "::error::Expected Fragment metadata 1.8.9 but got \${FRAGMENT:-<missing>}."
            exit 1
          fi
          NATIVE_LIBS="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+[.]so$' || true)"
          SYMBOLS="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com[.]android[.]tools[.]build[.]debugsymbols/[^/]+/[^/]+[.](dbg|sym)$' || true)"
          REPORT=/tmp/native-symbol-report.txt
          : > "$REPORT"
          missing=0
          for abi in arm64-v8a armeabi-v7a x86 x86_64; do
            lib="base/lib/$abi/libandroidx.graphics.path.so"
            if grep -Fxq "$lib" <<< "$NATIVE_LIBS"; then
              missing=1
              echo "UNEXPECTED: $lib is still packaged even though the compatible Compose graph should not resolve graphics-path." | tee -a "$REPORT"
            else
              echo "CONFIRMED ABSENT: $lib" | tee -a "$REPORT"
            fi
          done
          if [[ -z "$NATIVE_LIBS" ]]; then
            echo "No native shared libraries are packaged; there are no native symbols to map." | tee -a "$REPORT"
          else
            printf '%s\\n' "$NATIVE_LIBS" | sort -u
            while IFS= read -r library; do
              [[ -n "$library" ]] || continue
              relative="\${library#base/lib/}"
              abi="\${relative%%/*}"
              filename="\${relative#*/}"
              stem="\${filename%.so}"
              symbol_dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
              found=0
              for symbol_name in "$stem.dbg" "$stem.sym" "$filename.dbg" "$filename.sym"; do
                if grep -Fxq "$symbol_dir/$symbol_name" <<< "$SYMBOLS"; then found=1; break; fi
              done
              if [[ "$found" -eq 0 ]]; then
                missing=1
                echo "MISSING: no matching native symbols for $library" | tee -a "$REPORT"
              fi
            done <<< "$NATIVE_LIBS"
          fi
          if [[ "$missing" -ne 0 ]]; then
            echo "::error::Strict native-symbol validation failed. Candidate blocked; signed release prohibited."
            exit 1
          fi
          echo "Strict native-symbol validation passed for every packaged native library."
          echo "Unsigned preflight passed; only now may the existing upload key be loaded."

      - name: Load existing upload keystore (no fallback)
        env:
          KEYSTORE_BASE64: \${{ secrets.KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: \${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: \${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: \${{ secrets.KEY_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [[ -z "\${KEYSTORE_BASE64:-}" || -z "\${KEYSTORE_PASSWORD:-}" || -z "\${KEY_ALIAS:-}" || -z "\${KEY_PASSWORD:-}" ]]; then
            echo "::error::A required existing upload-signing secret is missing. No replacement key will be generated."
            exit 1
          fi
          install -d -m 700 /tmp/registered-upload-key
          KEYSTORE_FILE=/tmp/registered-upload-key/upload.keystore
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE_FILE"
          chmod 600 "$KEYSTORE_FILE"
          keytool -list -keystore "$KEYSTORE_FILE" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" >/dev/null
          {
            echo "KEYSTORE_PATH=$KEYSTORE_FILE"
            echo "KEYSTORE_PASSWORD=$KEYSTORE_PASSWORD"
            echo "KEY_ALIAS=$KEY_ALIAS"
            echo "KEY_PASSWORD=$KEY_PASSWORD"
            echo "RELEASE_KEYSTORE_PATH=$KEYSTORE_FILE"
            echo "RELEASE_KEYSTORE_PASSWORD=$KEYSTORE_PASSWORD"
            echo "RELEASE_KEY_ALIAS=$KEY_ALIAS"
            echo "RELEASE_KEY_PASSWORD=$KEY_PASSWORD"
            echo "RELEASE_SIGNING_MODE=keystore"
          } >> "$GITHUB_ENV"
          echo "Existing configured upload key and alias are accessible; credential values were not printed."

      - name: Build AAB and APK using existing upload key
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle clean :app:bundleRelease :app:assembleRelease --info --stacktrace --no-daemon 2>&1 | tee /tmp/signed-release-build.log

      - name: Verify built bundle metadata, native symbols and upload signature
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          APK_FILE="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
          if [[ -z "$AAB_FILE" || ! -s "$AAB_FILE" || -z "$APK_FILE" || ! -s "$APK_FILE" ]]; then
            echo "::error::Signed release AAB or APK is missing."
            exit 1
          fi
          echo "Signed AAB_SHA256=$(sha256sum "$AAB_FILE" | awk '{print $1}')"
          echo "Signed AAB_SIZE_BYTES=$(stat -c '%s' "$AAB_FILE")"
          AAB_FILE="$(realpath "$AAB_FILE")"
          mkdir -p /tmp/bundletool-inspector
          cat > /tmp/bundletool-inspector/settings.gradle <<'GRADLE'
          rootProject.name = 'bundletool-inspector'
          GRADLE
          cat > /tmp/bundletool-inspector/build.gradle <<'GRADLE'
          repositories {
              google()
              mavenCentral()
          }
          configurations { bundletoolRuntime }
          dependencies {
              bundletoolRuntime 'com.android.tools.build:bundletool:1.18.3'
          }
          tasks.register('dumpAabManifest', JavaExec) {
              def bundlePath = System.getenv('AAB_FILE')
              def outputPath = System.getenv('AAB_MANIFEST_OUT')
              if (!bundlePath || !outputPath) {
                  throw new GradleException('AAB_FILE and AAB_MANIFEST_OUT must be set.')
              }
              classpath = configurations.bundletoolRuntime
              mainClass.set('com.android.tools.build.bundletool.BundleToolMain')
              args 'dump', 'manifest', "--bundle=\${bundlePath}", '--module=base'
              standardOutput = new FileOutputStream(outputPath)
          }
          GRADLE
          AAB_MANIFEST_OUT=/tmp/aab-manifest.xml
          export AAB_FILE AAB_MANIFEST_OUT
          if ! gradle -p /tmp/bundletool-inspector dumpAabManifest --no-daemon --console=plain; then
            echo "::error::Bundletool failed to inspect the actual AAB manifest."
            exit 1
          fi
          if [[ ! -s "$AAB_MANIFEST_OUT" ]]; then
            echo "::error::Bundletool did not produce an AAB manifest."
            exit 1
          fi
          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionName="1.0.38"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionCode="20261028"' /tmp/aab-manifest.xml
          grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          echo "Actual AAB manifest verified: package=com.utility.devoptions minSdk=24 versionName=1.0.38 versionCode=20261028"
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          test -n "$AAPT" && test -x "$AAPT"
          "$AAPT" dump badging "$APK_FILE" | tee /tmp/release-apk-badging.txt >/dev/null
          grep -F "package: name='com.utility.devoptions' versionCode='20261028' versionName='1.0.38'" /tmp/release-apk-badging.txt
          grep -F "sdkVersion:'24'" /tmp/release-apk-badging.txt
          FRAGMENT="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version 2>/dev/null | tr -d '\\r\\n' || true)"
          if [[ "$FRAGMENT" != "1.8.9" ]]; then
            echo "::error::Expected Fragment metadata 1.8.9 but got \${FRAGMENT:-<missing>}."
            exit 1
          fi
          echo "AAB Fragment metadata verified: $FRAGMENT"

          expected_sha256="$(keytool -list -v -keystore "$KEYSTORE_PATH" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" | awk '/SHA256:/{print $2; exit}' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
          test -n "$expected_sha256"
          if ! jarsigner -verify "$AAB_FILE" >/tmp/jarsigner-verify.txt 2>&1; then
            echo "::error::AAB signature verification failed."
            cat /tmp/jarsigner-verify.txt
            exit 1
          fi
          actual_sha256="$(keytool -printcert -jarfile "$AAB_FILE" | awk '/SHA256:/{print $2; exit}' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
          if [[ -z "$actual_sha256" || "$expected_sha256" != "$actual_sha256" ]]; then
            echo "::error::AAB signer does not match the existing upload certificate."
            exit 1
          fi
          echo "AAB signature matches the configured existing upload certificate."

          # Explicitly align and sign the production APK with both required signature schemes.
          # Some AGP configurations emit only v2 even when v1 was requested, so re-sign here
          # with the existing production/upload certificate and verify the final artifact.
          ZIPALIGN="$(find "$ANDROID_HOME/build-tools" -type f -name zipalign | sort -V | tail -n1)"
          APKSIGNER="$(find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort -V | tail -n1)"
          test -n "$ZIPALIGN" && test -x "$ZIPALIGN"
          test -n "$APKSIGNER" && test -x "$APKSIGNER"
          ALIGNED_APK=/tmp/app-release-aligned.apk
          SIGNED_APK=/tmp/app-release-production-signed.apk
          "$ZIPALIGN" -f -v 4 "$APK_FILE" "$ALIGNED_APK" | tee /tmp/zipalign-before-signing.txt
          "$APKSIGNER" sign \\
            --ks "$KEYSTORE_PATH" \\
            --ks-key-alias "$KEY_ALIAS" \\
            --ks-pass env:KEYSTORE_PASSWORD \\
            --key-pass env:KEY_PASSWORD \\
            --min-sdk-version 1 \\
            --v1-signing-enabled true \\
            --v2-signing-enabled true \\
            --out "$SIGNED_APK" \\
            "$ALIGNED_APK"
          test -s "$SIGNED_APK"
          mv "$SIGNED_APK" "$APK_FILE"
          "$ZIPALIGN" -c -v 4 "$APK_FILE" | tee /tmp/zipalign-verification.txt

          # Verify v1 using a pre-N verifier range. On the app's actual minSdk 24,
          # apksigner's default verification reports v1 as false because v2 is preferred,
          # even when a valid v1 block is present. This override tests the v1 signature;
          # it does not change the app manifest's minSdkVersion.
          "$APKSIGNER" verify --min-sdk-version 1 --verbose --print-certs "$APK_FILE" 2>&1 | tee /tmp/apk-signature-verification.txt
          grep -Fq 'Verified using v1 scheme (JAR signing): true' /tmp/apk-signature-verification.txt
          grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' /tmp/apk-signature-verification.txt

          apk_sha256="$(awk -F': ' '/certificate SHA-256 digest:/{print $NF; exit}' /tmp/apk-signature-verification.txt | tr -d ':' | tr '[:upper:]' '[:lower:]')"
          if [[ -z "$apk_sha256" || "$apk_sha256" != "$expected_sha256" ]]; then
            echo "::error::APK signer does not match the existing upload certificate."
            exit 1
          fi
          echo "APK signature uses v1 and v2, is zip-aligned, and matches the existing upload certificate."

          NATIVE_LIBS="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+[.]so$' || true)"
          SYMBOLS="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com[.]android[.]tools[.]build[.]debugsymbols/[^/]+/[^/]+[.](dbg|sym)$' || true)"
          REPORT=/tmp/native-symbol-report.txt
          : > "$REPORT"
          missing=0
          for abi in arm64-v8a armeabi-v7a x86 x86_64; do
            lib="base/lib/$abi/libandroidx.graphics.path.so"
            if grep -Fxq "$lib" <<< "$NATIVE_LIBS"; then
              missing=1
              echo "UNEXPECTED: $lib is still packaged even though the compatible Compose graph should not resolve graphics-path." | tee -a "$REPORT"
            else
              echo "CONFIRMED ABSENT: $lib" | tee -a "$REPORT"
            fi
          done
          if [[ -z "$NATIVE_LIBS" ]]; then
            echo "No native shared libraries are packaged; there are no native symbols to map." | tee -a "$REPORT"
          else
            printf '%s\\n' "$NATIVE_LIBS" | sort -u
            while IFS= read -r library; do
              [[ -n "$library" ]] || continue
              relative="\${library#base/lib/}"
              abi="\${relative%%/*}"
              filename="\${relative#*/}"
              stem="\${filename%.so}"
              symbol_dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
              found=0
              for symbol_name in "$stem.dbg" "$stem.sym" "$filename.dbg" "$filename.sym"; do
                if grep -Fxq "$symbol_dir/$symbol_name" <<< "$SYMBOLS"; then found=1; break; fi
              done
              if [[ "$found" -eq 0 ]]; then
                missing=1
                echo "MISSING: no matching native symbols for $library" | tee -a "$REPORT"
              fi
            done <<< "$NATIVE_LIBS"
          fi
          if [[ "$missing" -ne 0 ]]; then
            echo "::error::Strict native-symbol validation failed. Candidate blocked; signed release prohibited."
            exit 1
          fi
          echo "Strict native-symbol validation passed for every packaged native library."
          SYMBOL_ZIP="$(find android/app/build/outputs/native-debug-symbols/release -type f -name 'native-debug-symbols.zip' -print -quit 2>/dev/null || true)"
          if [[ -n "$SYMBOL_ZIP" && -s "$SYMBOL_ZIP" ]]; then
            symbol_bytes="$(stat -c '%s' "$SYMBOL_ZIP")"
            echo "Native symbols ZIP bytes: $symbol_bytes"
            if (( symbol_bytes > 1600000000 )); then
              echo "::error::Native symbols ZIP exceeds Play's 1.6 GB limit."
              exit 1
            fi
          fi
          mkdir -p /tmp/aab_release
          cp "$AAB_FILE" /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.aab
          cp "$APK_FILE" /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.apk
          test -s /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.aab
          test -s /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.apk
          (
            cd /tmp/aab_release
            sha256sum Developers-Options-Shortcut-v1.0.38.aab Developers-Options-Shortcut-v1.0.38.apk > SHA256SUMS.txt
          )

      - name: Upload signed APK and AAB workflow artifacts
        uses: actions/upload-artifact@v4
        with:
          name: signed-release-assets-v1.0.38
          path: |
            /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.aab
            /tmp/aab_release/Developers-Options-Shortcut-v1.0.38.apk
            /tmp/aab_release/SHA256SUMS.txt
          if-no-files-found: error
          retention-days: 30

      - name: Publish verified AAB to GitHub Release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          set -euo pipefail
          TAG_NAME=release-v1.0.38
          ASSET_AAB=/tmp/aab_release/Developers-Options-Shortcut-v1.0.38.aab
          ASSET_APK=/tmp/aab_release/Developers-Options-Shortcut-v1.0.38.apk
          ASSET_CHECKSUMS=/tmp/aab_release/SHA256SUMS.txt
          test -s "$ASSET_AAB"
          test -s "$ASSET_APK"
          test -s "$ASSET_CHECKSUMS"
          if gh release view "$TAG_NAME" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "::error::Release tag $TAG_NAME already exists. Refusing to overwrite an existing release asset."
            exit 1
          fi
          gh release create "$TAG_NAME" "$ASSET_AAB" "$ASSET_APK" "$ASSET_CHECKSUMS" --repo "$GITHUB_REPOSITORY" \\
            --title "Developers Options Shortcut v1.0.38 — Signed APK and AAB" \\
            --target "\${{ github.sha }}" \\
            --notes "Verified signed APK for direct installation and signed AAB for manual Google Play Console upload. APK alignment, v1/v2 signatures, package/version metadata, native symbols, and the existing upload certificate were verified. No Play Console upload or rollout performed."
`
  },
  {
    path: 'build.gradle.kts',
    name: 'build.gradle.kts (Root)',
    category: 'gradle',
    language: 'kotlin',
    description: 'Top-level Gradle build configuration with Android & Kotlin Compose plugins',
    content: `// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
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
    description: 'Synchronized from native Android and CI validation sources.',
    content: `[versions]
agp = "9.0.1"
kotlin = "2.2.10"
coreKtx = "1.15.0"
appcompat = "1.7.1"
playAppUpdate = "2.1.0"
playReview = "2.0.2"
fragment = "1.8.9"
lifecycleRuntimeKtx = "2.8.7"
activityCompose = "1.9.0"
composeBom = "2024.06.00"
material3 = "1.2.1"
playServicesAds = "23.6.0"
userMessagingPlatform = "3.1.0"
coroutines = "1.9.0"
billingKtx = "8.0.0"
securityCrypto = "1.1.0-alpha06"
junit = "4.13.2"
androidxTestExtJunit = "1.2.1"
espressoCore = "3.6.1"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-appcompat = { group = "androidx.appcompat", name = "appcompat", version.ref = "appcompat" }
play-app-update-ktx = { group = "com.google.android.play", name = "app-update-ktx", version.ref = "playAppUpdate" }
play-review-ktx = { group = "com.google.android.play", name = "review-ktx", version.ref = "playReview" }
androidx-fragment = { group = "androidx.fragment", name = "fragment", version.ref = "fragment" }
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
billing-ktx = { group = "com.android.billingclient", name = "billing-ktx", version.ref = "billingKtx" }
androidx-security-crypto = { group = "androidx.security", name = "security-crypto", version.ref = "securityCrypto" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
androidx-test-ext-junit = { group = "androidx.test.ext", name = "junit", version.ref = "androidxTestExtJunit" }
androidx-espresso-core = { group = "androidx.test.espresso", name = "espresso-core", version.ref = "espressoCore" }
androidx-compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
androidx-compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
kotlinx-coroutines-test = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-test", version.ref = "coroutines" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
`,
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

# AGP 9 otherwise generates only debug unit-test tasks; keep release tests in CI.
android.onlyEnableUnitTestForTheTestedBuildType=false
`
  },
  {
    path: 'app/proguard-rules.pro',
    name: 'proguard-rules.pro',
    category: 'gradle',
    language: 'text',
    description: 'Android release R8 full-mode keep rules including WorkManager startup safeguards.',
    content: `# R8 rules for Developer Options Shortcut.
#
# Google Mobile Ads and UMP ship their own consumer rules.
# Avoid keeping entire ad SDK namespaces, which disables R8 shrinking.
# Add narrow rules only for confirmed reflection regressions.

# Keep Kotlin metadata and runtime annotations used by Kotlin reflection and generated code.
# Compose libraries supply their own consumer rules; retain metadata without keeping all of Compose.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable
-keep class kotlin.Metadata { *; }

# Kotlin Coroutines dispatcher/service-loader discovery and volatile state.
# kotlinx-coroutines also contributes its own library consumer rules.
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# Manifest-declared Android components are already roots for R8. Preserve names for the
# application/activity entry points as an additional safeguard for platform/reflection lookups.
-keepnames class com.utility.devoptions.DevOptionsApplication
-keepnames class com.utility.devoptions.MainActivity

# Preserve the transitive WorkManager runtime under R8 full mode.
# Google Mobile Ads brings in work-runtime; verify startup behavior on affected devices.
-keep class androidx.work.** { *; }
-keep class * extends androidx.work.Worker { *; }
-keep class androidx.work.impl.WorkDatabase { *; }
-keep public class androidx.work.impl.databases.* { *; }
`,
  },
  {
    path: 'app/build.gradle.kts',
    name: 'build.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Release signing modes:
// - debug (default): produce an installable local release APK using the standard debug key.
// - keystore: use the existing upload/release keystore supplied through environment variables.
// - unsigned: create an unsigned candidate for protected pre-sign validation only.
val releaseKeystorePath = providers.environmentVariable("RELEASE_KEYSTORE_PATH").orNull
val releaseKeystorePassword = providers.environmentVariable("RELEASE_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("RELEASE_KEY_PASSWORD").orNull
val releaseSigningInputs = listOf(
    releaseKeystorePath,
    releaseKeystorePassword,
    releaseKeyAlias,
    releaseKeyPassword
)
val anyReleaseSigningInputProvided = releaseSigningInputs.any { !it.isNullOrBlank() }
val allReleaseSigningInputsProvided = releaseSigningInputs.all { !it.isNullOrBlank() }
val requestedReleaseSigningMode = providers.environmentVariable("RELEASE_SIGNING_MODE")
    .orNull
    ?.trim()
    ?.lowercase()
val releaseSigningMode = requestedReleaseSigningMode
    ?: if (anyReleaseSigningInputProvided) "keystore" else "debug"

require(releaseSigningMode in setOf("debug", "keystore", "unsigned")) {
    "RELEASE_SIGNING_MODE must be one of: debug, keystore, or unsigned."
}
require(!anyReleaseSigningInputProvided || allReleaseSigningInputsProvided) {
    "Release keystore signing requires RELEASE_KEYSTORE_PATH, RELEASE_KEYSTORE_PASSWORD, RELEASE_KEY_ALIAS, and RELEASE_KEY_PASSWORD."
}
require(releaseSigningMode != "keystore" || allReleaseSigningInputsProvided) {
    "RELEASE_SIGNING_MODE=keystore requires all four RELEASE_KEYSTORE_* / RELEASE_KEY_* environment variables."
}

android {
    namespace = "com.utility.devoptions"
    compileSdk = 36
    ndkVersion = "27.2.12479018"

    defaultConfig {
        applicationId = "com.utility.devoptions"
        minSdk = 24
        targetSdk = 36
        versionCode = 20261028
        versionName = "1.0.38"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        getByName("debug") {
            enableV1Signing = true
            enableV2Signing = true
        }
        create("release") {
            enableV1Signing = true
            enableV2Signing = true

            if (releaseSigningMode == "keystore") {
                val keystore = file(requireNotNull(releaseKeystorePath))
                require(keystore.isFile) {
                    "RELEASE_KEYSTORE_PATH does not point to an existing keystore file."
                }
                storeFile = keystore
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
            }
        }
    }

    buildTypes {
        release {
            signingConfig = when (releaseSigningMode) {
                "unsigned" -> null
                "keystore" -> signingConfigs.getByName("release")
                else -> signingConfigs.getByName("debug")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            ndk {
                // Include native function names, source files, and line numbers in Play crash reports.
                debugSymbolLevel = "FULL"
            }
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

// AGP 9 uses built-in Kotlin instead of the standalone kotlin-android plugin.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

configurations.configureEach {
    // Exclude the upstream pre-stripped PathIterator JNI module from every variant/configuration.
    // App source has no PathIterator usage; CI fails if the artifact reappears.
    exclude(group = "androidx.graphics", module = "graphics-path")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.play.app.update.ktx)
    implementation(libs.play.review.ktx)
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

    // Google Play Billing
    implementation(libs.billing.ktx)

    // EncryptedSharedPreferences (Security Crypto)
    implementation(libs.androidx.security.crypto)

    // Keep Fragment on a maintained release compatible with minSdk 24.
    implementation(libs.androidx.fragment)

    // Standard Unit & UI Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
`,
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
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="com.android.vending.BILLING" />

    <application
        android:name=".DevOptionsApplication"
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:localeConfig="@xml/locale_config"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.DevOptions"
        tools:targetApi="36">

        <meta-data
            android:name="com.google.android.gms.ads.APPLICATION_ID"
            android:value="ca-app-pub-4783826505860771~9544574215" />

        <service
            android:name="androidx.appcompat.app.AppLocalesMetadataHolderService"
            android:enabled="false"
            android:exported="false">
            <meta-data android:name="autoStoreLocales" android:value="true" />
        </service>

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
    description: 'Play-confirmed update checking, validated connectivity and coordinated optional prompts.',
    content: `package com.utility.devoptions

import android.os.Bundle
import android.util.Log
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.review.ReviewManagerFactory
import com.utility.devoptions.util.ExternalActions
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.utility.devoptions.ads.AdManager
import com.utility.devoptions.data.billing.BillingManager
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import com.utility.devoptions.util.IntentHelper
import com.utility.devoptions.viewmodel.DeveloperOptionsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.first

class MainActivity : AppCompatActivity() {
    companion object { private const val TAG = "MainActivity" }
    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private val adManager: AdManager by lazy(LazyThreadSafetyMode.NONE) {
        (application as DevOptionsApplication).adManager
    }
    private lateinit var billingManager: BillingManager
    private lateinit var appUpdateManager: AppUpdateManager
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var validatedInternet = false
    private var updateConfirmedByPlay = false
    private var consentUiResolved = false
    private var offlineShownThisSession = false
    private var automaticReviewInFlight = false
    private var activePrompt: AppPrompt? by mutableStateOf(null)
    private val promptPrefs by lazy { getSharedPreferences("app_prompt_state", Context.MODE_PRIVATE) }
    private var sessionCount = 0
    private val promptNow get() = System.currentTimeMillis()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lifecycle.addObserver(viewModel)
        connectivityManager = getSystemService(ConnectivityManager::class.java)
        // BillingManager now performs keystore/cache reads on Dispatchers.IO.
        billingManager = BillingManager(applicationContext)
        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isAdsRemoved by billingManager.isAdsRemoved.collectAsState()
                val isAdsCacheLoaded by billingManager.cacheLoaded.collectAsState()
                val adsRemovalEntitlementKnown by billingManager.adsRemovalEntitlementKnown.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()
                var showEnablementGuide by remember { mutableStateOf(false) }
                var selectedLanguageTag by remember {
                    mutableStateOf(runCatching { AppLanguageController.currentLanguageTag(this@MainActivity) }.getOrDefault("system"))
                }
                var suggestedLanguageTag by remember {
                    mutableStateOf(runCatching { AppLanguageController.pendingSuggestion(this@MainActivity) }.getOrNull())
                }

                LaunchedEffect(isAdsRemoved) { adManager.setAdsRemoved(isAdsRemoved) }

                val handleOpenResult: (IntentHelper.OpenResult) -> Unit = { result ->
                    when (result) {
                        IntentHelper.OpenResult.Success -> Unit
                        is IntentHelper.OpenResult.SuccessWithMessage -> {
                            coroutineScope.launch { snackbarHostState.showSnackbar(result.message) }
                        }
                        is IntentHelper.OpenResult.FallbackToDeviceInfo,
                        is IntentHelper.OpenResult.GuideRequired -> {
                            showEnablementGuide = true
                        }
                        is IntentHelper.OpenResult.Error -> {
                            showEnablementGuide = true
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    result.message.ifBlank { getString(R.string.settings_open_failed) }
                                )
                            }
                        }
                    }
                }

                MainScreen(
                    uiState = uiState,
                    snackbarHostState = snackbarHostState,
                    isAdsRemoved = isAdsRemoved,
                    isAdsCacheLoaded = isAdsCacheLoaded,
                    adsRemovalEntitlementKnown = adsRemovalEntitlementKnown,
                    onRemoveAds = {
                        billingManager.launchPurchaseFlow(this@MainActivity) { success, msg ->
                            if (!success && msg != null) {
                                coroutineScope.launch {
                                    snackbarHostState.showSnackbar(getString(R.string.play_store_error_format, msg))
                                }
                            }
                        }
                    },
                    onOpenDeveloperOptions = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openDeveloperOptions(this@MainActivity))
                        }
                    },
                    onOpenUsbDebugging = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openUsbDebugging(this@MainActivity))
                        }
                    },
                    onOpenWirelessDebugging = {
                        recordMeaningfulAction()
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openWirelessDebugging(this@MainActivity))
                        }
                    },
                    onOpenAboutPhone = {
                        showEnablementGuide = false
                        handleOpenResult(IntentHelper.openAboutPhone(this@MainActivity))
                    },
                    showEnablementGuide = showEnablementGuide,
                    onDismissEnablementGuide = { showEnablementGuide = false },
                    selectedLanguageTag = selectedLanguageTag,
                    onSelectLanguage = { languageTag ->
                        AppLanguageController.selectLanguage(this@MainActivity, languageTag)
                        selectedLanguageTag = AppLanguageController.currentLanguageTag(this@MainActivity)
                        suggestedLanguageTag = AppLanguageController.pendingSuggestion(this@MainActivity)
                    },
                    suggestedLanguageTag = suggestedLanguageTag,
                    onLanguageSuggestionHandled = { acceptedLanguageTag ->
                        AppLanguageController.handleSuggestion(this@MainActivity, acceptedLanguageTag)
                        selectedLanguageTag = AppLanguageController.currentLanguageTag(this@MainActivity)
                        suggestedLanguageTag = null
                    },
                    onShareApp = {
                        val result = IntentHelper.shareApplication(this@MainActivity)
                        if (result is IntentHelper.OpenResult.Error) {
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar(
                                    result.message.ifBlank { getString(R.string.settings_open_failed) }
                                )
                            }
                        }
                    },
                    onManualRefresh = {
                        recordMeaningfulAction()
                        viewModel.refreshAll()
                        coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.status_updated)) }
                    },
                    activeAppPrompt = activePrompt,
                    onDismissAppPrompt = { dismissPrompt(it) },
                    onUpdateNow = {
                        activePrompt = null
                        if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                    },
                    onOpenInternetSettings = {
                        if (ExternalActions.openNetworkSettings(this@MainActivity)) activePrompt = null
                        else coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.offline_settings_unavailable)) }
                    },
                    onReviewOnGooglePlay = {
                        activePrompt = null
                        promptPrefs.edit().putLong("auto_review_last_request", promptNow).apply()
                        try {
                            val manager = ReviewManagerFactory.create(this@MainActivity)
                            manager.requestReviewFlow().addOnSuccessListener { info ->
                                manager.launchReviewFlow(this@MainActivity, info).addOnCompleteListener { reconcilePrompt() }
                            }.addOnFailureListener {
                                if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                                reconcilePrompt()
                            }
                        } catch (_: Exception) {
                            if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                            reconcilePrompt()
                        }
                    },
                    onShareWithFriends = {
                        activePrompt = null
                        val shareResult = IntentHelper.shareApplication(this@MainActivity)
                        if (shareResult is IntentHelper.OpenResult.Error) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.share_unavailable)) }
                        reconcilePrompt()
                    },
                    onRateOnGooglePlay = {
                        if (!ExternalActions.openPlayListing(this@MainActivity)) coroutineScope.launch { snackbarHostState.showSnackbar(getString(R.string.play_store_unavailable)) }
                    },
                    shouldRequestAutomaticReview = sessionCount > 0 && validatedInternet && PromptPolicy.shouldRequestAutomaticReview(
                        sessionCount, promptPrefs.getInt("meaningful_actions", 0),
                        promptPrefs.getLong("auto_review_last_request", 0L),
                        promptPrefs.getLong("review_prompt_last_shown", 0L), promptNow
                    ),
                    onRequestAutomaticReview = { maybeLaunchAutomaticReview() }
                )
            }
        }

        // Optional network and ad SDK work is not part of the critical startup path.
        window.decorView.post {
            if (!isFinishing && !isDestroyed) initializeOptionalServices()
        }
        lifecycleScope.launch(Dispatchers.IO) {
            val count = try {
                val state = promptPrefs
                val value = state.getInt("session_count", 0).coerceAtLeast(0) + 1
                state.edit().putInt("session_count", value).apply()
                value
            } catch (e: Exception) {
                Log.w(TAG, "Cannot read prompt session count", e)
                1
            }
            withContext(Dispatchers.Main) {
                if (!isDestroyed) {
                    sessionCount = count
                    reconcilePrompt()
                }
            }
        }
    }

    private fun initializeOptionalServices() {
        try {
            appUpdateManager = AppUpdateManagerFactory.create(this)
            checkPlayUpdateAvailability()
        } catch (e: Exception) {
            Log.w(TAG, "Play update service unavailable", e)
        }
        lifecycleScope.launch {
            // Avoid a banner or ad request before we have loaded the local purchase cache.
            billingManager.cacheLoaded.first { it }
            if (isFinishing || isDestroyed) return@launch
            try {
                adManager.setAdsRemoved(billingManager.isAdsRemoved.value)
                adManager.initializeConsentAndAds(this@MainActivity, {}, onConsentFlowComplete = {
                    runOnUiThread {
                        if (!isDestroyed) {
                            consentUiResolved = true
                            reconcilePrompt()
                        }
                    }
                })
            } catch (e: Exception) {
                Log.e(TAG, "Ad/consent SDK startup failed; app remains usable", e)
                consentUiResolved = true
                reconcilePrompt()
            }
        }
    }

    override fun onDestroy() {
        if (::billingManager.isInitialized) billingManager.close()
        runCatching { adManager.onActivityDestroyed(this) }
            .onFailure { Log.w(TAG, "Ad cleanup failed", it) }
        lifecycle.removeObserver(viewModel)
        super.onDestroy()
    }

    override fun onStart() { super.onStart(); registerConnectivityCallback(); refreshConnectivity() }
    override fun onResume() { super.onResume(); checkPlayUpdateAvailability(); refreshConnectivity(); maybeLaunchAutomaticReview() }
    override fun onStop() {
        networkCallback?.let { callback ->
            try { connectivityManager?.unregisterNetworkCallback(callback) }
            catch (e: Exception) { Log.w(TAG, "Network callback cleanup failed", e) }
        }
        networkCallback = null
        super.onStop()
    }
    private fun registerConnectivityCallback() {
        val manager = connectivityManager ?: return
        if (networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { refreshConnectivity() }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { refreshConnectivity() }
            override fun onLost(network: Network) { refreshConnectivity() }
        }
        networkCallback = callback
        try { manager.registerDefaultNetworkCallback(callback) }
        catch (e: Exception) {
            Log.w(TAG, "Network registration failed", e)
            networkCallback = null
        }
    }
    private fun refreshConnectivity() {
        val manager = connectivityManager ?: return
        val capabilities = try { manager.getNetworkCapabilities(manager.activeNetwork) }
            catch (e: Exception) { Log.w(TAG, "Network status unavailable", e); null }
        runOnUiThread {
            if (!isDestroyed) {
                validatedInternet = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
                reconcilePrompt()
            }
        }
    }
    private fun checkPlayUpdateAvailability() {
        if (!::appUpdateManager.isInitialized) return
        try {
            appUpdateManager.appUpdateInfo.addOnSuccessListener { info ->
                updateConfirmedByPlay = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                reconcilePrompt()
            }.addOnFailureListener { updateConfirmedByPlay = false; reconcilePrompt() }
        } catch (_: Exception) { updateConfirmedByPlay = false }
    }
    private fun dismissPrompt(prompt: AppPrompt) {
        if (prompt == AppPrompt.OFFLINE) offlineShownThisSession = true
        if (activePrompt == prompt) activePrompt = null
        reconcilePrompt()
    }
    private fun reconcilePrompt() {
        if (!consentUiResolved || sessionCount <= 0 || isFinishing || isDestroyed) return

        val now = promptNow
        val selected = PromptPolicy.selectPrompt(
            current = activePrompt,
            consentResolved = consentUiResolved,
            updateConfirmed = updateConfirmedByPlay,
            lastUpdateShown = promptPrefs.getLong("update_prompt_last_shown", 0L),
            validatedInternet = validatedInternet,
            offlineShownThisSession = offlineShownThisSession,
            sessions = sessionCount,
            meaningfulActions = promptPrefs.getInt("meaningful_actions", 0),
            lastReviewPromptShown = promptPrefs.getLong("review_prompt_last_shown", 0L),
            lastAnyPromptShown = promptPrefs.getLong("last_any_prompt_shown", 0L),
            now = now
        )
        if (selected == activePrompt) return

        if (selected != null) {
            val editor = promptPrefs.edit().putLong("last_any_prompt_shown", now)
            when (selected) {
                AppPrompt.UPDATE -> editor.putLong("update_prompt_last_shown", now)
                AppPrompt.OFFLINE -> offlineShownThisSession = true
                AppPrompt.REVIEW -> editor.putLong("review_prompt_last_shown", now)
            }
            editor.apply()
        }
        activePrompt = selected
    }

    private fun recordMeaningfulAction() {
        promptPrefs.edit().putInt("meaningful_actions", promptPrefs.getInt("meaningful_actions", 0) + 1).apply()
    }
    private fun maybeLaunchAutomaticReview() {
        if (!consentUiResolved || sessionCount <= 0 || isFinishing || isDestroyed || automaticReviewInFlight || activePrompt != null || !validatedInternet) return
        val now = promptNow
        if (!PromptPolicy.shouldRequestAutomaticReview(sessionCount, promptPrefs.getInt("meaningful_actions", 0),
                promptPrefs.getLong("auto_review_last_request", 0L), promptPrefs.getLong("review_prompt_last_shown", 0L), now) ||
            !PromptPolicy.cooldownElapsed(promptPrefs.getLong("last_any_prompt_shown", 0L), now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS)) return
        automaticReviewInFlight = true
        promptPrefs.edit().putLong("auto_review_last_request", now).putLong("last_any_prompt_shown", now).apply()
        try {
            val manager = ReviewManagerFactory.create(this)
            manager.requestReviewFlow().addOnSuccessListener { info ->
                manager.launchReviewFlow(this, info).addOnCompleteListener { automaticReviewInFlight = false }
            }.addOnFailureListener { automaticReviewInFlight = false }
        } catch (_: Exception) { automaticReviewInFlight = false }
    }
}
`,
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
import kotlinx.coroutines.Dispatchers
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
        viewModelScope.launch(Dispatchers.IO) {
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
        viewModelScope.launch(Dispatchers.IO) {
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
    description: 'Existing AdMob/UMP integration with consent-completion prompt coordination.',
    content: `package com.utility.devoptions.ads

import android.app.Activity
import android.content.Context
import android.util.Log
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
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
import java.lang.ref.WeakReference
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AdManager handles Google AdMob SDK initialization, UMP Consent,
 * and preloads Interstitial Ads with a strict 3-tap frequency cap.
 * Follows Google Play and AdMob Disallowed Implementation policies:
 * never blocks the user from entering Settings, even if ads fail or are dismissed.
 *
 * The manager is application-scoped so locale-driven Activity recreation cannot reset
 * the SDK initialization guard or launch duplicate UMP consent requests.
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
    private var isAdsRemoved: Boolean = false
    private val isMobileAdsInitializeCalled = AtomicBoolean(false)
    private val startupScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var latestActivity = WeakReference<Activity>(null)
    private var consentInformation: ConsentInformation? = null
    private var consentUpdateStarted = false
    private var consentUpdateCompleted = false
    private var consentFormPending = false
    private var consentFormLoading = false
    private var consentFormCompleted = false
    private var latestOnReady: (() -> Unit)? = null
    private var latestConsentFlowComplete: (() -> Unit)? = null

    /**
     * Updates the Ad Removal status.
     * When ads are removed, any preloaded interstitial is immediately cleared and all future loads no-op.
     */
    fun setAdsRemoved(removed: Boolean) {
        isAdsRemoved = removed
        if (removed) {
            interstitialAd = null
            Log.i(TAG, "Ad removal activated. Interstitial ads and banners completely disabled.")
        }
    }

    fun isAdsRemoved(): Boolean = isAdsRemoved

    /**
     * Initializes UMP once per process and remembers the most recently created Activity.
     * When the locale changes, MainActivity is recreated. The pending consent callback is then
     * routed to the current live Activity rather than attempting to show a form on a destroyed one.
     */
    fun initializeConsentAndAds(
        activity: Activity,
        onReady: () -> Unit = {},
        onConsentFlowComplete: () -> Unit = {}
    ) {
        latestActivity = WeakReference(activity)
        latestOnReady = onReady
        latestConsentFlowComplete = onConsentFlowComplete
        if (isAdsRemoved) {
            Log.d(TAG, "Ads already removed. Skipping ad consent and initialization.")
            onReady()
            onConsentFlowComplete()
            return
        }
        if (consentFormCompleted) onConsentFlowComplete()

        val params = ConsentRequestParameters.Builder()
            .setTagForUnderAgeOfConsent(false)
            .build()
        val info = UserMessagingPlatform.getConsentInformation(activity)
        consentInformation = info

        // Existing consent can permit ad requests while UMP refreshes consent status.
        if (info.canRequestAds() && !isAdsRemoved) {
            initializeMobileAds()
        }

        if (consentUpdateStarted) {
            if (consentUpdateCompleted && consentFormPending) {
                showConsentFormIfRequired()
            }
            return
        }

        consentUpdateStarted = true
        info.requestConsentInfoUpdate(
            activity,
            params,
            {
                consentUpdateCompleted = true
                showConsentFormIfRequired()
            },
            { requestConsentError ->
                Log.w(TAG, "Consent request error: \${requestConsentError.message}")
                // Allow the next Activity creation/resume to retry a failed consent-info request.
                consentUpdateStarted = false
                consentUpdateCompleted = false
                latestConsentFlowComplete?.invoke()
                if (info.canRequestAds() && !isAdsRemoved) {
                    initializeMobileAds()
                } else {
                    latestOnReady?.invoke()
                }
            }
        )
    }

    /**
     * UMP requires an Activity to display its consent form. Never pass an Activity after
     * onDestroy(); hold a weak reference and defer if locale-driven recreation is in progress.
     */
    private fun showConsentFormIfRequired() {
        if (isAdsRemoved) {
            latestOnReady?.invoke()
            latestConsentFlowComplete?.invoke()
            return
        }
        if (consentFormLoading) return
        if (consentFormCompleted) {
            latestConsentFlowComplete?.invoke()
            return
        }

        val activity = latestActivity.get()
        if (activity == null || activity.isFinishing || activity.isDestroyed) {
            consentFormPending = true
            Log.d(TAG, "Consent form deferred until a live Activity is available.")
            return
        }

        val info = consentInformation ?: UserMessagingPlatform.getConsentInformation(activity)
        consentFormPending = false
        consentFormLoading = true
        UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity) { formError ->
            consentFormLoading = false
            consentFormCompleted = true
            consentFormPending = false
            if (formError != null) {
                Log.w(TAG, "Consent form error: \${formError.message}")
            }
            latestConsentFlowComplete?.invoke()
            if (info.canRequestAds() && !isAdsRemoved) {
                initializeMobileAds()
            } else {
                latestOnReady?.invoke()
            }
        }
    }

    /** Clear destroyed Activities; in-flight UMP callbacks will wait for the next Activity. */
    fun onActivityDestroyed(activity: Activity) {
        if (latestActivity.get() === activity) {
            latestActivity.clear()
            latestConsentFlowComplete = null
            latestOnReady = null
            if (!consentFormCompleted) consentFormPending = consentUpdateCompleted
        }
    }

    private fun initializeMobileAds() {
        if (isAdsRemoved || isMobileAdsInitializeCalled.getAndSet(true)) return

        // SDK initialization can perform disk I/O. Keeping it off the UI thread
        // avoids blocking input dispatch during Activity startup on slower devices.
        startupScope.launch {
            try {
                MobileAds.initialize(context) { status ->
                    mainHandler.post {
                        Log.d(TAG, "MobileAds initialized: $status")
                        if (!isAdsRemoved) preloadInterstitial() // Ad load API needs main thread.
                        latestOnReady?.invoke()
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "MobileAds initialization failed", e)
                isMobileAdsInitializeCalled.set(false)
                mainHandler.post { latestOnReady?.invoke() }
            }
        }
    }

    /**
     * Preloads an interstitial ad in the background.
     */
    fun preloadInterstitial() {
        if (isAdsRemoved || interstitialAd != null || isAdLoading) return

        isAdLoading = true
        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(
            context,
            TEST_INTERSTITIAL_ID,
            adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    if (isAdsRemoved) {
                        interstitialAd = null
                        isAdLoading = false
                        return
                    }
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
     * - If ads are removed, immediately executes [onProceed] without delay or ad.
     * - Increments click counter
     * - If clickCount % 3 == 0 and ad is ready, displays the interstitial
     * - Automatically proceeds with [onProceed] whether the ad is dismissed, fails to show, or is not ready
     * - Strict fail-open guarantee: [onProceed] is ALWAYS executed.
     */
    fun handleActionClick(activity: Activity, onProceed: () -> Unit) {
        if (isAdsRemoved) {
            onProceed()
            return
        }

        clickCounter++
        val shouldShowAd = (clickCounter % INTERSTITIAL_FREQUENCY_CAP == 0)

        val currentAd = interstitialAd
        if (shouldShowAd && currentAd != null) {
            currentAd.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    interstitialAd = null
                    if (!isAdsRemoved) preloadInterstitial()
                    onProceed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                    Log.w(TAG, "Interstitial failed to show: \${adError.message}")
                    interstitialAd = null
                    if (!isAdsRemoved) preloadInterstitial()
                    onProceed()
                }

                override fun onAdShowedFullScreenContent() {
                    Log.d(TAG, "Interstitial showed successfully.")
                }
            }
            currentAd.show(activity)
        } else {
            // Not every tap shows an ad, or ad is still loading -> immediately execute action!
            if (!isAdsRemoved && interstitialAd == null && !isAdLoading) {
                preloadInterstitial()
            }
            onProceed()
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt',
    name: 'BillingManager.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Google Play Billing 8.0.0 manager with in-app purchase flow, acknowledgment, and AES256 EncryptedSharedPreferences persistence',
    content: `package com.utility.devoptions.data.billing

import android.app.Activity
import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Play Billing 8 single-purchase controller. All secure preferences work runs on IO.
 * Connection attempts are coalesced and purchase-flow retries are never recursive.
 */
class BillingManager(
    private val context: Context,
    private val coroutineScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "BillingManager"
        const val PRODUCT_ID_REMOVE_ADS = "remove_ads_permanent"
        private const val PREFS_FILE = "secure_devoptions_billing_prefs"
        private const val KEY_ADS_REMOVED = "key_ads_removed_permanently"
        private const val KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN = "key_ads_removal_entitlement_known"
    }

    private val prefs: SharedPreferences by lazy { initSecurePreferences() }

    private val _isAdsRemoved = MutableStateFlow(false)
    val isAdsRemoved: StateFlow<Boolean> = _isAdsRemoved.asStateFlow()
    private val _adsRemovalEntitlementKnown = MutableStateFlow(false)
    val adsRemovalEntitlementKnown: StateFlow<Boolean> = _adsRemovalEntitlementKnown.asStateFlow()
    private val _cacheLoaded = MutableStateFlow(false)
    val cacheLoaded: StateFlow<Boolean> = _cacheLoaded.asStateFlow()
    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails: StateFlow<ProductDetails?> = _productDetails.asStateFlow()

    @Volatile private var playEntitlementResolved = false
    @Volatile private var closed = false
    private var connectionInProgress = false
    private val pendingConnectionCallbacks = mutableListOf<(Boolean) -> Unit>()

    private val billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
        )
        .build()

    init {
        // Keystore may block during device startup; never read it on Activity.onCreate.
        coroutineScope.launch {
            try {
                val cache = prefs
                val removed = cache.getBoolean(KEY_ADS_REMOVED, false)
                val known = cache.getBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, removed)
                if (!playEntitlementResolved && !closed) {
                    _isAdsRemoved.value = removed
                    _adsRemovalEntitlementKnown.value = known
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not read secure billing preferences", e)
            } finally {
                // Render paid-user banner only after cached entitlement has been read.
                _cacheLoaded.value = true
            }
        }
        Handler(Looper.getMainLooper()).post {
            if (!closed) startBillingConnection()
        }
    }

    private fun initSecurePreferences(): SharedPreferences {
        return try {
            val key = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
            EncryptedSharedPreferences.create(
                context, PREFS_FILE, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "Encrypted preferences unavailable; using local fallback", e)
            context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        }
    }

    /**
     * The callback is invoked when connected. Connection failure does not trigger
     * recursion or a synchronous retry.
     */
    fun startBillingConnection(onConnected: () -> Unit = {}) {
        ensureConnected { ready -> if (ready) onConnected() }
    }

    private fun ensureConnected(onResult: (Boolean) -> Unit) {
        if (closed) { onResult(false); return }
        if (billingClient.isReady) { onResult(true); return }
        pendingConnectionCallbacks.add(onResult)
        if (connectionInProgress) return
        connectionInProgress = true
        try {
            billingClient.startConnection(object : BillingClientStateListener {
                override fun onBillingSetupFinished(result: BillingResult) {
                    connectionInProgress = false
                    val ready = !closed && result.responseCode == BillingClient.BillingResponseCode.OK
                    if (ready) {
                        queryExistingPurchases()
                        queryProductDetails()
                    } else {
                        Log.w(TAG, "Billing connection unavailable: " + result.responseCode)
                    }
                    finishConnection(ready)
                }
                override fun onBillingServiceDisconnected() {
                    connectionInProgress = false
                    finishConnection(false)
                    Log.w(TAG, "Billing disconnected; retry on next user interaction")
                }
            })
        } catch (e: Exception) {
            connectionInProgress = false
            Log.w(TAG, "Billing connection failed", e)
            finishConnection(false)
        }
    }

    private fun finishConnection(ready: Boolean) {
        val pending = pendingConnectionCallbacks.toList()
        pendingConnectionCallbacks.clear()
        pending.forEach { callback ->
            try { callback(ready) }
            catch (e: Exception) { Log.e(TAG, "Billing callback failed", e) }
        }
    }

    private fun queryProductDetails(onResult: ((ProductDetails?) -> Unit)? = null) {
        if (closed || !billingClient.isReady) { onResult?.invoke(null); return }
        val products = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID_REMOVE_ADS)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )
        val params = QueryProductDetailsParams.newBuilder().setProductList(products).build()
        try {
            billingClient.queryProductDetailsAsync(params) { result, response ->
                val detail = if (!closed && result.responseCode == BillingClient.BillingResponseCode.OK) {
                    response.productDetailsList.firstOrNull { it.productId == PRODUCT_ID_REMOVE_ADS }
                } else null
                if (detail != null) _productDetails.value = detail
                if (detail == null) Log.w(TAG, "Remove Ads product unavailable: " + result.responseCode)
                onResult?.invoke(detail)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Product query failed", e)
            onResult?.invoke(null)
        }
    }

    /** Never revoke cached entitlement after a failed Play query. */
    fun queryExistingPurchases(onResult: ((Boolean) -> Unit)? = null) {
        if (closed || !billingClient.isReady) { onResult?.invoke(false); return }
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP).build()
        try {
            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (!closed && result.responseCode == BillingClient.BillingResponseCode.OK) {
                    playEntitlementResolved = true
                    val owned = purchases.any {
                        it.products.contains(PRODUCT_ID_REMOVE_ADS) &&
                            it.purchaseState == Purchase.PurchaseState.PURCHASED
                    }
                    purchases.filter {
                        it.products.contains(PRODUCT_ID_REMOVE_ADS) &&
                            it.purchaseState == Purchase.PurchaseState.PURCHASED &&
                            !it.isAcknowledged
                    }.forEach { acknowledgePurchase(it) }
                    setAdsRemovedState(owned)
                    onResult?.invoke(owned)
                } else {
                    Log.w(TAG, "Could not confirm purchases: " + result.responseCode)
                    onResult?.invoke(false)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase query failed", e)
            onResult?.invoke(false)
        }
    }

    /**
     * One connection attempt and at most one product-details query per user action.
     * The old code called launchPurchaseFlow() from its own callback indefinitely.
     */
    fun launchPurchaseFlow(activity: Activity, onComplete: (Boolean, String?) -> Unit) {
        val details = _productDetails.value
        if (billingClient.isReady && details != null) {
            launchWithDetails(activity, details, onComplete)
            return
        }
        ensureConnected { ready ->
            if (!ready) {
                onComplete(false, "Google Play Billing is unavailable. Please try again.")
            } else {
                queryProductDetails { fetched ->
                    if (fetched == null) {
                        onComplete(false, "Remove Ads is temporarily unavailable. Please try again.")
                    } else {
                        launchWithDetails(activity, fetched, onComplete)
                    }
                }
            }
        }
    }

    private fun launchWithDetails(
        activity: Activity, details: ProductDetails, onComplete: (Boolean, String?) -> Unit
    ) {
        if (closed || activity.isFinishing || activity.isDestroyed || !billingClient.isReady) {
            onComplete(false, "Purchase cannot start right now.")
            return
        }
        try {
            val flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(
                    listOf(BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details).build())
                ).build()
            val result = billingClient.launchBillingFlow(activity, flow)
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onComplete(false, result.debugMessage)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase sheet failed", e)
            onComplete(false, "Google Play Billing is unavailable.")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: List<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach { handlePurchase(it) }
        } else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.w(TAG, "Purchase callback error: " + result.responseCode)
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS) &&
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            // Ownership is valid even while a Play acknowledgement request is pending.
            setAdsRemovedState(true)
            if (!purchase.isAcknowledged) acknowledgePurchase(purchase)
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken).build()
        try {
            billingClient.acknowledgePurchase(params) { result ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Purchase acknowledgement failed: " + result.responseCode)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Purchase acknowledgement failed", e)
        }
    }

    private fun setAdsRemovedState(removed: Boolean) {
        if (closed) return
        _isAdsRemoved.value = removed
        _adsRemovalEntitlementKnown.value = true
        coroutineScope.launch {
            try {
                prefs.edit()
                    .putBoolean(KEY_ADS_REMOVED, removed)
                    .putBoolean(KEY_ADS_REMOVAL_ENTITLEMENT_KNOWN, true)
                    .apply()
            } catch (e: Exception) {
                Log.w(TAG, "Could not persist Play entitlement", e)
            }
        }
    }

    fun restorePurchases(onResult: (Boolean) -> Unit) {
        ensureConnected { ready ->
            if (ready) queryExistingPurchases(onResult)
            else onResult(false)
        }
    }

    fun close() {
        closed = true
        pendingConnectionCallbacks.clear()
        try { billingClient.endConnection() }
        catch (e: Exception) { Log.w(TAG, "Billing cleanup failed", e) }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/util/IntentHelper.kt',
    name: 'IntentHelper.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions.util

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.utility.devoptions.R

/** Public Android Settings intent routing. This helper never changes protected system settings. */
object IntentHelper {
    sealed class OpenResult {
        data object Success : OpenResult()
        data class SuccessWithMessage(val message: String) : OpenResult()
        data class FallbackToDeviceInfo(val reason: String) : OpenResult()
        data class GuideRequired(val reason: String) : OpenResult()
        data class Error(val exception: Throwable, val message: String = exception.localizedMessage ?: "") : OpenResult()
    }

    /** Launch Developer Options only when the system reports it enabled or its state is unknown. */
    fun openDeveloperOptions(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        return if (tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) == null) {
            OpenResult.Success
        } else {
            OpenResult.GuideRequired(context.getString(R.string.developer_options_unavailable_guide))
        }
    }

    fun openUsbDebugging(context: Context): OpenResult =
        when (val result = openDeveloperOptions(context)) {
            OpenResult.Success -> OpenResult.SuccessWithMessage(context.getString(R.string.usb_debugging_guidance))
            is OpenResult.GuideRequired -> result
            is OpenResult.Error -> result
            is OpenResult.FallbackToDeviceInfo -> result
            is OpenResult.SuccessWithMessage -> result
        }

    /** There is no verified public Wireless Debugging intent; use the standard Settings destinations. */
    fun openWirelessDebugging(context: Context): OpenResult {
        if (developmentSettingsEnabled(context) == false) {
            return OpenResult.GuideRequired(context.getString(R.string.developer_options_disabled_guide))
        }
        val developmentFailure = tryStart(context, Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
        if (developmentFailure == null) {
            val messageRes = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                R.string.wireless_debugging_guidance
            } else {
                R.string.wireless_debugging_unavailable
            }
            return OpenResult.SuccessWithMessage(context.getString(messageRes))
        }
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.wireless_debugging_fallback_guidance))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun openAboutPhone(context: Context): OpenResult {
        val aboutFailure = tryStart(context, Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
        if (aboutFailure == null) return OpenResult.Success
        val settingsFailure = tryStart(context, Intent(Settings.ACTION_SETTINGS))
        if (settingsFailure == null) {
            return OpenResult.SuccessWithMessage(context.getString(R.string.about_phone_fallback_settings))
        }
        return OpenResult.Error(settingsFailure, context.getString(R.string.settings_open_failed))
    }

    fun shareApplication(context: Context): OpenResult {
        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.share_subject))
            putExtra(Intent.EXTRA_TEXT, context.getString(R.string.share_message, "com.utility.devoptions"))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(shareIntent, context.getString(R.string.share_app)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(chooser)
            OpenResult.Success
        } catch (e: ActivityNotFoundException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: SecurityException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        } catch (e: IllegalArgumentException) {
            OpenResult.Error(e, context.getString(R.string.share_unavailable))
        }
    }

    private fun developmentSettingsEnabled(context: Context): Boolean? = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1
    } catch (_: Settings.SettingNotFoundException) {
        null
    } catch (_: SecurityException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    /** Returns null only when Android accepted the intent. */
    private fun tryStart(context: Context, intent: Intent): Throwable? = try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        e
    } catch (e: SecurityException) {
        e
    } catch (e: IllegalArgumentException) {
        e
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt',
    name: 'MainScreen.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Compose UI with the sixteen-language picker and localized informational prompts.',
    content: `package com.utility.devoptions.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Usb
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.AppPrompt
import com.utility.devoptions.OfflineMessagePolicy
import com.utility.devoptions.OfflineMessageVariant
import com.utility.devoptions.R
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.components.BannerAdView
import com.utility.devoptions.ui.components.DeviceInfoCard
import com.utility.devoptions.ui.components.StatusBadge

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    uiState: DevStatusUiState,
    snackbarHostState: SnackbarHostState,
    isAdsRemoved: Boolean = false,
    isAdsCacheLoaded: Boolean = true,
    adsRemovalEntitlementKnown: Boolean = true,
    onRemoveAds: () -> Unit = {},
    onOpenDeveloperOptions: () -> Unit,
    onShareApp: () -> Unit,
    onManualRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenUsbDebugging: () -> Unit = {},
    onOpenWirelessDebugging: () -> Unit = {},
    onOpenAboutPhone: () -> Unit = {},
    showEnablementGuide: Boolean = false,
    onDismissEnablementGuide: () -> Unit = {},
    selectedLanguageTag: String = "en",
    onSelectLanguage: (String) -> Unit = {},
    suggestedLanguageTag: String? = null,
    onLanguageSuggestionHandled: (String?) -> Unit = {},
    activeAppPrompt: AppPrompt? = null,
    onDismissAppPrompt: (AppPrompt) -> Unit = {},
    onUpdateNow: () -> Unit = {},
    onOpenInternetSettings: () -> Unit = {},
    onReviewOnGooglePlay: () -> Unit = {},
    onShareWithFriends: () -> Unit = {},
    onRateOnGooglePlay: () -> Unit = {},
    onRequestAutomaticReview: () -> Unit = {},
    shouldRequestAutomaticReview: Boolean = false
) {
    val scrollState = rememberScrollState()
    var showLanguagePicker by remember { mutableStateOf(false) }
    val languageChoices = listOf(
        "en" to stringResource(R.string.language_english),
        "ru" to stringResource(R.string.language_russian),
        "hi" to stringResource(R.string.language_hindi),
        "es" to stringResource(R.string.language_spanish),
        "fr" to stringResource(R.string.language_french),
        "ar" to stringResource(R.string.language_arabic),
        "zh-CN" to stringResource(R.string.language_chinese),
        "bn" to stringResource(R.string.language_bengali),
        "de" to stringResource(R.string.language_german),
        "id" to stringResource(R.string.language_indonesian),
        "it" to stringResource(R.string.language_italian),
        "ja" to stringResource(R.string.language_japanese),
        "ko" to stringResource(R.string.language_korean),
        "pt-BR" to stringResource(R.string.language_portuguese),
        "tr" to stringResource(R.string.language_turkish),
        "vi" to stringResource(R.string.language_vietnamese),
        "kn" to stringResource(R.string.language_kannada),
        "ta" to stringResource(R.string.language_tamil),
        "te" to stringResource(R.string.language_telugu)
    )

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_app_logo),
                            contentDescription = stringResource(R.string.app_name),
                            modifier = Modifier.size(28.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.app_name),
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { showLanguagePicker = true }, modifier = Modifier.padding(end = 1.dp)) {
                        Icon(Icons.Default.Language, contentDescription = stringResource(R.string.select_language))
                    }
                    if (!isAdsRemoved) {
                        IconButton(onClick = onRemoveAds, modifier = Modifier.padding(end = 1.dp)) {
                            Icon(
                                imageVector = Icons.Default.Block,
                                contentDescription = stringResource(R.string.remove_ads_description),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    } else {
                        IconButton(onClick = {}, modifier = Modifier.padding(end = 1.dp)) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = stringResource(R.string.ad_free_activated),
                                tint = Color(0xFF4CAF50)
                            )
                        }
                    }
                    IconButton(onClick = onManualRefresh) {
                        Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.refresh_status))
                    }
                    IconButton(onClick = onShareApp) {
                        Icon(Icons.Default.Share, contentDescription = stringResource(R.string.share_application))
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        bottomBar = {
            if (!isAdsRemoved && isAdsCacheLoaded) {
                // Keep the banner above gesture navigation and the three-button navigation bar.
                BannerAdView(
                    modifier = Modifier.navigationBarsPadding(),
                    isAdsRemoved = false
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = stringResource(R.string.real_time_settings_inspector),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                letterSpacing = 1.sp
            )
            StatusCard(
                title = stringResource(R.string.dev_options_status),
                subtitle = stringResource(R.string.developer_options_status_description),
                isEnabled = uiState.isDeveloperOptionsEnabled,
                icon = { Icon(Icons.Default.Code, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer) },
                iconBackground = MaterialTheme.colorScheme.primaryContainer
            )
            StatusCard(
                title = stringResource(R.string.usb_debugging_status),
                subtitle = stringResource(R.string.usb_debugging_status_description),
                isEnabled = uiState.isUsbDebuggingEnabled,
                icon = { Icon(Icons.Default.Usb, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer) },
                iconBackground = MaterialTheme.colorScheme.secondaryContainer
            )
            Button(
                onClick = onOpenDeveloperOptions,
                modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.open_dev_options), modifier = Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                // Stack actions on narrow devices or with enlarged system text to keep labels readable.
                val compactLayout = maxWidth < 360.dp || LocalDensity.current.fontScale >= 1.25f
                if (compactLayout) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ResponsiveOutlinedActionButton(onClick = onOpenUsbDebugging, label = stringResource(R.string.usb_debugging), icon = Icons.Default.Usb, labelFontSize = 12.sp, modifier = Modifier.fillMaxWidth())
                        ResponsiveOutlinedActionButton(onClick = onOpenWirelessDebugging, label = stringResource(R.string.wireless_debugging), icon = Icons.Default.Wifi, labelFontSize = 12.sp, modifier = Modifier.fillMaxWidth())
                    }
                } else {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        ResponsiveOutlinedActionButton(onClick = onOpenUsbDebugging, label = stringResource(R.string.usb_debugging), icon = Icons.Default.Usb, labelFontSize = 12.sp, modifier = Modifier.weight(1f))
                        ResponsiveOutlinedActionButton(onClick = onOpenWirelessDebugging, label = stringResource(R.string.wireless_debugging), icon = Icons.Default.Wifi, labelFontSize = 12.sp, modifier = Modifier.weight(1f))
                    }
                }
            }
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val compactLayout = maxWidth < 360.dp || LocalDensity.current.fontScale >= 1.25f
                if (compactLayout) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        ResponsiveOutlinedActionButton(onClick = onManualRefresh, label = stringResource(R.string.refresh_status), icon = Icons.Default.Refresh, modifier = Modifier.fillMaxWidth())
                        ResponsiveOutlinedActionButton(onClick = onShareApp, label = stringResource(R.string.share_app), icon = Icons.Default.Share, modifier = Modifier.fillMaxWidth())
                    }
                } else {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        ResponsiveOutlinedActionButton(onClick = onManualRefresh, label = stringResource(R.string.refresh_status), icon = Icons.Default.Refresh, modifier = Modifier.weight(1f))
                        ResponsiveOutlinedActionButton(onClick = onShareApp, label = stringResource(R.string.share_app), icon = Icons.Default.Share, modifier = Modifier.weight(1f))
                    }
                }
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Build, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.enablement_guide_title), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    }
                    Text(stringResource(R.string.how_to_unlock_desc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stringResource(R.string.enablement_guide_step_1), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_2), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_3), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_4), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.enablement_guide_step_5), style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.manual_enablement_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = onOpenAboutPhone, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.open_about_phone), modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    }
                }
            }
            DeviceInfoCard(uiState = uiState)
            OutlinedButton(onClick = onRateOnGooglePlay, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = RoundedCornerShape(12.dp)) {
                Text(stringResource(R.string.rate_on_google_play), modifier = Modifier.weight(1f).padding(vertical = 2.dp), textAlign = TextAlign.Center)
            }
            Spacer(modifier = Modifier.height(8.dp))
        }
    }

    if (showLanguagePicker) {
        AlertDialog(
            onDismissRequest = { showLanguagePicker = false },
            title = { Text(stringResource(R.string.language_picker_title)) },
            text = {
                Column(
                    modifier = Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())
                ) {
                    languageChoices.forEach { (tag, label) ->
                        LanguageChoice(tag, label, selectedLanguageTag) {
                            showLanguagePicker = false
                            onSelectLanguage(tag)
                        }
                    }
                    LanguageChoice("system", stringResource(R.string.language_system_default), selectedLanguageTag) {
                        showLanguagePicker = false
                        onSelectLanguage("system")
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showLanguagePicker = false }) { Text(stringResource(R.string.done)) } }
        )
    }

    // Informational prompts share one exclusive slot and yield to language/enablement dialogs.
    if (activeAppPrompt != null && !showLanguagePicker && !showEnablementGuide && suggestedLanguageTag == null) {
        when (activeAppPrompt) {
            AppPrompt.UPDATE -> AlertDialog(
                onDismissRequest = { onDismissAppPrompt(AppPrompt.UPDATE) },
                title = { Text(stringResource(R.string.update_available_title), maxLines = 2, overflow = TextOverflow.Ellipsis) },
                text = { Text(stringResource(R.string.update_available_message), modifier = Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) },
                confirmButton = { TextButton(onClick = onUpdateNow) { Text(stringResource(R.string.update_now)) } },
                dismissButton = { TextButton(onClick = { onDismissAppPrompt(AppPrompt.UPDATE) }) { Text(stringResource(R.string.later)) } }
            )
            AppPrompt.OFFLINE -> {
                val offlineMessageRes = when (OfflineMessagePolicy.choose(isAdsRemoved, adsRemovalEntitlementKnown)) {
                    OfflineMessageVariant.AD_SUPPORTED -> R.string.offline_ad_supported_message
                    OfflineMessageVariant.AD_FREE -> R.string.offline_support_message
                    OfflineMessageVariant.UNVERIFIED -> R.string.offline_purchase_unverified_message
                }
                AlertDialog(
                    onDismissRequest = { onDismissAppPrompt(AppPrompt.OFFLINE) },
                    title = { Text(stringResource(R.string.offline_title), maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    text = { Column(Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(stringResource(offlineMessageRes), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } },
                    confirmButton = { TextButton(onClick = onOpenInternetSettings) { Text(stringResource(R.string.internet_settings), modifier = Modifier.padding(horizontal = 2.dp)) } },
                    dismissButton = { TextButton(onClick = { onDismissAppPrompt(AppPrompt.OFFLINE) }) { Text(stringResource(R.string.not_now)) } }
                )
            }
            AppPrompt.REVIEW -> AlertDialog(
                onDismissRequest = { onDismissAppPrompt(AppPrompt.REVIEW) },
                title = { Text(stringResource(R.string.review_prompt_title), maxLines = 3, overflow = TextOverflow.Ellipsis) },
                text = { Column(Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.review_prompt_message))
                    TextButton(onClick = onReviewOnGooglePlay) { Text(stringResource(R.string.review_on_google_play)) }
                    TextButton(onClick = onShareWithFriends) { Text(stringResource(R.string.share_with_friends)) }
                    TextButton(onClick = { onDismissAppPrompt(AppPrompt.REVIEW) }) { Text(stringResource(R.string.review_not_now)) }
                } },
                confirmButton = {}, dismissButton = {}
            )
        }
    }
    androidx.compose.runtime.LaunchedEffect(shouldRequestAutomaticReview, activeAppPrompt, showLanguagePicker, showEnablementGuide, suggestedLanguageTag) {
        if (shouldRequestAutomaticReview && activeAppPrompt == null && !showLanguagePicker && !showEnablementGuide && suggestedLanguageTag == null) onRequestAutomaticReview()
    }

    if (showEnablementGuide) {
        AlertDialog(
            onDismissRequest = onDismissEnablementGuide,
            title = { Text(stringResource(R.string.enablement_guide_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.enablement_guide_step_1))
                    Text(stringResource(R.string.enablement_guide_step_2))
                    Text(stringResource(R.string.enablement_guide_step_3))
                    Text(stringResource(R.string.enablement_guide_step_4))
                    Text(stringResource(R.string.enablement_guide_step_5))
                    Text(stringResource(R.string.manual_enablement_note), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = { TextButton(onClick = onOpenAboutPhone) { Text(stringResource(R.string.open_about_phone)) } },
            dismissButton = { TextButton(onClick = onDismissEnablementGuide) { Text(stringResource(R.string.done)) } }
        )
    }

    if (suggestedLanguageTag != null) {
        AlertDialog(
            onDismissRequest = { onLanguageSuggestionHandled(null) },
            title = { Text(stringResource(R.string.language_suggestion_title)) },
            text = {
                Text(stringResource(
                    R.string.language_suggestion_message,
                    nativeLanguageName(suggestedLanguageTag)
                ))
            },
            confirmButton = {
                TextButton(onClick = { onLanguageSuggestionHandled(suggestedLanguageTag) }) {
                    Text(stringResource(R.string.language_switch_to_suggested))
                }
            },
            dismissButton = {
                TextButton(onClick = { onLanguageSuggestionHandled(null) }) {
                    Text(stringResource(R.string.language_continue_english))
                }
            }
        )
    }
}

@Composable
private fun ResponsiveOutlinedActionButton(
    onClick: () -> Unit,
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    labelFontSize: TextUnit = 13.sp
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = 56.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        // Explicitly constrain the content row to the button's available width. The weighted
        // text then wraps for long translations instead of measuring against an unconstrained
        // intrinsic width and clipping at the button edge.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(imageVector = icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                modifier = Modifier.weight(1f),
                fontSize = labelFontSize,
                textAlign = TextAlign.Center,
                softWrap = true
            )
        }
    }
}

@Composable
private fun StatusCard(
    title: String,
    subtitle: String,
    isEnabled: Boolean,
    icon: @Composable () -> Unit,
    iconBackground: Color
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f))
    ) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(iconBackground), contentAlignment = Alignment.Center) { icon() }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(subtitle, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f))
                }
            }
            Spacer(Modifier.width(8.dp))
            StatusBadge(isEnabled = isEnabled)
        }
    }
}

@Composable
private fun LanguageChoice(tag: String, label: String, selectedTag: String, onSelected: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onSelected).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selectedTag == tag, onClick = onSelected)
        Text(label, modifier = Modifier.weight(1f).padding(start = 4.dp), style = MaterialTheme.typography.bodyLarge)
    }
}


private fun nativeLanguageName(tag: String): String = when (tag.lowercase(java.util.Locale.ROOT)) {
    "en" -> "English"; "ru" -> "Русский"; "hi" -> "हिन्दी"; "es" -> "Español"; "fr" -> "Français"
    "ar" -> "العربية"; "zh-cn", "zh" -> "简体中文"; "bn" -> "বাংলা"; "de" -> "Deutsch"
    "id" -> "Bahasa Indonesia"; "it" -> "Italiano"; "ja" -> "日本語"; "ko" -> "한국어"
    "pt-br", "pt" -> "Português (Brasil)"; "tr" -> "Türkçe"; "vi" -> "Tiếng Việt"
    "kn" -> "ಕನ್ನಡ"; "ta" -> "தமிழ்"; "te" -> "తెలుగు"; else -> tag
}
`,
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    description: 'Hardware specs with 20s Quick Hardware Diagnostic screen test, RGB dead pixel cycle, vibration check, and Share Specs',
    content: `package com.utility.devoptions.ui.components

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.utility.devoptions.R
import com.utility.devoptions.data.model.DevStatusUiState
import kotlinx.coroutines.delay

enum class DiagnosticPhase {
    IDLE,
    RUNNING,
    PASSED
}

@Composable
fun DeviceInfoCard(
    uiState: DevStatusUiState,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var diagnosticPhase by remember { mutableStateOf(DiagnosticPhase.IDLE) }
    var secondsElapsed by remember { mutableIntStateOf(0) }
    val totalSeconds = 20

    // 20-second hardware diagnostic timer
    LaunchedEffect(diagnosticPhase) {
        if (diagnosticPhase == DiagnosticPhase.RUNNING) {
            secondsElapsed = 0
            while (secondsElapsed < totalSeconds) {
                delay(1000)
                secondsElapsed++

                // Trigger real vibration between seconds 8 and 14
                if (secondsElapsed in 8..13) {
                    triggerHapticPulse(context)
                }
            }
            diagnosticPhase = DiagnosticPhase.PASSED
        }
    }

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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header
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
                    text = stringResource(R.string.device_hardware_os_details),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Text(
                text = stringResource(R.string.device_details_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
            )

            HorizontalDivider(
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                thickness = 1.dp
            )

            // Specs Table
            SpecRow(label = stringResource(R.string.android_version), value = stringResource(R.string.android_version_value, uiState.androidVersion, uiState.apiLevel))
            SpecRow(label = stringResource(R.string.device_model), value = "\${uiState.manufacturer} \${uiState.deviceModel}")
            SpecRow(label = stringResource(R.string.brand_hardware), value = "\${uiState.brand} / \${uiState.hardware}")
            SpecRow(label = stringResource(R.string.security_patch), value = uiState.securityPatch.ifEmpty { context.getString(R.string.security_patch_unavailable) })
            SpecRow(label = stringResource(R.string.build_number), value = uiState.buildNumber.ifEmpty { context.getString(R.string.unknown) }, isMonospace = true)
            SpecRow(label = stringResource(R.string.cpu_architecture), value = uiState.cpuAbi.ifEmpty { context.getString(R.string.unknown) }, isMonospace = true)

            Spacer(modifier = Modifier.height(4.dp))

            // Diagnostic Trigger & Execution Section
            when (diagnosticPhase) {
                DiagnosticPhase.IDLE -> {
                    Button(
                        onClick = { diagnosticPhase = DiagnosticPhase.RUNNING },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.quick_hardware_diagnostic),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                DiagnosticPhase.RUNNING -> {
                    val remainingSeconds = totalSeconds - secondsElapsed
                    val progress = secondsElapsed.toFloat() / totalSeconds.toFloat()

                    // Diagnostic Stage Logic
                    val (stageName, stageDesc, stageColor) = when (secondsElapsed) {
                        in 0..7 -> {
                            val colors = listOf(Color.Red, Color.Green, Color.Blue, Color.White, Color.Black)
                            val currentColor = colors[(secondsElapsed / 2).coerceIn(0, colors.lastIndex)]
                            Triple(context.getString(R.string.diagnostic_stage_1), context.getString(R.string.diagnostic_stage_1_description), currentColor)
                        }
                        in 8..13 -> {
                            Triple(context.getString(R.string.diagnostic_stage_2), context.getString(R.string.diagnostic_stage_2_description), Color(0xFF9C27B0))
                        }
                        else -> {
                            Triple(context.getString(R.string.diagnostic_stage_3), context.getString(R.string.diagnostic_stage_3_description), Color(0xFF00B0FF))
                        }
                    }

                    val animatedColor by animateColorAsState(
                        targetValue = stageColor,
                        animationSpec = tween(500),
                        label = "diagnostic_stage_color"
                    )

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(12.dp)
                                            .clip(CircleShape)
                                            .background(animatedColor)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = stageName,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    text = stringResource(R.string.seconds_remaining, remainingSeconds),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }

                            LinearProgressIndicator(
                                progress = { progress },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
                            )

                            // Interactive Visual Stage Canvas
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(72.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(animatedColor.copy(alpha = if (animatedColor == Color.Black) 0.95f else 0.85f))
                                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                when (secondsElapsed) {
                                    in 0..7 -> {
                                        Text(
                                            text = stringResource(R.string.rgb_spectrum_test, stageColor.toString().take(10)),
                                            color = if (stageColor == Color.White) Color.Black else Color.White,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                    in 8..13 -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                imageVector = Icons.Default.Vibration,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = stringResource(R.string.pulsing_vibration_engine),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                    else -> {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(
                                                imageVector = Icons.Default.TouchApp,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = stringResource(R.string.digitizer_multi_touch_active),
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                            }

                            Text(
                                text = stageDesc,
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
                            )
                        }
                    }
                }

                DiagnosticPhase.PASSED -> {
                    // "Diagnostic Passed" Card with "Share Specs" button
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                        ),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF4CAF50),
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        text = stringResource(R.string.diagnostic_passed),
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = stringResource(R.string.diagnostic_passed_summary),
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                                thickness = 1.dp
                            )

                            // Diagnostic Results Checklist
                            DiagnosticCheckItem(title = stringResource(R.string.rgb_screen_matrix), status = stringResource(R.string.zero_dead_pixels_pass))
                            DiagnosticCheckItem(title = stringResource(R.string.haptic_vibration_motor), status = stringResource(R.string.calibrated_functional_pass))
                            DiagnosticCheckItem(title = stringResource(R.string.touch_digitizer), status = stringResource(R.string.low_latency_multi_touch_pass))

                            Spacer(modifier = Modifier.height(4.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        shareDeviceSpecs(context, uiState)
                                    },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = MaterialTheme.colorScheme.primary
                                    )
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Share,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = stringResource(R.string.share_specs),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                OutlinedButton(
                                    onClick = { diagnosticPhase = DiagnosticPhase.RUNNING },
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Refresh,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = stringResource(R.string.test_again),
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosticCheckItem(
    title: String,
    status: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
        )
        Text(
            text = status,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF4CAF50)
        )
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
            .padding(vertical = 4.dp),
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

private fun triggerHapticPulse(context: Context) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vibratorManager?.defaultVibrator?.vibrate(
                VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(150)
            }
        }
    } catch (_: Exception) {
        // Safe fail on devices without vibration motors
    }
}

private fun shareDeviceSpecs(context: Context, uiState: DevStatusUiState) {
    val report = context.getString(
        R.string.device_diagnostic_report,
        uiState.manufacturer,
        uiState.deviceModel,
        uiState.androidVersion,
        uiState.apiLevel,
        uiState.buildNumber,
        uiState.securityPatch.ifEmpty { context.getString(R.string.security_patch_unavailable) },
        uiState.cpuAbi,
        if (uiState.isDeveloperOptionsEnabled) context.getString(R.string.status_active_on) else context.getString(R.string.status_disabled_off),
        if (uiState.isUsbDebuggingEnabled) context.getString(R.string.status_active_on) else context.getString(R.string.status_disabled_off)
    )
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.device_report_subject))
        putExtra(Intent.EXTRA_TEXT, report)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(Intent.createChooser(intent, context.getString(R.string.share_specs)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    })
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
    modifier: Modifier = Modifier,
    isAdsRemoved: Boolean = false
) {
    if (isAdsRemoved) {
        return
    }

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
import android.content.Context
import android.content.ContextWrapper
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

/** Composable views may be hosted in a ContextThemeWrapper instead of an Activity. */
private tailrec fun Context.hostActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.hostActivity()
    else -> null
}

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
            view.context.hostActivity()?.window?.let { window ->
                WindowCompat.getInsetsController(window, view).apply {
                    isAppearanceLightStatusBars = !darkTheme
                    isAppearanceLightNavigationBars = !darkTheme
                }
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
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Open Developer Options</string>
    <string name="dev_options_status">Developer Options</string>
    <string name="usb_debugging_status">USB Debugging</string>
    <string name="status_enabled">Enabled (Active)</string>
    <string name="status_disabled">Disabled (Inactive)</string>
    <string name="status_unknown">Unknown</string>
    <string name="device_specs_title">Device Hardware &amp; OS</string>
    <string name="how_to_unlock_title">How to Enable Developer Options</string>
    <string name="how_to_unlock_desc">You must enable Developer Options manually in Android Settings. This app cannot unlock it for you.</string>
    <string name="dev_options_not_found">Developer Options are not available. Open the guide to see how to enable them.</string>
    <string name="share_app">Share App</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Check out Developers Options Shortcut on Google Play! It provides convenient access to Android Developer Options. Give it a try: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Select language</string>
    <string name="language_picker_title">App language</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">System default</string>
    <string name="done">Done</string>
    <string name="language_suggestion_title">Choose your preferred language</string>
    <string name="language_suggestion_message">Your device language is %1$s. Would you like to use it in this app?</string>
    <string name="language_switch_to_suggested">Switch language</string>
    <string name="language_continue_english">Keep English</string>
    <string name="real_time_settings_inspector">REAL-TIME SETTINGS INSPECTOR</string>
    <string name="developer_options_status_description">Developer-mode switch status</string>
    <string name="usb_debugging_status_description">USB debugging switch status</string>
    <string name="refresh_status">Refresh status</string>
    <string name="share_application">Share application</string>
    <string name="remove_ads_description">Remove Ads (Google Play Billing)</string>
    <string name="ad_free_activated">Ad-free activated</string>
    <string name="about_phone">About phone</string>
    <string name="open_about_phone">Open About Phone</string>
    <string name="wireless_debugging">Wireless Debugging</string>
    <string name="usb_debugging">USB Debugging</string>
    <string name="enablement_guide_title">How to Enable Developer Options</string>
    <string name="enablement_guide_step_1">1. Open your device’s Settings.</string>
    <string name="enablement_guide_step_2">2. Open About phone or the equivalent device-information section.</string>
    <string name="enablement_guide_step_3">3. Find Build number. It may be under Software information or another manufacturer-specific submenu.</string>
    <string name="enablement_guide_step_4">4. Tap Build number seven times. Follow any PIN, password, pattern, or biometric prompts.</string>
    <string name="enablement_guide_step_5">5. Return to Settings and open Developer options.</string>
    <string name="manual_enablement_note">You must enable Developer Options yourself. This app only opens Settings pages and cannot unlock or change protected system settings.</string>
    <string name="settings_unavailable">Android could not open the requested Settings page.</string>
    <string name="developer_options_disabled_guide">Developer Options appears to be disabled. Follow the guide and enable it manually.</string>
    <string name="developer_options_unavailable_guide">The Developer Options page could not be opened on this device. Follow the guide or open About Phone.</string>
    <string name="about_phone_fallback_settings">About Phone is unavailable on this device, so general Settings was opened instead.</string>
    <string name="usb_debugging_guidance">In Developer Options, scroll to USB debugging. It can grant debugging access to connected computers; enable it only when you trust the computer and need the feature.</string>
    <string name="wireless_debugging_guidance">On Android 11 and later, look for Wireless debugging inside Developer Options. Availability and labels vary by device.</string>
    <string name="wireless_debugging_unavailable">Wireless debugging availability depends on the Android version and device. Check Developer Options for a relevant setting.</string>
    <string name="wireless_debugging_fallback_guidance">Developer Options could not be opened directly. In Settings, search for Developer options, then look for Wireless debugging if your device supports it.</string>
    <string name="settings_open_failed">Android could not open Settings on this device.</string>
    <string name="status_updated">Developer status and device details updated.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">Device Hardware &amp; OS Details</string>
    <string name="device_details_subtitle">System parameters read from android.os.Build</string>
    <string name="android_version">Android version</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Device model</string>
    <string name="brand_hardware">Brand / hardware</string>
    <string name="security_patch">Security patch</string>
    <string name="build_number">Build number</string>
    <string name="cpu_architecture">CPU architecture</string>
    <string name="quick_hardware_diagnostic">Quick hardware diagnostic</string>
    <string name="diagnostic_stage_1">Stage 1/3: Screen &amp; dead-pixel check</string>
    <string name="diagnostic_stage_1_description">Inspect the RGB colour spectrum for possible dead pixels.</string>
    <string name="diagnostic_stage_2">Stage 2/3: Haptic vibration check</string>
    <string name="diagnostic_stage_2_description">Check vibration motor and haptic response.</string>
    <string name="diagnostic_stage_3">Stage 3/3: Multi-touch digitizer check</string>
    <string name="diagnostic_stage_3_description">Check touch response while you interact with the screen.</string>
    <string name="seconds_remaining">%1$d s remaining</string>
    <string name="rgb_spectrum_test">RGB spectrum test (%1$s)</string>
    <string name="pulsing_vibration_engine">Vibration feedback test</string>
    <string name="digitizer_multi_touch_active">Touch the screen to test response</string>
    <string name="diagnostic_passed">Diagnostic sequence finished</string>
    <string name="diagnostic_passed_summary">The visual, vibration, and touch prompts were displayed.</string>
    <string name="rgb_screen_matrix">RGB screen colour check</string>
    <string name="zero_dead_pixels_pass">Visual inspection needed</string>
    <string name="haptic_vibration_motor">Haptic vibration motor</string>
    <string name="calibrated_functional_pass">User verification needed</string>
    <string name="touch_digitizer">Touch digitizer</string>
    <string name="low_latency_multi_touch_pass">User verification needed</string>
    <string name="share_specs">Share device details</string>
    <string name="test_again">Run again</string>
    <string name="unknown">Unknown</string>
    <string name="security_patch_unavailable">Not available (Android version below 6)</string>
    <string name="status_active_on">ACTIVE (ON)</string>
    <string name="status_disabled_off">DISABLED (OFF)</string>
    <string name="device_report_subject">Device hardware details</string>
    <string name="device_diagnostic_report">Android device report
------------------------------
Model: %1$s %2$s
Android: %3$s (API %4$d)
Build: %5$s
Security patch: %6$s
CPU architecture: %7$s
Developer Options: %8$s
USB debugging: %9$s

Note: the on-screen prompts are not a hardware certification or automatic dead-pixel/touch measurement.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play could not be opened. Check that a browser or Play Store is available.</string>
    <string name="share_unavailable">No compatible app is available to share this link.</string>
    <string name="update_available_title">Update available</string>
    <string name="update_available_message">A new version of Developers Options Shortcut is available. Update to get the latest improvements and fixes.</string>
    <string name="update_now">Update now</string>
    <string name="later">Later</string>
    <string name="offline_title">You\\'re offline</string>
    <string name="offline_message">Connect to the internet if you\\'d like ads to load and help support the continued development of this free app. The app\\'s main features remain available offline.</string>
    <string name="internet_settings">Internet settings</string>
    <string name="not_now">Not now</string>
    <string name="offline_settings_unavailable">Unable to open network settings. Please open your device\\'s Settings and choose Network or Internet.</string>
    <string name="offline_support_message">Enjoying the app? You can optionally buy the team a coffee to support future development. This is entirely optional; the app remains available offline.</string>
    <string name="offline_purchase_unverified_message">You are offline, so the app cannot currently verify your ad-removal status. No purchase is being assumed. You can keep using available offline features and reconnect later if you need an online feature.</string>
    <string name="offline_ad_supported_message">You are offline. Ads and some online features may be unavailable until you reconnect. The app remains usable offline; reconnect only when you need an online feature.</string>
    <string name="review_prompt_title">Enjoying Developers Options Shortcut?</string>
    <string name="review_prompt_message">Your feedback helps us improve the app. If you have a moment, please share an honest review on Google Play. Thank you for your support!</string>
    <string name="review_on_google_play">Review on Google Play</string>
    <string name="share_with_friends">Share with Friends</string>
    <string name="review_not_now">Not Now</string>
    <string name="rate_on_google_play">Rate on Google Play</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values/colors.xml',
    name: 'colors.xml',
    category: 'res',
    language: 'xml',
    description: 'Material 3 color palette and adaptive app icon background colors',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="primary">#6750A4</color>
    <color name="on_primary">#FFFFFF</color>
    <color name="primary_container">#EADDFF</color>
    <color name="background">#121316</color>
    <color name="surface">#1B1B1F</color>
    <color name="status_green">#10B981</color>
    <color name="status_gray">#64748B</color>
    <color name="ic_launcher_background">#FFFFFFFF</color>
</resources>
`
  },
  {
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    name: 'ic_launcher.xml (Adaptive)',
    category: 'res',
    language: 'xml',
    description: 'Adaptive app icon definition for modern Android (API 26 - 35)',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`
  },
  {
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    name: 'ic_launcher_round.xml (Adaptive)',
    category: 'res',
    language: 'xml',
    description: 'Adaptive round app icon definition for modern Android (API 26 - 35)',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`
  },
  {
    path: 'app/src/test/java/com/utility/devoptions/DevOptionsUnitTest.kt',
    name: 'DevOptionsUnitTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Standard Android unit test suite covering UiState immutability, AdMob 3-tap frequency cap, billing constants, and OEM fallbacks',
    content: `package com.utility.devoptions

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
 * Standard Unit Test Suite for Developers Options Shortcut.
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
        assertEquals("Android version is populated when device metadata loads", "", defaultState.androidVersion)
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
`
  },
  {
    path: 'app/src/androidTest/java/com/utility/devoptions/MainScreenUiTest.kt',
    name: 'MainScreenUiTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions

import android.content.res.Configuration
import java.util.Locale
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.appcompat.app.AppCompatDelegate
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Standard Android Instrumented Compose UI Test.
 * Validates Material 3 MainScreen rendering, button interactions,
 * status badge visibility, and persistent "Remove Ads" action item.
 */
class MainScreenUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testMainScreen_displaysTitleAndInspectorHeader() {
        val testUiState = DevStatusUiState(
            isDeveloperOptionsEnabled = true,
            isUsbDebuggingEnabled = false,
            androidVersion = "15",
            apiLevel = 35,
            deviceModel = "Pixel 9 Pro",
            manufacturer = "Google"
        )

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = testUiState,
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = {},
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Verify TopAppBar Title
        composeTestRule.onNodeWithText("Developers Options Shortcut").assertIsDisplayed()

        // Verify Inspector Header
        composeTestRule.onNodeWithText("REAL-TIME SETTINGS INSPECTOR").assertIsDisplayed()

        // Verify Action Button
        composeTestRule.onNodeWithText("Open Developer Options").assertIsDisplayed()
    }

    @Test
    fun testMainScreen_openDeveloperOptionsClick_invokesCallback() {
        var actionClicked = false

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = {},
                    onOpenDeveloperOptions = { actionClicked = true },
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Perform click on primary CTA
        composeTestRule.onNodeWithText("Open Developer Options").performClick()
        assertTrue("Callback onOpenDeveloperOptions should be invoked on click", actionClicked)
    }

    @Test
    fun testMainScreen_removeAdsActionItem_presence() {
        var removeAdsClicked = false

        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onRemoveAds = { removeAdsClicked = true },
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {}
                )
            }
        }

        // Verify "Remove Ads" action icon in TopAppBar
        composeTestRule.onNodeWithContentDescription("Remove Ads (Google Play Billing)").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Remove Ads (Google Play Billing)").performClick()
        assertTrue("onRemoveAds should be invoked when tapping top bar action", removeAdsClicked)
    }
    @Test
    fun updatePromptActionsStayOptionalAndDelegateToCallbacks() {
        var laterPressed = false
        var updatePressed = false
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.UPDATE,
                    onDismissAppPrompt = { laterPressed = it == AppPrompt.UPDATE },
                    onUpdateNow = { updatePressed = true }
                )
            }
        }
        composeTestRule.onNodeWithText("Update available").assertIsDisplayed()
        composeTestRule.onNodeWithText("Later").performClick()
        assertTrue("Later requests dialog dismissal only", laterPressed)
        composeTestRule.onNodeWithText("Update now").performClick()
        assertTrue("Update action delegates to the Play listing handler", updatePressed)
    }

    @Test
    fun offlinePromptIsDismissibleAndNetworkSettingsAreUserInitiated() {
        var dismissed = false
        var settingsRequested = false
        val activePromptState = mutableStateOf<AppPrompt?>(AppPrompt.OFFLINE)
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = activePromptState.value,
                    onDismissAppPrompt = {
                        dismissed = it == AppPrompt.OFFLINE
                        activePromptState.value = null
                    },
                    onOpenInternetSettings = {
                        settingsRequested = true
                        activePromptState.value = null
                    }
                )
            }
        }
        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not now").performClick()
        assertTrue("Not now dismisses without ending the Activity", dismissed)
        assertEquals(0, composeTestRule.onAllNodesWithText("You're offline").fetchSemanticsNodes().size)

        // Re-open a fresh prompt to verify network settings require an explicit tap.
        composeTestRule.runOnIdle { activePromptState.value = AppPrompt.OFFLINE }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Internet settings").performClick()
        assertTrue("Network settings open only after an explicit tap", settingsRequested)
        assertEquals(0, composeTestRule.onAllNodesWithText("You're offline").fetchSemanticsNodes().size)
    }


    @Test
    fun offlinePromptForAdFreeUserKeepsAdsRemovedAndCoffeeSupportOptional() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = true,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }

        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Enjoying the app? You can optionally buy the team a coffee to support future development. This is entirely optional; the app remains available offline.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithContentDescription("Remove Ads (Google Play Billing)").fetchSemanticsNodes().size)
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlinePromptForNonAdFreeUserDoesNotPressureUsersToEnableAds() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }

        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("You are offline. Ads and some online features may be unavailable until you reconnect. The app remains usable offline; reconnect only when you need an online feature.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlinePromptUsesUnverifiedCopyWhenBillingCannotBeConfirmed() {
        composeTestRule.setContent {
            DevOptionsTheme {
                MainScreen(
                    uiState = DevStatusUiState(),
                    snackbarHostState = SnackbarHostState(),
                    isAdsRemoved = false,
                    adsRemovalEntitlementKnown = false,
                    onOpenDeveloperOptions = {},
                    onShareApp = {},
                    onManualRefresh = {},
                    activeAppPrompt = AppPrompt.OFFLINE
                )
            }
        }
        composeTestRule.onNodeWithText("You are offline, so the app cannot currently verify your ad-removal status. No purchase is being assumed. You can keep using available offline features and reconnect later if you need an online feature.").assertIsDisplayed()
        assertEquals(0, composeTestRule.onAllNodesWithText("ads to load", substring = true).fetchSemanticsNodes().size)
    }

    @Test
    fun offlineDialogRespectsRightToLeftComposeLayout() {
        var rtlObserved = false
        composeTestRule.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                rtlObserved = LocalLayoutDirection.current == LayoutDirection.Rtl
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        onOpenDeveloperOptions = {},
                        onShareApp = {},
                        onManualRefresh = {},
                        activeAppPrompt = AppPrompt.OFFLINE
                    )
                }
            }
        }
        assertTrue("The dialog can render under an RTL layout direction", rtlObserved)
        composeTestRule.onNodeWithText("You're offline").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not now").assertIsDisplayed()
    }

    @Test
    fun languageSelectionIsRetainedByTheAppLocaleDelegate() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val original = AppCompatDelegate.getApplicationLocales()
        try {
            AppLanguageController.selectLanguage(context, "de")
            assertEquals("de", AppLanguageController.currentLanguageTag(context))
            assertEquals("de", AppCompatDelegate.getApplicationLocales()[0]?.toLanguageTag())
            AppLanguageController.selectLanguage(context, "system")
            assertEquals("system", AppLanguageController.currentLanguageTag(context))
        } finally {
            val originalTag = original[0]?.toLanguageTag()
            if (originalTag.isNullOrBlank()) AppLanguageController.selectLanguage(context, "system")
            else AppLanguageController.selectLanguage(context, originalTag)
        }
    }


    @Test
    fun longRussianActionLabelsRemainVisibleAndClickableOnCompactLayoutAndLargeText() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val russianConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("ru"))
        }
        val russianContext = baseContext.createConfigurationContext(russianConfiguration)
        val refreshLabel = russianContext.getString(R.string.refresh_status)
        val shareLabel = russianContext.getString(R.string.share_app)
        var refreshClicked = false
        var shareClicked = false

        composeTestRule.setContent {
            val currentDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalContext provides russianContext,
                LocalConfiguration provides russianConfiguration,
                LocalDensity provides Density(density = currentDensity.density, fontScale = 1.35f)
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(320.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = { shareClicked = true },
                        onManualRefresh = { refreshClicked = true }
                    )
                }
            }
        }

        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed().performClick()
        assertTrue("Refresh remains clickable with a long Russian label", refreshClicked)
        assertTrue("Share remains clickable with a long Russian label", shareClicked)
    }

    @Test
    fun longGermanActionLabelsRemainVisibleOnCompactLayout() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val germanConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("de"))
        }
        val germanContext = baseContext.createConfigurationContext(germanConfiguration)
        val refreshLabel = germanContext.getString(R.string.refresh_status)
        val shareLabel = germanContext.getString(R.string.share_app)

        composeTestRule.setContent {
            CompositionLocalProvider(
                LocalContext provides germanContext,
                LocalConfiguration provides germanConfiguration
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(320.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = {},
                        onManualRefresh = {}
                    )
                }
            }
        }
        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed()
    }

    @Test
    fun longRussianActionLabelsRemainVisibleAndClickableInSideBySideLayout() {
        val baseContext = InstrumentationRegistry.getInstrumentation().targetContext
        val russianConfiguration = Configuration(baseContext.resources.configuration).apply {
            setLocale(Locale.forLanguageTag("ru"))
        }
        val russianContext = baseContext.createConfigurationContext(russianConfiguration)
        val refreshLabel = russianContext.getString(R.string.refresh_status)
        val shareLabel = russianContext.getString(R.string.share_app)
        var refreshClicked = false
        var shareClicked = false

        composeTestRule.setContent {
            val currentDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalContext provides russianContext,
                LocalConfiguration provides russianConfiguration,
                LocalDensity provides Density(density = currentDensity.density, fontScale = 1f)
            ) {
                DevOptionsTheme {
                    MainScreen(
                        uiState = DevStatusUiState(),
                        snackbarHostState = SnackbarHostState(),
                        modifier = Modifier.width(393.dp).height(760.dp),
                        onOpenDeveloperOptions = {},
                        onShareApp = { shareClicked = true },
                        onManualRefresh = { refreshClicked = true }
                    )
                }
            }
        }

        composeTestRule.onNodeWithText(refreshLabel).performScrollTo().assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText(shareLabel).performScrollTo().assertIsDisplayed().performClick()
        assertTrue("Refresh remains clickable in the side-by-side Russian layout", refreshClicked)
        assertTrue("Share remains clickable in the side-by-side Russian layout", shareClicked)
    }

}
`,
  },
  {
    path: 'README.md',
    name: 'README.md (Android Studio Guide)',
    category: 'docs',
    language: 'markdown',
    description: 'Complete build, Gradle compilation, and Play Store release guide',
    content: `> **Current release facts (verified from Gradle):** package \`com.utility.devoptions\`; version \`1.0.33\` (\`20261023\`); compile/target SDK 36; current minimum SDK 24. Google Play Automatic Protection’s documented API 24 minimum means API 21–23 support must not be enabled until the protection trade-off is explicitly approved. The in-app locale selector advertises 16 resource sets: English, Russian, Hindi, Spanish, French, Arabic, Simplified Chinese, Bengali, German, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Turkish, and Vietnamese. CI checks that each configured locale maps to complete Android string resources and matching format placeholders. Automated checks do not assess linguistic quality; machine-assisted translations still require native-speaker review before being described as publication-quality.

Developers Options Shortcut — Android utility and Studio
A native Android application built with Kotlin and Jetpack Compose (Material 3), currently configured for API 24+ (Android 7.0+) while the Automatic Protection compatibility decision is pending. API 21–23 support remains intentionally disabled until the security trade-off is approved. Features include OEM intent fallbacks, status inspection, Google AdMob, and a Web Studio project exporter.
User Review & Critical Decisions
> [!IMPORTANT]
> The following product decisions were confirmed during the specification interview and revisions:
Current Gradle configuration (verified): \`minSdk = 24\`, \`targetSdk = 36\`, \`compileSdk = 36\`, application ID \`com.utility.devoptions\`, version \`1.0.33\` / code \`20261023\`. API 24 excludes Android 5.0–6.0 (API 21–23). A lower minimum would broaden compatibility but conflicts with the documented API 24 minimum for Google Play Automatic Protection if that protection is required. Do not claim a global device-reach percentage without current Google Play Console device data.
Confirmed Multi-Tier OEM Intent Routing:
Standard Android AOSP: \`Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS\`
Xiaomi / HyperOS / MIUI: Component \`com.android.settings/.DevelopmentSettings\` & \`com.miui.securitycenter\`
Samsung One UI: \`com.android.settings.DevelopmentSettings\`
Huawei EMUI / HarmonyOS: \`com.android.settings.DevelopmentSettings\`
Ultimate Fallback: \`Settings.ACTION_DEVICE_INFO_SETTINGS\` ("About Phone") accompanied by an interactive Material 3 dialog/snackbar explaining the "Tap Build Number 7 times" unlock procedure.
Confirmed Version-Guarded APIs:
\`Build.VERSION.SECURITY_PATCH\`: Guarded with \`SDK_INT >= Build.VERSION_CODES.M\` (API 23).
Material You Dynamic Colors: Guarded with \`SDK_INT >= Build.VERSION_CODES.S\` (API 31); fallback to custom Material 3 Dark/Light palettes for Android 7.0 through 11.
Edge-to-Edge: \`androidx.activity:activity-compose\` \`enableEdgeToEdge()\` with backward-compatible system scrims across all API levels.
Settings.Global vs Settings.Secure: Safe fallback for content resolver settings across API 24+.
Confirmed AdMob Setup:
Anchored adaptive banner at bottom.
Preloaded Interstitial Ad triggered on every 3rd action tap with strict fail-open execution (user always lands in settings even if ad fails or is skipped).
UMP Consent readiness in \`MainActivity\`.
---
1. Overview & Core Concept
What It Does: Provides instant 1-tap direct access to Developer Options on supported Android versions (Android 7.0+; API 21–23 support pending approval) and major phone brands, with real-time status inspection of USB Debugging (\`ADB_ENABLED\`) and Developer Mode (\`DEVELOPMENT_SETTINGS_ENABLED\`).
Google Play Compliance: Avoids the "Minimum Functionality" rejection trap by pairing the shortcut launcher with a comprehensive hardware, OS, and SoC diagnostic hub (Device Model, Manufacturer, Android Version, Codename, API Level, Security Patch, SoC Architecture, and Build Fingerprint) plus a native Share intent.
Dynamic Lifecycle: Uses a \`DefaultLifecycleObserver\` in \`onResume()\` to instantaneously refresh status when the user toggles settings and returns to the app, with zero battery drain.
---
2. User Experience & Visual Design
Universal Material 3 Interface
Surface Elevation: High-contrast, tactile cards (\`rounded-2xl\` / \`16dp\`) utilizing M3 surface container tokens (\`surfaceContainer\`, \`surfaceContainerHigh\`).
Color Palette & Visual Cues:
Active Debugging / Developer Options ON: Emerald Green (\`Color(0xFF10B981)\`) with distinct checkmark icon and text label for color-blind accessibility.
Disabled / OFF: Slate Grey (\`Color(0xFF64748B)\`) with clear "Disabled" label.
Primary Action Tile: Prominent high-contrast CTA button with phone-to-settings arrow icon.
Brand & Device Specs: Clean, unboxed tabular specifications with subtle hairline dividers.
Cross-Version Compatibility Matrix
Feature	Android 7.0–11 (API 24–30)	Android 12–14 (API 31–34)	Android 15 (API 35)
Material 3 Theme	Curated Deep M3 Palette	Dynamic Material You Colors	Dynamic M3 + Native Edge-to-Edge
Security Patch	Guarded API (or "Pre-Marshmallow")	Full Month-Year Patch String	Full Month-Year Patch String
Intent Handling	OEM Intent Fallback Chain	OEM Intent Fallback Chain	OEM Intent Fallback Chain
Edge-to-Edge	Backward-compatible System Scrim	WindowInsetsPadding	Enforced Edge-to-Edge
Settings Resolution	\`Settings.Global\` query	\`Settings.Global\` query	\`Settings.Global\` query
---
3. Key Product Decisions & Trade-Offs
Decision 1: Supporting API 24 as minSdk
Chosen Approach: keep \`minSdk = 24\` until the Automatic Protection decision is explicitly approved.
Why: This is the currently configured, protection-compatible minimum; restoring API 21–23 would cover older devices but conflicts with the documented API 24 protection requirement if protection remains required.
Decision 2: Resilient OEM Intent Routing
Chosen Approach: Try standard AOSP intent -> catch \`ActivityNotFoundException\` -> try manufacturer-specific ComponentName -> catch -> fallback to About Phone with guided toast/dialog.
Why: Certain custom skins (MIUI, ColorOS, HyperOS, EMUI) rename or nest development settings behind proprietary packages. The fallback chain guarantees 100% crash immunity.
Decision 3: Interactive Web Simulator & Instant Project Export
Chosen Approach: Provide a responsive Web Studio showcasing the live Material 3 Android UI on an interactive mobile canvas with live toggle simulations, alongside a file-by-file code browser with copy buttons, and an automatic ZIP generator producing the ready-to-build Android Studio project.
Why: Allows immediate testing and inspection in the browser while providing the exact, ready-to-compile Gradle project for Android Studio.
---
4. Technical Architecture & Data Strategy
\`\`\`
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
\`\`\`
Deliverables & File Manifest
Gradle Build Configuration:
\`build.gradle.kts\` (Root): Android Gradle Plugin 8.7.0, Kotlin 2.0.21, Compose Compiler Plugin.
\`app/build.gradle.kts\`: \`compileSdk = 36\`, \`minSdk = 24\`, \`targetSdk = 36\`, pinned NDK \`27.2.12479018\`, dependencies for \`play-services-ads:23.6.0\`, \`androidx.compose.material3:1.3.1\`, \`androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7\`, \`androidx.activity:activity-compose:1.9.3\`.
\`settings.gradle.kts\`: Google Maven, MavenCentral, Gradle Plugin Portal.
Android Manifest:
\`AndroidManifest.xml\`: Permissions (\`INTERNET\`, \`ACCESS_NETWORK_STATE\`), AdMob Application ID meta-data, exported launcher activity.
Native Kotlin Source Code (\`com.utility.devoptions\`):
\`data/model/DevStatusState.kt\`: Immutable UI state models.
\`util/IntentHelper.kt\`: Resilient OEM Intent routing engine (AOSP, Xiaomi/HyperOS, Samsung, Huawei, fallback to About Phone).
\`viewmodel/DeveloperOptionsViewModel.kt\`: StateFlow view model reading \`Settings.Global\` and \`Build\` specs with version guarding.
\`ui/theme/Color.kt\`, \`Type.kt\`, \`Theme.kt\`: Dynamic Material You (Android 12+) with curated fallback colors (Android 7.0–11).
\`ui/components/StatusBadge.kt\`: Accessible status indicators.
\`ui/components/DeviceInfoCard.kt\`: Google Play compliant hardware & OS details.
\`ui/components/BannerAdView.kt\`: AndroidView adaptive banner container.
\`ui/screens/MainScreen.kt\`: Material 3 Scaffold, TopAppBar, Pull-to-refresh, Action button, Snackbar host.
\`MainActivity.kt\`: ComponentActivity, edge-to-edge, UMP initialization, preloaded interstitial ad with 3-tap frequency cap, onResume lifecycle observer.
Web Studio & Project Exporter:
Interactive Material 3 phone simulator.
Toggles to simulate Developer Options ON/OFF, USB Debugging ON/OFF, Locked State, and OEM Intent fallbacks.
Interactive source code explorer with syntax highlighting and instant file copy.
Downloadable Android Studio project ZIP button (generates a valid, complete \`.zip\` ready for Android Studio).


## Release audit notes (2026-10-18)

- The current API 24 minimum is retained pending an explicit decision on whether worldwide support for Android 5.0–6.0 (API 21–23) takes priority over Google Play Automatic Protection. The app-specific Play Console toggle was not directly accessible during this repository audit.
- Release builds request \`ndk.debugSymbolLevel = "FULL"\` and pin NDK \`27.2.12479018\`. Candidate 1.0.33 uses a coherent Compose BOM 2024.06.00 / UI Graphics 1.6.8 / Material 3 1.2.1 stack that avoids the Graphics Path JNI library without excluding a dependency behind Compose 1.7 PathIterator. CI asserts the exact versions, rejects any Graphics Path module/library in the graph or AAB, and strictly requires matching symbols for any other packaged native library.
- Native UI locale choices are limited to English, Russian, Hindi, Spanish, French, Arabic (RTL), and Simplified Chinese. All seven have complete string-resource key coverage and format-placeholder checks. Hindi, Spanish, French, Arabic, and Simplified Chinese translations are machine-generated and need native-speaker review; resource completeness does not prove linguistic QA or live-ad verification.
- AdMob, UMP consent and encrypted billing preferences remain in the project; the PR’s CI checks presence but does not prove that live ads were served or that consent works end-to-end on a device.


## Native symbol investigation

Candidate: Developers Options Shortcut 1.0.33 / version code 20261023.

## Exact dependency and upstream evidence

The earlier candidate resolved \`androidx.graphics:graphics-path:1.0.1\`; forcing stable \`1.1.0\` did not produce native symbol metadata in the actual AAB. AGP reported that \`libandroidx.graphics.path.so\` could not be stripped, and matching \`.dbg\`/\`.sym\` files were not established for arm64-v8a, armeabi-v7a, x86 and x86_64.

AndroidX's official release page lists Graphics Path 1.1.0 (May 6, 2026): https://developer.android.com/jetpack/androidx/releases/graphics. The upstream library compiles native path code into a JNI library with hidden symbol visibility/version-script settings (https://android.googlesource.com/platform/frameworks/support/+/b2e13e55ca5807fe487db42765fc51980d644fa2/graphics/graphics-path/build.gradle). Google documents that \`debugSymbolLevel = "FULL"\` cannot reconstruct native debug information already stripped from a prebuilt input: https://developer.android.com/build/include-native-symbols.

Compose 1.7's Android PathIterator implementation imports and wraps \`androidx.graphics.path.PathIterator\` (https://android.googlesource.com/platform/frameworks/support/+/3cae670ac7a296e9d58a95ede7044b39af014d1c/compose/ui/ui-graphics/src/androidMain/kotlin/androidx/compose/ui/graphics/AndroidPathIterator.android.kt). Excluding that library from Compose 1.7 would remove an implementation behind its public API, so the candidate now uses a compatible earlier Compose generation instead.

## Compatible dependency choice

Candidate 1.0.33 pins Compose BOM \`2024.06.00\`, Compose UI Graphics Android \`1.6.8\`, Material 3 \`1.2.1\`, and Activity Compose \`1.9.0\`. The published dependency list for UI Graphics Android 1.6.8 does not include Graphics Path (https://mvnrepository.com/artifact/androidx.compose.ui/ui-graphics-android/1.6.8/dependencies), unlike the 1.7 line. Candidate application source does not use Compose PathIterator. CI checks the exact UI Graphics and Material 3 versions and fails if \`androidx.graphics:graphics-path\` or an app-level PathIterator call appears.

The symbol gate is strict: if \`libandroidx.graphics.path.so\` unexpectedly appears in any ABI of the actual AAB, candidate validation fails. Every other packaged native library must have matching ABI-specific \`.dbg\` or \`.sym\` metadata. There is no exception, ignored library, or warning-to-success downgrade. Actual emulator instrumentation is required to establish the UI remains functional on the chosen stack.

## Release boundary

Version code \`20261023\` exceeds the last repository-tracked signed GitHub release code \`20261019\` (tag \`release-v1.0.4\`). That release record says it was not uploaded to Google Play, so the live Play Console version code is still unverified and must be checked directly before a real release. The protected workflow validates an unsigned bundle and native symbols before loading signing secrets and retains the post-sign comparison with the existing upload certificate. No signing, GitHub Release publication, or Play Console upload is run here.
`
  },
  {
    path: 'scripts/generate_upload_key.sh',
    name: 'generate_upload_key.sh',
    category: 'docs',
    language: 'bash',
    description: 'Bash script to generate a permanent upload keystore, export upload_certificate.pem for Play Console, and output Base64 for GitHub Secrets',
    content: `#!/usr/bin/env bash
set -e

KEYSTORE_NAME="upload-keystore.jks"
PEM_NAME="upload_certificate.pem"
ALIAS="devoptions-key"
PASSWORD="DevOptions2026KeyPass"
DNAME="CN=DevOptions Shortcut, OU=Mobile, O=Utility, L=San Francisco, ST=CA, C=US"

echo "Generating Permanent Android Upload Keystore ($KEYSTORE_NAME)..."
keytool -genkeypair -v \\
    -keystore "$KEYSTORE_NAME" \\
    -alias "$ALIAS" \\
    -keyalg RSA \\
    -keysize 2048 \\
    -validity 10000 \\
    -storetype PKCS12 \\
    -storepass "$PASSWORD" \\
    -keypass "$PASSWORD" \\
    -dname "$DNAME"

echo "Exporting Public Certificate for Google Play ($PEM_NAME)..."
keytool -export -rfc \\
    -keystore "$KEYSTORE_NAME" \\
    -alias "$ALIAS" \\
    -file "$PEM_NAME" \\
    -storepass "$PASSWORD"

echo "New Certificate Fingerprints:"
keytool -printcert -file "$PEM_NAME" | grep -E "(Owner|SHA1|SHA256)" || true

echo "Base64 String for GitHub Secrets (RELEASE_KEYSTORE_BASE64):"
if [[ "$OSTYPE" == "darwin"* ]]; then
    base64 -i "$KEYSTORE_NAME"
else
    base64 -w 0 "$KEYSTORE_NAME"
fi
`
  },
  {
    path: 'scripts/generate_upload_key.ps1',
    name: 'generate_upload_key.ps1',
    category: 'docs',
    language: 'powershell',
    description: 'PowerShell script to generate a permanent upload keystore, export upload_certificate.pem, and copy Base64 to clipboard',
    content: `$ErrorActionPreference = "Stop"
$KeystoreName = "upload-keystore.jks"
$PemName = "upload_certificate.pem"
$Alias = "devoptions-key"
$Password = "DevOptions2026KeyPass"
$Dname = "CN=DevOptions Shortcut, OU=Mobile, O=Utility, L=San Francisco, ST=CA, C=US"

& keytool -genkeypair -v -keystore $KeystoreName -alias $Alias -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12 -storepass $Password -keypass $Password -dname $Dname
& keytool -export -rfc -keystore $KeystoreName -alias $Alias -file $PemName -storepass $Password

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $KeystoreName))
$base64 = [System.Convert]::ToBase64String($bytes)
try { Set-Clipboard -Value $base64; Write-Host "[SUCCESS] Base64 string copied to clipboard!" } catch {}
Write-Host $base64
`
  }
  {
    path: 'app/src/main/java/com/utility/devoptions/AppLanguageController.kt',
    name: 'AppLanguageController.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

/** Centralized per-app locale and first-launch language suggestion policy. */
object AppLanguageController {
    private const val PREFS_NAME = "app_language_preferences"
    private const val KEY_INITIALIZED = "initialized"
    private const val KEY_SELECTED_TAG = "selected_language_tag"
    private const val KEY_PENDING_SUGGESTION = "pending_language_suggestion"
    private const val KEY_SUGGESTION_HANDLED = "language_suggestion_handled"

    val supportedLanguageTags: Set<String> = LanguagePolicy.supportedLanguageTags

    fun initialize(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val currentlyApplied = AppCompatDelegate.getApplicationLocales()
        if (prefs.getBoolean(KEY_INITIALIZED, false)) {
            if (!currentlyApplied.isEmpty) prefs.edit().remove(KEY_SELECTED_TAG).apply()
            return
        }
        if (!currentlyApplied.isEmpty) {
            prefs.edit().remove(KEY_SELECTED_TAG).putBoolean(KEY_INITIALIZED, true)
                .putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
            return
        }
        if (prefs.getString(KEY_SELECTED_TAG, null) == "system") {
            prefs.edit().remove(KEY_PENDING_SUGGESTION).putBoolean(KEY_INITIALIZED, true)
                .putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
            return
        }
        val preferredTags = LocaleListCompat.getAdjustedDefault().toLanguageTags()
            .split(',').filter { it.isNotBlank() }
        val suggestion = LanguagePolicy.suggestLanguage(
            preferredLanguageTags = preferredTags,
            currentLanguageTag = "en",
            hasExplicitLanguagePreference = false,
            alreadyHandled = false
        )
        prefs.edit().putBoolean(KEY_INITIALIZED, true).putString(KEY_PENDING_SUGGESTION, suggestion)
            .putBoolean(KEY_SUGGESTION_HANDLED, suggestion == null).apply()
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("en"))
    }

    fun selectLanguage(context: Context, languageTag: String) {
        require(languageTag == "system" || languageTag in supportedLanguageTags) {
            "Unsupported language tag: $languageTag"
        }
        val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_PENDING_SUGGESTION)
            .putBoolean(KEY_SUGGESTION_HANDLED, true)
        if (languageTag == "system") editor.putString(KEY_SELECTED_TAG, "system")
        else editor.remove(KEY_SELECTED_TAG)
        editor.apply()
        applyLocale(languageTag)
    }

    fun handleSuggestion(context: Context, acceptedLanguageTag: String?) {
        val selected = acceptedLanguageTag?.takeIf { it in supportedLanguageTags } ?: "en"
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_INITIALIZED, true).remove(KEY_SELECTED_TAG)
            .remove(KEY_PENDING_SUGGESTION).putBoolean(KEY_SUGGESTION_HANDLED, true).apply()
        applyLocale(selected)
    }

    fun pendingSuggestion(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_SUGGESTION_HANDLED, false)) return null
        val pending = prefs.getString(KEY_PENDING_SUGGESTION, null) ?: return null
        if (pending !in supportedLanguageTags) return null
        return pending.takeIf { currentLanguageTag(context) != it }
    }

    fun currentLanguageTag(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_SELECTED_TAG, null) == "system") return "system"
        val locales = AppCompatDelegate.getApplicationLocales()
        if (!locales.isEmpty) {
            return locales[0]?.toLanguageTag()
                ?.let { LanguagePolicy.canonicalSupportedTag(it) } ?: "system"
        }
        return "system"
    }

    private fun applyLocale(languageTag: String) {
        val locales = if (languageTag == "system") LocaleListCompat.getEmptyLocaleList()
        else LocaleListCompat.forLanguageTags(languageTag)
        AppCompatDelegate.setApplicationLocales(locales)
    }
}

/** Pure locale policy with regional-tag fallback; unit-tested without Android framework state. */
object LanguagePolicy {
    val supportedLanguageTags: Set<String> = linkedSetOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi", "kn", "ta", "te")

    fun canonicalSupportedTag(languageTag: String): String? {
        val requested = Locale.forLanguageTag(languageTag.replace('_', '-'))
        val canonical = requested.toLanguageTag()
        supportedLanguageTags.firstOrNull { it.equals(canonical, ignoreCase = true) }?.let { return it }
        val language = requested.language.lowercase(Locale.ROOT)
        val region = requested.country.uppercase(Locale.ROOT)
        val script = requested.script
        if (language == "zh") {
            if (script.equals("Hant", true) || region in setOf("TW", "HK", "MO")) return null
            if (script.equals("Hans", true) || region == "CN" || region.isBlank()) return "zh-CN"
            return null
        }
        if (language == "pt") {
            if (region == "PT") return null
            if (region == "BR" || region.isBlank()) return "pt-BR"
            return null
        }
        return supportedLanguageTags.firstOrNull { Locale.forLanguageTag(it).language.equals(language, true) }
    }

    /** Alias retained for callers that use the explicit long-form API name. */
    fun canonicalSupportedLanguageTag(languageTag: String): String? = canonicalSupportedTag(languageTag)

    fun suggestLanguage(
        preferredLanguageTags: List<String>,
        currentLanguageTag: String,
        hasExplicitLanguagePreference: Boolean,
        alreadyHandled: Boolean
    ): String? {
        if (hasExplicitLanguagePreference || alreadyHandled) return null
        val current = canonicalSupportedTag(currentLanguageTag)
            ?: currentLanguageTag.substringBefore('-').lowercase(Locale.ROOT)
        val candidate = preferredLanguageTags.firstNotNullOfOrNull { canonicalSupportedTag(it) }
        return candidate?.takeIf { !it.equals(current, ignoreCase = true) }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/DevOptionsApplication.kt',
    name: 'DevOptionsApplication.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from the native Android source tree.',
    content: `package com.utility.devoptions

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
`,
  },
  {
    path: 'app/src/test/java/com/utility/devoptions/AppLanguagePolicyTest.kt',
    name: 'AppLanguagePolicyTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
class AppLanguagePolicyTest {
 @Test fun supportsSixteenCompleteLocales() { assertEquals(setOf("en","ru","hi","es","fr","ar","zh-CN","bn","de","id","it","ja","ko","pt-BR","tr","vi"),LanguagePolicy.supportedLanguageTags) }
 @Test fun regionalTagsNeverCrossScriptOrPortugueseRegion() { assertEquals("es",LanguagePolicy.canonicalSupportedTag("es-MX")); assertEquals("hi",LanguagePolicy.canonicalSupportedTag("hi-IN")); assertEquals("pt-BR",LanguagePolicy.canonicalSupportedTag("pt-BR")); assertEquals("zh-CN",LanguagePolicy.canonicalSupportedTag("zh-Hans-CN")); assertNull(LanguagePolicy.canonicalSupportedTag("zh-TW")); assertNull(LanguagePolicy.canonicalSupportedTag("zh-HK")); assertNull(LanguagePolicy.canonicalSupportedTag("pt-PT")) }
 @Test fun suggestionsRespectPreferenceOrderAndHandledState() { assertEquals("hi",LanguagePolicy.suggestLanguage(listOf("ta-IN","hi-IN","en-IN"),"en",false,false)); assertEquals("fr",LanguagePolicy.suggestLanguage(listOf("fr-CA","ar-EG"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("ta-IN","xx-ZZ"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("en-US"),"en",false,false)); assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"),"en",false,true)) }
}`,
  },
  {
    path: 'app/src/main/res/values-ru/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Открыть параметры разработчика</string>
    <string name="dev_options_status">Параметры разработчика</string>
    <string name="usb_debugging_status">Отладка по USB</string>
    <string name="status_enabled">Включено</string>
    <string name="status_disabled">Отключено</string>
    <string name="status_unknown">Неизвестно</string>
    <string name="device_specs_title">Оборудование и Android</string>
    <string name="how_to_unlock_title">Как включить параметры разработчика</string>
    <string name="how_to_unlock_desc">Включите параметры разработчика вручную в настройках Android. Приложение не может разблокировать их самостоятельно.</string>
    <string name="dev_options_not_found">Параметры разработчика недоступны. Откройте инструкцию, чтобы узнать, как их включить.</string>
    <string name="share_app">Поделиться приложением</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Попробуйте Developers Options Shortcut в Google Play! Приложение упрощает доступ к параметрам разработчика Android. Попробуйте: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Выбрать язык</string>
    <string name="language_picker_title">Язык приложения</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Язык системы</string>
    <string name="done">Готово</string>
    <string name="language_suggestion_title">Выберите предпочитаемый язык</string>
    <string name="language_suggestion_message">Язык вашего устройства — %1$s. Хотите использовать его в этом приложении?</string>
    <string name="language_switch_to_suggested">Переключить язык</string>
    <string name="language_continue_english">Оставить английский</string>
    <string name="real_time_settings_inspector">ПРОВЕРКА ПАРАМЕТРОВ В РЕАЛЬНОМ ВРЕМЕНИ</string>
    <string name="developer_options_status_description">Состояние параметров разработчика</string>
    <string name="usb_debugging_status_description">Состояние отладки по USB</string>
    <string name="refresh_status">Обновить состояние</string>
    <string name="share_application">Поделиться приложением</string>
    <string name="remove_ads_description">Отключить рекламу (Google Play)</string>
    <string name="ad_free_activated">Реклама отключена</string>
    <string name="about_phone">О телефоне</string>
    <string name="open_about_phone">Открыть раздел «О телефоне»</string>
    <string name="wireless_debugging">Беспроводная отладка</string>
    <string name="usb_debugging">Отладка по USB</string>
    <string name="enablement_guide_title">Как включить параметры разработчика</string>
    <string name="enablement_guide_step_1">1. Откройте «Настройки» устройства.</string>
    <string name="enablement_guide_step_2">2. Откройте «О телефоне» или аналогичный раздел со сведениями об устройстве.</string>
    <string name="enablement_guide_step_3">3. Найдите «Номер сборки». Он может находиться в разделе «Сведения о ПО» или в другом подразделе производителя.</string>
    <string name="enablement_guide_step_4">4. Нажмите «Номер сборки» семь раз. При необходимости введите PIN-код, пароль, графический ключ или используйте биометрию.</string>
    <string name="enablement_guide_step_5">5. Вернитесь в «Настройки» и откройте «Для разработчиков».</string>
    <string name="manual_enablement_note">Включить параметры разработчика нужно самостоятельно. Приложение только открывает страницы настроек и не может разблокировать или менять защищённые системные параметры.</string>
    <string name="settings_unavailable">Android не удалось открыть нужную страницу настроек.</string>
    <string name="developer_options_disabled_guide">Похоже, параметры разработчика отключены. Следуйте инструкции и включите их вручную.</string>
    <string name="developer_options_unavailable_guide">Не удалось открыть параметры разработчика на этом устройстве. Следуйте инструкции или откройте раздел «О телефоне».</string>
    <string name="about_phone_fallback_settings">Раздел «О телефоне» недоступен, поэтому открыты общие настройки.</string>
    <string name="usb_debugging_guidance">В разделе параметров разработчика прокрутите до пункта «Отладка по USB». Она может предоставить подключённым компьютерам доступ для отладки; включайте её только при необходимости и доверии к компьютеру.</string>
    <string name="wireless_debugging_guidance">В Android 11 и новее найдите пункт «Беспроводная отладка» в параметрах разработчика. Доступность и названия зависят от устройства.</string>
    <string name="wireless_debugging_unavailable">Доступность беспроводной отладки зависит от версии Android и устройства. Проверьте параметры разработчика.</string>
    <string name="wireless_debugging_fallback_guidance">Не удалось открыть параметры разработчика напрямую. В настройках найдите «Для разработчиков», а затем «Беспроводная отладка», если устройство её поддерживает.</string>
    <string name="settings_open_failed">На этом устройстве Android не удалось открыть настройки.</string>
    <string name="status_updated">Состояние разработчика и сведения об устройстве обновлены.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">Оборудование и версия Android</string>
    <string name="device_details_subtitle">Системные параметры из android.os.Build</string>
    <string name="android_version">Версия Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Модель устройства</string>
    <string name="brand_hardware">Бренд / аппаратная платформа</string>
    <string name="security_patch">Обновление безопасности</string>
    <string name="build_number">Номер сборки</string>
    <string name="cpu_architecture">Архитектура CPU</string>
    <string name="quick_hardware_diagnostic">Быстрая проверка оборудования</string>
    <string name="diagnostic_stage_1">Этап 1/3: Проверка экрана и пикселей</string>
    <string name="diagnostic_stage_1_description">Осмотрите цвета RGB, чтобы заметить возможные дефектные пиксели.</string>
    <string name="diagnostic_stage_2">Этап 2/3: Проверка вибрации</string>
    <string name="diagnostic_stage_2_description">Проверьте вибромотор и тактильный отклик.</string>
    <string name="diagnostic_stage_3">Этап 3/3: Проверка сенсорного экрана</string>
    <string name="diagnostic_stage_3_description">Проверьте отклик касаний во время взаимодействия с экраном.</string>
    <string name="seconds_remaining">Осталось: %1$d с</string>
    <string name="rgb_spectrum_test">Проверка RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Проверка виброотклика</string>
    <string name="digitizer_multi_touch_active">Коснитесь экрана, чтобы проверить отклик</string>
    <string name="diagnostic_passed">Последовательность проверки завершена</string>
    <string name="diagnostic_passed_summary">Визуальные подсказки, вибрация и касания были показаны.</string>
    <string name="rgb_screen_matrix">Проверка цветов экрана</string>
    <string name="zero_dead_pixels_pass">Требуется визуальная проверка</string>
    <string name="haptic_vibration_motor">Вибромотор</string>
    <string name="calibrated_functional_pass">Требуется проверка пользователем</string>
    <string name="touch_digitizer">Сенсорный экран</string>
    <string name="low_latency_multi_touch_pass">Требуется проверка пользователем</string>
    <string name="share_specs">Поделиться сведениями</string>
    <string name="test_again">Повторить</string>
    <string name="unknown">Неизвестно</string>
    <string name="security_patch_unavailable">Недоступно (Android ниже 6)</string>
    <string name="status_active_on">АКТИВНО (ВКЛ.)</string>
    <string name="status_disabled_off">ОТКЛЮЧЕНО (ВЫКЛ.)</string>
    <string name="device_report_subject">Сведения об устройстве</string>
    <string name="device_diagnostic_report">Отчёт об устройстве Android
------------------------------
Модель: %1$s %2$s
Android: %3$s (API %4$d)
Сборка: %5$s
Обновление безопасности: %6$s
Архитектура CPU: %7$s
Параметры разработчика: %8$s
Отладка по USB: %9$s

Примечание: экранные подсказки не являются сертификацией оборудования и не измеряют автоматически дефекты пикселей или сенсора.</string>
    <string name="update_available_title">Доступно обновление</string>
    <string name="update_available_message">Доступна новая версия Developers Options Shortcut. Обновитесь, чтобы получить последние улучшения и исправления.</string>
    <string name="update_now">Обновить</string>
    <string name="later">Позже</string>
    <string name="offline_title">Нет подключения к интернету</string>
    <string name="offline_message">Подключитесь к интернету, если хотите загружать рекламу и поддерживать дальнейшую разработку этого бесплатного приложения. Основные функции доступны и офлайн.</string>
    <string name="internet_settings">Настройки интернета</string>
    <string name="not_now">Не сейчас</string>
    <string name="offline_settings_unavailable">Не удалось открыть сетевые настройки. Откройте настройки устройства и выберите раздел «Сеть» или «Интернет».</string>
    <string name="offline_support_message">Нравится приложение? При желании вы можете угостить команду кофе, чтобы поддержать дальнейшую разработку. Это полностью добровольно; приложение работает и без подключения к интернету.</string>
    <string name="offline_purchase_unverified_message">Вы не подключены к интернету, поэтому сейчас не удаётся проверить статус удаления рекламы. Покупка не считается подтверждённой. Вы можете пользоваться доступными офлайн-функциями и подключиться позже, если понадобится сетевая функция.</string>
    <string name="offline_ad_supported_message">Вы не подключены к интернету. Реклама и некоторые сетевые функции могут быть недоступны до восстановления подключения. Приложением можно пользоваться офлайн; подключайтесь, только когда нужна сетевая функция.</string>
    <string name="review_prompt_title">Нравится Developers Options Shortcut?</string>
    <string name="review_prompt_message">Ваш отзыв помогает нам улучшать приложение. Если у вас есть минутка, оставьте честный отзыв в Google Play. Спасибо за поддержку!</string>
    <string name="review_on_google_play">Оставить отзыв в Google Play</string>
    <string name="share_with_friends">Поделиться с друзьями</string>
    <string name="review_not_now">Не сейчас</string>
    <string name="rate_on_google_play">Оценить в Google Play</string>
    <string name="play_store_unavailable">Не удалось открыть Google Play. Проверьте, доступны ли браузер или Play Маркет.</string>
    <string name="share_unavailable">Нет доступного приложения для отправки ссылки.</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-hi/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">डेवलपर विकल्प खोलें</string>
    <string name="dev_options_status">डेवलपर विकल्प</string>
    <string name="usb_debugging_status">USB डिबगिंग</string>
    <string name="status_enabled">सक्षम (चालू)</string>
    <string name="status_disabled">अक्षम (बंद)</string>
    <string name="status_unknown">अज्ञात</string>
    <string name="device_specs_title">डिवाइस हार्डवेयर और OS</string>
    <string name="how_to_unlock_title">डेवलपर विकल्प कैसे सक्षम करें</string>
    <string name="how_to_unlock_desc">Android सेटिंग में डेवलपर विकल्प आपको स्वयं सक्षम करने होंगे। यह ऐप उन्हें अनलॉक नहीं कर सकता।</string>
    <string name="dev_options_not_found">डेवलपर विकल्प उपलब्ध नहीं हैं। उन्हें सक्षम करने का तरीका जानने के लिए गाइड खोलें।</string>
    <string name="share_app">ऐप साझा करें</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Google Play पर Developers Options Shortcut देखें! यह Android Developer Options तक सुविधाजनक पहुँच देता है। आज़माएँ: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">भाषा चुनें</string>
    <string name="language_picker_title">ऐप की भाषा</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">सिस्टम की डिफ़ॉल्ट भाषा</string>
    <string name="done">हो गया</string>
    <string name="language_suggestion_title">अपनी पसंदीदा भाषा चुनें</string>
    <string name="language_suggestion_message">आपके डिवाइस की भाषा %1$s है। क्या आप इस ऐप में भी इसका उपयोग करना चाहते हैं?</string>
    <string name="language_switch_to_suggested">भाषा बदलें</string>
    <string name="language_continue_english">अंग्रेज़ी जारी रखें</string>
    <string name="real_time_settings_inspector">रीयल-टाइम सेटिंग जाँच</string>
    <string name="developer_options_status_description">डेवलपर मोड स्विच की स्थिति</string>
    <string name="usb_debugging_status_description">USB डिबगिंग स्विच की स्थिति</string>
    <string name="refresh_status">स्थिति रीफ़्रेश करें</string>
    <string name="share_application">ऐप साझा करें</string>
    <string name="remove_ads_description">विज्ञापन हटाएँ (Google Play Billing)</string>
    <string name="ad_free_activated">विज्ञापन हटाना सक्रिय है</string>
    <string name="about_phone">फ़ोन के बारे में</string>
    <string name="open_about_phone">फ़ोन के बारे में खोलें</string>
    <string name="wireless_debugging">वायरलेस डिबगिंग</string>
    <string name="usb_debugging">USB डिबगिंग</string>
    <string name="enablement_guide_title">डेवलपर विकल्प कैसे सक्षम करें</string>
    <string name="enablement_guide_step_1">1. अपने डिवाइस की सेटिंग खोलें।</string>
    <string name="enablement_guide_step_2">2. फ़ोन के बारे में या डिवाइस की जानकारी वाला समान अनुभाग खोलें।</string>
    <string name="enablement_guide_step_3">3. बिल्ड नंबर ढूँढें। यह सॉफ़्टवेयर जानकारी या निर्माता के किसी अन्य उप-मेनू में हो सकता है।</string>
    <string name="enablement_guide_step_4">4. बिल्ड नंबर पर सात बार टैप करें। PIN, पासवर्ड, पैटर्न या बायोमेट्रिक अनुरोध पूरा करें।</string>
    <string name="enablement_guide_step_5">5. सेटिंग में वापस जाएँ और डेवलपर विकल्प खोलें।</string>
    <string name="manual_enablement_note">डेवलपर विकल्प आपको स्वयं सक्षम करने होंगे। यह ऐप केवल सेटिंग पेज खोलता है; यह सुरक्षित सिस्टम सेटिंग अनलॉक या बदल नहीं सकता।</string>
    <string name="settings_unavailable">Android अनुरोधित सेटिंग पेज नहीं खोल सका।</string>
    <string name="developer_options_disabled_guide">डेवलपर विकल्प बंद दिखाई देते हैं। गाइड का पालन करें और उन्हें स्वयं सक्षम करें।</string>
    <string name="developer_options_unavailable_guide">इस डिवाइस पर डेवलपर विकल्प पेज नहीं खुला। गाइड देखें या फ़ोन के बारे में खोलें।</string>
    <string name="about_phone_fallback_settings">फ़ोन के बारे में उपलब्ध नहीं है, इसलिए सामान्य सेटिंग खोली गई।</string>
    <string name="usb_debugging_guidance">डेवलपर विकल्प में USB डिबगिंग तक स्क्रॉल करें। इससे जुड़े कंप्यूटरों को डिबगिंग पहुँच मिल सकती है; इसे केवल भरोसेमंद कंप्यूटर और आवश्यकता होने पर सक्षम करें।</string>
    <string name="wireless_debugging_guidance">Android 11 और बाद के संस्करणों में डेवलपर विकल्प के अंदर वायरलेस डिबगिंग देखें। उपलब्धता और नाम डिवाइस के अनुसार बदल सकते हैं।</string>
    <string name="wireless_debugging_unavailable">वायरलेस डिबगिंग Android संस्करण और डिवाइस पर निर्भर है। संबंधित विकल्प के लिए डेवलपर विकल्प देखें।</string>
    <string name="wireless_debugging_fallback_guidance">डेवलपर विकल्प सीधे नहीं खुल सके। सेटिंग में डेवलपर विकल्प खोजें और, यदि डिवाइस समर्थन करता है, तो वायरलेस डिबगिंग देखें।</string>
    <string name="settings_open_failed">Android इस डिवाइस पर सेटिंग नहीं खोल सका।</string>
    <string name="status_updated">डेवलपर स्थिति और डिवाइस विवरण अपडेट किए गए।</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">डिवाइस हार्डवेयर और OS विवरण</string>
    <string name="device_details_subtitle">android.os.Build से पढ़े गए सिस्टम पैरामीटर</string>
    <string name="android_version">Android संस्करण</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">डिवाइस मॉडल</string>
    <string name="brand_hardware">ब्रांड / हार्डवेयर</string>
    <string name="security_patch">सुरक्षा पैच</string>
    <string name="build_number">बिल्ड नंबर</string>
    <string name="cpu_architecture">CPU आर्किटेक्चर</string>
    <string name="quick_hardware_diagnostic">त्वरित हार्डवेयर जाँच</string>
    <string name="diagnostic_stage_1">चरण 1/3: स्क्रीन और खराब पिक्सेल जाँच</string>
    <string name="diagnostic_stage_1_description">संभावित खराब पिक्सेल देखने के लिए RGB रंगों का निरीक्षण करें।</string>
    <string name="diagnostic_stage_2">चरण 2/3: कंपन जाँच</string>
    <string name="diagnostic_stage_2_description">वाइब्रेशन मोटर और हैप्टिक प्रतिक्रिया जाँचें।</string>
    <string name="diagnostic_stage_3">चरण 3/3: मल्टी-टच डिजिटाइज़र जाँच</string>
    <string name="diagnostic_stage_3_description">स्क्रीन पर स्पर्श करके प्रतिक्रिया जाँचें।</string>
    <string name="seconds_remaining">%1$d सेकंड शेष</string>
    <string name="rgb_spectrum_test">RGB स्पेक्ट्रम जाँच (%1$s)</string>
    <string name="pulsing_vibration_engine">कंपन प्रतिक्रिया जाँच</string>
    <string name="digitizer_multi_touch_active">प्रतिक्रिया जाँचने के लिए स्क्रीन छुएँ</string>
    <string name="diagnostic_passed">जाँच क्रम पूरा हुआ</string>
    <string name="diagnostic_passed_summary">दृश्य, कंपन और स्पर्श संकेत दिखाए गए।</string>
    <string name="rgb_screen_matrix">RGB स्क्रीन रंग जाँच</string>
    <string name="zero_dead_pixels_pass">दृश्य निरीक्षण आवश्यक</string>
    <string name="haptic_vibration_motor">हैप्टिक कंपन मोटर</string>
    <string name="calibrated_functional_pass">उपयोगकर्ता सत्यापन आवश्यक</string>
    <string name="touch_digitizer">टच डिजिटाइज़र</string>
    <string name="low_latency_multi_touch_pass">उपयोगकर्ता सत्यापन आवश्यक</string>
    <string name="share_specs">डिवाइस विवरण साझा करें</string>
    <string name="test_again">फिर से चलाएँ</string>
    <string name="unknown">अज्ञात</string>
    <string name="security_patch_unavailable">उपलब्ध नहीं (Android 6 से पुराना संस्करण)</string>
    <string name="status_active_on">सक्रिय (चालू)</string>
    <string name="status_disabled_off">अक्षम (बंद)</string>
    <string name="device_report_subject">डिवाइस हार्डवेयर विवरण</string>
    <string name="device_diagnostic_report">Android डिवाइस रिपोर्ट
------------------------------
मॉडल: %1$s %2$s
Android: %3$s (API %4$d)
बिल्ड: %5$s
सुरक्षा पैच: %6$s
CPU आर्किटेक्चर: %7$s
डेवलपर विकल्प: %8$s
USB डिबगिंग: %9$s

नोट: स्क्रीन पर दिखाए गए संकेत हार्डवेयर प्रमाणन नहीं हैं और खराब पिक्सेल या टच को स्वचालित रूप से नहीं मापते।</string>
    <string name="update_available_title">अपडेट उपलब्ध है</string>
    <string name="update_available_message">Developers Options Shortcut का नया संस्करण उपलब्ध है। नवीनतम सुधार और समस्याओं के समाधान पाने के लिए अपडेट करें।</string>
    <string name="update_now">अभी अपडेट करें</string>
    <string name="later">बाद में</string>
    <string name="offline_title">आप ऑफ़लाइन हैं</string>
    <string name="offline_message">यदि आप विज्ञापन लोड करना और इस निःशुल्क ऐप के विकास में सहायता करना चाहते हैं, तो इंटरनेट से जुड़ें। ऐप की मुख्य सुविधाएँ ऑफ़लाइन भी उपलब्ध रहती हैं।</string>
    <string name="internet_settings">इंटरनेट सेटिंग</string>
    <string name="not_now">अभी नहीं</string>
    <string name="offline_settings_unavailable">नेटवर्क सेटिंग नहीं खुल सकीं। अपने डिवाइस की सेटिंग खोलें और नेटवर्क या इंटरनेट चुनें।</string>
    <string name="offline_support_message">क्या आपको यह ऐप पसंद आ रहा है? भविष्य के विकास में मदद के लिए आप चाहें तो टीम को कॉफ़ी दे सकते हैं। यह पूरी तरह वैकल्पिक है; ऐप ऑफ़लाइन भी उपलब्ध रहता है।</string>
    <string name="offline_purchase_unverified_message">आप ऑफ़लाइन हैं, इसलिए अभी विज्ञापन हटाने की खरीद की पुष्टि नहीं हो सकती। किसी खरीद को पुष्टि किया हुआ नहीं माना जा रहा है। उपलब्ध ऑफ़लाइन सुविधाएँ इस्तेमाल करें और ऑनलाइन सुविधा की ज़रूरत होने पर बाद में कनेक्ट करें।</string>
    <string name="offline_ad_supported_message">आप ऑफ़लाइन हैं। इंटरनेट से दोबारा जुड़ने तक विज्ञापन और कुछ ऑनलाइन सुविधाएँ उपलब्ध नहीं हो सकतीं। ऐप ऑफ़लाइन भी इस्तेमाल किया जा सकता है; केवल ऑनलाइन सुविधा की ज़रूरत होने पर ही कनेक्ट करें।</string>
    <string name="review_prompt_title">क्या आपको Developers Options Shortcut पसंद है?</string>
    <string name="review_prompt_message">आपकी प्रतिक्रिया ऐप को बेहतर बनाने में मदद करती है। समय हो तो Google Play पर ईमानदार समीक्षा साझा करें। सहयोग के लिए धन्यवाद!</string>
    <string name="review_on_google_play">Google Play पर समीक्षा करें</string>
    <string name="share_with_friends">दोस्तों के साथ साझा करें</string>
    <string name="review_not_now">अभी नहीं</string>
    <string name="rate_on_google_play">Google Play पर रेट करें</string>
    <string name="play_store_unavailable">Google Play नहीं खुल सका। जाँचें कि ब्राउज़र या Play Store उपलब्ध है।</string>
    <string name="share_unavailable">लिंक साझा करने के लिए कोई संगत ऐप उपलब्ध नहीं है।</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-es/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Abrir opciones de desarrollador</string>
    <string name="dev_options_status">Opciones de desarrollador</string>
    <string name="usb_debugging_status">Depuración USB</string>
    <string name="status_enabled">Activado</string>
    <string name="status_disabled">Desactivado</string>
    <string name="status_unknown">Desconocido</string>
    <string name="device_specs_title">Hardware y sistema operativo del dispositivo</string>
    <string name="how_to_unlock_title">Cómo activar las opciones de desarrollador</string>
    <string name="how_to_unlock_desc">Debes activar las opciones de desarrollador manualmente en los Ajustes de Android. Esta aplicación no puede desbloquearlas.</string>
    <string name="dev_options_not_found">Las opciones de desarrollador no están disponibles. Abre la guía para saber cómo activarlas.</string>
    <string name="share_app">Compartir aplicación</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Descubre Developers Options Shortcut en Google Play. Facilita el acceso a las opciones de desarrollador de Android. Pruébala: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Seleccionar idioma</string>
    <string name="language_picker_title">Idioma de la aplicación</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Idioma del sistema</string>
    <string name="done">Listo</string>
    <string name="language_suggestion_title">Elige tu idioma preferido</string>
    <string name="language_suggestion_message">El idioma de tu dispositivo es %1$s. ¿Quieres usarlo también en esta aplicación?</string>
    <string name="language_switch_to_suggested">Cambiar idioma</string>
    <string name="language_continue_english">Seguir en inglés</string>
    <string name="real_time_settings_inspector">INSPECTOR DE AJUSTES EN TIEMPO REAL</string>
    <string name="developer_options_status_description">Estado del interruptor del modo desarrollador</string>
    <string name="usb_debugging_status_description">Estado del interruptor de depuración USB</string>
    <string name="refresh_status">Actualizar estado</string>
    <string name="share_application">Compartir aplicación</string>
    <string name="remove_ads_description">Quitar anuncios (Google Play Billing)</string>
    <string name="ad_free_activated">Bloqueo de anuncios activado</string>
    <string name="about_phone">Acerca del teléfono</string>
    <string name="open_about_phone">Abrir Acerca del teléfono</string>
    <string name="wireless_debugging">Depuración inalámbrica</string>
    <string name="usb_debugging">Depuración USB</string>
    <string name="enablement_guide_title">Cómo activar las opciones de desarrollador</string>
    <string name="enablement_guide_step_1">1. Abre los Ajustes del dispositivo.</string>
    <string name="enablement_guide_step_2">2. Abre Acerca del teléfono o la sección equivalente de información del dispositivo.</string>
    <string name="enablement_guide_step_3">3. Busca Número de compilación. Puede estar en Información de software u otro submenú del fabricante.</string>
    <string name="enablement_guide_step_4">4. Toca Número de compilación siete veces. Sigue las indicaciones de PIN, contraseña, patrón o biometría.</string>
    <string name="enablement_guide_step_5">5. Vuelve a Ajustes y abre Opciones de desarrollador.</string>
    <string name="manual_enablement_note">Debes activar las opciones de desarrollador por tu cuenta. Esta aplicación solo abre páginas de Ajustes y no puede desbloquear ni cambiar ajustes protegidos del sistema.</string>
    <string name="settings_unavailable">Android no ha podido abrir la página de Ajustes solicitada.</string>
    <string name="developer_options_disabled_guide">Parece que las opciones de desarrollador están desactivadas. Sigue la guía y actívalas manualmente.</string>
    <string name="developer_options_unavailable_guide">No se ha podido abrir Opciones de desarrollador en este dispositivo. Sigue la guía o abre Acerca del teléfono.</string>
    <string name="about_phone_fallback_settings">Acerca del teléfono no está disponible en este dispositivo; se han abierto los Ajustes generales.</string>
    <string name="usb_debugging_guidance">En Opciones de desarrollador, busca Depuración USB. Puede conceder acceso de depuración a ordenadores conectados; actívala solo si confías en el ordenador y la necesitas.</string>
    <string name="wireless_debugging_guidance">En Android 11 y versiones posteriores, busca Depuración inalámbrica dentro de Opciones de desarrollador. La disponibilidad y los nombres varían según el dispositivo.</string>
    <string name="wireless_debugging_unavailable">La depuración inalámbrica depende de la versión de Android y del dispositivo. Comprueba las opciones de desarrollador.</string>
    <string name="wireless_debugging_fallback_guidance">No se han podido abrir directamente las opciones de desarrollador. En Ajustes, busca Opciones de desarrollador y después Depuración inalámbrica si el dispositivo la admite.</string>
    <string name="settings_open_failed">Android no ha podido abrir Ajustes en este dispositivo.</string>
    <string name="status_updated">Se han actualizado el estado de desarrollo y los detalles del dispositivo.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">Detalles del hardware y sistema operativo</string>
    <string name="device_details_subtitle">Parámetros del sistema leídos de android.os.Build</string>
    <string name="android_version">Versión de Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Modelo del dispositivo</string>
    <string name="brand_hardware">Marca / hardware</string>
    <string name="security_patch">Parche de seguridad</string>
    <string name="build_number">Número de compilación</string>
    <string name="cpu_architecture">Arquitectura de CPU</string>
    <string name="quick_hardware_diagnostic">Diagnóstico rápido del hardware</string>
    <string name="diagnostic_stage_1">Etapa 1/3: Comprobación de pantalla y píxeles defectuosos</string>
    <string name="diagnostic_stage_1_description">Inspecciona los colores RGB para detectar posibles píxeles defectuosos.</string>
    <string name="diagnostic_stage_2">Etapa 2/3: Comprobación de vibración</string>
    <string name="diagnostic_stage_2_description">Comprueba el motor de vibración y la respuesta háptica.</string>
    <string name="diagnostic_stage_3">Etapa 3/3: Comprobación de multitáctil</string>
    <string name="diagnostic_stage_3_description">Toca la pantalla para comprobar la respuesta.</string>
    <string name="seconds_remaining">Quedan %1$d s</string>
    <string name="rgb_spectrum_test">Prueba de espectro RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Prueba de respuesta de vibración</string>
    <string name="digitizer_multi_touch_active">Toca la pantalla para comprobar la respuesta</string>
    <string name="diagnostic_passed">Secuencia de diagnóstico finalizada</string>
    <string name="diagnostic_passed_summary">Se han mostrado las indicaciones visuales, de vibración y táctiles.</string>
    <string name="rgb_screen_matrix">Comprobación de colores RGB de la pantalla</string>
    <string name="zero_dead_pixels_pass">Se necesita inspección visual</string>
    <string name="haptic_vibration_motor">Motor de vibración háptica</string>
    <string name="calibrated_functional_pass">Se requiere verificación del usuario</string>
    <string name="touch_digitizer">Digitalizador táctil</string>
    <string name="low_latency_multi_touch_pass">Se requiere verificación del usuario</string>
    <string name="share_specs">Compartir detalles del dispositivo</string>
    <string name="test_again">Volver a ejecutar</string>
    <string name="unknown">Desconocido</string>
    <string name="security_patch_unavailable">No disponible (Android anterior a 6)</string>
    <string name="status_active_on">ACTIVO (ENCENDIDO)</string>
    <string name="status_disabled_off">DESACTIVADO (APAGADO)</string>
    <string name="device_report_subject">Detalles del hardware del dispositivo</string>
    <string name="device_diagnostic_report">Informe del dispositivo Android
------------------------------
Modelo: %1$s %2$s
Android: %3$s (API %4$d)
Compilación: %5$s
Parche de seguridad: %6$s
Arquitectura de CPU: %7$s
Opciones de desarrollador: %8$s
Depuración USB: %9$s

Nota: las indicaciones en pantalla no certifican el hardware ni miden automáticamente píxeles defectuosos o el táctil.</string>
    <string name="update_available_title">Actualización disponible</string>
    <string name="update_available_message">Hay una nueva versión de Developers Options Shortcut. Actualiza para obtener las últimas mejoras y correcciones.</string>
    <string name="update_now">Actualizar ahora</string>
    <string name="later">Más tarde</string>
    <string name="offline_title">No tienes conexión</string>
    <string name="offline_message">Conéctate a Internet si quieres que se carguen los anuncios y ayudar a mantener esta aplicación gratuita. Las funciones principales siguen disponibles sin conexión.</string>
    <string name="internet_settings">Ajustes de Internet</string>
    <string name="not_now">Ahora no</string>
    <string name="offline_settings_unavailable">No se pudieron abrir los ajustes de red. Abre los Ajustes del dispositivo y elige Red o Internet.</string>
    <string name="offline_support_message">¿Te gusta la aplicación? Si lo deseas, puedes invitar al equipo a un café para apoyar el desarrollo futuro. Es totalmente opcional; la aplicación sigue disponible sin conexión.</string>
    <string name="offline_purchase_unverified_message">No tienes conexión, por lo que ahora no se puede verificar el estado de eliminación de anuncios. No se da ninguna compra por confirmada. Puedes seguir usando las funciones disponibles sin conexión y conectarte después si necesitas una función en línea.</string>
    <string name="offline_ad_supported_message">No tienes conexión. Los anuncios y algunas funciones en línea pueden no estar disponibles hasta que vuelvas a conectarte. La aplicación sigue funcionando sin conexión; conéctate solo cuando necesites una función en línea.</string>
    <string name="review_prompt_title">¿Te gusta Developers Options Shortcut?</string>
    <string name="review_prompt_message">Tus comentarios nos ayudan a mejorar la aplicación. Si tienes un momento, comparte una opinión sincera en Google Play. ¡Gracias por tu apoyo!</string>
    <string name="review_on_google_play">Opinar en Google Play</string>
    <string name="share_with_friends">Compartir con amigos</string>
    <string name="review_not_now">Ahora no</string>
    <string name="rate_on_google_play">Valorar en Google Play</string>
    <string name="play_store_unavailable">No se pudo abrir Google Play. Comprueba que haya un navegador o Play Store disponible.</string>
    <string name="share_unavailable">No hay ninguna aplicación compatible para compartir el enlace.</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-fr/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Ouvrir les options pour les développeurs</string>
    <string name="dev_options_status">Options pour les développeurs</string>
    <string name="usb_debugging_status">Débogage USB</string>
    <string name="status_enabled">Activé</string>
    <string name="status_disabled">Désactivé</string>
    <string name="status_unknown">Inconnu</string>
    <string name="device_specs_title">Matériel et système du téléphone</string>
    <string name="how_to_unlock_title">Activer les options pour les développeurs</string>
    <string name="how_to_unlock_desc">Vous devez activer manuellement les options pour les développeurs dans les paramètres Android. Cette application ne peut pas les déverrouiller.</string>
    <string name="dev_options_not_found">Les options pour les développeurs ne sont pas disponibles. Ouvrez le guide pour savoir comment les activer.</string>
    <string name="share_app">Partager l’application</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Découvrez Developers Options Shortcut sur Google Play ! L’application facilite l’accès aux options pour les développeurs Android. Essayez-la : https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Choisir la langue</string>
    <string name="language_picker_title">Langue de l’application</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Langue du système</string>
    <string name="done">Terminé</string>
    <string name="language_suggestion_title">Choisissez votre langue préférée</string>
    <string name="language_suggestion_message">La langue de votre appareil est %1$s. Voulez-vous l’utiliser dans cette application ?</string>
    <string name="language_switch_to_suggested">Changer de langue</string>
    <string name="language_continue_english">Garder l’anglais</string>
    <string name="real_time_settings_inspector">INSPECTEUR DES PARAMÈTRES EN TEMPS RÉEL</string>
    <string name="developer_options_status_description">État du mode développeur</string>
    <string name="usb_debugging_status_description">État du débogage USB</string>
    <string name="refresh_status">Actualiser l’état</string>
    <string name="share_application">Partager l’application</string>
    <string name="remove_ads_description">Supprimer les annonces (Google Play Billing)</string>
    <string name="ad_free_activated">Suppression des annonces activée</string>
    <string name="about_phone">À propos du téléphone</string>
    <string name="open_about_phone">Ouvrir À propos du téléphone</string>
    <string name="wireless_debugging">Débogage sans fil</string>
    <string name="usb_debugging">Débogage USB</string>
    <string name="enablement_guide_title">Activer les options pour les développeurs</string>
    <string name="enablement_guide_step_1">1. Ouvrez les paramètres de votre appareil.</string>
    <string name="enablement_guide_step_2">2. Ouvrez À propos du téléphone ou la section équivalente sur les informations de l’appareil.</string>
    <string name="enablement_guide_step_3">3. Recherchez Numéro de build. Il peut se trouver dans Informations sur le logiciel ou dans un autre sous-menu du fabricant.</string>
    <string name="enablement_guide_step_4">4. Appuyez sept fois sur Numéro de build. Suivez les demandes de code PIN, mot de passe, schéma ou biométrie.</string>
    <string name="enablement_guide_step_5">5. Revenez aux paramètres et ouvrez Options pour les développeurs.</string>
    <string name="manual_enablement_note">Vous devez activer vous-même les options pour les développeurs. Cette application ouvre uniquement les pages des paramètres et ne peut pas déverrouiller ni modifier les paramètres système protégés.</string>
    <string name="settings_unavailable">Android n’a pas pu ouvrir la page de paramètres demandée.</string>
    <string name="developer_options_disabled_guide">Les options pour les développeurs semblent désactivées. Suivez le guide pour les activer manuellement.</string>
    <string name="developer_options_unavailable_guide">Impossible d’ouvrir les options pour les développeurs sur cet appareil. Suivez le guide ou ouvrez À propos du téléphone.</string>
    <string name="about_phone_fallback_settings">À propos du téléphone n’est pas disponible sur cet appareil ; les paramètres généraux ont été ouverts.</string>
    <string name="usb_debugging_guidance">Dans les options pour les développeurs, recherchez Débogage USB. Il peut donner un accès de débogage aux ordinateurs connectés ; activez-le uniquement si vous faites confiance à l’ordinateur et en avez besoin.</string>
    <string name="wireless_debugging_guidance">Sous Android 11 et versions ultérieures, recherchez Débogage sans fil dans les options pour les développeurs. La disponibilité et les libellés varient selon l’appareil.</string>
    <string name="wireless_debugging_unavailable">La disponibilité du débogage sans fil dépend de la version d’Android et de l’appareil. Consultez les options pour les développeurs.</string>
    <string name="wireless_debugging_fallback_guidance">Impossible d’ouvrir directement les options pour les développeurs. Dans les paramètres, recherchez Options pour les développeurs, puis Débogage sans fil si l’appareil le prend en charge.</string>
    <string name="settings_open_failed">Android n’a pas pu ouvrir les paramètres sur cet appareil.</string>
    <string name="status_updated">L’état du mode développeur et les détails de l’appareil ont été actualisés.</string>
    <string name="play_store_error_format">Google Play : %1$s</string>
    <string name="device_hardware_os_details">Détails du matériel et du système</string>
    <string name="device_details_subtitle">Paramètres système lus depuis android.os.Build</string>
    <string name="android_version">Version d’Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Modèle de l’appareil</string>
    <string name="brand_hardware">Marque / matériel</string>
    <string name="security_patch">Correctif de sécurité</string>
    <string name="build_number">Numéro de build</string>
    <string name="cpu_architecture">Architecture du processeur</string>
    <string name="quick_hardware_diagnostic">Diagnostic matériel rapide</string>
    <string name="diagnostic_stage_1">Étape 1/3 : Vérification de l’écran et des pixels morts</string>
    <string name="diagnostic_stage_1_description">Inspectez le spectre de couleurs RVB pour repérer d’éventuels pixels morts.</string>
    <string name="diagnostic_stage_2">Étape 2/3 : Vérification des vibrations</string>
    <string name="diagnostic_stage_2_description">Vérifiez le moteur de vibration et le retour haptique.</string>
    <string name="diagnostic_stage_3">Étape 3/3 : Vérification du tactile multipoint</string>
    <string name="diagnostic_stage_3_description">Touchez l’écran pour vérifier la réponse tactile.</string>
    <string name="seconds_remaining">%1$d s restantes</string>
    <string name="rgb_spectrum_test">Test du spectre RVB (%1$s)</string>
    <string name="pulsing_vibration_engine">Test du retour vibratoire</string>
    <string name="digitizer_multi_touch_active">Touchez l’écran pour tester la réponse</string>
    <string name="diagnostic_passed">Séquence de diagnostic terminée</string>
    <string name="diagnostic_passed_summary">Les indications visuelles, vibratoires et tactiles ont été affichées.</string>
    <string name="rgb_screen_matrix">Vérification des couleurs de l’écran RVB</string>
    <string name="zero_dead_pixels_pass">Inspection visuelle nécessaire</string>
    <string name="haptic_vibration_motor">Moteur de vibration haptique</string>
    <string name="calibrated_functional_pass">Vérification par l’utilisateur requise</string>
    <string name="touch_digitizer">Écran tactile</string>
    <string name="low_latency_multi_touch_pass">Vérification par l’utilisateur requise</string>
    <string name="share_specs">Partager les détails de l’appareil</string>
    <string name="test_again">Recommencer</string>
    <string name="unknown">Inconnu</string>
    <string name="security_patch_unavailable">Indisponible (version d’Android antérieure à 6)</string>
    <string name="status_active_on">ACTIF (ACTIVÉ)</string>
    <string name="status_disabled_off">DÉSACTIVÉ</string>
    <string name="device_report_subject">Détails du matériel de l’appareil</string>
    <string name="device_diagnostic_report">Rapport de l’appareil Android
------------------------------
Modèle : %1$s %2$s
Android : %3$s (API %4$d)
Build : %5$s
Correctif de sécurité : %6$s
Architecture processeur : %7$s
Options pour les développeurs : %8$s
Débogage USB : %9$s

Remarque : les indications affichées ne certifient pas le matériel et ne mesurent pas automatiquement les pixels morts ou le tactile.</string>
    <string name="update_available_title">Mise à jour disponible</string>
    <string name="update_available_message">Une nouvelle version de Developers Options Shortcut est disponible. Mettez l’application à jour pour profiter des dernières améliorations et corrections.</string>
    <string name="update_now">Mettre à jour</string>
    <string name="later">Plus tard</string>
    <string name="offline_title">Vous êtes hors ligne</string>
    <string name="offline_message">Connectez-vous à Internet si vous souhaitez que les annonces se chargent et contribuer au développement continu de cette application gratuite. Les fonctions principales restent accessibles hors ligne.</string>
    <string name="internet_settings">Paramètres Internet</string>
    <string name="not_now">Pas maintenant</string>
    <string name="offline_settings_unavailable">Impossible d’ouvrir les paramètres réseau. Ouvrez les Paramètres de votre appareil et choisissez Réseau ou Internet.</string>
    <string name="offline_support_message">Vous aimez l’application ? Vous pouvez, si vous le souhaitez, offrir un café à l’équipe pour soutenir les développements à venir. C’est entièrement facultatif ; l’application reste disponible hors ligne.</string>
    <string name="offline_purchase_unverified_message">Vous êtes hors ligne ; l’application ne peut donc pas vérifier pour le moment si la suppression des annonces a été achetée. Aucun achat n’est considéré comme confirmé. Vous pouvez continuer à utiliser les fonctions hors ligne et vous reconnecter plus tard si nécessaire.</string>
    <string name="offline_ad_supported_message">Vous êtes hors ligne. Les annonces et certaines fonctions en ligne peuvent être indisponibles jusqu’au rétablissement de la connexion. L’application reste utilisable hors ligne ; reconnectez-vous uniquement si vous avez besoin d’une fonction en ligne.</string>
    <string name="review_prompt_title">Vous appréciez Developers Options Shortcut ?</string>
    <string name="review_prompt_message">Vos commentaires nous aident à améliorer l’application. Si vous avez un moment, laissez un avis honnête sur Google Play. Merci pour votre soutien !</string>
    <string name="review_on_google_play">Donner un avis sur Google Play</string>
    <string name="share_with_friends">Partager avec des amis</string>
    <string name="review_not_now">Pas maintenant</string>
    <string name="rate_on_google_play">Noter sur Google Play</string>
    <string name="play_store_unavailable">Impossible d’ouvrir Google Play. Vérifiez qu’un navigateur ou le Play Store est disponible.</string>
    <string name="share_unavailable">Aucune application compatible n’est disponible pour partager le lien.</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ar/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">فتح خيارات المطوّر</string>
    <string name="dev_options_status">خيارات المطوّر</string>
    <string name="usb_debugging_status">تصحيح أخطاء USB</string>
    <string name="status_enabled">مفعّل</string>
    <string name="status_disabled">معطّل</string>
    <string name="status_unknown">غير معروف</string>
    <string name="device_specs_title">مكوّنات الجهاز ونظام التشغيل</string>
    <string name="how_to_unlock_title">كيفية تفعيل خيارات المطوّر</string>
    <string name="how_to_unlock_desc">يجب تفعيل خيارات المطوّر يدويًا من إعدادات Android. لا يمكن لهذا التطبيق فتحها نيابةً عنك.</string>
    <string name="dev_options_not_found">خيارات المطوّر غير متاحة. افتح الدليل لمعرفة كيفية تفعيلها.</string>
    <string name="share_app">مشاركة التطبيق</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">اكتشف Developers Options Shortcut على Google Play! يسهّل الوصول إلى خيارات مطوّري Android. جرّبه: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">اختيار اللغة</string>
    <string name="language_picker_title">لغة التطبيق</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">لغة النظام</string>
    <string name="done">تم</string>
    <string name="language_suggestion_title">اختر لغتك المفضلة</string>
    <string name="language_suggestion_message">لغة جهازك هي %1$s. هل تريد استخدامها في هذا التطبيق؟</string>
    <string name="language_switch_to_suggested">تغيير اللغة</string>
    <string name="language_continue_english">المتابعة بالإنجليزية</string>
    <string name="real_time_settings_inspector">فاحص الإعدادات في الوقت الفعلي</string>
    <string name="developer_options_status_description">حالة مفتاح وضع المطوّر</string>
    <string name="usb_debugging_status_description">حالة مفتاح تصحيح أخطاء USB</string>
    <string name="refresh_status">تحديث الحالة</string>
    <string name="share_application">مشاركة التطبيق</string>
    <string name="remove_ads_description">إزالة الإعلانات (Google Play Billing)</string>
    <string name="ad_free_activated">تم تفعيل إزالة الإعلانات</string>
    <string name="about_phone">حول الهاتف</string>
    <string name="open_about_phone">فتح قسم حول الهاتف</string>
    <string name="wireless_debugging">تصحيح الأخطاء لاسلكيًا</string>
    <string name="usb_debugging">تصحيح أخطاء USB</string>
    <string name="enablement_guide_title">كيفية تفعيل خيارات المطوّر</string>
    <string name="enablement_guide_step_1">1. افتح إعدادات جهازك.</string>
    <string name="enablement_guide_step_2">2. افتح قسم حول الهاتف أو القسم المكافئ لمعلومات الجهاز.</string>
    <string name="enablement_guide_step_3">3. ابحث عن رقم الإصدار. قد يكون ضمن معلومات البرنامج أو قائمة فرعية خاصة بالشركة المصنّعة.</string>
    <string name="enablement_guide_step_4">4. اضغط على رقم الإصدار سبع مرات. اتبع مطالبات PIN أو كلمة المرور أو النمط أو القياسات الحيوية.</string>
    <string name="enablement_guide_step_5">5. ارجع إلى الإعدادات وافتح خيارات المطوّر.</string>
    <string name="manual_enablement_note">يجب تفعيل خيارات المطوّر بنفسك. يفتح هذا التطبيق صفحات الإعدادات فقط ولا يمكنه فتح إعدادات النظام المحمية أو تغييرها.</string>
    <string name="settings_unavailable">تعذّر على Android فتح صفحة الإعدادات المطلوبة.</string>
    <string name="developer_options_disabled_guide">يبدو أن خيارات المطوّر معطّلة. اتبع الدليل وفعّلها يدويًا.</string>
    <string name="developer_options_unavailable_guide">تعذّر فتح صفحة خيارات المطوّر على هذا الجهاز. اتبع الدليل أو افتح حول الهاتف.</string>
    <string name="about_phone_fallback_settings">قسم حول الهاتف غير متاح على هذا الجهاز، لذا تم فتح الإعدادات العامة.</string>
    <string name="usb_debugging_guidance">في خيارات المطوّر، انتقل إلى تصحيح أخطاء USB. قد يمنح أجهزة الكمبيوتر المتصلة إمكانية التصحيح؛ فعّله فقط عند الوثوق بالكمبيوتر والحاجة إليه.</string>
    <string name="wireless_debugging_guidance">في Android 11 والإصدارات الأحدث، ابحث عن تصحيح الأخطاء لاسلكيًا ضمن خيارات المطوّر. يختلف توفره واسمه حسب الجهاز.</string>
    <string name="wireless_debugging_unavailable">يعتمد توفر تصحيح الأخطاء لاسلكيًا على إصدار Android والجهاز. تحقق من خيارات المطوّر.</string>
    <string name="wireless_debugging_fallback_guidance">تعذّر فتح خيارات المطوّر مباشرة. ابحث عنها في الإعدادات ثم عن تصحيح الأخطاء لاسلكيًا إذا كان جهازك يدعمه.</string>
    <string name="settings_open_failed">تعذّر على Android فتح الإعدادات على هذا الجهاز.</string>
    <string name="status_updated">تم تحديث حالة المطوّر وتفاصيل الجهاز.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">تفاصيل مكوّنات الجهاز ونظام التشغيل</string>
    <string name="device_details_subtitle">معلمات النظام المقروءة من android.os.Build</string>
    <string name="android_version">إصدار Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">طراز الجهاز</string>
    <string name="brand_hardware">العلامة التجارية / المكونات</string>
    <string name="security_patch">تصحيح الأمان</string>
    <string name="build_number">رقم الإصدار</string>
    <string name="cpu_architecture">بنية وحدة المعالجة</string>
    <string name="quick_hardware_diagnostic">فحص سريع لمكونات الجهاز</string>
    <string name="diagnostic_stage_1">المرحلة 1/3: فحص الشاشة والبكسلات التالفة</string>
    <string name="diagnostic_stage_1_description">افحص ألوان RGB للتحقق من وجود بكسلات تالفة محتملة.</string>
    <string name="diagnostic_stage_2">المرحلة 2/3: فحص الاهتزاز</string>
    <string name="diagnostic_stage_2_description">تحقق من محرك الاهتزاز والاستجابة اللمسية.</string>
    <string name="diagnostic_stage_3">المرحلة 3/3: فحص اللمس المتعدد</string>
    <string name="diagnostic_stage_3_description">المس الشاشة للتحقق من الاستجابة.</string>
    <string name="seconds_remaining">متبقٍ %1$d ث</string>
    <string name="rgb_spectrum_test">اختبار طيف RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">اختبار استجابة الاهتزاز</string>
    <string name="digitizer_multi_touch_active">المس الشاشة لاختبار الاستجابة</string>
    <string name="diagnostic_passed">اكتمل تسلسل الفحص</string>
    <string name="diagnostic_passed_summary">تم عرض إرشادات الفحص البصري والاهتزاز واللمس.</string>
    <string name="rgb_screen_matrix">فحص ألوان شاشة RGB</string>
    <string name="zero_dead_pixels_pass">يلزم الفحص البصري</string>
    <string name="haptic_vibration_motor">محرك الاهتزاز اللمسي</string>
    <string name="calibrated_functional_pass">يلزم تحقق المستخدم</string>
    <string name="touch_digitizer">شاشة اللمس</string>
    <string name="low_latency_multi_touch_pass">يلزم تحقق المستخدم</string>
    <string name="share_specs">مشاركة تفاصيل الجهاز</string>
    <string name="test_again">إعادة الاختبار</string>
    <string name="unknown">غير معروف</string>
    <string name="security_patch_unavailable">غير متاح (إصدار Android أقدم من 6)</string>
    <string name="status_active_on">نشط (تشغيل)</string>
    <string name="status_disabled_off">معطّل (إيقاف)</string>
    <string name="device_report_subject">تفاصيل مكونات الجهاز</string>
    <string name="device_diagnostic_report">تقرير جهاز Android
------------------------------
الطراز: %1$s %2$s
Android: %3$s (API %4$d)
البنية: %5$s
تصحيح الأمان: %6$s
بنية وحدة المعالجة: %7$s
خيارات المطوّر: %8$s
تصحيح أخطاء USB: %9$s

ملاحظة: الإرشادات المعروضة ليست شهادة للأجهزة ولا تقيس تلقائيًا البكسلات التالفة أو استجابة اللمس.</string>
    <string name="update_available_title">يتوفر تحديث</string>
    <string name="update_available_message">يتوفر إصدار جديد من Developers Options Shortcut. حدّث التطبيق للحصول على أحدث التحسينات والإصلاحات.</string>
    <string name="update_now">التحديث الآن</string>
    <string name="later">لاحقًا</string>
    <string name="offline_title">أنت غير متصل بالإنترنت</string>
    <string name="offline_message">اتصل بالإنترنت إذا رغبت في تحميل الإعلانات والمساعدة في مواصلة تطوير هذا التطبيق المجاني. تظل الميزات الأساسية متاحة دون اتصال.</string>
    <string name="internet_settings">إعدادات الإنترنت</string>
    <string name="not_now">ليس الآن</string>
    <string name="offline_settings_unavailable">تعذر فتح إعدادات الشبكة. افتح إعدادات الجهاز واختر الشبكة أو الإنترنت.</string>
    <string name="offline_support_message">هل أعجبك التطبيق؟ يمكنك، إن رغبت، تقديم قهوة للفريق لدعم التطوير مستقبلًا. هذا اختياري تمامًا، ويظل التطبيق متاحًا دون اتصال.</string>
    <string name="offline_purchase_unverified_message">أنت غير متصل بالإنترنت، لذلك لا يمكن للتطبيق التحقق الآن من حالة إزالة الإعلانات. لن نفترض أن عملية شراء قد تأكدت. يمكنك متابعة استخدام الميزات المتاحة دون اتصال والاتصال لاحقًا عند الحاجة إلى ميزة عبر الإنترنت.</string>
    <string name="offline_ad_supported_message">أنت غير متصل بالإنترنت. قد لا تتوفر الإعلانات وبعض الميزات عبر الإنترنت حتى تعيد الاتصال. يظل التطبيق قابلًا للاستخدام دون اتصال؛ أعد الاتصال فقط عند الحاجة إلى ميزة عبر الإنترنت.</string>
    <string name="review_prompt_title">هل تستمتع باستخدام Developers Options Shortcut؟</string>
    <string name="review_prompt_message">تساعدنا ملاحظاتك في تحسين التطبيق. إذا كان لديك وقت، شارك مراجعة صادقة على Google Play. شكرًا لدعمك!</string>
    <string name="review_on_google_play">قيّم على Google Play</string>
    <string name="share_with_friends">مشاركة مع الأصدقاء</string>
    <string name="review_not_now">ليس الآن</string>
    <string name="rate_on_google_play">قيّم على Google Play</string>
    <string name="play_store_unavailable">تعذر فتح Google Play. تحقق من توفر متصفح أو متجر Play.</string>
    <string name="share_unavailable">لا يتوفر تطبيق متوافق لمشاركة الرابط.</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-zh-rCN/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">打开开发者选项</string>
    <string name="dev_options_status">开发者选项</string>
    <string name="usb_debugging_status">USB 调试</string>
    <string name="status_enabled">已启用</string>
    <string name="status_disabled">已停用</string>
    <string name="status_unknown">未知</string>
    <string name="device_specs_title">设备硬件与操作系统</string>
    <string name="how_to_unlock_title">如何启用开发者选项</string>
    <string name="how_to_unlock_desc">你需要在 Android 设置中手动启用开发者选项。此应用无法替你解锁。</string>
    <string name="dev_options_not_found">开发者选项不可用。请打开指南了解如何启用。</string>
    <string name="share_app">分享应用</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">欢迎在 Google Play 了解 Developers Options Shortcut！它能帮助您便捷地访问 Android 开发者选项。试试看：https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">选择语言</string>
    <string name="language_picker_title">应用语言</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">系统默认</string>
    <string name="done">完成</string>
    <string name="language_suggestion_title">选择你偏好的语言</string>
    <string name="language_suggestion_message">你的设备语言是 %1$s。要在此应用中使用该语言吗？</string>
    <string name="language_switch_to_suggested">切换语言</string>
    <string name="language_continue_english">继续使用英语</string>
    <string name="real_time_settings_inspector">实时设置检查器</string>
    <string name="developer_options_status_description">开发者模式开关状态</string>
    <string name="usb_debugging_status_description">USB 调试开关状态</string>
    <string name="refresh_status">刷新状态</string>
    <string name="share_application">分享应用</string>
    <string name="remove_ads_description">移除广告（Google Play Billing）</string>
    <string name="ad_free_activated">已启用无广告模式</string>
    <string name="about_phone">关于手机</string>
    <string name="open_about_phone">打开“关于手机”</string>
    <string name="wireless_debugging">无线调试</string>
    <string name="usb_debugging">USB 调试</string>
    <string name="enablement_guide_title">如何启用开发者选项</string>
    <string name="enablement_guide_step_1">1. 打开设备的“设置”。</string>
    <string name="enablement_guide_step_2">2. 打开“关于手机”或相应的设备信息页面。</string>
    <string name="enablement_guide_step_3">3. 找到“版本号”。它可能位于“软件信息”或制造商特有的子菜单中。</string>
    <string name="enablement_guide_step_4">4. 连续点按“版本号”七次。按提示完成 PIN、密码、图案或生物识别验证。</string>
    <string name="enablement_guide_step_5">5. 返回“设置”并打开“开发者选项”。</string>
    <string name="manual_enablement_note">你必须自行启用开发者选项。此应用只会打开设置页面，不能解锁或更改受保护的系统设置。</string>
    <string name="settings_unavailable">Android 无法打开请求的设置页面。</string>
    <string name="developer_options_disabled_guide">开发者选项似乎已停用。请按照指南手动启用。</string>
    <string name="developer_options_unavailable_guide">此设备无法打开开发者选项页面。请按照指南操作或打开“关于手机”。</string>
    <string name="about_phone_fallback_settings">此设备没有“关于手机”页面，因此已打开常规设置。</string>
    <string name="usb_debugging_guidance">在开发者选项中找到 USB 调试。它可能允许连接的电脑进行调试；只有在信任该电脑且确有需要时才启用。</string>
    <string name="wireless_debugging_guidance">在 Android 11 及更高版本中，可在开发者选项里查找无线调试。该功能是否可用以及具体名称因设备而异。</string>
    <string name="wireless_debugging_unavailable">无线调试是否可用取决于 Android 版本和设备。请检查开发者选项。</string>
    <string name="wireless_debugging_fallback_guidance">无法直接打开开发者选项。请在设置中搜索“开发者选项”，若设备支持，再查找无线调试。</string>
    <string name="settings_open_failed">Android 无法在此设备上打开设置。</string>
    <string name="status_updated">开发者状态和设备详情已更新。</string>
    <string name="play_store_error_format">Google Play：%1$s</string>
    <string name="device_hardware_os_details">设备硬件与系统详情</string>
    <string name="device_details_subtitle">从 android.os.Build 读取的系统参数</string>
    <string name="android_version">Android 版本</string>
    <string name="android_version_value">Android %1$s（API %2$d）</string>
    <string name="device_model">设备型号</string>
    <string name="brand_hardware">品牌 / 硬件</string>
    <string name="security_patch">安全补丁</string>
    <string name="build_number">版本号</string>
    <string name="cpu_architecture">CPU 架构</string>
    <string name="quick_hardware_diagnostic">快速硬件诊断</string>
    <string name="diagnostic_stage_1">第 1/3 步：屏幕与坏点检查</string>
    <string name="diagnostic_stage_1_description">检查 RGB 色谱，以观察是否存在坏点。</string>
    <string name="diagnostic_stage_2">第 2/3 步：振动检查</string>
    <string name="diagnostic_stage_2_description">检查振动马达和触觉反馈。</string>
    <string name="diagnostic_stage_3">第 3/3 步：多点触控检查</string>
    <string name="diagnostic_stage_3_description">触摸屏幕以检查触控响应。</string>
    <string name="seconds_remaining">剩余 %1$d 秒</string>
    <string name="rgb_spectrum_test">RGB 色谱测试（%1$s）</string>
    <string name="pulsing_vibration_engine">振动反馈测试</string>
    <string name="digitizer_multi_touch_active">触摸屏幕以测试响应</string>
    <string name="diagnostic_passed">诊断步骤已完成</string>
    <string name="diagnostic_passed_summary">已显示视觉、振动和触控提示。</string>
    <string name="rgb_screen_matrix">RGB 屏幕颜色检查</string>
    <string name="zero_dead_pixels_pass">需要进行视觉检查</string>
    <string name="haptic_vibration_motor">触觉振动马达</string>
    <string name="calibrated_functional_pass">需要用户验证</string>
    <string name="touch_digitizer">触摸数字转换器</string>
    <string name="low_latency_multi_touch_pass">需要用户验证</string>
    <string name="share_specs">分享设备详情</string>
    <string name="test_again">重新运行</string>
    <string name="unknown">未知</string>
    <string name="security_patch_unavailable">不可用（Android 版本低于 6）</string>
    <string name="status_active_on">启用（开）</string>
    <string name="status_disabled_off">停用（关）</string>
    <string name="device_report_subject">设备硬件详情</string>
    <string name="device_diagnostic_report">Android 设备报告
------------------------------
型号：%1$s %2$s
Android：%3$s（API %4$d）
构建版本：%5$s
安全补丁：%6$s
CPU 架构：%7$s
开发者选项：%8$s
USB 调试：%9$s

注意：屏幕上的提示不代表硬件认证，也不会自动检测坏点或触控问题。</string>
    <string name="update_available_title">有可用更新</string>
    <string name="update_available_message">Developers Options Shortcut 有新版本可用。立即更新以获取最新改进和问题修复。</string>
    <string name="update_now">立即更新</string>
    <string name="later">稍后</string>
    <string name="offline_title">当前处于离线状态</string>
    <string name="offline_message">如需加载广告并支持这款免费应用的持续开发，请连接互联网。应用的主要功能在离线时仍可使用。</string>
    <string name="internet_settings">互联网设置</string>
    <string name="not_now">暂不</string>
    <string name="offline_settings_unavailable">无法打开网络设置。请打开设备的“设置”，然后选择“网络”或“互联网”。</string>
    <string name="offline_support_message">喜欢这款应用吗？您可以自愿请团队喝杯咖啡，以支持后续开发。这完全出于自愿；应用在离线时仍可使用。</string>
    <string name="offline_purchase_unverified_message">你目前处于离线状态，应用暂时无法验证广告移除购买状态。我们不会假定购买已得到确认。你可以继续使用可离线使用的功能，之后需要在线功能时再连接网络。</string>
    <string name="offline_ad_supported_message">你目前处于离线状态。重新联网前，广告和部分在线功能可能无法使用。应用仍可离线使用；只有在需要在线功能时才需要重新连接。</string>
    <string name="review_prompt_title">喜欢 Developers Options Shortcut 吗？</string>
    <string name="review_prompt_message">您的反馈有助于改进应用。如果方便，请在 Google Play 分享真实评价。感谢您的支持！</string>
    <string name="review_on_google_play">在 Google Play 评价</string>
    <string name="share_with_friends">分享给朋友</string>
    <string name="review_not_now">暂不</string>
    <string name="rate_on_google_play">在 Google Play 评分</string>
    <string name="play_store_unavailable">无法打开 Google Play。请检查是否有可用的浏览器或 Play 商店。</string>
    <string name="share_unavailable">没有可用于分享链接的兼容应用。</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/xml/locale_config.xml',
    name: 'locale_config.xml',
    category: 'res',
    language: 'xml',
    description: 'Inventory of the sixteen bundled Android UI locales.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
    <locale android:name="en" />
    <locale android:name="ru" />
    <locale android:name="hi" />
    <locale android:name="es" />
    <locale android:name="fr" />
    <locale android:name="ar" />
    <locale android:name="zh-CN" />
    <locale android:name="bn" />
    <locale android:name="de" />
    <locale android:name="id" />
    <locale android:name="it" />
    <locale android:name="ja" />
    <locale android:name="ko" />
    <locale android:name="pt-BR" />
    <locale android:name="tr" />
    <locale android:name="vi" />
</locale-config>
`,
  },
  {
    path: 'app/src/main/res/values/themes.xml',
    name: 'themes.xml',
    category: 'res',
    language: 'xml',
    description: 'Synchronized from the native Android source tree.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- AppCompatActivity is used for backward-compatible per-app language switching. -->
    <style name="Theme.DevOptions" parent="Theme.AppCompat.Light.NoActionBar">
    </style>
</resources>
`,
  },
  {
    path: 'app/src/main/res/drawable-nodpi/ic_app_logo.png',
    name: 'ic_app_logo.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/adaptive-foreground.png',
    content: '',
  },
  {
    path: 'app/src/main/res/drawable-nodpi/ic_launcher_foreground.png',
    name: 'ic_launcher_foreground.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/adaptive-foreground.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-mdpi/ic_launcher.png',
    name: 'ic_launcher.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-mdpi.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-mdpi/ic_launcher_round.png',
    name: 'ic_launcher_round.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-mdpi.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-hdpi/ic_launcher.png',
    name: 'ic_launcher.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-hdpi.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-hdpi/ic_launcher_round.png',
    name: 'ic_launcher_round.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-hdpi.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-xhdpi/ic_launcher.png',
    name: 'ic_launcher.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-xhdpi.png',
    content: '',
  },
  {
    path: 'app/src/main/res/mipmap-xhdpi/ic_launcher_round.png',
    name: 'ic_launcher_round.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/ic_launcher-xhdpi.png',
    content: '',
  },
  {
    path: 'store-assets/playstore-icon-512.png',
    name: 'playstore-icon-512.png',
    category: 'res',
    language: 'png',
    description: 'Approved Developer Options app artwork supplied with this project.',
    binaryAsset: 'android-icons/playstore-icon-512.png',
    content: '',
  },
  {
    path: 'app/src/main/res/values-bn/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">ডেভেলপার অপশন খুলুন</string>
    <string name="dev_options_status">ডেভেলপার অপশন</string>
    <string name="usb_debugging_status">USB ডিবাগিং</string>
    <string name="status_enabled">সক্রিয়</string>
    <string name="status_disabled">নিষ্ক্রিয়</string>
    <string name="status_unknown">অজানা</string>
    <string name="device_specs_title">ডিভাইসের হার্ডওয়্যার ও অপারেটিং সিস্টেম</string>
    <string name="how_to_unlock_title">ডেভেলপার অপশন কীভাবে চালু করবেন</string>
    <string name="how_to_unlock_desc">Android সেটিংসে আপনাকে নিজে ডেভেলপার অপশন চালু করতে হবে। এই অ্যাপ নিজে থেকে এটি আনলক করতে পারে না।</string>
    <string name="dev_options_not_found">ডেভেলপার অপশন পাওয়া যায়নি। কীভাবে চালু করবেন তা জানতে নির্দেশিকা খুলুন।</string>
    <string name="share_app">অ্যাপ শেয়ার করুন</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Google Play-তে Developers Options Shortcut দেখুন! এটি Android Developer Options-এ সহজে যেতে সাহায্য করে। ব্যবহার করে দেখুন: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">ভাষা নির্বাচন করুন</string>
    <string name="language_picker_title">অ্যাপের ভাষা</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">সিস্টেমের ডিফল্ট ভাষা</string>
    <string name="done">সম্পন্ন</string>
    <string name="language_suggestion_title">আপনার পছন্দের ভাষা বেছে নিন</string>
    <string name="language_suggestion_message">আপনার ডিভাইসের ভাষা %1$s। আপনি কি এই অ্যাপেও এটি ব্যবহার করতে চান?</string>
    <string name="language_switch_to_suggested">ভাষা পরিবর্তন করুন</string>
    <string name="language_continue_english">ইংরেজি রাখুন</string>
    <string name="real_time_settings_inspector">রিয়েল-টাইম সেটিংস পরিদর্শক</string>
    <string name="developer_options_status_description">ডেভেলপার মোড সুইচের অবস্থা</string>
    <string name="usb_debugging_status_description">USB ডিবাগিং সুইচের অবস্থা</string>
    <string name="refresh_status">অবস্থা রিফ্রেশ করুন</string>
    <string name="share_application">অ্যাপ শেয়ার করুন</string>
    <string name="remove_ads_description">বিজ্ঞাপন সরান (Google Play Billing)</string>
    <string name="ad_free_activated">বিজ্ঞাপন-মুক্ত চালু হয়েছে</string>
    <string name="about_phone">ফোন সম্পর্কে</string>
    <string name="open_about_phone">ফোন সম্পর্কে খুলুন</string>
    <string name="wireless_debugging">ওয়্যারলেস ডিবাগিং</string>
    <string name="usb_debugging">USB ডিবাগিং</string>
    <string name="enablement_guide_title">ডেভেলপার অপশন কীভাবে চালু করবেন</string>
    <string name="enablement_guide_step_1">১. ডিভাইসের সেটিংস খুলুন।</string>
    <string name="enablement_guide_step_2">২. ফোন সম্পর্কে বা ডিভাইসের তথ্যের সমতুল্য বিভাগ খুলুন।</string>
    <string name="enablement_guide_step_3">৩. বিল্ড নম্বর খুঁজুন। এটি সফটওয়্যার তথ্য বা নির্মাতার অন্য কোনো মেনুতে থাকতে পারে।</string>
    <string name="enablement_guide_step_4">৪. বিল্ড নম্বরে সাতবার ট্যাপ করুন। PIN, পাসওয়ার্ড, প্যাটার্ন বা বায়োমেট্রিক নির্দেশ অনুসরণ করুন।</string>
    <string name="enablement_guide_step_5">৫. সেটিংসে ফিরে ডেভেলপার অপশন খুলুন।</string>
    <string name="manual_enablement_note">আপনাকেই ডেভেলপার অপশন চালু করতে হবে। এই অ্যাপ শুধু সেটিংস পৃষ্ঠা খোলে; সুরক্ষিত সিস্টেম সেটিংস আনলক বা পরিবর্তন করতে পারে না।</string>
    <string name="settings_unavailable">Android অনুরোধ করা সেটিংস পৃষ্ঠা খুলতে পারেনি।</string>
    <string name="developer_options_disabled_guide">ডেভেলপার অপশন বন্ধ আছে বলে মনে হচ্ছে। নির্দেশিকা অনুসরণ করে নিজে চালু করুন।</string>
    <string name="developer_options_unavailable_guide">এই ডিভাইসে ডেভেলপার অপশন খোলা যায়নি। নির্দেশিকা অনুসরণ করুন বা ফোন সম্পর্কে খুলুন।</string>
    <string name="about_phone_fallback_settings">ফোন সম্পর্কে পৃষ্ঠা নেই, তাই সাধারণ সেটিংস খোলা হয়েছে।</string>
    <string name="usb_debugging_guidance">ডেভেলপার অপশনে USB ডিবাগিং খুঁজুন। এটি সংযুক্ত কম্পিউটারকে ডিবাগ করার সুযোগ দিতে পারে; কম্পিউটারটি বিশ্বস্ত এবং প্রয়োজন হলেই চালু করুন।</string>
    <string name="wireless_debugging_guidance">Android 11 বা পরবর্তী সংস্করণে ডেভেলপার অপশনে ওয়্যারলেস ডিবাগিং খুঁজুন। প্রাপ্যতা ও নাম ডিভাইসভেদে আলাদা হতে পারে।</string>
    <string name="wireless_debugging_unavailable">ওয়্যারলেস ডিবাগিং Android সংস্করণ ও ডিভাইসের উপর নির্ভর করে। ডেভেলপার অপশন পরীক্ষা করুন।</string>
    <string name="wireless_debugging_fallback_guidance">ডেভেলপার অপশন সরাসরি খোলা যায়নি। সেটিংসে ডেভেলপার অপশন খুঁজুন, তারপর ডিভাইস সমর্থন করলে ওয়্যারলেস ডিবাগিং খুঁজুন।</string>
    <string name="settings_open_failed">এই ডিভাইসে Android সেটিংস খুলতে পারেনি।</string>
    <string name="status_updated">ডেভেলপার অবস্থা ও ডিভাইসের বিবরণ আপডেট হয়েছে।</string>
    <string name="play_store_error_format">Google Play ত্রুটি: %1$s</string>
    <string name="device_hardware_os_details">ডিভাইসের হার্ডওয়্যার ও OS-এর বিবরণ</string>
    <string name="device_details_subtitle">android.os.Build থেকে পড়া সিস্টেম প্যারামিটার</string>
    <string name="android_version">Android সংস্করণ</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">ডিভাইসের মডেল</string>
    <string name="brand_hardware">ব্র্যান্ড / হার্ডওয়্যার</string>
    <string name="security_patch">নিরাপত্তা প্যাচ</string>
    <string name="build_number">বিল্ড নম্বর</string>
    <string name="cpu_architecture">CPU আর্কিটেকচার</string>
    <string name="quick_hardware_diagnostic">দ্রুত হার্ডওয়্যার পরীক্ষা</string>
    <string name="diagnostic_stage_1">ধাপ ১/৩: স্ক্রিন ও ডেড-পিক্সেল পরীক্ষা</string>
    <string name="diagnostic_stage_1_description">সম্ভাব্য ডেড পিক্সেল দেখতে RGB রঙের বর্ণালী পরীক্ষা করুন।</string>
    <string name="diagnostic_stage_2">ধাপ ২/৩: কম্পন পরীক্ষা</string>
    <string name="diagnostic_stage_2_description">কম্পন মোটর ও হ্যাপটিক প্রতিক্রিয়া পরীক্ষা করুন।</string>
    <string name="diagnostic_stage_3">ধাপ ৩/৩: মাল্টি-টাচ পরীক্ষা</string>
    <string name="diagnostic_stage_3_description">স্ক্রিনে স্পর্শ করে প্রতিক্রিয়া পরীক্ষা করুন।</string>
    <string name="seconds_remaining">আরও %1$d সেকেন্ড</string>
    <string name="rgb_spectrum_test">RGB বর্ণালী পরীক্ষা (%1$s)</string>
    <string name="pulsing_vibration_engine">কম্পন প্রতিক্রিয়া পরীক্ষা</string>
    <string name="digitizer_multi_touch_active">প্রতিক্রিয়া পরীক্ষা করতে স্ক্রিনে স্পর্শ করুন</string>
    <string name="diagnostic_passed">পরীক্ষার ধাপ শেষ হয়েছে</string>
    <string name="diagnostic_passed_summary">দৃশ্যমান, কম্পন ও স্পর্শের নির্দেশনা দেখানো হয়েছে।</string>
    <string name="rgb_screen_matrix">RGB স্ক্রিনের রঙ পরীক্ষা</string>
    <string name="zero_dead_pixels_pass">চোখে দেখে পরীক্ষা প্রয়োজন</string>
    <string name="haptic_vibration_motor">হ্যাপটিক কম্পন মোটর</string>
    <string name="calibrated_functional_pass">ব্যবহারকারীর যাচাই প্রয়োজন</string>
    <string name="touch_digitizer">টাচ ডিজিটাইজার</string>
    <string name="low_latency_multi_touch_pass">ব্যবহারকারীর যাচাই প্রয়োজন</string>
    <string name="share_specs">ডিভাইসের বিবরণ শেয়ার করুন</string>
    <string name="test_again">আবার পরীক্ষা করুন</string>
    <string name="unknown">অজানা</string>
    <string name="security_patch_unavailable">পাওয়া যায়নি (Android সংস্করণ ৬-এর নিচে)</string>
    <string name="status_active_on">সক্রিয় (চালু)</string>
    <string name="status_disabled_off">নিষ্ক্রিয় (বন্ধ)</string>
    <string name="device_report_subject">ডিভাইসের হার্ডওয়্যারের বিবরণ</string>
    <string name="device_diagnostic_report">Android ডিভাইস রিপোর্ট
------------------------------
মডেল: %1$s %2$s
Android: %3$s (API %4$d)
বিল্ড: %5$s
নিরাপত্তা প্যাচ: %6$s
CPU আর্কিটেকচার: %7$s
ডেভেলপার অপশন: %8$s
USB ডিবাগিং: %9$s

দ্রষ্টব্য: স্ক্রিনের নির্দেশনা হার্ডওয়্যার সার্টিফিকেশন নয় এবং স্বয়ংক্রিয়ভাবে ডেড পিক্সেল বা স্পর্শের সমস্যা মাপে না。</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play খোলা যায়নি। ব্রাউজার বা Play Store উপলব্ধ আছে কি না দেখুন।</string>
    <string name="share_unavailable">লিংক শেয়ার করার জন্য কোনো সামঞ্জস্যপূর্ণ অ্যাপ নেই।</string>
    <string name="update_available_title">আপডেট উপলব্ধ</string>
    <string name="update_available_message">Developers Options Shortcut-এর নতুন সংস্করণ উপলব্ধ। সর্বশেষ উন্নতি ও ত্রুটি সমাধান পেতে আপডেট করুন।</string>
    <string name="update_now">এখনই আপডেট</string>
    <string name="later">পরে</string>
    <string name="offline_title">আপনি অফলাইনে আছেন</string>
    <string name="offline_message">বিজ্ঞাপন লোড করতে এবং এই বিনামূল্যের অ্যাপের উন্নয়ন চালিয়ে যেতে সহায়তা করতে ইন্টারনেটে যুক্ত হন। অ্যাপের মূল সুবিধাগুলি অফলাইনেও পাওয়া যায়।</string>
    <string name="internet_settings">ইন্টারনেট সেটিংস</string>
    <string name="not_now">এখন নয়</string>
    <string name="offline_settings_unavailable">নেটওয়ার্ক সেটিংস খোলা যায়নি। ডিভাইসের সেটিংস খুলে নেটওয়ার্ক বা ইন্টারনেট নির্বাচন করুন।</string>
    <string name="offline_support_message">অ্যাপটি ভালো লাগছে? ভবিষ্যতের উন্নয়নে সহায়তা করতে চাইলে আপনি ঐচ্ছিকভাবে দলকে এক কাপ কফি দিতে পারেন। এটি সম্পূর্ণ স্বেচ্ছামূলক; অ্যাপটি অফলাইনেও ব্যবহার করা যায়।</string>
    <string name="offline_purchase_unverified_message">আপনি অফলাইনে থাকায় এখন বিজ্ঞাপন সরানোর কেনাকাটার অবস্থা যাচাই করা যাচ্ছে না। কোনো কেনাকাটাকে নিশ্চিত বলে ধরা হচ্ছে না। উপলভ্য অফলাইন সুবিধা ব্যবহার করতে থাকুন এবং অনলাইন সুবিধার প্রয়োজন হলে পরে সংযোগ করুন।</string>
    <string name="offline_ad_supported_message">আপনি অফলাইনে আছেন। আবার সংযোগ না করা পর্যন্ত বিজ্ঞাপন ও কিছু অনলাইন সুবিধা উপলভ্য নাও হতে পারে। অ্যাপটি অফলাইনেও ব্যবহার করা যায়; শুধু অনলাইন সুবিধার প্রয়োজন হলে সংযোগ করুন।</string>
    <string name="review_prompt_title">Developers Options Shortcut ভালো লাগছে?</string>
    <string name="review_prompt_message">আপনার মতামত অ্যাপটিকে উন্নত করতে সাহায্য করে। সময় হলে Google Play-তে সৎ পর্যালোচনা দিন। সহযোগিতার জন্য ধন্যবাদ!</string>
    <string name="review_on_google_play">Google Play-তে পর্যালোচনা</string>
    <string name="share_with_friends">বন্ধুদের সঙ্গে শেয়ার করুন</string>
    <string name="review_not_now">এখন নয়</string>
    <string name="rate_on_google_play">Google Play-তে রেট দিন</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-de/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Entwickleroptionen öffnen</string>
    <string name="dev_options_status">Entwickleroptionen</string>
    <string name="usb_debugging_status">USB-Debugging</string>
    <string name="status_enabled">Aktiviert</string>
    <string name="status_disabled">Deaktiviert</string>
    <string name="status_unknown">Unbekannt</string>
    <string name="device_specs_title">Gerätehardware und Betriebssystem</string>
    <string name="how_to_unlock_title">Entwickleroptionen aktivieren</string>
    <string name="how_to_unlock_desc">Du musst die Entwickleroptionen manuell in den Android-Einstellungen aktivieren. Diese App kann sie nicht selbst freischalten.</string>
    <string name="dev_options_not_found">Entwickleroptionen sind nicht verfügbar. Öffne die Anleitung, um zu erfahren, wie du sie aktivierst.</string>
    <string name="share_app">App teilen</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Entdecke Developers Options Shortcut bei Google Play! Die App ermöglicht einen bequemen Zugriff auf die Android-Entwickleroptionen. Probiere sie aus: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Sprache auswählen</string>
    <string name="language_picker_title">App-Sprache</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Systemsprache</string>
    <string name="done">Fertig</string>
    <string name="language_suggestion_title">Bevorzugte Sprache auswählen</string>
    <string name="language_suggestion_message">Die Sprache deines Geräts ist %1$s. Möchtest du sie in dieser App verwenden?</string>
    <string name="language_switch_to_suggested">Sprache wechseln</string>
    <string name="language_continue_english">Englisch beibehalten</string>
    <string name="real_time_settings_inspector">EINSTELLUNGSÜBERWACHUNG IN ECHTZEIT</string>
    <string name="developer_options_status_description">Status des Entwickleroptionen-Schalters</string>
    <string name="usb_debugging_status_description">Status des USB-Debugging-Schalters</string>
    <string name="refresh_status">Status aktualisieren</string>
    <string name="share_application">App teilen</string>
    <string name="remove_ads_description">Werbung entfernen (Google Play Billing)</string>
    <string name="ad_free_activated">Werbefrei aktiviert</string>
    <string name="about_phone">Über das Telefon</string>
    <string name="open_about_phone">„Über das Telefon“ öffnen</string>
    <string name="wireless_debugging">Kabelloses Debugging</string>
    <string name="usb_debugging">USB-Debugging</string>
    <string name="enablement_guide_title">Entwickleroptionen aktivieren</string>
    <string name="enablement_guide_step_1">1. Öffne die Einstellungen deines Geräts.</string>
    <string name="enablement_guide_step_2">2. Öffne „Über das Telefon“ oder den entsprechenden Geräteinformationsbereich.</string>
    <string name="enablement_guide_step_3">3. Suche die Build-Nummer. Sie befindet sich möglicherweise unter „Softwareinformationen“ oder in einem herstellerspezifischen Untermenü.</string>
    <string name="enablement_guide_step_4">4. Tippe siebenmal auf die Build-Nummer. Folge gegebenenfalls den Aufforderungen für PIN, Passwort, Muster oder Biometrie.</string>
    <string name="enablement_guide_step_5">5. Kehre zu den Einstellungen zurück und öffne die Entwickleroptionen.</string>
    <string name="manual_enablement_note">Du musst die Entwickleroptionen selbst aktivieren. Diese App öffnet nur Einstellungsseiten und kann geschützte Systemeinstellungen weder freischalten noch ändern.</string>
    <string name="settings_unavailable">Android konnte die angeforderte Einstellungsseite nicht öffnen.</string>
    <string name="developer_options_disabled_guide">Die Entwickleroptionen scheinen deaktiviert zu sein. Folge der Anleitung und aktiviere sie manuell.</string>
    <string name="developer_options_unavailable_guide">Die Entwickleroptionen konnten auf diesem Gerät nicht geöffnet werden. Folge der Anleitung oder öffne „Über das Telefon“.</string>
    <string name="about_phone_fallback_settings">„Über das Telefon“ ist nicht verfügbar; stattdessen wurden die allgemeinen Einstellungen geöffnet.</string>
    <string name="usb_debugging_guidance">Suche in den Entwickleroptionen nach USB-Debugging. Dadurch können verbundene Computer Debugging-Zugriff erhalten. Aktiviere es nur bei Bedarf und wenn du dem Computer vertraust.</string>
    <string name="wireless_debugging_guidance">Unter Android 11 und neuer findest du kabelloses Debugging möglicherweise in den Entwickleroptionen. Verfügbarkeit und Bezeichnung hängen vom Gerät ab.</string>
    <string name="wireless_debugging_unavailable">Die Verfügbarkeit des kabellosen Debuggings hängt von Android-Version und Gerät ab. Prüfe die Entwickleroptionen.</string>
    <string name="wireless_debugging_fallback_guidance">Die Entwickleroptionen konnten nicht direkt geöffnet werden. Suche in den Einstellungen nach Entwickleroptionen und – falls unterstützt – nach kabellosem Debugging.</string>
    <string name="settings_open_failed">Android konnte die Einstellungen auf diesem Gerät nicht öffnen.</string>
    <string name="status_updated">Entwicklerstatus und Gerätedetails wurden aktualisiert.</string>
    <string name="play_store_error_format">Google Play-Fehler: %1$s</string>
    <string name="device_hardware_os_details">Hardware- und Betriebssystemdetails</string>
    <string name="device_details_subtitle">Systemparameter aus android.os.Build</string>
    <string name="android_version">Android-Version</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Gerätemodell</string>
    <string name="brand_hardware">Marke / Hardware</string>
    <string name="security_patch">Sicherheitspatch</string>
    <string name="build_number">Build-Nummer</string>
    <string name="cpu_architecture">CPU-Architektur</string>
    <string name="quick_hardware_diagnostic">Schnelle Hardwarediagnose</string>
    <string name="diagnostic_stage_1">Schritt 1/3: Bildschirm- und Pixelfehlerprüfung</string>
    <string name="diagnostic_stage_1_description">Prüfe das RGB-Farbspektrum auf mögliche Pixelfehler.</string>
    <string name="diagnostic_stage_2">Schritt 2/3: Vibrationsprüfung</string>
    <string name="diagnostic_stage_2_description">Prüfe Vibrationsmotor und haptische Rückmeldung.</string>
    <string name="diagnostic_stage_3">Schritt 3/3: Multitouch-Prüfung</string>
    <string name="diagnostic_stage_3_description">Berühre den Bildschirm, um die Touchreaktion zu prüfen.</string>
    <string name="seconds_remaining">Noch %1$d Sekunden</string>
    <string name="rgb_spectrum_test">RGB-Spektrumtest (%1$s)</string>
    <string name="pulsing_vibration_engine">Vibrationsfeedback testen</string>
    <string name="digitizer_multi_touch_active">Berühre den Bildschirm, um die Reaktion zu testen</string>
    <string name="diagnostic_passed">Diagnoseschritte abgeschlossen</string>
    <string name="diagnostic_passed_summary">Visuelle Hinweise sowie Vibrations- und Touchhinweise wurden angezeigt.</string>
    <string name="rgb_screen_matrix">RGB-Bildschirmfarben prüfen</string>
    <string name="zero_dead_pixels_pass">Visuelle Prüfung erforderlich</string>
    <string name="haptic_vibration_motor">Haptischer Vibrationsmotor</string>
    <string name="calibrated_functional_pass">Benutzerprüfung erforderlich</string>
    <string name="touch_digitizer">Touch-Digitalisierer</string>
    <string name="low_latency_multi_touch_pass">Benutzerprüfung erforderlich</string>
    <string name="share_specs">Gerätedetails teilen</string>
    <string name="test_again">Erneut testen</string>
    <string name="unknown">Unbekannt</string>
    <string name="security_patch_unavailable">Nicht verfügbar (Android-Version unter 6)</string>
    <string name="status_active_on">AKTIV (EIN)</string>
    <string name="status_disabled_off">DEAKTIVIERT (AUS)</string>
    <string name="device_report_subject">Gerätehardwaredetails</string>
    <string name="device_diagnostic_report">Android-Gerätebericht
------------------------------
Modell: %1$s %2$s
Android: %3$s (API %4$d)
Build: %5$s
Sicherheitspatch: %6$s
CPU-Architektur: %7$s
Entwickleroptionen: %8$s
USB-Debugging: %9$s

Hinweis: Die Bildschirmhinweise sind keine Hardwarezertifizierung und messen Pixelfehler oder Touchprobleme nicht automatisch.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play konnte nicht geöffnet werden. Prüfe, ob ein Browser oder der Play Store verfügbar ist.</string>
    <string name="share_unavailable">Keine kompatible App zum Teilen des Links verfügbar.</string>
    <string name="update_available_title">Update verfügbar</string>
    <string name="update_available_message">Eine neue Version von Developers Options Shortcut ist verfügbar. Aktualisiere die App, um die neuesten Verbesserungen und Fehlerkorrekturen zu erhalten.</string>
    <string name="update_now">Jetzt aktualisieren</string>
    <string name="later">Später</string>
    <string name="offline_title">Du bist offline</string>
    <string name="offline_message">Verbinde dich mit dem Internet, wenn du Werbung laden und die Weiterentwicklung dieser kostenlosen App unterstützen möchtest. Die Hauptfunktionen bleiben offline verfügbar.</string>
    <string name="internet_settings">Interneteinstellungen</string>
    <string name="not_now">Jetzt nicht</string>
    <string name="offline_settings_unavailable">Die Netzwerkeinstellungen konnten nicht geöffnet werden. Öffne die Geräteeinstellungen und wähle Netzwerk oder Internet.</string>
    <string name="offline_support_message">Gefällt Ihnen die App? Sie können dem Team freiwillig einen Kaffee spendieren, um die weitere Entwicklung zu unterstützen. Das ist völlig optional; die App bleibt offline nutzbar.</string>
    <string name="offline_purchase_unverified_message">Du bist offline, daher kann die App den Status des Kaufs zur Werbeentfernung derzeit nicht prüfen. Es wird kein Kauf als bestätigt angenommen. Du kannst verfügbare Offline-Funktionen weiter nutzen und dich später bei Bedarf für Online-Funktionen verbinden.</string>
    <string name="offline_ad_supported_message">Du bist offline. Werbung und einige Online-Funktionen sind möglicherweise erst nach einer erneuten Verbindung verfügbar. Die App bleibt offline nutzbar; verbinde dich nur, wenn du eine Online-Funktion benötigst.</string>
    <string name="review_prompt_title">Gefällt dir Developers Options Shortcut?</string>
    <string name="review_prompt_message">Dein Feedback hilft uns, die App zu verbessern. Wenn du einen Moment Zeit hast, teile eine ehrliche Bewertung bei Google Play. Danke für deine Unterstützung!</string>
    <string name="review_on_google_play">Bei Google Play bewerten</string>
    <string name="share_with_friends">Mit Freunden teilen</string>
    <string name="review_not_now">Nicht jetzt</string>
    <string name="rate_on_google_play">Bei Google Play bewerten</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-id/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Buka Opsi Pengembang</string>
    <string name="dev_options_status">Opsi Pengembang</string>
    <string name="usb_debugging_status">Debugging USB</string>
    <string name="status_enabled">Aktif</string>
    <string name="status_disabled">Nonaktif</string>
    <string name="status_unknown">Tidak diketahui</string>
    <string name="device_specs_title">Perangkat keras dan sistem operasi</string>
    <string name="how_to_unlock_title">Cara mengaktifkan Opsi Pengembang</string>
    <string name="how_to_unlock_desc">Anda harus mengaktifkan Opsi Pengembang secara manual di Setelan Android. Aplikasi ini tidak dapat membukanya untuk Anda.</string>
    <string name="dev_options_not_found">Opsi Pengembang tidak tersedia. Buka panduan untuk mengetahui cara mengaktifkannya.</string>
    <string name="share_app">Bagikan aplikasi</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Lihat Developers Options Shortcut di Google Play! Aplikasi ini memudahkan akses ke Opsi Pengembang Android. Coba sekarang: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Pilih bahasa</string>
    <string name="language_picker_title">Bahasa aplikasi</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Bahasa sistem</string>
    <string name="done">Selesai</string>
    <string name="language_suggestion_title">Pilih bahasa pilihan Anda</string>
    <string name="language_suggestion_message">Bahasa perangkat Anda adalah %1$s. Apakah Anda ingin menggunakannya di aplikasi ini?</string>
    <string name="language_switch_to_suggested">Ganti bahasa</string>
    <string name="language_continue_english">Tetap gunakan bahasa Inggris</string>
    <string name="real_time_settings_inspector">PEMERIKSA SETELAN WAKTU NYATA</string>
    <string name="developer_options_status_description">Status tombol Opsi Pengembang</string>
    <string name="usb_debugging_status_description">Status tombol debugging USB</string>
    <string name="refresh_status">Segarkan status</string>
    <string name="share_application">Bagikan aplikasi</string>
    <string name="remove_ads_description">Hapus iklan (Google Play Billing)</string>
    <string name="ad_free_activated">Bebas iklan aktif</string>
    <string name="about_phone">Tentang ponsel</string>
    <string name="open_about_phone">Buka Tentang ponsel</string>
    <string name="wireless_debugging">Debugging nirkabel</string>
    <string name="usb_debugging">Debugging USB</string>
    <string name="enablement_guide_title">Cara mengaktifkan Opsi Pengembang</string>
    <string name="enablement_guide_step_1">1. Buka Setelan perangkat.</string>
    <string name="enablement_guide_step_2">2. Buka Tentang ponsel atau bagian informasi perangkat yang setara.</string>
    <string name="enablement_guide_step_3">3. Cari Nomor bentukan. Letaknya mungkin di Informasi perangkat lunak atau submenu khusus produsen.</string>
    <string name="enablement_guide_step_4">4. Ketuk Nomor bentukan tujuh kali. Ikuti permintaan PIN, sandi, pola, atau biometrik jika diminta.</string>
    <string name="enablement_guide_step_5">5. Kembali ke Setelan lalu buka Opsi Pengembang.</string>
    <string name="manual_enablement_note">Anda harus mengaktifkan Opsi Pengembang sendiri. Aplikasi ini hanya membuka halaman Setelan dan tidak dapat membuka kunci atau mengubah setelan sistem yang dilindungi.</string>
    <string name="settings_unavailable">Android tidak dapat membuka halaman Setelan yang diminta.</string>
    <string name="developer_options_disabled_guide">Opsi Pengembang tampaknya dinonaktifkan. Ikuti panduan untuk mengaktifkannya secara manual.</string>
    <string name="developer_options_unavailable_guide">Halaman Opsi Pengembang tidak dapat dibuka di perangkat ini. Ikuti panduan atau buka Tentang ponsel.</string>
    <string name="about_phone_fallback_settings">Tentang ponsel tidak tersedia, jadi Setelan umum dibuka.</string>
    <string name="usb_debugging_guidance">Cari debugging USB di Opsi Pengembang. Fitur ini dapat memberi komputer yang tersambung akses debugging; aktifkan hanya jika diperlukan dan komputer tepercaya.</string>
    <string name="wireless_debugging_guidance">Di Android 11 dan yang lebih baru, cari debugging nirkabel di Opsi Pengembang. Ketersediaan dan namanya berbeda menurut perangkat.</string>
    <string name="wireless_debugging_unavailable">Ketersediaan debugging nirkabel bergantung pada versi Android dan perangkat. Periksa Opsi Pengembang.</string>
    <string name="wireless_debugging_fallback_guidance">Opsi Pengembang tidak dapat dibuka langsung. Cari Opsi Pengembang di Setelan, lalu cari debugging nirkabel jika perangkat mendukungnya.</string>
    <string name="settings_open_failed">Android tidak dapat membuka Setelan di perangkat ini.</string>
    <string name="status_updated">Status pengembang dan detail perangkat telah diperbarui.</string>
    <string name="play_store_error_format">Kesalahan Google Play: %1$s</string>
    <string name="device_hardware_os_details">Detail perangkat keras dan OS</string>
    <string name="device_details_subtitle">Parameter sistem yang dibaca dari android.os.Build</string>
    <string name="android_version">Versi Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Model perangkat</string>
    <string name="brand_hardware">Merek / perangkat keras</string>
    <string name="security_patch">Patch keamanan</string>
    <string name="build_number">Nomor bentukan</string>
    <string name="cpu_architecture">Arsitektur CPU</string>
    <string name="quick_hardware_diagnostic">Diagnostik perangkat keras cepat</string>
    <string name="diagnostic_stage_1">Tahap 1/3: Pemeriksaan layar dan piksel mati</string>
    <string name="diagnostic_stage_1_description">Periksa spektrum warna RGB untuk melihat kemungkinan piksel mati.</string>
    <string name="diagnostic_stage_2">Tahap 2/3: Pemeriksaan getaran</string>
    <string name="diagnostic_stage_2_description">Periksa motor getar dan respons haptik.</string>
    <string name="diagnostic_stage_3">Tahap 3/3: Pemeriksaan multitouch</string>
    <string name="diagnostic_stage_3_description">Sentuh layar untuk memeriksa respons sentuhan.</string>
    <string name="seconds_remaining">Sisa %1$d detik</string>
    <string name="rgb_spectrum_test">Tes spektrum RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Tes umpan balik getaran</string>
    <string name="digitizer_multi_touch_active">Sentuh layar untuk menguji respons</string>
    <string name="diagnostic_passed">Urutan diagnostik selesai</string>
    <string name="diagnostic_passed_summary">Petunjuk visual, getaran, dan sentuhan telah ditampilkan.</string>
    <string name="rgb_screen_matrix">Pemeriksaan warna layar RGB</string>
    <string name="zero_dead_pixels_pass">Perlu pemeriksaan visual</string>
    <string name="haptic_vibration_motor">Motor getar haptik</string>
    <string name="calibrated_functional_pass">Perlu verifikasi pengguna</string>
    <string name="touch_digitizer">Digitizer sentuh</string>
    <string name="low_latency_multi_touch_pass">Perlu verifikasi pengguna</string>
    <string name="share_specs">Bagikan detail perangkat</string>
    <string name="test_again">Uji lagi</string>
    <string name="unknown">Tidak diketahui</string>
    <string name="security_patch_unavailable">Tidak tersedia (versi Android di bawah 6)</string>
    <string name="status_active_on">AKTIF (ON)</string>
    <string name="status_disabled_off">NONAKTIF (OFF)</string>
    <string name="device_report_subject">Detail perangkat keras</string>
    <string name="device_diagnostic_report">Laporan perangkat Android
------------------------------
Model: %1$s %2$s
Android: %3$s (API %4$d)
Build: %5$s
Patch keamanan: %6$s
Arsitektur CPU: %7$s
Opsi Pengembang: %8$s
Debugging USB: %9$s

Catatan: petunjuk di layar bukan sertifikasi perangkat keras dan tidak mengukur piksel mati atau masalah sentuh secara otomatis.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play tidak dapat dibuka. Pastikan browser atau Play Store tersedia.</string>
    <string name="share_unavailable">Tidak ada aplikasi yang kompatibel untuk membagikan tautan ini.</string>
    <string name="update_available_title">Pembaruan tersedia</string>
    <string name="update_available_message">Versi baru Developers Options Shortcut tersedia. Perbarui untuk mendapatkan peningkatan dan perbaikan terbaru.</string>
    <string name="update_now">Perbarui sekarang</string>
    <string name="later">Nanti</string>
    <string name="offline_title">Anda sedang offline</string>
    <string name="offline_message">Sambungkan ke internet jika ingin iklan dimuat dan membantu mendukung pengembangan aplikasi gratis ini. Fitur utama aplikasi tetap tersedia secara offline.</string>
    <string name="internet_settings">Setelan internet</string>
    <string name="not_now">Jangan sekarang</string>
    <string name="offline_settings_unavailable">Setelan jaringan tidak dapat dibuka. Buka Setelan perangkat lalu pilih Jaringan atau Internet.</string>
    <string name="offline_support_message">Suka dengan aplikasi ini? Jika berkenan, Anda dapat mentraktir tim secangkir kopi untuk mendukung pengembangan selanjutnya. Ini sepenuhnya opsional; aplikasi tetap dapat digunakan secara offline.</string>
    <string name="offline_purchase_unverified_message">Anda sedang offline, jadi status pembelian penghapusan iklan belum dapat diverifikasi. Pembelian tidak dianggap telah dikonfirmasi. Anda dapat terus menggunakan fitur offline yang tersedia dan terhubung kembali nanti jika membutuhkan fitur online.</string>
    <string name="offline_ad_supported_message">Anda sedang offline. Iklan dan beberapa fitur online mungkin tidak tersedia sampai Anda terhubung kembali. Aplikasi tetap dapat digunakan secara offline; hubungkan kembali hanya jika Anda membutuhkan fitur online.</string>
    <string name="review_prompt_title">Menikmati Developers Options Shortcut?</string>
    <string name="review_prompt_message">Masukan Anda membantu kami meningkatkan aplikasi. Jika ada waktu, bagikan ulasan yang jujur di Google Play. Terima kasih atas dukungan Anda!</string>
    <string name="review_on_google_play">Beri ulasan di Google Play</string>
    <string name="share_with_friends">Bagikan kepada teman</string>
    <string name="review_not_now">Nanti saja</string>
    <string name="rate_on_google_play">Beri rating di Google Play</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-it/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Apri Opzioni sviluppatore</string>
    <string name="dev_options_status">Opzioni sviluppatore</string>
    <string name="usb_debugging_status">Debug USB</string>
    <string name="status_enabled">Attivato</string>
    <string name="status_disabled">Disattivato</string>
    <string name="status_unknown">Sconosciuto</string>
    <string name="device_specs_title">Hardware e sistema operativo del dispositivo</string>
    <string name="how_to_unlock_title">Come attivare le Opzioni sviluppatore</string>
    <string name="how_to_unlock_desc">Devi attivare manualmente le Opzioni sviluppatore nelle Impostazioni Android. Questa app non può sbloccarle al posto tuo.</string>
    <string name="dev_options_not_found">Le Opzioni sviluppatore non sono disponibili. Apri la guida per scoprire come attivarle.</string>
    <string name="share_app">Condividi app</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Scopri Developers Options Shortcut su Google Play! Facilita l\\'accesso alle Opzioni sviluppatore Android. Provala: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Seleziona lingua</string>
    <string name="language_picker_title">Lingua dell\\'app</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Lingua del sistema</string>
    <string name="done">Fine</string>
    <string name="language_suggestion_title">Scegli la lingua che preferisci</string>
    <string name="language_suggestion_message">La lingua del dispositivo è %1$s. Vuoi usarla in questa app?</string>
    <string name="language_switch_to_suggested">Cambia lingua</string>
    <string name="language_continue_english">Mantieni l\\'inglese</string>
    <string name="real_time_settings_inspector">CONTROLLO IMPOSTAZIONI IN TEMPO REALE</string>
    <string name="developer_options_status_description">Stato dell\\'interruttore Opzioni sviluppatore</string>
    <string name="usb_debugging_status_description">Stato dell\\'interruttore Debug USB</string>
    <string name="refresh_status">Aggiorna stato</string>
    <string name="share_application">Condividi applicazione</string>
    <string name="remove_ads_description">Rimuovi annunci (Google Play Billing)</string>
    <string name="ad_free_activated">Modalità senza annunci attivata</string>
    <string name="about_phone">Informazioni sul telefono</string>
    <string name="open_about_phone">Apri Informazioni sul telefono</string>
    <string name="wireless_debugging">Debug wireless</string>
    <string name="usb_debugging">Debug USB</string>
    <string name="enablement_guide_title">Come attivare le Opzioni sviluppatore</string>
    <string name="enablement_guide_step_1">1. Apri le Impostazioni del dispositivo.</string>
    <string name="enablement_guide_step_2">2. Apri Informazioni sul telefono o la sezione equivalente con i dettagli del dispositivo.</string>
    <string name="enablement_guide_step_3">3. Cerca Numero build. Potrebbe trovarsi in Informazioni software o in un sottomenu specifico del produttore.</string>
    <string name="enablement_guide_step_4">4. Tocca Numero build sette volte. Segui eventuali richieste di PIN, password, sequenza o verifica biometrica.</string>
    <string name="enablement_guide_step_5">5. Torna alle Impostazioni e apri Opzioni sviluppatore.</string>
    <string name="manual_enablement_note">Devi attivare da solo le Opzioni sviluppatore. Questa app apre solo pagine delle Impostazioni e non può sbloccare o modificare impostazioni di sistema protette.</string>
    <string name="settings_unavailable">Android non è riuscito ad aprire la pagina Impostazioni richiesta.</string>
    <string name="developer_options_disabled_guide">Le Opzioni sviluppatore sembrano disattivate. Segui la guida per attivarle manualmente.</string>
    <string name="developer_options_unavailable_guide">Non è stato possibile aprire la pagina Opzioni sviluppatore su questo dispositivo. Segui la guida o apri Informazioni sul telefono.</string>
    <string name="about_phone_fallback_settings">Informazioni sul telefono non è disponibile; sono state aperte le Impostazioni generali.</string>
    <string name="usb_debugging_guidance">Nelle Opzioni sviluppatore cerca Debug USB. Può consentire ai computer collegati di eseguire operazioni di debug; attivalo solo se necessario e se ti fidi del computer.</string>
    <string name="wireless_debugging_guidance">Su Android 11 e versioni successive cerca Debug wireless nelle Opzioni sviluppatore. Disponibilità e nome variano in base al dispositivo.</string>
    <string name="wireless_debugging_unavailable">La disponibilità del Debug wireless dipende dalla versione di Android e dal dispositivo. Controlla le Opzioni sviluppatore.</string>
    <string name="wireless_debugging_fallback_guidance">Non è stato possibile aprire direttamente le Opzioni sviluppatore. Cercale nelle Impostazioni, quindi cerca Debug wireless se supportato.</string>
    <string name="settings_open_failed">Android non è riuscito ad aprire le Impostazioni su questo dispositivo.</string>
    <string name="status_updated">Stato sviluppatore e dettagli del dispositivo aggiornati.</string>
    <string name="play_store_error_format">Errore Google Play: %1$s</string>
    <string name="device_hardware_os_details">Dettagli hardware e sistema operativo</string>
    <string name="device_details_subtitle">Parametri di sistema letti da android.os.Build</string>
    <string name="android_version">Versione Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Modello del dispositivo</string>
    <string name="brand_hardware">Marca / hardware</string>
    <string name="security_patch">Patch di sicurezza</string>
    <string name="build_number">Numero build</string>
    <string name="cpu_architecture">Architettura CPU</string>
    <string name="quick_hardware_diagnostic">Diagnostica hardware rapida</string>
    <string name="diagnostic_stage_1">Fase 1/3: controllo schermo e pixel difettosi</string>
    <string name="diagnostic_stage_1_description">Esamina lo spettro RGB per individuare possibili pixel difettosi.</string>
    <string name="diagnostic_stage_2">Fase 2/3: controllo vibrazione</string>
    <string name="diagnostic_stage_2_description">Controlla il motore di vibrazione e la risposta aptica.</string>
    <string name="diagnostic_stage_3">Fase 3/3: controllo multitouch</string>
    <string name="diagnostic_stage_3_description">Tocca lo schermo per verificare la risposta al tocco.</string>
    <string name="seconds_remaining">Ancora %1$d secondi</string>
    <string name="rgb_spectrum_test">Test spettro RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Test feedback vibrazione</string>
    <string name="digitizer_multi_touch_active">Tocca lo schermo per testare la risposta</string>
    <string name="diagnostic_passed">Sequenza diagnostica completata</string>
    <string name="diagnostic_passed_summary">Sono stati mostrati gli indicatori visivi, di vibrazione e di tocco.</string>
    <string name="rgb_screen_matrix">Controllo colori schermo RGB</string>
    <string name="zero_dead_pixels_pass">È necessaria un\\'ispezione visiva</string>
    <string name="haptic_vibration_motor">Motore di vibrazione aptica</string>
    <string name="calibrated_functional_pass">È necessaria la verifica dell\\'utente</string>
    <string name="touch_digitizer">Digitalizzatore touch</string>
    <string name="low_latency_multi_touch_pass">È necessaria la verifica dell\\'utente</string>
    <string name="share_specs">Condividi dettagli dispositivo</string>
    <string name="test_again">Ripeti test</string>
    <string name="unknown">Sconosciuto</string>
    <string name="security_patch_unavailable">Non disponibile (versione Android precedente alla 6)</string>
    <string name="status_active_on">ATTIVO (ON)</string>
    <string name="status_disabled_off">DISATTIVATO (OFF)</string>
    <string name="device_report_subject">Dettagli hardware del dispositivo</string>
    <string name="device_diagnostic_report">Rapporto dispositivo Android
------------------------------
Modello: %1$s %2$s
Android: %3$s (API %4$d)
Build: %5$s
Patch di sicurezza: %6$s
Architettura CPU: %7$s
Opzioni sviluppatore: %8$s
Debug USB: %9$s

Nota: gli indicatori a schermo non certificano l\\'hardware e non misurano automaticamente pixel difettosi o problemi touch.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Impossibile aprire Google Play. Verifica che sia disponibile un browser o il Play Store.</string>
    <string name="share_unavailable">Nessuna app compatibile disponibile per condividere il link.</string>
    <string name="update_available_title">Aggiornamento disponibile</string>
    <string name="update_available_message">È disponibile una nuova versione di Developers Options Shortcut. Aggiorna per ottenere gli ultimi miglioramenti e le correzioni.</string>
    <string name="update_now">Aggiorna ora</string>
    <string name="later">Più tardi</string>
    <string name="offline_title">Sei offline</string>
    <string name="offline_message">Connettiti a Internet se desideri caricare gli annunci e sostenere lo sviluppo di questa app gratuita. Le funzioni principali restano disponibili offline.</string>
    <string name="internet_settings">Impostazioni Internet</string>
    <string name="not_now">Non ora</string>
    <string name="offline_settings_unavailable">Impossibile aprire le impostazioni di rete. Apri le Impostazioni del dispositivo e scegli Rete o Internet.</string>
    <string name="offline_support_message">Ti piace l’app? Se lo desideri, puoi offrire un caffè al team per sostenere lo sviluppo futuro. È del tutto facoltativo; l’app resta disponibile offline.</string>
    <string name="offline_purchase_unverified_message">Sei offline, quindi al momento l’app non può verificare lo stato dell’acquisto per rimuovere gli annunci. Nessun acquisto viene considerato confermato. Puoi continuare a usare le funzioni offline disponibili e riconnetterti in seguito se ti serve una funzione online.</string>
    <string name="offline_ad_supported_message">Sei offline. Gli annunci e alcune funzioni online potrebbero non essere disponibili finché non ti riconnetti. L’app resta utilizzabile offline; riconnettiti solo quando ti serve una funzione online.</string>
    <string name="review_prompt_title">Ti piace Developers Options Shortcut?</string>
    <string name="review_prompt_message">Il tuo feedback ci aiuta a migliorare l\\'app. Se hai un momento, lascia una recensione sincera su Google Play. Grazie per il supporto!</string>
    <string name="review_on_google_play">Recensisci su Google Play</string>
    <string name="share_with_friends">Condividi con gli amici</string>
    <string name="review_not_now">Non ora</string>
    <string name="rate_on_google_play">Valuta su Google Play</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ja/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">開発者向けオプションを開く</string>
    <string name="dev_options_status">開発者向けオプション</string>
    <string name="usb_debugging_status">USB デバッグ</string>
    <string name="status_enabled">有効</string>
    <string name="status_disabled">無効</string>
    <string name="status_unknown">不明</string>
    <string name="device_specs_title">端末のハードウェアと OS</string>
    <string name="how_to_unlock_title">開発者向けオプションを有効にする方法</string>
    <string name="how_to_unlock_desc">Android の設定で開発者向けオプションを手動で有効にしてください。このアプリでロックを解除することはできません。</string>
    <string name="dev_options_not_found">開発者向けオプションを利用できません。有効にする方法をガイドで確認してください。</string>
    <string name="share_app">アプリを共有</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Google Play の Developers Options Shortcut をご覧ください。Android の開発者向けオプションへ簡単にアクセスできます。ぜひお試しください: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">言語を選択</string>
    <string name="language_picker_title">アプリの言語</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">システムの言語</string>
    <string name="done">完了</string>
    <string name="language_suggestion_title">使用する言語を選択</string>
    <string name="language_suggestion_message">端末の言語は %1$s です。このアプリでも使用しますか？</string>
    <string name="language_switch_to_suggested">言語を切り替える</string>
    <string name="language_continue_english">英語を使用する</string>
    <string name="real_time_settings_inspector">リアルタイム設定インスペクター</string>
    <string name="developer_options_status_description">開発者モードのスイッチ状態</string>
    <string name="usb_debugging_status_description">USB デバッグのスイッチ状態</string>
    <string name="refresh_status">状態を更新</string>
    <string name="share_application">アプリを共有</string>
    <string name="remove_ads_description">広告を削除（Google Play Billing）</string>
    <string name="ad_free_activated">広告なしが有効です</string>
    <string name="about_phone">デバイス情報</string>
    <string name="open_about_phone">デバイス情報を開く</string>
    <string name="wireless_debugging">ワイヤレスデバッグ</string>
    <string name="usb_debugging">USB デバッグ</string>
    <string name="enablement_guide_title">開発者向けオプションを有効にする方法</string>
    <string name="enablement_guide_step_1">1. 端末の設定を開きます。</string>
    <string name="enablement_guide_step_2">2. 「デバイス情報」または同等の端末情報セクションを開きます。</string>
    <string name="enablement_guide_step_3">3. ビルド番号を探します。「ソフトウェア情報」やメーカー固有のサブメニューにある場合があります。</string>
    <string name="enablement_guide_step_4">4. ビルド番号を 7 回タップします。PIN、パスワード、パターン、生体認証の指示があれば従ってください。</string>
    <string name="enablement_guide_step_5">5. 設定に戻り、開発者向けオプションを開きます。</string>
    <string name="manual_enablement_note">開発者向けオプションはご自身で有効にしてください。このアプリは設定画面を開くだけで、保護されたシステム設定の解除や変更はできません。</string>
    <string name="settings_unavailable">Android で指定された設定画面を開けませんでした。</string>
    <string name="developer_options_disabled_guide">開発者向けオプションが無効になっているようです。ガイドに従って手動で有効にしてください。</string>
    <string name="developer_options_unavailable_guide">この端末では開発者向けオプションを開けませんでした。ガイドに従うか、デバイス情報を開いてください。</string>
    <string name="about_phone_fallback_settings">デバイス情報を利用できないため、通常の設定を開きました。</string>
    <string name="usb_debugging_guidance">開発者向けオプションで USB デバッグを探してください。接続したパソコンにデバッグアクセスを許可する場合があります。信頼できるパソコンで必要な場合だけ有効にしてください。</string>
    <string name="wireless_debugging_guidance">Android 11 以降では、開発者向けオプションにワイヤレスデバッグがあります。利用可否や名称は端末によって異なります。</string>
    <string name="wireless_debugging_unavailable">ワイヤレスデバッグの利用可否は Android のバージョンと端末によって異なります。開発者向けオプションを確認してください。</string>
    <string name="wireless_debugging_fallback_guidance">開発者向けオプションを直接開けませんでした。設定で開発者向けオプションを検索し、対応端末ならワイヤレスデバッグを探してください。</string>
    <string name="settings_open_failed">この端末で Android の設定を開けませんでした。</string>
    <string name="status_updated">開発者状態と端末情報を更新しました。</string>
    <string name="play_store_error_format">Google Play エラー: %1$s</string>
    <string name="device_hardware_os_details">端末のハードウェアと OS の詳細</string>
    <string name="device_details_subtitle">android.os.Build から読み取ったシステム情報</string>
    <string name="android_version">Android バージョン</string>
    <string name="android_version_value">Android %1$s（API %2$d）</string>
    <string name="device_model">端末モデル</string>
    <string name="brand_hardware">ブランド / ハードウェア</string>
    <string name="security_patch">セキュリティパッチ</string>
    <string name="build_number">ビルド番号</string>
    <string name="cpu_architecture">CPU アーキテクチャ</string>
    <string name="quick_hardware_diagnostic">簡易ハードウェア診断</string>
    <string name="diagnostic_stage_1">ステップ 1/3: 画面とドット抜けの確認</string>
    <string name="diagnostic_stage_1_description">RGB の色を表示し、ドット抜けがないか目視で確認します。</string>
    <string name="diagnostic_stage_2">ステップ 2/3: 振動の確認</string>
    <string name="diagnostic_stage_2_description">振動モーターと触覚フィードバックを確認します。</string>
    <string name="diagnostic_stage_3">ステップ 3/3: マルチタッチの確認</string>
    <string name="diagnostic_stage_3_description">画面に触れてタッチの反応を確認します。</string>
    <string name="seconds_remaining">残り %1$d 秒</string>
    <string name="rgb_spectrum_test">RGB スペクトルテスト（%1$s）</string>
    <string name="pulsing_vibration_engine">振動フィードバックテスト</string>
    <string name="digitizer_multi_touch_active">画面に触れて反応を確認してください</string>
    <string name="diagnostic_passed">診断手順が完了しました</string>
    <string name="diagnostic_passed_summary">画面、振動、タッチの確認案内を表示しました。</string>
    <string name="rgb_screen_matrix">RGB 画面色の確認</string>
    <string name="zero_dead_pixels_pass">目視確認が必要です</string>
    <string name="haptic_vibration_motor">触覚振動モーター</string>
    <string name="calibrated_functional_pass">ユーザーによる確認が必要です</string>
    <string name="touch_digitizer">タッチデジタイザー</string>
    <string name="low_latency_multi_touch_pass">ユーザーによる確認が必要です</string>
    <string name="share_specs">端末情報を共有</string>
    <string name="test_again">再テスト</string>
    <string name="unknown">不明</string>
    <string name="security_patch_unavailable">利用不可（Android 6 未満）</string>
    <string name="status_active_on">有効（ON）</string>
    <string name="status_disabled_off">無効（OFF）</string>
    <string name="device_report_subject">端末ハードウェアの詳細</string>
    <string name="device_diagnostic_report">Android 端末レポート
------------------------------
モデル: %1$s %2$s
Android: %3$s（API %4$d）
ビルド: %5$s
セキュリティパッチ: %6$s
CPU アーキテクチャ: %7$s
開発者向けオプション: %8$s
USB デバッグ: %9$s

注意: 画面に表示される案内はハードウェア認証ではなく、ドット抜けやタッチの問題を自動測定するものでもありません。</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play を開けませんでした。ブラウザまたは Play ストアが利用できるか確認してください。</string>
    <string name="share_unavailable">リンクを共有できる対応アプリがありません。</string>
    <string name="update_available_title">アップデートがあります</string>
    <string name="update_available_message">Developers Options Shortcut の新しいバージョンが公開されています。最新の改善と修正を利用するには更新してください。</string>
    <string name="update_now">今すぐ更新</string>
    <string name="later">後で</string>
    <string name="offline_title">オフラインです</string>
    <string name="offline_message">広告を読み込み、この無料アプリの継続的な開発を支援するには、インターネットに接続してください。アプリの主な機能はオフラインでも利用できます。</string>
    <string name="internet_settings">インターネット設定</string>
    <string name="not_now">今はしない</string>
    <string name="offline_settings_unavailable">ネットワーク設定を開けません。端末の設定を開き、「ネットワーク」または「インターネット」を選択してください。</string>
    <string name="offline_support_message">このアプリを気に入っていただけましたか？ご希望であれば、今後の開発を応援するためにチームへコーヒーを差し入れることができます。完全に任意で、アプリはオフラインでも利用できます。</string>
    <string name="offline_purchase_unverified_message">現在オフラインのため、広告削除の購入状況を確認できません。購入済みとは判断していません。利用可能なオフライン機能を引き続き使用し、オンライン機能が必要になったときに接続してください。</string>
    <string name="offline_ad_supported_message">現在オフラインです。再接続するまで、広告や一部のオンライン機能を利用できない場合があります。アプリはオフラインでも使用できます。オンライン機能が必要なときだけ接続してください。</string>
    <string name="review_prompt_title">Developers Options Shortcut はいかがですか？</string>
    <string name="review_prompt_message">ご意見はアプリの改善に役立ちます。お時間があれば、Google Play で率直なレビューをお寄せください。ご支援ありがとうございます。</string>
    <string name="review_on_google_play">Google Play でレビュー</string>
    <string name="share_with_friends">友だちに共有</string>
    <string name="review_not_now">今はしない</string>
    <string name="rate_on_google_play">Google Play で評価</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ko/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">개발자 옵션 열기</string>
    <string name="dev_options_status">개발자 옵션</string>
    <string name="usb_debugging_status">USB 디버깅</string>
    <string name="status_enabled">사용</string>
    <string name="status_disabled">사용 중지</string>
    <string name="status_unknown">알 수 없음</string>
    <string name="device_specs_title">기기 하드웨어 및 운영체제</string>
    <string name="how_to_unlock_title">개발자 옵션 사용 설정 방법</string>
    <string name="how_to_unlock_desc">Android 설정에서 개발자 옵션을 직접 사용 설정해야 합니다. 이 앱은 옵션을 대신 잠금 해제할 수 없습니다.</string>
    <string name="dev_options_not_found">개발자 옵션을 사용할 수 없습니다. 사용 설정 방법은 안내를 확인하세요.</string>
    <string name="share_app">앱 공유</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Google Play에서 Developers Options Shortcut을 확인해 보세요. Android 개발자 옵션에 편리하게 접근할 수 있습니다. 사용해 보세요: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">언어 선택</string>
    <string name="language_picker_title">앱 언어</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">시스템 언어</string>
    <string name="done">완료</string>
    <string name="language_suggestion_title">원하는 언어 선택</string>
    <string name="language_suggestion_message">기기의 언어는 %1$s입니다. 이 앱에서도 사용하시겠어요?</string>
    <string name="language_switch_to_suggested">언어 변경</string>
    <string name="language_continue_english">영어 유지</string>
    <string name="real_time_settings_inspector">실시간 설정 검사기</string>
    <string name="developer_options_status_description">개발자 모드 스위치 상태</string>
    <string name="usb_debugging_status_description">USB 디버깅 스위치 상태</string>
    <string name="refresh_status">상태 새로고침</string>
    <string name="share_application">애플리케이션 공유</string>
    <string name="remove_ads_description">광고 제거(Google Play Billing)</string>
    <string name="ad_free_activated">광고 제거가 활성화됨</string>
    <string name="about_phone">휴대전화 정보</string>
    <string name="open_about_phone">휴대전화 정보 열기</string>
    <string name="wireless_debugging">무선 디버깅</string>
    <string name="usb_debugging">USB 디버깅</string>
    <string name="enablement_guide_title">개발자 옵션 사용 설정 방법</string>
    <string name="enablement_guide_step_1">1. 기기의 설정을 엽니다.</string>
    <string name="enablement_guide_step_2">2. 휴대전화 정보 또는 이에 해당하는 기기 정보 메뉴를 엽니다.</string>
    <string name="enablement_guide_step_3">3. 빌드 번호를 찾습니다. 소프트웨어 정보나 제조업체별 하위 메뉴에 있을 수 있습니다.</string>
    <string name="enablement_guide_step_4">4. 빌드 번호를 7번 탭합니다. PIN, 비밀번호, 패턴 또는 생체 인증 안내가 표시되면 따르세요.</string>
    <string name="enablement_guide_step_5">5. 설정으로 돌아가 개발자 옵션을 엽니다.</string>
    <string name="manual_enablement_note">개발자 옵션은 직접 사용 설정해야 합니다. 이 앱은 설정 화면만 열며 보호된 시스템 설정을 해제하거나 변경할 수 없습니다.</string>
    <string name="settings_unavailable">Android에서 요청한 설정 화면을 열 수 없습니다.</string>
    <string name="developer_options_disabled_guide">개발자 옵션이 사용 중지된 것 같습니다. 안내에 따라 직접 사용 설정하세요.</string>
    <string name="developer_options_unavailable_guide">이 기기에서 개발자 옵션을 열 수 없습니다. 안내를 따르거나 휴대전화 정보를 여세요.</string>
    <string name="about_phone_fallback_settings">휴대전화 정보 화면을 사용할 수 없어 일반 설정을 열었습니다.</string>
    <string name="usb_debugging_guidance">개발자 옵션에서 USB 디버깅을 찾으세요. 연결된 컴퓨터에 디버깅 권한을 줄 수 있으므로 신뢰할 수 있는 컴퓨터에서 필요할 때만 사용 설정하세요.</string>
    <string name="wireless_debugging_guidance">Android 11 이상에서는 개발자 옵션에서 무선 디버깅을 찾을 수 있습니다. 제공 여부와 이름은 기기마다 다릅니다.</string>
    <string name="wireless_debugging_unavailable">무선 디버깅 제공 여부는 Android 버전과 기기에 따라 다릅니다. 개발자 옵션을 확인하세요.</string>
    <string name="wireless_debugging_fallback_guidance">개발자 옵션을 바로 열 수 없습니다. 설정에서 개발자 옵션을 검색하고, 기기가 지원하면 무선 디버깅을 찾으세요.</string>
    <string name="settings_open_failed">이 기기에서 Android 설정을 열 수 없습니다.</string>
    <string name="status_updated">개발자 상태와 기기 정보가 업데이트되었습니다.</string>
    <string name="play_store_error_format">Google Play 오류: %1$s</string>
    <string name="device_hardware_os_details">기기 하드웨어 및 OS 세부정보</string>
    <string name="device_details_subtitle">android.os.Build에서 읽은 시스템 매개변수</string>
    <string name="android_version">Android 버전</string>
    <string name="android_version_value">Android %1$s(API %2$d)</string>
    <string name="device_model">기기 모델</string>
    <string name="brand_hardware">브랜드 / 하드웨어</string>
    <string name="security_patch">보안 패치</string>
    <string name="build_number">빌드 번호</string>
    <string name="cpu_architecture">CPU 아키텍처</string>
    <string name="quick_hardware_diagnostic">빠른 하드웨어 진단</string>
    <string name="diagnostic_stage_1">1/3단계: 화면 및 불량 화소 확인</string>
    <string name="diagnostic_stage_1_description">RGB 색상 스펙트럼을 확인해 불량 화소가 있는지 살펴보세요.</string>
    <string name="diagnostic_stage_2">2/3단계: 진동 확인</string>
    <string name="diagnostic_stage_2_description">진동 모터와 햅틱 반응을 확인하세요.</string>
    <string name="diagnostic_stage_3">3/3단계: 멀티터치 확인</string>
    <string name="diagnostic_stage_3_description">화면을 터치해 반응을 확인하세요.</string>
    <string name="seconds_remaining">남은 시간 %1$d초</string>
    <string name="rgb_spectrum_test">RGB 스펙트럼 테스트(%1$s)</string>
    <string name="pulsing_vibration_engine">진동 반응 테스트</string>
    <string name="digitizer_multi_touch_active">반응을 확인하려면 화면을 터치하세요</string>
    <string name="diagnostic_passed">진단 단계 완료</string>
    <string name="diagnostic_passed_summary">시각, 진동 및 터치 안내가 표시되었습니다.</string>
    <string name="rgb_screen_matrix">RGB 화면 색상 확인</string>
    <string name="zero_dead_pixels_pass">육안 확인 필요</string>
    <string name="haptic_vibration_motor">햅틱 진동 모터</string>
    <string name="calibrated_functional_pass">사용자 확인 필요</string>
    <string name="touch_digitizer">터치 디지타이저</string>
    <string name="low_latency_multi_touch_pass">사용자 확인 필요</string>
    <string name="share_specs">기기 정보 공유</string>
    <string name="test_again">다시 테스트</string>
    <string name="unknown">알 수 없음</string>
    <string name="security_patch_unavailable">사용할 수 없음(Android 6 미만)</string>
    <string name="status_active_on">활성화(켜짐)</string>
    <string name="status_disabled_off">비활성화(꺼짐)</string>
    <string name="device_report_subject">기기 하드웨어 정보</string>
    <string name="device_diagnostic_report">Android 기기 보고서
------------------------------
모델: %1$s %2$s
Android: %3$s(API %4$d)
빌드: %5$s
보안 패치: %6$s
CPU 아키텍처: %7$s
개발자 옵션: %8$s
USB 디버깅: %9$s

참고: 화면 안내는 하드웨어 인증이 아니며 불량 화소나 터치 문제를 자동으로 측정하지 않습니다.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play를 열 수 없습니다. 브라우저 또는 Play 스토어를 사용할 수 있는지 확인하세요.</string>
    <string name="share_unavailable">링크를 공유할 수 있는 호환 앱이 없습니다.</string>
    <string name="update_available_title">업데이트 사용 가능</string>
    <string name="update_available_message">Developers Options Shortcut의 새 버전을 사용할 수 있습니다. 최신 개선 사항과 수정 사항을 받으려면 업데이트하세요.</string>
    <string name="update_now">지금 업데이트</string>
    <string name="later">나중에</string>
    <string name="offline_title">오프라인 상태입니다</string>
    <string name="offline_message">광고를 불러오고 이 무료 앱의 지속적인 개발을 지원하려면 인터넷에 연결하세요. 앱의 주요 기능은 오프라인에서도 사용할 수 있습니다.</string>
    <string name="internet_settings">인터넷 설정</string>
    <string name="not_now">나중에 하기</string>
    <string name="offline_settings_unavailable">네트워크 설정을 열 수 없습니다. 기기 설정을 열고 네트워크 또는 인터넷을 선택하세요.</string>
    <string name="offline_support_message">앱이 마음에 드시나요? 원하시면 향후 개발을 돕기 위해 팀에 커피를 후원하실 수 있습니다. 전적으로 선택 사항이며 앱은 오프라인에서도 사용할 수 있습니다.</string>
    <string name="offline_purchase_unverified_message">현재 오프라인이므로 광고 제거 구매 상태를 확인할 수 없습니다. 구매가 확인된 것으로 간주하지 않습니다. 사용 가능한 오프라인 기능을 계속 이용하고 온라인 기능이 필요할 때 나중에 연결하세요.</string>
    <string name="offline_ad_supported_message">현재 오프라인 상태입니다. 다시 연결할 때까지 광고와 일부 온라인 기능을 사용할 수 없을 수 있습니다. 앱은 오프라인에서도 사용할 수 있으며, 온라인 기능이 필요할 때만 연결하세요.</string>
    <string name="review_prompt_title">Developers Options Shortcut이 마음에 드시나요?</string>
    <string name="review_prompt_message">여러분의 의견은 앱을 개선하는 데 도움이 됩니다. 시간이 있다면 Google Play에 솔직한 리뷰를 남겨 주세요. 지원해 주셔서 감사합니다!</string>
    <string name="review_on_google_play">Google Play에서 리뷰</string>
    <string name="share_with_friends">친구와 공유</string>
    <string name="review_not_now">지금은 안 함</string>
    <string name="rate_on_google_play">Google Play에서 평가</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-pt-rBR/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Abrir opções do desenvolvedor</string>
    <string name="dev_options_status">Opções do desenvolvedor</string>
    <string name="usb_debugging_status">Depuração USB</string>
    <string name="status_enabled">Ativado</string>
    <string name="status_disabled">Desativado</string>
    <string name="status_unknown">Desconhecido</string>
    <string name="device_specs_title">Hardware e sistema operacional do dispositivo</string>
    <string name="how_to_unlock_title">Como ativar as opções do desenvolvedor</string>
    <string name="how_to_unlock_desc">Você precisa ativar as opções do desenvolvedor manualmente nas Configurações do Android. Este app não pode desbloqueá-las por você.</string>
    <string name="dev_options_not_found">As opções do desenvolvedor não estão disponíveis. Abra o guia para saber como ativá-las.</string>
    <string name="share_app">Compartilhar app</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Conheça Developers Options Shortcut no Google Play! O app facilita o acesso às opções do desenvolvedor do Android. Experimente: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Selecionar idioma</string>
    <string name="language_picker_title">Idioma do app</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Idioma do sistema</string>
    <string name="done">Concluído</string>
    <string name="language_suggestion_title">Escolha seu idioma preferido</string>
    <string name="language_suggestion_message">O idioma do dispositivo é %1$s. Você quer usá-lo neste app?</string>
    <string name="language_switch_to_suggested">Mudar idioma</string>
    <string name="language_continue_english">Manter inglês</string>
    <string name="real_time_settings_inspector">INSPEÇÃO DE CONFIGURAÇÕES EM TEMPO REAL</string>
    <string name="developer_options_status_description">Estado do seletor do modo desenvolvedor</string>
    <string name="usb_debugging_status_description">Estado do seletor de depuração USB</string>
    <string name="refresh_status">Atualizar status</string>
    <string name="share_application">Compartilhar aplicativo</string>
    <string name="remove_ads_description">Remover anúncios (Google Play Billing)</string>
    <string name="ad_free_activated">Sem anúncios ativado</string>
    <string name="about_phone">Sobre o telefone</string>
    <string name="open_about_phone">Abrir Sobre o telefone</string>
    <string name="wireless_debugging">Depuração sem fio</string>
    <string name="usb_debugging">Depuração USB</string>
    <string name="enablement_guide_title">Como ativar as opções do desenvolvedor</string>
    <string name="enablement_guide_step_1">1. Abra as Configurações do dispositivo.</string>
    <string name="enablement_guide_step_2">2. Abra Sobre o telefone ou a seção equivalente de informações do dispositivo.</string>
    <string name="enablement_guide_step_3">3. Encontre Número da versão. Ele pode estar em Informações do software ou em um submenu específico do fabricante.</string>
    <string name="enablement_guide_step_4">4. Toque sete vezes em Número da versão. Siga as solicitações de PIN, senha, padrão ou biometria, se aparecerem.</string>
    <string name="enablement_guide_step_5">5. Volte às Configurações e abra Opções do desenvolvedor.</string>
    <string name="manual_enablement_note">Você precisa ativar as opções do desenvolvedor por conta própria. Este app apenas abre páginas das Configurações e não pode desbloquear nem alterar configurações protegidas do sistema.</string>
    <string name="settings_unavailable">O Android não conseguiu abrir a página de Configurações solicitada.</string>
    <string name="developer_options_disabled_guide">As opções do desenvolvedor parecem estar desativadas. Siga o guia e ative-as manualmente.</string>
    <string name="developer_options_unavailable_guide">Não foi possível abrir as opções do desenvolvedor neste dispositivo. Siga o guia ou abra Sobre o telefone.</string>
    <string name="about_phone_fallback_settings">Sobre o telefone não está disponível; as Configurações gerais foram abertas.</string>
    <string name="usb_debugging_guidance">Nas opções do desenvolvedor, procure Depuração USB. Ela pode permitir que computadores conectados depurem o dispositivo; ative apenas quando necessário e se confiar no computador.</string>
    <string name="wireless_debugging_guidance">No Android 11 ou posterior, procure Depuração sem fio nas opções do desenvolvedor. A disponibilidade e o nome variam conforme o dispositivo.</string>
    <string name="wireless_debugging_unavailable">A disponibilidade da depuração sem fio depende da versão do Android e do dispositivo. Verifique as opções do desenvolvedor.</string>
    <string name="wireless_debugging_fallback_guidance">Não foi possível abrir as opções do desenvolvedor diretamente. Procure por Opções do desenvolvedor nas Configurações e, se houver suporte, por Depuração sem fio.</string>
    <string name="settings_open_failed">O Android não conseguiu abrir as Configurações neste dispositivo.</string>
    <string name="status_updated">O status do desenvolvedor e os detalhes do dispositivo foram atualizados.</string>
    <string name="play_store_error_format">Erro do Google Play: %1$s</string>
    <string name="device_hardware_os_details">Detalhes de hardware e sistema operacional</string>
    <string name="device_details_subtitle">Parâmetros do sistema lidos de android.os.Build</string>
    <string name="android_version">Versão do Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Modelo do dispositivo</string>
    <string name="brand_hardware">Marca / hardware</string>
    <string name="security_patch">Correção de segurança</string>
    <string name="build_number">Número da versão</string>
    <string name="cpu_architecture">Arquitetura da CPU</string>
    <string name="quick_hardware_diagnostic">Diagnóstico rápido de hardware</string>
    <string name="diagnostic_stage_1">Etapa 1/3: Verificação da tela e de pixels defeituosos</string>
    <string name="diagnostic_stage_1_description">Observe o espectro de cores RGB para identificar possíveis pixels defeituosos.</string>
    <string name="diagnostic_stage_2">Etapa 2/3: Verificação da vibração</string>
    <string name="diagnostic_stage_2_description">Verifique o motor de vibração e a resposta háptica.</string>
    <string name="diagnostic_stage_3">Etapa 3/3: Verificação multitoque</string>
    <string name="diagnostic_stage_3_description">Toque na tela para verificar a resposta ao toque.</string>
    <string name="seconds_remaining">Restam %1$d segundos</string>
    <string name="rgb_spectrum_test">Teste do espectro RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Teste de resposta à vibração</string>
    <string name="digitizer_multi_touch_active">Toque na tela para testar a resposta</string>
    <string name="diagnostic_passed">Sequência de diagnóstico concluída</string>
    <string name="diagnostic_passed_summary">As instruções visuais, de vibração e de toque foram exibidas.</string>
    <string name="rgb_screen_matrix">Verificação das cores da tela RGB</string>
    <string name="zero_dead_pixels_pass">É necessária inspeção visual</string>
    <string name="haptic_vibration_motor">Motor de vibração háptica</string>
    <string name="calibrated_functional_pass">É necessária verificação do usuário</string>
    <string name="touch_digitizer">Digitalizador de toque</string>
    <string name="low_latency_multi_touch_pass">É necessária verificação do usuário</string>
    <string name="share_specs">Compartilhar detalhes do dispositivo</string>
    <string name="test_again">Testar novamente</string>
    <string name="unknown">Desconhecido</string>
    <string name="security_patch_unavailable">Indisponível (Android anterior à versão 6)</string>
    <string name="status_active_on">ATIVO (LIGADO)</string>
    <string name="status_disabled_off">DESATIVADO (DESLIGADO)</string>
    <string name="device_report_subject">Detalhes do hardware do dispositivo</string>
    <string name="device_diagnostic_report">Relatório do dispositivo Android
------------------------------
Modelo: %1$s %2$s
Android: %3$s (API %4$d)
Build: %5$s
Correção de segurança: %6$s
Arquitetura da CPU: %7$s
Opções do desenvolvedor: %8$s
Depuração USB: %9$s

Observação: as instruções na tela não certificam o hardware nem medem automaticamente pixels defeituosos ou problemas de toque.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Não foi possível abrir o Google Play. Verifique se há um navegador ou Play Store disponível.</string>
    <string name="share_unavailable">Não há um app compatível disponível para compartilhar o link.</string>
    <string name="update_available_title">Atualização disponível</string>
    <string name="update_available_message">Uma nova versão do Developers Options Shortcut está disponível. Atualize para receber as melhorias e correções mais recentes.</string>
    <string name="update_now">Atualizar agora</string>
    <string name="later">Mais tarde</string>
    <string name="offline_title">Você está offline</string>
    <string name="offline_message">Conecte-se à internet se quiser carregar anúncios e ajudar a manter o desenvolvimento deste app gratuito. Os principais recursos continuam disponíveis offline.</string>
    <string name="internet_settings">Configurações de internet</string>
    <string name="not_now">Agora não</string>
    <string name="offline_settings_unavailable">Não foi possível abrir as configurações de rede. Abra as Configurações do dispositivo e escolha Rede ou Internet.</string>
    <string name="offline_support_message">Gostou do aplicativo? Se quiser, você pode oferecer um café à equipe para apoiar o desenvolvimento futuro. É totalmente opcional; o aplicativo continua disponível offline.</string>
    <string name="offline_purchase_unverified_message">Você está offline, então não é possível verificar agora o status da compra para remover anúncios. Nenhuma compra está sendo considerada confirmada. Continue usando os recursos disponíveis offline e conecte-se mais tarde se precisar de um recurso on-line.</string>
    <string name="offline_ad_supported_message">Você está offline. Anúncios e alguns recursos on-line podem ficar indisponíveis até que a conexão seja restabelecida. O aplicativo continua funcionando offline; conecte-se apenas quando precisar de um recurso on-line.</string>
    <string name="review_prompt_title">Gostando do Developers Options Shortcut?</string>
    <string name="review_prompt_message">Sua opinião nos ajuda a melhorar o app. Se puder, compartilhe uma avaliação sincera no Google Play. Obrigado pelo apoio!</string>
    <string name="review_on_google_play">Avaliar no Google Play</string>
    <string name="share_with_friends">Compartilhar com amigos</string>
    <string name="review_not_now">Agora não</string>
    <string name="rate_on_google_play">Avaliar no Google Play</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-tr/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Geliştirici seçeneklerini aç</string>
    <string name="dev_options_status">Geliştirici seçenekleri</string>
    <string name="usb_debugging_status">USB hata ayıklama</string>
    <string name="status_enabled">Etkin</string>
    <string name="status_disabled">Devre dışı</string>
    <string name="status_unknown">Bilinmiyor</string>
    <string name="device_specs_title">Cihaz donanımı ve işletim sistemi</string>
    <string name="how_to_unlock_title">Geliştirici seçenekleri nasıl etkinleştirilir</string>
    <string name="how_to_unlock_desc">Geliştirici seçeneklerini Android Ayarları\\'ndan manuel olarak etkinleştirmelisiniz. Bu uygulama bunların kilidini sizin için açamaz.</string>
    <string name="dev_options_not_found">Geliştirici seçenekleri kullanılamıyor. Nasıl etkinleştirileceğini görmek için kılavuzu açın.</string>
    <string name="share_app">Uygulamayı paylaş</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Google Play\\'de Developers Options Shortcut uygulamasına göz atın! Android Geliştirici seçeneklerine kolay erişim sağlar. Deneyin: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Dil seç</string>
    <string name="language_picker_title">Uygulama dili</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Sistem dili</string>
    <string name="done">Bitti</string>
    <string name="language_suggestion_title">Tercih ettiğiniz dili seçin</string>
    <string name="language_suggestion_message">Cihazınızın dili %1$s. Bu uygulamada da kullanmak ister misiniz?</string>
    <string name="language_switch_to_suggested">Dili değiştir</string>
    <string name="language_continue_english">İngilizce kalsın</string>
    <string name="real_time_settings_inspector">GERÇEK ZAMANLI AYAR DENETLEYİCİSİ</string>
    <string name="developer_options_status_description">Geliştirici modu anahtarının durumu</string>
    <string name="usb_debugging_status_description">USB hata ayıklama anahtarının durumu</string>
    <string name="refresh_status">Durumu yenile</string>
    <string name="share_application">Uygulamayı paylaş</string>
    <string name="remove_ads_description">Reklamları kaldır (Google Play Billing)</string>
    <string name="ad_free_activated">Reklamsız kullanım etkin</string>
    <string name="about_phone">Telefon hakkında</string>
    <string name="open_about_phone">Telefon hakkında ekranını aç</string>
    <string name="wireless_debugging">Kablosuz hata ayıklama</string>
    <string name="usb_debugging">USB hata ayıklama</string>
    <string name="enablement_guide_title">Geliştirici seçenekleri nasıl etkinleştirilir</string>
    <string name="enablement_guide_step_1">1. Cihazınızın Ayarlar uygulamasını açın.</string>
    <string name="enablement_guide_step_2">2. Telefon hakkında veya eşdeğer cihaz bilgileri bölümünü açın.</string>
    <string name="enablement_guide_step_3">3. Derleme numarasını bulun. Yazılım bilgileri ya da üreticiye özgü bir alt menüde olabilir.</string>
    <string name="enablement_guide_step_4">4. Derleme numarasına yedi kez dokunun. PIN, parola, desen veya biyometri istemlerini izleyin.</string>
    <string name="enablement_guide_step_5">5. Ayarlar\\'a dönün ve Geliştirici seçeneklerini açın.</string>
    <string name="manual_enablement_note">Geliştirici seçeneklerini kendiniz etkinleştirmelisiniz. Bu uygulama yalnızca Ayarlar sayfalarını açar; korumalı sistem ayarlarının kilidini açamaz veya bunları değiştiremez.</string>
    <string name="settings_unavailable">Android istenen Ayarlar sayfasını açamadı.</string>
    <string name="developer_options_disabled_guide">Geliştirici seçenekleri devre dışı görünüyor. Kılavuzu izleyip manuel olarak etkinleştirin.</string>
    <string name="developer_options_unavailable_guide">Bu cihazda Geliştirici seçenekleri açılamadı. Kılavuzu izleyin veya Telefon hakkında bölümünü açın.</string>
    <string name="about_phone_fallback_settings">Telefon hakkında bölümü kullanılamıyor; bunun yerine genel Ayarlar açıldı.</string>
    <string name="usb_debugging_guidance">Geliştirici seçeneklerinde USB hata ayıklamayı bulun. Bağlı bilgisayarlara hata ayıklama erişimi verebilir; yalnızca gerektiğinde ve bilgisayara güveniyorsanız etkinleştirin.</string>
    <string name="wireless_debugging_guidance">Android 11 ve sonraki sürümlerde Geliştirici seçeneklerinde Kablosuz hata ayıklamayı arayın. Kullanılabilirlik ve ad cihazdan cihaza değişir.</string>
    <string name="wireless_debugging_unavailable">Kablosuz hata ayıklamanın kullanılabilirliği Android sürümüne ve cihaza bağlıdır. Geliştirici seçeneklerini kontrol edin.</string>
    <string name="wireless_debugging_fallback_guidance">Geliştirici seçenekleri doğrudan açılamadı. Ayarlar\\'da Geliştirici seçeneklerini arayın; cihaz destekliyorsa Kablosuz hata ayıklamayı bulun.</string>
    <string name="settings_open_failed">Android bu cihazda Ayarlar\\'ı açamadı.</string>
    <string name="status_updated">Geliştirici durumu ve cihaz ayrıntıları güncellendi.</string>
    <string name="play_store_error_format">Google Play hatası: %1$s</string>
    <string name="device_hardware_os_details">Cihaz donanımı ve işletim sistemi ayrıntıları</string>
    <string name="device_details_subtitle">android.os.Build üzerinden okunan sistem parametreleri</string>
    <string name="android_version">Android sürümü</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Cihaz modeli</string>
    <string name="brand_hardware">Marka / donanım</string>
    <string name="security_patch">Güvenlik yaması</string>
    <string name="build_number">Derleme numarası</string>
    <string name="cpu_architecture">CPU mimarisi</string>
    <string name="quick_hardware_diagnostic">Hızlı donanım tanılaması</string>
    <string name="diagnostic_stage_1">1/3. adım: Ekran ve ölü piksel kontrolü</string>
    <string name="diagnostic_stage_1_description">Olası ölü pikselleri görmek için RGB renk tayfını inceleyin.</string>
    <string name="diagnostic_stage_2">2/3. adım: Titreşim kontrolü</string>
    <string name="diagnostic_stage_2_description">Titreşim motorunu ve dokunsal geri bildirimi kontrol edin.</string>
    <string name="diagnostic_stage_3">3/3. adım: Çoklu dokunma kontrolü</string>
    <string name="diagnostic_stage_3_description">Dokunma tepkisini kontrol etmek için ekrana dokunun.</string>
    <string name="seconds_remaining">%1$d saniye kaldı</string>
    <string name="rgb_spectrum_test">RGB tayf testi (%1$s)</string>
    <string name="pulsing_vibration_engine">Titreşim geri bildirimi testi</string>
    <string name="digitizer_multi_touch_active">Tepkiyi sınamak için ekrana dokunun</string>
    <string name="diagnostic_passed">Tanılama adımları tamamlandı</string>
    <string name="diagnostic_passed_summary">Görsel, titreşim ve dokunma yönergeleri gösterildi.</string>
    <string name="rgb_screen_matrix">RGB ekran renk kontrolü</string>
    <string name="zero_dead_pixels_pass">Görsel inceleme gerekli</string>
    <string name="haptic_vibration_motor">Dokunsal titreşim motoru</string>
    <string name="calibrated_functional_pass">Kullanıcı doğrulaması gerekli</string>
    <string name="touch_digitizer">Dokunmatik sayısallaştırıcı</string>
    <string name="low_latency_multi_touch_pass">Kullanıcı doğrulaması gerekli</string>
    <string name="share_specs">Cihaz ayrıntılarını paylaş</string>
    <string name="test_again">Yeniden dene</string>
    <string name="unknown">Bilinmiyor</string>
    <string name="security_patch_unavailable">Kullanılamıyor (Android sürümü 6\\'dan eski)</string>
    <string name="status_active_on">ETKİN (AÇIK)</string>
    <string name="status_disabled_off">DEVRE DIŞI (KAPALI)</string>
    <string name="device_report_subject">Cihaz donanımı ayrıntıları</string>
    <string name="device_diagnostic_report">Android cihaz raporu
------------------------------
Model: %1$s %2$s
Android: %3$s (API %4$d)
Derleme: %5$s
Güvenlik yaması: %6$s
CPU mimarisi: %7$s
Geliştirici seçenekleri: %8$s
USB hata ayıklama: %9$s

Not: Ekrandaki yönergeler donanım sertifikası değildir ve ölü piksel ya da dokunma sorunlarını otomatik ölçmez.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Google Play açılamadı. Bir tarayıcının veya Play Store\\'un kullanılabilir olduğunu kontrol edin.</string>
    <string name="share_unavailable">Bağlantıyı paylaşmak için uyumlu bir uygulama bulunamadı.</string>
    <string name="update_available_title">Güncelleme mevcut</string>
    <string name="update_available_message">Developers Options Shortcut uygulamasının yeni bir sürümü mevcut. En yeni iyileştirmeleri ve düzeltmeleri almak için güncelleyin.</string>
    <string name="update_now">Şimdi güncelle</string>
    <string name="later">Daha sonra</string>
    <string name="offline_title">Çevrimdışısınız</string>
    <string name="offline_message">Reklamların yüklenmesini ve bu ücretsiz uygulamanın geliştirilmeye devam etmesini desteklemek için internete bağlanın. Uygulamanın temel özellikleri çevrimdışıyken de kullanılabilir.</string>
    <string name="internet_settings">İnternet ayarları</string>
    <string name="not_now">Şimdi değil</string>
    <string name="offline_settings_unavailable">Ağ ayarları açılamadı. Cihazınızın Ayarlar bölümünü açıp Ağ veya İnternet\\'i seçin.</string>
    <string name="offline_support_message">Uygulamayı beğendiniz mi? İsterseniz gelecekteki geliştirmeleri desteklemek için ekibe kahve ısmarlayabilirsiniz. Bu tamamen isteğe bağlıdır; uygulama çevrimdışıyken de kullanılabilir.</string>
    <string name="offline_purchase_unverified_message">Çevrim dışı olduğunuz için reklam kaldırma satın alma durumu şu anda doğrulanamıyor. Herhangi bir satın alma onaylanmış kabul edilmiyor. Kullanılabilir çevrim dışı özellikleri kullanmaya devam edin; çevrimiçi bir özellik gerektiğinde daha sonra bağlanın.</string>
    <string name="offline_ad_supported_message">Çevrim dışısınız. Yeniden bağlanana kadar reklamlar ve bazı çevrimiçi özellikler kullanılamayabilir. Uygulama çevrim dışıyken de kullanılabilir; yalnızca çevrimiçi bir özelliğe ihtiyacınız olduğunda bağlanın.</string>
    <string name="review_prompt_title">Developers Options Shortcut hoşunuza gidiyor mu?</string>
    <string name="review_prompt_message">Geri bildiriminiz uygulamayı geliştirmemize yardımcı olur. Vaktiniz varsa Google Play\\'de dürüst bir değerlendirme paylaşın. Teşekkürler!</string>
    <string name="review_on_google_play">Google Play\\'de değerlendir</string>
    <string name="share_with_friends">Arkadaşlarınla paylaş</string>
    <string name="review_not_now">Şimdi değil</string>
    <string name="rate_on_google_play">Google Play\\'de puan ver</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-vi/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Complete offline Android UI strings; machine-assisted draft pending native-speaker review.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Mở Tùy chọn nhà phát triển</string>
    <string name="dev_options_status">Tùy chọn nhà phát triển</string>
    <string name="usb_debugging_status">Gỡ lỗi USB</string>
    <string name="status_enabled">Đã bật</string>
    <string name="status_disabled">Đã tắt</string>
    <string name="status_unknown">Không xác định</string>
    <string name="device_specs_title">Phần cứng và hệ điều hành của thiết bị</string>
    <string name="how_to_unlock_title">Cách bật Tùy chọn nhà phát triển</string>
    <string name="how_to_unlock_desc">Bạn cần tự bật Tùy chọn nhà phát triển trong Cài đặt Android. Ứng dụng này không thể mở khóa thay bạn.</string>
    <string name="dev_options_not_found">Không có Tùy chọn nhà phát triển. Mở hướng dẫn để biết cách bật.</string>
    <string name="share_app">Chia sẻ ứng dụng</string>
    <string name="share_subject">Developers Options Shortcut</string>
    <string name="share_message">Khám phá Developers Options Shortcut trên Google Play! Ứng dụng giúp truy cập Tùy chọn nhà phát triển Android thuận tiện hơn. Hãy thử: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">Chọn ngôn ngữ</string>
    <string name="language_picker_title">Ngôn ngữ ứng dụng</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_german">Deutsch</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_japanese">日本語</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_system_default">Ngôn ngữ hệ thống</string>
    <string name="done">Xong</string>
    <string name="language_suggestion_title">Chọn ngôn ngữ bạn muốn dùng</string>
    <string name="language_suggestion_message">Ngôn ngữ trên thiết bị của bạn là %1$s. Bạn có muốn dùng ngôn ngữ này trong ứng dụng không?</string>
    <string name="language_switch_to_suggested">Đổi ngôn ngữ</string>
    <string name="language_continue_english">Giữ tiếng Anh</string>
    <string name="real_time_settings_inspector">KIỂM TRA CÀI ĐẶT THEO THỜI GIAN THỰC</string>
    <string name="developer_options_status_description">Trạng thái công tắc chế độ nhà phát triển</string>
    <string name="usb_debugging_status_description">Trạng thái công tắc gỡ lỗi USB</string>
    <string name="refresh_status">Làm mới trạng thái</string>
    <string name="share_application">Chia sẻ ứng dụng</string>
    <string name="remove_ads_description">Xóa quảng cáo (Google Play Billing)</string>
    <string name="ad_free_activated">Đã bật chế độ không quảng cáo</string>
    <string name="about_phone">Giới thiệu về điện thoại</string>
    <string name="open_about_phone">Mở mục Giới thiệu về điện thoại</string>
    <string name="wireless_debugging">Gỡ lỗi không dây</string>
    <string name="usb_debugging">Gỡ lỗi USB</string>
    <string name="enablement_guide_title">Cách bật Tùy chọn nhà phát triển</string>
    <string name="enablement_guide_step_1">1. Mở Cài đặt trên thiết bị.</string>
    <string name="enablement_guide_step_2">2. Mở Giới thiệu về điện thoại hoặc mục thông tin thiết bị tương đương.</string>
    <string name="enablement_guide_step_3">3. Tìm Số bản dựng. Mục này có thể nằm trong Thông tin phần mềm hoặc một menu con riêng của nhà sản xuất.</string>
    <string name="enablement_guide_step_4">4. Chạm vào Số bản dựng bảy lần. Làm theo yêu cầu về PIN, mật khẩu, hình vẽ hoặc sinh trắc học nếu xuất hiện.</string>
    <string name="enablement_guide_step_5">5. Quay lại Cài đặt và mở Tùy chọn nhà phát triển.</string>
    <string name="manual_enablement_note">Bạn phải tự bật Tùy chọn nhà phát triển. Ứng dụng chỉ mở các trang Cài đặt và không thể mở khóa hay thay đổi cài đặt hệ thống được bảo vệ.</string>
    <string name="settings_unavailable">Android không thể mở trang Cài đặt được yêu cầu.</string>
    <string name="developer_options_disabled_guide">Có vẻ Tùy chọn nhà phát triển đang tắt. Hãy làm theo hướng dẫn để tự bật.</string>
    <string name="developer_options_unavailable_guide">Không mở được Tùy chọn nhà phát triển trên thiết bị này. Hãy làm theo hướng dẫn hoặc mở Giới thiệu về điện thoại.</string>
    <string name="about_phone_fallback_settings">Không có mục Giới thiệu về điện thoại, nên Cài đặt chung đã được mở.</string>
    <string name="usb_debugging_guidance">Trong Tùy chọn nhà phát triển, tìm Gỡ lỗi USB. Tính năng này có thể cho phép máy tính được kết nối truy cập gỡ lỗi; chỉ bật khi cần và bạn tin cậy máy tính đó.</string>
    <string name="wireless_debugging_guidance">Trên Android 11 trở lên, hãy tìm Gỡ lỗi không dây trong Tùy chọn nhà phát triển. Tính khả dụng và tên gọi tùy thiết bị.</string>
    <string name="wireless_debugging_unavailable">Tính năng gỡ lỗi không dây phụ thuộc vào phiên bản Android và thiết bị. Hãy kiểm tra Tùy chọn nhà phát triển.</string>
    <string name="wireless_debugging_fallback_guidance">Không mở trực tiếp được Tùy chọn nhà phát triển. Hãy tìm mục này trong Cài đặt, sau đó tìm Gỡ lỗi không dây nếu thiết bị hỗ trợ.</string>
    <string name="settings_open_failed">Android không thể mở Cài đặt trên thiết bị này.</string>
    <string name="status_updated">Đã cập nhật trạng thái nhà phát triển và chi tiết thiết bị.</string>
    <string name="play_store_error_format">Lỗi Google Play: %1$s</string>
    <string name="device_hardware_os_details">Chi tiết phần cứng và hệ điều hành</string>
    <string name="device_details_subtitle">Thông số hệ thống đọc từ android.os.Build</string>
    <string name="android_version">Phiên bản Android</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">Mẫu thiết bị</string>
    <string name="brand_hardware">Thương hiệu / phần cứng</string>
    <string name="security_patch">Bản vá bảo mật</string>
    <string name="build_number">Số bản dựng</string>
    <string name="cpu_architecture">Kiến trúc CPU</string>
    <string name="quick_hardware_diagnostic">Chẩn đoán phần cứng nhanh</string>
    <string name="diagnostic_stage_1">Bước 1/3: Kiểm tra màn hình và điểm ảnh lỗi</string>
    <string name="diagnostic_stage_1_description">Quan sát dải màu RGB để tìm điểm ảnh có thể bị lỗi.</string>
    <string name="diagnostic_stage_2">Bước 2/3: Kiểm tra rung</string>
    <string name="diagnostic_stage_2_description">Kiểm tra mô-tơ rung và phản hồi xúc giác.</string>
    <string name="diagnostic_stage_3">Bước 3/3: Kiểm tra cảm ứng đa điểm</string>
    <string name="diagnostic_stage_3_description">Chạm vào màn hình để kiểm tra phản hồi cảm ứng.</string>
    <string name="seconds_remaining">Còn %1$d giây</string>
    <string name="rgb_spectrum_test">Kiểm tra phổ RGB (%1$s)</string>
    <string name="pulsing_vibration_engine">Kiểm tra phản hồi rung</string>
    <string name="digitizer_multi_touch_active">Chạm màn hình để kiểm tra phản hồi</string>
    <string name="diagnostic_passed">Đã hoàn tất các bước chẩn đoán</string>
    <string name="diagnostic_passed_summary">Đã hiển thị hướng dẫn kiểm tra hình ảnh, rung và cảm ứng.</string>
    <string name="rgb_screen_matrix">Kiểm tra màu màn hình RGB</string>
    <string name="zero_dead_pixels_pass">Cần kiểm tra bằng mắt</string>
    <string name="haptic_vibration_motor">Mô-tơ rung xúc giác</string>
    <string name="calibrated_functional_pass">Cần người dùng xác minh</string>
    <string name="touch_digitizer">Bộ số hóa cảm ứng</string>
    <string name="low_latency_multi_touch_pass">Cần người dùng xác minh</string>
    <string name="share_specs">Chia sẻ thông tin thiết bị</string>
    <string name="test_again">Kiểm tra lại</string>
    <string name="unknown">Không xác định</string>
    <string name="security_patch_unavailable">Không khả dụng (Android thấp hơn phiên bản 6)</string>
    <string name="status_active_on">ĐANG BẬT</string>
    <string name="status_disabled_off">ĐÃ TẮT</string>
    <string name="device_report_subject">Chi tiết phần cứng thiết bị</string>
    <string name="device_diagnostic_report">Báo cáo thiết bị Android
------------------------------
Mẫu máy: %1$s %2$s
Android: %3$s (API %4$d)
Bản dựng: %5$s
Bản vá bảo mật: %6$s
Kiến trúc CPU: %7$s
Tùy chọn nhà phát triển: %8$s
Gỡ lỗi USB: %9$s

Lưu ý: các hướng dẫn trên màn hình không chứng nhận phần cứng và không tự động đo điểm ảnh lỗi hoặc sự cố cảm ứng.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
    <string name="play_store_unavailable">Không mở được Google Play. Hãy kiểm tra xem có trình duyệt hoặc Play Store hay không.</string>
    <string name="share_unavailable">Không có ứng dụng tương thích để chia sẻ liên kết.</string>
    <string name="update_available_title">Có bản cập nhật</string>
    <string name="update_available_message">Đã có phiên bản mới của Developers Options Shortcut. Hãy cập nhật để nhận các cải tiến và bản sửa lỗi mới nhất.</string>
    <string name="update_now">Cập nhật ngay</string>
    <string name="later">Để sau</string>
    <string name="offline_title">Bạn đang ngoại tuyến</string>
    <string name="offline_message">Hãy kết nối Internet nếu bạn muốn tải quảng cáo và hỗ trợ tiếp tục phát triển ứng dụng miễn phí này. Các tính năng chính vẫn dùng được khi ngoại tuyến.</string>
    <string name="internet_settings">Cài đặt Internet</string>
    <string name="not_now">Để sau</string>
    <string name="offline_settings_unavailable">Không thể mở cài đặt mạng. Hãy mở Cài đặt của thiết bị và chọn Mạng hoặc Internet.</string>
    <string name="offline_support_message">Bạn thích ứng dụng chứ? Nếu muốn, bạn có thể mời nhóm một ly cà phê để hỗ trợ phát triển trong tương lai. Điều này hoàn toàn tùy chọn; ứng dụng vẫn dùng được khi ngoại tuyến.</string>
    <string name="offline_purchase_unverified_message">Bạn đang ngoại tuyến nên hiện chưa thể xác minh trạng thái mua gỡ quảng cáo. Không có giao dịch mua nào được mặc định là đã xác nhận. Bạn vẫn có thể dùng các tính năng ngoại tuyến hiện có và kết nối lại sau nếu cần tính năng trực tuyến.</string>
    <string name="offline_ad_supported_message">Bạn đang ngoại tuyến. Quảng cáo và một số tính năng trực tuyến có thể không khả dụng cho đến khi bạn kết nối lại. Ứng dụng vẫn dùng được khi ngoại tuyến; chỉ kết nối khi bạn cần tính năng trực tuyến.</string>
    <string name="review_prompt_title">Bạn thích Developers Options Shortcut chứ?</string>
    <string name="review_prompt_message">Phản hồi của bạn giúp chúng tôi cải thiện ứng dụng. Nếu có thời gian, hãy chia sẻ đánh giá trung thực trên Google Play. Cảm ơn bạn đã ủng hộ!</string>
    <string name="review_on_google_play">Đánh giá trên Google Play</string>
    <string name="share_with_friends">Chia sẻ với bạn bè</string>
    <string name="review_not_now">Để sau</string>
    <string name="rate_on_google_play">Chấm điểm trên Google Play</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_telugu">తెలుగు</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-te/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Telugu Android string resources for per-app language selection',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">డెవలపర్ ఎంపికలను తెరవండి</string>
    <string name="dev_options_status">డెవలపర్ ఎంపికలు</string>
    <string name="usb_debugging_status">USB డీబగ్గింగ్</string>
    <string name="status_enabled">ప్రారంభించబడింది</string>
    <string name="status_disabled">నిలిపివేయబడింది</string>
    <string name="status_unknown">తెలియదు</string>
    <string name="device_specs_title">పరికర హార్డ్‌వేర్ మరియు OS</string>
    <string name="how_to_unlock_title">డెవలపర్ ఎంపికలను ఎలా ప్రారంభించాలి</string>
    <string name="how_to_unlock_desc">Android సెట్టింగ్‌లలో డెవలపర్ ఎంపికలను మీరు చేతితో ప్రారంభించాలి. ఈ యాప్ వాటిని అన్‌లాక్ చేయలదు.</string>
    <string name="dev_options_not_found">డెవలపర్ ఎంపికలు అందుబాటులో లేవు. వాటిని ప్రారంభించే విధానం తెలుసుకోవడానికి మార్గదర్శిని తెరవండి.</string>
    <string name="share_app">యాప్‌ను షేర్ చేయండి</string>
    <string name="share_subject">Android కోసం Developers Options Shortcut</string>
    <string name="share_message">మీ ఫోన్‌లో డెవలపర్ ఎంపికలను తెరిచి USB డీబగ్గింగ్ స్థితిని చూడండి: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">భాషను ఎంచుకోండి</string>
    <string name="language_picker_title">యాప్ భాష</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
<string name="language_german">Deutsch</string>
    <string name="language_japanese">日本語</string>
<string name="language_system_default">సిస్టమ్ డిఫాల్ట్</string>
    <string name="done">పూర్తయింది</string>
    <string name="language_suggestion_title">మీకు ఇష్టమైన భాషను ఎంచుకోండి</string>
    <string name="language_suggestion_message">మీ పరికరానికి ఇష్టమైన భాష %1$s. ఈ యాప్‌లో కూడా దానిని ఉపయోగించాలా?</string>
    <string name="language_switch_to_suggested">భాషను మార్చండి</string>
    <string name="language_continue_english">ఆంగ్లంలో కొనసాగండి</string>
    <string name="real_time_settings_inspector">రియల్-టైమ్ సెట్టింగ్‌ల తనిఖీ</string>
    <string name="developer_options_status_description">డెవలపర్ మోడ్ స్విచ్ స్థితి</string>
    <string name="usb_debugging_status_description">USB డీబగ్గింగ్ స్విచ్ స్థితి</string>
    <string name="refresh_status">స్థితిని రిఫ్రెష్ చేయండి</string>
    <string name="share_application">యాప్‌ను షేర్ చేయండి</string>
    <string name="remove_ads_description">ప్రకటనలను తొలగించండి (Google Play Billing)</string>
    <string name="ad_free_activated">ప్రకటనలు లేని మోడ్ ప్రారంభించబడింది</string>
    <string name="about_phone">ఫోన్ గురించి</string>
    <string name="open_about_phone">ఫోన్ గురించి తెరవండి</string>
    <string name="wireless_debugging">వైర్‌లెస్ డీబగ్గింగ్</string>
    <string name="usb_debugging">USB డీబగ్గింగ్</string>
    <string name="enablement_guide_title">డెవలపర్ ఎంపికలను ఎలా ప్రారంభించాలి</string>
    <string name="enablement_guide_step_1">1. మీ పరికర సెట్టింగ్‌లను తెరవండి.</string>
    <string name="enablement_guide_step_2">2. ఫోన్ గురించి లేదా పరికర సమాచారానికి సమానమైన విభాగాన్ని తెరవండి.</string>
    <string name="enablement_guide_step_3">3. బిల్డ్ నంబర్‌ను కనుగొనండి. ఇది సాఫ్ట్‌వేర్ సమాచారం లేదా తయారీదారు ప్రత్యేక ఉపమెనూలో ఉండవచ్చు.</string>
    <string name="enablement_guide_step_4">4. బిల్డ్ నంబర్‌పై ఏడు సార్లు నొక్కండి. అడిగితే PIN, పాస్‌వర్డ్, నమూనా లేదా బయోమెట్రిక్ ధృవీకరణను ఉపయోగించండి.</string>
    <string name="enablement_guide_step_5">5. సెట్టింగ్‌లకు తిరిగి వెళ్లి డెవలపర్ ఎంపికలను తెరవండి.</string>
    <string name="manual_enablement_note">డెవలపర్ ఎంపికలను మీరు స్వయంగా ప్రారంభించాలి. ఈ యాప్ సెట్టింగ్‌ల పేజీలను మాత్రమే తెరుస్తుంది; రక్షిత సిస్టమ్ సెట్టింగ్‌లను అన్‌లాక్ చేయలదు లేదా మార్చలదు.</string>
    <string name="settings_unavailable">అభ్యర్థించిన సెట్టింగ్‌ల పేజీని Android తెరవలేకపోయింది.</string>
    <string name="developer_options_disabled_guide">డెవలపర్ ఎంపికలు నిలిపివేయబడినట్లు కనిపిస్తున్నాయి. మార్గదర్శిని అనుసరించి వాటిని చేతితో ప్రారంభించండి.</string>
    <string name="developer_options_unavailable_guide">ఈ పరికరంలో డెవలపర్ ఎంపికల పేజీని తెరవలేకపోయాం. మార్గదర్శిని అనుసరించండి లేదా ఫోన్ గురించి తెరవండి.</string>
    <string name="about_phone_fallback_settings">ఈ పరికరంలో ఫోన్ గురించి అందుబాటులో లేనందున సాధారణ సెట్టింగ్‌లు తెరవబడ్డాయి.</string>
    <string name="usb_debugging_guidance">డెవలపర్ ఎంపికల్లో USB డీబగ్గింగ్ వరకు క్రిందికి స్క్రోల్ చేయండి. ఇది కనెక్ట్ చేసిన కంప్యూటర్‌లకు డీబగ్గింగ్ యాక్సెస్ ఇవ్వవచ్చు; కంప్యూటర్‌పై నమ్మకం ఉన్నప్పుడు, అవసరమైనప్పుడే ప్రారంభించండి.</string>
    <string name="wireless_debugging_guidance">Android 11 మరియు తదుపరి సంచికల్లో డెవలపర్ ఎంపికల్లో వైర్‌లెస్ డీబగ్గింగ్‌ను చూడండి. లభ్యత, పేర్లు పరికరాన్ని బట్టి మారవచ్చు.</string>
    <string name="wireless_debugging_unavailable">వైర్‌లెస్ డీబగ్గింగ్ లభ్యత Android వెర్షన్ మరియు పరికరంపై ఆధారపడి ఉంటుంది. డెవలపర్ ఎంపికల్లో సంబంధిత సెట్టింగ్‌ను చూడండి.</string>
    <string name="wireless_debugging_fallback_guidance">డెవలపర్ ఎంపికలను నేరుగా తెరవలేకపోయాం. సెట్టింగ్‌లలో డెవలపర్ ఎంపికల కోసం వెతికి, పరికరం మద్దతిస్తే వైర్‌లెస్ డీబగ్గింగ్‌ను చూడండి.</string>
    <string name="settings_open_failed">ఈ పరికరంలో Android సెట్టింగ్‌లను తెరవలేకపోయింది.</string>
    <string name="status_updated">డెవలపర్ స్థితి మరియు పరికర వివరాలు నవీకరించబడ్డాయి.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">పరికర హార్డ్‌వేర్ మరియు OS వివరాలు</string>
    <string name="device_details_subtitle">android.os.Build నుండి చదివిన సిస్టమ్ పరామితులు</string>
    <string name="android_version">Android వెర్షన్</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">పరికర మోడల్</string>
    <string name="brand_hardware">బ్రాండ్ / హార్డ్‌వేర్</string>
    <string name="security_patch">భద్రతా ప్యాచ్</string>
    <string name="build_number">బిల్డ్ నంబర్</string>
    <string name="cpu_architecture">CPU నిర్మాణం</string>
    <string name="quick_hardware_diagnostic">త్వరిత హార్డ్‌వేర్ తనిఖీ</string>
    <string name="diagnostic_stage_1">దశ 1/3: స్క్రీన్ మరియు డెడ్-పిక్సెల్ తనిఖీ</string>
    <string name="diagnostic_stage_1_description">లోపభూయిష్ట పిక్సెల్‌లు ఉన్నాయో చూడటానికి RGB రంగుల స్పెక్ట్రమ్‌ను పరిశీలించండి.</string>
    <string name="diagnostic_stage_2">దశ 2/3: హాప్టిక్ కంపన తనిఖీ</string>
    <string name="diagnostic_stage_2_description">కంపన మోటార్ మరియు హాప్టిక్ ప్రతిస్పందనను తనిఖీ చేయండి.</string>
    <string name="diagnostic_stage_3">దశ 3/3: మల్టీ-టచ్ తనిఖీ</string>
    <string name="diagnostic_stage_3_description">స్క్రీన్‌ను ఉపయోగిస్తున్నప్పుడు టచ్ ప్రతిస్పందనను తనిఖీ చేయండి.</string>
    <string name="seconds_remaining">ఇంకా %1$d సెకన్లు</string>
    <string name="rgb_spectrum_test">RGB స్పెక్ట్రమ్ పరీక్ష (%1$s)</string>
    <string name="pulsing_vibration_engine">కంపన ప్రతిస్పందన పరీక్ష</string>
    <string name="digitizer_multi_touch_active">ప్రతిస్పందనను పరీక్షించడానికి స్క్రీన్‌ను తాకండి</string>
    <string name="diagnostic_passed">నిర్ధారణ క్రమం పూర్తయింది</string>
    <string name="diagnostic_passed_summary">దృశ్య, కంపన మరియు టచ్ సూచనలు చూపించబడ్డాయి.</string>
    <string name="rgb_screen_matrix">RGB స్క్రీన్ రంగు తనిఖీ</string>
    <string name="zero_dead_pixels_pass">దృశ్య పరిశీలన అవసరం</string>
    <string name="haptic_vibration_motor">హాప్టిక్ కంపన మోటార్</string>
    <string name="calibrated_functional_pass">వినియోగదారు ధృవీకరణ అవసరం</string>
    <string name="touch_digitizer">టచ్ డిజిటైజర్</string>
    <string name="low_latency_multi_touch_pass">వినియోగదారు ధృవీకరణ అవసరం</string>
    <string name="share_specs">పరికర వివరాలను షేర్ చేయండి</string>
    <string name="test_again">మళ్లీ ప్రారంభించండి</string>
    <string name="unknown">తెలియదు</string>
    <string name="security_patch_unavailable">లభ్యం కాదు (Android 6 కంటే పాత వెర్షన్)</string>
    <string name="status_active_on">సక్రియం (ఆన్)</string>
    <string name="status_disabled_off">నిలిపివేయబడింది</string>
    <string name="device_report_subject">పరికర హార్డ్‌వేర్ వివరాలు</string>
    <string name="device_diagnostic_report">Android పరికర నివేదిక
------------------------------
మోడల్: %1$s %2$s
Android: %3$s (API %4$d)
బిల్డ్: %5$s
భద్రతా ప్యాచ్: %6$s
CPU నిర్మాణం: %7$s
డెవలపర్ ఎంపికలు: %8$s
USB డీబగ్గింగ్: %9$s

గమనిక: స్క్రీన్ సూచనలు హార్డ్‌వేర్ ధృవీకరణ కావు; డెడ్ పిక్సెల్‌లు లేదా టచ్ ప్రతిస్పందనను స్వయంచాలకంగా కొలవవు.</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_telugu">తెలుగు</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="update_available_title">నవీకరణ అందుబాటులో ఉంది</string>
    <string name="update_available_message">Developers Options Shortcut యొక్క కొత్త వెర్షన్ అందుబాటులో ఉంది. తాజా మెరుగుదలలు, పరిష్కారాల కోసం యాప్‌ను నవీకరించండి.</string>
    <string name="update_now">ఇప్పుడే నవీకరించండి</string>
    <string name="later">తర్వాత</string>
    <string name="offline_title">మీరు ఆఫ్‌లైన్‌లో ఉన్నారు</string>
    <string name="offline_message">విజ్ఞాపనలను లోడ్ చేయడానికి, ఈ ఉచిత యాప్ అభివృద్ధికి మద్దతు ఇవ్వడానికి ఇంటర్నెట్‌కు కనెక్ట్ అవ్వండి. ప్రధాన ఫీచర్లు ఆఫ్‌లైన్‌లో కూడా అందుబాటులో ఉంటాయి.</string>
    <string name="internet_settings">ఇంటర్నెట్ సెట్టింగ్‌లు</string>
    <string name="not_now">ఇప్పుడు వద్దు</string>
    <string name="offline_settings_unavailable">నెట్‌వర్క్ సెట్టింగ్‌లను తెరవలేకపోయాం. పరికర సెట్టింగ్‌లలో నెట్‌వర్క్ లేదా ఇంటర్నెట్‌ను ఎంచుకోండి.</string>
    <string name="offline_support_message">ఈ యాప్ నచ్చిందా? భవిష్యత్ అభివృద్ధికి మద్దతుగా బృందానికి కాఫీ అందించవచ్చు. ఇది పూర్తిగా ఐచ్ఛికం; యాప్ ఆఫ్‌లైన్‌లోనూ అందుబాటులో ఉంటుంది.</string>
    <string name="offline_purchase_unverified_message">మీరు ఆఫ్‌లైన్‌లో ఉన్నందున ప్రకటనలు తొలగించిన స్థితిని ఇప్పుడు ధృవీకరించలేము. కొనుగోలు నిర్ధారించబడిందని మేము ఊహించము. ఆఫ్‌లైన్ ఫీచర్లను ఉపయోగించండి; ఆన్‌లైన్ ఫీచర్ అవసరమైనప్పుడు మళ్లీ కనెక్ట్ అవ్వండి.</string>
    <string name="offline_ad_supported_message">మీరు ఆఫ్‌లైన్‌లో ఉన్నారు. మళ్లీ కనెక్ట్ అయ్యే వరకు ప్రకటనలు, కొన్ని ఆన్‌లైన్ ఫీచర్లు అందుబాటులో ఉండకపోవచ్చు. ఆఫ్‌లైన్‌లో యాప్‌ను ఉపయోగించవచ్చు; ఆన్‌లైన్ ఫీచర్ అవసరమైనప్పుడే కనెక్ట్ అవ్వండి.</string>
    <string name="review_prompt_title">Developers Options Shortcut ఉపయోగించడం మీకు నచ్చిందా?</string>
    <string name="review_prompt_message">మీ అభిప్రాయం యాప్‌ను మెరుగుపరచడంలో సహాయపడుతుంది. సమయం ఉంటే Google Playలో మీ నిజమైన సమీక్షను పంచుకోండి. మద్దతుకు ధన్యవాదాలు!</string>
    <string name="review_on_google_play">Google Playలో సమీక్ష ఇవ్వండి</string>
    <string name="share_with_friends">స్నేహితులతో పంచుకోండి</string>
    <string name="review_not_now">ఇప్పుడు వద్దు</string>
    <string name="rate_on_google_play">Google Playలో రేట్ చేయండి</string>
    <string name="play_store_unavailable">Google Playను తెరవలేకపోయాం. బ్రౌజర్ లేదా Play Store అందుబాటులో ఉందో చూడండి.</string>
    <string name="share_unavailable">లింక్‌ను పంచుకోవడానికి అనుకూలమైన యాప్ అందుబాటులో లేదు.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ta/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Tamil Android string resources for per-app language selection',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">டெவலப்பர் விருப்பங்களைத் திற</string>
    <string name="dev_options_status">டெவலப்பர் விருப்பங்கள்</string>
    <string name="usb_debugging_status">USB பிழைத்திருத்தம்</string>
    <string name="status_enabled">இயக்கப்பட்டுள்ளது</string>
    <string name="status_disabled">முடக்கப்பட்டுள்ளது</string>
    <string name="status_unknown">தெரியவில்லை</string>
    <string name="device_specs_title">சாதன வன்பொருள் மற்றும் OS</string>
    <string name="how_to_unlock_title">டெவலப்பர் விருப்பங்களை இயக்குவது எப்படி</string>
    <string name="how_to_unlock_desc">Android அமைப்புகளில் டெவலப்பர் விருப்பங்களை நீங்களே கைமுறையாக இயக்க வேண்டும். இந்தப் பயன்பாடு அவற்றைத் திறக்க முடியாது.</string>
    <string name="dev_options_not_found">டெவலப்பர் விருப்பங்கள் கிடைக்கவில்லை. அவற்றை இயக்கும் முறையை அறிய வழிகாட்டியைத் திறக்கவும்.</string>
    <string name="share_app">பயன்பாட்டைப் பகிர்</string>
    <string name="share_subject">Android-க்கான Developers Options Shortcut</string>
    <string name="share_message">உங்கள் மொபைலில் டெவலப்பர் விருப்பங்களைத் திறந்து USB பிழைத்திருத்த நிலையைப் பார்க்கவும்: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">மொழியைத் தேர்ந்தெடு</string>
    <string name="language_picker_title">பயன்பாட்டு மொழி</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
<string name="language_german">Deutsch</string>
    <string name="language_japanese">日本語</string>
<string name="language_system_default">கணினி இயல்பு</string>
    <string name="done">முடிந்தது</string>
    <string name="language_suggestion_title">விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்</string>
    <string name="language_suggestion_message">உங்கள் சாதனத்தின் விருப்பமான மொழி %1$s. இந்தப் பயன்பாட்டிலும் அதைப் பயன்படுத்தவா?</string>
    <string name="language_switch_to_suggested">மொழியை மாற்று</string>
    <string name="language_continue_english">ஆங்கிலத்தில் தொடரவும்</string>
    <string name="real_time_settings_inspector">நேரடி அமைப்பு ஆய்வி</string>
    <string name="developer_options_status_description">டெவலப்பர் பயன்முறை சுவிட்சின் நிலை</string>
    <string name="usb_debugging_status_description">USB பிழைத்திருத்த சுவிட்சின் நிலை</string>
    <string name="refresh_status">நிலையைப் புதுப்பி</string>
    <string name="share_application">பயன்பாட்டைப் பகிர்</string>
    <string name="remove_ads_description">விளம்பரங்களை அகற்று (Google Play Billing)</string>
    <string name="ad_free_activated">விளம்பரமில்லா நிலை இயக்கப்பட்டது</string>
    <string name="about_phone">தொலைபேசி பற்றி</string>
    <string name="open_about_phone">தொலைபேசி பற்றி என்பதைத் திற</string>
    <string name="wireless_debugging">வயர்லெஸ் பிழைத்திருத்தம்</string>
    <string name="usb_debugging">USB பிழைத்திருத்தம்</string>
    <string name="enablement_guide_title">டெவலப்பர் விருப்பங்களை இயக்குவது எப்படி</string>
    <string name="enablement_guide_step_1">1. உங்கள் சாதனத்தின் அமைப்புகளைத் திறக்கவும்.</string>
    <string name="enablement_guide_step_2">2. தொலைபேசி பற்றி அல்லது அதற்கு இணையான சாதனத் தகவல் பகுதியைத் திறக்கவும்.</string>
    <string name="enablement_guide_step_3">3. உருவாக்க எண் என்பதைக் கண்டறியவும். அது மென்பொருள் தகவல் அல்லது உற்பத்தியாளர் சார்ந்த துணைமெனுவில் இருக்கலாம்.</string>
    <string name="enablement_guide_step_4">4. உருவாக்க எண் மீது ஏழு முறை தட்டவும். கேட்கப்பட்டால் PIN, கடவுச்சொல், முறை அல்லது உயிரளவியல் சரிபார்ப்பைப் பயன்படுத்தவும்.</string>
    <string name="enablement_guide_step_5">5. அமைப்புகளுக்குத் திரும்பி டெவலப்பர் விருப்பங்களைத் திறக்கவும்.</string>
    <string name="manual_enablement_note">டெவலப்பர் விருப்பங்களை நீங்களே இயக்க வேண்டும். இந்தப் பயன்பாடு அமைப்புப் பக்கங்களை மட்டுமே திறக்கும்; பாதுகாக்கப்பட்ட கணினி அமைப்புகளைத் திறக்கவோ மாற்றவோ முடியாது.</string>
    <string name="settings_unavailable">கோரிய அமைப்புப் பக்கத்தை Android திறக்க முடியவில்லை.</string>
    <string name="developer_options_disabled_guide">டெவலப்பர் விருப்பங்கள் முடக்கப்பட்டுள்ளன போலத் தெரிகிறது. வழிகாட்டியைப் பின்பற்றி அவற்றைக் கைமுறையாக இயக்கவும்.</string>
    <string name="developer_options_unavailable_guide">இந்தச் சாதனத்தில் டெவலப்பர் விருப்பப் பக்கத்தைத் திறக்க முடியவில்லை. வழிகாட்டியைப் பின்பற்றவும் அல்லது தொலைபேசி பற்றி என்பதைத் திறக்கவும்.</string>
    <string name="about_phone_fallback_settings">இந்தச் சாதனத்தில் தொலைபேசி பற்றி கிடைக்காததால் பொதுவான அமைப்புகள் திறக்கப்பட்டன.</string>
    <string name="usb_debugging_guidance">டெவலப்பர் விருப்பங்களில் USB பிழைத்திருத்தம் வரை கீழே செல்லவும். இணைக்கப்பட்ட கணினிகளுக்கு பிழைத்திருத்த அணுகலை இது வழங்கலாம்; நம்பகமான கணினியுடன் தேவையானபோது மட்டுமே இயக்கவும்.</string>
    <string name="wireless_debugging_guidance">Android 11 மற்றும் அதற்குப் பிந்தைய பதிப்புகளில் டெவலப்பர் விருப்பங்களுக்குள் வயர்லெஸ் பிழைத்திருத்தத்தைத் தேடவும். கிடைப்பதும் பெயரும் சாதனத்தைப் பொறுத்து மாறும்.</string>
    <string name="wireless_debugging_unavailable">வயர்லெஸ் பிழைத்திருத்தம் கிடைப்பது Android பதிப்பு மற்றும் சாதனத்தைப் பொறுத்தது. டெவலப்பர் விருப்பங்களில் தொடர்புடைய அமைப்பைப் பார்க்கவும்.</string>
    <string name="wireless_debugging_fallback_guidance">டெவலப்பர் விருப்பங்களை நேரடியாகத் திறக்க முடியவில்லை. அமைப்புகளில் டெவலப்பர் விருப்பங்களைத் தேடவும்; சாதனம் ஆதரித்தால் வயர்லெஸ் பிழைத்திருத்தத்தையும் பார்க்கவும்.</string>
    <string name="settings_open_failed">இந்தச் சாதனத்தில் Android அமைப்புகளைத் திறக்க முடியவில்லை.</string>
    <string name="status_updated">டெவலப்பர் நிலையும் சாதன விவரங்களும் புதுப்பிக்கப்பட்டன.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">சாதன வன்பொருள் மற்றும் OS விவரங்கள்</string>
    <string name="device_details_subtitle">android.os.Build இலிருந்து படிக்கப்பட்ட கணினி அளவுருக்கள்</string>
    <string name="android_version">Android பதிப்பு</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">சாதன மாதிரி</string>
    <string name="brand_hardware">பிராண்ட் / வன்பொருள்</string>
    <string name="security_patch">பாதுகாப்புப் புதுப்பிப்பு</string>
    <string name="build_number">உருவாக்க எண்</string>
    <string name="cpu_architecture">CPU கட்டமைப்பு</string>
    <string name="quick_hardware_diagnostic">விரைவு வன்பொருள் கண்டறிதல்</string>
    <string name="diagnostic_stage_1">நிலை 1/3: திரை மற்றும் செயலிழந்த பிக்சல் சோதனை</string>
    <string name="diagnostic_stage_1_description">குறைபாடுள்ள பிக்சல்கள் உள்ளனவா என்று RGB வண்ண வரிசையைப் பாருங்கள்.</string>
    <string name="diagnostic_stage_2">நிலை 2/3: அதிர்வு சோதனை</string>
    <string name="diagnostic_stage_2_description">அதிர்வு மோட்டார் மற்றும் தொடு அதிர்வு பதிலைச் சரிபார்க்கவும்.</string>
    <string name="diagnostic_stage_3">நிலை 3/3: பல்தொடு சோதனை</string>
    <string name="diagnostic_stage_3_description">திரையைப் பயன்படுத்தும்போது தொடு பதிலைச் சரிபார்க்கவும்.</string>
    <string name="seconds_remaining">இன்னும் %1$d வினாடிகள்</string>
    <string name="rgb_spectrum_test">RGB நிறவரிசை சோதனை (%1$s)</string>
    <string name="pulsing_vibration_engine">அதிர்வு பதில் சோதனை</string>
    <string name="digitizer_multi_touch_active">பதிலைச் சோதிக்க திரையைத் தொடவும்</string>
    <string name="diagnostic_passed">கண்டறிதல் தொடர் முடிந்தது</string>
    <string name="diagnostic_passed_summary">காட்சி, அதிர்வு மற்றும் தொடு வழிகாட்டிகள் காட்டப்பட்டன.</string>
    <string name="rgb_screen_matrix">RGB திரை நிறச் சோதனை</string>
    <string name="zero_dead_pixels_pass">கண் பார்வைச் சோதனை தேவை</string>
    <string name="haptic_vibration_motor">தொடு அதிர்வு மோட்டார்</string>
    <string name="calibrated_functional_pass">பயனர் சரிபார்ப்பு தேவை</string>
    <string name="touch_digitizer">தொடு உணரிப்பான்</string>
    <string name="low_latency_multi_touch_pass">பயனர் சரிபார்ப்பு தேவை</string>
    <string name="share_specs">சாதன விவரங்களைப் பகிர்</string>
    <string name="test_again">மீண்டும் இயக்கு</string>
    <string name="unknown">தெரியவில்லை</string>
    <string name="security_patch_unavailable">கிடைக்கவில்லை (Android 6-க்கு முந்தைய பதிப்பு)</string>
    <string name="status_active_on">செயலில் (இயக்கு)</string>
    <string name="status_disabled_off">முடக்கப்பட்டது</string>
    <string name="device_report_subject">சாதன வன்பொருள் விவரங்கள்</string>
    <string name="device_diagnostic_report">Android சாதன அறிக்கை
------------------------------
மாதிரி: %1$s %2$s
Android: %3$s (API %4$d)
உருவாக்கம்: %5$s
பாதுகாப்புப் புதுப்பிப்பு: %6$s
CPU கட்டமைப்பு: %7$s
டெவலப்பர் விருப்பங்கள்: %8$s
USB பிழைத்திருத்தம்: %9$s

குறிப்பு: திரையில் காட்டப்படும் வழிகாட்டிகள் வன்பொருள் சான்றிதழ் அல்ல; செயலிழந்த பிக்சல்கள் அல்லது தொடு பதிலைத் தானாக அளவிடாது.</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_telugu">తెలుగు</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="update_available_title">புதுப்பிப்பு கிடைக்கிறது</string>
    <string name="update_available_message">Developers Options Shortcut இன் புதிய பதிப்பு கிடைக்கிறது. சமீபத்திய மேம்பாடுகள் மற்றும் திருத்தங்களைப் பெற பயன்பாட்டைப் புதுப்பிக்கவும்.</string>
    <string name="update_now">இப்போது புதுப்பிக்கவும்</string>
    <string name="later">பிறகு</string>
    <string name="offline_title">நீங்கள் இணையமின்றி உள்ளீர்கள்</string>
    <string name="offline_message">விளம்பரங்களை ஏற்றவும் இந்த இலவச பயன்பாட்டின் வளர்ச்சிக்கு ஆதரவளிக்கவும் இணையத்துடன் இணைக்கவும். முக்கிய அம்சங்கள் இணையமின்றியும் கிடைக்கும்.</string>
    <string name="internet_settings">இணைய அமைப்புகள்</string>
    <string name="not_now">இப்போது வேண்டாம்</string>
    <string name="offline_settings_unavailable">நெட்வொர்க் அமைப்புகளைத் திறக்க முடியவில்லை. சாதன அமைப்புகளில் நெட்வொர்க் அல்லது இணையத்தைத் தேர்ந்தெடுக்கவும்.</string>
    <string name="offline_support_message">இந்தப் பயன்பாடு பிடித்திருக்கிறதா? எதிர்கால மேம்பாட்டிற்கு ஆதரவாக குழுவிற்கு காபி வழங்கலாம். இது முற்றிலும் விருப்பமானது; பயன்பாடு இணையமின்றியும் கிடைக்கும்.</string>
    <string name="offline_purchase_unverified_message">நீங்கள் இணையமின்றி இருப்பதால் விளம்பர நீக்க நிலையை இப்போது சரிபார்க்க முடியாது. வாங்குதல் உறுதி செய்யப்பட்டது என்று கருதமாட்டோம். இணையமின்றி கிடைக்கும் அம்சங்களைத் தொடர்ந்து பயன்படுத்தி, இணைய அம்சம் தேவைப்படும் போது மீண்டும் இணைக்கவும்.</string>
    <string name="offline_ad_supported_message">நீங்கள் இணையமின்றி உள்ளீர்கள். மீண்டும் இணைக்கும் வரை விளம்பரங்களும் சில ஆன்லைன் அம்சங்களும் கிடைக்காமல் இருக்கலாம். இணையமின்றி பயன்பாட்டைப் பயன்படுத்தலாம்; ஆன்லைன் அம்சம் தேவைப்படும் போது மட்டும் இணைக்கவும்.</string>
    <string name="review_prompt_title">Developers Options Shortcut ஐப் பயன்படுத்துவது பிடித்திருக்கிறதா?</string>
    <string name="review_prompt_message">உங்கள் கருத்துகள் பயன்பாட்டை மேம்படுத்த உதவும். நேரமிருந்தால் Google Play-இல் நேர்மையான மதிப்புரையைப் பகிரவும். ஆதரவுக்கு நன்றி!</string>
    <string name="review_on_google_play">Google Play-இல் மதிப்புரை எழுதவும்</string>
    <string name="share_with_friends">நண்பர்களுடன் பகிரவும்</string>
    <string name="review_not_now">இப்போது வேண்டாம்</string>
    <string name="rate_on_google_play">Google Play-இல் மதிப்பிடவும்</string>
    <string name="play_store_unavailable">Google Play-ஐத் திறக்க முடியவில்லை. உலாவி அல்லது Play Store கிடைக்கிறதா எனச் சரிபார்க்கவும்.</string>
    <string name="share_unavailable">இணைப்பைப் பகிரக்கூடிய பயன்பாடு இல்லை.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-kn/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Kannada Android string resources for per-app language selection',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ತೆರೆಯಿರಿ</string>
    <string name="dev_options_status">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳು</string>
    <string name="usb_debugging_status">USB ಡೀಬಗಿಂಗ್</string>
    <string name="status_enabled">ಸಕ್ರಿಯವಾಗಿದೆ</string>
    <string name="status_disabled">ನಿಷ್ಕ್ರಿಯವಾಗಿದೆ</string>
    <string name="status_unknown">ತಿಳಿದಿಲ್ಲ</string>
    <string name="device_specs_title">ಸಾಧನದ ಹಾರ್ಡ್‌ವೇರ್ ಮತ್ತು OS</string>
    <string name="how_to_unlock_title">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ಹೇಗೆ ಸಕ್ರಿಯಗೊಳಿಸುವುದು</string>
    <string name="how_to_unlock_desc">Android ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ನೀವೇ ಕೈಯಾರೆ ಸಕ್ರಿಯಗೊಳಿಸಬೇಕು. ಈ ಆ್ಯಪ್ ಅವನ್ನು ಅನ್‌ಲಾಕ್ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ.</string>
    <string name="dev_options_not_found">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳು ಲಭ್ಯವಿಲ್ಲ. ಅವನ್ನು ಸಕ್ರಿಯಗೊಳಿಸುವ ವಿಧಾನ ತಿಳಿಯಲು ಮಾರ್ಗದರ್ಶಿ ತೆರೆಯಿರಿ.</string>
    <string name="share_app">ಆ್ಯಪ್ ಹಂಚಿಕೊಳ್ಳಿ</string>
    <string name="share_subject">Android ಗಾಗಿ Developers Options Shortcut</string>
    <string name="share_message">ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ತೆರೆಯಿರಿ ಮತ್ತು USB ಡೀಬಗಿಂಗ್ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ: https://play.google.com/store/apps/details?id=%1$s</string>
    <string name="select_language">ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ</string>
    <string name="language_picker_title">ಆ್ಯಪ್ ಭಾಷೆ</string>
    <string name="language_english">English</string>
    <string name="language_russian">Русский</string>
    <string name="language_hindi">हिन्दी</string>
    <string name="language_spanish">Español</string>
    <string name="language_french">Français</string>
    <string name="language_arabic">العربية</string>
<string name="language_german">Deutsch</string>
    <string name="language_japanese">日本語</string>
<string name="language_system_default">ಸಿಸ್ಟಮ್ ಡೀಫಾಲ್ಟ್</string>
    <string name="done">ಮುಗಿದಿದೆ</string>
    <string name="language_suggestion_title">ನಿಮ್ಮ ಆದ್ಯತೆಯ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ</string>
    <string name="language_suggestion_message">ನಿಮ್ಮ ಸಾಧನದ ಆದ್ಯತೆಯ ಭಾಷೆ %1$s. ಈ ಆ್ಯಪ್‌ನಲ್ಲಿಯೂ ಅದನ್ನು ಬಳಸಬೇಕೆ?</string>
    <string name="language_switch_to_suggested">ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಿ</string>
    <string name="language_continue_english">ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಮುಂದುವರಿಸಿ</string>
    <string name="real_time_settings_inspector">ನೈಜ-ಸಮಯ ಸೆಟ್ಟಿಂಗ್ ಪರಿಶೀಲಕ</string>
    <string name="developer_options_status_description">ಡೆವಲಪರ್ ಮೋಡ್ ಸ್ವಿಚ್ ಸ್ಥಿತಿ</string>
    <string name="usb_debugging_status_description">USB ಡೀಬಗಿಂಗ್ ಸ್ವಿಚ್ ಸ್ಥಿತಿ</string>
    <string name="refresh_status">ಸ್ಥಿತಿಯನ್ನು ರಿಫ್ರೆಶ್ ಮಾಡಿ</string>
    <string name="share_application">ಆ್ಯಪ್ ಹಂಚಿಕೊಳ್ಳಿ</string>
    <string name="remove_ads_description">ಜಾಹೀರಾತುಗಳನ್ನು ತೆಗೆದುಹಾಕಿ (Google Play Billing)</string>
    <string name="ad_free_activated">ಜಾಹೀರಾತು-ರಹಿತ ಮೋಡ್ ಸಕ್ರಿಯವಾಗಿದೆ</string>
    <string name="about_phone">ಫೋನ್ ಕುರಿತು</string>
    <string name="open_about_phone">ಫೋನ್ ಕುರಿತು ತೆರೆಯಿರಿ</string>
    <string name="wireless_debugging">ವೈರ್‌ಲೆಸ್ ಡೀಬಗಿಂಗ್</string>
    <string name="usb_debugging">USB ಡೀಬಗಿಂಗ್</string>
    <string name="enablement_guide_title">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ಹೇಗೆ ಸಕ್ರಿಯಗೊಳಿಸುವುದು</string>
    <string name="enablement_guide_step_1">1. ನಿಮ್ಮ ಸಾಧನದ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಿರಿ.</string>
    <string name="enablement_guide_step_2">2. ಫೋನ್ ಕುರಿತು ಅಥವಾ ಸಾಧನದ ಮಾಹಿತಿಯ ಸಮಾನ ವಿಭಾಗವನ್ನು ತೆರೆಯಿರಿ.</string>
    <string name="enablement_guide_step_3">3. ಬಿಲ್ಡ್ ಸಂಖ್ಯೆ ಹುಡುಕಿ. ಅದು ಸಾಫ್ಟ್‌ವೇರ್ ಮಾಹಿತಿ ಅಥವಾ ತಯಾರಕರ ಉಪಮೆನುವಿನಲ್ಲಿ ಇರಬಹುದು.</string>
    <string name="enablement_guide_step_4">4. ಬಿಲ್ಡ್ ಸಂಖ್ಯೆಯನ್ನು ಏಳು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ. ಕೇಳಿದರೆ PIN, ಪಾಸ್‌ವರ್ಡ್, ಪ್ಯಾಟರ್ನ್ ನಮೂದಿಸಿ ಅಥವಾ ಬಯೋಮೆಟ್ರಿಕ್ ಪರಿಶೀಲನೆ ಬಳಸಿ.</string>
    <string name="enablement_guide_step_5">5. ಸೆಟ್ಟಿಂಗ್‌ಗಳಿಗೆ ಹಿಂದಿರುಗಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ತೆರೆಯಿರಿ.</string>
    <string name="manual_enablement_note">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ನೀವೇ ಸಕ್ರಿಯಗೊಳಿಸಬೇಕು. ಈ ಆ್ಯಪ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳ ಪುಟಗಳನ್ನು ಮಾತ್ರ ತೆರೆಯುತ್ತದೆ; ರಕ್ಷಿತ ಸಿಸ್ಟಮ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಅನ್‌ಲಾಕ್ ಅಥವಾ ಬದಲಾಯಿಸುವುದಿಲ್ಲ.</string>
    <string name="settings_unavailable">Android ಕೇಳಿದ ಸೆಟ್ಟಿಂಗ್‌ಗಳ ಪುಟವನ್ನು ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</string>
    <string name="developer_options_disabled_guide">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳು ನಿಷ್ಕ್ರಿಯವಾಗಿರುವಂತೆ ಕಾಣುತ್ತಿವೆ. ಮಾರ್ಗದರ್ಶಿ ಅನುಸರಿಸಿ ಅವನ್ನು ಕೈಯಾರೆ ಸಕ್ರಿಯಗೊಳಿಸಿ.</string>
    <string name="developer_options_unavailable_guide">ಈ ಸಾಧನದಲ್ಲಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳ ಪುಟ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮಾರ್ಗದರ್ಶಿ ಅನುಸರಿಸಿ ಅಥವಾ ಫೋನ್ ಕುರಿತು ತೆರೆಯಿರಿ.</string>
    <string name="about_phone_fallback_settings">ಈ ಸಾಧನದಲ್ಲಿ ಫೋನ್ ಕುರಿತು ಲಭ್ಯವಿಲ್ಲದ ಕಾರಣ ಸಾಮಾನ್ಯ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಲಾಗಿದೆ.</string>
    <string name="usb_debugging_guidance">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳಲ್ಲಿ USB ಡೀಬಗಿಂಗ್ ತನಕ ಕೆಳಗೆ ಸ್ಕ್ರೋಲ್ ಮಾಡಿ. ಸಂಪರ್ಕಿತ ಕಂಪ್ಯೂಟರ್‌ಗಳಿಗೆ ಡೀಬಗಿಂಗ್ ಪ್ರವೇಶ ಸಿಗಬಹುದು; ನಂಬಿಕೆಯ ಕಂಪ್ಯೂಟರ್ ಮತ್ತು ಅಗತ್ಯವಿದ್ದಾಗ ಮಾತ್ರ ಸಕ್ರಿಯಗೊಳಿಸಿ.</string>
    <string name="wireless_debugging_guidance">Android 11 ಮತ್ತು ನಂತರದ ಆವೃತ್ತಿಗಳಲ್ಲಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳೊಳಗೆ ವೈರ್‌ಲೆಸ್ ಡೀಬಗಿಂಗ್ ಹುಡುಕಿ. ಲಭ್ಯತೆ ಮತ್ತು ಹೆಸರು ಸಾಧನಾನುಸಾರ ಬದಲಾಗುತ್ತವೆ.</string>
    <string name="wireless_debugging_unavailable">ವೈರ್‌ಲೆಸ್ ಡೀಬಗಿಂಗ್ ಲಭ್ಯತೆ Android ಆವೃತ್ತಿ ಮತ್ತು ಸಾಧನವನ್ನು ಅವಲಂಬಿಸಿದೆ. ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳಲ್ಲಿ ಸಂಬಂಧಿತ ಸೆಟ್ಟಿಂಗ್ ಪರಿಶೀಲಿಸಿ.</string>
    <string name="wireless_debugging_fallback_guidance">ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ನೇರವಾಗಿ ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳನ್ನು ಹುಡುಕಿ, ಸಾಧನ ಬೆಂಬಲಿಸಿದರೆ ವೈರ್‌ಲೆಸ್ ಡೀಬಗಿಂಗ್ ಪರಿಶೀಲಿಸಿ.</string>
    <string name="settings_open_failed">ಈ ಸಾಧನದಲ್ಲಿ Android ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.</string>
    <string name="status_updated">ಡೆವಲಪರ್ ಸ್ಥಿತಿ ಮತ್ತು ಸಾಧನದ ವಿವರಗಳನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ.</string>
    <string name="play_store_error_format">Google Play: %1$s</string>
    <string name="device_hardware_os_details">ಸಾಧನದ ಹಾರ್ಡ್‌ವೇರ್ ಮತ್ತು OS ವಿವರಗಳು</string>
    <string name="device_details_subtitle">android.os.Build ನಿಂದ ಓದಿದ ಸಿಸ್ಟಮ್ ನಿಯತಾಂಕಗಳು</string>
    <string name="android_version">Android ಆವೃತ್ತಿ</string>
    <string name="android_version_value">Android %1$s (API %2$d)</string>
    <string name="device_model">ಸಾಧನ ಮಾದರಿ</string>
    <string name="brand_hardware">ಬ್ರ್ಯಾಂಡ್ / ಹಾರ್ಡ್‌ವೇರ್</string>
    <string name="security_patch">ಭದ್ರತಾ ಪ್ಯಾಚ್</string>
    <string name="build_number">ಬಿಲ್ಡ್ ಸಂಖ್ಯೆ</string>
    <string name="cpu_architecture">CPU ಆರ್ಕಿಟೆಕ್ಚರ್</string>
    <string name="quick_hardware_diagnostic">ತ್ವರಿತ ಹಾರ್ಡ್‌ವೇರ್ ತಪಾಸಣೆ</string>
    <string name="diagnostic_stage_1">ಹಂತ 1/3: ಪರದೆ ಮತ್ತು ಡೆಡ್-ಪಿಕ್ಸೆಲ್ ಪರಿಶೀಲನೆ</string>
    <string name="diagnostic_stage_1_description">ಸಂಭಾವ್ಯ ದೋಷಪೂರಿತ ಪಿಕ್ಸೆಲ್‌ಗಳಿಗಾಗಿ RGB ಬಣ್ಣ ಸ್ಪೆಕ್ಟ್ರಮ್ ಪರಿಶೀಲಿಸಿ.</string>
    <string name="diagnostic_stage_2">ಹಂತ 2/3: ಹ್ಯಾಪ್ಟಿಕ್ ಕಂಪನ ಪರಿಶೀಲನೆ</string>
    <string name="diagnostic_stage_2_description">ಕಂಪನ ಮೋಟಾರ್ ಮತ್ತು ಹ್ಯಾಪ್ಟಿಕ್ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.</string>
    <string name="diagnostic_stage_3">ಹಂತ 3/3: ಮಲ್ಟಿ-ಟಚ್ ಪರಿಶೀಲನೆ</string>
    <string name="diagnostic_stage_3_description">ಪರದೆಯನ್ನು ಬಳಸುವಾಗ ಸ್ಪರ್ಶ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.</string>
    <string name="seconds_remaining">ಇನ್ನೂ %1$d ಸೆಕೆಂಡುಗಳು</string>
    <string name="rgb_spectrum_test">RGB ಸ್ಪೆಕ್ಟ್ರಮ್ ಪರೀಕ್ಷೆ (%1$s)</string>
    <string name="pulsing_vibration_engine">ಕಂಪನ ಪ್ರತಿಕ್ರಿಯೆ ಪರೀಕ್ಷೆ</string>
    <string name="digitizer_multi_touch_active">ಪ್ರತಿಕ್ರಿಯೆ ಪರೀಕ್ಷಿಸಲು ಪರದೆಯನ್ನು ಸ್ಪರ್ಶಿಸಿ</string>
    <string name="diagnostic_passed">ಪರಿಶೀಲನಾ ಕ್ರಮ ಪೂರ್ಣಗೊಂಡಿದೆ</string>
    <string name="diagnostic_passed_summary">ದೃಶ್ಯ, ಕಂಪನ ಮತ್ತು ಸ್ಪರ್ಶ ಸೂಚನೆಗಳನ್ನು ತೋರಿಸಲಾಗಿದೆ.</string>
    <string name="rgb_screen_matrix">RGB ಪರದೆ ಬಣ್ಣ ಪರಿಶೀಲನೆ</string>
    <string name="zero_dead_pixels_pass">ದೃಶ್ಯ ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ</string>
    <string name="haptic_vibration_motor">ಹ್ಯಾಪ್ಟಿಕ್ ಕಂಪನ ಮೋಟಾರ್</string>
    <string name="calibrated_functional_pass">ಬಳಕೆದಾರರ ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ</string>
    <string name="touch_digitizer">ಟಚ್ ಡಿಜಿಟೈಜರ್</string>
    <string name="low_latency_multi_touch_pass">ಬಳಕೆದಾರರ ಪರಿಶೀಲನೆ ಅಗತ್ಯವಿದೆ</string>
    <string name="share_specs">ಸಾಧನದ ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಿ</string>
    <string name="test_again">ಮತ್ತೆ ನಡೆಸಿ</string>
    <string name="unknown">ತಿಳಿದಿಲ್ಲ</string>
    <string name="security_patch_unavailable">ಲಭ್ಯವಿಲ್ಲ (Android 6 ಕ್ಕಿಂತ ಹಳೆಯದು)</string>
    <string name="status_active_on">ಸಕ್ರಿಯ (ಆನ್)</string>
    <string name="status_disabled_off">ನಿಷ್ಕ್ರಿಯ (ಆಫ್)</string>
    <string name="device_report_subject">ಸಾಧನದ ಹಾರ್ಡ್‌ವೇರ್ ವಿವರಗಳು</string>
    <string name="device_diagnostic_report">Android ಸಾಧನ ವರದಿ
------------------------------
ಮಾದರಿ: %1$s %2$s
Android: %3$s (API %4$d)
ಬಿಲ್ಡ್: %5$s
ಭದ್ರತಾ ಪ್ಯಾಚ್: %6$s
CPU ಆರ್ಕಿಟೆಕ್ಚರ್: %7$s
ಡೆವಲಪರ್ ಆಯ್ಕೆಗಳು: %8$s
USB ಡೀಬಗಿಂಗ್: %9$s

ಸೂಚನೆ: ಪರದೆಯ ಸೂಚನೆಗಳು ಹಾರ್ಡ್‌ವೇರ್ ಪ್ರಮಾಣೀಕರಣವಲ್ಲ ಮತ್ತು ಡೆಡ್ ಪಿಕ್ಸೆಲ್ ಅಥವಾ ಸ್ಪರ್ಶ ಪ್ರತಿಕ್ರಿಯೆಯನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಅಳೆಯುವುದಿಲ್ಲ.</string>
    <string name="language_chinese">简体中文</string>
    <string name="language_bengali">বাংলা</string>
    <string name="language_indonesian">Bahasa Indonesia</string>
    <string name="language_italian">Italiano</string>
    <string name="language_korean">한국어</string>
    <string name="language_portuguese">Português (Brasil)</string>
    <string name="language_turkish">Türkçe</string>
    <string name="language_vietnamese">Tiếng Việt</string>
    <string name="language_telugu">తెలుగు</string>
    <string name="language_tamil">தமிழ்</string>
    <string name="language_kannada">ಕನ್ನಡ</string>
    <string name="update_available_title">ನವೀಕರಣ ಲಭ್ಯವಿದೆ</string>
    <string name="update_available_message">Developers Options Shortcut ನ ಹೊಸ ಆವೃತ್ತಿ ಲಭ್ಯವಿದೆ. ಇತ್ತೀಚಿನ ಸುಧಾರಣೆಗಳು ಮತ್ತು ತಿದ್ದುಪಡಿಗಳನ್ನು ಪಡೆಯಲು ಅಪ್ಲಿಕೇಶನ್ ಅನ್ನು ನವೀಕರಿಸಿ.</string>
    <string name="update_now">ಈಗ ನವೀಕರಿಸಿ</string>
    <string name="later">ನಂತರ</string>
    <string name="offline_title">ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ</string>
    <string name="offline_message">ಜಾಹೀರಾತುಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಮತ್ತು ಈ ಉಚಿತ ಅಪ್ಲಿಕೇಶನ್‌ನ ಅಭಿವೃದ್ಧಿಗೆ ಬೆಂಬಲ ನೀಡಲು ಇಂಟರ್ನೆಟ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ. ಮುಖ್ಯ ವೈಶಿಷ್ಟ್ಯಗಳು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿಯೂ ಲಭ್ಯವಿವೆ.</string>
    <string name="internet_settings">ಇಂಟರ್ನೆಟ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು</string>
    <string name="not_now">ಈಗ ಬೇಡ</string>
    <string name="offline_settings_unavailable">ನೆಟ್‌ವರ್ಕ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಸಾಧನದ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ನೆಟ್‌ವರ್ಕ್ ಅಥವಾ ಇಂಟರ್ನೆಟ್ ಆಯ್ಕೆಮಾಡಿ.</string>
    <string name="offline_support_message">ಅಪ್ಲಿಕೇಶನ್ ನಿಮಗೆ ಇಷ್ಟವಾಯಿತೇ? ಭವಿಷ್ಯದ ಅಭಿವೃದ್ಧಿಗೆ ಬೆಂಬಲವಾಗಿ ತಂಡಕ್ಕೆ ಕಾಫಿ ನೀಡಿ. ಇದು ಸಂಪೂರ್ಣ ಐಚ್ಛಿಕ; ಅಪ್ಲಿಕೇಶನ್ ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿಯೂ ಲಭ್ಯವಿರುತ್ತದೆ.</string>
    <string name="offline_purchase_unverified_message">ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿರುವುದರಿಂದ ಜಾಹೀರಾತು ತೆಗೆದುಹಾಕಿದ ಸ್ಥಿತಿಯನ್ನು ಈಗ ಪರಿಶೀಲಿಸಲಾಗುವುದಿಲ್ಲ. ಖರೀದಿ ದೃಢಪಟ್ಟಿದೆ ಎಂದು ನಾವು ಊಹಿಸುವುದಿಲ್ಲ. ಆಫ್‌ಲೈನ್ ವೈಶಿಷ್ಟ್ಯಗಳನ್ನು ಬಳಸುತ್ತಿರಿ; ಆನ್‌ಲೈನ್ ವೈಶಿಷ್ಟ್ಯ ಬೇಕಾದಾಗ ಮರುಸಂಪರ್ಕಿಸಿ.</string>
    <string name="offline_ad_supported_message">ನೀವು ಆಫ್‌ಲೈನ್‌ನಲ್ಲಿದ್ದೀರಿ. ಮರುಸಂಪರ್ಕಿಸುವವರೆಗೆ ಜಾಹೀರಾತುಗಳು ಮತ್ತು ಕೆಲವು ಆನ್‌ಲೈನ್ ವೈಶಿಷ್ಟ್ಯಗಳು ಲಭ್ಯವಿರದಿರಬಹುದು. ಆಫ್‌ಲೈನ್ ವೈಶಿಷ್ಟ್ಯಗಳನ್ನು ಬಳಸಬಹುದು; ಆನ್‌ಲೈನ್ ವೈಶಿಷ್ಟ್ಯ ಬೇಕಾದಾಗ ಮರುಸಂಪರ್ಕಿಸಿ.</string>
    <string name="review_prompt_title">Developers Options Shortcut ಬಳಸುವುದು ನಿಮಗೆ ಇಷ್ಟವಾಯಿತೇ?</string>
    <string name="review_prompt_message">ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆ ಅಪ್ಲಿಕೇಶನ್ ಅನ್ನು ಸುಧಾರಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಸಮಯವಿದ್ದರೆ Google Play ನಲ್ಲಿ ನಿಮ್ಮ ಪ್ರಾಮಾಣಿಕ ವಿಮರ್ಶೆಯನ್ನು ಹಂಚಿಕೊಳ್ಳಿ. ಬೆಂಬಲಕ್ಕೆ ಧನ್ಯವಾದಗಳು!</string>
    <string name="review_on_google_play">Google Play ನಲ್ಲಿ ವಿಮರ್ಶೆ ನೀಡಿ</string>
    <string name="share_with_friends">ಸ್ನೇಹಿತರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ</string>
    <string name="review_not_now">ಈಗ ಬೇಡ</string>
    <string name="rate_on_google_play">Google Play ನಲ್ಲಿ ರೇಟ್ ಮಾಡಿ</string>
    <string name="play_store_unavailable">Google Play ತೆರೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಬ್ರೌಸರ್ ಅಥವಾ Play Store ಲಭ್ಯವಿದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.</string>
    <string name="share_unavailable">ಲಿಂಕ್ ಹಂಚಿಕೊಳ್ಳಲು ಹೊಂದುವ ಅಪ್ಲಿಕೇಶನ್ ಲಭ್ಯವಿಲ್ಲ.</string>
    <string name="admob_banner_id" translatable="false">ca-app-pub-4783826505860771/4624168456</string>
    <string name="admob_interstitial_id" translatable="false">ca-app-pub-4783826505860771/6316609796</string>
</resources>
`,
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/AppPromptPolicy.kt',
    name: 'AppPromptPolicy.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Testable prompt eligibility, engagement thresholds and cooldowns.',
    content: `package com.utility.devoptions

enum class AppPrompt { UPDATE, OFFLINE, REVIEW }

object PromptPolicy {
    const val DAY_MS = 86_400_000L
    const val INTER_PROMPT_COOLDOWN_MS = 10L * 60L * 1000L
    const val REVIEW_PROMPT_COOLDOWN_MS = 30L * DAY_MS
    const val AUTO_REVIEW_COOLDOWN_MS = 90L * DAY_MS
    const val MIN_REVIEW_SESSIONS = 3
    const val MIN_MEANINGFUL_ACTIONS_FOR_REVIEW = 3
    const val MIN_AUTO_REVIEW_SESSIONS = 5
    const val MIN_MEANINGFUL_ACTIONS_FOR_AUTO_REVIEW = 3

    fun cooldownElapsed(last: Long, now: Long, cooldown: Long): Boolean =
        last <= 0L || now < last || now - last >= cooldown

    fun shouldShowUpdate(confirmed: Boolean, last: Long, now: Long): Boolean =
        confirmed && cooldownElapsed(last, now, DAY_MS)

    fun shouldShowOffline(validated: Boolean, shownThisSession: Boolean): Boolean =
        !validated && !shownThisSession

    fun hasMeaningfulReviewUsage(sessions: Int, actions: Int): Boolean =
        sessions >= MIN_REVIEW_SESSIONS && actions >= MIN_MEANINGFUL_ACTIONS_FOR_REVIEW

    fun shouldShowReviewPrompt(sessions: Int, actions: Int, last: Long, now: Long): Boolean =
        hasMeaningfulReviewUsage(sessions, actions) &&
            cooldownElapsed(last, now, REVIEW_PROMPT_COOLDOWN_MS)

    fun shouldRequestAutomaticReview(
        sessions: Int,
        actions: Int,
        lastRequest: Long,
        lastPrompt: Long,
        now: Long
    ): Boolean =
        sessions >= MIN_AUTO_REVIEW_SESSIONS &&
            actions >= MIN_MEANINGFUL_ACTIONS_FOR_AUTO_REVIEW &&
            cooldownElapsed(lastRequest, now, AUTO_REVIEW_COOLDOWN_MS) &&
            cooldownElapsed(lastPrompt, now, REVIEW_PROMPT_COOLDOWN_MS)

    /** Selects one prompt at a time; consent, update and connectivity outrank review requests. */
    fun selectPrompt(
        current: AppPrompt?,
        consentResolved: Boolean,
        updateConfirmed: Boolean,
        lastUpdateShown: Long,
        validatedInternet: Boolean,
        offlineShownThisSession: Boolean,
        sessions: Int,
        meaningfulActions: Int,
        lastReviewPromptShown: Long,
        lastAnyPromptShown: Long,
        now: Long
    ): AppPrompt? {
        if (!consentResolved) return null

        // Retain an already-visible update prompt even though its timestamp starts its cooldown.
        if (updateConfirmed &&
            (current == AppPrompt.UPDATE || shouldShowUpdate(true, lastUpdateShown, now))
        ) return AppPrompt.UPDATE

        if (!validatedInternet) {
            if (current == AppPrompt.OFFLINE) return AppPrompt.OFFLINE
            if (shouldShowOffline(false, offlineShownThisSession) &&
                cooldownElapsed(lastAnyPromptShown, now, INTER_PROMPT_COOLDOWN_MS)
            ) return AppPrompt.OFFLINE
            return null
        }

        // Retain a review dialog until the user dismisses it; the display timestamp is already set.
        if (current == AppPrompt.REVIEW && hasMeaningfulReviewUsage(sessions, meaningfulActions)) {
            return AppPrompt.REVIEW
        }

        if (shouldShowReviewPrompt(sessions, meaningfulActions, lastReviewPromptShown, now) &&
            cooldownElapsed(lastAnyPromptShown, now, INTER_PROMPT_COOLDOWN_MS)
        ) return AppPrompt.REVIEW

        return null
    }
}


/** Select honest offline copy without treating a missing billing response as a purchase. */
enum class OfflineMessageVariant { AD_SUPPORTED, AD_FREE, UNVERIFIED }

object OfflineMessagePolicy {
    fun choose(isAdsRemoved: Boolean, entitlementKnown: Boolean): OfflineMessageVariant = when {
        !entitlementKnown -> OfflineMessageVariant.UNVERIFIED
        isAdsRemoved -> OfflineMessageVariant.AD_FREE
        else -> OfflineMessageVariant.AD_SUPPORTED
    }
}
`,
  },

  {
    path: 'app/src/main/java/com/utility/devoptions/util/ExternalActions.kt',
    name: 'ExternalActions.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Safe Play Store listing fallback and Android network settings intents.',
    content: `package com.utility.devoptions.util
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
object ExternalActions {
 const val MARKET_URI="market://details?id=com.utility.devoptions"
 const val HTTPS_URI="https://play.google.com/store/apps/details?id=com.utility.devoptions"
 fun openPlayListing(context:Context):Boolean {
  val market=Intent(Intent.ACTION_VIEW,Uri.parse(MARKET_URI)).setPackage("com.android.vending")
  return launchWithFallback({ tryStart(context, market) }, { tryStart(context, Intent(Intent.ACTION_VIEW, Uri.parse(HTTPS_URI))) })
 }
 fun openNetworkSettings(context:Context):Boolean {
  return launchWithFallback({ tryStart(context, Intent(Settings.ACTION_WIRELESS_SETTINGS)) }, { tryStart(context, Intent(Settings.ACTION_SETTINGS)) })
 }
 internal fun launchWithFallback(primary: () -> Boolean, fallback: () -> Boolean): Boolean = if (primary()) true else fallback()
 private fun tryStart(context:Context,intent:Intent):Boolean=try { intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(intent); true } catch(_:ActivityNotFoundException){false} catch(_:SecurityException){false} catch(_:IllegalArgumentException){false}
}
`,
  },

  {
    path: 'app/src/test/java/com/utility/devoptions/PromptPolicyTest.kt',
    name: 'PromptPolicyTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PromptPolicyTest {
    @Test
    fun updateNeedsPlayConfirmationAndCooldown() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldShowUpdate(false, 0, now))
        assertTrue(PromptPolicy.shouldShowUpdate(true, 0, now))
        assertFalse(PromptPolicy.shouldShowUpdate(true, now - PromptPolicy.DAY_MS + 1, now))
        assertTrue(PromptPolicy.shouldShowUpdate(true, now - PromptPolicy.DAY_MS, now))
    }

    @Test
    fun offlineNeedsUnvalidatedNetworkAndOneDisplayPerSession() {
        assertTrue(PromptPolicy.shouldShowOffline(false, false))
        assertFalse(PromptPolicy.shouldShowOffline(true, false))
        assertFalse(PromptPolicy.shouldShowOffline(false, true))
    }

    @Test
    fun reviewNeedsBothSessionHistoryAndMeaningfulActions() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldShowReviewPrompt(2, 10, 0, now))
        assertFalse(PromptPolicy.shouldShowReviewPrompt(3, 2, 0, now))
        assertTrue(PromptPolicy.shouldShowReviewPrompt(3, 3, 0, now))
        assertFalse(PromptPolicy.shouldShowReviewPrompt(4, 4, now - PromptPolicy.REVIEW_PROMPT_COOLDOWN_MS + 1, now))
        assertTrue(PromptPolicy.shouldShowReviewPrompt(4, 4, now - PromptPolicy.REVIEW_PROMPT_COOLDOWN_MS, now))
    }

    @Test
    fun promptsUseAnInterruptionCooldownAcrossTypes() {
        val now = 100 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.cooldownElapsed(now - 1, now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS))
        assertTrue(PromptPolicy.cooldownElapsed(now - PromptPolicy.INTER_PROMPT_COOLDOWN_MS, now, PromptPolicy.INTER_PROMPT_COOLDOWN_MS))
    }

    @Test
    fun automaticReviewNeedsMeaningfulUseAndLongCooldown() {
        val now = 200 * PromptPolicy.DAY_MS
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(4, 5, 0, 0, now))
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(5, 2, 0, 0, now))
        assertTrue(PromptPolicy.shouldRequestAutomaticReview(5, 3, 0, 0, now))
        assertFalse(PromptPolicy.shouldRequestAutomaticReview(5, 3, now - PromptPolicy.AUTO_REVIEW_COOLDOWN_MS + 1, 0, now))
    }

    @Test
    fun unresolvedConsentBlocksEveryInformationalPrompt() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(null, PromptPolicy.selectPrompt(
            current = null, consentResolved = false, updateConfirmed = true, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun updateTakesPriorityOverOfflineAndReview() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.UPDATE, PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = true, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun offlineTakesPriorityOverReviewAndIsShownOnlyOncePerSession() {
        val now = 200 * PromptPolicy.DAY_MS
        val first = PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = false, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        )
        assertEquals(AppPrompt.OFFLINE, first)
        val afterDismiss = PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = false, offlineShownThisSession = true, sessions = 10,
            meaningfulActions = 10, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        )
        assertEquals(null, afterDismiss)
    }

    @Test
    fun reviewIsSelectedOnlyWhenHigherPriorityPromptsAreIneligible() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.REVIEW, PromptPolicy.selectPrompt(
            current = null, consentResolved = true, updateConfirmed = false, lastUpdateShown = 0,
            validatedInternet = true, offlineShownThisSession = false, sessions = 3,
            meaningfulActions = 3, lastReviewPromptShown = 0, lastAnyPromptShown = 0, now = now
        ))
    }

    @Test
    fun displayedReviewPromptRemainsUntilDismissedEvenWhenItsCooldownStarts() {
        val now = 200 * PromptPolicy.DAY_MS
        assertEquals(AppPrompt.REVIEW, PromptPolicy.selectPrompt(
            current = AppPrompt.REVIEW, consentResolved = true, updateConfirmed = false,
            lastUpdateShown = now, validatedInternet = true, offlineShownThisSession = false,
            sessions = 3, meaningfulActions = 3, lastReviewPromptShown = now,
            lastAnyPromptShown = now, now = now
        ))
    }

    @Test
    fun manySessionsWithoutMeaningfulActionsNeverTriggersCustomReview() {
        val now = 200 * PromptPolicy.DAY_MS
        for (sessions in listOf(3, 20, 100)) {
            assertFalse(
                "Session count alone must not trigger a review prompt",
                PromptPolicy.shouldShowReviewPrompt(
                    sessions, PromptPolicy.MIN_MEANINGFUL_ACTIONS_FOR_REVIEW - 1, 0, now
                )
            )
        }
    }

    @Test
    fun pendingUpdateSupersedesReviewAndConsentBlocksCurrentPrompt() {
        val now = 200 * PromptPolicy.DAY_MS
        val update = PromptPolicy.selectPrompt(
            current = AppPrompt.REVIEW, consentResolved = true, updateConfirmed = true,
            lastUpdateShown = 0, validatedInternet = true, offlineShownThisSession = false,
            sessions = 10, meaningfulActions = 10, lastReviewPromptShown = 0,
            lastAnyPromptShown = 0, now = now
        )
        assertEquals(AppPrompt.UPDATE, update)

        val blockedUntilConsentResolves = PromptPolicy.selectPrompt(
            current = AppPrompt.OFFLINE, consentResolved = false, updateConfirmed = false,
            lastUpdateShown = 0, validatedInternet = false, offlineShownThisSession = false,
            sessions = 10, meaningfulActions = 10, lastReviewPromptShown = 0,
            lastAnyPromptShown = 0, now = now
        )
        assertEquals(null, blockedUntilConsentResolves)
    }

    @Test
    fun connectivityLossReplacesReviewWithOfflinePrompt() {
        val now = 200 * PromptPolicy.DAY_MS
        val selected = PromptPolicy.selectPrompt(
            current = AppPrompt.REVIEW, consentResolved = true, updateConfirmed = false,
            lastUpdateShown = 0, validatedInternet = false, offlineShownThisSession = false,
            sessions = 5, meaningfulActions = 5, lastReviewPromptShown = 0,
            lastAnyPromptShown = 0, now = now
        )
        assertEquals(AppPrompt.OFFLINE, selected)
    }

    @Test
    fun offlineMessagePolicyUsesNetworkGuidanceForConfirmedAdSupportedUsers() {
        assertEquals(OfflineMessageVariant.AD_SUPPORTED, OfflineMessagePolicy.choose(isAdsRemoved = false, entitlementKnown = true))
    }

    @Test
    fun offlineMessagePolicyUsesOptionalSupportCopyForConfirmedAdRemoval() {
        assertEquals(OfflineMessageVariant.AD_FREE, OfflineMessagePolicy.choose(isAdsRemoved = true, entitlementKnown = true))
    }

    @Test
    fun offlineMessagePolicyDoesNotAssumeAdRemovalWhenBillingIsUnresolved() {
        assertEquals(OfflineMessageVariant.UNVERIFIED, OfflineMessagePolicy.choose(isAdsRemoved = false, entitlementKnown = false))
        assertEquals(OfflineMessageVariant.UNVERIFIED, OfflineMessagePolicy.choose(isAdsRemoved = true, entitlementKnown = false))
    }

}

`,
  },

  {
    path: 'app/src/test/java/com/utility/devoptions/ExternalActionsPolicyTest.kt',
    name: 'ExternalActionsPolicyTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from native Android and CI validation sources.',
    content: `package com.utility.devoptions
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
}`,
  },

  {
    path: 'scripts/validate_localization.py',
    name: 'validate_localization.py',
    category: 'docs',
    language: 'python',
    description: 'Offline validation for resource XML, keys, placeholders, locale policy and exporter parity.',
    content: `#!/usr/bin/env python3
"""Validate offline Android translations, locale policy and exported-resource parity."""
import json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path("."); RES=ROOT/"android/app/src/main/res"
EXPECTED={"en":"values","ru":"values-ru","hi":"values-hi","es":"values-es","fr":"values-fr","ar":"values-ar","zh-CN":"values-zh-rCN","bn":"values-bn","de":"values-de","id":"values-id","it":"values-it","ja":"values-ja","ko":"values-ko","pt-BR":"values-pt-rBR","tr":"values-tr","vi":"values-vi","kn":"values-kn","ta":"values-ta","te":"values-te"}
SAME_OK={"app_name","share_subject","language_english","language_russian","language_hindi","language_spanish","language_french","language_arabic","language_chinese","language_bengali","language_german","language_indonesian","language_italian","language_japanese","language_korean","language_portuguese","language_turkish","language_vietnamese","language_kannada","language_tamil","language_telugu","android_version_value","play_store_error_format","admob_banner_id","admob_interstitial_id"}
PH=re.compile(r"%(?:[1-9][0-9]*\\$)?[sdif]")
def fail(msg):
 print("ERROR: "+msg,file=sys.stderr); raise SystemExit(1)
def read(path):
 try: root=ET.parse(path).getroot()
 except Exception as exc: fail("Invalid XML "+str(path)+": "+str(exc))
 if root.tag!="resources": fail("Wrong resource root in "+str(path))
 out={}
 for node in root.findall("string"):
  key=node.attrib.get("name")
  if not key or key in out: fail("Missing/duplicate name in "+str(path))
  raw_text="".join(node.itertext()).strip()
  if "\\\\\\\\" in raw_text: fail("Invalid doubled backslash in Android string "+key+" at "+str(path))
  out[key]={"value":raw_text,"translatable":node.attrib.get("translatable","true")!="false"}
 return out
def exporter_content(ts,path):
 marker="\\n  {\\n    path: '"+path+"',\\n"
 mode="code"; quote=None; i=0; found=False; content_start=None
 while i<len(ts):
  ch=ts[i]
  if mode=="template":
   if ch=="\\\\": i+=2; continue
   if ch==chr(96):
    if found and content_start is not None:
     value=ts[content_start:i]; dollar=chr(36)
     value=value.replace("\\\\"+dollar+"{",dollar+"{").replace("\\\\"+chr(96),chr(96)).replace("\\\\\\\\","\\\\")
     return value
    mode="code"
   i+=1; continue
  if mode in ("single","double"):
   end_quote="'" if mode=="single" else '"'
   if ch=="\\\\": i+=2; continue
   if ch==end_quote: mode="code"
   i+=1; continue
  if mode=="linecomment":
   if ch=="\\n": mode="code"
   i+=1; continue
  if mode=="blockcomment":
   if ch=="*" and i+1<len(ts) and ts[i+1]=="/": mode="code"; i+=2
   else: i+=1
   continue
  if ch=="/" and i+1<len(ts) and ts[i+1]=="/": mode="linecomment"; i+=2; continue
  if ch=="/" and i+1<len(ts) and ts[i+1]=="*": mode="blockcomment"; i+=2; continue
  if not found and ts.startswith(marker,i): found=True
  content_marker="content: "+chr(96)
  if found and content_start is None and ts.startswith(content_marker,i):
   content_start=i+len(content_marker); mode="template"; i+=len(content_marker); continue
  if ch=="'": mode="single"; i+=1; continue
  if ch=='"': mode="double"; i+=1; continue
  if ch==chr(96): mode="template"; i+=1; continue
  i+=1
 return None
english=read(RES/"values/strings.xml"); required={k for k,v in english.items() if v["translatable"]}
ans="{http://schemas.android.com/apk/res/android}"
config=ET.parse(RES/"xml/locale_config.xml").getroot()
declared={x.attrib.get(ans+"name") for x in config.findall("locale")}
if declared!=set(EXPECTED): fail("locale_config differs from 19 advertised locales")
controller=(ROOT/"android/app/src/main/java/com/utility/devoptions/AppLanguageController.kt").read_text()
m=re.search(r"linkedSetOf\\(([^)]*)\\)",controller); policy=set(re.findall(r'"([^"]+)"',m.group(1))) if m else set()
if policy!=set(EXPECTED): fail("LanguagePolicy differs from 19 advertised locales")
screen=(ROOT/"android/app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt").read_text()
picker=set(re.findall(r'"([^"]+)"\\s+to\\s+stringResource\\(R\\.string\\.language_',screen))
if picker!=set(EXPECTED): fail("Language picker differs from 19 advertised locales")
manifest=ET.parse(ROOT/"android/app/src/main/AndroidManifest.xml").getroot().find("application")
if manifest is None or manifest.attrib.get(ans+"label")!="@string/app_name": fail("Manifest must use @string/app_name")
if manifest.attrib.get(ans+"supportsRtl")!="true": fail("supportsRtl must be true for Arabic")
if "heightIn(max = 240.dp).verticalScroll" not in screen or "heightIn(max = 280.dp).verticalScroll" not in screen: fail("Dialog text must scroll on small screens")
if "TextOverflow.Ellipsis" not in screen: fail("Long localized headings must protect against clipping")
if "BoxWithConstraints" not in screen or "LocalDensity.current.fontScale" not in screen: fail("Action controls must adapt to narrow widths and large system text")
if ".height(46.dp)" in screen or ".height(52.dp)" in screen: fail("Action buttons must not use fixed heights that clip wrapping labels")
if "OfflineMessagePolicy.choose" not in screen: fail("Offline prompt must use billing-aware copy selection")
activity=(ROOT/"android/app/src/main/java/com/utility/devoptions/MainActivity.kt").read_text()
if "UpdateAvailability.UPDATE_AVAILABLE" not in activity: fail("Update dialog must require official Play availability")
if "NET_CAPABILITY_VALIDATED" not in activity: fail("Offline notice must require validated connectivity")
if "consentUiResolved" not in activity: fail("Optional prompts must yield to UMP consent UI")
report={"locale_count":len(EXPECTED),"english_translatable_string_count":len(required),"locales":[],"translation_review_note":"Non-English resources are machine-assisted drafts; native-speaker review required before claiming professional verification."}
for tag,directory in EXPECTED.items():
 path=RES/directory/"strings.xml"
 if not path.is_file(): fail("Missing locale resource "+str(path))
 values=read(path); missing=sorted(required-set(values)); extra=sorted(set(values)-set(english))
 if missing or extra: fail(tag+" key mismatch; missing="+repr(missing)+" extra="+repr(extra))
 placeholders=[]; suspected=[]
 for key in sorted(required):
  a=english[key]["value"]; b=values[key]["value"]
  if sorted(PH.findall(a))!=sorted(PH.findall(b)): placeholders.append(key)
  if tag!="en" and key not in SAME_OK and a and a==b: suspected.append(key)
 if placeholders: fail(tag+" placeholder mismatch: "+repr(placeholders))
 if suspected: fail(tag+" suspected English fallbacks: "+repr(suspected))
 if values.get("app_name",{}).get("value")!="Developers Options Shortcut": fail(tag+" changed official product name")
 refs=set(re.findall(r"@string/([A-Za-z0-9_]+)","\\n".join(x["value"] for x in values.values())))
 if refs-set(english): fail(tag+" unresolved string references: "+repr(sorted(refs-set(english))))
 report["locales"].append({"locale":tag,"resource_directory":directory,"string_count":len(values),"translated_translatable_string_count":len(required),"missing_keys":missing,"suspected_untranslated_entries":suspected,"placeholder_errors":placeholders,"review_status":"source language" if tag=="en" else "machine-assisted draft; native-speaker review required"})
if "--check-export" in sys.argv:
 ts=(ROOT/"src/data/androidProjectFiles.ts").read_text()
 for tag,directory in EXPECTED.items():
  path="app/src/main/res/"+directory+"/strings.xml"; content=exporter_content(ts,path)
  if content is None: fail("Exporter missing "+path)
  try: exported=ET.fromstring(content)
  except Exception as exc: fail("Exporter XML invalid for "+tag+": "+str(exc))
  if {x.attrib.get("name") for x in exported.findall("string")}!=set(read(RES/directory/"strings.xml")): fail("Exported keys differ for "+tag)
  if content!=(RES/directory/"strings.xml").read_text(encoding="utf-8"): fail("Exported string content differs for "+tag)
 for native,embedded in [
 ("android/app/src/main/java/com/utility/devoptions/AppLanguageController.kt","app/src/main/java/com/utility/devoptions/AppLanguageController.kt"),
 ("android/app/src/main/java/com/utility/devoptions/MainActivity.kt","app/src/main/java/com/utility/devoptions/MainActivity.kt"),
 ("android/app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt","app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt"),
 ("android/app/src/main/java/com/utility/devoptions/AppPromptPolicy.kt","app/src/main/java/com/utility/devoptions/AppPromptPolicy.kt"),
 ("android/app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt","app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt"),
 ("android/app/src/androidTest/java/com/utility/devoptions/MainScreenUiTest.kt","app/src/androidTest/java/com/utility/devoptions/MainScreenUiTest.kt"),
 ("android/app/src/test/java/com/utility/devoptions/PromptPolicyTest.kt","app/src/test/java/com/utility/devoptions/PromptPolicyTest.kt"),
 ("scripts/validate_localization.py","scripts/validate_localization.py"),
 (".github/workflows/android-validation.yml",".github/workflows/android-validation.yml"),
 ("scripts/validate_icons.py","scripts/validate_icons.py"),
 ("android/app/src/main/java/com/utility/devoptions/util/ExternalActions.kt","app/src/main/java/com/utility/devoptions/util/ExternalActions.kt"),
 ("android/app/src/main/java/com/utility/devoptions/util/IntentHelper.kt","app/src/main/java/com/utility/devoptions/util/IntentHelper.kt"),
 ("android/app/src/main/java/com/utility/devoptions/ads/AdManager.kt","app/src/main/java/com/utility/devoptions/ads/AdManager.kt"),
 ("android/app/build.gradle.kts","app/build.gradle.kts"),
 ("android/gradle/libs.versions.toml","gradle/libs.versions.toml")]:
  value=exporter_content(ts,embedded)
  if value is None: fail("Exporter missing "+embedded)
  if value!=(ROOT/native).read_text(encoding="utf-8"): fail("Exporter differs from native source "+embedded)
 report["export_sync"]="19 resource sets and prompt/policy/build sources synchronized"
report["total_localized_string_entries"]=sum(x["string_count"] for x in report["locales"])
print(json.dumps(report,ensure_ascii=False,indent=2))
outfile=next((sys.argv[i+1] for i,arg in enumerate(sys.argv[:-1]) if arg=="--report"),None)
if outfile: Path(outfile).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
`,
  },
  {
    path: 'scripts/validate_icons.py',
    name: 'validate_icons.py',
    category: 'scripts',
    language: 'python',
    description: 'Decode-check launcher PNGs and the 512 × 512 Play Store listing icon.',
    content: `#!/usr/bin/env python3
"""Decode-check Android launcher artwork and the Google Play listing icon."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError as exc:
    print("ERROR: Pillow is required for image decode validation.", file=sys.stderr)
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "{http://schemas.android.com/apk/res/android}"
PLAY_ICON = Path("public/android-icons/playstore-icon-512.png")
ASSETS = [
    Path("android/app/src/main/res/drawable-nodpi/ic_app_logo.png"),
    Path("android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png"),
    Path("public/android-icons/adaptive-foreground.png"),
    Path("public/android-icons/ic_launcher-mdpi.png"),
    Path("public/android-icons/ic_launcher-hdpi.png"),
    Path("public/android-icons/ic_launcher-xhdpi.png"),
]
for density in ("mdpi", "hdpi", "xhdpi"):
    ASSETS.extend([
        Path(f"android/app/src/main/res/mipmap-{density}/ic_launcher.png"),
        Path(f"android/app/src/main/res/mipmap-{density}/ic_launcher_round.png"),
    ])

def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)

def validate_png(relative_path: Path) -> tuple[int, int]:
    path = ROOT / relative_path
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"Missing or empty icon asset: {relative_path}")
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                fail(f"Expected PNG format: {relative_path}; found {image.format}")
            dimensions = image.size
            image.verify()
        with Image.open(path) as image:
            image.load()
            if image.size != dimensions:
                fail(f"Inconsistent image dimensions after decode: {relative_path}")
            if image.width != image.height:
                fail(f"Icon image must be square: {relative_path} ({image.width}x{image.height})")
    except Exception as exc:
        fail(f"Image decode failed for {relative_path}: {exc}")
    print(f"PASS image {relative_path}: {dimensions[0]}x{dimensions[1]} PNG decoded")
    return dimensions

for asset in ASSETS:
    validate_png(asset)
play_width, play_height = validate_png(PLAY_ICON)
if (play_width, play_height) != (512, 512):
    fail(f"Play Store listing icon must be 512x512; found {play_width}x{play_height}")

manifest = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
application = manifest.find("application")
if application is None:
    fail("Manifest has no application element")
if application.attrib.get(ANDROID_NS + "label") != "@string/app_name":
    fail("Launcher label must reference @string/app_name")
if application.attrib.get(ANDROID_NS + "icon") != "@mipmap/ic_launcher":
    fail("Manifest launcher icon must reference @mipmap/ic_launcher")
if application.attrib.get(ANDROID_NS + "roundIcon") != "@mipmap/ic_launcher_round":
    fail("Manifest round icon must reference @mipmap/ic_launcher_round")
if application.attrib.get(ANDROID_NS + "supportsRtl") != "true":
    fail("RTL support must remain enabled")
for adaptive_path in (
    ROOT / "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    ROOT / "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
):
    try:
        root = ET.parse(adaptive_path).getroot()
    except Exception as exc:
        fail(f"Invalid adaptive icon XML {adaptive_path}: {exc}")
    if not root.tag.endswith("adaptive-icon"):
        fail(f"Unexpected adaptive icon root in {adaptive_path}: {root.tag}")
    refs = {child.attrib.get(ANDROID_NS + "drawable") for child in list(root)}
    if not refs or any(not ref for ref in refs):
        fail(f"Adaptive icon has a missing drawable reference: {adaptive_path}")
    print(f"PASS adaptive icon XML: {adaptive_path.relative_to(ROOT)}")
print("PASS manifest app name/icon references and RTL support")
`,
  },

  {
    path: 'docs/LOCALIZATION_ROADMAP.md',
    name: 'LOCALIZATION_ROADMAP.md',
    category: 'docs',
    language: 'markdown',
    description: 'Localization status, quality review policy and future expansion plan.',
    content: `# Localization roadmap — Developers Options Shortcut

## Delivered stage: 16 bundled Android UI locales

English, Russian, Hindi, Spanish, French, Arabic, Simplified Chinese, Bengali, German, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Turkish and Vietnamese are present as offline Android resource folders.

**Translation quality:** all non-English text is machine-assisted draft translation. Automated checks cover XML syntax, key coverage, placeholder parity, unresolved string references, likely copied-English entries and exported-resource parity. They do not certify idiomatic wording, cultural fit or accessibility. Native-speaker review is required before calling translations professionally verified.

No translation service, API key, billing account, runtime translation SDK or translation network request is required. Translations are bundled Android resources.

Google Play listing languages and Android UI locales are separate. A translated store listing does not translate the installed application. Keep listing assets independently audited.

## Planned stage 2: target approximately 50–60 Android UI languages

This list is planning only; these languages are not advertised and must not be added to the picker or locale configuration until complete resources pass validation. Google's published ML Kit language coverage is used as a discovery reference, not as a translation engine or quality guarantee.

Afrikaans (af), Amharic (am), Azerbaijani (az), Belarusian (be), Bulgarian (bg), Bosnian (bs), Catalan (ca), Cebuano (ceb), Czech (cs), Danish (da), Dutch (nl), Estonian (et), Filipino (fil), Finnish (fi), Greek (el), Gujarati (gu), Hebrew (he), Hausa (ha), Croatian (hr), Hungarian (hu), Armenian (hy), Icelandic (is), Irish (ga), Javanese (jv), Kannada (kn), Kazakh (kk), Khmer (km), Lao (lo), Lithuanian (lt), Latvian (lv), Macedonian (mk), Malayalam (ml), Malay (ms), Marathi (mr), Burmese (my), Nepali (ne), Norwegian (no), Punjabi (pa), Persian (fa), Polish (pl), Romanian (ro), Serbian (sr), Sinhala (si), Slovak (sk), Slovenian (sl), Swahili (sw), Swedish (sv), Tamil (ta), Telugu (te), Thai (th), Ukrainian (uk), Urdu (ur), Welsh (cy), Zulu (zu), Yoruba (yo), Igbo (ig), Pashto (ps), and Albanian (sq).

Before advertising a future locale: translate every user-facing string including update/offline/review/share text; preserve placeholders and the fixed Play listing URL; check XML, resource references, regional/script fallback, persistence and RTL where applicable; inspect text clipping; record native-speaker review status; and run the same validator and Android tests.
`,
  },

  {
    path: 'docs/LOCALIZATION_INVENTORY.md',
    name: 'LOCALIZATION_INVENTORY.md',
    category: 'docs',
    language: 'markdown',
    description: 'Localization status, quality review policy and future expansion plan.',
    content: `# Localization inventory and review policy

The installed app's supported language set is determined by bundled Android res/values-* strings.xml files, AppLanguageController, the picker and locale_config.xml. Play Store listing translations do not provide installed-app UI translations.

CI generates a per-locale report containing string count, missing keys, suspected untranslated values, placeholder errors and review status. The 16-language stage is bundled at development time without paid translation services or runtime translation SDKs. All non-English translations remain machine-assisted drafts until native-speaker review is complete. The larger language list in LOCALIZATION_ROADMAP.md is a future plan, not current advertised support.
`,
  },

  {
    path: 'docs/locale-coverage.json',
    name: 'locale-coverage.json',
    category: 'docs',
    language: 'json',
    description: 'Per-locale counts, missing keys, fallback checks and review status.',
    content: `{
  "locale_count": 16,
  "english_translatable_string_count": 121,
  "locales": [
    {
      "locale": "en",
      "resource_directory": "values",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "source language"
    },
    {
      "locale": "ru",
      "resource_directory": "values-ru",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "hi",
      "resource_directory": "values-hi",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "es",
      "resource_directory": "values-es",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "fr",
      "resource_directory": "values-fr",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "ar",
      "resource_directory": "values-ar",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "zh-CN",
      "resource_directory": "values-zh-rCN",
      "string_count": 121,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "bn",
      "resource_directory": "values-bn",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "de",
      "resource_directory": "values-de",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "id",
      "resource_directory": "values-id",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "it",
      "resource_directory": "values-it",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "ja",
      "resource_directory": "values-ja",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "ko",
      "resource_directory": "values-ko",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "pt-BR",
      "resource_directory": "values-pt-rBR",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "tr",
      "resource_directory": "values-tr",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    },
    {
      "locale": "vi",
      "resource_directory": "values-vi",
      "string_count": 123,
      "translated_translatable_string_count": 121,
      "missing_keys": [],
      "suspected_untranslated_entries": [],
      "placeholder_errors": [],
      "review_status": "machine-assisted draft; native-speaker review required"
    }
  ],
  "translation_review_note": "Non-English text is machine-assisted draft translation; native-speaker review required.",
  "total_localized_string_entries": 1956
}
`,
  },

];
