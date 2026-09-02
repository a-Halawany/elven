/**
 * MIGRATION 0022 UPGRADE COMPATIBILITY — a bounded, one-purpose verification.
 *
 * C18 is FROZEN at 0021: its ceiling, catalog, table universe and criteria are
 * untouched by this file, and its dual-path proof continues to describe the world
 * it was built for. What C18 cannot do is say anything about 0022, because 0022
 * did not exist when it was frozen. This closes exactly that gap and nothing more.
 *
 * It is NOT a gate and NOT a testing framework. It runs the tracked migration
 * runner and the suites that already exist, and it asserts five things:
 *
 *   1. a database at 0021 carrying representative Phase 0 data and authorities,
 *      produced by running the Phase 0 suite against it through the real ports;
 *   2. migration 0022 applies to that database;
 *   3. the data, the roles and Phase 0 authority behaviour survive it;
 *   4. the resulting schema equals a virgin 0001-0022 database's schema;
 *   5. the Phase 1 integration suite passes against the UPGRADED database, not
 *      only against a virgin one.
 *
 * Run: node scripts/phase1/verify-0022-upgrade.mjs
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = join(ROOT, 'apps', 'api');
// `pg` is the api workspace's dependency, not the root's — resolve it there
// rather than adding a root dependency for one verification script.
const pg = createRequire(join(API, 'package.json'))('pg');
const env = { ...process.env, ...loadLocalEnv(ROOT) };
const UPGRADED = 'eye_upgrade_0022';
const VIRGIN = 'eye_virgin_0022';
const CEILING = '0021';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures += 1; console.log(`  ✗ ${m}`); };

function connect(database) {
  return new pg.Client({
    host: env.EYE_DB_HOST ?? 'localhost',
    port: Number(env.EYE_DB_PORT ?? 5432),
    database,
    user: env.EYE_DB_MIGRATE_USER ?? 'eye',
    password: env.EYE_DB_MIGRATE_PASSWORD,
  });
}

async function withDb(database, fn) {
  const c = connect(database);
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Recreate a scratch database. Cluster ROLES are shared and migration role
 *  creation is IF NOT EXISTS-guarded, so two databases coexist correctly. */
