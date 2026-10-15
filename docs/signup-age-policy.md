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
Production was deployed after the compatible web and internal binary were available:
owner v12, staff v9 and franchise v7, all ACTIVE on 2026-10-16 around 01:12 KST.
Independent readback matched all three source files. The same four no-side-effect
HTTP rejection probes passed against Production with HTTP 400 and no-store.
This does not prove live positive signup or an individual’s actual age.

## Rollout sequencing used

Android 1.22/code 23 was prepared because the signup UI changes packaged assets.
The signed-AAB verifier checks that all three checkbox IDs and explicit payload
confirmation are actually packaged, in addition to signature/backend isolation.
The existing paid-pilot candidate workflow builds the artifact only; it does not
upload to Play or expand public checkout eligibility.

The deployment rule was to enforce Production only after the compatible web
signup and new Play binary were available. Older 1.21 signup requests omit the flag and would be refused;
existing sign-in continues. Prepare a narrow web change against current main,
validate it, publish the compatible internal binary, and then coordinate the
Production endpoint switch. Replace the saved 1.21 Production candidate before
submitting review. Do not merge the cumulative billing PR wholesale as a shortcut.

After deployment, the official privacy notice was updated with confirmation
flag/time and the accurate deployed scope. Internal availability is distinct from
public release or every handset having updated. Public paid checkout, new-store
billing launch, device expiry/employee refusal and the separate 30-day deletion
case/contact operation remain distinct release gates.


## Live rollout evidence — 2026-10-16

Narrow PR #25 (10 files; signup only) passed its verification workflow and was
squash-merged as `4abb78bee89511ef142bba2350c4729e45969736`. Both main checks
(verify and read-only public app availability) succeeded. Public Netlify HTML
contains all three checkbox IDs and the explicit payload flag; the live staff
signup screen shows the unchecked required checkbox. The cumulative billing
PR #22 was not merged.

All seven workflows at `6d2a5dad6dc9943b8ce4dec344a1b111647ee285` succeeded,
including signed AAB run `38765267948` and the mobile test suite (64/64). The AAB
verifier passed inside CI with the existing upload certificate. A local repeat
reached signature verification but the local runtime lacks jarsigner; the CI
verification is the signature evidence. The downloaded ZIP digest matched
GitHub’s artifact digest, and keytool confirmed its certificate matches code 22.

- Artifact: `11990135164`, `manee-paid-pilot-candidate-aab`.
- ZIP SHA-256: `7f74db58790076718a2b08f20d451c5146adf9f57bc75e3da465239340b15537`.
- AAB SHA-256: `a92b2f2518455cd9ae1d2a1e4c9c5705277b615dd02f33929ef845940e9feb89`.
- Play parsed code 23 / version 1.22, target SDK 36; no device-support reduction.
- Internal release 10 is **available to internal testers**, displayed posted
  2026-10-16 01:10 KST. No tester-list/access expansion or purchase was performed.
- Play validation had zero blocking errors and two diagnostic warnings: missing
  mapping/deobfuscation file and native debug symbols.

Official privacy versions 26 and 27 were successfully published with confirmation record
items, deployed web/Android/server scope, self/admin-attestation limitations and
the separate under-14 identified-account process still pending. No iOS rollout,
public Google review, public paid checkout, or new-store enforcement launch is
claimed by this evidence.


Play Production candidate code 23 / 1.22 was saved and verified in publishing
overview; it replaced code 22 in the ten **unsubmitted** changes. Korea remains
the sole selected country. The quick pre-review checks were still running at
01:22 KST (up to 14 minutes shown). Managed publishing remains disabled; no
review submission or public release was performed. Existing Production dashboard
DEX/code optimization guidance carries a February 2027 deadline; this was not a
blocking error in the candidate validation and optimization completion is not
claimed.
