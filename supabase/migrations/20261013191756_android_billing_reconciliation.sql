begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table private.android_billing_purchases add column next_check_at timestamptz default now(),
 add column lease_id uuid, add column lease_until timestamptz,
 add column refresh_attempts integer not null default 0,
 add column event_generation bigint not null default 0,
 add column claimed_generation bigint;
create function private.manee_billing_resume_refresh() returns trigger
language plpgsql set search_path='' as $$begin
 if new.checked_at>old.checked_at and new.next_check_at is null
  and new.state not in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')
  and new.superseded_by is null then new.next_check_at:=now();end if;
 return new;
end$$;
revoke all on function private.manee_billing_resume_refresh() from public,anon,authenticated,service_role;
create trigger manee_billing_resume_refresh before update of checked_at on private.android_billing_purchases
for each row execute function private.manee_billing_resume_refresh();
create index android_billing_due on private.android_billing_purchases(next_check_at) where superseded_by is null;
create table private.android_billing_events(message_id text primary key check(length(message_id) between 1 and 200),received_at timestamptz not null default now());
alter table private.android_billing_events enable row level security;
revoke all on private.android_billing_events from public,anon,authenticated,service_role;
do $$begin
 if not exists(select 1 from vault.secrets where name='manee_billing_dispatch') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'manee_billing_dispatch','Private billing scheduler bearer');
 end if;
end $$;
create function private.manee_billing_enqueue(p_message_id text,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare fresh text;
begin
 if p_message_id is null or length(p_message_id) not between 1 and 200 or p_token is null or length(p_token) not between 1 and 4096 then raise exception 'Invalid event';end if;
 insert into private.android_billing_events(message_id) values(p_message_id) on conflict do nothing returning message_id into fresh;
 if fresh is null then return true;end if;
 -- Unknown tokens cannot assign entitlement. Their eventual verified insert is
 -- automatically due for refresh. Events do not contain trusted status fields.
 update private.android_billing_purchases set next_check_at=now(),event_generation=event_generation+1
 where purchase_token=p_token and superseded_by is null;
 return true;
end $$;
create function public.manee_billing_enqueue(p_message_id text,p_token text) returns boolean
language sql security invoker set search_path='' as $$select private.manee_billing_enqueue(p_message_id,p_token)$$;
create function private.manee_billing_claim(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_dispatch_token is null or length(p_dispatch_token)<>64 or not exists
  (select 1 from vault.decrypted_secrets where name='manee_billing_dispatch' and decrypted_secret=p_dispatch_token) then
  raise exception 'Dispatch access denied' using errcode='42501';end if;
 with candidates as (select purchase_token from private.android_billing_purchases
  where superseded_by is null and environment='Sandbox' and next_check_at<=now()
  and (lease_until is null or lease_until<=now()) order by next_check_at for update skip locked limit 10),
 claimed as (update private.android_billing_purchases p set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 refresh_attempts=least(refresh_attempts+1,1000),claimed_generation=event_generation from candidates c
 where p.purchase_token=c.purchase_token returning p.purchase_token,p.user_id,p.store_id,p.lease_id)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.manee_billing_claim(p_dispatch_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.manee_billing_claim(p_dispatch_token)$$;
create function private.manee_billing_finish(p_token text,p_lease uuid,p_success boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare updated text;
begin
 if p_success is null then raise exception 'Invalid result';end if;
 update private.android_billing_purchases set
 next_check_at=case when event_generation<>claimed_generation then now()
  when p_success and state in ('SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') then null
  when p_success then now()+interval '5 minutes'
  else now()+make_interval(secs=>least(60*refresh_attempts,600)) end,
 refresh_attempts=case when p_success then 0 else refresh_attempts end,lease_id=null,lease_until=null,claimed_generation=null
 where purchase_token=p_token and lease_id=p_lease and lease_until>now() returning purchase_token into updated;
 return updated is not null;
end $$;
create function public.manee_billing_finish(p_token text,p_lease uuid,p_success boolean) returns boolean
language sql security invoker set search_path='' as $$select private.manee_billing_finish(p_token,p_lease,p_success)$$;
revoke all on function private.manee_billing_enqueue(text,text),public.manee_billing_enqueue(text,text),
 private.manee_billing_claim(text),public.manee_billing_claim(text),private.manee_billing_finish(text,uuid,boolean),public.manee_billing_finish(text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.manee_billing_enqueue(text,text),public.manee_billing_enqueue(text,text),
 private.manee_billing_claim(text),public.manee_billing_claim(text),private.manee_billing_finish(text,uuid,boolean),public.manee_billing_finish(text,uuid,boolean) to service_role;
create function private.dispatch_billing_refresh() returns void
language plpgsql security definer set search_path='' as $$
declare secret text; project_url text;
begin
 delete from private.android_billing_events where received_at<now()-interval '30 days';
 if not exists(select 1 from private.android_billing_purchases where environment='Sandbox' and superseded_by is null
  and next_check_at<=now() and (lease_until is null or lease_until<=now())) then return;end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='manee_android_project_url';
 if project_url is distinct from 'https://bhwuuxcrzxespkjlmqxr.supabase.co' then raise exception 'Unsupported billing deployment';end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='manee_billing_dispatch';
 if secret is null then raise exception 'Billing dispatch unavailable';end if;
 perform net.http_post(url:=project_url||'/functions/v1/manee-billing-refresh',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function private.dispatch_billing_refresh() from public,anon,authenticated,service_role;
select cron.schedule('manee-billing-refresh','* * * * *','select private.dispatch_billing_refresh()');
select cron.alter_job(jobid,active:=false) from cron.job where jobname='manee-billing-refresh';
notify pgrst,'reload schema';
commit;
