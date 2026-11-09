begin;

-- Read only the caller's canonical verification records. The private tables
-- stay inaccessible to app roles, and the public RPC returns no contact data.
create function private.manee_account_verification_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_claim text := auth.jwt()->>'session_id';
  v_session_id uuid;
  v_phone_verified boolean;
  v_email_verified boolean;
  v_phone_method text;
begin
  if v_session_claim ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_session_id := v_session_claim::uuid;
  end if;

  if v_user_id is null or v_session_id is null or not exists (
    select 1
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    join public.profiles p on p.user_id = u.id and p.status = 'active'
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > now())
      and (u.banned_until is null or u.banned_until < now())
      and not exists (
        select 1 from public.platform_admins a
        where a.user_id = v_user_id and a.status = 'active'
      )
  ) then
    raise exception 'Account verification status unavailable' using errcode = '42501';
  end if;

  select exists (
    select 1 from private.manee_sms_bindings b
    where b.user_id = v_user_id and b.verified_at is not null
  ), exists (
    select 1 from private.manee_email_accounts e
    where e.user_id = v_user_id and e.email is not null and e.verified_at is not null
  ) into v_phone_verified, v_email_verified;

  if not v_phone_verified then
    v_phone_method := private.manee_phone_bind_method(v_user_id, v_session_id);
    if v_phone_method is null or v_phone_method not in ('password', 'recent_social', 'social_reauth', 'unavailable') then
      v_phone_method := 'unavailable';
    end if;
  end if;

  return jsonb_build_object(
    'phone_verified', v_phone_verified,
    'email_verified', v_email_verified,
    'phone_method', v_phone_method
  );
end;
$function$;

create function public.manee_account_verification_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.manee_account_verification_status();
$function$;

revoke all on function private.manee_account_verification_status(),
  public.manee_account_verification_status() from public, anon, authenticated, service_role;
grant execute on function private.manee_account_verification_status(),
  public.manee_account_verification_status() to authenticated;

commit;
