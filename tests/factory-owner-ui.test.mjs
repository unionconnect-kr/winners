import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import factory from '../factory-client.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fn(name){const start=html.indexOf('  function '+name+'(');assert.ok(start>=0);return html.slice(start,html.indexOf('\n  }',start)+4);}
function render(data){const context={state:{section:'factory',store:'선택 매장'},ownerSubHeader:title=>'<h2>'+title+'</h2>',currentStoreId:()=> 'store-a',getManeeFactory:()=>({snapshot:()=>data}),window:{ManeeFactory:factory},escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};vm.createContext(context);vm.runInContext(fn('renderManeeFactory'),context);return context.renderManeeFactory();}
test('actual owner More screen routes to Factory inside the same app',()=>{
 const context={state:{section:'more'},ownerRouteButton:(label,route)=>`<button data-owner-route="${route}">${label}</button>`,navIcon:()=>'',MANEE_STAFF_AUTH_ENABLED:true};vm.createContext(context);vm.runInContext(fn('renderOwnerMore'),context);
 assert.match(context.renderOwnerMore(),/data-owner-route="factory"/);
});
test('active logistics UI exposes a free button and no recipe checkout',()=>{
 const result=render({phase:'ready',active:true,recipes:[{id:'r',title:'메뉴',summary:'안내'}]});
 assert.match(result,/무료로 보기/);assert.match(result,/추가 구독료 없이 무료/);assert.doesNotMatch(result,/구독하기|결제하기|9,900|9900/);
});
test('non-logistics, loading, failed and empty states do not offer a recipe bypass',()=>{
 for(const data of [{phase:'ready',active:false,recipes:[{id:'r',title:'메뉴'}]},{phase:'loading'},{phase:'error'}])assert.doesNotMatch(render(data),/data-mf-recipe=/);
 assert.match(render({phase:'ready',active:false,recipes:[]}),/등록된 레시피가 아직 없어요/);
});
test('server recipe text is escaped and executable video links are omitted',()=>{
 const result=render({phase:'ready',active:true,recipes:[],recipe:{id:'r',title:'<script>bad</script>',instructions:'<img onerror=bad>','video_url':'javascript:alert(1)'}});
 assert.match(result,/&lt;script>/);assert.doesNotMatch(result,/<script>|<img|javascript:/);
});
