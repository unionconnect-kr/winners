begin;
set local lock_timeout='5s';
create or replace function private.manee_manager_work(p_store uuid,p_date date,p_action text default 'list',p_att uuid default null,p_start text default null,p_end text default null,p_previous jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not (a.confirmed and a.pay_check_in is not distinct from p_start::time and a.pay_check_out is not distinct from p_end::time) then
  update public.attendance set pay_approval_required=true,pay_check_in=p_start::time,pay_check_out=p_end::time,confirmed=true,pay_confirmed_by=auth.uid(),pay_confirmed_at=clock_timestamp() where id=a.id;
  end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',ar.id,'crew_id',ar.crew_id,'name',c.name,'date',ar.date,'check_in',ar.check_in,'check_out',ar.check_out,'confirmed',ar.confirmed,'pay_check_in',ar.pay_check_in,'pay_check_out',ar.pay_check_out) order by ar.check_in,ar.id),'[]') from public.attendance ar join public.crew c on c.id=ar.crew_id and c.store_id=ar.store_id where ar.store_id=p_store and ar.date=p_date and ar.check_out is not null);
end $$;
create or replace function private.manee_pay_change_event() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;cid uuid;mo text;employee text;actor text;before_j jsonb;after_j jsonb;change_text text;rec record;labels jsonb:='{"wage":"급여 금액","wage_type":"급여 방식","tax33":"3.3% 원천징수","insurance4":"4대보험","insurance2":"2대보험","weekly_allowance":"주휴수당","probation":"수습 적용"}';
begin
 if tg_table_name='crew' then
  before_j:=jsonb_build_object('wage',old.wage,'wage_type',old.wage_type,'tax33',old.tax33,'insurance4',old.insurance4,'insurance2',old.insurance2,'weekly_allowance',old.weekly_allowance,'probation',old.probation);
  after_j:=jsonb_build_object('wage',new.wage,'wage_type',new.wage_type,'tax33',new.tax33,'insurance4',new.insurance4,'insurance2',new.insurance2,'weekly_allowance',new.weekly_allowance,'probation',new.probation);
  if before_j=after_j then return new;end if;sid:=new.store_id;cid:=new.id;
  update public.monthly_net_payroll set needs_reconfirmation=true where store_id=sid and crew_id=cid and not needs_reconfirmation;
  select string_agg((case when key='wage' then case after_j->>'wage_type' when 'monthly' then '월급' else '시급' end else labels->>key end)||' '||(case when key='wage' then to_char((before_j->>key)::numeric,'FM999,999,999,990')||'원 → '||to_char(value::numeric,'FM999,999,999,990')||'원' when key='wage_type' then case before_j->>key when 'monthly' then '월급' else '시급' end||' → '||case value when 'monthly' then '월급' else '시급' end else case before_j->>key when 'true' then '적용' else '미적용' end||' → '||case value when 'true' then '적용' else '미적용' end end),', ' order by key) into change_text from jsonb_each_text(after_j) where before_j->>key is distinct from value;
  mo:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM');
 else
  before_j:=case when tg_op='INSERT' then null else to_jsonb(old) end;after_j:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  if tg_op='UPDATE' and (before_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation')=(after_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation') then return new;end if;
  sid:=coalesce(new.store_id,old.store_id);cid:=coalesce(new.crew_id,old.crew_id);mo:=coalesce(new.month_key,old.month_key);
  change_text:=case when tg_table_name='monthly_net_payroll' then '최종 세후급여 '||coalesce(before_j->>'net_pay','미확정')||'원 → '||coalesce(after_j->>'net_pay','삭제')||'원 · 지급일 '||coalesce(after_j->>'paid_on','미입력') else coalesce(after_j->>'type',before_j->>'type')||' '||coalesce(before_j->>'amount','없음')||'원 → '||coalesce(after_j->>'amount','삭제')||'원' end;
 end if;
 if auth.uid() is not null and private.has_store_membership(sid,array['staff','manager']) and not private.has_store_membership(sid,array['owner']) then
  select name into employee from public.crew where id=cid;select coalesce(nullif(display_name,''),username) into actor from public.profiles where user_id=auth.uid();
  perform private.manee_add_activity(sid,cid,'pay_change',mo,null,coalesce(employee,'직원')||'님의 '||change_text||' · '||coalesce(mo,'')||' · 매니저 '||coalesce(actor,'확인 필요')||'님이 변경했습니다.',before_j,after_j);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
commit;
