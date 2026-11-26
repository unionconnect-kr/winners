begin;
set local lock_timeout = '5s';

-- Event sources and store ownership come from the leased delivery, never from the phone.
create or replace function private.manee_owner_delivery_text(p_store uuid, p_kind text, p_source text)
returns text
language plpgsql stable security invoker set search_path = ''
as $$
declare
  event_id uuid;
  body text;
begin
  if p_kind not in ('attendance_in', 'attendance_out', 'notice')
     or p_source is null or p_source !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  event_id := p_source::uuid;

  if p_kind = 'notice' then
    select left(n.message, 300) into body
    from private.manee_owner_activity n where n.id = event_id and n.store_id = p_store;
    return body;
  end if;

  select left(nullif(btrim(regexp_replace(s.name, '[[:space:][:cntrl:]]+', ' ', 'g')), ''), 80)
         || ' ' || left(nullif(btrim(regexp_replace(c.name, '[[:space:][:cntrl:]]+', ' ', 'g')), ''), 50)
         || case p_kind when 'attendance_in' then '님이 출근했어요.' else '님이 퇴근했어요.' end
    into body
    from public.attendance a
    join public.crew c on c.id = a.crew_id and c.store_id = a.store_id
    join public.stores s on s.id = a.store_id
   where a.id = event_id and a.store_id = p_store;
  return body;
end
$$;
revoke all on function private.manee_owner_delivery_text(uuid, text, text) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.claim_android_deliveries(p_dispatch_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_dispatch_token is null or length(p_dispatch_token)<>64
  or not exists(select 1 from vault.decrypted_secrets where name='manee_android_dispatch' and decrypted_secret=p_dispatch_token)
 then raise exception 'Dispatch access denied' using errcode='42501';end if;
 update private.android_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_android_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.android_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.android_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.android_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,private.manee_owner_delivery_text(d.store_id, d.kind, d.source_id) as message,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.claim_ios_deliveries(p_dispatch_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or p_dispatch_token is null or length(p_dispatch_token)<>64
  or not exists(select 1 from vault.decrypted_secrets where name='manee_ios_dispatch' and decrypted_secret=p_dispatch_token)
 then raise exception 'Dispatch access denied' using errcode='42501';end if;
 update private.ios_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_ios_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,private.manee_owner_delivery_text(d.store_id, d.kind, d.source_id) as message,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_ios_claim_scheduled_deliveries()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 perform private.seed_ios_reminders();
 delete from private.ios_push_deliveries where created_at<now()-interval '14 days';
 update private.ios_push_deliveries d set status='skipped',finished_at=now()
  where status='pending' and (expires_at<=now() or not exists
   (select 1 from private.manee_ios_push_targets(d.store_id) t where t.token=d.token)
   or (kind='monthly_costs' and exists(select 1 from public.monthly_cost_reviews v
    where v.store_id=d.store_id and v.month_key=d.source_id and (v.completed_at is not null or v.remind_after>(now() at time zone 'Asia/Seoul')::date)))
   or (kind in ('reservation_upcoming','reservation_due') and not exists(select 1 from public.reservations r
    where r.status='confirmed' and r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 50),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,private.manee_owner_delivery_text(d.store_id, d.kind, d.source_id) as message,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$;

revoke all on function private.claim_android_deliveries(text), private.claim_ios_deliveries(text),
  private.manee_ios_claim_scheduled_deliveries() from public, anon, authenticated;
grant execute on function private.claim_android_deliveries(text), private.claim_ios_deliveries(text),
  private.manee_ios_claim_scheduled_deliveries() to service_role;

commit;
