/**
 * C18.1.2 — THE CODE-OWNED CONTRACT for the dual-path database-history proof.
 *
 * Supersedes the C18 (d5061b8), C18.1 (8a23526) and C18.1.1 (567a70f) contracts. 567a70f
 * produced leak-free authentic evidence but its verifier still accepted fully-rebound false
 * packages (duplicated/deleted/exit-forged ledger commands, tampered port receipts, forged
 * seed principals and summaries, forged post-upgrade eventIds, attacker posture pairs,
 * evidence-only or attacker-principal closure decisions). This revision closes each of those
 * classes with a source-owned command graph, raw posture/provisioning reconstruction, a
 * closed seed-record schema with bidirectional snapshot binding, and an exact closure-decision
 * contract. Everything a verifier may accept is stated HERE, typed and exact; the producer and
 * verifier are both judged against expectations neither of them generates. Two supported
 * histories:
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

/**
 * The EXACT source-owned base-table universes. The 0012 set plus 0013's two operation-ledger
 * tables is the 0021 set. Requiring the exact key set means removing a complete nonempty table
 * from a delivered snapshot cannot pass — even before raw reconstruction.
 */
export const TABLE_UNIVERSE_HISTORICAL = Object.freeze([
  'audit.audit_chain_heads', 'audit.audit_events', 'audit.audit_seals',
  'audit.availability_incidents', 'audit.intake_suppression', 'audit.integrity_incidents',
  'config.runtime_profile', 'ctx.context_secret', 'ctx.issued', 'identity.bootstrap_claim',
  'identity.break_glass_grants', 'identity.credentials', 'identity.principals',
  'identity.refresh_tokens', 'identity.role_bindings', 'identity.roles', 'identity.sessions',
  'objects.canonical_field_registry', 'objects.canonical_objects', 'objects.object_outbox',
  'objects.schema_registry', 'policy.policy_bundles', 'policy.policy_decisions',
  'tenancy.domains', 'tenancy.lifecycle_events', 'tenancy.tenants',
]);
export const TABLE_UNIVERSE_LATEST = Object.freeze(
  [...TABLE_UNIVERSE_HISTORICAL, 'ctx.operation', 'ctx.operation_effect'].sort(),
);

/** A snapshot table must have exactly {pk, columns, rows, row_count}, row_count == rows.length. */
export function verifyTableUniverse(snapshot, expectedTables, label) {
  const problems = [];
  const keys = Object.keys(snapshot.tables ?? {}).sort();
  const want = [...expectedTables].sort();
  for (const t of want.filter((x) => !keys.includes(x))) problems.push(`${label}: source-owned table '${t}' is MISSING`);
  for (const t of keys.filter((x) => !want.includes(x))) problems.push(`${label}: unexpected table '${t}' present`);
  for (const [t, v] of Object.entries(snapshot.tables ?? {})) {
    const shape = Object.keys(v).sort();
    if (JSON.stringify(shape) !== JSON.stringify(['columns', 'pk', 'row_count', 'rows'])) {
      problems.push(`${label}: table '${t}' shape ${JSON.stringify(shape)} is not {pk,columns,rows,row_count}`);
      continue;
    }
    if (!Array.isArray(v.rows) || v.row_count !== v.rows.length) {
      problems.push(`${label}: table '${t}' row_count ${v.row_count} != rows.length ${v.rows?.length}`);
    }
    if (!Array.isArray(v.pk) || v.pk.length === 0 || !Array.isArray(v.columns) || v.columns.length === 0) {
      problems.push(`${label}: table '${t}' has an empty pk or columns`);
    }
  }
  return problems;
}

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

/**
 * Every audit event carries duplicated top-level projection fields (correlation_id,
 * policy_decision_id, …). Each MUST equal the value derived from the authenticated canonical
 * event_jcs body, so a forged top-level projection over a genuine JCS body is rejected.
 */
export function authenticateProjections(events, jcs) {
  const problems = [];
  for (const e of events) {
    let body = null;
    try { body = JSON.parse(e.event_jcs); } catch { continue; /* chain check rejects */ }
    if (jcs && jcs(body) !== e.event_jcs) continue; // non-canonical caught elsewhere
    const derivedCorr = body.correlation_id ?? null;
    const derivedDecision = body.policy_decision_id ?? null;
    if ((e.correlation_id ?? null) !== derivedCorr) {
      problems.push(`audit ${e.partition_id}#${e.audit_seq} projected correlation_id disagrees with its JCS body`);
    }
    if ((e.policy_decision_id ?? null) !== derivedDecision) {
      problems.push(`audit ${e.partition_id}#${e.audit_seq} projected policy_decision_id disagrees with its JCS body`);
    }
  }
  return problems;
}

