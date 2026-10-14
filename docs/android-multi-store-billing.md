# Android store product allocation — internal testing

The server allocates one catalog product per owner/store pair, unique per owner.
Existing single-product receipts are backfilled without changing their store or
purchase binding. An owner-scoped advisory lock serializes allocations across
stores. Slots are never recycled automatically. New slots remain unavailable until
an operator registers and enables a matching, verified Play Console subscription.
The first two products are now enabled for internal testing (see the live evidence below).

The endpoint selects catalog and receipt verification products from the database,
not from request parameters. The SQL persistence function rejects wrong products,
store changes and cross-product linked tokens. Renewal jobs carry their persisted
product. Native restore filters to the selected store's allocated product; server
receipt account/store validation remains authoritative.

The dialog follows the allocated product and the existing KRW 9,900/month offer
validation. It shows an active test subscription and hides redundant checkout.
Unavailable extra slots show a preparation message without disturbing existing
subscriptions. Version 1.14 / code 15 includes these mobile changes.

Validation: 37 focused endpoint, SQL allocation, webhook/renewal, purchase and
mobile coordinator/offer tests pass. This includes migration of a historical
receipt and a synthetic second product. Live schema migration was checked for
legacy owner conflicts first. Production billing endpoint v7 and refresh worker v3
are deployed; purchases remain sandbox-only. The second Play product and separate
store purchases were subsequently verified as recorded below. Simultaneous first
checkout races, production receipts, iOS parity and full app paid rollout remain
release gates.

Console setup for the second internal test slot: product ID
`manee.store2.monthly`, base plan `monthly`, monthly auto-renewing KRW 9,900 in KR.
Keep pricing consistent with the existing first slot. Free-trial eligibility must
follow the agreed offer policy and be verified in Play. Registering the SKU alone
does not enable it in the server catalog; enable only after catalog validation.

## Live internal test — 2026-10-14 KST

- The operator created and activated `manee.store2.monthly`, base plan `monthly`,
  monthly auto-renewing KRW 9,900 in Korea. Server slot 2 was registered.
- Hoga Sinchon purchased the second product; the server persisted a Sandbox
  ACTIVE receipt. The 17:25 handset screenshot after restart/restore showed
  successful server verification and no checkout button.
- The existing first test subscription had expired. The tester's explicit
  store permission was moved back to Saengsaeng Songcheon for a new first-product
  purchase; the 17:28 screenshot showed verification success.
- A server read at 17:29:37 confirmed both products ACTIVE, not superseded, with
  future expiry times (store 1: 17:33:07; store 2: 17:32:52). Both had been checked
  by the refresh worker at 17:29:00, with zero retry attempts. The second product's
  expiry advanced from 17:27:52, confirming a renewal while the first was active.
- Store/product allocations remained separate. This demonstrates two simultaneous
  Sandbox subscriptions for one owner, not simultaneous checkout requests.
- Test permission remains one explicit owner/store pair, currently Saengsaeng
  Songcheon, with its original 2026-10-28 10:44 KST expiry. No broad tester grant,
  production receipt acceptance or production write gate was enabled.

The purchase-success screenshot also exposed a UI issue: offers stayed visible
until the dialog was reopened, although the checkout coordinator already rejected
another checkout for an active subscription. The source now hides all purchase
offers immediately on active purchase/restore or already-active results, including
restore completion before product loading. Seventeen focused UI/client tests pass.
Android 1.15 / code 16 packages this correction. Build commit
`20e72e44ef7951a960f58457a417b855591af4df` completed in Actions run `38536158476`:
48 mobile tests passed; bundle signing and internal-only backend guards passed.
The downloaded artifact checksum and packaged version/UI code were verified.
AAB SHA-256: `36e9d064a7c96d25fb03abccb40a6d463835aec4f691897d73273e77127150b0`.
The AAB is ready for the operator to upload to Play internal testing; upload,
installation and on-device confirmation of 1.15 are not yet claimed.
