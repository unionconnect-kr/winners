const UUID='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const PAIR=new RegExp('^'+UUID+':'+UUID+'$');
const PROJECT='https://bhwuuxcrzxespkjlmqxr.supabase.co';

// This is a server-only launch switch, not a client claim. Empty/malformed
// configuration must never broaden access to another owner or store.
export function createProductionAccess({url,enabled,pairs}) {
  if(url!==PROJECT || enabled!=='yes-2026-launch')return async()=>false;
  const allowed=new Set((pairs||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>PAIR.test(x)));
  return async({userId,storeId})=>allowed.has(String(userId).toLowerCase()+':'+String(storeId).toLowerCase());
}
