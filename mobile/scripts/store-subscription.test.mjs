import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionView} from '../src/store-subscription.mjs';

test('sandbox purchase cannot be displayed as paid access when server denies writing',()=>{
 const view=subscriptionView({enforced:true,canWrite:false},{testOnly:true,testActive:true});
 assert.match(view.title,/확인 필요/);
 assert.match(view.message,/입력·수정은 제한/);
 assert.equal(view.testActive,true);
});
test('unenrolled store is shown as unenforced despite a sandbox purchase',()=>{
 const view=subscriptionView({enforced:false,canWrite:true},{testOnly:true,testActive:true});
 assert.match(view.title,/준비 중/);
 assert.match(view.message,/입력 제한이 적용되지/);
 assert.equal(view.testActive,true);
});
test('unknown server response never claims access',()=>{
 const view=subscriptionView(null,{active:true});
 assert.match(view.title,/확인할 수 없/);
 assert.equal(view.testActive,false);
});
test('missing RPC is described as setup pending, while unrelated errors remain unknown',()=>{
 const unconfigured=subscriptionView(null,{testOnly:true,testActive:true},true);
 assert.match(unconfigured.title,/연결 준비 중/);
 assert.equal(unconfigured.testActive,true);
 assert.match(subscriptionView(null,{},false).title,/확인할 수 없/);
});
test('enrolled store trusts only server entitlement for write access',()=>{
 assert.match(subscriptionView({enforced:true,canWrite:true},{}).title,/이용 중/);
});
