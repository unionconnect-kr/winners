// Runs only after a successful owner signup and identity resolution. Opening the
// offer sheet is not a purchase; store confirmation and server verification remain
// mandatory. Do not infer a free entitlement from signup or a franchise code.
export function createSignupCheckout({getContext,readAccess,openCheckout,enabled=false}) {
  let running=false;
  return async () => {
    if(running)return {status:'busy'};
    const original=getContext();
    if(original?.role!=='storeOwner'||!original.userId||!original.storeId)return {status:'not_owner'};
    if(!enabled)return {status:'unavailable'};
    const context={...original};
    const same=()=>{const c=getContext();return c?.role==='storeOwner'&&c.userId===context.userId&&c.storeId===context.storeId;};
    running=true;
    try {
      const access=await readAccess(context);
      if(!same())return {status:'changed'};
      if(access?.enforced===false||access?.canWrite===true)return {status:'covered'};
      if(access?.enforced!==true||access?.canWrite!==false)return {status:'unavailable'};
      await openCheckout();
      return {status:'offered'};
    } finally {running=false;}
  };
}
