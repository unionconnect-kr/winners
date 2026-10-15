import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=html.match(/^  async function openNativeNotification\([^\n]*\n[\s\S]*?^  }/m)[0];
const storeId='00000000-0000-4000-8000-000000000101';
function harness(options={}){
 const state={role:'storeOwner',splashDone:true,loading:false,authProfile:{user_id:'u1'},myStores:['A'],storeIdMap:{A:storeId},store:'B',...options.state},calls=[],messages=[];
 const context={state,db:{rpc:async(name,args)=>{calls.push([name,args]);return options.permission||{data:true};}},maneeLoadGuard:()=>()=>state.authProfile?.user_id==='u1',isAttendanceDate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d||''),bizToday:()=> '2026-10-13',loadAllForStore:async store=>calls.push(['load',store]),render(){},window:{scrollTo(){}},showToast:m=>messages.push(m),askConfirm:(m,go)=>{context.confirm=go;}};
 vm.createContext(context);vm.runInContext(fn,context);return {context,state,calls,messages};
}
for(const [kind,section,tab] of [['reservation_due','reservations'],['reservation_created','reservations'],['attendance_out','schedule','attendance'],['monthly_costs','sales','report'],['report_closed','sales','report'],['test','settings']])test(`notification ${kind} opens its authorized store and screen`,async()=>{
 const h=harness();await h.context.openNativeNotification({storeId,kind,eventDate:'2026-09-30',monthKey:'2026-09'});
 assert.equal(h.state.store,'A');assert.equal(h.state.homeStore,'A');assert.equal(h.state.section,section);
 if(tab)assert.equal(h.state.scheduleTab||h.state.salesSectionTab,tab);
 if(kind==='attendance_out')assert.equal(h.state.selectedDate,'2026-09-30');
 if(kind==='report_closed'||kind==='monthly_costs')assert.equal(h.state.monthNum,9);
 assert.equal(h.calls[0][0],'manee_android_push_context');assert.deepEqual(h.calls.at(-1),['load','A']);
});
test('revoked access, unknown stores and stale account cannot change screen',async()=>{
 for(const options of [{permission:{data:false}},{state:{myStores:[]}}]){
  const h=harness(options);await h.context.openNativeNotification({storeId,kind:'reservation_due'});assert.equal(h.state.store,'B');assert.equal(h.calls.some(c=>c[0]==='load'),false);
 }
 const h=harness();await h.context.openNativeNotification({storeId,kind:'reservation_due'},()=>false);assert.equal(h.calls.length,0);
});
test('unsaved input survives until the user confirms navigation',async()=>{
 const h=harness({state:{showReservationForm:true,reservationDraft:{name:'입력 중'}}});
 await h.context.openNativeNotification({storeId,kind:'reservation_due'});
 assert.equal(h.state.reservationDraft.name,'입력 중');assert.equal(h.calls.length,0);
 await h.context.confirm();assert.equal(h.state.section,'reservations');assert.equal(h.state.showReservationForm,false);
});
