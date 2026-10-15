# Account deletion requests — launch operation

The Android app creates owner and staff accounts. The owner **더보기** menu and
staff/manager **사용법·문의** page link to
`https://winners-staffapp.netlify.app/account-deletion.html`. The public page
works without installing or signing in to the app. It collects the MANEE login
name and a return contact. The Netlify function writes the request to
`private.account_deletion_requests` after rate limiting. It does not look up
the account or disclose whether it exists. Only a privileged operator can read
the queue; no client can read it or directly delete a user.

This is a **request and manual-review flow**. A successful HTTP response means
the request was stored, not that the account was deleted or a subscription was
cancelled. A support operator must own the following process before the Play
Data safety link is submitted:

1. Check the private request queue regularly in the Production SQL editor. Do
   not copy the contacts, account IDs or underlying store data into Git/issues.
   Verify the person's ownership through an existing authenticated channel or
   established account recovery; the unverified return contact alone is not
   proof. Set a case to `in_review` only when someone is handling it.
2. Identify the account's active store memberships and whether it is the owner
   of a paid Play subscription. Tell an owner how to cancel in Google Play and
   verify that cancellation/status separately. A deletion request by itself
   must never claim to cancel a Play subscription.
3. Map the user's profile, memberships, linked crew/personal fields, push
   subscriptions, billing binding and any other user data. Separate business
   records needed by other store participants from personal data, and review
   lawful retention obligations. Decide the case-specific removal or
   de-identification steps and verify the outcome before deleting Auth identity.
   The `stores` delete rule archives a store instead of deleting it; `auth.users`
   cascades alone do not prove all associated personal data are erased.
4. Reply to the verified person with the outcome and any retained data/reason.
   Set `completed` only after the actual erasure is verified. Preserve a minimal
   case record consistent with the retention policy, then dispose of the
   return contact when no longer needed.

Deployment order: apply `20261015123500_account_deletion_requests.sql`, deploy
the Netlify function and static page, then publish an app build showing both
links. Check the public URL from a signed-out browser and submit a synthetic
account name/contact to confirm one private pending request, no account lookup,
and no secret response. Clean up that synthetic case. The production queue,
support ownership and real erasure procedure need operational verification before
claiming this requirement is met in the Play Console. The same URL must be
entered in Play Console's Data safety account-deletion answer only once live.

Current status (2026-10-15, follow-up): the request migration is applied to
Staging and Production. PR #23 deployed the public page and Netlify function.
A fresh unauthenticated HTTP check returned 200 for the page and 200 for a
synthetic submission. An independent Production SQL read confirmed exactly one
pending row; submitting the same synthetic payload again returned the same
generic success and left exactly one row. An invalid identifier/contact returned
HTTP 400. Direct SELECT and submission-RPC grants remain absent for both anon
and authenticated roles.

The follow-up synthetic row and the earlier `releasecheck20261015` row were
removed using exact username/contact/status predicates after checking each was
a synthetic pending case. The final Production queue count is zero. No customer
account or subscription was deleted or canceled. Focused request, billing and
access tests passed 29/29; mobile tests passed 64/64 on review-branch source
`16e994c`. These are automated/source checks, not a new signed-build or handset
acceptance. Support ownership and actual identity-verified erasure remain
untested.

On 2026-10-15, approved PR #24 merged as `de947c38` and reached the public
Netlify site. Browser and HTTP checks confirm the scope/retention/support
section is live. A JSON `null` request now returns HTTP 400 `invalid_request`
without reaching the submission RPC; the handler regression suite covers
null, arrays, numbers, booleans and strings. The Play Data safety questionnaire
was saved with this live URL and optional reply-email collection, and appears
in the not-yet-submitted publishing changes. No review submission, real account
erasure, subscription cancellation or new pending case occurred in this check.

## Operator inventory and case execution — 2026-10-15

`security/account-deletion-preflight.sql` is an operator SQL Editor inventory.
It installs no function, grants no permission and runs in a read-only,
repeatable-read transaction that ends with ROLLBACK. Its default empty subject
reports schema constraints only. After identity verification, set the LOCAL
subject UUID privately. The selected-subject report counts current Auth sessions,
direct UUID references (including named references without foreign keys), linked
crew rows, username references, Storage ownership and other store owners/members.
It never returns names, phone numbers, contact values, receipt tokens or object
paths. Internal crew/store IDs and all case reports still belong in restricted
case records, not Git, PRs or ordinary chat.

