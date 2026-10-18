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
  contents: write

jobs:
  build:
    name: Build & Release Debug APK
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Set up Gradle 8.10.2
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

      - name: Run standard unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          export ANDROID_HOME=/usr/local/lib/android/sdk
          gradle testDebugUnitTest --stacktrace --no-daemon

      - name: Build debug APK
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          export ANDROID_HOME=/usr/local/lib/android/sdk
          gradle assembleDebug --stacktrace --no-daemon

      - name: Verify APK
        run: |
          test -s android/app/build/outputs/apk/debug/app-debug.apk

      - name: Upload debug APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk

      - name: Prepare APK release asset
        id: prepare_asset
        run: |
          mkdir -p /tmp/apk_release
          cp android/app/build/outputs/apk/debug/app-debug.apk /tmp/apk_release/app-debug.apk
          echo "apk_path=/tmp/apk_release/app-debug.apk" >> "$GITHUB_OUTPUT"

      - name: Publish APK to GitHub Releases
        id: publish_release
        continue-on-error: true
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          TAG_NAME="v1.0.\${{ github.run_number }}"
          gh release create "$TAG_NAME" "/tmp/apk_release/app-debug.apk" \\
            --title "Debug APK Build #\${{ github.run_number }}" \\
            --target "\${{ github.sha }}" \\
            --latest \\
            --notes "Automated debug APK build for testing."
