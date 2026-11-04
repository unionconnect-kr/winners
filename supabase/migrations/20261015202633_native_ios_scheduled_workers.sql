-- Scheduled-only server workers; no anonymous/customer access and no new secret values.
begin;
set local lock_timeout='5s';

create table private.ios_worker_health (
 mode text primary key check(mode in ('push','billing')),
 last_run_at timestamptz not null default now(),
 processed integer not null check(processed between 0 and 50),
 failed integer not null check(failed between 0 and 50)
);
alter table private.ios_worker_health enable row level security;
revoke all on private.ios_worker_health from public,anon,authenticated,service_role;
create function private.manee_ios_record_worker(p_mode text,p_processed integer,p_failed integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 insert into private.ios_worker_health(mode,processed,failed) values(p_mode,p_processed,p_failed)
 on conflict(mode) do update set last_run_at=now(),processed=excluded.processed,failed=excluded.failed;
end $$;
create function public.manee_ios_record_worker(p_mode text,p_processed integer,p_failed integer) returns void
language sql security invoker set search_path='' as $$select private.manee_ios_record_worker(p_mode,p_processed,p_failed)$$;
create function private.manee_ios_claim_scheduled_deliveries() returns jsonb
language plpgsql security definer set search_path='' as $$
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
    where r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.ios_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.ios_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 50),
 claimed as (update private.ios_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.manee_ios_claim_scheduled_deliveries() returns jsonb
language sql security invoker set search_path='' as $$select private.manee_ios_claim_scheduled_deliveries()$$;
revoke all on function private.manee_ios_claim_scheduled_deliveries(),public.manee_ios_claim_scheduled_deliveries(),
 private.manee_ios_record_worker(text,integer,integer),public.manee_ios_record_worker(text,integer,integer) from public,anon,authenticated;
grant execute on function private.manee_ios_claim_scheduled_deliveries(),public.manee_ios_claim_scheduled_deliveries(),
 private.manee_ios_record_worker(text,integer,integer),public.manee_ios_record_worker(text,integer,integer) to service_role;
create or replace function private.manee_ios_claim_refresh() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service access denied' using errcode='42501';end if;
 with due as (select environment,original_id from private.ios_subscriptions
  where refresh_after<=now() and (refresh_lease_until is null or refresh_lease_until<=now())
  and (status in (1,3,4) or expires_at>now()-interval '1 day')
  order by refresh_after,environment,original_id for update skip locked limit 50),
 claimed as (update private.ios_subscriptions s set refresh_lease=gen_random_uuid(),refresh_lease_until=now()+interval '2 minutes'
  from due d where s.environment=d.environment and s.original_id=d.original_id
  returning s.environment,s.original_id,s.token,s.product_id,s.refresh_lease)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
