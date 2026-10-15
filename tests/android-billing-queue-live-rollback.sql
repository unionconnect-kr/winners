begin;
do $$
declare u uuid; s uuid; r jsonb; saved boolean; dispatch text; jobs jsonb; lease uuid;
begin
 if has_function_privilege('authenticated','public.manee_android_billing_save(uuid,uuid,jsonb)','execute')
 or has_function_privilege('anon','public.manee_android_billing_save(uuid,uuid,jsonb)','execute')
 or has_table_privilege('authenticated','private.android_billing_purchases','select')
 or not has_function_privilege('service_role','public.manee_android_billing_save(uuid,uuid,jsonb)','execute')
 then raise exception 'billing permissions failed';end if;
 select m.user_id,m.store_id into u,s from public.store_memberships m
 join public.profiles p on p.user_id=m.user_id join auth.users a on a.id=m.user_id
 join public.stores st on st.id=m.store_id where m.role='owner' and m.status='active'
 and p.status='active' and st.archived_at is null and (a.banned_until is null or a.banned_until<=now()) limit 1;
 if u is null then raise exception 'no fixture owner';end if;
 r:=jsonb_build_object('purchaseToken','manee-rollback-check-'||gen_random_uuid()::text,
 'accountId',encode(sha256(convert_to('kr.co.manee.app:user:'||u::text,'UTF8')),'hex'),
 'profileId',encode(sha256(convert_to('kr.co.manee.app:store:'||u::text||':'||s::text,'UTF8')),'hex'),
 'productId','manee.store1.monthly','basePlanId','monthly','environment','Sandbox',
 'state','SUBSCRIPTION_STATE_ACTIVE','checkedAt',clock_timestamp(),'expiresAt',now()+interval '1 day');
 if not public.manee_android_billing_save(u,s,r) then raise exception 'save failed';end if;
 if public.manee_android_billing_save(u,s,r) then raise exception 'stale replay accepted';end if;
 r:=r||jsonb_build_object('linkedPurchaseToken',r->>'purchaseToken','purchaseToken','manee-rollback-replacement-'||gen_random_uuid()::text,'checkedAt',clock_timestamp());
 if not public.manee_android_billing_save(u,s,r) then raise exception 'replacement failed';end if;
 if not exists(select 1 from private.android_billing_purchases where purchase_token=r->>'linkedPurchaseToken' and superseded_by=r->>'purchaseToken') then raise exception 'supersession failed';end if;
select decrypted_secret into dispatch from vault.decrypted_secrets where name='manee_billing_dispatch';
 if has_function_privilege('authenticated','public.manee_billing_enqueue(text,text)','execute')
 or has_function_privilege('anon','public.manee_billing_claim(text)','execute') then raise exception 'Queue permissions failed';end if;
 perform public.manee_billing_enqueue('rollback-event-'||gen_random_uuid()::text,r->>'purchaseToken');
 jobs:=public.manee_billing_claim(dispatch);
 select (j->>'lease_id')::uuid into lease from jsonb_array_elements(jobs) j where j->>'purchase_token'=r->>'purchaseToken';
 if lease is null then raise exception 'Claim failed';end if;
 if not public.manee_billing_finish(r->>'purchaseToken',lease,true) then raise exception 'Finish failed';end if;
 if public.manee_billing_finish(r->>'purchaseToken',lease,true) then raise exception 'Lease replay accepted';end if;
end $$;
rollback;
select 'billing queue, leases, permissions and persistence passed; all test writes rolled back' result;

