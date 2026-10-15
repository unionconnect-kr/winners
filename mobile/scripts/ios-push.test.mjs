import test from 'node:test';
import assert from 'node:assert/strict';
import {createIosPush} from '../src/ios-push.js';
function setup({ready=true,permission='granted',timeoutMs=20,rpcError=false,token='AB'.repeat(32),registerError=false}={}){
 let context={userId:'owner',storeId:'store',role:'storeOwner'},prompts=0,removed=0,unregistered=0;
 const events={},calls=[],storage=new Map();
 context.db={rpc:async(name,args)=>{calls.push({name,args});return rpcError?{error:{message:'offline'}}:{data:true};}};
 const client=createIosPush({getContext:()=>context,timeoutMs,
  storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  request:async(c,name,body)=>{calls.push({name,action:body.action});return {ready,sent:1};},
  push:{addListener:async(name,fn)=>{events[name]=fn;return {remove:async()=>{delete events[name];removed++;}};},
   register:async()=>{if(registerError)throw Error('registration failed');if(token)events.registration({value:token});},
   unregister:async()=>unregistered++,removeAllDeliveredNotifications:async()=>{},
   checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>{prompts++;return {receive:'granted'};}}
 });
 return {client,calls,storage,events,context,setContext:c=>context=c,counts:()=>({prompts,removed,unregistered})};
}
test('unconfigured APNs never asks iOS permission or records a device',async()=>{
 const h=setup({ready:false,permission:'prompt'});const result=await h.client.action('enable');
 assert.equal(result.ready,false);assert.equal(h.counts().prompts,0);assert.equal(h.calls.length,1);
});
test('explicit consent registers normalized APNs token and refresh never prompts',async()=>{
 const h=setup({permission:'prompt'});await h.client.action('refresh');assert.equal(h.counts().prompts,0);
 assert.equal((await h.client.action('enable')).subscribed,true);assert.equal(h.counts().prompts,1);
 assert.equal(h.calls.find(c=>c.args?.p_enabled).args.p_token,'ab'.repeat(32));assert.equal(h.counts().removed,2);
 await h.client.action('refresh');assert.equal(h.counts().prompts,1);
});
test('invalid tokens, callback timeout and register failures clean both listeners',async()=>{
 for(const options of [{token:'bad'},{token:null},{registerError:true}]){
  const h=setup(options);await assert.rejects(()=>h.client.action('enable'));assert.equal(h.counts().removed,2);
  assert.equal(h.calls.some(c=>c.args?.p_enabled),false);
 }
});
test('logout stays available offline and removes local consent',async()=>{
 const h=setup({rpcError:true});h.storage.set('manee-ios-push:owner:store','1');await h.client.prepareLogout();
 assert.equal(h.storage.size,0);assert.equal(h.counts().unregistered,1);
});
test('staff cannot register or send a self-selected owner notification',async()=>{
 const h=setup();h.setContext({...h.context,role:'staff'});const result=await h.client.action('enable');
 assert.equal(result.subscribed,false);assert.equal(h.calls.length,0);
});
test('permission withdrawn in iOS removes the live device binding',async()=>{
 const h=setup({permission:'denied'});h.storage.set('manee-ios-push:owner:store','1');
 assert.equal((await h.client.action('refresh')).subscribed,false);
 assert.equal(h.calls.at(-1).args.p_enabled,false);assert.equal(h.storage.size,0);
});
