import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../mobile/node_modules/esbuild/lib/main.js';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import fs from 'node:fs';
import {verificationEmail,escapeHtml} from '../supabase/functions/manee-email-auth/templates.mjs';
const compiled=await build({entryPoints:[new URL('../supabase/functions/manee-email-auth/handler.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
const {createEmailHandler,normalizeEmail}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const uid='00000000-0000-4000-8000-000000000001';
const jwt='a.'+Buffer.from(JSON.stringify({session_id:uid})).toString('base64url')+'.c';
function fixture({rpcResult={},sendStatus=200,userValid=true,configured=true,staging=false,weakPassword=false,stagingOrigin=''}={}){
 const calls=[],mails=[];let updates=0;
 const env={SUPABASE_URL:staging?'https://obpkzecgswnfuyhwvncd.supabase.co':'https://bhwuuxcrzxespkjlmqxr.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key',SUPABASE_ANON_KEY:'public-key',RESEND_API_KEY:configured?'mail-secret':'',MANEE_EMAIL_PUBLIC_ORIGIN:stagingOrigin};
 const client={auth:{getUser:async()=>({data:userValid?{user:{id:uid}}:{},error:userValid?null:{}}),admin:{updateUserById:async(id,body)=>{updates++;assert.ok(body.password);return weakPassword?{data:{},error:{code:'weak_password'}}:{data:{user:{id}},error:null}}}},rpc:async(name,p)=>{calls.push({name,...p});if(name==='consume_auth_rate_limit')return{data:true};const action=p.p_action;if(rpcResult[action])return{data:typeof rpcResult[action]==='function'?rpcResult[action](p.p_payload):rpcResult[action]};const defaults={check:{ok:true,available:true},prepare:{ok:true,challenge_id:uid,email:null,email_verified:false},status:{ok:true,email:null,pending_email:'a@example.com',email_verified:false},sent:{ok:true},delivery_failed:{ok:true},verify:{ok:true,email:'a@example.com',email_verified:true},recover_prepare:{ok:true,deliver:true,challenge_id:uid,user_id:uid},recover_preview:{ok:true,username:'testuser'},recover_consume:{ok:true,user_id:uid,challenge_id:uid,operation_id:uid},recover_complete:{ok:true}};return{data:defaults[action]}}};
 const handler=createEmailHandler({createClient:()=>client,env:n=>env[n],crypto:webcrypto,fetch:async(url,args)=>{assert.equal(url,'https://api.resend.com/emails');mails.push({headers:args.headers,body:JSON.parse(args.body)});return new Response('{}',{status:sendStatus})}});
 const request=(body,auth=true,api=true)=>handler(new Request('https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-email-auth',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+jwt}:{}),...(api?{apikey:'public-key'}:{})},body:JSON.stringify(body)}));
 return{handler,request,calls,mails,get updates(){return updates}};
}
test('email normalization rejects control/header injection and invalid local part',()=>{
 assert.equal(normalizeEmail(' A+test@EXAMPLE.COM '),'a+test@example.com');
 for(const s of ['a@example.com\r\nBcc:x@y.com','<a>@example.com','x@@example.com','a..b@example.com','.a@example.com','a.@example.com','a'.repeat(65)+'@example.com'])assert.equal(normalizeEmail(s),null);
});
test('only authenticated live actors may request or query status; untrusted body user_id is ignored',async()=>{
 const f=fixture();assert.equal((await f.request({action:'request',email:'a@example.com'},false)).status,401);
 assert.equal((await f.request({action:'status'},false)).status,401);
 assert.equal((await f.request({action:'check',email:'a@example.com'},false,false)).status,403);
 const r=await f.request({action:'request',email:'a@example.com',user_id:'forged'});assert.equal(r.status,200);
 const p=f.calls.find(c=>c.p_action==='prepare').p_payload;assert.equal(p.user_id,uid);assert.equal(p.session_id,uid);assert.notEqual(p.user_id,'forged');
});
test('verification mail uses final MANEE copy, a safe fixed landing origin, hashed token and idempotency',async()=>{
 const f=fixture();await f.request({action:'request',email:'a@example.com',redirect_to:'https://evil.invalid'});
 assert.equal(f.mails.length,1);const m=f.mails[0];assert.equal(m.body.from,'매니(MANEE) <no-reply@auth.manee.co.kr>');assert.equal(m.body.subject,'[매니] 이메일 인증을 완료해 주세요');
 assert.match(m.body.text,/인증이 완료되면 위 이메일 주소가 회원정보에 자동 반영됩니다/);assert.match(m.body.text,/‘확인했어요’/);assert.match(m.body.text,/본인이 요청하지 않았다면/);
 assert.match(m.body.text,/https:\/\/winners-staffapp.netlify.app\/email-confirmation.html#token=[0-9a-f]{64}/);assert.doesNotMatch(m.body.text,/evil.invalid/);
 const raw=m.body.text.match(/#token=([0-9a-f]{64})/)[1];const stored=f.calls.find(c=>c.p_action==='prepare').p_payload.token_hash;assert.notEqual(raw,stored);assert.match(stored,/^[0-9a-f]{64}$/);
 assert.equal(m.headers['Idempotency-Key'],'manee-email-'+uid);assert.equal(f.calls.at(-1).p_action,'sent');
});
test('delivery failure invalidates its link and does not report sent',async()=>{
 const f=fixture({sendStatus:422});const r=await f.request({action:'request',email:'a@example.com'});assert.equal(r.status,503);assert.equal(f.calls.at(-1).p_action,'delivery_failed');assert.equal(f.calls.some(c=>c.p_action==='sent'),false);
 const noConfig=fixture({configured:false});assert.equal((await noConfig.request({action:'request',email:'a@example.com'})).status,503);assert.equal(noConfig.calls.some(c=>c.p_action==='prepare'),false);
});
test('duplicate email and server throttles are surfaced accurately',async()=>{
 const f=fixture({rpcResult:{prepare:{ok:false,error:'email_taken'}}});assert.equal((await f.request({action:'request',email:'a@example.com'})).status,409);assert.equal(f.mails.length,0);
 const g=fixture({rpcResult:{prepare:{ok:false,error:'rate_limited'}}});assert.equal((await g.request({action:'request',email:'a@example.com'})).status,429);
});
test('public verification uses only the possession token; GET and malformed token do not consume',async()=>{
 const f=fixture();const g=await f.handler(new Request('https://example.invalid/?token=secret'));assert.match(g.headers.get('Content-Type'),/application\/json/);assert.equal(f.calls.length,0);
 assert.equal((await f.request({action:'verify',token:'bad'},false,false)).status,400);assert.equal(f.calls.length,1);
 assert.equal((await f.request({action:'verify',token:'1'.repeat(64),user_id:'forged'},false,false)).status,200);assert.equal(f.calls.at(-1).p_action,'verify');assert.deepEqual(Object.keys(f.calls.at(-1).p_payload),['token_hash']);
});
test('recovery only emails known verified addresses and always returns a generic receipt',async()=>{
 const absent=fixture({rpcResult:{recover_prepare:{ok:true,deliver:false}}});const a=await absent.request({action:'recovery_request',email:'a@example.com'},false);assert.equal(absent.mails.length,0);
 const known=fixture();const b=await known.request({action:'recovery_request',email:'a@example.com'},false);assert.equal(known.mails.length,1);assert.deepEqual(await a.json(),await b.json());assert.match(known.mails[0].body.text,/#token=[0-9a-f]{64}&mode=recover/);
});
test('password reset validates before consuming and completes only after Auth update',async()=>{
 const f=fixture();const token='2'.repeat(64);assert.equal((await f.request({action:'recover_reset',token,new_password:'weak'},false,false)).status,400);assert.equal(f.calls.some(c=>c.p_action==='recover_consume'),false);
 assert.equal((await f.request({action:'recover_reset',token,new_password:'Secure123!' },false,false)).status,200);assert.equal(f.updates,1);assert.deepEqual(f.calls.filter(c=>c.name==='manee_email_service').map(c=>c.p_action),['recover_consume','recover_complete']);
});
test('static landing auto-confirms fragment token without leaking query or referrer and shows a real completion',async()=>{
 const html=fs.readFileSync(new URL('../email-confirmation.html',import.meta.url),'utf8'),script=fs.readFileSync(new URL('../email-confirmation.js',import.meta.url),'utf8');
 assert.match(html,/<script src="\/email-confirmation.js" defer>/);assert.match(html,/name="referrer" content="no-referrer"/);assert.doesNotMatch(html,/<script[^>]*>[^<]+<\/script>/);
 const elements=Object.fromEntries(['message','reset','username'].map(id=>[id,{textContent:'',hidden:true,addEventListener(){}}]));let replaced=false;const calls=[];
 const context={window:{MANEE_CONFIG:{environment:'production',projectRef:'bhwuuxcrzxespkjlmqxr',supabaseUrl:'https://bhwuuxcrzxespkjlmqxr.supabase.co'}},document:{getElementById:id=>elements[id]},location:{hash:'#token='+'3'.repeat(64),pathname:'/email-confirmation.html'},history:{replaceState(){replaced=true}},URLSearchParams,fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body),replaced});return{ok:true,json:async()=>({ok:true,email:'a@example.com'})}}};
 vm.runInNewContext(script,context);await new Promise(r=>setImmediate(r));assert.equal(calls[0].replaced,true);assert.equal(calls[0].body.action,'verify');assert.equal(calls[0].url,'https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-email-auth');assert.match(elements.message.textContent,/인증이 완료되었습니다/);
});
test('staging mail delivery requires an explicit separate site; page routing uses only trusted app-config',async()=>{
 const closed=fixture({staging:true});assert.equal((await closed.request({action:'request',email:'a@example.com'})).status,503);assert.equal(closed.mails.length,0);assert.equal(closed.calls.some(c=>c.p_action==='prepare'),false);
 const prodLeak=fixture({staging:true,stagingOrigin:'https://winners-staffapp.netlify.app'});assert.equal((await prodLeak.request({action:'request',email:'a@example.com'})).status,503);
 const f=fixture({staging:true,stagingOrigin:'https://manee-email-staging.netlify.app'});assert.equal((await f.request({action:'request',email:'a@example.com'})).status,200);assert.match(f.mails[0].body.text,/https:\/\/manee-email-staging.netlify.app\/email-confirmation.html#token=/);
 const script=fs.readFileSync(new URL('../email-confirmation.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../email-confirmation.html',import.meta.url),'utf8');
 assert.doesNotMatch(script,/bhwuuxcrzxespkjlmqxr|obpkzecgswnfuyhwvncd/);assert.doesNotMatch(html,/supabase.co|Content-Security-Policy/);assert.match(html,/<script src="\/app-config.js"><\/script><script src="\/email-confirmation.js" defer>/);
 const elements=Object.fromEntries(['message','reset','username'].map(id=>[id,{textContent:'',hidden:true,addEventListener(){}}]));const calls=[];
 const context={window:{MANEE_CONFIG:{environment:'staging',projectRef:'obpkzecgswnfuyhwvncd',supabaseUrl:'https://obpkzecgswnfuyhwvncd.supabase.co'}},document:{getElementById:id=>elements[id]},location:{hash:'#token='+'4'.repeat(64)+'&env=production&endpoint=https://evil.invalid',pathname:'/email-confirmation.html'},history:{replaceState(){}},URLSearchParams,fetch:async(url)=>{calls.push(url);return{ok:true,json:async()=>({ok:true})}}};
 vm.runInNewContext(script,context);await new Promise(r=>setImmediate(r));assert.equal(calls[0],'https://obpkzecgswnfuyhwvncd.supabase.co/functions/v1/manee-email-auth');
 const invalid={...context,window:{MANEE_CONFIG:{environment:'staging',projectRef:'obpkzecgswnfuyhwvncd',supabaseUrl:'https://bhwuuxcrzxespkjlmqxr.supabase.co'}}};calls.length=0;vm.runInNewContext(script,invalid);await new Promise(r=>setImmediate(r));assert.equal(calls.length,0);assert.match(elements.message.textContent,/설정을 확인할 수 없어요/);
});
test('definitively rejected weak passwords get a precise message without token restoration',async()=>{
 const f=fixture({weakPassword:true});const r=await f.request({action:'recover_reset',token:'5'.repeat(64),new_password:'Common123!'},false,false);assert.equal(r.status,400);const b=await r.json();assert.equal(b.error,'weak_password');assert.match(b.message,/이메일 찾기를 다시 요청/);assert.equal(f.calls.some(c=>c.p_action==='recover_complete'),false);
});
test('email template escapes address and href content',()=>{assert.equal(escapeHtml('<>&"\''),'&lt;&gt;&amp;&quot;&#39;');const t=verificationEmail('<img onerror=alert(1)>','https://safe.invalid/?x="<');assert.doesNotMatch(t.html,/<img/);assert.match(t.html,/&lt;img/);assert.match(t.html,/&quot;&lt;/);});
