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
import { createHash, randomBytes } from 'node:crypto';
import {
  C18_SEED_SPEC_FULL as C18_SEED_SPEC, SEED_CARDINALITIES, seedInputDigestSource, seedObjectHeader,
  seedObjectPayload, seedOutboxPayload,
} from './c18-seed-spec.mjs';
import { encodeInventory } from './c18-inventory.mjs';
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
/**
 * C19 — THE SECRET HANDOFF CONTRACT, SOURCE-OWNED SO THE VERIFIER PINS IT EXACTLY.
 *
 * A container needs its password before it can start, and every ordinary way of giving it one
 * leaves the value somewhere durable:
 *
 *   • `--requirepass <value>` / `-e NAME=value`  → the docker client's ARGV, and therefore the
 *     host process list, for the lifetime of the call;
 *   • `-e NAME` (pass-through)                   → docker resolves it and stores it in the
 *     container's Config.Env, where `docker inspect` reports it for the container's lifetime;
 *   • a file copied in with `docker cp`          → the container's WRITABLE LAYER, which persists
 *     even after the file is deleted.
 *
 * So the container starts with a memory-backed tmpfs and an entrypoint that waits for its secret,
 * and the secret is written over the STDIN of a `docker exec` whose argv names only a path. The
 * value lives in the producer's memory and the container's tmpfs and nowhere else.
 *
 * A NOTE ON THE HISTORICAL REDIS FINDING, CORRECTED. The original form put the password in
 * `redis-server --requirepass <value>`. Redis rewrites its own process title at startup, so the
 * value was NOT persistently visible in the container's process table — an earlier reading that
 * said otherwise was a probe artifact. The durable exposure was docker METADATA (`Config.Cmd`),
 * which `docker inspect` returns for as long as the container exists. Evidence archives produced
 * under the old form remain authentic: the ledger always recorded the redacted placeholder, so no
 * archive ever carried the value.
 */
/**
 * C19 — the redaction placeholder shape. A placeholder standing in an ARGV position proves the real
 * credential stood there in the live process list, so this is the argv-disclosure detector.
 */
export const CREDENTIAL_PLACEHOLDER_RE = /<REDACTED:[a-z]:[A-Z0-9_]+>/;

export const SECRET_TMPFS = '/run/secrets:rw,nosuid,nodev,mode=0700';
export const PG_SECRET_PATH = '/run/secrets/pg';
export const REDIS_SECRET_PATH = '/run/secrets/redis.conf';

/** The reader side of the handoff: a shell that takes the secret from STDIN, never from argv. */
export const SECRET_SINK = (path) => `umask 077; cat > ${path}`;

/** Entrypoints that wait for their secret to land in tmpfs before exec'ing the real server. */
export const PG_ENTRYPOINT = `while [ ! -s ${PG_SECRET_PATH} ]; do sleep 0.05; done; exec docker-entrypoint.sh postgres`;
export const REDIS_ENTRYPOINT = `while [ ! -s ${REDIS_SECRET_PATH} ]; do sleep 0.05; done; exec redis-server ${REDIS_SECRET_PATH}`;

/** The docker label every governed resource carries FROM CREATION, so cleanup is an exact query. */
export const DOCKER_RUN_LABEL = 'eye.gate.run';

/**
 * The gate resource identity, shared with the supervising watchdog through the environment so that
 * the watchdog's label sweep and the producer's own teardown address exactly the same resources.
 * Minted when absent, so a resource is never created without an owner to clean it up.
 */
export function gateResourceId(env = process.env, mint = () => randomBytes(16).toString('hex')) {
  const existing = env.EYE_GATE_RESOURCE_ID;
  if (typeof existing === 'string' && existing !== '') return existing;
  // Minted ONCE per process and published back into the environment. Both paths of one gate run
  // must share a single resource owner: two ids would mean two cleanup domains for one run, and a
  // sweep for either would leave the other's containers stranded.
  const minted = mint();
  env.EYE_GATE_RESOURCE_ID = minted;
  return minted;
}

/**
 * C19 — PRE-SPAWN REFUSAL.
 *
 * The watchdog sanitises what a child PRINTS and can terminate what it starts, but it cannot see
 * the argv of a grandchild that some other process spawns. The only place a credential can be kept
 * out of a descendant's command line with certainty is the point where that command line is built.
 *
 * So the producer refuses. Any argv position containing a known secret VALUE — or a redaction
 * placeholder, which proves a value stood there — stops the run. Failing closed here is what makes
 * the argv guarantee a property of the system rather than a property of review.
 */
export function refuseCredentialArgv(label, argv, secrets) {
  for (const [index, raw] of (argv ?? []).entries()) {
    const value = String(raw ?? '');
    if (CREDENTIAL_PLACEHOLDER_RE.test(value)) {
      throw new Error(`command '${label}' argv[${index}] carries a redaction placeholder, which `
        + 'means a credential occupied that position; credentials must reach a child over the '
        + 'environment or stdin, never argv');
    }
    for (const [cls, secret] of secrets ?? []) {
      if (typeof secret === 'string' && secret.length >= 8 && value.includes(secret)) {
        throw new Error(`command '${label}' argv[${index}] contains the ${String(cls).split(':').pop()} `
          + 'credential; credentials must reach a child over the environment or stdin, never argv');
      }
    }
  }
}

export const SECRET_CLASSES = Object.freeze([
  'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD', 'EYE_DB_SYSTEM_PASSWORD',
  'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD', 'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD',
  'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD', 'EYE_REDIS_PASSWORD',
]);

/** Domain-separated one-way digest for a secret-valued datum. Never invertible, but stable, so
 * pre/post equality is still provable. */
export const secretDigest = (cls, value) => sha256(`c18-secret-v1:${cls}:${value}`);

/**
 * C18.1.3 — the EXACT redaction placeholder for one path and one secret class. The 15e8239
 * verifier accepted ANY string beginning with `<REDACTED:`, so a Path-A command could carry a
 * Path-B credential, a Redis password could stand in for the database password, and
 * `<REDACTED:attacker:WRONG_CLASS>` passed. Placeholders are now exact, per path AND per class.
 */
export const PLACEHOLDER_RE = /^<REDACTED:([ab]):([A-Z0-9_]+)>$/;
export const placeholder = (letter, cls) => `<REDACTED:${letter}:${cls}>`;

/** The JWT secret is the admin secret concatenated with the bootstrap secret; redaction leaves
 * both placeholders in that exact order, which is itself a composition proof. */
export const jwtPlaceholder = (letter) => placeholder(letter, 'EYE_TEST_ADMIN_PASSWORD')
  + placeholder(letter, 'EYE_TEST_BOOTSTRAP_PASSWORD');

/**
 * The EXACT environment one instance's commands may carry: plain connection facts bound to that
 * path's isolation receipt, and one exact placeholder per secret class. Used by BOTH the command
 * graph and the suite-receipt binding, so a suite cannot claim one path while running on another.
 */
export function expectedInstanceEnv(letter, receipt, extra = {}) {
  return {
    EYE_DB_HOST: '127.0.0.1',
    EYE_DB_PORT: String(receipt.port),
    EYE_DB_NAME: receipt.database,
    EYE_DB_MIGRATE_PASSWORD: placeholder(letter, 'EYE_DB_PASSWORD'),
    EYE_REDIS_HOST: '127.0.0.1',
    EYE_REDIS_PORT: String(receipt.redis_port),
    EYE_IDENTITY_JWT_SECRET: jwtPlaceholder(letter),
    ...Object.fromEntries(SECRET_CLASSES.map((k) => [k, placeholder(letter, k)])),
    ...extra,
  };
}

/**
 * Every placeholder in a command must name the RIGHT path and a class that actually exists as a
 * typed credential-digest entry in that path's isolation receipt.
 */
export function checkPlaceholder(value, letter, receipt, where) {
  const m = PLACEHOLDER_RE.exec(String(value ?? ''));
  if (m === null) return [`${where} is not an exact <REDACTED:path:CLASS> placeholder`];
  if (m[1] !== letter) return [`${where} carries path '${m[1]}' credential material in a path-'${letter}' command`];
  if (!Object.prototype.hasOwnProperty.call(receipt?.credential_digests ?? {}, m[2])) {
    return [`${where} names secret class '${m[2]}', which has no credential-digest entry in the ${receipt?.path} isolation receipt`];
  }
  return [];
}

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
 * THE EXACT DETERMINISTIC SEED CONTRACT (C18.1.5).
 *
 * 7be02b8 validated MINIMA (`>=`), so the governed seed could be padded — an extra tenant, an
 * extra principal, an extra decision — and still reconcile. The 0012-era seed is deterministic:
 * its quantities and semantic records are fixed, and only the generated identifiers vary. Those
 * quantities are stated here EXACTLY, and every governed step's identity list is derived only
 * after this contract passes.
 */
export const SEED_CONTRACT = Object.freeze({
  // Cardinalities are DERIVED from the source-owned specification, never maintained twice.
  ...SEED_CARDINALITIES,
  audit_platform_min: 8, audit_tenant_partitions_min: 1, audit_total_min: 12,
});
/** Retained name for the pre-C18.1.5 call sites; the values are now exact, not minima. */
export const SEED_FLOOR = SEED_CONTRACT;

