-- Additive setup; no store is activated or billed by this migration.
-- Logistics usage is operator-maintained, never owner-editable.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table private.factory_logistics_accounts (
 store_id uuid primary key references public.stores(id) on delete cascade,
 status text not null check(status in ('pending','active','inactive')),
 updated_at timestamptz not null default now()
);
create table private.factory_recipes (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 120),
 summary text not null default '', published boolean not null default false,
 instructions text not null, video_url text check(video_url is null or video_url ~ '^https://'),
 updated_at timestamptz not null default now()
);
alter table private.factory_logistics_accounts enable row level security;
alter table private.factory_recipes enable row level security;
revoke all on private.factory_logistics_accounts,private.factory_recipes from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,insert,update,delete on private.factory_logistics_accounts,private.factory_recipes to service_role;
create policy factory_logistics_operator on private.factory_logistics_accounts to service_role using(true) with check(true);
create policy factory_recipes_operator on private.factory_recipes to service_role using(true) with check(true);
create function private.factory_assert_owner(p_store_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not private.has_store_membership(p_store_id,array['owner']::text[])
  or not exists(select 1 from public.profiles where user_id=auth.uid() and status='active')
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
  or not exists(select 1 from public.stores where id=p_store_id and archived_at is null) then
  raise exception 'Store owner access required' using errcode='42501';
 end if;
end $$;
create function private.factory_catalog(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare active boolean; recipes jsonb;
begin
 perform private.factory_assert_owner(p_store_id);
 select exists(select 1 from private.factory_logistics_accounts where store_id=p_store_id and status='active') into active;
 -- Explicit projection: protected instructions and video never enter the catalog.
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'summary',summary) order by title,id),'[]'::jsonb)
  into recipes from private.factory_recipes where published;
 return jsonb_build_object('logistics_active',active,'recipes',recipes);
end $$;
create function private.factory_recipe(p_store_id uuid,p_recipe_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.factory_assert_owner(p_store_id);
 if not exists(select 1 from private.factory_logistics_accounts where store_id=p_store_id and status='active') then
  raise exception 'Logistics usage required' using errcode='42501';
 end if;
 select jsonb_build_object('id',id,'title',title,'instructions',instructions,'video_url',video_url)
  into result from private.factory_recipes where id=p_recipe_id and published;
 if result is null then raise exception 'Recipe unavailable' using errcode='P0002';end if;
 return result;
end $$;
create function public.manee_factory_catalog(p_store_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.factory_catalog(p_store_id)$$;
create function public.manee_factory_recipe(p_store_id uuid,p_recipe_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.factory_recipe(p_store_id,p_recipe_id)$$;
revoke all on function private.factory_assert_owner(uuid),private.factory_catalog(uuid),private.factory_recipe(uuid,uuid),
 public.manee_factory_catalog(uuid),public.manee_factory_recipe(uuid,uuid) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.factory_catalog(uuid),private.factory_recipe(uuid,uuid),
 public.manee_factory_catalog(uuid),public.manee_factory_recipe(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