`
  },
  {
    path: '.github/workflows/android-validation.yml',
    name: 'android-validation.yml',
    category: 'ci',
    language: 'yaml',
    description: 'PR validation for localization coverage, release candidate metadata, native symbols and existing security components.',
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

permissions:
  contents: read

jobs:
  validate:
    name: Android tests, locale coverage and API 21 diagnostic
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

      - name: Check locale resources and format placeholders
        shell: bash
        run: |
          set -euo pipefail
          python3 - <<'PY'
          import re
          import xml.etree.ElementTree as ET
          from pathlib import Path

          res = Path("android/app/src/main/res")
          base_root = ET.parse(res / "values/strings.xml").getroot()
          base = {
              node.attrib["name"]: node.text or ""
              for node in base_root.findall("string")
              if node.attrib.get("translatable", "true") != "false"
          }
          locales = {
              "en": ("values/strings.xml", "full"),
              "ru": ("values-ru/strings.xml", "full"),
              "hi": ("values-hi/strings.xml", "full"),
              "es": ("values-es/strings.xml", "full"),
              "fr": ("values-fr/strings.xml", "full"),
              "ar": ("values-ar/strings.xml", "full"),
              "zh-CN": ("values-zh-rCN/strings.xml", "full"),
              "bn": ("values-bn/strings.xml", "partial"),
              "de": ("values-de/strings.xml", "partial"),
              "id": ("values-id/strings.xml", "partial"),
              "it": ("values-it/strings.xml", "partial"),
              "ja": ("values-ja/strings.xml", "partial"),
              "ko": ("values-ko/strings.xml", "partial"),
              "pt-BR": ("values-pt-rBR/strings.xml", "partial"),
              "tr": ("values-tr/strings.xml", "partial"),
              "vi": ("values-vi/strings.xml", "partial"),
          }
          labels = {
              "language_english", "language_russian", "language_hindi", "language_spanish",
              "language_french", "language_arabic", "language_chinese", "language_bengali",
              "language_german", "language_indonesian", "language_italian", "language_japanese",
              "language_korean", "language_portuguese", "language_turkish", "language_vietnamese",
          }
          partial_core = labels | {
              "app_name", "open_dev_options", "dev_options_status", "usb_debugging_status",
              "select_language", "language_picker_title", "language_system_default", "done",
              "language_suggestion_title", "language_suggestion_message",
              "language_switch_to_suggested", "language_continue_english", "about_phone",
              "open_about_phone", "wireless_debugging", "usb_debugging",
          }
          android_ns = "{http://schemas.android.com/apk/res/android}"
          config = ET.parse(res / "xml/locale_config.xml").getroot()
          declared = {item.attrib.get(android_ns + "name") for item in config.findall("locale")}
          if declared != set(locales):
              raise SystemExit(f"locale_config mismatch: {sorted(declared ^ set(locales))}")
          placeholder = re.compile(r"%[1-9][0-9]*\\$[sdif]")
          for tag, (relative, coverage) in locales.items():
              path = res / relative
              if not path.is_file():
                  raise SystemExit(f"Missing resource file for {tag}")
              root = ET.parse(path).getroot()
              values = {item.attrib["name"]: item.text or "" for item in root.findall("string")}
              required = set(base) if coverage == "full" else partial_core
              missing = sorted(required - values.keys())
              if missing:
                  raise SystemExit(f"{tag} missing keys: {', '.join(missing)}")
              if values.get("app_name") != "Developers Options Shortcut":
                  raise SystemExit(f"{tag} app_name mismatch")
              for key, value in values.items():
                  if key in base and sorted(placeholder.findall(base[key])) != sorted(placeholder.findall(value)):
                      raise SystemExit(f"{tag} placeholder mismatch for {key}")
              print(f"{tag}: {coverage} coverage, {len(values)} strings checked")
          manifest = ET.parse("android/app/src/main/AndroidManifest.xml").getroot()
          application = manifest.find("application")
          if application is None or application.attrib.get(android_ns + "label") != "@string/app_name":
              raise SystemExit("Manifest label must reference @string/app_name")
          PY

      - name: Check AdMob, UMP and encrypted billing remain configured
        shell: bash
        run: |
          set -euo pipefail
          grep -Fq 'com.google.android.gms.ads.APPLICATION_ID' android/app/src/main/AndroidManifest.xml
          grep -Fq 'ca-app-pub-4783826505860771~9544574215' android/app/src/main/AndroidManifest.xml
          grep -Fq 'com.google.android.ump' android/gradle/libs.versions.toml
          grep -Fq 'EncryptedSharedPreferences' android/app/src/main/java/com/utility/devoptions/data/billing/BillingManager.kt
          grep -Fq 'UserMessagingPlatform.loadAndShowConsentFormIfRequired' android/app/src/main/java/com/utility/devoptions/ads/AdManager.kt

      - name: Provision pinned Android NDK
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          SDKMANAGER="$(find "$ANDROID_HOME/cmdline-tools" -type f -name sdkmanager | sort | tail -n1)"
          test -x "$SDKMANAGER"
          set +o pipefail
          yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/tmp/sdk-licenses.log 2>&1
          set -o pipefail
          "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "ndk;27.2.12479018"
          test -x "$ANDROID_HOME/ndk/27.2.12479018/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip"

      - name: Run clean JVM tests and build unsigned candidate
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          gradle clean testDebugUnitTest testReleaseUnitTest :app:bundleRelease :app:assembleRelease --info --stacktrace --no-daemon 2>&1 | tee /tmp/android-release-candidate.log

      - name: Verify built metadata and native-symbol status
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          APK_FILE="$(find android/app/build/outputs/apk/release -type f -name '*.apk' -print -quit)"
          test -s "$AAB_FILE"
          test -s "$APK_FILE"
          BUNDLETOOL_VERSION=1.18.3
          curl -fsSL "https://github.com/google/bundletool/releases/download/\${BUNDLETOOL_VERSION}/bundletool-all-\${BUNDLETOOL_VERSION}.jar" -o /tmp/bundletool.jar
          java -jar /tmp/bundletool.jar dump manifest --bundle="$AAB_FILE" --module=base > /tmp/aab-manifest.xml
          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionName="1.0.4"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionCode="20261019"' /tmp/aab-manifest.xml
          grep -Fq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          "$AAPT" dump badging "$APK_FILE" | grep -F "application-label:'Developers Options Shortcut'"
          FRAGMENT="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version | tr -d '\\r\\n' || true)"
          test "$FRAGMENT" = "1.8.9"
          LIBS="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+\\.so$' || true)"
          SYMBOLS="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com\\.android\\.tools\\.build\\.debugsymbols/[^/]+/[^/]+\\.(dbg|sym)$' || true)"
          : > /tmp/native-symbol-report.txt
          missing=0
          while IFS= read -r lib; do
            [[ -n "$lib" ]] || continue
            rest="\${lib#base/lib/}"
            abi="\${rest%%/*}"
            name="\${rest#*/}"
            stem="\${name%.so}"
            dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
            found=0
            for candidate in "$stem.dbg" "$stem.sym" "$name.dbg" "$name.sym"; do
              if grep -Fxq "$dir/$candidate" <<< "$SYMBOLS"; then found=1; break; fi
            done
            if [[ "$found" -eq 0 ]]; then
              if [[ "$name" == "libandroidx.graphics.path.so" ]] && grep -Fq "native debug metadata has already been stripped" /tmp/android-release-candidate.log; then
                echo "UNRESOLVED: pre-stripped dependency symbols unavailable: $lib" | tee -a /tmp/native-symbol-report.txt
              else
                echo "::error::Missing matching native symbols for $lib."
                missing=1
              fi
            fi
          done <<< "$LIBS"
          if [[ "$missing" -ne 0 ]]; then exit 1; fi
          if [[ ! -s /tmp/native-symbol-report.txt ]]; then echo "All packaged native libraries have matching symbol entries." > /tmp/native-symbol-report.txt; fi
          mkdir -p /tmp/release-candidate
          cp "$AAB_FILE" /tmp/release-candidate/unsigned-release-candidate-v1.0.4.aab
          cp /tmp/aab-manifest.xml /tmp/release-candidate/
          cp /tmp/native-symbol-report.txt /tmp/release-candidate/

      - name: Probe API 21 compatibility without changing release minimum
        shell: bash
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: |
          set -euo pipefail
          rm -rf /tmp/android-api21-probe
          mkdir -p /tmp/android-api21-probe
          rsync -a --exclude=build --exclude=.gradle android/ /tmp/android-api21-probe/
          sed -i 's/minSdk = 24/minSdk = 21/' /tmp/android-api21-probe/app/build.gradle.kts
          cd /tmp/android-api21-probe
          set +e
          gradle :app:processDebugMainManifest :app:lintDebug :app:assembleDebug --info --stacktrace --no-daemon 2>&1 | tee /tmp/api21-probe.log
          result=$?
          set -e
          if [[ "$result" -eq 0 ]]; then
            echo "API 21 diagnostic build passed; shipping minSdk remains 24 pending Automatic Protection decision." | tee /tmp/api21-result.txt
          else
            echo "::warning::API 21 diagnostic build did not pass; shipping minSdk remains 24 pending review."
            grep -Ei 'minSdk|NewApi|requires.*API|manifest merger failed|error:' /tmp/api21-probe.log | tail -80 > /tmp/api21-result.txt || true
          fi
          cp /tmp/api21-probe.log /tmp/release-candidate/
          cp /tmp/api21-result.txt /tmp/release-candidate/

      - name: Upload unsigned candidate and diagnostics
        uses: actions/upload-artifact@v4
        with:
          name: unsigned-release-candidate-v1.0.4
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
      - fix/release-fragment-localization-2026-10-18
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
    name: Unit tests, Fragment version, and AAB metadata
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 8.10.2
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

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

      - name: Build release AAB without signing secrets
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle bundleRelease --stacktrace --no-daemon

      - name: Inspect actual AAB package and Fragment metadata
        shell: bash
        run: |
          set -euo pipefail
          AAB_FILE="$(find android/app/build/outputs/bundle/release -type f -name '*.aab' -print -quit)"
          if [[ -z "$AAB_FILE" || ! -s "$AAB_FILE" ]]; then
            echo "::error::Release AAB is missing or empty."
            exit 1
          fi

          BUNDLETOOL_VERSION="1.18.3"
          curl -fsSL "https://github.com/google/bundletool/releases/download/\${BUNDLETOOL_VERSION}/bundletool-all-\${BUNDLETOOL_VERSION}.jar" -o /tmp/bundletool.jar
          java -jar /tmp/bundletool.jar dump manifest --bundle="$AAB_FILE" --module=base > /tmp/aab-manifest.xml
          if ! grep -Eq 'package="com\.utility\.devoptions"' /tmp/aab-manifest.xml; then
            echo "::error::Decoded AAB manifest does not declare package com.utility.devoptions."
            exit 1
          fi
          if ! grep -Fq 'android:versionName="1.0.4"' /tmp/aab-manifest.xml || ! grep -Fq 'android:versionCode="20261019"' /tmp/aab-manifest.xml; then
            echo "::error::Decoded AAB manifest does not contain the expected 1.0.4 / 20261019 version."
            exit 1
          fi
          if ! grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml; then
            echo "::error::Decoded AAB manifest must declare minSdkVersion 24 or higher."
            grep -o 'android:minSdkVersion="[^"]*"' /tmp/aab-manifest.xml || true
            exit 1
          fi
          PACKAGE_NAME="com.utility.devoptions"
          echo "Verified decoded AAB manifest: package=$PACKAGE_NAME minSdkVersion=24 versionName=1.0.4 versionCode=20261019"

          FRAGMENT_VERSION="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version 2>/dev/null | tr -d '\r\n' || true)"
          echo "Fragment version embedded in AAB: \${FRAGMENT_VERSION:-<missing>}"
          if [[ "$FRAGMENT_VERSION" != "1.8.9" || "$FRAGMENT_VERSION" == "1.1.0" ]]; then
            echo "::error::Expected actual AAB to embed androidx.fragment:fragment 1.8.9, never 1.1.0."
            exit 1
          fi
          echo "AAB package and dependency metadata checks passed. Signing is intentionally verified only in the protected main-branch release workflow."
`,
  },
  {
    path: '.github/workflows/build-release-aab.yml',
    name: 'build-release-aab.yml',
    category: 'docs',
    language: 'yaml',
    description: 'Automated GitHub Actions workflow building and signing production release AAB for Google Play Console',
    content: `name: Build & Sign Release AAB

# Deliberately manual. A new signed release is blocked until the SDK/protection choice
# and the next unique version/tag are approved and this workflow's expected metadata is updated.
on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    name: Test, inspect, sign, and publish App Bundle
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Gradle 8.10.2
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

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

      - name: Prevent reuse of the already-published v1.0.4 tag
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          set -euo pipefail
          if gh release view release-v1.0.4 --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "::error::release-v1.0.4 already exists. Approve the minSdk/Automatic Protection trade-off, select a higher unused version code, and update every metadata/tag expectation before signing."
            exit 1
          fi

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
          } >> "$GITHUB_ENV"
          echo "Existing configured upload key and alias are accessible; credential values were not printed."

      - name: Run clean debug and release JVM unit tests
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle clean testDebugUnitTest testReleaseUnitTest --max-workers=1 --stacktrace --no-daemon

      - name: Verify resolved Fragment dependency
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        shell: bash
        run: |
          set -euo pipefail
          gradle :app:dependencyInsight --dependency androidx.fragment:fragment --configuration releaseRuntimeClasspath --console=plain | tee /tmp/fragment-release-dependency.txt
          if ! grep -Eq 'androidx\.fragment:fragment:1\.8\.9([[:space:]]|$)' /tmp/fragment-release-dependency.txt; then
            echo "::error::Expected androidx.fragment:fragment 1.8.9 in releaseRuntimeClasspath."
            exit 1
          fi
          if grep -Eq 'androidx\.fragment:fragment:1\.1\.0([[:space:]]|$)' /tmp/fragment-release-dependency.txt &&
             ! grep -Eq 'androidx\.fragment:fragment:1\.1\.0[[:space:]]+->[[:space:]]+1\.8\.9' /tmp/fragment-release-dependency.txt; then
            echo "::error::Fragment 1.1.0 remains selected in the release dependency graph."
            exit 1
          fi
          echo "Release dependency graph selects Fragment 1.8.9."

      - name: Build AAB and APK using existing upload key
        working-directory: android
        env:
          ANDROID_HOME: /usr/local/lib/android/sdk
        run: gradle :app:bundleRelease :app:assembleRelease --info --stacktrace --no-daemon 2>&1 | tee /tmp/signed-release-build.log

      - name: Verify built bundle metadata, symbols and upload signature
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
          BUNDLETOOL_VERSION=1.18.3
          curl -fsSL "https://github.com/google/bundletool/releases/download/\${BUNDLETOOL_VERSION}/bundletool-all-\${BUNDLETOOL_VERSION}.jar" -o /tmp/bundletool.jar
          java -jar /tmp/bundletool.jar dump manifest --bundle="$AAB_FILE" --module=base > /tmp/aab-manifest.xml
          grep -Fq 'package="com.utility.devoptions"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionName="1.0.4"' /tmp/aab-manifest.xml
          grep -Fq 'android:versionCode="20261019"' /tmp/aab-manifest.xml
          grep -Eq 'android:minSdkVersion="24"' /tmp/aab-manifest.xml
          echo "Built AAB metadata verified: package=com.utility.devoptions minSdk=24 versionName=1.0.4 versionCode=20261019"
          AAPT="$(find "$ANDROID_HOME/build-tools" -type f -name aapt | sort | tail -n1)"
          test -x "$AAPT"
          "$AAPT" dump badging "$APK_FILE" | grep -F "application-label:'Developers Options Shortcut'"
          FRAGMENT="$(unzip -p "$AAB_FILE" base/root/META-INF/androidx.fragment_fragment.version | tr -d '\r\n' || true)"
          if [[ "$FRAGMENT" != "1.8.9" ]]; then
            echo "::error::Expected Fragment metadata 1.8.9 but got \${FRAGMENT:-<missing>}."
            exit 1
          fi
          echo "AAB Fragment metadata verified: $FRAGMENT"

          expected_sha256="$(keytool -list -v -keystore "$KEYSTORE_PATH" -storepass "$KEYSTORE_PASSWORD" -alias "$KEY_ALIAS" | awk '/SHA256:/{print $2; exit}' | tr -d ':')"
          test -n "$expected_sha256"
          if ! jarsigner -verify "$AAB_FILE" >/tmp/jarsigner-verify.txt 2>&1; then
            echo "::error::AAB signature verification failed."
            cat /tmp/jarsigner-verify.txt
            exit 1
          fi
          actual_sha256="$(keytool -printcert -jarfile "$AAB_FILE" | awk '/SHA256:/{print $2; exit}' | tr -d ':')"
          if [[ -z "$actual_sha256" || "$expected_sha256" != "$actual_sha256" ]]; then
            echo "::error::AAB signer does not match the existing upload certificate."
            exit 1
          fi
          echo "AAB signature matches the configured existing upload certificate."

          native_libs="$(unzip -Z1 "$AAB_FILE" | grep -E '^base/lib/[^/]+/[^/]+\.so$' || true)"
          symbol_files="$(unzip -Z1 "$AAB_FILE" | grep -E '^BUNDLE-METADATA/com\.android\.tools\.build\.debugsymbols/[^/]+/[^/]+\.(dbg|sym)$' || true)"
          if [[ -n "$native_libs" ]]; then
            if [[ -z "$symbol_files" ]]; then
              echo "::error::Native libraries are packaged but the AAB contains no FULL native debug symbol entries."
              exit 1
            fi
            missing=0
            while IFS= read -r lib; do
              [[ -n "$lib" ]] || continue
              rest="\${lib#base/lib/}"
              abi="\${rest%%/*}"
              filename="\${rest#*/}"
              stem="\${filename%.so}"
              symbol_dir="BUNDLE-METADATA/com.android.tools.build.debugsymbols/$abi"
              found=0
              for candidate in "$stem.dbg" "$stem.sym" "$filename.dbg" "$filename.sym"; do
                if grep -Fxq "$symbol_dir/$candidate" <<< "$symbol_files"; then found=1; break; fi
              done
              if [[ "$found" -ne 1 ]]; then
                echo "::error::No matching native symbol metadata for $lib."
                missing=1
              fi
            done <<< "$native_libs"
            if [[ "$missing" -ne 0 ]]; then
              echo "::error::A packaged native library is missing a matching symbol file. Release blocked."
              exit 1
            fi
            printf '%s\n' "$native_libs" | sort -u
            printf '%s\n' "$symbol_files" | sort -u
          else
            echo "No native shared libraries packaged in the AAB."
          fi

          SYMBOL_ZIP="$(find android/app/build/outputs/native-debug-symbols/release -type f -name 'native-debug-symbols.zip' -print -quit 2>/dev/null || true)"
          if [[ -n "$SYMBOL_ZIP" && -s "$SYMBOL_ZIP" ]]; then
            symbol_bytes="$(stat -c '%s' "$SYMBOL_ZIP")"
            echo "Native symbols ZIP bytes: $symbol_bytes"
            if (( symbol_bytes > 1600000000 )); then
              echo "::error::Native symbols ZIP exceeds Play's 1.6 GB limit."
              exit 1
            fi
          else
            echo "No standalone symbols ZIP exported; bundle metadata was checked directly."
          fi
          echo "AAB_SIZE_BYTES=$(stat -c '%s' "$AAB_FILE")"
          echo "AAB_SHA256=$(sha256sum "$AAB_FILE" | awk '{print $1}')"
          mkdir -p /tmp/aab_release
          cp "$AAB_FILE" /tmp/aab_release/Developers-Options-Shortcut-v1.0.4.aab
          test -s /tmp/aab_release/Developers-Options-Shortcut-v1.0.4.aab

      - name: Upload signed AAB workflow artifact
        uses: actions/upload-artifact@v4
        with:
          name: signed-release-aab-v1.0.4
          path: /tmp/aab_release/Developers-Options-Shortcut-v1.0.4.aab
          if-no-files-found: error
          retention-days: 30

      - name: Publish verified AAB to GitHub Release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          set -euo pipefail
          TAG_NAME=release-v1.0.4
          ASSET=/tmp/aab_release/Developers-Options-Shortcut-v1.0.4.aab
          test -s "$ASSET"
          if gh release view "$TAG_NAME" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            echo "::error::Release tag $TAG_NAME already exists. Refusing to overwrite an existing release asset."
            exit 1
          fi
          gh release create "$TAG_NAME" "$ASSET" --repo "$GITHUB_REPOSITORY" \
            --title "Developers Options Shortcut v1.0.4 — Signed AAB" \
            --target "\${{ github.sha }}" \
            --notes "Signed AAB for manual Google Play Console upload. Package, version, minimum SDK, Fragment metadata, native symbols, and existing upload signature were verified. No Play Console upload or rollout performed."
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
appcompat = "1.7.1"
fragment = "1.8.9"
lifecycleRuntimeKtx = "2.8.7"
activityCompose = "1.9.3"
composeBom = "2024.11.00"
material3 = "1.3.1"
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
android.suppressUnsupportedCompileSdk=36
`
  },
  {
    path: 'app/build.gradle.kts',
    name: 'app/build.gradle.kts',
    category: 'gradle',
    language: 'kotlin',
    description: 'App module configuration: compileSdk 36, minSdk 21, Compose, Play Billing 8.0.0, AdMob 23.6.0, and standard testing dependencies',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.utility.devoptions"
    compileSdk = 36
    ndkVersion = "27.2.12479018"

    defaultConfig {
        applicationId = "com.utility.devoptions"
        minSdk = 24
        targetSdk = 36
        versionCode = 20261019
        versionName = "1.0.4"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("RELEASE_KEYSTORE_PATH")
            if (!keystorePath.isNullOrEmpty() && file(keystorePath).exists()) {
                storeFile = file(keystorePath)
                System.getenv("RELEASE_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() }?.let { storePassword = it }
                System.getenv("RELEASE_KEY_ALIAS")?.takeIf { it.isNotBlank() }?.let { keyAlias = it }
                System.getenv("RELEASE_KEY_PASSWORD")?.takeIf { it.isNotBlank() }?.let { keyPassword = it }
            }
        }
    }

    buildTypes {
        release {
            val releaseSigning = signingConfigs.findByName("release")
            if (releaseSigning?.storeFile?.exists() == true) {
                signingConfig = releaseSigning
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
    implementation(libs.androidx.appcompat)
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
    description: 'ComponentActivity with edge-to-edge, Google Play Billing integration, AdMob preloading, and ad removal',
    content: `package com.utility.devoptions

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
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
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private val viewModel: DeveloperOptionsViewModel by viewModels()
    private lateinit var adManager: AdManager
    private lateinit var billingManager: BillingManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        lifecycle.addObserver(viewModel)

        billingManager = BillingManager(applicationContext)
        adManager = AdManager(applicationContext)
        adManager.setAdsRemoved(billingManager.isAdsRemoved.value)
        adManager.initializeConsentAndAds(this)

        setContent {
            DevOptionsTheme {
                val uiState by viewModel.uiState.collectAsState()
                val isAdsRemoved by billingManager.isAdsRemoved.collectAsState()
                val snackbarHostState = remember { SnackbarHostState() }
                val coroutineScope = rememberCoroutineScope()
                var showEnablementGuide by remember { mutableStateOf(false) }
                var selectedLanguageTag by remember {
                    mutableStateOf(AppLanguageController.currentLanguageTag(this@MainActivity))
                }
                var suggestedLanguageTag by remember {
                    mutableStateOf(AppLanguageController.pendingSuggestion(this@MainActivity))
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
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openDeveloperOptions(this@MainActivity))
                        }
                    },
                    onOpenUsbDebugging = {
                        viewModel.incrementClickCount()
                        adManager.handleActionClick(this@MainActivity) {
                            handleOpenResult(IntentHelper.openUsbDebugging(this@MainActivity))
                        }
                    },
                    onOpenWirelessDebugging = {
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
                        viewModel.refreshAll()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar(getString(R.string.status_updated))
                        }
                    }
                )
            }
        }
    }

    override fun onDestroy() {
        lifecycle.removeObserver(viewModel)
        super.onDestroy()
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
    private var isAdsRemoved: Boolean = false
    private val isMobileAdsInitializeCalled = AtomicBoolean(false)

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
     * Initializes UMP (User Messaging Platform) for GDPR/ePrivacy compliance,
     * and initializes MobileAds on consent completion.
     */
    fun initializeConsentAndAds(activity: Activity, onReady: () -> Unit = {}) {
        if (isAdsRemoved) {
            Log.d(TAG, "Ads already removed. Skipping ad consent and initialization.")
            onReady()
            return
        }

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
                    if (consentInformation.canRequestAds() && !isAdsRemoved) {
                        initializeMobileAds(onReady)
                    }
                }
            },
            { requestConsentError ->
                Log.w(TAG, "Consent request error: \${requestConsentError.message}")
                if (consentInformation.canRequestAds() && !isAdsRemoved) {
                    initializeMobileAds(onReady)
                }
            }
        )

        // Safety fallback: if consent already given previously
        if (consentInformation.canRequestAds() && !isAdsRemoved) {
            initializeMobileAds(onReady)
        }
    }

    private fun initializeMobileAds(onReady: () -> Unit) {
        if (isAdsRemoved || isMobileAdsInitializeCalled.getAndSet(true)) {
            return
        }
        MobileAds.initialize(context) { status ->
            Log.d(TAG, "MobileAds initialized: \$status")
            if (!isAdsRemoved) {
                preloadInterstitial()
            }
            onReady()
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
`
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
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * BillingManager handles Google Play Billing (com.android.billingclient:billing-ktx:8.0.0).
 * Provides one-time in-app purchase to permanently remove all banner & interstitial ads.
 * State is encrypted and persisted locally via EncryptedSharedPreferences (AES256).
 */
class BillingManager(
    private val context: Context,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) : PurchasesUpdatedListener {

    companion object {
        private const val TAG = "BillingManager"
        const val PRODUCT_ID_REMOVE_ADS = "remove_ads_permanent"
        private const val PREFS_FILE = "secure_devoptions_billing_prefs"
        private const val KEY_ADS_REMOVED = "key_ads_removed_permanently"
    }

    private val prefs: SharedPreferences by lazy {
        initSecurePreferences()
    }

    private val _isAdsRemoved = MutableStateFlow(false)
    val isAdsRemoved: StateFlow<Boolean> = _isAdsRemoved.asStateFlow()

    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails: StateFlow<ProductDetails?> = _productDetails.asStateFlow()

    private var billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    init {
        // Load persisted state immediately from secure storage
        _isAdsRemoved.value = prefs.getBoolean(KEY_ADS_REMOVED, false)
        startBillingConnection()
    }

    private fun initSecurePreferences(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "EncryptedSharedPreferences fallback to standard prefs: \${e.message}")
            context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
        }
    }

    fun startBillingConnection(onConnected: () -> Unit = {}) {
        if (billingClient.isReady) {
            queryExistingPurchases()
            queryProductDetails()
            onConnected()
            return
        }

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d(TAG, "Google Play Billing setup successful.")
                    queryExistingPurchases()
                    queryProductDetails()
                    onConnected()
                } else {
                    Log.w(TAG, "Billing setup finished with code: \${billingResult.responseCode} - \${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected. Will retry upon next interaction.")
            }
        })
    }

    private fun queryProductDetails() {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID_REMOVE_ADS)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                val details = queryProductDetailsResult.productDetailsList.firstOrNull { it.productId == PRODUCT_ID_REMOVE_ADS }
                _productDetails.value = details
                Log.d(TAG, "Queried product details: \${details?.name} (\${details?.oneTimePurchaseOfferDetails?.formattedPrice})")
            } else {
                Log.w(TAG, "Failed to query product details: \${billingResult.debugMessage}")
            }
        }
    }

    /**
     * Checks if user already purchased "Remove Ads" on this Google account.
     */
    fun queryExistingPurchases() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build()

        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                var foundRemoveAds = false
                for (purchase in purchases) {
                    if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS)) {
                        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                            foundRemoveAds = true
                            if (!purchase.isAcknowledged) {
                                acknowledgePurchase(purchase)
                            }
                        }
                    }
                }
                setAdsRemovedState(foundRemoveAds)
            }
        }
    }

    /**
     * Launches the Google Play 1-tap purchase sheet for the user.
     */
    fun launchPurchaseFlow(activity: Activity, onComplete: (Boolean, String?) -> Unit) {
        val details = _productDetails.value
        if (details == null) {
            startBillingConnection {
                launchPurchaseFlow(activity, onComplete)
            }
            return
        }

        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .build()
        )

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()

        val billingResult = billingClient.launchBillingFlow(activity, billingFlowParams)
        if (billingResult.responseCode != BillingClient.BillingResponseCode.OK) {
            onComplete(false, billingResult.debugMessage)
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: List<Purchase>?) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                handlePurchase(purchase)
            }
        } else if (billingResult.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
            Log.d(TAG, "User canceled the purchase flow.")
        } else {
            Log.w(TAG, "Purchases updated error: \${billingResult.responseCode} - \${billingResult.debugMessage}")
        }
    }

    private fun handlePurchase(purchase: Purchase) {
        if (purchase.products.contains(PRODUCT_ID_REMOVE_ADS) &&
            purchase.purchaseState == Purchase.PurchaseState.PURCHASED
        ) {
            if (!purchase.isAcknowledged) {
                acknowledgePurchase(purchase)
            } else {
                setAdsRemovedState(true)
            }
        }
    }

    private fun acknowledgePurchase(purchase: Purchase) {
        val acknowledgeParams = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        billingClient.acknowledgePurchase(acknowledgeParams) { billingResult ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                Log.d(TAG, "Purchase acknowledged successfully. Ads permanently removed.")
                setAdsRemovedState(true)
            } else {
                Log.w(TAG, "Failed to acknowledge purchase: \${billingResult.debugMessage}")
            }
        }
    }

    private fun setAdsRemovedState(removed: Boolean) {
        coroutineScope.launch {
            _isAdsRemoved.value = removed
            prefs.edit().putBoolean(KEY_ADS_REMOVED, removed).apply()
            Log.i(TAG, "Ad removal state saved to secure storage: isAdsRemoved=\$removed")
        }
    }

    /**
     * Restore purchases on user request.
     */
    fun restorePurchases(onResult: (Boolean) -> Unit) {
        startBillingConnection {
            queryExistingPurchases()
            onResult(_isAdsRemoved.value)
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
            putExtra(Intent.EXTRA_TEXT, context.getString(R.string.share_message, context.packageName))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(shareIntent, context.getString(R.string.share_app)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(chooser)
            OpenResult.Success
        } catch (e: ActivityNotFoundException) {
            OpenResult.Error(e, context.getString(R.string.settings_open_failed))
        } catch (e: SecurityException) {
            OpenResult.Error(e, context.getString(R.string.settings_open_failed))
        } catch (e: IllegalArgumentException) {
            OpenResult.Error(e, context.getString(R.string.settings_open_failed))
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
`
  },
  {
    path: 'app/src/main/java/com/utility/devoptions/ui/screens/MainScreen.kt',
    name: 'MainScreen.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Jetpack Compose Material 3 main screen with real-time cards, adaptive banner, and status badges',
    content: `package com.utility.devoptions.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    onLanguageSuggestionHandled: (String?) -> Unit = {}
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
        "vi" to stringResource(R.string.language_vietnamese)
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
            if (!isAdsRemoved) BannerAdView(isAdsRemoved = false)
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
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
            ) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.open_dev_options), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onOpenUsbDebugging, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Usb, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.usb_debugging), fontSize = 12.sp)
                }
                OutlinedButton(onClick = onOpenWirelessDebugging, modifier = Modifier.weight(1f).height(52.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Wifi, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.wireless_debugging), fontSize = 12.sp)
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onManualRefresh, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.refresh_status), fontSize = 13.sp)
                }
                OutlinedButton(onClick = onShareApp, modifier = Modifier.weight(1f).height(46.dp), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.share_app), fontSize = 13.sp)
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
                    OutlinedButton(onClick = onOpenAboutPhone, modifier = Modifier.fillMaxWidth().height(48.dp), shape = RoundedCornerShape(12.dp)) {
                        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.open_about_phone))
                    }
                }
            }
            DeviceInfoCard(uiState = uiState)
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
        Text(label, modifier = Modifier.padding(start = 4.dp), style = MaterialTheme.typography.bodyLarge)
    }
}