export function verifySeedFloor(snapshot, contract = SEED_CONTRACT) {
  const problems = [];
  const rows = (t) => snapshot.tables[t]?.rows ?? [];
  const count = (t) => rows(t).length;
  // EXACT cardinalities — neither fewer nor more.
  const exact = [
    ['tenancy.tenants', count('tenancy.tenants'), contract.tenants],
    ['tenancy.domains', count('tenancy.domains'), contract.domains],
    ['identity.principals', count('identity.principals'), contract.principals],
    ['identity.sessions', count('identity.sessions'), contract.sessions],
    ['objects.canonical_objects', count('objects.canonical_objects'), contract.objects],
    ['objects.object_outbox', count('objects.object_outbox'), contract.outbox],
    ['policy.policy_decisions', count('policy.policy_decisions'), contract.decisions],
    ['identity.role_bindings', count('identity.role_bindings'), contract.role_bindings],
  ];
  for (const [label, actual, want] of exact) {
    if (actual !== want) {
      problems.push(`seed contract: ${label} has ${actual} row(s); the deterministic governed seed produces EXACTLY ${want}`);
    }
  }
  const outboxRows = rows('objects.object_outbox');
  for (const [status, want] of [['published', contract.outbox_published], ['pending', contract.outbox_pending]]) {
    const actual = outboxRows.filter((r) => r.status === status).length;
    if (actual !== want) {
      problems.push(`seed contract: ${actual} ${status} outbox effect(s); the governed seed produces EXACTLY ${want}`);
    }
  }
  // SEMANTIC RECORDS and RELATIONSHIPS, not merely quantities.
  const tenantIds = new Set(rows('tenancy.tenants').map((r) => r.id));
  const domainsPerTenant = new Map();
  for (const d of rows('tenancy.domains')) {
    if (!tenantIds.has(d.tenant_id)) {
      problems.push(`seed contract: domain ${d.id} names tenant ${d.tenant_id}, which the seed did not create`);
    }
    domainsPerTenant.set(d.tenant_id, (domainsPerTenant.get(d.tenant_id) ?? 0) + 1);
  }
  // The governed seed creates two tenants carrying two and one domain respectively.
  const shape = [...domainsPerTenant.values()].sort((a, b) => b - a);
  if (tenantIds.size === contract.tenants && JSON.stringify(shape) !== JSON.stringify([2, 1])) {
    problems.push(`seed contract: domains are distributed ${JSON.stringify(shape)} across tenants; the governed seed produces [2,1]`);
  }
  // Exactly one PLATFORM admin principal; the rest are scoped to a tenant or domain.
  const principals = rows('identity.principals');
  const platform = principals.filter((p) => p.scope === 'PLATFORM');
  if (principals.length === contract.principals && platform.length !== 1) {
    problems.push(`seed contract: ${platform.length} PLATFORM principal(s); the governed seed produces exactly 1`);
  }
  for (const p of principals) {
    const scopedOk = (p.scope === 'PLATFORM' && p.tenant_id === null && p.domain_id === null)
      || (p.scope === 'TENANT' && p.tenant_id !== null && p.domain_id === null)
      || (p.scope === 'DOMAIN' && p.tenant_id !== null && p.domain_id !== null);
    if (!scopedOk) problems.push(`seed contract: principal ${p.id} has a scope/tenancy combination the seed never creates`);
  }
  // Every session belongs to a seeded principal; every canonical object to a seeded domain.
  const principalIds = new Set(principals.map((p) => p.id));
  for (const x of rows('identity.sessions')) {
    if (!principalIds.has(x.principal_id)) problems.push(`seed contract: session ${x.id} names a principal the seed did not create`);
  }
  const domainIds = new Set(rows('tenancy.domains').map((r) => r.id));
  for (const o of rows('objects.canonical_objects')) {
    if (!domainIds.has(o.domain_id)) problems.push(`seed contract: canonical object ${o.object_id} names a domain the seed did not create`);
  }
  // Audit floors stay MINIMA by design: the chain grows with governed activity.
  const events = snapshot.audit.events;
  const platformEvents = events.filter((e) => e.partition_id === 'platform').length;
  const tenantParts = new Set(events.map((e) => e.partition_id).filter((p) => p.startsWith('tenant:')));
  if (platformEvents < contract.audit_platform_min) problems.push(`seed contract: platform audit partition has ${platformEvents} event(s); >= ${contract.audit_platform_min} required`);
  if (tenantParts.size < contract.audit_tenant_partitions_min) problems.push('seed contract: no tenant audit partition exists');
  if (events.length < contract.audit_total_min) problems.push(`seed contract: ${events.length} audit event(s) total; >= ${contract.audit_total_min} required`);
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

// ── THE SOURCE-OWNED CATALOG CONTRACT (C18.1.4 §4) ────────────────────────────
/**
 * 83d158c bound a snapshot's table NAMES to the source universe, but its columns, primary keys
 * and foreign-key definitions came only from the catalog metadata the archive itself carried —
 * so removing a column, or changing an FK's referential actions, passed as long as the processed
 * snapshot, the raw receipts and the checksums were rebound consistently on BOTH paths.
 *
 * The complete catalog is now a TRACKED SOURCE ARTIFACT (lib/c18-catalog-contract.json), one
 * era for the 0012 history and one for 0021, carrying every table's exact ordinal column list
 * and primary key and every FK's complete `pg_get_constraintdef` text. The verifier judges every
 * snapshot against it, and the PRODUCER fails if the live database disagrees — so the contract
 * cannot silently rot away from the migrations it describes.
 */
export function loadCatalogContract(libDir) {
  const raw = JSON.parse(readFileSync(join(libDir, 'c18-catalog-contract.json'), 'utf8'));
  for (const era of ['historical', 'latest']) {
    if (raw[era] === undefined || typeof raw[era].tables !== 'object' || !Array.isArray(raw[era].fks)) {
      throw new Error(`c18-catalog-contract.json is missing a well-formed '${era}' era`);
    }
  }
  return raw;
}

export const CATALOG_ERA = Object.freeze({ historical: 'historical', latest: 'latest' });

export function verifyCatalogContract(snapshot, era, contract, label) {
  const problems = [];
  const want = contract[era];
  if (want === undefined) return [`${label}: no catalog contract for era '${era}'`];
  const wantTables = Object.keys(want.tables).sort();
  const gotTables = Object.keys(snapshot.tables ?? {}).sort();
  if (JSON.stringify(gotTables) !== JSON.stringify(wantTables)) {
    problems.push(`${label}: catalog table set is not the source-owned ${era} contract`);
  }
  for (const [table, spec] of Object.entries(want.tables)) {
    const got = snapshot.tables?.[table];
    if (got === undefined) { problems.push(`${label}: contract table '${table}' is MISSING`); continue; }
    if (JSON.stringify(got.columns) !== JSON.stringify(spec.columns)) {
      const missing = spec.columns.filter((c) => !(got.columns ?? []).includes(c));
      const extra = (got.columns ?? []).filter((c) => !spec.columns.includes(c));
      problems.push(`${label}: '${table}' columns violate the source-owned catalog contract`
        + `${missing.length > 0 ? ` (missing ${missing.join(', ')})` : ''}`
        + `${extra.length > 0 ? ` (unexpected ${extra.join(', ')})` : ''}`);
    }
    if (JSON.stringify(got.pk) !== JSON.stringify(spec.pk)) {
      problems.push(`${label}: '${table}' primary key ${JSON.stringify(got.pk)} is not the contract's ${JSON.stringify(spec.pk)}`);
    }
  }
  const gotFks = new Map((snapshot.fks ?? []).map((f) => [f.constraint, f]));
  for (const f of want.fks) {
    const got = gotFks.get(f.constraint);
    if (got === undefined) { problems.push(`${label}: contract foreign key '${f.constraint}' is MISSING`); continue; }
    for (const field of ['from', 'to', 'definition', 'validated', 'deferrable']) {
      if (got[field] !== f[field]) {
        problems.push(`${label}: foreign key '${f.constraint}' ${field} violates the source-owned catalog contract`
          + (field === 'definition' ? ` (contract: ${f.definition})` : ''));
      }
    }
  }
  for (const name of gotFks.keys()) {
    if (!want.fks.some((f) => f.constraint === name)) {
      problems.push(`${label}: foreign key '${name}' is not in the source-owned catalog contract`);
    }
  }
  return problems;
}

// ── MIGRATION EXECUTION AUTHENTICATION (C18.1.3 §B; command-bound at C18.1.4) ──
/**
 * The 15e8239 graph checked only that a migration command's argv ended in `/scripts/migrate.mjs`,
 * so `/attacker/scripts/migrate.mjs` passed. A migration execution is now a closed typed receipt
 * binding the governed workspace, the EXECUTED runner's bytes, the exact ordered migration set
 * present in that workspace, and the intended ceiling.
 */
export const MIGRATION_EXECUTION_FIELDS = Object.freeze([
  'command_id', 'attest_command_id', 'inventory_command_id', 'label', 'path', 'workspace',
  'runner_path', 'runner_sha256', 'inventory_helper_sha256', 'ceiling', 'inventory', 'migrations',
  'applied',
]);

/**
 * C18.1.5 — 7be02b8 hashed exactly the files the manifest CLAIMED, so a migration file sitting
 * in the governed workspace outside that claim was never enumerated, never hashed, and — since
 * the runner applies every `.sql` it finds — could be applied with nothing in the evidence
 * recording it. Every execution now begins with a command-bound INVENTORY of the complete
 * migration directory, which must equal the exact source-derived set; the attestation hashes
 * every DISCOVERED file; and the runner's own output is parsed for the exact expected
 * application sequence.
 */
/**
 * C18.1.6 — the inventory is produced by the TRACKED cross-platform helper, not by `ls -1`.
 * `ls -1` omits dot-prefixed entries and emits line-delimited text, so `.0022_hidden.sql` (which
 * the runner's readdirSync WOULD apply) could not be expressed at all, and a name containing a
 * space or newline could not be read back unambiguously.
 */
export const INVENTORY_HELPER_REL = 'scripts/gate/lib/c18-inventory.mjs';
/** The helper is COPIED into the governed workspace and run from there, exactly as the migrate
 * runner is, so the argv is workspace-relative and reproducible by any verifier — and the
 * executed bytes are covered by the same attestation that measures the runner. */
export const INVENTORY_HELPER_WS = 'scripts/c18-inventory.mjs';
export const inventoryArgv = (workspace) => [
  'node', `${workspace}/${INVENTORY_HELPER_WS}`, `${workspace}/migrations`,
];

/** Which migrations each governed execution NEWLY applies (exclusive floor per execution). */
export const EXECUTION_FLOOR = Object.freeze({
  'a-migrate-historical': '0000',
  'a-migrate-upgrade': HISTORICAL_LAST,
  'b-migrate-latest': '0000',
});

/** The governed migration filename grammar — the same one orderedMigrations enforces. */
export const MIGRATION_NAME_RE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Decode a canonical inventory receipt. Every entry must be an exact {name, type} pair; the list
 * must be sorted by code unit and free of duplicates. Nothing is trimmed or coerced, so a name
 * carrying whitespace or a newline is preserved exactly as the filesystem reported it.
 */
export function parseInventory(text) {
  let entries = null;
  try { entries = JSON.parse(String(text ?? '')); } catch {
    return { entries: [], names: [], problem: 'inventory receipt is not canonical JSON' };
  }
  if (!Array.isArray(entries)) return { entries: [], names: [], problem: 'inventory receipt is not a JSON array' };
  for (const e of entries) {
    if (e === null || typeof e !== 'object' || Array.isArray(e)
      || JSON.stringify(Object.keys(e).sort()) !== '["name","type"]'
      || typeof e.name !== 'string' || typeof e.type !== 'string') {
      return { entries: [], names: [], problem: 'inventory entry is not an exact {name,type} record' };
    }
  }
  const names = entries.map((e) => e.name);
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (JSON.stringify(names) !== JSON.stringify(sorted)) {
    return { entries, names, problem: 'inventory is not in canonical sorted order' };
  }
  if (new Set(names).size !== names.length) {
    return { entries, names, problem: 'inventory lists a DUPLICATE entry' };
  }
  return { entries, names, problem: null };
}

/**
 * Judge a decoded inventory against the exact source-derived migration set: every entry must be
 * a REGULAR FILE (a directory, a symlink or any other node is refused outright), must satisfy the
 * governed filename grammar, and the complete set must equal the tracked 0001–ceiling list.
 */
export function verifyInventoryEntries(entries, wantNames, label) {
  const problems = [];
  for (const e of entries) {
    if (e.type !== 'file') {
      problems.push(`${label}: governed workspace entry ${JSON.stringify(e.name)} is a ${e.type}, not a regular file`);
    }
    if (!MIGRATION_NAME_RE.test(e.name)) {
      problems.push(`${label}: governed workspace entry ${JSON.stringify(e.name)} violates the migration filename grammar`);
    }
  }
  const names = entries.map((e) => e.name);
  if (JSON.stringify(names) !== JSON.stringify(wantNames)) {
    const extra = names.filter((n) => !wantNames.includes(n));
    const missing = wantNames.filter((n) => !names.includes(n));
    problems.push(`${label}: governed workspace holds ${names.length} entr(ies); the exact source-derived set is ${wantNames.length}`
      + `${extra.length > 0 ? ` (UNAUTHORIZED: ${extra.map((n) => JSON.stringify(n)).join(', ')})` : ''}`
      + `${missing.length > 0 ? ` (missing: ${missing.map((n) => JSON.stringify(n)).join(', ')})` : ''}`);
  }
  return problems;
}

/** The EXACT lines the tracked migrate runner emits for a given application sequence. */
export const MIGRATION_TERMINAL_LINES = Object.freeze([
  'migrations up to date',
  'role passwords synchronized from environment',
]);
export const expectedRunLines = (applied) => [
  ...applied.map((f) => `applying ${f} ... ok`),
  ...MIGRATION_TERMINAL_LINES,
];

/**
 * COMPLETE output validation. 8362cba matched `applying (\S+) ... ok` anywhere in the stream, so
 * a filename containing whitespace was invisible and any additional line — a stray grant, a
 * warning, a second copy of a legitimate line — was ignored. The runner's output must now equal
 * the expected line sequence EXACTLY, in order, with nothing else present.
 */
export function verifyMigrationRun(text, applied, label) {
  const raw = String(text ?? '');
  const lines = raw.split('\n');
  if (lines[lines.length - 1] !== '') {
    return [`${label}: runner output does not end with a newline`];
  }
  lines.pop();
  const want = expectedRunLines(applied);
  if (lines.length !== want.length) {
    const extra = lines.filter((l) => !want.includes(l));
    return [`${label}: runner emitted ${lines.length} line(s); the governed sequence is exactly ${want.length}`
      + `${extra.length > 0 ? ` (UNEXPECTED: ${extra.slice(0, 3).map((l) => JSON.stringify(l)).join(', ')})` : ''}`];
  }
  const problems = [];
  want.forEach((expect, i) => {
    if (lines[i] !== expect) {
      problems.push(`${label}: runner output line ${i + 1} is ${JSON.stringify(lines[i])}; the governed sequence requires ${JSON.stringify(expect)}`);
    }
  });
  return problems;
}

/**
 * C18.1.4 — `runner_sha256` and `migrations[]` were MANIFEST ASSERTIONS: the verifier compared
 * them to tracked source, but nothing tied them to the bytes that actually ran. Each execution
 * now names an ATTESTATION COMMAND — `shasum -a 256 <runner> <every workspace migration>` —
 * executed against the same governed workspace immediately before the migration itself. The
 * digests are PARSED FROM ITS RAW RECEIPT and must equal both the tracked source digests and the
 * receipt's own fields, so a self-asserted digest over a foreign runner cannot survive.
 */
export const attestArgv = (workspace, files) => [
  'shasum', '-a', '256', `${workspace}/scripts/migrate.mjs`, `${workspace}/${INVENTORY_HELPER_WS}`,
  ...files.map((f) => `${workspace}/migrations/${f}`),
];

/**
 * The migrations a given execution must NEWLY apply: everything above the previous ceiling up
 * to its own. Path A's upgrade re-runs against an already-migrated database, so it applies only
 * 0013–0021; a fresh instance applies everything up to its ceiling.
 */
export function expectedApplied(allFiles, ceiling, floorExclusive = '0000') {
  return allFiles
    .filter((f) => f.slice(0, 4) > floorExclusive && f.slice(0, 4) <= ceiling)
    .sort();
}

/** Parse `shasum -a 256` output into [path, digest] pairs, in emitted order. */
export function parseAttestation(text) {
  const raw = String(text ?? '');
  if (raw === '') return { rows: [], problem: 'attestation receipt is empty' };
  if (!raw.endsWith('\n')) return { rows: [], problem: 'attestation receipt is not newline-terminated' };
  const rows = [];
  // C18.1.7 — every line must be a well-formed record. dccfcf26 skipped blank lines, so a
  // receipt carrying output the tool could never emit still parsed cleanly.
  const lines = raw.slice(0, -1).split('\n');
  for (const line of lines) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (m === null) return { rows: [], problem: `attestation line ${JSON.stringify(line.slice(0, 60))} is not shasum output` };
    rows.push({ digest: m[1], path: m[2] });
  }
  return { rows, problem: null };
}

