# Native debug-symbol investigation

Candidate: Developers Options Shortcut 1.0.5 / version code 20261020.
Status: unresolved until the actual candidate AAB passes the ABI-by-ABI symbol check.

## Dependency and binary evidence

The app's Compose UI Graphics dependency previously resolved androidx.graphics:graphics-path:1.0.1. The prior release-candidate AAB contained libandroidx.graphics.path.so for arm64-v8a, armeabi-v7a, x86, and x86_64. The AGP build log reported that the native debug metadata for this dependency had already been stripped. Installing NDK strip tools and setting debugSymbolLevel to FULL does not reconstruct metadata that is absent from the dependency's input binary.

This candidate evaluates the stable androidx.graphics:graphics-path:1.1.0 artifact as a backward-compatible 1.x dependency and records the exact resolution with Gradle dependencyInsight. The official AndroidX graphics release page lists 1.1.0 as the stable Graphics Path release (May 6, 2026): https://developer.android.com/jetpack/androidx/releases/graphics. Compose's published source previously declared graphics-path 1.0.1 in UI Graphics: https://android.googlesource.com/platform/frameworks/support/+/4fc719353a57981a40ccde4fe153201a2cf57c47/compose/ui/ui-graphics/build.gradle.

Google's Android build guidance says dependency libraries may have stripped debug information and specifically instructs developers to look for the "native debug metadata has already been stripped" log when symbol extraction fails: https://developer.android.com/build/include-native-symbols. That means FULL is a request, not proof that symbols were recovered.

## Current gate

CI examines the actual unsigned AAB. For each packaged ABI/library it checks for a matching BUNDLE-METADATA/com.android.tools.build.debugsymbols/<abi>/<library>.dbg or .sym. If Graphics Path 1.1.0 still lacks matching symbol files, the native-symbol report remains UNRESOLVED. The protected signed-release workflow independently fails on missing symbols; no exception or warning-to-success downgrade is configured there.

No exact matching official .dbg or .sym artifact for the published Graphics Path binaries was identified in the upstream release material reviewed. A source rebuild is not accepted as a matching symbol source unless the resulting machine code/address layout is demonstrated to correspond to the shipped binary for every ABI. A different library version is not accepted as a fix unless its actual AAB passes the strict symbol comparison and emulator regression tests.

## Version boundary

The candidate raises the repository-tracked version from 1.0.4 / 20261019 to 1.0.5 / 20261020. This exceeds the highest version code currently tracked in this repository, but GitHub Actions has no authenticated Google Play Console query to prove the app's currently published version code. No Play Console upload or rollout is performed. This unsigned candidate is not release-ready while native symbols remain unresolved.
