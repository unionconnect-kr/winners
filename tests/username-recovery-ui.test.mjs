import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const script=readFileSync(new URL('../web/username-recovery.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(staff=false,fetchImpl){
  const dom=new JSDOM(`<div id="app"><input id="store-login-username-input"><input id="store-login-password-input"><div class="ml-options"><button ${staff?'data-staff-auth-action="recovery-forgot"':'id="forgot-password-btn"'}>비밀번호 찾기</button></div></div>`,{runScripts:'outside-only',url:'https://example.test'}),w=dom.window;
  w.MANEE_CONFIG={supabaseUrl:'https://bhwuuxcrzxespkjlmqxr.supabase.co',publishableKey:'public-test'};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
  w.fetch=fetchImpl;w.eval(script);
  const q=s=>w.document.querySelector(s),input=(s,v)=>{q(s).value=v;q(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {w,q,input,close:()=>w.close()};
}
const challenge={ok:true,challenge_id:'12345678-1234-1234-1234-123456789012',expires_in:180,resend_after:60,message:'인증한 번호와 일치하면 인증번호를 보내드려요.'};
test('owner and employee login show both recovery actions without duplicate insertion',async()=>{
  for(const staff of [false,true]){const f=fixture(staff);try{await settle();assert.equal(f.w.document.querySelectorAll('[data-find-username]').length,1);assert.match(f.q('.manee-recovery-links').textContent,/아이디 찾기\|비밀번호 찾기/);}finally{f.close();}}
});
test('verified username selection prefills the existing login without changing session or role',async()=>{
  const calls=[];const f=fixture(true,async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);return Response.json(body.action==='request'?challenge:{ok:true,usernames:['owner_one','staff_two']});});
  try{
    f.q('[data-find-username]').click();f.input('#manee-id-phone','010-1111-0001');f.q('[data-mir-send]').click();await settle();
    assert.equal(f.q('[data-mir-verify]').disabled,true);f.input('#manee-id-code','123456');assert.equal(f.q('[data-mir-verify]').disabled,false);
    f.q('dialog form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(f.w.document.querySelectorAll('.mir-account').length,2);f.q('.mir-account').click();
    assert.equal(f.q('#store-login-username-input').value,'owner_one');assert.equal(f.q('dialog'),null);
    assert.deepEqual(calls.map(x=>x.action),['request','verify']);assert.equal(f.w.localStorage.length,0);
  }finally{f.close();}
});
test('changing phone while a request is pending rejects the stale challenge and closes clear results',async()=>{
  let resolve;const f=fixture(false,()=>new Promise(r=>resolve=r));
  try{
    f.q('[data-find-username]').click();f.input('#manee-id-phone','01011110001');f.q('[data-mir-send]').click();
    f.input('#manee-id-phone','01011110002');resolve(Response.json(challenge));await settle();
    f.input('#manee-id-code','123456');assert.equal(f.q('[data-mir-verify]').disabled,true);
    f.q('[data-mir-close]').click();f.q('[data-find-username]').click();assert.equal(f.q('#manee-id-phone').value,'');
  }finally{f.close();}
});
test('failed verification never renders an account result',async()=>{
  const f=fixture(false,async(_url,opts)=>Response.json(JSON.parse(opts.body).action==='request'?challenge:{ok:false,message:'인증번호가 맞지 않아요.'}));
  try{
    f.q('[data-find-username]').click();f.input('#manee-id-phone','01011110001');f.q('[data-mir-send]').click();await settle();
    f.input('#manee-id-code','123456');f.q('dialog form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    assert.equal(f.q('[data-mir-results]').hidden,true);assert.equal(f.q('[data-mir-status]').textContent,'인증번호가 맞지 않아요.');
  }finally{f.close();}
});
