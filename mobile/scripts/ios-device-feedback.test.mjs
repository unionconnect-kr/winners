import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {iosOAuthUrl} from '../src/ios-oauth-url.js';
import {createSocialNative} from '../src/ios-social.js';
import {adaptIos139,adaptIos139Social} from './adapt-ios139.mjs';
const origin='https://obpkzecgswnfuyhwvncd.supabase.co';
const html=adaptIos139(readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8'));
const link=(p,cb=origin+'/auth/v1/callback')=>({kakao:'https://kauth.kakao.com/oauth/authorize',naver:'https://nid.naver.com/oauth2.0/authorize'}[p])+'?client_id=public-client&response_type=code&state=signed-state&redirect_uri='+encodeURIComponent(cb);
for(const provider of ['kakao','naver']){
  test(provider+' linking opens only its exact provider endpoint and this project callback',async()=>{
    const url=link(provider);assert.equal(iosOAuthUrl(url,origin,provider,'link').href,url);
    let opened;const n=createSocialNative({origin,scheme:'test',app:{},browser:{open:async x=>{opened=x.url;}}});
    await n.open(url,{provider,intent:'link'});assert.equal(opened,url);
    for(const bad of [url.replace('https:','http:'),url.replace('authorize?','authorize/evil?'),url+'#token',url+'&redirect_uri='+encodeURIComponent(origin+'/auth/v1/callback'),link(provider,'https://evil.test/auth/v1/callback'),link(provider,origin+'/rest/v1/callback')]){
      assert.throws(()=>iosOAuthUrl(bad,origin,provider,'link'));
    }
    assert.throws(()=>iosOAuthUrl(url,origin,provider,'signin'));
    assert.throws(()=>iosOAuthUrl(url,origin,provider==='kakao'?'naver':'kakao','link'));
  });
}
test('project sign-in URLs reject provider substitution, credentials, fragments and nonauthorize routes',()=>{
  const good=origin+'/auth/v1/authorize?provider=kakao';assert.equal(iosOAuthUrl(good,origin,'kakao').href,good);
  for(const bad of [good+'&provider=naver',good+'#a',good.replace('/authorize','/user'),good.replace('https://','https://u:p@'),good.replace('provider=kakao','provider=custom:naver')])assert.throws(()=>iosOAuthUrl(bad,origin,'kakao'));
});
test('actual adapted social controller passes external linking URL and native intent',async()=>{
  const context={window:{},URL,AbortSignal};vm.runInNewContext(adaptIos139Social(readFileSync(new URL('../release139/assets/social-auth.js',import.meta.url),'utf8')),context);
  for(const provider of ['kakao','naver']){
    const user={id:'u',identities:[]},session={user,access_token:'token',refresh_token:'refresh'},storage=new Map();let opened;
    const c=context.window.MANEE_SOCIAL_AUTH.createController({
      supabase:{createClient:()=>({auth:{setSession:async()=>({}),linkIdentity:async()=>({data:{url:link(provider)}})}})},
      db:{auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user}})}},
      config:{projectRef:'test',supabaseUrl:origin,publishableKey:'test',socialProviders:{naver:true}},storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      getLocation:()=> 'capacitor://localhost',nativeScheme:'kr.co.manee.app.staging',random:()=> 'flow',open:async(url,options)=>{opened={url,options};},fetch:async()=>({ok:true,json:async()=>({external:{kakao:true}})})
    });
    await c.begin(provider,{intent:'link',role:'staff'});assert.equal(opened.url,link(provider));assert.equal(opened.options.intent,'link');assert.equal(opened.options.provider,provider);
  }
});
function functionSource(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
test('new password requires both ASCII letters and digits within the UTF8 limit',()=>{
  const c={TextEncoder};vm.createContext(c);vm.runInContext(functionSource('  function validManeeNewPassword','  async function verifyManeeEntryRole'),c);
  for(const v of ['12345678','abcdefgh','a1short','가'.repeat(24)+'a1'])assert.equal(c.validManeeNewPassword(v),false,v);
  for(const v of ['qwer1234','ABCDef12','a1'+'가'.repeat(23)])assert.equal(c.validManeeNewPassword(v),true,v);
});
for(const [role,roles,allowed] of [['staff',['owner'],false],['owner',['staff'],false],['staff',['manager'],true],['owner',['owner'],true],['staff',[],true],['staff',['owner','staff'],true]]){
  test('entry role '+role+' with '+roles.join('/')+' is '+allowed,async()=>{
    const c={URL,AbortSignal,SUPABASE_URL:origin,SUPABASE_ANON_KEY:'pub',fetch:async()=>({ok:true,json:async()=>({ok:true,profile:{user_id:'u'},memberships:roles.map(role=>({role}))})})};vm.createContext(c);vm.runInContext(functionSource('  async function verifyManeeEntryRole','  async function applyManeeEntrySession'),c);
    if(allowed)assert.equal(await c.verifyManeeEntryRole({access_token:'token'},role),'u');else await assert.rejects(c.verifyManeeEntryRole({access_token:'token'},role),/계정이에요/);
  });
}
