# Direct read security follow-up — 2026-11-04

Production and staging now apply `direct_read_session_and_franchise_mfa_guards`.
The change modifies eight existing SELECT policies, preserving their original
predicates, roles, and permissive/restrictive types. No business rows, write
policies, grants, subscription enforcement, or session records were changed.

- Self reads of store memberships, franchise memberships, and platform-admin
  memberships now require a live session. AAL1 self reads remain available for
  login initialization.
- Franchise reads of claims, claim messages, join requests and update logs now
  require AAL2 as well as a live session.
- Targeted franchise announcements require AAL2 through the franchise audience
  path. Global notices and the separate store-member audience path are preserved;
  ordinary owners and staff can still read their store/franchise announcements.

The migration backs up each original expression in
`private.manee_security_policy_backup`, with no customer/service-role access.
It refuses changed policy definitions. Before and after alteration, it compares
row fingerprints under the actual authenticated role for all live active-profile
sessions: the three self-read tables at AAL1 and all eight tables at AAL2. Any
unexpected difference aborts the entire transaction. The reviewed rollback also
refuses policies changed since deployment.

Validation: exact production policy/helper definitions were exercised with
synthetic owners, staff, franchise admins, platform admins, unrelated users,
disabled profiles, revoked/expired sessions and revoked franchise membership.
Tests cover AAL1/AAL2, metadata spoofing, cross-user session IDs, anonymous reads,
store notice visibility, exact policy rollback and drift rejection.
Repository regression: 859 tests, 849 passed, 10 skipped, zero failures.
Staging and production readback each confirmed eight backups and eight matching
active policy expressions. Production retained one verified TOTP factor and one
AAL2 session after deployment; operator enrollment/login was verified at
2026-11-04 12:42 KST.

Earlier production work is complete: PR #58 is merged as
`4503883c1e8a5b7dcc7947c8735adf8887ee302b`; anonymous/invalid-token web requests to
AI, receipt and push endpoints are rejected. Platform/franchise helper MFA
guards are deployed. These replace the older checkpoint's pending-approval and
unenrolled-MFA status.

Remaining work is not closed by this patch: full direct-table/storage/RPC audit,
production/staging signup and granular-permission parity, leaked-password
protection, signed native releases/device checks, secure native token storage,
full attachment decoding/scanning, legacy hash retirement, billing-exception
decisions and staging retention. Production reservation and completed-deletion
cron jobs were independently observed active with successful latest runs.

The three SECURITY DEFINER advisor warnings were inspected: food/labor ratio
setters enforce a live owner session; subscription snapshot requires a live AAL2
platform role. They are deliberate guarded entrypoints, not anonymous access.
Leaked-password protection remains disabled. Its Auth setting has no exposed
mutation operation in the current connector; it has not been silently enabled.
Legacy hashes are still referenced by `private.bootstrap_franchise_account` and
`private.issue_legacy_temp_password`, so no hash rows/columns were deleted.
