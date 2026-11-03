import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {STAGING_URL,username,phone,validPassword,validNewPassword,sha,hmac,otp,proof,sendSms} from './core.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function key(env:string,legacy:string){try{const v=JSON.parse(Deno.env.get(env)||'{}').default;if(v)return v;}catch{}return Deno.env.get(legacy)||'';}
const invalid=()=>reply({ok:false,error:'verification_invalid',message:'인증 정보가 맞지 않거나 만료됐어요. 번호를 확인하고 다시 인증해 주세요.'},400);
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL'),secretKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY'),pub=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  if(url!==STAGING_URL||!secretKey||!pub)return reply({error:'server_not_configured'},503);
  if(req.headers.get('apikey')!==pub)return reply({error:'app_key_required'},401);
  const raw=await req.text();if(raw.length>4096)return reply({error:'request_too_large'},413);
  const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))return invalid();
  const action=String(b.action||''),purpose=String(b.purpose||''),uname=username(b.username);
  if(!['request','verify','reset','bind'].includes(action)||!['signup_owner','signup_staff','reset','bind'].includes(purpose)||!/^[a-z0-9가-힣._-]{4,30}$/.test(uname))return invalid();
  if(['signup_owner','signup_staff'].includes(purpose)&&uname.length<6)return reply({error:'invalid_username',message:'아이디는 6~30자로 입력해 주세요.'},400);
  const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(a:string,p:Record<string,unknown>)=>{const r=await admin.rpc('manee_sms_service',{p_action:a,p_payload:p});if(r.error)throw new Error('database_unavailable');return r.data;};
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const limit=await admin.rpc('consume_auth_rate_limit',{p_action:'sms_api_ip',p_key_hash:await sha(ip),p_window_seconds:300,p_max_attempts:60});
  if(limit.error)throw new Error('database_unavailable');
  if(!limit.data)return reply({error:'rate_limited',message:'요청이 많아요. 잠시 후 다시 시도해 주세요.'},429);
  let actor:Record<string,unknown>={};
  if(purpose==='bind'){
   const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
   const {data,error}=await admin.auth.getUser(token);if(error||!data.user)return invalid();
   let sid='';try{sid=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||'';}catch{return invalid();}
   actor={user_id:data.user.id,session_id:sid};
   const cred=await rpc('credentials',actor);if(!cred?.ok||cred.username!==uname)return invalid();
   if(action==='request'){
    if(!validPassword(b.current_password))return invalid();
    const userClient=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
    const signed=await userClient.auth.signInWithPassword({email:cred.email,password:b.current_password});
    if(signed.error||signed.data.user?.id!==data.user.id)return invalid();
    await userClient.auth.signOut({scope:'local'});
   }
  }
  if(action==='request'){
   const dest=phone(b.phone);if(!dest)return reply({error:'invalid_phone',message:'010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.'},400);
   const config={key:(Deno.env.get('SOLAPI_API_KEY')||'').trim(),secret:(Deno.env.get('SOLAPI_API_SECRET')||'').trim(),sender:(Deno.env.get('SOLAPI_SENDER_NUMBER')||'').trim()};
   if(!config.key||!config.secret||!/^\d{8,11}$/.test(config.sender))return reply({error:'sms_unavailable',message:'문자 인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.'},503);
   const id=crypto.randomUUID(),code=otp();
   const result=await rpc('request',{id,purpose,username:uname,phone:dest,phone_hash:await hmac(config.secret,'phone:'+dest),username_hash:await sha(uname),ip_hash:await sha(ip),code_hash:await hmac(config.secret,'otp:'+id+':'+code),...actor});
   if(!result?.ok){if(result?.error==='rate_limited')return reply({error:'rate_limited',retry_after:result.retry_after,message:'재전송 제한에 도달했어요. 잠시 후 다시 시도해 주세요.'},429);return invalid();}
   let sent=false;
   if(result.send_allowed){try{sent=await sendSms(config,dest,code);}catch{}const saved=await rpc(sent?'sent':'failed',{id});if(!saved?.ok)sent=false;}
   // Recovery always has the same public outcome for unknown, social-only and unverified accounts.
   if(!sent&&purpose!=='reset')return reply({error:'sms_unavailable',message:'인증 문자를 보내지 못했어요. 아이디와 번호를 확인하고 잠시 후 다시 시도해 주세요.'},503);
   return reply({ok:true,challenge_id:id,expires_in:180,resend_after:60,message:purpose==='reset'?'등록·인증된 번호와 일치하면 인증번호를 보내드려요.':'인증번호를 보냈어요. 3분 안에 입력해 주세요.'});
  }
  if(!/^[0-9a-f-]{36}$/.test(String(b.challenge_id||'')))return invalid();
  if(action==='verify'){
   if(!/^\d{6}$/.test(String(b.code||'')))return invalid();
   const secret=(Deno.env.get('SOLAPI_API_SECRET')||'').trim();if(!secret)throw new Error('sms_unavailable');
   const token=proof(),result=await rpc('verify',{id:b.challenge_id,purpose,username:uname,code_hash:await hmac(secret,'otp:'+b.challenge_id+':'+b.code),proof_hash:await sha(token),...actor});
   if(!result?.ok)return invalid();
   return reply({ok:true,proof:token,expires_in:600,message:'휴대폰 인증을 완료했어요.'});
  }
  if(action!==purpose||!['reset','bind'].includes(action)||!/^[0-9a-f]{64}$/.test(String(b.proof||'')))return invalid();
  if(action==='reset'&&!validNewPassword(b.new_password))return reply({error:'invalid_password',message:'비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)'},400);
  const claim=await rpc('claim',{id:b.challenge_id,purpose,username:uname,proof_hash:await sha(b.proof),...actor});
  if(!claim?.ok)return invalid();
  if(action==='reset'){
   const result=await admin.auth.admin.updateUserById(claim.user_id,{password:b.new_password});
   if(result.error)return reply({error:'reset_uncertain',message:'변경 결과를 확인하지 못했어요. 새 비밀번호로 로그인을 확인해 주세요.'},503);
  }
  const done=await rpc('complete',{id:b.challenge_id,operation_id:claim.operation_id,user_id:claim.user_id});
  if(!done?.ok)throw new Error('completion_uncertain');
  return reply({ok:true,message:action==='reset'?'비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.':'복구용 휴대폰 번호를 등록했어요.'});
 }catch{return reply({error:'request_failed',message:'처리 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},503);}
});
