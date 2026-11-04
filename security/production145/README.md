# MANEE 1.45 backend promotion

This change prepares the backend APIs used by the 1.45 mobile clients: manager permissions, staff expenses, sales and vendor writes, contracts, notices, reservations, verified-phone signup and social signup. It does not deploy the database, Edge Functions, web application or store builds.

## Database package

`promote.sql` contains 9 additive tables, 25 additive columns, 53 function definitions and related policies/triggers. `production145-manifest.json` lists the exact scope and expected function hashes. The script seeds manager permissions from existing assignments and copies checklist history; it does not delete existing business records or change subscriptions.

The transaction checks its starting function definitions, applies short lock and statement timeouts, checks resulting definitions/grants, and runs synthetic role checks inside a savepoint. The fixtures and any queued fixture events are rolled back before commit. A failed statement aborts the transaction. A successful commit is not automatically reversible: subsequent changes require a reviewed forward fix or incident recovery. Retain the deployment version and a recovery point before execution.

Production notification dispatch and the production attendance live-session guard are deliberately preserved. Existing reservation deletion remains available for older clients. New tables do not inherit anonymous grants or authenticated table-administration privileges.

`scripts/build-production145-sql.py` regenerates the package from locally held schema/function catalog snapshots. Those input snapshots contain no business rows and are not published in this change. Do not regenerate from a different environment or execute after drift without reviewing the new diff.

## Rollout order

1. Review and approve the database scope, confirm a recovery point, then apply the transaction through the migration service. Record the actual migration version and compare the deployed manifest.
2. Configure the production SMS provider and social-auth providers through their supported administration interfaces. Never put credentials in source or logs.
3. Deploy the SMS/social/Naver adapters, verify their provider configuration, then coordinate the owner/staff signup and username-check handlers with compatible client rollout. The new signup handlers require a consumed SMS proof and must not be switched while older active signup clients still omit it.
4. Verify the production web and both signed mobile candidates against production, including existing-login/update continuity, owner/staff/manager boundaries, expenses/sales/reservations and export. Confirm native purchase restoration and notification registration/delivery on the final builds; mocked checks are not device validation.
5. Confirm the store build IDs and offers, then submit/release the intended candidates. Database readiness alone is not a release approval.

## Validation performed

- 39 offline Edge tests passed: authenticated social identity, provider-result handling, allowed project routing, age consent, signup roles, SMS proof requirements and uncertain-operation recovery. Provider requests are mocked.
- A staging transaction passed the synthetic owner/staff/manager smoke script, including duplicate expense requests, cross-store denial and revoked-session denial. All fixtures were rolled back.
- The full promotion transaction has not been applied to production. Its integrated smoke test must pass during the actual migration. Store purchase, real SMS, real push and final-device tests remain rollout checks.

Run the offline checks with:

```sh
node --experimental-strip-types --test security/production145/edge-handlers.test.mjs security/signup-age-edge.test.mjs security/staff-signup-edge.test.mjs
```
