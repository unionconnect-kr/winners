import {binding,verifyAndPersist} from './google-play.mjs';
const PRODUCT='manee.store1.monthly',BASE_PLAN='monthly';

// Callers must authenticate userId and provide a live owner/session recheck.
// authorize(environment) must recheck the selected owner/store and the
// environment-specific launch permission before a verified receipt is saved.
export function createPurchaseVerifier({api,service,authorize,productId=PRODUCT,now=Date.now,
  allowEnvironment=environment=>environment==='Sandbox'}) {
  return async ({userId,storeId,purchaseToken}) => {
    const context={...binding(userId,storeId),productId,basePlanId:BASE_PLAN};
    await authorize();
    const result=await verifyAndPersist({api,context,purchaseToken,now,persist:async record=>{
      if(!allowEnvironment(record.environment))throw Error('billing_not_ready');
      await authorize(record.environment);
      const saved=await service.rpc('manee_android_billing_save',{
        p_user_id:userId,p_store_id:storeId,p_record:record,
      });
      return !saved.error && saved.data===true;
    }});
    await authorize(result.environment);
    return result;
  };
}
