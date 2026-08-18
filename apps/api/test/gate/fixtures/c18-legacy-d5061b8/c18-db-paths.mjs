#!/usr/bin/env node
/**
 * C18 — DUAL-PATH DATABASE HISTORY PROOF (tracked, deterministic runner).
 *
 * PATH A (rebuild-forward): an ISOLATED postgres instance receives the historical migrations
 *   0001–0012 exactly (byte-verified copies of the tracked files, applied by an unchanged copy
 *   of the tracked migration runner), is seeded ONLY through the historically valid governed
 *   ports (lib/c18-seed-0012.mjs — no direct DML anywhere), snapshotted completely, upgraded
 *   with the unchanged 0013–0021, snapshotted again, and judged against the code-owned
 *   contract in lib/c18-contract.mjs.
 * PATH B (virgin latest): a SECOND isolated instance receives 0001–0021 directly and proves
 *   the latest schema, role posture, privileges and behavioural suites independently. The
 *   normalized catalog posture of PATH A (upgraded) must equal PATH B (virgin) exactly.
 *
 * Replaces scripts/verify-db-paths.sh, which moved tracked migrations aside, hardcoded 0012
 * as latest, seeded with superuser DML, compared only counts and a single hash, inferred suite
 * success by tailing logs, and reused one database and one credential set across both paths.
 * This runner does none of those things:
 *   * tracked migrations are never moved or hidden — subsets are BYTE-VERIFIED COPIES in a
 *     temporary workspace outside the repository;
 *   * the historical/latest boundary comes from the code-owned contract, not a hardcode;
 *   * per-run container names, database names, ports and CREDENTIALS are generated fresh for
 *     each path and never shared;
 *   * every command's raw stdout, stderr and exit status is captured as evidence;
 *   * failure evidence is written on every exit path, and containers are always removed;
 *   * final mode is bound to --expected-sha and refuses every development seam.
 *
 * Usage:
 *   node scripts/gate/c18-db-paths.mjs run    --out DIR [--final --expected-sha SHA]
 *                                             [--skip-suites] [--keep-containers]
 *   node scripts/gate/c18-db-paths.mjs verify --zip FILE --root DIR
 */
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  ALLOWED_TRANSFORMS, HISTORICAL_LAST, LATEST_LAST, SNAPSHOT_SCHEMAS, SUITE_MATRIX,
  compareSnapshots, comparePosture, orderedMigrations, verifyChainRows, verifyIsolation,
  verifyLinkage, verifyMigrationLedger, verifySuiteReceipts,
} from './lib/c18-contract.mjs';
import { seedThroughEraPorts } from './lib/c18-seed-0012.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'apps', 'api', 'migrations');
const MIGRATE_RUNNER = join(ROOT, 'apps', 'api', 'scripts', 'migrate.mjs');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const CHECKSUM_FILE = 'SHA256SUMS.txt';

/** Secrets generated per PATH — never shared, never logged, digests recorded as evidence. */
const ROLE_PASSWORD_KEYS = [
  'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD', 'EYE_DB_SYSTEM_PASSWORD',
  'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD', 'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD',
  'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD', 'EYE_REDIS_PASSWORD',
];

function composeImages() {
  const text = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  const postgres = /image:\s*(postgres@sha256:[0-9a-f]{64})/.exec(text)?.[1];
  const redis = /image:\s*(redis@sha256:[0-9a-f]{64})/.exec(text)?.[1];
  if (!postgres || !redis) throw new Error('docker-compose.yml does not pin postgres/redis images by digest');
  return { postgres, redis };
}

function trackedMigrationDigests() {
  const { files, problems } = orderedMigrations(readdirSync(MIGRATIONS_DIR));
  if (problems.length > 0) throw new Error(`tracked migrations are malformed: ${problems.join('; ')}`);
  return new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS_DIR, f)))]));
}

class Evidence {
  constructor(outDir) {
    this.out = outDir;
    this.raw = join(outDir, 'raw');
    this.commands = [];
    this.seq = 0;
    mkdirSync(this.raw, { recursive: true });
  }

