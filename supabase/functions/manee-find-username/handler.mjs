import {phone,sha,hmac,otp,sendSms} from './core.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const invalid=()=>json({ok:false,error:'verification_invalid',message:'인증번호가 맞지 않거나 만료됐어요. 다시 확인해 주세요.'},400);
export function createHandler({admin,url,publishableKey,sms,deliver=sendSms}){
  return async req=>{
    if(req.method==='OPTIONS')return new Response('ok',{headers});
    if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
    if(!['https://bhwuuxcrzxespkjlmqxr.supabase.co','https://obpkzecgswnfuyhwvncd.supabase.co'].includes(url)||!publishableKey||!admin)return json({ok:false,error:'server_not_configured'},503);
    if(req.headers.get('apikey')!==publishableKey)return json({ok:false,error:'app_key_required'},401);
    try{
      const raw=await req.text();if(raw.length>2048)return json({ok:false,error:'request_too_large'},413);
      let b;try{b=JSON.parse(raw);}catch{return invalid();}
      if(!b||typeof b!=='object'||Array.isArray(b)||!['request','verify'].includes(b.action))return invalid();
      const dest=b.action==='request'?phone(b.phone):'';
      if(b.action==='request'&&!dest)return json({ok:false,error:'invalid_phone',message:'010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.'},400);
      if(b.action==='verify'&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(b.challenge_id||'')||!/^\d{6}$/.test(b.code||'')))return invalid();
      const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
      const limit=await admin.rpc('consume_auth_rate_limit',{p_action:'sms_api_ip',p_key_hash:await sha(ip),p_window_seconds:300,p_max_attempts:60});
      if(limit.error)throw Error('database_unavailable');
      if(!limit.data)return json({ok:false,error:'rate_limited',message:'요청이 많아요. 잠시 후 다시 시도해 주세요.',retry_after:300},429);
      if(!sms.key||!sms.secret||!/^\d{8,11}$/.test(sms.sender))return json({ok:false,error:'sms_unavailable',message:'문자 인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.'},503);
      const rpc=async(action,payload)=>{const r=await admin.rpc('manee_find_username_service',{p_action:action,p_payload:payload});if(r.error)throw Error('database_unavailable');return r.data;};
      if(b.action==='request'){
        const id=crypto.randomUUID(),code=otp();
        const r=await rpc('request',{id,phone:dest,phone_hash:await hmac(sms.secret,'phone:'+dest),ip_hash:await sha(ip),code_hash:await hmac(sms.secret,'find-username:'+id+':'+code)});
        if(!r?.ok){if(r?.error==='rate_limited')return json({ok:false,error:'rate_limited',retry_after:r.retry_after,message:'재전송 제한에 도달했어요. 잠시 후 다시 시도해 주세요.'},429);return invalid();}
        if(r.send_allowed){let sent=false;try{sent=await deliver(sms,dest,code);}catch{}await rpc(sent?'sent':'failed',{id});}
        // Do not reveal whether the phone belongs to an account before proof.
        return json({ok:true,challenge_id:id,expires_in:180,resend_after:60,message:'가입·복구용으로 인증한 번호와 일치하면 인증번호를 보내드려요.'});
      }
      const r=await rpc('verify',{id:b.challenge_id,code_hash:await hmac(sms.secret,'find-username:'+b.challenge_id+':'+b.code)});
      if(!r?.ok||!Array.isArray(r.usernames))return invalid();
      const usernames=r.usernames.filter(x=>typeof x==='string'&&/^[a-z0-9가-힣._-]{4,30}$/.test(x)).slice(0,20);
      return json({ok:true,usernames});
    }catch{return json({ok:false,error:'request_failed',message:'처리 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'},503);}
  };
}
