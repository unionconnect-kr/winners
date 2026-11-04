-- Narrow direct-read hardening. No customer rows, grants, or write policies change.
-- Execute inside one transaction. Drift and live-session compatibility checks abort on mismatch.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
CREATE TABLE IF NOT EXISTS private.manee_security_policy_backup (
 change_id text NOT NULL, table_name text NOT NULL, policy_name text NOT NULL,
 original_qual text NOT NULL, applied_qual text,
 captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(change_id,table_name,policy_name)
);
ALTER TABLE private.manee_security_policy_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.manee_security_policy_backup FROM public,anon,authenticated,service_role;
CREATE TEMP TABLE manee_policy_visibility_before(session_id uuid, user_id uuid, aal text, table_name text, fingerprint text) ON COMMIT DROP;
DO $baseline$
DECLARE s record; t text; fp text; original_claims text:=current_setting('request.jwt.claims',true);
BEGIN
 FOR s IN SELECT sess.id,sess.user_id,coalesce(sess.aal::text,'aal1') aal FROM auth.sessions sess
 JOIN public.profiles p ON p.user_id=sess.user_id AND p.status='active'
 WHERE sess.not_after IS NULL OR sess.not_after>now() LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.user_id,'session_id',s.id,'aal',s.aal,'role','authenticated')::text,true);
  FOREACH t IN ARRAY ARRAY['store_memberships','franchise_memberships','platform_admins','claims','claim_messages','franchise_join_requests','update_log','hq_announcements'] LOOP
   -- At AAL1 only self-membership reads must remain identical. Privileged reads intentionally require AAL2.
   IF s.aal='aal2' OR t IN ('store_memberships','franchise_memberships','platform_admins') THEN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,''[]'')) FROM public.%I r',t) INTO fp;
    EXECUTE 'RESET ROLE';
    INSERT INTO manee_policy_visibility_before VALUES(s.id,s.user_id,s.aal,t,fp);
   END IF;
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
END $baseline$;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='claim_messages' AND policyname='claim_messages_franchise_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(EXISTS ( SELECT 1
   FROM (claims c
     JOIN franchise_memberships fm ON ((fm.franchise_id = c.franchise_id)))
  WHERE ((c.id = claim_messages.claim_id) AND (fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = ''active''::text))))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: claim_messages.claim_messages_franchise_read'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','claim_messages','claim_messages_franchise_read','(EXISTS ( SELECT 1
   FROM (claims c
     JOIN franchise_memberships fm ON ((fm.franchise_id = c.franchise_id)))
  WHERE ((c.id = claim_messages.claim_id) AND (fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = ''active''::text))))');
ALTER POLICY "claim_messages_franchise_read" ON public."claim_messages" USING (((EXISTS ( SELECT 1
   FROM (claims c
     JOIN franchise_memberships fm ON ((fm.franchise_id = c.franchise_id)))
  WHERE ((c.id = claim_messages.claim_id) AND (fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = 'active'::text))))) AND ((select private.is_live_manee_session()) AND coalesce((select auth.jwt()->>'aal'),'') = 'aal2'));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='claim_messages' AND b.policy_name='claim_messages_franchise_read'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='claims' AND policyname='claims_franchise_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='((franchise_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = claims.franchise_id) AND (fm.status = ''active''::text)))))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: claims.claims_franchise_read'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','claims','claims_franchise_read','((franchise_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = claims.franchise_id) AND (fm.status = ''active''::text)))))');