private fun nativeLanguageName(tag: String): String = when (tag.lowercase(java.util.Locale.ROOT)) {
    "en" -> "English"
    "ru" -> "Русский"
    "hi" -> "हिन्दी"
    "es" -> "Español"
    "fr" -> "Français"
    "ar" -> "العربية"
    "zh-cn", "zh" -> "简体中文"
    "bn" -> "বাংলা"
    "de" -> "Deutsch"
    "id" -> "Bahasa Indonesia"
    "it" -> "Italiano"
    "ja" -> "日本語"
    "ko" -> "한국어"
    "pt-br", "pt" -> "Português (Brasil)"
    "tr" -> "Türkçe"
    "vi" -> "Tiếng Việt"
    else -> tag
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
    <string name="share_subject">Developers Options Shortcut for Android</string>
    <string name="share_message">Open Developer Options and inspect USB debugging on your phone: https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>`
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
    description: 'Standard Android Compose Instrumented UI Test verifying Material 3 MainScreen rendering, CTA clicks, and billing actions',
    content: `package com.utility.devoptions

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.utility.devoptions.data.model.DevStatusUiState
import com.utility.devoptions.ui.screens.MainScreen
import com.utility.devoptions.ui.theme.DevOptionsTheme
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
}
`
  },
  {
    path: 'README.md',
    name: 'README.md (Android Studio Guide)',
    category: 'docs',
    language: 'markdown',
    description: 'Complete build, Gradle compilation, and Play Store release guide',
    content: `> **Current release facts (verified from Gradle):** package \`com.utility.devoptions\`; version \`1.0.4\` (\`20261019\`); compile/target SDK 36; current minimum SDK 24. Google Play Automatic Protection’s documented API 24 minimum means API 21–23 support must not be enabled until the protection trade-off is explicitly approved. The app locale selector covers English, Russian, Hindi, Spanish, French, Arabic, Simplified Chinese, Bengali, German, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Turkish, and Vietnamese. Hindi, Spanish, French, Arabic and Chinese have full resource-key coverage; the nine newly added locales translate the language-selection flow and primary labels, while missing strings intentionally fall back to English. Machine-generated translations need native-speaker review before being described as publication-quality.

Developers Options Shortcut — Android utility and Studio
A native Android application built with Kotlin and Jetpack Compose (Material 3), currently configured for API 24+ (Android 7.0+) while the Automatic Protection compatibility decision is pending. API 21–23 support remains intentionally disabled until the security trade-off is approved. Features include OEM intent fallbacks, status inspection, Google AdMob, and a Web Studio project exporter.
User Review & Critical Decisions
> [!IMPORTANT]
> The following product decisions were confirmed during the specification interview and revisions:
Current Gradle configuration (verified): \`minSdk = 24\`, \`targetSdk = 36\`, \`compileSdk = 36\`, application ID \`com.utility.devoptions\`, version \`1.0.4\` / code \`20261019\`. API 24 excludes Android 5.0–6.0 (API 21–23). A lower minimum would broaden compatibility but conflicts with the documented API 24 minimum for Google Play Automatic Protection if that protection is required. Do not claim a global device-reach percentage without current Google Play Console device data.
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
- Release builds request \`ndk.debugSymbolLevel = "FULL"\` and pin NDK \`27.2.12479018\` so CI has ABI strip tools. The latest verified build still reports that \`libandroidx.graphics.path.so\` has already-stripped native debug metadata for all packaged ABIs; CI records this as unresolved and the signed-release workflow continues to block publication while symbols are missing.
- Native UI locale choices cover English, Russian, Hindi, Spanish, French, Arabic (RTL), Simplified Chinese, Bengali, German, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Turkish, and Vietnamese. Nine additional locales initially translate primary labels and the language-selection flow; Android uses the default English values for untranslated strings. Resource completeness does not imply linguistic QA or live-ad verification.
- AdMob, UMP consent and encrypted billing preferences remain in the project; the PR’s CI checks presence but does not prove that live ads were served or that consent works end-to-end on a device.
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
    description: 'Synchronized from the native Android source tree.',
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
    val supportedLanguageTags: Set<String> = linkedSetOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi")

    fun canonicalSupportedTag(languageTag: String): String? {
        val requested = Locale.forLanguageTag(languageTag.replace('_', '-'))
        val canonical = requested.toLanguageTag()
        supportedLanguageTags.firstOrNull { it.equals(canonical, ignoreCase = true) }?.let { return it }
        val language = requested.language.lowercase(Locale.ROOT)
        if (language == "zh") return "zh-CN"
        return supportedLanguageTags.firstOrNull {
            Locale.forLanguageTag(it).language.equals(language, ignoreCase = true)
        }
    }

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

class DevOptionsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppLanguageController.initialize(this)
    }
}
`,
  },
  {
    path: 'app/src/test/java/com/utility/devoptions/AppLanguagePolicyTest.kt',
    name: 'AppLanguagePolicyTest.kt',
    category: 'kotlin',
    language: 'kotlin',
    description: 'Synchronized from the native Android source tree.',
    content: `package com.utility.devoptions

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguagePolicyTest {
    @Test
    fun supportedLocaleSetMatchesPublishedLocaleSet() {
        assertEquals(setOf("en", "ru", "hi", "es", "fr", "ar", "zh-CN", "bn", "de", "id", "it", "ja", "ko", "pt-BR", "tr", "vi"), LanguagePolicy.supportedLanguageTags)
    }

    @Test
    fun regionalDeviceLocaleMapsToSupportedLanguage() {
        assertEquals("ru", LanguagePolicy.suggestLanguage(listOf("ru-RU", "en-US"), "en", false, false))
        assertEquals("es", LanguagePolicy.suggestLanguage(listOf("es-MX"), "en", false, false))
        assertEquals("zh-CN", LanguagePolicy.suggestLanguage(listOf("zh-TW"), "en", false, false))
        assertEquals("bn", LanguagePolicy.suggestLanguage(listOf("bn-BD"), "en", false, false))
        assertEquals("de", LanguagePolicy.suggestLanguage(listOf("de-DE"), "en", false, false))
        assertEquals("id", LanguagePolicy.suggestLanguage(listOf("id-ID"), "en", false, false))
        assertEquals("it", LanguagePolicy.suggestLanguage(listOf("it-IT"), "en", false, false))
        assertEquals("ja", LanguagePolicy.suggestLanguage(listOf("ja-JP"), "en", false, false))
        assertEquals("ko", LanguagePolicy.suggestLanguage(listOf("ko-KR"), "en", false, false))
        assertEquals("pt-BR", LanguagePolicy.suggestLanguage(listOf("pt-BR"), "en", false, false))
        assertEquals("tr", LanguagePolicy.suggestLanguage(listOf("tr-TR"), "en", false, false))
        assertEquals("vi", LanguagePolicy.suggestLanguage(listOf("vi-VN"), "en", false, false))
    }

    @Test
    fun choosesFirstSupportedLocaleInDevicePreferenceOrder() {
        assertEquals("hi", LanguagePolicy.suggestLanguage(listOf("ta-IN", "hi-IN", "en-IN"), "en", false, false))
        assertEquals("fr", LanguagePolicy.suggestLanguage(listOf("fr-CA", "ar-EG"), "en", false, false))
    }

    @Test
    fun doesNotSuggestSameLanguageOrWhenAlreadyHandled() {
        assertNull(LanguagePolicy.suggestLanguage(listOf("en-US"), "en", false, false))
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", false, true))
        assertNull(LanguagePolicy.suggestLanguage(listOf("fr-FR"), "en", true, false))
    }

    @Test
    fun unsupportedLocalesAreNotOfferedInThePickerPolicy() {
        assertNull(LanguagePolicy.canonicalSupportedTag("pt-BR"))
        assertNull(LanguagePolicy.suggestLanguage(listOf("pt-BR"), "en", false, false))
    }
}
`,
  },
  {
    path: 'app/src/main/res/values-ru/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Synchronized from the native Android source tree.',
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
    <string name="share_subject">Быстрый доступ к параметрам разработчика Android</string>
    <string name="share_message">Открывайте параметры разработчика и проверяйте отладку по USB: https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>`,
  },
  {
    path: 'app/src/main/res/values-hi/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Machine-generated Hindi translation for the Android interface; native-speaker review recommended.',
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
    <string name="share_subject">Developers Options Shortcut for Android</string>
    <string name="share_message">अपने फ़ोन पर डेवलपर विकल्प खोलें और USB डिबगिंग देखें: https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-es/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Machine-generated Spanish translation for the Android interface; native-speaker review recommended.',
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
    <string name="share_subject">Developers Options Shortcut para Android</string>
    <string name="share_message">Abre las opciones de desarrollador y consulta la depuración USB en tu teléfono: https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-fr/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Machine-generated French translation for the Android interface; native-speaker review recommended.',
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
    <string name="share_subject">Developers Options Shortcut pour Android</string>
    <string name="share_message">Ouvrez les options pour les développeurs et consultez le débogage USB sur votre téléphone : https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ar/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Machine-generated Arabic (right-to-left) translation for the Android interface; native-speaker review recommended.',
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
    <string name="share_subject">Developers Options Shortcut لنظام Android</string>
    <string name="share_message">افتح خيارات المطوّر وتحقق من تصحيح أخطاء USB على هاتفك: https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-zh-rCN/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Machine-generated Simplified Chinese translation for the Android interface; native-speaker review recommended.',
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
    <string name="share_subject">Developers Options Shortcut for Android</string>
    <string name="share_message">打开开发者选项并查看手机上的 USB 调试：https://play.google.com/store/apps/details?id=%1$s</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-bn/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial bn localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">ডেভেলপার অপশন খুলুন</string>
    <string name="dev_options_status">ডেভেলপার অপশন</string>
    <string name="usb_debugging_status">USB ডিবাগিং</string>
    <string name="select_language">ভাষা নির্বাচন করুন</string>
    <string name="language_picker_title">অ্যাপের ভাষা</string>
    <string name="about_phone">ফোন সম্পর্কে</string>
    <string name="open_about_phone">ফোন সম্পর্কে খুলুন</string>
    <string name="wireless_debugging">ওয়্যারলেস ডিবাগিং</string>
    <string name="usb_debugging">USB ডিবাগিং</string>
    <string name="language_suggestion_title">আপনার পছন্দের ভাষা বেছে নিন</string>
    <string name="language_suggestion_message">আপনার ডিভাইসের ভাষা %1$s। এই অ্যাপেও কি এটি ব্যবহার করতে চান?</string>
    <string name="language_switch_to_suggested">ভাষা বদলান</string>
    <string name="language_continue_english">ইংরেজি রাখুন</string>
    <string name="language_system_default">সিস্টেমের ডিফল্ট</string>
    <string name="done">সম্পন্ন</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-de/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial de localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Entwickleroptionen öffnen</string>
    <string name="dev_options_status">Entwickleroptionen</string>
    <string name="usb_debugging_status">USB-Debugging</string>
    <string name="select_language">Sprache auswählen</string>
    <string name="language_picker_title">App-Sprache</string>
    <string name="about_phone">Über das Telefon</string>
    <string name="open_about_phone">„Über das Telefon“ öffnen</string>
    <string name="wireless_debugging">WLAN-Debugging</string>
    <string name="usb_debugging">USB-Debugging</string>
    <string name="language_suggestion_title">Bevorzugte Sprache auswählen</string>
    <string name="language_suggestion_message">Die Gerätesprache ist %1$s. Möchten Sie sie auch in dieser App verwenden?</string>
    <string name="language_switch_to_suggested">Sprache wechseln</string>
    <string name="language_continue_english">Englisch beibehalten</string>
    <string name="language_system_default">Systemstandard</string>
    <string name="done">Fertig</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-id/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial id localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Buka Opsi Developer</string>
    <string name="dev_options_status">Opsi Developer</string>
    <string name="usb_debugging_status">Debugging USB</string>
    <string name="select_language">Pilih bahasa</string>
    <string name="language_picker_title">Bahasa aplikasi</string>
    <string name="about_phone">Tentang ponsel</string>
    <string name="open_about_phone">Buka Tentang Ponsel</string>
    <string name="wireless_debugging">Debugging nirkabel</string>
    <string name="usb_debugging">Debugging USB</string>
    <string name="language_suggestion_title">Pilih bahasa pilihan Anda</string>
    <string name="language_suggestion_message">Bahasa perangkat Anda adalah %1$s. Ingin menggunakannya di aplikasi ini?</string>
    <string name="language_switch_to_suggested">Ganti bahasa</string>
    <string name="language_continue_english">Tetap gunakan bahasa Inggris</string>
    <string name="language_system_default">Default sistem</string>
    <string name="done">Selesai</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-it/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial it localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Apri Opzioni sviluppatore</string>
    <string name="dev_options_status">Opzioni sviluppatore</string>
    <string name="usb_debugging_status">Debug USB</string>
    <string name="select_language">Seleziona lingua</string>
    <string name="language_picker_title">Lingua dell'app</string>
    <string name="about_phone">Informazioni sul telefono</string>
    <string name="open_about_phone">Apri Informazioni sul telefono</string>
    <string name="wireless_debugging">Debug wireless</string>
    <string name="usb_debugging">Debug USB</string>
    <string name="language_suggestion_title">Scegli la lingua preferita</string>
    <string name="language_suggestion_message">La lingua del dispositivo è %1$s. Vuoi usarla anche in questa app?</string>
    <string name="language_switch_to_suggested">Cambia lingua</string>
    <string name="language_continue_english">Mantieni l'inglese</string>
    <string name="language_system_default">Lingua predefinita del sistema</string>
    <string name="done">Fine</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ja/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial ja localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">開発者向けオプションを開く</string>
    <string name="dev_options_status">開発者向けオプション</string>
    <string name="usb_debugging_status">USB デバッグ</string>
    <string name="select_language">言語を選択</string>
    <string name="language_picker_title">アプリの言語</string>
    <string name="about_phone">デバイス情報</string>
    <string name="open_about_phone">デバイス情報を開く</string>
    <string name="wireless_debugging">ワイヤレスデバッグ</string>
    <string name="usb_debugging">USB デバッグ</string>
    <string name="language_suggestion_title">使用する言語を選択</string>
    <string name="language_suggestion_message">端末の言語は %1$s です。このアプリでも使用しますか？</string>
    <string name="language_switch_to_suggested">言語を切り替える</string>
    <string name="language_continue_english">英語のままにする</string>
    <string name="language_system_default">システムの既定</string>
    <string name="done">完了</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-ko/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial ko localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">개발자 옵션 열기</string>
    <string name="dev_options_status">개발자 옵션</string>
    <string name="usb_debugging_status">USB 디버깅</string>
    <string name="select_language">언어 선택</string>
    <string name="language_picker_title">앱 언어</string>
    <string name="about_phone">휴대전화 정보</string>
    <string name="open_about_phone">휴대전화 정보 열기</string>
    <string name="wireless_debugging">무선 디버깅</string>
    <string name="usb_debugging">USB 디버깅</string>
    <string name="language_suggestion_title">원하는 언어 선택</string>
    <string name="language_suggestion_message">기기 언어는 %1$s입니다. 이 앱에서도 사용할까요?</string>
    <string name="language_switch_to_suggested">언어 변경</string>
    <string name="language_continue_english">영어 유지</string>
    <string name="language_system_default">시스템 기본값</string>
    <string name="done">완료</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-pt-rBR/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial pt-rBR localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Abrir opções do desenvolvedor</string>
    <string name="dev_options_status">Opções do desenvolvedor</string>
    <string name="usb_debugging_status">Depuração USB</string>
    <string name="select_language">Selecionar idioma</string>
    <string name="language_picker_title">Idioma do app</string>
    <string name="about_phone">Sobre o telefone</string>
    <string name="open_about_phone">Abrir Sobre o telefone</string>
    <string name="wireless_debugging">Depuração sem fio</string>
    <string name="usb_debugging">Depuração USB</string>
    <string name="language_suggestion_title">Escolha seu idioma preferido</string>
    <string name="language_suggestion_message">O idioma do dispositivo é %1$s. Quer usá-lo também neste app?</string>
    <string name="language_switch_to_suggested">Trocar idioma</string>
    <string name="language_continue_english">Manter inglês</string>
    <string name="language_system_default">Padrão do sistema</string>
    <string name="done">Concluído</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-tr/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial tr localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Geliştirici seçeneklerini aç</string>
    <string name="dev_options_status">Geliştirici seçenekleri</string>
    <string name="usb_debugging_status">USB hata ayıklama</string>
    <string name="select_language">Dil seçin</string>
    <string name="language_picker_title">Uygulama dili</string>
    <string name="about_phone">Telefon hakkında</string>
    <string name="open_about_phone">Telefon Hakkında'yı aç</string>
    <string name="wireless_debugging">Kablosuz hata ayıklama</string>
    <string name="usb_debugging">USB hata ayıklama</string>
    <string name="language_suggestion_title">Tercih ettiğiniz dili seçin</string>
    <string name="language_suggestion_message">Cihazınızın dili %1$s. Bu uygulamada da kullanmak ister misiniz?</string>
    <string name="language_switch_to_suggested">Dili değiştir</string>
    <string name="language_continue_english">İngilizce kalsın</string>
    <string name="language_system_default">Sistem varsayılanı</string>
    <string name="done">Bitti</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/values-vi/strings.xml',
    name: 'strings.xml',
    category: 'res',
    language: 'xml',
    description: 'Partial vi localization for app actions and language selection; other resources fall back to English.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Developers Options Shortcut</string>
    <string name="open_dev_options">Mở Tùy chọn nhà phát triển</string>
    <string name="dev_options_status">Tùy chọn nhà phát triển</string>
    <string name="usb_debugging_status">Gỡ lỗi USB</string>
    <string name="select_language">Chọn ngôn ngữ</string>
    <string name="language_picker_title">Ngôn ngữ ứng dụng</string>
    <string name="about_phone">Giới thiệu về điện thoại</string>
    <string name="open_about_phone">Mở mục Giới thiệu về điện thoại</string>
    <string name="wireless_debugging">Gỡ lỗi không dây</string>
    <string name="usb_debugging">Gỡ lỗi USB</string>
    <string name="language_suggestion_title">Chọn ngôn ngữ bạn muốn</string>
    <string name="language_suggestion_message">Ngôn ngữ thiết bị của bạn là %1$s. Bạn có muốn dùng ngôn ngữ đó trong ứng dụng này không?</string>
    <string name="language_switch_to_suggested">Đổi ngôn ngữ</string>
    <string name="language_continue_english">Giữ tiếng Anh</string>
    <string name="language_system_default">Mặc định hệ thống</string>
    <string name="done">Xong</string>
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
</resources>
`,
  },
  {
    path: 'app/src/main/res/xml/locale_config.xml',
    name: 'locale_config.xml',
    category: 'res',
    language: 'xml',
    description: 'Synchronized from the native Android source tree.',
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
        <item name="android:statusBarColor">@android:color/transparent</item>
        <item name="android:navigationBarColor">@android:color/transparent</item>
        <item name="android:windowLightStatusBar">true</item>
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
];
