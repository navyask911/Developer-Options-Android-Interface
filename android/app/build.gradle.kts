plugins {
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
        versionCode = 20261026
        versionName = "1.0.36"

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
