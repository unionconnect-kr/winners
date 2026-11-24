// Public version policy contains no account data. Store publication precedes activation.
export const UPDATE_NOTES=[
 '사장님 사용법을 기능별 영상으로 바로 확인하고, 체크리스트 업무를 쉽게 추가할 수 있어요.',
 '체크리스트 완료 사진을 최대 4장까지 첨부하고, 작은 사진을 눌러 크게 확인할 수 있어요.',
 '시급·월급 설정과 월별 급여 정산을 구분하고, ⓘ에서 용도를 확인할 수 있어요.',
 '직원 급여·근무조건과 매니저 권한 설정을 분리했어요.'
];
export function compareVersions(a,b){
 if(!/^\d+(\.\d+){0,3}$/.test(a||'')||!/^\d+(\.\d+){0,3}$/.test(b||''))throw Error('Invalid version');
 const x=a.split('.').map(Number),y=b.split('.').map(Number);
 if([...x,...y].some(n=>!Number.isSafeInteger(n)))throw Error('Invalid version');
 for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;
}
export function validUpdatePolicy(p,platform){
 try{
  if(!p||p.platform!==platform||typeof p.enabled!=='boolean')return null;
  for(const k of ['minimum_version','minimum_build','available_version','available_build'])compareVersions(p[k],'0');
  if(p.enabled&&(!Number.isFinite(Date.parse(p.published_at))||Date.parse(p.published_at)>Date.now()||
   compareVersions(p.available_version,p.minimum_version)<0||compareVersions(p.available_version,p.minimum_version)===0&&compareVersions(p.available_build,p.minimum_build)<0))return null;
  return {platform,enabled:p.enabled,minimum_version:p.minimum_version,minimum_build:p.minimum_build,available_version:p.available_version,available_build:p.available_build,published_at:p.published_at||null};
 }catch{return null;}
}
export function needsUpdate(info,p){return p?.enabled===true&&(compareVersions(info.version,p.minimum_version)<0||compareVersions(info.version,p.minimum_version)===0&&compareVersions(info.build,p.minimum_build)<0);}
export function createUpdateController({platform,getInfo,readPolicy,storage,showChecking,showRequired,showNotes,hide,openStore}){
 let info=null,pending=null,blocked=false,notesOpen=false,policy=null;
 const cacheKey='manee-public-update-policy:'+platform;
 const ackKey=()=> 'manee-update-ack:'+platform+':'+info.version+':'+info.build;
 const get=k=>{try{return storage.getItem(k);}catch{return null;}},set=(k,v)=>{try{storage.setItem(k,v);}catch{}};
 try{policy=validUpdatePolicy(JSON.parse(get(cacheKey)),platform);}catch{}
 async function check(){
  if(pending)return pending;
  pending=(async()=>{
   try{if(!info){showChecking?.();info=await getInfo();compareVersions(info.version,'0');compareVersions(info.build,'0');}}catch{info=null;hide();return;}
   // Apply an already-known mandatory policy immediately, including while offline.
   const present=()=>{
    blocked=needsUpdate(info,policy);
    if(blocked){notesOpen=false;showRequired({version:policy.available_version,update:openStore,retry:check});}
    else if(get(ackKey())!=='yes'){
     if(!notesOpen){hide();notesOpen=true;showNotes({version:info.version,notes:UPDATE_NOTES,confirm(){set(ackKey(),'yes');notesOpen=false;hide();}});}
    }else{notesOpen=false;hide();}
   };
   if(needsUpdate(info,policy))present();
   try{const fresh=validUpdatePolicy(await readPolicy(platform),platform);if(!fresh)throw Error('Invalid policy');policy=fresh;set(cacheKey,JSON.stringify(fresh));}catch{}
   present();
  })().finally(()=>{pending=null;});return pending;
 }
 return {check,isBlocked:()=>blocked};
}
export function installNativeUpdatePolicy({App,native,platform,store}){
 let context=()=>null,dialog=null,controller,lastCheck=0;
 const originalConfigure=native.configure,originalRefresh=native.refresh;
 function hide(){if(dialog){dialog.dataset.dismissible='yes';dialog.close?.();dialog.remove();dialog=null;}}
 function show({title,message,notes,buttons,mandatory}){
  hide();dialog=document.createElement('dialog');const sheet=dialog;
  sheet.id='manee-update-dialog';sheet.setAttribute('aria-labelledby','manee-update-title');
  sheet.style.cssText='box-sizing:border-box;width:calc(100% - 40px);max-width:430px;padding:26px;border:0;border-radius:22px;color:#203e33;line-height:1.7;background:#fff;box-shadow:0 12px 60px #14372d44';
  const h=document.createElement('h2');h.id='manee-update-title';h.textContent=title;h.style.cssText='font-size:22px;margin:0 0 14px';sheet.append(h);
  const p=document.createElement('p');p.textContent=message;sheet.append(p);
  if(notes){const list=document.createElement('ul');list.style.paddingLeft='20px';for(const text of notes){const li=document.createElement('li');li.textContent=text;li.style.marginBottom='10px';list.append(li);}sheet.append(list);}
  const status=document.createElement('p');status.setAttribute('role','status');sheet.append(status);
  for(const [label,action,secondary] of buttons){const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='display:block;width:100%;min-height:48px;margin-top:10px;border:1px solid #c8dbcf;border-radius:12px;font:inherit;font-weight:700;background:'+(secondary?'#fff':'#16774c')+';color:'+(secondary?'#215039':'#fff');button.onclick=async()=>{button.disabled=true;status.textContent='';try{await action();}catch{status.textContent='스토어를 열지 못했어요. 연결 상태를 확인하고 다시 눌러 주세요.';}finally{button.disabled=false;}};sheet.append(button);}
  sheet.addEventListener('cancel',e=>e.preventDefault());
  sheet.addEventListener('close',()=>{if(sheet.dataset.dismissible!=='yes'&&sheet.isConnected){if(typeof sheet.showModal==='function')sheet.showModal();else sheet.open=true;}});
  document.body.append(sheet);if(typeof sheet.showModal==='function')sheet.showModal();else{sheet.open=true;sheet.style.cssText+=';position:fixed;inset:0;margin:auto;z-index:2147483647;max-height:90vh;overflow:auto';}
 }
 controller=createUpdateController({platform,storage:window.localStorage,getInfo:()=>App.getInfo(),
  showChecking:()=>show({title:'앱 버전을 확인하고 있어요',message:'잠시만 기다려 주세요.',buttons:[]}),
  async readPolicy(p){const db=context()?.db;if(!db)throw Error('Not configured');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{const r=await db.from('manee_mobile_update_policy').select('platform,enabled,minimum_version,minimum_build,available_version,available_build,published_at').eq('platform',p).single().abortSignal(controller.signal);if(r.error)throw r.error;return r.data;}finally{clearTimeout(timer);}},
  openStore:()=>store.openStore(),hide,
  showRequired:({version,update,retry})=>show({title:'업데이트가 필요해요',message:'매니 '+version+' 버전으로 업데이트한 뒤 이용해 주세요.',buttons:[['업데이트하기',update],['업데이트 확인',retry,true]],mandatory:true}),
  showNotes:({version,notes,confirm})=>show({title:'매니가 업데이트됐어요',message:version+' 버전의 변경 내용을 확인해 주세요.',notes,buttons:[['확인',confirm]]})
 });
 const check=(force=false)=>{let db;try{db=context()?.db;}catch{return;}if(!db||!document.body||!force&&Date.now()-lastCheck<30000)return;lastCheck=Date.now();void controller.check();};
 // The compiled app configures the bridge before its `let state` initializer.
 // Read that closure only after the current application script has completed.
 native.configure=function(get,...args){context=get;originalConfigure.call(native,get,...args);void Promise.resolve().then(()=>check(true));};
 native.refresh=function(...args){check();return originalRefresh?.apply(native,args);};
 void App.addListener('appStateChange',({isActive})=>{if(isActive)check(true);}).catch(()=>{});
 document.addEventListener('DOMContentLoaded',()=>check(true),{once:true});
 for(const event of ['click','submit','keydown','pointerdown'])document.addEventListener(event,e=>{if(dialog?.isConnected&&!dialog.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
 return controller;
}
