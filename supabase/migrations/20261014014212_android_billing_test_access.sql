begin;
create table private.android_billing_testers(
 user_id uuid primary key references auth.users(id) on delete cascade,
 store_id uuid not null references public.stores(id) on delete cascade,
 expires_at timestamptz not null
);
alter table private.android_billing_testers enable row level security;
revoke all on private.android_billing_testers from public,anon,authenticated,service_role;
-- An administrator assigns one expiring test store per user. No self-enrolment.
create function private.manee_android_billing_test_access(p_store_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.manee_android_push_context(p_store_id);
 return exists(select 1 from private.android_billing_testers
 where user_id=auth.uid() and store_id=p_store_id and expires_at>now());
end $$;
create function public.manee_android_billing_test_access(p_store_id uuid) returns boolean
language sql security invoker set search_path='' as $$select private.manee_android_billing_test_access(p_store_id)$$;
revoke all on function private.manee_android_billing_test_access(uuid),public.manee_android_billing_test_access(uuid) from public,anon,service_role;
grant execute on function private.manee_android_billing_test_access(uuid),public.manee_android_billing_test_access(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
