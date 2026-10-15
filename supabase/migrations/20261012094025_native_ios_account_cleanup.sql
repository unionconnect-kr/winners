-- Account/store deletion must not be blocked by the native entitlement ledger.
-- A deleted binding cannot be restored through the client because Apple still
-- signs its old appAccountToken and no replacement token is accepted.
begin;
set local lock_timeout='5s';
alter table private.ios_subscriptions drop constraint ios_subscriptions_token_fkey;
alter table private.ios_subscriptions add constraint ios_subscriptions_token_fkey
 foreign key(token) references private.ios_billing_accounts(token) on delete cascade;
commit;
