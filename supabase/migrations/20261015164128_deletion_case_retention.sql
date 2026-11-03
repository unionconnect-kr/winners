begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- This disposes of completed support cases, not customer accounts or store data.
-- Installation alone schedules nothing and erases nothing. Legacy completion
-- dates are unknown: do not manufacture dates from reviewed_at/requested_at.
alter table private.account_deletion_requests add column completed_at timestamptz;
alter table private.account_deletion_requests add constraint deletion_case_completion_state
 check (completed_at is null or status='completed');
create index deletion_case_retention_due_idx
 on private.account_deletion_requests(completed_at,id) where status='completed' and completed_at is not null;

create function private.manee_stamp_deletion_case_completion()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'completed' then
  new.completed_at:=null;
 elsif tg_op='INSERT' then
  new.completed_at:=clock_timestamp();
 elsif old.status<>'completed' then
  new.completed_at:=clock_timestamp();
 else
  -- Editing a note or supplied timestamp cannot shorten or extend retention.
  new.completed_at:=old.completed_at;
 end if;
 return new;
end $$;
revoke all on function private.manee_stamp_deletion_case_completion()
 from public,anon,authenticated,service_role;
create trigger manee_stamp_deletion_case_completion
 before insert or update on private.account_deletion_requests
 for each row execute function private.manee_stamp_deletion_case_completion();

create function private.manee_purge_completed_deletion_cases(p_limit integer default 500)
returns integer language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if auth.uid() is not null then
  raise exception 'Maintenance requires no customer session' using errcode='42501';
 end if;
 if p_limit is null or p_limit not between 1 and 1000 then
  raise exception 'Invalid retention batch size' using errcode='22023';
 end if;
 with due as (
  select id from private.account_deletion_requests
   where status='completed' and completed_at<=now()-interval '720 hours'
   order by completed_at,id for update skip locked limit p_limit
 ), erased as (
  delete from private.account_deletion_requests r using due
   where r.id=due.id returning r.id
 ) select count(*)::integer into removed from erased;
 return removed;
end $$;
revoke all on function private.manee_purge_completed_deletion_cases(integer)
 from public,anon,authenticated,service_role;
commit;
