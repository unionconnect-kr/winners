begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.attendance add column pay_approval_required boolean not null default false, add column pay_check_in time, add column pay_check_out time, add column pay_confirmed_by uuid references auth.users(id) on delete set null, add column pay_confirmed_at timestamptz;
alter table public.attendance add constraint manee_pay_half_hours check ((pay_check_in is null and pay_check_out is null) or (pay_check_in is not null and pay_check_out is not null and extract(second from pay_check_in)=0 and extract(second from pay_check_out)=0 and extract(minute from pay_check_in) in (0,30) and extract(minute from pay_check_out) in (0,30) and pay_check_in<>pay_check_out));
alter table public.monthly_net_payroll add column needs_reconfirmation boolean not null default false;
create table private.manee_owner_activity(
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,crew_id uuid references public.crew(id) on delete set null,
 kind text not null,month_key text,event_date date,message text not null check(length(message)<=1000),
 before_values jsonb,after_values jsonb,created_at timestamptz not null default now());
alter table private.manee_owner_activity enable row level security;
revoke all on private.manee_owner_activity from public,anon,authenticated,service_role;
create index manee_owner_activity_store_created on private.manee_owner_activity(store_id,created_at desc);
create function private.manee_add_activity(p_store uuid,p_crew uuid,p_kind text,p_month text,p_date date,p_message text,p_before jsonb,p_after jsonb) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
 insert into private.manee_owner_activity(store_id,actor_id,crew_id,kind,month_key,event_date,message,before_values,after_values)
 values(p_store,auth.uid(),p_crew,p_kind,p_month,p_date,left(p_message,1000),p_before,p_after) returning id into eid;
 insert into private.android_push_deliveries(event_key,source_id,kind,store_id,token,expires_at)
 select 'owner_activity:'||eid,eid::text,'notice',p_store,t.token,now()+interval '2 hours' from private.manee_android_push_targets(p_store) t on conflict(event_key,token) do nothing;
 insert into private.ios_push_deliveries(event_key,source_id,kind,store_id,token,expires_at)
 select 'owner_activity:'||eid,eid::text,'notice',p_store,t.token,now()+interval '2 hours' from private.manee_ios_push_targets(p_store) t on conflict(event_key,token) do nothing;
end $$;
revoke all on function private.manee_add_activity(uuid,uuid,text,text,date,text,jsonb,jsonb) from public,anon,authenticated,service_role;
alter table private.android_push_deliveries drop constraint android_push_deliveries_kind_check;
alter table private.android_push_deliveries add constraint android_push_deliveries_kind_check check(kind in ('attendance_in','attendance_out','reservation_created','reservation_cancelled','reservation_upcoming','reservation_due','report_closed','monthly_costs','notice'));
alter table private.ios_push_deliveries drop constraint ios_push_deliveries_kind_check;
alter table private.ios_push_deliveries add constraint ios_push_deliveries_kind_check check(kind in ('attendance_in','attendance_out','reservation_created','reservation_cancelled','reservation_upcoming','reservation_due','report_closed','monthly_costs','notice'));
create function private.manee_owner_activity_read(p_store uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_live_manee_session() or not private.has_store_membership(p_store,array['owner']) then raise exception '사장님만 확인할 수 있어요.' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]') from (select id,kind,month_key,event_date,message,created_at from private.manee_owner_activity where store_id=p_store order by created_at desc,id limit 100) r);
end $$;
create function public.manee_owner_activity_read(p_store uuid) returns jsonb language sql security invoker set search_path='' as $$select private.manee_owner_activity_read(p_store)$$;
revoke all on function private.manee_owner_activity_read(uuid),public.manee_owner_activity_read(uuid) from public,anon;
grant execute on function private.manee_owner_activity_read(uuid),public.manee_owner_activity_read(uuid) to authenticated;

