-- Staging only. The worker also fails closed unless its Supabase/Firebase projects match.
begin;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.secrets where name='manee_android_dispatch') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'manee_android_dispatch','Android staging scheduler bearer');
 end if;
end $$;
create function private.dispatch_android_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare dispatch_secret text;
begin
 perform private.seed_android_reminders();
 delete from private.android_push_deliveries where created_at<now()-interval '14 days';
 if not exists(select 1 from private.android_push_deliveries where status='pending' and available_at<=now()
  and (lease_until is null or lease_until<=now())) then return;end if;
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='manee_android_dispatch';
 if dispatch_secret is null then raise exception 'Dispatch is not configured';end if;
 perform net.http_post(url:='https://obpkzecgswnfuyhwvncd.supabase.co/functions/v1/manee-android-delivery',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_secret),
  body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function private.dispatch_android_notifications() from public,anon,authenticated,service_role;
select cron.schedule('manee-android-business-push','* * * * *','select private.dispatch_android_notifications()');
-- Opt in only after staging deployment/testing; migrations never enable production delivery.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='manee-android-business-push';
commit;
