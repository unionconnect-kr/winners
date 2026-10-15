-- Run only on the selected Staging project. No customer JWT, no cron scheduling.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $rehearsal$
declare
 sid uuid:=gen_random_uuid();before_rows text;after_rows text;before_count bigint;
 removed integer;checks integer:=0;lo bigint:=-9223372036854775003;
begin
 if auth.uid() is not null then raise exception 'No customer session permitted';end if;
 if exists(select 1 from public.reservations where id between lo and lo+2) then raise exception 'Fixture ID collision';end if;
 if exists(select 1 from public.reservations where private.manee_reservation_retention_deadline(date,time)<=now()) then
  raise exception 'Existing due reservations: stop and choose an empty disposable environment';
 end if;
 select count(*),md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]'))
  into before_count,before_rows from public.reservations r;
 begin
  insert into public.stores(id,name) values(sid,'Synthetic retention rehearsal');
  insert into public.reservations(id,store_id,date,time,customer_name,phone,memo) overriding system value values
   (lo,sid,(now() at time zone 'Asia/Seoul')::date-10,'09:00','Synthetic expired','synthetic','synthetic'),
   (lo+1,sid,(now() at time zone 'Asia/Seoul')::date-1,'09:00','Synthetic recent','synthetic','synthetic'),
   (lo+2,sid,(now() at time zone 'Asia/Seoul')::date+1,'09:00','Synthetic future','synthetic','synthetic');
  removed:=private.manee_purge_expired_reservations(500);
  if removed<>1 or exists(select 1 from public.reservations where id=lo) then raise exception 'Expired fixture not erased exactly';end if;
  checks:=checks+1;
  if (select count(*) from public.reservations where id in(lo+1,lo+2) and phone='synthetic' and memo='synthetic')<>2 then
   raise exception 'Recent/future fixture changed';end if;
  checks:=checks+1;
  if exists(select 1 from private.android_push_deliveries where store_id=sid and kind='reservation_cancelled') then
   raise exception 'False cancellation notification queued';end if;
  checks:=checks+1;
  if private.manee_purge_expired_reservations(500)<>0 then raise exception 'Repeat purge was not empty';end if;
  checks:=checks+1;
  if exists(select 1 from unnest(array['anon','authenticated','service_role']) role_name
   where has_function_privilege(role_name,'private.manee_purge_expired_reservations(integer)','EXECUTE')) then
   raise exception 'Maintenance privilege exposed';end if;
  checks:=checks+1;
  raise exception 'Rollback disposable fixtures' using errcode='P4999';
 exception when sqlstate 'P4999' then null;
 end;
 select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]')) into after_rows from public.reservations r;
 if before_rows<>after_rows or (select count(*) from public.reservations)<>before_count
  or exists(select 1 from public.stores where id=sid)
  or exists(select 1 from private.android_push_deliveries where store_id=sid) then
  raise exception 'Fixtures or changes remained after rollback';
 end if;
 perform set_config('manee.retention_rehearsal',jsonb_build_object('checks_passed',checks,
  'original_reservations_unchanged',true,'all_fixtures_rolled_back',true,'cron_scheduled',false)::text,true);
end $rehearsal$;
select current_setting('manee.retention_rehearsal')::jsonb as retention_rehearsal;
rollback;