async function recreate(name) {
  await withDb('eye', async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${name}`);
  });
}

/**
 * Run the TRACKED migration runner against a workspace holding exactly the
 * migration set up to `ceiling` — the same shape C18 uses to hold a path at its
 * own ceiling, reused here rather than teaching the runner a new flag.
 */
function migrate(database, ceiling) {
  const ws = mkdtempSync(join(tmpdir(), 'eye-0022-ws-'));
  mkdirSync(join(ws, 'scripts'), { recursive: true });
  mkdirSync(join(ws, 'migrations'), { recursive: true });
  cpSync(join(API, 'scripts', 'migrate.mjs'), join(ws, 'scripts', 'migrate.mjs'));
  // The runner imports `pg`. The workspace sits outside the repository, so give it
  // the api workspace's own node_modules — the same link C18 makes for the same
  // reason (scripts/gate/c18-db-paths.mjs).
  symlinkSync(join(API, 'node_modules'), join(ws, 'node_modules'), 'dir');
  const files = readdirSync(join(API, 'migrations'))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && (ceiling === null || f.slice(0, 4) <= ceiling));
  for (const f of files) cpSync(join(API, 'migrations', f), join(ws, 'migrations', f));
  const r = spawnSync('node', [join(ws, 'scripts', 'migrate.mjs')], {
    cwd: ws, env: { ...env, EYE_DB_NAME: database }, encoding: 'utf8',
  });
  rmSync(ws, { recursive: true, force: true });
  if (r.status !== 0) {
    console.log(r.stdout ?? ''); console.error(r.stderr ?? '');
    throw new Error(`migrate(${database}, ceiling=${ceiling ?? 'all'}) exited ${r.status}`);
  }
  return files.length;
}

/** Run an existing suite against a named database. Nothing new is defined here. */
function suite(database, args, label) {
  const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.int.config.ts', ...args], {
    cwd: API, env: { ...env, EYE_DB_NAME: database, NO_COLOR: '1' }, encoding: 'utf8',
  });
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const m = /Tests {2}(\d+) passed \((\d+)\)/.exec(text);
  const failed = /\d+ failed/.test(text);
  if (r.status === 0 && m && !failed) { ok(`${label}: ${m[1]}/${m[2]} passed`); return Number(m[1]); }
  bad(`${label} did not pass cleanly (exit ${r.status})`);
  console.log(text.split('\n').filter((l) => /FAIL|×|Error|Tests /.test(l)).slice(0, 12).join('\n'));
  return null;
}

const PHASE0_ONLY = ['--exclude', '**/node_modules/**', '--exclude', '**/dist/**',
  '--exclude', 'test/int/phase1-*.test.ts'];
const PHASE1_ONLY = ['test/int/phase1-acceptance.test.ts', 'test/int/phase1-fault-injection.test.ts',
  'test/int/phase1-hostile-input.test.ts'];

/**
 * The SET of row digests for every governed table.
 *
 * A migration is allowed to ADD rows — 0022 registers two roles, three object
 * schemas and its own ledger line — and forbidden to lose or rewrite one. A single
 * aggregate digest cannot tell those apart, so this keeps the set and lets the
 * caller assert preservation and additions separately.
 */
async function dataRows(c) {
  const { rows: tables } = await c.query(`
    select table_schema||'.'||table_name as t from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema in ('identity','tenancy','policy','audit','objects','ctx','canon','config','public')
     order by 1`);
  const out = new Map();
  for (const { t } of tables) {
    const { rows } = await c.query(`select md5(r::text) x from ${t} r`);
    out.set(t, new Set(rows.map((r) => r.x)));
  }
  return out;
}

/**
 * What migration 0022 is DECLARED to add, per table. Anything else added, and
 * anything at all removed or rewritten, is a failure — so this list is the claim
 * under test, not a way of excusing whatever happened to change.
 */
const INTENDED_ADDITIONS = Object.freeze({
  'identity.roles': 2,             // collection_manager, collection_agent
  'objects.schema_registry': 3,    // SRC, OBS, EVD
  'public.schema_migrations': 1,   // 0022's own ledger line
});

/** Structure only: columns, constraints, indexes, routines, policies, grants. */
async function schemaDigest(c) {
  const q = async (sql) => (await c.query(sql)).rows.map((r) => JSON.stringify(r)).sort().join('\n');
  const parts = {
    columns: await q(`select table_schema s, table_name t, column_name c, data_type d,
                             is_nullable n, column_default df, ordinal_position o
                        from information_schema.columns
                       where table_schema not in ('pg_catalog','information_schema')`),
    constraints: await q(`select n.nspname s, rel.relname t, con.conname c, pg_get_constraintdef(con.oid) d
                            from pg_constraint con join pg_class rel on rel.oid = con.conrelid
                            join pg_namespace n on n.oid = rel.relnamespace
                           where n.nspname not in ('pg_catalog','information_schema')`),
    indexes: await q(`select schemaname s, tablename t, indexname i, indexdef d from pg_indexes
                       where schemaname not in ('pg_catalog','information_schema')`),
    routines: await q(`select n.nspname s, p.proname f, pg_get_function_identity_arguments(p.oid) a,
                              p.prosecdef sd, md5(p.prosrc) src
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname not in ('pg_catalog','information_schema')`),
    policies: await q(`select schemaname s, tablename t, policyname p, permissive, roles::text,
                              cmd, qual, with_check from pg_policies
                        where schemaname not in ('pg_catalog','information_schema')`),
    rls: await q(`select n.nspname s, c.relname t, c.relrowsecurity, c.relforcerowsecurity
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where c.relkind = 'r' and n.nspname not in ('pg_catalog','information_schema')`),
    grants: await q(`select table_schema s, table_name t, grantee g, privilege_type p
                       from information_schema.role_table_grants
                      where table_schema not in ('pg_catalog','information_schema')`),
  };
  return { parts, digest: sha256(Object.entries(parts).map(([k, v]) => `${k}\n${v}`).join('\n\n')) };
}

async function roles(c) {
  const { rows } = await c.query(
    `select rolname, rolcanlogin, rolsuper from pg_roles where rolname like 'eye%' order by 1`);
  return rows;
}

/* ────────────────────────────────────────────────────────────────────────── */

console.log('\n=== migration 0022 upgrade compatibility (C18 stays frozen at 0021) ===\n');

console.log('1. a 0021 database carrying representative Phase 0 data and authorities');
await recreate(UPGRADED);
const at21 = migrate(UPGRADED, CEILING);
ok(`migrated 0001–${CEILING} with the tracked runner (${at21} files)`);
const seeded = suite(UPGRADED, PHASE0_ONLY, 'Phase 0 suite seeds and passes at 0021');
const before = await withDb(UPGRADED, dataRows);
const rolesBefore = await withDb(UPGRADED, roles);
const seededRows = [...before.values()].reduce((a, x) => a + x.size, 0);
if (seededRows > 0) ok(`representative data present: ${seededRows} rows across ${before.size} governed tables`);
else bad('the 0021 database carries no data, so nothing is being preserved');

console.log('\n2. apply migration 0022');
const at22 = migrate(UPGRADED, null);
ok(`migration set applied through 0022 (${at22} files present)`);

console.log('\n3. the data, the roles and Phase 0 authority behaviour survive it');
const after = await withDb(UPGRADED, dataRows);
let problems = 0;
let preserved = 0;
const additions = [];
for (const [t, b] of before) {
  const a = after.get(t);
  if (a === undefined) { bad(`table ${t} disappeared across 0022`); problems += 1; continue; }
  const lostRows = [...b].filter((x) => !a.has(x));
  if (lostRows.length > 0) {
    bad(`table ${t} lost or rewrote ${lostRows.length} of its ${b.size} pre-existing row(s)`);
    problems += 1;
    continue;
  }
  preserved += b.size;
  const added = a.size - b.size;
  if (added > 0) additions.push([t, added]);
}
if (problems === 0) {
  ok(`every pre-existing row survives 0022 unchanged: ${preserved} rows across ${before.size} tables`);
}
for (const [t, n] of additions) {
  const want = INTENDED_ADDITIONS[t];
  if (want === n) ok(`${t}: +${n} row(s), exactly what 0022 declares it adds`);
  else bad(`${t}: +${n} row(s), but 0022 declares ${want === undefined ? 'none' : want}`);
}
for (const [t, want] of Object.entries(INTENDED_ADDITIONS)) {
  if (!additions.some(([x]) => x === t)) bad(`${t}: 0022 declares +${want} row(s) and added none`);
}
const rolesAfter = await withDb(UPGRADED, roles);
const lost = rolesBefore.filter((r) => !rolesAfter.some((x) => x.rolname === r.rolname
  && x.rolcanlogin === r.rolcanlogin && x.rolsuper === r.rolsuper));
if (lost.length === 0) ok(`all ${rolesBefore.length} pre-existing roles unchanged in name and login posture`);
else bad(`roles changed across 0022: ${lost.map((r) => r.rolname).join(', ')}`);
const newRoles = await withDb(UPGRADED, async (c) =>
  (await c.query(`select code from identity.roles where code in ('collection_manager','collection_agent') order by 1`)).rows);
if (newRoles.length === 2) ok('0022 registered collection_manager and collection_agent');
else bad(`0022 registered ${newRoles.length} of the 2 expected observation roles`);
const rerun = suite(UPGRADED, PHASE0_ONLY, 'Phase 0 authority behaviour after 0022');
if (seeded !== null && rerun !== null && seeded !== rerun) {
  bad(`the Phase 0 suite reported ${seeded} before and ${rerun} after — the same suite must report the same count`);
}

console.log('\n4. the upgraded schema equals a virgin 0001–0022 schema');
await recreate(VIRGIN);
const allFiles = migrate(VIRGIN, null);
ok(`virgin database migrated 0001–0022 (${allFiles} files)`);
const su = await withDb(UPGRADED, schemaDigest);
const sv = await withDb(VIRGIN, schemaDigest);
if (su.digest === sv.digest) ok(`schema digests match exactly: ${su.digest.slice(0, 16)}…`);
else {
  bad('the upgraded schema differs from the virgin schema');
  for (const k of Object.keys(su.parts)) {
    if (su.parts[k] === sv.parts[k]) continue;
    const a = new Set(su.parts[k].split('\n'));
    const b = new Set(sv.parts[k].split('\n'));
    const onlyUp = [...a].filter((x) => !b.has(x)).slice(0, 4);
    const onlyVi = [...b].filter((x) => !a.has(x)).slice(0, 4);
    console.log(`    ${k}: upgraded-only ${onlyUp.length}, virgin-only ${onlyVi.length}`);
    for (const l of [...onlyUp, ...onlyVi]) console.log(`      ${l.slice(0, 160)}`);
  }
}

console.log('\n5. the Phase 1 integration suite against the UPGRADED database');
suite(UPGRADED, PHASE1_ONLY, 'Phase 1 suites on upgraded data');

console.log(`\n=== ${failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`} ===\n`);
process.exit(failures === 0 ? 0 : 1);
