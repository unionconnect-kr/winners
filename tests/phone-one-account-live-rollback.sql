-- Read/rollback rehearsal only. Uses two short-lived synthetic proof rows,
-- creates no Auth user/store/profile, sends no SMS, and commits no data.
begin;
set local statement_timeout='15s';
do $test$
declare first_id uuid:='15200000-0000-4000-8000-000000008001';
 second_id uuid:='15200000-0000-4000-8000-000000008002';
 first_result jsonb;second_result jsonb;released jsonb;bad_complete jsonb;
 destination text:='+821000000000';
begin
 if exists(select 1 from private.manee_sms_bindings where phone_e164=destination)
   or exists(select 1 from private.manee_sms_challenges where phone_e164=destination and status='consuming')
   or public.is_manee_username_reserved('qa152_phone_owner')
   or public.is_manee_username_reserved('qa152_phone_staff') then
   raise exception 'Synthetic phone fixture is already occupied'; end if;
 insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,proof_hash,status,proof_expires_at)
 values(first_id,'signup_owner','qa152_phone_owner',destination,repeat('a',64),repeat('a',64),'verified',clock_timestamp()+interval '10 minutes'),
       (second_id,'signup_staff','qa152_phone_staff',destination,repeat('b',64),repeat('b',64),'verified',clock_timestamp()+interval '10 minutes');
 first_result:=public.manee_sms_service('claim',jsonb_build_object('id',first_id,'purpose','signup_owner','username','qa152_phone_owner','proof_hash',repeat('a',64)));
 if first_result->>'ok' is distinct from 'true' then raise exception 'First phone claim failed'; end if;
 second_result:=public.manee_sms_service('claim',jsonb_build_object('id',second_id,'purpose','signup_staff','username','qa152_phone_staff','proof_hash',repeat('b',64)));
 if second_result->>'error' is distinct from 'phone_taken' then raise exception 'Duplicate phone proof was not blocked'; end if;
 bad_complete:=public.manee_sms_service('complete',jsonb_build_object('id',first_id,'operation_id',first_result->>'operation_id','user_id','15200000-0000-4000-8000-000000008003'));
 if bad_complete->>'ok' is distinct from 'false' then raise exception 'Unregistered identity acquired a binding'; end if;
 released:=public.manee_sms_service('release_signup',jsonb_build_object('id',first_id,'operation_id',first_result->>'operation_id','purpose','signup_owner','username','qa152_phone_owner','proof_hash',repeat('a',64),'reason','weak_password'));
 if released->>'ok' is distinct from 'true' then raise exception 'Definitive rejection failed to release proof'; end if;
 second_result:=public.manee_sms_service('claim',jsonb_build_object('id',second_id,'purpose','signup_staff','username','qa152_phone_staff','proof_hash',repeat('b',64)));
 if second_result->>'ok' is distinct from 'true' then raise exception 'Released phone reservation stayed locked'; end if;
 if exists(select 1 from private.manee_sms_bindings where phone_e164=destination) then raise exception 'Rehearsal unexpectedly created a phone binding'; end if;
end $test$;
select 'passed' as phone_claim_release_rollback_rehearsal;
rollback;