/** Exact audit event/head shapes. */
const AUDIT_EVENT_FIELDS = ['partition_id', 'audit_seq', 'event_jcs', 'previous_hash', 'row_hash', 'hash_alg_version', 'correlation_id', 'policy_decision_id'].sort();
const AUDIT_HEAD_FIELDS = ['partition_id', 'next_seq', 'head_hash', 'frozen'].sort();
export function verifyAuditShapes(audit, label) {
  const problems = [];
  for (const e of audit.events ?? []) {
    if (JSON.stringify(Object.keys(e).sort()) !== JSON.stringify(AUDIT_EVENT_FIELDS)) {
      problems.push(`${label}: audit event ${e.partition_id}#${e.audit_seq} has the wrong field set`); break;
    }
  }
  for (const h of audit.heads ?? []) {
    if (JSON.stringify(Object.keys(h).sort()) !== JSON.stringify(AUDIT_HEAD_FIELDS)) {
      problems.push(`${label}: audit head '${h.partition_id}' has the wrong field set`); break;
    }
  }
  const eventPartitions = new Set((audit.events ?? []).map((e) => e.partition_id));
  const headPartitions = new Set((audit.heads ?? []).map((h) => h.partition_id));
  for (const p of eventPartitions) if (!headPartitions.has(p)) problems.push(`${label}: partition '${p}' has events but no head`);
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

/** Code-owned constants of the ONE deterministic governed post-upgrade operation
 * (scripts/gate/lib/c18-seed-0012.mjs runPostUpgradeOperation). */
export const POST_UPGRADE_OPERATION_SPEC = Object.freeze({
  action: 'objects.create', scope: 'DOMAIN', consequence: 'C1',
  capability_class: 'authority.commit', bundle_version: 'bundle-v1',
  purpose: 'c18-post-upgrade-proof', object_type: 'objects.outbox',
  event_type: 'c18.post_upgrade.proof', audit_event_type: 'api.request',
  result_code: 'OK', reason: 'C18.1 post-upgrade closure proof',
  effect_kinds: Object.freeze(['outbox']),
});

/**
 * OPERATION CLOSURE (0013+): the ONE deterministic governed post-upgrade operation must chain
 * decision → ctx.operation → ctx.operation_effect → outbox row → success audit event with the
 * same ids, actor, tenant, domain, scope, target, correlation and outcome. `expected` comes
 * from the producer's seed record; the ROWS come from the post-upgrade snapshot. The closure
 * DECISION itself is exact: decision='allow', evidence_only=false, the operation's principal,
 * tenant, domain, scope, action, object target and correlation — and the recorded eventId,
 * effectRef and target suffix are ONE identity, bound to a real outbox row.
 */
export function verifyOperationClosure({ snapshot, expected, spec = POST_UPGRADE_OPERATION_SPEC }) {
  const problems = [];
  const ops = snapshot.tables['ctx.operation']?.rows ?? [];
  const effects = snapshot.tables['ctx.operation_effect']?.rows ?? [];
  const decisions = snapshot.tables['policy.policy_decisions']?.rows ?? [];
  const outbox = snapshot.tables['objects.object_outbox']?.rows ?? [];
  const events = snapshot.audit.events;
  const need = ['correlation', 'decisionId', 'action', 'target', 'tenantId', 'domainId', 'principalId', 'sessionId', 'eventId', 'effectRef', 'effectKinds'];
  if (expected === null || typeof expected !== 'object' || need.some((k) => expected[k] === undefined)) {
    return ['no complete post-upgrade governed operation was recorded; the closure claim is unproven'];
  }
  // The RECORD ITSELF must be internally consistent and spec-exact before any row is trusted:
  // eventId, effectRef and the target suffix are one identity.
  if (expected.action !== spec.action) problems.push(`post-upgrade record action ${JSON.stringify(expected.action)} is not the code-owned ${JSON.stringify(spec.action)}`);
  if (expected.target !== `outbox:${expected.eventId}`) {
    problems.push(`post-upgrade record target ${JSON.stringify(expected.target)} does not name its recorded eventId ${JSON.stringify(expected.eventId)}`);
  }
  if (expected.effectRef !== expected.eventId) {
    problems.push(`post-upgrade record effectRef ${JSON.stringify(expected.effectRef)} differs from its recorded eventId ${JSON.stringify(expected.eventId)}`);
  }
  if (JSON.stringify([...expected.effectKinds].sort()) !== JSON.stringify([...spec.effect_kinds].sort())) {
    problems.push(`post-upgrade record effect kinds ${JSON.stringify(expected.effectKinds)} are not the code-owned ${JSON.stringify(spec.effect_kinds)}`);
  }
  // Exactly ONE matching operation, no extra conflicting one.
  const matching = ops.filter((o) => o.correlation_id === expected.correlation);
  if (matching.length !== 1) return [...problems, `ctx.operation has ${matching.length} rows for the post-upgrade correlation; exactly one is required`];
  const op = matching[0];
  if (op.finalized !== true) problems.push('post-upgrade operation is not finalized');
  if (op.expected_outcome !== 'success') problems.push(`post-upgrade operation expected_outcome is ${JSON.stringify(op.expected_outcome)}`);
  for (const [f, col, want] of [
    ['action', op.action, expected.action], ['target', op.target, expected.target],
    ['decision', op.decision_id, expected.decisionId], ['principal', op.principal_id, expected.principalId],
    ['tenant', op.tenant_id, expected.tenantId], ['domain', op.domain_id, expected.domainId],
    ['session', op.session_id, expected.sessionId], ['correlation', op.correlation_id, expected.correlation],
    ['scope', op.scope, spec.scope], ['purpose', op.purpose, spec.purpose],
    ['consequence', op.consequence, spec.consequence],
    ['capability_class', op.capability_class, spec.capability_class],
    ['bundle_version', op.bundle_version, spec.bundle_version],
    ['causation', op.causation_id, null],
    ['obligations_required', op.obligations_required, false],
  ]) {
    if (col !== want) problems.push(`post-upgrade operation ${f} is ${JSON.stringify(col)}, required ${JSON.stringify(want)}`);
  }
  // The closure DECISION, exact: a REAL enforced allow for exactly this operation.
  const decision = decisions.find((d) => d.id === expected.decisionId);
  if (decision === undefined) problems.push('the recorded post-upgrade policy decision row does not exist');
  else {
    if (decision.decision !== 'allow') problems.push(`post-upgrade policy decision is ${JSON.stringify(decision.decision)}, not an allow`);
    if (decision.evidence_only !== false) {
      problems.push(`post-upgrade policy decision records evidence_only=${JSON.stringify(decision.evidence_only)}; an ENFORCED closure requires evidence_only=false`);
    }
    if (decision.principal_id !== `principal:${expected.principalId}`) {
      problems.push(`post-upgrade policy decision principal is ${JSON.stringify(decision.principal_id)}; the operation principal is ${JSON.stringify(`principal:${expected.principalId}`)}`);
    }
    for (const [f, col, want] of [
      ['action', decision.action, expected.action], ['correlation', decision.correlation_id, expected.correlation],
      ['scope', decision.scope, spec.scope], ['tenant', decision.tenant_id, expected.tenantId],
      ['domain', decision.domain_id, expected.domainId],
      ['object_type', decision.object_type, spec.object_type],
      ['object_id', decision.object_id, expected.eventId],
      ['consequence_class', decision.consequence_class, spec.consequence],
      ['purpose_id', decision.purpose_id, spec.purpose],
      ['bundle_version', decision.bundle_version, spec.bundle_version],
      ['revocation_state', decision.revocation_state, 'none'],
      ['delegation', decision.delegation_id, null], ['exception_ref', decision.exception_ref, null],
      ['expires_at', decision.expires_at, null], ['reason', decision.reason, spec.reason],
      ['input_digest', decision.input_digest, sha256(`c18-post:${expected.eventId}`)],
    ]) {
      if (col !== want) problems.push(`post-upgrade policy decision ${f} is ${JSON.stringify(col)}, required ${JSON.stringify(want)}`);
    }
    if (JSON.stringify(decision.obligations) !== '[]') problems.push('post-upgrade policy decision carries obligations the spec does not');
    if (JSON.stringify(decision.environment) !== '{}') problems.push('post-upgrade policy decision carries environment the spec does not');
  }
  // The recorded eventId must BE a real outbox row of this operation.
  const obRow = outbox.find((r) => r.id === expected.eventId);
  if (obRow === undefined) problems.push(`the recorded post-upgrade eventId ${JSON.stringify(expected.eventId)} has no objects.object_outbox row`);
  else {
    for (const [f, col, want] of [
      ['correlation', obRow.correlation_id, expected.correlation], ['event_type', obRow.event_type, spec.event_type],
      ['status', obRow.status, 'pending'], ['scope', obRow.scope, spec.scope],
      ['tenant', obRow.tenant_id, expected.tenantId], ['domain', obRow.domain_id, expected.domainId],
      ['published_at', obRow.published_at, null], ['lease_id', obRow.lease_id, null],
    ]) {
      if (col !== want) problems.push(`post-upgrade outbox row ${f} is ${JSON.stringify(col)}, required ${JSON.stringify(want)}`);
    }
  }
  // The EXACT effect-kind multiset and exact effect reference; no extra effect.
  const opEffects = effects.filter((e) => e.operation_id === op.operation_id);
  const kinds = opEffects.map((e) => e.effect_kind).sort();
  if (JSON.stringify(kinds) !== JSON.stringify([...expected.effectKinds].sort())) {
    problems.push(`post-upgrade effect kinds ${JSON.stringify(kinds)} != recorded ${JSON.stringify([...expected.effectKinds].sort())}`);
  }
  if (!opEffects.some((e) => e.effect_ref === expected.effectRef)) {
    problems.push(`no operation effect references ${JSON.stringify(expected.effectRef)}`);
  }
  // Exactly ONE closing success audit event; its WHOLE body is authenticated field by field.
  const closers = events.filter((e) => e.correlation_id === expected.correlation && e.policy_decision_id === expected.decisionId);
  if (closers.length !== 1) problems.push(`${closers.length} audit events close the operation; exactly one is required`);
  else {
    let body = null;
    try { body = JSON.parse(closers[0].event_jcs); } catch { /* chain rejects */ }
    if (body !== null) {
      for (const [f, col, want] of [
        ['outcome', body.outcome, 'success'], ['action', body.action, expected.action],
        ['tenant_id', body.tenant_id, expected.tenantId], ['domain_id', body.domain_id, expected.domainId],
        ['actor', body.actor, `principal:${expected.principalId}`],
        ['scope', body.scope, spec.scope], ['event_type', body.event_type, spec.audit_event_type],
        ['result_code', body.result_code, spec.result_code],
        ['correlation_id', body.correlation_id, expected.correlation],
        ['policy_decision_id', body.policy_decision_id, expected.decisionId],
        ['session_id', body.session_id, expected.sessionId],
        ['purpose_id', body.purpose_id, spec.purpose],
        ['policy_version', body.policy_version, spec.bundle_version],
        ['target_type', body.target_type, spec.object_type], ['target_id', body.target_id, expected.eventId],
        ['context_mode', body.context_mode, 'authority'],
      ]) {
        if (col !== want) problems.push(`the closing audit event ${f} is ${JSON.stringify(col)}, required ${JSON.stringify(want)}`);
      }
      if (typeof body.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(body.occurred_at)) {
        problems.push('the closing audit event carries no ISO-8601 Z occurred_at');
      }
    }
  }
  return problems;
}

// ── THE CLOSED SEED RECORD ────────────────────────────────────────────────────
export const SEED_RECORD_FIELDS = Object.freeze([
  'admin', 'tenants', 'domains', 'principals', 'sessions', 'objects', 'outbox',
  'decisions', 'correlations', 'post_upgrade_operation',
]);
const SEED_ENTRY_FIELDS = Object.freeze({
  tenants: ['tenantId', 'name'],
  domains: ['domainId', 'tenantId', 'name'],
  principals: ['principalId', 'scope', 'tenantId', 'domainId', 'loginName', 'roleCode'],
  sessions: ['sessionId', 'principalId', 'familyId'],
  objects: ['objectId', 'tenantId', 'domainId', 'correlation'],
  outbox: ['eventId', 'correlation', 'eventType'],
});
const POST_UPGRADE_FIELDS = Object.freeze([
  'correlation', 'decisionId', 'action', 'target', 'tenantId', 'domainId', 'principalId',
  'sessionId', 'eventId', 'effectRef', 'effectKinds',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The manifest seed_summary is DERIVED from the seed record, never trusted. */
export const deriveSeedSummary = (r) => ({
  tenants: r.tenants.length, domains: r.domains.length,
  principals: r.principals.length + 1, sessions: r.sessions.length,
  objects: r.objects.length, outbox: r.outbox.length, decisions: r.decisions.length,
});

const exactKeys = (obj, fields) => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...fields].sort());

/**
 * The seed record is a CLOSED schema, and every recorded identity and relationship is bound
 * BIDIRECTIONALLY against the authenticated snapshots: no recorded id may be missing from
 * the database, no database row may be unaccounted for, relationships (domain→tenant,
 * session→principal, outbox→correlation, role bindings) are exact, and the manifest
 * seed_summary must equal the derived one on the exact key set.
 */
export function verifySeedRecordClosed({ seedRecord, before, finalSnap, manifest }) {
  const problems = [];
  if (!exactKeys(seedRecord, SEED_RECORD_FIELDS)) {
    return ['seed record fields are not the exact closed schema'];
  }
  for (const [field, entryFields] of Object.entries(SEED_ENTRY_FIELDS)) {
    const arr = seedRecord[field];
    if (!Array.isArray(arr) || arr.length === 0) { problems.push(`seed record ${field} is not a nonempty array`); continue; }
    arr.forEach((e, i) => {
      if (!exactKeys(e, entryFields)) problems.push(`seed record ${field}[${i}] is not the exact closed entry schema`);
    });
  }
  for (const field of ['decisions', 'correlations']) {
    const arr = seedRecord[field];
    if (!Array.isArray(arr) || arr.length === 0 || arr.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
      problems.push(`seed record ${field} is not a nonempty uuid array`);
    } else if (new Set(arr).size !== arr.length) problems.push(`seed record ${field} contains duplicates`);
  }
  if (!exactKeys(seedRecord.admin, ['principalId', 'loginName'])) problems.push('seed record admin is not the exact closed entry schema');
  else if (seedRecord.admin.loginName !== 'platform-admin') problems.push('seed record admin loginName is not the code-owned platform-admin');
  if (!exactKeys(seedRecord.post_upgrade_operation, POST_UPGRADE_FIELDS)) {
    problems.push('seed record post_upgrade_operation is not the exact closed schema');
  }
  if (problems.length > 0) return problems;

  const rowsOf = (snap, t) => snap.tables[t]?.rows ?? [];
  const bindSet = (what, recorded, actual) => {
    const rec = new Set(recorded);
    const act = new Set(actual);
    for (const id of rec) if (!act.has(id)) problems.push(`seed record ${what} ${id} is not in the snapshot`);
    for (const id of act) if (!rec.has(id)) problems.push(`snapshot ${what} ${id} is not accounted for by the seed record`);
  };
  const rowBy = (rows, id) => rows.find((r) => r.id === id);

  // Tenants + domains, with the domain→tenant relationship exact.
  const tenantRows = rowsOf(before, 'tenancy.tenants');
  bindSet('tenant', seedRecord.tenants.map((t) => t.tenantId), tenantRows.map((r) => r.id));
  for (const t of seedRecord.tenants) {
    const row = rowBy(tenantRows, t.tenantId);
    if (row !== undefined && row.name !== t.name) problems.push(`seed record tenant ${t.tenantId} name differs from the snapshot`);
  }
  const domainRows = rowsOf(before, 'tenancy.domains');
  bindSet('domain', seedRecord.domains.map((d) => d.domainId), domainRows.map((r) => r.id));
  for (const d of seedRecord.domains) {
    const row = rowBy(domainRows, d.domainId);
    if (row === undefined) continue;
    if (row.tenant_id !== d.tenantId) problems.push(`seed record domain ${d.domainId} tenant relationship differs from the snapshot`);
    if (row.name !== d.name) problems.push(`seed record domain ${d.domainId} name differs from the snapshot`);
    if (!seedRecord.tenants.some((t) => t.tenantId === d.tenantId)) problems.push(`seed record domain ${d.domainId} names an unrecorded tenant`);
  }
  // Principals (recorded + the bootstrap admin) with scope/tenant/domain/login and role bindings.
  const principalRows = rowsOf(before, 'identity.principals');
  bindSet('principal', [seedRecord.admin.principalId, ...seedRecord.principals.map((p) => p.principalId)],
    principalRows.map((r) => r.id));
  const bindingRows = rowsOf(before, 'identity.role_bindings');
  const hasBinding = (pid, role) => bindingRows.some((b) => b.principal_id === pid && b.role_code === role && b.revoked_at === null);
  for (const p of seedRecord.principals) {
    const row = rowBy(principalRows, p.principalId);
    if (row === undefined) continue;
    for (const [f, col, want] of [
      ['scope', row.scope, p.scope], ['tenant', row.tenant_id, p.tenantId],
      ['domain', row.domain_id, p.domainId], ['login_name', row.login_name, p.loginName],
      ['display_name', row.display_name, p.loginName],
    ]) {
      if (col !== want) problems.push(`seed record principal ${p.principalId} ${f} differs from the snapshot`);
    }
    if (!hasBinding(p.principalId, p.roleCode)) {
      problems.push(`seed record principal ${p.principalId} has no live '${p.roleCode}' role binding in the snapshot`);
    }
  }
  const adminRow = rowBy(principalRows, seedRecord.admin.principalId);
  if (adminRow !== undefined) {
    if (adminRow.scope !== 'PLATFORM' || adminRow.login_name !== 'platform-admin') {
      problems.push('seed record admin principal row is not the PLATFORM platform-admin');
    }
    if (!hasBinding(seedRecord.admin.principalId, 'platform_admin')) {
      problems.push('seed record admin principal has no live platform_admin role binding');
    }
  }
  // Sessions, objects, outbox, decisions — exact sets with exact relationships.
  const sessionRows = rowsOf(before, 'identity.sessions');
  bindSet('session', seedRecord.sessions.map((s) => s.sessionId), sessionRows.map((r) => r.id));
  for (const s of seedRecord.sessions) {
    const row = rowBy(sessionRows, s.sessionId);
    if (row !== undefined && row.principal_id !== s.principalId) {
      problems.push(`seed record session ${s.sessionId} principal relationship differs from the snapshot`);
    }
  }
  const objectRows = rowsOf(before, 'objects.canonical_objects');
  bindSet('object', seedRecord.objects.map((o) => o.objectId), objectRows.map((r) => r.object_id));
  for (const o of seedRecord.objects) {
    const row = objectRows.find((r) => r.object_id === o.objectId);
    if (row !== undefined && (row.tenant_id !== o.tenantId || row.domain_id !== o.domainId)) {
      problems.push(`seed record object ${o.objectId} tenancy differs from the snapshot`);
    }
  }
  const outboxRows = rowsOf(before, 'objects.object_outbox');
  bindSet('outbox event', seedRecord.outbox.map((o) => o.eventId), outboxRows.map((r) => r.id));
  for (const o of seedRecord.outbox) {
    const row = rowBy(outboxRows, o.eventId);
    if (row === undefined) continue;
    if (row.correlation_id !== o.correlation) problems.push(`seed record outbox event ${o.eventId} correlation differs from the snapshot`);
    if (row.event_type !== o.eventType) problems.push(`seed record outbox event ${o.eventId} event_type differs from the snapshot`);
  }
  bindSet('decision', seedRecord.decisions, rowsOf(before, 'policy.policy_decisions').map((r) => r.id));
  // Correlations: unique (checked), and every governed row correlation is accounted for.
  const correlations = new Set(seedRecord.correlations);
  for (const d of rowsOf(before, 'policy.policy_decisions')) {
    if (!correlations.has(d.correlation_id)) problems.push(`snapshot decision ${d.id} carries an unrecorded correlation`);
  }
  for (const e of before.audit.events) {
    if (e.correlation_id !== null && e.correlation_id !== undefined && !correlations.has(e.correlation_id)) {
      problems.push(`snapshot audit event ${e.partition_id}#${e.audit_seq} carries an unrecorded correlation`);
    }
  }
  // Post-upgrade deltas: the FINAL snapshot is exactly the seeded world plus the one operation.
  const po = seedRecord.post_upgrade_operation;
  bindSet('final-session', [po.sessionId, ...seedRecord.sessions.map((s) => s.sessionId)],
    rowsOf(finalSnap, 'identity.sessions').map((r) => r.id));
  bindSet('final-decision', [po.decisionId, ...seedRecord.decisions],
    rowsOf(finalSnap, 'policy.policy_decisions').map((r) => r.id));
  bindSet('final-outbox event', [po.eventId, ...seedRecord.outbox.map((o) => o.eventId)],
    rowsOf(finalSnap, 'objects.object_outbox').map((r) => r.id));
  bindSet('final-principal', [seedRecord.admin.principalId, ...seedRecord.principals.map((p) => p.principalId)],
    rowsOf(finalSnap, 'identity.principals').map((r) => r.id));
  if (po.tenantId !== seedRecord.tenants[0]?.tenantId) problems.push('post-upgrade operation tenant is not the first seeded tenant');
  if (po.domainId !== seedRecord.domains[0]?.domainId) problems.push('post-upgrade operation domain is not the first seeded domain');
  if (po.principalId !== seedRecord.admin.principalId) problems.push('post-upgrade operation principal is not the seeded admin');
  // Manifest bindings: derived summary on the exact key set, and one shared operation record.
  if (manifest !== null) {
    const derived = deriveSeedSummary(seedRecord);
    if (!exactKeys(manifest.seed_summary ?? null, Object.keys(derived))
      || Object.entries(derived).some(([k, v]) => manifest.seed_summary[k] !== v)) {
      problems.push(`manifest seed_summary ${JSON.stringify(manifest.seed_summary)} is not the record-derived ${JSON.stringify(derived)}`);
    }
    if (JSON.stringify(seedRecord.post_upgrade_operation) !== JSON.stringify(manifest.post_upgrade_operation)) {
      problems.push('seed record post_upgrade_operation differs from the manifest');
    }
  }
  return problems;
}

// ── AUDIT TABLE ↔ AUDIT VIEW CROSS-CHECK ─────────────────────────────────────
/**
 * The snapshot carries audit.audit_events/audit_chain_heads BOTH as tables and as the audit
 * view the chain proof consumes. They must be the SAME world, and every generated projection
 * column on the table rows (scope, tenant, domain, event type, outcome, actor, action,
 * result code, correlation, occurred_at, the event object itself) must derive exactly from
 * the canonical event_jcs.
 */
export function crossCheckAuditTable(snap, label) {
  const problems = [];
  const norm = (v) => (v === '' || v === undefined ? null : v);
  // jsonb normalizes object key order differently from JCS; compare VALUES, not orderings.
  const stable = (v) => JSON.stringify(v, (k, val) => (
    val !== null && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map((kk) => [kk, val[kk]]))
      : val
  ));
  const table = snap.tables['audit.audit_events']?.rows ?? [];
  const view = snap.audit?.events ?? [];
  const key = (r) => `${r.partition_id}#${r.audit_seq}`;
  const tBy = new Map(table.map((r) => [key(r), r]));
  const vBy = new Map(view.map((r) => [key(r), r]));
  for (const k of vBy.keys()) if (!tBy.has(k)) problems.push(`${label}: audit view row ${k} has no audit.audit_events table row`);
  for (const k of tBy.keys()) if (!vBy.has(k)) problems.push(`${label}: audit.audit_events table row ${k} is missing from the audit view`);
  for (const [k, t] of tBy) {
    const v = vBy.get(k);
    if (v !== undefined) {
      for (const f of ['event_jcs', 'previous_hash', 'row_hash', 'hash_alg_version']) {
        if (t[f] !== v[f]) problems.push(`${label}: audit row ${k} ${f} differs between the table and the audit view`);
      }
      if (norm(t.correlation_id) !== norm(v.correlation_id)) {
        problems.push(`${label}: audit row ${k} correlation_id differs between the table and the audit view`);
      }
    }
    let body = null;
    try { body = JSON.parse(t.event_jcs); } catch { problems.push(`${label}: audit table row ${k} event_jcs is not JSON`); }
    if (body !== null) {
      if (stable(t.event) !== stable(body)) {
        problems.push(`${label}: audit table row ${k} generated 'event' object disagrees with its canonical event_jcs`);
      }
      for (const [col, want] of [
        ['scope', body.scope ?? null], ['tenant_id', norm(body.tenant_id)], ['domain_id', norm(body.domain_id)],
        ['event_type', body.event_type ?? null], ['outcome', body.outcome ?? null], ['actor', body.actor ?? null],
        ['action', body.action ?? null], ['result_code', body.result_code ?? null],
        ['correlation_id', norm(body.correlation_id)], ['occurred_at', body.occurred_at ?? null],
      ]) {
        if ((t[col] ?? null) !== want) {
          problems.push(`${label}: audit table row ${k} generated projection '${col}' disagrees with its canonical event_jcs`);
        }
      }
    }
  }
  const headsTable = snap.tables['audit.audit_chain_heads']?.rows ?? [];
  const headsView = snap.audit?.heads ?? [];
  const htBy = new Map(headsTable.map((h) => [h.partition_id, h]));
  const hvBy = new Map(headsView.map((h) => [h.partition_id, h]));
  for (const p of hvBy.keys()) if (!htBy.has(p)) problems.push(`${label}: audit view head '${p}' has no chain-head table row`);
  for (const p of htBy.keys()) if (!hvBy.has(p)) problems.push(`${label}: chain-head table row '${p}' is missing from the audit view`);
  for (const [p, t] of htBy) {
    const v = hvBy.get(p);
    if (v === undefined) continue;
    if (Number(t.next_seq) !== Number(v.next_seq) || t.head_hash !== v.head_hash || t.frozen !== v.frozen) {
      problems.push(`${label}: audit head '${p}' disagrees between the table and the audit view`);
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

/** The command-label suffix that produced each posture category, so every processed posture
 * view can be RECONSTRUCTED from its command-bound raw psql receipt. */
export const POSTURE_COMMAND_LABELS = Object.freeze({
  roles: 'roles', memberships: 'memberships', database_privileges: 'db-priv',
  schema_privileges: 'schema-priv', table_grants: 'table-grants',
  sequence_privileges: 'seq-priv', default_privileges: 'default-priv', owners: 'owners',
  routines: 'routines', rls: 'rls', policies: 'policies', triggers: 'triggers',
  columns: 'columns', constraints: 'constraints', indexes: 'indexes',
});

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
    expected_tests: 297,
    runs_on: Object.freeze(['path-a-upgraded', 'path-b-virgin']),
    reason: 'privilege, isolation, audit-chain and outbox behaviour run DIRECTLY against each '
      + "path's own database — the upgraded seeded database on Path A, the virgin one on Path B",
  }),
  acceptance: Object.freeze({
    command: ['pnpm', '--filter', '@eye/api', 'test:accept'],
    framework: 'vitest',
    expected_tests: 58,
    runs_on: Object.freeze(['instance-a-server', 'instance-b-server']),
    reason: 'SELF-MANAGED: the suite provisions its own pristine per-run database by design, so '
      + "each tuple proves the acceptance criteria against that path's isolated SERVER, not "
      + 'against the upgraded data; the upgraded-data proof is the snapshot contract plus the '
      + 'integration suite',
  }),
  'unit-gate-hermetic': Object.freeze({
    command: null, framework: null, expected_tests: null,
    runs_on: Object.freeze(['once-only']),
    reason: 'hermetic by design — reads no database; runs once in CI build-test',
  }),
  'browser-regression': Object.freeze({
    command: null, framework: null, expected_tests: null,
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
    // COMPLETE argv equality — a prefix/slice match is forbidden, so an appended single-test
    // selector ('… test/foo.ts') cannot pass.
    if (JSON.stringify(r.argv_redacted) !== JSON.stringify(spec.command)) {
      problems.push(`receipt ${tuple} argv ${JSON.stringify(r.argv_redacted)} is not EXACTLY the matrix command`);
    }
    if (commands !== null) {
      const cmd = commands.find((c) => c.id === r.command_id);
      if (cmd === undefined) problems.push(`receipt ${tuple} names command ledger id '${r.command_id}' which does not exist`);
      else {
        if (JSON.stringify(cmd.argv) !== JSON.stringify(spec.command)) {
          problems.push(`receipt ${tuple} command-ledger argv is not EXACTLY the matrix command`);
        }
        if (cmd.exit !== r.exit_status || (cmd.signal ?? null) !== (r.signal ?? null) || cmd.timeout_ms !== r.timeout_ms) {
          problems.push(`receipt ${tuple} exit/signal/timeout disagrees with the command ledger`);
        }
        if (cmd.exit !== 0 || (cmd.signal ?? null) !== null) {
          problems.push(`receipt ${tuple} command ledger records exit ${cmd.exit} signal ${cmd.signal}`);
        }
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
        const all = [...text.matchAll(/Tests {2}(\d+) passed \((\d+)\)/g)];
        const failed = /\d+ failed/.test(text);
        if (all.length !== 1 || failed) {
          problems.push(`receipt ${tuple} raw output must contain EXACTLY one passing vitest summary`);
        } else {
          const [, passed, total] = all[0];
          if (Number(passed) !== Number(total) || Number(passed) !== spec.expected_tests) {
            problems.push(`receipt ${tuple} summary ${passed}/${total} is not the code-owned count ${spec.expected_tests}`);
          }
          if (r.tests_passed !== spec.expected_tests || r.tests_total !== spec.expected_tests) {
            problems.push(`receipt ${tuple} recorded counts (${r.tests_passed}/${r.tests_total}) are not the code-owned ${spec.expected_tests}`);
          }
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

/**
 * Exact typed isolation for BOTH postgres and redis. `images` are the digest-pinned Compose
 * references, which both paths must equal exactly (an attacker image is rejected). Container
 * ids/names/ports/databases are grammar-checked; path labels are fixed; every credential digest
 * across both paths and all classes must be pairwise distinct — not merely same-key A/B.
 */
export function verifyIsolation(receiptA, receiptB, images = null) {
  const problems = [];
  const grammar = {
    container_id: /^[0-9a-f]{12,64}$/,
    container_name: /^c18-[ab]-[0-9a-f]{8}-pg$/,
    redis_container_id: /^[0-9a-f]{12,64}$/,
    redis_container: /^c18-[ab]-[0-9a-f]{8}-redis$/,
    database: /^eye_[ab]_[0-9a-f]{8}$/,
  };
  const expectPath = { A: 'path-a-upgraded', B: 'path-b-virgin' };
  for (const [tag, r] of [['A', receiptA], ['B', receiptB]]) {
    const keys = Object.keys(r ?? {}).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...ISOLATION_FIELDS].sort())) {
      problems.push(`path-${tag.toLowerCase()} isolation receipt fields are not the exact typed set`);
      continue;
    }
    if (r.path !== expectPath[tag]) problems.push(`path-${tag.toLowerCase()} label is ${JSON.stringify(r.path)}, expected ${expectPath[tag]}`);
    for (const [f, re] of Object.entries(grammar)) {
      if (typeof r[f] !== 'string' || !re.test(r[f])) problems.push(`path-${tag.toLowerCase()} ${f} ${JSON.stringify(r[f])} fails its grammar`);
    }
    for (const f of ['port', 'redis_port']) {
      if (!Number.isInteger(r[f]) || r[f] < 1 || r[f] > 65535) problems.push(`path-${tag.toLowerCase()} ${f} is not a valid port`);
    }
    if (images !== null) {
      if (r.postgres_image !== images.postgres) problems.push(`path-${tag.toLowerCase()} postgres image is not the digest-pinned Compose reference`);
      if (r.redis_image !== images.redis) problems.push(`path-${tag.toLowerCase()} redis image is not the digest-pinned Compose reference`);
    }
    const credKeys = Object.keys(r?.credential_digests ?? {}).sort();
    if (JSON.stringify(credKeys) !== JSON.stringify([...SECRET_CLASSES].sort())) {
      problems.push(`path-${tag.toLowerCase()} credential digest keys are not exactly the code-owned secret classes`);
    }
  }
  if (problems.length > 0) return problems;
  for (const f of ['container_id', 'container_name', 'redis_container_id', 'redis_container', 'database', 'port', 'redis_port']) {
    if (receiptA[f] === receiptB[f]) problems.push(`paths SHARED ${f} (${JSON.stringify(receiptA[f])})`);
  }
  // Every credential digest across BOTH paths and ALL classes must be pairwise distinct: this
  // catches within-path reuse (one class equal to another in the SAME receipt) too.
  const seen = new Map();
  for (const [tag, r] of [['A', receiptA], ['B', receiptB]]) {
    for (const k of SECRET_CLASSES) {
      const d = r.credential_digests[k];
      if (seen.has(d)) problems.push(`credential digest REUSED: ${tag}.${k} collides with ${seen.get(d)}`);
      else seen.set(d, `${tag}.${k}`);
    }
  }
  return problems;
}

// ── THE COMMAND LEDGER: CLOSED TYPED RECORDS + SOURCE-OWNED COMMAND GRAPH ─────
/** Every ledger record is CLOSED: exactly these fields, nothing else. */
export const COMMAND_RECORD_FIELDS = Object.freeze([
  'id', 'label', 'argv', 'cwd', 'env', 'timeout_ms', 'exit', 'signal',
  'stdout_bytes', 'stdout_sha256', 'stderr_bytes', 'stderr_sha256', 'exit_bytes', 'exit_sha256',
]);
export const commandIdFor = (seq, label) => `${String(seq).padStart(3, '0')}-${label.replace(/[^a-z0-9-]+/gi, '_').slice(0, 60)}`;

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Ledger record typing + position binding. The id embeds the 1-based position, so a
 * duplicated, deleted-without-renumber, or reordered entry breaks the sequence HERE; a
 * renumbered forgery survives only until the command graph walks it semantically.
 */
export function verifyCommandRecords(commands) {
  const problems = [];
  if (!Array.isArray(commands)) return ['commands.json is not an array'];
  const labels = new Set();
  const want = JSON.stringify([...COMMAND_RECORD_FIELDS].sort());
  commands.forEach((c, i) => {
    if (c === null || typeof c !== 'object') { problems.push(`command ledger position ${i + 1} is not an object`); return; }
    if (JSON.stringify(Object.keys(c).sort()) !== want) {
      problems.push(`command ledger position ${i + 1} fields are not the exact closed record set`);
      return;
    }
    if (typeof c.label !== 'string' || c.label === '') problems.push(`command ledger position ${i + 1} has no label`);
    else {
      if (labels.has(c.label)) problems.push(`DUPLICATE command label '${c.label}' in the ledger`);
      labels.add(c.label);
      if (c.id !== commandIdFor(i + 1, c.label)) {
        problems.push(`command ledger position ${i + 1} id '${c.id}' breaks the sequence (expected '${commandIdFor(i + 1, c.label)}')`);
      }
    }
    if (!Array.isArray(c.argv) || c.argv.length === 0 || c.argv.some((a) => typeof a !== 'string' || a === '')) {
      problems.push(`command '${c.label}' argv is not a nonempty string array`);
    }
    if (c.cwd !== '.') problems.push(`command '${c.label}' cwd ${JSON.stringify(c.cwd)} is not the repository root ('.')`);
    if (c.env === null || typeof c.env !== 'object' || Array.isArray(c.env)
      || Object.values(c.env).some((v) => typeof v !== 'string')) {
      problems.push(`command '${c.label}' env is not a string-valued object`);
    }
    if (!Number.isInteger(c.timeout_ms) || c.timeout_ms <= 0) problems.push(`command '${c.label}' has no positive timeout`);
    const exitOk = (Number.isInteger(c.exit) && c.signal === null) || (c.exit === null && typeof c.signal === 'string');
    if (!exitOk) problems.push(`command '${c.label}' exit/signal pair (${c.exit}/${c.signal}) is malformed`);
    for (const s of ['stdout', 'stderr', 'exit']) {
      if (!Number.isInteger(c[`${s}_bytes`]) || c[`${s}_bytes`] < 0) problems.push(`command '${c.label}' ${s}_bytes is malformed`);
      if (typeof c[`${s}_sha256`] !== 'string' || !HEX64.test(c[`${s}_sha256`])) problems.push(`command '${c.label}' ${s}_sha256 is malformed`);
    }
  });
  return problems;
}

/**
 * Bind every ledger record to its three raw stream files by BYTES: recorded lengths and
 * SHA-256 digests must match the raw evidence, and the raw exit receipt must restate the
 * ledger's exit/signal exactly. `readBytes(rel)` returns a Buffer or null.
 */
export function verifyCommandStreams(commands, readBytes) {
  const problems = [];
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  for (const c of commands) {
    if (typeof c?.id !== 'string') continue;
    for (const s of ['stdout', 'stderr', 'exit']) {
      const bytes = readBytes(`raw/${c.id}.${s}.txt`);
      if (bytes === null) { problems.push(`command '${c.label}' ${s} stream is missing`); continue; }
      if (bytes.byteLength !== c[`${s}_bytes`] || sha(bytes) !== c[`${s}_sha256`]) {
        problems.push(`command '${c.label}' ${s} stream bytes/digest do not match the ledger record`);
      }
      if (s === 'exit') {
        const want = `${c.exit ?? `signal:${c.signal}`}\n`;
        if (bytes.toString('utf8') !== want) {
          problems.push(`command '${c.label}' raw exit receipt ${JSON.stringify(bytes.toString('utf8'))} does not restate the ledger exit ${JSON.stringify(want)}`);
        }
      }
    }
  }
  return problems;
}

/**
 * THE SOURCE-OWNED COMMAND GRAPH. The producer's whole execution is a deterministic state
 * machine over provisioning, readiness, migration, snapshots and suites; this walk re-derives
 * that machine from the SOURCE contract (universes, posture categories, suite matrix, pinned
 * images, isolation receipts) and requires the ledger to be EXACTLY one run of it: no missing,
 * duplicate, unknown or reordered command survives, every must-succeed command must record
 * exit 0, and every evidence-bearing output (container ids, discovered ports, tables-meta and
 * fk-meta sets, readiness confirmation) must equal what the rest of the evidence claims.
 * `rawText(cmd, stream)` returns the raw stream text or null.
 */
export function verifyCommandGraph({ commands, receiptA, receiptB, images, rawText }) {
  const problems = [];
  if (!Array.isArray(commands)) return ['command graph: commands.json is not an array'];
  for (const [tag, r] of [['path-a', receiptA], ['path-b', receiptB]]) {
    if (r === null || typeof r !== 'object') return [`command graph cannot bind: the ${tag} isolation receipt is missing`];
  }
  let pos = 0;
  let dead = false;
  const structural = (msg) => { problems.push(msg); dead = true; };
  const next = (label) => {
    if (dead) return null;
    const c = commands[pos];
    if (c === undefined || typeof c !== 'object' || c === null) {
      structural(`command graph: expected '${label}' at position ${pos + 1} but the ledger ended`);
      return null;
    }
    if (c.label !== label) {
      structural(`command graph: expected '${label}' at position ${pos + 1}, found '${c.label}'`);
      return null;
    }
    pos += 1;
    return c;
  };
  const mustSucceed = (c) => {
    if (c !== null && (c.exit !== 0 || c.signal !== null)) {
      problems.push(`command '${c.label}' recorded exit ${c.exit} signal ${c.signal}; the graph requires success`);
    }
  };
  const emptyEnv = (c) => {
    if (c !== null && Object.keys(c.env ?? {}).length !== 0) {
      problems.push(`command '${c.label}' carries environment bindings the graph does not authorize`);
    }
  };
  const matchArgv = (c, pattern) => {
    if (c === null) return;
    const a = Array.isArray(c.argv) ? c.argv : [];
    if (a.length !== pattern.length) {
      problems.push(`command '${c.label}' argv arity ${a.length} is not the graph's ${pattern.length}`);
      return;
    }
    pattern.forEach((p, i) => {
      const ok = typeof p === 'string' ? a[i] === p : p(a[i]);
      if (!ok) problems.push(`command '${c.label}' argv[${i}] ${JSON.stringify(a[i])} violates the graph`);
    });
  };
  const stdoutOf = (c) => (c === null ? null : rawText(c, 'stdout'));
  const jsonOf = (c) => {
    const text = stdoutOf(c);
    if (text === null) return undefined;
    try { return text.trim() === '' ? null : JSON.parse(text); } catch { return undefined; }
  };
  const REDACTED_PG = (v) => typeof v === 'string' && v.startsWith('POSTGRES_PASSWORD=<REDACTED:');
  const REDACTED_PW = (v) => typeof v === 'string' && v.startsWith('PGPASSWORD=<REDACTED:');
  const REDACTED_ANY = (v) => typeof v === 'string' && v.startsWith('<REDACTED:');
  const connEnv = (c, r, extra = {}) => {
    if (c === null) return;
    const env = c.env ?? {};
    const wantPlain = {
      EYE_DB_HOST: '127.0.0.1', EYE_DB_PORT: String(r.port), EYE_DB_NAME: r.database,
      EYE_REDIS_HOST: '127.0.0.1', EYE_REDIS_PORT: String(r.redis_port), ...extra,
    };
    const redactedKeys = [...SECRET_CLASSES, 'EYE_DB_MIGRATE_PASSWORD', 'EYE_IDENTITY_JWT_SECRET'];
    const wantKeys = [...Object.keys(wantPlain), ...redactedKeys].sort();
    if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify(wantKeys)) {
      problems.push(`command '${c.label}' env keys are not exactly the ${r.path} connection binding`);
      return;
    }
    for (const [k, v] of Object.entries(wantPlain)) {
      if (env[k] !== v) problems.push(`command '${c.label}' env ${k} is ${JSON.stringify(env[k])}; the ${r.path} database binding requires ${JSON.stringify(v)}`);
    }
    for (const k of redactedKeys) {
      if (typeof env[k] !== 'string' || !env[k].startsWith('<REDACTED:')) {
        problems.push(`command '${c.label}' env ${k} is not a redacted placeholder`);
      }
    }
  };
  const psqlPattern = (r) => ['docker', 'exec', '-e', REDACTED_PW, '-i', r.container_name, 'psql', '-X', '-v',
    'ON_ERROR_STOP=1', '-At', '-U', 'eye', '-d', r.database, '-c', () => true];
  const snapCmd = (label, r) => {
    const c = next(label);
    mustSucceed(c); emptyEnv(c); matchArgv(c, psqlPattern(r));
    return c;
  };

  const walkInstance = (letter, r) => {
    const pg = next(`${letter}-pg-run`);
    mustSucceed(pg); emptyEnv(pg);
    matchArgv(pg, ['docker', 'run', '-d', '--name', r.container_name, '-e', 'POSTGRES_USER=eye', '-e',
      REDACTED_PG, '-e', `POSTGRES_DB=${r.database}`, '-p', '127.0.0.1:0:5432', images.postgres]);
    const pgOut = stdoutOf(pg);
    if (pg !== null && pgOut !== null && pgOut.trim() !== r.container_id) {
      problems.push(`'${pg.label}' raw container id does not match the ${r.path} isolation receipt`);
    }
    const rd = next(`${letter}-redis-run`);
    mustSucceed(rd); emptyEnv(rd);
    matchArgv(rd, ['docker', 'run', '-d', '--name', r.redis_container, '-p', '127.0.0.1:0:6379', images.redis,
      'redis-server', '--requirepass', REDACTED_ANY]);
    const rdOut = stdoutOf(rd);
    if (rd !== null && rdOut !== null && rdOut.trim() !== r.redis_container_id) {
      problems.push(`'${rd.label}' raw container id does not match the ${r.path} isolation receipt`);
    }
    for (const [inner, container, portField] of [['5432', r.container_name, 'port'], ['6379', r.redis_container, 'redis_port']]) {
      const pc = next(`${letter}-port-${inner}`);
      mustSucceed(pc); emptyEnv(pc);
      matchArgv(pc, ['docker', 'port', container, inner]);
      const out = stdoutOf(pc);
      if (pc !== null && out !== null) {
        const m = /:(\d+)\s*$/m.exec(out.trim());
        if (m === null || Number(m[1]) !== r[portField]) {
          problems.push(`'${pc.label}' port-discovery output does not equal the recorded ${r.path} ${portField} ${r[portField]}`);
        }
      }
    }
    let confirmed = false;
    for (let i = 0; i < 90 && !confirmed && !dead; i += 1) {
      const w = next(`${letter}-pg-wait-${i}`);
      if (w === null) break;
      emptyEnv(w);
      matchArgv(w, ['docker', 'exec', r.container_name, 'pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'eye', '-d', r.database]);
      if (w.exit === 0 && w.signal === null) {
        const conf = next(`${letter}-pg-confirm-${i}`);
        if (conf === null) break;
        emptyEnv(conf);
        matchArgv(conf, ['docker', 'exec', '-e', REDACTED_PW, r.container_name, 'psql', '-h', '127.0.0.1', '-X', '-At', '-U', 'eye', '-d', r.database, '-c', 'select 1']);
        if (conf.exit === 0 && conf.signal === null && (stdoutOf(conf) ?? '').trim() === '1') confirmed = true;
      }
    }
    if (!confirmed && !dead) structural(`command graph: path ${letter} records no successful authenticated readiness confirmation`);
  };

  const walkMigrate = (label, r) => {
    const c = next(label);
    mustSucceed(c);
    matchArgv(c, ['node', (v) => typeof v === 'string' && v.endsWith('/scripts/migrate.mjs')]);
    connEnv(c, r);
  };

  const walkSnapshot = (letter, snapLabel, r, universe) => {
    const pfx = `${letter}-${snapLabel}`;
    const wantTables = [...universe].sort();
    const meta = snapCmd(`${pfx}-tables-meta`, r);
    const metaParsed = jsonOf(meta);
    if (meta !== null) {
      if (!Array.isArray(metaParsed)) problems.push(`${pfx}: tables-meta raw output is not JSON`);
      else if (JSON.stringify(metaParsed.map((m) => m.table)) !== JSON.stringify(wantTables)) {
        problems.push(`${pfx}: raw tables-meta output is not the source-owned ${universe.length}-table universe in canonical order`);
      }
    }
    for (const t of wantTables) snapCmd(`${pfx}-rows-${t.replace('.', '_')}`, r);
    const fkMeta = snapCmd(`${pfx}-fk-meta`, r);
    const fks = jsonOf(fkMeta);
    if (fkMeta !== null) {
      if (!Array.isArray(fks)) problems.push(`${pfx}: fk-meta raw output is not JSON`);
      else {
        const names = fks.map((f) => f.constraint);
        if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
          problems.push(`${pfx}: raw fk-meta is not in canonical order`);
        }
        for (const n of names) snapCmd(`${pfx}-fk-${n.replace(/\./g, '_')}`, r);
      }
    }
    for (const cat of POSTURE_CATEGORIES) snapCmd(`${pfx}-${POSTURE_COMMAND_LABELS[cat]}`, r);
    for (const tail of ['ledger', 'audit-events', 'audit-heads']) snapCmd(`${pfx}-${tail}`, r);
  };

  walkInstance('a', receiptA);
  walkMigrate('a-migrate-historical', receiptA);
  walkSnapshot('a', 'a-before', receiptA, TABLE_UNIVERSE_HISTORICAL);
  walkMigrate('a-migrate-upgrade', receiptA);
  walkSnapshot('a', 'a-after', receiptA, TABLE_UNIVERSE_LATEST);
  walkSnapshot('a', 'a-final', receiptA, TABLE_UNIVERSE_LATEST);
  walkInstance('b', receiptB);
  walkMigrate('b-migrate-latest', receiptB);
  walkSnapshot('b', 'b-virgin', receiptB, TABLE_UNIVERSE_LATEST);
  for (const [letter, r] of [['a', receiptA], ['b', receiptB]]) {
    for (const suite of ['integration', 'acceptance']) {
      const c = next(`${letter}-suite-${suite}`);
      mustSucceed(c);
      matchArgv(c, [...SUITE_MATRIX[suite].command]);
      connEnv(c, r, { NO_COLOR: '1', FORCE_COLOR: '0' });
    }
  }
  if (!dead && pos !== commands.length) {
    problems.push(`command graph: ${commands.length - pos} unauthorized trailing command(s) beginning with '${commands[pos]?.label}'`);
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
