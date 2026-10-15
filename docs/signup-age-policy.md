# Signup age confirmation — launch correction

The existing published service policy permits accounts for people aged 14 and
over, but the installed 1.21/code 22 signup UI has no age confirmation. A content
rating or Play target-age category is not proof of the account holder's age.
This correction implements the existing policy without collecting a birthday,
resident number, identity photo or other age-verification document.

## Behavior

- Owner final review and staff signup show an unchecked, required **만 14세
  이상입니다** checkbox. The owner's selection lives only in the in-memory signup
  draft and resets for a new signup. Missing/unchecked values prevent the request.
- The platform-admin franchise form requires confirmation that the actual
  recipient account holder is 14+. Existing verified actor/admin checks remain.
- All three signup handlers require the literal boolean `true` in
  `age_14_plus_confirmed` before rate-limit consumption, Auth creation or bootstrap.
  Invalid/missing confirmation produces HTTP 400 `age_confirmation_required`.
  Null, array and primitive JSON are rejected without account creation.
- The server constructs Auth `app_metadata` recording the confirmation flag,
  server timestamp, policy version `14plus-2026-10-16` and source
  `self-attestation` or `admin-attestation`. Client-supplied metadata, timestamps,
  birthdays and role claims are ignored. This is an attestation, not independent
  age/identity verification or marketing/terms consent. It grants no role/access.
- Existing accounts are not assigned a fictional confirmation timestamp or
  blocked from normal login/attendance. Identified under-14 accounts still require
  an actual operator process; no customer's age is inferred or account deleted.

The imported owner handler preserves the deployed optional franchise-code
bootstrap, pins the SDK to the repository's tested 2.116.0 and uses no-store.
Owner bootstrap uncertainty now follows the existing staff/franchise safety
pattern: a possibly committed profile or failed recovery lookup must not trigger
destructive Auth cleanup. Known uncommitted failure cleans only the fresh user,
and a cleanup failure is surfaced. Franchise debug responses and logs no longer
include provider/SQL messages, actor IDs or created identity IDs.

## Evidence and current state

Production owner v11 and Staging owner v4 were source-identical before this work.
Franchise Production v6 and Staging v4 differed in indentation, with matching
trimmed source lines; the repository's explanatory admin-boundary comment is
retained. Staff deployment/repository behavior was compared before editing.
Existing verify_jwt=false is preserved: owner/staff are pre-login enrollment
routes, staff validates the application key, and franchise additionally verifies
the bearer and active platform admin before enrollment. No new access grant or
weaker authentication configuration was introduced.

Focused tests: 73 passed, zero failed/skipped. They execute the actual handler/UI
functions with synthetic offline dependencies, cover all three role paths,
unchecked and malformed input, server metadata spoofing, actor authorization,
bootstrap uncertainty and unchanged existing staff/signup/onboarding behavior.
These are not live positive signups or proof of a person's actual age.

Staging was deployed first: owner v5, staff v6, franchise v5, all ACTIVE.
Independent readback matches the exact source for all three. Four real HTTP
requests to owner/staff (unchecked confirmation and null JSON) returned the
expected HTTP 400 codes and no-store headers, before any signup side effects.
No real or synthetic customer account was created or deleted for these probes.
Production handlers have not been deployed with this requirement yet.

## Candidate and rollout boundary

Android 1.22/code 23 is prepared because the signup UI changes packaged assets.
The signed-AAB verifier checks that all three checkbox IDs and explicit payload
confirmation are actually packaged, in addition to signature/backend isolation.
The existing paid-pilot candidate workflow builds the artifact only; it does not
upload to Play or expand public checkout eligibility.

Do not enforce Production before the compatible web signup and new Play binary
are available. Older 1.21 signup requests omit the flag and would be refused;
existing sign-in continues. Prepare a narrow web change against current main,
validate it, publish the compatible internal binary, and then coordinate the
Production endpoint switch. Replace the saved 1.21 Production candidate before
submitting review. Do not merge the cumulative billing PR wholesale as a shortcut.

After actual deployment, update the official privacy notice with confirmation
flag/time and the accurate deployed scope; do not claim this implementation is
already live in the current public/installed app. Public paid checkout, new-store
billing launch, device expiry/employee refusal and the separate 30-day deletion
case/contact operation remain distinct release gates.
