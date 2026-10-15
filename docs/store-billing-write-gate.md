# Staged business write enforcement


Added explicit per-store billing enrollment, initially empty. Android ledger
entitlement now guards 18 store-keyed business tables at the database, including
writes through SECURITY DEFINER RPCs. Reads and existing membership checks remain
unchanged. Both OLD and NEW store IDs are checked, so moving a row cannot bypass
an expired source/destination store. The caller cannot alter enrollment or call
the internal entitlement predicate. A member-facing invoker RPC returns only
`enforced` and `canWrite`; it checks live session, membership and account ban.

Confirmed on isolated PostgreSQL (PGlite), 4 scenario tests: empty enrollment;
unauthorized policy access; all 18 write triggers; read preservation; cross-store
updates; active/grace/canceled-before-expiry; expiry/hold/pause/pending; stale
observations; Sandbox/Production separation; staff access restoration; superseded
receipts and revoked owner membership. Staging deployment confirms 17 triggers,
0 enrolled stores, no anonymous status grant and no client enrollment/probe grant.

This is an Android pilot, not complete paid rollout. On 2026-10-14, the existing
explicit-enrollment migration was applied to Production with zero enrolled stores.
No live store is restricted. Attendance was originally excluded; the selected
launch policy below supersedes that exclusion. Identity/account recovery, notifications, crew
profile changes, indirect child records and storage are outside this first gate.
Full account-erasure/cascade behavior, iOS entitlements, production-receipt
refresh behavior, the remaining write surfaces, and on-device expiry behavior
must be verified before production enrollment. Per-store Android
product allocation, product-aware receipt verification and refresh are now
implemented. Two separate Play products were verified simultaneously active in
Sandbox on 2026-10-14; see `android-multi-store-billing.md`. This does not enable
production billing or production write enforcement.

Initial live recheck on 2026-10-14: staging and production each had 17 write-gate triggers
and 0 enrolled stores. The authenticated access RPC exists in Production; anonymous
callers cannot execute it. Three known owner stores still evaluate as write-entitled
because none is enrolled.

Android 1.16 adds an owner-facing per-store 이용권 screen to the native 더보기 menu.
It reads the authenticated membership-checked access RPC and displays sandbox
purchases separately from write entitlement. When the database rejects a direct
business mutation with P4402, the owner is shown that status screen; staff are
directed to the owner. An unavailable RPC is an unknown state, never an access
grant. This is an internal setup build. Before the status migration, Production
showed a connection-pending status; after refresh it reports the store as
unenrolled and unrestricted. The
status screen does not offer a real purchase until production receipt validation
and the broader gate are complete.

For a missing production status RPC (PGRST202), the screen says that the
connection is being prepared; other failures remain unknown. Neither path
claims write access. Android 1.16 / code 17 was rebuilt from commit
`ce4e14cd7b9f9326b9379bef0e288763ddbe0520`: Actions run `38541291146`
passed mobile tests, signed bundle verification and artifact upload. Final AAB
SHA-256: `82355b47d77637d46802ff05b657960f42d6e1d44aea4cdb8e27c2373ade569e`.
On-device screenshots confirm the owner screen opens for two selected stores;
the refreshed Production RPC display remains to be checked on device.

Security advisor review: the new private deny-by-default table reports informational
RLS-without-policy, intentionally with all client grants revoked. Unrelated staging
warnings remain for public SECURITY DEFINER ratio/snapshot RPCs and disabled leaked
password protection. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Follow-up migration `20261014093800_monthly_net_payroll_billing_gate.sql` adds
`monthly_net_payroll` as the 18th direct-key write surface. It uses the same
OLD/NEW store checks; unenrolled stores remain unrestricted, and reads remain
available. Staging confirms 18 gates, zero enrolled stores and an unrestricted sample store.
This does not enroll a store or initiate a charge.

The follow-up migration `20261014095000_sales_report_photo_billing_gate.sql`
resolves a photo record's parent sales report on both sides of a mutation.
This covers insert/update/delete of the child table while preserving reads;
announcement read acknowledgements and attendance remain accessible. There
are no configured Storage buckets in the connected staging or production
projects as of this audit, so this migration adds no Storage policy.
No store is enrolled or charged by this change.

Production follow-up on 2026-10-14: the photo-child migration is installed.
Production has 18 direct-key triggers and one photo-child trigger, zero enrolled
stores, and the two sampled owner stores remain write-entitled. The Android
staging regression workflow for commit `a6b078edbd2cc68abfc0b731a3bda5ecb8ec71e1`
passed the app/security regression job before production deployment.

## Read preservation before enrollment

