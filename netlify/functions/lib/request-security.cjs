const {createClient}=require('@supabase/supabase-js');
const environments=require('../../../config/environments.json');
const deployment=require('./manee-environment.json');
function reply(statusCode,error){return {statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({error})};}
function parseBody(event,maxBytes){
  if(event.isBase64Encoded)throw Object.assign(Error('unsupported_encoding'),{status:400});
  if(typeof event.body!=='string'||Buffer.byteLength(event.body)>maxBytes)throw Object.assign(Error('request_too_large'),{status:413});
  let value;try{value=JSON.parse(event.body);}catch{throw Object.assign(Error('invalid_json'),{status:400});}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(Error('invalid_request'),{status:400});
  return value;
}
async function authorize(event,body,service){
  const token=Object.entries(event.headers||{}).find(([k])=>k.toLowerCase()==='authorization')?.[1];
  if(typeof token!=='string'||!/^Bearer [^\s]+$/i.test(token))return {response:reply(401,'로그인이 필요해요.')};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.storeId||''))return {response:reply(400,'매장을 확인해 주세요.')};
  const cfg=environments[deployment.environment];
  if(!cfg||cfg.projectRef!==deployment.projectRef)return {response:reply(503,'서비스를 준비 중이에요.')};
  const client=createClient(cfg.supabaseUrl,cfg.publishableKey,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  try{
    const user=await client.auth.getUser(token.slice(7));
    if(user.error||!user.data?.user)return {response:reply(401,'다시 로그인해 주세요.')};
    const gate=await client.rpc('manee_authorize_service',{p_store_id:body.storeId,p_service:service});
    if(gate.error||!gate.data?.allowed){const code=gate.data?.code;return {response:reply(code==='rate_limit'?429:403,code==='rate_limit'?'사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.':'이 기능을 사용할 권한을 확인해 주세요.')};}
    return {userId:user.data.user.id,client,servicePolicy:gate.data};
  }catch{return {response:reply(503,'인증 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')};}
}
function imageMatches(base64,mime){
  if(typeof base64!=='string'||base64.length>4194304||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length%4!==0)return false;
  const b=Buffer.from(base64,'base64');if(b.length<12||b.length>3*1024*1024)return false;
  if(mime==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217;
  if(mime==='image/png')return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/webp')return b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  return false;
}
function minimizedContext(value){
  const c=value&&typeof value==='object'?value:{},out={};
  for(const k of ['month','today'])if(typeof c[k]==='string'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(c[k]))out[k]=c[k];
  out.crewCount=Number.isSafeInteger(c.crewCount)&&c.crewCount>=0?Math.min(c.crewCount,10000):0;
  out.salesTotals={};for(const k of ['totalSales','cashSales','cardSales','deliveryBaemin','deliveryCoupang','deliveryYogiyo']){const v=c.salesTotals?.[k];if(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12)out.salesTotals[k]=v;}
  return out;
}
module.exports={reply,parseBody,authorize,imageMatches,minimizedContext};
