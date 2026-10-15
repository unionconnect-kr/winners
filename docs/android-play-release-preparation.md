# Android Play release preparation — 2026-10-14

## Current release gate — 2026-10-15

Latest internal release: the operator selected restricting attendance input
on subscription expiry. Android 1.21/code 22 includes matching staff/access-screen
and pre-purchase copy plus the attendance/edit-request billing migration;
see `store-billing-write-gate.md`. Signed candidate run `38715814211` succeeded
from `c06a0a350c3e8db28c4d9c0e0e41f046a279f27c`. Its AAB SHA-256 is
`312f14fd0e0d6eb4dc9eff3a13d976f5940bde33f13f3033ae1b46ff3fd1aca7`.
The exact artifact was published to Play internal testing on 2026-10-15 at
18:56 KST. Play displays latest 22 (1.21), active, available to internal testers.
Both environments have the attendance gates and zero enrolled stores. The five
source CI workflows also succeeded. User screenshots now confirm Play-installed
1.21, Songcheon's active subscription display, the expiry explanation and a
successful purchase restore/server verification at 21:17 KST. App restart and
actual expired attendance on the handset remain unverified. The payroll-setup
follow-up passes 927 root checks (917 pass, 10 skips, zero failures) and is
installed on Staging and, after the user's explicit 21:29 KST approval, Production.
Postflight confirms the new trigger, no direct client execution and zero enrolled
stores. Songcheon remains write-enabled with three open shifts. All five CI
workflows for the payroll follow-up `87d34c0` succeeded. The Android 1.21 binary
is unchanged.

The approved bounded expiry test ran on Songcheon at 21:45:51–21:49:52 KST.
The operator SQL probe confirmed attendance-trigger P4402 rejection and rolled
back without changing records. The prevalidated recovery timer succeeded and
removed itself; postflight confirmed zero enrollment, write access restored,
three open shifts preserved and the Production receipt still ACTIVE. At 22:03
KST the operator supplied handset screenshot `1000005335.jpg`: Songcheon shows
“매장 이용권 이용 중”, a confirmed Google Play subscription and no input restriction.
This establishes the post-recovery handset display. It does not show the
temporary expired screen, an employee write attempt or the app restart itself.

Play internal testing has accepted Android 1.19/code 20. The pilot owner
completed a real Play subscription for one store, and the handset reports it
active while the owner's second store remains unsubscribed. This is useful paid
checkout and store-isolation evidence, not evidence of public availability or
expiry enforcement. The installed 1.19 build predates the changes below.

The review branch now prepares Android 1.20/code 21 with an in-app account
deletion request link; a public web form, private request queue, and support
operation note are included. Local request/RLS and billing gate tests pass.
Both additive migrations are installed on Staging and Production. Production
postflight initially found zero deletion requests and zero enrolled stores; anon and
authenticated roles cannot read the queue or call the submission RPC, while
service_role can submit. The fixed-cost function contains the entitlement skip.
The public deletion page and intake function are live after narrow PR #23;
signed Android 1.20/code 21 AAB was uploaded and published to the existing
internal track on 2026-10-15 at 18:08 KST. Play displays latest release
21 (1.20), active, available to internal testers. The operator supplied a handset
screenshot of the working deletion page. It does not show the installed native
version, so full 1.20 handset acceptance remains pending.

PR #24 was approved and merged as `de947c38` on 2026-10-15. The public page now
shows deletion scope, retention standards, the responsible support department,
and fallback contact links. A live `null` JSON POST returns HTTP 400
`invalid_request`; it creates no deletion case. This corrects the former
unhandled null payload. The public page was also checked in the browser.

Google Play requires an in-app deletion request route and a usable web resource
for an app that supports account creation. The support team's verified erasure
process and Play Data safety answer must be checked before
public review; see `account-deletion-operations.md`.

