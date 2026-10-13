# Android Play release preparation — 2026-10-14

User decision: proceed toward Android/iOS launch, deferring optional physical GPS,
long background-session and missing historical-backup checks. These are not passed.

## Confirmed console state

- Company Play Console sign-in succeeded; app `kr.co.manee.app` exists as a draft.
- Store setup is 10/11 complete. Data Safety has prefilled answers but has not been
  finally saved. Its assertions need to match the final production binary.
- Play App Signing is already enabled. No upload-key certificate is registered;
  the first uploaded bundle will establish it.
- No subscription products exist. The console requires an APK/bundle with Billing
  before allowing subscription creation.
- Agreed offer: KRW 9,900 per store per month (VAT included), one calendar month
  trial, store-managed consent/renewal. Added stores are also KRW 9,900.

## Implemented in this change

- Native Google Play Billing bridge: live product/offer pricing, checkout,
  purchase queries, cancellation/pending states, and update events.
- Android billing coordinator: owner context checks, duplicate checkout lock,
  interrupted purchase recovery, and mandatory server verification.
- Server verification core: fresh Google API lookup, opaque owner/store binding,
  production/test separation, expiry/hold handling and acknowledgement only after
  durable persistence. API and database adapter are not activated.
- No client-side entitlement or acknowledgement. A client receipt alone cannot
  activate access. No purchase button is enabled by this preparatory change.
- Upload keystore files and passwords are excluded from Git.

## Remaining implementation and external configuration

1. Google Play Developer API authorization for a server identity, durable purchase
   binding, server-side acknowledgement, renewal/refund processing, and entitlement
   enforcement. The Firebase FCM private key is not an Android upload signing key
   and does not itself prove Play Developer API permissions.
2. Verify the production FCM credential, configure the production enable flag,
   and then enable/verify the scheduler. Push functions and required database
   migrations are deployed; client registration is complete (updates below).
3. Release signing key and production AAB pipeline. Existing release guards remain
   in force while release prerequisites are missing.
4. Create subscription base plan and one-calendar-month trial after first eligible
   bundle upload; verify real Play sandbox purchase/restore. Multi-store purchase
   allocation must work on both Android and iOS before purchases are enabled.
5. Final Data Safety/privacy/account-deletion consistency, store review submission.

The existing 862 checks describe the test app. They are not evidence that Play
billing, production FCM, signing or store review are complete. The new billing
coordinator has 10 focused automated tests and the server verification core has
8 tests. Native compilation is a separate gate.

Local compilation could not download the new Billing dependency because this
workspace cannot reach Google Maven. Remote Android build run 38430394788 is used
to resolve and compile that dependency without bypassing network restrictions.

Remote run 38430394788 compiled the Billing 9.1.0 plugin successfully. Its package
verification failed because the former test-app checker prohibited BILLING. The
checker now explicitly requires Google's Billing permission while retaining all
other permission restrictions and staging isolation. A follow-up run verifies
the complete package; this is not a store purchase or production release test.

Follow-up run `38431273854` completed successfully: regression/concurrency job,
native compilation, APK verification and artifact upload all passed.

## Production Firebase preparation — 2026-10-14

- Company account `union71388@gmail.com` was explicitly approved and verified in
  Firebase. It initially had only `manee-staging`.
- Created `manee-production`, project ID `manee-production-3eafa`, on the Spark
  (free) plan. Optional Gemini, Analytics and Developer Program enrollment were
  not selected.
- Registered Android package `kr.co.manee.app`, nickname `매니 Android 정식`.
- Downloaded and validated its client configuration. No private server key was
  generated, no IAM permission granted, and no production notification sent.
- Client configuration validator now pins project **and** package per environment.
  Production requires a configuration; staging may still build without FCM.
- Server push and scheduled-delivery code now select their project and package
  from the server deployment. Production additionally requires
  `MANEE_ANDROID_PRODUCTION_PUSH_ENABLED=true`. A staging credential cannot be
  used against the production backend, or vice versa. This code is not deployed.
