import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoUploadHandler} from '../supabase/functions/manee-checklist-photo-upload/handler.mjs';
import sharp from 'sharp';
const uid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001',pid='30000000-0000-4000-8000-000000000001',base=sid+'/2026-11-24/'+uid+'/'+pid;
const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).jpeg().toBuffer(),image=jpeg.toString('base64');
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
 const bomb=Buffer.from(jpeg),frame=bomb.indexOf(Buffer.from([255,192]));assert.ok(frame>0);bomb[frame+7]=127;bomb[frame+8]=255;
 for(const bad of [{count:5},{thumbnail:Buffer.alloc(32769,255).toString('base64')},{image:Buffer.from('<svg onload="alert(1)">').toString('base64')},{image:bomb.toString('base64')},{image:Buffer.from([255,216,255,224,0,255,217]).toString('base64')}]){const h=setup(),r=await h.run(bad);assert.equal(r.status,400);assert.equal(h.rpcCalls.length,0);assert.equal(h.writes.length,0);}
});
test('authorized image and thumbnail use canonical server paths without user-owned storage',async()=>{
 const h=setup(),r=await h.run();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,photo_id:pid});assert.equal(h.writes.length,2);assert.deepEqual(h.writes.map(w=>w.path),[base+'/image.jpg',base+'/thumb.jpg']);assert.ok(h.writes.every(w=>w.options.upsert===false&&w.options.contentType==='image/jpeg'));assert.equal(h.clients.find(c=>c.key==='SUPABASE_SERVICE_ROLE_KEY').options.global,undefined);assert.equal(h.rpcCalls[0].name,'manee_checklist_prepare_photos');
});
test('a partial storage failure cannot return a successful completion',async()=>{const h=setup({uploadError:true}),r=await h.run();assert.equal(r.status,400);assert.equal((await r.json()).code,'UPLOAD_FAILED');});
test('already delivered clients can upload width-resized portrait photos and thumbnails',async()=>{
 for(const [width,height] of [[900,1200],[1080,1920]]){
  const input=sharp({create:{width,height,channels:3,background:'#88aa77'}});
  const full=await input.clone().resize({width:1280,withoutEnlargement:true}).jpeg().toBuffer();
  const thumbnail=await input.clone().resize({width:160,withoutEnlargement:true}).jpeg().toBuffer();
  const h=setup(),r=await h.run({image:full.toString('base64'),thumbnail:thumbnail.toString('base64')});
  assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(h.writes.length,2);
 }
});
test('portrait compatibility keeps strict decode, byte, ownership and reservation bounds',async()=>{
 const tooTall=await sharp({create:{width:160,height:321,channels:3,background:'#fff'}}).jpeg().toBuffer();
 const tooWide=await sharp({create:{width:161,height:100,channels:3,background:'#fff'}}).jpeg().toBuffer();
 for(const thumbnail of [tooTall,tooWide]){
  const h=setup(),r=await h.run({thumbnail:thumbnail.toString('base64')});assert.equal(r.status,400);assert.equal((await r.json()).code,'INVALID_IMAGE');assert.equal(h.rpcCalls.length,0);assert.equal(h.writes.length,0);
 }
 const input=sharp({create:{width:900,height:1200,channels:3,background:'#fff'}});
 const image=(await input.clone().jpeg().toBuffer()).toString('base64'),thumbnail=(await input.clone().resize({width:160}).jpeg().toBuffer()).toString('base64');
 for(const cfg of [{unauthorized:true},{denied:true},{badPath:true}]){const h=setup(cfg),r=await h.run({image,thumbnail});assert.ok(r.status>=400);assert.equal(h.writes.length,0);}
});
