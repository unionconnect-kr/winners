-- New social memberships obey the same verified-phone/email policy as ordinary
-- signup. Existing social memberships keep their original login and link flow.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function private.manee_social_signup(p_user_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 profile public.profiles%rowtype;
 social_provider text:=p_payload->>'provider';
 account_role text:=p_payload->>'role';
 display_name text:=btrim(coalesce(p_payload->>'displayName',''));
 store_name text:=btrim(coalesce(p_payload->>'storeName',''));
 username text:='s_'||substr(replace(p_user_id::text,'-',''),1,28);
 sid uuid; store_id uuid; registered jsonb; claimed jsonb; completed jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'Service access required' using errcode='42501';
 end if;
 if p_user_id is null or social_provider is null or social_provider not in ('kakao','naver','apple')
  or not exists(select 1 from auth.users u where u.id=p_user_id and (u.banned_until is null or u.banned_until<=now()))
  or not exists(select 1 from auth.identities i where i.user_id=p_user_id
   and i.provider=case when social_provider='naver' then 'custom:naver' else social_provider end) then
  raise exception 'Verified social identity required' using errcode='42501';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('manee-social:'||p_user_id::text,0));
 select * into profile from public.profiles p where p.user_id=p_user_id;
 if found then
  if profile.status<>'active' then raise exception 'Account unavailable' using errcode='42501'; end if;
  return jsonb_build_object('ok',true,'alreadyRegistered',true,'userId',p_user_id);
 end if;
 if account_role is null or account_role not in ('owner','staff')
  or length(display_name) not between 1 and 50 or display_name ~ '[<>[:cntrl:]]'
  or p_payload->>'termsVersion' is distinct from '2026-10-26'
  or p_payload->>'privacyVersion' is distinct from '2026-10-26'
  or p_payload->>'termsAccepted' is distinct from 'true'
  or p_payload->>'privacyAccepted' is distinct from 'true'
  or p_payload->>'ageConfirmed' is distinct from 'true' then
  raise exception 'Required signup information missing' using errcode='22023';
 end if;
 if account_role='owner' and (length(store_name) not between 1 and 80 or store_name ~ '[<>[:cntrl:]]') then
  raise exception 'Invalid store name' using errcode='22023';
 end if;
 sid:=nullif(p_payload->>'session_id','')::uuid;
 if sid is null or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=p_user_id
   and (s.not_after is null or s.not_after>now())) then
  raise exception 'phone_verification_required' using errcode='42501';
 end if;
 if coalesce(p_payload->>'sms_challenge_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
   or coalesce(p_payload->>'sms_proof_hash','') !~ '^[0-9a-f]{64}$' then
  raise exception 'phone_verification_required' using errcode='22023';
 end if;
 registered:=private.manee_email_service('register',jsonb_build_object('user_id',p_user_id,'email',p_payload->>'recovery_email'));
 if registered->>'ok' is distinct from 'true' then
  if registered->>'error'='email_taken' then raise exception 'email_taken' using errcode='23505'; end if;
  raise exception 'invalid_email' using errcode='22023';
 end if;
 claimed:=private.manee_sms_service('claim',jsonb_build_object(
  'id',p_payload->>'sms_challenge_id','purpose','signup_social','username',username,
  'proof_hash',p_payload->>'sms_proof_hash','user_id',p_user_id,'session_id',sid));
 if claimed->>'ok' is distinct from 'true' then
  if claimed->>'error'='phone_taken' then raise exception 'phone_taken' using errcode='23505'; end if;
  raise exception 'phone_verification_required' using errcode='22023';
 end if;
 if account_role='owner' then
  store_id:=public.bootstrap_owner_account(p_user_id,username,display_name,store_name,
   nullif(btrim(coalesce(p_payload->>'franchiseCode','')),''));
 else
  perform public.bootstrap_staff_account(p_user_id,username,display_name);
 end if;
 completed:=private.manee_sms_service('complete',jsonb_build_object(
  'id',p_payload->>'sms_challenge_id','operation_id',claimed->>'operation_id','user_id',p_user_id));
 if completed->>'ok' is distinct from 'true' then
  if completed->>'error'='phone_taken' then raise exception 'phone_taken' using errcode='23505'; end if;
  raise exception 'signup_completion_failed' using errcode='P0001';
 end if;
 insert into private.social_signup_consents(user_id,provider,terms_version,privacy_version,age_14_plus_confirmed)
 values(p_user_id,social_provider,'2026-10-26','2026-10-26',true);
 return jsonb_build_object('ok',true,'alreadyRegistered',false,'userId',p_user_id,'storeId',store_id);
end; $$;
revoke all on function private.manee_social_signup(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.manee_social_signup(uuid,jsonb) to service_role;
revoke all on function public.manee_social_signup(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manee_social_signup(uuid,jsonb) to service_role;
commit;
