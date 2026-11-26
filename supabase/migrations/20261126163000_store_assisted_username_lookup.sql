-- A store attestation releases only an enrolled staff username, after the existing
-- SMS challenge succeeds. It never establishes a password reset or sign-in factor.
create table private.manee_staff_id_lookup_enrollment (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table private.manee_staff_id_lookup_approval (
  challenge_id uuid primary key references private.manee_sms_challenges(id) on delete cascade,
  membership_id uuid not null,
  store_id uuid not null,
  crew_id uuid not null,
  target_id uuid not null,
  owner_id uuid not null,
  approved_at timestamptz not null default clock_timestamp()
);
alter table private.manee_staff_id_lookup_enrollment enable row level security;
alter table private.manee_staff_id_lookup_approval enable row level security;
revoke all on private.manee_staff_id_lookup_enrollment, private.manee_staff_id_lookup_approval
  from public, anon, authenticated, service_role;

-- Enrollment is an explicit support operation. Future accounts are not enrolled here.
create function private.manee_staff_id_lookup_target(p_owner uuid, p_store uuid, p_crew uuid)
returns table(membership_id uuid, target_id uuid, username text)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.user_id, p.username
  from public.store_memberships m
  join private.manee_staff_id_lookup_enrollment enrolled on enrolled.user_id=m.user_id
  join public.crew c on c.id=m.crew_id and c.store_id=m.store_id and c.resign_date is null
  join public.stores s on s.id=m.store_id and s.archived_at is null
  join public.profiles p on p.user_id=m.user_id
  where m.store_id=p_store and m.crew_id=p_crew and m.status='active' and m.role in ('staff','manager')
    and p.username ~ '^[a-z0-9가-힣._-]{4,30}$' and private.manee_sms_ordinary_user(m.user_id)
    and not exists (select 1 from private.manee_sms_bindings b where b.user_id=m.user_id and b.verified_at is not null)
    and exists (
      select 1 from public.store_memberships o
      join public.profiles po on po.user_id=o.user_id and po.status='active'
      join auth.users ou on ou.id=o.user_id and (ou.banned_until is null or ou.banned_until<now())
      where o.user_id=p_owner and o.store_id=m.store_id and o.status='active' and o.role='owner'
    )
$$;
revoke all on function private.manee_staff_id_lookup_target(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.manee_approve_staff_id_lookup(p_store_id uuid,p_crew_id uuid,p_reference text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  ref text := lower(replace(trim(p_reference),'-',''));
  target record;
  matches uuid[];
  challenge uuid;
  accepted boolean;
begin
  if actor is null or not private.is_live_manee_session() or coalesce(ref,'') !~ '^[a-f0-9]{12}$' then
    return false;
  end if;
  begin
    select * into strict target from private.manee_staff_id_lookup_target(actor,p_store_id,p_crew_id);
  exception when no_data_found or too_many_rows then return false;
  end;
  if not public.consume_auth_rate_limit('staff_id_attestation',encode(sha256(convert_to(actor::text,'UTF8')),'hex'),600,20)
    then return false; end if;
  select array_agg(c.id) into matches from private.manee_sms_challenges c
  where c.purpose='find_username' and c.status='sent' and c.expires_at>clock_timestamp()
    and right(c.id::text,12)=ref;
  if coalesce(cardinality(matches),0)<>1 then return false; end if;
  -- The verifier locks this same row before consuming the employee's SMS code.
  select c.id into challenge from private.manee_sms_challenges c
  where c.id=matches[1] and c.status='sent' and c.purpose='find_username'
    and c.expires_at>clock_timestamp() and c.failed_attempts<5 for update;
  if challenge is null then return false; end if;
  insert into private.manee_staff_id_lookup_approval(challenge_id,membership_id,store_id,crew_id,target_id,owner_id)
    values(challenge,target.membership_id,p_store_id,p_crew_id,target.target_id,actor)
    on conflict (challenge_id) do nothing;
  select exists(select 1 from private.manee_staff_id_lookup_approval a where a.challenge_id=challenge
    and a.owner_id=actor and a.membership_id=target.membership_id and a.store_id=p_store_id
    and a.crew_id=p_crew_id and a.target_id=target.target_id) into accepted;
  return accepted;
end;
$$;
revoke all on function private.manee_approve_staff_id_lookup(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.manee_approve_staff_id_lookup(uuid,uuid,text) to authenticated;
create function public.manee_approve_staff_id_lookup(p_store_id uuid,p_crew_id uuid,p_reference text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.manee_approve_staff_id_lookup(p_store_id,p_crew_id,p_reference)
$$;
revoke all on function public.manee_approve_staff_id_lookup(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.manee_approve_staff_id_lookup(uuid,uuid,text) to authenticated;

create function private.manee_find_username_with_store(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  approval private.manee_staff_id_lookup_approval%rowtype;
  selected_name text;
begin
  result := private.manee_find_username_service(p_action,p_payload);
  if p_action is distinct from 'verify' or (result->>'ok') is distinct from 'true' then return result; end if;
  select a.* into approval from private.manee_staff_id_lookup_approval a
    where a.challenge_id=(p_payload->>'id')::uuid;
  if not found then return result; end if;
  select t.username into selected_name
    from private.manee_staff_id_lookup_target(approval.owner_id,approval.store_id,approval.crew_id) t
    where t.membership_id=approval.membership_id and t.target_id=approval.target_id;
  return jsonb_build_object('ok',true,'usernames',
    case when selected_name is null then '[]'::jsonb else jsonb_build_array(selected_name) end);
end;
$$;
revoke all on function private.manee_find_username_with_store(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.manee_find_username_with_store(text,jsonb) to service_role;
create or replace function public.manee_find_username_service(p_action text,p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.manee_find_username_with_store(p_action,p_payload)
$$;
revoke all on function public.manee_find_username_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.manee_find_username_service(text,jsonb) to service_role;
