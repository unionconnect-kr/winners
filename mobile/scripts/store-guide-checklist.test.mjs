import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {webcrypto} from 'node:crypto';
import {installStoreGuideChecklist} from './store-guide-checklist-html.mjs';
import {adaptIos139} from './adapt-ios139.mjs';
const source=readFileSync(new URL('../release139/assets/index.html',import.meta.url),'utf8');
const feature=readFileSync(new URL('../src/store-guide-checklist.js',import.meta.url),'utf8');
for(const platform of ['android','ios'])test(platform+' update retains valid app scripts and server-backed photo setting',()=>{
 const html=installStoreGuideChecklist(adaptIos139(source,platform));
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 assert.match(html,/photoRequired:d.photoRequired===true/);assert.match(html,/name="photoRequired"/);
 assert.match(html,/photo_id/);assert.match(html,/manee_checklist_photos/);assert.doesNotMatch(html,/매장 아이콘 선택|emoji-options/);
});
function setup(role='storeOwner'){
 const dom=new JSDOM('<div id="app"></div>');let top=null;let alive=true;const writes=[],uploads=[],removals=[];const u={key:'owner-store',stack:[],busy:false};
 const sid='20000000-0000-4000-8000-000000000001',uid='10000000-0000-4000-8000-000000000001';
 const state={role,items:{morning:[{items:[{id:'a',label:'주방 마감 청소',photoRequired:true}]}]},checks:{},checkMeta:{},checklistViewDate:'2026-11-24'};
 const c=vm.createContext({state,URL,crypto:webcrypto,atob,Uint8Array,AbortSignal,document:dom.window.document,FileReader:dom.window.FileReader,window:{},
 sector4:()=>u,s4Top:()=>top,s4Open:(type,id)=>{top={type,id};},s4Close:()=>{top=null;},render(){},showToast(){},
 currentStoreId:()=>sid,bizToday:()=> '2026-11-24',businessContextGuard:()=>()=>alive,
 renderSector4Checklist:()=>'',renderSector4More:()=>'',renderSector4Sheet:()=>'',bindSector4(){},
 s4Escape:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),s4Hint:s=>'<p>'+s+'</p>',s4Button:(s,a,id)=>'<button data-s4="'+a+'" data-id="'+id+'">'+s+'</button>',
 s4CheckWrite:async(a,p)=>{writes.push({a,p});return true;},callAuthChecklist:async(a,s,d,p)=>{writes.push({a,s,d,p});return {photo:{id:p.photo_id,reviewed_at:'server-time'}};},
 db:{rpc:async(name,args)=>name==='manee_checklist_prepare_photos'?{data:{photos:Array.from({length:args.p_count},(_,i)=>{const id='30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),base=sid+'/2026-11-24/'+uid+'/'+id;return {id,object_path:base+'/image.jpg',thumbnail_path:base+'/thumb.jpg'};})}}:{data:{id:args.p_photo_id,image_type:'image/jpeg',image_base64:'AAAA',item_label:'청소'}},functions:{invoke:async(_,args)=>{uploads.push(args.body.image,args.body.thumbnail);return {data:{ok:true,photo_id:'30000000-0000-4000-8000-'+String(args.body.index+1).padStart(12,'0')}};}},storage:{from:()=>({remove:async paths=>{removals.push(paths);return {};}})}},compressImage:async()=> 'data:image/jpeg;base64,AAAA',
 });vm.runInContext(feature,c);
 return {c,state,writes,uploads,removals,u,get top(){return top;},setTop:t=>{top=t;},setAlive:v=>{alive=v;},dom};
}
test('owner guide opens ten verified videos directly and keeps the channel as a separate link',()=>{
 const h=setup();h.setTop({type:'owner-guide'});let html=h.c.renderSector4Sheet();assert.match(html,/사장님 사용법/);assert.doesNotMatch(html,/공식 채널에서 찾기|월말 리포트 확인/);
 const doc=new JSDOM(html).window.document,links=[...doc.querySelectorAll('a.m157-guide-row')];
 assert.equal(links.length,10);assert.equal(new Set(links.map(a=>new URL(a.href).searchParams.get('v'))).size,10);
 assert.equal(new URL(links.find(a=>a.textContent.includes('회원가입')).href).searchParams.get('v'),'7nJ2DIiPXlE');
 assert.equal(new URL(links.find(a=>a.textContent.includes('매출 등록')).href).searchParams.get('v'),'Fo5V3UtxXAo');
 h.c.window.MANEE_GUIDE_LINKS={sales:'https://youtube.com/@manee-official'};assert.match(h.c.renderSector4Sheet(),/Fo5V3UtxXAo/);
 h.state.role='staff';html=h.c.renderSector4Sheet();assert.doesNotMatch(html,/m157-guide-row/);
 assert.equal(h.c.m157GuideUrl('javascript:alert(1)'),null);assert.equal(h.c.m157GuideUrl('https://youtube.com.attacker.example/watch?v=x'),null);
});
test('photo completion cannot write with an empty draft, and preserves a rejected draft',async()=>{
 const h=setup();const t={type:'check-photo-upload',id:'a'};h.setTop(t);await h.c.m157SubmitPhoto();assert.equal(h.writes.length,0);assert.match(t.error,/사진/);
 t.photos=[{type:'image/jpeg',data:'AAAA',thumbnail:'AAAA'}];h.c.s4CheckWrite=async()=>false;await h.c.m157SubmitPhoto();assert.equal(h.top,t);assert.equal(t.photos[0].data,'AAAA');assert.equal(h.removals.length,1);
});
test('required photo and expected templates are sent atomically with completion',async()=>{
 const h=setup();h.setTop({type:'check-photo-upload',id:'a',photos:Array.from({length:4},()=>({type:'image/jpeg',data:'AAAA',thumbnail:'AAAA'}))});await h.c.m157SubmitPhoto();assert.equal(h.writes.length,1);assert.equal(h.uploads.length,8);assert.equal(h.writes[0].p.item_id,'a');assert.equal(h.writes[0].p.photos.length,4);assert.equal(h.writes[0].p.photo,undefined);assert.equal(JSON.stringify(h.writes[0].p.expected_items),JSON.stringify(h.state.items));assert.equal(h.top,null);
});
test('staff cannot mark owner review, while owner review records the server response',async()=>{
 const h=setup('staff');h.setTop({type:'check-photo-view',id:'photo'});await h.c.m157ReviewPhoto('photo');assert.equal(h.writes.length,0);
 h.state.role='storeOwner';await h.c.m157ReviewPhoto('photo');assert.equal(h.writes[0].a,'review-photo');assert.equal(h.state.checklistPhotoMeta.photo.reviewed_at,'server-time');
});
test('late photo responses cannot enter another account or store',async()=>{
 const h=setup();let resolve;h.c.db.rpc=()=>new Promise(r=>{resolve=r;});const pending=h.c.m157OpenPhoto('photo');const original=h.top;h.setAlive(false);h.setTop({type:'other'});resolve({data:{id:'photo',image_type:'image/jpeg',image_base64:'AAAA'}});await pending;assert.equal(original.photo,null);assert.equal(h.top.type,'other');
});
test('five photos are rejected before any reservation or upload',async()=>{const h=setup();h.setTop({type:'check-photo-upload',id:'a',photos:Array.from({length:5},()=>({data:'AAAA'}))});await h.c.m157SubmitPhoto();assert.equal(h.uploads.length,0);assert.equal(h.writes.length,0);assert.match(h.top.error,/1~4장/);});
test('upload failure preserves selected pictures and never completes the task',async()=>{const h=setup();const t={type:'check-photo-upload',id:'a',photos:[{data:'AAAA',thumbnail:'AAAA'}]};h.setTop(t);h.c.db.functions.invoke=async()=>({error:Error('offline')});await h.c.m157SubmitPhoto();assert.equal(h.writes.length,0);assert.equal(h.top,t);assert.equal(t.photos.length,1);assert.equal(h.removals.length,1);assert.equal(h.u.busy,false);});
test('HTML image sources allow bounded images only',()=>{const h=setup();assert.equal(h.c.m157Image('image/svg+xml','AAAA'),null);assert.equal(h.c.m157Image('image/jpeg','<svg>'),null);assert.equal(h.c.m157Image('image/jpeg','AAAA'),'data:image/jpeg;base64,AAAA');});
