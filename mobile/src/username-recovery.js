(function () {
  'use strict';
  const app = document.getElementById('app');
  if (!app) return;
  let active = null;
  const digits = value => String(value || '').replace(/[^0-9]/g, '');

  function open(opener) {
    if (active) return;
    const config = window.MANEE_CONFIG;
    if (!config?.supabaseUrl || !config?.publishableKey) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'manee-id-recovery';
    dialog.setAttribute('aria-labelledby', 'manee-id-title');
    dialog.innerHTML = '<div class="mir-heading"><h2 id="manee-id-title">아이디 찾기</h2><button type="button" data-mir-close aria-label="닫기">×</button></div>' +
      '<p data-mir-intro>가입할 때 또는 복구용으로 인증한 휴대폰 번호를 입력해 주세요.</p>' +
      '<form novalidate><label for="manee-id-phone">휴대폰 번호</label><div class="mir-row"><input id="manee-id-phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="24" placeholder="01012345678"><button type="button" data-mir-send>인증번호 받기</button></div>' +
      '<label for="manee-id-code">문자 인증번호</label><input id="manee-id-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6자리 숫자" disabled>' +
      '<p class="mir-clock" data-mir-clock>인증번호는 3분 동안 유효해요.</p><button type="submit" class="mir-primary" data-mir-verify disabled>인증하고 아이디 찾기</button></form>' +
      '<p class="mir-status" data-mir-status role="status" aria-live="polite"></p><div data-mir-results hidden></div>' +
      '<p class="mir-help">카카오·네이버로만 가입했다면 해당 버튼으로 로그인해 주세요.<br>인증한 번호가 없거나 바뀌었다면 고객지원에 문의해 주세요.</p>';
    document.body.append(dialog);
    const form = dialog.querySelector('form'), phone = dialog.querySelector('#manee-id-phone'), code = dialog.querySelector('#manee-id-code');
    const send = dialog.querySelector('[data-mir-send]'), verify = dialog.querySelector('[data-mir-verify]');
    const status = dialog.querySelector('[data-mir-status]'), clock = dialog.querySelector('[data-mir-clock]');
    const results = dialog.querySelector('[data-mir-results]');
    const state = {version:0, challenge:null, expires:0, resend:0, busy:false, closed:false};
    active = dialog;
    function tick() {
      const wait = Math.max(0, Math.ceil((state.resend-Date.now())/1000));
      const left = Math.max(0, Math.ceil((state.expires-Date.now())/1000));
      send.disabled = state.busy || wait > 0;
      send.textContent = state.busy ? '처리 중…' : wait ? (state.challenge?'재전송 ':'재시도 ')+(wait>=60?Math.ceil(wait/60)+'분':wait+'초') : state.challenge ? '재전송' : '인증번호 받기';
      code.disabled = state.busy || !state.challenge;
      verify.disabled = state.busy || !state.challenge || !left || !/^\d{6}$/.test(code.value);
      clock.textContent = state.challenge ? left ? '남은 시간 '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0') : '인증번호가 만료됐어요. 재전송해 주세요.' : '인증번호는 3분 동안 유효해요.';
    }
    const timer = setInterval(tick, 1000);
    function cleanup() {
      if (state.closed) return;
      state.closed = true; state.version++; state.challenge = null;
      clearInterval(timer); active = null; dialog.remove();
      if (opener?.isConnected) opener.focus();
    }
    dialog.addEventListener('close', cleanup);
    dialog.addEventListener('cancel', cleanup);
    dialog.querySelector('[data-mir-close]').addEventListener('click', () => {dialog.close();cleanup();});
    phone.addEventListener('input', () => {
      state.version++; state.challenge = null; state.expires = 0;
      state.busy = false; code.value = ''; status.textContent = ''; tick();
    });
    code.addEventListener('input', () => {code.value = digits(code.value).slice(0,6); tick();});
    async function api(payload) {
      const response = await fetch(config.supabaseUrl+'/functions/v1/manee-find-username', {
        method:'POST', headers:{'Content-Type':'application/json',apikey:config.publishableKey}, body:JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        const e = new Error(data.message || '처리 결과를 확인하지 못했어요. 다시 시도해 주세요.');
        e.retryAfter = data.retry_after; throw e;
      }
      return data;
    }
    send.addEventListener('click', async () => {
      if (state.busy || state.resend > Date.now()) return;
      const number = digits(phone.value);
      if (!/^010\d{8}$/.test(number)) {status.textContent='010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.';phone.focus();return;}
      const version = ++state.version;
      state.busy = true; state.challenge = null; code.value = ''; status.textContent=''; tick();
      try {
        const data = await api({action:'request',phone:number,resend_seconds:30});
        if (state.closed || state.version !== version) return;
        if (typeof data.challenge_id !== 'string' || data.expires_in !== 180 || ![30,60].includes(data.resend_after)) throw Error('인증 요청을 확인하지 못했어요. 다시 시도해 주세요.');
        state.challenge = data.challenge_id;
        state.expires = Date.now()+180000; state.resend = Date.now()+data.resend_after*1000;
        status.textContent = data.message;
      } catch (e) {
        if (!state.closed && state.version === version) {
          status.textContent = e.message;
          if (e.retryAfter) state.resend=Date.now()+Math.min(3600,Number(e.retryAfter)||30)*1000;
        }
      } finally {
        if (!state.closed && state.version === version) {state.busy=false;tick();if(state.challenge)code.focus();}
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (state.busy || !state.challenge || state.expires<=Date.now() || !/^\d{6}$/.test(code.value)) return;
      const version = ++state.version;
      state.busy=true; status.textContent=''; tick();
      try {
        const data=await api({action:'verify',challenge_id:state.challenge,code:code.value});
        if (state.closed || state.version!==version) return;
        if (!Array.isArray(data.usernames)) throw Error('아이디를 확인하지 못했어요. 다시 인증해 주세요.');
        state.challenge=null; code.value=''; form.hidden=true; results.hidden=false;
        const names=data.usernames.filter(name=>typeof name==='string'&&/^[a-z0-9가-힣._-]{4,30}$/.test(name)).slice(0,20);
        dialog.querySelector('#manee-id-title').textContent=names.length?'아이디를 찾았어요':'확인된 아이디가 없어요';
        dialog.querySelector('[data-mir-intro]').textContent=names.length?'로그인할 아이디를 선택해 주세요.':'이 번호로 가입된 일반 계정이 없어요. 탈퇴·삭제한 계정은 신규가입해 주세요.';
        if(!names.length){
          const close=document.createElement('button');close.type='button';close.className='mir-account';close.textContent='로그인 화면으로 돌아가기';
          close.addEventListener('click',()=>{dialog.close();cleanup();});results.append(close);
        }
        for (const name of names) {
          const button=document.createElement('button'), strong=document.createElement('strong'), label=document.createElement('span');
          button.type='button'; button.className='mir-account'; strong.textContent=name; label.textContent='아이디로 로그인';
          button.append(strong,label);
          button.addEventListener('click',()=>{
            dialog.close(); cleanup();
            const input=document.getElementById('store-login-username-input');
            if(input){input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('store-login-password-input')?.focus();}
          });
          results.append(button);
        }
      } catch (error) {if(!state.closed&&state.version===version)status.textContent=error.message;}
      finally {if(!state.closed&&state.version===version){state.busy=false;tick();}}
    });
    dialog.showModal(); phone.focus(); tick();
  }

  function install() {
    // Only owner/staff login. Administrative recovery keeps its existing rules.
    for (const forgot of app.querySelectorAll('#forgot-password-btn,[data-staff-auth-action="recovery-forgot"]')) {
      if (forgot.parentElement?.classList.contains('manee-recovery-links')) continue;
      const group=document.createElement('span'), button=document.createElement('button'), divider=document.createElement('span');
      group.className='manee-recovery-links'; button.type='button';button.className='ml-link';button.dataset.findUsername='';button.textContent='아이디 찾기';
      divider.className='mir-divider';divider.setAttribute('aria-hidden','true');divider.textContent='|';
      forgot.textContent='비밀번호 찾기';
      const parent=forgot.parentElement;
      parent.insertBefore(group,forgot);group.append(button,divider,forgot);
      if(parent.classList.contains('ml-options'))parent.classList.add('manee-has-recovery-links');
      button.addEventListener('click',()=>open(button));
    }
  }
  install();
  new MutationObserver(install).observe(app,{childList:true,subtree:true});
})();
