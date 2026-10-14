import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.0';
import {createPushAuthenticator} from './auth.mjs';
import {createNotificationHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const client=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:10000});
const audience='https://bhwuuxcrzxespkjlmqxr.supabase.co/functions/v1/manee-play-notifications';
const authenticate=createPushAuthenticator({email:'manee-play-notifications@manee-production-3eafa.iam.gserviceaccount.com',audience,
 verifyJwt:(token:string,options:any)=>{
  if(url!=='https://bhwuuxcrzxespkjlmqxr.supabase.co')throw Error('wrong_deployment');
  return jwtVerify(token,keys,options);
 }});
Deno.serve(createNotificationHandler({authenticate,client,subscription:'projects/manee-production-3eafa/subscriptions/manee-play-events-push'}));