  /** Run one command, capture raw stdout/stderr/exit as evidence, enforce a hard timeout. */
  run(label, argv, { env = {}, cwd = ROOT, timeoutMs = 120_000, allowFail = false, input } = {}) {
    this.seq += 1;
    const id = `${String(this.seq).padStart(3, '0')}-${label.replace(/[^a-z0-9-]+/gi, '_').slice(0, 60)}`;
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd, env: { ...process.env, ...env }, encoding: 'utf8',
      timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, input,
    });
    const exit = r.status === null ? `signal:${r.signal ?? 'timeout'}` : r.status;
    writeFileSync(join(this.raw, `${id}.stdout.txt`), r.stdout ?? '');
    writeFileSync(join(this.raw, `${id}.stderr.txt`), r.stderr ?? '');
    writeFileSync(join(this.raw, `${id}.exit.txt`), `${exit}\n`);
    this.commands.push({ id, label, argv: argv.map(String), exit, timeout_ms: timeoutMs });
    if (!allowFail && exit !== 0) {
      throw new Error(`${label} failed (exit ${exit}): ${(r.stderr ?? '').slice(-1500) || (r.stdout ?? '').slice(-500)}`);
    }
    return { exit, stdout: r.stdout ?? '', stderr: r.stderr ?? '', id };
  }
}

