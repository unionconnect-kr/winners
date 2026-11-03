# Android 1.40: iPhone feedback parity

The prior Android 1.39 QA APK lacked the role-specific login, new credential rules, identity-link URL fix and employee expense deletion already shipped in iPhone 1.39 / build 1.14.1. This release packages those corrections for Android.

- New usernames: 6–30 characters. New passwords: 8+ characters, ASCII letters and digits, 72 UTF-8 bytes maximum. Existing short usernames and old passwords retain their login/recovery path.
- Owner and employee/manager entry routes pass the chosen role to the server and independently verify the authenticated membership before applying a session.
- Kakao/Naver linking accepts only the provider's exact authorization endpoint, matching project callback and required OAuth parameters. Both the web controller and Android native open boundary validate the URL. The existing callback listener, scheme, provider availability, PKCE and identity checks remain.
- Staff can delete only their own expense before owner confirmation, after an explicit confirmation dialog. Revision/account/store checks and duplicate-submit suppression are shared with iPhone. Failures retain the record.
- Shared form sizing, reservation action alignment, horizontal overflow containment and confirmation stacking corrections are packaged with Android-native system insets. Native zoom is explicitly disabled.
- Original Android native classes/resources and file-saving, geolocation, notification and billing adapters remain intact. The original native.js is preserved as a byte-identical prefix, followed by the URL-validation guard. The QA app's existing disabled/unconnected services are not enabled by this release.
- No new backend deployment or production/store release was performed. Android uses the same staging project and previously applied server authorization as the verified iPhone build. The separate splash mockup is not part of this change.

## Validation

- 132 mobile tests passed, zero failures.
- 10 PGlite database deletion tests passed, zero failures: author, owner confirmation, membership/session/store/revision/subscription and receipt cascade.
- Offline WebKit rendering of the exact Android web assets: 271 states at 320/360/390/412 px = 1,084 layout checks, 1,968 input checks, and 45 interaction checks; zero failures. This is a WebKit preview, not an Android WebView/emulator run. Chromium acquisition was unavailable in this environment.
- iPhone default HTML and OAuth controller outputs are byte-identical to the previous commit after the shared adapter extension.
- Signed APK: v2/v3 signatures valid, certificate matches 1.39. All 26 web files match the final build. 471 native/resource entries are byte-identical. ZIP integrity and alignment (4-byte stored entries; 16 KiB native libraries when present) verified after signing.
- Device update installation, keyboard/gesture behavior, live provider consent and return, real push/location and file-picker behavior are not exercised by the offline tests and remain device checks.

## Deliverable

- File: MANEE-1.40-android-20261104.apk
- Package: kr.co.manee.app.staging
- Version: 1.40-sector1-4-test / versionCode 41 (previous 40)
- Backend: manee-staging (obpkzecgswnfuyhwvncd)
- SHA-256: 6981a7c5d6ca81db124a4d4bb9176850e2f1a2dd2fa0f755a5acae3d2e737d03
- Certificate SHA-256: c06866a7f2d2089d0f0c6f0502ebcc7a7ce27275b580b1e50d9226aa5f7a640b

## Reproduction

Run mobile tests first (legacy tests rewrite mobile/www). Extract assets/public from the hash-pinned MANEE-1.39-final-20261102.apk into a temporary directory, then run:

```sh
node mobile/scripts/build-android140.mjs staging /path/to/extracted-public
python3 mobile/scripts/package-android140.py --base /path/to/MANEE-1.39-final-20261102.apk --assets mobile/www --out /tmp/manee140-unsigned.apk
```

The packaging script checks the baseline SHA-256, updates version metadata and zoom configuration, writes the final assets, strips obsolete signatures, verifies the exact changed-entry set and aligns stored ZIP entries. Sign with the existing staging debug key, then verify the certificate, APK signature and alignment. Signing keys are not included in this change.