/** The EXACT bytes `shasum -a 256` emits for an ordered (digest, path) sequence. */
export const encodeAttestation = (rows) => rows.map((r) => `${r.digest}  ${r.path}\n`).join('');
/** A governed workspace: an absolute path OUTSIDE the repository whose final component is the
 * mkdtemp name the producer creates, with no traversal and no symlink games. */
export const WORKSPACE_BASENAME_RE = /^c18-[ab]-[A-Za-z0-9]{6}$/;

/** A successful governed command: exit 0, no signal, and NOTHING on stderr. */
export function cleanExecution(cmd, label) {
  const problems = [];
  if (cmd.exit !== 0 || (cmd.signal ?? null) !== null) {
    problems.push(`${label} recorded exit ${cmd.exit} signal ${cmd.signal}`);
  }
  if (cmd.stderr_bytes !== 0) {
    problems.push(`${label} wrote ${cmd.stderr_bytes} byte(s) to stderr; a governed command that succeeded emits none`);
  }
  return problems;
}

export function verifyMigrationExecutions({
  executions, commands, trackedDigests, repoRoot, rawText = null, helperDigest = undefined,
}) {
  const problems = [];
  if (!Array.isArray(executions)) return ['manifest migration_executions is not an array'];
  const expected = [
    { label: 'a-migrate-historical', path: 'path-a-upgraded', letter: 'a', ceiling: HISTORICAL_LAST },
    { label: 'a-migrate-upgrade', path: 'path-a-upgraded', letter: 'a', ceiling: LATEST_LAST },
    { label: 'b-migrate-latest', path: 'path-b-virgin', letter: 'b', ceiling: LATEST_LAST },
  ];
  if (executions.length !== expected.length) {
    problems.push(`manifest records ${executions.length} migration executions; exactly ${expected.length} are governed`);
  }
  const runnerDigest = trackedDigests.get('__runner__');
  expected.forEach((want, i) => {
    const e = executions[i];
    if (e === undefined) { problems.push(`migration execution '${want.label}' is MISSING`); return; }
    if (JSON.stringify(Object.keys(e).sort()) !== JSON.stringify([...MIGRATION_EXECUTION_FIELDS].sort())) {
      problems.push(`migration execution ${i + 1} fields are not the exact closed receipt set`);
      return;
    }
    if (e.label !== want.label) problems.push(`migration execution ${i + 1} is '${e.label}', expected '${want.label}'`);
    if (e.path !== want.path) problems.push(`migration execution '${e.label}' claims path ${JSON.stringify(e.path)}`);
    if (e.ceiling !== want.ceiling) problems.push(`migration execution '${e.label}' ceiling is ${JSON.stringify(e.ceiling)}, expected ${want.ceiling}`);
    // GOVERNED WORKSPACE GRAMMAR — absolute, no traversal, outside the repo, mkdtemp-shaped.
    const ws = e.workspace;
    const parts = typeof ws === 'string' ? ws.split('/') : [];
    if (typeof ws !== 'string' || !ws.startsWith('/') || parts.includes('..') || parts.includes('.')
      || !WORKSPACE_BASENAME_RE.test(parts[parts.length - 1] ?? '')) {
      problems.push(`migration execution '${e.label}' workspace ${JSON.stringify(ws)} is not a governed workspace path`);
    } else if (typeof repoRoot === 'string' && (ws === repoRoot || ws.startsWith(`${repoRoot}/`))) {
      problems.push(`migration execution '${e.label}' workspace resolves INSIDE the repository`);
    }
    if (e.runner_path !== `${ws}/scripts/migrate.mjs`) {
      problems.push(`migration execution '${e.label}' runner ${JSON.stringify(e.runner_path)} is not the governed workspace runner`);
    }
    // The EXECUTED runner's bytes must be the tracked source runner's bytes.
    if (runnerDigest !== undefined && e.runner_sha256 !== runnerDigest) {
      problems.push(`migration execution '${e.label}' ran a runner whose bytes are not the tracked apps/api/scripts/migrate.mjs`);
    }
    // The EXACT ordered migration set available in that workspace, at that ceiling.
    const wantFiles = [...trackedDigests.entries()]
      .filter(([f]) => /^\d{4}_/.test(f) && f.slice(0, 4) <= e.ceiling)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([filename, digest]) => ({ filename, digest }));
    if (JSON.stringify(e.migrations) !== JSON.stringify(wantFiles)) {
      problems.push(`migration execution '${e.label}' workspace migration set is not exactly the tracked 0001–${e.ceiling} set in order`);
    }
    // ── COMMAND-BOUND INVENTORY: the COMPLETE governed migration directory, enumerated by the
    // TRACKED cross-platform helper — dot-prefixed names included, canonical JSON, file types
    // reported from lstat — must be exactly the source-derived set. ─────────────────────
    const wantNames = wantFiles.map((f) => f.filename);
    if (helperDigest !== undefined && e.inventory_helper_sha256 !== helperDigest) {
      problems.push(`migration execution '${e.label}' enumerated the workspace with a helper whose bytes are not the tracked ${INVENTORY_HELPER_REL}`);
    }
    const inv = Array.isArray(commands) ? commands.find((c) => c.id === e.inventory_command_id) : undefined;
    if (inv === undefined) {
      problems.push(`migration execution '${e.label}' names inventory command '${e.inventory_command_id}' which does not exist`);
    } else {
      if (inv.label !== `${e.label}-inventory`) {
        problems.push(`migration execution '${e.label}' inventory is bound to command '${inv.label}'`);
      }
      problems.push(...cleanExecution(inv, `migration execution '${e.label}' inventory`));
      if (JSON.stringify(inv.argv) !== JSON.stringify(inventoryArgv(ws))) {
        problems.push(`migration execution '${e.label}' inventory did not enumerate the governed workspace with the tracked helper`);
      }
      const invText = rawText === null ? null : rawText(inv);
      if (invText === null) problems.push(`migration execution '${e.label}' inventory has no readable raw receipt`);
      else {
        const { entries, names, problem } = parseInventory(invText);
        if (problem !== null) problems.push(`migration execution '${e.label}' ${problem}`);
        else {
          // C18.1.7 — the receipt must be EXACTLY what the tracked helper emits, including its
          // single terminal newline. Pretty-printed or otherwise re-encoded JSON that merely
          // parses to the same entries is output the helper could never have produced.
          if (invText !== encodeInventory(entries)) {
            problems.push(`migration execution '${e.label}' inventory receipt bytes are not the canonical encoding the tracked helper emits`);
          }
          problems.push(...verifyInventoryEntries(entries, wantNames, `migration execution '${e.label}'`));
          // The receipt's own inventory field must equal what the command ENUMERATED.
          if (JSON.stringify(e.inventory) !== JSON.stringify(entries)) {
            problems.push(`migration execution '${e.label}' inventory[] disagrees with the enumerated directory`);
          }
          void names;
        }
      }
    }

    // ── COMMAND-BOUND ATTESTATION: the digests must come from an EXECUTED shasum, not
    // from the manifest's own fields. ──────────────────────────────────────────────────
    const attest = Array.isArray(commands) ? commands.find((c) => c.id === e.attest_command_id) : undefined;
    if (attest === undefined) {
      problems.push(`migration execution '${e.label}' names attestation command '${e.attest_command_id}' which does not exist`);
    } else {
      if (attest.label !== `${e.label}-attest`) {
        problems.push(`migration execution '${e.label}' attestation is bound to command '${attest.label}'`);
      }
      problems.push(...cleanExecution(attest, `migration execution '${e.label}' attestation`));
      // Hash coverage follows the ENUMERATED directory, so an unauthorized file cannot be
      // omitted from the attestation by omitting it from the manifest's claim.
      const discovered = Array.isArray(e.inventory) ? e.inventory.map((x) => x?.name ?? x) : wantNames;
      const wantArgv = attestArgv(ws, discovered);
      if (JSON.stringify(attest.argv) !== JSON.stringify(wantArgv)) {
        problems.push(`migration execution '${e.label}' attestation did not hash exactly the governed runner and every enumerated migration file`);
      }
      const text = rawText === null ? null : rawText(attest);
      if (text === null) problems.push(`migration execution '${e.label}' attestation has no readable raw receipt`);
      else {
        const { rows, problem } = parseAttestation(text);
        if (problem !== null) problems.push(`migration execution '${e.label}' ${problem}`);
        else {
          const wantRows = [
            { path: e.runner_path, digest: runnerDigest },
            { path: `${ws}/${INVENTORY_HELPER_WS}`, digest: helperDigest },
            ...wantFiles.map((f) => ({ path: `${ws}/migrations/${f.filename}`, digest: f.digest })),
          ];
          if (rows.length !== wantRows.length) {
            problems.push(`migration execution '${e.label}' attestation covers ${rows.length} files; the governed set is ${wantRows.length}`);
          } else {
            if (text !== encodeAttestation(wantRows.map((w, j) => ({ digest: rows[j]?.digest ?? w.digest, path: w.path })))) {
              problems.push(`migration execution '${e.label}' attestation receipt bytes are not the exact ordered '<digest>  <path>' sequence`);
            }
            wantRows.forEach((w, j) => {
              if (rows[j].path !== w.path) {
                problems.push(`migration execution '${e.label}' attestation line ${j + 1} hashed ${JSON.stringify(rows[j].path)}, expected ${JSON.stringify(w.path)}`);
              } else if (w.digest !== undefined && rows[j].digest !== w.digest) {
                const what = j === 0 ? 'runner' : j === 1 ? 'inventory helper' : `migration ${wantFiles[j - 2].filename}`;
                problems.push(`migration execution '${e.label}' EXECUTED ${what} whose measured bytes are not the tracked source bytes`);
              }
            });
            // The receipt's own fields must equal what the execution MEASURED.
            if (rows[0] !== undefined && e.runner_sha256 !== rows[0].digest) {
              problems.push(`migration execution '${e.label}' runner_sha256 disagrees with the attested measurement`);
            }
            if (rows[1] !== undefined && e.inventory_helper_sha256 !== rows[1].digest) {
              problems.push(`migration execution '${e.label}' inventory_helper_sha256 disagrees with the attested measurement`);
            }
            const measured = rows.slice(2).map((r, j) => ({ filename: wantFiles[j]?.filename, digest: r.digest }));
            if (JSON.stringify(e.migrations) !== JSON.stringify(measured)) {
              problems.push(`migration execution '${e.label}' migrations[] disagrees with the attested measurement`);
            }
          }
        }
      }
    }
    // ── THE RUNNER'S OWN OUTPUT: the EXACT expected line sequence, nothing else. ──────
    const runCmd = Array.isArray(commands) ? commands.find((c) => c.id === e.command_id) : undefined;
    if (runCmd !== undefined) {
      problems.push(...cleanExecution(runCmd, `migration execution '${e.label}'`));
      const runText = rawText === null ? null : rawText(runCmd);
      if (runText === null) problems.push(`migration execution '${e.label}' has no readable runner receipt`);
      else {
        const wantApplied = expectedApplied(wantNames, e.ceiling, EXECUTION_FLOOR[e.label] ?? '0000');
        problems.push(...verifyMigrationRun(runText, wantApplied, `migration execution '${e.label}'`));
        if (JSON.stringify(e.applied) !== JSON.stringify(wantApplied)) {
          problems.push(`migration execution '${e.label}' applied[] ${JSON.stringify(e.applied)} is not the governed sequence ${JSON.stringify(wantApplied)}`);
        }
      }
    }
    const cmd = runCmd;
    if (cmd === undefined) problems.push(`migration execution '${e.label}' names command id '${e.command_id}' which does not exist`);
    else {
      if (cmd.label !== e.label) problems.push(`migration execution '${e.label}' is bound to command '${cmd.label}'`);
      if (JSON.stringify(cmd.argv) !== JSON.stringify(['node', e.runner_path])) {
        problems.push(`migration execution '${e.label}' command argv is not exactly ['node', <governed runner>]`);
      }
      if (cmd.exit !== 0 || (cmd.signal ?? null) !== null) {
        problems.push(`migration execution '${e.label}' command recorded exit ${cmd.exit} signal ${cmd.signal}`);
      }
    }
  });
  return problems;
}

// ── GOVERNED SEEDING STEP RECEIPTS (C18.1.3 §F) ───────────────────────────────
/**
 * The governed 0012-era seed, as a source-owned ordered plan of steps and the era ports each one
 * is allowed to use. The producer emits one sanitized receipt per step — names, ports, counts and
 * resulting identities only, never a credential or a hash of one.
 */
