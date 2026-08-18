/**
 * C18.1 — THE CODE-OWNED CONTRACT for the dual-path database-history proof.
 *
 * Supersedes the C18 (d5061b8) contract, whose verifier false-passed synthetic archives and
 * whose evidence exposed ephemeral secrets. Everything a verifier may accept is stated HERE,
 * typed and exact; the producer and verifier are both judged against expectations neither of
 * them generates. Two supported histories:
 *
 *   PATH A (rebuild-forward): isolated instance, historical migrations 0001–0012 exactly,
 *     governed-port-only seeding, complete snapshot, unchanged 0013–0021 upgrade, snapshot,
 *     preservation + derived intentional transformation + authenticated audit chains +
 *     operation-closure linkage.
 *   PATH B (virgin latest): a fully disjoint instance, 0001–0021 directly, posture equal to
 *     the upgraded Path A posture in EVERY authority-relevant category.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export const HISTORICAL_LAST = '0012';
export const LATEST_LAST = '0021';
export const MIGRATION_COUNT_HISTORICAL = 12;
export const MIGRATION_COUNT_LATEST = 21;
export const GENESIS_HASH = '0'.repeat(64);
export const AUDIT_HASH_VERSION = 'eye-audit-v1';

/** The C18 artifact naming contract (attempt-aware + digest-bound, like C17's). */
export const C18_ARTIFACT_PREFIX = 'c18-db-paths-evidence-';
export const c18ArtifactPrefixForAttempt = (attempt) => `${C18_ARTIFACT_PREFIX}a${attempt}-`;
export const c18ArtifactName = (attempt, digest) => `${c18ArtifactPrefixForAttempt(attempt)}${digest}`;
export const C18_GATE_STEP = 'C18 dual-path database history gate (tracked runner, blocking)';

// ── SECRETS ────────────────────────────────────────────────────────────────────
/** Every generated secret class. The producer generates one value per class PER PATH. */
export const SECRET_CLASSES = Object.freeze([
  'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD', 'EYE_DB_SYSTEM_PASSWORD',
  'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD', 'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD',
  'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD', 'EYE_REDIS_PASSWORD',
]);

/** Domain-separated one-way digest for a secret-valued datum. Never invertible, but stable, so
 * pre/post equality is still provable. */
export const secretDigest = (cls, value) => sha256(`c18-secret-v1:${cls}:${value}`);

/** Snapshot columns whose RAW value is a secret and must be digest-substituted. */
export const SNAPSHOT_SECRET_COLUMNS = Object.freeze({
  'ctx.context_secret': Object.freeze(['secret']),
});

/** Replace every occurrence of a known secret in one string with a structured placeholder. */
export function redactString(text, secrets) {
  let out = text;
  for (const [cls, value] of secrets) {
    if (value && out.includes(value)) out = out.split(value).join(`<REDACTED:${cls}>`);
  }
  return out;
}
export const redactArgv = (argv, secrets) => argv.map((a) => redactString(String(a), secrets));

// ── MIGRATIONS ────────────────────────────────────────────────────────────────
const num = (name) => Number.parseInt(name.slice(0, 4), 10);

export function orderedMigrations(files) {
  const sqls = [...files].filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const problems = [];
  sqls.forEach((f, i) => {
    if (num(f) !== i + 1) problems.push(`migration sequence broken at '${f}' (expected ${String(i + 1).padStart(4, '0')})`);
  });
  return { files: sqls, problems };
}

export function verifyMigrationLedger({ trackedDigests, ledger, expectLast, priorLedger = null }) {
  const problems = [];
  const rows = [...ledger].sort((a, b) => (a.filename < b.filename ? -1 : 1));
  const expectCount = expectLast === HISTORICAL_LAST ? MIGRATION_COUNT_HISTORICAL : MIGRATION_COUNT_LATEST;
  if (rows.length !== expectCount) {
    problems.push(`ledger records ${rows.length} migrations; the ${expectLast} contract requires exactly ${expectCount}`);
  }
  rows.forEach((r, i) => {
    if (num(r.filename) !== i + 1) problems.push(`ledger order broken at '${r.filename}' (position ${i + 1})`);
    const want = trackedDigests.get(r.filename);
    if (want === undefined) problems.push(`ledger records '${r.filename}' which is not a tracked migration`);
    else if (want !== r.digest) {
      problems.push(`ledger digest for '${r.filename}' is ${r.digest}; the tracked bytes hash to ${want}`);
    }
  });
  if (rows.length > 0 && num(rows[rows.length - 1].filename) !== Number.parseInt(expectLast, 10)) {
    problems.push(`ledger ends at '${rows[rows.length - 1].filename}'; expected ${expectLast}`);
  }
  if (priorLedger !== null) {
    const post = new Map(rows.map((r) => [r.filename, r]));
    for (const prev of priorLedger) {
      const now = post.get(prev.filename);
      if (now === undefined) problems.push(`applied migration '${prev.filename}' DISAPPEARED from the ledger across the upgrade`);
      else if (now.digest !== prev.digest || now.applied_at !== prev.applied_at) {
        problems.push(`applied migration '${prev.filename}' was re-recorded across the upgrade (digest/applied_at changed)`);
      }
    }
  }
  return problems;
}

