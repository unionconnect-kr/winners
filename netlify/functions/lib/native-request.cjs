'use strict';
const {createClient}=require('@supabase/supabase-js');
const {blockExternalService}=require('./manee-environment.cjs');
const publicSites=require('../../../config/public-sites.json');
const origins=new Set(['capacitor://localhost',...publicSites.map(s=>new URL(s.origin).origin)]);
function response(status,data,event){return {statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',
 ...(origins.has(event?.headers?.origin)?{'Access-Control-Allow-Origin':event.headers.origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})},body:JSON.stringify(data)};}
function preflight(event){
 if(event.headers?.origin&&!origins.has(event.headers.origin))return response(403,{error:'origin_denied'},event);
 if(event.httpMethod==='OPTIONS')return response(204,{},event);
 if(event.httpMethod!=='POST')return response(405,{error:'method_not_allowed'},event);
 const blocked=blockExternalService();if(blocked)return response(503,{error:'service_not_ready'},event);
 if(event.isBase64Encoded||Buffer.byteLength(event.body||'')>65536)return response(400,{error:'invalid_request'},event);
}
async function authenticate(event){
 const bearer=event.headers?.authorization||event.headers?.Authorization;
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer||''))throw Error('authentication_required');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('service_not_ready');
 const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const jwt=bearer.slice(7);
 const {data,error}=await service.auth.getUser(jwt);
 if(error||!data?.user)throw Error('authentication_required');
 // PostgREST uses the user's JWT for every authorization RPC, not service_role.
 const user=createClient(url,key,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 return {service,user,userId:data.user.id};
}
async function ownerContext(user,storeId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId||''))throw Error('invalid_request');
 const {data,error}=await user.rpc('manee_ios_context',{p_store_id:storeId});
 if(error||!data?.appAccountToken)throw Error('owner_access_denied');
 return data;
}
async function pushContext(user,storeId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId||''))throw Error('invalid_request');
 const {data,error}=await user.rpc('manee_ios_push_context',{p_store_id:storeId});
 if(error||data!==true)throw Error('push_access_denied');
}
function failure(error,event){
 const known={authentication_required:401,owner_access_denied:403,push_access_denied:403,invalid_request:400,purchase_mismatch:409,subscription_unavailable:503,
  billing_not_ready:503,service_not_ready:503,push_not_ready:503,other_store_subscribed:409,other_platform_subscribed:409,checkout_in_progress:409};
 const code=Object.hasOwn(known,error?.message)?error.message:'native_service_failed';
 return response(known[code]||503,{error:code},event);
}
module.exports={response,preflight,authenticate,ownerContext,pushContext,failure};
