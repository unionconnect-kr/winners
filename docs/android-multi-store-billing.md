# Android store product allocation — internal testing

The server allocates one catalog product per owner/store pair, unique per owner.
Existing single-product receipts are backfilled without changing their store or
purchase binding. An owner-scoped advisory lock serializes allocations across
stores. Slots are never recycled automatically. New slots remain unavailable until
an operator registers and enables a matching, verified Play Console subscription.
The first two products are now enabled for internal testing (see the live evidence below).

The endpoint selects catalog and receipt verification products from the database,
not from request parameters. The SQL persistence function rejects wrong products,
store changes and cross-product linked tokens. Renewal jobs carry their persisted
product. Native restore filters to the selected store's allocated product; server
receipt account/store validation remains authoritative.

The dialog follows the allocated product and the existing KRW 9,900/month offer
validation. It shows an active test subscription and hides redundant checkout.
Unavailable extra slots show a preparation message without disturbing existing
subscriptions. Version 1.14 / code 15 includes these mobile changes.

Validation: 37 focused endpoint, SQL allocation, webhook/renewal, purchase and
mobile coordinator/offer tests pass. This includes migration of a historical
receipt and a synthetic second product. Live schema migration was checked for
legacy owner conflicts first. Production billing endpoint v7 and refresh worker v3
are deployed; purchases remain sandbox-only. The second Play product and separate
store purchases were subsequently verified as recorded below. Simultaneous first
checkout races, production receipts, iOS parity and full app paid rollout remain
release gates.

Console setup for the second internal test slot: product ID
`manee.store2.monthly`, base plan `monthly`, monthly auto-renewing KRW 9,900 in KR.
Keep pricing consistent with the existing first slot. Free-trial eligibility must
follow the agreed offer policy and be verified in Play. Registering the SKU alone
does not enable it in the server catalog; enable only after catalog validation.

## Live internal test — 2026-10-14 KST

- The operator created and activated `manee.store2.monthly`, base plan `monthly`,
  monthly auto-renewing KRW 9,900 in Korea. Server slot 2 was registered.
- Hoga Sinchon purchased the second product; the server persisted a Sandbox
  ACTIVE receipt. The 17:25 handset screenshot after restart/restore showed
  successful server verification and no checkout button.
- The existing first test subscription had expired. The tester's explicit
  store permission was moved back to Saengsaeng Songcheon for a new first-product
  purchase; the 17:28 screenshot showed verification success.
- A server read at 17:29:37 confirmed both products ACTIVE, not superseded, with
  future expiry times (store 1: 17:33:07; store 2: 17:32:52). Both had been checked
  by the refresh worker at 17:29:00, with zero retry attempts. The second product's
  expiry advanced from 17:27:52, confirming a renewal while the first was active.
- Store/product allocations remained separate. This demonstrates two simultaneous
  Sandbox subscriptions for one owner, not simultaneous checkout requests.
- Test permission remains one explicit owner/store pair, currently Saengsaeng
  Songcheon, with its original 2026-10-28 10:44 KST expiry. No broad tester grant,
  production receipt acceptance or production write gate was enabled.

The purchase-success screenshot also exposed a UI issue: offers stayed visible
until the dialog was reopened, although the checkout coordinator already rejected
another checkout for an active subscription. The source now hides all purchase
offers immediately on active purchase/restore or already-active results, including
restore completion before product loading. Seventeen focused UI/client tests pass.
Android 1.15 / code 16 packages this correction. Build commit
`20e72e44ef7951a960f58457a417b855591af4df` completed in Actions run `38536158476`:
48 mobile tests passed; bundle signing and internal-only backend guards passed.
The downloaded artifact checksum and packaged version/UI code were verified.
AAB SHA-256: `36e9d064a7c96d25fb03abccb40a6d463835aec4f691897d73273e77127150b0`.
The AAB is ready for the operator to upload to Play internal testing; upload,
installation and on-device confirmation of 1.15 are not yet claimed.

## Production receipt reconciliation groundwork (2026-10-14)

The refresh worker accepts a claimed Production receipt only when Google's
fresh `subscriptionsv2.get` result has no `testPurchase` marker; Sandbox jobs
require that marker. A mismatched environment is retried without saving or
acknowledging. The database claim and minute dispatcher select both ledger
environments and include the bound environment and product ID in each job.
The purchase endpoint still rejects Production receipts, the Android UI is
`testOnly`, and no store is enrolled in write enforcement. This change cannot
start a paid checkout. The existing event queue wakes the five-minute poller.

Staging SQL was verified with zero purchase rows, zero enrolled stores and no
active billing refresh cron. Automatic approval review initially blocked a
production service-role and Google Play credential-bearing worker deployment.
After explicit user approval, Production Edge Function `manee-billing-refresh`
was upgraded from version 3 to 4, then migration
`20261014100100_production_billing_refresh.sql` was applied. The deployed
entrypoint and Google verifier match the previous version; the worker handler
matches commit `ba5dacf1bd99c341d0eec387ca872a43d7784c7d`. Production
preflight and postflight confirmed 0 Production receipts, 0 enrolled stores,
the refresh cron active, claim/dispatch capable of Production records, and
Songcheon/Hoga stores still write-entitled. The separate purchase Edge Function
remains version 7 with its explicit Sandbox-only record guard; enabling paid
checkout is a separate future step.