Deletion operations now include an operator-only, read-only pre/post inventory
and an execution runbook. Seven local PostgreSQL-engine checks pass; schema-only
runs passed on Staging and Production without selecting a customer or changing
data. Four NO ACTION Auth references and retained crew/history copies require
case-specific handling. This prepares the operation; it does not establish a
completed identity-verified erasure or processor/retention consistency.
Official-site version 23 was published successfully at 22:25 KST with online
intake/email fallback, separate Play cancellation and the verified Android
billing/FCM/deletion processing facts. The privacy source was obtained through
the authenticated source workflow after automated public reads failed. Unknown
contracts/retention terms remain pending. All five CI workflows for the inventory
implementation `1ae641a` succeeded; the installed Android 1.21 is unchanged.
The next Staging rehearsal passed nine SQL assertions for synthetic deletion,
session invalidation, blocker handling, retained business data and other-employee
preservation; all fixtures rolled back and independent cleanup counts were zero.
Five additional local rehearsal checks pass, including detection of omitted
personal cleanup and damaged colleague attendance. This is database/session-root
evidence, not real identity verification or a successful Auth/Storage API erasure.

The Production write gate still has zero enrolled stores. The remaining business
write surfaces and subscription lifecycle on a handset have not passed the
release gate. A Production checkout switch grants only exact owner/store pairs;
the Play catalog now has three verified product slots per owner. A public
paid offer now has a separately gated public eligibility policy prepared on
the review branch; it has not been deployed or enabled. Third-store allocation
is tested locally; the third Play monthly plan is active and its server catalog
entry was enabled at 23:19 KST. A live third-store purchase/restore is not claimed.
The original one-month trial is for accounts that have never subscribed to this
app; slots 2 and 3 have ordinary monthly plans. iOS paid access remains disabled.

A fresh live deletion-intake check passed: page HTTP 200, valid and duplicate
submission HTTP 200 with one pending row, invalid input HTTP 400, and no direct
anon/authenticated queue or submission-RPC access. Both exact synthetic cases
(the prior run and this follow-up) were removed; the final queue count is zero.
Production ledger recheck at 2026-10-15 08:37 UTC confirms one nonsuperseded
ACTIVE Production receipt, future expiry, and a fresh verification timestamp.
At that earlier ledger check, the write gate had zero enrolled stores and two
enabled product slots; the 23:19 catalog follow-up above supersedes that count.
Mobile tests pass 64/64 and focused request/billing/access tests pass 29/29.
The earlier navigation approval block was resolved after explicit user approval
of Google's official google.play/business redirect. The user completed Google
sign-in. Play then accepted the exact verified AAB, with only optional mapping
and native-symbol warnings; both internal rollout confirmation steps completed.
Data safety was finally saved on 2026-10-15 after correcting the deletion URL
to the live intake page and adding optional reply-email collection for app
functionality/account management. No partial-data-only deletion feature was
claimed. Publishing overview lists the completed questionnaire among changes
not yet sent for review. The dashboard now shows release tasks rather than the
former incomplete app-setup checklist. At that checkpoint Production was inactive
and its five release tasks were 0/5: countries, release creation, confirmation,
review and publication. The later 1.21 draft/country follow-up supersedes that
setup count. Retention/erasure operations and processor-policy consistency
still need verification before review submission. The
signed-in company account is not a tester; use the already invited tester account
for handset acceptance. No tester permissions were changed. The earlier signed candidate was from
GitHub Actions run 38674564107,
commit c81d059f; the AAB SHA-256 is
`266fcb8ecaafb0a763cf284c79be0e6cc814625c361a692e0b0a1293f37d12cc`.

Next operational sequence: review the larger billing branch and complete the
remaining device evidence for the already installed 1.21; do not request another
1.20 install or paid checkout. Restore/server verification and the post-recovery
owner screen are established. Temporary expiry display, employee-session refusal
and cold restart remain separate evidence gaps. The next operational gates are
support's verified deletion procedure, public checkout and catalog readiness,
the final candidate review, and consistency with Play's declarations. Submit
the Android release for review only after those gates are resolved. Internal
testing is not public release; Play's review/publish outcome is a separate step.

