/**
 * C18 — THE CODE-OWNED CONTRACT for dual-path database-history proof.
 *
 * Written BEFORE the runner (the process agreed after Phase 0's earlier correction cycles):
 * this module states WHAT C18 must prove and HOW a failure must be detectable, so the runner
 * and its verifier are both judged against expectations that neither of them produced.
 *
 * Two supported histories:
 *   PATH A (rebuild-forward): an isolated database receives the historical migrations
 *     0001–0012 exactly, is seeded ONLY through the historically valid governed ports
 *     (bootstrap claim, identity/session ports, bound-context capability minters, tenancy and
 *     policy and audit and object admission ports — never direct DML), is snapshotted, then
 *     receives the unchanged 0013–0021 and is snapshotted again. Preservation and every
 *     INTENTIONAL transformation are proved against this contract.
 *   PATH B (virgin latest): a separate isolated database receives 0001–0021 directly, and the
 *     latest schema, role posture, privileges and behavioral suites are proved independently.
 *
 * The two paths NEVER share a server, a database, a volume or a credential.
 */

/** Boundary between the historical base and the upgrade — a validated input, not a hardcode. */
export const HISTORICAL_LAST = '0012';
export const LATEST_LAST = '0021';
export const MIGRATION_COUNT_HISTORICAL = 12;
export const MIGRATION_COUNT_LATEST = 21;

/**
 * WHICH suites run WHERE — the honest execution matrix. `once_only` states, in code, the
 * suites that deliberately do NOT run per-path and why, so absence cannot read as coverage.
 */
export const SUITE_MATRIX = Object.freeze({
  acceptance: Object.freeze({
    command: ['pnpm', '--filter', '@eye/api', 'test:accept'],
    runs_on: Object.freeze(['path-a-upgraded', 'path-b-virgin']),
    reason: 'the acceptance criteria must hold against BOTH isolated instances. The suite '
      + 'provisions its own pristine per-run database on the target server by its deterministic-'
      + 'isolation design; the upgraded-DATA behavioural proof is carried by the integration '
      + 'suite plus the snapshot preservation contract, and this matrix says so honestly.',
  }),
  integration: Object.freeze({
    command: ['pnpm', '--filter', '@eye/api', 'test:int'],
    runs_on: Object.freeze(['path-a-upgraded', 'path-b-virgin']),
    reason: 'privilege, isolation, audit-chain and outbox behaviour run DIRECTLY against each '
      + "path's own database — the upgraded seeded database on Path A, the virgin one on Path B",
  }),
  'unit-gate-hermetic': Object.freeze({
    command: null,
    runs_on: Object.freeze(['once-only']),
    reason: 'hermetic by design — reads no database; runs once in CI build-test',
  }),
  'browser-regression': Object.freeze({
    command: null,
    runs_on: Object.freeze(['once-only']),
    reason: 'runs once in its own CI job on a virgin compose database (Path-B-equivalent); '
      + 'duplicating a full browser build per path would prove nothing the API suites do not',
  }),
});

/** Schemas whose complete row state is snapshotted (ordered, digested). */
export const SNAPSHOT_SCHEMAS = Object.freeze([
  'tenancy', 'identity', 'policy', 'audit', 'objects', 'ctx', 'config',
]);

/**
 * INTENTIONAL Path-A transformations, discovered by executing 0013–0021 and then PINNED here.
 * Anything not allow-listed is a violation. Shapes:
 *   { kind: 'table_added',   table: 'schema.name' }               — new table, pre rows unaffected
 *   { kind: 'column_added',  table: 'schema.name', column: 'c' }  — new column on existing rows
 *   { kind: 'rows_added',    table: 'schema.name' }               — migration-inserted rows
 *                                                                   (pre-existing rows preserved)
 *   { kind: 'rows_rewritten', table: 'schema.name', columns: [..] } — governed in-place rewrite
 * The list is deliberately empty of 'rows_rewritten': 0013–0021 add authority surface; they do
 * not rewrite pre-existing business or evidence rows. If executing them proves otherwise, the
 * discovery FAILS the run until the transformation is reviewed and pinned explicitly.
 */
