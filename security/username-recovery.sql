-- Reuse the existing bounded SMS history and shared abuse limits.
ALTER TABLE private.manee_sms_challenges DROP CONSTRAINT manee_sms_challenges_purpose_check;
ALTER TABLE private.manee_sms_challenges ADD CONSTRAINT manee_sms_challenges_purpose_check
  CHECK (purpose IN ('signup_owner','signup_staff','reset','bind','find_username'));

CREATE OR REPLACE FUNCTION private.manee_find_username_service(p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c private.manee_sms_challenges%rowtype;
  cid uuid; ph text; phash text; allowed boolean; names jsonb;
  bad jsonb := jsonb_build_object('ok',false,'error','verification_invalid');
BEGIN
  IF p_action = 'request' THEN
    cid := (p_payload->>'id')::uuid;
    ph := p_payload->>'phone'; phash := p_payload->>'phone_hash';
    IF cid IS NULL OR ph IS NULL OR ph !~ '^\+8210[0-9]{8}$'
      OR phash IS NULL OR phash !~ '^[0-9a-f]{64}$'
      OR coalesce(p_payload->>'ip_hash','') !~ '^[0-9a-f]{64}$'
      OR coalesce(p_payload->>'code_hash','') !~ '^[0-9a-f]{64}$' THEN RETURN bad; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('manee-sms:'||phash,0));
    IF EXISTS (SELECT 1 FROM private.manee_sms_challenges
      WHERE phone_hash=phash AND created_at>clock_timestamp()-interval '60 seconds') THEN
      RETURN jsonb_build_object('ok',false,'error','rate_limited','retry_after',60);
    END IF;
    IF NOT public.consume_auth_rate_limit('sms_phone_hour',phash,3600,5)
      OR NOT public.consume_auth_rate_limit('sms_phone_day',phash,86400,10)
      OR NOT public.consume_auth_rate_limit('sms_ip_hour',p_payload->>'ip_hash',3600,10)
      OR NOT public.consume_auth_rate_limit('sms_staging_day','all',86400,100) THEN
      RETURN jsonb_build_object('ok',false,'error','rate_limited','retry_after',3600);
    END IF;
    -- Public contact information is not evidence of phone ownership. Ordinary
    -- accounts with a linked social identity still have a recoverable username.
    SELECT EXISTS (
      SELECT 1 FROM private.manee_sms_bindings b
      JOIN public.profiles p ON p.user_id=b.user_id
      JOIN auth.users u ON u.id=b.user_id
      WHERE b.phone_e164=ph AND p.status='active' AND p.username IS NOT NULL
        AND u.email ~ '^u-[0-9a-f]{32}@auth\.manee\.local$'
        AND coalesce(u.encrypted_password,'')<>''
        AND (u.banned_until IS NULL OR u.banned_until<now())
        AND NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id AND a.status='active')
    ) INTO allowed;
    DELETE FROM private.manee_sms_challenges WHERE created_at<clock_timestamp()-interval '7 days';
    UPDATE private.manee_sms_challenges SET status='expired',code_hash=NULL,proof_hash=NULL
      WHERE phone_hash=phash AND purpose='find_username' AND status IN ('sending','sent','verified');
    INSERT INTO private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,code_hash,status)
      VALUES(cid,'find_username','',ph,phash,CASE WHEN allowed THEN p_payload->>'code_hash' END,
        CASE WHEN allowed THEN 'sending' ELSE 'failed' END);
    RETURN jsonb_build_object('ok',true,'send_allowed',allowed);
  ELSIF p_action IN ('sent','failed') THEN
    UPDATE private.manee_sms_challenges SET status=p_action,
      code_hash=CASE WHEN p_action='sent' THEN code_hash END,
      expires_at=clock_timestamp()+interval '3 minutes'
      WHERE id=(p_payload->>'id')::uuid AND purpose='find_username' AND status='sending';
    RETURN jsonb_build_object('ok',found);
  ELSIF p_action='verify' THEN
    SELECT * INTO c FROM private.manee_sms_challenges
      WHERE id=(p_payload->>'id')::uuid AND purpose='find_username' FOR UPDATE;
    IF NOT found OR c.status<>'sent' OR c.expires_at<=clock_timestamp() OR c.failed_attempts>=5 THEN RETURN bad; END IF;
    IF c.code_hash IS NULL OR c.code_hash IS DISTINCT FROM (p_payload->>'code_hash') THEN
      UPDATE private.manee_sms_challenges SET failed_attempts=failed_attempts+1,
        status=CASE WHEN failed_attempts+1>=5 THEN 'expired' ELSE status END,
        code_hash=CASE WHEN failed_attempts+1>=5 THEN NULL ELSE code_hash END WHERE id=c.id;
      RETURN bad;
    END IF;
    -- Consume the code while holding the row lock. No session/password mutation.
    UPDATE private.manee_sms_challenges SET status='completed',code_hash=NULL,proof_hash=NULL,
      finished_at=clock_timestamp() WHERE id=c.id;
    SELECT coalesce(jsonb_agg(q.username ORDER BY q.username),'[]'::jsonb) INTO names FROM (
      SELECT DISTINCT p.username FROM private.manee_sms_bindings b
      JOIN public.profiles p ON p.user_id=b.user_id JOIN auth.users u ON u.id=b.user_id
      WHERE b.phone_e164=c.phone_e164 AND b.verified_at<=c.created_at
        AND p.status='active' AND p.username IS NOT NULL
        AND u.email ~ '^u-[0-9a-f]{32}@auth\.manee\.local$'
        AND coalesce(u.encrypted_password,'')<>''
        AND (u.banned_until IS NULL OR u.banned_until<now())
        AND NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id AND a.status='active')
      ORDER BY p.username LIMIT 20
    ) q;
    RETURN jsonb_build_object('ok',true,'usernames',names);
  END IF;
  RETURN bad;
END;
$$;
REVOKE ALL ON FUNCTION private.manee_find_username_service(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.manee_find_username_service(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.manee_find_username_service(p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.manee_find_username_service(p_action,p_payload);
$$;
REVOKE ALL ON FUNCTION public.manee_find_username_service(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.manee_find_username_service(text,jsonb) TO service_role;
