# MANEE 1.52 release evidence

The requested final update is prepared from Android 1.51 commit
`153d8fd800db794c893ddcde26a17dec9fc05b5c`. The release workflow is
`.github/workflows/mobile152-release.yml` on
`codex/final-email-billing-152-20261106`.

## Reproducible release outputs

| Target | Identity | Output |
| --- | --- | --- |
| Android | `kr.co.manee.app`, 1.52, versionCode 53 | Existing upload-key-signed release APK and AAB |
| iOS | `kr.co.manee.app`, 1.52, build `152.<run>.<attempt>` | Distribution-signed IPA, TestFlight upload |
| TestFlight | App `6820833544` | Exact processed build connected to the existing `MANEE 내부 QA` group |

`node mobile/scripts/build-release152.mjs android production` and
`node mobile/scripts/build-release152.mjs ios production` reuse the production
asset build, install the approved email verification flow, and set the version.
`node mobile/scripts/verify-store-assets.mjs --release152` checks the packaged
environment, version, service activation and email assets. Android additionally
verifies the release manifest, upload certificate and signed AAB. The iOS job
checks the distribution profile's bundle, team, expiry and push entitlement,
then verifies the signed archive before exporting.

## Upload and tester connection

The existing repository secrets remain the only signing and Apple credentials.
The uploader accepts only the exact authorized workflow and branch. The
connection step derives the exact build number from that same workflow run,
requires Apple processing `VALID`, verifies marketing version 1.52, and connects
only the existing internal QA group. It creates no tester invitations and
submits no App Store review. The status artifact distinguishes upload accepted
from Apple processing and internal testing availability.

## Validation record

Local release-guard validation: `node --test
mobile/scripts/android-release.test.mjs
mobile/scripts/connect-testflight152.test.mjs
mobile/scripts/upload-testflight.test.mjs` passed 16 tests with no skips or
failures. These use disposable tokens and mocked Apple responses. The new
workflow also parsed successfully as YAML. CI requires all root security/app
tests, five real PostgreSQL concurrency suites with no skipped tests, the mobile
tests, and production asset verification before either signed build can start.

Local iOS production web assets built and passed `--release152` verification.
Local Android web assets also built and passed using a disposable Firebase
configuration fixture, which was removed afterward. That Android check verifies
asset generation and environment guards; the real production Firebase client
configuration, native compilation and signing must still be verified in CI.

New social memberships now require the same email and verified-phone proof as
ordinary signup. Existing social profiles keep their original login/link path.
`20261105160822_social_phone_email_signup.sql` registers the pending email,
claims the session-bound `signup_social` proof, bootstraps the membership and
completes the phone binding in one transaction; any failure rolls all four steps
back. The Edge function verifies the OAuth actor, hashes the proof and forwards
only the verified session ID. The new social Edge/database tests passed 11/11,
including duplicate destinations, cross-session/user proof misuse, consent
validation, and bootstrap/completion rollback. Actual deployed email delivery
and device social sign-in remain separate runtime checks.

Read-only Play Console inspection by the release operator confirmed that
`manee.store1.monthly` / base plan `monthly` has active `trial-60days` in Korea
with 60 free days and eligibility restricted to new subscribers without a
subscription history in the app. The older `trial-1month` offer is also active.
No Play offer settings were changed. Without the device's actual product
response, it remains unconfirmed whether the selected Google account's history
caused Play to withhold the 60-day offer. Automated tests must not be reported as
a successful real Google Play purchase. Device installation and the selected
Google account's purchase dialog, confirmation, entitlement and relaunch
persistence still require actual verification.

Execution results, workflow run links, artifact digests and actual Apple status
must be added by the release operator after this candidate is run. Preparing the
workflow or passing mocked credential-guard tests does not establish an actual
TestFlight upload, device installation, email delivery or Google Play purchase.
