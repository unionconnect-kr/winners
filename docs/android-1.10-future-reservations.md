# Android 1.10 future reservations

The owner reservation screen now displays the selected store's future bookings below today's bookings. Future rows are sorted by date and time, include date, time, customer name and party size, and use the existing confirmation-based cancellation flow. Today's stale cache entries are excluded from the future list. The all-store overview retains its existing today-only scope rather than misrepresenting one store's future cache as all stores.

Future booking confirmation no longer promises delivery of a notification regardless of device consent or whether a time was supplied. Existing Android server reminders and cancellation triggers are unchanged.

Validation: Node tests cover future-save state, chronological rendering, empty today list, escaped customer text, store scope, confirmed cancellation, and failed/unconfirmed deletion retaining the booking. PGlite executes the existing migrations and verifies that deleting a future booking skips registration and advance reminders and prevents a new arrival reminder at the scheduled time. No live bookings or production backend changes were required.

The user confirmed notification tap navigation from version 1.9 on 2026-10-13. At 23:18 KST, device screenshots confirmed version 1.10 future booking visibility, cancellation confirmation, removal from the list and receipt of both registration and cancellation push notifications. Browser rendering cannot run in this environment because Chrome startup is blocked by socket permissions; the supplied device screenshots provide visual evidence for this reservation flow.

Release: 65 targeted tests passed; staging APK verifier passed. Confirmed versionCode 11 / 1.10-android-test, unchanged signing certificate and future-list code in the packaged assets. Source remains local under the existing GitHub publication approval restriction.
