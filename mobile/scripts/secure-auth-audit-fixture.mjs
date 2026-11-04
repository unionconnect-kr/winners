// Offline presentation fixtures only. The real native boundary is exercised by
// instrumentation/compilation jobs; no live credentials enter this audit.
export function mockSecureAuthForAudit(html){
 return html.replace('<script src="/secure-auth.js"></script>',`<script>
 window.MANEE_SECURE_STORAGE={ready:Promise.resolve(),area:name=>window[name],wrap:adapter=>adapter,flush:async()=>{}};
 </script>`);
}