ALTER POLICY "claims_franchise_read" ON public."claims" USING ((((franchise_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = claims.franchise_id) AND (fm.status = 'active'::text)))))) AND ((select private.is_live_manee_session()) AND coalesce((select auth.jwt()->>'aal'),'') = 'aal2'));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='claims' AND b.policy_name='claims_franchise_read'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='franchise_join_requests' AND policyname='franchise_join_requests_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(private.has_platform_role(ARRAY[''super_admin''::text, ''admin''::text, ''support''::text]) OR (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = franchise_join_requests.franchise_id) AND (fm.status = ''active''::text)))))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: franchise_join_requests.franchise_join_requests_read'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','franchise_join_requests','franchise_join_requests_read','(private.has_platform_role(ARRAY[''super_admin''::text, ''admin''::text, ''support''::text]) OR (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = franchise_join_requests.franchise_id) AND (fm.status = ''active''::text)))))');
ALTER POLICY "franchise_join_requests_read" ON public."franchise_join_requests" USING (((private.has_platform_role(ARRAY['super_admin'::text, 'admin'::text, 'support'::text]) OR (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = franchise_join_requests.franchise_id) AND (fm.status = 'active'::text)))))) AND ((select private.is_live_manee_session()) AND coalesce((select auth.jwt()->>'aal'),'') = 'aal2'));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='franchise_join_requests' AND b.policy_name='franchise_join_requests_read'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='franchise_memberships' AND policyname='franchise_memberships_select_self' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(( SELECT auth.uid() AS uid) = user_id)' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: franchise_memberships.franchise_memberships_select_self'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','franchise_memberships','franchise_memberships_select_self','(( SELECT auth.uid() AS uid) = user_id)');
ALTER POLICY "franchise_memberships_select_self" ON public."franchise_memberships" USING (((( SELECT auth.uid() AS uid) = user_id)) AND ((select private.is_live_manee_session())));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='franchise_memberships' AND b.policy_name='franchise_memberships_select_self'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hq_announcements' AND policyname='hq_announcements_franchise_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='((target_type = ''all''::text) OR ((target_type = ''franchise''::text) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = hq_announcements.target_id) AND (fm.status = ''active''::text))))))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: hq_announcements.hq_announcements_franchise_read'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','hq_announcements','hq_announcements_franchise_read','((target_type = ''all''::text) OR ((target_type = ''franchise''::text) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = hq_announcements.target_id) AND (fm.status = ''active''::text))))))');
ALTER POLICY "hq_announcements_franchise_read" ON public."hq_announcements" USING ((((target_type = 'all'::text) OR ((target_type = 'franchise'::text) AND (EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.franchise_id = hq_announcements.target_id) AND (fm.status = 'active'::text))))))) AND ((select private.is_live_manee_session()) AND (target_type = 'all' OR coalesce((select auth.jwt()->>'aal'),'') = 'aal2')));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='hq_announcements' AND b.policy_name='hq_announcements_franchise_read'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_admins' AND policyname='platform_admins_select_self' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(( SELECT auth.uid() AS uid) = user_id)' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: platform_admins.platform_admins_select_self'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','platform_admins','platform_admins_select_self','(( SELECT auth.uid() AS uid) = user_id)');
ALTER POLICY "platform_admins_select_self" ON public."platform_admins" USING (((( SELECT auth.uid() AS uid) = user_id)) AND ((select private.is_live_manee_session())));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='platform_admins' AND b.policy_name='platform_admins_select_self'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='store_memberships' AND policyname='store_memberships_select_self' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(( SELECT auth.uid() AS uid) = user_id)' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: store_memberships.store_memberships_select_self'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','store_memberships','store_memberships_select_self','(( SELECT auth.uid() AS uid) = user_id)');
ALTER POLICY "store_memberships_select_self" ON public."store_memberships" USING (((( SELECT auth.uid() AS uid) = user_id)) AND ((select private.is_live_manee_session())));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='store_memberships' AND b.policy_name='store_memberships_select_self'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $drift$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='update_log' AND policyname='update_log_franchise_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles::text='{authenticated}' AND qual='(EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = ''active''::text))))' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Policy changed since review: update_log.update_log_franchise_read'; END IF;
END $drift$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
VALUES('direct_reads_20261104','update_log','update_log_franchise_read','(EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = ''active''::text))))');
ALTER POLICY "update_log_franchise_read" ON public."update_log" USING (((EXISTS ( SELECT 1
   FROM franchise_memberships fm
  WHERE ((fm.user_id = ( SELECT auth.uid() AS uid)) AND (fm.status = 'active'::text))))) AND ((select private.is_live_manee_session()) AND coalesce((select auth.jwt()->>'aal'),'') = 'aal2'));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
 WHERE b.change_id='direct_reads_20261104' AND b.table_name='update_log' AND b.policy_name='update_log_franchise_read'
 AND p.schemaname='public' AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $verify$
DECLARE r record; fp text; original_claims text:=current_setting('request.jwt.claims',true);
BEGIN
 FOR r IN SELECT * FROM manee_policy_visibility_before LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.user_id,'session_id',r.session_id,'aal',r.aal,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,''[]'')) FROM public.%I t',r.table_name) INTO fp;
  EXECUTE 'RESET ROLE';
  IF fp IS DISTINCT FROM r.fingerprint THEN RAISE EXCEPTION 'Normal live-session visibility changed in %; rolled back',r.table_name; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);
END $verify$;