export const SEED_STEP_PLAN = Object.freeze([
  Object.freeze({ step: 'bootstrap', ports: Object.freeze(['ctx.issue_bootstrap', 'identity.claim_bootstrap', 'identity.create_principal', 'identity.bootstrap_mark_one_time', 'identity.record_bootstrap_principal', 'audit.commit_identity_event']) }),
  Object.freeze({ step: 'credential-rotation', ports: Object.freeze(['identity.credential_get_active', 'ctx.issue_identity_op', 'identity.credential_rotate_v2', 'audit.commit_identity_event']) }),
  Object.freeze({ step: 'admin-session', ports: Object.freeze(['ctx.issue_identity_op', 'identity.session_open']) }),
  Object.freeze({ step: 'tenants-domains', ports: Object.freeze(['ctx.issue_commit', 'tenancy.create_tenant', 'tenancy.create_domain', 'policy.commit_decision', 'audit.commit_event']) }),
  Object.freeze({ step: 'principals', ports: Object.freeze(['ctx.issue_commit', 'identity.create_principal', 'policy.commit_decision', 'audit.commit_event']) }),
  Object.freeze({ step: 'tenant-session', ports: Object.freeze(['ctx.issue_identity_op', 'identity.session_open']) }),
  Object.freeze({ step: 'canonical-objects', ports: Object.freeze(['ctx.issue_commit', 'objects.admit_version', 'policy.commit_decision', 'audit.commit_event']) }),
  Object.freeze({ step: 'outbox-enqueue', ports: Object.freeze(['ctx.issue_commit', 'objects.enqueue_event', 'policy.commit_decision', 'audit.commit_event']) }),
  Object.freeze({ step: 'outbox-publish', ports: Object.freeze(['ctx.issue_publish', 'objects.outbox_lease', 'objects.outbox_ack_leased']) }),
]);
const SEED_STEP_FIELDS = Object.freeze(['step', 'ports', 'ids']);
const SECRET_SHAPE_RE = /[0-9a-f]{24,}/i;

/**
 * The EXACT identity set each governed step must report, DERIVED from the closed seed record.
 * 83d158c only asked that reported identities were known somewhere in the record, so an empty
 * list, a missing identity, or one step claiming another step's work all passed.
 */
export function deriveSeedStepIdentities(seedRecord) {
  const sessions = seedRecord?.sessions ?? [];
  const adminSession = sessions.filter((x) => x.principalId === seedRecord?.admin?.principalId);
  const otherSessions = sessions.filter((x) => x.principalId !== seedRecord?.admin?.principalId);
  const published = (seedRecord?.outbox ?? []).filter((o) => o.eventType === 'c18.seed.published');
  return {
    bootstrap: [seedRecord?.admin?.principalId],
    'credential-rotation': [seedRecord?.admin?.principalId],
    'admin-session': adminSession.map((x) => x.sessionId),
    'tenants-domains': [
      ...(seedRecord?.tenants ?? []).map((t) => t.tenantId),
      ...(seedRecord?.domains ?? []).map((d) => d.domainId),
    ],
    principals: (seedRecord?.principals ?? []).map((p) => p.principalId),
    'tenant-session': otherSessions.map((x) => x.sessionId),
    'canonical-objects': (seedRecord?.objects ?? []).map((o) => o.objectId),
    'outbox-enqueue': (seedRecord?.outbox ?? []).map((o) => o.eventId),
    'outbox-publish': published.map((o) => o.eventId),
  };
}

/** Steps must be the exact plan, in order, with the exact era ports and the EXACT derived
 * identity set — no empty, missing, duplicate, extra or step-misattributed identity. */