/**
 * INTENTIONAL transforms are DERIVED from the source migrations 0013–0021, never asserted:
 * every `CREATE TABLE [IF NOT EXISTS] schema.name` and every
 * `ALTER TABLE schema.name ADD COLUMN [IF NOT EXISTS] col type …` in that range, with the
 * declared nullability and default carried along so the verifier can also judge values.
 */
export function deriveIntentionalTransforms(migrationsDir, files) {
  const tablesAdded = new Map();
  const columnsAdded = [];
  for (const f of files) {
    if (f.slice(0, 4) <= HISTORICAL_LAST || f.slice(0, 4) > LATEST_LAST) continue;
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+\.[a-z_0-9]+)/g)) {
      tablesAdded.set(m[1], f);
    }
    for (const alter of sql.matchAll(/ALTER TABLE\s+([a-z_]+\.[a-z_0-9]+)([\s\S]*?);/g)) {
      const [, table, body] = alter;
      for (const col of body.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_0-9]+)\s+([a-z]+[a-z0-9 ]*?)(?=\s*(?:NOT NULL|DEFAULT|,|$))([^,]*)/g)) {
        const rest = col[3] ?? '';
        columnsAdded.push({
          table,
          column: col[1],
          migration: f,
          not_null: /NOT NULL/.test(rest),
          default: /DEFAULT\s+([^,\s]+)/.exec(rest)?.[1] ?? null,
        });
      }
    }
  }
  return {
    tablesAdded: [...tablesAdded.entries()].map(([table, migration]) => ({ table, migration })).sort((a, b) => (a.table < b.table ? -1 : 1)),
    columnsAdded: columnsAdded.sort((a, b) => (`${a.table}.${a.column}` < `${b.table}.${b.column}` ? -1 : 1)),
  };
}

// ── SNAPSHOT COMPARISON ───────────────────────────────────────────────────────
export const SNAPSHOT_SCHEMAS = Object.freeze([
  'tenancy', 'identity', 'policy', 'audit', 'objects', 'ctx', 'config',
]);

const rowKey = (row, pk) => JSON.stringify(pk.map((c) => row[c]));

