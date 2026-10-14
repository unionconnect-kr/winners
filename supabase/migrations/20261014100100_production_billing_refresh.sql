begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Worker eligibility follows the verified ledger environment, not the caller.
-- The checkout endpoint remains Sandbox-only; this migration enrolls no store.
create or replace function private.manee_billing_claim(p_dispatch_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_dispatch_token is null or length(p_dispatch_token)<>64 or not exists
  (select 1 from vault.decrypted_secrets where name='manee_billing_dispatch' and decrypted_secret=p_dispatch_token) then
  raise exception 'Dispatch access denied' using errcode='42501';end if;
 with candidates as (select purchase_token from private.android_billing_purchases
  where superseded_by is null and environment in ('Sandbox','Production') and next_check_at<=now()
  and (lease_until is null or lease_until<=now()) order by next_check_at for update skip locked limit 10),
 claimed as (update private.android_billing_purchases p set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
 refresh_attempts=least(refresh_attempts+1,1000),claimed_generation=event_generation from candidates c
 where p.purchase_token=c.purchase_token returning p.purchase_token,p.user_id,p.store_id,p.lease_id,p.product_id,p.environment)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create or replace function private.dispatch_billing_refresh() returns void
language plpgsql security definer set search_path='' as $$
declare secret text; project_url text;
begin
 delete from private.android_billing_events where received_at<now()-interval '30 days';
 if not exists(select 1 from private.android_billing_purchases where environment in ('Sandbox','Production') and superseded_by is null
  and next_check_at<=now() and (lease_until is null or lease_until<=now())) then return;end if;
 select decrypted_secret into project_url from vault.decrypted_secrets where name='manee_android_project_url';
 if project_url is distinct from 'https://bhwuuxcrzxespkjlmqxr.supabase.co' then raise exception 'Unsupported billing deployment';end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='manee_billing_dispatch';
 if secret is null then raise exception 'Billing dispatch unavailable';end if;
 perform net.http_post(url:=project_url||'/functions/v1/manee-billing-refresh',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
commit;
