import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }', 'm'))[0];
function fixture() {
  const snapshot = { snapshot: { store_name: '테스트/매장' }, month_key: '2026-10', status: 'provisional' };
  const buttons = [{ setAttribute() {} }, { setAttribute() {} }], status = { dataset: {} }, calls = [], files = [];
  let active = true;
  const context = vm.createContext({
    state: {}, setTimeout, clearTimeout, Blob, Uint8Array, ArrayBuffer,
    canManageBusinessData: () => true, currentStoreId: () => 's1', monthKey: () => '2026-10',
    reportActionGuard: () => () => active,
    document: { querySelectorAll: s => s === '[data-report-export-status]' ? [status] : buttons, getElementById: () => null },
    db: { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: snapshot }; } },
    loadReportAssets: async () => ({}), loadReportModel: async () => {}, styleWorksheet() {},
    window: {
      MANEE_REPORTS: { pdfBytes: async () => new Uint8Array([37,80,68,70]), excelWorkbook: () => ({}) },
      MANEE_NATIVE: { saveFile: async file => { files.push(file); return { status: 'saved' }; } },
    },
    XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: () => ({}), book_append_sheet() {} }, write: () => new Uint8Array([80,75,3,4]).buffer },
  });
  for (const name of ['downloadCurrentReport', 'downloadClosingReport', 'downloadReport', 'saveReportFile', 'reportDownloadName', 'setReportExportFeedback', 'syncReportExportButtons']) vm.runInContext(fn(name), context);
  return { context, buttons, status, calls, files, expire: () => { active = false; } };
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
    assert.equal(f.status.dataset.kind, 'success');
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
