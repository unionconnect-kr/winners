begin;
set local lock_timeout = '5s';

-- Previously confirmed shifts remain readable and keep their historical payroll.
create or replace function private.manee_guard_pay_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.pay_approval_required then
    new.pay_approval_required := true;
  end if;
  if tg_op = 'UPDATE' and row(new.check_in,new.check_out) is distinct from row(old.check_in,old.check_out) then
    new.confirmed := false;
    new.pay_check_in := null;
    new.pay_check_out := null;
    new.pay_confirmed_by := null;
    new.pay_confirmed_at := null;
  elsif new.confirmed and (tg_op = 'INSERT' or old.confirmed is not true or
      row(new.pay_check_in,new.pay_check_out) is distinct from row(old.pay_check_in,old.pay_check_out)) then
    if new.check_in is null or new.check_out is null or new.pay_check_in is null or new.pay_check_out is null then
      raise exception '급여 적용 시간을 30분 단위로 선택해 주세요. 예: 09:00, 09:30' using errcode='22023';
    end if;
    if not (private.has_store_membership(new.store_id,array['owner']) or private.manee_manager_cap(new.store_id,'salesWrite')) then
      raise exception '근무 확인 권한이 없어요.' using errcode='42501';
    end if;
    new.pay_approval_required := true;
    new.pay_confirmed_by := auth.uid();
    new.pay_confirmed_at := clock_timestamp();
  end if;
  return new;
end $$;

commit;
