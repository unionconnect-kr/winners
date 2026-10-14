begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Purchase tokens never leave the private schema. Keep tombstones after a linked
-- token is replaced so a late restore cannot reactivate its old entitlement.
create table private.android_billing_purchases (
 purchase_token text primary key check(length(purchase_token) between 1 and 4096 and purchase_token !~ '[[:space:][:cntrl:]]'),
 user_id uuid not null references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 environment text not null check(environment in ('Production','Sandbox')),
 state text not null check(state in ('SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')),
 expires_at timestamptz,
 checked_at timestamptz not null,
 superseded_by text,
 check(superseded_by is null or superseded_by<>purchase_token)
);
create index android_billing_owner_store on private.android_billing_purchases(user_id,store_id);
alter table private.android_billing_purchases enable row level security;
revoke all on private.android_billing_purchases from public,anon,authenticated,service_role;

create function private.manee_android_billing_save(p_user_id uuid,p_store_id uuid,p_record jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 token text:=p_record->>'purchaseToken'; linked text:=p_record->>'linkedPurchaseToken';
 environment_name text:=p_record->>'environment'; state_name text:=p_record->>'state';
 observed timestamptz:=(p_record->>'checkedAt')::timestamptz;
 expiry timestamptz:=(p_record->>'expiresAt')::timestamptz;
 old private.android_billing_purchases; prior private.android_billing_purchases;
 lock_id bigint;
begin
 if p_user_id is null or p_store_id is null or token is null or length(token) not between 1 and 4096
  or token ~ '[[:space:][:cntrl:]]' or (linked is not null and (length(linked) not between 1 and 4096 or linked ~ '[[:space:][:cntrl:]]' or linked=token))
  or (p_record->>'productId') is distinct from 'manee.store1.monthly'
  or (p_record->>'basePlanId') is distinct from 'monthly'
  or environment_name is null or environment_name not in ('Production','Sandbox')
  or state_name is null or state_name not in ('SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')
  or observed is null or not isfinite(observed) or observed>clock_timestamp()+interval '1 minute'
  or observed<clock_timestamp()-interval '5 minutes'
  or (expiry is not null and not isfinite(expiry))
  or (expiry is null and state_name not in ('SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'))
  or (p_record->>'accountId') is distinct from encode(sha256(convert_to('kr.co.manee.app:user:'||p_user_id::text,'UTF8')),'hex')
  or (p_record->>'profileId') is distinct from encode(sha256(convert_to('kr.co.manee.app:store:'||p_user_id::text||':'||p_store_id::text,'UTF8')),'hex') then
  raise exception 'Invalid purchase record' using errcode='22023';
 end if;
 -- The service role is not permission to assign purchases to arbitrary stores.
 if not exists(select 1 from public.store_memberships m join public.profiles p on p.user_id=m.user_id
  join auth.users u on u.id=m.user_id join public.stores s on s.id=m.store_id
  where m.user_id=p_user_id and m.store_id=p_store_id and m.role='owner' and m.status='active'
   and p.status='active' and s.archived_at is null and (u.banned_until is null or u.banned_until<=now())) then
  raise exception 'Owner access denied' using errcode='42501';
 end if;
 -- Sorted token locks also serialize claims across DIFFERENT owners/stores.
 for lock_id in select distinct hashtextextended(t,0) from unnest(array[token,linked]) t where t is not null order by 1 loop
  perform pg_advisory_xact_lock(lock_id);
 end loop;
 select * into old from private.android_billing_purchases where purchase_token=token for update;
 if found then
  if old.user_id<>p_user_id or old.store_id<>p_store_id or old.environment<>environment_name then
   raise exception 'Purchase binding conflict' using errcode='23505';
  end if;
  if old.superseded_by is not null or old.checked_at>=observed then return false;end if;
 end if;
 if linked is not null then
  select * into prior from private.android_billing_purchases where purchase_token=linked for update;
  if found and (prior.user_id<>p_user_id or prior.store_id<>p_store_id or prior.environment<>environment_name
   or (prior.superseded_by is not null and prior.superseded_by<>token)) then
   raise exception 'Linked purchase binding conflict' using errcode='23505';
  end if;
 end if;
 insert into private.android_billing_purchases(purchase_token,user_id,store_id,environment,state,expires_at,checked_at)
 values(token,p_user_id,p_store_id,environment_name,state_name,expiry,observed)
 on conflict(purchase_token) do update set state=excluded.state,expires_at=excluded.expires_at,checked_at=excluded.checked_at;
 if linked is not null then
  insert into private.android_billing_purchases(purchase_token,user_id,store_id,environment,state,checked_at,superseded_by)
   values(linked,p_user_id,p_store_id,environment_name,'SUBSCRIPTION_STATE_EXPIRED',observed,token)
  on conflict(purchase_token) do update set superseded_by=excluded.superseded_by;
 end if;
 return true;
end $$;
create function public.manee_android_billing_save(p_user_id uuid,p_store_id uuid,p_record jsonb)
returns boolean language sql security invoker set search_path='' as $$
 select private.manee_android_billing_save(p_user_id,p_store_id,p_record)
$$;
revoke all on function private.manee_android_billing_save(uuid,uuid,jsonb),public.manee_android_billing_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.manee_android_billing_save(uuid,uuid,jsonb),public.manee_android_billing_save(uuid,uuid,jsonb) to service_role;

-- This snapshot is informational until the application entitlement gate ships.
-- A missing renewal worker must never create indefinite access from an old row.
create function private.manee_android_billing_status(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.manee_android_push_context(p_store_id);
 return jsonb_build_object('subscriptions',coalesce((select jsonb_agg(jsonb_build_object(
  'environment',environment,'state',state,'expiresAt',expires_at,'checkedAt',checked_at,
  'active',environment='Production' and state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and expires_at>now() and checked_at>now()-interval '15 minutes',
  'testActive',environment='Sandbox' and state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and expires_at>now() and checked_at>now()-interval '15 minutes'))
  from private.android_billing_purchases where user_id=auth.uid() and store_id=p_store_id and superseded_by is null),'[]'::jsonb));
end $$;
create function public.manee_android_billing_status(p_store_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.manee_android_billing_status(p_store_id)$$;
revoke all on function private.manee_android_billing_status(uuid),public.manee_android_billing_status(uuid) from public,anon;
grant execute on function private.manee_android_billing_status(uuid),public.manee_android_billing_status(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