export function compareSnapshots(before, after, transforms) {
  const problems = [];
  const allowedTables = new Set(transforms.tablesAdded.map((t) => t.table));
  const allowedColumns = new Map();
  for (const c of transforms.columnsAdded) {
    if (!allowedColumns.has(c.table)) allowedColumns.set(c.table, new Map());
    allowedColumns.get(c.table).set(c.column, c);
  }

  for (const [table, b] of Object.entries(before.tables)) {
    const a = after.tables[table];
    if (a === undefined) { problems.push(`table '${table}' DISAPPEARED across the upgrade`); continue; }
    if (b.pk.length === 0) problems.push(`table '${table}' has NO PRIMARY KEY in the pre-upgrade snapshot`);
    if (JSON.stringify(a.pk) !== JSON.stringify(b.pk)) problems.push(`table '${table}' primary key changed across the upgrade`);
    for (const c of b.columns) if (!a.columns.includes(c)) problems.push(`column '${table}.${c}' DISAPPEARED across the upgrade`);
    for (const c of a.columns) {
      if (!b.columns.includes(c) && !allowedColumns.get(table)?.has(c)) {
        problems.push(`column '${table}.${c}' appeared without being a migration-derived intentional transform`);
      }
    }
    const afterByKey = new Map(a.rows.map((r) => [rowKey(r, b.pk), r]));
    for (const r of b.rows) {
      const now = afterByKey.get(rowKey(r, b.pk));
      if (now === undefined) { problems.push(`row ${rowKey(r, b.pk)} of '${table}' was LOST across the upgrade`); continue; }
      for (const c of b.columns) {
        if (JSON.stringify(now[c]) !== JSON.stringify(r[c])) {
          problems.push(`'${table}' row ${rowKey(r, b.pk)} column '${c}' changed across the upgrade`);
        }
      }
      // Added-column BACKFILL semantics: pre-existing rows must carry the DDL default.
      for (const [colName, spec] of allowedColumns.get(table) ?? []) {
        const v = now[colName];
        if (spec.not_null && (v === null || v === undefined)) {
          problems.push(`'${table}' pre-existing row ${rowKey(r, b.pk)} has NULL in NOT NULL added column '${colName}'`);
        }
        if (spec.default === 'false' && v !== false) {
          problems.push(`'${table}' pre-existing row ${rowKey(r, b.pk)} added column '${colName}' is ${JSON.stringify(v)}, expected the DDL default false`);
        }
        if (spec.default === null && !spec.not_null && v !== null && v !== undefined) {
          problems.push(`'${table}' pre-existing row ${rowKey(r, b.pk)} added column '${colName}' was backfilled with ${JSON.stringify(v)} without a migration default`);
        }
      }
    }
    if (a.rows.length !== b.rows.length) {
      problems.push(`'${table}' cardinality changed ${b.rows.length} -> ${a.rows.length} across the upgrade`);
    }
  }
  for (const table of Object.keys(after.tables)) {
    if (!(table in before.tables) && !allowedTables.has(table)) {
      problems.push(`table '${table}' appeared without being a migration-derived intentional transform`);
    }
  }
  for (const t of transforms.tablesAdded) {
    if (!(t.table in after.tables)) problems.push(`migration-declared table '${t.table}' (${t.migration}) is MISSING post-upgrade`);
  }
  for (const c of transforms.columnsAdded) {
    if (after.tables[c.table] !== undefined && !after.tables[c.table].columns.includes(c.column)) {
      problems.push(`migration-declared column '${c.table}.${c.column}' (${c.migration}) is MISSING post-upgrade`);
    }
  }

  // Relationships: COMPLETE FK definitions (local+referenced tables/columns in order, actions,
  // validity, deferrability — pg_get_constraintdef captures all of it) plus resolved pair-sets.
  const afterFks = new Map(after.fks.map((f) => [f.constraint, f]));
  for (const f of before.fks) {
    const now = afterFks.get(f.constraint);
    if (now === undefined) { problems.push(`FK '${f.constraint}' DISAPPEARED across the upgrade`); continue; }
    if (now.definition !== f.definition) {
      problems.push(`FK '${f.constraint}' DEFINITION changed across the upgrade (target/columns/actions)`);
    }
    if (now.pairs_count !== f.pairs_count || now.pairs_digest !== f.pairs_digest) {
      problems.push(`FK '${f.constraint}' resolved pair-set changed across the upgrade`);
    }
  }
  return problems;
}

// ── AUDIT AUTHENTICATION ──────────────────────────────────────────────────────
/**
 * Full recomputation with the PRODUCTION implementation: `jcs` and `rowHash` must be the
 * exact @eye/contracts functions (injected so this module stays dependency-free).
 * Every stored event_jcs must BE canonical; every row_hash is recomputed; version, genesis,
 * sequence, previous_hash and heads are all authenticated.
 */
