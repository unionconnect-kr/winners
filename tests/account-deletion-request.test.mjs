import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();after(()=>db.close());
await db.exec('create role anon;create role authenticated;create role service_role;create schema private;');
await db.exec(readFileSync(new URL('../supabase/migrations/20261015123500_account_deletion_requests.sql',import.meta.url),'utf8'));

test('web requests stay private and duplicates do not reveal whether a user exists',async()=>{
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select public.manee_account_deletion_request($1,$2)',['missing','test@example.com']));
  await assert.rejects(()=>db.query('select * from private.account_deletion_requests'));
  await db.exec('reset role;set role authenticated');
  await assert.rejects(()=>db.query('select public.manee_account_deletion_request($1,$2)',['missing','test@example.com']));
  await db.exec('reset role;set role service_role');
  for(let i=0;i<2;i++)await db.query('select public.manee_account_deletion_request($1,$2)',['Missing','test@example.com']);
  await assert.rejects(()=>db.query('select * from private.account_deletion_requests'));
  await db.exec('reset role');
  const {rows}=await db.query('select username,contact,status from private.account_deletion_requests');
  assert.deepEqual(rows,[{username:'missing',contact:'test@example.com',status:'pending'}]);
});

test('invalid identifiers and contact data cannot reach the private queue',async()=>{
  await db.exec('set role service_role');
  for(const [username,contact] of [['x','hello@example.com'],['normal','<script>'],['normal','bad\nvalue']])
    await assert.rejects(()=>db.query('select public.manee_account_deletion_request($1,$2)',[username,contact]));
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from private.account_deletion_requests')).rows[0].n,1);
});

const source=readFileSync(new URL('../netlify/functions/account-deletion-request.js',import.meta.url),'utf8');
function handler({blocked=false,rpc}={}){
  const exports={};
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return rpc?.(name,args)??{data:name==='consume_auth_rate_limit'?true:null,error:null};}};
  const context={exports,Buffer,process:{env:{SUPABASE_URL:'https://bhwuuxcrzxespkjlmqxr.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'}},
    require:name=>name==='node:crypto'?{createHash}:name==='@supabase/supabase-js'?{createClient:()=>client}:name==='../../config/environments.json'?{production:{supabaseUrl:'https://bhwuuxcrzxespkjlmqxr.supabase.co'}}:{blockExternalService:()=>blocked}};
  vm.runInNewContext(source,context);
  return {call:body=>exports.handler({httpMethod:'POST',headers:{'x-nf-client-connection-ip':'192.0.2.1'},body:JSON.stringify(body)}),calls};
}
test('web handler rate limits before writing and returns no account lookup result',async()=>{
  const h=handler();const result=await h.call({username:'Owner123',contact:'test@example.com'});
  assert.equal(result.statusCode,200);
  assert.deepEqual(h.calls.map(x=>x.name),['consume_auth_rate_limit','consume_auth_rate_limit','manee_account_deletion_request']);
  assert.equal(h.calls[2].args.p_username,'owner123');
  assert.equal(h.calls[0].args.p_key_hash,createHash('sha256').update('192.0.2.1').digest('hex'));
  assert.ok(!result.body.includes('owner123'));
});
test('staging, rate limit and backend failure never claim successful submission',async()=>{
  const staging=handler({blocked:true});assert.equal((await staging.call({username:'owner123',contact:'test@example.com'})).statusCode,503);
  assert.equal(staging.calls.length,0);
  const limited=handler({rpc:name=>({data:name==='consume_auth_rate_limit'?false:null})});
  assert.equal((await limited.call({username:'owner123',contact:'test@example.com'})).statusCode,429);
  assert.equal(limited.calls.length,1);
  const failed=handler({rpc:name=>name==='manee_account_deletion_request'?{error:{message:'failure'}}:{data:true}});
  assert.equal((await failed.call({username:'owner123',contact:'test@example.com'})).statusCode,503);
  assert.equal((await handler().call({username:'x',contact:'test@example.com'})).statusCode,400);
});
