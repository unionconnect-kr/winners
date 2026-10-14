begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Include the remaining directly store-keyed payroll settlement record.
-- Enrollment stays explicit and empty; this adds no customer restriction by itself.
do $$
begin
 if to_regclass('public.monthly_net_payroll') is null then
  raise exception 'Missing billing gate table: monthly_net_payroll';
 end if;
 if not exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='monthly_net_payroll'
    and column_name='store_id' and data_type='uuid'
 ) then
  raise exception 'Missing UUID store key: monthly_net_payroll.store_id';
 end if;
 if exists (
  select 1 from pg_trigger
  where tgrelid='public.monthly_net_payroll'::regclass
    and tgname='manee_billing_write_gate' and not tgisinternal
 ) then
  raise exception 'Billing gate already exists on monthly_net_payroll';
 end if;
end $$;
create trigger manee_billing_write_gate before insert or update or delete
on public.monthly_net_payroll for each row
execute function private.manee_guard_billed_write();
commit;
