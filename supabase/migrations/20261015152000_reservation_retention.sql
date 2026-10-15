begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Installation alone erases nothing. Scheduling is a separate reviewed action.
create index reservations_retention_date_id_idx on public.reservations(date,id);

create function private.manee_reservation_retention_deadline(p_date date,p_time text)
returns timestamptz language sql immutable parallel safe set search_path='' as $$
 select case
  when p_time is null or btrim(p_time)='' then
   ((p_date+1)::timestamp at time zone 'Asia/Seoul')+interval '168 hours'
  when btrim(p_time) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
   ((p_date+btrim(p_time)::time) at time zone 'Asia/Seoul')+interval '168 hours'
  else null -- malformed legacy times require private operator review
 end
$$;
revoke all on function private.manee_reservation_retention_deadline(date,text)
 from public,anon,authenticated,service_role;

-- Invoker privileges, no public RPC, no configurable clock or customer target.
-- Cron runs as the privileged operator with no customer JWT/session context.
create function private.manee_purge_expired_reservations(p_limit integer default 500)
returns integer language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if auth.uid() is not null then raise exception 'Maintenance requires no customer session' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 1000 then
  raise exception 'Invalid retention batch size' using errcode='22023';
 end if;
 with due as (
  select r.id from public.reservations r
   where r.date <= (now() at time zone 'Asia/Seoul')::date-7
    and private.manee_reservation_retention_deadline(r.date,r.time)<=now()
   order by r.date,r.id for update skip locked limit p_limit
 ), erased as (
  delete from public.reservations r using due where r.id=due.id returning r.id
 ) select count(*)::integer into removed from erased;
 return removed;
end $$;
revoke all on function private.manee_purge_expired_reservations(integer)
 from public,anon,authenticated,service_role;
commit;
