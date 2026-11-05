import {securityHeaders} from './security-headers.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = process.env.CONTEXT;
const environment = context === 'production' ? 'production' :
  ['deploy-preview','branch-deploy','dev'].includes(context) ? 'staging' : null;
if (!environment) throw new Error('Unknown build context. Set CONTEXT explicitly; no production fallback is allowed.');
if (environment === 'production' && process.env.BRANCH && process.env.BRANCH !== 'main') {
  throw new Error('Only main may produce a production build.');
}
const all = JSON.parse(readFileSync(resolve(root,'config/environments.json'),'utf8'));
const config = all[environment];
if (!config || config.environment !== environment || !/^[a-z]{20}$/.test(config.projectRef) ||
    config.supabaseUrl !== `https://${config.projectRef}.supabase.co` ||
    !config.publishableKey?.startsWith('sb_publishable_')) throw new Error('Invalid backend configuration.');
if (all.staging.projectRef === all.production.projectRef || all.staging.publishableKey === all.production.publishableKey) {
  throw new Error('Staging must have a separate project and public key.');
}
const output = resolve(root,'dist');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
// Owner/staff web now uses the device-approved 1.45 screens. The root legacy
// entry remains available to the separate administrator variant tooling.
const web = resolve(root,'web');
let html = readFileSync(resolve(web,'index.html'),'utf8');
if (!html.includes('src="/app-config.js"') || html.includes(all.production.supabaseUrl) ||
    html.includes(all.production.publishableKey)) throw new Error('Canonical HTML still contains a production connection.');
const staffAuthAnchor = 'const MANEE_STAFF_AUTH_ENABLED = MANEE_IS_STAGING;';
if (html.split(staffAuthAnchor).length !== 2) throw new Error('Review staff Auth activation anchor before building.');
if (environment === 'production') html = html.replace(staffAuthAnchor,'const MANEE_STAFF_AUTH_ENABLED = true; // security-v2 production cutover');
html = html.replace('</head>','<link rel="stylesheet" href="/username-recovery.css"></head>')
  .replace('</body>','<script src="/username-recovery.js"></script></body>');
writeFileSync(resolve(output,'index.html'),html);
writeFileSync(resolve(output,'_headers'),securityHeaders(html+'\n'+readFileSync(resolve(root,'account-deletion.html'),'utf8'),config));
cpSync(resolve(root,'account-deletion.html'),resolve(output,'account-deletion.html'));
// Email links carry one-time proofs only in a fragment; serve their completion
// screen from the existing app origin rather than a plain-text Edge GET.
cpSync(resolve(root,'email-confirmation.html'),resolve(output,'email-confirmation.html'));
cpSync(resolve(root,'email-confirmation.js'),resolve(output,'email-confirmation.js'));
for (const asset of ['owner-ui.css','web-ui.css','feedback144.css','web-platform.js','social-auth.js','launch-144.png','username-recovery.js','username-recovery.css']) {
  cpSync(resolve(web,asset),resolve(output,asset),{recursive:true});
}
cpSync(resolve(root,'report-assets'),resolve(output,'report-assets'),{recursive:true});
const webConfig = {...config,
  // Deploy this cutover together with configured providers and signup handlers
  // that consume the verified phone proof. Never fall back to unverified signup.
  webSmsAuthEnabled: true,
  socialProviders: {naver: true},
};
writeFileSync(resolve(output,'app-config.js'),'window.MANEE_CONFIG = Object.freeze('+JSON.stringify(webConfig)+');\n');
writeFileSync(resolve(output,'build-info.json'),JSON.stringify({version:'1.47-web',environment,projectRef:config.projectRef,
  commit:process.env.COMMIT_REF || null,uiSource:'mobile-1.47',usernameRecoveryEnabled:true,smsResendSeconds:30,smsAuthEnabled:webConfig.webSmsAuthEnabled},null,2)+'\n');
const manifest = JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
if (environment === 'staging') { manifest.name = '매니 테스트'; manifest.short_name = '매니 테스트'; }
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
let sw = readFileSync(resolve(root,'sw.js'),'utf8');
if (environment === 'staging') {
  const anchor = 'self.addEventListener("push", (event) => {';
  if (sw.split(anchor).length !== 2) throw new Error('Review service-worker push handler before building.');
  sw = sw.replace(anchor,anchor+'\n  // MANEE_STAGING_SW: ignore subscriptions created before backend separation.\n  return;');
}
writeFileSync(resolve(output,'sw.js'),sw);
if (existsSync(resolve(root,'icons'))) cpSync(resolve(root,'icons'),resolve(output,'icons'),{recursive:true});
mkdirSync(resolve(root,'netlify/functions/lib'),{recursive:true});
writeFileSync(resolve(root,'netlify/functions/lib/manee-environment.json'),JSON.stringify({
  environment, projectRef:config.projectRef, externalServicesEnabled:environment === 'production',
},null,2)+'\n');
console.log(JSON.stringify({environment,projectRef:config.projectRef,publish:'dist',externalServicesEnabled:environment === 'production'}));
