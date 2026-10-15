# Android business notifications — staging

Deployed to `manee-staging` (`obpkzecgswnfuyhwvncd`) on 2026-10-13.
Worker: `manee-android-delivery`, version 1. Compatible with installed Android 1.7.

## Events

- New check-in and first check-out, for today/yesterday business dates. Confirmation/time-only edits do not notify.
- Reservation creation/cancellation for today or later; reminder within 30 minutes before its scheduled Korean time.
- Monthly report closing/revision.
- Unfinished monthly cost review: D-7, D-3, last day, or snoozed date, from 10:00 to 21:00 KST. Requires sales in that month.

Recipients are currently opted-in **owners**, matching the Android registration contract. Staff and manager device registration is not enabled by this change.
Messages have generic fixed content without employee/customer names, phone numbers, financial figures or memos.
Tapping a notification opens the existing app; section-specific routing is not implemented.

## Delivery and access

Committed row changes enqueue private per-device deliveries; a rolled-back transaction cannot send.
The minute scheduler uses a random bearer generated in Vault. The worker uses the runtime service key to verify that bearer in the claim RPC. No key values are stored in source or returned in HTTP responses.
Claims recheck current owner membership, active profile/user, live session, store and device consent. Pending deleted/rescheduled reservation reminders and completed/snoozed cost reviews are skipped.
Each delivery is leased for two minutes, retried up to four attempts, and expires. FCM UNREGISTERED removes the invalid device; other failures retain it. Stable notification tags reduce visible duplicates if delivery succeeded but recording the result failed. Delivery is at-least-once, not exactly-once.
The ledger is retained for 14 days. Existing browser/iOS notifications and reservation flags are independent.

## Deployment controls

The scheduler migration creates the cron job **inactive**. Enable it only on staging after worker deployment and smoke checks:

```sql
select cron.alter_job(jobid, active := true)
from cron.job where jobname = 'manee-android-business-push';
```

Staging was activated after checks. To pause delivery, use `active := false`.
The worker also requires the exact staging Supabase URL and Firebase project, and restricts FCM delivery to `kr.co.manee.app.staging`. Do not activate this scheduler in production.

## Validation

- 15 Node/PGlite tests passed: actual queue/trigger SQL, rollback, deduplication, role/bearer isolation, live recipient revalidation, cancellation/rescheduling, monthly schedules, lease/retry/expiry, fixed FCM payload, Deno Buffer regression, original registration tests.
- Live staging reservation insert/delete transaction verified the registered device recipient and cancellation invalidation, then rolled back; no reservation or notification remained.
- Live Vault-authenticated pg_net → Edge → service RPC request returned HTTP 200 with zero claimed jobs.
- Security advisor: delivery table RLS/no-policy is intentional because direct access is denied. Existing public ratio/subscription definer warnings and disabled leaked-password protection were not changed.
- Next device check: create one test reservation, return to phone home, verify “매니 · 예약 등록” after the minute scheduler. Device receipt of this business notification is not yet verified.

Source changes are committed locally. Remote publication remains pending the prior automatic approval block on git push; server deployment is already applied.
