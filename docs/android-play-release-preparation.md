# Android Play release preparation — 2026-10-14

User decision: proceed toward Android/iOS launch, deferring optional physical GPS,
long background-session and missing historical-backup checks. These are not passed.

## Confirmed console state

- Company Play Console sign-in succeeded; app `kr.co.manee.app` exists as a draft.
- Store setup is 10/11 complete. Data Safety has prefilled answers but has not been
  finally saved. Its assertions need to match the final production binary.
- Play App Signing is already enabled. No upload-key certificate is registered;
  the first uploaded bundle will establish it.
- No subscription products exist. The console requires an APK/bundle with Billing
  before allowing subscription creation.
- Agreed offer: KRW 9,900 per store per month (VAT included), one calendar month
  trial, store-managed consent/renewal. Added stores are also KRW 9,900.

## Implemented in this change

- Native Google Play Billing bridge: live product/offer pricing, checkout,
  purchase queries, cancellation/pending states, and update events.
- Android billing coordinator: owner context checks, duplicate checkout lock,
  interrupted purchase recovery, and mandatory server verification.
- Server verification core: fresh Google API lookup, opaque owner/store binding,
  production/test separation, expiry/hold handling and acknowledgement only after
  durable persistence. API and database adapter are not activated.
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
coordinator has 10 focused automated tests and the server verification core has
8 tests. Native compilation is a separate gate.

Local compilation could not download the new Billing dependency because this
workspace cannot reach Google Maven. Remote Android build run 38430394788 is used
to resolve and compile that dependency without bypassing network restrictions.

Remote run 38430394788 compiled the Billing 9.1.0 plugin successfully. Its package
verification failed because the former test-app checker prohibited BILLING. The
checker now explicitly requires Google's Billing permission while retaining all
other permission restrictions and staging isolation. A follow-up run verifies
the complete package; this is not a store purchase or production release test.
