import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {adaptIos139} from './adapt-ios139.mjs';

const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const html=adaptIos139(source,'ios');
function setup(result,{role='storeOwner',editing=false}={}){
  const messages=[],effects=[];
  const draft={totalSales:'1000',cashSales:'1000',settlementPhotos:[],receiptPhotos:[],notePhotos:[],note:'unsaved draft'};
  const state={role,store:'review',crew:[],salesDraft:draft,salesReports:[],salesEditingId:editing?'existing':null,
    salesEditDate:'2026-11-24',showOwnerSalesForm:true,staffView:'salesReport'};
  let current=true;
  const sector={staged:[],request:null,stack:[],previous:editing?'previous revision':null};
  const save=payload=>{effects.push('write');return typeof result==='function'?result(payload):Promise.resolve(result);};
  const c=vm.createContext({state,MANEE_STAFF_AUTH_ENABLED:true,Date,Number,
    currentStoreId:()=> 'review-store',businessContextGuard:()=>()=>current,
    reportActionGuard:()=>()=>current,r135Scoped:()=>false,r135Cap:()=>true,
    crypto:{randomUUID:()=> 'save-request'},s3Payload:x=>x,monthKey:()=> '2026-11',loadExpenseEntries:async()=>{},
    bizToday:()=> '2026-11-24',sumCashExpenseItems:()=>0,daysInMonth:()=>30,
    showToast:m=>messages.push(m),clearStaffAuthView:()=>effects.push('logout'),
    staffErrorMessage:()=> 'other business failure',render:()=>effects.push('render'),
    rowToSalesReport:r=>r,invalidateFinancialViews:()=>effects.push('invalidate'),
    freshSalesDraft:()=>({}),autoCloseChecklistForDate:()=>effects.push('checklist'),
    sector3:()=>sector,window:{scrollTo(){},MANEE_NATIVE:{subscriptionDenied:()=>effects.push('subscription')}},
    fetch:()=>{effects.push('push');return Promise.resolve();},maneeServiceHeaders:async()=>({}),
    db:{rpc:async(_name,{p_sales})=>{const r=await save(p_sales);return {...r,data:r.data?{sales:r.data}:null};},
      from:()=>({upsert:payload=>({select:()=>({single:()=>save(payload)})})})},
  });
  const errorStart=html.indexOf('  function businessError('),errorEnd=html.indexOf('  async function checkedBusinessMutation(',errorStart);
  const saveStart=html.indexOf('  async function submitSalesReport('),saveEnd=html.indexOf('  async function autoCloseChecklistForDate(',saveStart);
  assert.ok(errorStart>=0&&errorEnd>errorStart&&saveStart>=0&&saveEnd>saveStart);
  const rpcStart=html.indexOf('  async function s3SaveSales('),rpcEnd=html.indexOf('  async function s3SaveExpense(',rpcStart);
  assert.ok(rpcStart>=0&&rpcEnd>rpcStart);
  vm.runInContext(html.slice(errorStart,errorEnd)+'\n'+html.slice(saveStart,saveEnd)+'\n'+html.slice(rpcStart,rpcEnd),c);
  return {c,state,draft,messages,effects,changeContext:()=>{current=false;}};
}
for(const editing of [false,true]){
  test(`expired owner ${editing?'update':'new sale'} opens subscription guidance and preserves draft`,async()=>{
    const h=setup({data:null,error:{code:'P4402'}},{editing});
    await h.c.submitSalesReport();
    assert.deepEqual(h.effects,['write','subscription']);
    assert.equal(h.messages.length,1);
    assert.match(h.messages[0],/구독.*확인/);
    assert.doesNotMatch(h.messages[0],/연결 상태|사장님께 문의|제출했어요|수정했어요/);
    assert.equal(h.state.salesDraft,h.draft);
    assert.equal(h.state.salesEditingId,editing?'existing':null);
    assert.equal(h.state.showOwnerSalesForm,true);
    assert.equal(h.state.salesReports.length,0);
    assert.equal(h.state.salesReportSaving,null);
  });
}
test('expired staff sales save directs staff to the owner without claiming a successful save',async()=>{
  const h=setup({data:null,error:{code:'P4402'}},{role:'staff'});
  await h.c.submitSalesReport();
  assert.match(h.messages[0],/구독.*사장님께 문의/);
  assert.doesNotMatch(h.messages[0],/연결 상태|제출했어요/);
  assert.equal(h.state.salesDraft,h.draft);
  assert.equal(h.state.salesReports.length,0);
  assert.ok(!h.effects.includes('logout')&&!h.effects.includes('checklist'));
});
test('late subscription denial after switching account or store is silent',async()=>{
  let finish;
  const h=setup(()=>new Promise(resolve=>{finish=resolve;}));
  const saving=h.c.submitSalesReport();h.changeContext();finish({data:null,error:{code:'P4402'}});await saving;
  assert.deepEqual(h.effects,['write']);assert.deepEqual(h.messages,[]);
  assert.equal(h.state.salesDraft,h.draft);assert.equal(h.state.salesReportSaving,null);
});
test('ordinary storage errors retain the existing retry guidance without opening billing',async()=>{
  const h=setup({data:null,error:{code:'NETWORK'}});await h.c.submitSalesReport();
  assert.deepEqual(h.effects,['write']);assert.match(h.messages[0],/연결 상태/);
  assert.equal(h.state.salesDraft,h.draft);assert.equal(h.state.salesReportSaving,null);
});
test('successful sales save still records the server result and closes the form',async()=>{
  const h=setup(payload=>Promise.resolve({data:{id:'saved',...payload},error:null}));
  await h.c.submitSalesReport();
  assert.equal(h.state.salesReports.length,1);assert.equal(h.state.salesReports[0].total_sales,1000);
  assert.equal(h.state.showOwnerSalesForm,false);assert.equal(h.state.salesEditingId,null);
  assert.ok(!h.effects.includes('subscription'));assert.match(h.messages[0],/제출했어요/);
});
