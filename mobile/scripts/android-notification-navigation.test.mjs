import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationNavigation,notificationDestination} from '../src/android-notification-navigation.js';
const storeId='00000000-0000-4000-8000-000000000101';
const eventId='00000000-0000-4000-8000-000000000102';
function harness(){
 let c=null,receive,listenerCount=0,clock=0;
 const calls=[];
 const navigation=createNotificationNavigation({push:{addListener:async(name,fn)=>{assert.equal(name,'pushNotificationActionPerformed');listenerCount++;receive=fn;return {remove(){}};}},getContext:()=>c,now:()=>clock,open:async(data,current)=>{calls.push({data,current});return 'handled';}});
 return {navigation,calls,setContext:v=>c=v,advance:()=>clock+=600001,count:()=>listenerCount,tap:(id=eventId)=>receive({actionId:'tap',notification:{data:{storeId,kind:'reservation_due',eventId:id}}})};
}
test('cold launch tap waits for sign-in and data restore, then routes only once',async()=>{
 const h=harness();await h.navigation.start();await h.navigation.start();assert.equal(h.count(),1);
 h.tap();assert.equal(h.calls.length,0);
 h.setContext({userId:'u',role:'storeOwner',ready:false});await h.navigation.flush();assert.equal(h.calls.length,0);
 h.setContext({userId:'u',role:'storeOwner',ready:true});await h.navigation.flush();assert.equal(h.calls.length,1);
 h.tap();await h.navigation.flush();assert.equal(h.calls.length,1);
});
test('logout and account switches invalidate queued/in-flight destinations',async()=>{
 const h=harness();await h.navigation.start();h.setContext({userId:'u1',role:'storeOwner',ready:false});h.tap();
 h.setContext({userId:'u2',role:'storeOwner',ready:true});await h.navigation.flush();assert.equal(h.calls.length,0);
 h.tap();await h.navigation.flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0].current(),true);
 h.navigation.clear();assert.equal(h.calls[0].current(),false);
});
test('expired pending taps and unknown destinations never navigate',async()=>{
 const h=harness();await h.navigation.start();h.tap();h.advance();h.setContext({userId:'u',role:'storeOwner',ready:true});await h.navigation.flush();assert.equal(h.calls.length,0);
 assert.equal(notificationDestination({storeId,kind:'https://attacker.invalid'}),null);
 assert.equal(notificationDestination({storeId:'bad',kind:'test'}),null);
 assert.deepEqual(notificationDestination({storeId,kind:'report_closed',monthKey:'2026-09',url:'https://attacker.invalid',body:'secret'}),{storeId,kind:'report_closed',monthKey:'2026-09'});
});
