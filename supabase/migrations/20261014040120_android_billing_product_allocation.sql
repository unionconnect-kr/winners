begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Enable a slot only after its Play catalog/price has been independently verified.
create table private.android_billing_products(
 product_id text primary key check(product_id ~ '^manee[.]store[1-9][0-9]*[.]monthly$'),
 slot integer not null unique check(slot>0), enabled boolean not null default false
);
insert into private.android_billing_products values('manee.store1.monthly',1,true);
create table private.android_billing_allocations(
 user_id uuid not null references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 product_id text not null references private.android_billing_products(product_id),
 primary key(user_id,store_id),unique(user_id,product_id)
);
alter table private.android_billing_products enable row level security;
alter table private.android_billing_allocations enable row level security;
revoke all on private.android_billing_products,private.android_billing_allocations from public,anon,authenticated,service_role;
-- Preserve all existing bindings; never reinterpret an old receipt as a new store.
insert into private.android_billing_allocations
 select distinct user_id,store_id,'manee.store1.monthly' from private.android_billing_purchases;
alter table private.android_billing_purchases add column product_id text not null default 'manee.store1.monthly'
 references private.android_billing_products(product_id);

create function private.manee_android_billing_product(p_store_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 perform private.manee_android_push_context(p_store_id);
 -- Serialize concurrent first checkouts for different stores of the same owner.
 perform pg_advisory_xact_lock(hashtextextended('billing-allocation:'||auth.uid()::text,0));
 select product_id into result from private.android_billing_allocations where user_id=auth.uid() and store_id=p_store_id;
 if result is not null then return result;end if;
 select p.product_id into result from private.android_billing_products p where p.enabled and not exists(
  select 1 from private.android_billing_allocations a where a.user_id=auth.uid() and a.product_id=p.product_id)
 order by p.slot limit 1;
 if result is null then return null;end if;
 insert into private.android_billing_allocations values(auth.uid(),p_store_id,result);
 return result;
end $$;
create function public.manee_android_billing_product(p_store_id uuid) returns text
language sql security invoker set search_path='' as $$select private.manee_android_billing_product(p_store_id)$$;
revoke all on function private.manee_android_billing_product(uuid),public.manee_android_billing_product(uuid) from public,anon,service_role;
grant execute on function private.manee_android_billing_product(uuid),public.manee_android_billing_product(uuid) to authenticated;
create or replace function private.manee_android_billing_save(p_user_id uuid,p_store_id uuid,p_record jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 token text:=p_record->>'purchaseToken'; linked text:=p_record->>'linkedPurchaseToken';
 environment_name text:=p_record->>'environment'; state_name text:=p_record->>'state';
 observed timestamptz:=(p_record->>'checkedAt')::timestamptz;
 expiry timestamptz:=(p_record->>'expiresAt')::timestamptz;
 old private.android_billing_purchases; prior private.android_billing_purchases;
 lock_id bigint; expected_product text;
begin
 select product_id into expected_product from private.android_billing_allocations where user_id=p_user_id and store_id=p_store_id;
 if expected_product is null then raise exception 'Purchase allocation required' using errcode='22023';end if;
 if p_user_id is null or p_store_id is null or token is null or length(token) not between 1 and 4096
  or token ~ '[[:space:][:cntrl:]]' or (linked is not null and (length(linked) not between 1 and 4096 or linked ~ '[[:space:][:cntrl:]]' or linked=token))
  or (p_record->>'productId') is distinct from expected_product
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
  if old.user_id<>p_user_id or old.store_id<>p_store_id or old.environment<>environment_name or old.product_id<>expected_product then
   raise exception 'Purchase binding conflict' using errcode='23505';
  end if;
  if old.superseded_by is not null or old.checked_at>=observed then return false;end if;
 end if;
 if linked is not null then
  select * into prior from private.android_billing_purchases where purchase_token=linked for update;
  if found and (prior.user_id<>p_user_id or prior.store_id<>p_store_id or prior.environment<>environment_name or prior.product_id<>expected_product
   or (prior.superseded_by is not null and prior.superseded_by<>token)) then
   raise exception 'Linked purchase binding conflict' using errcode='23505';
  end if;
 end if;
 insert into private.android_billing_purchases(purchase_token,user_id,store_id,environment,state,expires_at,checked_at,product_id)
 values(token,p_user_id,p_store_id,environment_name,state_name,expiry,observed,expected_product)
 on conflict(purchase_token) do update set state=excluded.state,expires_at=excluded.expires_at,checked_at=excluded.checked_at;
 if linked is not null then
  insert into private.android_billing_purchases(purchase_token,user_id,store_id,environment,state,checked_at,superseded_by,product_id)
   values(linked,p_user_id,p_store_id,environment_name,'SUBSCRIPTION_STATE_EXPIRED',observed,token,expected_product)
  on conflict(purchase_token) do update set superseded_by=excluded.superseded_by;
 end if;
 return true;
end $$;
create or replace function private.manee_billing_claim(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_dispatch_token is null or length(p_dispatch_token)<>64 or not exists
  (select 1 from vault.decrypted_secrets where name='manee_billing_dispatch' and decrypted_secret=p_dispatch_token) then
  raise exception 'Dispatch access denied' using errcode='42501';end if;
 with candidates as (select purchase_token from private.android_billing_purchases
  where superseded_by is null and environment='Sandbox' and next_check_at<=now()
  and (lease_until is null or lease_until<=now()) order by next_check_at for update skip locked limit 10),
 claimed as (update private.android_billing_purchases p set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 refresh_attempts=least(refresh_attempts+1,1000),claimed_generation=event_generation from candidates c
 where p.purchase_token=c.purchase_token returning p.purchase_token,p.user_id,p.store_id,p.lease_id,p.product_id)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
