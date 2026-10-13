// No caller-supplied recipients/content. The DB verifies the scheduler bearer
// before claiming committed events, then rechecks current device access.
export function createDeliveryHandler({staging,credentials,client,send,now=Date.now}) {
 return async request=>{
  const reply=(status,body)=>Response.json(body,{status});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return reply(401,{error:'unauthorized'});
  if(!staging||credentials?.project!=='manee-staging'||!send)return reply(503,{error:'delivery_unavailable'});
  try {
   const {data:jobs,error}=await client.rpc('manee_claim_android_deliveries',{p_dispatch_token:token});
   if(error)return reply(error.code==='42501'?403:503,{error:'claim_failed'});
   if(!Array.isArray(jobs))return reply(503,{error:'claim_failed'});
   let sent=0,retry=0,expired=0,unrecorded=0;
   // Ten claimed jobs, in batches of five, remain within the two-minute lease.
   for(let i=0;i<jobs.length;i+=5)await Promise.all(jobs.slice(i,i+5).map(async job=>{
    let result='retry';
    try {
     const ttl=Math.floor((Date.parse(job.expires_at)-now())/1000);
     if(ttl>0){
      const response=await send(job.token,job.store_id,{id:job.id,kind:job.kind,ttl,monthKey:job.month_key,eventDate:job.event_date});
      result=response.sent?'sent':response.expired?'expired':'retry';
     }
    }catch{/* No credentials, device identifiers or provider responses in logs. */}
    const completed=await client.rpc('manee_finish_android_delivery',{p_id:job.id,p_lease:job.lease_id,p_result:result});
    if(completed.error)unrecorded++;
    if(result==='sent')sent++;else if(result==='expired')expired++;else retry++;
   }));
   return reply(unrecorded?503:200,{claimed:jobs.length,sent,retry,expired,unrecorded});
  }catch{return reply(503,{error:'delivery_unavailable'});}
 };
}
