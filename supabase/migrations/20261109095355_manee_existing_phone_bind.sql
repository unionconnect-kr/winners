-- Retain the authorization used to start an existing-account phone challenge.
-- Challenges created by earlier clients use the original password path.
alter table private.manee_sms_challenges add column bind_method text
  check (bind_method is null or (purpose='bind' and bind_method in ('password','recent_social')));

-- A fresh OAuth login must come from the user's actual Auth session and its
-- server-side authentication method record. Refreshing tokens doesn't change
-- either creation timestamp. Evaluate freshness at challenge creation once.
create function private.manee_phone_bind_methods(p_uid uuid,p_sid uuid,p_at timestamptz)
returns text[] language sql stable set search_path='' as $$
  select coalesce((
    select case
      when private.manee_sms_ordinary_user(u.id) then array['password']
      when not private.manee_sms_social_user(u.id)
        or exists(select 1 from private.manee_sms_bindings b where b.user_id=u.id)
        then array['unavailable']
      else array_remove(array[
        case when s.oauth_client_id is null
          and s.created_at between p_at-interval '10 minutes' and p_at
          and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id
            and a.authentication_method='oauth'
            and a.created_at between p_at-interval '10 minutes' and p_at)
          then 'recent_social' end,
        case when u.email ~ '^u-[0-9a-f]{32}@auth[.]manee[.]local$'
          and coalesce(u.encrypted_password,'')<>''
          then 'password' end,
        'social_reauth'
      ],null)
    end
    from auth.sessions s join auth.users u on u.id=s.user_id
    join public.profiles p on p.user_id=u.id
    where s.id=p_sid and s.user_id=p_uid and p.status='active'
      and (s.not_after is null or s.not_after>now())
      and (u.banned_until is null or u.banned_until<now())
      and not exists(select 1 from public.platform_admins pa where pa.user_id=u.id and pa.status='active')
  ),array['unavailable']);
$$;

create function private.manee_phone_bind_method(p_uid uuid,p_sid uuid)
returns text language sql stable set search_path='' as $$
  select (private.manee_phone_bind_methods(p_uid,p_sid,now()))[1];
$$;

revoke all on function private.manee_phone_bind_methods(uuid,uuid,timestamptz),
  private.manee_phone_bind_method(uuid,uuid) from public,anon,authenticated;

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
 v_bind_method text; v_bind_at timestamptz; claimed jsonb; completed jsonb;
 bind_user uuid; bind_session_end timestamptz;
 bad jsonb:=jsonb_build_object('ok',false,'error','verification_invalid');
