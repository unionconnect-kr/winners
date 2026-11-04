# Matching mobile 1.43 update and launch promotion audit

User decision (2026-11-04): request the subscription at signup, with a 60-day introductory promotion. Apple supports calendar-month introductory offers; the user selected the option explaining two months on iOS. Android target: P60D, offer ID trial-60days. iOS target: two calendar months. Subsequent standard price remains KRW 9,900/month per owner account. Only store-confirmed eligible offers may be displayed as free. Korean conversion consent must not be described as unconditional charging.

## Deliverable scope

Both 1.43 candidates use the same archived complete screen baseline, platform adapters and secure authentication implementation. Android versionCode 44; iOS marketing version 1.43 with unique 143.run.attempt build numbers. Both are STAGING validation updates, not production releases. The dedicated workflow builds the complete Android APK, runs both browser audits and Android native tests, then signs the matching iPhone archive and requests its TestFlight upload. No public App Store review or Play production rollout is included.

## Promotion changes prepared

- Signup copy distinguishes creating an account from requesting the store subscription and gaining trial entitlement.
- Android purchase UI accepts the exact 60-day free phase followed by KRW 9,900/month, rejects the former one-month offer and nonmatching price/duration.
- iOS native product validation recognizes two-month free offers, and the purchase button uses the same period. Ineligible users see the ordinary purchase terms.
- Korean paid-conversion consent, actual billing date, cancellation and eligibility are explained.
- Historical 1.39/1.42 artifacts and baselines are kept intact. Existing customers, billing rows and subscriptions are not migrated by these source changes.

## Launch blockers / remaining verification

1. Activate and verify the Google Play 60-day offer and Apple two-month introductory offer in their consoles. Changing app text does not configure a store product. Current console offers have not been verified in this run.
2. Current signup does not automatically open a store checkout; finish integration after the server's account billing contract and store configuration are verified. Staging candidate payment/push adapters remain disabled as before; these candidates must not be presented as working paid production apps.
3. The production DB default_trial_days is 40. It is a legacy reporting setting, not the store's authoritative subscription expiry. Do not extend existing customers or grant an additional app trial by blindly changing it. HQ must report store-confirmed expiry separately from legacy trial cohorts.
4. Production and staging still differ in permissions, account billing and services. Promote the complete UI only after checking those dependencies; the old generic build path omits later sector UI changes. Do not simply switch the staging project ID to production.
5. Update website, terms, subscription FAQs, store listings/screenshots, onboarding and advertisements from 1 month/40 days to accurately qualified Android 60 days / iOS 2 months. No unattended advertising publication or messages are authorized.
6. Verify purchase/restore, ineligible accounts, conversion consent rejection, cancellation, refunds/revocation, cross-platform duplicate subscription blocking, account switching and all owned stores using sandbox/store tests. Never infer these from client text tests.
7. Existing free-exception stores and franchise contracted prices remain unchanged. Campaign end date and existing-account eligibility must be agreed before launching that cohort.
8. TestFlight processing/tester availability and physical-device update/session migration still require confirmation after signed upload. APK signature continuity and iOS distribution signature are independently checked.

## Evidence

Local mobile tests: 146 passed, 0 failed, 0 skipped. Common Android/iOS web assets compile. Cloud workflow results are pending and must be recorded separately.
Official references: Apple introductory offer durations https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/ ; Apple Korea conversion consent https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/consent-for-subscription-offer-conversions ; Google Korea conversion consent https://support.google.com/googleplay/android-developer/answer/15722617?hl=en .
