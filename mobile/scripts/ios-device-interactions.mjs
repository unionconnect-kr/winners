export async function checkDeviceFeedback(page,showPage){
  const results=[],ok=(v,m)=>{if(!v)throw Error(m);};
  const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message.slice(0,300)});}};
  const show=(kind,id,extra={})=>page.evaluate(showPage,{name:'device-'+kind+'-'+id,kind,id,...extra});
  for(const role of ['owner','staff'])await check(role+' wrong-role login keeps the password screen and passes selected role to server',async()=>{
    await show('entry','password',{role});await page.evaluate(()=>{qa.originalFetch=window.fetch;qa.authWrites=0;qa.originalSetSession=qa.db.auth.setSession;qa.db.auth.setSession=async()=>{qa.authWrites++;return{};};window.fetch=async(url,init)=>{qa.loginPayload=JSON.parse(init.body);return{ok:false,status:403,json:async()=>({error:'role_mismatch',message:qa.loginPayload.role==='staff'?'사장님 계정이에요. 사장님 로그인을 선택해 주세요.':'직원 계정이에요. 직원·매니저 로그인을 선택해 주세요.'})};};qa.bindLandingEvents();});
    try{await page.locator('#store-login-username-input').fill('manee01');await page.locator('#store-login-password-input').fill('qwer1234');await page.locator('#store-login-submit-btn').click();await page.waitForFunction(()=>document.getElementById('login-message')?.textContent?.includes('계정이에요'));ok(await page.evaluate(role=>qa.loginPayload.role===role&&qa.authWrites===0&&qa.state.role==='landing',role),'Wrong role created a session');}
    finally{await page.evaluate(()=>{window.fetch=qa.originalFetch;qa.db.auth.setSession=qa.originalSetSession;});}
  });
  for(const [username,password,message] of [['abc12','qwer1234','아이디'],['abcdef','abcdefgh','영문과 숫자'],['abcdef','12345678','영문과 숫자']])await check('owner signup rejects '+username+'/'+password,async()=>{
    await show('owner-signup','2',{variant:'verified'});const r=await page.evaluate(({username,password})=>{const d=qa.ownerSignupDraft();d.username=username;d.password=d.confirm=password;qa.state.ownerRequestUsernameCheck={username,available:true};qa.ownerSignupNext();return{step:d.step,message:document.getElementById('toast').textContent};},{username,password});ok(r.step===2&&r.message.includes(message),'Invalid credentials advanced: '+r.message);
  });
  for(const variant of ['confirmed','other-user'])await check('staff cannot see deletion for '+variant+' expense',async()=>{await show('expense','expense-detail',{role:'staff',variant});ok(await page.locator('[data-r136=expense-delete]').count()===0,'Forbidden delete shown');});
  await check('staff expense deletion asks for confirmation and cancel sends nothing',async()=>{
    await show('expense','expense-detail',{role:'staff'});await page.evaluate(()=>{qa.deleteCalls=0;qa.db.rpc=async()=>{qa.deleteCalls++;return{};};qa.bindR136();});await page.locator('[data-r136=expense-delete]').click();ok(await page.locator('#confirm-ok').count()===1,'Confirmation missing');await page.locator('#confirm-cancel').click();ok(await page.evaluate(()=>qa.deleteCalls===0&&qa.r136().entries.length===1),'Cancel deleted an expense');
  });
  await check('staff deletion sends pinned revision and refreshes the list after success',async()=>{
    await show('expense','expense-detail',{role:'staff'});await page.evaluate(()=>{qa.deletePayload=null;qa.db.rpc=async(name,args)=>args.p_action==='delete'?(qa.deletePayload=args,{data:{id:'e',deleted:true}}):{data:{entries:[],vendors:[]}};qa.bindR136();});await page.locator('[data-r136=expense-delete]').click();await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!qa.r136().busy&&qa.r136().entries.length===0);ok(await page.evaluate(()=>qa.deletePayload.p_action==='delete'&&qa.deletePayload.p_payload.id==='e'&&qa.deletePayload.p_payload.revision===1),'Wrong deletion scope/revision');
  });
  await check('failed staff deletion retains the expense and displays server error',async()=>{
    await show('expense','expense-detail',{role:'staff'});await page.evaluate(()=>{qa.db.rpc=async()=>({error:{code:'42501',message:'사장님 확인 후에는 삭제할 수 없어요.'}});qa.bindR136();});await page.locator('[data-r136=expense-delete]').click();await page.locator('#confirm-ok').click();await page.waitForFunction(()=>!qa.r136().busy&&!!qa.r136().sheet?.error);ok(await page.evaluate(()=>qa.r136().entries.length===1),'Failed deletion removed row');ok((await page.locator('.r136-error').innerText()).includes('사장님 확인'),'Server error missing');
  });
  await check('account switch while confirmation is open prevents stale deletion',async()=>{
    await show('expense','expense-detail',{role:'staff'});await page.evaluate(()=>{qa.deleteCalls=0;qa.db.rpc=async()=>{qa.deleteCalls++;return{};};qa.bindR136();});await page.locator('[data-r136=expense-delete]').click();await page.evaluate(async()=>{const confirm=qa.state.pendingConfirm.onConfirm;qa.state.authProfile.user_id='other-account';await confirm();});ok(await page.evaluate(()=>qa.deleteCalls===0),'Old account deleted after account switch');
  });
  await check('repeated staff delete confirmation sends exactly one delete request',async()=>{
    await show('expense','expense-detail',{role:'staff'});await page.evaluate(()=>{qa.deleteCalls=0;qa.db.rpc=async(name,args)=>{if(args.p_action==='list')return{data:{entries:[],vendors:[]}};qa.deleteCalls++;await new Promise(r=>qa.releaseDelete=r);return{data:{id:'e',deleted:true}};};qa.bindR136();});await page.locator('[data-r136=expense-delete]').click();await page.evaluate(()=>{const fn=qa.state.pendingConfirm.onConfirm;void fn();void fn();});await page.waitForFunction(()=>qa.deleteCalls===1);ok(await page.evaluate(()=>qa.deleteCalls===1),'Duplicate deletion');await page.evaluate(()=>qa.releaseDelete());await page.waitForFunction(()=>!qa.r136().busy);
  });
  return results;
}
