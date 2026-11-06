export const PURCHASE_BINDING_MISMATCH_MESSAGE='기존 Google Play 구독을 현재 매니 아이디와 연결하지 못했어요. 이전에 구독한 매니 아이디를 확인하거나 지원팀에 문의해 주세요.';
const UNAVAILABLE='결제 서버 연결 또는 이용 권한을 확인하지 못했어요.';
async function isBindingMismatch(error){
 try{
  const response=error?.context;
  if(response?.status!==422||typeof response.clone!=='function')return false;
  const body=await response.clone().json();
  return body!==null&&typeof body==='object'&&!Array.isArray(body)&&body.error==='purchase_binding_mismatch';
 }catch{return false;}
}
// Only the exact server rejection gets a distinct code. Provider error bodies,
// tokens and transport messages are never forwarded to the subscription view.
export async function requestAndroidBilling(c,_name,body){
 let auth,authError;
 try{({data:auth,error:authError}=await c.db.auth.getSession());}
 catch{throw Error('다시 로그인해 주세요.');}
 if(authError||auth?.session?.user?.id!==c.userId)throw Error('다시 로그인해 주세요.');
 let result;
 try{result=await c.db.functions.invoke('manee-android-billing',{
  body:{...body,storeId:c.storeId},signal:AbortSignal.timeout(30000)});}
 catch{throw Error(UNAVAILABLE);}
 const {data,error}=result;
 if(error?.context?.status===409)throw Error('이 계정의 이전 결제 처리가 남아 있어요. 잠시 후 기존 구독 복원을 눌러 확인해 주세요.');
 if(error){
  if(await isBindingMismatch(error))throw Object.assign(Error(PURCHASE_BINDING_MISMATCH_MESSAGE),{code:'PURCHASE_BINDING_MISMATCH'});
  throw Error(UNAVAILABLE);
 }
 return data;
}
