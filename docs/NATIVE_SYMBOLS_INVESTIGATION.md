# Native debug-symbol investigation

Candidate: Developers Options Shortcut 1.0.6 / version code 20261021.

## Evidence and decision

The prior release-candidate AAB packaged `libandroidx.graphics.path.so` under arm64-v8a, armeabi-v7a, x86, and x86_64. Android Gradle Plugin reported that its debug metadata had already been stripped for all four ABIs. Android's guidance makes clear that `ndk.debugSymbolLevel = "FULL"` cannot recover debug information already stripped from an input prebuilt: https://developer.android.com/build/include-native-symbols.

AndroidX Graphics Path 1.1.0 is the current stable release listed by AndroidX: https://developer.android.com/jetpack/androidx/releases/graphics. The current branch's Release Gate confirms this exact version in the release runtime graph and builds an AAB, but that workflow previously did not inspect native symbol entries. That is why version resolution/build success is not sufficient proof.

## Strict validation

Candidate 1.0.6's Android Validation inspects the actual built AAB, for each library path and ABI, and requires a matching `BUNDLE-METADATA/com.android.tools.build.debugsymbols/<abi>/<library>.dbg` or `.sym`. It fails on any missing matching symbol. Release Gate CI now performs the same strict check, and the protected release workflow retains its existing failure on missing symbols. No symbol exception or warning-to-success path is allowed.

The candidate is not release-ready unless the native check and emulator instrumentation tests both pass. The signed release workflow's existing-upload-certificate comparison is preserved; this task does not invoke signing, expose secrets, publish GitHub release assets, or upload to Play Console.

## Version boundary

Candidate code `20261021` is greater than the repository-tracked code `20261019` of the signed GitHub release `release-v1.0.4`: https://github.com/navyask911/Developer-Options-Android-Interface/releases/tag/release-v1.0.4. The release page explicitly says no Play Console upload or rollout was performed, so the Play Console's currently uploaded code still requires direct verification. No Play upload or rollout is performed here.
