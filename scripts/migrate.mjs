// Apply supabase/migrations in order.
//
// Each file runs inside its own transaction, so a failure leaves the database
// at the last complete migration rather than halfway through one. Applied files
// are recorded in schema_migrations, making re-runs safe.
//
//   DATABASE_URL="postgresql://..." node scripts/migrate.mjs [--dry-run]

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const dryRun = process.argv.includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  // Supabase terminates TLS with its own chain; verification would need the CA
  // bundle, and the connection is to a known host over TLS regardless.
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});

function fail(message, error) {
  console.error(`\n✗ ${message}`);
  if (error) {
    console.error(`  ${error.message}`);
    if (error.position) console.error(`  at character ${error.position}`);
    if (error.hint) console.error(`  hint: ${error.hint}`);
  }
}

try {
  await client.connect();
  const { rows: who } = await client.query(
    'select current_database() as db, current_user as usr, version() as v',
  );
  console.log(`connected: ${who[0].db} as ${who[0].usr}`);
  console.log(`  ${who[0].v.split(',')[0]}\n`);

  await client.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows: done } = await client.query('select filename from public.schema_migrations');
  const applied = new Set(done.map((r) => r.filename));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

    if (dryRun) {
      console.log(`→ ${file} (${sql.split('\n').length} lines) — dry run, not applied`);
      continue;
    }

    process.stdout.write(`→ ${file} … `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      console.log('ok');
      ran += 1;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      console.log('FAILED');
      fail(`${file} was rolled back; nothing from it was applied`, error);
      process.exit(1);
    }
  }

  console.log(`\n${ran} migration(s) applied, ${files.length} total.`);

  if (!dryRun) {
    const { rows: counts } = await client.query(`
      select
        (select count(*) from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
        (select count(*) from information_schema.triggers
          where trigger_schema = 'public') as triggers,
        (select count(*) from pg_policies where schemaname = 'public') as policies,
        (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public') as functions
    `);
    const c = counts[0];
    console.log(`\nschema now: ${c.tables} tables, ${c.triggers} triggers, ${c.policies} policies, ${c.functions} functions`);

    const { rows: unprotected } = await client.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and c.relname <> 'schema_migrations'
      order by c.relname
    `);
    if (unprotected.length > 0) {
      console.log(`\n⚠ tables without RLS: ${unprotected.map((r) => r.relname).join(', ')}`);
    } else {
      console.log('✓ every table has row level security enabled');
    }
  }
} catch (error) {
  fail('migration run failed', error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