Audit on 2026-10-15 found that the owner fixed-cost loader calls
`manee_prepare_fixed_costs` before its SELECT. This RPC copies previous-month
costs and materializes recurring templates. When enrollment denies writes,
its insert trigger can reject that RPC and the existing app then clears the
fixed-cost list as a load failure. Migration
`20261015112000_fixed_cost_read_billing_gate.sql` keeps membership and month
checks, then returns without materializing costs if the store is not currently
write-entitled. It leaves existing rows readable and the ordinary database
write trigger unchanged. Local PostgreSQL tests cover expired enrollment with
an existing row and both automatic write paths, recovery with a fresh receipt,
another unenrolled store, and direct-write rejection. This migration was
applied to Staging and Production on 2026-10-15. Production postflight confirms
the function includes the entitlement skip and zero stores are enrolled.

The original direct client mutation audit found these deliberate exclusions: `stores`
settings (including the location used for employee clock-in), `crew` and
membership/identity maintenance, `attendance` and edit requests, read
acknowledgements, notification subscriptions, and tax reminder acknowledgements.
No expiry behavior for those paths has been approved or enabled. Store creation,
renaming, deletion and franchise management have separate account/recovery
effects and must not be swept into an all-row `stores` billing trigger. The
original gate therefore covered its listed business tables, not every possible
mutation in the application. Production enrollment remains at zero until the
remaining boundary and on-device lifecycle checks are complete.

## Selected launch expiry policy — 2026-10-15

The operator explicitly selected blocking attendance as well as business input
when a store's subscription is no longer entitled. Migration
`20261015130000_attendance_billing_gate.sql` adds the existing OLD/NEW store gate
to `attendance` and `attendance_edit_requests`. It covers real employee clock
RPCs, owner/manual edits/deletion, employee confirmations/correction requests,
and approvals running through SECURITY DEFINER functions. Clock-out is also
blocked if entitlement expires during an open shift; the existing open record
remains unchanged and readable. Active/grace receipts and cancellation before
expiry remain entitled; a fresh valid renewal/restore reopens attendance.

The migration adds no enrollment and changes no read, identity/recovery,
purchase or restore permissions. Other identity/store/notification exclusions
above remain separate from business input. Native 1.21/code 22 is prepared with
the corrected expiry explanation; 1.20 must not be used as acceptance evidence
for this new policy because its access screen still says attendance is allowed.

Six integration scenarios use the real staff clock/correction/confirmation and
approval SQL against the existing RLS fixture. They cover unenrolled operation,
expired clock-in/out, preserved open records/reads, owner and cross-store
mutations, pending correction atomicity, renewal/restoration, cancellation,
Sandbox isolation, account hold and stale receipt checks. The staff UI test
also confirms a P4402 refusal keeps login and does not claim a successful clock.
The migration is installed on Staging and Production. Both postflights
confirm both triggers, zero enrolled stores, and no client enrollment or
internal-predicate grants. Handset acceptance remains required before enrolling
a live store. The updated source passes 923 root checks: 913 passed, zero failed,
10 environment-dependent skips, plus 64/64 mobile checks. These do not prove a
new signed binary or live handset acceptance.

## Crew payroll follow-up — 2026-10-15

The 1.21 handset screenshots confirm Play installation, the Songcheon active
subscription screen and the new expiry explanation. At 21:17 KST the handset
reports Google Play purchase/server verification complete after restore. A
Production read confirms an ACTIVE, unexpired receipt checked at 21:17 KST.
There is still no enrolled live store. A restart and actual expired attendance
on the handset are not established by those screenshots.

The crew exception also allowed customer updates to salary, wage type, tax,
weekly allowance, insurance, probation, work condition and weekly hours. Migration
`20261015122057_crew_payroll_billing_gate.sql` narrows that exception: those
changes, payroll-setup completion, nonzero-pay crew creation, crew deletion and
cross-store movement require the original store entitlement. Both OLD/NEW stores
are checked. Existing RLS and record-identity restrictions remain in force.

The established owner-approved zero-pay account connection stays available, as
do personal-profile corrections and offboarding fields. A zero-pay identity
cannot acquire paid wages or complete payroll setup while expired. Backend
cleanup without a customer JWT remains possible. Hire/resignation dates, role
and account/identity maintenance retain their existing permission boundaries;
this is a financial-setup gate, not a claim to reject every crew-field change.

Ten combined attendance/payroll integration scenarios pass, including real
staff approval RPCs, restored financial setup, direct bypass attempts, preserved
identity edits and backend cleanup. Root regression: 927 total, 917 pass, zero
failures and 10 environment-dependent skips. No mobile assets changed, so the
already published 1.21 binary remains the handset candidate.

Staging deployment/postflight confirms the new trigger, zero enrolled stores,
and no anonymous/authenticated direct execution of the trigger function. Security
advisories are unchanged: the same 25 intentionally private RLS-without-policy
INFO findings and four pre-existing warnings. Production deployment was rejected
by automatic approval review because this payroll/employee-record restriction
extends beyond its recognized attendance authorization. It is NOT installed in
Production; no retry or indirect execution was used. Obtain explicit approval
for that precise production change before applying it. No enrollment is part of
this migration.
