-- Synthetic owner/manager/staff checks; every fixture and queue entry rolls back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT set_config('manee_qa.owner',gen_random_uuid()::text,true),
 set_config('manee_qa.manager',gen_random_uuid()::text,true),
 set_config('manee_qa.staff',gen_random_uuid()::text,true),
 set_config('manee_qa.store',gen_random_uuid()::text,true),
 set_config('manee_qa.other',gen_random_uuid()::text,true),
 set_config('manee_qa.manager_crew',gen_random_uuid()::text,true),
 set_config('manee_qa.staff_crew',gen_random_uuid()::text,true);
INSERT INTO auth.users(id) SELECT current_setting('manee_qa.'||r)::uuid FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO auth.sessions(id,user_id) SELECT current_setting('manee_qa.'||r)::uuid,current_setting('manee_qa.'||r)::uuid FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO public.profiles(user_id,username,display_name,status)
 SELECT current_setting('manee_qa.'||r)::uuid,'qa_'||left(replace(current_setting('manee_qa.'||r),'-',''),20),'Release QA '||r,'active' FROM unnest(ARRAY['owner','manager','staff']) r;
INSERT INTO public.stores(id,name) VALUES(current_setting('manee_qa.store')::uuid,'Release QA store'),(current_setting('manee_qa.other')::uuid,'Release QA other');
-- Only synthetic stores bypass subscription charging during the rollback-only exercise.
DELETE FROM private.store_billing_enforcement WHERE store_id IN(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.other')::uuid);
INSERT INTO public.crew(id,store_id,name,wage,wage_type,is_manager) VALUES
 (current_setting('manee_qa.manager_crew')::uuid,current_setting('manee_qa.store')::uuid,'Release QA manager',10000,'hourly',false),
 (current_setting('manee_qa.staff_crew')::uuid,current_setting('manee_qa.store')::uuid,'Release QA staff',10000,'hourly',false);
INSERT INTO public.store_memberships(user_id,store_id,crew_id,role,status) VALUES
 (current_setting('manee_qa.owner')::uuid,current_setting('manee_qa.store')::uuid,null,'owner','active'),
 (current_setting('manee_qa.manager')::uuid,current_setting('manee_qa.store')::uuid,current_setting('manee_qa.manager_crew')::uuid,'staff','active'),
 (current_setting('manee_qa.staff')::uuid,current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,'staff','active');
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.owner'),true),set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.owner'),'session_id',current_setting('manee_qa.owner'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ DECLARE r jsonb; BEGIN
 IF NOT private.can_manage_store(current_setting('manee_qa.store')::uuid) THEN RAISE EXCEPTION 'Owner access failed'; END IF;
 r:=public.manee_sector3_vendor(current_setting('manee_qa.store')::uuid,null,'save','Release QA supplier','food');
 PERFORM set_config('manee_qa.vendor',r->'vendor'->>'id',true);
 r:=public.manee_manager_permissions(current_setting('manee_qa.manager_crew')::uuid,'save','{"view":"sales","salesWrite":true,"schedule":true}',0);
 IF NOT (r->>'enabled')::boolean THEN RAISE EXCEPTION 'Manager assignment failed'; END IF;
 BEGIN
  PERFORM public.manee_sector3_review(current_setting('manee_qa.other')::uuid,to_char(now(),'YYYY-MM'),'get');
  RAISE EXCEPTION 'Foreign-store owner access unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $qa$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.staff'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.staff'),'session_id',current_setting('manee_qa.staff'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ DECLARE p jsonb;r jsonb;r2 jsonb;BEGIN
 p:=jsonb_build_object('date',(now() AT TIME ZONE 'Asia/Seoul')::date,'amount',1000,'vendor_id',current_setting('manee_qa.vendor'),'category','food','payment_method','card','payment_status','paid','memo','Release QA','request_id',gen_random_uuid());
 r:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'create',p);
 r2:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'create',p);
 IF r->>'id' IS NULL OR r->>'id' IS DISTINCT FROM r2->>'id' THEN RAISE EXCEPTION 'Expense idempotency failed';END IF;
 r2:=public.manee_staff_expenses(current_setting('manee_qa.store')::uuid,'list',jsonb_build_object('month',to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM')));
 IF jsonb_array_length(r2->'entries')<>1 THEN RAISE EXCEPTION 'Staff expense read failed'; END IF;
 BEGIN
  PERFORM public.manee_staff_expenses(current_setting('manee_qa.other')::uuid,'list',jsonb_build_object('month',to_char(now(),'YYYY-MM')));
  RAISE EXCEPTION 'Foreign-store expense access unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date,'10:00','18:00');
  RAISE EXCEPTION 'Ordinary staff schedule write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM public.manee_manager_permissions(current_setting('manee_qa.manager_crew')::uuid,'get');
  RAISE EXCEPTION 'Staff permission administration unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('manee_qa.manager'),true),
 set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('manee_qa.manager'),'session_id',current_setting('manee_qa.manager'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $qa$ BEGIN
 IF NOT private.manee_manager_cap(current_setting('manee_qa.store')::uuid,'schedule') OR private.can_manage_store(current_setting('manee_qa.store')::uuid) THEN RAISE EXCEPTION 'Manager capability boundary failed'; END IF;
 INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date,'10:00','18:00');
 BEGIN
  PERFORM public.manee_manager_write(current_setting('manee_qa.store')::uuid,to_char(now(),'YYYY-MM'),'wage',current_setting('manee_qa.staff_crew')::uuid,'{"wage":20000,"wage_type":"hourly"}','{"wage":10000,"wage_type":"hourly"}');
  RAISE EXCEPTION 'Ungrant​ed wage capability unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
DELETE FROM auth.sessions WHERE user_id=current_setting('manee_qa.manager')::uuid;
SET LOCAL ROLE authenticated;
DO $qa$ BEGIN
 IF private.manee_manager_cap(current_setting('manee_qa.store')::uuid,'schedule') THEN RAISE EXCEPTION 'Revoked session retained permissions'; END IF;
 BEGIN
  INSERT INTO public.shifts(store_id,crew_id,date,start_time,end_time) VALUES(current_setting('manee_qa.store')::uuid,current_setting('manee_qa.staff_crew')::uuid,current_date+1,'10:00','18:00');
  RAISE EXCEPTION 'Revoked-session schedule write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $qa$;
RESET ROLE;
SELECT 'owner / staff expenses / idempotency / manager capabilities / cross-store isolation / session revocation passed' AS result;
ROLLBACK;
