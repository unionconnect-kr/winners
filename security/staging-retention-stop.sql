-- Stop only these reviewed jobs. Already expired records cannot be restored here.
DO $$DECLARE r record;BEGIN
 FOR r IN SELECT * FROM cron.job WHERE jobname IN ('manee-reservation-retention','manee-completed-deletion-case-retention','manee-sms-challenge-retention') LOOP
  IF r.command<>CASE r.jobname
   WHEN 'manee-reservation-retention' THEN 'select private.manee_purge_expired_reservations(500);'
   WHEN 'manee-completed-deletion-case-retention' THEN 'select private.manee_purge_completed_deletion_cases(500);'
   ELSE 'select private.manee_purge_expired_sms_challenges(500);' END THEN
    RAISE EXCEPTION 'Retention command changed after deployment';
  END IF;
  PERFORM cron.unschedule(r.jobid);
 END LOOP;
END $$;
