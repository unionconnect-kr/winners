import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {hardenUi} from '../scripts/harden-ui.mjs';
import {securityHeaders} from '../scripts/security-headers.mjs';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const guardSource=read('../netlify/functions/lib/request-security.cjs');
const uuid='00000000-0000-4000-8000-000000000001';
function guardFixture(options={}){
 let auth=0,rpc=0;
 const module={exports:{}};
 vm.runInNewContext(guardSource,{module,Buffer,URL,require:name=>{
  if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getUser:async()=>{auth++;return options.invalid?{error:Error('invalid')}:{data:{user:{id:uuid}}};}},rpc:async()=>{rpc++;return options.failed?{error:Error('offline')}:{data:{allowed:!options.deny,code:options.deny}};}})};
  if(name.includes('environments'))return {production:{projectRef:'fixture',supabaseUrl:'https://fixture.invalid',publishableKey:'fixture'}};
  return {environment:'production',projectRef:'fixture'};
 }});
 return {guard:module.exports,counts:()=>({auth,rpc})};
}
test('service authentication fails closed for absent, invalid, revoked, unentitled and over-quota users',async()=>{
 for(const [options,headers,status] of [[{}, {},401],[{invalid:true},{Authorization:'Bearer fixture'},401],[{deny:'permission'},{Authorization:'Bearer fixture'},403],[{deny:'subscription'},{Authorization:'Bearer fixture'},403],[{deny:'rate_limit'},{Authorization:'Bearer fixture'},429],[{failed:true},{Authorization:'Bearer fixture'},403]]){
  const h=guardFixture(options),r=await h.guard.authorize({headers},{storeId:uuid},'ask-app');assert.equal(r.response.statusCode,status);
  if(status===401&&Object.keys(headers).length===0)assert.deepEqual(h.counts(),{auth:0,rpc:0});
 }
 const h=guardFixture();assert.equal((await h.guard.authorize({headers:{authorization:'Bearer fixture'}},{storeId:uuid},'read-receipt')).userId,uuid);
});
test('all external service handlers reject anonymous calls before provider or service-role use',async()=>{
 for(const name of ['ask-app','read-receipt','send-push']){
  const h=guardFixture(),exports={};let calls=0;
  vm.runInNewContext(read('../netlify/functions/'+name+'.js'),{exports,Buffer,AbortSignal,process:{env:{}},fetch:()=>{calls++;throw Error('unexpected external call');},require:n=>{
   if(n.includes('request-security'))return h.guard;if(n.includes('manee-environment'))return {blockExternalService:()=>null};
   if(n==='web-push')return {setVapidDetails:()=>{calls++;},sendNotification:()=>{calls++;}};
   if(n==='@supabase/supabase-js')return {createClient:()=>{calls++;throw Error('unexpected privileged query');}};
   if(n.includes('push-vapid'))return {getVapidDetails:()=>{calls++;}};
   if(n.includes('validated-image'))return {normalizeReceiptImage:()=>{calls++;throw Error('unexpected decode');}};throw Error(n);
  }});
  const r=await exports.handler({httpMethod:'POST',headers:{},body:JSON.stringify({storeId:uuid,title:'test',messages:[{role:'user',content:'test'}],context:{}})});
  assert.equal(r.statusCode,401,name);assert.equal(calls,0,name);
 }
});
test('request caps, file signatures and AI field allowlist reject unsafe input',()=>{
 const {guard:g}=guardFixture();assert.throws(()=>g.parseBody({body:'x'.repeat(20)},10));assert.throws(()=>g.parseBody({body:'[]'},100));
 assert.equal(g.imageMatches(Buffer.from('<svg onload="bad()">').toString('base64'),'image/png'),false);
 assert.equal(g.imageMatches('a'.repeat(4194308),'image/jpeg'),false);
 const ctx=g.minimizedContext({today:'2026-11-04',crew:[{name:'PRIVATE',wage:999}],allStoresCrew:[{}],crewCount:3,salesTotals:{totalSales:100,name:'PRIVATE'}});
 assert.equal(JSON.stringify(ctx).includes('PRIVATE'),false);assert.equal(ctx.salesTotals.totalSales,100);
});
test('both mobile and web escape attribute delimiters and reject executable image sources',()=>{
 for(const file of ['../index.html',...(existsSync(new URL('../mobile/release139/assets/index.html',import.meta.url))?['../mobile/release139/assets/index.html']:[])]){
  const html=hardenUi(read(file));for(const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(s[1]);
  const f=name=>{const start=html.indexOf('  function '+name+'('),end=html.indexOf('\n  }',start)+4;assert.ok(start>=0&&end>start);return html.slice(start,end);};
  const ctx=vm.createContext({URL,location:{origin:'https://app.invalid'}});vm.runInContext(f('escapeHtml')+'\n'+f('maneeSafeImage'),ctx);
  assert.equal(ctx.maneeSafeImage('x" onerror="alert(1)'), '');assert.equal(ctx.maneeSafeImage('javascript:alert(1)'), '');assert.equal(ctx.maneeSafeImage('data:image/svg+xml;base64,YQ=='),'');
  assert.equal(ctx.escapeHtml('"\'<>'), '&quot;&#39;&lt;&gt;');assert.equal(ctx.maneeSafeImage('https://example.invalid/a.png'),'https://example.invalid/a.png');
  assert.ok(html.includes('escapeHtml(maneeSafeImage(src))'));assert.ok(html.includes('escapeHtml(maneeSafeImage(state.lightboxSrc))'));
  assert.ok(!html.includes('ctx.allStoresCrew ='));assert.ok(html.includes('await maneeServiceHeaders()'));
 }
});
test('CSP hashes inline application code without allowing inline event handlers',()=>{
 const h=securityHeaders('<script>const test=1;</script>',{supabaseUrl:'https://fixture.supabase.co'});
 assert.match(h,/script-src-attr 'none'/);assert.match(h,/sha256-/);assert.match(h,/frame-ancestors 'none'/);assert.doesNotMatch(h,/script-src[^;\n]*unsafe-inline/);
});
test('database migration revokes dead sessions, isolates stores and atomically caps service requests',async()=>{
 const db=new PGlite(),sid='00000000-0000-4000-8000-000000000002',store='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004';
 try{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create table public.profiles(user_id uuid,status text);create table public.stores(id uuid,archived_at timestamptz);
 create table public.crew(id uuid,store_id uuid,is_manager boolean,resign_date date,name text);
 create table public.store_memberships(user_id uuid,store_id uuid,crew_id uuid,role text,status text);
 create table public.platform_admins(user_id uuid,status text,role text);
 create function private.has_sales_access(uuid) returns boolean language sql as $$select coalesce(current_setting('test.sales',true),'yes')='yes'$$;
 create function private.manee_store_write_entitled(uuid) returns boolean language sql as $$select coalesce(current_setting('test.entitled',true),'yes')<>'no'$$;
 insert into public.profiles values('${uuid}','active');insert into public.stores values('${store}',null),('${other}',null);
 insert into public.store_memberships values('${uuid}','${store}',null,'owner','active');
 insert into public.crew values(gen_random_uuid(),'${store}',false,null,'Own'),(gen_random_uuid(),'${other}',false,null,'Other');
 insert into auth.sessions values('${sid}','${uuid}',null);select set_config('test.uid','${uuid}',false),set_config('test.session','${sid}',false);
 grant usage on schema public,private,auth to authenticated;grant select on public.crew to authenticated;alter table public.crew enable row level security;
 `);
 await db.exec(read('../supabase/migrations/20261103183650_security_service_gate_and_session_guard.sql'));
 await db.exec(read('../security/reviewed-service-gate.sql'));
 await db.exec('create policy crew_read on public.crew to authenticated using(private.has_store_membership(store_id));set role authenticated;');
 assert.equal((await db.query('select count(*)::int n from public.crew')).rows[0].n,1);
 const call=async(target=store)=>(await db.query(`select public.manee_authorize_service($1,'ask-app') result`,[target])).rows[0].result;
 assert.equal((await call(other)).code,'permission');
 for(let n=0;n<5;n++)assert.equal((await call()).allowed,true);
 assert.equal((await call()).code,'rate_limit');
 await db.exec("select set_config('test.sales','no',false)");assert.equal((await db.query("select public.manee_authorize_service($1,'read-receipt') result",[store])).rows[0].result.code,'permission');
 await db.exec("select set_config('test.entitled','no',false)");assert.equal((await call()).code,'subscription');
 await db.exec('reset role;delete from auth.sessions;set role authenticated;');
 assert.equal((await db.query('select count(*)::int n from public.crew')).rows[0].n,0);assert.equal((await call()).code,'session');
 await db.exec('reset role');
 // Rehearse the exact metadata rollback before any production auth-policy replacement.
 await db.exec(read('../security/security-session-rollback.sql'));
 await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int n from public.crew')).rows[0].n,1,'rollback restores prior access semantics');
 await db.exec('reset role');
 await db.exec(read('../supabase/migrations/20261103183650_security_service_gate_and_session_guard.sql'));
 await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int n from public.crew')).rows[0].n,0,'reapply restores revocation protection');
 await db.exec('reset role');await db.exec(read('../supabase/migrations/20261103183807_security_attachment_validation.sql'));
 assert.equal((await db.query("select private.manee_safe_file('PHN2Zz5hdHRhY2s8L3N2Zz4=','image/png',5242880) ok")).rows[0].ok,false);
 }finally{await db.close();}
});
