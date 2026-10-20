import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { androidFirebaseProject } from './android-firebase-config.mjs';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(mobile, '..');
const environment = process.argv[2];
const platform = process.argv[3] || 'ios';
if (!['ios', 'android'].includes(platform)) throw new Error('Unsupported native platform.');
const androidProduction = platform === 'android' && environment === 'production';
if (androidProduction && process.env.MANEE_ANDROID_RELEASE_PURPOSE !== 'play-internal-setup') {
  throw new Error('Production Android is limited to explicit Play internal setup until billing is verified.');
}
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Specify staging or production explicitly.');
}
const androidPushProjectId = platform === 'android' ? androidFirebaseProject(resolve(mobile, androidProduction ? 'android/app/src/release/google-services.json' : 'android/app/google-services.json'), environment) : null;
const environments = JSON.parse(readFileSync(resolve(root, 'config/environments.json'), 'utf8'));
const config = environments[environment];
if (config.environment !== environment || !/^[a-z]{20}$/.test(config.projectRef) ||
    config.supabaseUrl !== `https://${config.projectRef}.supabase.co` ||
    !config.publishableKey.startsWith('sb_publishable_') ||
    environments.staging.projectRef === environments.production.projectRef) {
  throw new Error('Invalid or shared backend configuration.');
}
const publicSites = JSON.parse(readFileSync(resolve(root, 'config/public-sites.json'), 'utf8'));
const publicOrigin = new URL(publicSites[0].origin).origin;
if (!publicOrigin.startsWith('https://')) throw new Error('Public origin must use HTTPS.');
let html = readFileSync(resolve(root, 'index.html'), 'utf8');
function replaceOnce(before, after) {
  if (html.split(before).length !== 2) throw new Error(`Review mobile build anchor: ${before}`);
  html = html.replace(before, after);
}
replaceOnce('const MANEE_STAFF_AUTH_ENABLED = MANEE_IS_STAGING;',
  'const MANEE_STAFF_AUTH_ENABLED = true; // Native builds always require staff Auth.');
replaceOnce('<script src="/app-config.js"></script>',
  '<script src="/app-config.js"></script>\n<script src="/native.js"></script>');
replaceOnce('<script src="https://cdn.jsdelivr.net/npm/xlsx-js-style/dist/xlsx.bundle.js"></script>',
  '<script src="/vendor/xlsx.bundle.js"></script>');
replaceOnce('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js"></script>',
  '<script src="/vendor/supabase.js"></script>');
replaceOnce('  // END MANEE_ENVIRONMENT',
  '  window.MANEE_NATIVE.configure(()=>({db,storeId:currentStoreId(),userId:state.authProfile?.user_id,storeName:state.store,role:state.role,ready:state.splashDone&&!state.loading}),openNativeNotification);\n  // END MANEE_ENVIRONMENT');
replaceOnce('<div class="owner-menu"><button data-owner-setup-resume>', `<div class="owner-menu"><button id="native-settings-btn">${platform === 'android' ? (androidProduction ? '앱 안내' : '테스트 앱 안내') : '아이폰 구독·알림'}<span>›</span></button>${platform === 'android' ? '<button id="native-subscription-btn">매장 이용권<span>›</span></button>' : ''}<button data-owner-setup-resume>`);
replaceOnce('  function bindOwnerUIEvents(){', '  function bindOwnerUIEvents(){\n    window.MANEE_NATIVE.refresh();\n    document.getElementById("native-settings-btn")?.addEventListener("click",()=>window.MANEE_NATIVE.openSettings());');
if (platform === 'android') {
  replaceOnce('    document.getElementById("native-settings-btn")?.addEventListener("click",()=>window.MANEE_NATIVE.openSettings());',
    '    document.getElementById("native-settings-btn")?.addEventListener("click",()=>window.MANEE_NATIVE.openSettings());\n    document.getElementById("native-subscription-btn")?.addEventListener("click",()=>window.MANEE_NATIVE.openSubscriptionStatus());');
  replaceOnce('    if(error) throw error;\n    if(!Array.isArray(data) || data.length!==1)',
    '    if(error?.code==="P4402") window.MANEE_NATIVE.subscriptionDenied();\n    if(error) throw error;\n    if(!Array.isArray(data) || data.length!==1)');
  replaceOnce("    if(error && error.code==='42501'){clearStaffAuthView();render();}",
    "    if(error?.code==='P4402'){showToast('매장 이용권을 확인해 주세요. 사장님께 문의해 주세요.');return;}\n    if(error && error.code==='42501'){clearStaffAuthView();render();}");
}
replaceOnce("        const { error } = await db.auth.signOut({ scope: 'local' });",
  "        await window.MANEE_NATIVE.prepareLogout();\n        const { error } = await db.auth.signOut({ scope: 'local' });");
