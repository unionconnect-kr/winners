-- Minimal routing context from committed source records; no customer or financial details.
begin;
create or replace function private.claim_android_deliveries(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
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
    where r.store_id=d.store_id and r.id::text=d.source_id
    and d.kind||':'||r.id::text||':'||r.date::text||':'||r.time=d.event_key)));
 update private.android_push_deliveries set status='failed',finished_at=now()
  where status='pending' and attempts>=4 and (lease_until is null or lease_until<=now());
 with candidates as (select id from private.android_push_deliveries where status='pending'
  and attempts<4 and available_at<=now() and (lease_until is null or lease_until<=now())
  order by available_at,id for update skip locked limit 10),
 claimed as (update private.android_push_deliveries d set attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
