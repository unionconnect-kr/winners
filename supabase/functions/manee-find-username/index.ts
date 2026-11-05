import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createHandler} from './handler.mjs';
function key(name:string,legacy:string){try{const v=JSON.parse(Deno.env.get(name)||'{}').default;if(v)return v;}catch{}return Deno.env.get(legacy)||'';}
const url=Deno.env.get('SUPABASE_URL')||'',secret=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(createHandler({url,publishableKey:key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),
  admin:url&&secret?createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}):null,
  sms:{key:(Deno.env.get('SOLAPI_API_KEY')||'').trim(),secret:(Deno.env.get('SOLAPI_API_SECRET')||'').trim(),sender:(Deno.env.get('SOLAPI_SENDER_NUMBER')||'').trim()}
}));
