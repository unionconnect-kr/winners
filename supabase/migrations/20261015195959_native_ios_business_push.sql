begin;
-- iOS counterpart of the tested Android business-event ledger. No delivery is activated.
-- Committed business events only. Tokens and delivery state stay private.
set local lock_timeout='5s';
create table private.ios_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_key text not null, source_id text not null, kind text not null check(kind in
 ('attendance_in','attendance_out','reservation_created','reservation_cancelled','reservation_upcoming','report_closed','monthly_costs')),
 store_id uuid not null references public.stores(id) on delete cascade,
 token text not null references private.ios_push_devices(token) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sent','skipped','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 expires_at timestamptz not null, lease_id uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), finished_at timestamptz,
 unique(event_key,token)
);
alter table private.ios_push_deliveries enable row level security;
revoke all on private.ios_push_deliveries from public,anon,authenticated,service_role;
create index ios_delivery_pending_idx on private.ios_push_deliveries(available_at) where status='pending';
create index ios_delivery_store_idx on private.ios_push_deliveries(store_id);
create index ios_delivery_token_idx on private.ios_push_deliveries(token);

create function private.enqueue_ios_event(p_store uuid,p_kind text,p_source text,p_key text,p_expires timestamptz)
returns void language sql security definer set search_path='' as $$
 insert into private.ios_push_deliveries(store_id,kind,source_id,event_key,token,expires_at)
 select p_store,p_kind,p_source,p_key,t.token,p_expires from private.manee_ios_push_targets(p_store) t
 where p_expires>now() on conflict(event_key,token) do nothing
