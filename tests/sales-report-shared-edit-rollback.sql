-- Run on a staging database with the migration applied. Every fixture, including
-- sessions and activity, is rolled back before any push worker can see it.
begin;
set local plpgsql.check_asserts=on;
create temp table sr_test_stores as select gen_random_uuid() as id, gen_random_uuid() as other;
create temp table sr_test_people as
select n, gen_random_uuid() as uid, gen_random_uuid() as session_id, gen_random_uuid() as crew_id
from generate_series(1,5) n;
grant select on sr_test_stores, sr_test_people to authenticated;
insert into auth.users(id) select uid from sr_test_people;
insert into auth.sessions(id,user_id) select session_id,uid from sr_test_people;
insert into public.profiles(user_id,username,display_name,status)
select uid,'salesqa'||left(replace(uid::text,'-',''),12),'테스트'||n,'active' from sr_test_people
on conflict(user_id) do update set display_name=excluded.display_name,status='active';
insert into public.stores(id,name,staff_join_code)
select id,'정산검증점',upper(left(replace(id::text,'-',''),8)) from sr_test_stores
union all select other,'별도검증점',upper(left(replace(other::text,'-',''),8)) from sr_test_stores;
insert into public.crew(id,store_id,name,is_manager)
select crew_id,case when n=5 then s.other else s.id end,'테스트'||n,n in (2,3,5)
from sr_test_people cross join sr_test_stores s where n>1;
insert into public.store_memberships(user_id,store_id,role,status,crew_id)
select uid,case when n=5 then s.other else s.id end,
       case when n=1 then 'owner' when n=4 then 'staff' else 'manager' end,'active',
       case when n>1 then crew_id end from sr_test_people cross join sr_test_stores s;
insert into private.manee_manager_permissions(crew_id,store_id,enabled,permissions)
select crew_id,case when n=5 then s.other else s.id end,true,'{"salesWrite":true,"view":"none"}'::jsonb
from sr_test_people cross join sr_test_stores s where n in (2,3,5)
on conflict(crew_id) do update set enabled=true,permissions=excluded.permissions;

-- Uncommitted tokens are never visible to the delivery workers.
insert into private.android_push_devices(token,user_id,session_id,store_id)
select 'qa:'||repeat(replace(uid::text,'-',''),5),uid,session_id,s.id
from sr_test_people cross join sr_test_stores s where n in (1,2);
insert into private.ios_push_devices(token,user_id,session_id,store_id)
select repeat(replace(uid::text,'-',''),2),uid,session_id,s.id
from sr_test_people cross join sr_test_stores s where n in (1,2);

create function pg_temp.sr_login(person integer) returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',uid,'session_id',session_id)::text,true)
  from sr_test_people where n=person;
$$;
create function pg_temp.sr_report(s uuid, d date, amount int) returns jsonb language sql as $$
  select jsonb_build_object('store_id',s,'date',d,'total_sales',amount,'card_sales',amount,
    'net_sales',amount,'cash_sales',0,'discount',0,'refund',0,'emoney_sales',0,'till',0,
    'delivery_baemin',0,'delivery_coupang',0,'delivery_yogiyo',0,'actual_cash',0,
    'expense',0,'card_expense',0,'bank_transfer',0,'cash_expense_items','[]'::jsonb,
    'bank_transfer_items','[]'::jsonb,'card_expense_items','[]'::jsonb,
    'settlement_photos','[]'::jsonb,'receipt_photos','[]'::jsonb,'note_photos','[]'::jsonb);
$$;
set local role authenticated;
do $test$
declare
  s uuid := (select id from sr_test_stores);
  today date := (now() at time zone 'Asia/Seoul')::date;
  d date := today-1;
  x jsonb;
  saved jsonb;
  last_ts timestamptz;
  initial_ts timestamptz;
  req uuid := gen_random_uuid();
  expected text;