export function verifyChainRows({ events, heads, priorEvents = null, jcs = null, rowHash = null }) {
  const problems = [];
  const byPartition = new Map();
  for (const e of [...events].sort((x, y) => Number(x.audit_seq) - Number(y.audit_seq))) {
    if (!byPartition.has(e.partition_id)) byPartition.set(e.partition_id, []);
    byPartition.get(e.partition_id).push(e);
  }
  for (const [partition, rows] of byPartition) {
    rows.forEach((e, i) => {
      if (Number(e.audit_seq) !== i + 1) problems.push(`audit partition '${partition}' has a GAP at seq ${e.audit_seq} (position ${i + 1})`);
      const wantPrev = i === 0 ? GENESIS_HASH : rows[i - 1].row_hash;
      if (e.previous_hash !== wantPrev) problems.push(`audit partition '${partition}' seq ${e.audit_seq} previous_hash does not chain`);
      if (e.hash_alg_version !== AUDIT_HASH_VERSION) {
        problems.push(`audit partition '${partition}' seq ${e.audit_seq} hash_alg_version is ${JSON.stringify(e.hash_alg_version)}`);
      }
      if (jcs !== null && rowHash !== null) {
        let parsed = null;
        try { parsed = JSON.parse(e.event_jcs); } catch {
          problems.push(`audit partition '${partition}' seq ${e.audit_seq} event_jcs is not JSON`);
        }
        if (parsed !== null) {
          if (jcs(parsed) !== e.event_jcs) {
            problems.push(`audit partition '${partition}' seq ${e.audit_seq} stored event_jcs is NOT canonical`);
          }
          let recomputed = null;
          try {
            recomputed = rowHash({
              partitionId: e.partition_id, auditSeq: Number(e.audit_seq),
              previousHash: e.previous_hash, event: parsed,
            });
          } catch (err) {
            problems.push(`audit partition '${partition}' seq ${e.audit_seq} row hash recomputation failed: ${err instanceof Error ? err.message : err}`);
          }
          if (recomputed !== null && recomputed !== e.row_hash) {
            problems.push(`audit partition '${partition}' seq ${e.audit_seq} row_hash does not recompute under the production formula`);
          }
        }
      }
    });
    const head = heads.find((h) => h.partition_id === partition);
    if (head === undefined) problems.push(`audit partition '${partition}' has no chain head`);
    else if (Number(head.next_seq) !== rows.length + 1 || head.head_hash !== rows[rows.length - 1].row_hash) {
      problems.push(`audit partition '${partition}' head (next_seq ${head.next_seq}) disagrees with the ledger (${rows.length} rows)`);
    }
  }
  for (const h of heads) {
    if (!byPartition.has(h.partition_id) && Number(h.next_seq) !== 1) {
      problems.push(`audit head '${h.partition_id}' claims history (next_seq ${h.next_seq}) but the partition has no rows`);
    }
  }
  if (priorEvents !== null) {
    const now = new Map(events.map((e) => [`${e.partition_id}#${e.audit_seq}`, e]));
    for (const prev of priorEvents) {
      const cur = now.get(`${prev.partition_id}#${prev.audit_seq}`);
      if (cur === undefined) { problems.push(`pre-upgrade audit row ${prev.partition_id}#${prev.audit_seq} DISAPPEARED`); continue; }
      if (cur.row_hash !== prev.row_hash || cur.event_jcs !== prev.event_jcs) {
        problems.push(`pre-upgrade audit row ${prev.partition_id}#${prev.audit_seq} canonical bytes or hash changed`);
      }
    }
  }
  return problems;
}

/**
 * The SEED FLOOR: code-owned, NONEMPTY expectations, so deleting the audit world (or the seed)
 * cannot pass. Derived from what the governed 0012-era seed deterministically produces.
 */
export const SEED_FLOOR = Object.freeze({
  tenants: 2, domains: 3, principals: 4, sessions: 2, objects: 2, outbox: 2,
  outbox_published: 1, outbox_pending: 1, decisions: 12,
  audit_platform_min: 8, audit_tenant_partitions_min: 1, audit_total_min: 12,
});

export function verifySeedFloor(snapshot, floor = SEED_FLOOR) {
  const problems = [];
  const count = (t) => snapshot.tables[t]?.rows.length ?? 0;
  const checks = [
    ['tenancy.tenants', count('tenancy.tenants'), floor.tenants],
    ['tenancy.domains', count('tenancy.domains'), floor.domains],
    ['identity.principals', count('identity.principals'), floor.principals],
    ['identity.sessions', count('identity.sessions'), floor.sessions],
    ['objects.canonical_objects', count('objects.canonical_objects'), floor.objects],
    ['objects.object_outbox', count('objects.object_outbox'), floor.outbox],
    ['policy.policy_decisions', count('policy.policy_decisions'), floor.decisions],
  ];
  for (const [label, actual, min] of checks) {
    if (actual < min) problems.push(`seed floor: ${label} has ${actual} row(s); the governed seed guarantees >= ${min}`);
  }
  const outboxRows = snapshot.tables['objects.object_outbox']?.rows ?? [];
  if (outboxRows.filter((r) => r.status === 'published').length < floor.outbox_published) {
    problems.push('seed floor: no published outbox effect');
  }
  if (outboxRows.filter((r) => r.status === 'pending').length < floor.outbox_pending) {
    problems.push('seed floor: no pending outbox effect');
  }
  const events = snapshot.audit.events;
  const platform = events.filter((e) => e.partition_id === 'platform').length;
  const tenantParts = new Set(events.map((e) => e.partition_id).filter((p) => p.startsWith('tenant:')));
  if (platform < floor.audit_platform_min) problems.push(`seed floor: platform audit partition has ${platform} event(s); >= ${floor.audit_platform_min} required`);
  if (tenantParts.size < floor.audit_tenant_partitions_min) problems.push('seed floor: no tenant audit partition exists');
  if (events.length < floor.audit_total_min) problems.push(`seed floor: ${events.length} audit event(s) total; >= ${floor.audit_total_min} required`);
  return problems;
}

