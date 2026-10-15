// APNs consent belongs to one signed-in account and selected store.
// The service must be ready before iOS can display a permission prompt.
export function createIosPush({push, getContext, request, storage, timeoutMs=15000}) {
  let task=null;
  const key=c=>`manee-ios-push:${c.userId}:${c.storeId}`;
  const check=c=>{const n=getContext();if(n?.userId!==c.userId||n?.storeId!==c.storeId)throw Error('계정 또는 매장이 바뀌었어요. 다시 시도해 주세요.');};
  const enabled=c=>{try{return storage.getItem(key(c))==='1';}catch{return false;}};
  async function rpc(c,token,on){
    check(c);
    const {data,error}=await c.db.rpc('manee_ios_push',{p_store_id:on?c.storeId:null,p_token:token,p_enabled:on});
    if(error||data!==true)throw Error(on?'알림 연결을 저장하지 못했어요. 다시 시도해 주세요.':'알림 해제를 확인하지 못했어요.');
    check(c);
  }
  async function token(c){
    const listeners=[];let timer,resolve,reject;
    const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});ready.catch(()=>{});
    try{
      listeners.push(await push.addListener('registration',t=>{
        const value=typeof t.value==='string'?t.value.toLowerCase():'';
        if(!/^[0-9a-f]{32,512}$/.test(value)||value.length%2)reject(Error('알림 기기 정보를 확인하지 못했어요.'));
        else resolve(value);
      }));
      listeners.push(await push.addListener('registrationError',()=>reject(Error('아이폰 알림 등록에 실패했어요.'))));
      check(c);timer=setTimeout(()=>reject(Error('알림 연결 시간이 초과됐어요. 다시 시도해 주세요.')),timeoutMs);
      await push.register();return await ready;
    }finally{clearTimeout(timer);await Promise.allSettled(listeners.map(l=>l.remove()));}
  }
  async function run(action){
    const c=getContext();
    if(!c?.userId||!c.storeId||c.role!=='storeOwner')return {subscribed:false,message:'사장님 계정에서 알림을 연결해 주세요.'};
    if(action==='disable'){
      await rpc(c,null,false);storage.removeItem(key(c));
      await Promise.allSettled([push.unregister(),push.removeAllDeliveredNotifications()]);
      return {subscribed:false,ready:true,message:'이 기기의 아이폰 알림을 껐어요.'};
    }
    const status=await request(c,'ios-push',{action:'status'});check(c);
    if(!status?.ready)return {subscribed:false,ready:false,message:'아이폰 알림 연결을 준비하고 있어요. 앱 안의 알림은 계속 확인할 수 있어요.'};
    if(action==='test'){
      if(!enabled(c))throw Error('먼저 이 매장의 알림을 켜 주세요.');
      const result=await request(c,'ios-push',{action:'test'});check(c);
      if(!(result?.sent>0))throw Error('테스트 알림을 보내지 못했어요. 알림 연결을 확인해 주세요.');
      return {subscribed:true,ready:true,message:'테스트 알림을 보냈어요. 아이폰 알림창을 확인해 주세요.'};
    }
    if(action==='refresh'&&!enabled(c))return {subscribed:false,ready:true,message:''};
    let permission=await push.checkPermissions();check(c);
    if(action==='enable'&&permission.receive==='prompt'){permission=await push.requestPermissions();check(c);}
    if(permission.receive!=='granted'){
      if(enabled(c)){await rpc(c,null,false);storage.removeItem(key(c));}
      return {subscribed:false,ready:true,message:'아이폰 설정 > 알림 > 매니에서 알림을 허용해 주세요.'};
    }
    const value=await token(c);check(c);await rpc(c,value,true);storage.setItem(key(c),'1');
    return {subscribed:true,ready:true,message:action==='enable'?'아이폰 알림이 연결됐어요.':''};
  }
  return {
    action(action){
      if(!['enable','disable','refresh','test'].includes(action))return Promise.reject(Error('알림 요청을 확인해 주세요.'));
      if(task)return task;task=run(action).finally(()=>{task=null;});return task;
    },
    async prepareLogout(){
      if(task)await task.catch(()=>{});
      const c=getContext();
      // Offline cleanup must not trap a person in a signed-in account.
      // Server target selection checks the live auth session on each delivery.
      if(c?.userId){try{await rpc(c,null,false);}catch{}try{storage.removeItem(key(c));}catch{}}
      await Promise.allSettled([push.unregister(),push.removeAllDeliveredNotifications()]);
    },
  };
}
