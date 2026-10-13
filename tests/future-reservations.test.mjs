import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }','m'))?.[0]||'';
function harness(result={data:[{id:'future'}]}){
  const state={role:'storeOwner',store:'A',homeStore:'A',myStores:['A','B'],authProfile:{user_id:'u1'},reservations:[],dashboardReservations:[],upcomingReservations:[],showReservationForm:false};
  const calls=[],messages=[];
  let confirm;
  const context={state,maneeViewEpoch:0,businessMutationLocks:new Set(),MANEE_STAFF_AUTH_ENABLED:true,
    currentStoreId:()=>state.store,monthKey:()=> '2026-10',bizToday:()=> '2026-10-13',formatDateLabel:d=>d,navIcon:()=>'',
    escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),render(){},
    askConfirm:(message,callback)=>{confirm=callback;},showToast:m=>messages.push(m),businessError:e=>messages.push(e.message||'error'),
    db:{from(table){calls.push(['from',table]);const q={delete(){calls.push(['delete']);return q;},eq(k,v){calls.push([k,v]);return q;},select(){return Promise.resolve(result);}};return q;}}};
  vm.createContext(context);
  vm.runInContext(['renderOwnerReservations','cancelReservation','deleteAuthBusinessRow','runBusinessMutation','checkedBusinessMutation','businessContextGuard'].map(fn).join('\n'),context);
  return {state,context,calls,messages,confirm:()=>confirm()};
}
const reservation=(id,date,time='19:00')=>({id,date,time,customerName:id,partySize:2});

test('owner sees future reservations in date/time order, independently of today and without changing cache order',()=>{
  const h=harness();
  h.state.reservations=[reservation('today','2026-10-13')];
  h.state.dashboardReservations=[reservation('other-store','2026-10-13')];
  h.state.upcomingReservations=[reservation('late','2026-11-01'),reservation('evening','2026-10-14'),reservation('noon','2026-10-14','12:00'),reservation('stale','2026-10-12')];
  const output=h.context.renderOwnerReservations();
  assert.match(output,/오늘 예약 1건 · A/);assert.match(output,/다가오는 예약 3건/);
  assert.ok(output.indexOf('noon')<output.indexOf('evening'));assert.ok(output.indexOf('evening')<output.indexOf('late'));
  assert.doesNotMatch(output,/other-store|stale/);assert.equal(h.state.upcomingReservations[0].id,'late');
});
test('future reservations remain visible with no reservations today and escape customer text',()=>{
  const h=harness();h.state.upcomingReservations=[reservation('<img src=x>','2026-10-14','')];
  const output=h.context.renderOwnerReservations();
  assert.match(output,/오늘 등록된 예약이 없어요/);assert.match(output,/다가오는 예약 1건/);
  assert.match(output,/2026-10-14 --:-- &lt;img src=x>/);assert.doesNotMatch(output,/<img/);
});
test('all-store today overview does not label the selected store future cache as all-store bookings',()=>{
  const h=harness();h.state.homeStore='__all__';h.state.upcomingReservations=[reservation('future','2026-10-14')];
  assert.doesNotMatch(h.context.renderOwnerReservations(),/다가오는 예약|future/);
});
test('confirmed cancellation removes future reservation only after the server confirms deletion',async()=>{
  const h=harness();h.state.upcomingReservations=[reservation('future','2026-10-14'),reservation('keep','2026-10-15')];
  h.context.cancelReservation('future');assert.equal(h.calls.length,0);assert.equal(h.state.upcomingReservations.length,2);
  await h.confirm();
  assert.deepEqual(h.calls,[['from','reservations'],['delete'],['store_id','A'],['id','future']]);
  assert.equal(h.state.upcomingReservations.length,1);assert.equal(h.state.upcomingReservations[0].id,'keep');
  assert.match(h.messages[0],/예약을 취소했어요/);
});
for(const result of [{error:{message:'offline'}},{data:[]}])test('failed or unconfirmed cancellation keeps the future booking visible',async()=>{
  const h=harness(result);h.state.upcomingReservations=[reservation('future','2026-10-14')];
  h.context.cancelReservation('future');await h.confirm();
  assert.equal(h.state.upcomingReservations.length,1);assert.doesNotMatch(h.messages.join(''),/예약을 취소했어요/);
});
