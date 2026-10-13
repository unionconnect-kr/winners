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
Deno.serve(createHandler({api, client:(authorization: string) => createClient(url, key, {
  global:{headers:{Authorization:authorization}}, auth:{persistSession:false,autoRefreshToken:false},
})}));
