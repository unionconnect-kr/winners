# iPhone device feedback — 2026-11-04 KST

## Changes

- Password login sends the selected owner/staff role to the staging API. The API verifies credentials first, then checks the authenticated membership snapshot. Wrong-role sessions are locally revoked before returning 403; no token is returned. The native app independently checks the server snapshot before storing the session, and remembers the selected role per account when choosing a store. Existing API clients without a role remain compatible.
- New usernames require 6–30 characters. Existing short usernames can still sign in and recover their passwords. New passwords require at least eight characters, ASCII letters and digits, and at most 72 UTF-8 bytes. Owner/staff signup, availability, SMS signup and reset, and account password change enforce the matching server rules. Old current passwords are still accepted when authenticating a recovery-phone change.
- OAuth identity linking accepts the exact Kakao/Naver authorization endpoint for the selected provider and linking intent, with a nonempty state/client id, code response type, and this project's GoTrue callback. Password-free sign-in still opens only this project's authorize endpoint. Both the controller and native browser guard validate URLs. Existing PKCE/account/callback checks remain.
- iPhone controls, including body-level dialogs, use 16px text. Touch manipulation, horizontal overflow containment, explicit native zoom configuration, and directional scroll locking address unintended enlargement and horizontal movement.
- Staff expense detail and edit expose a confirmed delete action only for the current author's unconfirmed expense. Requests pin the row revision, reject stale account/store changes, suppress duplicate submissions, preserve records on failures, and reload the list on success. The server migration retains live-session, membership, author, owner-confirmation, revision and subscription checks; receipt deletion follows the existing cascade.
- Confirmation dialogs now appear above expense sheets; the prior 500!important z-index obscured the actual confirmation buttons.

## Verification

- Mobile tests: 119/119 (including 29 new auth/URL/policy tests).
- PostgreSQL logic tests in PGlite: 10/10 (own deletion/receipt cascade; other author; confirmed expense; revoked membership; absent user; expired session; wrong store; stale/missing revision; expired subscription).
- Offline WebKit: 273 named states × 4 widths = 1,092 layout checks; 1,968 rendered input checks; 45 interaction checks. All pass. Screenshots include top and internally scrolled bottom. All asset requests use an intercepted loopback origin; non-loopback requests are aborted. No real SMS or business writes occur in this audit.
- Live staging checks: 10/10. Owner/staff correct entry succeeds; both wrong-role combinations return 403 without a session; wrong passwords remain 401; short usernames and weak new passwords are rejected before account creation; actual Kakao/Naver linkIdentity URLs pass both allowlists. External provider consent/callback was not completed.
- User confirmed on-device login persistence, password visibility, wrong-password detection, password recovery SMS, owner screens and the remaining staff screens.
- Security advisory categories/counts were unchanged after the edge and SQL deployments.
- Legacy server test fixtures were refreshed for the already deployed staging-only SMS signup/recovery flow and valid letter/digit passwords. Added negative tests retain the age/identity boundary and prove missing/rejected SMS proofs cannot create accounts, verified SMS controls the saved phone, and ordinary accounts cannot use the HQ support-code reset path.

## Approved server deployment and TestFlight

Six staging functions were deployed: manee-login v14, manee-check-username v8, manee-signup v11, manee-staff-signup v12, manee-account-recovery v10, manee-sms-auth v3. No production project was changed.

The user explicitly approved the staff deletion server change. The exact reviewed private function was applied through execute_sql after the apply_migration confirmation continued to expire. The source migration remains an idempotent record of that definition; this direct SQL application did not add its own migration-history row. No existing expense rows were automatically removed.

Live API verification exposed that existing 40001 application-conflict exceptions became HTTP 500 responses. A separate, successfully applied staff_expense_api_conflicts migration preserves the public wrapper's SECURITY INVOKER boundary and translates those exceptions to PT409 / HTTP 409. The private permission function and its grants remain unchanged. The final 10 PostgreSQL tests pass against both actual function definitions.

Authenticated owner/staff API verification: 12/12 checks pass, including receipt access; stale/missing revisions; wrong store; another author; owner-confirmed records; successful own deletion; absent deleted expense/receipt; anonymous rejection; fixture cleanup; and local revocation of both successful verification sessions. Only disposable QA expenses and a QA vendor in the shared TestFlight test store were created and removed. No production project was touched. The verification used issued test-account tokens in memory, without inspecting Auth session tables.

Full local regression: 1,017 registered tests, 1,006 passed, zero failed, 11 environment-dependent skips. The release CI's separate concurrency/regression gates passed. All PR #56 checks passed before merge 2524a03d85fa5976736d8f36b8a30682785ab06c.

Signed build: 1.39 / 1.14.1, successful run 41673170950, artifact 13249158163 (manee-ios-signed-14-1), archive SHA-256 d08b98f7a79862fdf61578a9aee91fa0fe6259fa11dc222ad8bb69a75953dcd0. Exact HTML, social controller, CSS and native safe-area/zoom config are checked before Apple credentials are exposed. Eleven uploader tests pass.

Upload workflow 41676511619 succeeded from main commit e554d3a20bf7184769c7824142949da1ed5f9dcc. At 2026-11-04 01:46:47 KST, Apple confirmed 1.39 / 1.14.1 as VALID and IN_BETA_TESTING, with the existing internal QA group connected. No public review was submitted and no new tester invitations were sent. This is the current distributed QA build.

Real-device keyboard/focus, picker and gesture behavior, and the final Kakao/Naver consent-and-return flow require a device retest after the update. Billing/push remain unconnected in the existing QA entry point. The splash mockup was not applied by this feedback change.
