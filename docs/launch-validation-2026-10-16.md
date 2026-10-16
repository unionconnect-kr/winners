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
- Current main baseline: 344 root tests passed, 489 security tests passed,
  zero failed; 10 environment-dependent security tests skipped. The hosted app,
  config, manifest, worker, CSS, report scripts and Korean font all passed live
  content/type/configuration checks.

## Remaining release gates

- Apple purchase checkout is disabled. All ten DB Apple catalog slots and both
  sandbox/production entitlement flags are disabled; zero Apple receipts exist.
  Do not claim physical StoreKit purchase/restore verification.
- Current Apple product metadata, South Korea KRW 9,900 monthly pricing, first
  product one-month FREE_TRIAL, screenshots/reviewer login and selected review
  build must be read back from Apple before changes or release activation.
- The account holder must review any outstanding Apple agreement. No agreement
  is accepted by the audit workflow. The read-only audit excludes credentials,
  reviewer contact values and arbitrary provider response bodies from its logs.
- Public App Store launch and Google approval are not yet verified.

Follow-up results are recorded in the reviewed release changes once verified.
