import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotificationNavigation} from '../src/android-notification-navigation.js';
const storeId='00000000-0000-4000-8000-000000000101';
test('iOS staff self-test opens once; owner business alerts and old account taps are discarded',async()=>{
 let receive,context={userId:'staff',role:'staff',ready:true};const calls=[];
 const navigation=createNotificationNavigation({allowedRoles:['storeOwner','staff'],getContext:()=>context,
  push:{addListener:async(_,fn)=>{receive=fn;return {remove(){}};}},open:async data=>{calls.push(data);return 'handled';}});
 await navigation.start();
 const tap=(kind,id)=>receive({actionId:'tap',notification:{id,data:{storeId,kind}}});
 tap('report_closed','private');await navigation.flush();assert.equal(calls.length,0);
 tap('test','self');await navigation.flush();assert.equal(calls.length,1);
 context={...context,ready:false};tap('test','old');context={...context,userId:'other',ready:true};await navigation.flush();assert.equal(calls.length,1);
});