At 22:45 KST the operator chose public paid enforcement for new stores only;
existing stores keep their current access initially. The private inactive rollout
migration and new-store trigger are implemented and installed on Staging and
Production, both unlaunched with zero enrollment.
Rollback-only testing covers the real service-role owner bootstrap and preserves
all prelaunch stores. Root regression is 948 total / 937 passed / 0 failed /
11 environment-dependent skips; the new real-PostgreSQL concurrency gate is
required in Android CI and passed without skipping. Commit `bf521e1` passed all
five CI workflows. Production postflight at 23:02:30 KST preserved all 31 store
rows and Songcheon write access, with no client policy-update or service-role
launch grant. Installation alone does not launch checkout/enforcement,
and the installed 1.21 assets do not change. See `store-billing-write-gate.md`.

### Production candidate preparation — 2026-10-15 late follow-up

The exact internal-track code 22 / 1.21 was promoted into a Production draft,
reusing the existing AAB and Korean release notes without uploading another file.
Initial Console validation had one blocking error: no Production country.
Korea alone was selected and saved to publishing changes, and revalidation
removed that error. Only the same two diagnostic-file warnings remain: missing
R8/ProGuard deobfuscation mapping and native debug symbols. No new app feature,
new tester access or legal agreement was added. This does not complete the
remaining handset/operations gates or imply Google review approval/publication.
The revalidated candidate was saved successfully; Console confirmed the changes
are saved and must be sent separately from publishing overview for Google review.
Neither that review submission nor public publication was performed.