create function private.manee_manager_work(p_store uuid,p_date date,p_action text default 'list',p_att uuid default null,p_start text default null,p_end text default null,p_previous jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attendance; expected jsonb;
begin
 if not private.is_live_manee_session() or not (private.has_store_membership(p_store,array['owner']) or private.manee_manager_cap(p_store,'salesWrite')) then raise exception '근무 확인 권한이 없어요.' using errcode='42501';end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Seoul')::date or p_action not in ('list','confirm') then raise exception '근무일을 확인해 주세요.' using errcode='22023';end if;
 if p_action='confirm' then
  if not private.manee_store_write_entitled(p_store) then raise exception '매니 구독을 확인해 주세요.' using errcode='P4402';end if;
  if p_start is null or p_end is null or p_start !~ '^([01][0-9]|2[0-3]):(00|30)$' or p_end !~ '^([01][0-9]|2[0-3]):(00|30)$' or p_start=p_end then raise exception '급여 적용 시간을 30분 단위로 선택해 주세요. 예: 09:00, 09:30' using errcode='22023';end if;
  select * into a from public.attendance where id=p_att and store_id=p_store and date=p_date for update;
  if a.id is null or a.check_out is null then raise exception '퇴근한 직원의 근무를 선택해 주세요.' using errcode='22023';end if;
  expected:=jsonb_build_object('check_in',a.check_in,'check_out',a.check_out,'confirmed',a.confirmed,'pay_check_in',a.pay_check_in,'pay_check_out',a.pay_check_out);
  if expected is distinct from p_previous then raise exception '근무 기록이 변경됐어요. 다시 확인해 주세요.' using errcode='40001';end if;
  if a.confirmed and a.pay_check_in=p_start::time and a.pay_check_out=p_end::time then return jsonb_build_object('ok',true);end if;
  update public.attendance set pay_approval_required=true,pay_check_in=p_start::time,pay_check_out=p_end::time,confirmed=true,pay_confirmed_by=auth.uid(),pay_confirmed_at=clock_timestamp() where id=a.id;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',ar.id,'crew_id',ar.crew_id,'name',c.name,'date',ar.date,'check_in',ar.check_in,'check_out',ar.check_out,'confirmed',ar.confirmed,'pay_check_in',ar.pay_check_in,'pay_check_out',ar.pay_check_out) order by ar.check_in,ar.id),'[]') from public.attendance ar join public.crew c on c.id=ar.crew_id and c.store_id=ar.store_id where ar.store_id=p_store and ar.date=p_date and ar.check_out is not null);
end $$;
create function public.manee_manager_work(p_store uuid,p_date date,p_action text default 'list',p_att uuid default null,p_start text default null,p_end text default null,p_previous jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select private.manee_manager_work(p_store,p_date,p_action,p_att,p_start,p_end,p_previous)$$;
revoke all on function private.manee_manager_work(uuid,date,text,uuid,text,text,jsonb),public.manee_manager_work(uuid,date,text,uuid,text,text,jsonb) from public,anon;
grant execute on function private.manee_manager_work(uuid,date,text,uuid,text,text,jsonb),public.manee_manager_work(uuid,date,text,uuid,text,text,jsonb) to authenticated;

create function private.manee_pay_change_event() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;cid uuid;mo text;employee text;actor text;before_j jsonb;after_j jsonb;change_text text;rec record;labels jsonb:='{"wage":"급여 금액","wage_type":"급여 방식","tax33":"3.3% 원천징수","insurance4":"4대보험","insurance2":"2대보험","weekly_allowance":"주휴수당","probation":"수습 적용"}';
begin
 if tg_table_name='crew' then
  before_j:=jsonb_build_object('wage',old.wage,'wage_type',old.wage_type,'tax33',old.tax33,'insurance4',old.insurance4,'insurance2',old.insurance2,'weekly_allowance',old.weekly_allowance,'probation',old.probation);
  after_j:=jsonb_build_object('wage',new.wage,'wage_type',new.wage_type,'tax33',new.tax33,'insurance4',new.insurance4,'insurance2',new.insurance2,'weekly_allowance',new.weekly_allowance,'probation',new.probation);
  if before_j=after_j then return new;end if;sid:=new.store_id;cid:=new.id;
  update public.monthly_net_payroll set needs_reconfirmation=true where store_id=sid and crew_id=cid and not needs_reconfirmation;
  select string_agg((labels->>key)||' '||coalesce(before_j->>key,'없음')||' → '||value,', ' order by key) into change_text from jsonb_each_text(after_j) where before_j->>key is distinct from value;
  mo:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM');
 else
  before_j:=case when tg_op='INSERT' then null else to_jsonb(old) end;after_j:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  if tg_op='UPDATE' and (before_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation')=(after_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation') then return new;end if;
  sid:=coalesce(new.store_id,old.store_id);cid:=coalesce(new.crew_id,old.crew_id);mo:=coalesce(new.month_key,old.month_key);
  change_text:=case when tg_table_name='monthly_net_payroll' then '최종 세후급여 '||coalesce(before_j->>'net_pay','미확정')||'원 → '||coalesce(after_j->>'net_pay','삭제')||'원 · 지급일 '||coalesce(after_j->>'paid_on','미입력') else coalesce(after_j->>'type',before_j->>'type')||' '||coalesce(before_j->>'amount','없음')||'원 → '||coalesce(after_j->>'amount','삭제')||'원' end;
 end if;
 if auth.uid() is not null and private.has_store_membership(sid,array['staff','manager']) and not private.has_store_membership(sid,array['owner']) then
  select name into employee from public.crew where id=cid;select coalesce(nullif(display_name,''),username) into actor from public.profiles where user_id=auth.uid();
  perform private.manee_add_activity(sid,cid,'pay_change',mo,null,coalesce(employee,'직원')||'님의 '||change_text||' · 매니저 '||coalesce(actor,'확인 필요')||'님이 변경했습니다.',before_j,after_j);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.manee_pay_change_event() from public,anon,authenticated,service_role;
create trigger manee_wage_change after update on public.crew for each row execute function private.manee_pay_change_event();
create trigger manee_payroll_change_notice after insert or update or delete on public.monthly_net_payroll for each row execute function private.manee_pay_change_event();
create trigger manee_adjustment_change_notice after insert or update or delete on public.crew_pay_adjustments for each row execute function private.manee_pay_change_event();

create function private.manee_guard_pay_attendance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.pay_approval_required then new.pay_approval_required:=true;end if;
 if tg_op='UPDATE' and row(new.check_in,new.check_out) is distinct from row(old.check_in,old.check_out) then
  new.confirmed:=false;new.pay_check_in:=null;new.pay_check_out:=null;new.pay_confirmed_by:=null;new.pay_confirmed_at:=null;
 elsif new.confirmed and (new.pay_approval_required or new.pay_check_in is not null or new.pay_check_out is not null) and (tg_op='INSERT' or not old.confirmed or row(new.pay_check_in,new.pay_check_out) is distinct from row(old.pay_check_in,old.pay_check_out)) then
  if new.pay_check_in is null or new.pay_check_out is null then raise exception '급여 적용 시간을 30분 단위로 지정한 뒤 근무를 확인해 주세요.' using errcode='22023';end if;
  if not (private.has_store_membership(new.store_id,array['owner']) or private.manee_manager_cap(new.store_id,'salesWrite')) then raise exception '근무 확인 권한이 없어요.' using errcode='42501';end if;
  new.pay_confirmed_by:=auth.uid();new.pay_confirmed_at:=clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function private.manee_guard_pay_attendance() from public,anon,authenticated,service_role;
create trigger manee_pay_attendance_guard before insert or update on public.attendance for each row execute function private.manee_guard_pay_attendance();
create function private.manee_attendance_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare employee text;actor text;
begin
 if row(new.confirmed,new.check_in,new.check_out,new.pay_check_in,new.pay_check_out) is not distinct from row(old.confirmed,old.check_in,old.check_out,old.pay_check_in,old.pay_check_out) then return new;end if;
 update public.monthly_net_payroll set needs_reconfirmation=true where store_id=new.store_id and crew_id=new.crew_id and month_key=to_char(new.date,'YYYY-MM') and not needs_reconfirmation;
 if new.confirmed and (not old.confirmed or row(new.pay_check_in,new.pay_check_out) is distinct from row(old.pay_check_in,old.pay_check_out)) and private.manee_manager_cap(new.store_id,'salesWrite') and not private.has_store_membership(new.store_id,array['owner']) then
  select name into employee from public.crew where id=new.crew_id;select coalesce(nullif(display_name,''),username) into actor from public.profiles where user_id=auth.uid();
  perform private.manee_add_activity(new.store_id,new.crew_id,'work_confirm',to_char(new.date,'YYYY-MM'),new.date,coalesce(actor,'매니저')||'님이 '||coalesce(employee,'직원')||'님의 '||new.date||' 근무를 확인했습니다. 실제 '||to_char(new.check_in,'HH24:MI')||'~'||to_char(new.check_out,'HH24:MI')||', 급여 적용 '||to_char(new.pay_check_in,'HH24:MI')||'~'||to_char(new.pay_check_out,'HH24:MI'),to_jsonb(old),to_jsonb(new));
 end if;return new;
end $$;
revoke all on function private.manee_attendance_activity() from public,anon,authenticated,service_role;
create trigger manee_work_confirm_notice after update on public.attendance for each row execute function private.manee_attendance_activity();

CREATE OR REPLACE FUNCTION private.guard_monthly_net_payroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='UPDATE' and new.needs_reconfirmation and not old.needs_reconfirmation and (to_jsonb(new)-'needs_reconfirmation')=(to_jsonb(old)-'needs_reconfirmation') then
    new.adjustment_snapshot:='["근무 또는 급여조건 변경: 재확인 필요"]'::jsonb;return new;
  end if;
  new.needs_reconfirmation:=false;
  if tg_op='UPDATE' and (old.id<>new.id or old.store_id<>new.store_id or old.crew_id<>new.crew_id or old.month_key<>new.month_key) then
    raise exception 'Payroll identity cannot change' using errcode='42501'; end if;
  if not exists(select 1 from public.crew where id=new.crew_id and store_id=new.store_id) then
    raise exception 'Employee does not belong to store' using errcode='42501'; end if;
  if new.paid_on>(now() at time zone 'Asia/Seoul')::date then raise exception 'Payment date must already have occurred' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_array(a.id::text,a.type,a.amount,a.unpaid_date::text) order by a.id::text),'[]'::jsonb)
    into new.adjustment_snapshot from public.crew_pay_adjustments a
    where a.store_id=new.store_id and a.crew_id=new.crew_id and a.month_key=new.month_key and a.type<>'가불';
  new.updated_at:=clock_timestamp();new.confirmed_by:=auth.uid();
  return new;
