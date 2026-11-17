import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){return html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\{[^\\n]*\\} *$','m'))?.[0]||html.match(new RegExp('^  (?:async )?function '+name+'\\([^\\n]*\\n[\\s\\S]*?^  }','m'))?.[0];}
function context(state={}){const c=vm.createContext({state,storeCutoffHour:()=>6,OW_STALE_HOURS:18,escapeHtml:s=>String(s).replaceAll('<','&lt;'),ownerRouteButton:()=>'',pad:n=>String(n).padStart(2,'0')});vm.runInContext(['ownerWorkCheckInAt','ownerWorkCompute','ownerHomeScope','ownerHomeToday','ownerHomeMoney','ownerHomeCosts','renderOwnerCosts','renderOwnerSignupOffer'].map(fn).join('\n'),c);return c;}
test('completed staff are counted as arrived; only past scheduled starts without attendance require confirmation',()=>{
  const c=context(),raw={bizDate:'2026-10-27',shifts:{ok:true,list:[['a','09:00'],['b','12:00'],['c','18:00']].map(([crew_id,start_time])=>({crew_id,start_time,end_time:'23:00'}))},att:{ok:true,list:[{crew_id:'a',date:'2026-10-27',check_in:'09:00',check_out:'13:00'}]},crew:{ok:true,list:[]},sales:{ok:true,list:[]}};
  let v=c.ownerWorkCompute('A',raw,new Date(2026,9,27,15));
  assert.equal(v.attendance.arrived.length,1);assert.equal(v.work.workers.length,0);assert.equal(v.attendance.pending[0].id,'c');assert.equal(v.attendance.missing[0].id,'b');
  raw.att.ok=false;v=c.ownerWorkCompute('A',raw,new Date(2026,9,27,15));assert.equal(v.attendance.ok,false);assert.equal(v.attendance.missing.length,0);
});
test('an after-midnight scheduled start uses the following calendar day of the business date',()=>{
  const c=context(),raw={bizDate:'2026-10-26',shifts:{ok:true,list:[{crew_id:'night',start_time:'02:00',end_time:'05:00'}]},att:{ok:true,list:[]},crew:{ok:true,list:[]},sales:{ok:true,list:[]}};
  assert.equal(c.ownerWorkCompute('A',raw,new Date(2026,9,27,1)).attendance.pending.length,1);
  assert.equal(c.ownerWorkCompute('A',raw,new Date(2026,9,27,3)).attendance.missing.length,1);
});
test('today distinguishes entered zero, missing reports and failed lookups and follows the chosen stores',()=>{
  const c=context({ownerWork:{loadedOnce:true,stores:{A:{bizDate:'2026-10-27',sales:{ok:true,days:{'2026-10-27':0}}},B:{bizDate:'2026-10-27',sales:{ok:true,days:{}}},C:{bizDate:'2026-10-27',sales:{ok:false,days:{}}}}}});
  const t=c.ownerHomeToday(['A','B','C']);assert.equal(t.sum,0);assert.equal(t.entered,1);assert.equal(t.failed,1);
  assert.equal(c.ownerHomeToday(['B']).entered,0);assert.equal(c.ownerHomeToday(['A']).failed,0);
});
test('other costs include unclassified and fixed expenses exactly once; aggregate ratio is weighted by sales',()=>{
  const c=context(),rows=[{store:'A',salesSum:1000000,expenseSum:400000,foodExpenseSum:250000,unclassifiedExpenseSum:100000,fixedExpenseSum:50000,laborPay:200000,loadFailures:[]},{store:'B',salesSum:3000000,expenseSum:600000,foodExpenseSum:400000,fixedExpenseSum:100000,laborPay:300000,loadFailures:[]}];
  const costs=c.ownerHomeCosts(rows,['A','B']);assert.equal(costs.total,1650000);assert.equal(costs.other,500000);assert.equal(costs.ratio(costs.total),41.25);
  rows[1].loadFailures=['고정지출'];const partial=c.ownerHomeCosts(rows,['A','B']);assert.equal(partial.other,null);assert.equal(partial.total,null);assert.equal(partial.food,650000);
  rows[0].salesSum=0;assert.equal(c.ownerHomeCosts(rows,['A']).ratio(100),null);
});
test('new owner signup advertises 40 days while subscription consent remains separate',()=>{
  const c=context();for(const compact of [true,false])assert.match(c.renderOwnerSignupOffer(false,compact),/40일 무료체험/);
  const out=c.renderOwnerSignupOffer();assert.match(out,/아이디당 월 9,900원/);assert.match(out,/회원가입만으로는 결제되지/);assert.doesNotMatch(out,/1개월 무료체험/);
  assert.match(fn('renderOwnerSignup'),/가입하고 40일 무료로 시작하기/);
  assert.match(c.renderOwnerSignupOffer(true),/계약된 별도 요금/);
});