begin
 if p_action='credentials' then
   uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
   v_bind_method:=private.manee_phone_bind_method(uid,sid);
   if v_bind_method='social_reauth' then
     return jsonb_build_object('ok',false,'error','social_reauth_required');
   end if;
   if v_bind_method not in ('password','recent_social') then return bad; end if;
   return (select jsonb_build_object('ok',true,'username',p.username,'bind_method',v_bind_method,
     'email',case when v_bind_method='password' then u.email end)
     from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=uid);
 elsif p_action='finish_bind' then
   if p_payload->>'purpose' is distinct from 'bind' then return bad; end if;
   claimed:=private.manee_sms_service('claim',p_payload);
   if claimed->>'ok' is distinct from 'true' then return claimed; end if;
   completed:=private.manee_sms_service('complete',jsonb_build_object(
     'id',p_payload->>'id','operation_id',claimed->>'operation_id','user_id',claimed->>'user_id'));
   if completed->>'ok' is distinct from 'true' then
     -- Roll back the claim as well as the bind if session or ownership changes.
     raise exception 'phone_bind_not_completed' using errcode='40001';
   end if;
   return completed;
 elsif p_action='request' then
   cid:=(p_payload->>'id')::uuid; v_purpose:=p_payload->>'purpose'; uname:=p_payload->>'username';
   ph:=p_payload->>'phone'; phash:=p_payload->>'phone_hash';
   if v_purpose not in ('signup_owner','signup_staff','signup_social','reset','bind') or uname !~ '^[a-z0-9가-힣._-]{4,30}$' or ph !~ '^[+]8210[0-9]{8}$' or phash !~ '^[0-9a-f]{64}$' or (p_payload->>'code_hash') !~ '^[0-9a-f]{64}$' then return bad; end if;
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
   if v_purpose in ('signup_owner','signup_staff','signup_social') then
     if v_purpose='signup_social' then
       uid:=(p_payload->>'user_id')::uuid;sid:=(p_payload->>'session_id')::uuid;
       if not private.manee_sms_social_user(uid) or uname is distinct from ('s_'||substr(replace(uid::text,'-',''),1,28))
         or exists(select 1 from public.profiles p where p.user_id=uid)
         or not exists(select 1 from auth.sessions ss where ss.id=sid and ss.user_id=uid and (ss.not_after is null or ss.not_after>now())) then return bad; end if;
     end if;
     if exists(select 1 from private.manee_sms_bindings b where b.phone_e164=ph)
       or exists(select 1 from private.manee_sms_challenges held where held.phone_e164=ph and held.status='consuming' and held.purpose in ('signup_owner','signup_staff','signup_social','bind')) then
       return jsonb_build_object('ok',false,'error','phone_taken'); end if;
     send_allowed:=not public.is_manee_username_reserved(uname);
   elsif v_purpose='reset' then
     select b.user_id into uid from private.manee_sms_bindings b join public.profiles p on p.user_id=b.user_id
       where b.phone_e164=ph and p.username=uname and private.manee_sms_ordinary_user(b.user_id);
     send_allowed:=uid is not null;
   else
     uid:=(p_payload->>'user_id')::uuid; sid:=(p_payload->>'session_id')::uuid;
     v_bind_method:=coalesce(p_payload->>'bind_method','password');
     v_bind_at:=clock_timestamp();
     send_allowed:=v_bind_method in ('password','recent_social')
       and v_bind_method=any(private.manee_phone_bind_methods(uid,sid,v_bind_at))
       and exists(select 1 from public.profiles p where p.user_id=uid and p.username=uname);
     if not send_allowed then return bad; end if;
   end if;
   -- Keep only a short-lived, bounded verification history. Verified bindings are stored separately.
   delete from private.manee_sms_challenges where created_at<clock_timestamp()-interval '7 days' and status<>'consuming';
   update private.manee_sms_challenges set status='expired',code_hash=null,proof_hash=null
     where phone_hash=phash and username=uname and purpose=v_purpose and status in ('sending','sent','verified');
   insert into private.manee_sms_challenges(id,purpose,username,phone_e164,phone_hash,target_user_id,session_id,code_hash,status,bind_method,created_at)
     values(cid,v_purpose,uname,ph,phash,uid,sid,case when send_allowed then p_payload->>'code_hash' else null end,
       case when send_allowed then 'sending' else 'failed' end,v_bind_method,coalesce(v_bind_at,clock_timestamp()));
   return jsonb_build_object('ok',true,'send_allowed',send_allowed);
 elsif p_action in ('sent','failed') then
   update private.manee_sms_challenges set status=case when p_action='sent' then 'sent' else 'failed' end,
     expires_at=clock_timestamp()+interval '3 minutes',code_hash=case when p_action='sent' then code_hash else null end
     where id=(p_payload->>'id')::uuid and status='sending';
   return jsonb_build_object('ok',found);
 end if;
 -- Take the Auth parent lock before its challenge child, as user deletion
 -- cascades to both challenges and sessions. The unlocked lookup is checked
 -- again after taking the challenge row lock.
 if p_action in ('claim','complete') then
   select ch.target_user_id into bind_user
     from private.manee_sms_challenges ch where ch.id=(p_payload->>'id')::uuid and ch.purpose='bind';
   if found then
     if bind_user is null or bind_user is distinct from (p_payload->>'user_id')::uuid then return bad; end if;
     perform 1 from auth.users u where u.id=bind_user for key share;
     if not found then return bad; end if;
   end if;
 end if;
 select * into c from private.manee_sms_challenges where id=(p_payload->>'id')::uuid for update;
 if not found then return bad; end if;
 if c.purpose='bind' and p_action in ('claim','complete') and c.target_user_id is distinct from bind_user then
   return bad;
 end if;
 if p_action in ('verify','claim') then
   if c.username<>coalesce(p_payload->>'username','') or c.purpose<>coalesce(p_payload->>'purpose','') then return bad; end if;
   if c.purpose in ('bind','signup_social') and (c.target_user_id is distinct from (p_payload->>'user_id')::uuid or c.session_id is distinct from (p_payload->>'session_id')::uuid
     or not exists(select 1 from auth.sessions s where s.id=c.session_id and s.user_id=c.target_user_id and (s.not_after is null or s.not_after>now()))) then return bad; end if;
   if c.purpose='bind' then
     -- Serialize two different phone proofs for the same existing account.
     -- The account lock is always acquired before the destination lock.
     if p_action='claim' then perform pg_advisory_xact_lock(hashtextextended('manee-phone-bind-user:'||c.target_user_id::text,0)); end if;
     if not coalesce(c.bind_method,'password')=any(private.manee_phone_bind_methods(c.target_user_id,c.session_id,c.created_at))
       or not exists(select 1 from public.profiles p where p.user_id=c.target_user_id and p.username=c.username) then return bad; end if;
   end if;
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
   if c.purpose='reset' and not private.manee_sms_ordinary_user(c.target_user_id) then return bad; end if;
   if c.purpose='signup_social' and (not private.manee_sms_social_user(c.target_user_id) or c.username is distinct from ('s_'||substr(replace(c.target_user_id::text,'-',''),1,28))) then return bad; end if;
   if c.purpose='reset' and not exists(select 1 from private.manee_sms_bindings b where b.user_id=c.target_user_id and b.phone_e164=c.phone_e164) then return bad; end if;
   if c.purpose in ('signup_owner','signup_staff','signup_social','bind') then
     -- Claim and completion share this canonical destination lock. Two different
     -- usernames cannot consume two valid proofs for the same destination.
     if current_setting('transaction_isolation')<>'read committed' then raise exception 'Retry phone verification with a fresh transaction' using errcode='40001'; end if;
     perform pg_advisory_xact_lock(hashtextextended('manee-phone-account:'||c.phone_e164,0));
     if exists(select 1 from private.manee_sms_bindings b where b.phone_e164=c.phone_e164
         and (c.purpose in ('signup_owner','signup_staff','signup_social') or b.user_id is distinct from c.target_user_id))
       or exists(select 1 from private.manee_sms_challenges held where held.phone_e164=c.phone_e164
         and held.id<>c.id and held.status='consuming' and held.purpose in ('signup_owner','signup_staff','signup_social','bind')
         and (c.purpose in ('signup_owner','signup_staff','signup_social') or held.target_user_id is distinct from c.target_user_id)) then
       return jsonb_build_object('ok',false,'error','phone_taken'); end if;
   end if;
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
     if c.purpose not in ('signup_owner','signup_staff') or nullif(p_payload->>'cleaned_user_id','') is null then return bad; end if;
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
   if c.purpose='signup_social' then
     if uid is distinct from c.target_user_id or not private.manee_sms_social_user(uid)
       or not exists(select 1 from auth.sessions ss where ss.id=c.session_id and ss.user_id=uid and (ss.not_after is null or ss.not_after>now()))
       or not exists(select 1 from public.profiles p where p.user_id=uid and p.username=c.username and p.status='active') then return bad; end if;
   elsif c.purpose='bind' then
     if uid is distinct from c.target_user_id then return bad; end if;
     perform pg_advisory_xact_lock(hashtextextended('manee-phone-bind-user:'||uid::text,0));
   elsif not private.manee_sms_ordinary_user(uid) or not exists(select 1 from public.profiles p where p.user_id=uid and p.username=c.username) then return bad; end if;
   if c.purpose='reset' and uid is distinct from c.target_user_id then return bad; end if;
   if c.purpose<>'reset' then
     if current_setting('transaction_isolation')<>'read committed' then raise exception 'Retry phone verification with a fresh transaction' using errcode='40001'; end if;
     perform pg_advisory_xact_lock(hashtextextended('manee-phone-account:'||c.phone_e164,0));
     if c.purpose='bind' then
       -- Pin the live session through the binding commit. SHARE conflicts
       -- with both DELETE and changes to its expiration. A session-first
       -- revocation can also need the parent row, so fail rather than wait.
       select s.not_after into bind_session_end
         from auth.sessions s where s.id=c.session_id and s.user_id=uid for share nowait;
       if not found or bind_session_end<=clock_timestamp()
         or not coalesce(c.bind_method,'password')=any(private.manee_phone_bind_methods(uid,c.session_id,c.created_at))
         or not exists(select 1 from public.profiles p where p.user_id=uid and p.username=c.username) then return bad; end if;
     end if;
     if exists(select 1 from private.manee_sms_bindings b where b.phone_e164=c.phone_e164 and b.user_id<>uid)
       or exists(select 1 from private.manee_sms_challenges held where held.phone_e164=c.phone_e164
         and held.id<>c.id and held.status='consuming' and held.purpose in ('signup_owner','signup_staff','signup_social','bind')
         and held.target_user_id is distinct from uid) then
       return jsonb_build_object('ok',false,'error','phone_taken'); end if;
     -- Authorize only this operation's new binding for the table trigger.
     update private.manee_sms_challenges set target_user_id=uid where id=c.id;
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
$function$;

revoke all on function private.manee_sms_service(text,jsonb) from public,anon,authenticated;
grant execute on function private.manee_sms_service(text,jsonb) to service_role;
revoke all on function public.manee_sms_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.manee_sms_service(text,jsonb) to service_role;
