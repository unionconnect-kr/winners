# Android push setup (staging only)

The 1.7 build includes Android client configuration for the company-owned Firebase project `manee-staging`. The preceding 1.6 APK had no Firebase client configuration. Notification permission is requested only when both client and server configuration agree. The web and iOS paths stay separate. In-app badge counts remain pending task groups, independent of phone notification delivery.

## Connection checkpoint — 2026-10-13

- Created `manee-staging` under the Union Connect company Google account on the Spark plan. Google Analytics and Gemini were not enabled during project setup.
- Registered Android package `kr.co.manee.app.staging`, app ID `1:539826260421:android:fdd950d3e1aeb974ece3ac`, project number `539826260421`.
- Downloaded the client configuration from Firebase Console and validated it before placing it in the gitignored app configuration path.
- Confirmed Firebase Cloud Messaging HTTP v1 is enabled in Firebase Console. Mobile tests (20), a clean signed Android debug build, and the APK package/permission check passed with this client configuration.
- Server service-account credentials have **not** been connected yet. A configured client alone must not report push delivery as ready. Physical-device receipt and automatic event delivery remain unverified.
- Browser key generation requires explicit user approval. The available Firebase service account is `firebase-adminsdk-fbsvc@manee-staging.iam.gserviceaccount.com`; it is an Admin SDK account, not a verified send-only account. Google Cloud IAM returned “Site Unavailable” in this browser, including after one reload, so its exact roles could not be inspected or narrowed. Do not describe its key as push-only.
- The staging Supabase Secrets page redirects to sign-in in this browser. Complete secure company-account sign-in before writing `MANEE_ANDROID_FCM_SERVICE_ACCOUNT`; do not paste the key into chat or source files.

## Required external configuration

1. Register the staging Android application `kr.co.manee.app.staging` in a Firebase project. Download its `google-services.json` to `mobile/android/app/google-services.json` (gitignored). The build validates package and project identity. Never put a service-account private key in this file or the APK.
2. Enable the Firebase Cloud Messaging HTTP v1 API. Set the service account JSON in **staging Supabase Edge Function secrets** as `MANEE_ANDROID_FCM_SERVICE_ACCOUNT`. Give that account FCM send permission for this Firebase project. Do not add its JSON/key to git, chat, APK assets or logs.
3. Migration `20261013103655_native_android_push.sql` and Edge Function `manee-android-push` were applied to staging `obpkzecgswnfuyhwvncd` on 2026-10-13. The function explicitly rejects production project URLs. The gateway JWT switch is off because the handler validates the bearer with `auth.getUser()` then checks the live session and current owner membership via RPC before returning status or sending anything.
4. Rebuild using `npm ci`, `npm test`, `npm run apk:staging` in `mobile/`. Use the original local debug signing key for an in-place update; a fresh CI runner's random debug key is not interchangeable.
5. On the test phone, enable alerts in 더보기 > 매장 설정. Then 테스트 앱 안내 > 테스트 알림 보내기 sends a fixed generic notification only to the authenticated current device. Test foreground, background, app restart, permission denial, disable and logout. This has **not** been performed on a real phone yet.

## Boundaries

- FCM tokens are case-sensitive, kept in a private RLS-enabled table and bound to an auth session. Clients cannot list other devices. Token rotation replaces this session's row; attempts to take another account's token fail.
- No direct table policies are deliberately provided: all direct anon/authenticated privileges are revoked. SECURITY INVOKER public wrappers call narrowly authorized private RPCs. `rls_enabled_no_policy` is informational for this private RPC-only table ([linter reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
- Test delivery uses only the current live session/owner/store, a 30-second database cooldown and a fixed staging package. Caller-supplied token, recipient, title and body are ignored. Message text contains no staff, customer or financial information.
- Logout/disable removes the session registration. Future event senders must use the service-only `manee_android_push_targets` RPC, which rechecks active memberships, profiles and live sessions at send time.
- Attendance/reservation/month-end automatic delivery is **not wired yet**. Enable event delivery only after Firebase and physical-device testing, with the same session checks and explicit staging/production separation.

Official references: [Capacitor Push Notifications v8](https://capacitorjs.com/docs/apis/push-notifications), [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api).
