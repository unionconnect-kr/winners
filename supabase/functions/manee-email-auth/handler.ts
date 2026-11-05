import {verificationEmail,recoveryEmail} from './templates.mjs'

type Deps={createClient:(...args:any[])=>any;env:(name:string)=>string|undefined;fetch:typeof fetch;crypto:Crypto}
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, apikey, authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}
const messages:Record<string,string>={invalid_email:'이메일 주소를 확인해 주세요.',email_taken:'이미 사용 중인 이메일입니다. 다른 이메일을 입력해 주세요.',invalid_session:'다시 로그인해 주세요.',rate_limited:'잠시 후 다시 시도해 주세요. 인증메일은 1분 간격으로 보낼 수 있어요.',invalid_link:'인증 링크가 만료됐거나 이미 사용됐어요. 매니에서 다시 요청해 주세요.'}
export function normalizeEmail(value:unknown){const s=String(value??'').trim().toLowerCase(),local=s.split('@')[0];return s.length<=254&&local.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&!local.includes('..')&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)?s:null}
function envKey(deps:Deps,name:string,legacy:string){try{const p=JSON.parse(deps.env(name)||'{}');if(p.default)return String(p.default)}catch{}return deps.env(legacy)||''}
function sessionId(token:string){try{const s=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;return /^[0-9a-f-]{36}$/i.test(s)?s:null}catch{return null}}
export function createEmailHandler(deps:Deps){
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
 const fail=(error:string,status=400)=>reply({ok:false,error,message:messages[error]||'이메일 서비스를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.'},status)
 const hash=async(s:string)=>Array.from(new Uint8Array(await deps.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('')
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers})
  if(req.method==='GET')return reply({ok:true,service:'매니 이메일 인증',message:'메일에 있는 매니 이메일 인증하기 버튼을 눌러 주세요.'})
  if(req.method!=='POST')return fail('method_not_allowed',405)
  try{
   const url=deps.env('SUPABASE_URL')||''
   const secret=envKey(deps,'SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY')
   if(!['https://bhwuuxcrzxespkjlmqxr.supabase.co','https://obpkzecgswnfuyhwvncd.supabase.co'].includes(url)||!secret)return fail('server_not_configured',503)
   const raw=await req.text();if(raw.length>4096)return fail('request_too_large',413)
   let body:any;try{body=JSON.parse(raw)}catch{return fail('invalid_request')}
   if(!body||typeof body!=='object'||Array.isArray(body))return fail('invalid_request')
   const action=String(body.action||'')
   if(!['check','status','request','verify','recovery_request','recover_preview','recover_reset'].includes(action))return fail('invalid_action')
   const admin=deps.createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
   const service=async(a:string,p:any)=>{const{data,error}=await admin.rpc('manee_email_service',{p_action:a,p_payload:p});if(error||!data)throw Error('service_unavailable');return data}
   const limited=async(name:string,value:string,seconds:number,max:number)=>{const{data,error}=await admin.rpc('consume_auth_rate_limit',{p_action:name,p_key_hash:await hash(value),p_window_seconds:seconds,p_max_attempts:max});if(error||typeof data!=='boolean')throw Error('rate_unavailable');return data}
   const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'
   if(!await limited('email_auth_ip',ip,3600,160))return fail('rate_limited',429)
   if(['verify','recover_preview','recover_reset'].includes(action)){
    const token=String(body.token||'');if(!/^[0-9a-f]{64}$/.test(token))return fail('invalid_link')
    const kh=await hash(token)
    if(action==='recover_reset'){
     const password=String(body.new_password||'')
     if(password.length<8||new TextEncoder().encode(password).length>72||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({ok:false,error:'invalid_password',message:'새 비밀번호는 8자 이상, 영문과 숫자를 모두 포함해 주세요. (72바이트 이하)'},400)
     const consumed=await service('recover_consume',{token_hash:kh})
     if(!consumed.ok)return fail(consumed.error)
     // Once consumed, a network error never restores a reset token.
     const{data,error}=await admin.auth.admin.updateUserById(consumed.user_id,{password})
     if(error?.code==='weak_password')return reply({ok:false,error:'weak_password',message:'보안상 사용할 수 없는 비밀번호예요. 다른 비밀번호를 준비하고 이메일 찾기를 다시 요청해 주세요.'},400)
     if(error||data?.user?.id!==consumed.user_id)return reply({ok:false,error:'recovery_uncertain',message:'비밀번호 변경 결과를 확인하지 못했어요. 새 비밀번호로 로그인해 보시고, 안 되면 이메일 찾기를 다시 요청해 주세요.'},503)
     const completed=await service('recover_complete',consumed)
     if(!completed.ok)return fail('recovery_uncertain',503)
     return reply({ok:true})
    }
    const result=await service(action==='verify'?'verify':'recover_preview',{token_hash:kh})
    return result.ok?reply(result):fail(result.error)
   }
   const api=req.headers.get('apikey')||''
   const publicKeys=[envKey(deps,'SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),deps.env('SUPABASE_ANON_KEY')||''].filter(Boolean)
   if(!publicKeys.includes(api))return fail('invalid_application_key',403)
   let uid:string|null=null,sid:string|null=null
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
   if(token){const{data,error}=await admin.auth.getUser(token);if(!error&&data?.user){uid=data.user.id;sid=sessionId(token)}}
   if(['request','status'].includes(action)&&(!uid||!sid))return fail('invalid_session',401)
   if(action==='status'){
    const result=await service('status',{user_id:uid,session_id:sid})
    return result.ok?reply(result):fail(result.error,401)
   }
   const email=normalizeEmail(body.email);if(!email)return fail('invalid_email')
   if(action==='check'){
    if(!await limited('email_check',ip,60,40))return fail('rate_limited',429)
    return reply(await service('check',{email,user_id:uid}))
   }
   const recover=action==='recovery_request'
   if(!await limited(recover?'email_recovery_addr':'email_verify_user',recover?email:String(uid),3600,8))return fail('rate_limited',429)
   const resendKey=deps.env('RESEND_API_KEY')||'';if(!resendKey)return fail('email_not_configured',503)
   const productionOrigin='https://winners-staffapp.netlify.app'
   const configuredOrigin=url==='https://bhwuuxcrzxespkjlmqxr.supabase.co'?productionOrigin:deps.env('MANEE_EMAIL_PUBLIC_ORIGIN')||''
   let siteOrigin:string
   try{
    const site=new URL(configuredOrigin)
    if(site.protocol!=='https:'||site.username||site.password||site.search||site.hash||!['','/'].includes(site.pathname))throw Error('invalid_email_origin')
    siteOrigin=site.origin
    if(url==='https://obpkzecgswnfuyhwvncd.supabase.co'&&siteOrigin===productionOrigin)throw Error('staging_email_origin_is_production')
   }catch{return fail('email_not_configured',503)}
   const bytes=new Uint8Array(32);deps.crypto.getRandomValues(bytes);const proof=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('')
   const prepared=await service(recover?'recover_prepare':'prepare',{email,user_id:uid,session_id:sid,token_hash:await hash(proof)})
   if(!prepared.ok)return fail(prepared.error,prepared.error==='email_taken'?409:prepared.error==='rate_limited'?429:400)
   if(prepared.already_verified)return reply({...prepared,sent:false})
   const generic={ok:true,message:'인증된 이메일과 일치하는 계정이 있으면 안내 메일을 보내드려요.'}
   if(recover&&!prepared.deliver)return reply(generic)
   // SUPABASE_URL is server configuration. The request Host cannot redirect the token.
   const link=`${siteOrigin}/email-confirmation.html#token=${proof}${recover?'&mode=recover':''}`
   const mail=recover?recoveryEmail(email,link):verificationEmail(email,link)
   try{
    const sent=await deps.fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json','Idempotency-Key':`manee-email-${prepared.challenge_id}`},body:JSON.stringify(mail),signal:AbortSignal.timeout(15000)})
    if(!sent.ok){await service('delivery_failed',{challenge_id:prepared.challenge_id});return fail('email_delivery_failed',503)}
    const result=await service('sent',{challenge_id:prepared.challenge_id});if(!result.ok)return fail('email_delivery_uncertain',503)
   }catch{try{await service('delivery_failed',{challenge_id:prepared.challenge_id})}catch{}return fail('email_delivery_failed',503)}
   return recover?reply(generic):reply({ok:true,email:prepared.email||null,pending_email:email,sent:true,retry_after:60,email_verified:prepared.email_verified===true})
  }catch{return fail('email_unavailable',503)}
 }
}
