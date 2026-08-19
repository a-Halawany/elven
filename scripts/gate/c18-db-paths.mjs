#!/usr/bin/env node
/**
 * C18.1.2 — DUAL-PATH DATABASE HISTORY PROOF (tracked, deterministic runner + verifier).
 *
 * Supersedes the d5061b8 runner (secret exposure + synthetic acceptance), the 8a23526 runner
 * (raw ctx secret leak) and the 567a70f runner, whose evidence was authentic and leak-free
 * but whose verifier still accepted fully-rebound false packages. This revision adds:
 *
 *   CLOSED COMMAND LEDGER + SOURCE-OWNED COMMAND GRAPH — every executed command is a closed
 *   typed record (position-bound id, unique label, redacted argv, exact cwd, typed redacted
 *   env binding, timeout/exit/signal, byte length + SHA-256 for all three raw streams), and
 *   the verifier walks the whole ledger against a state machine derived from source alone:
 *   missing, duplicate, unknown or reordered commands, forged exits, tampered port/container
 *   receipts and unbound streams all fail.
 *
 *   RAW RECONSTRUCTION EVERYWHERE — all fifteen posture categories and the provisioning and
 *   isolation facts are reconstructed from command-bound raw receipts and value-compared
 *   before any A/B comparison, alongside the existing table/FK/ledger/audit reconstruction.
 *
 *   CLOSED SEED RECORD + EXACT CLOSURE — the seed record is a closed schema bound
 *   bidirectionally (ids, counts, relationships) against the authenticated snapshots; the
 *   manifest seed_summary is derived, never trusted; the closure decision must be a real
 *   enforced allow (decision='allow', evidence_only=false) carrying the exact principal,
 *   tenant, domain, scope, action, object target and correlation of the one finalized
 *   operation, whose eventId/effectRef/target-suffix identity is bound to a real outbox row;
 *   audit table rows are cross-checked against the audit view with every generated projection
 *   derived from canonical event_jcs.
 *
 *   LIFECYCLE HONESTY — git cleanliness uses --untracked-files=all explicitly; SIGINT and
 *   SIGTERM run the same checked teardown and leave failure evidence; SIGKILL cannot run any
 *   in-process cleanup and that limit is stated rather than papered over.
 *
 * Retained from earlier revisions:
 *
 *   SECRET-FREE EVIDENCE — every recorded argv and captured stream is redacted with structured
 *   `<REDACTED:CLASS>` placeholders; secret-valued snapshot columns are replaced by
 *   domain-separated one-way digests; a blocking self-scan proves no generated secret byte
 *   appears anywhere in the produced evidence or the final ZIP.
 *
 *   LIFECYCLE SAFETY — containers register for cleanup the moment they are created, before
 *   readiness; teardown uses checked `docker rm -fv` on success, failure, timeout, signal and
 *   partial provisioning; a cleanup failure is itself a reported failure; the failure-evidence
 *   boundary wraps argument validation, preflight, provisioning, execution and cleanup; the
 *   output directory must be a fresh, empty, realpath-contained directory outside the repo;
 *   final mode requires HEAD == --expected-sha, a clean worktree before AND after, and an
 *   unchanged tracked-tree digest.
 *
 *   SOURCE-OWNED VERIFICATION — C17-grade ZIP safety, exact member inventory, typed manifest
 *   and RESULT receipts, migration digests derived from the verifier's checkout, audit chains
 *   recomputed with the PRODUCTION JCS canonicalizer and row-hash formula, migration-derived
 *   intentional transforms, full-definition PK/FK comparison, an exact catalog-posture
 *   category set, typed dual-instance isolation, suite receipts bound to raw execution
 *   evidence, and (for delivery standing) online hosted verification of the push/main run,
 *   the blocking C18 step and the digest-bound artifact.
 *
 * Usage:
 *   node scripts/gate/c18-db-paths.mjs run    --out DIR [--final --expected-sha SHA]
 *                                             [--skip-suites] [--keep-containers]
 *   node scripts/gate/c18-db-paths.mjs verify --zip FILE --root DIR [--online] [--require-hosted]
 */
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  AUDIT_HASH_VERSION, C18_ARTIFACT_PREFIX, C18_GATE_STEP, HISTORICAL_LAST, LATEST_LAST,
  MANIFEST_FIELDS, POSTURE_CATEGORIES, POSTURE_COMMAND_LABELS, SECRET_CLASSES, SEED_FLOOR,
  SNAPSHOT_SCHEMAS, SNAPSHOT_SECRET_COLUMNS, SUITE_MATRIX, TABLE_UNIVERSE_HISTORICAL,
  TABLE_UNIVERSE_LATEST, authenticateProjections, c18ArtifactName, c18ArtifactPrefixForAttempt,
  commandIdFor, compareSnapshots, comparePosture, crossCheckAuditTable, deriveIntentionalTransforms,
  deriveSeedSummary, orderedMigrations, parseResultReceipt, redactArgv, redactString, secretDigest,
  verifyAuditShapes, verifyChainRows, verifyCommandGraph, verifyCommandRecords,
  verifyCommandStreams, verifyIsolation, verifyLinkage, verifyManifestShape, verifyMigrationLedger,
  verifyOperationClosure, verifySeedFloor, verifySeedRecordClosed, verifySuiteReceipts,
  verifyTableUniverse,
} from './lib/c18-contract.mjs';
import { seedThroughEraPorts, runPostUpgradeOperation } from './lib/c18-seed-0012.mjs';
import {
  REPOSITORY, apiGet, artifactsUrl, jobsUrl, runUrl, selectAttemptArtifact,
} from './lib/hosted-run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'apps', 'api', 'migrations');
const MIGRATE_RUNNER = join(ROOT, 'apps', 'api', 'scripts', 'migrate.mjs');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const CHECKSUM_FILE = 'SHA256SUMS.txt';
const FIXED_MEMBERS = Object.freeze([
  'c18-manifest.json', 'commands.json', 'path-a-before.json', 'path-a-after.json',
  'path-a-final.json', 'path-b-virgin.json', 'path-a-seed-record.json', 'RESULT-PASS.txt',
]);

function composeImages() {
  const text = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  const postgres = /image:\s*(postgres@sha256:[0-9a-f]{64})/.exec(text)?.[1];
  const redis = /image:\s*(redis@sha256:[0-9a-f]{64})/.exec(text)?.[1];
  if (!postgres || !redis) throw new Error('docker-compose.yml does not pin postgres/redis images by digest');
  return { postgres, redis };
}

function trackedMigrationDigests(root = ROOT) {
  const dir = join(root, 'apps', 'api', 'migrations');
  const { files, problems } = orderedMigrations(readdirSync(dir));
  if (problems.length > 0) throw new Error(`tracked migrations are malformed: ${problems.join('; ')}`);
  return { dir, files, digests: new Map(files.map((f) => [f, sha256(readFileSync(join(dir, f)))])) };
}

/** The production JCS + audit-row-hash implementations, loaded from the checkout under test. */
async function productionAudit(root) {
  const mod = await import(
    pathToFileURL(join(root, 'apps', 'api', 'node_modules', '@eye/contracts', 'dist', 'index.js')).href
  );
  return { jcs: mod.jcsCanonicalize, rowHash: mod.auditRowHash };
}

class Evidence {
  constructor(outDir) {
    this.out = outDir;
    this.raw = join(outDir, 'raw');
    this.commands = [];
    this.seq = 0;
    this.secrets = []; // [class, value] pairs — used ONLY to redact, never recorded.
    mkdirSync(this.raw, { recursive: true });
  }

  addSecrets(prefix, passwords) {
    for (const [cls, value] of Object.entries(passwords)) this.secrets.push([`${prefix}:${cls}`, value]);
  }

