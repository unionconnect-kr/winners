begin;
create table public.manee_mobile_update_policy(
 platform text primary key check(platform in('android','ios')),
 enabled boolean not null default false,
 minimum_version text not null default '0.0',minimum_build text not null default '0',
 available_version text not null default '0.0',available_build text not null default '0',
 published_at timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 check(minimum_version ~ '^[0-9]+(\.[0-9]+){0,3}$' and minimum_build ~ '^[0-9]+(\.[0-9]+){0,3}$'
 and available_version ~ '^[0-9]+(\.[0-9]+){0,3}$' and available_build ~ '^[0-9]+(\.[0-9]+){0,3}$'),
 check(not enabled or published_at is not null)
);
alter table public.manee_mobile_update_policy enable row level security;
revoke all on public.manee_mobile_update_policy from public,anon,authenticated;
grant select on public.manee_mobile_update_policy to anon,authenticated;
grant all on public.manee_mobile_update_policy to service_role;
create policy mobile_update_policy_read on public.manee_mobile_update_policy for select to anon,authenticated using(true);
insert into public.manee_mobile_update_policy(platform) values('android'),('ios');
-- Leave disabled until the corresponding store release is downloadable.
commit;
