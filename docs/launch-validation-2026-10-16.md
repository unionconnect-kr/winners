# MANEE release validation — 2026-10-16 KST

## Verified checkpoints

- Google Play Console live publishing page: Android 1.22 / code 23 remains in
  review for the South Korea production rollout. Managed publishing is off;
  approval will publish the submitted changes automatically. No resubmission
  or review cancellation was performed during this audit.
- Earlier Android purchase/restore verification and production public checkout
  activation remain valid; do not ask the operator to repeat those purchases.
  Live billing function is ACTIVE v12 with JWT verification enabled. Catalog
  products 1–3 are enabled and the new-store rollout has its existing launch time.
- iPhone 1.0 (1.8.1): signed source 8e419577c7d81066c6913981539c1505a57abaf6,
  archive 38868894387, artifact 12032670482, SHA-256
  8213ab27ed884dbb815c637b88c838428bb9096c41e59089058c6d0fb70151fb.
  Apple upload 38869506606 succeeded. Internal-group connection 38870146530
  verified the processed VALID build in the existing internal QA group.
- Operator physical QA confirms login persistence, file saving, saved location,
  attendance 15:19–15:20 with owner confirmation, staff notification enrollment,
  actual APNs test receipt, and notification tap opening MANEE.
  This does not prove every business event, killed-app receipt or logout case.
- APNs provider signing failed because the configured PEM lost line boundaries.
  Production pushSigningReady changed false→true after 546404c. Build 1.8.1
  preserves enabled consent when a self-test delivery fails. Mobile: 77 passed.
- Live iOS push and billing workers have fresh heartbeats, zero failed jobs.
  The scheduled-worker SQL and routes are installed, superseding the earlier
  blocked checkpoint in ios-scheduled-workers-2026-10-16.md.
- Reservation retention and completed deletion-case retention cron jobs are
  active. All production cron jobs had zero failures in the preceding 24 hours.
- Current main baseline: 346 root tests passed, 489 security tests passed,
  zero failed; 10 environment-dependent security tests skipped. The hosted app,
  config, manifest, worker, CSS, report scripts and Korean font all passed live
  content/type/configuration checks.

## Remaining release gates

- Apple purchase checkout is disabled. All ten DB Apple catalog slots and both
  sandbox/production entitlement flags are disabled; zero Apple receipts exist.
  Do not claim physical StoreKit purchase/restore verification.
- Apple metadata readback verifies three monthly products at KRW 9,900 in South
  Korea. Only store1 has a one-period ONE_MONTH FREE_TRIAL. Store2 and store3
  have no Korean introductory offers. All three remain MISSING_METADATA;
  subscription review screenshots are absent. Do not confuse product presence
  with approved or device-verified billing.
- Apple Business was checked after secure login: existing free/paid agreements,
  banking and tax forms are active. An updated Paid Applications Schedule needs
  acceptance. The operator explicitly approved acceptance on October 16. The
  checkbox and Agree action were applied, but Apple opened additional two-factor
  authentication. Two secure-auth handoffs ended with user takeover and the
  rendered code-entry screen remained pending. Contract acceptance is NOT yet
  verified. Never copy a verification code supplied in chat into the browser.
- Existing privacy answers were published after explicit operator approval,
  with nine linked-to-user data types,
  used for App Functionality: name, phone, user ID, device ID, other financial
  info, precise location, photos/videos, other user content and purchase history.
  Publication explicitly binds the company to accuracy, legal compliance and
  updates. The final Publish action completed, its dialog closed and the Publish
  button became disabled.
- App download pricing was missing and has been configured as free with KOR as
  the base territory; subscription prices stay KRW 9,900. South Korea-only
  availability was saved after explicit operator approval. Readback shows
  대한민국 / 앱 출시 후 사용 가능; other territories are unavailable. The earlier
  automatic approval rejection is resolved by that explicit approval.
- After privacy publication and price setup, Apple’s app preflight passed.
  App 1.0 (1.8.1) was added to the submission draft and now shows 심사 준비됨.
  The draft’s final 심사를 위해 제출 action has NOT been clicked. This is not
  submission, approval or public launch. Screenshot count alone does not prove
  display-family coverage or subscription-paywall screenshot completeness.
- The first subscription review note now explains exact Korean monthly pricing,
  first-store trial eligibility, separate additional-store products, restoration
  and management paths, and separation of demo access from actual purchase.
  First group Korean display name/description, South Korea-only availability,
  disabled Family Sharing and disabled multi-seat purchasing were verified.
- First subscription Add for Review preflight explicitly failed with
  심사 정보 스크린샷을 추가해야 합니다. The actual iPhone purchase/paywall
  screenshot remains required; marketing or Android purchase images are not
  substitutes for this missing iOS review evidence.
- IOS_PRIVACY_URL and IOS_TERMS_URL were saved in Netlify for Production /
  Functions only, using the existing manee.co.kr privacy policy and Apple
  standard EULA. No secret scopes, keys or purchase gates were changed. The
  next production deploy applies these links; device link QA remains pending.
- Public App Store launch and Google approval are not yet verified.

## Release corrections verified in production

- PR #42 (9d5e680): Apple billing now shares the proven APNs PEM normalization.
  ES256 tokens were verified using Apple’s official Node library for seven PEM
  formats; malformed/non-P256 keys fail with bounded errors. Production health
  confirms billingSigningReady=true and pushSigningReady=true. This confirms
  local signing format only, not Apple API authorization or completed purchases.
  Malformed notification JWS remains rejected with HTTP 409 purchase_mismatch.
- PR #43 (35bf711), preparation run 38893346343 / job 116947880436: App Store
  version 1.0 now selects VALID 1.8.1 (build ec48f8e9-9090-4297-a579-9e99048036cc).
  Production and sandbox notification URLs point to the existing verified-JWS
  handler using V2. Complete review credentials/contact were copied only from
  this exact app’s existing Beta review record and read back successfully.
  No credentials or contact values appear in code or workflow output.
  Review notes now reflect verified attendance/notification behavior, explain
  the demo expiry and separate demo access from unverified StoreKit purchases.
- PR and main verification workflows passed security/concurrency, production and
  staging build checks. Apple audit 38893012736 verified actual Korean trial
  linkage after explicitly including territory in the offer query.

## Continuation after operator confirmations

1. Complete Apple’s additional two-factor authentication and read back the Paid
   Applications Schedule status. The privacy/territory approvals and changes
   are complete; do not ask for those confirmations again. Preserve 1.8.1 and
   the existing synthetic review account and submission draft.
2. Complete subscription review screenshots and notes, check required display
   families, and enable only the intended sandbox/catalog checkout configuration.
3. Perform physical TestFlight StoreKit purchase/restore and entitlement lifecycle
   QA; confirm no cross-store/platform leakage, then prepare production gates.
4. Re-run Apple submission preflight and proceed with app + subscription review
   only once device billing and metadata gates pass. Google remains an existing
   review awaiting approval; do not cancel/resubmit it merely to refresh status.
5. Verify public store listing and installation after approval before calling the
   launch complete. Demo access expires October 23; reassess if review extends.
