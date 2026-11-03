export const STAGING_URL='https://obpkzecgswnfuyhwvncd.supabase.co';
export const enc=new TextEncoder();
export function username(value:unknown){return String(value??'').normalize('NFKC').trim().toLowerCase();}
export function phone(value:unknown){
 const s=String(value??'').trim(); if(!/^[+0-9 ()-]+$/.test(s))return '';
 const d=s.replace(/[^0-9]/g,'');return /^010[0-9]{8}$/.test(d)?'+82'+d.slice(1):/^8210[0-9]{8}$/.test(d)?'+'+d:'';
}
export function validPassword(value:unknown){return typeof value==='string'&&value.length>=8&&enc.encode(value).length<=72;}
export function validNewPassword(value:unknown){return validPassword(value)&&/[A-Za-z]/.test(value as string)&&/[0-9]/.test(value as string);}
export function hex(bytes:Uint8Array){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
export async function sha(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));}
export async function hmac(key:string,value:string){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(value))));}
export function otp(){let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);return String(n%1000000).padStart(6,'0');}
export function proof(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function sendSms(config:{key:string,secret:string,sender:string},to:string,code:string,transport:typeof fetch=fetch){
 const date=new Date().toISOString(),salt=proof(),signature=await hmac(config.secret,date+salt);
 const response=await transport('https://api.solapi.com/messages/v4/send-many/detail',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`HMAC-SHA256 apiKey=${config.key}, date=${date}, salt=${salt}, signature=${signature}`},
  body:JSON.stringify({showMessageList:true,messages:[{to:'0'+to.slice(3),from:config.sender,type:'SMS',text:`[매니] 인증번호 [${code}]를 입력해 주세요. 3분 내 유효합니다.`}]}),signal:AbortSignal.timeout(12000)
 });
 const data=await response.json().catch(()=>null);
 return response.ok&&Array.isArray(data?.failedMessageList)&&data.failedMessageList.length===0&&
  Array.isArray(data?.messageList)&&data.messageList.length===1&&String(data.messageList[0]?.statusCode)==='2000';
}