html = html.replaceAll('navigator.geolocation', 'window.MANEE_GEOLOCATION');
if (platform === 'android') {
  const pushAdapter = `  async function nativeAndroidPushAction(action){
    if(state.pushBusy)return;
    const alive=maneeLoadGuard("pushSubscription");
    state.pushBusy=true;state.pushRegistrationError=null;render();
    try{
      const result=await window.MANEE_NATIVE.push(action);
      if(!alive())return;
      state.pushSubscribed=!!result.subscribed;
      state.pushRegistrationError=result.message||null;
      if(action!=="refresh"&&result.message)showToast(result.message);
    }catch(e){
      if(alive()){
        if(action!=="disable")state.pushSubscribed=false;
        state.pushRegistrationError=e?.message||"알림 연결을 확인하지 못했어요. 다시 시도해 주세요.";
        if(action!=="refresh")showToast(state.pushRegistrationError);
      }
    }finally{if(alive()){state.pushBusy=false;render();}}
  }
`;
  replaceOnce('  async function refreshPushSubStatus(){', pushAdapter+'  async function refreshPushSubStatus(){\n    return nativeAndroidPushAction("refresh");');
  replaceOnce('  async function subscribeToPush(){', '  async function subscribeToPush(){\n    return nativeAndroidPushAction("enable");');
  replaceOnce('  async function unsubscribeFromPush(){', '  async function unsubscribeFromPush(){\n    return nativeAndroidPushAction("disable");');
  replaceOnce('출퇴근·예약·월말 보고서 알림을 이 기기로 받아요.', '출퇴근·예약·월말 보고서 알림을 이 기기로 받아요.');
  // Let Capacitor inset the WebView below system bars and above the keyboard.
  replaceOnce('viewport-fit=cover', 'viewport-fit=contain');
  if (!androidProduction) {
  replaceOnce('  function startVoiceInput(){', '  function startVoiceInput(){\n    showToast("이 테스트 앱은 음성 입력을 지원하지 않아요. 키보드로 입력해 주세요."); return;');
  replaceOnce('  async function askApp(){', '  async function askApp(){\n    showToast("이 테스트 앱은 AI 연결을 준비 중이에요."); return;');
  replaceOnce('  async function autoFillFromPhoto(){', '  async function autoFillFromPhoto(){\n    showToast("이 테스트 앱은 영수증 자동 인식을 준비 중이에요. 직접 입력해 주세요."); return;');
  replaceOnce('\n<body>\n', '\n<body>\n<div role="status" style="position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;background:#fef3c7;color:#713f12;font-size:12px;padding:3px;pointer-events:none">매니 Android 테스트 · 테스트 데이터만 입력해 주세요</div>\n');
  }
}
// WKWebView web push is not APNs. Avoid waiting forever for an unregistered worker.
html = html.replaceAll('"serviceWorker" in navigator', 'false /* Native APNs uses separate authenticated settings */');
replaceOnce("location.origin+'/'", JSON.stringify(publicOrigin + '/'));
// There is no staging Netlify service. Fail closed instead of hitting production.
const functionsOrigin = environment === 'production' ? publicOrigin : 'https://staging-services-disabled.invalid';
html = html.replaceAll('"/.netlify/functions/', '"' + functionsOrigin + '/.netlify/functions/');
const output = resolve(mobile, 'www');
rmSync(output, { recursive: true, force: true });
mkdirSync(resolve(output, 'vendor'), { recursive: true });
writeFileSync(resolve(output, 'index.html'), html);
writeFileSync(resolve(output, 'app-config.js'), 'window.MANEE_CONFIG = Object.freeze(' + JSON.stringify(config) + ');\n');
for (const asset of ['owner-ui.css', 'factory-client.js', 'report-assets', 'icons', 'manifest.json']) {
  cpSync(resolve(root, asset), resolve(output, asset), { recursive: true });
}
cpSync(resolve(mobile, 'node_modules/xlsx-js-style/dist/xlsx.bundle.js'), resolve(output, 'vendor/xlsx.bundle.js'));
cpSync(resolve(mobile, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), resolve(output, 'vendor/supabase.js'));
await build({ entryPoints: [resolve(mobile, platform === 'android' ? 'src/native-android.js' : 'src/native.js')], bundle: true,
  define: {ANDROID_PRODUCTION:JSON.stringify(androidProduction),ANDROID_FIREBASE_PROJECT:JSON.stringify(androidPushProjectId),NATIVE_SERVICES_ORIGIN:JSON.stringify(functionsOrigin),NATIVE_PUBLIC_ORIGIN:JSON.stringify(publicOrigin)},
  outfile: resolve(output, 'native.js'), format: 'iife', target: platform === 'android' ? 'chrome100' : 'safari15', minify: true });
writeFileSync(resolve(output, 'build-info.json'), JSON.stringify({ environment, platform, projectRef: config.projectRef, ...(platform === 'android' ? { androidPushProjectId, ...(androidProduction ? { releasePurpose: 'play-internal-setup', billingEnabled: false } : {}) } : {}) }, null, 2) + '\n');
console.log(`Prepared ${environment} native web assets (${config.projectRef}).`);
