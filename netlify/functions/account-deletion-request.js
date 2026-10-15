'use strict';
const {createHash}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {blockExternalService}=require('./lib/manee-environment.cjs');

const response=(statusCode,body)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
const digest=value=>createHash('sha256').update(value).digest('hex');
const accepted=()=>response(200,{ok:true,message:'삭제 요청을 접수했어요. 계정과 연락처 확인 후 처리 절차를 안내하겠습니다.'});

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return response(405,{error:'method_not_allowed'});
  if(blockExternalService())return response(503,{error:'service_not_ready'});
  if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>2048)return response(400,{error:'invalid_request'});
  let payload;
  try{payload=JSON.parse(event.body||'');}catch{return response(400,{error:'invalid_request'});}
  const username=typeof payload.username==='string'?payload.username.normalize('NFKC').trim().toLowerCase():'';
  const contact=typeof payload.contact==='string'?payload.contact.trim():'';
  if(!/^[a-z0-9가-힣._-]{4,30}$/.test(username)||contact.length<5||contact.length>120||/[<>\x00-\x1f\x7f]/.test(contact))
    return response(400,{error:'invalid_request',message:'아이디와 연락 가능한 이메일 또는 전화번호를 확인해 주세요.'});
  const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://bhwuuxcrzxespkjlmqxr.supabase.co'||!secret)return response(503,{error:'service_not_ready'});
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  // No account lookup or account existence disclosure. Contact is used only for
  // the manual verification response and is never sent back to the caller.
  const ip=event.headers?.['x-nf-client-connection-ip']||event.headers?.['x-forwarded-for']?.split(',')[0]?.trim()||'unknown';
  try{
    for(const [action,value,limit] of [['account_deletion_ip',ip,30],['account_deletion_identity',username+':'+contact.toLowerCase(),5]]){
      const {data,error}=await db.rpc('consume_auth_rate_limit',{p_action:action,p_key_hash:digest(value),p_window_seconds:3600,p_max_attempts:limit});
      if(error||typeof data!=='boolean')throw Error('rate_limit_unavailable');
      if(!data)return response(429,{error:'rate_limited',message:'요청이 많아요. 잠시 후 다시 시도해 주세요.'});
    }
    const {error}=await db.rpc('manee_account_deletion_request',{p_username:username,p_contact:contact});
    if(error)throw Error('request_unavailable');
    return accepted();
  }catch{return response(503,{error:'service_unavailable',message:'요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
};
