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

  // The on_auth_user_created trigger already inserted a profile row for this
  // user — promote it to admin AND activate it.
  //
  // `active` and `aprovado_em` are set explicitly since
  // 20260812190802_cadastro_nasce_inativo: every new signup is born inactive and
  // waits for an admin to approve it. This script is the bootstrap — there is no
  // admin yet to do the approving — so without these two fields a fresh install
  // would lock everyone out, including the account it just created.
  //
  // It runs with the service role key, so it bypasses both RLS and the
  // fn_profile_protege_privilegio guard (which only restricts non-admins).
  const { data: promoted, error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin', active: true, aprovado_em: new Date().toISOString() })
    .eq('id', created.user.id)
    .select('id, role, active');

  if (updateError) {
    throw updateError;
  }
  // The write is verified rather than assumed: an update refused by policy comes
  // back as zero rows with no error, and the script would print success over an
  // account that still cannot log in.
  if (!promoted || promoted.length === 0) {
    throw new Error(
      `Profile row for ${created.user.id} was not updated — the user exists but has no admin access. ` +
        'Check that the on_auth_user_created trigger ran and that SUPABASE_SERVICE_ROLE_KEY is the service role, not the anon key.'
    );
  }

  console.log(`Admin user created, promoted and activated: ${ADMIN_EMAIL} (${created.user.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
