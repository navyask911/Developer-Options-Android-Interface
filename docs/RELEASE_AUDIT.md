# Release audit checkpoint — PR #3

This matrix records repository and CI evidence only. It does not replace physical-device testing or native-speaker linguistic review.

| Reported issue / requirement | Evidence available | Implementation or next step | Verification | Status |
|---|---|---|---|---|
| Russian action-button text clipping | MainScreen used fixed 46 dp action buttons; Russian labels may wrap at normal and enlarged font sizes | Responsive action-button component, natural wrapping, and stacked layout for narrow widths or enlarged text | Russian and German Compose UI tests check displayed labels; Russian test also clicks both actions | Pending CI for resulting commit |
| 16-locale coverage | Localization validator and coverage report list the 16 requested tags | Preserve all resource directories and add two billing-aware offline messages to each locale | CI checks keys, placeholders, suspected untranslated values, locale configuration, and exporter parity | Pending CI; native-speaker review remains required |
| Arabic RTL | RTL manifest attribute and Arabic resources already exist | Preserve layout direction and exercise the existing RTL prompt test | Compose instrumentation and icon/localization checks | Pending CI for resulting commit |
| Launcher/adaptive/Play Store icons | Current project contains launcher density PNGs, adaptive icon resources, and a Play Store PNG; the original approved artwork archive was not attached in this request | Add image decoding/dimension validation and manifest/adaptive reference validation; do not invent or replace artwork | CI validates listed PNGs and requires a 512 × 512 Play Store icon | Pending CI; visual comparison with the approved source artwork remains blocked |
| Offline copy and ad-removal state | Prior UI always used optional coffee/support copy; billing exposed only a boolean | Persist whether Play resolved the entitlement and choose ad-supported, confirmed ad-free, or unverified copy | Unit policy and Compose tests cover the three states | Pending CI for resulting commit |
| AdMob, UMP and encrypted billing | Existing CI checks their configuration; billing preferences use EncryptedSharedPreferences | Preserve integrations and signing secrets | Existing release validation checks plus unit/build tests | Pending CI for resulting commit |
| Feedback from 15 testers | No non-PR issue records or tester-feedback artifact was found in the repository evidence available for this checkpoint | Obtain source messages, screenshots/logs, device and OS details, and reproduction steps; do not infer tester findings | Per-tester coverage cannot be established without those records | BLOCKED — tester feedback source records are unavailable |
| Play Console version-code availability | Gradle uses package com.utility.devoptions, version 1.0.33/code 20261023, minSdk 24; Play Console is not connected | Verify directly that 20261023 exceeds the code currently used by Play before release | CI inspects built metadata but cannot establish live Play Console state | BLOCKED — owner must verify Play Console |
| Signed AAB / signer identity | Existing signing workflow is manual; PR validation builds an unsigned candidate and checks native symbols | Keep PR open; after explicit approval, merge and dispatch the signing workflow with existing permanent secrets | No signing or certificate comparison has been run in this checkpoint | BLOCKED — approval and post-merge signing run required |

## Release boundary

- PR #3 remains open and unmerged.
- No Play Console upload, rollout, signing-key change, or manual signing-workflow dispatch was performed.
- All non-English strings are machine-assisted drafts awaiting native-speaker review.
- European Portuguese can be supported independently with Android qualifier values-pt-rPT alongside Brazilian Portuguese values-pt-rBR, but is not added or advertised here until the 16-locale baseline is validated and a separately reviewed translation is available.
