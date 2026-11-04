SET LOCAL lock_timeout='5s';
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM private.manee_security_policy_backup
 WHERE change_id='profile_session_20261104' AND table_name='profiles' AND policy_name='profiles_select_self';
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=b.table_name
  AND policyname=b.policy_name AND qual=b.applied_qual AND cmd='SELECT' AND roles::text='{authenticated}'
  AND permissive='PERMISSIVE' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Profile policy changed after deployment'; END IF;
 EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',b.policy_name,b.table_name,b.original_qual);
END $rollback$;