end;
$function$
;
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
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,(select left(a.message,300) from private.manee_owner_activity a where d.kind='notice' and a.id::text=d.source_id and a.store_id=d.store_id) as message,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$
;
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
  from candidates c where d.id=c.id returning d.id,d.lease_id,d.token,d.store_id,d.kind,d.expires_at,(select left(a.message,300) from private.manee_owner_activity a where d.kind='notice' and a.id::text=d.source_id and a.store_id=d.store_id) as message,
   case when d.kind='monthly_costs' then d.source_id
    when d.kind='report_closed' then (select c.month_key from public.monthly_report_closings c where c.id::text=d.source_id and c.store_id=d.store_id) end as month_key,
   case when d.kind in ('attendance_in','attendance_out') then
    (select a.date::text from public.attendance a where a.id::text=d.source_id and a.store_id=d.store_id) end as event_date)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION private.manee_manager_portal(p_store_id uuid, p_month_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.manee_manager_permissions; c_id uuid; result jsonb; gross numeric;food numeric;invalid integer;pay jsonb;first_day date;last_day date;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,array['staff','manager']::text[]) then raise exception '직원 연결을 확인해 주세요.' using errcode='42501';end if;
 if p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '조회 월을 확인해 주세요.' using errcode='22023';end if;
 c_id:=private.current_crew_id(p_store_id);select * into p from private.manee_manager_permissions where crew_id=c_id and store_id=p_store_id;
 if p.crew_id is null then
  return jsonb_build_object('configured',false,'enabled',false,'permissions',private.manee_manager_normalize('{"view":"none"}'),'month_key',p_month_key);
 end if;
 result:=jsonb_build_object('configured',true,'enabled',p.enabled,'permissions',p.permissions,'revision',p.revision,'month_key',p_month_key,'ratios',null);
 if not p.enabled then return result;end if;
 first_day:=(p_month_key||'-01')::date;last_day:=(first_day+interval '1 month')::date;
 if private.manee_manager_cap(p_store_id,'ratios') then
  select coalesce(sum(total_sales),0),count(*) filter(where total_sales<0 or discount<0 or refund<0) into gross,invalid from public.sales_reports where store_id=p_store_id and date>=first_day and date<last_day;
  select coalesce(sum(amount),0) into food from public.expense_entries where store_id=p_store_id and date>=first_day and date<last_day and category in('food','beverage');
  pay:=private.net_payroll_totals(p_store_id,p_month_key,(now() at time zone 'Asia/Seoul')::date);
  result:=result||jsonb_build_object('ratios',jsonb_build_object('food',case when gross>0 and invalid=0 then food/gross*100 end,'labor',case when gross>0 and invalid=0 then (pay->>'net_pay')::numeric/gross*100 end),'payroll_estimated',(pay->>'estimated_count')::integer>0);
  if private.manee_manager_cap(p_store_id,'viewSales') then result:=result||jsonb_build_object('sales_total',case when invalid=0 then gross end);end if;
 end if;
 if private.manee_manager_cap(p_store_id,'wage') or private.manee_manager_cap(p_store_id,'payroll') then
  result:=result||jsonb_build_object('crew',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'position',c.position,'wage',c.wage,'wage_type',c.wage_type,'hire_date',c.hire_date,'resign_date',c.resign_date,'is_manager',c.is_manager,'employment_setup_required',c.employment_setup_required,'tax33',c.tax33,'insurance4',c.insurance4,'insurance2',c.insurance2,'weekly_allowance',c.weekly_allowance,'probation',c.probation) order by c.name),'[]'::jsonb) from public.crew c where c.store_id=p_store_id));
 end if;
 if private.manee_manager_cap(p_store_id,'payroll') then
  result:=result||jsonb_build_object('payroll',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.monthly_net_payroll r where store_id=p_store_id and month_key=p_month_key),'adjustments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb) from public.crew_pay_adjustments r where store_id=p_store_id and month_key=p_month_key));
 end if;
 if private.manee_manager_cap(p_store_id,'reportView') then result:=result||jsonb_build_object('report',private.manee_report_preview(p_store_id,p_month_key),'review',private.manee_manager_review(p_store_id,p_month_key,'get'),'last_closing',(select jsonb_build_object('revision',r.revision,'closed_at',r.closed_at) from public.monthly_report_closings r where r.store_id=p_store_id and r.month_key=p_month_key order by r.revision desc limit 1));end if;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.manee_manager_write(p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid, p_payload jsonb, p_previous jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew; r public.monthly_net_payroll; a public.crew_pay_adjustments; amount bigint;d date;rid uuid;
begin
 if auth.uid() is null or not private.is_live_manee_session() or not private.manee_manager_cap(p_store_id,case when p_action='wage' then 'wage' else 'payroll' end) then raise exception '허용된 관리 권한이 없어요.' using errcode='42501';end if;
 if p_action not in('wage','payroll','adjustment') or p_action is null or p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '저장 내용을 확인해 주세요.' using errcode='22023';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 select * into c from public.crew where id=p_crew_id and store_id=p_store_id for update;
 if c.id is not null and c.resign_date is not null and c.resign_date<=(now() at time zone 'Asia/Seoul')::date then raise exception '퇴사자 정산은 사장님의 퇴사자관리에서 처리해 주세요.' using errcode='42501';end if;
 if c.id is null then raise exception '이 매장의 직원을 선택해 주세요.' using errcode='42501';end if;
 if p_action='wage' then
  if jsonb_build_object('wage',c.wage,'wage_type',c.wage_type) is distinct from p_previous then raise exception '급여 조건이 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if coalesce(p_payload->>'wage','') !~ '^[0-9]+$' or coalesce(p_payload->>'wage_type','') not in('hourly','monthly') then raise exception '급여 금액과 방식을 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'wage')::bigint;if amount<1 or amount>2147483647 then raise exception '급여 금액 범위를 확인해 주세요.' using errcode='22023';end if;
  update public.crew set wage=amount::integer,wage_type=p_payload->>'wage_type',employment_setup_required=false where id=c.id;
 elsif p_action='payroll' then
  select * into r from public.monthly_net_payroll where store_id=p_store_id and crew_id=c.id and month_key=p_month_key for update;
  if coalesce(p_previous->>'updated_at','') is distinct from coalesce(to_jsonb(r)->>'updated_at','') then raise exception '급여가 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if coalesce(p_payload->>'net_pay','') !~ '^[0-9]+$' then raise exception '실제 세후급여를 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'net_pay')::bigint;d:=nullif(p_payload->>'paid_on','')::date;
  if amount<0 or amount>2147483647 or d>(now() at time zone 'Asia/Seoul')::date then raise exception '급여 금액·지급일을 확인해 주세요.' using errcode='22023';end if;
  insert into public.monthly_net_payroll(store_id,crew_id,month_key,net_pay,paid_on) values(p_store_id,c.id,p_month_key,amount::integer,d)
   on conflict(store_id,crew_id,month_key) do update set net_pay=excluded.net_pay,paid_on=excluded.paid_on;
 else
  rid:=(p_payload->>'id')::uuid;d:=(p_payload->>'date')::date;
  if rid is null or d is null or to_char(d,'YYYY-MM')<>p_month_key or d>(now() at time zone 'Asia/Seoul')::date or coalesce(p_payload->>'amount','') !~ '^-?[0-9]+$' or coalesce(p_payload->>'type','') not in('가불','기타') or length(trim(coalesce(p_payload->>'note',''))) not between 1 and 1000 then raise exception '조정 금액·날짜·사유를 확인해 주세요.' using errcode='22023';end if;
  amount:=(p_payload->>'amount')::bigint;if amount=0 or abs(amount)>2147483647 or (p_payload->>'type'='가불' and amount>=0) then raise exception '조정 방향과 금액을 확인해 주세요.' using errcode='22023';end if;
  select * into a from public.crew_pay_adjustments where id=rid;
  if a.id is not null then
   if a.store_id<>p_store_id or a.crew_id<>c.id or a.month_key<>p_month_key or a.amount<>amount or a.type<>p_payload->>'type' or a.note<>trim(p_payload->>'note') or a.adjustment_date<>d then raise exception '동일 요청의 내용이 변경됐어요.' using errcode='40001';end if;
  else insert into public.crew_pay_adjustments(id,store_id,crew_id,month_key,type,amount,note,adjustment_date) values(rid,p_store_id,c.id,p_month_key,p_payload->>'type',amount::integer,trim(p_payload->>'note'),d);end if;
 end if;
 return jsonb_build_object('ok',true);
