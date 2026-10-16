-- Staff registration and self-tests use current, approved store membership.
-- A null target remains OWNER ONLY: scheduled business events and reports never
-- fan out to staff. A staff self-test is addressed to auth.uid() by the HTTP handler.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function private.manee_ios_push_context(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_live_manee_session()
 and private.has_store_membership(p_store_id,array['owner','manager','staff'])
 and exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
$$;
create or replace function private.manee_ios_push(p_store_id uuid,p_token text,p_enabled boolean) returns boolean
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
 if not private.has_store_membership(p_store_id,array['owner','manager','staff']) then
  raise exception 'Store access denied' using errcode='42501';
 end if;
 insert into private.ios_push_devices as old(token,user_id,session_id,store_id)
 values(p_token,auth.uid(),(auth.jwt()->>'session_id')::uuid,p_store_id)
 on conflict(token) do update set session_id=excluded.session_id,store_id=excluded.store_id,updated_at=now()
 where old.user_id=auth.uid()
 returning token into saved;
 if saved is null then raise exception 'Device belongs to another account' using errcode='23505';end if;
 return true;
end $$;
create or replace function private.manee_ios_push_targets(p_store_id uuid,p_user_id uuid default null)
returns table(token text) language sql security definer set search_path='' as $$
 select d.token from private.ios_push_devices d
 join auth.sessions a on a.id=d.session_id and a.user_id=d.user_id
 join auth.users u on u.id=d.user_id
 join public.profiles p on p.user_id=d.user_id and p.status='active'
 join public.stores s on s.id=d.store_id and s.archived_at is null
 where d.store_id=p_store_id and (p_user_id is null or d.user_id=p_user_id)
 and (a.not_after is null or a.not_after>now()) and (u.banned_until is null or u.banned_until<=now())
 and exists(select 1 from public.store_memberships m where m.store_id=d.store_id
  and m.user_id=d.user_id and m.status='active' and
   (m.role='owner' or (p_user_id is not null and m.role in ('staff','manager') and exists
    (select 1 from public.crew c where c.id=m.crew_id and c.store_id=m.store_id
     and (c.resign_date is null or c.resign_date>(now() at time zone 'Asia/Seoul')::date)))))
$$;

-- Existing invoker wrappers and grants remain unchanged; no table access added.
revoke all on function private.manee_ios_push_context(uuid),private.manee_ios_push(uuid,text,boolean) from public,anon;
grant execute on function private.manee_ios_push_context(uuid),private.manee_ios_push(uuid,text,boolean) to authenticated;
revoke all on function private.manee_ios_push_targets(uuid,uuid) from public,anon,authenticated;
grant execute on function private.manee_ios_push_targets(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
