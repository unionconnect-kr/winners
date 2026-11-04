-- Staging only. Existing production reservation (7 days) and completed-case
-- (720 hours) rules are reused verbatim; SMS follows its existing 7-day policy.
-- First disposal is irreversible; disabling jobs only stops future disposal.
DO $$BEGIN
 IF to_regclass('private.manee_sms_challenges') IS NULL OR
 to_regprocedure('private.manee_purge_expired_sms_challenges(integer)') IS NULL THEN
  RAISE EXCEPTION 'Expected reviewed staging SMS schema';
 END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname IN ('manee-reservation-retention','manee-completed-deletion-case-retention','manee-sms-challenge-retention')) THEN
  RAISE EXCEPTION 'Retention schedule changed since review';
 END IF;
END $$;
SELECT cron.schedule('manee-reservation-retention','* * * * *','select private.manee_purge_expired_reservations(500);');
SELECT cron.schedule('manee-completed-deletion-case-retention','15 * * * *','select private.manee_purge_completed_deletion_cases(500);');
SELECT cron.schedule('manee-sms-challenge-retention','*/10 * * * *','select private.manee_purge_expired_sms_challenges(500);');
SELECT private.manee_purge_expired_reservations(500);
SELECT private.manee_purge_completed_deletion_cases(500);
SELECT private.manee_purge_expired_sms_challenges(500);
