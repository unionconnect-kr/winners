const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds=new Set(['test','attendance_in','attendance_out','reservation_created','reservation_cancelled','reservation_upcoming','reservation_due','report_closed','monthly_costs']);
export function notificationDestination(data){
 if(!data||!uuid.test(data.storeId||'')||!kinds.has(data.kind))return null;
 return {storeId:data.storeId,kind:data.kind,
  ...(uuid.test(data.eventId||'')?{eventId:data.eventId}:{}),
  ...(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.monthKey||'')?{monthKey:data.monthKey}:{}),
  ...(/^\d{4}-\d{2}-\d{2}$/.test(data.eventDate||'')?{eventDate:data.eventDate}:{})};
}
// Cold-start actions are retained by Capacitor until the listener is attached.
// Only routing identifiers are held in memory; no notification body or credential is stored.
export function createNotificationNavigation({push,getContext,open,now=Date.now,allowedRoles=['storeOwner']}){
 let pending=null,busy=false,listener=null,generation=0,lastHandled=null;
 const context=()=>{try{return getContext();}catch{return null;}};
 async function flush(){
  if(busy||!pending)return;
  const c=context();
  if(now()-pending.receivedAt>10*60*1000){pending=null;return;}
  if(!c?.ready||!c.userId)return;
  const item=pending,version=generation;
  if((item.userId&&item.userId!==c.userId)||!allowedRoles.includes(c.role)||(c.role==='staff'&&item.destination.kind!=='test')){pending=null;return;}
  item.userId=c.userId;busy=true;
  const isCurrent=()=>version===generation&&context()?.userId===item.userId;
  try{
   const result=await open(item.destination,isCurrent);
   if(result!=='pending'&&pending===item){pending=null;lastHandled=item.key;}
  }catch{if(pending===item)pending=null;}
  finally{busy=false;if(pending&&pending!==item)void flush();}
 }
 function receive(action){
  if(action?.actionId!=='tap')return;
  const destination=notificationDestination(action.notification?.data);if(!destination)return;
  const key=destination.eventId||action.notification?.id;
  if(key&&(key===lastHandled||key===pending?.key))return;
  generation++;
  pending={destination,key,userId:context()?.userId||null,receivedAt:now()};
  void flush();
 }
 return {
  start(){if(!listener)listener=push.addListener('pushNotificationActionPerformed',receive).catch(e=>{listener=null;throw e;});return listener;},
  flush,
  clear(){generation++;pending=null;lastHandled=null;},
 };
}
