# Owner home and signup trial

Owner home now follows the approved sales → attendance → costs layout. The existing logo, store selector, notifications, greeting and bottom navigation remain. The three quick-action buttons were removed.

- Today’s entered sales, selected-month sales, current-month comparison with the same elapsed period last month, seven-day chart and per-store sales use the selected stores. Missing reports, entered zero and failed reads remain distinct. Missing/zero previous-period sales do not produce a growth percentage.
- Attendance separates employees with a business-day check-in (including completed shifts), future scheduled staff and scheduled staff whose start time passed without a check-in. Failed lookups are unknown, not absent. Stale open records remain separately flagged. Expand a store for names and the existing attendance screen.
- Costs use classified food/beverage expenses, existing net-payroll calculations and other expenses plus recorded fixed costs. Unclassified expenses stay in other costs. Overall ratios divide summed costs by summed sales; missing inputs suppress affected totals/ratios. Existing financial warnings and salary rules elsewhere are unchanged.
- Signup entry, signup offer and final signup button now advertise **40 days**. Production `billing_settings.default_trial_days=40` was checked read-only. The displayed general price remains KRW 9,900 per account/month. This changes signup presentation, not Google/Apple subscription offers, renewal dates or payment consent. Store purchase terms remain those shown at checkout.

Validation: 839 existing tests passed (10 skipped), 5 new behavioral tests passed; staging and production builds and inline-script syntax passed. Local Chromium with mocked data checked home at 320/375/390/430 px and signup at 320/390/430 px, attendance expansion, store/all-store selection and signup navigation. No real account, payment or business data was created or modified by these checks.
