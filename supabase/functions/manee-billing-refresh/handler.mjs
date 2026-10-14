import {binding,verifyAndPersist} from '../manee-android-billing/google-play.mjs';
export function createRefreshHandler({client,api}) {
 return async request=>{
  const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return reply(401,{error:'unauthorized'});
  try {
   if(!api)return reply(503,{error:'billing_not_ready'});
   const claimed=await client.rpc('manee_billing_claim',{p_dispatch_token:token});
   if(claimed.error)return reply(claimed.error.code==='42501'?403:503,{error:'claim_failed'});
   if(!Array.isArray(claimed.data)||claimed.data.length>10)return reply(503,{error:'claim_failed'});
   let refreshed=0,retry=0,unrecorded=0;
   await Promise.all(claimed.data.map(async job=>{
    let success=false;
    try{
     await verifyAndPersist({api,purchaseToken:job.purchase_token,
      context:{...binding(job.user_id,job.store_id),productId:job.product_id,basePlanId:'monthly'},
      persist:async record=>{
       if(!['Sandbox','Production'].includes(job.environment??'Sandbox') ||
        record.environment!==(job.environment??'Sandbox'))return false;
       const saved=await client.rpc('manee_android_billing_save',{p_user_id:job.user_id,p_store_id:job.store_id,p_record:record});
       return !saved.error&&saved.data===true;
      }});
     success=true;
    }catch{/* Retry without logging tokens, owner IDs or Google response bodies. */}
    const done=await client.rpc('manee_billing_finish',{p_token:job.purchase_token,p_lease:job.lease_id,p_success:success});
    if(done.error||done.data!==true)unrecorded++;
    if(success)refreshed++;else retry++;
   }));
   return reply(unrecorded?503:200,{claimed:claimed.data.length,refreshed,retry,unrecorded});
  }catch{return reply(503,{error:'refresh_unavailable'});}
 };
}
