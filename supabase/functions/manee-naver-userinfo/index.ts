import { createHandler } from './handler.mjs';

// This endpoint verifies a Naver OAuth bearer with Naver itself, not a Supabase
// JWT. It has no database privileges, stored tokens or client secrets.
Deno.serve(createHandler());

