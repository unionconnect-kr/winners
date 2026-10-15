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
No live store is restricted. Attendance remains available to avoid
stranding an employee mid-shift; identity/account recovery, notifications, crew
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

The direct client mutation audit found these deliberate exclusions: `stores`
settings (including the location used for employee clock-in), `crew` and
membership/identity maintenance, `attendance` and edit requests, read
acknowledgements, notification subscriptions, and tax reminder acknowledgements.
No expiry behavior for those paths has been approved or enabled. Store creation,
renaming, deletion and franchise management have separate account/recovery
effects and must not be swept into an all-row `stores` billing trigger. The
current gate therefore covers its listed business tables, not every possible
mutation in the application. Production enrollment remains at zero until the
remaining boundary and on-device lifecycle checks are complete.
