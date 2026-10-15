const UUID='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const PAIR=new RegExp('^'+UUID+':'+UUID+'$');
const PROJECT='https://bhwuuxcrzxespkjlmqxr.supabase.co';

// This is a server-only launch switch, not a client claim. Empty/malformed
// configuration must never broaden access to another owner or store.
export function createProductionAccess({url,enabled,pairs,publicEnabled}) {
  if(url!==PROJECT || enabled!=='yes-2026-launch')return async()=>false;
  const allowed=new Set((pairs||'').split(',').map(x=>x.trim().toLowerCase()).filter(x=>PAIR.test(x)));
  const publicCheckout=publicEnabled==='yes-2026-public-launch';
  // The handler must already have authenticated this caller and checked live
  // owner membership for the selected store. This is rollout eligibility only;
  // it does not grant membership, an entitlement, or permission to write data.
  return async({userId,storeId})=>{
    const pair=String(userId).toLowerCase()+':'+String(storeId).toLowerCase();
    return PAIR.test(pair)&&(publicCheckout||allowed.has(pair));
  };
}
