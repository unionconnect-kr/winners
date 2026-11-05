import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { createHandler } from './handler.mjs'
function key() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) { try { const keys = JSON.parse(raw); if (keys.default) return keys.default as string } catch {} }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', key(), {
  auth: { persistSession: false, autoRefreshToken: false }
})
Deno.serve(createHandler({ admin }))


