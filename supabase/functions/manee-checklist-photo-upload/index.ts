import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createPhotoUploadHandler} from './handler.mjs';
Deno.serve(createPhotoUploadHandler({createClient,env:(key:string)=>Deno.env.get(key)}));
