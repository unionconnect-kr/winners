-- Email is a recovery address; the existing internal Auth login address stays unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema if not exists private;
create table private.manee_email_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text unique,
 verified_at timestamptz,
 pending_email text unique,
 last_requested_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check ((email is null) = (verified_at is null)),
 check (email is null or (email=lower(btrim(email)) and length(email)<=254)),
 check (pending_email is null or (pending_email=lower(btrim(pending_email)) and length(pending_email)<=254))
);
create table private.manee_email_reservations (
 email text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
create index manee_email_reservations_user_idx on private.manee_email_reservations(user_id);
create table private.manee_email_challenges (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 email text not null,
 purpose text not null check(purpose in ('verify','recover')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 sent_at timestamptz,
 consumed_at timestamptz,
 operation_id uuid,
 completed_at timestamptz
);
create index manee_email_challenges_user_purpose_idx on private.manee_email_challenges(user_id,purpose,created_at);
create index manee_email_challenges_expiry_idx on private.manee_email_challenges(expires_at);
alter table private.manee_email_accounts enable row level security;
alter table private.manee_email_reservations enable row level security;
alter table private.manee_email_challenges enable row level security;
revoke all on private.manee_email_accounts,private.manee_email_reservations,private.manee_email_challenges from public,anon,authenticated;

alter table public.profiles add column if not exists recovery_email text;
alter table public.profiles add column if not exists recovery_email_verified_at timestamptz;
-- A broad existing profiles UPDATE grant must not permit self-certification.
create function private.manee_guard_verified_email()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','service_role','supabase_admin') then
  if tg_op='INSERT' then
   if new.recovery_email is not null or new.recovery_email_verified_at is not null then
    raise exception 'Verified recovery email is server managed' using errcode='42501';
   end if;
  elsif (new.recovery_email is distinct from old.recovery_email) or (new.recovery_email_verified_at is distinct from old.recovery_email_verified_at) then
   raise exception 'Verified recovery email is server managed' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
create trigger manee_verified_email_server_only before insert or update
 on public.profiles for each row execute function private.manee_guard_verified_email();

create function private.manee_email_service(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid; sid uuid; addr text; kh text; cid uuid; op uuid;
 a private.manee_email_accounts%rowtype;
 c private.manee_email_challenges%rowtype;
begin
 -- Opportunistic bounded cleanup; only current/past seven days of challenge
 -- history remain useful. No raw tokens are ever persisted.
 delete from private.manee_email_challenges where id in (select id from private.manee_email_challenges where expires_at<now()-interval '7 days' order by expires_at limit 500);
 delete from private.manee_email_reservations where email in (select email from private.manee_email_reservations where expires_at<now() order by expires_at limit 500);
 -- Only the service_role wrapper is executable. Actor IDs come from getUser(),
 -- and authenticated actions also check the actual live server session.
 uid:=nullif(p_payload->>'user_id','')::uuid;
 addr:=lower(btrim(coalesce(p_payload->>'email','')));
 if p_action in ('check','register','prepare','recover_prepare') and
   (length(addr)>254 or length(split_part(addr,'@',1))>64 or split_part(addr,'@',1) like '.%' or split_part(addr,'@',1) like '%.' or split_part(addr,'@',1) like '%..%' or addr !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') then
  return jsonb_build_object('ok',false,'error','invalid_email');
 end if;
 if p_action in ('status','prepare') then
  sid:=nullif(p_payload->>'session_id','')::uuid;
  if uid is null or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    join public.profiles p on p.user_id=u.id where s.id=sid and s.user_id=uid and p.status='active'
    and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<now())) then
   return jsonb_build_object('ok',false,'error','invalid_session');
  end if;
 end if;
 if p_action='prune' then
  return jsonb_build_object('ok',true);
 elsif p_action='check' then
  return jsonb_build_object('ok',true,'available',not exists(select 1 from private.manee_email_accounts where (email=addr or pending_email=addr) and user_id is distinct from uid)
   and not exists(select 1 from private.manee_email_reservations where email=addr and expires_at>now() and user_id is distinct from uid));
 elsif p_action='status' then
  select * into a from private.manee_email_accounts where user_id=uid;
  return jsonb_build_object('ok',true,'email',a.email,'pending_email',a.pending_email,'verified_at',a.verified_at,'email_verified',a.verified_at is not null);
 elsif p_action in ('register','prepare') then
  if uid is null or not exists(select 1 from auth.users where id=uid) then return jsonb_build_object('ok',false,'error','invalid_user'); end if;
  -- Account then address lock order is shared by issuing and consuming links.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,122852));
  perform pg_advisory_xact_lock(hashtextextended(addr,122851));
  delete from private.manee_email_reservations where email=addr and expires_at<=now();
  if exists(select 1 from private.manee_email_accounts where (email=addr or pending_email=addr) and user_id<>uid)
    or exists(select 1 from private.manee_email_reservations where email=addr and user_id<>uid) then
   return jsonb_build_object('ok',false,'error','email_taken');
  end if;
  insert into private.manee_email_accounts(user_id) values(uid) on conflict do nothing;
  select * into a from private.manee_email_accounts where user_id=uid for update;
  if p_action='prepare' and a.last_requested_at>clock_timestamp()-interval '60 seconds' then
   return jsonb_build_object('ok',false,'error','rate_limited');
  end if;
  if a.email=addr then
   -- Choosing the verified address again cancels any older pending replacement.
   update private.manee_email_accounts set pending_email=null,updated_at=clock_timestamp() where user_id=uid;
   delete from private.manee_email_reservations where user_id=uid;
   update private.manee_email_challenges set consumed_at=clock_timestamp() where user_id=uid and purpose='verify' and consumed_at is null;
   return jsonb_build_object('ok',true,'already_verified',true,'email',a.email,'email_verified',true,'verified_at',a.verified_at);
  end if;
  delete from private.manee_email_reservations where user_id=uid and email<>addr;
  insert into private.manee_email_reservations(email,user_id,expires_at) values(addr,uid,clock_timestamp()+interval '24 hours')
    on conflict(email) do update set user_id=excluded.user_id,expires_at=excluded.expires_at;
  update private.manee_email_accounts set pending_email=addr,updated_at=clock_timestamp() where user_id=uid;
  if p_action='register' then return jsonb_build_object('ok',true,'pending_email',addr,'email_verified',false); end if;
  kh:=p_payload->>'token_hash';
  if kh is null or kh !~ '^[0-9a-f]{64}$' then raise exception 'Invalid email challenge'; end if;
  update private.manee_email_challenges set consumed_at=clock_timestamp() where user_id=uid and purpose='verify' and consumed_at is null;
  insert into private.manee_email_challenges(user_id,email,purpose,token_hash) values(uid,addr,'verify',kh) returning id into cid;
  update private.manee_email_accounts set last_requested_at=clock_timestamp() where user_id=uid;
  return jsonb_build_object('ok',true,'challenge_id',cid,'email',a.email,'pending_email',addr,'email_verified',a.verified_at is not null);
 elsif p_action='recover_prepare' then
  select * into a from private.manee_email_accounts where email=addr and verified_at is not null;
  if not found or not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
   where u.id=a.user_id and p.status='active' and (u.banned_until is null or u.banned_until<now())) then
   return jsonb_build_object('ok',true,'deliver',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(a.user_id::text,122852));
  select * into a from private.manee_email_accounts where email=addr and verified_at is not null for update;
  if not found then return jsonb_build_object('ok',true,'deliver',false); end if;
  if exists(select 1 from private.manee_email_challenges where user_id=a.user_id and purpose='recover' and created_at>clock_timestamp()-interval '60 seconds') then
   return jsonb_build_object('ok',true,'deliver',false);
  end if;
  kh:=p_payload->>'token_hash';
  if kh is null or kh !~ '^[0-9a-f]{64}$' then raise exception 'Invalid email challenge'; end if;
  update private.manee_email_challenges set consumed_at=clock_timestamp() where user_id=a.user_id and purpose='recover' and consumed_at is null;
  insert into private.manee_email_challenges(user_id,email,purpose,token_hash) values(a.user_id,addr,'recover',kh) returning id into cid;
  return jsonb_build_object('ok',true,'deliver',true,'challenge_id',cid,'user_id',a.user_id);
 elsif p_action in ('sent','delivery_failed') then
  cid:=(p_payload->>'challenge_id')::uuid;
  update private.manee_email_challenges set sent_at=case when p_action='sent' then clock_timestamp() else sent_at end,
   consumed_at=case when p_action='delivery_failed' then clock_timestamp() else consumed_at end
   where id=cid and consumed_at is null;
  return jsonb_build_object('ok',found);
 elsif p_action in ('verify','recover_preview','recover_consume') then
  kh:=p_payload->>'token_hash';
  if kh is null or kh !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok',false,'error','invalid_link'); end if;
  select * into c from private.manee_email_challenges where token_hash=kh;
  if not found then return jsonb_build_object('ok',false,'error','invalid_link'); end if;
  perform pg_advisory_xact_lock(hashtextextended(c.user_id::text,122852));
  perform pg_advisory_xact_lock(hashtextextended(c.email,122851));
  select * into c from private.manee_email_challenges where token_hash=kh for update;
  if not found or c.consumed_at is not null or c.sent_at is null or c.expires_at<=clock_timestamp()
   or not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id where u.id=c.user_id and p.status='active' and (u.banned_until is null or u.banned_until<now())) then
   return jsonb_build_object('ok',false,'error','invalid_link');
  end if;
  select * into a from private.manee_email_accounts where user_id=c.user_id for update;
  if p_action='verify' then
   if c.purpose<>'verify' or a.pending_email is distinct from c.email then return jsonb_build_object('ok',false,'error','invalid_link'); end if;
   if exists(select 1 from private.manee_email_accounts where email=c.email and user_id<>c.user_id) then
    return jsonb_build_object('ok',false,'error','email_taken');
   end if;
   update private.manee_email_accounts set email=c.email,verified_at=clock_timestamp(),pending_email=null,updated_at=clock_timestamp() where user_id=c.user_id;
   update public.profiles set recovery_email=c.email,recovery_email_verified_at=clock_timestamp() where user_id=c.user_id;
   delete from private.manee_email_reservations where user_id=c.user_id;
   update private.manee_email_challenges set consumed_at=clock_timestamp(),completed_at=clock_timestamp() where id=c.id;
   return jsonb_build_object('ok',true,'email',c.email,'email_verified',true);
  end if;
  if c.purpose<>'recover' or a.email is distinct from c.email or a.verified_at is null then return jsonb_build_object('ok',false,'error','invalid_link'); end if;
  if p_action='recover_preview' then
   return (select jsonb_build_object('ok',true,'username',username) from public.profiles where user_id=c.user_id);
  end if;
  op:=gen_random_uuid();
  update private.manee_email_challenges set consumed_at=clock_timestamp(),operation_id=op where id=c.id;
  return jsonb_build_object('ok',true,'user_id',c.user_id,'challenge_id',c.id,'operation_id',op);
 elsif p_action='recover_complete' then
  cid:=(p_payload->>'challenge_id')::uuid; op:=(p_payload->>'operation_id')::uuid;
  update private.manee_email_challenges set completed_at=clock_timestamp() where id=cid and operation_id=op and consumed_at is not null and completed_at is null returning user_id into uid;
  if not found then return jsonb_build_object('ok',false,'error','invalid_operation'); end if;
  delete from auth.sessions where user_id=uid;
  return jsonb_build_object('ok',true);
 end if;
 return jsonb_build_object('ok',false,'error','invalid_action');
end; $$;
create function public.manee_email_service(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.manee_email_service(p_action,p_payload); $$;
revoke all on function private.manee_email_service(text,jsonb),public.manee_email_service(text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.manee_email_service(text,jsonb),public.manee_email_service(text,jsonb) to service_role;
revoke all on function private.manee_guard_verified_email() from public,anon,authenticated;
commit;
