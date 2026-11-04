import {createHash} from 'node:crypto';
export function securityHeaders(html,config){
  const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>! /\bsrc\s*=/.test(m[1])&&m[2].trim()).map(m=>"'sha256-"+createHash('sha256').update(m[2]).digest('base64')+"'");
  const origin=new URL(config.supabaseUrl).origin;
  const csp=["default-src 'self'","base-uri 'none'","object-src 'none'","frame-ancestors 'none'","form-action 'self'",
    "script-src 'self' https://cdn.jsdelivr.net "+hashes.join(' '),"script-src-attr 'none'","style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:","img-src 'self' data: blob: https:","connect-src 'self' "+origin+' '+origin.replace('https:','wss:')+' https://cdn.jsdelivr.net',
    "worker-src 'self' blob:","frame-src 'none'","upgrade-insecure-requests"].join('; ');
  return '/*\n  Content-Security-Policy: '+csp+'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(self), microphone=(self), geolocation=(self), payment=(self)\n';
}
