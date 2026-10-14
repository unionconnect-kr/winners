import {binding,verifyAndPersist} from './google-play.mjs';
const PRODUCT='manee.store1.monthly',BASE_PLAN='monthly';

// Callers must authenticate userId and provide a live owner/session recheck.
// Production receipts remain blocked until entitlement enforcement ships.
export function createPurchaseVerifier({api,service,authorize,productId=PRODUCT,now=Date.now}) {
  return async ({userId,storeId,purchaseToken}) => {
    const context={...binding(userId,storeId),productId,basePlanId:BASE_PLAN};
    await authorize();
    const result=await verifyAndPersist({api,context,purchaseToken,now,persist:async record=>{
      if(record.environment!=='Sandbox')throw Error('billing_not_ready');
      await authorize();
      const saved=await service.rpc('manee_android_billing_save',{
        p_user_id:userId,p_store_id:storeId,p_record:record,
      });
      return !saved.error && saved.data===true;
    }});
    await authorize();
    return result;
  };
}
