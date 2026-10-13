# Android Play release preparation — 2026-10-14

User decision: proceed toward Android/iOS launch, deferring optional physical GPS,
long background-session and missing historical-backup checks. These are not passed.

## Confirmed console state

- Company Play Console sign-in succeeded; app `kr.co.manee.app` exists as a draft.
- Store setup is 10/11 complete. Data Safety has prefilled answers but has not been
  finally saved. Its assertions need to match the final production binary.
- No subscription products exist. The console requires an APK/bundle with Billing
  before allowing subscription creation.
- Agreed offer: KRW 9,900 per store per month (VAT included), one calendar month
  trial, store-managed consent/renewal. Added stores are also KRW 9,900.

## Implemented in this change

- Native Google Play Billing bridge: live product/offer pricing, checkout,
  purchase queries, cancellation/pending states, and update events.
- Android billing coordinator: owner context checks, duplicate checkout lock,
  interrupted purchase recovery, and mandatory server verification.
- No client-side entitlement or acknowledgement. A client receipt alone cannot
  activate access. No purchase button is enabled by this preparatory change.
- Upload keystore files and passwords are excluded from Git.

## Remaining implementation and external configuration

1. Google Play Developer API authorization for a server identity, durable purchase
   binding, server-side acknowledgement, renewal/refund processing, and entitlement
   enforcement. The Firebase FCM private key is not an Android upload signing key
   and does not itself prove Play Developer API permissions.
2. Production Android Firebase app/config and production push registration/delivery.
   Existing Firebase client/backend is explicitly for `kr.co.manee.app.staging`.
3. Release signing key and production AAB pipeline. Existing release guards remain
   in force while release prerequisites are missing.
4. Create subscription base plan and one-calendar-month trial after first eligible
   bundle upload; verify real Play sandbox purchase/restore. Multi-store purchase
   allocation must work on both Android and iOS before purchases are enabled.
5. Final Data Safety/privacy/account-deletion consistency, store review submission.

The existing 862 checks describe the test app. They are not evidence that Play
billing, production FCM, signing or store review are complete. The new billing
coordinator has 10 focused automated tests; native compilation is a separate gate.
