import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=name=>{const code=html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }','m'))?.[0];assert.ok(code,name);return code;};
function ownerHarness(checked){
 const calls=[],messages=[],elements={
  'owner-request-name-input':{value:'Synthetic'},'owner-request-store-input':{value:'Synthetic store'},
  'owner-request-username-input':{value:'synthetic_owner'},'owner-request-password-input':{value:'synthetic-password'},
  'owner-request-password-confirm-input':{value:'synthetic-password'},'owner-request-franchise-code-input':{value:''},
  'owner-request-age-confirmed':{checked},'submit-owner-request-btn':{},
 };
 const state={ownerSignupDraft:{step:4,name:'Synthetic',store:'Synthetic store',username:'synthetic_owner',password:'synthetic-password',confirm:'synthetic-password',franchise:'',ageConfirmed:false},ownerRequestUsernameCheck:{username:'synthetic_owner',available:true}};
 const context=createContext({state,document:{getElementById:id=>elements[id]},showToast:m=>messages.push(m),
  escapeHtml:x=>String(x),render(){},app:{querySelector:selector=>selector==='[data-signup-age]'?{...elements['owner-request-age-confirmed'],addEventListener(_,fn){this.change=fn;elements.ageHandler=this;}}:null,querySelectorAll:()=>[]},
  callManeeAuthApi:async(name,payload)=>{calls.push({name,payload});return {user:{username:'synthetic_owner'},store:{name:'Synthetic store'},session:{access_token:'synthetic'}}},
  applyManeeAuthSession:async()=>{},enterAuthenticatedOwner:async()=>{},
 });
 new Script(['ownerSignupDraft','renderOwnerSignupOffer','renderOwnerSignup','bindOwnerSignup','submitOwnerRequest'].map(extract).join('\n')).runInContext(context);
 return {context,calls,messages,state,elements};
}
test('owner final submission refuses unchecked confirmation before contacting signup',async()=>{
 for(const checked of [false,undefined,'true']){const h=ownerHarness(checked);await h.context.submitOwnerRequest();assert.equal(h.calls.length,0);assert.ok(h.messages.some(m=>m.includes('14세')));assert.notEqual(h.state.ownerSignupBusy,true);}
});
test('owner explicit confirmation is sent as literal true and draft is discarded on success',async()=>{
 const h=ownerHarness(true);await h.context.submitOwnerRequest();assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.age_14_plus_confirmed,true);assert.equal(h.state.ownerSignupDraft,null);
});
test('owner age confirmation defaults unchecked and is kept in the memory draft only',()=>{
 const h=ownerHarness(false);const view=h.context.renderOwnerSignup();assert.match(view,/data-signup-age type="checkbox"/);assert.doesNotMatch(view,/data-signup-age type="checkbox" checked/);
 h.state.landingMode='request-form';h.context.bindOwnerSignup();h.elements.ageHandler.checked=true;h.elements.ageHandler.change();assert.equal(h.state.ownerSignupDraft.ageConfirmed,true);
 assert.match(h.context.renderOwnerSignup(),/data-signup-age type="checkbox" checked/);
 h.state.ownerSignupDraft=null;assert.equal(h.context.ownerSignupDraft().ageConfirmed,false);
});
test('franchise account creation requires confirmation for the recipient and preserves actor authentication',async()=>{
 for(const checked of [false,true]){
  const calls=[],messages=[];const values={'new-franchise-name-input':'Synthetic','new-franchise-display-name-input':'Synthetic actor','new-franchise-username-input':'synthetic_franchise','new-franchise-password-input':'synthetic-password'};
  const context=createContext({document:{getElementById:id=>id==='new-franchise-age-confirmed'?{checked}:{value:values[id]}},
   showToast:m=>messages.push(m),SUPABASE_URL:'https://offline.invalid',SUPABASE_ANON_KEY:'synthetic-public',
   db:{auth:{getSession:async()=>({data:{session:{access_token:'verified-actor-session'}}})}},
   fetch:async(_,request)=>{calls.push(request);return {ok:true,json:async()=>({ok:true})}},loadFranchises:async()=>{},loadStoreFranchiseMap:async()=>{},render(){},
  });new Script(extract('createFranchiseAuthAccount')).runInContext(context);await context.createFranchiseAuthAccount();
  assert.equal(calls.length,checked?1:0);
  if(checked){assert.equal(JSON.parse(calls[0].body).age_14_plus_confirmed,true);assert.equal(calls[0].headers.Authorization,'Bearer verified-actor-session');}
  else assert.ok(messages.some(m=>m.includes('14세')));
 }
});