end $function$
;
create function private.manee_manager_write_v2(p_store_id uuid,p_month_key text,p_action text,p_crew_id uuid,p_payload jsonb,p_previous jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.crew; old_values jsonb; k text;amount bigint;
begin
 if p_action is null then raise exception '저장 내용을 확인해 주세요.' using errcode='22023';end if;
 if p_action<>'wage' then return private.manee_manager_write(p_store_id,p_month_key,p_action,p_crew_id,p_payload,p_previous);end if;
 if not private.is_live_manee_session() or not private.manee_manager_cap(p_store_id,'wage') then raise exception '허용된 관리 권한이 없어요.' using errcode='42501';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매니 구독을 확인해 주세요.' using errcode='P4402';end if;
 select * into c from public.crew where id=p_crew_id and store_id=p_store_id for update;
 if c.id is null then raise exception '이 매장의 직원을 선택해 주세요.' using errcode='42501';end if;
 if c.resign_date is not null and c.resign_date<=(now() at time zone 'Asia/Seoul')::date then raise exception '퇴사자 정산은 사장님의 퇴사자관리에서 처리해 주세요.' using errcode='42501';end if;
 old_values:=jsonb_build_object('wage',c.wage,'wage_type',c.wage_type,'tax33',c.tax33,'insurance4',c.insurance4,'insurance2',c.insurance2,'weekly_allowance',c.weekly_allowance,'probation',c.probation);
 if old_values is distinct from p_previous then raise exception '급여 조건이 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or coalesce(p_payload->>'wage','') !~ '^[0-9]+$' or coalesce(p_payload->>'wage_type','') not in ('hourly','monthly') then raise exception '급여 금액과 방식을 확인해 주세요.' using errcode='22023';end if;
 foreach k in array array['tax33','insurance4','insurance2','weekly_allowance','probation'] loop
  if jsonb_typeof(p_payload->k) is distinct from 'boolean' then raise exception '공제·보험 설정을 확인해 주세요.' using errcode='22023';end if;
 end loop;
 if ((p_payload->>'tax33')::boolean)::int+((p_payload->>'insurance4')::boolean)::int+((p_payload->>'insurance2')::boolean)::int>1 then raise exception '3.3%%·4대보험·2대보험 중 적용할 방식을 하나만 선택해 주세요.' using errcode='22023';end if;
 amount:=(p_payload->>'wage')::bigint;if amount<1 or amount>2147483647 then raise exception '급여 금액을 확인해 주세요.' using errcode='22023';end if;
 update public.crew set wage=amount::int,wage_type=p_payload->>'wage_type',tax33=(p_payload->>'tax33')::boolean,insurance4=(p_payload->>'insurance4')::boolean,insurance2=(p_payload->>'insurance2')::boolean,weekly_allowance=(p_payload->>'weekly_allowance')::boolean,probation=(p_payload->>'probation')::boolean,employment_setup_required=false where id=c.id;
 return jsonb_build_object('ok',true);
end $$;
create function public.manee_manager_write_v2(p_store_id uuid,p_month_key text,p_action text,p_crew_id uuid,p_payload jsonb,p_previous jsonb default null) returns jsonb language sql security invoker set search_path='' as $$select private.manee_manager_write_v2(p_store_id,p_month_key,p_action,p_crew_id,p_payload,p_previous)$$;
revoke all on function private.manee_manager_write_v2(uuid,text,text,uuid,jsonb,jsonb),public.manee_manager_write_v2(uuid,text,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function private.manee_manager_write_v2(uuid,text,text,uuid,jsonb,jsonb),public.manee_manager_write_v2(uuid,text,text,uuid,jsonb,jsonb) to authenticated;

create table private.manee_client_versions(
 user_id uuid not null references auth.users(id) on delete cascade,installation_id uuid not null,
 platform text not null check(platform in ('android','ios')),version text not null check(version ~ '^\d+(\.\d+){0,3}$'),build text not null check(build ~ '^\d+(\.\d+){0,3}$'),
 last_seen_at timestamptz not null default now(),primary key(user_id,installation_id));
alter table private.manee_client_versions enable row level security;
revoke all on private.manee_client_versions from public,anon,authenticated,service_role;
create index manee_client_versions_seen on private.manee_client_versions(last_seen_at desc);
create function private.manee_report_client_version(p_installation uuid,p_platform text,p_version text,p_build text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_live_manee_session() then raise exception '로그인을 확인해 주세요.' using errcode='42501';end if;
 if p_installation is null or p_platform is null or p_platform not in ('android','ios') or p_version is null or p_build is null or length(p_version)>40 or length(p_build)>40 or p_version !~ '^\d+(\.\d+){0,3}$' or p_build !~ '^\d+(\.\d+){0,3}$' then raise exception '앱 버전을 확인해 주세요.' using errcode='22023';end if;
 insert into private.manee_client_versions(user_id,installation_id,platform,version,build) values(auth.uid(),p_installation,p_platform,p_version,p_build)
 on conflict(user_id,installation_id) do update set platform=excluded.platform,version=excluded.version,build=excluded.build,last_seen_at=now();
 delete from private.manee_client_versions where user_id=auth.uid() and installation_id in (select installation_id from private.manee_client_versions where user_id=auth.uid() order by last_seen_at desc,installation_id offset 30);
 return true;
end $$;
create function public.manee_report_client_version(p_installation uuid,p_platform text,p_version text,p_build text) returns boolean language sql security invoker set search_path='' as $$select private.manee_report_client_version(p_installation,p_platform,p_version,p_build)$$;
revoke all on function private.manee_report_client_version(uuid,text,text,text),public.manee_report_client_version(uuid,text,text,text) from public,anon;
grant execute on function private.manee_report_client_version(uuid,text,text,text),public.manee_report_client_version(uuid,text,text,text) to authenticated;
create function private.manee_hq_client_versions() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_live_manee_session() or not private.has_platform_role(array['super_admin','admin','support','read_only']) then raise exception 'HQ 접근 권한이 없어요.' using errcode='42501';end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select p.user_id,p.username,p.display_name,v.installation_id,v.platform,v.version,v.build,v.last_seen_at from public.profiles p left join private.manee_client_versions v on v.user_id=p.user_id where p.status='active' order by v.last_seen_at desc nulls last,p.username,v.installation_id limit 10000) r),'releases',(select coalesce(jsonb_object_agg(platform,jsonb_build_object('version',available_version,'build',available_build)),'{}') from public.manee_mobile_update_policy),'limit',10000);
end $$;
create function public.manee_hq_client_versions() returns jsonb language sql security invoker set search_path='' as $$select private.manee_hq_client_versions()$$;
revoke all on function private.manee_hq_client_versions(),public.manee_hq_client_versions() from public,anon;
grant execute on function private.manee_hq_client_versions(),public.manee_hq_client_versions() to authenticated;
CREATE OR REPLACE FUNCTION private.net_payroll_totals(p_store uuid, p_month text, p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.crew%rowtype; r public.monthly_net_payroll%rowtype; start_day date:=to_date(p_month||'-01','YYYY-MM-DD'); end_day date; employed integer; hours numeric; confirmed_shifts integer; gross bigint; net bigint; rate numeric; snapshot jsonb; adjustments bigint; total bigint:=0; unknown integer:=0; estimated integer:=0; v_confirmed integer:=0; contributors integer:=0;
begin
 end_day:=(start_day+interval '1 month - 1 day')::date;
 for c in select * from public.crew where store_id=p_store loop
  employed:=0; hours:=0; confirmed_shifts:=0;
  select * into r from public.monthly_net_payroll where store_id=p_store and crew_id=c.id and month_key=p_month;
  select coalesce(jsonb_agg(jsonb_build_array(a.id::text,a.type,a.amount,a.unpaid_date::text) order by a.id::text),'[]'::jsonb),coalesce(sum(a.amount) filter(where a.unpaid_date is null or a.unpaid_date<=p_today),0)
   into snapshot,adjustments from public.crew_pay_adjustments a where a.store_id=p_store and a.crew_id=c.id and a.month_key=p_month and a.type<>'가불';
  if r.id is not null then
   if r.adjustment_snapshot=snapshot then
     total:=total+r.net_pay;v_confirmed:=v_confirmed+1;
     if r.net_pay>0 then contributors:=contributors+1;end if;
   else unknown:=unknown+1;end if;
   continue;
  end if;
  if c.employment_setup_required then unknown:=unknown+1;continue;end if;
  if c.wage_type='monthly' then
   employed:=greatest(0,least(end_day,p_today,coalesce(c.resign_date,end_day))-greatest(start_day,coalesce(c.hire_date,start_day))+1);
   gross:=round(c.wage::numeric/extract(day from end_day)*employed);
  else
   select coalesce(sum(floor(extract(epoch from case when coalesce(pay_check_out,check_out)<coalesce(pay_check_in,check_in) then coalesce(pay_check_out,check_out)-coalesce(pay_check_in,check_in)+interval '24 hours' else coalesce(pay_check_out,check_out)-coalesce(pay_check_in,check_in) end)/1800)/2),0),count(*)
     into hours,confirmed_shifts from public.attendance where store_id=p_store and crew_id=c.id and date between start_day and end_day and confirmed and check_out is not null;
   gross:=round(hours*c.wage);
  end if;
  if c.probation then gross:=round(gross*0.9);end if;
  rate:=case when c.insurance4 then 0.097 when c.insurance2 then 0.009 when c.tax33 then 0.033 else 0 end;
  net:=gross-round(gross*rate)+adjustments;
  if net<0 or c.wage<=0 and ((c.wage_type='monthly' and employed>0) or (c.wage_type<>'monthly' and confirmed_shifts>0)) then unknown:=unknown+1;else
    total:=total+net;estimated:=estimated+1;
    if net>0 then contributors:=contributors+1;end if;
  end if;
 end loop;
 return jsonb_build_object('net_pay',case when unknown>0 then null else total end,'unknown_count',unknown,'estimated_count',estimated,'confirmed_count',v_confirmed,'positive_count',contributors);
end $function$

;
-- Availability metadata only: mandatory-update enabled flags remain untouched.
update public.manee_mobile_update_policy set available_version='1.62',available_build='63' where platform='android';
update public.manee_mobile_update_policy set available_version='1.57',available_build='157.8.1' where platform='ios';
notify pgrst,'reload schema';
commit;
