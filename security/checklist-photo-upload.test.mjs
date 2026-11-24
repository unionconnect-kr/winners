import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoUploadHandler} from '../supabase/functions/manee-checklist-photo-upload/handler.mjs';
const uid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001',pid='30000000-0000-4000-8000-000000000001',base=sid+'/2026-11-24/'+uid+'/'+pid;
const image=Buffer.from([255,216,255,224,0,255,217]).toString('base64');
function setup({unauthorized=false,denied=false,badPath=false,uploadError=false}={}){
 const writes=[],rpcCalls=[],clients=[];
 const handler=createPhotoUploadHandler({env:key=>key,createClient:(_,key,options)=>{
  clients.push({key,options});if(key==='SUPABASE_ANON_KEY')return {auth:{getUser:async()=>unauthorized?{error:{}}:{data:{user:{id:uid}}}},rpc:async(name,args)=>{rpcCalls.push({name,args});return denied?{error:{code:'P4402'}}:{data:{photos:[{id:pid,object_path:badPath?'other-store/image.jpg':base+'/image.jpg',thumbnail_path:base+'/thumb.jpg'}]}};}};
  return {storage:{from:bucket=>({upload:async(path,bytes,options)=>{writes.push({bucket,path,bytes,options});return uploadError?{error:{}}:{};}})}};
 }});
 const body={store_id:sid,date:'2026-11-24',item_id:'clean',count:1,index:0,request_id:'40000000-0000-4000-8000-000000000001',expected_items:{},image,thumbnail:image};
 const run=(overrides={},auth=true)=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-session'}:{})},body:JSON.stringify({...body,...overrides})}));
 return {handler,run,writes,rpcCalls,clients};
}
test('missing or invalid authentication cannot reach service storage',async()=>{for(const cfg of [{},{unauthorized:true}]){const h=setup(cfg);const r=await h.run({},!!cfg.unauthorized);assert.equal(r.status,401);assert.equal(h.writes.length,0);assert.equal(h.clients.some(c=>c.key==='SUPABASE_SERVICE_ROLE_KEY'),false);}});
test('expired entitlement and forged reservation paths cannot upload',async()=>{for(const cfg of [{denied:true},{badPath:true}]){const h=setup(cfg),r=await h.run();assert.ok(r.status>=400);assert.equal(h.writes.length,0);}});
test('fifth image, oversized thumbnail and SVG bytes are rejected before a reservation',async()=>{
 for(const bad of [{count:5},{thumbnail:Buffer.alloc(32769,255).toString('base64')},{image:Buffer.from('<svg onload="alert(1)">').toString('base64')}]){const h=setup(),r=await h.run(bad);assert.equal(r.status,400);assert.equal(h.rpcCalls.length,0);assert.equal(h.writes.length,0);}
});
test('authorized image and thumbnail use canonical server paths without user-owned storage',async()=>{
 const h=setup(),r=await h.run();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,photo_id:pid});assert.equal(h.writes.length,2);assert.deepEqual(h.writes.map(w=>w.path),[base+'/image.jpg',base+'/thumb.jpg']);assert.ok(h.writes.every(w=>w.options.upsert===false&&w.options.contentType==='image/jpeg'));assert.equal(h.clients.find(c=>c.key==='SUPABASE_SERVICE_ROLE_KEY').options.global,undefined);assert.equal(h.rpcCalls[0].name,'manee_checklist_prepare_photos');
});
test('a partial storage failure cannot return a successful completion',async()=>{const h=setup({uploadError:true}),r=await h.run();assert.equal(r.status,400);assert.equal((await r.json()).code,'UPLOAD_FAILED');});