/** policy_decision linkage across the whole snapshot (referential, both directions used). */
export function verifyLinkage({ auditEvents, decisions, outbox }) {
  const problems = [];
  const decisionIds = new Set(decisions.map((d) => d.id));
  for (const e of auditEvents) {
    if (e.policy_decision_id !== null && e.policy_decision_id !== undefined
      && !decisionIds.has(e.policy_decision_id)) {
      problems.push(`audit event ${e.partition_id}#${e.audit_seq} names policy decision ${e.policy_decision_id} which does not exist`);
    }
  }
  const auditCorrelations = new Set(auditEvents.map((e) => e.correlation_id).filter(Boolean));
  for (const o of outbox) {
    if (!auditCorrelations.has(o.correlation_id)) {
      problems.push(`outbox event ${o.id} carries correlation ${o.correlation_id} with no corresponding audit event`);
    }
  }
  return problems;
}

/**
 * OPERATION CLOSURE (0013+): the ONE deterministic governed post-upgrade operation must chain
 * decision → ctx.operation → ctx.operation_effect → success audit event with the same ids,
 * actor, tenant, target, correlation and outcome. `expected` comes from the producer's seed
 * record; the ROWS come from the post-upgrade snapshot.
 */
export function verifyOperationClosure({ snapshot, expected }) {
  const problems = [];
  const ops = snapshot.tables['ctx.operation']?.rows ?? [];
  const effects = snapshot.tables['ctx.operation_effect']?.rows ?? [];
  const decisions = snapshot.tables['policy.policy_decisions']?.rows ?? [];
  const events = snapshot.audit.events;
  if (expected === null || typeof expected !== 'object' || typeof expected.correlation !== 'string') {
    return ['no post-upgrade governed operation was recorded; the closure claim is unproven'];
  }
  const op = ops.find((o) => o.correlation_id === expected.correlation);
  if (op === undefined) return [`ctx.operation has no row for the recorded post-upgrade correlation ${expected.correlation}`];
  if (op.action !== expected.action) problems.push(`post-upgrade operation action is ${JSON.stringify(op.action)}, recorded ${JSON.stringify(expected.action)}`);
  if (op.decision_id !== expected.decisionId) problems.push('post-upgrade operation is not bound to the recorded policy decision');
  if (op.principal_id !== expected.principalId) problems.push('post-upgrade operation principal differs from the recorded actor');
  if (op.tenant_id !== expected.tenantId) problems.push('post-upgrade operation tenant differs from the recorded tenant');
  if (op.target !== expected.target) problems.push(`post-upgrade operation target is ${JSON.stringify(op.target)}, recorded ${JSON.stringify(expected.target)}`);
  if (!decisions.some((d) => d.id === expected.decisionId)) problems.push('the recorded post-upgrade policy decision row does not exist');
  const opEffects = effects.filter((e) => e.operation_id === op.operation_id);
  if (opEffects.length === 0) problems.push('ctx.operation_effect has no row for the post-upgrade operation');
  else if (expected.effectRef !== undefined
    && !opEffects.some((e) => e.effect_ref === expected.effectRef)) {
    problems.push(`no operation effect references ${JSON.stringify(expected.effectRef)}`);
  }
  const closing = events.find((e) => e.correlation_id === expected.correlation
    && e.policy_decision_id === expected.decisionId);
  if (closing === undefined) problems.push('no audit event closes the post-upgrade operation (correlation+decision)');
  else {
    let body = null;
    try { body = JSON.parse(closing.event_jcs); } catch { /* chain checks already reject */ }
    if (body !== null) {
      if (body.outcome !== 'success') problems.push(`the closing audit event outcome is ${JSON.stringify(body.outcome)}`);
      if (body.action !== expected.action) problems.push('the closing audit event action differs from the operation action');
      if (body.tenant_id !== expected.tenantId) problems.push('the closing audit event tenant differs from the operation tenant');
      if (body.actor !== `principal:${expected.principalId}`) problems.push('the closing audit event actor differs from the recorded actor');
    }
  }
  return problems;
}

