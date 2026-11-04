SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Intentional rollback restores the previous MFA gap; use only for incident recovery.
DO $rollback$
DECLARE old_def text; expected_def text;
BEGIN
 SELECT definition INTO STRICT old_def FROM private.manee_security_function_backup
 WHERE change_id='recovery_mfa_20261104' AND signature='private.manee_support_recovery_service(text,jsonb)';
 expected_def:=replace(old_def,$needle$    select pa2.role into target_admin_role$needle$,$patch$    -- The Edge verifies the JWT before forwarding actor_aal. Stored session AAL alone
    -- cannot reject an older AAL1 JWT for a session that was subsequently elevated.
    if actor_role is not null and (
      (p_payload->>'actor_aal') is distinct from 'aal2' or not exists (
        select 1 from auth.sessions s where s.id=sid and s.user_id=actor and s.aal::text='aal2'
      )
    ) then return jsonb_build_object('ok',false,'error','mfa_required'); end if;

    select pa2.role into target_admin_role$patch$);
 IF pg_get_functiondef('private.manee_support_recovery_service(text,jsonb)'::regprocedure)<>expected_def THEN
  RAISE EXCEPTION 'Recovery function changed after deployment'; END IF;
 EXECUTE old_def;
 DELETE FROM private.manee_security_function_backup WHERE change_id='recovery_mfa_20261104'
 AND signature='private.manee_support_recovery_service(text,jsonb)';
END $rollback$;
