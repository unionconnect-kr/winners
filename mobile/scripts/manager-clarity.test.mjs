import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {adaptIos139} from './adapt-ios139.mjs';
import {installStoreGuideChecklist} from './store-guide-checklist-html.mjs';
const html=installStoreGuideChecklist(adaptIos139(readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8'),'android'));
function block(a,b){const start=html.indexOf(a),end=html.indexOf(b,start);assert.ok(start>=0&&end>start,a);return html.slice(start,end);}
function harness(caps=['wage','payroll']){
 const dom=new JSDOM('<main id="app"></main>'),document=dom.window.document,app=document.getElementById('app'),u={id:'i',page:'permissions',draft:{view:'sales',wage:true,payroll:true},data:{enabled:true,revision:1}};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new dom.window.Event('close'));};
 const crew={id:'i',name:'직원',position:'홀',wage:10000,wageType:'hourly',wage_type:'hourly',salesAccess:true,isManager:true};
 const state={role:'storeOwner',store:'테스트 매장',crew:[crew],managerScope:{enabled:true,crew:[crew],payroll:[],adjustments:[]}};
 const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 const c=vm.createContext({state,document,app,FormData:dom.window.FormData,r134:()=>u,sector2:()=>({dirty:false}),r135Scoped:()=>true,r135Cap:k=>caps.includes(k),r135LoadManager:async()=>{},render(){},showToast(){},bindR134(){},bindR135Manager(){},
  s2Header:()=>'',s2Button:()=>'',s4Hint:s=>'<p>'+s+'</p>',s3Money:n=>String(n),s3Row:()=>'',s4Select:()=>'',s4Field:()=>'',monthKey:()=> '2026-11',todayKey:()=> '2026-11-24',bizToday:()=> '2026-11-24',isAttendanceDate:()=>true,escapeHtml:esc});
 vm.runInContext(block('  function s2Field(','  async function s2SaveEmployee(')+block('  function r135ManagerMenu(','  async function r135ManagerWrite(')+block('  const R134_PERMISSION_LABELS=','  async function r134Open(')+block('  function r134Permissions(','  async function r134SavePermission(')+readFileSync(new URL('../src/manager-clarity.js',import.meta.url),'utf8'),c);
 return {c,dom,document,app,state,crew,u};
}
test('both manager menus have distinct names and separate accessible info buttons',()=>{
 const h=harness();h.app.innerHTML=h.c.r135ManagerMenu();assert.equal(h.app.querySelector('[data-r135-manager="wage"]').textContent,'시급·월급 설정 ›');assert.equal(h.app.querySelector('[data-r135-manager="payroll"]').textContent,'월별 급여 정산 ›');assert.equal(h.app.querySelectorAll('[data-m161-pay-info]').length,2);assert.equal(h.app.querySelectorAll('button button').length,0);
});
test('owner can read both purpose explanations without toggling the permission checkbox',()=>{
 const h=harness();h.app.innerHTML=h.c.r134Permissions();h.c.m161BindPayInfo();const box=h.app.querySelector('[data-r134-perm="wage"]');assert.equal(box.checked,true);h.app.querySelector('[data-m161-pay-info="wage"]').click();const dialog=h.document.getElementById('m161-pay-help');assert.match(dialog.textContent,/기준 금액/);assert.match(dialog.textContent,/이번 달 급여 확정/);assert.equal(box.checked,true);dialog.querySelector('button').click();assert.equal(h.document.getElementById('m161-pay-help'),null);
 h.app.querySelector('[data-m161-pay-info="payroll"]').click();assert.match(h.document.getElementById('m161-pay-help').textContent,/지급일, 가불/);
});
test('wage and payroll routes show only their corresponding forms even with all permissions',async()=>{
 const h=harness();await h.c.r135ManagerOpen('wage');await h.c.r135ManagerOpen('person','i');h.app.innerHTML=h.c.r135ManagerPanel();assert.ok(h.app.querySelector('#r135-wage-form'));assert.equal(h.app.querySelector('#r135-payroll-form'),null);
 await h.c.r135ManagerOpen('payroll');await h.c.r135ManagerOpen('person','i');h.app.innerHTML=h.c.r135ManagerPanel();assert.equal(h.app.querySelector('#r135-wage-form'),null);assert.ok(h.app.querySelector('#r135-payroll-form'));assert.ok(h.app.querySelector('#r135-adjustment-form'));
});
test('single-capability managers do not receive the other menu',()=>{for(const [cap,other] of [['wage','payroll'],['payroll','wage']]){const h=harness([cap]);h.app.innerHTML=h.c.r135ManagerMenu();assert.ok(h.app.querySelector('[data-r135-manager="'+cap+'"]'));assert.equal(h.app.querySelector('[data-r135-manager="'+other+'"]'),null);}});
test('employment form contains no access controls and saving it does not alter existing authority',()=>{
 const h=harness();h.app.innerHTML=h.c.renderSector2EmployeeForm(h.crew);assert.match(h.app.textContent,/급여·근무조건/);assert.doesNotMatch(h.app.textContent,/매출·리포트 조회 권한|권한·급여 조건/);assert.equal(h.app.querySelector('[name="salesAccess"]'),null);
 const draft=h.c.s2ReadEmployee(h.app.querySelector('form')),patch=h.c.s2EmployeePatch(draft,h.crew);assert.equal(Object.hasOwn(patch,'sales_access'),false);assert.equal(Object.hasOwn(patch,'is_manager'),false);assert.equal(h.crew.salesAccess,true);
});
