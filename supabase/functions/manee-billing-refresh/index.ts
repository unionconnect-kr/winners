import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createGooglePlayApi} from '../manee-android-billing/google-play.mjs';
import {createRefreshHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const client=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
let api=null;
try{
 const credentials=JSON.parse(Deno.env.get('MANEE_GOOGLE_PLAY_SERVICE_ACCOUNT')||'{}');
 if(url==='https://bhwuuxcrzxespkjlmqxr.supabase.co'&&credentials.project_id==='manee-production-3eafa'&&credentials.client_email==='manee-play-billing@manee-production-3eafa.iam.gserviceaccount.com')api=createGooglePlayApi({credentials});
}catch{/* Fail closed. */}
Deno.serve(createRefreshHandler({client,api}));
