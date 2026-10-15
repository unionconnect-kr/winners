-- TEMPLATE: render with scripts/render-deletion-staging-rehearsal.mjs.
-- Select Staging obpkzecgswnfuyhwvncd in the connector before execution.
-- The renderer refuses other project refs; SQL cannot independently discover
-- the hosted project ref. Never use this template as a customer erasure plan.
-- Only fresh, synthetic UUIDs are written. A subtransaction removes all fixtures
-- before post-rollback checks; the outer transaction also ends with ROLLBACK.
begin isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local request.jwt.claim.sub='';
set local request.jwt.claim.role='';
set local request.jwt.claims='{}';
do $rehearsal$
declare
 subject_id uuid:=gen_random_uuid(); keeper_id uuid:=gen_random_uuid();
 test_store_id uuid:=gen_random_uuid(); subject_crew uuid:=gen_random_uuid(); keeper_crew uuid:=gen_random_uuid();
 subject_membership uuid:=gen_random_uuid(); keeper_membership uuid:=gen_random_uuid();
 subject_attendance uuid:=gen_random_uuid(); keeper_attendance uuid:=gen_random_uuid();
 case_id uuid:=gen_random_uuid();
 push_id bigint:=-abs(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)-1;
 uname text:='qa_del_'||substr(replace(subject_id::text,'-',''),1,20);
 keeper_uname text:='qa_keep_'||substr(replace(keeper_id::text,'-',''),1,20);
 before_state jsonb:='{}'; after_state jsonb:='{}'; snapshot_value jsonb;
 keeper_before jsonb; keeper_after jsonb; preflight jsonb; postflight jsonb;
 tab text; failed_constraint text; blocked boolean; check_count integer:=0;
