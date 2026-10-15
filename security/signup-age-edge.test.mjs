import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Script,createContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const slugs=['manee-signup','manee-staff-signup','manee-franchise-signup'];
const defaults={username:'synthetic_signup',password:'synthetic-password',display_name:'Synthetic',store_name:'Synthetic store',franchise_name:'Synthetic franchise',age_14_plus_confirmed:true};
function harness(slug,options={}){
 const calls=[],logs=[];let handler;
 const ok=data=>({data,error:null});
 const admin={
  rpc:async(name,args)=>{calls.push({name,args});if(name==='consume_auth_rate_limit')return ok(true);
   if(name==='is_manee_username_reserved')return options.lookupError?{error:{message:'private-provider-detail'}}:ok(false);
   if(name.startsWith('bootstrap_'))return options.bootstrapError?{error:{code:'23505',message:'private-provider-detail'}}:ok('new-business-id');
   throw Error('Unexpected RPC');},
  from(table){calls.push({table});const q={select(){return q},eq(){return q},async maybeSingle(){
   if(table==='platform_admins')return ok(options.notAdmin?null:{user_id:'verified-actor'});
   assert.equal(table,'profiles');return options.recoveryError?{error:{code:'offline'}}:ok(options.recoveredProfile||null);
  }};return q;},
  auth:{getUser:async()=>{calls.push({name:'getUser'});return options.badSession?{error:{message:'private-provider-detail'},data:{user:null}}:ok({user:{id:'verified-actor'}})},admin:{
   createUser:async args=>{calls.push({name:'createUser',args});return ok({user:{id:'new-auth-id'}})},
   deleteUser:async id=>{calls.push({name:'deleteUser',id});return options.cleanupError?{error:{message:'private-provider-detail'}}:ok({})},
  }},
 };
 const client={auth:{signInWithPassword:async()=>ok({session:null})}};
 const env={SUPABASE_URL:'https://offline.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-secret',SUPABASE_ANON_KEY:'synthetic-public'};
 const context=createContext({Request,Response,TextEncoder,crypto:webcrypto,Date,console:{error:(...a)=>logs.push(a),log:(...a)=>logs.push(a)},
  createClient:(_,key)=>key===env.SUPABASE_SERVICE_ROLE_KEY?admin:client,
  Deno:{env:{get:name=>env[name]},serve:fn=>handler=fn}});
 const source=readFileSync(new URL('../supabase/functions/'+slug+'/index.ts',import.meta.url),'utf8');
 const code=source.replace(/^import \{ createClient \} from 'npm:@supabase\/supabase-js@2\.116\.0'\r?\n/,'');
 assert.notEqual(code,source);new Script(stripTypeScriptTypes(code)).runInContext(context);
 return {calls,logs,async run(body=defaults){const response=await handler(new Request('https://offline.invalid',{method:'POST',headers:{apikey:'synthetic-public',authorization:'Bearer synthetic-session','Content-Type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};}};
}
for(const slug of slugs){
 test(slug+' requires literal true before rate limiting, Auth creation or bootstrap',async()=>{
  for(const value of [undefined,false,'true',1,null,{},[]]){
   const h=harness(slug);const result=await h.run({...defaults,age_14_plus_confirmed:value});
   assert.equal(result.status,400);assert.equal(result.body.error,'age_confirmation_required');
   assert.equal(h.calls.some(c=>c.name==='createUser'||c.name?.startsWith('bootstrap_')||c.name==='consume_auth_rate_limit'),false);
  }
 });
 test(slug+' rejects null, arrays and primitive JSON without creating an identity',async()=>{
  for(const body of [null,[],true,42,'invalid']){const h=harness(slug);assert.equal((await h.run(body)).status,400);assert.equal(h.calls.some(c=>c.name==='createUser'),false);}
 });
 test(slug+' records a server timestamp/version without trusting supplied Auth metadata',async()=>{
  const h=harness(slug);const before=Date.now();const result=await h.run({...defaults,app_metadata:{role:'admin',manee_age_confirmation_at:'1900-01-01'},birth_date:'1900-01-01'});
  assert.equal(result.status,201);assert.equal(result.cache,'no-store');
  const created=h.calls.find(c=>c.name==='createUser');const meta=created.args.app_metadata;
  assert.equal(meta.manee_age_14_plus_confirmed,true);assert.equal(meta.manee_age_confirmation_version,'14plus-2026-10-16');
  assert.equal(meta.manee_age_confirmation_source,slug==='manee-franchise-signup'?'admin-attestation':'self-attestation');
  assert.ok(Date.parse(meta.manee_age_confirmation_at)>=before&&Date.parse(meta.manee_age_confirmation_at)<=Date.now());
  assert.equal(Object.hasOwn(meta,'role'),false);assert.equal(Object.hasOwn(created.args,'birth_date'),false);
  assert.equal(JSON.stringify(result.body).includes(defaults.password),false);
  if(slug==='manee-signup')assert.equal(h.calls.find(c=>c.name==='bootstrap_owner_account').args.p_franchise_code,null);
 });
}
test('franchise age confirmation does not replace the verified platform-admin boundary',async()=>{
 for(const options of [{notAdmin:true},{badSession:true}]){const h=harness('manee-franchise-signup',options);assert.ok([401,403].includes((await h.run()).status));assert.equal(h.calls.some(c=>c.name==='createUser'),false);}
});
test('owner bootstrap uncertainty never deletes an identity whose profile may have committed',async()=>{
 for(const options of [{recoveredProfile:{user_id:'new-auth-id'}},{recoveryError:true}]){
  const h=harness('manee-signup',{bootstrapError:true,...options});const r=await h.run();assert.equal(r.status,503);assert.equal(r.body.error,'signup_result_uncertain');assert.equal(h.calls.some(c=>c.name==='deleteUser'),false);
 }
 const known=harness('manee-signup',{bootstrapError:true});assert.equal((await known.run()).status,409);assert.deepEqual(known.calls.filter(c=>c.name==='deleteUser').map(c=>c.id),['new-auth-id']);
 const failed=harness('manee-signup',{bootstrapError:true,cleanupError:true});assert.equal((await failed.run()).body.error,'signup_cleanup_failed');
});
test('franchise failures expose no provider details or actor identity in responses/logs',async()=>{
 const h=harness('manee-franchise-signup',{lookupError:true});const r=await h.run();assert.equal(r.status,503);
 assert.doesNotMatch(JSON.stringify([r.body,h.logs]),/private-provider-detail|verified-actor|synthetic-password|synthetic-secret/);
 assert.equal(Object.hasOwn(r.body,'debug'),false);
});
