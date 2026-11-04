'use strict';
const {timingSafeEqual}=require('node:crypto');
const {sendApns,configured}=require('./native-push.cjs');
const {apple,currentRecord}=require('./apple-billing.cjs');
const respond=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
function maintenanceHandler({mode,db,env=process.env,send=sendApns,apiFactory=apple,scheduled=false}){
 return async event=>{
  if(event.httpMethod!=='POST')return respond(405,{error:'method_not_allowed'});
  const expected=env.IOS_MAINTENANCE_TOKEN;
  const supplied=(event.headers?.authorization||event.headers?.Authorization||'').replace(/^Bearer /,'');
  if(!scheduled&&(!/^[a-f0-9]{64}$/.test(expected||'')||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))))return respond(401,{error:'authentication_required'});
  if(mode==='push'&&!configured(env))return respond(503,{error:'push_not_ready'});
  try{
   const client=typeof db==='function'?db():db;
   const claimed=await client.rpc(mode==='push'?(scheduled?'manee_ios_claim_scheduled_deliveries':'manee_claim_ios_deliveries'):'manee_ios_claim_refresh',mode==='push'&&!scheduled?{p_dispatch_token:supplied}:{});
   if(claimed.error||!Array.isArray(claimed.data))throw Error('claim_failed');
   let sent=0,failed=0,skipped=0;
   // Each SQL claim is leased and bounded to fifty scheduled records. Sensitive source
   // content, receipt JWS and device tokens are never logged or returned.
   await Promise.all(claimed.data.map(async job=>{
    if(mode==='push'){
     let result='retry';
     try{
      const live=await client.rpc('manee_ios_push_targets',{p_store_id:job.store_id,p_user_id:null});
      if(live.error)throw Error('targets_failed');
      if(!live.data?.some(t=>t.token===job.token)||Date.parse(job.expires_at)<=Date.now())result='skipped';
      else{
       const delivered=await send(job.token,{storeId:job.store_id,kind:job.kind,eventId:job.id,monthKey:job.month_key,eventDate:job.event_date},env);
       result=delivered.sent?'sent':delivered.expired?'expired':'retry';
      }
     }catch{}
     const finish=await client.rpc('manee_finish_ios_delivery',{p_id:job.id,p_lease:job.lease_id,p_result:result});
     if(finish.error||!['sent','skipped'].includes(result))failed++;else if(result==='sent')sent++;else skipped++;
    }else{
     let ok=false;
     try{
      const record=await currentRecord(apiFactory(env,job.environment),job.original_id,job.token,job.product_id);
      const saved=await client.rpc('manee_ios_save_subscription',{p_record:record});if(saved.error||saved.data!==true)throw Error('save_failed');
      ok=true;
     }catch{}
     const finish=await client.rpc('manee_ios_finish_refresh',{p_environment:job.environment,p_original_id:job.original_id,p_lease:job.refresh_lease,p_ok:ok});
     if(!ok||finish.error)failed++;else sent++;
    }
   }));
   if(scheduled){
    const recorded=await client.rpc('manee_ios_record_worker',{p_mode:mode,p_processed:claimed.data.length,p_failed:failed});
    if(recorded.error)throw Error('heartbeat_failed');
   }
   return respond(200,{processed:claimed.data.length,succeeded:sent,failed,skipped});
  }catch{return respond(503,{error:'maintenance_unavailable'});}
 };
}
module.exports={maintenanceHandler};
