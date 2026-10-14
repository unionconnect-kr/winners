import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import * as googlePlay from './google-play.mjs';
import {createHandler} from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
let api = null;
try {
  const credentials = JSON.parse(Deno.env.get('MANEE_GOOGLE_PLAY_SERVICE_ACCOUNT') || '{}');
  if(url === 'https://bhwuuxcrzxespkjlmqxr.supabase.co' &&
    credentials.project_id === 'manee-production-3eafa' &&
    credentials.client_email === 'manee-play-billing@manee-production-3eafa.iam.gserviceaccount.com') {
    api = googlePlay.createGooglePlayApi({credentials});
  }
} catch { /* Missing or malformed credentials keep billing unavailable. */ }
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const service=serviceKey ? createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
Deno.serve(createHandler({api,service,testAccess:async({user,storeId}:any)=>{
 const result=await user.rpc('manee_android_billing_test_access',{p_store_id:storeId});
 return !result.error && result.data===true;
}, client:(authorization: string) => createClient(url, key, {
  global:{headers:{Authorization:authorization}}, auth:{persistSession:false,autoRefreshToken:false},
})}));
