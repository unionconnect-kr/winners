# Android public checkout preparation — 2026-10-16

This narrow source change records the already deployed billing handler, Google
verification and purchase-normalization modules together with the separately
gated public eligibility policy. It does not merge the cumulative mobile/iOS
branch, enable billing, launch store restrictions or submit Google review.

Production `manee-android-billing` was independently read back as ACTIVE v10 with
JWT verification enabled. Its handler, Google module and purchase adapter match
the Android 1.22 review source. The proposed differences are the index wiring and
the explicit `MANEE_ANDROID_PAID_PUBLIC_ENABLED=yes-2026-public-launch` condition.
The production project pin and existing checkout switch remain mandatory. With
no exact public value, the existing exact owner/store pilot policy remains.

Public eligibility is checked only after authenticated live owner membership,
and is rechecked after Google lookups. Product allocation comes from the server
catalog, Korean monthly pricing must be KRW 9,900, and Google receipts remain
bound to the selected account/store, saved before acknowledgement. It grants
neither membership nor database write access. Products 1–3 were previously
verified active; a fourth simultaneous allocation remains unavailable. The
first-product trial is one month for accounts never subscribed to this app;
additional products do not promise repeat trials to existing subscribers.

Before public activation: preserve the exact current function bundle, deploy
the reviewed five files with verify_jwt=true, compare readback and run
side-effect-free rejection probes. Then enable the exact public switch through
the established privileged settings workflow and verify authenticated readiness
without initiating another purchase. Verify the separately installed new-store
rollout trigger is unlaunched before activation. Only after checkout is usable,
launch new-store enrollment; preserve all existing stores and receipts. Do not
activate new-store restrictions while users have no purchase/restore path.

The operator's new request prioritizes Android submission during the early hours
of 2026-10-16; iOS work is deferred. New screenshots show Play-installed Android
1.22, Songcheon's selected store and the active subscription explanation. They
do not independently prove a cold restart, expired UI or employee-session refusal.
Existing normal subscription/restore checks must not be requested again.

The exact code-23 binary is already offered on the internal track and saved as
the Production candidate. The Play Console still reports not sent for review.
Managed publishing was off at the prior verified checkpoint; recheck it before
submission and make the release consequence clear to the operator. Google
approval/publication time cannot be promised. Backup/processor policies and
identity-verified support processing remain operating responsibilities; no
unknown contract term or full customer erasure was verified by these tests.

Narrow main-based source verification: 803 root checks, 793 passed, zero failed,
10 environment-dependent skips. The cumulative installed-Android source was
also checked separately (980 total / 969 passed / zero failed / 11 skipped,
plus 64 mobile checks). No mobile file or installed binary is changed here.
