import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {adaptIos139} from './adapt-ios139.mjs';
import {installStoreGuideChecklist} from './store-guide-checklist-html.mjs';
const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const html=installStoreGuideChecklist(adaptIos139(source,'android'));
const block=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,start);return html.slice(a,b);};
const feature=readFileSync(new URL('../src/store-guide-checklist.js',import.meta.url),'utf8');
const thumbnails=readFileSync(new URL('../src/checklist-thumbnails.js',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/checklist-editor.js',import.meta.url),'utf8');
const loader=readFileSync(new URL('../src/checklist-load.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const dom=new JSDOM('<main id="app"></main>'),document=dom.window.document,app=document.getElementById('app');dom.window.scrollTo=()=>{};
 const state={role:'storeOwner',authProfile:{user_id:'owner'},store:'A',storeIdMap:{A:'s1',B:'s2'},tab:'morning',items:{},checks:{},checkMeta:{},checklistViewDate:'2026-11-24',checklistLogMonth:'2026-11',checklistLog:{}};
 const u={key:'owner-A',stack:[],busy:false,filter:'all'},calls=[],reads=[],messages=[];let templates=[],checks=[],photos=[],rejection=null,photoReadError=false,deferred=null,sequence=0,denied=0;
 const c=vm.createContext({state,window:dom.window,document,app,URL,FormData:dom.window.FormData,structuredClone,Date,
  TABS:[{id:'morning',label:'오픈'},{id:'afternoon',label:'마감'},{id:'routine',label:'정기 체크'}],
  sector4:()=>u,s4Top:()=>u.stack.at(-1),s4Uuid:()=>String(++sequence),s4Escape:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),s4Hint:s=>'<p>'+s+'</p>',
  currentStoreId:()=>state.storeIdMap[state.store],bizToday:()=> '2026-11-24',formatDateLabel:()=> '11월 24일',canEditChecklistItems:()=>state.role==='storeOwner',
  businessContextGuard:()=>{const key=u.key;return ()=>key===u.key;},maneeLoadGuard:()=>{const key=u.key;return ()=>key===u.key;},
  showToast:m=>messages.push(m),businessError:e=>messages.push(e.code),setTimeout:()=>{},requestAnimationFrame:fn=>fn(),askConfirm:(_,fn)=>fn(),renderSector4More:()=>'',
  async callAuthChecklist(action,sid,date,payload){calls.push({action,sid,date,payload});if(deferred)await deferred.promise;if(rejection)throw rejection;if(action==='templates')templates=Object.entries(payload.items).map(([tab,data])=>({tab,data:structuredClone(data)}));return {ok:true,checks:{}};},
  db:{from(table){reads.push(table);const q={select:()=>q,eq:()=>q,in:()=>q,then(resolve){return Promise.resolve(table==='manee_checklist_photos'&&photoReadError?{error:Error('metadata offline')}:{data:structuredClone(table==='checklist_templates'?templates:table==='checklist_checks'?checks:photos)}).then(resolve);}};return q;},rpc:async()=>({data:{id:'p'}})},
  compressImage:async()=> 'data:image/jpeg;base64,AAAA',
 });
 c.window.MANEE_NATIVE={subscriptionDenied:()=>{denied++;}};
 vm.runInContext(block('  function s4Draft(','  function s4FindNotice(')+block('  function s4Button(','  function s4Due(')+block('  function s4Due(','  async function s4LoadHistory(')+block('  async function s4CheckWrite(','  function s4ReservationRow(')+block('  function renderSector4Sheet(','  async function s4Mutation(')+block('  async function s4Submit(','  function renderOwnerOperations(')+loader+feature+thumbnails+editor,c);
 c.render=()=>{app.innerHTML=(state.onboardingStep==='checklist'?c.m159OnboardingChecklist():c.renderSector4Checklist())+c.renderSector4Sheet();c.bindSector4();};
 return {c,state,u,calls,reads,messages,dom,app,document,get denied(){return denied;},get templates(){return templates;},setTemplates:v=>templates=v,setChecks:v=>checks=v,setPhotoError:()=>{photoReadError=true;},reject:code=>{rejection=Object.assign(Error('subscription required'),{code});},defer:()=>{let resolve;const promise=new Promise(r=>resolve=r);deferred={promise,resolve};return resolve;}};
}
test('empty checklist loads without any initialize write, including an expired account',async()=>{
 const h=harness();h.reject('P4402');await h.c.loadChecklist('A','2026-11-24');assert.equal(h.calls.length,0);assert.equal(h.state.checklistLoadFailed,false);assert.equal(h.state.checklistTemplatesLoaded,true);assert.deepEqual(h.reads,['checklist_templates','checklist_checks']);
 h.c.render();const button=h.app.querySelector('[data-s4="item-create"]');assert.ok(button);assert.equal(button.disabled,false);
});
test('preparation exposes add buttons for all empty phases and saves through the same photo-enabled editor',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.state.onboardingStep='checklist';h.c.render();assert.equal(h.app.querySelectorAll('[data-s4="item-create"]').length,4);
 h.app.querySelector('[data-s4="item-create"][data-id="afternoon"]').click();
 const form=h.document.getElementById('s4-form');assert.equal(form.elements.tab.value,'afternoon');form.elements.label.value='주방 청소';form.elements.photoRequired.checked=true;form.dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].sid,'s1');assert.equal(h.calls[0].action,'templates');assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].payload.expected_items)),{});
 const it=h.templates[0].data[0].items[0];assert.equal(it.label,'주방 청소');assert.equal(it.photoRequired,true);assert.equal(h.u.stack.length,0);assert.match(h.app.textContent,/주방 청소/);
});
test('operations also adds an item to an empty phase without requiring a pre-existing category',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.c.render();h.app.querySelector('[data-s4="item-create"]').click();const form=h.document.getElementById('s4-form');form.elements.label.value='소등 확인';form.dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
 assert.equal(h.templates[0].data[0].items[0].photoRequired,false);assert.match(h.app.textContent,/소등 확인/);
});
test('subscription rejection preserves draft, opens subscription guidance and never reports a saved item',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.reject('P4402');h.c.render();h.app.querySelector('[data-s4="item-create"]').click();let form=h.document.getElementById('s4-form');form.elements.label.value='사진 확인 업무';form.elements.photoRequired.checked=true;form.dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
 form=h.document.getElementById('s4-form');assert.equal(form.elements.label.value,'사진 확인 업무');assert.equal(form.elements.photoRequired.checked,true);assert.equal(h.denied,1);assert.equal(h.templates.length,0);assert.match(h.app.textContent,/구독을 확인한 뒤/);assert.ok(!h.messages.includes('업무를 추가했어요.'));
});
test('photo metadata failure keeps checklist items and completion visible',async()=>{
 const h=harness();h.setTemplates([{tab:'morning',data:[{id:'c',name:'청소',items:[{id:'i',label:'홀 청소'}]}]}]);h.setChecks([{item_id:'i',photo_id:'p'}]);h.setPhotoError();await h.c.loadChecklist('A','2026-11-24');assert.equal(h.state.checklistLoadFailed,false);assert.equal(h.state.checklistPhotoLoadFailed,true);h.c.render();assert.match(h.app.textContent,/홀 청소/);assert.ok(h.app.querySelector('button[aria-label="홀 청소 완료 사진 크게 보기"]'));assert.doesNotMatch(h.app.textContent,/불러오지 못했어요\. 다시 시도/);
});
test('staff cannot add checklist definitions, even if an add-sheet action is forced',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.state.role='staff';h.c.render();assert.equal(h.app.querySelector('[data-s4="item-create"]'),null);h.c.s4Open('item-create','morning');assert.equal(h.document.getElementById('s4-form'),null);await h.c.m159CreateItem();assert.equal(h.calls.length,0);
});
test('a different account cannot use an already-loaded checklist as its editable snapshot',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.state.authProfile.user_id='other';h.c.render();assert.equal(h.app.querySelector('[data-s4="item-create"]').disabled,true);
});
test('the compiled onboarding branch includes the shared editor and binds its actions',()=>{
 assert.match(html,/renderOnboardingWizard\(\) \+ renderSector4Sheet\(\)/);assert.match(html,/bindOnboardingWizardEvents\(\); bindSector4\(\)/);
});