/** One isolated database instance: fresh container, fresh credentials, fresh names. */
function startInstance(ev, letter, images) {
  const runId = randomBytes(4).toString('hex');
  const name = `c18-${letter}-${runId}`;
  const database = `eye_${letter}_${runId}`;
  const passwords = Object.fromEntries(ROLE_PASSWORD_KEYS.map((k) => [k, randomBytes(24).toString('hex')]));
  ev.run(`${letter}-pg-run`, ['docker', 'run', '-d', '--name', `${name}-pg`,
    '-e', `POSTGRES_USER=eye`, '-e', `POSTGRES_PASSWORD=${passwords.EYE_DB_PASSWORD}`,
    '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1:0:5432', images.postgres]);
  ev.run(`${letter}-redis-run`, ['docker', 'run', '-d', '--name', `${name}-redis`,
    '-p', '127.0.0.1:0:6379', images.redis,
    'redis-server', '--requirepass', passwords.EYE_REDIS_PASSWORD]);
  const portOf = (container, inner) => {
    const r = ev.run(`${letter}-port-${inner}`, ['docker', 'port', container, String(inner)]);
    const m = /:(\d+)\s*$/m.exec(r.stdout.trim());
    if (m === null) throw new Error(`cannot resolve mapped port for ${container}`);
    return Number(m[1]);
  };
  const port = portOf(`${name}-pg`, 5432);
  const redisPort = portOf(`${name}-redis`, 6379);
  // Readiness, bounded — and proofed against the official image's init race: the entrypoint
  // runs a TEMPORARY initdb-phase server that answers on the UNIX SOCKET and then restarts.
  // Probing over TCP (which the temporary server never opens) plus a real authenticated
  // `select 1` guarantees the REAL server is the one answering before anything connects.
  let ready = false;
  for (let i = 0; i < 90 && !ready; i += 1) {
    const probe = ev.run(`${letter}-pg-wait-${i}`,
      ['docker', 'exec', `${name}-pg`, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'eye', '-d', database],
      { allowFail: true, timeoutMs: 10_000 });
    if (probe.exit === 0) {
      const confirm = ev.run(`${letter}-pg-confirm-${i}`,
        ['docker', 'exec', '-e', `PGPASSWORD=${passwords.EYE_DB_PASSWORD}`, `${name}-pg`,
          'psql', '-h', '127.0.0.1', '-X', '-At', '-U', 'eye', '-d', database, '-c', 'select 1'],
        { allowFail: true, timeoutMs: 10_000 });
      ready = confirm.exit === 0 && confirm.stdout.trim() === '1';
    }
    if (!ready) spawnSync('sleep', ['1']);
  }
  if (!ready) throw new Error(`postgres instance ${name}-pg never became ready`);
  return {
    letter, name, database, port, redisPort, passwords,
    container: `${name}-pg`, redisContainer: `${name}-redis`,
    envFor(extra = {}) {
      return {
        EYE_DB_HOST: '127.0.0.1', EYE_DB_PORT: String(port), EYE_DB_NAME: database,
        EYE_DB_MIGRATE_PASSWORD: passwords.EYE_DB_PASSWORD,
        EYE_REDIS_HOST: '127.0.0.1', EYE_REDIS_PORT: String(redisPort),
        EYE_IDENTITY_JWT_SECRET: passwords.EYE_TEST_ADMIN_PASSWORD + passwords.EYE_TEST_BOOTSTRAP_PASSWORD,
        ...Object.fromEntries(ROLE_PASSWORD_KEYS.map((k) => [k, passwords[k]])),
        ...extra,
      };
    },
    psql(sql, { user = 'eye', db = database, allowFail = false, label = 'psql' } = {}) {
      return ev.run(`${letter}-${label}`, ['docker', 'exec', '-e', `PGPASSWORD=${passwords.EYE_DB_PASSWORD}`,
        '-i', `${name}-pg`, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', user, '-d', db, '-c', sql],
      { allowFail, timeoutMs: 300_000 });
    },
    json(sql, label = 'json') {
      const r = this.psql(sql, { label });
      const text = r.stdout.trim();
      return text === '' ? null : JSON.parse(text);
    },
  };
}

/**
 * A migration WORKSPACE outside the repository: byte-verified copies of the tracked runner and
 * a tracked-migration subset. The tracked tree is never touched.
 */
function migrationWorkspace(label, upTo, digests) {
  const ws = mkdtempSync(join(tmpdir(), `c18-${label}-`));
  mkdirSync(join(ws, 'scripts'), { recursive: true });
  mkdirSync(join(ws, 'migrations'), { recursive: true });
  // The runner copy resolves its driver from the application's own dependency tree; the
  // tracked source tree itself is never written to.
  symlinkSync(join(ROOT, 'apps', 'api', 'node_modules'), join(ws, 'node_modules'), 'dir');
  cpSync(MIGRATE_RUNNER, join(ws, 'scripts', 'migrate.mjs'));
  if (sha256(readFileSync(join(ws, 'scripts', 'migrate.mjs'))) !== sha256(readFileSync(MIGRATE_RUNNER))) {
    throw new Error('workspace migrate runner copy is not byte-identical');
  }
  extendWorkspace(ws, '0000', upTo, digests);
  return ws;
}
function extendWorkspace(ws, after, upTo, digests) {
  for (const [f, digest] of digests) {
    if (f.slice(0, 4) > after && f.slice(0, 4) <= upTo) {
      cpSync(join(MIGRATIONS_DIR, f), join(ws, 'migrations', f));
      if (sha256(readFileSync(join(ws, 'migrations', f))) !== digest) {
        throw new Error(`workspace copy of ${f} is not byte-identical to the tracked migration`);
      }
    }
  }
}

/** Complete state snapshot: rows, relationships, catalog posture, audit, ledger. */
function snapshot(inst, label) {
  const schemasIn = SNAPSHOT_SCHEMAS.map((s) => `'${s}'`).join(',');
  const tablesMeta = inst.json(`
    select coalesce(json_agg(json_build_object(
      'table', t.table_schema || '.' || t.table_name,
      'columns', (select json_agg(c.column_name order by c.ordinal_position)
                    from information_schema.columns c
                   where c.table_schema = t.table_schema and c.table_name = t.table_name),
      'pk', (select coalesce(json_agg(a.attname order by k.ord), '[]'::json)
               from pg_index i
               join pg_class cl on cl.oid = i.indrelid
               join pg_namespace n on n.oid = cl.relnamespace
               cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = cl.oid and a.attnum = k.attnum
              where i.indisprimary and n.nspname = t.table_schema and cl.relname = t.table_name)
    ) order by t.table_schema, t.table_name), '[]'::json)
    from information_schema.tables t
    where t.table_schema in (${schemasIn}) and t.table_type = 'BASE TABLE'`, `${label}-tables-meta`);
  const tables = {};
  for (const m of tablesMeta ?? []) {
    const pk = m.pk.length > 0 ? m.pk : m.columns;
    const order = pk.map((c) => `t."${c}"`).join(',');
    const rows = inst.json(
      `select coalesce(json_agg(to_jsonb(t) order by ${order}), '[]'::json) from ${m.table} t`,
      `${label}-rows-${m.table.replace('.', '_')}`,
    ) ?? [];
    tables[m.table] = { pk, columns: m.columns, rows, row_count: rows.length };
  }
  const fkMeta = inst.json(`
    select coalesce(json_agg(json_build_object(
      'constraint', n.nspname || '.' || cl.relname || '.' || c.conname,
      'from', n.nspname || '.' || cl.relname,
      'to', fn.nspname || '.' || fcl.relname,
      'cols', (select json_agg(a.attname order by k.ord)
                 from unnest(c.conkey) with ordinality k(attnum, ord)
                 join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
    ) order by n.nspname, cl.relname, c.conname), '[]'::json)
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class fcl on fcl.oid = c.confrelid
    join pg_namespace fn on fn.oid = fcl.relnamespace
    where c.contype = 'f' and n.nspname in (${schemasIn})`, `${label}-fk-meta`);
  const fks = (fkMeta ?? []).map((f) => {
    const cols = f.cols.map((c) => `t."${c}"::text`).join(` || '|' || `);
    const notNull = f.cols.map((c) => `t."${c}" is not null`).join(' and ');
    const pairs = inst.json(
      `select coalesce(json_agg(x order by x), '[]'::json)
         from (select ${cols} as x from ${f.from} t where ${notNull}) s`,
      `${label}-fk-${f.constraint.replace(/\./g, '_').slice(0, 40)}`,
    ) ?? [];
    return {
      constraint: f.constraint, from: f.from, to: f.to,
      pairs_count: pairs.length, pairs_digest: sha256(JSON.stringify(pairs)),
    };
  });
  const posture = {
    roles: inst.json(`
      select coalesce(json_agg(json_build_object('role', rolname, 'login', rolcanlogin,
        'super', rolsuper, 'createrole', rolcreaterole, 'createdb', rolcreatedb,
        'bypassrls', rolbypassrls, 'inherit', rolinherit) order by rolname), '[]'::json)
      from pg_roles where rolname like 'eye%'`, `${label}-roles`),
    memberships: inst.json(`
      select coalesce(json_agg(r.rolname || '->' || m.rolname order by r.rolname, m.rolname), '[]'::json)
      from pg_auth_members am
      join pg_roles r on r.oid = am.member join pg_roles m on m.oid = am.roleid
      where r.rolname like 'eye%' or m.rolname like 'eye%'`, `${label}-memberships`),
    table_grants: inst.json(`
      select coalesce(json_agg(grantee || '|' || table_schema || '.' || table_name || '|' || privilege_type
        order by grantee, table_schema, table_name, privilege_type), '[]'::json)
      from information_schema.role_table_grants
      where table_schema in (${schemasIn}) and grantee like 'eye%'`, `${label}-table-grants`),
    routines: inst.json(`
      select coalesce(json_agg(json_build_object(
        'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        'secdef', p.prosecdef, 'owner', p.proowner::regrole::text,
        'acl', coalesce(p.proacl::text, ''))
        order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in (${schemasIn}, 'canon')`, `${label}-routines`),
    rls: inst.json(`
      select coalesce(json_agg(json_build_object(
        'table', n.nspname || '.' || c.relname,
        'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity) order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (${schemasIn}) and c.relkind = 'r'`, `${label}-rls`),
    policies: inst.json(`
      select coalesce(json_agg(json_build_object(
        'table', schemaname || '.' || tablename, 'name', policyname, 'cmd', cmd,
        'roles', roles::text, 'qual', coalesce(qual, ''), 'check', coalesce(with_check, ''))
        order by schemaname, tablename, policyname), '[]'::json)
      from pg_policies where schemaname in (${schemasIn})`, `${label}-policies`),
    columns: inst.json(`
      select coalesce(json_agg(table_schema || '.' || table_name || '|' || column_name || '|' ||
        data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
        order by table_schema, table_name, column_name), '[]'::json)
      from information_schema.columns where table_schema in (${schemasIn})`, `${label}-columns`),
    constraints: inst.json(`
      select coalesce(json_agg(n.nspname || '.' || cl.relname || '|' || c.conname || '|' ||
        pg_get_constraintdef(c.oid) order by n.nspname, cl.relname, c.conname), '[]'::json)
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace where n.nspname in (${schemasIn})`, `${label}-constraints`),
    indexes: inst.json(`
      select coalesce(json_agg(schemaname || '.' || tablename || '|' || indexname || '|' || indexdef
        order by schemaname, tablename, indexname), '[]'::json)
      from pg_indexes where schemaname in (${schemasIn})`, `${label}-indexes`),
  };
  const ledger = inst.json(`
    select coalesce(json_agg(json_build_object('filename', filename, 'digest', digest,
      'applied_at', applied_at::text) order by filename), '[]'::json)
    from public.schema_migrations`, `${label}-ledger`) ?? [];
  const audit = {
    events: inst.json(`
      select coalesce(json_agg(json_build_object('partition_id', partition_id, 'audit_seq', audit_seq,
        'event_jcs', event_jcs, 'previous_hash', previous_hash, 'row_hash', row_hash,
        'hash_alg_version', hash_alg_version, 'correlation_id', correlation_id,
        'policy_decision_id', (event_jcs::jsonb)->>'policy_decision_id')
        order by partition_id, audit_seq), '[]'::json)
      from audit.audit_events`, `${label}-audit-events`) ?? [],
    heads: inst.json(`
      select coalesce(json_agg(json_build_object('partition_id', partition_id, 'next_seq', next_seq,
        'head_hash', head_hash, 'frozen', frozen) order by partition_id), '[]'::json)
      from audit.audit_chain_heads`, `${label}-audit-heads`) ?? [],
  };
  return { label, tables, fks, posture, ledger, audit };
}

function credentialDigests(passwords) {
  return Object.fromEntries(Object.entries(passwords).map(([k, v]) => [k, sha256(`c18:${k}:${v}`)]));
}

function runSuites(ev, inst, pathLabel, receipts, { skip }) {
  for (const [suite, spec] of Object.entries(SUITE_MATRIX)) {
    if (!spec.runs_on.includes(pathLabel)) continue;
    if (skip) {
      receipts.push({ suite, path: pathLabel, exit_status: 0, skipped_by_dev_seam: true, stdout_file: '-', stderr_file: '-' });
      continue;
    }
    const r = ev.run(`${inst.letter}-suite-${suite}`, spec.command,
      { env: inst.envFor(), timeoutMs: 900_000, allowFail: true });
    receipts.push({
      suite, path: pathLabel, exit_status: r.exit,
      stdout_file: `raw/${r.id}.stdout.txt`, stderr_file: `raw/${r.id}.stderr.txt`,
    });
    if (r.exit !== 0) throw new Error(`suite '${suite}' failed on ${pathLabel} (exit ${r.exit})`);
  }
}

function packEvidence(outDir, sourceSha) {
  const files = [];
  const walk = (d, base) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      if (lstatSync(abs).isDirectory()) walk(abs, base);
      else files.push(relative(base, abs));
    }
  };
  walk(outDir, outDir);
  const lines = files.filter((f) => f !== CHECKSUM_FILE && !f.endsWith('.zip') && !f.endsWith('.zip.sha256'))
    .map((f) => `${sha256(readFileSync(join(outDir, f)))}  ${f}`).sort();
  writeFileSync(join(outDir, CHECKSUM_FILE), `${lines.join('\n')}\n`);
  const zipName = `c18-db-paths-evidence-${sourceSha}.zip`;
  const zip = join(outDir, zipName);
  const r = spawnSync('zip', ['-qrX', zip, '.', '-x', zipName, `${zipName}.sha256`], { cwd: outDir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`evidence zip failed: ${r.stderr}`);
  const digest = sha256(readFileSync(zip));
  writeFileSync(`${zip}.sha256`, `${digest}  ${zipName}\n`);
  return { zip, digest, files: lines.length };
}

