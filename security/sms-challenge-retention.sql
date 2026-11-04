-- Existing SMS service already discards challenges after seven days on new sends.
-- Make that established deadline independent of whether another SMS is sent.
-- Account bindings and rate-limit records are deliberately outside this function.
CREATE OR REPLACE FUNCTION private.manee_purge_expired_sms_challenges(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $function$
DECLARE removed integer;
BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Maintenance requires no customer session' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid retention batch size' USING ERRCODE='22023'; END IF;
 WITH due AS (
  SELECT id FROM private.manee_sms_challenges
  WHERE created_at<now()-interval '168 hours' AND expires_at<now()
   AND (proof_expires_at IS NULL OR proof_expires_at<now())
   AND status<>'consuming'
  ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), erased AS (
  DELETE FROM private.manee_sms_challenges c USING due WHERE c.id=due.id RETURNING c.id
 ) SELECT count(*)::integer INTO removed FROM erased;
 RETURN removed;
END $function$;
REVOKE ALL ON FUNCTION private.manee_purge_expired_sms_challenges(integer) FROM public,anon,authenticated,service_role;
