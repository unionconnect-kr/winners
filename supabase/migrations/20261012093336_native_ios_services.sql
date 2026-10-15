-- Native credentials stay private. Entitlements are written only by the verified
-- Apple server handler, never by an authenticated client or a claimed role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table private.ios_billing_accounts (
 token uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 unique(user_id,store_id)
);
create table private.ios_subscriptions (
 environment text not null check(environment in ('Production','Sandbox')),
 original_id text not null,
 token uuid not null references private.ios_billing_accounts(token),
 transaction_id text not null,
 status integer not null check(status between 1 and 5),
 expires_at timestamptz not null,
 revoked boolean not null,
 signed_at timestamptz not null,
 checked_at timestamptz not null default now(),
 primary key(environment,original_id)
);
create table private.ios_push_devices (
 token text primary key check(token ~ '^[0-9a-f]+$' and length(token) between 32 and 512 and length(token)%2=0),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 updated_at timestamptz not null default now()
);
alter table private.ios_billing_accounts enable row level security;
alter table private.ios_subscriptions enable row level security;
alter table private.ios_push_devices enable row level security;
revoke all on private.ios_billing_accounts,private.ios_subscriptions,private.ios_push_devices from public,anon,authenticated;

create function private.manee_ios_context(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account_token uuid;
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not private.has_store_membership(p_store_id,array['owner'])
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then
  raise exception 'Owner access denied' using errcode='42501';
 end if;
 insert into private.ios_billing_accounts(user_id,store_id) values(auth.uid(),p_store_id)
 on conflict(user_id,store_id) do nothing;
 select token into account_token from private.ios_billing_accounts where user_id=auth.uid() and store_id=p_store_id;
 return jsonb_build_object('appAccountToken',account_token,'subscriptions',coalesce((
  select jsonb_agg(jsonb_build_object('environment',environment,'originalId',original_id,'status',status,
    'expiresAt',expires_at,'revoked',revoked,'checkedAt',checked_at))
  from private.ios_subscriptions where token=account_token),'[]'::jsonb),
  'otherStoreSubscribed',exists(select 1 from private.ios_subscriptions s
   join private.ios_billing_accounts a on a.token=s.token where a.user_id=auth.uid()
   and a.store_id<>p_store_id and s.environment='Production' and s.status in (1,4)
   and not s.revoked and s.expires_at>now()));
end $$;
create function public.manee_ios_context(p_store_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.manee_ios_context(p_store_id) $$;

create function private.manee_ios_save_subscription(p_record jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved text;
begin
 if (p_record->>'productId') is distinct from 'manee.store1.monthly' then
  raise exception 'Invalid product' using errcode='22023';
 end if;
 if (p_record->>'originalId') !~ '^[0-9]{1,30}$' or (p_record->>'transactionId') !~ '^[0-9]{1,30}$'
  or (p_record->>'signedAt')::timestamptz > now()+interval '5 minutes' then
  raise exception 'Invalid transaction' using errcode='22023';
 end if;
 insert into private.ios_subscriptions as old
  (environment,original_id,token,transaction_id,status,expires_at,revoked,signed_at)
 values(p_record->>'environment',p_record->>'originalId',(p_record->>'token')::uuid,
  p_record->>'transactionId',(p_record->>'status')::integer,(p_record->>'expiresAt')::timestamptz,
  (p_record->>'revoked')::boolean,(p_record->>'signedAt')::timestamptz)
 on conflict(environment,original_id) do update set
  transaction_id=excluded.transaction_id,status=excluded.status,expires_at=excluded.expires_at,
  revoked=excluded.revoked,signed_at=excluded.signed_at,checked_at=now()
 where old.token=excluded.token and old.signed_at<=excluded.signed_at
 returning original_id into saved;
 -- Stale notifications may be acknowledged, but token reassignment never is.
 if saved is null and not exists(select 1 from private.ios_subscriptions where
  environment=p_record->>'environment' and original_id=p_record->>'originalId'
  and token=(p_record->>'token')::uuid) then
  raise exception 'Transaction binding conflict' using errcode='23505';
 end if;
 return true;
end $$;
create function public.manee_ios_save_subscription(p_record jsonb) returns boolean
language sql security invoker set search_path='' as $$ select private.manee_ios_save_subscription(p_record) $$;

create function private.manee_ios_push(p_store_id uuid,p_token text,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved text;
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if not p_enabled then
  delete from private.ios_push_devices where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid;
  return true;
 end if;
 if not private.has_store_membership(p_store_id,array['owner']) then
  raise exception 'Owner access denied' using errcode='42501';
 end if;
 insert into private.ios_push_devices as old(token,user_id,session_id,store_id)
 values(p_token,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_store_id)
 on conflict(token) do update set session_id=excluded.session_id,store_id=excluded.store_id,updated_at=now()
 where old.user_id=auth.uid()
 returning token into saved;
 if saved is null then raise exception 'Device belongs to another account' using errcode='23505';end if;
 return true;
end $$;
create function public.manee_ios_push(p_store_id uuid,p_token text,p_enabled boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.manee_ios_push(p_store_id,p_token,p_enabled) $$;

-- Service-only read checks the live session, current membership and account at
-- send time. Revoked sessions/accounts cannot receive subsequent notifications.
create function private.manee_ios_push_targets(p_store_id uuid,p_user_id uuid default null)
returns table(token text) language sql security definer set search_path='' as $$
 select d.token from private.ios_push_devices d
 join auth.sessions a on a.id=d.session_id and a.user_id=d.user_id
 join auth.users u on u.id=d.user_id
 join public.profiles p on p.user_id=d.user_id and p.status='active'
 join public.stores s on s.id=d.store_id and s.archived_at is null
 where d.store_id=p_store_id and (p_user_id is null or d.user_id=p_user_id)
 and (a.not_after is null or a.not_after>now()) and (u.banned_until is null or u.banned_until<=now())
 and exists(select 1 from public.store_memberships m where m.store_id=d.store_id
  and m.user_id=d.user_id and m.status='active' and m.role='owner')
$$;
create function public.manee_ios_push_targets(p_store_id uuid,p_user_id uuid default null)
returns table(token text) language sql security invoker set search_path='' as $$
 select * from private.manee_ios_push_targets(p_store_id,p_user_id)
$$;
create function private.manee_ios_drop_push(p_token text) returns void
language sql security definer set search_path='' as $$ delete from private.ios_push_devices where token=p_token $$;
create function public.manee_ios_drop_push(p_token text) returns void
language sql security invoker set search_path='' as $$ select private.manee_ios_drop_push(p_token) $$;

revoke all on function private.manee_ios_context(uuid),public.manee_ios_context(uuid),
 private.manee_ios_push(uuid,text,boolean),public.manee_ios_push(uuid,text,boolean)
 from public,anon;
grant execute on function private.manee_ios_context(uuid),public.manee_ios_context(uuid),
 private.manee_ios_push(uuid,text,boolean),public.manee_ios_push(uuid,text,boolean) to authenticated;
revoke all on function private.manee_ios_save_subscription(jsonb),public.manee_ios_save_subscription(jsonb),
 private.manee_ios_push_targets(uuid,uuid),public.manee_ios_push_targets(uuid,uuid),
 private.manee_ios_drop_push(text),public.manee_ios_drop_push(text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.manee_ios_save_subscription(jsonb),public.manee_ios_save_subscription(jsonb),
 private.manee_ios_push_targets(uuid,uuid),public.manee_ios_push_targets(uuid,uuid),
 private.manee_ios_drop_push(text),public.manee_ios_drop_push(text) to service_role;
notify pgrst,'reload schema';
commit;
