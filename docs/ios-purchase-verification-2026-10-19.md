# iOS purchase verification and submission checkpoint — 2026-10-19

## Submitted release

App Store Connect accepted one submission at 13:08 KST with seven items: iOS app 1.0 (build 1.8.1), three monthly subscription products, and their three subscription groups. Submission ID: ffc6b8e8-746d-42b1-8f27-c0701158bbb6. The app was still Waiting for Review when its notes were updated after the 14:10 KST owner confirmation. Approval and public availability are not confirmed.

Products: `manee.store1.monthly`, `manee.store2.monthly`, `manee.store3.monthly`. Each store costs KRW 9,900 monthly in South Korea. Only the eligible first-store product offers a one-month introductory trial; slots 2 and 3 have no introductory trial.

## Observed physical TestFlight purchases

The owner supplied actual iPhone TestFlight purchase sheets and purchase-success alerts. The additional-store sheets displayed KRW 9,900/month, no introductory trial, and test-only purchases with no charge.

Server reads confirmed these three simultaneous subscriptions, each attached to its matching synthetic store and product:

| Synthetic store | Product | Environment | Status | Revoked | Latest server check (KST) |
| --- | --- | --- | --- | --- | --- |
| 매니 심사 전용 가상매장 | manee.store1.monthly | Sandbox | active (1) | false | 14:07:07 |
| 매니 결제검증 전용 가상매장 2 | manee.store2.monthly | Sandbox | active (1) | false | 14:07:07 |
| 매니 결제검증 전용 가상매장 3 | manee.store3.monthly | Sandbox | active (1) | false | 14:09:21 |

These checks prove saved mappings and fresh Apple server revalidation. They do not prove which device action triggered each refresh. First-store restart/restore UI evidence exists from earlier that day. At 14:10 KST, the owner confirmed that the test subscriptions were visible after the requested restart/restore checks for stores 2 and 3. This is owner-reported device confirmation; no new screenshots of those restored screens were supplied. Cancellation, expiry, refund, and revocation lifecycles have not been physically exercised in this checkpoint.

The review account has access only to the three labelled synthetic stores; the primary review demo holds the sample business records. The two extra stores are empty purchase fixtures. No purchase receipts were simulated.

## Production configuration and deployment

The operator explicitly approved activation and final Apple submission on 19 October.

- Netlify `IOS_PURCHASES_ENABLED=true`, Production context, Functions scope only.
- Production redeploy `6ad595057f591dd922049c1c` published at 12:57 KST from main `7d1c2cd0564ab1f5b64ade7ea18f38009955d565`.
- Database production gate enabled; catalog slots 1–3 enabled. Slots 4–10 remain disabled.
- Sandbox production-write gate remains disabled. Test transactions remain distinct from production entitlements.
- Original 16 active stores retained all 16 write entitlements after activation and after adding the two synthetic fixtures.
- Public service health returned billing credentials present, billing signing ready, push credentials present, push signing ready, and checkout configured, all true.
- Public bearer-protected billing endpoint rejected an unauthenticated status request with HTTP 401 `authentication_required`.

The health field `maintenanceCredentialPresent` was false. Scheduled functions use the separate `scheduled:true` factory and do not require that public endpoint bearer token. No maintenance credential was changed.

## Follow-up UI clarification prepared

The physical test exposed that a button labelled only `₩9,900 / 월` looked like a passive price. This branch makes the purchase action explicit, gives it a dark-green primary appearance, and labels the gate action as opening the subscription/restore screen.

Validation: native JavaScript syntax check passed; the five existing billing-client tests passed. No full native build, simulator rendering, device installation, or binary upload has been performed for this copy-only follow-up. It is not included in the submitted build 1.8.1.

The App Store review notes were updated with the three actual purchase results and the owner-reported additional-store restart/restore confirmation, without withdrawing the submission. Existing app review contacts, credentials, automatic release setting, and temporary demo expiry were preserved.
