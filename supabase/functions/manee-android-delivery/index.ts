import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { firebaseCredentials, createFcmSender } from '../manee-android-push/fcm.mjs';
import { createDeliveryHandler } from './handler.mjs';
import { androidPushDeployment } from '../manee-android-push/environment.mjs';
const url=Deno.env.get('SUPABASE_URL')||'';
const credentials=firebaseCredentials(Deno.env.get('MANEE_ANDROID_FCM_SERVICE_ACCOUNT'));
const deployment=androidPushDeployment(url,credentials,Deno.env.get('MANEE_ANDROID_PRODUCTION_PUSH_ENABLED')==='true');
const client=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createDeliveryHandler({deployment,credentials,client,
 send:credentials&&deployment?createFcmSender(credentials,fetch,deployment.packageName):null}));
