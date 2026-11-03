// Shared device feedback for packaged iPhone and Android QA apps.
export function adaptIosDeviceFeedback(source) {
  let html = source;
  const once = (before, after) => {
    if (html.split(before).length !== 2) throw Error('iPhone device anchor mismatch: ' + before.slice(0, 80));
    html = html.replace(before, after);
  };
  const all = (before, after) => {
    if (!html.includes(before)) throw Error('Missing iPhone device anchor: ' + before.slice(0, 80));
    html = html.split(before).join(after);
  };
  // New credentials only. Existing accounts retain their login/recovery path.
  once('  async function loginStoreOwner(){', `  function validManeeNewPassword(value){
    return typeof value==='string'&&value.length>=8&&new TextEncoder().encode(value).length<=72&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value);
  }
  async function verifyManeeEntryRole(session,role){
    if(!['owner','staff'].includes(role))throw Error('로그인할 역할을 다시 선택해 주세요.');
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/manee_staff_portal',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+session.access_token},body:JSON.stringify({p_action:'session',p_payload:{}}),signal:AbortSignal.timeout(15000)});
    const snapshot=await response.json();
    if(!response.ok||snapshot.ok!==true||!snapshot.profile?.user_id)throw Error('계정 정보를 확인하지 못했어요. 다시 시도해 주세요.');
    const roles=(snapshot.memberships||[]).map(m=>m.role),allowed=role==='owner'?roles.includes('owner'):roles.some(r=>['staff','manager'].includes(r))||roles.length===0;
    if(!allowed)throw Error(role==='staff'?'사장님 계정이에요. 사장님 로그인을 선택해 주세요.':'직원 계정이에요. 직원·매니저 로그인을 선택해 주세요.');
    return snapshot.profile.user_id;
  }
  async function applyManeeEntrySession(session,role){
    const userId=await verifyManeeEntryRole(session,role);
    await applyManeeAuthSession(session);
    localSet('auth-entry-role',{userId,role});
  }
  async function loginStoreOwner(){`);
  once('const authData = await callManeeAuthApi("manee-login", { username, password:pw });\n      await applyManeeAuthSession(authData.session);', `const role=state.landingTab==='staff'?'staff':'owner';
      const authData = await callManeeAuthApi("manee-login", { username, password:pw, role });
      await applyManeeEntrySession(authData.session,role);`);
  all('    state.staffPersonalProfile=snapshot.personal_profile||null;\n    state.authMemberships=snapshot.memberships||[];', `    state.staffPersonalProfile=snapshot.personal_profile||null;
    const entryChoice=localGet('auth-entry-role')?.value;
    const entryRole=entryChoice?.userId===snapshot.profile.user_id?entryChoice.role:null;
    state.authMemberships=(snapshot.memberships||[]).filter(m=>!entryRole||(entryRole==='owner'?m.role==='owner':['staff','manager'].includes(m.role)));`);
  once('open:url=>native?native.open(url):location.assign(url),applySession:async(session,record)=>{maneeSetRememberLogin(record.remember);await applyManeeAuthSession(session);}', 'open:(url,context)=>native?native.open(url,context):location.assign(url),applySession:async(session,record)=>{if(record.intent===\'signin\'){const user=await fetch(SUPABASE_URL+\'/functions/v1/manee-social-auth\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\',apikey:SUPABASE_ANON_KEY,Authorization:\'Bearer \'+session.access_token},body:JSON.stringify({action:\'context\'}),signal:AbortSignal.timeout(15000)});const context=await user.json();if(!user.ok||!context.ok)throw Error(\'가입 정보를 확인하지 못했어요.\');maneeSetRememberLogin(record.remember);if(context.registered)await applyManeeEntrySession(session,record.role);else await applyManeeAuthSession(session);}else await applyManeeAuthSession(session);}');
  all('{4,30}', '{6,30}');
  all('4~30자', '6~30자');
  all('minlength="4" maxlength="30"', 'minlength="6" maxlength="30"');
  once('autocomplete="username" maxlength="30" autocapitalize="none"', 'autocomplete="username" minlength="6" maxlength="30" autocapitalize="none"');
  once("input('username','owner-request-username-input','아이디'", "input('username','owner-request-username-input','아이디 · 6~30자'");
  once("if(d.password.length<8||d.password.length>72){showToast('비밀번호는 8~72자로 만들어 주세요.');return;}", "if(!validManeeNewPassword(d.password)){showToast('비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)');return;}");
  once("if(!username || !display_name || password.length<8 || password.length>72) throw new Error('이름·아이디와 8~72자 비밀번호를 입력해 주세요.');", "if(!username || !display_name)throw new Error('이름과 아이디를 입력해 주세요.');\n        if(!/^[a-z0-9가-힣._-]{6,30}$/.test(username.normalize('NFKC').trim().toLowerCase()))throw new Error('아이디는 6~30자로 입력해 주세요.');\n        if(!validManeeNewPassword(password))throw new Error('비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)');");
  all("newPassword.length<8||new TextEncoder().encode(newPassword).length>72", "!validManeeNewPassword(newPassword)");
  all("new_password.length<8 || new TextEncoder().encode(new_password).length>72", "!validManeeNewPassword(new_password)");
  all('if(pw.length < 8)', 'if(!validManeeNewPassword(pw))');
  all('if(newPw.length < 8)', 'if(!validManeeNewPassword(newPw))');
  all('비밀번호는 8자 이상 입력해 주세요. 영문·숫자를 섞어 사용하는 것을 권장해요.', '영문과 숫자를 모두 포함해 8자 이상으로 만들어 주세요. (72바이트 이하)');
  all('placeholder="8자 이상"', 'placeholder="영문·숫자 포함 8자 이상"');
  all('비밀번호 · 8~72자', '비밀번호 · 영문·숫자 포함 8자 이상');
  all('비밀번호는 8자 이상, 영문 72자·한글 24자 이내로 입력해 주세요.', '비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)');
  all('비밀번호는 8자 이상으로 만들어 주세요.', '비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요.');
  // Both signup steps and the final submission reject a short username.
  once("if(d.step===2){", "if(d.step===2){\n      if(!/^[a-z0-9가-힣._-]{6,30}$/.test(d.username.normalize('NFKC').trim().toLowerCase())){showToast('아이디는 6~30자로 입력해 주세요.');return;}");
  // Staff may only remove their own unconfirmed expense, with a pinned revision.
  once('  function r136ExpenseDetail(e,owner=false){', `  function r136CanDeleteExpense(e){return state.role==='staff'&&!!e&&e.created_by_user_id===state.authProfile?.user_id&&!e.owner_confirmed_at;}
  function r136DeleteButton(e){return r136CanDeleteExpense(e)?r136Button('내 등록 내역 삭제','expense-delete',e.id,'full r136-delete'):'';}
  async function r136DeleteExpense(u,t,id,revision){
    if(u!==r136()||u.sheet!==t||u.busy)return;
    const entry=u.entries.find(e=>e.id===id);
    if(!r136CanDeleteExpense(entry)||entry.staff_revision!==revision){t.error='내역이 변경됐어요. 다시 불러와 주세요.';render();return;}
    u.busy=true;t.error=null;render();
    try{const saved=await r136Rpc('delete',{id,revision});if(u!==r136())return;
      if(saved?.deleted!==true||saved.id!==id)throw Error('삭제 결과를 확인하지 못했어요. 목록을 다시 확인해 주세요.');
      u.sheet=null;await r136LoadExpenses();if(u===r136())showToast('내가 등록한 지출을 삭제했어요.');
    }catch(e){if(u===r136()&&u.sheet===t)t.error=e.message||'삭제하지 못했어요. 다시 시도해 주세요.';}
    finally{if(u===r136()){u.busy=false;render();}}
  }
  function r136ExpenseDetail(e,owner=false){`);
  once("r136Button('내 등록 내역 수정','expense-edit',e.id,'full')", "r136Button('내 등록 내역 수정','expense-edit',e.id,'full')+r136DeleteButton(e)");
  once("(u.busy?'저장 중…':'매장지출 저장')+'</button></form>';", "(u.busy?'저장 중…':'매장지출 저장')+'</button></form>'+r136DeleteButton(u.entries.find(e=>e.id===d.id));");
  once('사장님이 확인하기 전에는 내가 등록한 내역을 수정할 수 있어요. 확인 후에는 사장님께 수정을 요청해 주세요.', '사장님이 확인하기 전에는 내가 등록한 내역을 수정·삭제할 수 있어요. 확인 후에는 사장님께 요청해 주세요.');
  once('확인 후 수정은 사장님께 요청해 주세요.', '확인 후 수정·삭제는 사장님께 요청해 주세요.');
  once('      const a=b.dataset.r136,id=b.dataset.id,u=r136();', `      const a=b.dataset.r136,id=b.dataset.id,u=r136();
      if(u.busy)return;
      if(a==='expense-delete'){
        const entry=u.entries.find(e=>e.id===id),t=u.sheet;
        if(!t||!r136CanDeleteExpense(entry)){showToast('내가 등록한 사장님 확인 전 지출만 삭제할 수 있어요.');return;}
        r136ReadExpense();const revision=entry.staff_revision;
        askConfirm('이 지출을 삭제할까요? 사장님 지출 합계에서도 제외돼요.',()=>r136DeleteExpense(u,t,id,revision));return;
      }`);
  return html;
}
