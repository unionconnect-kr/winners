import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }','m'))?.[0]||'';
function setup(result){
 const state={store:'A',storeIdMap:{A:'s1',B:'s2'},role:'storeOwner',authProfile:{user_id:'u1'},crew:[],showAddCrewForm:true};
 const inputs=Object.fromEntries(Object.entries({'crew-name-input':'테스트직원','crew-wage-input':'10000','crew-phone-input':'','crew-wagetype-select':'hourly'}).map(([id,value])=>[id,{value,focus(){}}]));
 inputs['add-crew-btn']={disabled:false,textContent:'추가 완료'};
 const writes=[],messages=[];
 const context={state,MANEE_STAFF_AUTH_ENABLED:true,maneeViewEpoch:0,document:{getElementById:id=>inputs[id]},canManageBusinessData:()=>true,
 currentStoreId:()=>state.storeIdMap[state.store],monthKey:()=> '2026-10',showToast:m=>messages.push(m),render(){},invalidateFinancialViews(){},rowToCrew:r=>r,
 db:{from:()=>({insert(payload){writes.push(payload);return {select:()=>({single:()=>Promise.resolve(result??{data:{id:'c1',...payload}})})};}})}};
 vm.createContext(context);vm.runInContext(['businessContextGuard','setCrewCreateBusy','addCrewMember'].map(fn).join('\n'),context);
 return {state,inputs,writes,messages,context};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('double tap creates one employee and keeps the add button busy until completion',async()=>{
 const d=deferred(),h=setup(d.promise),first=h.context.addCrewMember(),second=h.context.addCrewMember();
 assert.equal(h.writes.length,1);assert.equal(h.inputs['add-crew-btn'].disabled,true);
 d.resolve({data:{id:'c1'}});await Promise.all([first,second]);
 assert.equal(h.state.crew.length,1);assert.equal(h.state.showAddCrewForm,false);assert.equal(h.inputs['add-crew-btn'].disabled,false);
});
for(const change of ['store','account'])test('late employee creation cannot alter the next '+change,async()=>{
 const d=deferred(),h=setup(d.promise),pending=h.context.addCrewMember();
 if(change==='store')h.state.store='B';else h.state.authProfile={user_id:'u2'};
 h.state.crew=[{id:'other'}];h.inputs['crew-name-input'].value='다른 입력';
 d.resolve({data:{id:'c1'}});await pending;
 assert.equal(h.state.crew.length,1);assert.equal(h.state.crew[0].id,'other');assert.equal(h.inputs['crew-name-input'].value,'다른 입력');assert.equal(h.messages.length,0);
});
for(const wage of ['-100','12.5','10000원','2147483648','0',''])test('invalid employee wage is rejected: '+wage,async()=>{
 const h=setup();h.inputs['crew-wage-input'].value=wage;await h.context.addCrewMember();assert.equal(h.writes.length,0);assert.ok(h.messages.length);
});
for(const result of [{error:{message:'offline'}},{data:null},{data:{}}])test('failed or unconfirmed employee creation retains the entered form',async()=>{
 const h=setup(result);await h.context.addCrewMember();assert.equal(h.state.crew.length,0);assert.equal(h.state.showAddCrewForm,true);
 assert.equal(h.inputs['crew-name-input'].value,'테스트직원');assert.equal(h.inputs['add-crew-btn'].disabled,false);assert.match(h.messages[0],/실패/);
});
test('employee creation requires management permission',async()=>{
 const h=setup();h.context.canManageBusinessData=()=>false;await h.context.addCrewMember();assert.equal(h.writes.length,0);
});
test('authenticated employee creation keeps employment fields and never generates a legacy join code',async()=>{
 const h=setup();h.context.genUniqueCode=()=>{throw Error('Legacy code must not be generated');};
 for(const [id,value] of Object.entries({'crew-phone-input':'010-0000-0000','crew-wagetype-select':'monthly','crew-wage-input':'3000000','crew-position-select':'주방','crew-hiredate-input':'2026-10-01','crew-weeklyhours-input':'40','crew-notes-input':' 테스트 메모 '}))h.inputs[id]={value};
 h.inputs['crew-tax33-checkbox']={checked:true};h.inputs['crew-weeklyAllowance-checkbox']={checked:true};
 await h.context.addCrewMember();assert.equal(h.writes.length,1);
 const saved=h.writes[0];
 for(const [field,value] of Object.entries({store_id:'s1',name:'테스트직원',wage:3000000,wage_type:'monthly',phone:'010-0000-0000',position:'주방',hire_date:'2026-10-01',weekly_hours:40,notes:'테스트 메모',tax33:true,weekly_allowance:true,join_code:null}))assert.equal(saved[field],value,field);
});
test('legacy employee creation generates and saves one join code',async()=>{
 const h=setup();h.context.MANEE_STAFF_AUTH_ENABLED=false;let generated=0;
 h.context.genUniqueCode=async()=>{generated++;return 'SYNTHETIC';};
 await h.context.addCrewMember();assert.equal(generated,1);assert.equal(h.writes.length,1);assert.equal(h.writes[0].join_code,'SYNTHETIC');
});
