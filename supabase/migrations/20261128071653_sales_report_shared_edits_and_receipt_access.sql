set local lock_timeout = '5s';

-- Keep original authorship on edit. The editor is recorded in the owner activity.
CREATE OR REPLACE FUNCTION private.manee_sector3_save(p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb DEFAULT NULL::jsonb, p_expenses jsonb DEFAULT '[]'::jsonb, p_previous timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h text;c public.sector3_requests;s public.sales_reports;old public.sales_reports;e jsonb;v public.vendors;r jsonb;
begin
 if not (private.can_manage_store(p_store_id) or private.manee_manager_cap(p_store_id,'salesWrite')) or not private.is_live_manee_session() then raise exception 'Not allowed' using errcode='42501';end if;
 if p_date is null or p_request_id is null or p_date>(now() at time zone 'Asia/Seoul')::date or jsonb_typeof(p_expenses)<>'array' or jsonb_array_length(p_expenses)>100 then raise exception 'Invalid request';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 if not private.can_manage_store(p_store_id) and exists(select 1 from public.monthly_report_closings where store_id=p_store_id and month_key=to_char(p_date,'YYYY-MM')) then raise exception '마감된 월은 사장님께 정정을 요청해 주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_store_id::text||p_date::text,0));
 h:=md5(jsonb_build_array(p_sales,p_expenses,p_date,p_previous)::text);
 select * into c from public.sector3_requests where store_id=p_store_id and request_id=p_request_id;
 if c.request_id is not null then if not private.can_manage_store(p_store_id) and c.created_by_user_id is distinct from auth.uid() then raise exception '다른 계정의 저장 요청이에요.' using errcode='42501';end if;if c.payload_hash<>h then raise exception '저장 요청이 변경됐어요.';end if;return c.result;end if;
 if p_sales is not null then
 select * into old from public.sales_reports where store_id=p_store_id and date=p_date for update;
 -- All authorized sales writers at this store may edit an open report.
 if old.submitted_at is distinct from p_previous then raise exception '다른 기기에서 변경됐어요. 다시 불러와 주세요.';end if;
 s:=jsonb_populate_record(null::public.sales_reports,p_sales);
 if s.store_id is distinct from p_store_id or s.date is distinct from p_date then raise exception 'Invalid scope';end if;
 if s.total_sales is null or s.discount is null or s.refund is null or s.cash_sales is null or s.card_sales is null or s.emoney_sales is null or s.net_sales is null or least(s.total_sales,s.discount,s.refund,s.cash_sales,s.card_sales,s.emoney_sales,s.till,s.delivery_baemin,s.delivery_coupang,s.delivery_yogiyo)<0 or s.total_sales::bigint<>s.card_sales::bigint+s.cash_sales::bigint+s.emoney_sales::bigint+s.discount::bigint or s.net_sales::bigint<>s.total_sales::bigint-s.discount::bigint-s.refund::bigint then raise exception 'Invalid sales';end if;
 if not private.can_manage_store(p_store_id) then s.crew_id:=private.current_crew_id(p_store_id);end if;
 if s.crew_id is not null and not private.crew_belongs_to_store(s.crew_id,p_store_id) then raise exception '매출 작성자 매장을 확인해 주세요.' using errcode='42501';end if;
 select coalesce(display_name,username,'') into s.manager_name from public.profiles where user_id=auth.uid();s.submitted_at:=clock_timestamp();
 insert into public.sales_reports(store_id,date,manager_name,crew_id,total_sales,discount,refund,refund_reason,net_sales,cash_sales,expense,cash_expense_items,actual_cash,card_sales,emoney_sales,card_expense,card_expense_items,bank_transfer,bank_transfer_items,till,delivery_baemin,delivery_coupang,delivery_yogiyo,note,settlement_photos,receipt_photos,note_photos,submitted_at) values(p_store_id,p_date,s.manager_name,s.crew_id,s.total_sales,s.discount,s.refund,s.refund_reason,s.net_sales,s.cash_sales,s.expense,s.cash_expense_items,s.actual_cash,s.card_sales,s.emoney_sales,s.card_expense,s.card_expense_items,s.bank_transfer,s.bank_transfer_items,s.till,s.delivery_baemin,s.delivery_coupang,s.delivery_yogiyo,s.note,s.settlement_photos,s.receipt_photos,s.note_photos,s.submitted_at) on conflict(store_id,date) do update set total_sales=excluded.total_sales,discount=excluded.discount,refund=excluded.refund,refund_reason=excluded.refund_reason,net_sales=excluded.net_sales,cash_sales=excluded.cash_sales,expense=excluded.expense,cash_expense_items=excluded.cash_expense_items,actual_cash=excluded.actual_cash,card_sales=excluded.card_sales,emoney_sales=excluded.emoney_sales,card_expense=excluded.card_expense,card_expense_items=excluded.card_expense_items,bank_transfer=excluded.bank_transfer,bank_transfer_items=excluded.bank_transfer_items,till=excluded.till,delivery_baemin=excluded.delivery_baemin,delivery_coupang=excluded.delivery_coupang,delivery_yogiyo=excluded.delivery_yogiyo,note=excluded.note,settlement_photos=excluded.settlement_photos,receipt_photos=excluded.receipt_photos,note_photos=excluded.note_photos,submitted_at=excluded.submitted_at returning * into s;
 end if;
 for e in select value from jsonb_array_elements(p_expenses) loop
 if coalesce(e->>'amount','') !~ '^-?[0-9]+$' or (e->>'amount')::bigint=0 or abs((e->>'amount')::bigint)>2147483647 or length(coalesce(e->>'memo',''))>1000 or coalesce(e->>'payment_method','') not in ('cash','card','transfer','month_end','unknown') or coalesce(e->>'payment_status','') not in ('paid','unpaid','unknown') then raise exception 'Invalid expense';end if;
 select * into v from public.vendors where id=(e->>'vendor_id')::uuid and store_id=p_store_id and archived_at is null;
 if v.id is null then raise exception '거래처를 다시 선택해 주세요.';end if;
 if nullif(e->>'category','') is not null and e->>'category' not in ('food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other') then raise exception 'Invalid category';end if;
 insert into public.expense_entries(store_id,date,vendor_id,description,amount,category,memo,payment_method,payment_status) values(p_store_id,p_date,v.id,v.name,(e->>'amount')::integer,nullif(e->>'category',''),coalesce(e->>'memo',''),e->>'payment_method',e->>'payment_status');
 end loop;
 r:=jsonb_build_object('sales',case when p_sales is null then null else to_jsonb(s) end);
 insert into public.sector3_requests(store_id,request_id,payload_hash,result,created_by_user_id) values(p_store_id,p_request_id,h,r,auth.uid());return r;
end $function$;

CREATE OR REPLACE FUNCTION private.manee_authorize_service(p_store_id uuid, p_service text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); now_at timestamptz:=now(); day_at timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 minute_at timestamptz:=date_trunc('minute',now()); lim integer; global_lim integer; b text; w timestamptz; cap integer; n integer;
BEGIN
 IF uid IS NULL OR NOT private.is_live_manee_session() THEN RETURN jsonb_build_object('allowed',false,'code','session');END IF;
 IF p_service NOT IN ('ask-app','read-receipt','send-push') THEN RETURN jsonb_build_object('allowed',false,'code','service');END IF;
 IF NOT ((CASE p_service
   WHEN 'send-push' THEN private.has_store_membership(p_store_id,array['owner','manager','staff']::text[])
   WHEN 'read-receipt' THEN (private.has_sales_access(p_store_id) OR private.manee_manager_cap(p_store_id,'salesWrite'))
   ELSE private.has_store_membership(p_store_id,array['owner']::text[]) END)
   OR private.has_platform_role(array['super_admin','admin']::text[])) THEN RETURN jsonb_build_object('allowed',false,'code','permission');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND archived_at IS NULL) THEN RETURN jsonb_build_object('allowed',false,'code','store');END IF;
 IF NOT private.manee_store_write_entitled(p_store_id) THEN RETURN jsonb_build_object('allowed',false,'code','subscription');END IF;
 lim:=case p_service when 'ask-app' then 100 when 'read-receipt' then 50 else 100 end;
 global_lim:=case p_service when 'send-push' then 5000 else 1000 end;
 -- Serialize quota checks across instances. No client-provided user, role, quota or IP is trusted.
 PERFORM pg_advisory_xact_lock(hashtextextended('manee-service-quota:'||p_service,0));
 FOR b,w,cap IN SELECT * FROM (VALUES ('user:'||uid::text,day_at,lim),('store:'||p_store_id::text,day_at,lim),('global',day_at,global_lim),('minute:'||uid::text,minute_at,5)) q LOOP
   SELECT calls INTO n FROM private.manee_service_usage WHERE service=p_service AND bucket=b AND window_start=w;
   IF coalesce(n,0)>=cap THEN RETURN jsonb_build_object('allowed',false,'code','rate_limit');END IF;
 END LOOP;
 FOR b,w,cap IN SELECT * FROM (VALUES ('user:'||uid::text,day_at,lim),('store:'||p_store_id::text,day_at,lim),('global',day_at,global_lim),('minute:'||uid::text,minute_at,5)) q LOOP
   INSERT INTO private.manee_service_usage(service,bucket,window_start,calls) VALUES(p_service,b,w,1)
   ON CONFLICT(service,bucket,window_start) DO UPDATE SET calls=manee_service_usage.calls+1;
 END LOOP;
 RETURN jsonb_build_object('allowed',true,'pushMode',CASE WHEN private.has_store_membership(p_store_id,array['owner','manager']::text[]) OR private.has_platform_role(array['super_admin','admin']::text[]) THEN 'manager' ELSE 'member' END);
