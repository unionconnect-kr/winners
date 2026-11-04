SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS private.manee_security_function_backup (change_id text, signature text, definition text NOT NULL, acl text, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(change_id,signature));
ALTER TABLE private.manee_security_function_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.manee_security_function_backup FROM public,anon,authenticated;
INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl) SELECT 'admin_mfa_20261104','private.has_franchise_membership(uuid,text[])',pg_get_functiondef('private.has_franchise_membership(uuid,text[])'::regprocedure),proacl::text FROM pg_proc WHERE oid='private.has_franchise_membership(uuid,text[])'::regprocedure ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION private.has_franchise_membership(target_franchise_id uuid, allowed_roles text[] DEFAULT NULL::text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_live_manee_session() and coalesce(auth.jwt()->>'aal','')='aal2' and exists (
    select 1
    from public.franchise_memberships fm
    where fm.user_id = (select auth.uid())
      and fm.franchise_id = target_franchise_id
      and fm.status = 'active'
      and (allowed_roles is null or fm.role = any(allowed_roles))
  );
$function$;
INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl) SELECT 'admin_mfa_20261104','private.has_platform_role(text[])',pg_get_functiondef('private.has_platform_role(text[])'::regprocedure),proacl::text FROM pg_proc WHERE oid='private.has_platform_role(text[])'::regprocedure ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION private.has_platform_role(allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_live_manee_session() and coalesce(auth.jwt()->>'aal','')='aal2' and exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
      and pa.role = any(allowed_roles)
  );
$function$;
INSERT INTO private.manee_security_function_backup(change_id,signature,definition,acl) SELECT 'admin_mfa_20261104','private.is_platform_admin()',pg_get_functiondef('private.is_platform_admin()'::regprocedure),proacl::text FROM pg_proc WHERE oid='private.is_platform_admin()'::regprocedure ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION private.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_live_manee_session() and coalesce(auth.jwt()->>'aal','')='aal2' and exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
  );
$function$;
