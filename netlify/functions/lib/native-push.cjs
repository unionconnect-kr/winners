'use strict';
const http2=require('node:http2');
const {createPrivateKey,sign}=require('node:crypto');
let cached;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const labels={test:'아이폰 알림이 연결됐어요.',attendance_in:'매장에 출근 기록이 등록됐어요.',attendance_out:'매장에 퇴근 기록이 등록됐어요.',
 reservation_created:'새 예약이 등록됐어요.',reservation_cancelled:'예약이 취소됐어요.',reservation_upcoming:'곧 예정된 예약이 있어요.',
 reservation_due:'예약 시간이 됐어요.',report_closed:'월말 보고서가 마감됐어요.',monthly_costs:'월말 보고서에 필요한 비용을 확인해 주세요.',notice:'매장에 확인할 새 알림이 있어요.'};
function apnsPayload(notification){
 if(!uuid.test(notification.storeId||'')||!Object.hasOwn(labels,notification.kind))throw Error('invalid_notification');
 return {aps:{alert:{title:'매니',body:labels[notification.kind]},sound:'default'},storeId:notification.storeId,kind:notification.kind,
  ...(uuid.test(notification.eventId||'')?{eventId:notification.eventId}:{}),
  ...(/^\d{4}-(0[1-9]|1[0-2])$/.test(notification.monthKey||'')?{monthKey:notification.monthKey}:{}),
  ...(/^\d{4}-\d{2}-\d{2}$/.test(notification.eventDate||'')?{eventDate:notification.eventDate}:{})};
}
const apnsReasons=new Set(['BadEnvironmentKeyIdInToken','BadEnvironmentKeyInToken','BadDeviceToken','DeviceTokenNotForTopic','TopicDisallowed','BadTopic','MissingTopic','InvalidProviderToken','ExpiredProviderToken','Forbidden','Unregistered','TooManyRequests','InternalServerError','ServiceUnavailable','Shutdown']);
function apnsResult(status,body){
 if(status===200)return {sent:true,expired:false};
 let reason;try{reason=JSON.parse(body).reason;}catch{}
 return {sent:false,expired:status===410||(status===400&&reason==='BadDeviceToken'),reason:apnsReasons.has(reason)?reason:'ApnsRejected',status};
}
function configured(env=process.env){return !!env.APNS_KEY_ID&&!!env.APNS_PRIVATE_KEY&&env.APNS_TEAM_ID==='J7AWFKW86N';}
function signingKey(value){
 // Environment editors may retain literal escaped line endings from a PEM paste.
 // Base64 inside the PEM never contains backslashes; normalize only line endings.
 let pem=value.trim();
 if(pem.startsWith('"')){try{const decoded=JSON.parse(pem);if(typeof decoded==='string')pem=decoded;}catch{throw Error('push_signing_key_invalid');}}
 pem=pem.replace(/\\+r\\+n|\\+n|\\+r/g,'\n');
 // A single-line environment input can strip real PEM newlines entirely.
 const compact=pem.match(/^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END PRIVATE KEY-----$/);
 if(compact){const body=compact[1].replace(/\s/g,'');pem='-----BEGIN PRIVATE KEY-----\n'+body.match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n';}
 const key=createPrivateKey(pem);
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('push_signing_key_invalid');
 return key;
}
function providerToken(env=process.env,now=Math.floor(Date.now()/1000)){
 if(!configured(env))throw Error('push_not_ready');
 if(cached&&cached.keyId===env.APNS_KEY_ID&&cached.key===env.APNS_PRIVATE_KEY&&cached.issued<=now&&now-cached.issued<3000)return cached.value;
 const header=Buffer.from(JSON.stringify({alg:'ES256',kid:env.APNS_KEY_ID})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:env.APNS_TEAM_ID,iat:now})).toString('base64url');
 let key;try{
  key=signingKey(env.APNS_PRIVATE_KEY);
 }catch{throw Error('push_signing_key_invalid');}
 const input=header+'.'+payload;
 const value=input+'.'+sign('sha256',Buffer.from(input),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 cached={keyId:env.APNS_KEY_ID,key:env.APNS_PRIVATE_KEY,issued:now,value};return value;
}
async function sendApns(token,notification,env=process.env){
 if(!/^[0-9a-f]{32,512}$/.test(token)||token.length%2)throw Error('invalid_device');
 // Generic content avoids displaying customer/staff financial data on lock screens.
 const payload=JSON.stringify(apnsPayload(notification));
 const jwt=providerToken(env);
 return new Promise((resolve,reject)=>{
  // App Store/TestFlight provisioning uses the production APNs environment.
  const client=http2.connect('https://api.push.apple.com');
  let settled=false,request,timer;
  const end=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);request?.close();client.destroy();error?reject(error):resolve(result);};
  timer=setTimeout(()=>end(Error('push_timeout')),7000);
  client.on('error',()=>end(Error('push_connection_failed')));
  client.on('goaway',()=>end(Error('push_connection_closed')));
  client.once('connect',()=>{
   request=client.request({':method':'POST',':path':'/3/device/'+token,authorization:'bearer '+jwt,
    'apns-topic':'kr.co.manee.app','apns-push-type':'alert','apns-priority':'10','apns-expiration':'0',
    ...(uuid.test(notification.eventId||'')?{'apns-collapse-id':notification.eventId}:{}),'content-type':'application/json'});
   let status=0,body='';
   request.on('response',headers=>status=Number(headers[':status']));
   request.setEncoding('utf8');request.on('data',chunk=>{body+=chunk;if(body.length>4096)end(Error('push_response_invalid'));});
   request.on('error',()=>end(Error('push_request_failed')));
   request.on('end',()=>{
    end(null,apnsResult(status,body));
   });
   request.end(payload);
  });
 });
}
async function sendNativePush(db,{storeId,userId=null,kind='notice'},env=process.env,send=sendApns){
 if(!configured(env))return {ready:false,sent:0,failed:0};
 const {data,error}=await db.rpc('manee_ios_push_targets',{p_store_id:storeId,p_user_id:userId});
 if(error)throw Error('push_targets_unavailable');
 let sent=0,failed=0;const failureReasons={};
 const recordFailure=reason=>{const safe=apnsReasons.has(reason)||['push_timeout','push_connection_failed','push_connection_closed','push_request_failed','push_response_invalid','push_not_ready','push_signing_key_invalid','invalid_device','ApnsRejected'].includes(reason)?reason:'PushTransportError';failureReasons[safe]=(failureReasons[safe]||0)+1;};
 for(let at=0;at<(data||[]).length;at+=10){
  await Promise.all(data.slice(at,at+10).map(async target=>{
   try{
    const result=await send(target.token,{storeId,kind},env);
    if(result.sent)sent++;else {failed++;recordFailure(result.reason);}
    if(result.expired){const dropped=await db.rpc('manee_ios_drop_push',{p_token:target.token});if(dropped.error)console.warn('Native push cleanup unavailable');}
   }catch(error){failed++;recordFailure(error?.message);}
  }));
 }
 if(failed||!data?.length)console.warn('Native APNs delivery',JSON.stringify({kind,targets:data?.length||0,sent,failed,failureReasons}));
 return {ready:true,sent,failed};
}
module.exports={apnsResult,configured,providerToken,apnsPayload,sendApns,sendNativePush};
