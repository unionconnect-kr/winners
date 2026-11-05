CREATE OR REPLACE FUNCTION private.manee_sms_service(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 c private.manee_sms_challenges%rowtype;
 uid uuid; sid uuid; op uuid; cid uuid; uname text; ph text; phash text; v_purpose text;
 send_allowed boolean:=false;
 bad jsonb:=jsonb_build_object('ok',false,'error','verification_invalid');
begin
 if p_action='credentials' then
   uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
   if not private.manee_sms_ordinary_user(uid) or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now())) then return bad; end if;
   return (select jsonb_build_object('ok',true,'username',p.username,'email',u.email) from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=uid);
 elsif p_action='request' then
   cid:=(p_payload->>'id')::uuid; v_purpose:=p_payload->>'purpose'; uname:=p_payload->>'username';
   ph:=p_payload->>'phone'; phash:=p_payload->>'phone_hash';
   if v_purpose not in ('signup_owner','signup_staff','reset','bind') or uname !~ '^[a-z0-9가-힣._-]{4,30}$' or ph !~ '^\+8210[0-9]{8}$' or phash !~ '^[0-9a-f]{64}$' or (p_payload->>'code_hash') !~ '^[0-9a-f]{64}$' then return bad; end if;
   -- Serialize requests for a destination. Do not use a client-supplied IP as the only abuse limit.
   perform pg_advisory_xact_lock(hashtextextended('manee-sms:'||phash,0));
   if exists(select 1 from private.manee_sms_challenges where phone_hash=phash and created_at>clock_timestamp()-interval '30 seconds') then
     return jsonb_build_object('ok',false,'error','rate_limited','retry_after',30); end if;
   if not public.consume_auth_rate_limit('sms_phone_hour',phash,3600,5)
      or not public.consume_auth_rate_limit('sms_phone_day',phash,86400,10)
      or not public.consume_auth_rate_limit('sms_username_hour',p_payload->>'username_hash',3600,5)
      or not public.consume_auth_rate_limit('sms_ip_hour',p_payload->>'ip_hash',3600,10)
      or not public.consume_auth_rate_limit('sms_staging_day','all',86400,100) then
     return jsonb_build_object('ok',false,'error','rate_limited','retry_after',3600); end if;
   if v_purpose in ('signup_owner','signup_staff') then
     send_allowed:=not public.is_manee_username_reserved(uname);
   elsif v_purpose='reset' then
     select b.user_id into uid from private.manee_sms_bindings b join public.profiles p on p.user_id=b.user_id
       where b.phone_e164=ph and p.username=uname and private.manee_sms_ordinary_user(b.user_id);
     send_allowed:=uid is not null;
   else
     uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
     send_allowed:=private.manee_sms_ordinary_user(uid)
       and exists(select 1 from public.profiles p where p.user_id=uid and p.username=uname)
       and exists(select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now()));
     if not send_allowed then return bad; end if;
   end if;
   -- Keep only a short-lived, bounded verification history. Verified bindings are stored separately.
   delete from private.manee_sms_challenges where created_at<clock_timestamp()-interval '7 days';
   update private.manee_sms_challenges set status='expired',code_hash=null,proof_hash=null
     where phone_hash=phash and username=uname and purpose=v_purpose and status in ('sending','sent','verified');
   insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,target_user_id,session_id,code_hash,status)
     values(cid,v_purpose,uname,ph,phash,uid,sid,case when send_allowed then p_payload->>'code_hash' else null end,case when send_allowed then 'sending' else 'failed' end);
   return jsonb_build_object('ok',true,'send_allowed',send_allowed);
 elsif p_action in ('sent','failed') then
   update private.manee_sms_challenges set status=case when p_action='sent' then 'sent' else 'failed' end,
     expires_at=clock_timestamp()+interval '3 minutes',code_hash=case when p_action='sent' then code_hash else null end
     where id=(p_payload->>'id')::uuid and status='sending';
   return jsonb_build_object('ok',found);
 end if;
 select * into c from private.manee_sms_challenges where id=(p_payload->>'id')::uuid for update;
 if not found then return bad; end if;
 if p_action in ('verify','claim') then
   if c.username<>coalesce(p_payload->>'username','') or c.purpose<>coalesce(p_payload->>'purpose','') then return bad; end if;
   if c.purpose='bind' and (c.target_user_id is distinct from (p_payload->>'user_id')::uuid or c.session_id is distinct from (p_payload->>'session_id')::uuid
     or not exists(select 1 from auth.sessions s where s.id=c.session_id and s.user_id=c.target_user_id and (s.not_after is null or s.not_after>now()))) then return bad; end if;
 end if;
 if p_action='verify' then
   if c.status<>'sent' or c.expires_at<=clock_timestamp() or c.failed_attempts>=5 then return bad; end if;
   if c.code_hash is distinct from (p_payload->>'code_hash') then
     update private.manee_sms_challenges set failed_attempts=failed_attempts+1,
       status=case when failed_attempts+1>=5 then 'expired' else status end,
       code_hash=case when failed_attempts+1>=5 then null else code_hash end where id=c.id;
     return bad;
   end if;
   if (p_payload->>'proof_hash') is null or (p_payload->>'proof_hash') !~ '^[0-9a-f]{64}$' then return bad; end if;
   update private.manee_sms_challenges set status='verified',code_hash=null,proof_hash=p_payload->>'proof_hash',proof_expires_at=clock_timestamp()+interval '10 minutes' where id=c.id;
   return jsonb_build_object('ok',true);
 elsif p_action='claim' then
   if c.status<>'verified' or c.proof_expires_at<=clock_timestamp() or c.proof_hash is distinct from (p_payload->>'proof_hash') then return bad; end if;
   if c.purpose in ('reset','bind') and not private.manee_sms_ordinary_user(c.target_user_id) then return bad; end if;
   if c.purpose='reset' and not exists(select 1 from private.manee_sms_bindings b where b.user_id=c.target_user_id and b.phone_e164=c.phone_e164) then return bad; end if;
   if c.purpose='reset' then delete from auth.sessions where user_id=c.target_user_id; end if;
   op:=gen_random_uuid();
   update private.manee_sms_challenges set status='consuming',proof_hash=null,operation_id=op where id=c.id;
   return jsonb_build_object('ok',true,'operation_id',op,'user_id',c.target_user_id,'phone',c.phone_e164);
 elsif p_action='release_signup' then
   -- Service-only compensation after a definitive rejection or confirmed account cleanup.
   -- Never extend expiry, refund limits, or release reset/bind/completed proofs.
   if c.status<>'consuming' or c.purpose not in ('signup_owner','signup_staff')
     or c.purpose is distinct from (p_payload->>'purpose')
     or c.username is distinct from (p_payload->>'username')
     or c.operation_id is null or c.operation_id is distinct from (p_payload->>'operation_id')::uuid
     or c.target_user_id is not null or c.finished_at is not null
     or c.proof_expires_at is null or c.proof_expires_at<=clock_timestamp()
     or coalesce(p_payload->>'reason','') not in ('weak_password','bootstrap_rolled_back')
     or (p_payload->>'proof_hash') is null or (p_payload->>'proof_hash') !~ '^[0-9a-f]{64}$'
     or public.is_manee_username_reserved(c.username)
     or exists(select 1 from private.manee_sms_challenges newer
       where newer.phone_hash=c.phone_hash and newer.username=c.username and newer.purpose=c.purpose
         and newer.created_at>c.created_at) then return bad; end if;
   if p_payload->>'reason'='bootstrap_rolled_back' then
     -- Owner bootstrap must have rolled back, and Auth deletion must have succeeded.
     -- A surviving Auth identity or profile forbids proof reuse.
     if c.purpose<>'signup_owner' or nullif(p_payload->>'cleaned_user_id','') is null then return bad; end if;
     uid:=(p_payload->>'cleaned_user_id')::uuid;
     if exists(select 1 from auth.users u where u.id=uid)
       or exists(select 1 from public.profiles p where p.user_id=uid) then return bad; end if;
   end if;
   update private.manee_sms_challenges set status='verified',proof_hash=p_payload->>'proof_hash',operation_id=null
     where id=c.id;
   return jsonb_build_object('ok',true);
 elsif p_action='complete' then
   if c.operation_id is distinct from (p_payload->>'operation_id')::uuid or c.status<>'consuming' then return bad; end if;
   uid:=(p_payload->>'user_id')::uuid;
   if not private.manee_sms_ordinary_user(uid) or not exists(select 1 from public.profiles p where p.user_id=uid and p.username=c.username) then return bad; end if;
   if c.purpose in ('reset','bind') and uid is distinct from c.target_user_id then return bad; end if;
   if c.purpose<>'reset' then
     insert into private.manee_sms_bindings(user_id,phone_e164,verified_at) values(uid,c.phone_e164,clock_timestamp())
       on conflict(user_id) do update set phone_e164=excluded.phone_e164,verified_at=excluded.verified_at;
     -- Public contact fields are not an authority for password recovery.
     update public.profiles set phone_e164=c.phone_e164,phone_verified_at=clock_timestamp() where user_id=uid;
   else
     -- auth.refresh_tokens cascades from auth.sessions; existing RLS checks live sessions.
     delete from auth.sessions where user_id=uid;
   end if;
   update private.manee_sms_challenges set status='completed',target_user_id=uid,finished_at=clock_timestamp() where id=c.id;
   return jsonb_build_object('ok',true);
 end if;
 return bad;
end;
$function$
