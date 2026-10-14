# Staged business write enforcement


Added explicit per-store billing enrollment, initially empty. Android ledger
entitlement now guards 17 store-keyed business tables at the database, including
writes through SECURITY DEFINER RPCs. Reads and existing membership checks remain
unchanged. Both OLD and NEW store IDs are checked, so moving a row cannot bypass
an expired source/destination store. The caller cannot alter enrollment or call
the internal entitlement predicate. A member-facing invoker RPC returns only
`enforced` and `canWrite`; it checks live session, membership and account ban.

Confirmed on isolated PostgreSQL (PGlite), 4 scenario tests: empty enrollment;
unauthorized policy access; all 17 write triggers; read preservation; cross-store
updates; active/grace/canceled-before-expiry; expiry/hold/pause/pending; stale
observations; Sandbox/Production separation; staff access restoration; superseded
receipts and revoked owner membership. Staging deployment confirms 17 triggers,
0 enrolled stores, no anonymous status grant and no client enrollment/probe grant.

This is an Android pilot, not complete paid rollout. Production database is not
modified. No actual store is enrolled. Attendance remains available to avoid
stranding an employee mid-shift; identity/account recovery, notifications, crew
profile changes, indirect child records and storage are outside this first gate.
Full account-erasure/cascade behavior, iOS entitlements, production-receipt
refresh behavior, UI access-state integration and a signed device build containing
that integration must be verified before production enrollment. Per-store Android
product allocation, product-aware receipt verification and refresh are now
implemented. Two separate Play products were verified simultaneously active in
Sandbox on 2026-10-14; see `android-multi-store-billing.md`. This does not enable
production billing or production write enforcement.

Live recheck on 2026-10-14: staging still has 17 write-gate triggers and 0 enrolled
stores. Production has no enrollment table and no billing write-gate triggers.

Android 1.16 adds an owner-facing per-store 이용권 screen to the native 더보기 menu.
It reads the authenticated membership-checked access RPC and displays sandbox
purchases separately from write entitlement. When the database rejects a direct
business mutation with P4402, the owner is shown that status screen; staff are
directed to the owner. An unavailable RPC is an unknown state, never an access
grant. This is an internal setup build. Production has no access RPC yet and
therefore shows a connection-pending status; no store is newly restricted. The
status screen does not offer a real purchase until production receipt validation
and the broader gate are complete.

Security advisor review: the new private deny-by-default table reports informational
RLS-without-policy, intentionally with all client grants revoked. Unrelated staging
warnings remain for public SECURITY DEFINER ratio/snapshot RPCs and disabled leaked
password protection. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
