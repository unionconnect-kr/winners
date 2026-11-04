# iOS release preparation — 2026-10-16 KST

## Actual release state

Android 1.22 / code 23 is submitted to Google review. The common source baseline
is `93b7e57`, reconciled with narrow main fixes through `d87437f`; iOS work remains
isolated from the public web frontend. The existing 31 stores keep write access.

Signed iOS 1.0 / build 1.5.1, exact source `d94bd7d`, was validated and uploaded by
run `38793325404`. Apple processing completed. App Store Connect displayed that
build in TestFlight. The account holder's updated Developer Program License
Agreement was accepted only after action-time user confirmation; the agreement
history records acceptance on 2026-10-16. Export encryption metadata was saved.
The internal `MANEE 내부 QA` group has build 1.5.1 and zero testers.

The operator supplied the test iPhone's separate Apple account privately. An
external-group creation was requested, then the cloud browser stopped responding.
Creation has not been verified; inspect before retrying to avoid duplicates.
No tester invitation or Beta App Review submission is confirmed. No App Store
review, paid iOS launch or public release was performed. Build 1.5.1 predates the
following follow-up work and must not be described as containing it.

## Follow-up implementation

- Current Android signup age confirmation, role/session and attendance refusal,
  report calculations and UI ship in the iOS packaged web source.
- PDF/XLSX use the native save/share sheet, Korean filenames, protected temporary
  files and cleanup. Cancellation is distinct from success; a missing bridge
  fails instead of claiming that a WKWebView download succeeded.
- iOS now uses the same visible More / Store Subscription and notification-toggle
  flow as Android. Database write access is authoritative; Apple Sandbox status
  is displayed separately. Google-paid stores can retain their existing access
  without a redundant Apple checkout. Owner-only purchase controls stay hidden
  for staff and when server/catalog configuration is unavailable.
- Notification taps reuse validated, in-memory routing and live store access
  checks. Old-account pending navigation is cleared on logout. The iOS build
  routes through its dedicated owner-membership RPC.
- APNs permission is requested only by the explicit Enable action after server
  readiness; refresh does not prompt. Malformed tokens, registration failure and
  timeout remove listeners. Withdrawn consent removes the live binding. Offline
  cleanup cannot trap a person in a signed-in account.
- iOS attendance uses the existing native accuracy checks: fresh, valid coordinates
  with accuracy within 100 metres; denied, timed-out or inaccurate locations fail.
- StoreKit restore/sync selects the allocated store product and appAccountToken.
  Another store's transactions are not finished or charged again. Purchases are
  finished only after fresh Apple verification and persistence. The native
  catalog supports slots 1–10; each slot must be configured in a separate Apple
  subscription group for simultaneous store subscriptions. Native checkout
  validates KRW 9,900/month, no family sharing, first-slot one-month trial and no
  introductory offer on later slots. Display uses Apple's localized price.
- Apple server verification handles Production and TestFlight Sandbox separately,
  refreshes status from Apple, rejects wrong products/bindings and never treats
  Sandbox as Production entitlement. Store allocation is serialized per owner.
- The prepared business-event ledger covers attendance, reservation creation,
  cancellation, upcoming/arrival reminders, report close and monthly cost prompts.
  Its leases, retry/expiry and cancellation invalidation follow Android. APNs
  carries fixed copy and validated route IDs, excluding customer/financial content.
- Maintenance handlers require a separate server bearer; they recheck recipients
  before sending and lease receipt refreshes. No maintenance scheduler is enabled.
- Info.plist records non-exempt encryption as false, consistent with the saved
  export answer; native compilation and actual Apple processing remain checks.

## Validation and server application

Local mobile regression: 72 pass, zero fail. Root regression: 997 total,
986 pass, zero fail, 11 environment-dependent skips. SQL integration coverage
includes multi-store allocation, default-disabled release/catalog, environment,
expiry, freshness, revocation, membership/banned-account refusal, immutable
transaction bindings and leased refresh. APNs SQL tests exercise committed events,
rollback, deduplication, lease/retry, cancellation/rescheduling, quiet hours,
monthly prompts, invalid devices and old report-month navigation.

Staging received `native_ios_catalog_gates` and `native_ios_business_push`.
Production received the original native iOS foundation/account-cleanup and these
two follow-ups as one atomic preparation migration. Fresh production inspection:
31 stores, 31 write-entitled, zero newly enrolled stores, zero Apple receipts,
zero APNs devices/queued jobs; all Apple catalog slots disabled and Sandbox /
Production write-entitlement release flags false. Android new-store launch
remains at its original timestamp, `2026-10-15T17:19:29.841181Z`.

Live privilege verification: authenticated clients cannot save Apple receipts,
claim refreshes or edit catalog; anonymous callers cannot register APNs devices.
The service role can save verified receipts. Security advisors report intentional
private RLS tables with no direct policies, plus existing ratio/snapshot definer
and leaked-password warnings; no new public definer grant was introduced.

## One real-device verification batch

Use only a controlled test store/account; avoid creating financial or employee
records in a real operating store solely for testing.

1. Install the final follow-up build in TestFlight; confirm version/build. Log in
   as owner, switch stores, close/reopen, then log out and use the staff account.
   Verify retained sessions, roles and no prior-account screen/notification leak.
2. Save/share one PDF and one XLSX, inspect Korean filenames/content, cancel one
   save and retry. Check the keyboard, safe areas and larger system text.
3. Exercise location Allow / Deny / reduced accuracy and attendance refusal.
   Confirm an expired store cannot write; existing records remain readable and
   staff are directed to the owner without losing their session.
4. Enable notifications, receive an owner test plus attendance/reservation/report
   events, and open the right store/date/month from a killed app. Verify cancelled
   or rescheduled reservations, permission withdrawal and logout stop delivery.
5. After Apple catalog/key/server configuration is verified, test Sandbox trial /
   purchase / cancel / pending / restore / renewal / expiry / revocation and a
   second store. Repeat restore after restart and reject a different MANEE account.
   Confirm Sandbox cannot unlock a Production-enforced store.

## Remaining gates that cannot be represented as completed

- Cloud browser connectivity prevented further App Store Connect inspection.
- External TestFlight access for the supplied private account must be completed;
  first external distribution may need Beta App Review and working review login.
- Apple IAP/APNs server credentials, webhook URLs and protected maintenance
  scheduling must be configured and then checked through the deployed services.
- The one observed Apple product's price/trial is not yet verified; other slot
  groups/products are not confirmed in App Store Connect. Code/catalog preparation
  is not proof that Apple has configured or approved them. Do not enable catalog
  or release flags before those checks and physical Sandbox verification.
- Final App Store screenshots/privacy/age/reviewer access and review submission
  remain separate from a signed IPA or a successful TestFlight upload.

Additional build/deployment run IDs and outcomes are recorded below once verified.

## Verified follow-up checkpoint

The follow-up source `16ffc5c6` compiled and signed successfully as build 1.6.1
(run `38800572039`). It was subsequently validated/uploaded by `38802227581`;
Apple processing returned VALID / READY_FOR_BETA_TESTING. The external group
exists. Production endpoints are deployed with IAP/APNs credential presence and
checkout disabled. See `ios-scheduled-workers-2026-10-16.md` for the pending
scheduler migration, actual catalog gaps and the next single physical checklist.
