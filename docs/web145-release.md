# MANEE web 1.45

The public owner/staff web entry now uses the device-verified 1.45 release screens. `web/index.html` and its CSS are derived from the signed 145.5.2 public assets; `web145-source.json` records the immutable source hashes. The root legacy entry remains the administrator variant/test input.

Browser adaptations retain the existing Supabase browser storage keys and login persistence, use browser geolocation and PWA push, download PDF/Excel through Blob links, and provide a read-only subscription status sheet. Native keychain, store purchase, and push plugins are not loaded. The report workbook model ships with the same formatting as the release app.

## Environment and authentication

The build still requires an explicit environment, permits production only on main, and isolates preview configuration and push behavior. CSP hashes are generated from the actual published entry. `/build-info.json` identifies the deployed commit and UI source.

Production keeps its currently deployed owner/staff signup and account recovery API contract. `webSmsAuthEnabled` is explicitly false in production and true in staging; it is not a fallback after a verification error. New SMS proof enforcement, production SOLAPI credentials, and corresponding signup handlers must cut over together. Production Naver remains disabled until provider credentials and callbacks are configured. Provider availability is checked before presenting a working social sign-in action. Do not describe these pending provider cutovers as completed by this web deployment.

## Verification

- Full existing security/application suite plus new DOM/browser-service checks: 867 passed, 10 database-concurrency checks skipped locally (run with PostgreSQL in CI).
- 273 synthetic screen scenarios each in production and staging configurations; no live records, SMS, payments, or pushes are created.
- Existing browser session/store recovery, per-tab login persistence, SMS fail-closed behavior, browser push removal, and stale subscription responses covered.
- PDF/Excel reporting tests, including saved-workbook round trips for Korean text, negative amounts, and pending payroll.
- Production build: inline JavaScript parses, local assets exist, generated CSP matches the published script.

A production release is complete only after the main-branch CI passes and the live Netlify build-info/asset hashes match the merged commit. Offline tests are not evidence of real-device push receipt or store subscription transactions.

## Deployment approval

The user explicitly approved uploading this reviewed web source and tests to the existing public `unionconnect-kr/winners` repository and deploying the production web on 2026-11-05. Previous automatic-review holds are resolved by that approval. Normal GitHub authentication and CI/deployment verification are still required.

A diagnostic run substituting the new entry into older extraction-based test harnesses identified missing mocks and assertions for superseded UI wording (49 harness failures, 135 passes); this is not counted as a passing full regression of the new entry. The separate full-DOM tests exercise the new screens and additionally cover cross-tab logout/account replacement and owner-control boundaries without extraction mocks.
