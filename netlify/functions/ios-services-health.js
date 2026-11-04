const {configured:billingConfigured,signingReady:billingSigningReady}=require('./lib/apple-billing.cjs');
const {configured:pushConfigured,providerToken}=require('./lib/native-push.cjs');
const {blockExternalService}=require('./lib/manee-environment.cjs');
exports.handler=async event=>{
 const blocked=blockExternalService();if(blocked)return blocked;
 if(event.httpMethod!=='GET')return {statusCode:405,body:'{}'};
 let pushSigningReady=false;
 if(pushConfigured()){try{providerToken();pushSigningReady=true;}catch{}}
 // Public deployment metadata only. A present key is not proof of Apple
 // authorization or device delivery. No values, account IDs or logs are exposed.
 return {statusCode:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({
  app:'kr.co.manee.app',billingCredentialsPresent:billingConfigured(),billingSigningReady:billingSigningReady(),pushCredentialsPresent:pushConfigured(),pushSigningReady,
  checkoutConfigured:process.env.IOS_PURCHASES_ENABLED==='true',maintenanceCredentialPresent:/^[a-f0-9]{64}$/.test(process.env.IOS_MAINTENANCE_TOKEN||''),
 })};
};
