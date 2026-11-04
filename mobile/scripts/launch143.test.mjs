import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {adaptIos139} from './adapt-ios139.mjs';
import {launch143Html} from './launch143-html.mjs';
const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
for(const platform of ['android','ios'])test(`1.43 ${platform} preserves complete pages and states actual store trial conditions`,()=>{
 const prior=adaptIos139(source,platform),html=launch143Html(prior,platform);
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 const start=html.indexOf('  function renderOwnerSignupOffer('),end=html.indexOf('  function ownerSignupDraft(',start);
 const ctx={};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 for(const compact of [true,false]){
  const view=ctx.renderOwnerSignupOffer(false,compact);
  assert.match(view,platform==='ios'?/2개월 무료체험/:/60일 무료체험/);
  assert.doesNotMatch(view,/1개월 무료체험|처음 가입하면/);
 }
 const view=ctx.renderOwnerSignupOffer(false,false);
 assert.match(view,/유료 전환 동의/);assert.match(view,/아이디당 월 9,900원/);assert.match(view,/회원가입만으로 체험 구독이나 결제가 시작되지/);
 // All functional code outside the isolated signup presentation must survive.
 const beforeStart=prior.indexOf('  function renderOwnerSignupOffer('),beforeEnd=prior.indexOf('  function ownerSignupDraft(',beforeStart);
 assert.equal(html.slice(end),prior.slice(beforeEnd).replaceAll(/매니 1\.(39|40|41|42)/g,'매니 1.43'));
 assert.equal(html.slice(0,start),prior.slice(0,beforeStart).replaceAll(/매니 1\.(39|40|41|42)/g,'매니 1.43'));
});
