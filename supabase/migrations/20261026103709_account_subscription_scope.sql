-- One verified subscription covers the owner's current stores. Historical
-- receipt tokens, products, account/profile IDs and store bindings stay intact.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function private.manee_account_subscription_active(p_user_id uuid,p_environment text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
  where p.user_id=p_user_id and p.status='active' and (u.banned_until is null or u.banned_until<=now()))
 and (exists(select 1 from private.android_billing_purchases b
  where b.user_id=p_user_id and b.environment=p_environment and b.superseded_by is null
  and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
  and b.expires_at>now() and b.checked_at>now()-interval '15 minutes')
 or exists(select 1 from private.ios_billing_accounts a
  join private.ios_subscriptions s on s.token=a.token and s.product_id=a.product_id
  join private.ios_product_catalog c on c.product_id=s.product_id and c.enabled
  join private.ios_billing_release r on r.singleton and
   ((p_environment='Production' and r.production_enabled) or (p_environment='Sandbox' and r.sandbox_enabled))
  where a.user_id=p_user_id and s.environment=p_environment and s.status in (1,4)
   and not s.revoked and s.expires_at>now() and s.checked_at>now()-interval '15 minutes'));
$$;
revoke all on function private.manee_account_subscription_active(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.manee_store_write_entitled(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.store_billing_enforcement where store_id=p_store_id)
 or exists(select 1 from private.store_billing_enforcement g
  join public.stores st on st.id=g.store_id and st.archived_at is null
  join public.store_memberships m on m.store_id=g.store_id and m.role='owner' and m.status='active'
  where g.store_id=p_store_id and private.manee_account_subscription_active(m.user_id,g.environment));
$$;

-- Stable first allocation for the account, independently of the selected store.
-- All old allocations remain available for authenticated restores.
create function private.manee_android_account_context(p_store_id uuid,p_product_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.android_billing_allocations; product text;
begin
 perform private.manee_android_push_context(p_store_id);
 perform pg_advisory_xact_lock(hashtextextended('billing-allocation:'||auth.uid()::text,0));
 select b.* into a from private.android_billing_allocations b
 join private.android_billing_products c on c.product_id=b.product_id
 where b.user_id=auth.uid() and (p_product_id is null or b.product_id=p_product_id)
 order by c.slot,b.store_id limit 1;
 if a.product_id is null and p_product_id is null then
  select c.product_id into product from private.android_billing_products c where c.enabled order by c.slot limit 1;
  if product is not null then
   insert into private.android_billing_allocations values(auth.uid(),p_store_id,product) returning * into a;
  end if;
 end if;
 return jsonb_build_object('billingStoreId',a.store_id,'productId',a.product_id,
  'restoreProductIds',coalesce((select jsonb_agg(product_id order by product_id)
   from private.android_billing_allocations where user_id=auth.uid()),'[]'::jsonb),
  'otherPlatformActive',exists(select 1 from private.ios_billing_accounts b join private.ios_subscriptions s on s.token=b.token
   join private.ios_product_catalog c on c.product_id=s.product_id and c.enabled
   join private.ios_billing_release r on r.singleton and r.production_enabled
   where b.user_id=auth.uid() and s.environment='Production' and s.status in (1,4) and not s.revoked
    and s.expires_at>now() and s.checked_at>now()-interval '15 minutes'));
end $$;
create function public.manee_android_account_context(p_store_id uuid,p_product_id text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.manee_android_account_context(p_store_id,p_product_id)$$;
revoke all on function private.manee_android_account_context(uuid,text),public.manee_android_account_context(uuid,text) from public,anon,service_role;
grant execute on function private.manee_android_account_context(uuid,text),public.manee_android_account_context(uuid,text) to authenticated;

create or replace function private.manee_android_billing_product(p_store_id uuid) returns text
language sql security definer set search_path='' as $$select private.manee_android_account_context(p_store_id)->>'productId'$$;

create or replace function private.manee_android_billing_status(p_store_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.manee_android_push_context(p_store_id);
 return jsonb_build_object('subscriptions',coalesce((select jsonb_agg(jsonb_build_object(
  'environment',environment,'state',state,'expiresAt',expires_at,'checkedAt',checked_at,
  'active',environment='Production' and state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and expires_at>now() and checked_at>now()-interval '15 minutes',
  'testActive',environment='Sandbox' and state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and expires_at>now() and checked_at>now()-interval '15 minutes'))
  from private.android_billing_purchases where user_id=auth.uid() and superseded_by is null),'[]'::jsonb));
end $$;

create or replace function private.manee_ios_context(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.ios_billing_accounts; product text;
begin
 perform private.manee_android_push_context(p_store_id);
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,761));
 select b.* into a from private.ios_billing_accounts b
 join private.ios_product_catalog c on c.product_id=b.product_id
 where b.user_id=auth.uid() order by c.slot,b.token limit 1;
 if a.product_id is null then
  insert into private.ios_billing_accounts(user_id,store_id) values(auth.uid(),p_store_id)
   on conflict(user_id,store_id) do nothing;
  select * into a from private.ios_billing_accounts where user_id=auth.uid() and store_id=p_store_id for update;
  select c.product_id into product from private.ios_product_catalog c where c.enabled order by c.slot limit 1;
  update private.ios_billing_accounts set product_id=product where token=a.token returning * into a;
 end if;
 return jsonb_build_object('appAccountToken',a.token,'productId',a.product_id,'billingScope','account',
  'catalogEnabled',coalesce((select enabled from private.ios_product_catalog where product_id=a.product_id),false),
  'bindings',coalesce((select jsonb_agg(jsonb_build_object('appAccountToken',token,'productId',product_id))
   from private.ios_billing_accounts where user_id=auth.uid() and product_id is not null),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('environment',s.environment,'originalId',s.original_id,
   'appAccountToken',b.token,'productId',s.product_id,'status',s.status,'expiresAt',s.expires_at,'revoked',s.revoked,'checkedAt',s.checked_at))
   from private.ios_subscriptions s join private.ios_billing_accounts b on b.token=s.token and b.product_id=s.product_id
   where b.user_id=auth.uid()),'[]'::jsonb),
  'otherStoreSubscribed',false,
  'otherPlatformActive',exists(select 1 from private.android_billing_purchases b where b.user_id=auth.uid()
   and b.environment='Production' and b.superseded_by is null and b.expires_at>now() and b.checked_at>now()-interval '15 minutes'
   and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')));
end $$;

-- Shared lease for Android and iOS: two stores/devices/platforms cannot open
-- independent checkouts for the same account. Restore never requires a lease.
create table private.account_billing_checkouts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 provider text not null check(provider in ('android','ios')),
 checkout_id uuid not null, expires_at timestamptz not null
);
alter table private.account_billing_checkouts enable row level security;
revoke all on private.account_billing_checkouts from public,anon,authenticated,service_role;
create function private.manee_account_billing_checkout_claim(p_store_id uuid,p_provider text,p_product_id text,p_checkout_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.account_billing_checkouts;
begin
 perform private.manee_android_push_context(p_store_id);
 if p_checkout_id is null or p_provider not in ('android','ios') or p_provider is null
  or not ((p_provider='android' and exists(select 1 from private.android_billing_allocations a
   join private.android_billing_products c on c.product_id=a.product_id and c.enabled where a.user_id=auth.uid() and a.product_id=p_product_id))
  or (p_provider='ios' and exists(select 1 from private.ios_billing_accounts a
   join private.ios_product_catalog c on c.product_id=a.product_id and c.enabled where a.user_id=auth.uid() and a.product_id=p_product_id)))
 then raise exception 'Invalid checkout allocation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('account-checkout:'||auth.uid()::text,0));
 if private.manee_account_subscription_active(auth.uid(),'Production') then return jsonb_build_object('status','active');end if;
 -- Respect a checkout started by an older app before this migration.
 if exists(select 1 from private.android_billing_checkout_claims where user_id=auth.uid()
  and expires_at>clock_timestamp() and checkout_id<>p_checkout_id) then return jsonb_build_object('status','in_progress');end if;
 select * into existing from private.account_billing_checkouts where user_id=auth.uid() for update;
 if found and existing.expires_at>clock_timestamp() and (existing.checkout_id<>p_checkout_id or existing.provider<>p_provider)
 then return jsonb_build_object('status','in_progress');end if;
 insert into private.account_billing_checkouts values(auth.uid(),p_provider,p_checkout_id,clock_timestamp()+interval '15 minutes')
 on conflict(user_id) do update set provider=excluded.provider,checkout_id=excluded.checkout_id,expires_at=excluded.expires_at;
 return jsonb_build_object('status','claimed');
end $$;
create function public.manee_account_billing_checkout_claim(p_store_id uuid,p_provider text,p_product_id text,p_checkout_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.manee_account_billing_checkout_claim(p_store_id,p_provider,p_product_id,p_checkout_id)$$;
create function private.manee_account_billing_checkout_release(p_store_id uuid,p_provider text,p_checkout_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.manee_android_push_context(p_store_id);
 delete from private.account_billing_checkouts where user_id=auth.uid() and provider=p_provider and checkout_id=p_checkout_id;
 return found;
end $$;
create function public.manee_account_billing_checkout_release(p_store_id uuid,p_provider text,p_checkout_id uuid)
returns boolean language sql security invoker set search_path='' as $$select private.manee_account_billing_checkout_release(p_store_id,p_provider,p_checkout_id)$$;
revoke all on function private.manee_account_billing_checkout_claim(uuid,text,text,uuid),public.manee_account_billing_checkout_claim(uuid,text,text,uuid),
 private.manee_account_billing_checkout_release(uuid,text,uuid),public.manee_account_billing_checkout_release(uuid,text,uuid) from public,anon,service_role;
grant execute on function private.manee_account_billing_checkout_claim(uuid,text,text,uuid),public.manee_account_billing_checkout_claim(uuid,text,text,uuid),
 private.manee_account_billing_checkout_release(uuid,text,uuid),public.manee_account_billing_checkout_release(uuid,text,uuid) to authenticated;
create or replace function private.manee_android_billing_checkout_claim(p_store_id uuid,p_product_id text,p_checkout_id uuid)
returns jsonb language sql security definer set search_path='' as $$select private.manee_account_billing_checkout_claim(p_store_id,'android',p_product_id,p_checkout_id)$$;
create or replace function private.manee_android_billing_checkout_release(p_store_id uuid,p_checkout_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare released boolean;
begin
 released:=private.manee_account_billing_checkout_release(p_store_id,'android',p_checkout_id);
 delete from private.android_billing_checkout_claims where user_id=auth.uid() and checkout_id=p_checkout_id;
 return released or found;
end $$;

-- A verified account receipt survives archiving/transferring its original store.
-- The immutable allocation and Google account/profile checks above still apply.
-- Replace only the old live-store prerequisite, preserving all token ordering,
-- linked-token, product and observation validation in the deployed save routine.
do $migration$
declare definition text; old_guard text;
begin
 definition:=pg_get_functiondef('private.manee_android_billing_save(uuid,uuid,jsonb)'::regprocedure);
 old_guard:=$guard$if not exists(select 1 from public.store_memberships m join public.profiles p on p.user_id=m.user_id
  join auth.users u on u.id=m.user_id join public.stores s on s.id=m.store_id
  where m.user_id=p_user_id and m.store_id=p_store_id and m.role='owner' and m.status='active'
   and p.status='active' and s.archived_at is null and (u.banned_until is null or u.banned_until<=now())) then$guard$;
 if position(old_guard in definition)=0 then raise exception 'Unexpected Android receipt guard; review migration before applying';end if;
 definition:=replace(definition,old_guard,$guard$if not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
  where p.user_id=p_user_id and p.status='active' and (u.banned_until is null or u.banned_until<=now())) then$guard$);
 execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
