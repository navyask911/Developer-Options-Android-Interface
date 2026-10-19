# Native debug-symbol investigation

Candidate: Developers Options Shortcut 1.0.6 / version code 20261021.

## Exact dependency and upstream build evidence

The earlier candidate resolved `androidx.graphics:graphics-path:1.0.1`; forcing stable `1.1.0` did not resolve native packaging. Release logs reported that `libandroidx.graphics.path.so` could not be stripped and no matching `.dbg`/`.sym` files had been established for arm64-v8a, armeabi-v7a, x86 and x86_64.

AndroidX source shows Graphics Path compiles `Conic.cpp`, `PathIterator.cpp` and `pathway.cpp` into a JNI library with hidden symbol visibility and a version script. Sources: https://android.googlesource.com/platform/frameworks/support/+/b2e13e55ca5807fe487db42765fc51980d644fa2/graphics/graphics-path/build.gradle and https://android.googlesource.com/platform/frameworks/support/+/225853c2fd3977d06ea9c0efaddd35ae1d81e3a6/graphics/graphics-path/src/main/cpp/CMakeLists.txt. Android's NDK documentation explains that debug metadata already stripped from a prebuilt dependency cannot be reconstructed by setting `debugSymbolLevel = "FULL"`: https://developer.android.com/build/include-native-symbols. No matching upstream debug-symbol download was found for the exact AAR.

## Evaluated compatible alternative

A scan of the changed app Kotlin sources found no direct use of `androidx.graphics.path`, `PathIterator` or `Path.iterate()`. The app does not need the optional Compose PathIterator API. Candidate 1.0.6 excludes only the transitive `androidx.graphics:graphics-path` dependency edge from Compose UI Graphics instead of shipping the pre-stripped JNI library.

CI fails if the module reappears in `releaseRuntimeClasspath` or if `libandroidx.graphics.path.so` is packaged for any ABI. Independently, every other native library that is packaged must have an ABI-specific matching `.dbg` or `.sym` entry; no missing library is ignored and no warning is downgraded. Instrumentation runs on API 35 and API 24 to check UI behavior with the dependency absent.

## Release boundary

Version code `20261021` exceeds the last repository-tracked signed GitHub release code `20261019` (tag `release-v1.0.4`). That release record says it was not uploaded to Google Play, so the current Play Console version code remains unverified and must be checked directly before an actual release. The protected release workflow must pass the unsigned metadata and strict symbol gate before it loads existing upload secrets, and it retains the signer-certificate comparison after signing. No signing, GitHub Release publication, or Play Console upload is performed for this task.
