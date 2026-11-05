import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { createEmailHandler } from './handler.ts'
Deno.serve(createEmailHandler({createClient,env:(name:string)=>Deno.env.get(name),fetch,crypto}))
