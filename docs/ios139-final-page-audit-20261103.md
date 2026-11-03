# iPhone page and input audit — 2026-11-03

## Scope and results

271 named screen/state fixtures were opened at 320, 375, 390 and 430 CSS pixels: 1,084 layout checks and 1,968 rendered input checks. Thirty-three browser interaction checks pass. The existing 90 mobile tests pass. The live public account deletion page returned HTTP 200 and fits all four widths; no deletion request was submitted.

Coverage includes owner/staff entry, password and social choices, all five owner signup steps, staff signup, duplicate username and SMS ready/expired/busy states, password recovery/change and phone binding; all eight onboarding steps; populated/empty/error owner sections; attendance/staff details/payroll/adjustments; every sector 3 and sector 4 sheet type; store settings/alerts; staff and manager tabs, profile edit/confirm/error/success, connections, account linking; manager permissions/contracts; confirmation/photo/AI/help/native test notices. Long forms and dialogs were also scrolled to the end for screenshots. All 271 screenshot pairs were surveyed in contact sheets; representative form, menu, data and modal screens were inspected at full size.

Checks reject undersized controls, small input text, native control appearance, horizontal overflow, wrapped short actions, duplicate visible ids, invalid placeholder output and store selector icon overlap/duplicate arrows. Interaction checks cover role-specific entry, password reveal preserving values, empty credentials, remember choice, signup length/mismatch/age/availability guards, draft retention, invalid numeric values, save failure retention, receipt type rejection, duplicate submit suppression, short-viewport focus and social role/link intent.

## Corrections

- Remove the nested border introduced by common iPhone input styles inside the login icon/password row.
- Left-align owner signup fields, and use the same green/neutral tokens as signed-in screens.
- Keep the small-screen signup call-to-action labels on one line while retaining the one-month offer in the signup explanation.
- Match owner signup name/store/password limits to 50/80/72 characters and reject out-of-range draft values before advancing. Constrain login field lengths.
- Restore the store selector's leading icon inset and remove the duplicate chevron caused by the common select override.
- Match native test-notice close button height and color to the app.

## Reproduction

Run mobile tests first (they overwrite www), then rebuild the reviewed iPhone bundle:

```sh
npm --prefix mobile test
npm --prefix mobile run build:ios139
PLAYWRIGHT_MODULE=/path/to/playwright IOS_UI_AUDIT_OUT=/tmp/ios-pages node mobile/scripts/audit-ios-pages.mjs
```

The inventory and interaction results are in the accompanying JSON. The existing smaller audit remains available for quick checks.

## Limits

This audit runs WebKit with deterministic synthetic data and 47px/34px safe-area fixtures. Native plugins, server writes and SMS delivery are not exercised. Social provider readiness and click intent are simulated, not actual Kakao/Naver account authorization. It does not establish on-device keyboard/picker/rotation behavior, real authentication/recovery, live billing, push delivery or server authorization. The 1.39 QA native entry point intentionally shows payment/push preparation notices; those services are not released by this UI change. No production data, account memberships, SMS, payments, invitations or public store release were changed.
