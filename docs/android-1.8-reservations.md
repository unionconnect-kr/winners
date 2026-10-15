# Android 1.8 reservation fixes — 2026-10-13

- Reservation creation/cancellation wakes the staging delivery worker after commit through pg_net, with minute cron as fallback. The explicit scheduler active flag is respected. A wake failure cannot fail the business save.
- New `reservation_due` events show “예약 손님이 오실 시간이에요. 예약 내용을 확인해 주세요.” The scheduler catches reservations due in the preceding five minutes, including minute and midnight boundaries; messages expire ten minutes after appointment time. Cancellation and schedule changes invalidate pending notices. Upcoming reminders remain separate.
- Observed reported cases: reservations saved at 22:36:30/22:37:42 for 22:37/22:38 received creation notifications on the next minute. No due event existed previously. This is now a separate event with correct wording.
- Single-store owners see their store name as static header text and enter work without a store-choice overlay. Multiple-store selection is retained.
- Shared owner/staff reservation form uses AM/PM plus numeric hour/minute text inputs, retaining a canonical 24-hour value and validating noon/midnight and ranges. Empty time remains optional; partial time is rejected. No clock-picker interaction is required.

Validation: 63 related tests passed; signed staging APK build and APK verifier passed; signing certificate matches 1.7, versionCode 9 / versionName 1.8-android-test. Live staging transaction verified creation and due queues, immediate HTTP enqueue, and cancellation invalidation, then rolled back without sending fixture notifications.

Headless visual smoke check could not run because the execution environment denied browser socket creation. Physical keyboard display and new due-message receipt remain for phone verification.

Worker v2 and migration applied to staging only. Existing GitHub publication approval block remains; local changes are committed without pushing.
