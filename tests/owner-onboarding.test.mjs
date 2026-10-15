import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const block=html.slice(html.indexOf('  // Owner signup keeps'),html.indexOf('  function verifyNearStore(){'));
const checked=html.match(/^  async function checkedBusinessMutation\([^\n]*\n[\s\S]*?^  }/m)[0];
function harness(savedEntries=[]){
 const saved=new Map(savedEntries),calls=[],messages=[];let response={data:[{id:'s1'}]},pending;
 const state={role:'storeOwner',myUsername:'owner1',store:'A',storeIdMap:{A:'s1',B:'s2'},storeOnboardingMap:{A:false,B:false},storeLocationMap:{},storeCutoffMap:{A:6},storeLaborLimitMap:{A:22},storeFoodLimitMap:{A:40},storeManagerDashboardMap:{},ownerSetupDraft:{},onboardingStep:'location',vendors:[],fixedExpenses:[],items:{},reportDataFailed:new Set(),myStores:['A','B']};
 const q={update(p){calls.push(['update',p]);return this;},insert(p){calls.push(['insert',p]);return this;},eq(...p){calls.push(['eq',...p]);return this;},select(){return pending?new Promise(r=>pending.resolve=r):Promise.resolve(response);}};
 const c={state,localGet:k=>saved.has(k)?{value:saved.get(k)}:null,localSet:(k,v)=>saved.set(k,String(v)),currentStoreId:()=>state.storeIdMap[state.store],canManageBusinessData:()=>true,render(){},showToast:m=>messages.push(m),staffErrorMessage:e=>e.message||'위치 권한을 확인해 주세요.',staffCoordinates:async()=>({current_lat:37.5,current_lng:127}),escapeHtml:s=>String(s??'').replace(/[&<>"']/g,'_'),monthKey:()=> '2026-09',storeCutoffHour:()=>6,laborRatioLimit:()=>22,foodRatioLimit:()=>40,managerDashboardEnabled:()=>false,expenseCategoryLabel:x=>x||'',vendorCategoryOptions:()=>'<option value="food">식자재</option>',vendorCategoryValid:v=>v==='food',db:{from:t=>{calls.push(['from',t]);return q},rpc:async()=>({data:{ok:true}})}};
 c.loadAllForStore=async()=>{};c.switchOwnerStore=async store=>{state.store=store;};
 vm.createContext(c);vm.runInContext(checked+'\n'+block+'\n'+html.match(/^  async function becomeStoreOwner\([^\n]*\n[\s\S]*?^  }/m)[0],c);
 return {c,state,calls,messages,saved,setResponse:r=>response=r,defer:()=>pending={},resolve:r=>pending.resolve(r)};
}
test('signup sequence retains memory-only values and blocks unverified username and mismatch',()=>{
 const {c,state,messages,saved}=harness();const d=c.ownerSignupDraft();d.step=1;c.ownerSignupNext();assert.equal(d.step,1);d.name='사장';c.ownerSignupNext();assert.equal(d.step,2);d.username='owner';d.password='password1';d.confirm='password1';c.ownerSignupNext();assert.equal(d.step,2);state.ownerRequestUsernameCheck={username:'owner',available:true};d.confirm='wrong';c.ownerSignupNext();assert.equal(d.step,2);d.confirm=d.password;c.ownerSignupNext();assert.equal(d.step,3);d.store='매장';c.ownerSignupNext();assert.equal(d.step,4);assert.equal(saved.size,0);assert.ok(messages.length>=3);
});
test('setup progress survives serialized storage and is isolated by user and store',()=>{
 const {c,state,saved}=harness();c.rememberOwnerSetup('vendors','확인 완료');assert.equal(c.ownerSetupInitialStep(),'vendors');assert.equal(typeof [...saved.values()][0],'string');state.store='B';assert.equal(c.ownerSetupInitialStep(),'location');state.store='A';state.myUsername='owner2';assert.equal(c.ownerSetupInitialStep(),'location');
});
test('all setup screens render, with invitation instructions and no employee/payroll/schedule entry',()=>{
 const {c,state}=harness();for(const step of ['location','cutoff','vendors','fixed','invite','checklist','preferences','review']){state.onboardingStep=step;const view=c.renderOnboardingWizard();assert.ok(view.includes('<h2>'));assert.ok(!/crew-name-input|crew-wage-input|shift-start|approve-new|data-approve/.test(view));}
 state.onboardingStep='invite';const v=c.renderOnboardingWizard();assert.ok(v.includes('직원이 직접 가입'));assert.ok(v.includes('근무 스케줄 등록'));assert.ok(!v.includes('기존 직원'));assert.ok(!v.includes('DEMO-123'));
});
test('failed and zero-row completion do not dismiss wizard or mark setup complete',async()=>{
 for(const response of [{error:Error('offline')},{data:[]}]){const h=harness();h.state.onboardingStep='review';h.setResponse(response);await h.c.finishOnboarding();assert.equal(h.state.storeOnboardingMap.A,false);assert.equal(h.state.onboardingStep,'review');assert.ok(h.messages.length);}
});
test('completion is confirmed, scoped, and blocks double submission',async()=>{
 const h=harness();h.state.onboardingStep='review';h.defer();const p=h.c.finishOnboarding();await h.c.finishOnboarding();assert.equal(h.calls.filter(x=>x[0]==='update').length,1);assert.ok(h.calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]==='s1'));h.resolve({data:[{id:'s1'}]});await p;assert.equal(h.state.storeOnboardingMap.A,true);assert.equal(h.state.onboardingStep,null);
});
test('late completion after switching store never marks the next store complete',async()=>{
 const h=harness();h.defer();const p=h.c.finishOnboarding();h.state.store='B';h.state.onboardingStep='cutoff';h.resolve({data:[{id:'s1'}]});await p;assert.equal(h.state.storeOnboardingMap.B,false);assert.equal(h.state.onboardingStep,'cutoff');
});
test('fixed cost saves retain draft on failure, accept explicit zero and reject negative/fractional amounts',async()=>{
 const h=harness();h.state.onboardingStep='fixed';h.state.ownerSetupDraft={'setup-fixed-name':'월세','setup-fixed-amount':'-1'};await h.c.addOwnerSetupRecord('fixed');assert.equal(h.calls.length,0);h.state.ownerSetupDraft['setup-fixed-amount']='1.5';await h.c.addOwnerSetupRecord('fixed');assert.equal(h.calls.length,0);h.state.ownerSetupDraft['setup-fixed-amount']='0';h.setResponse({error:Error('offline')});await h.c.addOwnerSetupRecord('fixed');assert.equal(h.state.fixedExpenses.length,0);assert.equal(h.state.ownerSetupDraft['setup-fixed-name'],'월세');h.setResponse({data:[{id:'f1',name:'월세',amount:0}]});await h.c.addOwnerSetupRecord('fixed');assert.equal(h.state.fixedExpenses.length,1);assert.equal(h.state.ownerSetupDraft['setup-fixed-name'],undefined);
});
test('invite proceeds without employees, wages or schedules and unsaved cost drafts block next',async()=>{
 const h=harness();h.state.onboardingStep='invite';await h.c.nextOwnerSetup();assert.equal(h.state.onboardingStep,'checklist');h.state.onboardingStep='fixed';h.state.ownerSetupDraft={'setup-fixed-name':'월세'};await h.c.nextOwnerSetup();assert.equal(h.state.onboardingStep,'fixed');
});
test('store cutoff rejection leaves original value and step for retry',async()=>{
 const h=harness();h.state.onboardingStep='cutoff';h.state.ownerSetupDraft={'setup-cutoff':'4'};h.setResponse({data:[]});await h.c.nextOwnerSetup();assert.equal(h.state.storeCutoffMap.A,6);assert.equal(h.state.onboardingStep,'cutoff');
});
function checklistEditHarness(deleting=false){
 const h=harness(),sent=[];let confirm;
 h.state.items={morning:[{id:'c1',items:[{id:'i1',label:'기존 업무'},{id:'i2',label:'유지 업무'}]}]};
 const el={dataset:{setupTab:'morning',setupCat:'c1',setupEditTask:'i1',setupDeleteTask:'i1'},hasAttribute:()=>deleting};
 h.c.app={querySelector:()=>null,querySelectorAll:s=>s==='[data-setup-edit-task],[data-setup-delete-task]'?[el]:[]};
 h.c.document={getElementById:()=>({value:'수정 업무'})};h.c.MANEE_STAFF_AUTH_ENABLED=true;h.c.bizToday=()=> '2026-09-30';
 h.c.askConfirm=(_,fn)=>confirm=fn;
 h.c.callAuthChecklist=async(...args)=>sent.push(args);
 h.c.loadChecklist=async()=>{h.state.items=JSON.parse(JSON.stringify(sent.at(-1)[3].items));};
 h.c.bindOnboardingWizardEvents();
 return {...h,el,sent,confirm:()=>confirm?.()};
}
test('setup checklist edit updates only selected item and submits store-scoped template',async()=>{
 const h=checklistEditHarness();h.el.onclick();await new Promise(r=>setImmediate(r));
 assert.equal(h.sent.length,1);assert.equal(h.sent[0][0],'templates');assert.equal(h.sent[0][1],'s1');
 assert.equal(h.state.items.morning[0].items[0].label,'수정 업무');assert.equal(h.state.items.morning[0].items[1].label,'유지 업무');
});
test('setup checklist delete requires confirmation and preserves unrelated item',async()=>{
 const h=checklistEditHarness(true);h.el.onclick();assert.equal(h.sent.length,0);await h.confirm();
 assert.deepEqual(h.state.items.morning[0].items.map(i=>i.id),['i2']);
});
test('setup checklist confirmation cannot mutate a store selected later',async()=>{
 const h=checklistEditHarness(true);h.el.onclick();h.state.store='B';await h.confirm();assert.equal(h.sent.length,0);
});
test('setup checklist failed save leaves original template intact',async()=>{
 const h=checklistEditHarness();h.c.callAuthChecklist=async()=>{throw Error('offline')};h.el.onclick();await new Promise(r=>setImmediate(r));
 assert.equal(h.state.items.morning[0].items[0].label,'기존 업무');assert.ok(h.messages.length);
});


test('pausing preparation survives a fresh app runtime and opens home without completing setup',async()=>{
 const h=harness();h.state.onboardingStep='fixed';h.c.rememberOwnerSetup('fixed','나중에 설정');
 h.c.pauseOwnerSetup();assert.equal(h.state.onboardingStep,null);assert.equal(h.state.section,'dashboard');assert.equal(h.state.homeStore,'A');
 assert.equal(h.calls.length,0);assert.equal(h.state.storeOnboardingMap.A,false);
 const restarted=harness([...h.saved]);restarted.state.onboardingStep=null;
 await restarted.c.becomeStoreOwner('A');assert.equal(restarted.state.onboardingStep,null);
 assert.equal(restarted.c.ownerSetupProgress().statuses.fixed,'나중에 설정');assert.equal(restarted.state.storeOnboardingMap.A,false);
 await restarted.c.resumeOwnerSetup();assert.equal(restarted.state.onboardingStep,'fixed');
 const resumed=harness([...restarted.saved]);await resumed.c.becomeStoreOwner('A');assert.equal(resumed.state.onboardingStep,'fixed');
});
test('paused entry is isolated by owner and store; a new or completed store uses its own entry',async()=>{
 const h=harness();h.c.pauseOwnerSetup();
 await h.c.becomeStoreOwner('B');assert.equal(h.state.onboardingStep,'location');
 h.state.myUsername='owner2';await h.c.becomeStoreOwner('A');assert.equal(h.state.onboardingStep,'location');
 h.state.myUsername='owner1';await h.c.becomeStoreOwner('A');assert.equal(h.state.onboardingStep,null);
 h.state.storeOnboardingMap.B=true;await h.c.becomeStoreOwner('B');assert.equal(h.state.onboardingStep,null);
});
test('legacy progress resumes saved step; invalid saved progress falls back safely',async()=>{
 const h=harness();h.saved.set(h.c.ownerSetupKey(),JSON.stringify({step:'vendors',statuses:{location:'확인 완료'}}));
 await h.c.becomeStoreOwner('A');assert.equal(h.state.onboardingStep,'vendors');
 h.saved.set(h.c.ownerSetupKey(),'{broken');await h.c.becomeStoreOwner('A');assert.equal(h.state.onboardingStep,'location');
 h.saved.set(h.c.ownerSetupKey(),JSON.stringify({step:'invalid',paused:'true'}));await h.c.becomeStoreOwner('A');assert.equal(h.state.onboardingStep,'location');
});
test('busy setup cannot be paused; failed local persistence does not claim setup completion',()=>{
 const h=harness();h.state.ownerSetupBusy=true;h.c.pauseOwnerSetup();assert.equal(h.state.onboardingStep,'location');assert.equal(h.saved.size,0);
 h.state.ownerSetupBusy=false;h.c.localSet=()=>{throw Error('storage unavailable');};h.c.pauseOwnerSetup();
 assert.equal(h.state.onboardingStep,null);assert.equal(h.state.storeOnboardingMap.A,false);assert.match(h.messages[0],/진행 위치를 저장하지 못/);
});
test('resume targets selected home store and ignores a changed owner during the store load',async()=>{
 const h=harness();h.state.store='B';h.state.onboardingStep='preferences';h.c.pauseOwnerSetup();h.state.store='A';h.state.homeStore='B';
 await h.c.resumeOwnerSetup();assert.equal(h.state.store,'B');assert.equal(h.state.onboardingStep,'preferences');
 h.c.pauseOwnerSetup();h.state.store='A';h.state.homeStore='B';
 h.c.switchOwnerStore=async store=>{h.state.store=store;h.state.myUsername='owner2';};
 await h.c.resumeOwnerSetup();assert.equal(h.state.onboardingStep,null);h.state.myUsername='owner1';assert.equal(h.c.ownerSetupProgress().paused,true);
});

test('location registration stays pending until server confirmation, uses returned coordinates and ignores repeated taps',async()=>{
 const h=harness();h.defer();const task=h.c.saveOwnerSetupLocation();await new Promise(r=>setImmediate(r));
 assert.match(h.c.renderOnboardingWizard(),/위치 등록 중/);assert.match(h.c.ownerSetupLocationFeedback(),/저장하는 중/);
 await h.c.saveOwnerSetupLocation();assert.equal(h.calls.filter(c=>c[0]==='update').length,1);
 h.resolve({data:[{id:'s1',lat:37.500001,lng:127.000002}]});await task;
 assert.equal(h.state.storeLocationMap.A.lat,37.500001);assert.match(h.c.renderOnboardingWizard(),/현재 위치로 저장했어요/);
 h.state.store='B';assert.equal(h.c.ownerSetupLocationFeedback(),'');
});
test('failed/empty/invalid location response keeps previous location and shows retry feedback',async()=>{
 for(const response of [{error:Error('offline')},{data:[]},{data:[{id:'s1'}]},{data:[{id:'s2',lat:37,lng:127}]}]){
  const h=harness();h.state.storeLocationMap.A={lat:35,lng:126};h.setResponse(response);await h.c.saveOwnerSetupLocation();
  assert.equal(h.state.storeLocationMap.A.lat,35);assert.doesNotMatch(h.c.ownerSetupLocationFeedback(),/저장했어요/);assert.ok(h.messages.length);
 }
});
test('location refusal never writes; delayed location result cannot save to a different store',async()=>{
 const h=harness();h.c.staffCoordinates=async()=>{throw Error('정확한 위치를 허용해 주세요.');};await h.c.saveOwnerSetupLocation();
 assert.equal(h.calls.length,0);assert.match(h.c.ownerSetupLocationFeedback(),/정확한 위치/);
 let resolve;h.c.staffCoordinates=()=>new Promise(r=>resolve=r);const task=h.c.saveOwnerSetupLocation();h.state.store='B';resolve({current_lat:37,current_lng:127});await task;
 assert.equal(h.calls.length,0);assert.equal(h.c.ownerSetupLocationFeedback(),'');
});
