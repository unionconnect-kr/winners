const bucket='manee-checklist-evidence';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
function jpeg(value,max){
 if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('INVALID_IMAGE');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(bytes.length>max||bytes.length<5||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('INVALID_IMAGE');
 return bytes;
}
async function body(req){
 const reader=req.body?.getReader();if(!reader)throw Error('INVALID_REQUEST');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw Error('PAYLOAD_TOO_LARGE');}chunks.push(value);}
 const result=new Uint8Array(size);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder().decode(result));
}
export function createPhotoUploadHandler({createClient,env}){
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  const authorization=req.headers.get('authorization');if(!/^Bearer [^\s]+$/i.test(authorization||''))return json({code:'AUTH_REQUIRED'},401);
  try{
   const data=await body(req);
   if(!Number.isInteger(data.index)||data.index<0||data.index>=data.count||!Number.isInteger(data.count)||data.count<1||data.count>4)throw Error('INVALID_REQUEST');
   const image=jpeg(data.image,358400),thumbnail=jpeg(data.thumbnail,32768);
   const user=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const identity=await user.auth.getUser();if(identity.error||!identity.data?.user?.id)return json({code:'AUTH_REQUIRED'},401);
   // RPC enforces live session, membership, entitlement, business date, template CAS,
   // per-request photo count and the per-user outstanding upload limit.
   const result=await user.rpc('manee_checklist_prepare_photos',{p_store_id:data.store_id,p_date:data.date,p_item_id:data.item_id,p_count:data.count,p_request_id:data.request_id,p_expected_items:data.expected_items});
   if(result.error)return json({code:result.error.code||'UPLOAD_DENIED',message:result.error.code==='P4402'?'매니 구독을 확인해 주세요.':'사진 첨부 권한과 점검 항목을 다시 확인해 주세요.'},403);
   const ticket=result.data?.photos?.[data.index],uuid=/^[0-9a-f-]{36}$/;
   const base=data.store_id+'/'+data.date+'/'+identity.data.user.id+'/'+ticket?.id;
   if(!ticket||!uuid.test(ticket.id)||ticket.object_path!==base+'/image.jpg'||ticket.thumbnail_path!==base+'/thumb.jpg')throw Error('INVALID_RESERVATION');
   const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
   for(const [path,bytes] of [[ticket.object_path,image],[ticket.thumbnail_path,thumbnail]]){
    const uploaded=await service.storage.from(bucket).upload(path,bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
    if(uploaded.error)throw Error('UPLOAD_FAILED');
   }
   return json({ok:true,photo_id:ticket.id});
  }catch(error){return json({code:['INVALID_IMAGE','INVALID_REQUEST','PAYLOAD_TOO_LARGE'].includes(error.message)?error.message:'UPLOAD_FAILED',message:'사진을 저장하지 못했어요. 입력 내용은 유지됩니다. 다시 시도해 주세요.'},400);}
 };
}
