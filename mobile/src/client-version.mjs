export function createVersionReporter({platform,getInfo,getContext,storage,uuid,now=Date.now}){
 let sent='',at=0,pending=false,installation;
 try{installation=storage.getItem('manee-installation-id');}catch{}
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(installation||'')){installation=uuid();try{storage.setItem('manee-installation-id',installation);}catch{}}
 return async function report(){
  let c;try{c=getContext();}catch{return;}if(!c?.userId||!c.db||pending)return;
  const user=c.userId;if(sent===user&&now()-at<300000)return;pending=true;
  try{const info=await getInfo();if(getContext()?.userId!==user)return;const r=await c.db.rpc('manee_report_client_version',{p_installation:installation,p_platform:platform,p_version:info.version,p_build:info.build});if(r.error)throw r.error;if(getContext()?.userId===user){sent=user;at=now();}}
  catch{}finally{pending=false;}
 };
}
export function installVersionReporter({App,native,platform}){
 let getContext=()=>null;
 const report=createVersionReporter({platform,getInfo:()=>App.getInfo(),getContext:()=>getContext(),storage:window.localStorage,uuid:()=>crypto.randomUUID()});
 const configure=native.configure,refresh=native.refresh;
 native.configure=function(get,...args){getContext=get;const out=configure.call(native,get,...args);void Promise.resolve().then(report);return out;};
 native.refresh=function(...args){void Promise.resolve().then(report);return refresh?.apply(native,args);};
 void App.addListener('appStateChange',({isActive})=>{if(isActive)void report();}).catch(()=>{});
}