- Google Cloud's linked service-account page displayed `Site Unavailable / Unable
  to access this site`, including after one reload. This is a current browser
  access failure, not evidence of an account ban or global Google outage.
- Dedicated least-privilege production FCM and Play API identities are still
  required; do not substitute the broadly privileged Firebase Admin SDK account
  merely because the IAM screen is inaccessible.
- Validation: 24 focused push/config/database tests and all 37 mobile tests passed
  (4 config tests overlap). Nine new tests cover environment isolation and the
  production payload. This is **not** proof of a live production push or purchase.

Release build guards remain enabled. APK 1.12 remains the last user-delivered test
build. Production signing, billing integration, subscriptions and review remain
unfinished; no additional phone reinstall is needed for this infrastructure work.
## Production push infrastructure — 2026-10-14 KST

- The user reports saving
  the dedicated FCM JSON in `MANEE_ANDROID_FCM_SERVICE_ACCOUNT`. The secret value
  has not been retrieved, and successful Google OAuth/FCM authorization is not yet
  verified.
- Applied the five Android push migrations to production, followed by
  `android_push_scheduler_project_routing`. Stored the production destination in
  Vault as `manee_android_project_url`. The dispatch credential remains in Vault.
- Deployed `manee-android-push` and `manee-android-delivery` version 1. Both perform
  custom authentication: the former validates live owner sessions; the latter
  checks the separate scheduler credential through a service-only database RPC.
  No temporary diagnostic function was deployed: automatic approval review
  rejected that approach and the regular release functions were used instead.
- Verified production has zero registered Android devices and zero queued
  deliveries; the scheduler is disabled. Both private tables have RLS and deny
  direct client access. Anonymous registration and authenticated-user delivery
  claims are denied; service-role claims remain available to the worker.
- Live unauthenticated checks: push returns 503 `push_not_ready` while gated;
  delivery returns 401 `unauthorized`. The production enable secret still needs
  to be configured/verified before enabling the scheduler. No production push
  has been sent, and no new APK/AAB has been delivered.
- Validation: 20 existing Android push tests passed; an additional executed SQL
  test checks staging/production routing, unknown URL rejection before side
  effects, and scheduler execution grants. Security advisors report the two
  deliberately RPC-only private tables as INFO (RLS without policies), plus
  unrelated existing function/password-protection warnings.

## Production activation and internal AAB path — 2026-10-14 02:40 KST

- The user set `MANEE_ANDROID_PRODUCTION_PUSH_ENABLED=true`. The live push
  endpoint now returns authentication-required rather than push-not-ready.
- The production delivery worker accepted its existing scheduler credential and
  returned HTTP 200 with claimed/sent/retry/expired/unrecorded all zero. This
  verifies credential parsing, production routing and worker DB access, NOT
  Google OAuth/FCM authorization or delivery to a handset. There are zero devices.
- Enabled cron job 2 (`manee-android-business-push`) at one-minute intervals.
- Added an explicitly internal-only production-backend AAB build path. Debug and
  release check their respective backend/Firebase assets before packaging.
  Release requires a dedicated upload keystore and never uses debug signing.
- Added a manual `android-internal-bundle.yml` workflow with the
  `android-play-internal` environment. It builds and verifies the bundle but
  does not upload to Play, enable checkout or publish a release.
- Required CI secrets: `MANEE_ANDROID_UPLOAD_KEYSTORE_BASE64`,
  `MANEE_ANDROID_UPLOAD_STORE_PASSWORD`, `MANEE_ANDROID_UPLOAD_KEY_ALIAS`,
  `MANEE_ANDROID_UPLOAD_KEY_PASSWORD`, `MANEE_ANDROID_FIREBASE_PRODUCTION_JSON`.
  Required public environment variable: `MANEE_ANDROID_UPLOAD_CERT_SHA256`.
  The keystore/passwords have NOT been generated or registered by this change.
- `npm run build:android:internal` and Capacitor sync succeeded against the
  existing production Firebase client configuration. The release verifier
  correctly stopped at the missing upload keystore. No signed AAB exists yet.
- Play server identity, durable purchase adapter, renewal processing and
  per-store entitlement enforcement remain unfinished. Existing Play code
  restores any owned matching product, so it cannot yet sell that same product
  separately to another store. Do not activate checkout or represent the
  internal setup bundle as the completed public paid app.

### Upload key and local build outcome

- Generated a dedicated 3072-bit RSA upload key (alias `manee-upload`, PKCS12,
  10,000-day certificate). It is not the Google-managed app-signing key.
- Saved the private recovery archive as `MANEE_PRIVATE_upload-signing-backup.zip`
  (Library id `libfile_377c725907dc819185237b5f3fb80f5a`). It contains the key,
  passwords and public certificate and must remain company-private. No secret
  values or private key files were committed to Git.
- 41 mobile tests passed, including the real production web build and three new
  guard tests. Production native sync and signing-input checks succeeded.
- The local Gradle bundle build stopped because Google Maven was unreachable for
  `com.android.billingclient:billing:9.1.0`; no signed AAB was generated.
- The prepared GitHub internal-bundle workflow still needs its secure values
  configured. GitHub connector tools in this session do not offer secret writes.
  No public rollout, Play upload, subscription activation or checkout occurred.
- Production cron has now executed successfully on consecutive minutes. This
  does not change the unverified Google OAuth/FCM or handset-delivery status.

## Signed internal bundle completed — 2026-10-14 03:10 KST

The user registered five repository secrets and the public certificate variable.
The first run reported a missing keystore value; after the user corrected it,
run 38443746525 attempt 2 succeeded: 41 mobile tests, production web build,
Gradle release bundle signing, AAB asset/certificate verification and artifact
upload all passed. No signing values were printed or committed.

Artifact `manee-play-internal-setup-aab` (11837147648) contains the signed AAB.
Downloaded artifact ZIP SHA-256:
`72d5229cb67b62a803873b1500b22174292bd74e1736d6928619ff2137e045c4`.
This is a production-backend bundle for Play internal setup only. Checkout is
still disabled. No Play Console upload, subscription creation, billing-server
activation or public rollout has occurred. Multi-store billing and live Google
FCM authorization/delivery remain unverified.

Workflow: https://github.com/unionconnect-kr/winners/actions/runs/38443746525

## Play Console and billing status endpoint — 2026-10-14 KST

- User uploaded internal setup AAB code 13, version 1.12. Internal rollout is not
  confirmed. Product `manee.store1.monthly`, base plan `monthly`, KRW 9,900/month
  and `trial-1month` (one month, first app subscription only) are activated per
  user confirmation. Internal/ license tester list contains one account.
- Dedicated identity `manee-play-billing@manee-production-3eafa.iam.gserviceaccount.com`
  was created and invited for the MANEE app. Screenshot shows four permissions,
  but their exact detail is not visible. User reports saving its JSON as
  `MANEE_GOOGLE_PLAY_SERVICE_ACCOUNT` in production Edge secrets. No secret value
  has been read or printed. API enablement was instructed, not independently verified.
- Deployed `manee-android-billing` v1 with platform JWT verification plus live
  session, current owner membership, banned-user and archived-store checks.
  Status reads the fixed Play subscription and checks its active monthly Korean
  base plan. Access is rechecked after Google returns. It never grants entitlement.
- `prepare` and `verify` remain closed. The current app does not invoke this new
  endpoint. Actual Google OAuth/Play permission success remains unverified because
  no authorized owner session was used; anonymous HTTP requests return 401.
- 25 focused endpoint, verification-core and client coordinator tests pass.
  The Edge bundle uses an ESM copy of the CJS core, with an exact source parity
  test (the deployment bundler rejected CJS imports before the successful deploy).
- Still required: durable token/store binding, renewal/refund processing,
  multi-store billing design and implementation, client wiring and real sandbox
  purchase/restore tests. No checkout enablement or public rollout occurred.
