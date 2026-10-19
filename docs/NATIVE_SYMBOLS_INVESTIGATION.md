# Native debug-symbol investigation

Candidate: Developers Options Shortcut 1.0.32 / version code 20261022.

## Exact dependency and upstream evidence

The earlier candidate resolved `androidx.graphics:graphics-path:1.0.1`; forcing stable `1.1.0` did not produce native symbol metadata in the actual AAB. AGP reported that `libandroidx.graphics.path.so` could not be stripped, and matching `.dbg`/`.sym` files were not established for arm64-v8a, armeabi-v7a, x86 and x86_64.

AndroidX's official release page lists Graphics Path 1.1.0 (May 6, 2026): https://developer.android.com/jetpack/androidx/releases/graphics. The upstream library compiles native path code into a JNI library with hidden symbol visibility/version-script settings (https://android.googlesource.com/platform/frameworks/support/+/b2e13e55ca5807fe487db42765fc51980d644fa2/graphics/graphics-path/build.gradle). Google documents that `debugSymbolLevel = "FULL"` cannot reconstruct native debug information already stripped from a prebuilt input: https://developer.android.com/build/include-native-symbols.

Compose 1.7's Android PathIterator implementation imports and wraps `androidx.graphics.path.PathIterator` (https://android.googlesource.com/platform/frameworks/support/+/3cae670ac7a296e9d58a95ede7044b39af014d1c/compose/ui/ui-graphics/src/androidMain/kotlin/androidx/compose/ui/graphics/AndroidPathIterator.android.kt). Excluding that library from Compose 1.7 would remove an implementation behind its public API, so the candidate now uses a compatible earlier Compose generation instead.

## Compatible dependency choice

Candidate 1.0.32 pins Compose BOM `2024.06.00`, Compose UI Graphics Android `1.6.8`, Material 3 `1.2.1`, and Activity Compose `1.9.0`. The published dependency list for UI Graphics Android 1.6.8 does not include Graphics Path (https://mvnrepository.com/artifact/androidx.compose.ui/ui-graphics-android/1.6.8/dependencies), unlike the 1.7 line. Candidate application source does not use Compose PathIterator. CI checks the exact UI Graphics and Material 3 versions and fails if `androidx.graphics:graphics-path` or an app-level PathIterator call appears.

The symbol gate is strict: if `libandroidx.graphics.path.so` unexpectedly appears in any ABI of the actual AAB, candidate validation fails. Every other packaged native library must have matching ABI-specific `.dbg` or `.sym` metadata. There is no exception, ignored library, or warning-to-success downgrade. Actual emulator instrumentation is required to establish the UI remains functional on the chosen stack.

## Release boundary

Version code `20261022` exceeds the last repository-tracked signed GitHub release code `20261019` (tag `release-v1.0.4`). That release record says it was not uploaded to Google Play, so the live Play Console version code is still unverified and must be checked directly before a real release. The protected workflow validates an unsigned bundle and native symbols before loading signing secrets and retains the post-sign comparison with the existing upload certificate. No signing, GitHub Release publication, or Play Console upload is run here.
