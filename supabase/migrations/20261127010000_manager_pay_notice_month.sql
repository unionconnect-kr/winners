begin;
set local lock_timeout='5s';

-- Scope the selected month to the individual authenticated RPC, including its AFTER triggers.
create or replace function public.manee_manager_write(
  p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid,
  p_payload jsonb, p_previous jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' set manee.wage_notice_month = ''
as $$
begin
  if p_action = 'wage' then
    if p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
      raise exception '급여 적용 월을 확인해 주세요.' using errcode = '22023';
    end if;
    perform set_config('manee.wage_notice_month',p_month_key,true);
  end if;
  return private.manee_manager_write(p_store_id,p_month_key,p_action,p_crew_id,p_payload,p_previous);
end $$;

create or replace function public.manee_manager_write_v2(
  p_store_id uuid, p_month_key text, p_action text, p_crew_id uuid,
  p_payload jsonb, p_previous jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = '' set manee.wage_notice_month = ''
as $$
begin
  if p_action = 'wage' then
    if p_month_key is null or p_month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
      raise exception '급여 적용 월을 확인해 주세요.' using errcode = '22023';
    end if;
    perform set_config('manee.wage_notice_month',p_month_key,true);
  end if;
  return private.manee_manager_write_v2(p_store_id,p_month_key,p_action,p_crew_id,p_payload,p_previous);
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
  mo:=coalesce(nullif(current_setting('manee.wage_notice_month',true),''),to_char(now() at time zone 'Asia/Seoul','YYYY-MM'));
 else
  before_j:=case when tg_op='INSERT' then null else to_jsonb(old) end;after_j:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  if tg_op='UPDATE' and (before_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation')=(after_j-'updated_at'-'confirmed_by'-'adjustment_snapshot'-'needs_reconfirmation') then return new;end if;
  sid:=coalesce(new.store_id,old.store_id);cid:=coalesce(new.crew_id,old.crew_id);mo:=coalesce(new.month_key,old.month_key);
  change_text:=case when tg_table_name='monthly_net_payroll' then '최종 세후급여 '||coalesce(before_j->>'net_pay','미확정')||'원 → '||coalesce(after_j->>'net_pay','삭제')||'원 · 지급일 '||coalesce(before_j->>'paid_on','미입력')||' → '||coalesce(after_j->>'paid_on','미입력') else coalesce(after_j->>'type',before_j->>'type')||' '||coalesce(before_j->>'amount','없음')||'원 → '||coalesce(after_j->>'amount','삭제')||'원' end;
 end if;
 if auth.uid() is not null and private.has_store_membership(sid,array['staff','manager']) and not private.has_store_membership(sid,array['owner']) then
  select name into employee from public.crew where id=cid;select coalesce(nullif(display_name,''),username) into actor from public.profiles where user_id=auth.uid();
  perform private.manee_add_activity(sid,cid,'pay_change',mo,null,coalesce(employee,'직원')||'님의 '||change_text||' · '||coalesce(mo,'')||' · 매니저 '||coalesce(actor,'확인 필요')||'님이 변경했습니다.',before_j,after_j);
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

commit;
