-- Apply in one transaction; no business rows or session records are changed.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $preflight$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
 AND policyname='profiles_select_self' AND cmd='SELECT' AND permissive='PERMISSIVE'
 AND roles::text='{authenticated}' AND qual='(( SELECT auth.uid() AS uid) = user_id)' AND with_check IS NULL)
 THEN RAISE EXCEPTION 'Profile policy changed since review'; END IF;
END $preflight$;
CREATE TEMP TABLE manee_profile_baseline(session_id uuid,user_id uuid,aal text,fingerprint text) ON COMMIT DROP;
DO $baseline$
DECLARE s record; fp text; claims text:=current_setting('request.jwt.claims',true);
BEGIN
 FOR s IN SELECT a.id,a.user_id,coalesce(a.aal::text,'aal1') aal FROM auth.sessions a
 JOIN public.profiles p ON p.user_id=a.user_id AND p.status='active'
 WHERE a.not_after IS NULL OR a.not_after>now() LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.user_id,'session_id',s.id,'aal',s.aal,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY to_jsonb(p)::text)::text,'[]')) INTO fp FROM public.profiles p;
  EXECUTE 'RESET ROLE';
  INSERT INTO manee_profile_baseline VALUES(s.id,s.user_id,s.aal,fp);
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(claims,''),true);
END $baseline$;
INSERT INTO private.manee_security_policy_backup(change_id,table_name,policy_name,original_qual)
SELECT 'profile_session_20261104',tablename,policyname,qual FROM pg_policies
WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_self';
ALTER POLICY profiles_select_self ON public.profiles
USING (((SELECT auth.uid())=user_id) AND (SELECT private.is_live_manee_session()));
UPDATE private.manee_security_policy_backup b SET applied_qual=p.qual FROM pg_policies p
WHERE b.change_id='profile_session_20261104' AND p.schemaname='public'
AND p.tablename=b.table_name AND p.policyname=b.policy_name;
DO $verify$
DECLARE s record; fp text; claims text:=current_setting('request.jwt.claims',true);
BEGIN
 FOR s IN SELECT * FROM manee_profile_baseline LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.user_id,'session_id',s.session_id,'aal',s.aal,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY to_jsonb(p)::text)::text,'[]')) INTO fp FROM public.profiles p;
  EXECUTE 'RESET ROLE';
  IF fp IS DISTINCT FROM s.fingerprint THEN RAISE EXCEPTION 'Active profile visibility changed'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(claims,''),true);
END $verify$;
