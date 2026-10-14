-- Deployment-specific URL lives in Vault. Existing staging defaults remain
-- compatible; production must configure its URL before enabling the scheduler.
begin;
set local lock_timeout='5s';
create or replace function private.dispatch_android_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare dispatch_secret text; project_url text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='manee_android_project_url';
 project_url:=coalesce(project_url,'https://obpkzecgswnfuyhwvncd.supabase.co');
 if project_url not in ('https://obpkzecgswnfuyhwvncd.supabase.co','https://bhwuuxcrzxespkjlmqxr.supabase.co') then
  raise exception 'Invalid Android deployment URL';
 end if;
 perform private.seed_android_reminders();
 delete from private.android_push_deliveries where created_at<now()-interval '14 days';
 if not exists(select 1 from private.android_push_deliveries where status='pending' and available_at<=now()
  and (lease_until is null or lease_until<=now())) then return;end if;
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='manee_android_dispatch';
 if dispatch_secret is null then raise exception 'Dispatch is not configured';end if;
 perform net.http_post(url:=project_url||'/functions/v1/manee-android-delivery',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_secret),
  body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function private.dispatch_android_notifications() from public,anon,authenticated,service_role;
-- Enabling a job is a separate, verified deployment step, never a migration side effect.
commit;
