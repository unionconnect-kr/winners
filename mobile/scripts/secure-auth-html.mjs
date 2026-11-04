// Native-only transformation: web storage and archived release assets stay intact.
export function secureAuthHtml(source){
 let html=source;
 const once=(before,after)=>{if(html.split(before).length!==2)throw Error('Review secure-auth anchor: '+before.slice(0,80));html=html.replace(before,after);};
 once('<script src="/native.js"></script>','<script src="/native.js"></script>\n<script src="/secure-auth.js"></script>');
 once('(function(){\n  // BEGIN MANEE_ENVIRONMENT','(async function(){\n  try { await window.MANEE_SECURE_STORAGE.ready; } catch { document.getElementById("app").textContent="기기 보안 저장소를 열지 못했어요. 앱을 다시 실행해 주세요."; return; }\n  // BEGIN MANEE_ENVIRONMENT');
 once('function maneeArea(name){ try{ return window[name]; }catch(e){ return null; } }','function maneeArea(name){ return window.MANEE_SECURE_STORAGE.area(name); }');
 once('window[target].setItem(key, value)','maneeArea(target).setItem(key, value)');
 once('storage:maneeAuthStorage','storage:window.MANEE_SECURE_STORAGE.wrap(maneeAuthStorage)');
 if(html.includes('storage:native?localStorage:sessionStorage')){
  once('storage:native?localStorage:sessionStorage','storage:window.MANEE_SECURE_STORAGE.area(native?"localStorage":"sessionStorage")');
  once('open:url=>native?native.open(url):location.assign(url)','open:async url=>{await window.MANEE_SECURE_STORAGE.flush();return native?native.open(url):location.assign(url);}');
 }
 return html;
}