test('existing item edits keep unrelated entries and save the photo-required setting',async()=>{
 const h=harness();h.setTemplates([{tab:'morning',data:[{id:'c',name:'오픈',items:[{id:'i1',label:'기존 업무'},{id:'i2',label:'유지 업무'}]}]}]);await h.c.loadChecklist('A','2026-11-24');h.state.onboardingStep='checklist';h.c.render();h.app.querySelector('[data-s4="item-edit"]').click();const form=h.document.getElementById('s4-form');form.elements.label.value='수정 업무';form.elements.photoRequired.checked=true;form.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));form.dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();
 assert.equal(h.templates[0].data[0].items[0].label,'수정 업무');assert.equal(h.templates[0].data[0].items[0].photoRequired,true);assert.equal(h.templates[0].data[0].items[1].label,'유지 업무');
});
test('changing phase retains the new task and photo draft before saving',async()=>{
 const h=harness();await h.c.loadChecklist('A','2026-11-24');h.c.render();h.app.querySelector('[data-s4="item-create"]').click();let form=h.document.getElementById('s4-form');form.elements.label.value='냉장고 점검';form.elements.photoRequired.checked=true;form.elements.tab.value='routine';form.elements.tab.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));form=h.document.getElementById('s4-form');assert.equal(form.elements.label.value,'냉장고 점검');assert.equal(form.elements.photoRequired.checked,true);form.dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));await flush();assert.equal(h.templates[0].tab,'routine');
});