begin
  perform pg_temp.sr_login(1);
  x := public.manee_sector3_save(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,10000));
  initial_ts := (x->'sales'->>'submitted_at')::timestamptz;
  assert initial_ts is not null, 'owner creation';
  assert jsonb_array_length(public.manee_owner_activity_read(s))=0, 'initial create must be silent';
  perform pg_temp.sr_login(2);
  assert (public.manee_authorize_service(s,'read-receipt')->>'allowed')::boolean, 'manager photo access';
  assert (select count(*) from public.sales_reports where store_id=s and date=d)=1, 'manager can read owner report';
  saved := public.manee_manager_save_sales(s,d,req,pg_temp.sr_report(s,d,13000),'[]',initial_ts);
  assert (saved->'sales'->>'total_sales')::int=13000 and saved->'sales'->>'crew_id' is null, 'legacy RPC edits owner report and preserves author';
  assert public.manee_manager_save_sales(s,d,req,pg_temp.sr_report(s,d,13000),'[]',initial_ts)=saved, 'retry is idempotent';
  last_ts := (saved->'sales'->>'submitted_at')::timestamptz;
  perform pg_temp.sr_login(3);
  begin
    perform public.manee_sector3_save(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,17000),'[]',initial_ts);
    raise exception 'stale edit was accepted';
  exception when raise_exception then
    if sqlerrm not like '%다른 기기%' then raise; end if;
  end;
  x := public.manee_sector3_save(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,13000)||'{"note":"","refund_reason":""}'::jsonb,'[]',last_ts);
  perform pg_temp.sr_login(2);
  x := public.manee_manager_save_sales(s,today,gen_random_uuid(),pg_temp.sr_report(s,today,1000));
  last_ts := (x->'sales'->>'submitted_at')::timestamptz;
  perform pg_temp.sr_login(3);
  saved := public.manee_sector3_save(s,today,gen_random_uuid(),pg_temp.sr_report(s,today,2000),'[]',last_ts);
  assert (saved->'sales'->>'crew_id')::uuid=(select crew_id from sr_test_people where n=2),'peer edit keeps author';
  last_ts := (saved->'sales'->>'submitted_at')::timestamptz;
  perform pg_temp.sr_login(1);
  perform public.manee_sector3_save(s,today,gen_random_uuid(),pg_temp.sr_report(s,today,3000),'[]',last_ts);
  expected := format('정산검증점 매장의 %s월%s일 매출 보고를 테스트2님이 수정하였습니다.',extract(month from d)::integer,to_char(d,'DD'));
  x := public.manee_owner_activity_read(s);
  assert jsonb_array_length(x)=3, 'only three content edits create events, including owner edits';
  assert exists(select from jsonb_array_elements(x) v where v->>'message'=expected),'exact owner inbox message';
  assert exists(select from jsonb_array_elements(x) v where v->>'message' like '%테스트3님이 수정하였습니다.'),'peer notification';
  assert exists(select from jsonb_array_elements(x) v where v->>'message' like '%테스트1님이 수정하였습니다.'),'owner notification';
  perform pg_temp.sr_login(4);
  assert not (public.manee_authorize_service(s,'read-receipt')->>'allowed')::boolean,'staff receipt scope';
  begin
    perform public.manee_manager_save_sales(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,2000));
    raise exception 'staff write was accepted';
  exception when insufficient_privilege then null; end;
  perform pg_temp.sr_login(5);
  assert (select count(*) from public.sales_reports where store_id=s)=0,'foreign store reports stay private';
  assert not (public.manee_authorize_service(s,'read-receipt')->>'allowed')::boolean,'foreign receipt scope';
  begin
    perform public.manee_manager_save_sales(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,2000));
    raise exception 'foreign write was accepted';
  exception when insufficient_privilege then null; end;
end;
$test$;
reset role;
do $test$
declare s uuid := (select id from sr_test_stores);
begin
  assert (select count(*) from private.android_push_deliveries where store_id=s)=3, 'one Android delivery per actual edit';
  assert (select count(*) from private.ios_push_deliveries where store_id=s)=3, 'one iOS delivery per actual edit';
  assert not exists(select from private.android_push_deliveries d join private.android_push_devices t using(token)
    join sr_test_people a on a.uid=t.user_id where d.store_id=s and a.n<>1), 'Android recipients are owners';
  assert not exists(select from private.ios_push_deliveries d join private.ios_push_devices t using(token)
    join sr_test_people a on a.uid=t.user_id where d.store_id=s and a.n<>1), 'iOS recipients are owners';
  assert (select count(*) from private.android_push_deliveries d join private.manee_owner_activity a
    on d.source_id=a.id::text and d.store_id=a.store_id where d.store_id=s and d.kind='notice')=3, 'delivery references the committed message';
end;
$test$;
insert into public.monthly_report_closings(store_id,month_key,revision,request_id,snapshot)
select id,to_char((now() at time zone 'Asia/Seoul')::date-1,'YYYY-MM'),1,gen_random_uuid(),'{}'::jsonb from sr_test_stores;
set local role authenticated;
do $test$
declare s uuid := (select id from sr_test_stores); d date := (now() at time zone 'Asia/Seoul')::date-1;
begin
  perform pg_temp.sr_login(2);
  begin
    perform public.manee_manager_save_sales(s,d,gen_random_uuid(),pg_temp.sr_report(s,d,13000));
    raise exception 'closed month was writable by manager';
  exception when insufficient_privilege then
    if sqlerrm not like '%마감된 월%' then raise; end if;
  end;
end;
$test$;
reset role;
rollback;
