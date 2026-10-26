'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK=7*24*60*60*1000;
// The public rollout and a short, store-scoped TestFlight pilot are separate.
// The pilot never enables catalog entries or production write entitlements.
function checkoutPolicy(storeId,context,env=process.env,now=Date.now()){
 const legal=[env.IOS_PRIVACY_URL,env.IOS_TERMS_URL].every(url=>typeof url==='string'&&/^https:\/\/[^\s]+$/.test(url));
 const publicEnabled=env.IOS_PURCHASES_ENABLED==='true'&&context.catalogEnabled===true;
 const ids=(env.IOS_QA_STORE_IDS||'').split(',').map(id=>id.trim().toLowerCase());
 const validIds=ids.length<=10&&ids.every(id=>UUID.test(id));
 const qaStore=validIds&&UUID.test(storeId||'')&&ids.includes(storeId.toLowerCase());
 const until=Date.parse(env.IOS_QA_EXPIRES_AT||'');
 const qaEnabled=qaStore&&Number.isFinite(until)&&until>now&&until-now<=WEEK;
 return {enabled:legal&&(publicEnabled||qaEnabled),sandboxOnly:!publicEnabled&&qaStore};
}
module.exports={checkoutPolicy};
