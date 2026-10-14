import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { firebaseCredentials, createFcmSender } from './fcm.mjs';
import { createHandler } from './handler.mjs';
import { androidPushDeployment } from './environment.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
const credentials = firebaseCredentials(Deno.env.get('MANEE_ANDROID_FCM_SERVICE_ACCOUNT'));
const deployment = androidPushDeployment(url, credentials, Deno.env.get('MANEE_ANDROID_PRODUCTION_PUSH_ENABLED') === 'true');
Deno.serve(createHandler({
  deployment,
  credentials,
  send: credentials && deployment ? createFcmSender(credentials, fetch, deployment.packageName) : null,
  client: (authorization: string) => createClient(url, key, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  }),
}));
