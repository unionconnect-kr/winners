# Android 1.42 complete native security QA

This staging-only build combines the complete sector 1–4 assets from Android 1.41 with the source-built Keystore plugin. It preserves the prior Android JS bridge byte-for-byte before adding the existing OAuth URL guard. `mobile/release139/android-native.js` is the public runtime asset extracted from the hash-verified 1.39 APK (SHA-256 `acd90c8028a5f878093f68aa3bf5e01effc3911f6c02289f585793791b8429ba`); its own SHA-256 is pinned to `a99b6ef582408bd28d5aa6c507982a25c2c7f7640b14f5195cfbeea97bce5440`. It contains no signing keys or user records.

The new builder applies the same shared iPhone-feedback adaptation and UI security hardening as 1.41, then wraps auth storage. It copies the archived sector assets and bundles the pinned current Supabase/XLSX dependencies. All native classes are compiled from source. App/Browser plugin registration and the exact application-ID auth callback intent are restored; native zoom remains disabled. Normal production release version/signing behavior is unchanged. Only `-PmaneeQa142` selects debug versionCode 43 / `1.42-sector1-4-test`.

Reproduce with `npm ci --prefix mobile`, `npm --prefix mobile test`, `node mobile/scripts/build-android142.mjs staging`, `npm --prefix mobile run sync:android`, then `cd mobile/android && ./gradlew :app:assembleDebug -PmaneeQa142`. The dedicated workflow verifies APK metadata, audits the exact asset screens in Chromium, and tests the real Keystore plus packaged WebView/native bridge and callback resolution on API 35. The generic Android workflow remains a separate smoke build.

CI debug signing is ephemeral. Before delivery, re-sign only the successful complete-app artifact with the existing staging QA key and verify that the certificate matches 1.41. Never upload that test key to the public repository. VersionCode 43 allows an in-place update after certificate comparison; no uninstall should be required. This is not a production release or a store upload. Real phone keyboard/gesture, provider consent/return, upgrade migration, and account-switch behavior still require device checks. Existing disabled staging push/billing/AI connections remain disabled.

## Pre-publication local validation snapshot

Local mobile regression: 143 passed, zero failed. The exact 1.41 installed HTML, after version-text replacement and the secure-auth transform, equals the new output. This checks preservation against the delivered APK, not only source fixtures. Android callback intent and all four Capacitor package registrations match the previous APK.

Public GitHub tree creation was rejected by automatic approval review because authorization for this concrete publication to the public repository was not explicit. No 1.42 source was published. Local full native APK and instrumentation APK compilation succeeded. Both debug APK and instrumentation APK were built, but instrumentation was not executed. Chromium launched from the official distribution could not run because this workspace denies its process socket; the new presentation and WebView/Keystore integration tests remain unexecuted here. Previous PR64 Keystore tests passed, but are not represented as tests of this complete new APK. Publishing this patch and running the dedicated CI workflow needs the user's explicit public-repository approval.

Initial locally built QA APK (superseded by the tested CI artifact below): `MANEE-1.42-security-test-20261104.apk`, package `kr.co.manee.app.staging`, versionCode 43. SHA-256 `064f489f08080e91b5d8383cabc61808029523c4339d753038548ae8fef84b8d`. V2/V3 signatures and 16-KiB native-library alignment verified. Certificate SHA-256 `c06866a7f2d2089d0f0c6f0502ebcc7a7ce27275b580b1e50d9226aa5f7a640b` matches 1.41. APK metadata, staging isolation, restricted permissions, backup/cleartext prohibition, plugin registrations and six required native class markers verified. Compared with the delivered 1.41 APK: no removed public assets; only `index.html` and `build-info.json` changed, and `secure-auth.js` was added. This is a mechanically verified test artifact awaiting the new full runtime audit, not a release-complete result.

## Approved publication and completed runtime validation

The user explicitly approved public publication. PR #65 was published and merged into the mobile security branch at `e0f77ea6d78a41bf9461cfd7b7dd5c09b9035c51`. All five workflows passed on `9c2647b6ff23d3cde14792ab599a12c9566b635a`. The earlier approval block and cloud runtime-check wait are resolved.

- 143 mobile tests; root suite 1,015 passed / 11 skipped / zero failed, plus four separate PostgreSQL concurrency suites.
- Chromium: 1,084 screen states, 1,968 controls, 45 interactions, zero failures.
- Seven Android API 35 instrumented tests passed, including the real packaged WebView-to-Keystore round trip/delete and OAuth callback resolution.
- Android complete QA build, generic Android staging build, iOS simulator build and iPhone WebKit audit passed.

The final file comes from the successful complete-app CI artifact, re-signed with the existing staging QA certificate. Its runtime ZIP entries are byte-identical to the tested artifact; all local web assets also match. Final APK SHA-256: `dd04beb0c09473728be73124021b9bf9e5a62a53cf08859f33864942ef608257` (8,736,096 bytes). Certificate still matches 1.41; v2/v3 signature, staging metadata and 16-KiB alignment pass. No production/main/store release is implied. Physical-device upgrade/session migration, real provider consent/return and payment/refund testing remain separate.
