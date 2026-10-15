begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Selected rollout: existing stores stay as they are. Deploying this migration
-- does not launch billing or enroll any current or newly inserted store yet.
create table private.new_store_billing_rollout (
 singleton boolean primary key default true check(singleton),
 launched_at timestamptz
);
insert into private.new_store_billing_rollout(singleton) values(true);
alter table private.new_store_billing_rollout enable row level security;
revoke all on private.new_store_billing_rollout from public,anon,authenticated,service_role;

-- Privileged operator-only, idempotent launch action. The timestamp records
-- activation; eligibility never trusts client-provided stores.created_at.
create function private.manee_launch_new_store_billing() returns timestamptz
language plpgsql security invoker set search_path='' as $$
declare launched timestamptz;
begin
 select r.launched_at into launched from private.new_store_billing_rollout r
  where r.singleton for update;
 if not found then raise exception 'Missing new-store billing rollout policy' using errcode='55000';end if;
 if launched is null then
  update private.new_store_billing_rollout set launched_at=clock_timestamp()
   where singleton returning launched_at into launched;
 end if;
 return launched;
end $$;
revoke all on function private.manee_launch_new_store_billing() from public,anon,authenticated,service_role;

create function private.manee_enroll_new_store_billing() returns trigger
language plpgsql security definer set search_path='' as $$
declare launched timestamptz;
begin
 -- Shared row locks permit parallel store creation, while serializing the
 -- activation boundary with the operator's FOR UPDATE lock. Prelaunch inserts
 -- must commit/roll back before launch can complete. Missing policy fails closed.
 select r.launched_at into launched from private.new_store_billing_rollout r
  where r.singleton for share;
 if not found then raise exception 'Missing new-store billing rollout policy' using errcode='55000';end if;
 if launched is not null then
  -- Always Production, including signup through a service-role/bootstrap RPC.
  -- Existing RLS controls who may insert a store. This grants no store access.
  insert into private.store_billing_enforcement(store_id,environment)
   values(new.id,'Production');
 end if;
 return new;
end $$;
revoke all on function private.manee_enroll_new_store_billing() from public,anon,authenticated,service_role;
create trigger manee_new_store_billing_enrollment after insert on public.stores
 for each row execute function private.manee_enroll_new_store_billing();
commit;
