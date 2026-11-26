# MANEE 7-change test release — 2026-11-26

## Built artifacts

- Android 1.63 / code 64, signed release APK and AAB: workflow run 45772110405, source c967385cba428ec88393c4ce5258a7a0995bd938.
- iOS 1.58 / 158.4.1: workflow run 45771825461, source 80914d53964b359c81515fa8bf0f83fc53b413ff. Apple VALID, IN_BETA_TESTING, existing internal QA group connected. No App Review submission.
- APK SHA256: df6a4397629646e2610a0b02e04a2ab0e233916e261e22110199d74dcdfff8d2.
- AAB SHA256: 4098f35ef5d13a56fe3d9f550ce9e4e52b6c7028a09ecb51b2f663d1d5b7fae0.
- APK uses the upload certificate (5a6453520eff849365705342f563d6d55902a0047a6900cc70b977603cea9040), not the Google Play app-signing certificate. Do not ask the user to uninstall their existing Play app to install it.

## Scope and state

1. HQ per-user/device versions, build, last seen, version counts and filter: implemented in manee-admin draft PR 21. Not deployed.
2. Store title: prepared as “매니 - 우리가게 매니저” in build metadata. Google listing already used this title. iOS App Store metadata still requires the next submission step; no live listing change was made in this batch.
3. Quiet startup version checks and one-time update notes: packaged in both native builds. Mandatory-update policies remain disabled on both platforms while test-only.
4. Sales-authorized manager work confirmation: explicit :00/:30 pay start/end per employee, preserve raw clock times, compare-and-set and owner activity. Manual attendance also stays unconfirmed until approval. Backend staged only.
5. Manager wage/payroll/adjustment/tax/insurance changes: actual successful changes produce before/after owner activity; no-op and failure produce no event. Payroll requires reconfirmation after relevant changes. Personal data and manager grants remain owner-only. Backend staged only.
6. Active payroll and export exclude retired staff. Retired detail has month history and final settlement; historical store labor totals retain incurred retired pay. Packaged in both builds.
7. Clock-in/out confirmation: only confirmation persists; X/back/Escape cancel; duplicate tap and account/store changes guarded. Packaged in both builds.

## Verification

- Root app/security: 1,174 passed, zero failed; 12 intentionally skipped without separate rehearsal environments.
- Five real PostgreSQL concurrency suites passed separately in CI.
- Mobile: 343 passed, zero failed.
- HQ: 40 passed, zero failed.
- Focused UI/database/manager cases: 18 passed (overlap the preceding suites).
- Both signed packages validated in CI; downloaded APK assets and artifact digest validated locally.
- No physical-device QA has been performed for this batch. Headless visual inspection was unavailable locally; do not claim it passed.

## Backend rollout and approval block

- Staging obpkzecgswnfuyhwvncd has both migrations:
  - supabase/migrations/20261126062207_manager_work_and_device_versions.sql
  - supabase/migrations/20261126093000_manager_confirmation_retry.sql
- Production bhwuuxcrzxespkjlmqxr does NOT have these migrations. Native test builds point to production and the new work/pay/version RPCs cannot be tested with real accounts until this backend rollout completes.
- Android delivery worker was deployed to staging v8 and production v9, preserving its production authentication/environment guards. No synthetic notifications were sent to real devices.
- iOS worker changes are isolated in winners draft PR 83 (two message-forwarding lines); preserve the latest production billing-ledger code. Do not merge the whole app test branch into main.
- Automated approval review rejected moving winners main to 8961a127fbb36d05937bc4263a228cda0c2030b1 because that can trigger production deployment beyond test-first APK/TestFlight authorization. No workaround or indirect production deploy was attempted. Await explicit user approval for server/HQ rollout; then re-read branch heads and use CAS.
- Do not mark the new server-dependent features as ready for real-account testing before rollout. Do not enable mandatory updates or submit production app reviews as part of the pending backend-only approval.