END $function$;

-- Daily reports are editable by sales writers. Financial summaries keep their own grants.
create or replace function private.manee_sales_read(p_store uuid, p_crew uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_financials(p_store)
      or private.manee_manager_cap(p_store, 'viewSales')
      or private.manee_manager_cap(p_store, 'salesWrite');
$$;

-- Installed mobile clients use this entry point. Both endpoints share permissions,
-- optimistic concurrency, idempotency, billing checks, and the month close.
create or replace function public.manee_manager_save_sales(
  p_store_id uuid, p_date date, p_request_id uuid, p_sales jsonb default null,
  p_expenses jsonb default '[]'::jsonb, p_previous timestamptz default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.manee_sector3_save(p_store_id, p_date, p_request_id, p_sales, p_expenses, p_previous);
$$;
revoke all on function public.manee_manager_save_sales(uuid,date,uuid,jsonb,jsonb,timestamptz) from public, anon;
grant execute on function public.manee_manager_save_sales(uuid,date,uuid,jsonb,jsonb,timestamptz) to authenticated;

create or replace function private.manee_notify_sales_edit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  editor_crew uuid;
  editor_name text;
  store_name text;
  message_text text;
  ignored_keys constant text[] := array['id','store_id','crew_id','manager_name','submitted_at'];
  empty_values constant jsonb[] := array['null'::jsonb, '0'::jsonb, '""'::jsonb, '[]'::jsonb];
  previous_values jsonb;
begin
  if auth.uid() is null then return new; end if;
  previous_values := to_jsonb(old) - ignored_keys;
  -- Older reports have null in optional fields which the app submits as zero or blank.
  if not exists (
    select from jsonb_each(to_jsonb(new) - ignored_keys) as field
    where field.value is distinct from (previous_values -> field.key)
      and not (field.value = any(empty_values) and (previous_values -> field.key) = any(empty_values))
  ) then return new; end if;

  editor_crew := private.current_crew_id(new.store_id);
  select s.name, coalesce(nullif(btrim(c.name), ''), nullif(btrim(p.display_name), ''),
                          nullif(btrim(p.username), ''), '사용자')
    into store_name, editor_name
    from public.stores s
    left join public.profiles p on p.user_id = auth.uid()
    left join public.crew c on c.id = editor_crew and c.store_id = s.id
   where s.id = new.store_id;
  message_text := format('%s 매장의 %s월%s일 매출 보고를 %s님이 수정하였습니다.',
                         store_name, extract(month from new.date)::integer,
                         to_char(new.date, 'DD'), editor_name);
  perform private.manee_add_activity(new.store_id, editor_crew, 'sales_edit',
    to_char(new.date, 'YYYY-MM'), new.date, message_text, null, null);
  return new;
end;
$$;
revoke all on function private.manee_notify_sales_edit() from public, anon, authenticated;
create trigger manee_sales_edit_activity after update on public.sales_reports
for each row execute function private.manee_notify_sales_edit();
notify pgrst, 'reload schema';
