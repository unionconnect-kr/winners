import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {maintenanceHandler}=require('../netlify/functions/lib/ios-maintenance.cjs');
const token='a'.repeat(64),id='00000000-0000-4000-8000-000000000001';
const env={IOS_MAINTENANCE_TOKEN:token,APNS_KEY_ID:'fixture',APNS_TEAM_ID:'J7AWFKW86N',APNS_PRIVATE_KEY:'mock-only'};
const job={id,store_id:id,lease_id:id,token:'ab'.repeat(32),kind:'report_closed',month_key:'2026-09',expires_at:new Date(Date.now()+60000).toISOString()};
test('maintenance bearer is required before accessing privileged data',async()=>{
 let calls=0;const handler=maintenanceHandler({mode:'push',env,db:{rpc:async()=>calls++}});
 assert.equal((await handler({httpMethod:'POST',headers:{authorization:'Bearer wrong'}})).statusCode,401);
 assert.equal((await handler({httpMethod:'GET',headers:{authorization:'Bearer '+token}})).statusCode,405);assert.equal(calls,0);
});
test('delivery rechecks current recipient, uses committed routing and never caller content',async()=>{
 for(const live of [true,false]){
  const calls=[];const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='manee_claim_ios_deliveries'?[job]:name==='manee_ios_push_targets'?(live?[{token:job.token}]:[]):true};}};
  const handler=maintenanceHandler({mode:'push',env,db,send:async(token,data)=>{calls.push(['sent',token,data]);return {sent:true};}});
  const r=await handler({httpMethod:'POST',headers:{authorization:'Bearer '+token},body:'{"title":"attacker","token":"attacker"}'});
  assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).succeeded,live?1:0);
  assert.equal(calls.at(-1)[1].p_result,live?'sent':'skipped');
  if(live){assert.equal(calls.find(c=>c[0]==='sent')[2].monthKey,'2026-09');assert.doesNotMatch(JSON.stringify(calls),/attacker/);}
 }
});
test('provider errors retry without dropping valid APNs registrations',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='manee_claim_ios_deliveries'?[job]:name==='manee_ios_push_targets'?[{token:job.token}]:true};}};
 const handler=maintenanceHandler({mode:'push',env,db,send:async()=>{throw Error('offline');}});
 await handler({httpMethod:'POST',headers:{authorization:'Bearer '+token}});
 assert.equal(calls.at(-1)[1].p_result,'retry');assert.equal(calls.some(c=>c[0]==='manee_ios_drop_push'),false);
});