function argMap(argv, booleans) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    if (Object.prototype.hasOwnProperty.call(out, a)) throw new Error(`duplicate argument ${a}`);
    if (booleans.has(a)) { out[a] = true; continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} requires a value`);
    out[a] = v; i += 1;
  }
  return out;
}

async function runCommand(args) {
  const allowed = new Set(['--out', '--final', '--expected-sha', '--skip-suites', '--keep-containers']);
  for (const k of Object.keys(args)) if (k.startsWith('--') && !allowed.has(k)) throw new Error(`unknown argument ${k}`);
  const outDir = args['--out'];
  if (typeof outDir !== 'string' || outDir.length === 0) throw new Error('--out is required');
  const final = args['--final'] === true;
  const expectedSha = args['--expected-sha'] ?? null;
  const skipSuites = args['--skip-suites'] === true;
  const keep = args['--keep-containers'] === true;
  if (final && (skipSuites || keep)) throw new Error('final mode refuses every development seam (--skip-suites/--keep-containers)');
  if (final && !/^[0-9a-f]{40}$/.test(expectedSha ?? '')) throw new Error('final mode requires --expected-sha <40-hex>');

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (final) {
    if (head !== expectedSha) throw new Error(`final mode: HEAD ${head} != --expected-sha ${expectedSha}`);
    if (dirty !== '') {
      throw new Error(
        `final mode requires a clean worktree; ${dirty.split('\n').length} path(s) are dirty:\n${dirty}`,
      );
    }
    const rel = relative(ROOT, resolve(outDir));
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      throw new Error('final mode requires --out OUTSIDE the repository');
    }
  }
  mkdirSync(outDir, { recursive: true });
  const ev = new Evidence(outDir);
  const cleanup = [];
  const failure = (phase, e) => {
    writeFileSync(join(outDir, 'RESULT-FAIL.txt'),
      `outcome: FAIL\nphase: ${phase}\nsource_sha: ${head}\nerror: ${e instanceof Error ? e.message : e}\n`);
    writeFileSync(join(outDir, 'commands.json'), `${JSON.stringify(ev.commands, null, 2)}\n`);
  };
  let phase = 'preflight';
  try {
    const images = composeImages();
    const digests = trackedMigrationDigests();
    const problems = [];

    // ── PATH A ─────────────────────────────────────────────────────────────
    phase = 'path-a-provision';
    const a = startInstance(ev, 'a', images);
    cleanup.push(a);
    phase = 'path-a-historical-migrate';
    const wsA = migrationWorkspace('a', HISTORICAL_LAST, digests);
    cleanup.push({ ws: wsA });
    ev.run('a-migrate-historical', ['node', join(wsA, 'scripts', 'migrate.mjs')], { env: a.envFor() });
    phase = 'path-a-seed';
    const seedRecord = await seedThroughEraPorts({
      root: ROOT, host: '127.0.0.1', port: a.port, database: a.database,
      passwords: a.passwords, log: (m) => ev.commands.push({ id: `seed`, label: m, argv: [], exit: 0 }),
    });
    writeFileSync(join(outDir, 'path-a-seed-record.json'), `${JSON.stringify(seedRecord, null, 2)}\n`);
    phase = 'path-a-snapshot-before';
    const before = snapshot(a, 'a-before');
    writeFileSync(join(outDir, 'path-a-before.json'), `${JSON.stringify(before, null, 2)}\n`);
    phase = 'path-a-upgrade';
    extendWorkspace(wsA, HISTORICAL_LAST, LATEST_LAST, digests);
    ev.run('a-migrate-upgrade', ['node', join(wsA, 'scripts', 'migrate.mjs')], { env: a.envFor() });
    phase = 'path-a-snapshot-after';
    const after = snapshot(a, 'a-after');
    writeFileSync(join(outDir, 'path-a-after.json'), `${JSON.stringify(after, null, 2)}\n`);

    phase = 'path-a-compare';
    problems.push(...compareSnapshots(before, after, ALLOWED_TRANSFORMS).map((p) => `path-a: ${p}`));
    problems.push(...verifyChainRows({ events: before.audit.events, heads: before.audit.heads }).map((p) => `path-a-before: ${p}`));
    problems.push(...verifyChainRows({
      events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events,
    }).map((p) => `path-a-after: ${p}`));
    problems.push(...verifyLinkage({
      auditEvents: after.audit.events,
      decisions: (after.tables['policy.policy_decisions']?.rows ?? []).map((r) => ({ id: r.id })),
      outbox: (after.tables['objects.object_outbox']?.rows ?? []),
    }).map((p) => `path-a-linkage: ${p}`));
    problems.push(...verifyMigrationLedger({
      trackedDigests: digests, ledger: before.ledger, expectLast: HISTORICAL_LAST,
    }).map((p) => `path-a-before-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({
      trackedDigests: digests, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger,
    }).map((p) => `path-a-after-ledger: ${p}`));

    // ── PATH B ─────────────────────────────────────────────────────────────
    phase = 'path-b-provision';
    const b = startInstance(ev, 'b', images);
    cleanup.push(b);
    phase = 'path-b-migrate';
    const wsB = migrationWorkspace('b', LATEST_LAST, digests);
    cleanup.push({ ws: wsB });
    ev.run('b-migrate-latest', ['node', join(wsB, 'scripts', 'migrate.mjs')], { env: b.envFor() });
    phase = 'path-b-snapshot';
    const virgin = snapshot(b, 'b-virgin');
    writeFileSync(join(outDir, 'path-b-virgin.json'), `${JSON.stringify(virgin, null, 2)}\n`);
    problems.push(...verifyMigrationLedger({
      trackedDigests: digests, ledger: virgin.ledger, expectLast: LATEST_LAST,
    }).map((p) => `path-b-ledger: ${p}`));
    phase = 'posture-equivalence';
    problems.push(...comparePosture(after.posture, virgin.posture));

    // ── RECEIPTS + ISOLATION ───────────────────────────────────────────────
    phase = 'receipts';
    const receiptFor = (inst) => ({
      container_name: inst.container, redis_container: inst.redisContainer,
      database: inst.database, port: inst.port, redis_port: inst.redisPort,
      postgres_image: images.postgres, redis_image: images.redis,
      credential_digests: credentialDigests(inst.passwords),
    });
    const receiptA = { path: 'path-a-upgraded', ...receiptFor(a) };
    const receiptB = { path: 'path-b-virgin', ...receiptFor(b) };
    problems.push(...verifyIsolation(receiptA, receiptB));

    if (problems.length > 0) {
      writeFileSync(join(outDir, 'comparison-problems.json'), `${JSON.stringify(problems, null, 2)}\n`);
      throw new Error(`C18 contract violations (${problems.length}):\n  ${problems.slice(0, 20).join('\n  ')}`);
    }

    // ── SUITES per the code-owned matrix ───────────────────────────────────
    phase = 'suites';
    const suiteReceipts = [];
    runSuites(ev, a, 'path-a-upgraded', suiteReceipts, { skip: skipSuites });
    runSuites(ev, b, 'path-b-virgin', suiteReceipts, { skip: skipSuites });
    const suiteProblems = skipSuites ? [] : verifySuiteReceipts(SUITE_MATRIX, suiteReceipts);
    if (suiteProblems.length > 0) throw new Error(`suite matrix violations: ${suiteProblems.join('; ')}`);

    phase = 'package';
    const manifest = {
      gate: 'C18', mode: final ? 'final' : 'preliminary', source_sha: head,
      worktree_clean: dirty === '', skip_suites_dev_seam: skipSuites,
      historical_last: HISTORICAL_LAST, latest_last: LATEST_LAST,
      migration_digests: Object.fromEntries(digests),
      allowed_transforms: ALLOWED_TRANSFORMS, suite_matrix: SUITE_MATRIX,
      receipts: { 'path-a-upgraded': receiptA, 'path-b-virgin': receiptB },
      suite_receipts: suiteReceipts,
      seed_summary: {
        tenants: seedRecord.tenants.length, domains: seedRecord.domains.length,
        principals: seedRecord.principals.length + 1, sessions: seedRecord.sessions.length,
        objects: seedRecord.objects.length, outbox: seedRecord.outbox.length,
        decisions: seedRecord.decisions.length,
      },
    };
    writeFileSync(join(outDir, 'c18-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(outDir, 'commands.json'), `${JSON.stringify(ev.commands, null, 2)}\n`);
    writeFileSync(join(outDir, 'RESULT-PASS.txt'),
      `outcome: PASS\nmode: ${manifest.mode}\nsource_sha: ${head}\npaths: path-a-upgraded, path-b-virgin\n`);
    const packed = packEvidence(outDir, head);
    console.log(`C18 dual-path proof: PASS`);
    console.log(`  evidence: ${packed.zip}`);
    console.log(`  sha256:   ${packed.digest}`);
    if (process.env.GITHUB_ENV) {
      writeFileSync(process.env.GITHUB_ENV, `C18_ZIP=${packed.zip}\nC18_ZIP_SHA256=${packed.digest}\n`, { flag: 'a' });
    }
  } catch (e) {
    failure(phase, e);
    throw e;
  } finally {
    for (const c of cleanup) {
      if (c.ws) rmSync(c.ws, { recursive: true, force: true });
      else if (!keep) {
        spawnSync('docker', ['rm', '-f', c.container], { encoding: 'utf8' });
        spawnSync('docker', ['rm', '-f', c.redisContainer], { encoding: 'utf8' });
      }
    }
  }
}

