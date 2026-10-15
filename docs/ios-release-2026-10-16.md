# iOS release continuation — 2026-10-16 KST

The operator has now prepared a physical iPhone. The latest Android code-23
source (`93b7e57`) is the common UI baseline; the approved narrow main changes
through `d87437f` are reconciled in the isolated iOS release branch. Existing
report layouts and expired-staff refusal tests are preserved during reconciliation.
This branch is not a wholesale deployment to the production web app.

## Completed source preparation

- Current signup age confirmation, report UI/data generation, employee login,
  attendance refusal and other common source updates are included in the iOS
  packaged web build. Android-specific Play Billing/FCM are not loaded in iOS.
- iOS now implements the `MANEE_NATIVE.saveFile` report bridge. It offers the
  native save/share sheet for PDF and XLSX, preserves Korean filenames, limits
  files to 32 MiB, rejects paths/control characters and mismatched extensions,
  protects temporary files and removes them after completion/cancellation.
  Cancellation is distinct from success. Shared completion is not described as
  a browser download. A missing native saver fails closed rather than claiming
  that a WKWebView blob download was successful.
- Both native platforms handle the server's P4402 business refusal. On iOS the
  owner can open iPhone subscription settings; staff retain their login and see
  an owner-contact explanation. No write entitlement is granted by the client.
- The signed-archive workflow accepts the exact isolated release branch for an
  artifact-only build. Apple upload is still manual/main-only. No tester is
  invited, agreement accepted or App Store review submitted by a push.

Local mobile checks: 64 passed, zero failed. Production iOS web assets generated
successfully without changing the canonical web source or production settings.
Root regression: 980 checks, 969 passed, zero failed, 11 environment-dependent
skips. The root has no npm test script; these ran with Node's test runner over
the security and tests directories.
Signed Xcode archive/export succeeded for exact source
`d94bd7da08e83002966f65c0ec5386d5f0869267` in GitHub run `38786406361`.
Artifact `manee-ios-signed-5-1` contains the signed IPA, version 1.0 / build
1.5.1, exported at 03:34 KST. Profile/team/app/production-APNs checks, native
compilation and signature validation succeeded. The TestFlight upload step was
skipped as designed. A physical save/share action must still be checked;
successful compilation does not establish iPhone behavior.

## Operating boundary and remaining work

App Store Connect app ID `6820833544`, bundle `kr.co.manee.app`, company team
`J7AWFKW86N`. The secure browser login has not yet established a signed-in
session. An entered credential form is not login success. The iPhone can use its
own Apple account for TestFlight; it need not sign into iCloud with the developer
account. MANEE itself uses the existing MANEE owner/employee credentials.

The installed database's new-store gate currently accepts verified Google Play
Production entitlements. Apple entitlement integration, product allocation,
refresh/revocation, paid-store migration policy, Apple catalog/trial validation
and Sandbox testing remain release blockers for paid iOS. Do not bypass the
server gate, activate Apple charges or mark a Sandbox purchase as Production
access. Existing stores were preserved by the Android launch policy and are the
available scope for nonbilling device checks.

The old iOS code implements owner APNs registration and reservation notifications;
Android's staff/business notifications and notification navigation are not
established as iOS equivalents. Confirm and finish that coverage before claiming
Android/iOS parity. APNs/IAP server keys, hosted endpoint configuration and actual
Apple processing/TestFlight availability require fresh verification.

After Apple access and a reviewed upload path are ready: upload the newest signed
build, verify Apple processing, arrange TestFlight access, and check owner/staff
login, session restart, PDF/XLSX save/share, permission/error handling, notifications
and purchase/restore/expiry. Only then prepare the App Store review submission.
