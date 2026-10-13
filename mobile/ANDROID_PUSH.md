# Android push setup (staging only)

The 1.6 APK prepares native FCM support. It does not contain Firebase configuration and does not request notification permission until both client and server configuration agree. The web and iOS paths stay separate. In-app badge counts remain pending task groups, independent of phone notification delivery.

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
