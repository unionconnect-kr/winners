-- Preparation only: Apple catalog and paid write entitlements remain disabled.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table private.ios_product_catalog (
 product_id text primary key check(product_id ~ '^manee\.store([1-9]|10)\.monthly$'),
 slot smallint not null unique check(slot between 1 and 10),
 enabled boolean not null default false
);
insert into private.ios_product_catalog(product_id,slot)
 select 'manee.store'||n||'.monthly',n from generate_series(1,10) n;
alter table private.ios_product_catalog enable row level security;
revoke all on private.ios_product_catalog from public,anon,authenticated,service_role;
create table private.ios_billing_release (
 singleton boolean primary key default true check(singleton),
 production_enabled boolean not null default false,
 sandbox_enabled boolean not null default false
);
insert into private.ios_billing_release(singleton) values(true);
alter table private.ios_billing_release enable row level security;
revoke all on private.ios_billing_release from public,anon,authenticated,service_role;
alter table private.ios_billing_accounts add column product_id text references private.ios_product_catalog(product_id);
-- The old implementation admitted one active store per owner, using slot one.
update private.ios_billing_accounts a set product_id='manee.store1.monthly'
 where exists(select 1 from private.ios_subscriptions s where s.token=a.token);
create unique index ios_owner_product_unique on private.ios_billing_accounts(user_id,product_id) where product_id is not null;
alter table private.ios_subscriptions add column product_id text not null default 'manee.store1.monthly'
 references private.ios_product_catalog(product_id);

create or replace function private.manee_ios_context(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.ios_billing_accounts%rowtype; product text;
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not private.has_store_membership(p_store_id,array['owner'])
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then
  raise exception 'Owner access denied' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,761));
 insert into private.ios_billing_accounts(user_id,store_id) values(auth.uid(),p_store_id)
 on conflict(user_id,store_id) do nothing;
 select * into a from private.ios_billing_accounts where user_id=auth.uid() and store_id=p_store_id for update;
 if a.product_id is null then
  select c.product_id into product from private.ios_product_catalog c
   where not exists(select 1 from private.ios_billing_accounts b where b.user_id=auth.uid() and b.product_id=c.product_id)
   order by c.slot limit 1;
  update private.ios_billing_accounts set product_id=product where token=a.token returning * into a;
 end if;
 return jsonb_build_object('appAccountToken',a.token,'productId',a.product_id,
  'catalogEnabled',coalesce((select enabled from private.ios_product_catalog where product_id=a.product_id),false),
  'subscriptions',coalesce((select jsonb_agg(jsonb_build_object('environment',environment,'originalId',original_id,
   'productId',s.product_id,'status',status,'expiresAt',expires_at,'revoked',revoked,'checkedAt',checked_at))
   from private.ios_subscriptions s where s.token=a.token),'[]'::jsonb),
  'otherStoreSubscribed',false,
  'otherPlatformActive',exists(select 1 from private.android_billing_purchases b where b.store_id=p_store_id
   and b.environment='Production' and b.superseded_by is null and b.expires_at>now() and b.checked_at>now()-interval '15 minutes'
   and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
   and exists(select 1 from public.store_memberships m where m.store_id=b.store_id and m.user_id=b.user_id and m.role='owner' and m.status='active')
   and exists(select 1 from public.profiles p where p.user_id=b.user_id and p.status='active')
   and exists(select 1 from auth.users u where u.id=b.user_id and (u.banned_until is null or u.banned_until<=now()))));
end $$;

