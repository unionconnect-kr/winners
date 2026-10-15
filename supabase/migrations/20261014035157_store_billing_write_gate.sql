begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Explicit enrollment only. Deploying this migration does not enroll any store.
create table private.store_billing_enforcement (
 store_id uuid primary key references public.stores(id) on delete cascade,
 environment text not null check(environment in ('Sandbox','Production')),
 enabled_at timestamptz not null default now()
);
alter table private.store_billing_enforcement enable row level security;
revoke all on private.store_billing_enforcement from public,anon,authenticated,service_role;

-- Pure internal policy: does not replace existing membership/RLS checks.
create function private.manee_store_write_entitled(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.store_billing_enforcement where store_id=p_store_id)
 or exists(
  select 1 from private.store_billing_enforcement g
  join private.android_billing_purchases b on b.store_id=g.store_id and b.environment=g.environment
  join public.store_memberships m on m.store_id=b.store_id and m.user_id=b.user_id and m.role='owner' and m.status='active'
  join public.profiles p on p.user_id=b.user_id and p.status='active'
  join auth.users u on u.id=b.user_id
  where g.store_id=p_store_id and (u.banned_until is null or u.banned_until<=now())
   and b.superseded_by is null
   and b.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
   and b.expires_at>now() and b.checked_at>now()-interval '15 minutes'
 );
$$;
revoke all on function private.manee_store_write_entitled(uuid) from public,anon,authenticated,service_role;

create function private.manee_store_billing_access(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_live_manee_session()
  or not private.has_store_membership(p_store_id)
  or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now())) then
  raise exception 'Store access denied' using errcode='42501';
 end if;
 return jsonb_build_object('enforced',exists(select 1 from private.store_billing_enforcement where store_id=p_store_id),
  'canWrite',private.manee_store_write_entitled(p_store_id));
end $$;
create function public.manee_store_billing_access(p_store_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.manee_store_billing_access(p_store_id)$$;
revoke all on function private.manee_store_billing_access(uuid),public.manee_store_billing_access(uuid) from public,anon;
grant execute on function private.manee_store_billing_access(uuid),public.manee_store_billing_access(uuid) to authenticated;

-- Fires even inside SECURITY DEFINER business RPCs. Existing RLS still controls
-- access; this is an additional write gate, never a grant of access.
create function private.manee_guard_billed_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare sid uuid; old_sid uuid; new_sid uuid;
begin
 -- Backend maintenance and account deletion run without a customer auth.uid().
 -- Customer JWTs cannot choose this value; RLS remains the outer boundary.
 if auth.uid() is null then
  if TG_OP='DELETE' then return OLD;else return NEW;end if;
 end if;
 if TG_OP<>'INSERT' then old_sid=OLD.store_id;end if;
 if TG_OP<>'DELETE' then new_sid=NEW.store_id;end if;
 for sid in select distinct x from unnest(array[old_sid,new_sid]) x where x is not null loop
  if not private.manee_store_write_entitled(sid) then
   raise exception '매장 이용권이 만료되어 입력·수정할 수 없어요. 사장님이 구독 상태를 확인해 주세요.' using errcode='P4402';
  end if;
 end loop;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
revoke all on function private.manee_guard_billed_write() from public,anon,authenticated,service_role;

-- First rollout covers business records with a direct store key. Identity,
-- subscriptions, account deletion, notifications and attendance remain reachable.
-- Attendance must not strand an employee mid-shift due to an owner's payment.
do $$
declare tab text;
begin
 foreach tab in array array['sales_reports','expense_entries','fixed_expenses','fixed_schedules',
 'shifts','vendors','reservations','announcements','checklist_templates','checklist_checks','checklist_log',
 'crew_pay_adjustments','monthly_cost_checks','monthly_cost_reviews','monthly_report_closings',
 'recurring_cost_templates','store_business_calendar'] loop
  if to_regclass('public.'||tab) is null then raise exception 'Missing billing gate table: %',tab;end if;
  execute format('create trigger manee_billing_write_gate before insert or update or delete on public.%I for each row execute function private.manee_guard_billed_write()',tab);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
