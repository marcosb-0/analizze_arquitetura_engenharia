/**
 * One-off bootstrap: creates the first admin user for ConstruGestão Pro.
 *
 * Uses the Supabase SERVICE ROLE key — never import this file from src/ (it's
 * outside the Vite bundle on purpose) and never commit the service role key.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD=choose-a-strong-password \
 *   npx tsx scripts/create-admin.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw createError ?? new Error('User creation returned no user.');
  }

  // The on_auth_user_created trigger already inserted a 'campo'-role profile row
  // for this user — promote it to admin.
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', created.user.id);

  if (updateError) {
    throw updateError;
  }

  console.log(`Admin user created and promoted: ${ADMIN_EMAIL} (${created.user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
