// Applies the same security corrections to the canonical web and archived mobile UI.
// Archived source remains byte-identical to its signed baseline; patch the build output.
export function hardenUi(source) {
  if(source.includes('MANEE_SECURITY_20261104')) return source;
  let html=source;
  const escaping='.replace(/>/g,"&gt;")';
  if(!html.includes(escaping)) throw Error('Missing HTML escaping anchor');
  html=html.replaceAll(escaping,escaping+`.replace(/"/g,"&quot;").replace(/'/g,"&#39;")`);
  const helper=String.raw`
  // MANEE_SECURITY_20261104
  function maneeSafeImage(value){
    if(typeof value!=='string'||value.length>7340032||/[\u0000-\u0020"'<>]/.test(value))return '';
    if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;
    try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
    return '';
  }
  async function maneeServiceHeaders(){
    const {data,error}=await db.auth.getSession();
    if(error||!data?.session?.access_token)throw Error('로그인 후 다시 시도해 주세요.');
    return {'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token};
  }
  function maneeClearContractDrafts(){
    try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&(k.startsWith(MANEE_LOCAL_PREFIX+'contract-draft:')||k.startsWith('contract-draft:')))localStorage.removeItem(k);}}catch{}
  }
  async function maneeRequireMfa(){
    const level=await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if(level.error)throw level.error;
    if(level.data?.currentLevel==='aal2')return;
    const factors=await db.auth.mfa.listFactors();if(factors.error)throw factors.error;
    let factor=(factors.data?.totp||[]).find(f=>f.status==='verified'),enrollment=null;
    if(!factor){
      // Reuse no abandoned secret: unenroll only unverified factors owned by this user.
      for(const f of (factors.data?.all||[]).filter(f=>f.status==='unverified'&&f.factor_type==='totp'))await db.auth.mfa.unenroll({factorId:f.id});
      const r=await db.auth.mfa.enroll({factorType:'totp',friendlyName:'MANEE 관리자'});if(r.error)throw r.error;
      enrollment=r.data;factor={id:r.data.id};
    }
    await new Promise((resolve,reject)=>{
      const overlay=document.createElement('div');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
      overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:#0009;display:grid;place-items:center;padding:20px';
      const box=document.createElement('form');box.style.cssText='background:white;color:#172233;border-radius:16px;padding:24px;max-width:380px;width:100%;max-height:90vh;overflow:auto';
      const title=document.createElement('h2');title.textContent=enrollment?'관리자 2단계 인증 등록':'관리자 2단계 인증';box.append(title);
      const help=document.createElement('p');help.textContent=enrollment?'인증 앱에서 QR을 등록한 뒤 6자리 인증번호를 입력해 주세요.':'인증 앱의 6자리 인증번호를 입력해 주세요.';box.append(help);
      if(enrollment){const img=document.createElement('img');img.alt='인증 앱 등록 QR';img.width=220;img.src=enrollment.totp.qr_code;box.append(img);const key=document.createElement('p');key.textContent='직접 등록 키: '+enrollment.totp.secret;key.style.overflowWrap='anywhere';box.append(key);}
      const input=document.createElement('input');input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;input.pattern='[0-9]{6}';input.required=true;input.setAttribute('aria-label','6자리 인증번호');box.append(input);
      const status=document.createElement('p');status.setAttribute('role','status');box.append(status);
      const submit=document.createElement('button');submit.type='submit';submit.textContent='인증하고 계속';box.append(submit);
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';box.append(cancel);
      let closed=false;const finish=(err)=>{if(closed)return;closed=true;overlay.remove();err?reject(err):resolve();};
      cancel.onclick=()=>finish(Error('관리자 로그인에는 2단계 인증이 필요해요.'));
      box.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;try{
        const r=await db.auth.mfa.challengeAndVerify({factorId:factor.id,code:input.value.trim()});if(r.error)throw r.error;
        const check=await db.auth.mfa.getAuthenticatorAssuranceLevel();if(check.error||check.data?.currentLevel!=='aal2')throw Error('인증 상태를 확인하지 못했어요.');finish();
      }catch{status.textContent='인증번호가 맞지 않거나 만료됐어요. 새 번호로 다시 시도해 주세요.';input.value='';}finally{submit.disabled=false;}};
      overlay.append(box);document.body.append(overlay);input.focus();
    });
  }
`;
  html=html.replace('  function escapeHtml(s){',helper+'\n  function escapeHtml(s){');
  html=html.replaceAll("'+state.lightboxSrc+'","'+escapeHtml(maneeSafeImage(state.lightboxSrc))+'");
  html=html.replaceAll("'<img src=\"'+src+'", "'<img src=\"'+escapeHtml(maneeSafeImage(src))+'");
  html=html.replaceAll("data-delphoto=\"'+arrName+':'+idx+'", "data-delphoto=\"'+escapeHtml(arrName)+':'+idx+'");
  // Every browser call to these paid/privileged endpoints carries a verified-user token.
  html=html.replace(/(fetch\([^\n]*\/\.netlify\/functions\/(?:ask-app|read-receipt|send-push)[\s\S]*?headers:) \{ "Content-Type": "application\/json" \}/g,'$1 await maneeServiceHeaders()');
  html=html.replace('function notifyOwnerOfExpenseChange(', 'async function notifyOwnerOfExpenseChange(');
  html=html.replaceAll('JSON.stringify({ messages: state.askAppMessages, context })','JSON.stringify({ storeId:currentStoreId(), messages:state.askAppMessages.slice(-12), context })');
  html=html.replaceAll('JSON.stringify({ base64Data, mediaType })','JSON.stringify({ storeId:currentStoreId(), base64Data, mediaType })');
  const contextStart=html.indexOf('  async function buildAppContext(){');
  if(contextStart>=0){const end=html.indexOf('  function startVoiceInput(){',contextStart);if(end<0)throw Error('Missing context boundary');
    html=html.slice(0,contextStart)+`  async function buildAppContext(){
    // Only the selected store's totals are sent. No names, per-person wage, or other stores.
    const rows=state.salesReports||[], crew=state.crew||[];
    const nums=keys=>Object.fromEntries(keys.map(k=>[k,rows.reduce((sum,r)=>sum+(Number(r[k])||0),0)]));
    return {month:state.monthYear+'-'+pad(state.monthNum),today:bizToday(),crewCount:crew.length,
      salesTotals:nums(['totalSales','cashSales','cardSales','deliveryBaemin','deliveryCoupang','deliveryYogiyo'])};
  }
`+html.slice(end);
  }
  html=html.replace('  async function restoreManeeAdmin(expectedRole){','  async function restoreManeeAdmin(expectedRole){');
  // Authentication first; MFA before any admin data lookup. User enrollment stays reachable.
  const mfaAnchor='    const uid=userData.user.id;\n    const [{data:profile,error:profileError}';
  html=html.replace(mfaAnchor,"    await maneeRequireMfa();\n"+mfaAnchor);
  html=html.replace('      localDelete("my-role");','      maneeClearContractDrafts();\n      localDelete("my-role");');
  // Previously saved drafts expire after 24h; old records lacking a timestamp expire as well.
  html=html.replace("saved=item?.value?JSON.parse(item.value):null;","saved=item?.value?JSON.parse(item.value):null;if(saved&&(!Number.isFinite(Date.parse(saved.savedAt))||Date.now()-Date.parse(saved.savedAt)>86400000)){localDelete(r134ContractKey(id));saved=null;}");
  html=html.replaceAll('localStorage.removeItem(r134ContractKey(u.id))','localDelete(r134ContractKey(u.id))');
  html=html.replaceAll('https://cdn.jsdelivr.net/npm/xlsx-js-style/dist/','https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/');
  return html;
}
