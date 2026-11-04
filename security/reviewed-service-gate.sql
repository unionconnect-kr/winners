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
 IF NOT ((CASE p_service
   WHEN 'send-push' THEN private.has_store_membership(p_store_id,array['owner','manager','staff']::text[])
   WHEN 'read-receipt' THEN private.has_sales_access(p_store_id)
   ELSE private.has_store_membership(p_store_id,array['owner']::text[]) END)
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
 RETURN jsonb_build_object('allowed',true,'pushMode',CASE WHEN private.has_store_membership(p_store_id,array['owner','manager']::text[]) OR private.has_platform_role(array['super_admin','admin']::text[]) THEN 'manager' ELSE 'member' END);
END $$;
CREATE OR REPLACE FUNCTION public.manee_authorize_service(p_store_id uuid,p_service text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.manee_authorize_service(p_store_id,p_service) $$;
REVOKE ALL ON FUNCTION private.manee_authorize_service(uuid,text),public.manee_authorize_service(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION private.manee_authorize_service(uuid,text),public.manee_authorize_service(uuid,text) TO authenticated;