create or replace function private.manee_ios_save_subscription(p_record jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved text;
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
  transaction_id=excluded.transaction_id,status=excluded.status,expires_at=excluded.expires_at,
  revoked=excluded.revoked,signed_at=excluded.signed_at,checked_at=now()
 where old.token=excluded.token and old.product_id=excluded.product_id and old.signed_at<=excluded.signed_at
 returning original_id into saved;
 if saved is null and not exists(select 1 from private.ios_subscriptions where
  environment=p_record->>'environment' and original_id=p_record->>'originalId'
  and token=(p_record->>'token')::uuid and product_id=p_record->>'productId') then
  raise exception 'Transaction binding conflict' using errcode='23505';
 end if;
 return true;
end $$;

create or replace function private.manee_store_write_entitled(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.store_billing_enforcement where store_id=p_store_id)
 or exists(
  select 1 from private.store_billing_enforcement g
  join private.android_billing_purchases b on b.store_id=g.store_id and b.environment=g.environment
  join public.store_memberships m on m.store_id=b.store_id and m.user_id=b.user_id and m.role='owner' and m.status='active'
  join public.profiles p on p.user_id=b.user_id and p.status='active'
  join auth.users u on u.id=b.user_id
  where g.store_id=p_store_id and (u.banned_until is null or u.banned_until<=now())
   and b.superseded_by is null
   and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
   and b.expires_at>now() and b.checked_at>now()-interval '15 minutes'
 ) or exists(
  select 1 from private.store_billing_enforcement g
  join private.ios_billing_accounts a on a.store_id=g.store_id
  join private.ios_subscriptions s on s.token=a.token and s.environment=g.environment and s.product_id=a.product_id
  join private.ios_product_catalog c on c.product_id=a.product_id and c.enabled
  join private.ios_billing_release r on r.singleton and
   ((g.environment='Production' and r.production_enabled) or (g.environment='Sandbox' and r.sandbox_enabled))
  join public.store_memberships m on m.store_id=a.store_id and m.user_id=a.user_id and m.role='owner' and m.status='active'
  join public.profiles p on p.user_id=a.user_id and p.status='active'
  join auth.users u on u.id=a.user_id
  where g.store_id=p_store_id and (u.banned_until is null or u.banned_until<=now())
   and s.status in (1,4) and not s.revoked and s.expires_at>now() and s.checked_at>now()-interval '15 minutes'
 );
$$;
-- A short lease prevents parallel workers repeatedly refreshing the same receipt.
alter table private.ios_subscriptions add column refresh_after timestamptz not null default now(),
 add column refresh_lease uuid, add column refresh_lease_until timestamptz,
 add column refresh_attempts integer not null default 0;
create index ios_subscription_refresh_due on private.ios_subscriptions(refresh_after);
create function private.manee_ios_claim_refresh() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 with due as (select environment,original_id from private.ios_subscriptions
  where refresh_after<=now() and (refresh_lease_until is null or refresh_lease_until<=now())
  and (status in (1,3,4) or expires_at>now()-interval '1 day')
  order by refresh_after,environment,original_id for update skip locked limit 10),
 claimed as (update private.ios_subscriptions s set refresh_lease=gen_random_uuid(),refresh_lease_until=now()+interval '2 minutes'
  from due d where s.environment=d.environment and s.original_id=d.original_id
  returning s.environment,s.original_id,s.token,s.product_id,s.refresh_lease)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.manee_ios_claim_refresh() returns jsonb
language sql security invoker set search_path='' as $$select private.manee_ios_claim_refresh()$$;
create function private.manee_ios_finish_refresh(p_environment text,p_original_id text,p_lease uuid,p_ok boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 update private.ios_subscriptions set refresh_after=now()+case when p_ok then interval '5 minutes'
  else make_interval(secs=>least(3600,60*(refresh_attempts+1))) end,
  refresh_attempts=case when p_ok then 0 else least(refresh_attempts+1,60) end,
  refresh_lease=null,refresh_lease_until=null
 where environment=p_environment and original_id=p_original_id and refresh_lease=p_lease;
end $$;
create function public.manee_ios_finish_refresh(p_environment text,p_original_id text,p_lease uuid,p_ok boolean) returns void
language sql security invoker set search_path='' as $$select private.manee_ios_finish_refresh(p_environment,p_original_id,p_lease,p_ok)$$;
revoke all on function private.manee_ios_claim_refresh(),public.manee_ios_claim_refresh(),
 private.manee_ios_finish_refresh(text,text,uuid,boolean),public.manee_ios_finish_refresh(text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.manee_ios_claim_refresh(),public.manee_ios_claim_refresh(),
 private.manee_ios_finish_refresh(text,text,uuid,boolean),public.manee_ios_finish_refresh(text,text,uuid,boolean) to service_role;
-- Replacing functions preserves their prior least-privilege grants.
notify pgrst,'reload schema';
commit;
