# Android 1.9 notification navigation

Notification taps now open the permitted store's reservation screen, attendance date, monthly report month, cost review, or push settings for a test message. Foreground receipt alone never navigates.

The listener attaches when the native bundle loads. Capacitor 8.5.3 BridgeActivity forwards the initial launch intent, and PushNotifications 8.1.2 retains action events until a listener attaches. Pending taps wait in memory for login/store restoration, expire after ten minutes, deduplicate by event ID and are cleared on logout. No URL or notification body can control navigation. An in-flight tap is invalidated by account change, logout or a newer tap.

The app resolves stores from the current authenticated owner list and revalidates access with `manee_android_push_context` before loading data. Unsaved forms ask before closing. An existing confirmation is not overwritten. The selected store's reservation list is displayed when several stores are owned.

The private service-only claim RPC adds month/date routing metadata from committed report/attendance records. No customer, employee or financial details are added to notification data. Staging worker version 3 and migration 20261013140349 are applied.

Validation: 41 targeted Node/PGlite tests passed, including cold-launch queue, login readiness, duplicate taps, account invalidation, unknown payloads, role/membership rejection, unsaved forms, report month resolution, existing FCM/registration/build contracts, and script parsing. Live staging claim executed inside a rolled-back transaction. APK verifier passed; versionCode 10 / 1.9-android-test, signing certificate matches 1.8, native action listener and route handler present in packaged assets.

Physical device validation remains: after updating, tap a reservation notification from the phone home screen, and repeat after dismissing the app from recents. Confirm that the reservation screen opens directly. Source changes remain local pending the earlier GitHub publication approval block.
