# Android store product allocation — internal testing

The server allocates one catalog product per owner/store pair, unique per owner.
Existing single-product receipts are backfilled without changing their store or
purchase binding. An owner-scoped advisory lock serializes allocations across
stores. Slots are never recycled automatically. New slots remain unavailable until
an operator registers and enables a matching, verified Play Console subscription.
Only the existing first product is currently enabled.

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
are deployed; purchases remain sandbox-only. No second Play product or actual
second-store purchase is claimed as verified. Actual concurrency, production
receipts, iOS parity and full app paid rollout remain release gates.

Next Console setup for the second internal test slot: product ID
`manee.store2.monthly`, base plan `monthly`, monthly auto-renewing KRW 9,900 in KR.
Keep pricing consistent with the existing first slot. Free-trial eligibility must
follow the agreed offer policy and be verified in Play. Registering the SKU alone
does not enable it in the server catalog; enable only after catalog validation.