export function verifySeedSteps({ steps, seedRecord, contractHeld = true, slots = null }) {
  // C18.1.5 — identities are derived from the record only AFTER the exact seed contract holds.
  // Deriving from a record whose cardinalities are already wrong would reconcile the forgery
  // against itself.
  if (!contractHeld) {
    return ['governed seed steps cannot be judged: the exact seed contract did not hold, so the record is not a trustworthy source of expected identities'];
  }
  const problems = [];
  if (!Array.isArray(steps)) return ['seed record steps is not an array'];
  if (steps.length !== SEED_STEP_PLAN.length) {
    problems.push(`seed record has ${steps.length} governed step receipts; the source-owned plan has ${SEED_STEP_PLAN.length}`);
  }
  // C18.1.6 — when the spec slots resolved, expected identities come from the SOURCE-OWNED
  // step→slot map, so a step that attributes another slot's identity cannot reconcile.
  const derived = slots === null ? deriveSeedStepIdentities(seedRecord) : deriveStepIdentitiesFromSlots(slots);
  const known = new Set([
    seedRecord?.admin?.principalId,
    ...(seedRecord?.tenants ?? []).map((t) => t.tenantId),
    ...(seedRecord?.domains ?? []).map((d) => d.domainId),
    ...(seedRecord?.principals ?? []).map((p) => p.principalId),
    ...(seedRecord?.sessions ?? []).map((s) => s.sessionId),
    ...(seedRecord?.objects ?? []).map((o) => o.objectId),
    ...(seedRecord?.outbox ?? []).map((o) => o.eventId),
  ].filter(Boolean));
  SEED_STEP_PLAN.forEach((want, i) => {
    const got = steps[i];
    if (got === undefined) { problems.push(`governed seed step '${want.step}' is MISSING`); return; }
    if (JSON.stringify(Object.keys(got).sort()) !== JSON.stringify([...SEED_STEP_FIELDS].sort())) {
      problems.push(`governed seed step ${i + 1} fields are not the exact closed receipt set`);
      return;
    }
    if (got.step !== want.step) problems.push(`governed seed step ${i + 1} is '${got.step}', the plan requires '${want.step}'`);
    if (JSON.stringify(got.ports) !== JSON.stringify([...want.ports])) {
      problems.push(`governed seed step '${want.step}' ports ${JSON.stringify(got.ports)} are not the source-owned era ports`);
    }
    if (!Array.isArray(got.ids)) { problems.push(`governed seed step '${want.step}' ids is not an array`); return; }
    for (const id of got.ids) {
      if (typeof id !== 'string' || SECRET_SHAPE_RE.test(id)) {
        problems.push(`governed seed step '${want.step}' reports a value that is not a sanitized identity`);
      } else if (!known.has(id)) {
        problems.push(`governed seed step '${want.step}' reports identity ${id}, which the closed seed record does not account for`);
      }
    }
    if (new Set(got.ids).size !== got.ids.length) {
      problems.push(`governed seed step '${want.step}' reports DUPLICATE identities`);
    }
    // The EXACT derived set: empty, missing, extra and misattributed identities all fail.
    const wantIds = [...(derived[want.step] ?? [])].filter((x) => x !== undefined).sort();
    const gotIds = [...got.ids].sort();
    if (wantIds.length === 0) {
      problems.push(`governed seed step '${want.step}' has no derivable identity set — the record cannot attest it`);
    } else if (JSON.stringify(gotIds) !== JSON.stringify(wantIds)) {
      const missing = wantIds.filter((x) => !gotIds.includes(x));
      const extra = gotIds.filter((x) => !wantIds.includes(x));
      problems.push(`governed seed step '${want.step}' identities are not the record-derived set`
        + `${missing.length > 0 ? ` (missing ${missing.join(', ')})` : ''}`
        + `${extra.length > 0 ? ` (not this step's work: ${extra.join(', ')})` : ''}`);
    }
  });
  return problems;
}

// ── CHECKED CLEANUP, AUTHENTICATED BY EXECUTION (C18.1.3 §F) ──────────────────
/**
 * 15e8239 recorded cleanup as an ASSERTION: `removed`/`failures`/`kept` with nothing proving a
 * `docker rm -fv` ever ran. Cleanup is now executed THROUGH the evidence recorder, so each
 * removal and each post-removal absence check is a command with bound streams, and the receipt
 * must agree with those commands.
 */
export const CLEANUP_RECEIPT_FIELDS = Object.freeze(['removed', 'failures', 'kept', 'removals', 'inspections']);
const CLEANUP_STEP_FIELDS = Object.freeze(['container', 'command_id', 'exit']);

/** The exact absence probe: an EXIT-0, EMPTY-OUTPUT id lookup. */
export const absenceArgv = (container) => ['docker', 'ps', '-aq', '--filter', `name=^${container}$`];

export function verifyCleanupReceipt({ cleanup, commands, receiptA, receiptB, rawText = null, errText = null }) {
  const problems = [];
  if (cleanup === null || typeof cleanup !== 'object' || Array.isArray(cleanup)) return ['manifest cleanup is not an object'];
  if (JSON.stringify(Object.keys(cleanup).sort()) !== JSON.stringify([...CLEANUP_RECEIPT_FIELDS].sort())) {
    return ['manifest cleanup fields are not the exact closed receipt set (removal and inspection evidence is required)'];
  }
  const wanted = [
    receiptA?.container_name, receiptA?.redis_container,
    receiptB?.container_name, receiptB?.redis_container,
  ];
  if (wanted.some((n) => typeof n !== 'string')) return ['cleanup cannot be authenticated: the isolation receipts name no containers'];
  if (JSON.stringify(cleanup.removed) !== JSON.stringify(wanted)) {
    problems.push('manifest cleanup.removed is not exactly the four source-derived isolation container names');
  }
  if (JSON.stringify(cleanup.failures) !== '[]') problems.push('manifest cleanup records removal failures');
  if (JSON.stringify(cleanup.kept) !== '[]') problems.push('manifest cleanup records kept containers');
  const find = (id) => (Array.isArray(commands) ? commands.find((c) => c.id === id) : undefined);
  const walkPhase = (phase) => {
    const rows = cleanup[phase];
    if (!Array.isArray(rows) || rows.length !== wanted.length) {
      problems.push(`manifest cleanup.${phase} does not carry one receipt per source-derived container`);
      return;
    }
    rows.forEach((row, i) => {
      const container = wanted[i];
      if (JSON.stringify(Object.keys(row ?? {}).sort()) !== JSON.stringify([...CLEANUP_STEP_FIELDS].sort())) {
        problems.push(`cleanup ${phase} receipt ${i + 1} fields are not the exact closed set`);
        return;
      }
      if (row.container !== container) {
        problems.push(`cleanup ${phase} receipt ${i + 1} names '${row.container}', expected '${container}'`);
      }
      const cmd = find(row.command_id);
      if (cmd === undefined) { problems.push(`cleanup ${phase} receipt for '${container}' names a command id that does not exist`); return; }
      const wantArgv = phase === 'removals' ? ['docker', 'rm', '-fv', container] : absenceArgv(container);
      if (JSON.stringify(cmd.argv) !== JSON.stringify(wantArgv)) {
        problems.push(`cleanup ${phase} command for '${container}' argv ${JSON.stringify(cmd.argv)} is not the checked ${wantArgv.slice(0, 3).join(' ')} execution`);
      }
      if (cmd.exit !== row.exit) problems.push(`cleanup ${phase} receipt for '${container}' exit disagrees with its command ledger record`);
      if ((cmd.signal ?? null) !== null) problems.push(`cleanup ${phase} command for '${container}' was signalled`);
      if (cmd.exit !== 0) {
        // AUTHENTICATED ABSENCE (C18.1.4): 83d158c read ANY nonzero `docker inspect` as proof the
        // container was gone, so a dead daemon, a permission refusal, a transport error or a
        // missing binary all "proved" cleanup. Absence must now be a SUCCESSFUL query.
        problems.push(phase === 'removals'
          ? `checked removal of '${container}' recorded exit ${cmd.exit}`
          : `absence probe for '${container}' exited ${cmd.exit}: the container's state is UNKNOWN, not proven absent`);
      } else if (phase === 'inspections') {
        // UNAMBIGUOUS ABSENCE (C18.1.5): exit 0, no signal, and BOTH streams empty. 7be02b8
        // checked stdout only, so a probe that exited 0 while writing a daemon/permission error
        // to stderr certified cleanup it had not observed.
        const text = rawText === null ? null : rawText(cmd);
        if (text === null) problems.push(`absence probe for '${container}' has no readable raw receipt`);
        else if (text.trim() !== '') {
          problems.push(`absence probe for '${container}' returned a container id — it STILL EXISTS after checked removal`);
        }
        if (cmd.stdout_bytes !== 0) {
          problems.push(`absence probe for '${container}' produced ${cmd.stdout_bytes} bytes of stdout; an absent container yields none`);
        }
        if (cmd.stderr_bytes !== 0) {
          const err = errText === null ? null : errText(cmd);
          problems.push(`absence probe for '${container}' wrote ${cmd.stderr_bytes} bytes to stderr`
            + `${err === null ? '' : `: ${JSON.stringify(err.trim().slice(0, 120))}`}`
            + ' — a diagnosing probe proves nothing; the state is UNKNOWN');
        }
      }
    });
  };
  walkPhase('removals');
  walkPhase('inspections');
  return problems;
}

// ── THE CLOSED SEED RECORD ────────────────────────────────────────────────────
export const SEED_RECORD_FIELDS = Object.freeze([
  'admin', 'tenants', 'domains', 'principals', 'sessions', 'objects', 'outbox',
  'decisions', 'correlations', 'steps', 'post_upgrade_operation',
]);
const SEED_ENTRY_FIELDS = Object.freeze({
  tenants: ['tenantId', 'name'],
  domains: ['domainId', 'tenantId', 'name'],
  principals: ['principalId', 'scope', 'tenantId', 'domainId', 'loginName', 'roleCode'],
  sessions: ['sessionId', 'principalId', 'familyId', 'correlation'],
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
 * C18.1.6 — BIND THE GENERATED WORLD TO THE SOURCE-OWNED SEED SPECIFICATION.
 *
 * 8362cba fixed the seed's exact quantities, but the deterministic VALUES — tenant and domain
 * names, principal logins, roles, session ownership, object placement, outbox event types — were
 * only ever checked for agreement between the seed record and the snapshots. Renaming a tenant
 * consistently everywhere therefore reconciled perfectly.
 *
 * Every generated UUID is now resolved to a named SLOT in `c18-seed-spec.mjs` using the
 * deterministic key the specification owns, and the seed record, the reconstructed snapshot rows
 * and the governed step receipts are reconciled against those slots in both directions. A
 * consistent rename cannot resolve its slot, so it fails no matter how internally coherent it is.
 */
const stableJson = (v) => JSON.stringify(v, (k, val) => (
  val !== null && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((kk) => [kk, val[kk]]))
    : val
));
/**
 * PostgreSQL renders timestamptz with a '+00:00' offset and drops a zero fraction, while the
 * specification writes ISO 'Z' with milliseconds. Both are canonicalized to the same instant
 * before comparison; nothing else about the value is relaxed.
 */
const normalizeTimestamp = (v) => (typeof v === 'string'
  ? v.replace(/\+00:00$/, 'Z').replace(/\.000Z$/, 'Z')
  : v);

export function bindSeedSpec({ seedRecord, before, spec = C18_SEED_SPEC, headerDigest = null }) {
  const problems = [];
  const slots = { tenant: new Map(), domain: new Map(), principal: new Map(), session: new Map(), object: new Map(), outbox: new Map() };
  const rows = (t) => before.tables?.[t]?.rows ?? [];

  /** Resolve exactly one row by a deterministic key; anything else is a finding. */
  const resolveOne = (kind, slot, list, predicate, describe) => {
    const found = list.filter(predicate);
    if (found.length !== 1) {
      problems.push(`seed spec: ${found.length} ${kind} row(s) match the source-owned slot '${slot}' (${describe}); exactly one is required`);
      return null;
    }
    return found[0];
  };

  // ── TENANTS: exact names, one row each. ─────────────────────────────────────────────
  for (const t of spec.tenants) {
    const row = resolveOne('tenant', t.slot, rows('tenancy.tenants'), (r) => r.name === t.name, `name ${JSON.stringify(t.name)}`);
    if (row !== null) slots.tenant.set(t.slot, row.id);
  }
  // ── DOMAINS: exact names AND the parent tenant slot. ────────────────────────────────
  for (const d of spec.domains) {
    const parent = slots.tenant.get(d.tenantSlot) ?? null;
    const row = resolveOne('domain', d.slot, rows('tenancy.domains'),
      (r) => r.name === d.name && r.tenant_id === parent,
      `name ${JSON.stringify(d.name)} under tenant slot '${d.tenantSlot}'`);
    if (row !== null) slots.domain.set(d.slot, row.id);
  }
  // ── PRINCIPALS: login AND display name, scope, tenancy placement, and live role. ────
  const bindings = rows('identity.role_bindings').filter((b) => (b.revoked_at ?? null) === null);
  for (const p of [spec.admin, ...spec.principals]) {
    const wantTenant = p.tenantSlot === null ? null : (slots.tenant.get(p.tenantSlot) ?? null);
    const wantDomain = p.domainSlot === null ? null : (slots.domain.get(p.domainSlot) ?? null);
    const row = resolveOne('principal', p.slot, rows('identity.principals'),
      (r) => r.login_name === p.loginName, `login ${JSON.stringify(p.loginName)}`);
    if (row === null) continue;
    slots.principal.set(p.slot, row.id);
    for (const [field, actual, want] of [
      ['display_name', row.display_name, p.loginName], ['kind', row.kind, p.kind],
      ['scope', row.scope, p.scope], ['tenant_id', row.tenant_id ?? null, wantTenant],
      ['domain_id', row.domain_id ?? null, wantDomain],
    ]) {
      if (actual !== want) {
        problems.push(`seed spec: principal slot '${p.slot}' ${field} is ${JSON.stringify(actual)}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    const held = bindings.filter((b) => b.principal_id === row.id).map((b) => b.role_code);
    if (JSON.stringify(held) !== JSON.stringify([p.role])) {
      problems.push(`seed spec: principal slot '${p.slot}' holds role(s) ${JSON.stringify(held)}; the specification grants exactly ${JSON.stringify([p.role])}`);
    }
  }
  // ── BASE POSTURE (C18.1.8): the deterministic non-name state of every seeded row.
  // bfc8695 bound names and placement but never status, profiles or lifecycle, so a suspended
  // tenant, a disabled bootstrap principal or a changed retention profile reconciled. ──────
  const posture = spec.basePosture;
  for (const t of spec.tenants) {
    const id = slots.tenant.get(t.slot);
    const row = rows('tenancy.tenants').find((r) => r.id === id);
    if (row === undefined) continue;
    for (const [field, want] of Object.entries(posture.tenant)) {
      if (row[field] !== want) {
        problems.push(`seed spec: tenant slot '${t.slot}' ${field} is ${JSON.stringify(row[field])}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    if (row.activated_at === null || row.activated_at === undefined) {
      problems.push(`seed spec: tenant slot '${t.slot}' was never activated`);
    } else if (!(new Date(row.created_at) <= new Date(row.activated_at))) {
      problems.push(`seed spec: tenant slot '${t.slot}' activation precedes its creation`);
    }
  }
  for (const d of spec.domains) {
    const id = slots.domain.get(d.slot);
    const row = rows('tenancy.domains').find((r) => r.id === id);
    if (row === undefined) continue;
    for (const [field, want] of Object.entries(posture.domain)) {
      if (row[field] !== want) {
        problems.push(`seed spec: domain slot '${d.slot}' ${field} is ${JSON.stringify(row[field])}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    if (row.activated_at === null || row.activated_at === undefined) {
      problems.push(`seed spec: domain slot '${d.slot}' was never activated`);
    } else if (!(new Date(row.created_at) <= new Date(row.activated_at))) {
      problems.push(`seed spec: domain slot '${d.slot}' activation precedes its creation`);
    }
  }
  for (const p of [spec.admin, ...spec.principals]) {
    const id = slots.principal.get(p.slot);
    const row = rows('identity.principals').find((r) => r.id === id);
    if (row === undefined) continue;
    for (const [field, want] of Object.entries(posture.principal)) {
      if (row[field] !== want) {
        problems.push(`seed spec: principal slot '${p.slot}' ${field} is ${JSON.stringify(row[field])}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    // The bootstrap admin's epoch is bumped by the forced rotation; governed principals are
    // created after it and are never revoked.
    const wantEpoch = p.slot === spec.admin.slot
      ? posture.principalRevocationEpoch.admin : posture.principalRevocationEpoch.governed;
    if (row.revocation_epoch !== wantEpoch) {
      problems.push(`seed spec: principal slot '${p.slot}' revocation_epoch is ${JSON.stringify(row.revocation_epoch)}; the specification requires ${JSON.stringify(wantEpoch)}`);
    }
  }
  // ── BOOTSTRAP CLAIM: an exact singleton naming the platform admin. ──────────────────
  const claimRows = rows('identity.bootstrap_claim');
  if (claimRows.length !== 1) {
    problems.push(`seed spec: ${claimRows.length} bootstrap claim row(s); the audited single-use bootstrap writes exactly one`);
  } else {
    const claim = claimRows[0];
    if (claim.id !== posture.bootstrapClaim.id) {
      problems.push(`seed spec: the bootstrap claim identity is ${JSON.stringify(claim.id)}; the single-row contract requires ${JSON.stringify(posture.bootstrapClaim.id)}`);
    }
    if (claim.principal_id !== (slots.principal.get(spec.admin.slot) ?? null)) {
      problems.push('seed spec: the bootstrap claim names a principal other than the platform-admin slot');
    }
    if (claim.claimed_at === null || claim.claimed_at === undefined) {
      problems.push('seed spec: the bootstrap claim carries no claim time');
    }
  }
  // ── CREDENTIALS: one active per principal, plus exactly one rotated predecessor. ────
  const credRows = rows('identity.credentials');
  const adminId = slots.principal.get(spec.admin.slot) ?? null;
  const wantCreds = spec.principals.length + 1 + 1; // one active each, plus the rotated bootstrap
  if (credRows.length !== wantCreds) {
    problems.push(`seed spec: ${credRows.length} credential row(s); the governed seed writes exactly ${wantCreds}`);
  }
  for (const c of credRows) {
    if (c.type !== posture.credential.type) {
      problems.push(`seed spec: credential ${c.id} type is ${JSON.stringify(c.type)}; the seed writes only ${JSON.stringify(posture.credential.type)}`);
    }
    if (typeof c.secret_hash !== 'string' || !/^\$argon2id\$/.test(c.secret_hash)) {
      problems.push(`seed spec: credential ${c.id} does not carry an argon2id hash`);
    }
    const owner = [adminId, ...spec.principals.map((p) => slots.principal.get(p.slot))].includes(c.principal_id);
    if (!owner) problems.push(`seed spec: credential ${c.id} belongs to no seeded principal slot`);
  }
  for (const p of spec.principals) {
    const id = slots.principal.get(p.slot);
    const held = credRows.filter((c) => c.principal_id === id);
    if (held.length !== 1 || held[0]?.status !== posture.credential.activeStatus) {
      problems.push(`seed spec: principal slot '${p.slot}' holds ${held.length} credential(s); the seed writes exactly one active credential`);
    }
    if (held[0] !== undefined && ((held[0].rotated_at ?? null) !== null || (held[0].expires_at ?? null) !== null)) {
      problems.push(`seed spec: principal slot '${p.slot}' credential carries a rotation or expiry the seed never performs`);
    }
  }
  const adminCreds = credRows.filter((c) => c.principal_id === adminId);
  const rotated = adminCreds.filter((c) => c.status === posture.credential.rotatedStatus);
  const active = adminCreds.filter((c) => c.status === posture.credential.activeStatus);
  if (adminCreds.length !== 2 || rotated.length !== 1 || active.length !== 1) {
    problems.push(`seed spec: the platform admin holds ${adminCreds.length} credential(s) (${rotated.length} rotated, ${active.length} active); the forced rotation leaves exactly one of each`);
  }
  if (rotated[0] !== undefined) {
    if ((rotated[0].rotated_at ?? null) === null) problems.push('seed spec: the rotated bootstrap credential carries no rotation time');
    if ((rotated[0].expires_at ?? null) === null) problems.push('seed spec: the rotated bootstrap credential carries no expiry');
  }
  // ── TENANCY LIFECYCLE EVENTS: the exact planned set. ────────────────────────────────
  const lifeRows = rows('tenancy.lifecycle_events');
  const claimedLife = new Set();
  for (const plan of spec.lifecycleEvents) {
    const wantTenant = slots.tenant.get(plan.tenantSlot) ?? null;
    const wantDomain = plan.domainSlot === null ? null : (slots.domain.get(plan.domainSlot) ?? null);
    const matches = lifeRows.filter((r) => r.event === plan.event && r.tenant_id === wantTenant
      && (r.domain_id ?? null) === wantDomain);
    if (matches.length !== 1) {
      problems.push(`seed spec: ${matches.length} lifecycle event(s) match the planned '${plan.event}' for slot '${plan.entitySlot}'; exactly one is required`);
      continue;
    }
    const row = matches[0];
    claimedLife.add(row.id);
    if (row.scope !== plan.scope) {
      problems.push(`seed spec: lifecycle event for '${plan.entitySlot}' scope is ${JSON.stringify(row.scope)}; the plan requires ${JSON.stringify(plan.scope)}`);
    }
    if (row.actor !== posture.lifecycleActor) {
      problems.push(`seed spec: lifecycle event for '${plan.entitySlot}' actor is ${JSON.stringify(row.actor)}; the specification requires ${JSON.stringify(posture.lifecycleActor)}`);
    }
    if (stableJson(row.details) !== stableJson(plan.details)) {
      problems.push(`seed spec: lifecycle event for '${plan.entitySlot}' details ${JSON.stringify(row.details)} are not the planned ${JSON.stringify(plan.details)}`);
    }
  }
  for (const r of lifeRows) {
    if (!claimedLife.has(r.id)) problems.push(`seed spec: tenancy lifecycle event ${r.id} (${r.event}) matches no planned entity`);
  }
  // ── CAPABILITIES: the exact minted multiset. ───────────────────────────────────────
  const issuedRows = rows('ctx.issued');
  const issuedTally = new Map();
  for (const r of issuedRows) {
    const key = `${r.op_class}|${r.bound_action}`;
    issuedTally.set(key, (issuedTally.get(key) ?? 0) + 1);
    if ((r.consumed_at ?? null) !== null) {
      problems.push(`seed spec: capability ${r.nonce} records a consumption the era ports never stamp`);
    }
    if (r.issued_at === undefined || r.expires_at === undefined || !(new Date(r.issued_at) < new Date(r.expires_at))) {
      problems.push(`seed spec: capability ${r.nonce} has no valid issue/expiry ordering`);
    }
  }
  for (const cap of spec.capabilities) {
    const key = `${cap.op_class}|${cap.bound_action}`;
    const have = issuedTally.get(key) ?? 0;
    if (have !== cap.count) {
      problems.push(`seed spec: ${have} capability row(s) for ${JSON.stringify(key)}; the plan mints exactly ${cap.count}`);
    }
    issuedTally.delete(key);
  }
  for (const [key, n] of issuedTally) {
    problems.push(`seed spec: ${n} capability row(s) for ${JSON.stringify(key)}, which the capability plan does not mint`);
  }
  // ── REFRESH TOKENS: one per session, generation 1, hash- and family-linked. ─────────
  const tokenRows = rows('identity.refresh_tokens');
  if (tokenRows.length !== spec.sessions.length) {
    problems.push(`seed spec: ${tokenRows.length} refresh token(s); the seed issues exactly ${spec.sessions.length}`);
  }
  for (const [field, want] of Object.entries(posture.refreshToken)) {
    for (const t of tokenRows) {
      if ((t[field] ?? null) !== want) {
        problems.push(`seed spec: refresh token ${t.id} ${field} is ${JSON.stringify(t[field])}; the specification requires ${JSON.stringify(want)}`);
      }
    }
  }

  // ── SESSIONS: ownership by principal slot. ──────────────────────────────────────────
  const sessionRows = rows('identity.sessions');
  const claimedSessions = new Set();
  for (const sess of spec.sessions) {
    const owner = slots.principal.get(sess.principalSlot) ?? null;
    const candidates = sessionRows.filter((r) => r.principal_id === owner && !claimedSessions.has(r.id));
    if (candidates.length !== 1) {
      problems.push(`seed spec: ${candidates.length} unclaimed session(s) belong to principal slot '${sess.principalSlot}' for session slot '${sess.slot}'; exactly one is required`);
      continue;
    }
    const row = candidates[0];
    claimedSessions.add(row.id);
    slots.session.set(sess.slot, row.id);
    for (const [field, want] of Object.entries(spec.basePosture.session)) {
      if ((row[field] ?? null) !== want) {
        problems.push(`seed spec: session slot '${sess.slot}' ${field} is ${JSON.stringify(row[field])}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    if (!(new Date(row.issued_at) < new Date(row.expires_at))) {
      problems.push(`seed spec: session slot '${sess.slot}' does not expire after it was issued`);
    }
    for (const f of ['refresh_token_hash', 'context_key_hash']) {
      if (typeof row[f] !== 'string' || !/^[0-9a-f]{64}$/.test(row[f])) {
        problems.push(`seed spec: session slot '${sess.slot}' ${f} is not a sha-256 digest`);
      }
    }
    // The session's bound epoch must track its OWNER's revocation epoch.
    const ownerRow = rows('identity.principals').find((r) => r.id === owner);
    if (ownerRow !== undefined && Number.isInteger(row.bound_epoch) && Number.isInteger(ownerRow.revocation_epoch)
      && row.bound_epoch < ownerRow.revocation_epoch) {
      problems.push(`seed spec: session slot '${sess.slot}' bound_epoch ${row.bound_epoch} predates its owner's revocation epoch ${ownerRow.revocation_epoch}`);
    }
    // Its refresh token is the one bound to this session and family, by hash.
    const tokens = rows('identity.refresh_tokens').filter((t) => t.session_id === row.id);
    if (tokens.length !== 1) {
      problems.push(`seed spec: session slot '${sess.slot}' has ${tokens.length} refresh token(s); exactly one is required`);
    } else {
      if (tokens[0].family_id !== row.family_id) {
        problems.push(`seed spec: session slot '${sess.slot}' refresh token belongs to a different family`);
      }
      if (tokens[0].token_hash !== row.refresh_token_hash) {
        problems.push(`seed spec: session slot '${sess.slot}' refresh token hash does not match the session's`);
      }
    }
  }
  for (const r of sessionRows) {
    if (!claimedSessions.has(r.id)) problems.push(`seed spec: session ${r.id} matches no source-owned session slot`);
  }
  // ── CANONICAL OBJECTS: resolved by SEMANTIC IDENTITY (the specified subject), with the
  // complete deterministic header, the exact payload and a recomputed production content
  // digest. dccfcf26 selected by tenancy+type and took the first unclaimed row, so a renamed
  // subject with a consistently derived object value and a correctly recomputed digest passed.
  const objectRows = rows('objects.canonical_objects');
  const claimedObjects = new Set();
  for (const o of spec.objects) {
    const wantPayload = seedObjectPayload(o);
    const row = resolveOne('canonical object', o.slot, objectRows,
      (r) => stableJson(r.payload) === stableJson(wantPayload),
      `payload subject ${JSON.stringify(o.subject)}`);
    if (row === null) continue;
    claimedObjects.add(row.object_id);
    slots.object.set(o.slot, row.object_id);
    const wantTenant = slots.tenant.get(o.tenantSlot) ?? null;
    const wantDomain = slots.domain.get(o.domainSlot) ?? null;
    // The complete deterministic header, rebuilt from the specification.
    const wantHeader = seedObjectHeader({
      objectId: row.object_id, tenantId: wantTenant, domainId: wantDomain,
      correlation: row.audit_correlation_id, spec: o,
    });
    for (const [field, want] of Object.entries(wantHeader)) {
      if (field === 'audit_correlation_id') continue; // generated; bound through audit below
      const actual = row[field];
      const same = (field === 'object_version')
        ? String(actual) === String(want)
        : (typeof want === 'object' && want !== null
          ? stableJson(actual) === stableJson(want)
          : normalizeTimestamp(actual) === normalizeTimestamp(want));
      if (!same) {
        problems.push(`seed spec: object slot '${o.slot}' header field '${field}' is ${JSON.stringify(actual)}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    if (typeof row.audit_correlation_id !== 'string' || !UUID_RE.test(row.audit_correlation_id)) {
      problems.push(`seed spec: object slot '${o.slot}' carries no generated audit correlation`);
    }
    // The production content digest, recomputed over the authenticated header and payload.
    if (headerDigest !== null) {
      let recomputed = null;
      try { recomputed = headerDigest(wantHeader, wantPayload); } catch (err) {
        problems.push(`seed spec: object slot '${o.slot}' content digest could not be recomputed: ${err instanceof Error ? err.message : err}`);
      }
      if (recomputed !== null && row.content_digest !== recomputed) {
        problems.push(`seed spec: object slot '${o.slot}' content_digest ${JSON.stringify(row.content_digest)} does not recompute under the production canonicalizer over its specified header and payload`);
      }
    }
  }
  for (const r of objectRows) {
    if (!claimedObjects.has(r.object_id)) problems.push(`seed spec: canonical object ${r.object_id} matches no source-owned object slot`);
  }
  // ── OUTBOX: event type, terminal status and topology. ───────────────────────────────
  const outboxRows = rows('objects.object_outbox');
  const claimedOutbox = new Set();
  for (const o of spec.outbox) {
    const row = resolveOne('outbox', o.slot, outboxRows, (r) => r.event_type === o.eventType,
      `event_type ${JSON.stringify(o.eventType)}`);
    if (row === null) continue;
    claimedOutbox.add(row.id);
    slots.outbox.set(o.slot, row.id);
    for (const [field, actual, want] of [
      ['status', row.status, o.status], ['scope', row.scope, o.scope],
      ['tenant_id', row.tenant_id ?? null, slots.tenant.get(o.tenantSlot) ?? null],
      ['domain_id', row.domain_id ?? null, slots.domain.get(o.domainSlot) ?? null],
      ['attempts', row.attempts, o.attempts],
    ]) {
      if (actual !== want) {
        problems.push(`seed spec: outbox slot '${o.slot}' ${field} is ${JSON.stringify(actual)}; the specification requires ${JSON.stringify(want)}`);
      }
    }
    // The DETERMINISTIC payload, exactly.
    const wantOutboxPayload = seedOutboxPayload(o);
    if (stableJson(row.payload) !== stableJson(wantOutboxPayload)) {
      problems.push(`seed spec: outbox slot '${o.slot}' payload ${JSON.stringify(row.payload)} is not the specification's ${JSON.stringify(wantOutboxPayload)}`);
    }
    // LIFECYCLE: a published effect carries a publication time and holds no lease; the
    // pending-after-lease effect holds its lease and has never been published.
    if (o.lifecycle === 'published') {
      if (row.published_at === null || row.published_at === undefined) {
        problems.push(`seed spec: outbox slot '${o.slot}' is published but carries no published_at`);
      }
      if ((row.lease_id ?? null) !== null || (row.leased_until ?? null) !== null) {
        problems.push(`seed spec: outbox slot '${o.slot}' is published but still holds a lease`);
      }
    } else if (o.lifecycle === 'pending-after-lease') {
      if ((row.published_at ?? null) !== null) {
        problems.push(`seed spec: outbox slot '${o.slot}' is pending but carries a published_at`);
      }
      if (typeof row.lease_id !== 'string' || !UUID_RE.test(row.lease_id)) {
        problems.push(`seed spec: outbox slot '${o.slot}' is pending-after-lease but holds no lease id`);
      }
      if (row.leased_until === null || row.leased_until === undefined) {
        problems.push(`seed spec: outbox slot '${o.slot}' is pending-after-lease but carries no lease expiry`);
      }
    }
    for (const f of ['correlation_id', 'causation_id']) {
      if (typeof row[f] !== 'string' || !UUID_RE.test(row[f])) {
        problems.push(`seed spec: outbox slot '${o.slot}' ${f} is not a generated identifier`);
      }
    }
  }
  for (const r of outboxRows) {
    if (!claimedOutbox.has(r.id)) problems.push(`seed spec: outbox event ${r.id} matches no source-owned outbox slot`);
  }
  // ── GOVERNED OPERATIONS: every seeded decision and its audit closure, authenticated
  // individually against the source-owned operation plan. dccfcf26 compared only an aggregate
  // (action, consequence, object_type) multiset, so a decision flipped from allow to deny — or
  // re-scoped, re-tenanted or detached from its audit event — still reconciled. ────────────
  const decisionRows = rows('policy.policy_decisions');
  const auditEvents = before.audit?.events ?? [];
  const claimedDecisions = new Set();
  const claimedAuditEvents = new Set();
  const entitySlotId = (kind, slot) => {
    const map = { tenant: slots.tenant, domain: slots.domain, principal: slots.principal, object: slots.object, outbox: slots.outbox };
    return map[kind]?.get(slot) ?? null;
  };
  for (const op of spec.operations) {
    const entityId = entitySlotId(op.entityKind, op.entitySlot);
    if (entityId === null) continue; // the slot itself failed to resolve; already reported
    const matches = decisionRows.filter((d) => d.object_id === entityId && d.action === op.action);
    if (matches.length !== 1) {
      problems.push(`seed spec: ${matches.length} policy decision(s) name entity slot '${op.entitySlot}' with action ${JSON.stringify(op.action)}; exactly one is required`);
      continue;
    }
    const d = matches[0];
    claimedDecisions.add(d.id);
    const posture = spec.decisionPosture;
    for (const [field, actual, want] of [
      ['decision', d.decision, posture.decision],
      ['evidence_only', d.evidence_only, posture.evidence_only],
      ['revocation_state', d.revocation_state, posture.revocation_state],
      ['purpose_id', d.purpose_id, posture.purpose_id],
      ['reason', d.reason, posture.reason],
      ['bundle_version', d.bundle_version, posture.bundle_version],
      ['delegation_id', d.delegation_id ?? null, posture.delegation_id],
      ['exception_ref', d.exception_ref ?? null, posture.exception_ref],
      ['expires_at', d.expires_at ?? null, posture.expires_at],
      ['consequence_class', d.consequence_class, op.consequence],
      ['object_type', d.object_type, op.objectType],
      ['scope', d.scope, op.scope],
      ['tenant_id', d.tenant_id ?? null, op.tenantSlot === null ? null : (slots.tenant.get(op.tenantSlot) ?? null)],
      ['domain_id', d.domain_id ?? null, op.domainSlot === null ? null : (slots.domain.get(op.domainSlot) ?? null)],
      ['principal_id', d.principal_id, `principal:${slots.principal.get(op.actorSlot) ?? 'unresolved'}`],
    ]) {
      if (actual !== want) {
        problems.push(`seed spec: the decision for '${op.entitySlot}' (${op.action}) ${field} is ${JSON.stringify(actual)}; the operation plan requires ${JSON.stringify(want)}`);
      }
    }
    if (stableJson(d.obligations) !== stableJson(posture.obligations)) {
      problems.push(`seed spec: the decision for '${op.entitySlot}' carries obligations the operation plan does not`);
    }
    if (stableJson(d.environment) !== stableJson(posture.environment)) {
      problems.push(`seed spec: the decision for '${op.entitySlot}' carries environment the operation plan does not`);
    }
    // The input digest follows a SOURCE-OWNED formula, so it is recomputed rather than trusted.
    const wantDigest = sha256(seedInputDigestSource(op, entityId));
    if (d.input_digest !== wantDigest) {
      problems.push(`seed spec: the decision for '${op.entitySlot}' input_digest does not recompute under the source-owned formula`);
    }
    if (typeof d.correlation_id !== 'string' || !UUID_RE.test(d.correlation_id)) {
      problems.push(`seed spec: the decision for '${op.entitySlot}' carries no generated correlation`);
      continue;
    }
    // ── THE CLOSING AUDIT EVENT: exactly one, bound by decision AND correlation. ──────
    const closers = auditEvents.filter((e) => e.policy_decision_id === d.id);
    if (closers.length !== 1) {
      problems.push(`seed spec: ${closers.length} audit event(s) close the decision for '${op.entitySlot}'; exactly one is required`);
      continue;
    }
    const ev = closers[0];
    claimedAuditEvents.add(`${ev.partition_id}#${ev.audit_seq}`);
    if (ev.correlation_id !== d.correlation_id) {
      problems.push(`seed spec: the audit event closing '${op.entitySlot}' carries a different correlation than its decision`);
    }
    let body = null;
    try { body = JSON.parse(ev.event_jcs); } catch { problems.push(`seed spec: the audit event closing '${op.entitySlot}' is not canonical JSON`); }
    if (body === null) continue;
    const ap = spec.auditPosture;
    for (const [field, actual, want] of [
      ['event_type', body.event_type, op.auditEventType],
      ['action', body.action, op.action],
      ['outcome', body.outcome, ap.outcome],
      ['result_code', body.result_code, ap.result_code],
      ['context_mode', body.context_mode, ap.context_mode],
      ['policy_version', body.policy_version, ap.policy_version],
      ['purpose_id', body.purpose_id, ap.purpose_id],
      ['scope', body.scope, op.scope],
      ['actor', body.actor, `principal:${slots.principal.get(op.actorSlot) ?? 'unresolved'}`],
      ['session_id', body.session_id, slots.session.get(op.sessionSlot) ?? null],
      ['target_type', body.target_type, op.targetType],
      ['target_id', body.target_id, entityId],
      ['target_version', body.target_version ?? null, ap.target_version],
      ['tenant_id', body.tenant_id ?? null, op.tenantSlot === null ? null : (slots.tenant.get(op.tenantSlot) ?? null)],
      ['domain_id', body.domain_id ?? null, op.domainSlot === null ? null : (slots.domain.get(op.domainSlot) ?? null)],
      ['policy_decision_id', body.policy_decision_id, d.id],
      ['causation_id', body.causation_id ?? null, ap.causation_id],
      ['delegation_id', body.delegation_id ?? null, ap.delegation_id],
      ['trace_id', body.trace_id ?? null, ap.trace_id],
      ['request_digest', body.request_digest ?? null, ap.request_digest],
    ]) {
      if (actual !== want) {
        problems.push(`seed spec: the audit event for '${op.entitySlot}' (${op.action}) ${field} is ${JSON.stringify(actual)}; the operation plan requires ${JSON.stringify(want)}`);
      }
    }
    if (stableJson(body.metadata ?? {}) !== stableJson(ap.metadata)) {
      problems.push(`seed spec: the audit event for '${op.entitySlot}' carries metadata the operation plan does not`);
    }
    // ── OBJECT ADMISSION: the object's own audit correlation must be THIS operation's, so
    // the admitting principal and session are proven by authenticated evidence rather than
    // declared. ─────────────────────────────────────────────────────────────────────────
    if (op.entityKind === 'object') {
      const objRow = objectRows.find((r) => r.object_id === entityId);
      if (objRow !== undefined && objRow.audit_correlation_id !== d.correlation_id) {
        problems.push(`seed spec: object slot '${op.entitySlot}' names audit correlation ${JSON.stringify(objRow.audit_correlation_id)}, which is not the correlation of the operation that admitted it`);
      }
    }
  }
  for (const d of decisionRows) {
    if (!claimedDecisions.has(d.id)) {
      problems.push(`seed spec: policy decision ${d.id} (${d.action}) matches no operation in the source-owned plan`);
    }
  }

  // ── THE STANDALONE AUDIT EVENTS: the audited bootstrap and the forced rotation. ─────
  for (const plan of spec.standaloneAuditEvents ?? []) {
    const actor = slots.principal.get(plan.actorSlot) ?? null;
    const matches = auditEvents.filter((e) => {
      let body = null;
      try { body = JSON.parse(e.event_jcs); } catch { return false; }
      return body.event_type === plan.event_type && body.action === plan.action;
    });
    if (matches.length !== 1) {
      problems.push(`seed spec: ${matches.length} audit event(s) match the planned '${plan.slot}' (${plan.action}); exactly one is required`);
      continue;
    }
    const ev = matches[0];
    claimedAuditEvents.add(`${ev.partition_id}#${ev.audit_seq}`);
    if (ev.partition_id !== plan.partition) {
      problems.push(`seed spec: the '${plan.slot}' audit event is in partition ${JSON.stringify(ev.partition_id)}; the plan places it in ${JSON.stringify(plan.partition)}`);
    }
    if ((ev.policy_decision_id ?? null) !== null) {
      problems.push(`seed spec: the '${plan.slot}' audit event references a policy decision; the plan closes no decision`);
    }
    let body = null;
    try { body = JSON.parse(ev.event_jcs); } catch { /* chain rejects */ }
    if (body === null) continue;
    for (const [field, actual, want] of [
      ['scope', body.scope, plan.scope], ['outcome', body.outcome, plan.outcome],
      ['result_code', body.result_code, plan.result_code],
      ['context_mode', body.context_mode, plan.context_mode],
      ['purpose_id', body.purpose_id, plan.purpose_id],
      ['actor', body.actor, `principal:${actor}`],
      ['session_id', body.session_id ?? null, plan.sessionSlot === null ? null : (slots.session.get(plan.sessionSlot) ?? null)],
      ['target_type', body.target_type, plan.target_type],
      ['target_id', body.target_id ?? null, plan.targetIsActor ? actor : null],
      ['tenant_id', body.tenant_id ?? null, null], ['domain_id', body.domain_id ?? null, null],
      ['policy_decision_id', body.policy_decision_id ?? null, null],
    ]) {
      if (actual !== want) {
        problems.push(`seed spec: the '${plan.slot}' audit event ${field} is ${JSON.stringify(actual)}; the plan requires ${JSON.stringify(want)}`);
      }
    }
    if (stableJson(body.metadata ?? {}) !== stableJson(plan.metadata)) {
      problems.push(`seed spec: the '${plan.slot}' audit event metadata is not the planned value`);
    }
  }
  // ── THE EXACT AUDIT WORLD: every planned event resolves once, every delivered event
  // belongs to exactly one plan slot. bfc8695 populated this set and never consumed it, so an
  // entire additional production-valid event reconciled. ───────────────────────────────
  for (const e of auditEvents) {
    if (!claimedAuditEvents.has(`${e.partition_id}#${e.audit_seq}`)) {
      problems.push(`seed spec: audit event ${e.partition_id}#${e.audit_seq} belongs to no planned seed operation or standalone event`);
    }
  }
  if (auditEvents.length !== (spec.auditEventCount ?? auditEvents.length)) {
    problems.push(`seed spec: the seeded audit world holds ${auditEvents.length} event(s); the source-owned plan writes exactly ${spec.auditEventCount}`);
  }
  // Chain heads must derive from that exact event set.
  const headRows = rows('audit.audit_chain_heads');
  const perPartition = new Map();
  for (const e of auditEvents) perPartition.set(e.partition_id, (perPartition.get(e.partition_id) ?? 0) + 1);
  for (const h of headRows) {
    const n = perPartition.get(h.partition_id);
    if (n === undefined) {
      problems.push(`seed spec: chain head '${h.partition_id}' has no planned events`);
      continue;
    }
    if (Number(h.next_seq) !== n + 1) {
      problems.push(`seed spec: chain head '${h.partition_id}' next_seq ${h.next_seq} does not derive from the ${n} planned event(s)`);
    }
  }
  for (const p of perPartition.keys()) {
    if (!headRows.some((h) => h.partition_id === p)) {
      problems.push(`seed spec: audit partition '${p}' has planned events but no chain head`);
    }
  }

  // ── THE SEED RECORD must name the SAME generated identities as the snapshot slots. ──
  const recordSays = [
    ['tenant', spec.tenants, (x) => (seedRecord.tenants ?? []).find((r) => r.name === x.name)?.tenantId, slots.tenant],
    ['domain', spec.domains, (x) => (seedRecord.domains ?? []).find((r) => r.name === x.name)?.domainId, slots.domain],
    ['principal', spec.principals, (x) => (seedRecord.principals ?? []).find((r) => r.loginName === x.loginName)?.principalId, slots.principal],
    ['outbox', spec.outbox, (x) => (seedRecord.outbox ?? []).find((r) => r.eventType === x.eventType)?.eventId, slots.outbox],
  ];
  for (const [kind, list, pick, map] of recordSays) {
    for (const item of list) {
      const recorded = pick(item) ?? null;
      const bound = map.get(item.slot) ?? null;
      if (bound === null) continue; // already reported as unresolvable
      if (recorded !== bound) {
        problems.push(`seed spec: the seed record's ${kind} for slot '${item.slot}' is ${JSON.stringify(recorded)}; the snapshot binds that slot to ${JSON.stringify(bound)}`);
      }
    }
  }
  if ((seedRecord.admin?.principalId ?? null) !== (slots.principal.get(spec.admin.slot) ?? null)
    && slots.principal.has(spec.admin.slot)) {
    problems.push("seed spec: the seed record's admin is not the principal the snapshot binds to the platform-admin slot");
  }
  for (const p of spec.principals) {
    const rec = (seedRecord.principals ?? []).find((r) => r.loginName === p.loginName);
    if (rec === undefined) { problems.push(`seed spec: the seed record has no principal for slot '${p.slot}'`); continue; }
    if (rec.roleCode !== p.role || rec.scope !== p.scope) {
      problems.push(`seed spec: the seed record's principal slot '${p.slot}' claims role/scope ${JSON.stringify([rec.roleCode, rec.scope])}; the specification requires ${JSON.stringify([p.role, p.scope])}`);
    }
  }
  for (const sess of spec.sessions) {
    const bound = slots.session.get(sess.slot) ?? null;
    if (bound === null) continue;
    const rec = (seedRecord.sessions ?? []).find((r) => r.sessionId === bound);
    if (rec === undefined) { problems.push(`seed spec: the seed record does not carry the session bound to slot '${sess.slot}'`); continue; }
    const owner = slots.principal.get(sess.principalSlot) ?? null;
    if (rec.principalId !== owner) {
      problems.push(`seed spec: the seed record's session slot '${sess.slot}' is owned by ${JSON.stringify(rec.principalId)}; the specification assigns it to principal slot '${sess.principalSlot}' (${JSON.stringify(owner)})`);
    }
  }
  for (const o of spec.objects) {
    const bound = slots.object.get(o.slot) ?? null;
    if (bound === null) continue;
    const rec = (seedRecord.objects ?? []).find((r) => r.objectId === bound);
    if (rec === undefined) { problems.push(`seed spec: the seed record does not carry the object bound to slot '${o.slot}'`); continue; }
    if (rec.tenantId !== (slots.tenant.get(o.tenantSlot) ?? null) || rec.domainId !== (slots.domain.get(o.domainSlot) ?? null)) {
      problems.push(`seed spec: the seed record's object slot '${o.slot}' is placed outside the tenancy the specification assigns it`);
    }
  }
  return { slots, problems };
}

/** The identities each governed step must report, resolved through the source-owned slots. */
export function deriveStepIdentitiesFromSlots(slots, spec = C18_SEED_SPEC) {
  const lookup = (slot) => slots.tenant.get(slot) ?? slots.domain.get(slot) ?? slots.principal.get(slot)
    ?? slots.session.get(slot) ?? slots.object.get(slot) ?? slots.outbox.get(slot) ?? null;
  const out = {};
  for (const [step, slotNames] of Object.entries(spec.stepSlots)) {
    out[step] = slotNames.map(lookup).filter((x) => x !== null);
  }
  return out;
}

/**
 * EXACT role-binding reconciliation (C18.1.5). Expected and observed ACTIVE bindings are
 * compared as multisets on the complete relationship tuple — principal, role, scope,
 * tenant/domain attribution and grantor provenance — so a duplicated active tuple is a finding
 * rather than a silent length mismatch. Every revoked row is accounted for: the deterministic
 * governed seed revokes none. Random row ids and timestamps are deliberately NOT part of
 * relationship identity; they are bound elsewhere by preservation and raw reconstruction.
 */
export function reconcileRoleBindings({ seedRecord, bindingRows }) {
  const problems = [];
  // Role bindings: EXACT IN BOTH DIRECTIONS on the COMPLETE RELATIONSHIP TUPLE. 83d158c
  // compared `principal_id|role_code` only, so a binding could be silently re-scoped, moved to
  // another tenant or domain, or re-attributed to a different grantor and still reconcile.
  // C18.1.4 binds scope, tenant/domain attribution and provenance as well.
  const bindingTuple = (b) => [
    b.principal_id, b.role_code, b.scope, b.tenant_id ?? null, b.domain_id ?? null,
    b.granted_by_principal ?? null, b.granted_by_scope ?? null,
  ].map((v) => JSON.stringify(v)).join('|');
  const wantBindings = [
    // The bootstrap admin's own platform grant is self-originated: it predates any grantor.
    bindingTuple({
      principal_id: seedRecord.admin.principalId, role_code: 'platform_admin', scope: 'PLATFORM',
      tenant_id: null, domain_id: null, granted_by_principal: null, granted_by_scope: 'PLATFORM',
    }),
    // Every seeded principal's grant carries that principal's own scope and tenancy, and is
    // attributed to the platform admin that minted it.
    ...seedRecord.principals.map((p) => bindingTuple({
      principal_id: p.principalId, role_code: p.roleCode, scope: p.scope,
      tenant_id: p.tenantId ?? null, domain_id: p.domainId ?? null,
      granted_by_principal: seedRecord.admin.principalId, granted_by_scope: 'PLATFORM',
    })),
  ].sort();
  const activeRows = bindingRows.filter((b) => (b.revoked_at ?? null) === null);
  const haveBindings = activeRows.map(bindingTuple).sort();
  // EXACT MULTISET comparison, multiplicity preserved. 7be02b8 compared sorted arrays but
  // reported differences with set semantics, so a DUPLICATE active tuple produced a mismatch
  // with no diagnostic — and therefore no recorded problem at all.
  const tally = (list) => {
    const m = new Map();
    for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const haveCount = tally(haveBindings);
  const wantCount = tally(wantBindings);
  for (const [tuple, n] of haveCount) {
    const want = wantCount.get(tuple) ?? 0;
    if (n > want) {
      problems.push(want === 0
        ? `the snapshot carries live role binding ${tuple}, which the seed record does not account for`
        : `the snapshot carries ${n} copies of live role binding ${tuple}; the seed record accounts for ${want} — a DUPLICATE active relationship tuple`);
    }
  }
  for (const [tuple, n] of wantCount) {
    const have = haveCount.get(tuple) ?? 0;
    if (have < n) {
      problems.push(`seed record requires ${n} live role binding(s) ${tuple}; the snapshot carries ${have}`);
    }
  }
  // EVERY revoked row must be accounted for. The deterministic seed revokes nothing, so any
  // revoked binding is unexplained evidence rather than something to silently filter away.
  const revoked = bindingRows.filter((b) => (b.revoked_at ?? null) !== null);
  if (revoked.length !== 0) {
    for (const b of revoked) {
      problems.push(`the snapshot carries a REVOKED role binding ${bindingTuple(b)} (revoked_at ${JSON.stringify(b.revoked_at)}); the deterministic governed seed revokes none`);
    }
  }
  return problems;
}

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
  // C18.1.4 — UNIQUENESS FIRST. A duplicated entry makes a multiset look like a set, so every
  // bidirectional comparison below would silently tolerate it.
  const idField = {
    tenants: 'tenantId', domains: 'domainId', principals: 'principalId',
    sessions: 'sessionId', objects: 'objectId', outbox: 'eventId',
  };
  for (const [field, key] of Object.entries(idField)) {
    const arr = Array.isArray(seedRecord[field]) ? seedRecord[field] : [];
    const ids = arr.map((e) => e?.[key]);
    if (new Set(ids).size !== ids.length) {
      problems.push(`seed record ${field} contains DUPLICATE ${key} entries`);
    }
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
  const refreshRows = rowsOf(before, 'identity.refresh_tokens');
  for (const s of seedRecord.sessions) {
    const row = rowBy(sessionRows, s.sessionId);
    if (row === undefined) continue;
    if (row.principal_id !== s.principalId) {
      problems.push(`seed record session ${s.sessionId} principal relationship differs from the snapshot`);
    }
    // C18.1.3 — the recorded refresh-token FAMILY is a real relationship, not decoration.
    if (row.family_id !== s.familyId) {
      problems.push(`seed record session ${s.sessionId} familyId ${JSON.stringify(s.familyId)} differs from the snapshot family ${JSON.stringify(row.family_id)}`);
    }
    for (const rt of refreshRows.filter((r) => r.session_id === s.sessionId)) {
      if (rt.family_id !== s.familyId) {
        problems.push(`refresh token ${rt.id} of session ${s.sessionId} carries family ${rt.family_id}, not the recorded ${s.familyId}`);
      }
    }
  }
  const objectRows = rowsOf(before, 'objects.canonical_objects');
  bindSet('object', seedRecord.objects.map((o) => o.objectId), objectRows.map((r) => r.object_id));
  const auditCorrelations = new Set(before.audit.events.map((e) => e.correlation_id).filter(Boolean));
  for (const o of seedRecord.objects) {
    const row = objectRows.find((r) => r.object_id === o.objectId);
    if (row === undefined) continue;
    if (row.tenant_id !== o.tenantId || row.domain_id !== o.domainId) {
      problems.push(`seed record object ${o.objectId} tenancy differs from the snapshot`);
    }
    // C18.1.3 — the recorded correlation must BE the object's own authenticated audit
    // correlation, not merely some correlation that exists somewhere in the world.
    if (row.audit_correlation_id !== o.correlation) {
      problems.push(`seed record object ${o.objectId} correlation ${JSON.stringify(o.correlation)} differs from the canonical object's audit correlation ${JSON.stringify(row.audit_correlation_id)}`);
    }
    if (!auditCorrelations.has(o.correlation)) {
      problems.push(`seed record object ${o.objectId} correlation ${o.correlation} has no authenticated audit event`);
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
  // Correlations: EXACT IN BOTH DIRECTIONS. 15e8239 required only that every observed
  // correlation was recorded, so an attacker could pad the record with unused UUIDs.
  const correlations = new Set(seedRecord.correlations);
  const observedCorrelations = new Set([
    ...rowsOf(before, 'policy.policy_decisions').map((d) => d.correlation_id),
    ...before.audit.events.map((e) => e.correlation_id),
    ...rowsOf(before, 'objects.object_outbox').map((o) => o.correlation_id),
    ...objectRows.map((o) => o.audit_correlation_id),
  ].filter((c) => c !== null && c !== undefined));
  for (const c of observedCorrelations) {
    if (!correlations.has(c)) problems.push(`the snapshot carries correlation ${c}, which the seed record does not account for`);
  }
  // A session's identity-op capability legitimately leaves no row behind, so its correlation is
  // ATTRIBUTED to the session that used it. Everything else must be observable, and a recorded
  // correlation belonging to neither set is padding.
  const sessionCorrelations = new Set(seedRecord.sessions.map((s) => s.correlation));
  for (const c of correlations) {
    if (!observedCorrelations.has(c) && !sessionCorrelations.has(c)) {
      problems.push(`seed record correlation ${c} appears NOWHERE in the seeded world and belongs to no recorded session — an unused recorded correlation`);
    }
  }
  for (const s of seedRecord.sessions) {
    if (!correlations.has(s.correlation)) {
      problems.push(`seed record session ${s.sessionId} names correlation ${s.correlation}, which the recorded correlation set omits`);
    }
  }
  if (new Set(seedRecord.sessions.map((s) => s.correlation)).size !== seedRecord.sessions.length) {
    problems.push('two seeded sessions share one identity-op correlation');
  }
  problems.push(...reconcileRoleBindings({ seedRecord, bindingRows }));

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
    // C18 IS FROZEN AT 0021 AND THIS COMMAND IS ITS ERA'S MANIFEST.
    //
    // Both paths are migrated to LATEST_LAST = '0021'. Phase 1 added migration 0022,
    // and the suites that need it — observation schema, collection_manager and
    // collection_agent roles — cannot pass against an 0021 database BY CONSTRUCTION.
    // Running them here would not test C18; it would only assert that a migration C18
    // deliberately does not apply has not been applied.
    //
    // So the command names the Phase 0 / C18-era manifest explicitly. `expected_tests`
    // below is unchanged at 297 — it always meant this set, and this scoping restores
    // that meaning rather than altering the criterion. Nothing else about C18 moves:
    // not the ceiling, not the table universe, not the catalog contract, not the
    // criteria. Migration 0022's own upgrade proof lives outside this gate, in
    // scripts/phase1/verify-0022-upgrade.mjs.
    command: ['pnpm', '--filter', '@eye/api', 'test:int:c18era'],
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
/** Which isolated instance a receipt's declared path names. */
export const SUITE_PATH_LETTER = Object.freeze({
  'path-a-upgraded': 'a', 'instance-a-server': 'a', 'path-b-virgin': 'b', 'instance-b-server': 'b',
});

export function verifySuiteReceipts(matrix, receipts, { readFile = null, commands = null, instances = null } = {}) {
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
    // C18.1.3 — a receipt may not BORROW another command's streams. The three files must be
    // exactly this command's own raw receipts, and their lengths and digests must equal the
    // command-ledger record's, so swapping Path-A and Path-B output (both '297 passed') fails.
    for (const [f, ext] of [['stdout_file', 'stdout'], ['stderr_file', 'stderr'], ['exit_file', 'exit']]) {
      const want = `raw/${r.command_id}.${ext}.txt`;
      if (r[f] !== want) {
        problems.push(`receipt ${tuple} ${f} ${JSON.stringify(r[f])} is not its own command's stream ${JSON.stringify(want)}`);
      }
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
        for (const s of ['stdout', 'stderr']) {
          if (cmd[`${s}_bytes`] !== r[`${s}_bytes`] || cmd[`${s}_sha256`] !== r[`${s}_sha256`]) {
            problems.push(`receipt ${tuple} ${s} length/digest disagrees with its command-ledger record`);
          }
        }
        if (cmd.cwd !== '.') problems.push(`receipt ${tuple} command ran in ${JSON.stringify(cmd.cwd)}, not the repository root`);
        // The command's environment must be EXACTLY the instance the receipt claims.
        if (instances !== null) {
          const letter = SUITE_PATH_LETTER[r.path];
          const inst = letter === undefined ? undefined : instances[letter];
          if (inst === undefined) problems.push(`receipt ${tuple} declares a path with no isolated instance`);
          else {
            const want = expectedInstanceEnv(letter, inst, { NO_COLOR: '1', FORCE_COLOR: '0' });
            const got = cmd.env ?? {};
            const wrong = Object.keys(want).filter((k) => got[k] !== want[k]);
            const extra = Object.keys(got).filter((k) => !(k in want));
            if (wrong.length > 0 || extra.length > 0) {
              problems.push(`receipt ${tuple} command environment is not the ${inst.path} instance binding (${[...wrong, ...extra.map((k) => `unexpected ${k}`)].slice(0, 4).join(', ')})`);
            }
          }
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
  'path', 'gate_resource_id',
  'container_id', 'container_name', 'redis_container_id', 'redis_container',
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
  // ONE gate run, ONE resource owner. Two ids would mean two cleanup domains for a single run, and
  // a sweep for either would leave the other path's containers stranded.
  if (receiptA?.gate_resource_id !== receiptB?.gate_resource_id) {
    problems.push('isolation: the two paths record different gate_resource_id values '
      + `(${JSON.stringify(receiptA?.gate_resource_id)} and ${JSON.stringify(receiptB?.gate_resource_id)}); `
      + 'one run must have exactly one cleanup owner');
  }
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
    if (typeof r?.gate_resource_id !== 'string' || !/^[0-9a-f]{6,64}$/.test(r.gate_resource_id)) {
      problems.push(`path-${tag.toLowerCase()} gate_resource_id ${JSON.stringify(r?.gate_resource_id)} `
        + 'is not a resource identity; a resource with no owner has nothing to clean it up');
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
  // C19 — the LENGTH of a stdin-delivered secret, never its content. A command that received one
  // is distinguishable from one that did not, without the ledger carrying the value.
  'stdin_bytes', 'stdin_class',
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
  migration_executions: (v) => Array.isArray(v),
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
