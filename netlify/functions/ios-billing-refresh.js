const {createClient}=require('@supabase/supabase-js');
const {maintenanceHandler}=require('./lib/ios-maintenance.cjs');
const {blockExternalService}=require('./lib/manee-environment.cjs');
const db=()=>createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
exports.handler=event=>blockExternalService()||maintenanceHandler({mode:'billing',db})(event);
