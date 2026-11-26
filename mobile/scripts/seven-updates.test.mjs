import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createVersionReporter} from '../src/client-version.mjs';
import {installSevenUpdates} from './seven-updates-html.mjs';
function setup(){
 const dom=new JSDOM('<main id="app"></main>',{url:'https://localhost'}),w=dom.window,app=w.document.getElementById('app');let clocks=0,writes=[];let c;
 const state={role:'staff',authProfile:{user_id:'u'},store:'Shop',crew:[{id:'a',name:'Active'},{id:'r',name:'Retired',resignDate:'2020-01-01'}],attendance:[],managerScope:{crew:[]}};
 const noop=()=>'',context={state,app,document:w.document,window:w,FormData:w.FormData,crypto:globalThis.crypto,Date,Promise,setTimeout,console,
 currentStoreId:()=> 's',todayKey:()=> '2026-11-26',monthKey:()=> '2026-11',render:()=>{app.innerHTML='<button id="in">出勤</button>';app.querySelector('button').onclick=()=>c.clockIn();},
 toggleAttendanceConfirm:noop,clockIn:async()=>{clocks++;state.staffClockBusy=true;await Promise.resolve();state.staffClockBusy=false;},clockOut:async()=>{clocks++;},
 renderSector2Pay:()=>state.crew.map(x=>x.id).join(','),renderSector2PayDetail:noop,exportExcelAttendance:()=>{state.exportedAttendance=state.attendance.map(a=>a.crewId);return state.crew.map(x=>x.id).join(',');},renderSector2Employee:noop,r135ManagerPanel:noop,r135ManagerWrite:noop,renderNotifDetails:noop,getNotifGroups:()=>[],
 r134:()=>({}),r135Cap:()=>true,r135LoadManager:async()=>{},isCrewActive:x=>!x.resignDate,escapeHtml:x=>String(x).replaceAll('<','&lt;'),s2Button:noop,
 businessContextGuard:()=>()=>true,showToast:noop,invalidateFinancialViews:noop,loadMonthlyNetPayroll:async()=>{},applyStaffAttendance:noop,
 db:{rpc:async(name,args)=>{writes.push({name,args});return {data:[]};}},};
 c=vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../src/seven-updates.js',import.meta.url),'utf8'),c);return {c,w,app,state,writes,clocks:()=>clocks,close:()=>dom.window.close()};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('clock requires confirmation; X, back and escape never send a request; double tap confirms once',async()=>{
 const s=setup();s.c.clockIn();assert.equal(s.clocks(),0);assert.match(s.app.textContent,/출근하셨나요/);s.app.querySelector('[data-m163-clock-cancel]').click();assert.equal(s.clocks(),0);
 s.c.clockOut();assert.match(s.app.textContent,/수고/);assert.equal(s.c.window.MANEE_HANDLE_BACK(),true);assert.equal(s.clocks(),0);
 s.c.clockIn();s.app.querySelector('.s3-sheet').dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(s.clocks(),0);
 s.c.clockIn();assert.equal(s.w.document.activeElement,s.app.querySelector('[data-m163-clock-ok]'));const b=s.app.querySelector('[data-m163-clock-ok]');b.click();b.click();await tick();assert.equal(s.clocks(),1);s.close();
});
test('changing account while clock prompt is open cancels the pending action',()=>{const s=setup();s.c.clockIn();s.state.authProfile.user_id='other';s.c.render();assert.equal(s.app.querySelector('[data-m163-clock-ok]'),null);assert.equal(s.clocks(),0);s.close();});
test('retired staff are excluded from active payroll and payroll export without losing report state',()=>{const s=setup();s.state.attendance=[{crewId:'a'},{crewId:'r'}];assert.match(s.c.renderSector2Pay(),/^a</);assert.equal(s.c.exportExcelAttendance(),'a');assert.deepEqual([...s.state.exportedAttendance],['a']);assert.equal(s.state.attendance.length,2);assert.equal(s.state.crew.length,2);s.c.renderSector2PayDetail(s.state.crew[1]);assert.equal(s.c.exportExcelAttendance(),'r');s.close();});
test('work confirmation requires explicit half-hour choices and preserves original values in CAS request',async()=>{
 const s=setup(),a={id:'att',crew_id:'a',name:'Worker',date:'2026-11-26',check_in:'18:12:14',check_out:'23:47:31',confirmed:false,pay_check_in:null,pay_check_out:null};
 s.state.m163Work={key:'u:s:2026-11-26',date:'2026-11-26',rows:[a],busy:false};s.state.m163WorkModal={date:a.date,id:a.id};s.c.render();const form=s.app.querySelector('form');assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(form.elements.start.options.length,49);assert.equal([...form.elements.start.options].filter(o=>o.value.endsWith(':12')).length,0);
 form.elements.start.value='18:30';form.elements.end.value='23:30';form.dispatchEvent(new s.w.Event('change',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,false);form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 const req=s.writes.find(r=>r.name==='manee_manager_work');assert.equal(req.args.p_start,'18:30');assert.equal(req.args.p_previous.check_in,'18:12:14');assert.equal(a.check_in,'18:12:14');s.close();
});
test('version reporter isolates account switches, reports each account and throttles foreground calls',async()=>{
 let uid='a',t=0,resolveInfo,writes=[];const storage=new Map();const report=createVersionReporter({platform:'ios',getInfo:()=>new Promise(r=>resolveInfo=r),getContext:()=>({userId:uid,db:{rpc:async(n,a)=>{writes.push({n,a,uid});return {};}}}),storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},uuid:()=> '00000000-0000-4000-8000-000000000001',now:()=>t});
 const p=report();uid='b';resolveInfo({version:'1.58',build:'158.1.1'});await p;assert.equal(writes.length,0);
 const q=report();resolveInfo({version:'1.58',build:'158.1.1'});await q;assert.equal(writes[0].uid,'b');await report();assert.equal(writes.length,1);t=300001;const r=report();resolveInfo({version:'1.58',build:'158.1.1'});await r;assert.equal(writes.length,2);
});
test('full next app has parseable scripts and a quiet native version check',()=>{const script=fs.readFileSync(new URL('../src/seven-updates.js',import.meta.url),'utf8');new vm.Script(script);const policy=fs.readFileSync(new URL('../src/update-policy.mjs',import.meta.url),'utf8');assert.doesNotMatch(policy,/showChecking\?\.\(|앱 버전을 확인하고/);});