// ── CATALOG POSTURE ───────────────────────────────────────────────────────────
/** The EXACT category set. A posture object missing a category — or two equally empty
 * objects — cannot pass: required categories must be present AND nonempty. */
export const POSTURE_CATEGORIES = Object.freeze([
  'roles', 'memberships', 'database_privileges', 'schema_privileges', 'table_grants',
  'sequence_privileges', 'default_privileges', 'owners', 'routines', 'rls', 'policies',
  'triggers', 'columns', 'constraints', 'indexes',
]);
// `memberships` is deliberately absent: the authority model uses standalone roles, so the
// category is captured and compared but is legitimately empty on both paths.
export const POSTURE_NONEMPTY = Object.freeze([
  'roles', 'schema_privileges', 'table_grants', 'owners', 'routines',
  'rls', 'policies', 'columns', 'constraints', 'indexes',
]);

export function comparePosture(a, b, labels = ['path-a-upgraded', 'path-b-virgin']) {
  const problems = [];
  for (const [label, p] of [[labels[0], a], [labels[1], b]]) {
    const keys = Object.keys(p ?? {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...POSTURE_CATEGORIES].sort())) {
      problems.push(`${label} posture categories ${JSON.stringify(keys)} are not the exact code-owned set`);
      continue;
    }
    for (const cat of POSTURE_NONEMPTY) {
      if (!Array.isArray(p[cat]) || p[cat].length === 0) {
        problems.push(`${label} posture category '${cat}' is empty — an authority surface cannot be vacuously equal`);
      }
    }
  }
  if (problems.length > 0) return problems;
  for (const k of POSTURE_CATEGORIES) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      problems.push(`catalog posture '${k}' differs between ${labels[0]} and ${labels[1]}`);
    }
  }
  return problems;
}

// ── SUITES ────────────────────────────────────────────────────────────────────
/**
 * The honest execution matrix. `integration` is genuinely PATH-SPECIFIC (it runs directly
 * against each path's database). `acceptance` is SELF-MANAGED — it provisions its own pristine
 * per-run database on whatever server it targets — so its tuples are named per INSTANCE, never
 * described as exercising the upgraded data.
 */
export const SUITE_MATRIX = Object.freeze({
  integration: Object.freeze({
    command: ['pnpm', '--filter', '@eye/api', 'test:int'],
    framework: 'vitest',
    runs_on: Object.freeze(['path-a-upgraded', 'path-b-virgin']),
    reason: 'privilege, isolation, audit-chain and outbox behaviour run DIRECTLY against each '
      + "path's own database — the upgraded seeded database on Path A, the virgin one on Path B",
  }),
  acceptance: Object.freeze({
    command: ['pnpm', '--filter', '@eye/api', 'test:accept'],
    framework: 'vitest',
    runs_on: Object.freeze(['instance-a-server', 'instance-b-server']),
    reason: 'SELF-MANAGED: the suite provisions its own pristine per-run database by design, so '
      + "each tuple proves the acceptance criteria against that path's isolated SERVER, not "
      + 'against the upgraded data; the upgraded-data proof is the snapshot contract plus the '
      + 'integration suite',
  }),
  'unit-gate-hermetic': Object.freeze({
    command: null, framework: null,
    runs_on: Object.freeze(['once-only']),
    reason: 'hermetic by design — reads no database; runs once in CI build-test',
  }),
  'browser-regression': Object.freeze({
    command: null, framework: null,
    runs_on: Object.freeze(['once-only']),
    reason: 'runs once in its own CI job on a virgin compose database; duplicating a full '
      + 'browser build per path would prove nothing the API suites do not',
  }),
});

const RECEIPT_FIELDS = Object.freeze([
  'suite', 'path', 'command_id', 'argv_redacted', 'timeout_ms', 'exit_status', 'signal',
  'stdout_file', 'stderr_file', 'exit_file', 'stdout_bytes', 'stdout_sha256',
  'stderr_bytes', 'stderr_sha256', 'tests_passed', 'tests_total',
]);

/**
 * Suite receipts, EXACTLY bound: one unique tuple per matrix entry, exact field set, streams
 * distinct across all receipts, and `readFile(rel)` lets the verifier re-hash the raw bytes
 * and re-parse the framework summary rather than trusting the receipt.
 */