/** Offline verification of a delivered evidence archive against a checkout. */
export async function verifyEvidence({ zipPath, root }) {
  const problems = [];
  const notes = [];
  if (!existsSync(zipPath)) return { ok: false, problems: [`archive ${zipPath} does not exist`], notes };
  const tmp = mkdtempSync(join(tmpdir(), 'c18-verify-'));
  try {
    const x = spawnSync('unzip', ['-q', zipPath, '-d', tmp], { encoding: 'utf8' });
    if (x.status !== 0) return { ok: false, problems: ['extraction failed'], notes };
    // Checksums: complete, non-self-referential, all recomputed.
    const sumPath = join(tmp, CHECKSUM_FILE);
    if (!existsSync(sumPath)) problems.push(`archive has no ${CHECKSUM_FILE}`);
    else {
      const listed = new Set();
      for (const line of readFileSync(sumPath, 'utf8').split('\n').filter(Boolean)) {
        const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
        if (m === null) { problems.push(`malformed checksum line: ${line.slice(0, 60)}`); continue; }
        if (m[2] === CHECKSUM_FILE) problems.push('checksum manifest lists itself');
        listed.add(m[2]);
        const abs = join(tmp, m[2]);
        if (!existsSync(abs)) problems.push(`checksum names missing file '${m[2]}'`);
        else if (sha256(readFileSync(abs)) !== m[1]) problems.push(`'${m[2]}' does not hash to its manifest digest`);
      }
      const walk = (d, base, out) => {
        for (const name of readdirSync(d).sort()) {
          const abs = join(d, name);
          if (lstatSync(abs).isDirectory()) walk(abs, base, out);
          else out.push(relative(base, abs));
        }
      };
      const actual = [];
      walk(tmp, tmp, actual);
      for (const f of actual) {
        if (f !== CHECKSUM_FILE && !listed.has(f)) problems.push(`file '${f}' is not bound by the checksum manifest`);
      }
    }
    const manifest = JSON.parse(readFileSync(join(tmp, 'c18-manifest.json'), 'utf8'));
    const before = JSON.parse(readFileSync(join(tmp, 'path-a-before.json'), 'utf8'));
    const after = JSON.parse(readFileSync(join(tmp, 'path-a-after.json'), 'utf8'));
    const virgin = JSON.parse(readFileSync(join(tmp, 'path-b-virgin.json'), 'utf8'));
    if (manifest.skip_suites_dev_seam === true) problems.push('evidence was produced with the --skip-suites development seam; it is not proof');

    // Tracked-migration digests at the CHECKOUT must equal the manifest's and both ledgers'.
    const dir = join(root, 'apps', 'api', 'migrations');
    const { files } = orderedMigrations(readdirSync(dir));
    const tracked = new Map(files.map((f) => [f, sha256(readFileSync(join(dir, f)))]));
    for (const [f, d] of Object.entries(manifest.migration_digests)) {
      if (tracked.get(f) !== d) problems.push(`manifest migration digest for '${f}' does not match the checkout`);
    }
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked, ledger: before.ledger, expectLast: HISTORICAL_LAST }).map((p) => `before-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger }).map((p) => `after-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked, ledger: virgin.ledger, expectLast: LATEST_LAST }).map((p) => `virgin-ledger: ${p}`));

    // The comparison is RE-RUN here from the raw snapshots — the report is not trusted.
    problems.push(...compareSnapshots(before, after, ALLOWED_TRANSFORMS));
    problems.push(...verifyChainRows({ events: before.audit.events, heads: before.audit.heads }));
    problems.push(...verifyChainRows({ events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events }));
    problems.push(...verifyLinkage({
      auditEvents: after.audit.events,
      decisions: (after.tables['policy.policy_decisions']?.rows ?? []).map((r) => ({ id: r.id })),
      outbox: after.tables['objects.object_outbox']?.rows ?? [],
    }));
    problems.push(...comparePosture(after.posture, virgin.posture));
    problems.push(...verifySuiteReceipts(SUITE_MATRIX, manifest.suite_receipts ?? []));
    problems.push(...verifyIsolation(
      manifest.receipts?.['path-a-upgraded'] ?? {}, manifest.receipts?.['path-b-virgin'] ?? {},
    ));
    for (const r of manifest.suite_receipts ?? []) {
      if (r.stdout_file !== '-' && !existsSync(join(tmp, r.stdout_file))) {
        problems.push(`suite receipt '${r.suite}' on ${r.path} names missing raw output ${r.stdout_file}`);
      }
    }
    const result = existsSync(join(tmp, 'RESULT-PASS.txt'))
      ? readFileSync(join(tmp, 'RESULT-PASS.txt'), 'utf8') : null;
    if (result === null) problems.push('archive has no RESULT-PASS receipt');
    else if (!result.includes(`source_sha: ${manifest.source_sha}`)) problems.push('RESULT receipt disagrees with the manifest source SHA');
    notes.push(`source_sha=${manifest.source_sha} mode=${manifest.mode} suites=${(manifest.suite_receipts ?? []).length}`);
    notes.push(`path_a_tables=${Object.keys(before.tables).length}->${Object.keys(after.tables).length} path_b_tables=${Object.keys(virgin.tables).length}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: problems.length === 0, problems, notes };
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'run') {
    await runCommand(argMap(argv.slice(1), new Set(['--final', '--skip-suites', '--keep-containers'])));
    return;
  }
  if (cmd === 'verify') {
    const args = argMap(argv.slice(1), new Set());
    const allowed = new Set(['--zip', '--root']);
    for (const k of Object.keys(args)) if (k.startsWith('--') && !allowed.has(k)) throw new Error(`unknown argument ${k}`);
    if (!args['--zip'] || !args['--root']) throw new Error('verify requires --zip and --root');
    const r = await verifyEvidence({ zipPath: args['--zip'], root: args['--root'] });
    for (const n of r.notes) console.log(`  ${n}`);
    if (!r.ok) {
      console.error('=== C18 EVIDENCE VERIFICATION FAILED ===');
      for (const p of r.problems.slice(0, 40)) console.error(`  ${p}`);
      process.exitCode = 1;
      return;
    }
    console.log('C18 evidence verification: PASS');
    return;
  }
  throw new Error('usage: c18-db-paths.mjs run|verify …');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (e) {
    console.error(`C18 FAILED: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}