Keep the verified username and linked crew IDs in that restricted case record
before removing identity or memberships. Supply them through the script's LOCAL
settings for the post-erasure report: after cascades, the original links may no
longer exist. A username override that conflicts with a current profile is
rejected. Empty-subject mode rejects any supplied username or crew targets.
The report is not a complete personal-data search: unstructured text, JSON,
uploaded content and versions, logs, exported reports, backups and external
processors need separate review. Reference counts can overlap.

Read-only schema runs on Staging and Production confirmed four current
NO ACTION Auth references. They block user deletion only when matching records
exist: `public.push_subscriptions.user_id`,
`public.franchise_join_requests.requested_by` and `.reviewed_by`, and
`public.monthly_cost_reviews.completed_by`. Clear the user's notification
registration, and decide removal or de-identification of the request/reviewer
records in the specific approved case. `requested_by` is non-nullable, so blindly
setting every actor column to NULL is not an executable solution. Do not change
these foreign keys to CASCADE across customer records merely to bypass a failure.

Auth deletion cascades profiles and memberships, but does not itself erase
`public.crew` identity fields. `private.profile_prior_values`,
`private.profile_adoption`, `private.staff_access_events` and
`private.password_reset_events` also contain user UUID references without an
Auth/profile deletion cascade. Audit old field values and actor/target copies
alongside current profiles. Deleting a crew row is not a substitute: it cascades
attendance and some shared history, and `monthly_net_payroll.crew_id` can block
it. The store DELETE rule archives, so it is not proof of store-data erasure.

For a verified case, use this execution order:

1. Record the verified identity, request ID, affected store/crew IDs, reviewed
   retention/removal decisions and responsible operator in restricted storage.
   Run and retain the preflight report there. No public erasure endpoint is added.
2. Resolve active shared-store ownership before removing an owner. The report
   identifies sole-owner and shared-owner cases, but does not transfer ownership.
   Resolve the store's future billing separately: deleting an Auth identity
   cascades its purchase binding; it does not cancel the Google Play subscription.
   Do not require a new payment merely to perform account-deletion verification.
3. Prevent further account access through the established supported Auth
   administration path and revoke sessions. Verify the actual live-session check,
   rather than assuming a signed JWT stops working just because identity is gone.
4. Execute the approved, exact-target removal/de-identification plan for personal
   copies and deletion blockers. Keep retained employment/shared-store records
   under the documented case-specific basis. Do not delete whole stores, unrelated
   employees or their attendance as a side effect of a personal deletion request.
5. Review uploaded personal content, ownership, versions and multipart uploads.
   Perform approved object deletion through the Storage API, not DELETE against
   `storage.objects`: metadata removal alone leaves stored files behind. Review
   service-owned content too; user ownership counts do not identify all personal
   files. Then remove the Auth user through the supported administration path.
6. Run the postflight with the original private identifiers. Verify sessions,
   account/profile/membership links, personal copies, Storage and the specific
   approved plan, plus preservation of other employees' records. A zero count
   for one identifier or a successful Auth delete is not full erasure proof.
7. Tell the verified requester what was removed and what remains with its basis,
   duration and backup reflection timing. Only then mark the case completed.
   Apply the published 30-day post-completion case/contact handling standard;
   review logs, exports and backups against their actual retention configuration.

Current verification: seven real local PostgreSQL-engine checks pass. They cover
default schema-only privacy, no-FK historical copies and preserved business data,
reviewer/subject separation, legacy/current Storage ownership, invalid or
conflicting inputs, database-enforced read-only behavior and remaining copies
after synthetic Auth deletion. Staging and Production schema-only runs passed;
no customer subject was selected, no records were changed and no account was
deleted remotely. Actual operator identity-verification, case-specific erasure,
support ownership and processor/retention consistency remain release gates.

The existing official Sites project reports public access and live domain
`https://manee.co.kr` (saved version 22). Automated reads of its privacy and
deletion pages, including the older linked Sites hostname, returned HTTP 403 or
fetch errors. This does not establish that a normal visitor is blocked, but the
current policy text was not retrieved for processor/retention reconciliation.
No audience, site source, publication or legal-page link was changed.

Current Supabase references: [User Management](https://supabase.com/docs/guides/auth/managing-user-data)
and [Delete Objects](https://supabase.com/docs/guides/storage/management/delete-objects).
