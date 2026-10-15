import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('../report-assets/monthly-report.js');
const XLSX=require('../mobile/node_modules/xlsx-js-style');
const R=globalThis.MANEE_REPORTS;
function fixture(){
  return {status:'provisional',snapshot:{store_name:'한글 매장 이름이 길어도 줄바꿈되는 테스트 매장',month_key:'2026-10',generated_at:'2026-10-13T05:11:01.958391+00:00',gross_sales:10000,discount:0,refund:0,net_sales:10000,net_payroll:12000,expenses_total:-1000,fixed_total:0,profit:-1000,operating_days:1,missing_sales_days:12,payroll_status:{unknown_count:0,estimated_count:0},sales:[{date:'2026-10-13',gross:10000,discount:0,refund:0,net:10000,card:10000,cash:0,emoney:0,delivery_baemin:0,delivery_coupang:0,delivery_yogiyo:0}],expenses:[{date:'2026-10-13',description:'길이가 긴 거래처명 '.repeat(4),category:null,amount:-1000,memo:'긴 지출 내용 '.repeat(12)}],fixed:[]}};
}
function savedWorkbook(report){
  const wb=R.excelWorkbook(report,XLSX);
  return XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),{type:'buffer',cellStyles:true,cellNF:true});
}
test('saved workbook retains signed numeric amounts, distinct counts and Korean display units',()=>{
  const wb=savedWorkbook(fixture()),ws=wb.Sheets['월말 요약'];
  assert.equal(wb.SheetNames.length,6);
  assert.equal(ws.B7.v,10000);assert.equal(ws.B7.t,'n');assert.equal(ws.B7.w,'10,000원');
  assert.equal(ws.B15.v,-1000);assert.equal(ws.B15.w,'-1,000원');
  assert.equal(ws.B17.v,1);assert.equal(ws.B17.w,'1일');
  assert.equal(ws.B19.w,'0명');
  assert.equal(ws.B4.v,'2026-10-13 14:11 KST');
  assert.equal(wb.Sheets['지출 상세'].D2.v,-1000);
  assert.equal(wb.Sheets['날짜별 합계'].B2.w,'1');
  assert.equal(wb.Sheets['거래처별 합계'].E2.w,'-1,000원');
  assert.equal(wb.Sheets['일별 매출'].B2.w,'10,000원');
});
test('written file preserves full long Korean content and explicit multi-line row space',()=>{
  const r=fixture(),wb=savedWorkbook(r),summary=wb.Sheets['월말 요약'],expenses=wb.Sheets['지출 상세'];
  assert.equal(summary.B1.v,r.snapshot.store_name);
  assert.equal(expenses.B2.v,r.snapshot.expenses[0].description);
  assert.equal(expenses.E2.v,r.snapshot.expenses[0].memo);
  assert.ok(summary['!cols'][0].wch>=35);
  assert.ok(summary['!rows'][12].hpt>28,'uncategorized label must have extra line space');
  assert.ok(expenses['!rows'][1].hpt>60,'long memo must have multiple visible lines');
  assert.equal(expenses['!autofilter'].ref,'A1:E2');
});
test('unknown payroll stays explicitly unconfirmed, and archived timestamps use the closing time',()=>{
  const r=fixture();r.snapshot.net_payroll=null;r.snapshot.profit=null;r.snapshot.payroll_status.unknown_count=1;
  let ws=savedWorkbook(r).Sheets['월말 요약'];
  assert.equal(ws.B11.v,'계산 보류');assert.equal(ws.B15.v,'계산 보류');
  assert.equal(ws.B20.w,'1명');
  const closed=fixture();closed.status='closed';closed.revision=2;closed.closed_at='2026-11-01T00:30:00Z';
  ws=savedWorkbook(closed).Sheets['월말 요약'];
  assert.equal(ws.B3.v,'마감 버전 2');assert.equal(ws.B4.v,'2026-11-01 09:30 KST');
});
