SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Compare effective permissions for every current active-profile session, inside this transaction.
CREATE TEMP TABLE manee_guard_baseline ON COMMIT DROP AS
 SELECT s.id sid,s.user_id uid,m.store_id, false own,false manage,false admin
 FROM auth.sessions s JOIN public.profiles p ON p.user_id=s.user_id AND p.status='active'
 LEFT JOIN public.store_memberships m ON m.user_id=s.user_id AND m.status='active'
 WHERE s.not_after IS NULL OR s.not_after>now();
DO $check$ DECLARE r record; original text:=current_setting('request.jwt.claims',true); BEGIN
 FOR r IN SELECT * FROM manee_guard_baseline LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.uid,'session_id',r.sid,'role','authenticated')::text,true);
  UPDATE manee_guard_baseline SET own=private.has_store_membership(r.store_id),manage=private.has_store_membership(r.store_id,array['owner','manager']),admin=private.has_platform_role(array['super_admin','admin']) WHERE sid=r.sid AND store_id IS NOT DISTINCT FROM r.store_id;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(original,''),true);
END $check$;

CREATE TABLE IF NOT EXISTS private.manee_security_function_backup (change_id text, signature text, definition text NOT NULL, acl text, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(change_id,signature));
ALTER TABLE private.manee_security_function_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.manee_security_function_backup FROM public,anon,authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.has_platform_role(text[])'::regprocedure))<>'9c3eed9050e0c3fabeeca1a0ee99ea46' THEN RAISE EXCEPTION 'Function changed since verified snapshot: private.has_platform_role(text[])'; END IF; END $guard$;
INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl) SELECT 'session_guard_20261104','private.has_platform_role(text[])',pg_get_functiondef('private.has_platform_role(text[])'::regprocedure),proacl::text FROM pg_proc WHERE oid='private.has_platform_role(text[])'::regprocedure ON CONFLICT DO NOTHING;
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

DO $guard$ BEGIN IF md5(pg_get_functiondef('private.has_store_membership(uuid,text[])'::regprocedure))<>'61e8d1caca1b24cbb51a76f71264050e' THEN RAISE EXCEPTION 'Function changed since verified snapshot: private.has_store_membership(uuid,text[])'; END IF; END $guard$;
INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl) SELECT 'session_guard_20261104','private.has_store_membership(uuid,text[])',pg_get_functiondef('private.has_store_membership(uuid,text[])'::regprocedure),proacl::text FROM pg_proc WHERE oid='private.has_store_membership(uuid,text[])'::regprocedure ON CONFLICT DO NOTHING;
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


DO $check$ DECLARE r record; original text:=current_setting('request.jwt.claims',true); BEGIN
 FOR r IN SELECT * FROM manee_guard_baseline LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.uid,'session_id',r.sid,'role','authenticated')::text,true);
  IF private.has_store_membership(r.store_id) IS DISTINCT FROM r.own OR private.has_store_membership(r.store_id,array['owner','manager']) IS DISTINCT FROM r.manage OR private.has_platform_role(array['super_admin','admin']) IS DISTINCT FROM r.admin THEN RAISE EXCEPTION 'Active session permissions changed; abort deployment'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',r.uid,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
  IF private.has_store_membership(r.store_id) OR private.has_platform_role(array['super_admin','admin']) THEN RAISE EXCEPTION 'Revoked session not blocked; abort deployment'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(original,''),true);
END $check$;