export function verifySuiteReceipts(matrix, receipts, { readFile = null, commands = null } = {}) {
  const problems = [];
  const seenTuples = new Set();
  const seenStreams = new Set();
  for (const r of receipts) {
    const keys = Object.keys(r).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...RECEIPT_FIELDS].sort())) {
      problems.push(`suite receipt for '${r.suite}'/'${r.path}' fields ${JSON.stringify(keys)} are not the exact contract set`);
      continue;
    }
    const tuple = `${r.suite}#${r.path}`;
    if (seenTuples.has(tuple)) problems.push(`DUPLICATE suite receipt for ${tuple}`);
    seenTuples.add(tuple);
    const spec = matrix[r.suite];
    if (spec === undefined || !spec.runs_on.includes(r.path)) {
      problems.push(`receipt ${tuple} is not in the code-owned matrix`);
      continue;
    }
    for (const f of ['stdout_file', 'stderr_file', 'exit_file']) {
      if (seenStreams.has(r[f])) problems.push(`receipt ${tuple} SHARES stream ${r[f]} with another receipt`);
      seenStreams.add(r[f]);
    }
    if (new Set([r.stdout_file, r.stderr_file, r.exit_file]).size !== 3) {
      problems.push(`receipt ${tuple} does not have three DISTINCT stream files`);
    }
    if (r.exit_status !== 0 || r.signal !== null) {
      problems.push(`receipt ${tuple} recorded exit ${r.exit_status} signal ${r.signal}`);
    }
    if (!Number.isInteger(r.timeout_ms) || r.timeout_ms <= 0) problems.push(`receipt ${tuple} has no positive timeout`);
    if (JSON.stringify(r.argv_redacted) !== JSON.stringify(spec.command)) {
      problems.push(`receipt ${tuple} argv ${JSON.stringify(r.argv_redacted)} is not the matrix command`);
    }
    if (commands !== null) {
      const cmd = commands.find((c) => c.id === r.command_id);
      if (cmd === undefined) problems.push(`receipt ${tuple} names command ledger id '${r.command_id}' which does not exist`);
      else if (JSON.stringify(cmd.argv.slice(0, spec.command.length)) !== JSON.stringify(spec.command)) {
        problems.push(`receipt ${tuple} command-ledger argv does not match the matrix command`);
      }
    }
    if (readFile !== null) {
      const stdout = readFile(r.stdout_file);
      const stderr = readFile(r.stderr_file);
      const exitTxt = readFile(r.exit_file);
      if (stdout === null || stderr === null || exitTxt === null) {
        problems.push(`receipt ${tuple} names missing stream file(s)`);
        continue;
      }
      if (stdout.byteLength !== r.stdout_bytes || sha256(stdout) !== r.stdout_sha256) {
        problems.push(`receipt ${tuple} stdout bytes/digest do not match the raw evidence`);
      }
      if (stderr.byteLength !== r.stderr_bytes || sha256(stderr) !== r.stderr_sha256) {
        problems.push(`receipt ${tuple} stderr bytes/digest do not match the raw evidence`);
      }
      if (exitTxt.toString('utf8').trim() !== '0') {
        problems.push(`receipt ${tuple} raw exit receipt is ${JSON.stringify(exitTxt.toString('utf8').trim())}, not 0`);
      }
      if (spec.framework === 'vitest') {
        // ANSI-stripped: hosted runners force colour codes into the raw stream evidence.
        const text = (stdout.toString('utf8') + stderr.toString('utf8'))
          .replace(/\x1b\[[0-9;]*m/g, '');
        const m = /Tests {2}(\d+) passed \((\d+)\)/.exec(text);
        const failed = /\d+ failed/.test(text);
        if (m === null || failed) {
          problems.push(`receipt ${tuple} raw output does not contain a passing vitest summary`);
        } else if (Number(m[1]) !== r.tests_passed || Number(m[2]) !== r.tests_total
          || r.tests_passed !== r.tests_total || r.tests_passed <= 0) {
          problems.push(`receipt ${tuple} parsed counts (${m[1]}/${m[2]}) do not match the receipt (${r.tests_passed}/${r.tests_total})`);
        }
      }
    }
  }
  for (const [suite, spec] of Object.entries(matrix)) {
    for (const where of spec.runs_on) {
      if (where === 'once-only') continue;
      if (!seenTuples.has(`${suite}#${where}`)) problems.push(`suite '${suite}' has no receipt for ${where}`);
    }
  }
  return problems;
}

