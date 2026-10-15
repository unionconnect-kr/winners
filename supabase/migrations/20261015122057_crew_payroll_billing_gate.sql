begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Crew also contains account/identity data. Limit financial setup without
-- preventing personal-profile corrections, offboarding or zero-pay identity
-- creation by the existing owner-approved staff portal.
create function private.manee_guard_crew_payroll_billing() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_store uuid; new_store uuid; sid uuid;
begin
 if auth.uid() is null then
  if TG_OP='DELETE' then return OLD;else return NEW;end if;
 end if;
 if TG_OP='INSERT' and NEW.wage=0 then return NEW;end if;
 if TG_OP='UPDATE'
  and NEW.store_id is not distinct from OLD.store_id
  and row(NEW.wage,NEW.wage_type,NEW.tax33,NEW.weekly_allowance,NEW.insurance4,
    NEW.insurance2,NEW.probation,NEW.work_condition,NEW.weekly_hours)
   is not distinct from
   row(OLD.wage,OLD.wage_type,OLD.tax33,OLD.weekly_allowance,OLD.insurance4,
    OLD.insurance2,OLD.probation,OLD.work_condition,OLD.weekly_hours)
  and not (OLD.employment_setup_required and not NEW.employment_setup_required)
 then return NEW;end if;

 if TG_OP<>'INSERT' then old_store:=OLD.store_id;end if;
 if TG_OP<>'DELETE' then new_store:=NEW.store_id;end if;
 for sid in select distinct x from unnest(array[old_store,new_store]) x where x is not null loop
  if not private.manee_store_write_entitled(sid) then
   raise exception '매장 이용권이 만료되어 급여 설정을 입력·수정할 수 없어요. 사장님이 구독 상태를 확인해 주세요.' using errcode='P4402';
  end if;
 end loop;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
revoke all on function private.manee_guard_crew_payroll_billing() from public,anon,authenticated,service_role;
create trigger manee_billing_crew_payroll_gate
before insert or update or delete on public.crew
for each row execute function private.manee_guard_crew_payroll_billing();
commit;
