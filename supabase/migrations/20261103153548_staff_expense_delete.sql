-- Only extends the existing authenticated staff expense RPC. Membership, creator,
-- confirmation, revision, subscription checks and receipt cascade remain enforced.
CREATE OR REPLACE FUNCTION private.manee_staff_expenses(p_store_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid();own boolean;e public.expense_entries;v public.vendors;d date;amt bigint;rid uuid;att jsonb;rev integer;result jsonb;start_day date;end_day date;
begin
 if uid is null or not private.is_live_manee_session() or not private.has_store_membership(p_store_id,null) then raise exception '매장 연결을 확인해 주세요.' using errcode='42501';end if;
 own:=private.has_store_membership(p_store_id,array['owner']::text[]);
 if p_action='list' then
  if coalesce(p_payload->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '조회 월을 확인해 주세요.';end if;
  start_day:=((p_payload->>'month')||'-01')::date;end_day:=(start_day+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc,x.created_at desc),'[]'::jsonb) into result from (select t.*,exists(select 1 from private.manee_expense_receipts a where a.expense_id=t.id) as has_receipt from public.expense_entries t where t.store_id=p_store_id and t.date>=start_day and t.date<end_day and (own or t.created_by_user_id=uid)) x;
  return jsonb_build_object('entries',result,'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'default_category',default_category) order by name),'[]'::jsonb) from public.vendors where store_id=p_store_id and archived_at is null));
 end if;
 if p_action in('edit','delete','confirm','receipt') then
  select * into e from public.expense_entries where id=(p_payload->>'id')::uuid and store_id=p_store_id for update;
  if not found or (not own and e.created_by_user_id is distinct from uid) then raise exception '지출을 확인할 권한이 없어요.' using errcode='42501';end if;
  if p_action='receipt' then select jsonb_build_object('name',name,'type',mime,'data',data) into result from private.manee_expense_receipts where expense_id=e.id;return result;end if;
  if p_action='confirm' then
   if not own then raise exception '사장님만 확인할 수 있어요.' using errcode='42501';end if;
   if e.owner_confirmed_at is not null then return to_jsonb(e);end if;
   update public.expense_entries set owner_confirmed_at=now(),owner_confirmed_by=uid where id=e.id returning * into e;return to_jsonb(e);
  end if;
  if not own and e.owner_confirmed_at is not null then raise exception '사장님 확인 후에는 직원이 수정·삭제할 수 없어요.' using errcode='42501';end if;
  if e.staff_revision is distinct from (p_payload->>'revision')::integer then raise exception '다른 기기에서 변경됐어요. 다시 불러와 주세요.' using errcode='40001';end if;
  if p_action='delete' then
   if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
   delete from public.expense_entries where id=e.id and store_id=p_store_id;
   return jsonb_build_object('id',e.id,'deleted',true);
  end if;
 elsif p_action='create' then
  rid:=(p_payload->>'request_id')::uuid;if rid is null then raise exception '저장 요청을 확인해 주세요.';end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||rid::text,0));
  select * into e from public.expense_entries where created_by_user_id=uid and staff_request_id=rid;
  if found then
   if e.store_id<>p_store_id then raise exception '요청 매장이 달라요.';end if;
   if e.date is distinct from (p_payload->>'date')::date or e.amount is distinct from (p_payload->>'amount')::bigint or e.vendor_id is distinct from (p_payload->>'vendor_id')::uuid or e.category is distinct from p_payload->>'category' or e.memo is distinct from coalesce(p_payload->>'memo','') or e.payment_method is distinct from p_payload->>'payment_method' or e.payment_status is distinct from p_payload->>'payment_status' then raise exception '이 요청은 이미 저장됐어요. 목록을 새로 불러온 뒤 해당 내역을 수정해 주세요.' using errcode='40001';end if;
   if p_payload->'receipt' is not null and p_payload->'receipt'<>'null'::jsonb and not exists(select 1 from private.manee_expense_receipts a where a.expense_id=e.id and a.data=p_payload->'receipt'->>'data' and a.mime=p_payload->'receipt'->>'type') then raise exception '이미 저장된 요청의 영수증은 내역 수정에서 변경해 주세요.' using errcode='40001';end if;
   return to_jsonb(e);
  end if;
 else raise exception '지원하지 않는 요청입니다.';end if;
 if not private.manee_store_write_entitled(p_store_id) then raise exception '매장 구독 상태를 확인해 주세요.' using errcode='P4402';end if;
 d:=(p_payload->>'date')::date;amt:=(p_payload->>'amount')::bigint;
 if d is null or d>(now() at time zone 'Asia/Seoul')::date or amt is null or amt<=0 or abs(amt)>2147483647 or length(coalesce(p_payload->>'memo',''))>1000 then raise exception '날짜·금액·비고를 확인해 주세요.';end if;
 select * into v from public.vendors where id=(p_payload->>'vendor_id')::uuid and store_id=p_store_id and archived_at is null;
 if not found then raise exception '현재 매장의 거래처를 선택해 주세요.';end if;
 if coalesce(p_payload->>'category','') not in('food','beverage','supplies','insurance','payroll_tax','utilities','fees','tax','other') or coalesce(p_payload->>'payment_method','') not in('cash','card','transfer','month_end') or coalesce(p_payload->>'payment_status','') not in('paid','unpaid') then raise exception '분류·결제수단·결제상태를 확인해 주세요.';end if;
 att:=p_payload->'receipt';
 if att is not null and att<>'null'::jsonb then
  if coalesce(att->>'type','') not in('image/jpeg','image/png') or coalesce(att->>'name','')='' or length(att->>'name')>200 or coalesce(att->>'data','')='' or length(att->>'data')>2800000 or (att->>'data') !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'JPG·PNG 2MB 이하 영수증을 선택해 주세요.';end if;
  if octet_length(decode(att->>'data','base64'))>2097152 then raise exception '영수증은 2MB 이하로 선택해 주세요.';end if;
  if (att->>'type'='image/png' and left(att->>'data',11)<>'iVBORw0KGgo') or (att->>'type'='image/jpeg' and left(att->>'data',4)<>'/9j/') then raise exception '사진 파일 형식을 확인해 주세요.';end if;
 end if;
 if p_action='create' then
  insert into public.expense_entries(store_id,date,description,amount,category,memo,vendor_id,payment_method,payment_status,staff_request_id) values(p_store_id,d,v.name,amt,p_payload->>'category',coalesce(p_payload->>'memo',''),v.id,p_payload->>'payment_method',p_payload->>'payment_status',rid) returning * into e;
 else
  update public.expense_entries set date=d,description=v.name,amount=amt,category=p_payload->>'category',memo=coalesce(p_payload->>'memo',''),vendor_id=v.id,payment_method=p_payload->>'payment_method',payment_status=p_payload->>'payment_status' where id=e.id returning * into e;
 end if;
 if att is not null and att<>'null'::jsonb then insert into private.manee_expense_receipts values(e.id,att->>'name',att->>'type',att->>'data') on conflict(expense_id) do update set name=excluded.name,mime=excluded.mime,data=excluded.data;end if;
 return to_jsonb(e);
end$function$
;

