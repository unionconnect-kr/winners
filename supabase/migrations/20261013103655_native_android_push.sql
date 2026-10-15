-- Android FCM devices are separate from web subscriptions and APNs tokens.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table private.android_push_devices (
 token text primary key check(token ~ '^[A-Za-z0-9_:-]+$' and length(token) between 20 and 4096),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 updated_at timestamptz not null default now(),
 last_test_at timestamptz,
 unique(session_id)
);
create index android_push_store_idx on private.android_push_devices(store_id);
create index android_push_user_idx on private.android_push_devices(user_id);
alter table private.android_push_devices enable row level security;
revoke all on private.android_push_devices from public,anon,authenticated;

create function private.manee_android_push_context(p_store_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not private.has_store_membership(p_store_id,array['owner'])
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
  or not exists(select 1 from public.stores where id=p_store_id and archived_at is null) then
  raise exception 'Owner access denied' using errcode='42501';
 end if;
 return true;
end $$;
create function public.manee_android_push_context(p_store_id uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.manee_android_push_context(p_store_id) $$;

create function private.manee_android_push(p_store_id uuid,p_token text,p_enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare saved text;
begin
 if auth.uid() is null or not private.is_live_manee_session() then
  raise exception 'Authentication required' using errcode='42501';
 end if;
 if p_enabled is null then raise exception 'Invalid request' using errcode='22023';end if;
 if not p_enabled then
  delete from private.android_push_devices where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid;
  return true;
 end if;
 perform private.manee_android_push_context(p_store_id);
 -- Token rotation/store selection replaces only this authenticated session's row.
 delete from private.android_push_devices where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid and token is distinct from p_token;
 insert into private.android_push_devices as old(token,user_id,session_id,store_id)
 values(p_token,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_store_id)
 on conflict(token) do update set session_id=excluded.session_id,store_id=excluded.store_id,updated_at=now()
 where old.user_id=auth.uid()
 returning token into saved;
 if saved is null then raise exception 'Device belongs to another account' using errcode='23505';end if;
 return true;
end $$;
create function public.manee_android_push(p_store_id uuid,p_token text,p_enabled boolean) returns boolean
language sql security invoker set search_path='' as $$ select private.manee_android_push(p_store_id,p_token,p_enabled) $$;

-- A client can request a test only for its own current device, at most once/30s.
create function private.manee_android_push_test_target(p_store_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare target text;
begin
 perform private.manee_android_push_context(p_store_id);
 update private.android_push_devices set last_test_at=now()
 where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid and store_id=p_store_id
 and (last_test_at is null or last_test_at<now()-interval '30 seconds') returning token into target;
 if target is null then raise exception 'Test unavailable or rate limited' using errcode='P0001';end if;
 return target;
end $$;
create function public.manee_android_push_test_target(p_store_id uuid) returns text
language sql security invoker set search_path='' as $$ select private.manee_android_push_test_target(p_store_id) $$;

-- Available for a future event sender; rechecks live session and current access.
create function private.manee_android_push_targets(p_store_id uuid)
returns table(token text) language sql security definer set search_path='' as $$
 select d.token from private.android_push_devices d
 join auth.sessions a on a.id=d.session_id and a.user_id=d.user_id
 join auth.users u on u.id=d.user_id
 join public.profiles p on p.user_id=d.user_id and p.status='active'
 join public.stores s on s.id=d.store_id and s.archived_at is null
 where d.store_id=p_store_id and (a.not_after is null or a.not_after>now())
 and (u.banned_until is null or u.banned_until<=now())
 and exists(select 1 from public.store_memberships m where m.store_id=d.store_id
  and m.user_id=d.user_id and m.status='active' and m.role='owner')
$$;
create function public.manee_android_push_targets(p_store_id uuid)
returns table(token text) language sql security invoker set search_path='' as $$ select * from private.manee_android_push_targets(p_store_id) $$;
revoke all on function private.manee_android_push_context(uuid),public.manee_android_push_context(uuid),
 private.manee_android_push(uuid,text,boolean),public.manee_android_push(uuid,text,boolean),
 private.manee_android_push_test_target(uuid),public.manee_android_push_test_target(uuid) from public,anon;
grant execute on function private.manee_android_push_context(uuid),public.manee_android_push_context(uuid),
 private.manee_android_push(uuid,text,boolean),public.manee_android_push(uuid,text,boolean),
 private.manee_android_push_test_target(uuid),public.manee_android_push_test_target(uuid) to authenticated;
revoke all on function private.manee_android_push_targets(uuid),public.manee_android_push_targets(uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.manee_android_push_targets(uuid),public.manee_android_push_targets(uuid) to service_role;
notify pgrst,'reload schema';
commit;