  /** Run one command; record a CLOSED typed ledger entry — redacted argv, exact cwd, typed
   * redacted env binding, timeout/exit/signal, and byte length + SHA-256 for all three
   * redacted raw streams — plus the raw stream files themselves. */
  run(label, argv, { env = {}, cwd = ROOT, timeoutMs = 120_000, allowFail = false } = {}) {
    this.seq += 1;
    const id = commandIdFor(this.seq, label);
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd, env: { ...process.env, ...env }, encoding: 'utf8',
      timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024,
    });
    const exit = r.status;
    const signal = r.signal ?? null;
    const stdoutRed = Buffer.from(redactString(r.stdout ?? '', this.secrets));
    const stderrRed = Buffer.from(redactString(r.stderr ?? '', this.secrets));
    const exitText = Buffer.from(`${exit ?? `signal:${signal}`}\n`);
    writeFileSync(join(this.raw, `${id}.stdout.txt`), stdoutRed);
    writeFileSync(join(this.raw, `${id}.stderr.txt`), stderrRed);
    writeFileSync(join(this.raw, `${id}.exit.txt`), exitText);
    const relCwd = relative(ROOT, cwd);
    this.commands.push({
      id, label, argv: redactArgv(argv, this.secrets),
      cwd: relCwd === '' ? '.' : relCwd,
      env: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, redactString(String(v), this.secrets)])),
      timeout_ms: timeoutMs, exit, signal,
      stdout_bytes: stdoutRed.byteLength, stdout_sha256: sha256(stdoutRed),
      stderr_bytes: stderrRed.byteLength, stderr_sha256: sha256(stderrRed),
      exit_bytes: exitText.byteLength, exit_sha256: sha256(exitText),
    });
    if (!allowFail && (exit !== 0 || signal !== null)) {
      throw new Error(`${label} failed (exit ${exit}, signal ${signal}): `
        + `${redactString(((r.stderr ?? '').slice(-1500) || (r.stdout ?? '').slice(-500)), this.secrets)}`);
    }
    return {
      exit, signal, id,
      stdout: redactString(r.stdout ?? '', this.secrets),
      stderr: redactString(r.stderr ?? '', this.secrets),
      rawStdout: r.stdout ?? '',
    };
  }
}

/**
 * One isolated instance: fresh container, fresh credentials, fresh names for every run and
 * every path. Containers REGISTER FOR CLEANUP the moment `docker run` returns, before any
 * readiness probing, so partial provisioning still tears down.
 */
