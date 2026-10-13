import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { firebaseCredentials, createFcmSender } from './fcm.mjs';
import { createHandler } from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL') || '';
const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
const credentials = firebaseCredentials(Deno.env.get('MANEE_ANDROID_FCM_SERVICE_ACCOUNT'));
Deno.serve(createHandler({
  staging: url === 'https://obpkzecgswnfuyhwvncd.supabase.co',
  credentials,
  send: credentials ? createFcmSender(credentials) : null,
  client: (authorization: string) => createClient(url, key, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  }),
}));
