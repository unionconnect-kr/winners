# Security remediation checkpoint — 2026-11-04

Production DB: session guard helpers for store membership and platform roles deployed with exact definition backups in private.manee_security_function_backup. All live active-profile session permissions compared before/after inside the migration; any mismatch aborts. No sessions or business records deleted. Service authorization/quota RPC deployed; anonymous EXECUTE revoked. Staff notifications use fixed server text and owner-only destinations; receipt permissions follow existing sales access.

Production admin web: commit 9005dd3 contains UI sanitization, CSP and authenticator enrollment/challenge. Verified live HQ and partner pages include the changes. MFA server gates for platform/admin/franchise helpers are deployed to staging only, with rollback tested. Production MFA application was denied by automatic review and needs explicit approval. User enrollment remains outstanding.

Production app web: PR #58 (cc45372887881baa00e6d16b51d3a908cdda2c3c) passes GitHub CI and Netlify preview build. Automatic review denied the main merge because production deployment needs explicit approval. Do not bypass this through direct deployment or branch updates. Live app web still has the old handlers/UI; deploying an authorization RPC alone does not close the endpoint vulnerabilities.

Android 1.41 is a staging-only debug-signed QA package (versionCode 42), preserving the original native shell and signing identity. It is NOT a production-signed release. iOS build scripts include shared sanitization; no TestFlight or App Store upload in this turn.

Validation: app suite 1,014 passed / 11 skipped; web 847 passed / 10 skipped; mobile 132 passed. Additional MFA matrix passed. Web CI also passed PostgreSQL concurrency checks, build checks and native iOS service tests. CSP hashes match both final app and deletion-page inline scripts. Preview is access-protected (anonymous HTTP 401), so visual browser validation is not asserted.

Remaining audit scope: production signup/SMS/granular-permission parity; remaining direct-table and franchise session paths; production MFA gate + owner enrollment; leaked-password protection; production-signed Android/iOS and real-device payment/refund lifecycle; secure native token storage; full attachment decoding/re-encoding/PDF scanning; legacy password-hash retirement; approved reasons/expiry for 15 billing exceptions; staging reservation/SMS retention. Existing partial attachment signature validation is NOT a malware scanner. Broad historical RLS/attachment migration files are not authorized for blind production application.

Next approvals: merge PR #58 to main for app web deployment; apply security/admin-mfa-guards.sql to production after final backup drift check. After each, read back production state and test without sending real notifications, SMS or paid AI requests. Then continue remaining items; do not declare all 16 findings closed.
