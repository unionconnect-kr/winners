import test from 'node:test';
import assert from 'node:assert/strict';
import factory from '../factory-client.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(rpc){let context={epoch:1,userId:'owner',storeId:'A',role:'storeOwner'};const client=factory.createController({rpc,context:()=>context,changed:()=>{}});return {client,change:patch=>context={...context,...patch}};}
const catalog=active=>({data:{logistics_active:active,recipes:[{id:'r',title:'Recipe'}]}});
test('logistics owner opens recipes with no subscription/payment call',async()=>{
 const calls=[];const {client}=setup(async(name,args)=>{calls.push([name,args]);return name==='manee_factory_catalog'?catalog(true):{data:{id:'r',instructions:'Protected content'}};});
 await client.load();await client.openRecipe('r');assert.equal(client.snapshot().recipe.instructions,'Protected content');
 assert.deepEqual(calls.map(c=>c[0]),['manee_factory_catalog','manee_factory_recipe']);assert.equal(calls[1][1].p_store_id,'A');
});
test('non-logistics owner and staff cannot initiate recipe fetch',async()=>{
 let calls=0;const {client,change}=setup(async()=>{calls++;return catalog(false);});
 await client.load();await client.openRecipe('r');assert.equal(calls,1);
 change({role:'staff'});await client.load();assert.equal(calls,1);assert.equal(client.snapshot().phase,'idle');
});
test('store switch discards delayed catalog and clears loaded recipe',async()=>{
 const delayed=deferred();const {client,change}=setup(()=>delayed.promise);
 const pending=client.load();change({storeId:'B'});delayed.resolve(catalog(true));await pending;
 assert.equal(client.snapshot().phase,'idle');assert.equal(client.snapshot().recipe,undefined);
});
test('logout/new-account discards in-flight protected recipe',async()=>{
 const delayed=deferred();const {client,change}=setup(async name=>name==='manee_factory_catalog'?catalog(true):delayed.promise);
 await client.load();const pending=client.openRecipe('r');change({userId:'other',epoch:2});
 delayed.resolve({data:{id:'r',instructions:'Owner A secret'}});await pending;
 assert.equal(client.snapshot().recipe,undefined);assert.equal(client.snapshot().phase,'idle');
});
test('revoked logistics or failed recipe fetch clears content and refreshes access',async()=>{
 let active=true;const {client}=setup(async name=>name==='manee_factory_catalog'?catalog(active):{error:new Error('denied')});
 await client.load();active=false;await client.openRecipe('r');
 assert.equal(client.snapshot().active,false);assert.equal(client.snapshot().recipe,undefined);assert.equal(client.snapshot().recipeError,true);
});
test('refresh failure does not preserve earlier granted access',async()=>{
 let fail=false;const {client}=setup(async()=>{if(fail)throw new Error('offline');return catalog(true);});
 await client.load();client.invalidate();fail=true;await client.load();assert.equal(client.snapshot().phase,'error');assert.equal(client.snapshot().active,undefined);
});
test('latest refresh wins when the first response arrives last',async()=>{
 const delayed=deferred();let count=0;const {client}=setup(()=>++count===1?delayed.promise:Promise.resolve(catalog(false)));
 const first=client.load();client.invalidate();await client.load();delayed.resolve(catalog(true));await first;assert.equal(client.snapshot().active,false);
});
test('video links require HTTPS and reject executable URLs and credentials',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com','http://example.com',null])assert.equal(factory.safeVideoUrl(value),null);
 assert.equal(factory.safeVideoUrl('https://example.com/watch'),'https://example.com/watch');
});
