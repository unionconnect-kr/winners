# iOS scheduled worker preparation — 2026-10-16

## Verified deployment and build

PR31 merged iOS server endpoints to main (`cec9d3a`). Public production health
returned HTTP 200: Apple IAP and APNs credential configuration is present; paid
checkout remains false. Unauthenticated billing/push requests return HTTP 401.
Presence is not a successful Apple authorization or physical APNs delivery test.

PR32 merged the exact-source QA uploader (`303e9a3`). Run `38802227581` succeeded:
iOS 1.0 / build **1.6.1**, source `16ffc5c6`, signed archive `38800572039`, artifact
`12003933161`, validated and uploaded. Apple's authenticated read returned:
`processingState=VALID`, `usesNonExemptEncryption=false`,
`internalBuildState=READY_FOR_BETA_TESTING`,
`externalBuildState=READY_FOR_BETA_SUBMISSION`.

Both internal `MANEE 내부 QA` and external `MANEE iPhone 테스트` groups exist.
No tester invitation or review submission was sent. The external tester account
was supplied privately; do not commit its address or auth values to this repo.
The first monthly subscription remains `MISSING_METADATA`; one-month introductory
offer records exist. The inspection did not resolve offer mode/territory or map
Korean pricing, so price/trial readiness must not be asserted from those rows.
Additional slot groups/products are not confirmed. All DB Apple catalog/release
flags remain disabled.

## Prepared scheduled-only workers

Netlify scheduled functions have no public HTTP URL and run automatically only on
published deploys. See https://docs.netlify.com/build/functions/scheduled-functions/ .
The two new scheduled-only entrypoints use the existing server service credential;
public maintenance handlers keep their separate bearer requirement unchanged.
A request body cannot choose the scheduled factory. The service-only SQL job API
retains live-recipient, cancellation, expiry, lease and retry checks, with at most
50 jobs per minute. Parallel bounded sends stay within the scheduler's 30-second
limit under normal provider response; timeouts retain the lease for safe retry.
Worker heartbeat contains only aggregate results, no receipts/tokens or contacts.

Production deployment of this follow-up is **blocked**, not complete. Staging
`apply_migration` returned `Invalid or expired requestState` twice. Fresh read
confirmed `private.ios_worker_health` and the scheduled claim RPC absent; no
production mutation or scheduler activation was attempted. Preserve the draft PR
until the connector change-request session works, then apply/test staging,
apply/verify production, merge, verify scheduled URLs reject direct HTTP, and
observe two fresh healthy heartbeats through the private table. Do not merge the
scheduled handlers before their DB prerequisites exist.

Local follow-up validation: 835 tests, 825 passed, zero failed, 10 environment
skips. Seven focused SQL/worker cases passed, including customer/anonymous
refusal, leased reminders, service-only heartbeat, and public-request rejection.
These do not establish live scheduler execution or device delivery.

## One handover for the operator

The browser connection recovered into a new session; App Store Connect now needs
owner sign-in again. Keep that human authentication and real-device work for the
next conversation. Complete the private tester invitation / external beta review
access after authentication and fill the remaining catalog metadata. Then run
one physical checklist: owner/staff login + restart + store switch; PDF/XLSX save,
share and cancel; location/attendance allow/deny; push/tap/logout; Sandbox purchase,
restore, expiry, renewal and second-store isolation once configuration is ready.
Do not claim the app is publicly launched or all physical cases already passed.
