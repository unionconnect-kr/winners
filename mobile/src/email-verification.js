(function () {
  'use strict';
  const app=document.getElementById('app');
  if(!app)return;
  const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
  const valid=value=>value.length<=254&&/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(value);
  const checks=new Map(),fields=new Map();
  let active=null,scheduled=false,cache=null,cacheAt=0,pendingSignup=null;
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
  const bridge=()=>window.MANEE_EMAIL_BRIDGE;
  const userId=()=>bridge()?.userId?.()||null;
  async function api(payload,authenticated=true){
    const config=window.MANEE_CONFIG;
    if(!config?.supabaseUrl||!config?.publishableKey)throw Error('서버 연결을 확인해 주세요.');
    const headers={'Content-Type':'application/json',apikey:config.publishableKey};
    let uid=null;
    if(authenticated){
      const session=await bridge()?.session?.();
      uid=userId();
      if(!uid||!session?.access_token||session.user?.id!==uid)throw Error('로그인 상태를 다시 확인해 주세요.');
      headers.Authorization='Bearer '+session.access_token;
    }
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(config.supabaseUrl+'/functions/v1/manee-email-auth',{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});
      const data=await response.json().catch(()=>null);
      if(authenticated&&userId()!==uid)throw Error('로그인 계정이 바뀌었어요. 다시 확인해 주세요.');
      if(!response.ok||data?.ok!==true){const e=Error(data?.message||'이메일 인증 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');e.retryAfter=data?.retry_after;e.code=data?.error;throw e;}
      return data;
    }catch(e){if(e.name==='AbortError')throw Error('요청 시간이 길어지고 있어요. 잠시 후 다시 확인해 주세요.');throw e;}
    finally{clearTimeout(timeout);}
  }
  function paintSignup(group){
    const email=normalize(group.input.value),checked=checks.get(group.role);
    const state=checked?.email===email?checked:null;
    const text=state?.busy?'이메일을 확인하고 있어요.':state?.available===true?'사용할 수 있는 이메일이에요.':state?.message||'가입 후 이메일을 인증해 주세요.';
    setText(group.status,text);
    group.status.dataset.state=state?.available===true?'ok':state?.message?'error':'idle';
    group.button.disabled=!!state?.busy;
    setText(group.button,state?.busy?'확인 중…':'중복확인');
  }
  function signupValue(role){
    const group=fields.get(role),email=normalize(group?.input?.value),checked=checks.get(role);
    if(!group||!group.input.isConnected||!valid(email)){group?.input?.focus();throw Error('이메일 주소를 올바르게 입력해 주세요.');}
    if(!checked||checked.email!==email||checked.available!==true){group.input.focus();throw Error('이메일 중복확인을 먼저 해 주세요.');}
    return email;
  }
  function installSignup(){
    for(const role of ['owner','staff','social']){
      const slot=(role==='social'?document:app).querySelector('[data-manee-email-signup="'+role+'"]');
      let group=fields.get(role);
      if(!slot){if(group){fields.delete(role);checks.delete(role);}continue;}
      const input=slot.querySelector('input'),button=slot.querySelector('[data-mee-check]'),status=slot.querySelector('[data-mee-check-status]');
      if(group?.input!==input){
        group={role,input,button,status,version:0};fields.set(role,group);
        input.addEventListener('input',()=>{group.version++;checks.delete(role);paintSignup(group);});
        input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();button.click();}},true);
        button.addEventListener('click',async()=>{
          const email=normalize(input.value);if(checks.get(role)?.busy)return;
          if(!valid(email)){checks.set(role,{email,message:'이메일 주소를 올바르게 입력해 주세요.'});paintSignup(group);input.focus();return;}
          const version=++group.version;checks.set(role,{email,busy:true});paintSignup(group);
          try{
            const result=await api({action:'check',email},false);
            if(!input.isConnected||group.version!==version||normalize(input.value)!==email)return;
            checks.set(role,{email,available:result.available===true,message:result.available===true?'':'이미 사용 중인 이메일이에요. 다른 주소를 입력해 주세요.'});
          }catch(e){if(input.isConnected&&group.version===version)checks.set(role,{email,message:e.message});}
          finally{if(input.isConnected&&group.version===version)paintSignup(group);}
        });
      }
      paintSignup(group);
    }
  }
  function rememberStatus(data,uid){
    if(userId()!==uid)return;
    cache={uid,data};cacheAt=Date.now();
    for(const slot of app.querySelectorAll('[data-manee-email-account]'))renderAccount(slot,data);
    window.dispatchEvent(new CustomEvent('manee:email-updated',{detail:{email:data.email||null,pending_email:data.pending_email||null,email_verified:data.email_verified===true}}));
  }
  function renderAccount(slot,data,error){
    if(!slot.querySelector('[data-mee-open]')){
      slot.innerHTML='<div class="mee-account-head"><h4>이메일 인증</h4><span class="mee-badge" data-mee-badge>확인 중</span></div><p class="mee-account-address" data-mee-address></p><p class="mee-note" data-mee-note></p><button type="button" class="mee-account-button" data-mee-open>이메일 확인·인증 <span aria-hidden="true">›</span></button>';
      slot.querySelector('[data-mee-open]').addEventListener('click',e=>open(e.currentTarget));
    }
    const verified=!!data?.email&&data?.email_verified===true;
    const badge=slot.querySelector('[data-mee-badge]');badge.dataset.verified=String(verified);
    setText(badge,error?'확인 필요':verified?'인증 완료':data?.pending_email?'인증 미완료':'미등록');
    setText(slot.querySelector('[data-mee-address]'),error?'이메일을 불러오지 못했어요.':data?.email||data?.pending_email||'등록된 이메일이 없어요.');
    const changing=!!data?.pending_email&&data.pending_email!==data?.email;
    const note=error||(verified?(changing?'변경할 이메일 '+data.pending_email+'의 인증을 완료해 주세요. 완료 전에는 현재 인증된 이메일이 유지돼요.':'이메일 인증을 완료했어요.'): '계정 복구를 위해 이메일 인증을 완료해 주세요. 인증 전에는 휴대폰으로만 계정을 찾을 수 있어요.');
    setText(slot.querySelector('[data-mee-note]'),note);
  }
  async function loadAccount(slot){
    const uid=userId();if(!uid)return;
    if(slot.dataset.meeUser===uid)return;
    slot.dataset.meeUser=uid;renderAccount(slot,null);
    if(cache?.uid===uid&&Date.now()-cacheAt<30000){renderAccount(slot,cache.data);return;}
    try{const data=await api({action:'status'});if(slot.isConnected&&userId()===uid)rememberStatus(data,uid);}
    catch(e){if(slot.isConnected&&userId()===uid)renderAccount(slot,null,e.message);}
  }
  function close(){if(!active)return false;active.close();return true;}
  function open(opener,{required=false}={}){
    if(active)return;
    const uid=userId();if(!uid)return;
    const dialog=document.createElement('dialog');dialog.className='manee-email-dialog';dialog.setAttribute('aria-labelledby','mee-title');
    dialog.innerHTML='<div class="mee-heading"><h2 id="mee-title">이메일 인증</h2><button type="button" class="mee-close" data-mee-close aria-label="닫기">×</button></div><div data-mee-form><p class="mee-description">아이디·비밀번호 찾기에 사용할 이메일을 확인해 주세요.<br>주소가 다르면 수정한 뒤 인증메일을 보내 주세요.</p><label for="mee-email">인증할 이메일</label><div class="mee-input-row"><input id="mee-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254"><button type="button" data-mee-send>인증 보내기</button></div><p class="mee-note">인증을 완료한 이메일이 회원정보에 자동 반영돼요.</p><div class="mee-wait" data-mee-wait hidden><strong>이메일을 확인해 주세요</strong><p>받은 메일에서 <b>‘매니 이메일 인증하기’</b>를 누른 뒤 매니로 돌아와 주세요.</p><p data-mee-target></p></div><button type="button" class="mee-primary" data-mee-confirm hidden>확인했어요</button><p class="mee-status" data-mee-status role="status" aria-live="polite"></p><button type="button" class="mee-secondary" data-mee-later>나중에 하기</button></div><div class="mee-success" data-mee-success hidden><span class="mee-success-mark" aria-hidden="true">✓</span><h3>매니 이메일 인증이<br>완료되었습니다.</h3><strong class="mee-success-address" data-mee-verified></strong><p>인증한 이메일이 회원정보에 반영됐어요.<br>이제 이메일로도 아이디·비밀번호를 찾을 수 있습니다.</p><button type="button" class="mee-primary" data-mee-done>확인</button></div>';
    if(required)dialog.querySelector('[data-mee-later]').textContent='돌아가기';
    document.body.append(dialog);active=dialog;dialog.__uid=uid;
    const input=dialog.querySelector('#mee-email'),send=dialog.querySelector('[data-mee-send]'),confirm=dialog.querySelector('[data-mee-confirm]'),status=dialog.querySelector('[data-mee-status]');
    const state={uid,version:0,closed:false,busy:false,requested:null,resend:0};
    let nativeListener=null;
    const alive=()=>!state.closed&&userId()===uid;
    const notice=(text,error=false)=>{setText(status,text);status.dataset.state=error?'error':'idle';};
    function paint(){
      const wait=Math.max(0,Math.ceil((state.resend-Date.now())/1000));
      send.disabled=state.busy||wait>0;input.disabled=state.busy;
      setText(send,state.busy?'처리 중…':wait?'재전송 '+wait+'초':state.requested?'다시 보내기':'인증 보내기');
      confirm.disabled=state.busy||!state.requested||normalize(input.value)!==state.requested;
      dialog.querySelector('[data-mee-wait]').hidden=!state.requested;confirm.hidden=!state.requested;
      setText(dialog.querySelector('[data-mee-target]'),state.requested||'');
    }
    function complete(data){
      rememberStatus(data,uid);
      dialog.querySelector('[data-mee-form]').hidden=true;dialog.querySelector('[data-mee-success]').hidden=false;
      setText(dialog.querySelector('[data-mee-verified]'),data.email);
      dialog.querySelector('[data-mee-done]').focus();
    }
    function cleanup(){
      if(state.closed)return;state.closed=true;state.version++;
      clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);
      nativeListener?.remove?.();dialog.remove();if(active===dialog)active=null;
      if(opener?.isConnected)opener.focus();
    }
    const finish=()=>{dialog.close();cleanup();};
    dialog.addEventListener('close',cleanup);dialog.addEventListener('cancel',cleanup);
    for(const b of dialog.querySelectorAll('[data-mee-close],[data-mee-later],[data-mee-done]'))b.addEventListener('click',finish);
    input.addEventListener('input',()=>{state.version++;notice(state.requested&&normalize(input.value)!==state.requested?'변경한 이메일로 인증메일을 다시 보내 주세요.':'');paint();});
    send.addEventListener('click',async()=>{
      if(state.busy||state.resend>Date.now())return;
      const email=normalize(input.value);
      if(!valid(email)){notice('이메일 주소를 올바르게 입력해 주세요.',true);input.focus();return;}
      const version=++state.version;state.busy=true;notice('');paint();
      try{
        const data=await api({action:'request',email});
        if(!alive()||state.version!==version)return;
        if(data.already_verified===true&&data.email_verified===true&&data.email===email){complete(data);state.requested=null;return;}
        if(data.sent!==true||data.pending_email!==email)throw Error('메일 발송 결과를 확인하지 못했어요. 다시 시도해 주세요.');
        state.requested=email;dialog.querySelector('[data-mee-wait] strong').textContent='이메일을 확인해 주세요';state.resend=Date.now()+Math.min(3600,Math.max(1,Number(data.retry_after)||60))*1000;
        notice('매니 인증메일을 보냈어요. 받은메일함이나 스팸함을 확인해 주세요.');
        cache=null;
      }catch(e){if(alive()&&state.version===version){notice(e.message,true);if(e.retryAfter)state.resend=Date.now()+Math.min(3600,Number(e.retryAfter)||60)*1000;}}
      finally{if(alive()&&state.version===version){state.busy=false;paint();}}
    });
    async function check(silent=false){
      if(!alive()||state.busy||!state.requested||normalize(input.value)!==state.requested)return;
      const version=++state.version;state.busy=true;if(!silent)notice('인증 상태를 확인하고 있어요…');paint();
      try{
        const data=await api({action:'status'});
        if(!alive()||state.version!==version)return;
        if(data.email_verified===true&&data.email===state.requested){complete(data);state.requested=null;}
        else if(!silent)notice('이메일에서 인증을 먼저 완료해 주세요. 메일의 ‘매니 이메일 인증하기’를 누른 뒤 다시 확인해 주세요.',true);
      }catch(e){if(alive()&&state.version===version&&!silent)notice(e.message,true);}
      finally{if(alive()&&state.version===version){state.busy=false;paint();}}
    }
    confirm.addEventListener('click',()=>check(false));
    function resume(){if(document.visibilityState!=='hidden')void check(true);}
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    try{Promise.resolve(window.Capacitor?.Plugins?.App?.addListener?.('appStateChange',({isActive})=>{if(isActive)resume();})).then(listener=>{if(state.closed)listener?.remove?.();else nativeListener=listener;}).catch(()=>{});}catch{}
    const timer=setInterval(()=>{if(!alive()){finish();return;}paint();},1000);
    dialog.showModal();input.focus();paint();
    const version=++state.version;state.busy=true;paint();
    void api({action:'status'}).then(data=>{
      if(!alive()||state.version!==version)return;
      input.value=data.pending_email||data.email||'';rememberStatus(data,uid);
      // A pending address can predate the current dialog; only the server can
      // confirm it. An already verified old address never confirms a new one.
      state.requested=data.pending_email||null;
      if(state.requested)dialog.querySelector('[data-mee-wait] strong').textContent='인증메일을 보내고 확인해 주세요';
      if(data.email_verified===true&&data.email&&!data.pending_email)notice('현재 이메일은 인증이 완료됐어요. 다른 주소로 변경하려면 새 이메일을 입력해 주세요.');
    }).catch(e=>{if(alive()&&state.version===version)notice(e.message,true);}).finally(()=>{if(alive()&&state.version===version){state.busy=false;paint();}});
  }
  function openRecovery(opener){
    if(active)return;
    const dialog=document.createElement('dialog');dialog.className='manee-email-dialog';dialog.setAttribute('aria-labelledby','mee-recovery-title');
    dialog.innerHTML='<div class="mee-heading"><h2 id="mee-recovery-title">이메일로 계정 찾기</h2><button type="button" class="mee-close" data-mee-close aria-label="닫기">×</button></div><p class="mee-description">매니에서 인증을 완료한 이메일을 입력해 주세요. 계정 확인과 비밀번호 변경 안내를 보내 드려요.</p><form novalidate><label for="mee-recovery-email">인증한 이메일</label><div class="mee-input-row"><input id="mee-recovery-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254"></div><button type="submit" class="mee-primary">안내 메일 보내기</button></form><p class="mee-status" data-mee-status role="status" aria-live="polite"></p><p class="mee-note">가입 때 입력했어도 이메일 인증을 완료하지 않았다면 휴대폰으로 찾아 주세요.</p>';
    document.body.append(dialog);active=dialog;
    const form=dialog.querySelector('form'),input=dialog.querySelector('input'),button=dialog.querySelector('[type=submit]'),status=dialog.querySelector('[data-mee-status]');let closed=false,busy=false;
    function cleanup(){if(closed)return;closed=true;dialog.remove();if(active===dialog)active=null;if(opener?.isConnected)opener.focus();}
    dialog.addEventListener('close',cleanup);dialog.addEventListener('cancel',cleanup);dialog.querySelector('[data-mee-close]').onclick=()=>{dialog.close();cleanup();};
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;const email=normalize(input.value);
      if(!valid(email)){status.textContent='이메일 주소를 올바르게 입력해 주세요.';status.dataset.state='error';input.focus();return;}
      busy=true;button.disabled=true;input.disabled=true;status.textContent='';
      try{await api({action:'recovery_request',email},false);if(!closed){form.hidden=true;status.dataset.state='idle';status.textContent='인증된 이메일과 일치하는 계정이 있으면 안내 메일을 보내드려요. 받은메일함과 스팸함을 확인해 주세요.';}}
      catch(error){if(!closed){status.dataset.state='error';status.textContent=error.message;}}
      finally{busy=false;if(!closed){button.disabled=false;input.disabled=false;}}
    });
    dialog.showModal();input.focus();
  }
  function installRecovery(){
    for(const forgot of app.querySelectorAll('#forgot-password-btn,[data-staff-auth-action="recovery-forgot"]')){
      const options=forgot.closest('.ml-options');if(!options||options.nextElementSibling?.classList.contains('mee-recovery-entry'))continue;
      const row=document.createElement('div'),button=document.createElement('button');row.className='mee-recovery-entry';button.type='button';button.className='ml-link';button.textContent='이메일로 아이디·비밀번호 찾기';button.addEventListener('click',()=>openRecovery(button));row.append(button);options.after(row);
    }
  }
  function install(){
    scheduled=false;installSignup();installRecovery();
    if(active&&active.__uid&&active.__uid!==userId())close();
    for(const slot of app.querySelectorAll('[data-manee-email-account]'))void loadAccount(slot);
  }
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(install);}}
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('unload',()=>{observer.disconnect();if(active)close();},{once:true});
  function bindSocialSignup(dialog,context){
    const box=dialog.querySelector('[data-mee-social-sms]');
    if(!box||!/^[0-9a-f-]{36}$/i.test(context.userId||''))throw Error('가입 정보를 다시 확인해 주세요.');
    const username='s_'+context.userId.replaceAll('-','').slice(0,28);
    const phone=box.querySelector('#mee-social-phone'),code=box.querySelector('#mee-social-code'),send=box.querySelector('[data-mee-sms-send]'),verify=box.querySelector('[data-mee-sms-verify]'),status=box.querySelector('[data-mee-sms-status]'),clock=box.querySelector('[data-mee-sms-clock]');
    const state={version:0,closed:false,busy:false,locked:false,challenge:null,phone:null,proof:null,proofUntil:0,resend:0,expires:0};
    const number=()=>String(phone.value||'').replace(/[^0-9]/g,'').replace(/^82/,'0');
    function paint(){
      const wait=Math.max(0,Math.ceil((state.resend-Date.now())/1000)),left=Math.max(0,Math.ceil((state.expires-Date.now())/1000)),verified=!!state.proof&&state.proofUntil>Date.now();
      phone.disabled=state.busy||state.locked;code.disabled=state.busy||state.locked||verified;
      send.disabled=state.busy||state.locked||wait>0;verify.disabled=state.busy||state.locked||!state.challenge||!/^\d{6}$/.test(code.value)||!left||verified;
      setText(send,wait?'재전송 '+wait+'초':state.challenge?'재전송':'인증번호 받기');
      setText(verify,verified?'인증 완료':'인증하기');
      setText(clock,verified?'인증 완료 · 10분 안에 가입을 마무리해 주세요.':state.proof?'인증 유효시간이 지났어요. 다시 인증해 주세요.':state.challenge?left?'남은 시간 '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'인증번호가 만료됐어요. 다시 보내 주세요.':'');
    }
    async function sms(payload){
      const session=await bridge()?.session?.();
      if(!session?.access_token||session.user?.id!==context.userId)throw Error('계정이 바뀌었어요. 다시 로그인해 주세요.');
      const config=window.MANEE_CONFIG,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(config.supabaseUrl+'/functions/v1/manee-sms-auth',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,Authorization:'Bearer '+session.access_token},body:JSON.stringify({...payload,purpose:'signup_social',username}),signal:controller.signal});
        const result=await response.json().catch(()=>null);
        if(!response.ok||result?.ok!==true){const error=Error(result?.message||'휴대폰 인증을 완료하지 못했어요. 다시 시도해 주세요.');error.retryAfter=result?.retry_after;throw error;}
        const current=await bridge()?.session?.();if(current?.user?.id!==context.userId)throw Error('계정이 바뀌었어요. 다시 로그인해 주세요.');
        return result;
      }finally{clearTimeout(timer);}
    }
    phone.addEventListener('input',()=>{state.version++;state.challenge=null;state.proof=null;state.phone=null;code.value='';setText(status,'번호가 바뀌었어요. 문자 인증을 다시 해 주세요.');paint();});
    code.addEventListener('input',()=>{code.value=code.value.replace(/\D/g,'').slice(0,6);paint();});
    send.addEventListener('click',async()=>{
      if(state.busy||state.locked||state.resend>Date.now())return;
      const target=number();if(!/^010\d{8}$/.test(target)){setText(status,'010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.');phone.focus();return;}
      const version=++state.version;state.busy=true;state.proof=null;state.challenge=null;code.value='';paint();
      try{const result=await sms({action:'request',phone:target,resend_seconds:30});if(state.closed||version!==state.version||target!==number())return;
        if(typeof result.challenge_id!=='string'||result.expires_in!==180||![30,60].includes(result.resend_after))throw Error('문자 인증 요청을 확인하지 못했어요. 다시 보내 주세요.');
        state.challenge=result.challenge_id;state.phone=target;state.resend=Date.now()+result.resend_after*1000;state.expires=Date.now()+result.expires_in*1000;setText(status,result.message||'문자 인증번호를 보냈어요.');
      }catch(error){if(!state.closed&&version===state.version){setText(status,error.message);if(error.retryAfter)state.resend=Date.now()+Math.min(3600,Number(error.retryAfter)||30)*1000;}}
      finally{if(!state.closed&&version===state.version){state.busy=false;paint();}}
    });
    verify.addEventListener('click',async()=>{
      if(state.busy||state.locked||!state.challenge||state.phone!==number()||!/^\d{6}$/.test(code.value)||state.expires<=Date.now())return;
      const version=++state.version;state.busy=true;paint();
      try{const result=await sms({action:'verify',challenge_id:state.challenge,code:code.value});if(state.closed||version!==state.version)return;
        if(!/^[0-9a-f]{64}$/.test(result.proof||'')||!(result.expires_in>0&&result.expires_in<=600))throw Error('휴대폰 인증 결과를 확인하지 못했어요. 다시 인증해 주세요.');
        state.proof=result.proof;state.proofUntil=Date.now()+result.expires_in*1000;code.value='';setText(status,'✓ 휴대폰 인증 완료');
      }catch(error){if(!state.closed&&version===state.version)setText(status,error.message);}
      finally{if(!state.closed&&version===state.version){state.busy=false;paint();}}
    });
    const timer=setInterval(paint,1000);
    dialog.addEventListener('close',()=>{state.closed=true;state.version++;state.proof=null;clearInterval(timer);},{once:true});paint();
    return Object.freeze({
      payload(){
        const recovery_email=signupValue('social');
        if(state.closed||state.busy||!state.proof||state.proofUntil<=Date.now()||state.phone!==number()){phone.focus();throw Error('휴대폰 문자 인증을 먼저 완료해 주세요.');}
        return {recovery_email,sms_challenge_id:state.challenge,sms_proof:state.proof};
      },
      setBusy(value){state.locked=value;for(const el of dialog.querySelectorAll('[data-manee-email-signup] input,[data-manee-email-signup] button'))el.disabled=value;paint();}
    });
  }
  function afterSignup(){
    checks.clear();cache=null;
    const uid=userId();if(!uid)return;
    const prior=document.querySelector('dialog[open]');
    if(prior&&!prior.classList.contains('manee-email-dialog')){
      if(pendingSignup?.prior===prior&&pendingSignup.uid===uid)return;
      pendingSignup={prior,uid};
      prior.addEventListener('close',()=>{if(pendingSignup?.prior!==prior)return;pendingSignup=null;if(userId()===uid)queueMicrotask(afterSignup);},{once:true});
      return;
    }
    open(null);
  }
  window.MANEE_EMAIL_UI=Object.freeze({signupValue,afterSignup,open,close,bindSocialSignup});
  install();
})();