## Paid receipt and checkout preparation — 2026-10-14

The review branch `codex/billing-paid-acceptance-20261014` adds an exact
owner/store Production permission to the purchase verifier. It accepts only
Google receipts without a `testPurchase` marker, and checks ownership again
before persistence. No permission pair is configured in Production, and the
deployed purchase endpoint is still version 7.

The same branch adds an owner/store/product checkout lease. A second device
receives a conflict during a live 15-minute claim; explicit cancellation or a
verified purchase releases the matching checkout ID. An interrupted or pending
purchase remains restorable, and verification does not depend on the lease.
The additive migration was applied to Staging, with zero claims and no direct
table writes by an authenticated client. An initial Production attempt returned
an `invalid or expired requestState` connector error and did not apply. The
subsequent retry succeeded. Production postflight confirmed both RPCs, zero
claims, no authenticated direct table inserts, no anonymous claim execution,
zero enrolled stores and zero Production receipts.

Paid preparation also requires Play's Korean regional base-plan price to be
exactly KRW 9,900/month. Sandbox readiness is separate. Focused billing tests
pass (72/72). The review branch contains a paid dialog behind explicit server
readiness, shows Play's actual offer and renewal/cancellation terms, and gives
a conflict message for another device's live checkout. The deployed Android
app still presents only the internal test flow.

Draft PR #22 targets `main` and includes the accumulated Android changes. Before paid
rollout, verify Play Console's free-trial offer and both products on a real
device, deploy a gated purchase endpoint and paid-capable app, then exercise restore, cancellation,
renewal and write-entitlement behavior with an explicitly selected pilot.

## Paid pilot build boundary — review branch

The existing `aab:internal` path still produces `play-internal-setup` assets with
`billingEnabled:false`. Its compiled Android client now hides paid readiness and
refuses a paid prepare/restore even if the server later reports paid eligibility;
if a direct prepare obtains a checkout lease, the client releases it before Play.
Sandbox tests remain available. The separate `aab:paid-pilot` command compiles
`ANDROID_PAID_BILLING:true`, packages production Android assets, and verifies the
signed AAB with the `paid-pilot` purpose and upload certificate. The production
backend must still grant an exact owner/store pair before that app can start a
paid checkout. The separate candidate workflow builds and stores a signed AAB
for review, but does not upload it to Play or change server permissions.

Mobile tests: 61/61 pass, including internal client refusal, distinct package
metadata and the unchanged internal bundle guard. Before Play upload, confirm
the pilot owner and Play account, the latest Play version code, and the live
offer and price on that account. Upload to a restricted Play track,
install that version on the pilot device, and only then deploy/enable the exact
server permission. Keep write enforcement off until paid purchase, restore,
renewal/cancellation and entitlement recovery have been checked. Current
production purchase endpoint v7 is Sandbox-only; zero paid permissions,
Production receipts, checkout leases and enrolled stores were observed.

Android 1.17 / code 18 is one greater than the last prepared 1.16 / code 17.
Candidate run `38597430252` from commit
`a9794c0b0e3f122adb8ce41723a760473b2ce621` passed mobile tests, signed
bundle verification and artifact upload. The downloaded AAB contains
`releasePurpose:paid-pilot`, `billingEnabled:true`, and version name 1.17;
its SHA-256 is
`9da0166bfd6913aa9c3b47468bf95ba8876cf3e8edabce95e5fa7b92e3e08d6f`.
Play Console has not been checked for its latest uploaded code. No Play upload
or Production permission is claimed here.

## Paid pilot handset acceptance — 2026-10-15 KST

The operator published Android 1.19 / code 20 to Play internal testing and
installed it on the pilot handset. Play's checkout showed a one-month free
trial followed by KRW 9,900/month, and the operator completed the subscription
for Saengsaeng Songcheon. The app reported purchase and server verification
complete. On 1.19, both the subscription dialog and the separate store access
screen display the selected store as subscribed. A handset screenshot for
Gamjok Seosin, selected under the same owner account, instead displays
"preparing" and no subscription. No second purchase was made.

The access screen explicitly says the billing write restriction is not applied
to these stores. A successful Play purchase and the two handset screens verify
the paid pilot display and store separation; they do not establish that paid
write enforcement, a future renewal, expiry or cancellation works in Production.
The Production ledger could not be independently read during this follow-up,
so no current database count or refresh timestamp is claimed here.

Local reconciliation integration now drives one Production receipt through
renewal, cancellation before expiry, account hold, expiration and event-driven
restoration, checking the member-visible status and worker claim/finish behavior.
This is deterministic database coverage; live lifecycle events remain pending.
Keep the production write gate unenrolled until its remaining mutation surfaces
and live entitlement recovery are verified. Do not start another paid checkout
merely to test store isolation.
