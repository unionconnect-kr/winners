import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import * as googlePlay from './google-play.mjs';
import {createHandler} from './handler.mjs';
import {createProductionAccess} from './production-access.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
let api = null;
try {
  const credentials = JSON.parse(Deno.env.get('MANEE_GOOGLE_PLAY_SERVICE_ACCOUNT') || '{}');
  if(url === 'https://bhwuuxcrzxespkjlmqxr.supabase.co' &&
    credentials.project_id === 'manee-production-3eafa' &&
    credentials.client_email === 'manee-play-billing@manee-production-3eafa.iam.gserviceaccount.com') {
    api = googlePlay.createGooglePlayApi({credentials,fetcher:async(input:any,init:any)=>{
      const stage=String(input)==='https://oauth2.googleapis.com/token'?'oauth':'publisher';
      try {
        const response=await fetch(input,init);
        if(!response.ok) console.error('billing_upstream',JSON.stringify({stage,status:response.status}));
        return response;
      } catch {
        console.error('billing_upstream',JSON.stringify({stage,status:'network_error'}));
        throw Error('billing_unavailable');
      }
    }});
  }
} catch { /* Missing or malformed credentials keep billing unavailable. */ }
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const service=serviceKey ? createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;
// A deployment alone cannot accept paid receipts. An operator must explicitly
// enable the switch and name exact owner/store pairs in a server-only secret.
const productionAccess=createProductionAccess({url,
 enabled:Deno.env.get('MANEE_ANDROID_PAID_CHECKOUT_ENABLED'),
 pairs:Deno.env.get('MANEE_ANDROID_PAID_PAIRS')});
Deno.serve(createHandler({api,service,productionAccess,
 testAccess:async({user,storeId}:any)=>{
 const result=await user.rpc('manee_android_billing_test_access',{p_store_id:storeId});
 return !result.error && result.data===true;
}, client:(authorization: string) => createClient(url, key, {
  global:{headers:{Authorization:authorization}}, auth:{persistSession:false,autoRefreshToken:false},
})}));