export const ALLOWED_TRANSFORMS = Object.freeze([
  // 0013_operation_closure: the operation ledger that binds effects to decisions and audit.
  { kind: 'table_added', table: 'ctx.operation' },
  { kind: 'table_added', table: 'ctx.operation_effect' },
  // 0016_bootstrap_claim_binding: the claim gains nonce/consumption binding columns.
  { kind: 'column_added', table: 'identity.bootstrap_claim', column: 'nonce' },
  { kind: 'column_added', table: 'identity.bootstrap_claim', column: 'consumed' },
  { kind: 'column_added', table: 'identity.bootstrap_claim', column: 'consumed_at' },
]);

const num = (name) => Number.parseInt(name.slice(0, 4), 10);

/** Sort + validate a migration file list: NNNN_*.sql, strictly increasing from 0001, no gaps. */
export function orderedMigrations(files) {
  const sqls = [...files].filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const problems = [];
  sqls.forEach((f, i) => {
    if (num(f) !== i + 1) problems.push(`migration sequence broken at '${f}' (expected ${String(i + 1).padStart(4, '0')})`);
  });
  return { files: sqls, problems };
}

/**
 * The migration LEDGER contract: filenames, order, digests and (for the post-upgrade ledger)
 * byte-stability of the historical prefix.
 *   trackedDigests : Map<filename, sha256> derived from the checkout under verification
 *   ledger         : rows of public.schema_migrations [{ filename, digest, applied_at }]
 *   expectLast     : '0012' | '0021'
 *   priorLedger    : optional pre-upgrade ledger; every row must survive BYTE-IDENTICAL
 */
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

const rowKey = (row, pk) => JSON.stringify(pk.map((c) => row[c]));

/**
 * PRESERVATION + INTENTIONAL TRANSFORMATION across the Path-A upgrade.
 * `before`/`after` are snapshots: { tables: { 'schema.table': { pk: [..], columns: [..],
 * rows: [..] } }, fks: [{ constraint, from, to, pairs_digest, pairs_count }] }.
 */
export function compareSnapshots(before, after, allowed = ALLOWED_TRANSFORMS) {
  const problems = [];
  const allowedTables = new Set(allowed.filter((a) => a.kind === 'table_added').map((a) => a.table));
  const allowedNewRows = new Set(allowed.filter((a) => a.kind === 'rows_added').map((a) => a.table));
  const allowedColumns = new Map();
  for (const a of allowed) {
    if (a.kind === 'column_added') {
      if (!allowedColumns.has(a.table)) allowedColumns.set(a.table, new Set());
      allowedColumns.get(a.table).add(a.column);
    }
  }

  for (const [table, b] of Object.entries(before.tables)) {
    const a = after.tables[table];
    if (a === undefined) { problems.push(`table '${table}' DISAPPEARED across the upgrade`); continue; }
    // Columns: every pre-upgrade column survives; additions must be allow-listed.
    for (const c of b.columns) if (!a.columns.includes(c)) problems.push(`column '${table}.${c}' DISAPPEARED across the upgrade`);
    for (const c of a.columns) {
      if (!b.columns.includes(c) && !(allowedColumns.get(table)?.has(c))) {
        problems.push(`column '${table}.${c}' appeared without being an allow-listed intentional transform`);
      }
    }
    // Identities and exact values: every pre row exists post with identical pre-era values.
    const afterByKey = new Map(a.rows.map((r) => [rowKey(r, b.pk), r]));
    for (const r of b.rows) {
      const now = afterByKey.get(rowKey(r, b.pk));
      if (now === undefined) { problems.push(`row ${rowKey(r, b.pk)} of '${table}' was LOST across the upgrade`); continue; }
      for (const c of b.columns) {
        if (JSON.stringify(now[c]) !== JSON.stringify(r[c])) {
          problems.push(`'${table}' row ${rowKey(r, b.pk)} column '${c}' changed across the upgrade`);
        }
      }
    }
    // Cardinality: growth only via allow-listed migration-inserted rows.
    if (a.rows.length !== b.rows.length && !allowedNewRows.has(table)) {
      problems.push(`'${table}' cardinality changed ${b.rows.length} -> ${a.rows.length} without an allow-listed reason`);
    }
  }
  for (const table of Object.keys(after.tables)) {
    if (!(table in before.tables) && !allowedTables.has(table)) {
      problems.push(`table '${table}' appeared without being an allow-listed intentional transform`);
    }
  }
  // Relationships: every pre-upgrade FK pair-set must survive exactly.
  const afterFks = new Map(after.fks.map((f) => [f.constraint, f]));
  for (const f of before.fks) {
    const now = afterFks.get(f.constraint);
    if (now === undefined) { problems.push(`FK '${f.constraint}' DISAPPEARED across the upgrade`); continue; }
    if (now.pairs_count !== f.pairs_count || now.pairs_digest !== f.pairs_digest) {
      problems.push(`FK '${f.constraint}' resolved pair-set changed across the upgrade`);
    }
  }
  return problems;
}