function startInstance(ev, letter, images, cleanup) {
  const runId = randomBytes(4).toString('hex');
  const name = `c18-${letter}-${runId}`;
  const database = `eye_${letter}_${runId}`;
  const passwords = Object.fromEntries(SECRET_CLASSES.map((k) => [k, randomBytes(24).toString('hex')]));
  ev.addSecrets(letter, passwords);
  const inst = {
    letter, name, database, passwords,
    container: `${name}-pg`, redisContainer: `${name}-redis`,
    containerId: null, redisContainerId: null, port: null, redisPort: null,
  };
  const pgRun = ev.run(`${letter}-pg-run`, ['docker', 'run', '-d', '--name', inst.container,
    '-e', 'POSTGRES_USER=eye', '-e', `POSTGRES_PASSWORD=${passwords.EYE_DB_PASSWORD}`,
    '-e', `POSTGRES_DB=${database}`, '-p', '127.0.0.1:0:5432', images.postgres]);
  inst.containerId = pgRun.rawStdout.trim().slice(0, 64);
  cleanup.containers.push(inst.container);
  const redisRun = ev.run(`${letter}-redis-run`, ['docker', 'run', '-d', '--name', inst.redisContainer,
    '-p', '127.0.0.1:0:6379', images.redis,
    'redis-server', '--requirepass', passwords.EYE_REDIS_PASSWORD]);
  inst.redisContainerId = redisRun.rawStdout.trim().slice(0, 64);
  cleanup.containers.push(inst.redisContainer);
  const portOf = (container, inner) => {
    const r = ev.run(`${letter}-port-${inner}`, ['docker', 'port', container, String(inner)]);
    const m = /:(\d+)\s*$/m.exec(r.stdout.trim());
    if (m === null) throw new Error(`cannot resolve mapped port for ${container}`);
    return Number(m[1]);
  };
  inst.port = portOf(inst.container, 5432);
  inst.redisPort = portOf(inst.redisContainer, 6379);
  // Readiness proofed against the official image's initdb race: the temporary init-phase
  // server answers only on the unix socket, so probe TCP and require an authenticated query.
  let ready = false;
  for (let i = 0; i < 90 && !ready; i += 1) {
    const probe = ev.run(`${letter}-pg-wait-${i}`,
      ['docker', 'exec', inst.container, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'eye', '-d', database],
      { allowFail: true, timeoutMs: 10_000 });
    if (probe.exit === 0) {
      const confirm = ev.run(`${letter}-pg-confirm-${i}`,
        ['docker', 'exec', '-e', `PGPASSWORD=${passwords.EYE_DB_PASSWORD}`, inst.container,
          'psql', '-h', '127.0.0.1', '-X', '-At', '-U', 'eye', '-d', database, '-c', 'select 1'],
        { allowFail: true, timeoutMs: 10_000 });
      ready = confirm.exit === 0 && confirm.stdout.trim() === '1';
    }
    if (!ready) spawnSync('sleep', ['1']);
  }
  if (!ready) throw new Error(`postgres instance ${inst.container} never became ready`);
  inst.envFor = (extra = {}) => ({
    EYE_DB_HOST: '127.0.0.1', EYE_DB_PORT: String(inst.port), EYE_DB_NAME: database,
    EYE_DB_MIGRATE_PASSWORD: passwords.EYE_DB_PASSWORD,
    EYE_REDIS_HOST: '127.0.0.1', EYE_REDIS_PORT: String(inst.redisPort),
    EYE_IDENTITY_JWT_SECRET: passwords.EYE_TEST_ADMIN_PASSWORD + passwords.EYE_TEST_BOOTSTRAP_PASSWORD,
    ...Object.fromEntries(SECRET_CLASSES.map((k) => [k, passwords[k]])),
    ...extra,
  });
  inst.psql = (sql, { label = 'psql' } = {}) => ev.run(`${letter}-${label}`,
    ['docker', 'exec', '-e', `PGPASSWORD=${passwords.EYE_DB_PASSWORD}`, '-i', inst.container,
      'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'eye', '-d', database, '-c', sql],
    { timeoutMs: 300_000 });
  inst.json = (sql, label = 'json') => {
    const text = inst.psql(sql, { label }).rawStdout.trim();
    return text === '' ? null : JSON.parse(text);
  };
  return inst;
}

/** Checked teardown: `docker rm -fv` for every registered container; failures are FAILURES. */
function teardown(cleanup, keep) {
  const removed = [];
  const failures = [];
  for (const ws of cleanup.workspaces) rmSync(ws, { recursive: true, force: true });
  if (keep) return { removed, failures, kept: cleanup.containers.slice() };
  for (const c of cleanup.containers) {
    const r = spawnSync('docker', ['rm', '-fv', c], { encoding: 'utf8', timeout: 60_000 });
    if (r.status === 0) removed.push(c);
    else failures.push(`docker rm -fv ${c} exited ${r.status}: ${(r.stderr ?? '').trim().slice(0, 200)}`);
  }
  for (const c of cleanup.containers) {
    const check = spawnSync('docker', ['inspect', c], { encoding: 'utf8', timeout: 30_000 });
    if (check.status === 0) failures.push(`container ${c} STILL EXISTS after checked removal`);
  }
  return { removed, failures, kept: [] };
}

function migrationWorkspace(label, upTo, tracked, cleanup) {
  const ws = mkdtempSync(join(tmpdir(), `c18-${label}-`));
  cleanup.workspaces.push(ws);
  mkdirSync(join(ws, 'scripts'), { recursive: true });
  mkdirSync(join(ws, 'migrations'), { recursive: true });
  symlinkSync(join(ROOT, 'apps', 'api', 'node_modules'), join(ws, 'node_modules'), 'dir');
  cpSync(MIGRATE_RUNNER, join(ws, 'scripts', 'migrate.mjs'));
  if (sha256(readFileSync(join(ws, 'scripts', 'migrate.mjs'))) !== sha256(readFileSync(MIGRATE_RUNNER))) {
    throw new Error('workspace migrate runner copy is not byte-identical');
  }
  extendWorkspace(ws, '0000', upTo, tracked);
  return ws;
}
function extendWorkspace(ws, after, upTo, tracked) {
  for (const [f, digest] of tracked.digests) {
    if (f.slice(0, 4) > after && f.slice(0, 4) <= upTo) {
      cpSync(join(tracked.dir, f), join(ws, 'migrations', f));
      if (sha256(readFileSync(join(ws, 'migrations', f))) !== digest) {
        throw new Error(`workspace copy of ${f} is not byte-identical to the tracked migration`);
      }
    }
  }
}

/** Complete state snapshot; secret-valued columns are digest-substituted, never serialized. */
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
    // C18.1.1 — SECRET SUBSTITUTION HAPPENS IN THE SQL PROJECTION, so the raw psql receipt
    // NEVER contains the raw secret. A secret-valued column is replaced, in-query, by the
    // SAME domain-separated digest secretDigest() produces:
    //   sha256('c18-secret-v1:<table>.<col>:' || <col>::text). For bytea under the default
    // hex output, <col>::text is '\x…' — byte-identical to the JS String(row[col]) that fed
    // the old (leaking) substitution, so pre/post equality is unchanged.
    const secretCols = SNAPSHOT_SECRET_COLUMNS[m.table] ?? [];
    let projection = 'to_jsonb(t)';
    for (const col of secretCols) {
      const domain = `c18-secret-v1:${m.table}.${col}:`;
      projection = `jsonb_set(${projection}, '{${col}}', to_jsonb(`
        + `case when t."${col}" is null then null else `
        + `encode(sha256(convert_to('${domain}' || t."${col}"::text, 'UTF8')), 'hex') end))`;
    }
    const rows = inst.json(
      `select coalesce(json_agg(${projection} order by ${order}), '[]'::json) from ${m.table} t`,
      `${label}-rows-${m.table.replace('.', '_')}`,
    ) ?? [];
    tables[m.table] = { pk, columns: m.columns, rows, row_count: rows.length };
  }
  const fkMeta = inst.json(`
    select coalesce(json_agg(json_build_object(
      'constraint', n.nspname || '.' || cl.relname || '.' || c.conname,
      'from', n.nspname || '.' || cl.relname,
      'to', fn.nspname || '.' || fcl.relname,
      'definition', pg_get_constraintdef(c.oid),
      'validated', c.convalidated, 'deferrable', c.condeferrable,
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
      `${label}-fk-${f.constraint.replace(/\./g, '_')}`,
    ) ?? [];
    return {
      constraint: f.constraint, from: f.from, to: f.to, definition: f.definition,
      validated: f.validated, deferrable: f.deferrable,
      pairs_count: pairs.length, pairs_digest: sha256(JSON.stringify(pairs)),
    };
  });
  const posture = {
    roles: inst.json(`
      select coalesce(json_agg(json_build_object('role', rolname, 'login', rolcanlogin,
        'super', rolsuper, 'createrole', rolcreaterole, 'createdb', rolcreatedb,
        'bypassrls', rolbypassrls, 'inherit', rolinherit, 'connlimit', rolconnlimit)
        order by rolname), '[]'::json)
      from pg_roles where rolname like 'eye%'`, `${label}-roles`),
    memberships: inst.json(`
      select coalesce(json_agg(r.rolname || '->' || m.rolname order by r.rolname, m.rolname), '[]'::json)
      from pg_auth_members am
      join pg_roles r on r.oid = am.member join pg_roles m on m.oid = am.roleid
      where r.rolname like 'eye%' or m.rolname like 'eye%'`, `${label}-memberships`),
    database_privileges: inst.json(`
      select coalesce(json_agg(coalesce(datacl::text, '(default)')), '[]'::json)
      from pg_database where datname = current_database()`, `${label}-db-priv`),
    schema_privileges: inst.json(`
      select coalesce(json_agg(nspname || '|' || nspowner::regrole::text || '|' || coalesce(nspacl::text, '(default)')
        order by nspname), '[]'::json)
      from pg_namespace where nspname in (${schemasIn}, 'canon', 'public')`, `${label}-schema-priv`),
    table_grants: inst.json(`
      select coalesce(json_agg(grantee || '|' || table_schema || '.' || table_name || '|' || privilege_type
        order by grantee, table_schema, table_name, privilege_type), '[]'::json)
      from information_schema.role_table_grants
      where table_schema in (${schemasIn}) and grantee like 'eye%'`, `${label}-table-grants`),
    sequence_privileges: inst.json(`
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || coalesce(c.relacl::text, '(default)')
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'S' and n.nspname in (${schemasIn})`, `${label}-seq-priv`),
    default_privileges: inst.json(`
      select coalesce(json_agg(d.defaclrole::regrole::text || '|' || coalesce(n.nspname, '(all)') || '|' ||
        d.defaclobjtype::text || '|' || d.defaclacl::text order by 1), '[]'::json)
      from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace`, `${label}-default-priv`),
    owners: inst.json(`
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || c.relowner::regrole::text
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'S', 'v') and n.nspname in (${schemasIn})`, `${label}-owners`),
    routines: inst.json(`
      select coalesce(json_agg(json_build_object(
        'fn', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        'secdef', p.prosecdef, 'owner', p.proowner::regrole::text,
        'language', l.lanname, 'volatility', p.provolatile,
        'config', coalesce(p.proconfig::text, ''),
        'body_sha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex'),
        'acl', coalesce(p.proacl::text, ''))
        order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname in (${schemasIn}, 'canon')`, `${label}-routines`),
    rls: inst.json(`
      select coalesce(json_agg(json_build_object(
        'table', n.nspname || '.' || c.relname,
        'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity)
        order by n.nspname, c.relname), '[]'::json)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in (${schemasIn}) and c.relkind = 'r'`, `${label}-rls`),
    policies: inst.json(`
      select coalesce(json_agg(json_build_object(
        'table', schemaname || '.' || tablename, 'name', policyname, 'cmd', cmd,
        'roles', roles::text, 'qual', coalesce(qual, ''), 'check', coalesce(with_check, ''))
        order by schemaname, tablename, policyname), '[]'::json)
      from pg_policies where schemaname in (${schemasIn})`, `${label}-policies`),
    triggers: inst.json(`
      select coalesce(json_agg(n.nspname || '.' || c.relname || '|' || t.tgname || '|' ||
        pg_get_triggerdef(t.oid) order by n.nspname, c.relname, t.tgname), '[]'::json)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname in (${schemasIn})`, `${label}-triggers`),
    columns: inst.json(`
      select coalesce(json_agg(table_schema || '.' || table_name || '|' || column_name || '|' ||
        data_type || '|' || is_nullable || '|' || coalesce(column_default, '')
        order by table_schema, table_name, column_name), '[]'::json)
      from information_schema.columns where table_schema in (${schemasIn})`, `${label}-columns`),
    constraints: inst.json(`
      select coalesce(json_agg(n.nspname || '.' || cl.relname || '|' || c.conname || '|' ||
        pg_get_constraintdef(c.oid) || '|' || c.convalidated || '|' || c.condeferrable
        order by n.nspname, cl.relname, c.conname), '[]'::json)
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

const credentialDigests = (passwords) => Object.fromEntries(
  Object.entries(passwords).map(([k, v]) => [k, secretDigest(`credential:${k}`, v)]),
);

function runSuites(ev, inst, labels, receipts, { skip }) {
  for (const [suite, spec] of Object.entries(SUITE_MATRIX)) {
    const where = labels[suite];
    if (where === undefined || !spec.runs_on.includes(where)) continue;
    if (skip) {
      receipts.push({ suite, path: where, skipped_by_dev_seam: true });
      continue;
    }
    const timeoutMs = 900_000;
    // NO_COLOR: hosted runners force ANSI colour into vitest output, which is noise in
    // evidence and defeats summary parsing. Plain output everywhere, deterministically.
    const r = ev.run(`${inst.letter}-suite-${suite}`, spec.command,
      { env: inst.envFor({ NO_COLOR: '1', FORCE_COLOR: '0' }), timeoutMs, allowFail: true });
    const stdoutBytes = readFileSync(join(ev.raw, `${r.id}.stdout.txt`));
    const stderrBytes = readFileSync(join(ev.raw, `${r.id}.stderr.txt`));
    const text = (stdoutBytes.toString('utf8') + stderrBytes.toString('utf8'))
      .replace(/\x1b\[[0-9;]*m/g, '');
    const m = /Tests {2}(\d+) passed \((\d+)\)/.exec(text);
    receipts.push({
      suite, path: where, command_id: r.id, argv_redacted: [...spec.command],
      timeout_ms: timeoutMs, exit_status: r.exit, signal: r.signal,
      stdout_file: `raw/${r.id}.stdout.txt`, stderr_file: `raw/${r.id}.stderr.txt`,
      exit_file: `raw/${r.id}.exit.txt`,
      stdout_bytes: stdoutBytes.byteLength, stdout_sha256: sha256(stdoutBytes),
      stderr_bytes: stderrBytes.byteLength, stderr_sha256: sha256(stderrBytes),
      tests_passed: m === null ? -1 : Number(m[1]),
      tests_total: m === null ? -1 : Number(m[2]),
    });
    if (r.exit !== 0 || r.signal !== null) throw new Error(`suite '${suite}' failed on ${where} (exit ${r.exit}, signal ${r.signal})`);
    if (m === null) throw new Error(`suite '${suite}' on ${where} produced no parseable vitest summary`);
  }
}

function hostedReceipt() {
  const e = process.env;
  if (!e.GITHUB_RUN_ID) return { hosted: false };
  return {
    hosted: true,
    repository: e.GITHUB_REPOSITORY ?? null,
    run_id: e.GITHUB_RUN_ID ?? null,
    run_attempt: e.GITHUB_RUN_ATTEMPT ?? null,
    head_sha: e.GITHUB_SHA ?? null,
    ref: e.GITHUB_REF ?? null,
    event: e.GITHUB_EVENT_NAME ?? null,
    job: e.GITHUB_JOB ?? null,
  };
}

/**
 * BLOCKING self-scan over every produced file: no generated secret canary, no unredacted
 * password/secret env assignment, no raw bytea secret shape, and no private-key material may
 * appear anywhere in the evidence.
 */
const LEAK_PATTERNS = Object.freeze([
  { re: /"secret"\s*:\s*"\\\\x[0-9a-f]{2,}"/, why: 'raw ctx.context_secret bytea value' },
  { re: /"[a-z_]*secret[a-z_]*"\s*:\s*"\\\\x[0-9a-f]{2,}"/i, why: 'raw bytea secret column' },
  // ENV/ARGV assignments only — a `"KEY": "<digest>"` JSON pair (credential_digests) is not a leak.
  { re: /(?:PASSWORD|PGPASSWORD)=[0-9a-f]{24,}/i, why: 'unredacted password env assignment' },
  { re: /--requirepass["'\s,[\]]+[0-9a-f]{24,}/i, why: 'unredacted redis requirepass' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private-key material' },
]);
function secretScan(outDir, secrets) {
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      if (lstatSync(abs).isDirectory()) { walk(abs); continue; }
      const bytes = readFileSync(abs);
      const rel = relative(outDir, abs);
      for (const [cls, value] of secrets) {
        if (value && bytes.includes(value)) hits.push(`${rel} contains the ${cls} secret`);
      }
      const text = bytes.toString('utf8');
      for (const { re, why } of LEAK_PATTERNS) {
        if (re.test(text)) hits.push(`${rel} matches ${why}`);
      }
    }
  };
  walk(outDir);
  return hits;
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

const gitOut = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

async function runCommand(args) {
  // The FAILURE-EVIDENCE BOUNDARY starts here: argument validation, preflight, provisioning,
  // execution and cleanup all report through it once the output directory exists.
  const cleanup = { containers: [], workspaces: [] };
  let ev = null;
  let outDir = null;
  let phase = 'argument-validation';
  const keep = args?.['--keep-containers'] === true;
  // SIGINT/SIGTERM run the SAME checked teardown and leave failure evidence. SIGKILL cannot
  // be handled by any process — no in-process cleanup can run under it; that limit is stated
  // honestly rather than papered over. (Signals are delivered between spawnSync calls, which
  // is exactly where container state changes.)
  const onSignal = (sig) => {
    try {
      if (outDir !== null) {
        writeFileSync(join(outDir, 'RESULT-FAIL.txt'),
          `outcome: FAIL\ngate: C18\nphase: ${phase}\nerror: interrupted by ${sig}; checked cleanup executed\n`);
        writeFileSync(join(outDir, 'commands.json'), `${JSON.stringify(ev?.commands ?? [], null, 2)}\n`);
      }
    } catch { /* teardown still runs */ }
    const cleaned = teardown(cleanup, keep);
    if (cleaned.failures.length > 0) console.error(`C18 ${sig} cleanup FAILED: ${cleaned.failures.join('; ')}`);
    process.exit(1);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const allowed = new Set(['--out', '--final', '--expected-sha', '--skip-suites', '--keep-containers']);
    for (const k of Object.keys(args)) if (k.startsWith('--') && !allowed.has(k) && k !== '_') throw new Error(`unknown argument ${k}`);
    outDir = args['--out'];
    if (typeof outDir !== 'string' || outDir.length === 0) throw new Error('--out is required');
    const final = args['--final'] === true;
    const expectedSha = args['--expected-sha'] ?? null;
    const skipSuites = args['--skip-suites'] === true;
    if (final && (skipSuites || keep)) throw new Error('final mode refuses every development seam (--skip-suites/--keep-containers)');
    if (final && !/^[0-9a-f]{40}$/.test(expectedSha ?? '')) throw new Error('final mode requires --expected-sha <40-hex>');

    // OUTPUT DIRECTORY: fresh, empty, realpath-contained, OUTSIDE the repository — always.
    mkdirSync(outDir, { recursive: true });
    const outReal = realpathSync(resolve(outDir));
    const st = lstatSync(outReal);
    if (!st.isDirectory()) throw new Error('--out is not a real directory');
    if (readdirSync(outReal).length !== 0) throw new Error(`--out '${outDir}' is not EMPTY; refusing prepopulated output`);
    const relRepo = relative(realpathSync(ROOT), outReal);
    if (relRepo === '' || (!relRepo.startsWith('..') && !isAbsolute(relRepo))) {
      throw new Error('--out must resolve OUTSIDE the repository');
    }
    outDir = outReal;
    ev = new Evidence(outDir);

    phase = 'final-mode-preflight';
    const head = gitOut(['rev-parse', 'HEAD']);
    const treeBefore = gitOut(['rev-parse', 'HEAD^{tree}']);
    // `--untracked-files=all` explicitly: a repo-local status.showUntrackedFiles=no config
    // must not be able to hide an untracked file from the cleanliness judgement.
    const dirtyBefore = gitOut(['status', '--porcelain', '--untracked-files=all']);
    if (final) {
      if (head !== expectedSha) throw new Error(`final mode: HEAD ${head} != --expected-sha ${expectedSha}`);
      if (dirtyBefore !== '') {
        throw new Error(`final mode requires a clean worktree; dirty:\n${dirtyBefore}`);
      }
    }

    phase = 'preflight';
    const images = composeImages();
    const tracked = trackedMigrationDigests();
    const transforms = deriveIntentionalTransforms(tracked.dir, tracked.files);
    const audit = await productionAudit(ROOT);
    const problems = [];

    // ── PATH A ─────────────────────────────────────────────────────────────
    phase = 'path-a-provision';
    const a = startInstance(ev, 'a', images, cleanup);
    phase = 'path-a-historical-migrate';
    const wsA = migrationWorkspace('a', HISTORICAL_LAST, tracked, cleanup);
    ev.run('a-migrate-historical', ['node', join(wsA, 'scripts', 'migrate.mjs')], { env: a.envFor() });
    phase = 'path-a-seed';
    const seedRecord = await seedThroughEraPorts({
      root: ROOT, host: '127.0.0.1', port: a.port, database: a.database,
      passwords: a.passwords, log: () => {},
    });
    phase = 'path-a-snapshot-before';
    const before = snapshot(a, 'a-before');
    writeFileSync(join(outDir, 'path-a-before.json'), `${JSON.stringify(before, null, 2)}\n`);
    phase = 'path-a-upgrade';
    extendWorkspace(wsA, HISTORICAL_LAST, LATEST_LAST, tracked);
    ev.run('a-migrate-upgrade', ['node', join(wsA, 'scripts', 'migrate.mjs')], { env: a.envFor() });
    // The PURE post-upgrade snapshot first (preservation is judged against it), then ONE
    // deterministic governed operation through the CURRENT ports, then the closure snapshot.
    phase = 'path-a-snapshot-after';
    const after = snapshot(a, 'a-after');
    writeFileSync(join(outDir, 'path-a-after.json'), `${JSON.stringify(after, null, 2)}\n`);
    phase = 'path-a-post-upgrade-operation';
    const postOp = await runPostUpgradeOperation({
      root: ROOT, host: '127.0.0.1', port: a.port, database: a.database,
      passwords: a.passwords, seedRecord,
    });
    seedRecord.post_upgrade_operation = postOp;
    writeFileSync(join(outDir, 'path-a-seed-record.json'), `${JSON.stringify(seedRecord, null, 2)}\n`);
    phase = 'path-a-snapshot-final';
    const finalSnap = snapshot(a, 'a-final');
    writeFileSync(join(outDir, 'path-a-final.json'), `${JSON.stringify(finalSnap, null, 2)}\n`);

    phase = 'path-a-judgement';
    for (const [snap, lbl, universe] of [
      [before, 'a-before', TABLE_UNIVERSE_HISTORICAL], [after, 'a-after', TABLE_UNIVERSE_LATEST],
      [finalSnap, 'a-final', TABLE_UNIVERSE_LATEST],
    ]) {
      problems.push(...verifyTableUniverse(snap, universe, lbl));
      problems.push(...verifyAuditShapes(snap.audit, lbl));
      problems.push(...authenticateProjections(snap.audit.events, audit.jcs).map((p) => `${lbl}: ${p}`));
      problems.push(...crossCheckAuditTable(snap, lbl));
    }
    problems.push(...verifySeedRecordClosed({ seedRecord, before, finalSnap, manifest: null }).map((p) => `path-a-seed: ${p}`));
    problems.push(...compareSnapshots(before, after, transforms).map((p) => `path-a: ${p}`));
    problems.push(...verifyChainRows({ events: before.audit.events, heads: before.audit.heads, ...audit }).map((p) => `path-a-before: ${p}`));
    problems.push(...verifyChainRows({
      events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events, ...audit,
    }).map((p) => `path-a-after: ${p}`));
    problems.push(...verifyChainRows({
      events: finalSnap.audit.events, heads: finalSnap.audit.heads, priorEvents: after.audit.events, ...audit,
    }).map((p) => `path-a-final: ${p}`));
    problems.push(...verifySeedFloor(before).map((p) => `path-a: ${p}`));
    problems.push(...verifyLinkage({
      auditEvents: finalSnap.audit.events,
      decisions: (finalSnap.tables['policy.policy_decisions']?.rows ?? []),
      outbox: (finalSnap.tables['objects.object_outbox']?.rows ?? []),
    }).map((p) => `path-a-linkage: ${p}`));
    problems.push(...verifyOperationClosure({ snapshot: finalSnap, expected: postOp }).map((p) => `path-a-closure: ${p}`));
    problems.push(...verifyMigrationLedger({
      trackedDigests: tracked.digests, ledger: before.ledger, expectLast: HISTORICAL_LAST,
    }).map((p) => `path-a-before-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({
      trackedDigests: tracked.digests, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger,
    }).map((p) => `path-a-after-ledger: ${p}`));

    // ── PATH B ─────────────────────────────────────────────────────────────
    phase = 'path-b-provision';
    const b = startInstance(ev, 'b', images, cleanup);
    phase = 'path-b-migrate';
    const wsB = migrationWorkspace('b', LATEST_LAST, tracked, cleanup);
    ev.run('b-migrate-latest', ['node', join(wsB, 'scripts', 'migrate.mjs')], { env: b.envFor() });
    phase = 'path-b-snapshot';
    const virgin = snapshot(b, 'b-virgin');
    writeFileSync(join(outDir, 'path-b-virgin.json'), `${JSON.stringify(virgin, null, 2)}\n`);
    problems.push(...verifyTableUniverse(virgin, TABLE_UNIVERSE_LATEST, 'b-virgin'));
    problems.push(...verifyAuditShapes(virgin.audit, 'b-virgin'));
    problems.push(...crossCheckAuditTable(virgin, 'b-virgin'));
    problems.push(...verifyMigrationLedger({
      trackedDigests: tracked.digests, ledger: virgin.ledger, expectLast: LATEST_LAST,
    }).map((p) => `path-b-ledger: ${p}`));
    phase = 'posture-equivalence';
    problems.push(...comparePosture(after.posture, virgin.posture));

    phase = 'isolation';
    const receiptFor = (inst, path) => ({
      path, container_id: inst.containerId, container_name: inst.container,
      redis_container_id: inst.redisContainerId, redis_container: inst.redisContainer,
      database: inst.database, port: inst.port, redis_port: inst.redisPort,
      postgres_image: images.postgres, redis_image: images.redis,
      credential_digests: credentialDigests(inst.passwords),
    });
    const receiptA = receiptFor(a, 'path-a-upgraded');
    const receiptB = receiptFor(b, 'path-b-virgin');
    problems.push(...verifyIsolation(receiptA, receiptB, images));

    if (problems.length > 0) {
      writeFileSync(join(outDir, 'comparison-problems.json'), `${JSON.stringify(problems, null, 2)}\n`);
      throw new Error(`C18 contract violations (${problems.length}):\n  ${problems.slice(0, 20).join('\n  ')}`);
    }

    // ── SUITES ─────────────────────────────────────────────────────────────
    phase = 'suites';
    const suiteReceipts = [];
    const skip = args['--skip-suites'] === true;
    runSuites(ev, a, { integration: 'path-a-upgraded', acceptance: 'instance-a-server' }, suiteReceipts, { skip });
    runSuites(ev, b, { integration: 'path-b-virgin', acceptance: 'instance-b-server' }, suiteReceipts, { skip });

    // ── CHECKED CLEANUP happens BEFORE packaging so its result is part of the evidence. ──
    phase = 'cleanup';
    const cleaned = teardown(cleanup, keep);
    cleanup.containers = cleaned.kept;
    cleanup.workspaces = [];
    if (cleaned.failures.length > 0) {
      throw new Error(`cleanup FAILED: ${cleaned.failures.join('; ')}`);
    }

    phase = 'worktree-postcondition';
    const dirtyAfter = gitOut(['status', '--porcelain', '--untracked-files=all']);
    const treeAfter = gitOut(['rev-parse', 'HEAD^{tree}']);
    if (final && dirtyAfter !== '') throw new Error(`the run DIRTIED the worktree:\n${dirtyAfter}`);
    if (treeAfter !== treeBefore) throw new Error('the tracked tree digest changed during the run');

    phase = 'package';
    const manifest = {
      gate: 'C18', mode: final ? 'final' : 'preliminary', source_sha: head, source_tree: treeBefore,
      worktree_clean_before: dirtyBefore === '', worktree_clean_after: dirtyAfter === '',
      skip_suites_dev_seam: skip,
      historical_last: HISTORICAL_LAST, latest_last: LATEST_LAST,
      migration_digests: Object.fromEntries(tracked.digests),
      intentional_transforms: transforms,
      suite_matrix: SUITE_MATRIX,
      receipts: { 'path-a-upgraded': receiptA, 'path-b-virgin': receiptB },
      suite_receipts: suiteReceipts,
      seed_summary: deriveSeedSummary(seedRecord),
      post_upgrade_operation: postOp,
      hosted_receipt: hostedReceipt(),
      cleanup: { removed: cleaned.removed, failures: cleaned.failures, kept: cleaned.kept },
    };
    writeFileSync(join(outDir, 'c18-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(outDir, 'commands.json'), `${JSON.stringify(ev.commands, null, 2)}\n`);
    writeFileSync(join(outDir, 'RESULT-PASS.txt'),
      `outcome: PASS\ngate: C18\nmode: ${manifest.mode}\nsource_sha: ${head}\npaths: path-a-upgraded, path-b-virgin\n`);

    phase = 'secret-scan';
    const hits = secretScan(outDir, ev.secrets);
    if (hits.length > 0) throw new Error(`SECRET SCAN FAILED — generated secrets appear in evidence:\n  ${hits.join('\n  ')}`);

    const packed = packEvidence(outDir, head);
    const zipHits = ev.secrets.filter(([, v]) => v && readFileSync(packed.zip).includes(v));
    if (zipHits.length > 0) throw new Error(`SECRET SCAN FAILED — final ZIP bytes contain generated secrets (${zipHits.length})`);
    console.log('C18 dual-path proof: PASS');
    console.log(`  evidence: ${packed.zip}`);
    console.log(`  sha256:   ${packed.digest}`);
    if (process.env.GITHUB_ENV) {
      writeFileSync(process.env.GITHUB_ENV, `C18_ZIP=${packed.zip}\nC18_ZIP_SHA256=${packed.digest}\n`, { flag: 'a' });
    }
  } catch (e) {
    if (outDir !== null) {
      try {
        writeFileSync(join(outDir, 'RESULT-FAIL.txt'),
          `outcome: FAIL\ngate: C18\nphase: ${phase}\nerror: ${redactString(String(e instanceof Error ? e.message : e), ev?.secrets ?? [])}\n`);
        writeFileSync(join(outDir, 'commands.json'), `${JSON.stringify(ev?.commands ?? [], null, 2)}\n`);
      } catch { /* the original failure is the one that must surface */ }
    }
    const cleaned = teardown(cleanup, keep);
    cleanup.containers = [];
    cleanup.workspaces = [];
    if (cleaned.failures.length > 0) {
      throw new Error(`${e instanceof Error ? e.message : e}\nADDITIONALLY cleanup failed: ${cleaned.failures.join('; ')}`);
    }
    throw e;
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    const cleaned = teardown(cleanup, keep);
    if (cleaned.failures.length > 0) {
      // A cleanup failure on the success path must fail the run.
      throw new Error(`cleanup FAILED after completion: ${cleaned.failures.join('; ')}`);
    }
  }
}

// ── VERIFIER ────────────────────────────────────────────────────────────────
const safeMember = (e) => !e.startsWith('/') && !e.includes('\\') && !e.includes('\0')
  && !e.split('/').includes('..') && !e.startsWith('~');

/**
 * Reconstruct the attackable views of a processed snapshot from its command-bound RAW psql
 * receipts and compare, so deleting or altering processed JSON while the raw output stays
 * intact FAILS. `pfx` is the command-label prefix, e.g. 'a-a-before' or 'b-b-virgin'. `rawFor`
 * maps a full command label to its parsed raw stdout.
 */
function reconstructSnapshot(snap, pfx, rawFor) {
  const problems = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Tables: meta + per-table rows.
  const meta = rawFor(`${pfx}-tables-meta`);
  if (!Array.isArray(meta)) return ['tables-meta raw receipt is missing or not JSON'];
  const rawTableNames = meta.map((m) => m.table).sort();
  if (!eq(rawTableNames, Object.keys(snap.tables).sort())) {
    problems.push('the raw tables-meta table set differs from the processed snapshot');
  }
  for (const m of meta) {
    const delivered = snap.tables[m.table];
    if (delivered === undefined) { problems.push(`raw table '${m.table}' is absent from the processed snapshot`); continue; }
    const pk = m.pk.length > 0 ? m.pk : m.columns;
    if (!eq(pk, delivered.pk) || !eq(m.columns, delivered.columns)) {
      problems.push(`table '${m.table}' pk/columns differ from raw meta`);
    }
    const rows = rawFor(`${pfx}-rows-${m.table.replace('.', '_')}`) ?? [];
    if (!eq(rows, delivered.rows) || delivered.row_count !== rows.length) {
      problems.push(`table '${m.table}' rows differ from their raw query receipt`);
    }
  }
  // FKs: meta + per-fk pair-set, digest recomputed from raw.
  const fkMeta = rawFor(`${pfx}-fk-meta`);
  if (Array.isArray(fkMeta)) {
    const rebuilt = fkMeta.map((f) => {
      const pairs = rawFor(`${pfx}-fk-${f.constraint.replace(/\./g, '_')}`) ?? [];
      return {
        constraint: f.constraint, from: f.from, to: f.to, definition: f.definition,
        validated: f.validated, deferrable: f.deferrable,
        pairs_count: pairs.length, pairs_digest: sha256(JSON.stringify(pairs)),
      };
    });
    if (!eq(rebuilt, snap.fks)) problems.push('FK set reconstructed from raw differs from the processed snapshot');
  } else problems.push('fk-meta raw receipt is missing or not JSON');
  // ALL FIFTEEN posture categories, value-compared against their own command-bound raw
  // receipts BEFORE any A/B comparison — identical attacker posture on both paths fails here.
  for (const cat of POSTURE_CATEGORIES) {
    const raw = rawFor(`${pfx}-${POSTURE_COMMAND_LABELS[cat]}`);
    if (raw === undefined) { problems.push(`posture category '${cat}' has no raw receipt`); continue; }
    if (!eq(raw, snap.posture?.[cat])) problems.push(`posture category '${cat}' differs from its raw receipt`);
  }
  // Ledger + audit views.
  if (!eq(rawFor(`${pfx}-ledger`) ?? [], snap.ledger)) problems.push('migration ledger differs from its raw receipt');
  if (!eq(rawFor(`${pfx}-audit-events`) ?? [], snap.audit.events)) problems.push('audit events differ from their raw receipt');
  if (!eq(rawFor(`${pfx}-audit-heads`) ?? [], snap.audit.heads)) problems.push('audit heads differ from their raw receipt');
  return problems;
}

export async function verifyEvidence({
  zipPath, root, online = false, requireHosted = false, fetchImpl = globalThis.fetch, token = null,
}) {
  const problems = [];
  const notes = [];
  if (!existsSync(zipPath)) return { ok: false, problems: [`archive ${zipPath} does not exist`], notes };
  const zst = lstatSync(zipPath);
  if (zst.isSymbolicLink() || !zst.isFile()) return { ok: false, problems: [`archive ${zipPath} is not a real regular file`], notes };
  const zipBytes = readFileSync(zipPath);

  // ── ZIP SAFETY, inspected BEFORE extraction (the C17 rules) ───────────────
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listing.status !== 0) return { ok: false, problems: ['archive is not readable as a zip'], notes };
  const entries = listing.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set();
  for (const e of entries) {
    if (!safeMember(e)) problems.push(`unsafe archive path '${e}'`);
    if (e.endsWith('/')) continue;
    if (seen.has(e)) problems.push(`archive contains a DUPLICATE entry '${e}'`);
    seen.add(e);
  }
  if (/^\s*l/m.test(spawnSync('unzip', ['-Z', zipPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout)) {
    problems.push('archive contains a symlink');
  }
  if (problems.length > 0) return { ok: false, problems, notes };

  const tmp = mkdtempSync(join(tmpdir(), 'c18-verify-'));
  try {
    const x = spawnSync('unzip', ['-q', zipPath, '-d', tmp], { encoding: 'utf8' });
    if (x.status !== 0) return { ok: false, problems: ['extraction failed'], notes };
    const files = [];
    const walk = (d, base) => {
      for (const name of readdirSync(d).sort()) {
        const abs = join(d, name);
        const st = lstatSync(abs);
        if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) {
          problems.push(`extracted non-regular member '${relative(base, abs)}'`);
          continue;
        }
        if (st.isDirectory()) walk(abs, base);
        else files.push(relative(base, abs));
      }
    };
    walk(tmp, tmp);
    if (problems.length > 0) return { ok: false, problems, notes };
    // ── VERIFIER-SIDE LEAK SCAN: no raw secret, env/argv password or private key anywhere. ──
    for (const f of files) {
      const text = readFileSync(join(tmp, f), 'utf8');
      for (const { re, why } of LEAK_PATTERNS) {
        if (re.test(text)) problems.push(`archive member '${f}' matches ${why}`);
      }
    }
    if (problems.length > 0) return { ok: false, problems, notes };
    const contained = (rel, label) => {
      if (!safeMember(rel)) { problems.push(`${label} names unsafe path '${rel}'`); return null; }
      const abs = join(tmp, rel);
      const real = existsSync(abs) ? realpathSync(abs) : null;
      if (real !== null) {
        const within = relative(realpathSync(tmp), real);
        if (within.startsWith('..') || isAbsolute(within)) {
          problems.push(`${label} path '${rel}' resolves outside the archive`);
          return null;
        }
      }
      return abs;
    };

    // ── CHECKSUMS: one unique entry per file, no self-entry, everything bound ──
    const sumAbs = join(tmp, CHECKSUM_FILE);
    const listed = new Set();
    if (!existsSync(sumAbs)) problems.push(`archive has no ${CHECKSUM_FILE}`);
    else {
      for (const line of readFileSync(sumAbs, 'utf8').split('\n').filter(Boolean)) {
        const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
        if (m === null) { problems.push(`malformed checksum line: ${line.slice(0, 60)}`); continue; }
        if (m[2] === CHECKSUM_FILE) problems.push('checksum manifest lists itself');
        if (listed.has(m[2])) problems.push(`DUPLICATE checksum entry '${m[2]}'`);
        listed.add(m[2]);
        const abs = contained(m[2], 'checksum');
        if (abs === null) continue;
        if (!existsSync(abs)) problems.push(`checksum names missing file '${m[2]}'`);
        else if (sha256(readFileSync(abs)) !== m[1]) problems.push(`'${m[2]}' does not hash to its manifest digest`);
      }
      for (const f of files) {
        if (f !== CHECKSUM_FILE && !listed.has(f)) problems.push(`file '${f}' is not bound by the checksum manifest`);
      }
    }

    // ── TYPED MANIFEST + EXACT INVENTORY ──────────────────────────────────────
    let manifest = null;
    try { manifest = JSON.parse(readFileSync(join(tmp, 'c18-manifest.json'), 'utf8')); } catch {
      return { ok: false, problems: [...problems, 'c18-manifest.json is missing or not JSON'], notes };
    }
    problems.push(...verifyManifestShape(manifest));
    const shaped = verifyManifestShape(manifest).length === 0;
    if (shaped) {
      if (manifest.mode !== 'final') problems.push(`manifest mode is ${JSON.stringify(manifest.mode)}; C18 delivery requires final`);
      if (manifest.skip_suites_dev_seam === true) problems.push('evidence was produced with the --skip-suites development seam; it is not proof');
      if (manifest.cleanup.failures?.length !== 0 || (manifest.cleanup.kept?.length ?? 0) !== 0) {
        problems.push('manifest records cleanup failures or kept containers');
      }
    }
    const commands = (() => {
      try { return JSON.parse(readFileSync(join(tmp, 'commands.json'), 'utf8')); } catch { return null; }
    })();
    if (!Array.isArray(commands)) problems.push('commands.json is missing or not an array');
    else {
      // CLOSED typed records with position-bound ids — a duplicated, reordered or
      // renumber-forged ledger fails here before any semantics are consulted.
      problems.push(...verifyCommandRecords(commands));
      const expectedRaw = new Set();
      for (const c of commands) {
        if (typeof c.id !== 'string' || !Array.isArray(c.argv)) continue;
        for (const ext of ['stdout', 'stderr', 'exit']) expectedRaw.add(`raw/${c.id}.${ext}.txt`);
      }
      const actualRaw = files.filter((f) => f.startsWith('raw/'));
      for (const f of actualRaw) if (!expectedRaw.has(f)) problems.push(`raw evidence '${f}' is bound to no command-ledger entry`);
      for (const f of expectedRaw) if (!files.includes(f)) problems.push(`command-ledger raw evidence '${f}' is MISSING`);
      const nonRaw = files.filter((f) => !f.startsWith('raw/')).sort();
      const want = [...FIXED_MEMBERS, CHECKSUM_FILE].sort();
      if (JSON.stringify(nonRaw) !== JSON.stringify(want)) {
        problems.push(`archive top-level inventory ${JSON.stringify(nonRaw)} is not the exact contract set`);
      }
      // Every ledger record binds its three streams by BYTES, and the raw exit receipt must
      // restate the ledger's exit exactly.
      problems.push(...verifyCommandStreams(commands, (rel) => {
        const abs = contained(rel, 'command stream');
        return abs !== null && existsSync(abs) ? readFileSync(abs) : null;
      }));
    }

    // ── SOURCE BINDING: HEAD, cleanliness, migrations from the CHECKOUT ───────
    const rootHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const rootDirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    // A malformed manifest must never SUPPRESS the source binding finding.
    if (typeof manifest.source_sha === 'string' && manifest.source_sha !== rootHead) {
      problems.push(`manifest source_sha ${manifest.source_sha} is not this checkout's HEAD ${rootHead}`);
    }
    if (rootDirty !== '') problems.push('the verifier checkout is not clean; verification must run from the exact source');
    const tracked = trackedMigrationDigests(root);
    if (shaped) {
      const manifestDigests = Object.entries(manifest.migration_digests).sort();
      const sourceDigests = [...tracked.digests.entries()].sort();
      if (JSON.stringify(manifestDigests) !== JSON.stringify(sourceDigests)) {
        problems.push('manifest migration digests are not exactly the source-derived set');
      }
    }
    const transforms = deriveIntentionalTransforms(tracked.dir, tracked.files);
    if (shaped && JSON.stringify(manifest.intentional_transforms) !== JSON.stringify(transforms)) {
      problems.push('manifest intentional transforms are not exactly the migration-derived set');
    }

    // ── THE PROOF, RE-RUN from raw snapshots with the PRODUCTION audit impl ───
    const readJson = (name) => { try { return JSON.parse(readFileSync(join(tmp, name), 'utf8')); } catch { return null; } };
    const before = readJson('path-a-before.json');
    const after = readJson('path-a-after.json');
    const finalSnap = readJson('path-a-final.json');
    const virgin = readJson('path-b-virgin.json');
    const seedRecord = readJson('path-a-seed-record.json');
    if (before === null || after === null || finalSnap === null || virgin === null || seedRecord === null) {
      return { ok: false, problems: [...problems, 'snapshot or seed-record members are missing or not JSON'], notes };
    }
    const audit = await productionAudit(root);
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked.digests, ledger: before.ledger, expectLast: HISTORICAL_LAST }).map((p) => `before-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked.digests, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger }).map((p) => `after-ledger: ${p}`));
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked.digests, ledger: virgin.ledger, expectLast: LATEST_LAST }).map((p) => `virgin-ledger: ${p}`));
    // The FINAL snapshot's own 0021 ledger, not only before/after/virgin.
    problems.push(...verifyMigrationLedger({ trackedDigests: tracked.digests, ledger: finalSnap.ledger, expectLast: LATEST_LAST, priorLedger: after.ledger }).map((p) => `final-ledger: ${p}`));

    // ── EXACT SOURCE-OWNED STRUCTURE + PROJECTION AUTHENTICATION ──────────────
    for (const [snap, lbl, universe] of [
      [before, 'before', TABLE_UNIVERSE_HISTORICAL], [after, 'after', TABLE_UNIVERSE_LATEST],
      [finalSnap, 'final', TABLE_UNIVERSE_LATEST], [virgin, 'virgin', TABLE_UNIVERSE_LATEST],
    ]) {
      problems.push(...verifyTableUniverse(snap, universe, lbl));
      problems.push(...verifyAuditShapes(snap.audit, lbl));
      problems.push(...authenticateProjections(snap.audit.events, audit.jcs).map((p) => `${lbl}: ${p}`));
      // The audit TABLE rows and the audit view must be the same world, with every generated
      // projection column derived exactly from the canonical event_jcs.
      problems.push(...crossCheckAuditTable(snap, lbl));
    }

    // ── BIND PROCESSED SNAPSHOTS TO THEIR COMMAND-BOUND RAW RECEIPTS ──────────
    // Every processed snapshot view is RECONSTRUCTED from the raw psql receipts (same
    // deterministic sanitizer the producer used runs IN the SQL projection, so the raw bytes
    // already carry the digest) and value-compared. Deleting or altering a processed table
    // while leaving contradictory raw output now FAILS.
    if (Array.isArray(commands)) {
      const rawFor = (label) => {
        const cmd = commands.find((c) => c.label === label);
        if (cmd === undefined) return undefined;
        const abs = contained(`raw/${cmd.id}.stdout.txt`, 'raw receipt');
        if (abs === null || !existsSync(abs)) return undefined;
        const text = readFileSync(abs, 'utf8').trim();
        try { return text === '' ? null : JSON.parse(text); } catch { return undefined; }
      };
      for (const [snap, snapLabel] of [[before, 'a-before'], [after, 'a-after'], [finalSnap, 'a-final'], [virgin, 'b-virgin']]) {
        const letter = snapLabel[0];
        const pfx = `${letter}-${snapLabel}`;
        const recon = reconstructSnapshot(snap, pfx, rawFor);
        for (const p of recon) problems.push(`raw-binding ${snapLabel}: ${p}`);
      }
      // ── THE SOURCE-OWNED COMMAND GRAPH over the whole ledger ─────────────────
      // Missing, duplicate, unknown or reordered commands, exit-forged must-succeed
      // commands, and evidence-bearing outputs (container ids, discovered ports,
      // tables/fk metadata, readiness) that contradict the rest of the evidence all
      // fail HERE, bound to the isolation receipts and the pinned Compose images.
      problems.push(...verifyCommandGraph({
        commands,
        receiptA: manifest.receipts?.['path-a-upgraded'] ?? null,
        receiptB: manifest.receipts?.['path-b-virgin'] ?? null,
        images: composeImages(),
        rawText: (cmd, stream) => {
          const abs = contained(`raw/${cmd.id}.${stream}.txt`, 'graph stream');
          return abs !== null && existsSync(abs) ? readFileSync(abs, 'utf8') : null;
        },
      }));
    }

    // ── EXACT MANIFEST-VS-SOURCE BINDINGS ────────────────────────────────────
    if (shaped) {
      const treeHead = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      if (manifest.source_tree !== treeHead) problems.push(`manifest source_tree ${manifest.source_tree} is not this checkout's HEAD tree ${treeHead}`);
      if (JSON.stringify(manifest.suite_matrix) !== JSON.stringify(SUITE_MATRIX)) {
        problems.push('manifest suite_matrix is not exactly the code-owned matrix');
      }
      const iso = manifest.receipts ?? {};
      const wantCleanup = [
        iso['path-a-upgraded']?.container_name, iso['path-a-upgraded']?.redis_container,
        iso['path-b-virgin']?.container_name, iso['path-b-virgin']?.redis_container,
      ];
      if (JSON.stringify(manifest.cleanup?.removed) !== JSON.stringify(wantCleanup)) {
        problems.push('manifest cleanup.removed is not exactly the four isolation container names');
      }
      problems.push(...verifySeedRecordClosed({ seedRecord, before, finalSnap, manifest }));
    }
    problems.push(...compareSnapshots(before, after, transforms));
    problems.push(...verifyChainRows({ events: before.audit.events, heads: before.audit.heads, ...audit }));
    problems.push(...verifyChainRows({ events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events, ...audit }));
    problems.push(...verifyChainRows({ events: finalSnap.audit.events, heads: finalSnap.audit.heads, priorEvents: after.audit.events, ...audit }));
    problems.push(...verifySeedFloor(before));
    problems.push(...verifyLinkage({
      auditEvents: finalSnap.audit.events,
      decisions: finalSnap.tables['policy.policy_decisions']?.rows ?? [],
      outbox: finalSnap.tables['objects.object_outbox']?.rows ?? [],
    }));
    problems.push(...verifyOperationClosure({ snapshot: finalSnap, expected: manifest.post_upgrade_operation ?? null }));
    problems.push(...comparePosture(after.posture, virgin.posture));
    // Receipt, isolation and RESULT judgements run regardless of manifest shape — a
    // malformed manifest must not suppress deeper findings.
    problems.push(...verifyIsolation(manifest.receipts?.['path-a-upgraded'], manifest.receipts?.['path-b-virgin'], composeImages()));
    problems.push(...verifySuiteReceipts(SUITE_MATRIX, Array.isArray(manifest.suite_receipts) ? manifest.suite_receipts : [], {
      commands: Array.isArray(commands) ? commands : [],
      readFile: (rel) => {
        const abs = contained(rel, 'suite receipt');
        return abs !== null && existsSync(abs) ? readFileSync(abs) : null;
      },
    }));
    const resultAbs = join(tmp, 'RESULT-PASS.txt');
    if (!existsSync(resultAbs)) problems.push('archive has no RESULT-PASS receipt');
    else problems.push(...parseResultReceipt(readFileSync(resultAbs, 'utf8'), manifest));

    // ── DELIVERY STANDING (online): the hosted run, the blocking step, the artifact ──
    if (requireHosted && !online) {
      problems.push('requiring hosted C18 standing demands online verification as well');
    } else if (online) {
      const hr = shaped ? manifest.hosted_receipt : null;
      if (hr === null || hr.hosted !== true) {
        problems.push('delivery verification requires a HOSTED C18 run receipt; this archive was produced locally');
      } else if (hr.repository !== REPOSITORY || !/^[1-9][0-9]{0,17}$/.test(hr.run_id ?? '')
        || !/^[1-9][0-9]{0,17}$/.test(hr.run_attempt ?? '') || hr.head_sha !== manifest.source_sha
        || hr.event !== 'push' || hr.ref !== 'refs/heads/main' || hr.job !== 'build-test') {
        problems.push('hosted receipt is not an exact push/main build-test receipt for this source SHA');
      } else {
        const run = await apiGet(runUrl(hr.run_id), { fetchImpl, token });
        if (!run.ok) problems.push(`hosted run endpoint failed: ${run.error}`);
        else {
          const b = run.body;
          // Workflow ci from .github/workflows/ci.yml, push/main, exact SHA + attempt.
          for (const [label, actual, want] of [
            ['id', b.id, hr.run_id], ['attempt', b.run_attempt, hr.run_attempt],
            ['head_sha', b.head_sha, manifest.source_sha], ['event', b.event, 'push'],
            ['branch', b.head_branch, 'main'], ['status', b.status, 'completed'],
            ['conclusion', b.conclusion, 'success'], ['workflow name', b.name, 'ci'],
            ['workflow path', b.path, '.github/workflows/ci.yml'],
          ]) {
            if (String(actual) !== String(want)) problems.push(`GitHub reports run ${label} ${JSON.stringify(actual)}; the receipt requires ${JSON.stringify(want)}`);
          }
        }
        const jobs = await apiGet(jobsUrl(hr.run_id, hr.run_attempt), { fetchImpl, token });
        if (!jobs.ok) problems.push(`hosted jobs endpoint failed: ${jobs.error}`);
        else {
          const all = Array.isArray(jobs.body?.jobs) ? jobs.body.jobs : [];
          if (jobs.body?.total_count !== all.length) problems.push('hosted jobs total_count does not match the returned jobs');
          // ALL THREE required jobs successful in this attempt.
          for (const name of ['build-test', 'browser-regression', 'supply-chain']) {
            const j = all.find((x) => x.name === name);
            if (j === undefined || j.status !== 'completed' || j.conclusion !== 'success') {
              problems.push(`GitHub reports required job '${name}' is not completed+success`);
            }
          }
          const bt = all.find((j) => j.name === 'build-test');
          const step = bt?.steps?.find((s) => s.name === C18_GATE_STEP);
          if (step === undefined || step.status !== 'completed' || step.conclusion !== 'success') {
            problems.push(`GitHub reports no successful blocking '${C18_GATE_STEP}' step`);
          }
        }
        const arts = await apiGet(artifactsUrl(hr.run_id), { fetchImpl, token });
        if (!arts.ok) problems.push(`hosted artifacts endpoint failed: ${arts.error}`);
        else {
          const all = Array.isArray(arts.body?.artifacts) ? arts.body.artifacts : [];
          if (arts.body?.total_count !== all.length) problems.push('hosted artifacts total_count does not match the returned artifacts');
          const picked = selectAttemptArtifact(all, {
            prefixForAttempt: c18ArtifactPrefixForAttempt,
            attempt: hr.run_attempt,
            digest: sha256(zipBytes),
            familyPrefix: C18_ARTIFACT_PREFIX,
            label: 'C18 evidence artifact',
          });
          problems.push(...picked.problems);
          notes.push(...picked.notes);
          const art = picked.artifact;
          if (art !== null) {
            // Unique, unexpired, positive-size, run-id/SHA-bound, valid wrapper digest.
            if (art.expired !== false) problems.push('the C18 artifact is expired or does not declare expired=false');
            if (!Number.isInteger(art.size_in_bytes) || art.size_in_bytes <= 0) problems.push('the C18 artifact has a non-positive size');
            if (art.workflow_run?.id !== Number(hr.run_id)) problems.push('the C18 artifact is not bound to the hosted run id');
            if (art.workflow_run?.head_sha !== manifest.source_sha) problems.push('the C18 artifact is not bound to the source SHA');
            if (!/^sha256:[0-9a-f]{64}$/.test(art.digest ?? '')) problems.push('the C18 artifact has no valid wrapper digest');
            notes.push(`github_c18_artifact=${art.name}`);
          }
        }
      }
    }
    if (shaped) {
      notes.push(`source_sha=${manifest.source_sha} mode=${manifest.mode} suites=${manifest.suite_receipts.length}`);
      notes.push(`path_a_tables=${Object.keys(before.tables).length}->${Object.keys(after.tables).length} path_b_tables=${Object.keys(virgin.tables).length}`);
      notes.push(`standing=${online ? 'delivery-online' : 'offline-candidate'}`);
    }
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
    const args = argMap(argv.slice(1), new Set(['--online', '--require-hosted']));
    const allowed = new Set(['--zip', '--root', '--online', '--require-hosted']);
    for (const k of Object.keys(args)) if (k.startsWith('--') && !allowed.has(k)) throw new Error(`unknown argument ${k}`);
    if (!args['--zip'] || !args['--root']) throw new Error('verify requires --zip and --root');
    const r = await verifyEvidence({
      zipPath: args['--zip'], root: args['--root'],
      online: args['--online'] === true, requireHosted: args['--require-hosted'] === true,
      token: process.env.GITHUB_TOKEN ?? null,
    });
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
