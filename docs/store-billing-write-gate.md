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
Full account-erasure/cascade behavior, iOS entitlements, production refresh worker,
UI access-state integration and signed device build must be verified before
production enrollment. Multi-store product allocation remains unimplemented: the
Android purchase verifier, SQL save and refresh worker still expect one fixed
product. Do not enable a second store checkout under the existing SKU.

Security advisor review: the new private deny-by-default table reports informational
RLS-without-policy, intentionally with all client grants revoked. Unrelated staging
warnings remain for public SECURITY DEFINER ratio/snapshot RPCs and disabled leaked
password protection. See https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
