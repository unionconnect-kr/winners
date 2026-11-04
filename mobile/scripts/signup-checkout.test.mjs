import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSignupCheckout} from '../src/signup-checkout.mjs';
import {signupCheckoutHtml} from './signup-checkout-html.mjs';
function setup(access,{enabled=true}={}){
 let c={userId:'owner',storeId:'store',role:'storeOwner'},opened=0,reads=0;
 const start=createSignupCheckout({getContext:()=>c,enabled,readAccess:async()=>{reads++;return typeof access==='function'?access():access;},openCheckout:async()=>{opened++;}});
 return {start,set:c1=>c=c1,opened:()=>opened,reads:()=>reads};
}
test('signup offers checkout only for explicitly enforced unpaid owners',async()=>{
 const h=setup({enforced:true,canWrite:false});assert.equal((await h.start()).status,'offered');assert.equal(h.opened(),1);
 for(const access of [{enforced:false,canWrite:true},{enforced:true,canWrite:true},{},null]){
  const h=setup(access);await h.start();assert.equal(h.opened(),0);
 }
});
test('QA builds, staff and account changes never open signup checkout',async()=>{
 const disabled=setup({}, {enabled:false});assert.equal((await disabled.start()).status,'unavailable');assert.equal(disabled.reads(),0);
 const staff=setup({});staff.set({userId:'staff',storeId:'store',role:'staff'});assert.equal((await staff.start()).status,'not_owner');assert.equal(staff.reads(),0);
 let done;const changed=setup(()=>new Promise(r=>done=r));const task=changed.start();
 assert.equal((await changed.start()).status,'busy');
 changed.set({userId:'other',storeId:'store',role:'storeOwner'});done({enforced:true,canWrite:false});
 assert.equal((await task).status,'changed');assert.equal(changed.opened(),0);
});
test('signup transforms both entry paths and billing errors do not become signup failures',async()=>{
 const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');const html=signupCheckoutHtml(source);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 assert.match(html,/await enterAuthenticatedOwner\(data.user.username, data.store.name\);\s+await offerSignupSubscription\(\)/);
 assert.match(html,/await resolveIdentity\(\);if\(chosenRole==='owner'\)await offerSignupSubscription\(\)/);
 assert.throws(()=>signupCheckoutHtml(html),/anchor/);
 const notices=[],c={window:{MANEE_NATIVE:{afterOwnerSignup:async()=>{throw Error('offline');}}},showToast:s=>notices.push(s)};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('  async function offerSignupSubscription'),html.indexOf('  async function submitOwnerRequest')),c);
 await c.offerSignupSubscription();assert.match(notices[0],/가입은 완료/);
});
