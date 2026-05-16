/**
 * One-time migration: seeds your Supabase ancestors table from ancestors.js.
 *
 * Usage:
 *   1. Create a .env file at the repo root with:
 *        SUPABASE_URL=https://zuyeczifsofwdmpnltny.supabase.co
 *        SUPABASE_SERVICE_KEY=<your service role key>
 *        SUPABASE_USER_ID=<your auth user UUID from Supabase Auth dashboard>
 *   2. Run:  node supabase/migrate.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(__dirname, '../.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => l.split('=').map((s) => s.trim()))
);

const SUPABASE_URL      = env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const USER_ID           = env.SUPABASE_USER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !USER_ID) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or SUPABASE_USER_ID in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Import ancestor data
const { gentner } = await import('../src/scripts/ancestors.js');

// Insert user_settings (uses the hardcoded source config)
const settings = {
  user_id:          USER_ID,
  ancestry_tree_id: '178204157',
  ancestry_root:    '352320388648',
  myheritage_id:    '1220243522',
  myheritage_root:  '2000002',
  familysearch_id:  'L2Y8-T2J',
  findagrave_id:    '1057635',
};

const { error: settingsError } = await supabase
  .from('user_settings')
  .upsert(settings, { onConflict: 'user_id' });

if (settingsError) {
  console.error('Settings insert failed:', settingsError.message);
} else {
  console.log('user_settings seeded.');
}

// Insert ancestors
const rows = Object.entries(gentner).map(([id, p]) => ({
  user_id:      USER_ID,
  internal_id:  parseInt(id, 10),
  first:        p.first        || '',
  middle:       p.middle       || '',
  surname:      p.surname      || '',
  maiden:       p.maiden       || '',
  birth:        p.birth        || '',
  death:        p.death        || '',
  ancestry:     p.ancestry     || '',
  familysearch: p.familysearch || '',
  findagrave:   p.findagrave   || '',
  myheritage:   p.myheritage   || '',
}));

const { error: ancestorsError } = await supabase
  .from('ancestors')
  .upsert(rows, { onConflict: 'user_id,internal_id' });

if (ancestorsError) {
  console.error('Ancestors insert failed:', ancestorsError.message);
} else {
  console.log(`Migrated ${rows.length} ancestors successfully.`);
}
