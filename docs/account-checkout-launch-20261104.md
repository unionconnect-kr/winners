# Account checkout launch integration

The owner selected Android 60 days / iOS two calendar months, then KRW 9,900 per owner ID each month including VAT. This branch reconciles the complete 1.43 mobile candidate with production main 60f90bc and its account billing contract. It does not deploy production or change customer subscriptions.

## Implemented

- Merge current account subscription, shared checkout lease, Apple checkout policy, signing key handling, and server security updates into the mobile candidate. Preserve the staging SMS/signup and password rules from the mobile branch.
- Restore all server-authorized legacy product/binding pairs on both platforms, including purchases originally bound to another store of the same owner. Receipts from another owner are never accepted by the client matching logic or server verifier.
- iOS supplies a checkout ID and releases its exact lease only after verified completion, explicit cancellation or failure before the store purchase begins. Pending purchases and uncertain verification keep their lease for recovery. The client snapshots identity to detect in-place account changes.
- Android checks existing purchases across all authorized account allocations before a new checkout and blocks an existing other-platform subscription.
- Hook ordinary and social owner signup after successful identity resolution. Read server access before opening the offer screen; skip owners already covered or stores outside billing enforcement. Missing/failed access never opens a purchase. Billing failure does not turn successful signup into a signup error.
- Build the complete Android screen baseline with a current source-built bridge (social login, files, location, notification navigation and billing), replacing the old immutable bridge only in the new integration candidate.
- Keep the delivered 1.43 APK/IPA unchanged. `build-launch-checkout.mjs android|ios staging` is a separate integration build path. QA purchase/push gates remain disabled; no public release build can be generated through it.

## Verification

- 157 mobile tests passed, including account restoration, cross-platform duplicate prevention, checkout lease release/retention, account switching, signup failure handling and both signup entry points.
- Server/merge regression run: 76 tests passed; the restored SMS-proof regression also passed (signup suite now 14 tests).
- Three PGlite account-scope integration tests passed using the existing account migration: stable legacy bindings, shared cross-platform lease, multi-store access, expiry, sandbox isolation and free-store exception preservation.
- Both complete staging asset builds succeeded. Native signed archives, physical-device purchase flows and production services have not been validated for this new candidate.

## Console evidence carried forward

- Apple Developer Program License Agreement issued 2026-10-30 was accepted by the account holder on 2026-11-04; the previous agreement warning disappeared.
- Both store descriptions are saved as launch drafts. Android `trial-60days` remains draft; Apple's actual introductory offer remains one month until its console configuration is changed and verified.
- Existing Apple review requires iOS-only screenshots and an expired-subscription demo account with a working purchase flow.

## Release gates still open

1. Configure and validate actual store trial offers; confirm Google VAT presentation against the VAT-inclusive KRW 9,900 policy.
2. Audit production service parity for complete screens, native social schemes, push, signup SMS, and server readiness. Do not promote by replacing a project ID or enabling a single boolean.
3. Exercise sandbox purchase, restoration, conversion, cancellation/refund and interrupted purchase flows on real Android/iPhone devices before enabling new paid signups.
4. Prepare production AAB and iOS archives, store screenshots, review account/notes and matching website/FAQ terms. Production rollout and review submission remain separate final actions.

This integration is source/test work. Unit and database tests do not prove store-console eligibility or an actual purchase on a phone.
