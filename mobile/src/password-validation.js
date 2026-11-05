(function(){
 'use strict';
 const app=document.getElementById('app');if(!app)return;
 const specs=[
  {name:'owner',password:'owner-request-password-input',confirm:'owner-request-password-confirm-input',buttons:'[data-signup-next],#submit-owner-request-btn'},
  {name:'staff',password:'staff-signup-password',confirm:'staff-signup-confirm',buttons:'[data-staff-auth-action="signup"]'},
  {name:'reset',password:'recovery-new-password',confirm:'recovery-confirm-password',buttons:'[data-sms-action="reset"]'}
 ];
 const groups=new Map(),rejected=new Map();let scheduled=false;
 function localStatus(password,confirm){return {length:password.length>=8&&new TextEncoder().encode(password).length<=72,mixed:/[A-Za-z]/.test(password)&&/[0-9]/.test(password),same:!!password&&password===confirm};}
 const ready=s=>s.length&&s.mixed&&s.same;
 const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 function controls(g){return [...app.querySelectorAll(g.spec.buttons)].filter(button=>g.spec.name!=='owner'||button.id==='submit-owner-request-btn'||!g.input.closest('section')?.hidden);}
 function paint(g){
  const s=localStatus(g.input.value,g.confirm.value),ok=ready(s)&&g.status==='ok';
  for(const key of ['length','mixed','same']){const row=g.help.querySelector('[data-mpw-rule='+key+']');row.dataset.valid=String(s[key]);row.dataset.invalid=String(!!g.input.value&&!s[key]);}
  g.help.dataset.state=g.status;
  const message=!g.input.value?'비밀번호를 입력하면 조건을 확인해요.':!s.length?(g.input.value.length<8?'8자 이상 입력해 주세요.':'비밀번호가 너무 길어요. 조금 짧게 입력해 주세요.'):!s.mixed?'영문과 숫자를 모두 넣어 주세요.':!s.same?'비밀번호 확인란에 같은 비밀번호를 입력해 주세요.':g.status==='blocked'?'보안 기준에 맞지 않는 비밀번호예요. 다른 단어와 숫자 조합으로 바꿔 주세요.':'✓ 입력 조건을 충족했어요.';
  setText(g.help.querySelector('[data-mpw-status]'),g.errorMessage||message);
  g.input.setAttribute('aria-invalid',String(!!g.input.value&&(!s.length||!s.mixed||g.status==='blocked')));
  for(const button of controls(g)){
   if(!ok){button.dataset.mpwBlocked='true';button.disabled=true;}
   else if(button.dataset.mpwBlocked==='true'){delete button.dataset.mpwBlocked;button.disabled=false;}
  }
 }
 function changed(g){
  if(rejected.has(g.spec.name)&&rejected.get(g.spec.name)!==g.input.value)rejected.delete(g.spec.name);
  g.status=rejected.has(g.spec.name)?'blocked':ready(localStatus(g.input.value,g.confirm.value))?'ok':'idle';
  paint(g);
 }
 function decorate(){
  scheduled=false;
  for(const spec of specs){
   const input=document.getElementById(spec.password),confirm=document.getElementById(spec.confirm);let g=groups.get(spec.name);
   if(!input||!confirm){groups.delete(spec.name);continue;}
   if(g?.input!==input){
    const help=document.createElement('div');help.className='manee-password-help';help.id='manee-password-help-'+spec.name;
    help.innerHTML='<ul><li data-mpw-rule="length">8자 이상</li><li data-mpw-rule="mixed">영문과 숫자 포함 · 특수문자 사용 가능</li><li data-mpw-rule="same">비밀번호 확인 일치</li></ul><p data-mpw-status role="status" aria-live="polite"></p>';
    input.insertAdjacentElement('afterend',help);input.setAttribute('aria-describedby',help.id);
    g={spec,input,confirm,help,status:'idle',current:null,version:0};groups.set(spec.name,g);
   }
   changed(g);
  }
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(decorate);}}
 new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 for(const event of ['input','change'])app.addEventListener(event,e=>{for(const g of groups.values())if(e.target===g.input||e.target===g.confirm)changed(g);},true);
 app.addEventListener('click',e=>{for(const g of groups.values())if(controls(g).some(button=>button===e.target.closest('button'))){changed(g);if(!ready(localStatus(g.input.value,g.confirm.value))||g.status!=='ok'){e.preventDefault();e.stopImmediatePropagation();paint(g);return;}}},true);
 app.addEventListener('keydown',e=>{if(e.key!=='Enter')return;for(const g of groups.values())if(e.target===g.input||e.target===g.confirm){changed(g);if(g.status!=='ok'){e.preventDefault();e.stopImmediatePropagation();return;}}},true);
 window.MANEE_PASSWORD_CHECK=Object.freeze({localStatus,reject(name){const g=groups.get(name);if(!g)return;rejected.set(name,g.input.value);g.status='blocked';paint(g);g.input.focus();}});
 decorate();
})();
