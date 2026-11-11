-- Permit a verified new Apple purchase after a previous subscription has expired.
-- The proof is populated only by the authenticated purchase/restore verifier.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

CREATE OR REPLACE FUNCTION private.manee_ios_save_subscription(p_record jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 saved text;
 purchase_at timestamptz := (p_record->>'verifiedPurchaseAt')::timestamptz;
begin
 if (p_record->>'environment') is null or (p_record->>'environment') not in ('Production','Sandbox')
  or coalesce(p_record->>'originalId','') !~ '^[0-9]{1,30}$'
  or coalesce(p_record->>'transactionId','') !~ '^[0-9]{1,30}$'
  or p_record->>'signedAt' is null or (p_record->>'signedAt')::timestamptz>now()+interval '5 minutes'
  or not exists(select 1 from private.ios_billing_accounts a where a.token=(p_record->>'token')::uuid
   and a.product_id=p_record->>'productId') then
  raise exception 'Invalid transaction binding' using errcode='22023';
 end if;
 insert into private.ios_subscriptions as old
  (environment,original_id,token,product_id,transaction_id,status,expires_at,revoked,signed_at)
 values(p_record->>'environment',p_record->>'originalId',(p_record->>'token')::uuid,p_record->>'productId',
  p_record->>'transactionId',(p_record->>'status')::integer,(p_record->>'expiresAt')::timestamptz,
  (p_record->>'revoked')::boolean,(p_record->>'signedAt')::timestamptz)
 on conflict(environment,original_id) do update set
  token=excluded.token,transaction_id=excluded.transaction_id,status=excluded.status,expires_at=excluded.expires_at,
  revoked=excluded.revoked,signed_at=excluded.signed_at,checked_at=now()
 where old.product_id=excluded.product_id and old.signed_at<=excluded.signed_at
  and (old.token=excluded.token or (
   old.status=2 and not old.revoked and old.expires_at<=purchase_at
   and purchase_at<=excluded.signed_at and purchase_at<=now()
   and excluded.status in (1,4) and not excluded.revoked and excluded.expires_at>now()
   and old.transaction_id<>excluded.transaction_id
  ))
 returning original_id into saved;
 if saved is null and not exists(select 1 from private.ios_subscriptions where
  environment=p_record->>'environment' and original_id=p_record->>'originalId'
  and token=(p_record->>'token')::uuid and product_id=p_record->>'productId') then
  raise exception 'Transaction binding conflict' using errcode='23505';
 end if;
 return true;
end $function$;

commit;