$$;
revoke all on function private.enqueue_ios_event(uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;

create function private.queue_ios_business_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_kind text; row_data jsonb; sid uuid; source text; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 sid:=(row_data->>'store_id')::uuid;source:=row_data->>'id';
 if tg_table_name='attendance' then
  if new.date not between today-1 and today then return null;end if;
  if tg_op='INSERT' then
   if new.check_in is not null and new.check_out is null then event_kind:='attendance_in';end if;
  elsif new.check_out is not null and old.check_out is null then event_kind:='attendance_out';
  elsif new.check_in is not null and old.check_in is null then event_kind:='attendance_in';end if;
 elsif tg_table_name='reservations' then
  if tg_op='DELETE' then
   update private.ios_push_deliveries set status='skipped',finished_at=now()
    where store_id=sid and source_id=source and kind in ('reservation_created','reservation_upcoming') and status='pending';
   event_kind:='reservation_cancelled';
  else event_kind:='reservation_created';end if;
  if (row_data->>'date')::date<today then return null;end if;
 elsif tg_table_name='monthly_report_closings' then event_kind:='report_closed';
 end if;
 if event_kind is not null then
  perform private.enqueue_ios_event(sid,event_kind,source,event_kind||':'||source,now()+interval '2 hours');
 end if;
 return null;
end $$;
revoke all on function private.queue_ios_business_event() from public,anon,authenticated,service_role;
create trigger ios_attendance_event after insert or update of check_in,check_out on public.attendance
 for each row execute function private.queue_ios_business_event();
create trigger ios_reservation_event after insert or delete on public.reservations
 for each row execute function private.queue_ios_business_event();
create trigger ios_report_event after insert on public.monthly_report_closings
 for each row execute function private.queue_ios_business_event();

-- Called by the scheduler; independent of the web notification flags.
create function private.seed_ios_reminders(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare r record; local_now timestamp:=p_now at time zone 'Asia/Seoul'; today date:=local_now::date;
 month text:=to_char(local_now,'YYYY-MM');last_day date:=(date_trunc('month',local_now)+interval '1 month - 1 day')::date;
begin
 for r in select id,store_id,date,time from public.reservations
  where date between today and today+1 and time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 loop
  if r.date+r.time::time>local_now and r.date+r.time::time<=local_now+interval '30 minutes' then
   perform private.enqueue_ios_event(r.store_id,'reservation_upcoming',r.id::text,
    'reservation_upcoming:'||r.id::text||':'||r.date::text||':'||r.time, (r.date+r.time::time) at time zone 'Asia/Seoul');
  end if;
 end loop;
 if local_now::time<'10:00'::time or local_now::time>='21:00'::time then return;end if;
 for r in select distinct s.id,due.month_key from public.stores s
  cross join lateral (select month month_key where today in(last_day-7,last_day-3,last_day)
   union select v.month_key from public.monthly_cost_reviews v where v.store_id=s.id and v.remind_after=today) due
  left join public.monthly_cost_reviews v on v.store_id=s.id and v.month_key=due.month_key
  where s.archived_at is null and v.completed_at is null
   and ((due.month_key=month and v.remind_after is null and today in(last_day-7,last_day-3,last_day)) or v.remind_after=today)
   and exists(select 1 from public.sales_reports sr where sr.store_id=s.id
    and sr.date>=to_date(due.month_key||'-01','YYYY-MM-DD')
    and sr.date<to_date(due.month_key||'-01','YYYY-MM-DD')+interval '1 month' and sr.date<=today)
 loop
  perform private.enqueue_ios_event(r.id,'monthly_costs',r.month_key,
   'monthly_costs:'||r.id::text||':'||r.month_key||':'||today::text,(today+time '21:00') at time zone 'Asia/Seoul');
 end loop;
end $$;
revoke all on function private.seed_ios_reminders(timestamptz) from public,anon,authenticated,service_role;

-- A service credential alone is insufficient to trigger delivery via the HTTP worker.
-- The scheduler's separate bearer is generated and kept inside Vault.
create function private.claim_ios_deliveries(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
   or (kind='reservation_upcoming' and not exists(select 1 from public.reservations r
    where r.store_id=d.store_id and r.id::text=d.source_id
    and 'reservation_upcoming:'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.manee_claim_ios_deliveries(p_dispatch_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.claim_ios_deliveries(p_dispatch_token)$$;

create function private.finish_ios_delivery(p_id uuid,p_lease uuid,p_result text) returns void
language plpgsql security definer set search_path='' as $$
declare d private.ios_push_deliveries%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' or p_result not in ('sent','expired','retry','skipped') then
  raise exception 'Service access denied' using errcode='42501';end if;
 select * into d from private.ios_push_deliveries where id=p_id and lease_id=p_lease and status='pending' for update;
 if not found then return;end if;
 if p_result='expired' then
  delete from private.ios_push_devices where token=d.token;return;
 end if;
 update private.ios_push_deliveries set
  status=case when p_result in ('sent','skipped') then p_result when attempts>=4 then 'failed' else 'pending' end,
  finished_at=case when p_result in ('sent','skipped') or attempts>=4 then now() else null end,
  available_at=now()+make_interval(secs=>60*attempts),lease_until=null,lease_id=null where id=p_id;
end $$;
create function public.manee_finish_ios_delivery(p_id uuid,p_lease uuid,p_result text) returns void
language sql security invoker set search_path='' as $$select private.finish_ios_delivery(p_id,p_lease,p_result)$$;
revoke all on function private.claim_ios_deliveries(text),public.manee_claim_ios_deliveries(text),
 private.finish_ios_delivery(uuid,uuid,text),public.manee_finish_ios_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.claim_ios_deliveries(text),public.manee_claim_ios_deliveries(text),
 private.finish_ios_delivery(uuid,uuid,text),public.manee_finish_ios_delivery(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';

set local lock_timeout='5s';
alter table private.ios_push_deliveries drop constraint ios_push_deliveries_kind_check;
alter table private.ios_push_deliveries add constraint ios_push_deliveries_kind_check check(kind in
 ('attendance_in','attendance_out','reservation_created','reservation_cancelled','reservation_upcoming','reservation_due','report_closed','monthly_costs'));
-- pg_net only sends after commit. Cron remains the fallback if an immediate wake fails.
-- Respect the scheduler's explicit staging opt-in, including for trigger-based wakeups.
create function private.wake_ios_delivery() returns void
language plpgsql security definer set search_path='' as $$
begin
 return;
exception when others then null;
end $$;
revoke all on function private.wake_ios_delivery() from public,anon,authenticated,service_role;

create or replace function private.queue_ios_business_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_kind text; row_data jsonb; sid uuid; source text; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 sid:=(row_data->>'store_id')::uuid;source:=row_data->>'id';
 if tg_table_name='attendance' then
  if new.date not between today-1 and today then return null;end if;
  if tg_op='INSERT' then
   if new.check_in is not null and new.check_out is null then event_kind:='attendance_in';end if;
  elsif new.check_out is not null and old.check_out is null then event_kind:='attendance_out';
  elsif new.check_in is not null and old.check_in is null then event_kind:='attendance_in';end if;
 elsif tg_table_name='reservations' then
  if tg_op='DELETE' then
   update private.ios_push_deliveries set status='skipped',finished_at=now()
    where store_id=sid and source_id=source and kind in ('reservation_created','reservation_upcoming','reservation_due') and status='pending';
   event_kind:='reservation_cancelled';
  else event_kind:='reservation_created';end if;
  if (row_data->>'date')::date<today then return null;end if;
 elsif tg_table_name='monthly_report_closings' then event_kind:='report_closed';
 end if;
 if event_kind is not null then
  perform private.enqueue_ios_event(sid,event_kind,source,event_kind||':'||source,now()+interval '2 hours');
  if tg_table_name='reservations' then perform private.wake_ios_delivery();end if;
 end if;
 return null;
end $$;

create or replace function private.seed_ios_reminders(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare r record; local_now timestamp:=p_now at time zone 'Asia/Seoul'; today date:=local_now::date;
 month text:=to_char(local_now,'YYYY-MM');last_day date:=(date_trunc('month',local_now)+interval '1 month - 1 day')::date;
begin
 for r in select id,store_id,date,time from public.reservations
  where date between today-1 and today+1 and time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 loop
  if r.date+r.time::time>local_now+interval '1 minute' and r.date+r.time::time<=local_now+interval '30 minutes' then
   perform private.enqueue_ios_event(r.store_id,'reservation_upcoming',r.id::text,
    'reservation_upcoming:'||r.id::text||':'||r.date::text||':'||r.time, (r.date+r.time::time) at time zone 'Asia/Seoul');
  end if;
  if r.date+r.time::time<=local_now and r.date+r.time::time>local_now-interval '5 minutes' then
   perform private.enqueue_ios_event(r.store_id,'reservation_due',r.id::text,
    'reservation_due:'||r.id::text||':'||r.date::text||':'||r.time, ((r.date+r.time::time) at time zone 'Asia/Seoul')+interval '10 minutes');
  end if;
 end loop;
 if local_now::time<'10:00'::time or local_now::time>='21:00'::time then return;end if;
 for r in select distinct s.id,due.month_key from public.stores s
  cross join lateral (select month month_key where today in(last_day-7,last_day-3,last_day)
   union select v.month_key from public.monthly_cost_reviews v where v.store_id=s.id and v.remind_after=today) due
  left join public.monthly_cost_reviews v on v.store_id=s.id and v.month_key=due.month_key
  where s.archived_at is null and v.completed_at is null
   and ((due.month_key=month and v.remind_after is null and today in(last_day-7,last_day-3,last_day)) or v.remind_after=today)
   and exists(select 1 from public.sales_reports sr where sr.store_id=s.id
    and sr.date>=to_date(due.month_key||'-01','YYYY-MM-DD')
    and sr.date<to_date(due.month_key||'-01','YYYY-MM-DD')+interval '1 month' and sr.date<=today)
 loop
  perform private.enqueue_ios_event(r.id,'monthly_costs',r.month_key,
   'monthly_costs:'||r.id::text||':'||r.month_key||':'||today::text,(today+time '21:00') at time zone 'Asia/Seoul');
 end loop;
end $$;

create or replace function private.claim_ios_deliveries(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    where r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
notify pgrst,'reload schema';

-- Minimal routing context from committed source records; no customer or financial details.
create or replace function private.claim_ios_deliveries(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    where r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
notify pgrst,'reload schema';


create function private.manee_ios_push_context(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.is_live_manee_session()
 and private.has_store_membership(p_store_id,array['owner'])
 and exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
$$;
create function public.manee_ios_push_context(p_store_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select private.manee_ios_push_context(p_store_id) $$;
revoke all on function private.manee_ios_push_context(uuid),public.manee_ios_push_context(uuid) from public,anon;
grant execute on function private.manee_ios_push_context(uuid),public.manee_ios_push_context(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