begin
 if auth.uid() is not null or current_user='authenticated' then raise exception 'Privileged operator without customer JWT required';end if;
 -- Only hashes/counts of business rows are retained inside this transaction.
 -- No existing names, contacts or Auth credentials are returned.
 foreach tab in array array['public.profiles','public.stores','public.crew','public.store_memberships',
  'public.attendance','public.push_subscriptions','public.monthly_cost_reviews',
  'private.profile_prior_values','private.profile_adoption','private.staff_access_events',
  'private.password_reset_events','private.android_push_devices','private.account_deletion_requests',
  'private.store_staff_code_history','private.android_push_deliveries'] loop
  execute format('select jsonb_build_object(''rows'',count(*),''hash'',md5(coalesce(string_agg(h,''|'' order by h),''''))) from (select md5(to_jsonb(t)::text) h from %s t) q',tab) into snapshot_value;
  before_state:=before_state||jsonb_build_object(tab,snapshot_value);
 end loop;
 begin
  insert into auth.users(id) values(subject_id),(keeper_id);
  insert into auth.sessions(id,user_id) values(subject_id,subject_id),(keeper_id,keeper_id);
  insert into public.profiles(user_id,username,display_name) values
   (subject_id,uname,'Synthetic deletion subject'),(keeper_id,keeper_uname,'Synthetic retained owner');
  insert into public.stores(id,name,owner_username) values(test_store_id,'Synthetic deletion rehearsal',keeper_uname);
  insert into public.crew(id,store_id,name,phone,wage) values
   (subject_crew,test_store_id,'Synthetic deletion subject','010-0000-0000',10000),
   (keeper_crew,test_store_id,'Synthetic retained owner','010-0000-0001',12000);
  insert into public.store_memberships(id,user_id,store_id,crew_id,role) values
   (subject_membership,subject_id,test_store_id,subject_crew,'staff'),
   (keeper_membership,keeper_id,test_store_id,keeper_crew,'owner');
  insert into public.attendance(id,store_id,crew_id,date,check_in) values
   (subject_attendance,test_store_id,subject_crew,current_date,'09:00'),
   (keeper_attendance,test_store_id,keeper_crew,current_date,'10:00');
  -- Explicit negative synthetic identity avoids advancing a live identity sequence.
  insert into public.push_subscriptions(id,store_id,crew_id,role,endpoint,p256dh,auth,user_id)
   overriding system value values(push_id,test_store_id,subject_crew,'staff','https://example.invalid/'||subject_id,'synthetic','synthetic',subject_id);
  insert into private.android_push_devices(token,user_id,session_id,store_id)
   values('synthetic-deletion-'||subject_id,subject_id,subject_id,test_store_id);
  insert into public.monthly_cost_reviews(store_id,month_key,completed_at,completed_by)
   values(test_store_id,to_char(current_date,'YYYY-MM'),clock_timestamp(),subject_id);
  insert into private.profile_prior_values(crew_id,user_id,field,old_value)
   values(subject_crew,subject_id,'phone','010-0000-0002');
  insert into private.profile_adoption(crew_id,user_id,field) values(subject_crew,subject_id,'name');
  insert into private.staff_access_events(actor_user_id,target_user_id,store_id,crew_id,membership_id,action)
   values(keeper_id,subject_id,test_store_id,subject_crew,subject_membership,'approved');
  insert into private.password_reset_events(target_user_id,actor_user_id,action) values(subject_id,keeper_id,'requested');
  insert into private.account_deletion_requests(id,username,contact,status)
   values(case_id,uname,'synthetic-delete@example.invalid','in_review');
  select jsonb_build_object('crew',(select to_jsonb(c) from public.crew c where id=keeper_crew),
   'attendance',(select to_jsonb(a) from public.attendance a where id=keeper_attendance),
   'profile',(select to_jsonb(p) from public.profiles p where user_id=keeper_id),
   'membership',(select to_jsonb(m) from public.store_memberships m where id=keeper_membership)) into keeper_before;
  perform set_config('request.jwt.claim.sub',subject_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject_id,'session_id',subject_id,'role','authenticated')::text,true);
  if not private.is_live_manee_session() then raise exception 'Synthetic session not live before deletion';end if;
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  check_count:=check_count+1;
  perform set_config('manee.deletion_subject',subject_id::text,true);
  perform set_config('manee.deletion_username',uname,true);
  perform set_config('manee.deletion_crew_ids','[]',true);
  -- @inventory-body
  preflight:=current_setting('manee.deletion_report')::jsonb;
  if preflight->'linked_crew_ids'<>jsonb_build_array(subject_crew)
   or (preflight->>'sessions')::int<>1 then raise exception 'Preflight failed subject/crew/session discovery';end if;
  if not exists(select 1 from jsonb_array_elements(preflight->'user_references') r
   where r->>'table'='private.profile_prior_values' and r->>'column'='user_id' and (r->>'rows')::int=1)
   then raise exception 'Preflight missed historical personal copy';end if;
  check_count:=check_count+1;
  blocked:=false;
  begin delete from auth.users where id=subject_id;
  exception when foreign_key_violation then blocked:=true;end;
  if not blocked then raise exception 'Expected unresolved-reference deletion failure';end if;
  if not exists(select 1 from public.profiles where user_id=subject_id)
   or not exists(select 1 from auth.sessions where user_id=subject_id) then raise exception 'Rejected delete was not atomic';end if;
  check_count:=check_count+1;
  delete from public.push_subscriptions where id=push_id and user_id=subject_id;
  blocked:=false;
  begin delete from auth.users where id=subject_id;
  exception when foreign_key_violation then
   get stacked diagnostics failed_constraint=constraint_name;blocked:=true;
  end;
  if not blocked or failed_constraint<>'monthly_cost_reviews_completed_by_fkey' then
   raise exception 'Expected remaining monthly-review blocker';end if;
  check_count:=check_count+1;
  -- Synthetic example case: preserve the review and employment business rows,
  -- remove this person's unnecessary contact/history copies. This is not a legal
  -- retention decision or a universal customer-record anonymization algorithm.
  update public.monthly_cost_reviews r set completed_by=null where r.store_id=test_store_id and r.completed_by=subject_id;
  delete from private.profile_prior_values where user_id=subject_id and crew_id=subject_crew;
  delete from private.profile_adoption where user_id=subject_id and crew_id=subject_crew;
  delete from private.staff_access_events where target_user_id=subject_id and crew_id=subject_crew;
  delete from private.password_reset_events where target_user_id=subject_id;
  update public.crew set name='삭제된 직원',phone=null,notes='' where id=subject_crew;
  delete from auth.sessions where user_id=subject_id;
  perform set_config('request.jwt.claim.sub',subject_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',subject_id,'session_id',subject_id,'role','authenticated')::text,true);
  if private.is_live_manee_session() then raise exception 'Revoked synthetic session still live';end if;
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  check_count:=check_count+1;
  delete from auth.users where id=subject_id;
  if exists(select 1 from public.profiles where user_id=subject_id)
   or exists(select 1 from public.store_memberships where user_id=subject_id)
   or exists(select 1 from private.android_push_devices where user_id=subject_id) then raise exception 'Identity/push cascade incomplete';end if;
  if not exists(select 1 from public.crew where id=subject_crew and name='삭제된 직원' and phone is null)
   or not exists(select 1 from public.attendance where id=subject_attendance and check_out is null)
   or not exists(select 1 from public.monthly_cost_reviews r where r.store_id=test_store_id and r.completed_by is null) then
   raise exception 'Retained synthetic business records changed unexpectedly';end if;
  check_count:=check_count+1;
  -- The private test case intentionally remains to exercise disclosed retention.
  update private.account_deletion_requests set status='completed',reviewed_at=clock_timestamp(),note='Synthetic rehearsal only' where id=case_id;
  perform set_config('manee.deletion_crew_ids',(preflight->'linked_crew_ids')::text,true);
  -- @inventory-body
  postflight:=current_setting('manee.deletion_report')::jsonb;
  if (postflight->>'auth_user_exists')::boolean or (postflight->>'sessions')::int<>0 then raise exception 'Postflight found live identity/session';end if;
  if exists(select 1 from jsonb_array_elements(postflight->'user_references') r where (r->>'rows')::int<>0) then raise exception 'Residual direct subject reference';end if;
  if not exists(select 1 from jsonb_array_elements(postflight->'username_references') r
   where r->>'table'='private.account_deletion_requests' and (r->>'rows')::int=1) then raise exception 'Retained case was silently excluded';end if;
  check_count:=check_count+1;
  select jsonb_build_object('crew',(select to_jsonb(c) from public.crew c where id=keeper_crew),
   'attendance',(select to_jsonb(a) from public.attendance a where id=keeper_attendance),
   'profile',(select to_jsonb(p) from public.profiles p where user_id=keeper_id),
   'membership',(select to_jsonb(m) from public.store_memberships m where id=keeper_membership)) into keeper_after;
  if keeper_after is distinct from keeper_before then raise exception 'Other employee business data changed';end if;
  check_count:=check_count+1;
  raise exception using errcode='P4999',message='Rollback successful synthetic rehearsal';
 exception when sqlstate 'P4999' then null;
 end;
 -- PL/pgSQL variables survive the exception; every inner database mutation did not.
 foreach tab in array array['public.profiles','public.stores','public.crew','public.store_memberships',
  'public.attendance','public.push_subscriptions','public.monthly_cost_reviews',
  'private.profile_prior_values','private.profile_adoption','private.staff_access_events',
  'private.password_reset_events','private.android_push_devices','private.account_deletion_requests',
  'private.store_staff_code_history','private.android_push_deliveries'] loop
  execute format('select jsonb_build_object(''rows'',count(*),''hash'',md5(coalesce(string_agg(h,''|'' order by h),''''))) from (select md5(to_jsonb(t)::text) h from %s t) q',tab) into snapshot_value;
  after_state:=after_state||jsonb_build_object(tab,snapshot_value);
 end loop;
 if before_state is distinct from after_state then raise exception 'Post-rollback business fingerprints differ';end if;
 if exists(select 1 from auth.users where id in (subject_id,keeper_id))
  or exists(select 1 from auth.sessions where user_id in (subject_id,keeper_id)) then raise exception 'Synthetic Auth fixture survived';end if;
 check_count:=check_count+1;
 if check_count<>9 then raise exception 'Incomplete rehearsal';end if;
 perform set_config('manee_test.deletion_result',jsonb_build_object('checks_passed',check_count,
  'all_fixtures_rolled_back',true,'business_fingerprints_unchanged',true,
  'remaining_blocker_confirmed',failed_constraint,'other_employee_preserved',true,
  'synthetic_case_retention_visible',true,'client_authentication_tested',false,
  'limitations','SQL/session-root rehearsal only; no real sign-in, identity proof, Storage API erasure, Google cancellation or customer retention decision.')::text,true);
end $rehearsal$;
select current_setting('manee_test.deletion_result')::jsonb as deletion_rehearsal;
rollback;