Publishing overview now contains ten unsubmitted changes, including 22 (1.21),
Korea and the saved app-content declarations. Its separate Google quick check
found a review-submission blocker: Korean developer account details. The account
page requires business registration number, e-commerce license number and the
issuing agency. The already-published company business number was entered and
validates, but the form is **not saved**: the last two required fields are empty.
Prior context confirms the company reported that its e-commerce registration
was completed; neither exact license number nor issuer was supplied in the
retrieved records or found by the focused public lookup. Request those two
values from the operator; do not invent them or use a different entity's license.
See [Google's required Korean developer details](https://support.google.com/googleplay/android-developer/answer/3255733).

The operator subsequently supplied the company registry image and explicitly
approved entering/saving the extracted license and issuer at 23:42:41 KST. An
initial automatic approval review had refused image-derived entry without that
direct confirmation; the fields remained empty until approval. The approved
values were entered, all three account fields saved, and Console displayed
saved changes with the save/cancel controls disabled. No personal contact
details from the registry image were copied into the account or repository.

Publishing overview was then checked again: the account-details blocker is gone
and Console now says changes can be sent for review, with the ten-change submit
button enabled. This supersedes the pending-fields blocker above. The ten app
changes are still unsubmitted. Managed publishing is currently disabled, so a
future review submission would lead to publication when Google approves; do not
confuse this ready-to-submit state with review approval or actual publication.
The remaining handset, erasure/retention and complete candidate-review gates
still apply; public checkout and new-store enforcement remain unactivated.

User decision: proceed toward Android/iOS launch, deferring optional physical GPS,
long background-session and missing historical-backup checks. These are not passed.

### Remaining acceptance batch — following company registration save

All five existing workflows for `a8b5dba` succeeded. A browser now verifies the
complete public privacy → deletion guide → signed-out intake connection. No
additional case was submitted. A new local-only Auth/Storage API rehearsal is
prepared in a dedicated workflow; its complete result is pending, not accepted
on the strength of its local target-guard check alone.

The next handset batch uses the already installed Play 1.21 and does not require
another checkout. First fully close/reopen the app and confirm the selected
store/subscription and restore status. Then coordinate a fresh, explicitly
bounded expiry window before testing the expired banner and employee-session
write refusal; the previous window has ended, so testing the currently writable
store cannot supply expiry evidence. Use a disposable test employee/action and
verify no attendance/business record was inserted. Confirm recovery after the
window and reconcile server counts. Do not edit an actual worker's attendance
or use the normal post-recovery screenshot as proof of rejection.

Policy consistency also remains: the public notice says age 14+ but signup does
not collect an age confirmation; Play's saved target group includes age 13+.
Reservation disposal seven days after completion/cancellation is not evidenced
by the actual schema/jobs. Case contacts have a 30-day post-completion standard
but no dedicated completion timestamp/verified disposal mechanism. These are
concrete remaining implementation/operations questions, not completed checklist
items. Existing support ownership is the company 경영지원팀; no new department
selection is needed. Actual review submission/publication and both public billing
activation steps remain pending until the relevant gates and timing are resolved.

## Initial console state (2026-10-14, before the paid pilot)

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

## Durable purchase binding — 2026-10-14 04:04 KST

- Added `android_billing_purchase_binding` migration to staging and production.
  Private rows bind each Google token to one owner/store/environment. Only the
  service RPC writes; clients cannot read tokens or write purchase records.
- Linked tokens are tombstoned atomically, including unseen predecessors. Late
  restores and stale verification results cannot reactivate an old token.
  Ownership/binding conflicts fail before acknowledgement. Owner membership,
  profile status, account ban and archived store are checked at persistence time.
- Google observation ordering now uses request start time, preventing a slow
  old response from overwriting a newer cancellation. The informational owner
  snapshot excludes superseded rows and expires freshness after 15 minutes.
  It is not yet wired into application-wide entitlement enforcement.
- Server v2 includes the sandbox-only persistence adapter, with owner checks
  before verification, before persistence and before returning. Production
  receipts are rejected before persistence/acknowledgement in this path.
  Verification requires BOTH `MANEE_ANDROID_BILLING_SANDBOX_ENABLED=true` and
  explicit owner UUIDs in `MANEE_ANDROID_BILLING_TEST_USERS`; neither was set.
  `prepare`/checkout remain disabled for everyone.
- 36 focused tests pass, including real local PostgreSQL-engine cases. Staging
  and production rollback tests confirm RPC grants, writes, stale rejection and
  linked replacement. All synthetic remote purchase rows were rolled back.
  Advisors flag the deliberately private RPC-only table as RLS-without-policy
  INFO; pre-existing unrelated warnings remain. No new exposed-definer warning.
- Still not verified: real Google credentials/API permissions, phone purchase or
  restore, multi-store purchase flow, renewal/refund event delivery. Automatic
  lifecycle refresh and application entitlement enforcement remain unfinished.

## Lifecycle queue and authenticated RTDN receiver — 2026-10-14 KST

- Deployed `manee-billing-refresh` v1 and `manee-play-notifications` v1.
  The former authenticates a dedicated Vault scheduler bearer via a service-only
  claim RPC. The latter verifies Google's RS256 signature, issuer, expiry,
  audience, verified sender email and exact Pub/Sub subscription before enqueue.
  Platform JWT verification is off only because these endpoints perform their
  own service authentication; unauthenticated live requests both return 401.
- Applied `android_billing_reconciliation` to staging and production. Duplicate
  message IDs are deduplicated; state is always looked up with subscriptionsv2,
  never copied from the notification. Lease generation prevents an event arriving
  during refresh from being lost. Failed refresh retries with capped backoff;
  terminal states stop periodic polling but new events/restores can resume it.
- Production minute cron is enabled, currently processing Sandbox receipts only.
  Each run claims up to 10 due receipts concurrently; successful nonterminal
  receipts are due again in 5 minutes. Empty queues cause no Google API calls.
  This is an internal-test capacity, not the large-scale production scheduler.
- Live authorized empty worker invocation returned HTTP 200 with all counts zero.
  This verifies service-key parsing and database access, NOT Google OAuth/API
  permission or receipt validation. Staging and production rollback tests pass;
  all synthetic data was rolled back. 45 focused automated tests pass.
- Both private billing tables intentionally have no client RLS policies or direct
  grants. Advisors report INFO for these RPC-only tables; unrelated existing
  warnings remain. No credentials or receipt tokens were logged or committed.
- REQUIRED GOOGLE CONFIGURATION (not done): Pub/Sub topic `manee-play-events`,
  Google Play publisher permission, push identity `manee-play-notifications`,
  push subscription `manee-play-events-push`, authenticated audience/endpoint
  `https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-play-notifications`,
  and Play Console topic `projects/manee-production-3eafa/topics/manee-play-events`.
  The sender email is `manee-play-notifications@manee-production-3eafa.iam.gserviceaccount.com`.
  Use a dedicated no-key service account for push identity; no Play API financial
  permission is needed for that identity. Actual RTDN delivery is unverified.
- Paid checkout, production receipts, app entitlement enforcement and multi-store
  billing remain disabled/incomplete. No public paid release has occurred.

## Store-scoped internal purchase UI — 2026-10-14 KST

- Real Play test notification reached the authenticated receiver at 10:29:02 KST
  with HTTP 200. This verifies the notification transport, not a purchase.
- Added an expiring, administrator-managed private tester table, one store per
  owner. Authenticated access requires the existing live owner/session check.
  Clients cannot enrol themselves, read the list, or extend their permission.
  No tester identities are included in repository code or migrations.
- Billing endpoint v3 checks that permission on status, prepare, and verification,
  including after network calls. Only approved combinations receive ready status
  and opaque purchase binding. Production receipts are still rejected.
- The Android app-info screen now exposes an internal purchase/restore dialog.
  Actual eligible Play monthly KRW 9,900 offers provide all displayed prices;
  unexpected products/plans/prices are hidden. Users must see a Google test card
  before completing purchase: the app cannot inspect the Play account email or
  prove license-test status before the Google purchase sheet opens.
- Test permission expires after 14 days and is provisioned only in production.
  Staging has the schema but no testers. This is not a paid public launch or
  multi-store billing implementation. Existing app access is unchanged.
- 48 focused billing tests and 42 mobile tests pass (overlapping suites).
  Production web assets compile; unauthenticated billing requests return 401.
  Android version 1.13 / versionCode 14 is prepared for an internal-track AAB.
  Actual purchase, restoration, Play API authorization, and device execution
  remain unverified until the newly built app is installed through Play.

## 2026-10-14 device lifecycle verification and status connection

Internal Play 1.13 (versionCode 14) was installed from Play. A license tester
completed a sandbox trial checkout with the always-approve test card. Device
restore reported successful server verification. The private ledger confirmed
renewal, cancellation, then expiry at 12:30 KST; the worker recorded EXPIRED at
12:31 KST and cleared next_check_at. At 12:41 KST the device restore showed no
purchases. No production payment was made. These observations do not independently
prove every RTDN event type, refund, grace-period or revoked-purchase delivery.

The Edge OAuth core now explicitly imports node:buffer (Deno does not provide the
Node Buffer global). Safe upstream diagnostics include only stage and HTTP status.
The refresh worker received the same fix. No private credentials or receipts are
included in this report.

Status/prepare now call the existing owner-scoped status RPC with the caller JWT.
Only environment-separated active/testActive booleans are returned; tokens remain
private. Database errors fail closed. The native coordinator avoids a second
checkout when the server confirms an active subscription, even if device purchase
cache is empty, and the dialog explains that a subscription already exists.
The mobile source change needs a subsequent signed build before device verification.
35 focused endpoint, verification, coordinator and offer tests pass.

This is the status connection step, not application-wide paid access enforcement.
Production receipt acceptance remains disabled. Multi-store product allocation,
iOS parity, staff access during owner nonpayment and final paid rollout still need
implementation and validation. The current single fixed product/one-store binding
must not be advertised as supporting arbitrary additional store subscriptions.