// ── ISOLATION ─────────────────────────────────────────────────────────────────
export const ISOLATION_FIELDS = Object.freeze([
  'path', 'container_id', 'container_name', 'redis_container_id', 'redis_container',
  'database', 'port', 'redis_port', 'postgres_image', 'redis_image', 'credential_digests',
]);

export function verifyIsolation(receiptA, receiptB) {
  const problems = [];
  for (const [label, r] of [['path-a', receiptA], ['path-b', receiptB]]) {
    const keys = Object.keys(r ?? {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...ISOLATION_FIELDS].sort())) {
      problems.push(`${label} isolation receipt fields ${JSON.stringify(keys)} are not the exact typed set`);
    }
    const credKeys = Object.keys(r?.credential_digests ?? {}).sort();
    if (JSON.stringify(credKeys) !== JSON.stringify([...SECRET_CLASSES].sort())) {
      problems.push(`${label} credential digest keys are not exactly the code-owned secret classes`);
    }
  }
  if (problems.length > 0) return problems;
  for (const f of ['container_id', 'container_name', 'redis_container_id', 'redis_container', 'database', 'port', 'redis_port']) {
    if (receiptA[f] === receiptB[f]) problems.push(`paths SHARED ${f} (${JSON.stringify(receiptA[f])})`);
  }
  for (const k of SECRET_CLASSES) {
    if (receiptA.credential_digests[k] === receiptB.credential_digests[k]) {
      problems.push(`paths shared the '${k}' credential`);
    }
  }
  return problems;
}

// ── MANIFEST + RESULT TYPING ──────────────────────────────────────────────────
export const MANIFEST_FIELDS = Object.freeze({
  gate: (v) => v === 'C18',
  mode: (v) => v === 'final' || v === 'preliminary',
  source_sha: (v) => /^[0-9a-f]{40}$/.test(v),
  source_tree: (v) => /^[0-9a-f]{40}$/.test(v),
  worktree_clean_before: (v) => v === true,
  worktree_clean_after: (v) => v === true,
  skip_suites_dev_seam: (v) => v === false || v === true,
  historical_last: (v) => v === HISTORICAL_LAST,
  latest_last: (v) => v === LATEST_LAST,
  migration_digests: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  intentional_transforms: (v) => v !== null && typeof v === 'object',
  suite_matrix: (v) => v !== null && typeof v === 'object',
  receipts: (v) => v !== null && typeof v === 'object',
  suite_receipts: (v) => Array.isArray(v),
  seed_summary: (v) => v !== null && typeof v === 'object',
  post_upgrade_operation: (v) => v !== null && typeof v === 'object',
  hosted_receipt: (v) => v !== null && typeof v === 'object',
  cleanup: (v) => v !== null && typeof v === 'object',
});

export function verifyManifestShape(manifest) {
  const problems = [];
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['c18-manifest is not an object'];
  }
  const expected = Object.keys(MANIFEST_FIELDS).sort();
  const actual = Object.keys(manifest).sort();
  for (const k of expected.filter((x) => !actual.includes(x))) problems.push(`c18-manifest is MISSING field '${k}'`);
  for (const k of actual.filter((x) => !expected.includes(x))) problems.push(`c18-manifest has UNKNOWN field '${k}'`);
  for (const [k, pred] of Object.entries(MANIFEST_FIELDS)) {
    if (k in manifest && !pred(manifest[k])) problems.push(`c18-manifest field '${k}' is malformed: ${JSON.stringify(manifest[k]).slice(0, 80)}`);
  }
  return problems;
}

/** RESULT-PASS.txt as an EXACT typed receipt — substring containment is forbidden. */
export function parseResultReceipt(text, manifest) {
  const problems = [];
  const lines = text.split('\n');
  const expected = [
    'outcome: PASS',
    `gate: C18`,
    `mode: ${manifest.mode}`,
    `source_sha: ${manifest.source_sha}`,
    'paths: path-a-upgraded, path-b-virgin',
  ];
  expected.forEach((want, i) => {
    if (lines[i] !== want) problems.push(`RESULT receipt line ${i + 1} is ${JSON.stringify(lines[i])}; the exact contract requires ${JSON.stringify(want)}`);
  });
  if (lines.length !== expected.length + 1 || lines[expected.length] !== '') {
    problems.push('RESULT receipt carries trailing content beyond the exact contract');
  }
  return problems;
}
