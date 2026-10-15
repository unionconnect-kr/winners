# Completed deletion request retention

This implements the existing 30-day post-completion standard for the private
support request, including its contact and note. It does **not** delete customer
accounts, cancel purchases, or erase shared store/employee records. Support must
verify identity and actual account erasure before marking a request completed.

The operator's transition to `completed` records a server `completed_at`. Updating
notes cannot backdate, reset or extend that timestamp. Reopening a case clears
the deadline; a later completion starts a fresh period. Legacy completed cases
without a known completion timestamp are preserved for restricted operator review.
Pending, in-review and rejected requests are not selected by this operation;
they require the existing support disposition and data-minimization procedure.

The private invoker maintenance function erases only completed requests whose
server timestamp is at least 720 hours old, in batches of at most 1,000. It
refuses customer JWTs and grants no execution or read access to anon,
authenticated or service_role. It contains no account/customer-table mutation.
Installation adds the column, index and trigger; it schedules or erases nothing.

After checking the exact Production schema and approval for automated disposal,
schedule `select private.manee_purge_completed_deletion_cases(500);` under the
privileged operator with hourly cron `15 * * * *`, job name
`manee-completed-deletion-case-retention`. Verify the first run, job failures,
remaining due count and preservation of noncompleted cases. Existing unknown
completion dates must not be guessed from `reviewed_at` or `requested_at`.

Disabling the cron job stops future disposal. Completed support cases already
erased cannot be restored through the app. Backups, logs, exports and processors
retain their independently configured terms; this database operation does not
claim to erase those copies. Production activation is recorded below.

Verification on 2026-10-16: eight focused retention scenarios and five existing
request scenarios passed. Staging migration installation succeeded; seven hosted
transaction-only checks passed and the synthetic case was rolled back. No cron
was scheduled. Security advisors are unchanged (26 private RLS-without-policy
INFO, three existing public-definer warnings and the existing password warning).
On the cumulative Android source, root regression was 980 total / 969 pass /
zero fail / 11 environment-dependent skips; mobile was 64/64. These are not
Production disposal results or evidence of handset expiry/employee refusal.

## Production execution record — 2026-10-16 KST

Following explicit operator approval, Production installed migration
`deletion_case_retention`. Cron job 8,
`manee-completed-deletion-case-retention`, was enabled at 02:14:29 KST with
`15 * * * *` (every hour at minute 15, UTC and KST). It runs
`select private.manee_purge_completed_deletion_cases(500);` as postgres.
The preflight verified no customer JWT, the installed completion trigger and
revoked maintenance execution for anon/authenticated/service_role.

The first scheduled run succeeded from `2026-10-15T17:15:00.169325Z` to
`2026-10-15T17:15:00.186719Z`. There were zero support cases and zero due cases.
The cron return message “1 row” is the SELECT result, not a deleted-case count.
No customer account or shared store record was deleted by this activation.
Production security advisors remained unchanged: 22 private-RLS-without-policy
INFO entries, three existing public-definer warnings and the existing password
warning. The earlier staging-only rehearsal results above remain separate.
