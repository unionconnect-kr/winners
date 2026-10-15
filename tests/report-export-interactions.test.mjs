import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }', 'm'))[0];
function fixture() {
  const snapshot = { snapshot: { store_name: '테스트/매장' }, month_key: '2026-10', status: 'provisional' };
  const buttons = [{ setAttribute() {} }, { setAttribute() {} }], calls = [], files = [];
  const statuses=Object.fromEntries(['current','closing','history'].map(area=>[area,{dataset:{reportExportStatus:area},hidden:true,textContent:''}]));
  const status=statuses.current;
  let active = true;
  const context = vm.createContext({
    state: {}, setTimeout, clearTimeout, Blob, Uint8Array, ArrayBuffer,
    canManageBusinessData: () => true, currentStoreId: () => 's1', monthKey: () => '2026-10',
    reportActionGuard: () => () => active,
    document: { querySelectorAll: s => s === '[data-report-export-status]' ? Object.values(statuses) : buttons, getElementById: () => null },
    escapeHtml: s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    db: { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: snapshot }; } },
    loadReportAssets: async () => ({}), loadReportModel: async () => {}, styleWorksheet() {},
    window: {
      MANEE_REPORTS: { pdfBytes: async () => new Uint8Array([37,80,68,70]), excelWorkbook: () => ({}) },
      MANEE_NATIVE: { saveFile: async file => { files.push(file); return { status: 'saved' }; } },
    },
    XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: () => ({}), book_append_sheet() {} }, write: () => new Uint8Array([80,75,3,4]).buffer },
  });
  for (const name of ['downloadCurrentReport', 'downloadClosingReport', 'downloadReport', 'saveReportFile', 'reportDownloadName', 'setReportExportFeedback', 'syncReportExportButtons', 'renderReportExportStatus', 'closeCurrentMonth']) vm.runInContext(fn(name), context);
  return { context, buttons, status, statuses, calls, files, expire: () => { active = false; } };
}

test('preview and historical PDF/Excel all await native save with real byte buffers and filenames', async () => {
  for (const closed of [false, true]) for (const type of ['pdf', 'excel']) {
    const f = fixture();
    if (type === 'excel') f.context.loadReportAssets = () => { throw Error('Excel must not load PDF fonts'); };
    await (closed ? f.context.downloadClosingReport('closing-1', type) : f.context.downloadCurrentReport(type));
    assert.equal(f.calls[0].name, closed ? 'manee_closed_report' : 'manee_report_preview');
    assert.equal(f.files.length, 1);
    assert.equal(f.files[0].filename, '매니_테스트_매장_2026-10_잠정.' + (type === 'pdf' ? 'pdf' : 'xlsx'));
    assert.deepEqual([...new Uint8Array(f.files[0].bytes)], type === 'pdf' ? [37,80,68,70] : [80,75,3,4]);
    assert.equal(f.statuses[closed?'history':'current'].dataset.kind, 'success');
    assert.equal(Object.values(f.statuses).filter(s=>!s.hidden).length,1);
    assert.equal(f.context.state.reportDownloading, false);
    assert.ok(f.buttons.every(b => !b.disabled));
  }
});

test('duplicate taps cannot open two save dialogs; buttons stay busy until save resolves', async () => {
  const f = fixture(); let resolveSave;
  f.context.window.MANEE_NATIVE.saveFile = () => new Promise(resolve => { resolveSave = resolve; });
  const pending = f.context.downloadCurrentReport('pdf');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(f.buttons.every(b => b.disabled));
  await f.context.downloadCurrentReport('excel');
  assert.equal(f.calls.length, 1);
  resolveSave({ status: 'saved' }); await pending;
  assert.ok(f.buttons.every(b => !b.disabled));
});

test('cancel and native write failure show different outcomes and allow retry', async () => {
  const f = fixture();
  f.context.window.MANEE_NATIVE.saveFile = async () => ({ status: 'cancelled' });
  await f.context.downloadCurrentReport('pdf');
  assert.equal(f.status.dataset.kind, 'cancelled');
  f.context.window.MANEE_NATIVE.saveFile = async () => { throw Error('disk full'); };
  await f.context.downloadCurrentReport('pdf');
  assert.equal(f.status.dataset.kind, 'error');
  assert.match(f.status.textContent, /저장 공간/);
  assert.ok(f.buttons.every(b => !b.disabled));
});

test('backend errors and leaving the store cannot export stale or missing data', async () => {
  const f = fixture();
  f.context.db.rpc = async () => ({ error: { message: 'offline' } });
  await f.context.downloadCurrentReport('excel');
  assert.equal(f.status.dataset.kind, 'error'); assert.equal(f.files.length, 0);
  f.context.db.rpc = async () => { f.expire(); return { data: { snapshot: {} } }; };
  await f.context.downloadCurrentReport('pdf');
  assert.equal(f.files.length, 0); assert.equal(f.context.state.reportDownloading, false);
});

test('Android missing a native plugin fails visibly instead of silently using blob links', async () => {
  const f = fixture();
  f.context.window.MANEE_NATIVE = {};
  f.context.window.Capacitor = { getPlatform: () => 'android' };
  await f.context.downloadCurrentReport('excel');
  assert.equal(f.status.dataset.kind, 'error');
  assert.equal(f.context.state.reportDownloading, false);
});

