import {adaptIos139} from './adapt-ios139.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createSecureAuthStorage} from '../src/secure-auth-storage.mjs';import {secureAuthHtml} from './secure-auth-html.mjs';
const ref='abcdefghijklmnopqrst',key=`manee-${ref}-auth`;
function storage(initial={}){const map=new Map(Object.entries(initial));return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function fixture(initial={},options={}){
 const local=storage(initial),session=storage(options.session),data=new Map(Object.entries(options.vault||{})),calls=[];
 const vault={async get({key}){calls.push(['get',key]);if(options.readFails)throw Error();return {value:data.get(key)??null};},async set({key,value}){calls.push(['set',key]);if(options.writeFails)throw Error();await options.delay?.();data.set(key,value);},async remove({key}){calls.push(['remove',key]);if(options.removeFails)throw Error();data.delete(key);}};
 const secure=createSecureAuthStorage({vault,projectRef:ref,localStorage:local,sessionStorage:session});return {secure,local,session,data,calls,options};
}
test('migration moves only scoped secrets after successful native writes, and native data wins',async()=>{
 const h=fixture({[key]:'legacy',unrelated:'keep','manee-zyxwvutsrqponmlkjihg-auth':'other'});await h.secure.ready;
 assert.equal(h.local.getItem(key),null);assert.equal(h.data.get('localStorage:'+key),'legacy');assert.equal(h.local.getItem('unrelated'),'keep');assert.equal(h.local.getItem('manee-zyxwvutsrqponmlkjihg-auth'),'other');
 const n=fixture({[key]:'stale'},{vault:{['localStorage:'+key]:'current'}});await n.secure.ready;assert.equal(n.secure.area('localStorage').getItem(key),'current');assert.equal(n.local.getItem(key),null);
});
test('migration/native failure blocks startup and access, without discarding unmigrated tokens',async()=>{
 for(const o of [{writeFails:true},{readFails:true}]){const h=fixture({[key]:'existing'},o);await assert.rejects(h.secure.ready,/보안 저장소/);assert.equal(h.local.getItem(key),'existing');assert.throws(()=>h.secure.area('localStorage').getItem(key),/보안 저장소/);}
});
test('a queued refresh followed by logout cannot revive a persisted token',async()=>{
 const h=fixture();await h.secure.ready;let release;h.options.delay=()=>new Promise(r=>release=r);const a=h.secure.area('localStorage');a.setItem(key,'refresh');a.removeItem(key);await Promise.resolve();await Promise.resolve();release();await h.secure.flush();assert.equal(h.data.has('localStorage:'+key),false);assert.equal(a.getItem(key),null);assert.equal(h.local.getItem(key),null);
});
test('SDK surfaces write/removal failures and never falls back to plaintext',async()=>{
 for(const failure of ['writeFails','removeFails']){const h=fixture();await h.secure.ready;const sdk=h.secure.wrap(h.secure.area('localStorage'));h.options[failure]=true;await assert.rejects(failure==='writeFails'?sdk.setItem(key,'secret'):sdk.removeItem(key),/보안 저장소/);await assert.rejects(sdk.getItem(key),/보안 저장소/);assert.equal(h.local.getItem(key),null);}
});
test('real account adapter preserves remember choice, refresh, logout and late-refresh rejection',async()=>{
 for(const remember of [true,false]){
  const h=fixture();await h.secure.ready;let src=readFileSync(new URL('../../index.html',import.meta.url),'utf8');src=src.slice(src.indexOf('  const MANEE_REMEMBER_KEY'),src.indexOf('  const db ='));src=src.replace('return window[name];','return window.MANEE_SECURE_STORAGE.area(name);').replace('window[target].setItem(key, value)','maneeArea(target).setItem(key, value)');
  const window={localStorage:h.local,sessionStorage:h.session,MANEE_SECURE_STORAGE:h.secure};const a=vm.runInNewContext(`(()=>{const MANEE_LOCAL_PREFIX='fixture:',MANEE_IS_STAGING=true,MANEE_CONFIG={projectRef:'${ref}'};${src};return {storage:maneeAuthStorage,remember:maneeSetRememberLogin,arm:maneeArmLogin};})()`,{window,localStorage:h.local,Date,Map,JSON});
  a.remember(remember);a.arm('user-a');const sdk=h.secure.wrap(a.storage),slot=(remember?'localStorage:':'sessionStorage:')+key;await sdk.setItem(key,JSON.stringify({user:{id:'user-a'},access_token:'first'}));assert.ok(h.data.has(slot));assert.equal(h.local.getItem(key),null);assert.equal(h.session.getItem(key),null);
  await sdk.setItem(key,JSON.stringify({user:{id:'user-a'},access_token:'refreshed'}));assert.match(h.data.get(slot),/refreshed/);await sdk.removeItem(key);await sdk.setItem(key,JSON.stringify({user:{id:'user-a'},access_token:'late'}));assert.equal(h.data.has(slot),false);assert.equal(await sdk.getItem(key),null);
 }
});
test('social PKCE and pending records migrate without plaintext leftovers',async()=>{const a=`manee-${ref}-social-code-verifier`,b=`manee-${ref}-social-pending`,h=fixture({[a]:'verifier',[b]:'pending'});await h.secure.ready;for(const k of [a,b]){assert.equal(h.local.getItem(k),null);assert.ok(h.data.has('localStorage:'+k));}});
test('native HTML waits for secure initialization and OAuth persistence; drift fails the build',()=>{
 for(const p of ['../../index.html','../release139/assets/index.html']){let s=readFileSync(new URL(p,import.meta.url),'utf8');if(!s.includes('<script src="/native.js"></script>'))s=s.replace('<script src="/app-config.js"></script>','<script src="/app-config.js"></script>\n<script src="/native.js"></script>');const out=secureAuthHtml(s);assert.match(out,/await window.MANEE_SECURE_STORAGE.ready/);assert.match(out,/storage:window.MANEE_SECURE_STORAGE.wrap\(maneeAuthStorage\)/);assert.doesNotMatch(out,/window\[target\].setItem/);for(const m of out.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);if(p.includes('release139'))assert.match(out,/await window.MANEE_SECURE_STORAGE.flush\(\);return native\?native.open/);assert.throws(()=>secureAuthHtml(out),/anchor/);}
});

test('failed logout leaves a non-secret intent that prevents resurrection after restart',async()=>{
 const h=fixture();await h.secure.ready;const sdk=h.secure.wrap(h.secure.area('localStorage'));await sdk.setItem(key,'old-token');h.options.removeFails=true;await assert.rejects(sdk.removeItem(key));
 const marker='manee-secure-clear:localStorage:'+key;assert.equal(h.local.getItem(marker),'1');
 const reboot=fixture(Object.fromEntries(h.local.map),{vault:Object.fromEntries(h.data)});await reboot.secure.ready;
 assert.equal(reboot.secure.area('localStorage').getItem(key),null);assert.equal(reboot.data.has('localStorage:'+key),false);assert.equal(reboot.local.getItem(marker),null);
 const stillFailed=fixture({[marker]:'1'},{vault:{['localStorage:'+key]:'old-token'},removeFails:true});await assert.rejects(stillFailed.secure.ready);assert.throws(()=>stillFailed.secure.area('localStorage').getItem(key));
});

test('the adapted device-feedback OAuth context survives secure storage wrapping',()=>{
 const html=secureAuthHtml(adaptIos139(readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8')));
 assert.match(html,/open:async\(url,context\)=>\{await window.MANEE_SECURE_STORAGE.flush\(\);return native\?native.open\(url,context\)/);
});
