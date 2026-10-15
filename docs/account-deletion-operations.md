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

Current branch status (2026-10-15): the request migration is applied to
Staging and Production. Production postflight confirms zero requests;
anon/authenticated cannot read the queue or execute the submission RPC, while
`service_role` can execute the RPC. Local tests pass. The public page and
Netlify function have not been deployed to the Production site by this branch.
