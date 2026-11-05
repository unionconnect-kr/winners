const enc=new TextEncoder();
export function phone(value){
  const s=typeof value==='string'?value.trim():'';
  if(!/^[+0-9 ()-]+$/.test(s))return '';
  const d=s.replace(/[^0-9]/g,'');
  return /^010[0-9]{8}$/.test(d)?'+82'+d.slice(1):/^8210[0-9]{8}$/.test(d)?'+'+d:'';
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function sha(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));}
export async function hmac(secret,value){
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value))));
}
export function otp(){let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294000000);return String(n%1000000).padStart(6,'0');}
export async function sendSms(config,to,code,transport=fetch){
  const date=new Date().toISOString(),salt=hex(crypto.getRandomValues(new Uint8Array(32)));
  const signature=await hmac(config.secret,date+salt);
  const r=await transport('https://api.solapi.com/messages/v4/send-many/detail',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`HMAC-SHA256 apiKey=${config.key}, date=${date}, salt=${salt}, signature=${signature}`},
    body:JSON.stringify({showMessageList:true,messages:[{to:'0'+to.slice(3),from:config.sender,type:'SMS',text:`[매니] 아이디 찾기 인증번호 [${code}]를 입력해 주세요. 3분 내 유효합니다.`}]}),
    signal:AbortSignal.timeout(12000)
  });
  const b=await r.json().catch(()=>null);
  return r.ok&&Array.isArray(b?.failedMessageList)&&b.failedMessageList.length===0&&Array.isArray(b.messageList)&&b.messageList.length===1&&String(b.messageList[0]?.statusCode)==='2000';
}
