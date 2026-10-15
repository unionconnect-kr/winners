begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- A request is not an instruction to erase shared store records or to cancel a
-- Google Play subscription. Support must verify identity and handle both first.
create table private.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  contact text not null,
  status text not null default 'pending' check (status in ('pending','in_review','completed','rejected')),
  requested_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  note text
);
create unique index account_deletion_pending_identity_idx
  on private.account_deletion_requests (lower(username),lower(contact)) where status='pending';
alter table private.account_deletion_requests enable row level security;
revoke all on private.account_deletion_requests from public,anon,authenticated;

create function private.manee_account_deletion_request(p_username text,p_contact text)
returns void language plpgsql security definer set search_path='' as $$
declare uname text := lower(btrim(normalize(coalesce(p_username,''),NFKC)));
  address text := btrim(coalesce(p_contact,''));
begin
  if uname !~ '^[a-z0-9가-힣._-]{4,30}$'
    or length(address) not between 5 and 120
    or address ~ '[<>[:cntrl:]]' then
    raise exception 'Invalid request' using errcode='22023';
  end if;
  insert into private.account_deletion_requests(username,contact)
    values(uname,address) on conflict do nothing;
end;
$$;
create function public.manee_account_deletion_request(p_username text,p_contact text)
returns void language sql security invoker set search_path='' as $$
  select private.manee_account_deletion_request(p_username,p_contact);
$$;
revoke all on function private.manee_account_deletion_request(text,text),
  public.manee_account_deletion_request(text,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.manee_account_deletion_request(text,text) to service_role;
grant execute on function private.manee_account_deletion_request(text,text) to service_role;
commit;
