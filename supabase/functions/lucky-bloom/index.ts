import { createHandler } from './handler.js';
Deno.serve(createHandler({SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),ADMIN_PASSWORD:Deno.env.get('ADMIN_PASSWORD'),ALLOWED_ORIGINS:Deno.env.get('ALLOWED_ORIGINS')}));