/**
 * AUDIT chain integrity from raw snapshot rows: per-partition seq continuity from 1, hash
 * linkage (each row's prev_hash equals the previous row_hash), head agreement, and — across an
 * upgrade — byte-identity of every pre-upgrade row's canonical form and hash.
 */
export const GENESIS_HASH = '0'.repeat(64);

export function verifyChainRows({ events, heads, priorEvents = null }) {
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
    });
    const head = heads.find((h) => h.partition_id === partition);
    if (head === undefined) problems.push(`audit partition '${partition}' has no chain head`);
    else if (Number(head.next_seq) !== rows.length + 1 || head.head_hash !== rows[rows.length - 1].row_hash) {
      problems.push(`audit partition '${partition}' head (next_seq ${head.next_seq}) disagrees with the ledger (${rows.length} rows)`);
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
 * POLICY → OPERATION → EFFECT linkage from raw snapshot rows: every audit event that names a
 * policy decision must resolve it; every outbox effect row must carry a correlation that at
 * least one audit event shares (the operation that produced it).
 */
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
 * ROLE / PRIVILEGE / CATALOG POSTURE equivalence. Normalized postures from two databases must
 * be IDENTICAL: Path-A-upgraded vs Path-B-virgin proves the upgrade converges on exactly the
 * schema authority a fresh install has. Postures include role login/attrs, memberships, table
 * grants, routine grants, RLS (enabled+forced+policies), and column shapes.
 */
export function comparePosture(a, b, labels = ['path-a-upgraded', 'path-b-virgin']) {
  const problems = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = JSON.stringify(a[k] ?? null);
    const bv = JSON.stringify(b[k] ?? null);
    if (av !== bv) problems.push(`catalog posture '${k}' differs between ${labels[0]} and ${labels[1]}`);
  }
  return problems;
}

/** Suite receipts: the matrix must be exactly satisfied — no missing, no failing, no extras. */
export function verifySuiteReceipts(matrix, receipts) {
  const problems = [];
  for (const [suite, spec] of Object.entries(matrix)) {
    for (const where of spec.runs_on) {
      if (where === 'once-only') continue;
      const r = receipts.find((x) => x.suite === suite && x.path === where);
      if (r === undefined) { problems.push(`suite '${suite}' has no receipt for ${where}`); continue; }
      if (r.exit_status !== 0) problems.push(`suite '${suite}' on ${where} recorded exit ${r.exit_status}`);
      if (typeof r.stdout_file !== 'string' || typeof r.stderr_file !== 'string') {
        problems.push(`suite '${suite}' on ${where} lacks raw output evidence`);
      }
    }
  }
  for (const r of receipts) {
    const spec = matrix[r.suite];
    if (spec === undefined || !spec.runs_on.includes(r.path)) {
      problems.push(`receipt for suite '${r.suite}' on '${r.path}' is not in the code-owned matrix`);
    }
  }
  return problems;
}

/** The two paths must be credential- and instance-disjoint. */
export function verifyIsolation(receiptA, receiptB) {
  const problems = [];
  if (receiptA.container_name === receiptB.container_name) problems.push('paths shared a container');
  if (receiptA.port === receiptB.port) problems.push('paths shared a database port');
  if (receiptA.database === receiptB.database) problems.push('paths shared a database name');
  for (const k of Object.keys(receiptA.credential_digests ?? {})) {
    if (receiptA.credential_digests[k] === receiptB.credential_digests?.[k]) {
      problems.push(`paths shared the '${k}' credential`);
    }
  }
  return problems;
}
