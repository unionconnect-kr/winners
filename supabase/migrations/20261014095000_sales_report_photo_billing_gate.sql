begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- sales_report_photos has only a parent report key. Resolve BOTH endpoints for
-- mutations, so moving a photo cannot bypass a restricted source/destination.
create function private.manee_guard_sales_report_photo_billing() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_store uuid; new_store uuid; sid uuid;
begin
 -- Matches direct-key gate: backend maintenance/account cleanup has no user JWT.
 if auth.uid() is null then
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if TG_OP<>'INSERT' and OLD.sales_report_id is not null then
  select r.store_id into old_store from public.sales_reports r where r.id=OLD.sales_report_id;
 end if;
 if TG_OP<>'DELETE' and NEW.sales_report_id is not null then
  select r.store_id into new_store from public.sales_reports r where r.id=NEW.sales_report_id;
 end if;
 for sid in select distinct x from unnest(array[old_store,new_store]) x where x is not null loop
  if not private.manee_store_write_entitled(sid) then
   raise exception '매장 이용권이 만료되어 입력·수정할 수 없어요. 사장님이 구독 상태를 확인해 주세요.' using errcode='P4402';
  end if;
 end loop;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function private.manee_guard_sales_report_photo_billing() from public,anon,authenticated,service_role;
do $$
begin
 if to_regclass('public.sales_report_photos') is null then
  raise exception 'Missing billing gate table: sales_report_photos';
 end if;
 if to_regclass('public.sales_reports') is null then
  raise exception 'Missing billing gate parent: sales_reports';
 end if;
 if exists (
  select 1 from pg_trigger
  where tgrelid='public.sales_report_photos'::regclass
   and tgname='manee_billing_photo_gate' and not tgisinternal
 ) then raise exception 'Billing photo gate already exists'; end if;
end $$;
create trigger manee_billing_photo_gate before insert or update or delete
on public.sales_report_photos for each row
execute function private.manee_guard_sales_report_photo_billing();
commit;
