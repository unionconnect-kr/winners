const {createClient}=require('@supabase/supabase-js');
const {maintenanceHandler}=require('./lib/ios-maintenance.cjs');
const {blockExternalService}=require('./lib/manee-environment.cjs');
// Netlify scheduled functions have no HTTP URL. Keep the public bearer-protected
// maintenance endpoints separate; a request body can never select this factory.
exports.handler=async()=>{
 const blocked=blockExternalService();if(blocked)return blocked;
 const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 return maintenanceHandler({mode:'push',db,scheduled:true})({httpMethod:'POST'});
};