async function photoHarness(count=1){
 const h=harness();h.setTemplates([{tab:'morning',data:[{id:'c',name:'문 열기 전',items:Array.from({length:count},(_,i)=>({id:'i'+i,label:'홀 청소 '+i,photoRequired:true}))}]}]);h.setChecks(Array.from({length:count},(_,i)=>({item_id:'i'+i,photo_id:'p'+i})));await h.c.loadChecklist('A','2026-11-24');
 h.c.m160ResizeThumbnail=async()=> 'data:image/jpeg;base64,VEhVTUI=';
 return h;
}
test('photo thumbnail is a separate right-side button and opens large review without toggling completion',async()=>{
 const h=await photoHarness();const reads=[];h.c.db.rpc=async(_,args)=>{reads.push(args);return {data:{id:args.p_photo_id,image_type:'image/jpeg',image_base64:'AAAA',item_label:'홀 청소 0'}};};
 h.c.render();await flush();const row=h.app.querySelector('.m160-check-photo-row'),buttons=row.querySelectorAll('button');assert.equal(buttons.length,2);assert.equal(buttons[0].dataset.s4,'check');assert.equal(buttons[1].dataset.s4,'check-photo');assert.equal(row.querySelectorAll('button button').length,0);assert.equal(buttons[1].querySelector('img').width,56);assert.match(row.textContent,/사진 첨부 · 확인 대기/);
 buttons[1].click();await flush();assert.equal(h.state.checks.i0,true);assert.equal(h.calls.length,0);assert.equal(h.u.stack.at(-1).type,'check-photo-view');assert.ok(h.app.querySelector('.m160-photo-large'));assert.match(h.document.querySelector('#s4-title').textContent,/홀 청소 0/);assert.ok(h.app.querySelector('[data-s4="check-photo-review"]'));assert.ok(reads.length>=2,'full-size review rechecks server access');
});
test('closed checklist retains a clickable photo with a disabled completion button',async()=>{
 const h=await photoHarness();h.state.checklistLog['2026-11-24']={};h.c.render();const row=h.app.querySelector('.m160-check-photo-row');assert.equal(row.querySelector('[data-s4="check"]').disabled,true);assert.equal(row.querySelector('[data-s4="check-photo"]').disabled,false);
});
test('only visible photo rows load and the preview request pool never exceeds two',async()=>{
 const h=await photoHarness(5);let observer;h.c.IntersectionObserver=class{constructor(callback){this.callback=callback;observer=this;}observe(){}unobserve(){}disconnect(){}};
 let active=0,max=0;const pending=[];h.c.db.rpc=(_,args)=>new Promise(resolve=>{active++;max=Math.max(max,active);pending.push(()=>{active--;resolve({data:{id:args.p_photo_id,image_type:'image/jpeg',image_base64:'AAAA'}});});});
 h.c.render();assert.equal(pending.length,0);observer.callback([...h.app.querySelectorAll('[data-photo-thumb]')].map(target=>({target,isIntersecting:true})));assert.equal(pending.length,2);assert.equal(max,2);
 while(pending.length){pending.shift()();await flush();}assert.equal(max,2);assert.equal(h.app.querySelectorAll('.m160-photo-thumb img').length,5);
});
test('late previews are discarded after account, store, date or completion changes',async()=>{
 for(const change of [h=>{h.state.authProfile.user_id='different';},h=>{h.state.store='B';},h=>{h.state.checklistViewDate='2026-11-25';},h=>{h.state.checks.i0=false;}]){
  const h=await photoHarness();let resolve;h.c.db.rpc=()=>new Promise(r=>{resolve=r;});h.c.render();const scope=h.c.m160ThumbnailScope(),oldButton=h.app.querySelector('[data-photo-thumb]');change(h);resolve({data:{id:'p0',image_type:'image/jpeg',image_base64:'AAAA'}});await flush();assert.equal(oldButton.querySelector('img'),null);assert.equal(scope.cache.size,0);
 }
});
test('thumbnail failures leave a working full-photo action and do not fail the checklist',async()=>{
 const h=await photoHarness();h.c.db.rpc=async()=>({error:{code:'42501'}});h.c.render();await flush();assert.ok(h.app.querySelector('[data-s4="check-photo"]'));assert.equal(h.app.querySelector('.m160-photo-thumb img'),null);assert.equal(h.state.checklistLoadFailed,false);assert.equal(h.state.checks.i0,true);
});
test('preview cache is bounded and is cleared when the account changes',async()=>{
 const h=await photoHarness(42);h.c.db.rpc=async(_,args)=>({data:{id:args.p_photo_id,image_type:'image/jpeg',image_base64:'AAAA'}});const scope=h.c.m160ThumbnailScope();await Promise.all(Array.from({length:42},(_,i)=>h.c.m160Thumbnail(scope,'p'+i)));assert.equal(scope.cache.size,40);h.state.authProfile.user_id='other';const fresh=h.c.m160ThumbnailScope();assert.notEqual(fresh,scope);assert.equal(scope.cache.size,0);assert.equal(fresh.cache.size,0);
});
test('new photo thumbnails fetch only the small authenticated Storage object',async()=>{
 const h=await photoHarness(),sid='20000000-0000-4000-8000-000000000001',uid='10000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001',base=sid+'/2026-11-24/'+uid+'/'+id;
 h.c.currentStoreId=()=>sid;h.c.FileReader=h.dom.window.FileReader;h.c.AbortSignal=AbortSignal;h.state.checkMeta.i0={photo_id:id,photo_ids:[id,'other-photo']};h.state.checklistPhotoMeta={[id]:{id,thumbnail_path:base+'/thumb.jpg',object_path:base+'/image.jpg'}};
 const downloads=[];h.c.db.rpc=()=>{throw Error('full image RPC must not run for a new thumbnail');};h.c.db.storage={from:bucket=>({download:async path=>{downloads.push({bucket,path});return {data:new h.dom.window.Blob(['test-jpeg'],{type:'image/jpeg'})};}})};
 h.c.render();await new Promise(r=>setTimeout(r,40));assert.deepEqual(downloads,[{bucket:'manee-checklist-evidence',path:base+'/thumb.jpg'}]);assert.ok(h.app.querySelector('.m160-photo-thumb img'));assert.equal(h.app.querySelector('.m161-photo-count').textContent,'2장');
});
