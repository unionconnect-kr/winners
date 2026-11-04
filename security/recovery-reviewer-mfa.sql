SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Deploy the matching Edge function first. Only its verified JWT claim is trusted.
DO $migration$
DECLARE old_def text; new_def text;
BEGIN
 old_def:=pg_get_functiondef('private.manee_support_recovery_service(text,jsonb)'::regprocedure);
 IF md5(old_def) NOT IN ('a1c4aa54724fe60e48fcc40be33fc308','bd1d30b2f02c1e55ec10aecffed7532a') THEN
  RAISE EXCEPTION 'Recovery function changed since review'; END IF;
 IF has_function_privilege('anon','public.manee_support_recovery_service(text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.manee_support_recovery_service(text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','private.manee_support_recovery_service(text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','private.manee_support_recovery_service(text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Recovery service must be service-role only'; END IF;
 INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl)
 SELECT 'recovery_mfa_20261104','private.manee_support_recovery_service(text,jsonb)',old_def,proacl::text
 FROM pg_proc WHERE oid='private.manee_support_recovery_service(text,jsonb)'::regprocedure;
 new_def:=replace(old_def,$needle$    select pa2.role into target_admin_role$needle$,$patch$    -- The Edge verifies the JWT before forwarding actor_aal. Stored session AAL alone
    -- cannot reject an older AAL1 JWT for a session that was subsequently elevated.
    if actor_role is not null and (
      (p_payload->>'actor_aal') is distinct from 'aal2' or not exists (
        select 1 from auth.sessions s where s.id=sid and s.user_id=actor and s.aal::text='aal2'
      )
    ) then return jsonb_build_object('ok',false,'error','mfa_required'); end if;

    select pa2.role into target_admin_role$patch$);
 IF new_def=old_def THEN RAISE EXCEPTION 'Recovery guard insertion failed'; END IF;
 EXECUTE new_def;
END $migration$;
