# MANEE 1.45 backend promotion

This change prepares the backend APIs used by the 1.45 mobile clients: manager permissions, staff expenses, sales and vendor writes, contracts, notices, reservations, verified-phone signup and social signup. The database package was applied through the migration service after approval, and the three new SMS/social/Naver Edge Functions were deployed. Web rollout, existing signup-handler cutover and store releases are separate steps.

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
- The full promotion transaction passed in production and was recorded as migration `20261104174345_manee_145_production_service_parity`. The exact applied SQL is also checked in under `supabase/migrations/` using that service-generated version.
- A post-commit catalog read matched all 53 function definitions, all 25 additive columns and RLS on all 9 new tables. None of the selected functions is executable by `anon`. Synthetic store fixtures were absent after commit.
- The three new Edge Functions are active at version 1. HTTP checks return the expected 400 for an invalid SMS request and 401 for unauthenticated social/Naver requests.
- Store purchase, real SMS, real push and final-device tests remain rollout checks. Provider settings and compatible signup clients must be verified before replacing existing signup handlers.

Run the offline checks with:

```sh
node --experimental-strip-types --test security/production145/edge-handlers.test.mjs security/signup-age-edge.test.mjs security/staff-signup-edge.test.mjs
```

## Production authentication checkpoint — 2026-11-05

After the user completed dashboard sign-in, the staff production project was inspected through its administration UI:

- SOLAPI_API_KEY, SOLAPI_API_SECRET and SOLAPI_SENDER_NUMBER are present in staging but absent from production. Supabase's secrets list exposes digests, not recoverable values; no secret values were extracted. Existing provider credentials must be entered through the supported configuration interface.
- Production Kakao is disabled with empty REST API Key and Client Secret Code fields. Staging Kakao is enabled and permits users without email. Production should use the approved application and its production callback, preserving the app's nickname-only scope.
- Staging has an enabled OAuth2 provider named custom:naver, with authorization URL https://nid.naver.com/oauth2.0/authorize and token URL https://nid.naver.com/oauth2.0/token. Its adapter is the staging manee-naver-userinfo function, scopes are empty, and users without email are allowed. The production equivalent must point to https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-naver-userinfo and use the approved application's credentials.
- Production manual identity linking was disabled and was not changed during this checkpoint. Existing-account linking requires enabling it when social providers are configured.
- The production Site URL was changed from http://localhost:3000 to https://winners-staffapp.netlify.app. The dashboard explicitly reported successful save.
- Production initially had no allowed redirect URLs. An attempt was made to save these two narrowly scoped callback patterns:
  - kr.co.manee.app://auth/callback?manee_auth=callback&flow=*
  - https://winners-staffapp.netlify.app/?manee_auth=callback&flow=*
  The browser-control service timed out during this save and subsequent state recovery. **The save outcome is unknown. Inspect the list before retrying; do not assume either success or failure.**
- The external Kakao/Naver application redirect registration must include https://bhwuuxcrzxespkjlmqxr.supabase.co/auth/v1/callback. Its registration has not been checked.
- No provider was enabled, no credential was changed, and no SMS was sent during this checkpoint. The existing signup handlers, production web and store distribution remain unchanged.

The signed iOS 1.45 / 145.5.2 archive completed in workflow run 41870950414, attempt 2, and its App Store Connect upload step succeeded. Apple processing, TestFlight availability and public release are separate unverified states.
