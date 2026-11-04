-- Security remediation: preserve business memberships and add live-session checks.
set local lock_timeout='5s';
set local statement_timeout='60s';
CREATE OR REPLACE FUNCTION private.is_live_manee_session()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from auth.sessions s join public.profiles p on p.user_id=s.user_id and p.status='active'
    where s.id=(select case when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F-]{36}$' then (auth.jwt()->>'session_id')::uuid else null end)
      and s.user_id=(select auth.uid()) and (s.not_after is null or s.not_after>now()));
$function$;
CREATE OR REPLACE FUNCTION private.has_store_membership(target_store_id uuid, allowed_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_live_manee_session() and exists (
    select 1 from public.store_memberships sm
    join public.profiles p on p.user_id=sm.user_id and p.status='active'
    join public.stores s on s.id=sm.store_id and s.archived_at is null
    left join public.crew c on c.id=sm.crew_id and c.store_id=sm.store_id
    where sm.user_id=(select auth.uid()) and sm.store_id=target_store_id and sm.status='active'
      and (
        allowed_roles is null
        or sm.role = any(allowed_roles)
        or (sm.role='staff' and c.is_manager and 'manager' = any(allowed_roles))
      )
      and (sm.role='owner' or (sm.role in ('staff','manager') and c.id is not null
        and (c.resign_date is null or c.resign_date > (now() at time zone 'Asia/Seoul')::date)))
  );
$function$;

CREATE OR REPLACE FUNCTION private.has_platform_role(allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_live_manee_session() and exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
      and pa.role = any(allowed_roles)
  );
$function$;

-- All direct authenticated table access must belong to an active, unrevoked session.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
 EXECUTE format('DROP POLICY IF EXISTS manee_security_live_session ON public.%I',t.relname);
 EXECUTE format('CREATE POLICY manee_security_live_session ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select private.is_live_manee_session())) WITH CHECK ((select private.is_live_manee_session()))',t.relname);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.is_live_manee_session() FROM public,anon;
GRANT EXECUTE ON FUNCTION private.is_live_manee_session() TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS private.manee_service_usage (
 service text NOT NULL, bucket text NOT NULL, window_start timestamptz NOT NULL,
 calls integer NOT NULL CHECK(calls>=0), PRIMARY KEY(service,bucket,window_start)
);
ALTER TABLE private.manee_service_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.manee_service_usage FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.manee_authorize_service(p_store_id uuid,p_service text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); now_at timestamptz:=now(); day_at timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 minute_at timestamptz:=date_trunc('minute',now()); lim integer; global_lim integer; b text; w timestamptz; cap integer; n integer;
BEGIN
 IF uid IS NULL OR NOT private.is_live_manee_session() THEN RETURN jsonb_build_object('allowed',false,'code','session');END IF;
 IF p_service NOT IN ('ask-app','read-receipt','send-push') THEN RETURN jsonb_build_object('allowed',false,'code','service');END IF;
 IF NOT (private.has_store_membership(p_store_id,case when p_service='send-push' then array['owner','manager']::text[] else array['owner']::text[] end)
   OR private.has_platform_role(array['super_admin','admin']::text[])) THEN RETURN jsonb_build_object('allowed',false,'code','permission');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND archived_at IS NULL) THEN RETURN jsonb_build_object('allowed',false,'code','store');END IF;
 IF NOT private.manee_store_write_entitled(p_store_id) THEN RETURN jsonb_build_object('allowed',false,'code','subscription');END IF;
 lim:=case p_service when 'ask-app' then 100 when 'read-receipt' then 50 else 100 end;
 global_lim:=case p_service when 'send-push' then 5000 else 1000 end;
 -- Serialize quota checks across instances. No client-provided user, role, quota or IP is trusted.
 PERFORM pg_advisory_xact_lock(hashtextextended('manee-service-quota:'||p_service,0));
 FOR b,w,cap IN SELECT * FROM (VALUES ('user:'||uid::text,day_at,lim),('store:'||p_store_id::text,day_at,lim),('global',day_at,global_lim),('minute:'||uid::text,minute_at,5)) q LOOP
   SELECT calls INTO n FROM private.manee_service_usage WHERE service=p_service AND bucket=b AND window_start=w;
   IF coalesce(n,0)>=cap THEN RETURN jsonb_build_object('allowed',false,'code','rate_limit');END IF;
 END LOOP;
 FOR b,w,cap IN SELECT * FROM (VALUES ('user:'||uid::text,day_at,lim),('store:'||p_store_id::text,day_at,lim),('global',day_at,global_lim),('minute:'||uid::text,minute_at,5)) q LOOP
   INSERT INTO private.manee_service_usage(service,bucket,window_start,calls) VALUES(p_service,b,w,1)
   ON CONFLICT(service,bucket,window_start) DO UPDATE SET calls=manee_service_usage.calls+1;
 END LOOP;
 RETURN jsonb_build_object('allowed',true);
END $$;
CREATE OR REPLACE FUNCTION public.manee_authorize_service(p_store_id uuid,p_service text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.manee_authorize_service(p_store_id,p_service) $$;
REVOKE ALL ON FUNCTION private.manee_authorize_service(uuid,text),public.manee_authorize_service(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.manee_authorize_service(uuid,text),public.manee_authorize_service(uuid,text) TO authenticated;
