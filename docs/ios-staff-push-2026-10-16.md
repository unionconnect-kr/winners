# iOS staff push correction — 2026-10-16

Device QA found that the staff notification toggle returned an owner-only error.
The mobile guard, status endpoint, RPC enrollment and tap router now authorize
approved active staff and managers through their live store membership.
Self-tests only target the caller; billing stays owner-only. Unscoped business
events continue to target owners, so staff cannot receive financial/report alerts.
Staff business-event delivery is not added by this patch; the corrected staff
controls cover enrollment, revocation and an account-scoped device test.

Migration native_ios_staff_push applied to staging and production. Anonymous
registration and authenticated device listing remain blocked. Existing private
RLS configuration and security advisor findings are unchanged. The attempt to
validate by impersonating a real staff session was rejected and was not run.
Use physical-device consent and testing instead.

Validation: mobile 76 pass; root/security 989 pass, 11 environment skips; five
focused SQL/HTTP tests pass. These include resigned/revoked/foreign membership,
expired sessions, bans, cross-account device takeover, billing denial, owner-only
broadcast targets, self-only test recipients and stale tap navigation.

Signed build 1.0 (1.7.1): source 3742c1810147c36ccb3450237fa0fa153163168d,
run 38862564226, artifact 12029647820,
SHA-256 8a2a7432abfbc5307906dd31a317feb69b5d1a4ff8a04a8b9a65a5993eb5bb59.
Uploader pins all four before exposing Apple credentials. It does not submit
review, invite new testers, modify contracts or enable paid checkout.
Actual APNs receipt/tap/logout remain physical QA gates after update.
