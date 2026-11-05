import {writeFileSync} from 'node:fs';
import {landingPage} from '../supabase/functions/manee-email-auth/templates.mjs';
let html=landingPage('manee-email-completion-v1');
const script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
html=html.replace(/<script nonce="[^"]+">[\s\S]*?<\/script>/,'<script src="/app-config.js"></script><script src="/email-confirmation.js" defer></script>');
html=html.replace('<head>','<head><meta name="referrer" content="no-referrer">');
writeFileSync(new URL('../email-confirmation.html',import.meta.url),html+'\n');
writeFileSync(new URL('../email-confirmation.js',import.meta.url),script+'\n');
console.log('Prepared environment-configured public email verification and recovery completion page.');