test('switching export areas clears old feedback and rerender never repeats it in closing', async () => {
  const f=fixture();
  for(const [area,result] of [['current','saved'],['history','cancelled'],['closing','saved']]){
    let finish;
    f.context.window.MANEE_NATIVE.saveFile=()=>new Promise(resolve=>{finish=resolve;});
    const pending=area==='current'?f.context.downloadCurrentReport('excel'):f.context.downloadClosingReport('closed-1','pdf',area);
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.statuses[area].dataset.kind,'progress');
    for(const [other,element] of Object.entries(f.statuses)){
      assert.equal(element.hidden,other!==area);
      if(other!==area)assert.equal(element.textContent,'');
      assert.equal(f.context.renderReportExportStatus(other).includes(' hidden'),other!==area);
    }
    finish({status:result});await pending;
    assert.equal(f.statuses[area].dataset.kind,result==='saved'?'success':'cancelled');
    assert.equal(Object.values(f.statuses).filter(s=>!s.hidden).length,1);
  }
  f.context.monthKey=()=> '2026-11';
  for(const area of Object.keys(f.statuses))assert.match(f.context.renderReportExportStatus(area),/ hidden/);
});

test('closing a month routes the generated PDF feedback only to the closing card', async () => {
  const f=fixture(),closeButton={};
  f.context.document.getElementById=id=>id==='month-close-confirm'?{checked:true}:id==='month-close-btn'?closeButton:null;
  f.context.crypto={randomUUID:()=> 'request-1'};
  f.context.showToast=()=>{};f.context.render=()=>{};
  f.context.loadReportHistory=async()=>{f.context.state.reportHistory=[{month_key:'2026-10',revision:1}];};
  const rpc=f.context.db.rpc;
  f.context.db.rpc=async(name,payload)=>name==='manee_close_month'?{data:{id:'closing-1'}}:rpc(name,payload);
  await f.context.closeCurrentMonth();
  assert.equal(f.files.length,1);
  assert.equal(f.statuses.closing.dataset.kind,'success');
  assert.equal(f.statuses.current.hidden,true);assert.equal(f.statuses.history.hidden,true);
  assert.equal(closeButton.textContent,'정정하고 새 버전 저장');
});

function closingFixture(){
  const f=fixture(),messages=[],button={};
  f.context.state.store='테스트 매장';
  f.context.document.getElementById=id=>id==='month-close-confirm'?{checked:true}:id==='month-close-btn'?button:null;
  f.context.crypto={randomUUID:()=> 'request-1'};
  f.context.showToast=m=>messages.push(m);f.context.render=()=>{};
  f.context.loadReportHistory=async()=>{f.context.state.reportHistory=[{id:'closing-1',month_key:'2026-10',revision:1}];};
  return {...f,messages,button};
}

test('uncertain closing response retries with the same request id and blocks duplicate taps',async()=>{
  const f=closingFixture(),requests=[];let finish;
  const read=f.context.db.rpc;
  f.context.db.rpc=(name,payload)=>{
    if(name!=='manee_close_month')return read(name,payload);
    requests.push(payload.p_request_id);
    return requests.length===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:{id:'closing-1'}});
  };
  const pending=f.context.closeCurrentMonth();
  await f.context.closeCurrentMonth();assert.equal(requests.length,1);
  finish({error:{message:'connection lost'}});await pending;
  assert.equal(f.context.state.closeRequest.id,'request-1');assert.equal(f.files.length,0);assert.equal(f.context.state.monthClosing,false);
  await f.context.closeCurrentMonth();
  assert.deepEqual(requests,['request-1','request-1']);assert.equal(f.context.state.closeRequest,null);assert.equal(f.files.length,1);
});

for(const outcome of ['cancelled','failed'])test('saved closing remains archived when the PDF save is '+outcome,async()=>{
  const f=closingFixture(),read=f.context.db.rpc;
  f.context.db.rpc=(name,payload)=>name==='manee_close_month'?Promise.resolve({data:{id:'closing-1'}}):read(name,payload);
  f.context.window.MANEE_NATIVE.saveFile=async()=>{if(outcome==='failed')throw Error('disk full');return {status:'cancelled'};};
  await f.context.closeCurrentMonth();
  assert.equal(f.context.state.reportHistory[0].id,'closing-1');assert.equal(f.context.state.closeRequest,null);
  assert.equal(f.context.state.monthClosing,false);assert.equal(f.context.state.reportDownloading,false);
  assert.equal(f.statuses.closing.dataset.kind,outcome==='failed'?'error':'cancelled');
  assert.ok(f.messages.every(m=>!m.includes('마감하지 못했어요')));
  f.context.window.MANEE_NATIVE.saveFile=async file=>{f.files.push(file);return {status:'saved'};};
  await f.context.downloadClosingReport('closing-1','pdf');
  assert.equal(f.files.length,1);assert.equal(f.statuses.history.dataset.kind,'success');
  assert.equal(f.calls.at(-1).name,'manee_closed_report');
});
