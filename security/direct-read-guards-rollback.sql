-- Run transactionally. Restore only the exact reviewed eight policy expressions.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE r record;
BEGIN
 IF (SELECT count(*) FROM private.manee_security_policy_backup WHERE change_id='direct_reads_20261104')<>8 THEN
  RAISE EXCEPTION 'Expected eight original policy backups';
 END IF;
 FOR r IN SELECT * FROM private.manee_security_policy_backup WHERE change_id='direct_reads_20261104' LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=r.table_name AND policyname=r.policy_name AND qual=r.applied_qual AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}') THEN
   RAISE EXCEPTION 'Policy changed after deployment; review rollback';
  END IF;
  EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',r.policy_name,r.table_name,r.original_qual);
 END LOOP;
END $rollback$;
