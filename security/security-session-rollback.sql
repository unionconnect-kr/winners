BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION private.has_platform_role(allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
      and pa.status = 'active'
      and pa.role = any(allowed_roles)
  );
$function$;
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
  select exists (
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
DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='manee_security_live_session' LOOP EXECUTE format('DROP POLICY manee_security_live_session ON public.%I',t.tablename);END LOOP;END $$;
COMMIT;
