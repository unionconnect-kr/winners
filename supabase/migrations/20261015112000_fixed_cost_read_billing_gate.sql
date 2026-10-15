begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- The client calls this before reading the fixed-cost list. If an enrolled
-- store has no current entitlement, keep the existing records readable and
-- skip only the carry-forward/materialization writes. The regular table
-- trigger remains responsible for rejecting all other writes.
create or replace function private.manee_prepare_fixed_costs(p_store_id uuid,p_month_key text) returns void
language plpgsql security definer set search_path='' as $$
declare previous_month text;
begin
 perform private.assert_cost_access(p_store_id,p_month_key);
 if not private.manee_store_write_entitled(p_store_id) then return;end if;
 if p_month_key>to_char(now() at time zone 'Asia/Seoul','YYYY-MM') then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('fixed:'||p_store_id::text||p_month_key,0));
 previous_month:=to_char(to_date(p_month_key||'-01','YYYY-MM-DD')-interval '1 month','YYYY-MM');
 if not exists(select 1 from public.fixed_expenses where store_id=p_store_id and month_key=p_month_key) then
  insert into public.fixed_expenses(store_id,month_key,name,amount)
  select p_store_id,p_month_key,name,amount from public.fixed_expenses where store_id=p_store_id and month_key=previous_month and cost_template_id is null;
 end if;
 insert into public.fixed_expenses(store_id,month_key,name,amount,cost_template_id)
 select p_store_id,p_month_key,t.name,t.amount,t.id from public.recurring_cost_templates t
 where t.store_id=p_store_id and t.active and t.mode='fixed' and t.start_month<=p_month_key
 on conflict(store_id,month_key,cost_template_id) where cost_template_id is not null do nothing;
end $$;

commit;
