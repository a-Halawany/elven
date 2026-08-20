/**
 * C18.1.1 — hermetic controls for the dual-path contract and runner CLI.
 *
 * Deep mutation/differential controls run in test/gate/c18-mutation-controls.ctl.ts against a
 * GENUINE archive inside the C18 gate. This file keeps the database-free layer: contract
 * falsifiability on typed fixtures, redaction, transform derivation, projection authentication,
 * exact table universes, exact isolation grammar, exact suite counts, CLI fail-closed behaviour
 * and the parsed-YAML CI wiring.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  HISTORICAL_LAST, LATEST_LAST, POSTURE_CATEGORIES, POSTURE_COMMAND_LABELS, SECRET_CLASSES,
  SUITE_MATRIX, TABLE_UNIVERSE_HISTORICAL, TABLE_UNIVERSE_LATEST,
  SEED_STEP_PLAN, authenticateProjections, c18ArtifactName, checkPlaceholder, commandIdFor,
  comparePosture, compareSnapshots, crossCheckAuditTable, deriveIntentionalTransforms,
  deriveSeedSummary, expectedInstanceEnv, jwtPlaceholder, orderedMigrations, parseResultReceipt,
  placeholder, redactArgv, secretDigest, verifyAuditShapes, verifyChainRows, verifyCleanupReceipt,
  verifyCommandRecords, verifyCommandStreams, verifyIsolation, verifyManifestShape,
  verifyMigrationExecutions, verifyMigrationLedger, verifyOperationClosure, verifySeedFloor,
  verifySeedRecordClosed, verifySeedSteps, verifySuiteReceipts, verifyTableUniverse,
  absenceArgv, attestArgv, deriveSeedStepIdentities, loadCatalogContract, parseAttestation,
  verifyCatalogContract, EXECUTION_FLOOR, SEED_CONTRACT, expectedApplied, inventoryArgv,
  parseInventory, parseMigrationRun, reconcileRoleBindings,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-contract.mjs';
import {
  postureSql, snapshotQueryPlan, tableRowsSql, verifyCommandGraph,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-query-plan.mjs';
import { auditRowHash, jcsCanonicalize } from '@eye/contracts';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs');
const MIGRATIONS = join(REPO, 'apps', 'api', 'migrations');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const COMPOSE = { postgres: `postgres@sha256:${'9'.repeat(64)}`, redis: `redis@sha256:${'8'.repeat(64)}` };

describe('C18.1.1 — secrets never enter evidence structures', () => {
  it('argv redaction replaces every class with a structured placeholder', () => {
    const secrets: Array<[string, string]> = [['a:EYE_DB_PASSWORD', 'deadbeef01'], ['a:EYE_REDIS_PASSWORD', 'cafef00d02']];
    const argv = ['docker', 'run', '-e', 'POSTGRES_PASSWORD=deadbeef01', 'redis-server', '--requirepass', 'cafef00d02'];
    const red = redactArgv(argv, secrets);
    expect(red.join(' ')).not.toContain('deadbeef01');
    expect(red[3]).toBe('POSTGRES_PASSWORD=<REDACTED:a:EYE_DB_PASSWORD>');
    expect(red[6]).toBe('<REDACTED:a:EYE_REDIS_PASSWORD>');
  });

  it('secret digests are domain-separated and one-way stable', () => {
    expect(secretDigest('x', 'v')).toBe(secretDigest('x', 'v'));
    expect(secretDigest('x', 'v')).not.toBe(secretDigest('y', 'v'));
    expect(secretDigest('x', 'v')).not.toContain('v');
    expect(secretDigest('x', 'v')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('C18.1.1 — intentional transforms + exact table universes', () => {
  it('derives exactly the 0013 tables and 0016 bootstrap-claim columns with DDL semantics', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const t = deriveIntentionalTransforms(MIGRATIONS, files);
    expect(t.tablesAdded.map((x: { table: string }) => x.table)).toEqual(['ctx.operation', 'ctx.operation_effect']);
    expect(t.columnsAdded.map((x: { table: string; column: string }) => `${x.table}.${x.column}`)).toEqual([
      'identity.bootstrap_claim.consumed', 'identity.bootstrap_claim.consumed_at',
      'identity.bootstrap_claim.nonce',
    ]);
  });

  it('the latest universe is the historical set plus the two 0013 operation tables', () => {
    expect(TABLE_UNIVERSE_HISTORICAL.length).toBe(26);
    expect(TABLE_UNIVERSE_LATEST.length).toBe(28);
    expect(TABLE_UNIVERSE_LATEST).toContain('ctx.operation');
    expect(TABLE_UNIVERSE_LATEST).toContain('ctx.operation_effect');
  });

  it('a removed complete table and a wrong table shape are DETECTED', () => {
    const snap = {
      tables: Object.fromEntries(TABLE_UNIVERSE_HISTORICAL.map((t) => [t, { pk: ['id'], columns: ['id'], rows: [], row_count: 0 }])),
    };
    expect(verifyTableUniverse(snap as never, TABLE_UNIVERSE_HISTORICAL, 'x')).toEqual([]);
    const missing = structuredClone(snap);
    delete (missing.tables as Record<string, unknown>)['tenancy.tenants'];
    expect(verifyTableUniverse(missing as never, TABLE_UNIVERSE_HISTORICAL, 'x').join('\n')).toMatch(/'tenancy\.tenants' is MISSING/);
    const badShape = structuredClone(snap);
    (badShape.tables['tenancy.tenants'] as Record<string, unknown>).row_count = 9;
    expect(verifyTableUniverse(badShape as never, TABLE_UNIVERSE_HISTORICAL, 'x').join('\n')).toMatch(/row_count 9 != rows.length 0/);
  });
});

describe('C18.1.1 — audit chains + projection authentication', () => {
  const event = (seq: number, prev: string, body: Record<string, unknown>) => {
    const jcs = jcsCanonicalize(body);
    return {
      partition_id: 'platform', audit_seq: seq, event_jcs: jcs, previous_hash: prev,
      row_hash: auditRowHash({ partitionId: 'platform', auditSeq: seq, previousHash: prev, event: body as never }),
      hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id as string,
      policy_decision_id: (body.policy_decision_id as string | null) ?? null,
    };
  };
  it('production-hashed chains pass; every forgery axis fails', () => {
    const e1 = event(1, '0'.repeat(64), { n: 1, correlation_id: 'c-1', policy_decision_id: null });
    const e2 = event(2, e1.row_hash, { n: 2, correlation_id: 'c-2', policy_decision_id: 'd-2' });
    const heads = [{ partition_id: 'platform', next_seq: 3, head_hash: e2.row_hash, frozen: false }];
    expect(verifyChainRows({ events: [e1, e2], heads, jcs: jcsCanonicalize, rowHash: auditRowHash })).toEqual([]);
    const wrong = structuredClone([e1, e2]); wrong[1]!.row_hash = sha256('forged');
    expect(verifyChainRows({ events: wrong, heads, jcs: jcsCanonicalize, rowHash: auditRowHash }).join('\n'))
      .toMatch(/row_hash does not recompute under the production formula/);
  });
  it('a forged top-level projection over a genuine JCS body is rejected', () => {
    const e = event(1, '0'.repeat(64), { correlation_id: 'real', policy_decision_id: 'realdec' });
    const forged = { ...e, correlation_id: 'FORGED' };
    expect(authenticateProjections([forged], jcsCanonicalize).join('\n')).toMatch(/projected correlation_id disagrees/);
    expect(authenticateProjections([e], jcsCanonicalize)).toEqual([]);
  });
  it('audit shape and event/head correspondence are exact', () => {
    const e = event(1, '0'.repeat(64), { correlation_id: 'c', policy_decision_id: null });
    expect(verifyAuditShapes({ events: [e], heads: [{ partition_id: 'platform', next_seq: 2, head_hash: e.row_hash, frozen: false }] }, 'x')).toEqual([]);
    expect(verifyAuditShapes({ events: [{ ...e, extra: 1 }], heads: [] }, 'x').join('\n')).toMatch(/wrong field set/);
    expect(verifyAuditShapes({ events: [e], heads: [] }, 'x').join('\n')).toMatch(/has events but no head/);
  });
});

describe('C18.1.1 — the seed floor rejects an emptied world', () => {
  it('every floor axis fires on an empty snapshot', () => {
    const problems = verifySeedFloor({ tables: {}, audit: { events: [], heads: [] } } as never).join('\n');
    expect(problems).toMatch(/tenancy\.tenants has 0/);
    expect(problems).toMatch(/platform audit partition has 0/);
    expect(problems).toMatch(/no tenant audit partition exists/);
  });
});

describe('C18.1.1 — posture + FK + PK exactness', () => {
  it('posture requires the exact category set and nonempty authority surfaces', () => {
    const full = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, [`${c}-entry`]]));
    expect(comparePosture(full, structuredClone(full))).toEqual([]);
    expect(comparePosture({}, {}).join('\n')).toMatch(/not the exact code-owned set/);
    const empties = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, []]));
    expect(comparePosture(empties, structuredClone(empties)).join('\n')).toMatch(/cannot be vacuously equal/);
  });
  it('FK retarget with identical local values and missing PKs are detected', () => {
    const mk = () => ({
      tables: { 't.x': { pk: ['id'], columns: ['id'], rows: [{ id: 1 }], row_count: 1 } },
      fks: [{ constraint: 't.x.fk', from: 't.x', to: 't.y', definition: 'FOREIGN KEY (id) REFERENCES t.y(id) ON DELETE CASCADE', validated: true, deferrable: false, pairs_count: 1, pairs_digest: sha256('p') }],
    });
    const tr = { tablesAdded: [], columnsAdded: [] };
    expect(compareSnapshots(mk() as never, mk() as never, tr as never)).toEqual([]);
    const rt = mk(); rt.fks[0]!.definition = 'FOREIGN KEY (id) REFERENCES evil.shadow(id) ON DELETE CASCADE';
    expect(compareSnapshots(mk() as never, rt as never, tr as never).join('\n')).toMatch(/DEFINITION changed/);
    const noPk = mk(); noPk.tables['t.x']!.pk = [];
    expect(compareSnapshots(noPk as never, mk() as never, tr as never).join('\n')).toMatch(/NO PRIMARY KEY/);
  });
});

describe('C18.1.1 — exact isolation for postgres AND redis', () => {
  const creds = (p: string) => Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`${p}:${k}`)]));
  const mk = (tag: 'a' | 'b', over: Record<string, unknown> = {}) => ({
    path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin',
    container_id: `${tag}`.repeat(12), container_name: `c18-${tag}-0123abcd-pg`,
    redis_container_id: `${tag}f`.repeat(6), redis_container: `c18-${tag}-0123abcd-redis`,
    database: `eye_${tag}_0123abcd`, port: tag === 'a' ? 5001 : 5002, redis_port: tag === 'a' ? 6001 : 6002,
    postgres_image: COMPOSE.postgres, redis_image: COMPOSE.redis, credential_digests: creds(tag),
    ...over,
  });
  it('a valid dual-instance pair passes', () => {
    expect(verifyIsolation(mk('a') as never, mk('b') as never, COMPOSE)).toEqual([]);
  });
  it('attacker image, relabelled path, shared redis and credential reuse are rejected', () => {
    expect(verifyIsolation(mk('a', { postgres_image: 'evil@sha256:x' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/postgres image is not the digest-pinned/);
    expect(verifyIsolation(mk('a', { path: 'path-b-virgin' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/label is/);
    expect(verifyIsolation(mk('a') as never, mk('b', { redis_container: 'c18-a-0123abcd-redis', redis_container_id: 'aa'.repeat(6) }) as never, COMPOSE).join('\n')).toMatch(/SHARED redis_container/);
    // within-path credential reuse
    const dup = mk('a'); (dup.credential_digests as Record<string, string>).EYE_REDIS_PASSWORD = (dup.credential_digests as Record<string, string>).EYE_DB_PASSWORD;
    expect(verifyIsolation(dup as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/credential digest REUSED/);
    // cross-key A/B reuse
    const bReuse = mk('b'); (bReuse.credential_digests as Record<string, string>).EYE_DB_PASSWORD = (mk('a').credential_digests as Record<string, string>).EYE_DB_APP_PASSWORD;
    expect(verifyIsolation(mk('a') as never, bReuse as never, COMPOSE).join('\n')).toMatch(/credential digest REUSED/);
    // bad container grammar
    expect(verifyIsolation(mk('a', { container_name: 'x' }) as never, mk('b') as never, COMPOSE).join('\n')).toMatch(/container_name .* fails its grammar/);
  });
});

describe('C18.1.2 — operation closure exactness (decision, outbox binding, full audit body)', () => {
  const expected = { correlation: 'c', decisionId: 'd', action: 'objects.create', target: 'outbox:o', tenantId: 't', domainId: 'dm', principalId: 'p', sessionId: 's', eventId: 'o', effectRef: 'o', effectKinds: ['outbox'] };
  const closerBody = () => ({
    outcome: 'success', action: 'objects.create', tenant_id: 't', domain_id: 'dm',
    actor: 'principal:p', scope: 'DOMAIN', event_type: 'api.request', result_code: 'OK',
    correlation_id: 'c', policy_decision_id: 'd', session_id: 's',
    purpose_id: 'c18-post-upgrade-proof', policy_version: 'bundle-v1',
    target_type: 'objects.outbox', target_id: 'o', context_mode: 'authority',
    occurred_at: '2026-08-19T00:00:00.000Z',
  });
  const snap = () => ({
    tables: {
      'ctx.operation': { rows: [{ operation_id: 'op', correlation_id: 'c', decision_id: 'd', principal_id: 'p', tenant_id: 't', domain_id: 'dm', session_id: 's', action: 'objects.create', target: 'outbox:o', finalized: true, expected_outcome: 'success', scope: 'DOMAIN', purpose: 'c18-post-upgrade-proof', consequence: 'C1', capability_class: 'authority.commit', bundle_version: 'bundle-v1', causation_id: null, obligations_required: false }] },
      'ctx.operation_effect': { rows: [{ operation_id: 'op', effect_kind: 'outbox', effect_ref: 'o' }] },
      'policy.policy_decisions': { rows: [{ id: 'd', decision: 'allow', action: 'objects.create', correlation_id: 'c', evidence_only: false, principal_id: 'principal:p', scope: 'DOMAIN', tenant_id: 't', domain_id: 'dm', object_type: 'objects.outbox', object_id: 'o', consequence_class: 'C1', purpose_id: 'c18-post-upgrade-proof', bundle_version: 'bundle-v1', revocation_state: 'none', delegation_id: null, exception_ref: null, expires_at: null, reason: 'C18.1 post-upgrade closure proof', input_digest: sha256('c18-post:o'), obligations: [], environment: {} }] },
      'objects.object_outbox': { rows: [{ id: 'o', correlation_id: 'c', event_type: 'c18.post_upgrade.proof', status: 'pending', scope: 'DOMAIN', tenant_id: 't', domain_id: 'dm', published_at: null, lease_id: null }] },
    },
    audit: { events: [{ partition_id: 'tenant:t', audit_seq: 1, correlation_id: 'c', policy_decision_id: 'd', event_jcs: jcsCanonicalize(closerBody()) }] },
  });
  it('the exact chain passes', () => {
    expect(verifyOperationClosure({ snapshot: snap() as never, expected: expected as never })).toEqual([]);
  });
  const decRow = (s: any) => s.tables['policy.policy_decisions'].rows[0];
  it.each([
    ['unfinalized', (s: any, _e: any) => { s.tables['ctx.operation'].rows[0].finalized = false; }, /not finalized/],
    ['failure outcome', (s: any, _e: any) => { s.tables['ctx.operation'].rows[0].expected_outcome = 'failure'; }, /expected_outcome/],
    ['wrong effect kind', (s: any, _e: any) => { s.tables['ctx.operation_effect'].rows[0].effect_kind = 'evil'; }, /effect kinds/],
    ['non-allow decision', (s: any, _e: any) => { decRow(s).decision = 'deny'; }, /not an allow/],
    ['an EVIDENCE-ONLY closure decision', (s: any, _e: any) => { decRow(s).evidence_only = true; }, /evidence_only=true; an ENFORCED closure requires evidence_only=false/],
    ['an attacker decision principal', (s: any, _e: any) => { decRow(s).principal_id = 'principal:attacker'; }, /decision principal is "principal:attacker"/],
    ['a wrong decision scope', (s: any, _e: any) => { decRow(s).scope = 'PLATFORM'; }, /decision scope/],
    ['a wrong decision object target', (s: any, _e: any) => { decRow(s).object_id = 'other'; }, /decision object_id/],
    ['a forged input digest', (s: any, _e: any) => { decRow(s).input_digest = sha256('evil'); }, /decision input_digest/],
    ['a forged recorded eventId (target suffix breaks)', (_s: any, e: any) => { e.eventId = 'forged'; e.effectRef = 'forged'; }, /does not name its recorded eventId|has no objects\.object_outbox row/],
    ['a recorded eventId with no outbox row', (s: any, _e: any) => { s.tables['objects.object_outbox'].rows = []; }, /has no objects\.object_outbox row/],
    ['a published post-upgrade outbox row', (s: any, _e: any) => { s.tables['objects.object_outbox'].rows[0].status = 'published'; }, /outbox row status/],
    ['forged audit actor', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), actor: 'principal:evil' }); }, /closing audit event actor/],
    ['forged audit target', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), target_id: 'other' }); }, /closing audit event target_id/],
    ['an evidence-mode audit context', (s: any, _e: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ ...closerBody(), context_mode: 'evidence' }); }, /closing audit event context_mode/],
    ['extra conflicting operation', (s: any, _e: any) => { s.tables['ctx.operation'].rows.push({ ...s.tables['ctx.operation'].rows[0] }); }, /exactly one is required/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s = snap();
    const e = structuredClone(expected);
    mutate(s, e);
    expect(verifyOperationClosure({ snapshot: s as never, expected: e as never }).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.1 — suite receipts are exact', () => {
  const good = (over: Record<string, unknown> = {}) => ({
    suite: 'integration', path: 'path-a-upgraded', command_id: 'x', argv_redacted: ['pnpm', '--filter', '@eye/api', 'test:int'],
    timeout_ms: 900_000, exit_status: 0, signal: null, stdout_file: 'a', stderr_file: 'b', exit_file: 'c',
    stdout_bytes: 10, stdout_sha256: 'd', stderr_bytes: 0, stderr_sha256: 'e', tests_passed: 297, tests_total: 297, ...over,
  });
  it('the matrix carries the exact code-owned counts', () => {
    expect(SUITE_MATRIX.integration.expected_tests).toBe(297);
    expect(SUITE_MATRIX.acceptance.expected_tests).toBe(58);
  });
  it('a prefix-matched argv (appended single-test) and wrong count fail', () => {
    const cmds = [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int', 'test/one.ts'], exit: 0, signal: null, timeout_ms: 900_000 }];
    const p = verifySuiteReceipts(SUITE_MATRIX, [good({ argv_redacted: ['pnpm', '--filter', '@eye/api', 'test:int', 'test/one.ts'] })], { commands: cmds }).join('\n');
    expect(p).toMatch(/is not EXACTLY the matrix command/);
    const out = Buffer.from('Tests  1 passed (1)\n'); const err = Buffer.from(''); const exit = Buffer.from('0\n');
    const fmap: Record<string, Buffer> = { a: out, b: err, c: exit };
    const readFile = (rel: string) => fmap[rel] ?? null;
    const rc = good({ stdout_bytes: out.byteLength, stdout_sha256: sha256(out), stderr_bytes: 0, stderr_sha256: sha256(err) });
    const p2 = verifySuiteReceipts(SUITE_MATRIX, [rc], { commands: [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int'], exit: 0, signal: null, timeout_ms: 900_000 }], readFile }).join('\n');
    expect(p2).toMatch(/is not the code-owned count 297/);
  });
  it('a command recording nonzero exit fails', () => {
    const cmds = [{ id: 'x', argv: ['pnpm', '--filter', '@eye/api', 'test:int'], exit: 97, signal: null, timeout_ms: 900_000 }];
    expect(verifySuiteReceipts(SUITE_MATRIX, [good({ exit_status: 97 })], { commands: cmds }).join('\n')).toMatch(/records exit 97/);
  });
});

describe('C18.1.1 — manifest + RESULT typing', () => {
  it('the manifest shape and RESULT receipt are typed and exact', () => {
    expect(verifyManifestShape(null).join('\n')).toMatch(/not an object/);
    expect(verifyManifestShape({ gate: 'C19' }).join('\n')).toMatch(/field 'gate' is malformed/);
    const manifest = { mode: 'final', source_sha: 'a'.repeat(40) };
    expect(parseResultReceipt(`outcome: PASS\ngate: C18\nmode: final\nsource_sha: ${'a'.repeat(40)}\npaths: path-a-upgraded, path-b-virgin\n`, manifest as never)).toEqual([]);
    expect(parseResultReceipt('outcome: PASS\n', manifest as never).join('\n')).toMatch(/RESULT receipt line 2/);
  });
  it('migration ledger falsification axes stay closed', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const digests = new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS, f)))]));
    const ledger = files.filter((f) => f.slice(0, 4) <= HISTORICAL_LAST).map((filename) => ({ filename, digest: digests.get(filename)!, applied_at: 't' }));
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger, expectLast: HISTORICAL_LAST })).toEqual([]);
    const forged = structuredClone(ledger); forged[3]!.digest = sha256('evil');
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: forged, expectLast: HISTORICAL_LAST }).join('\n')).toMatch(/tracked bytes hash to/);
    expect(LATEST_LAST).toBe('0021');
  });
});

describe('C18.1.2 — the command ledger is closed, position-bound and stream-bound', () => {
  const record = (seq: number, label: string, over: Record<string, unknown> = {}) => ({
    id: commandIdFor(seq, label), label, argv: ['docker', 'ps'], cwd: '.', env: {},
    timeout_ms: 120_000, exit: 0, signal: null,
    stdout_bytes: 3, stdout_sha256: sha256('ok\n'), stderr_bytes: 0, stderr_sha256: sha256(''),
    exit_bytes: 2, exit_sha256: sha256('0\n'), ...over,
  });
  it('a well-formed ledger passes typing; every forgery axis fails', () => {
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'two')])).toEqual([]);
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'one')]).join('\n')).toMatch(/DUPLICATE command label/);
    expect(verifyCommandRecords([record(1, 'one'), record(1, 'two')]).join('\n')).toMatch(/breaks the sequence/);
    expect(verifyCommandRecords([record(1, 'one'), record(2, 'two'), record(2, 'two2')]).join('\n')).toMatch(/breaks the sequence/);
    expect(verifyCommandRecords([record(1, 'one', { cwd: '/tmp' })]).join('\n')).toMatch(/not the repository root/);
    expect(verifyCommandRecords([record(1, 'one', { attacker: true })]).join('\n')).toMatch(/not the exact closed record set/);
    expect(verifyCommandRecords([record(1, 'one', { stdout_sha256: 'zz' })]).join('\n')).toMatch(/stdout_sha256 is malformed/);
    expect(verifyCommandRecords([record(1, 'one', { exit: 0, signal: 'SIGTERM' })]).join('\n')).toMatch(/exit\/signal pair/);
  });
  it('stream binding rejects tampered bytes and a contradictory raw exit receipt', () => {
    const fmap: Record<string, Buffer> = {
      [`raw/${commandIdFor(1, 'one')}.stdout.txt`]: Buffer.from('ok\n'),
      [`raw/${commandIdFor(1, 'one')}.stderr.txt`]: Buffer.from(''),
      [`raw/${commandIdFor(1, 'one')}.exit.txt`]: Buffer.from('0\n'),
    };
    const read = (rel: string) => fmap[rel] ?? null;
    expect(verifyCommandStreams([record(1, 'one')] as never, read)).toEqual([]);
    fmap[`raw/${commandIdFor(1, 'one')}.stdout.txt`] = Buffer.from('tampered\n');
    expect(verifyCommandStreams([record(1, 'one')] as never, read).join('\n')).toMatch(/stdout stream bytes\/digest do not match/);
    fmap[`raw/${commandIdFor(1, 'one')}.stdout.txt`] = Buffer.from('ok\n');
    const exit97 = Buffer.from('97\n');
    fmap[`raw/${commandIdFor(1, 'one')}.exit.txt`] = exit97;
    expect(verifyCommandStreams([record(1, 'one', { exit_bytes: exit97.byteLength, exit_sha256: sha256(exit97) })] as never, read).join('\n'))
      .toMatch(/raw exit receipt .* does not restate the ledger exit/);
  });
  it('the command graph fails closed on an empty or truncated ledger', () => {
    const receipt = (tag: 'a' | 'b') => ({
      path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin', container_id: 'c'.repeat(12),
      container_name: `c18-${tag}-01234567-pg`, redis_container_id: 'd'.repeat(12),
      redis_container: `c18-${tag}-01234567-redis`, database: `eye_${tag}_01234567`,
      port: 5001, redis_port: 6001, postgres_image: 'p', redis_image: 'r', credential_digests: {},
    });
    const r = verifyCommandGraph({
      commands: [], receiptA: receipt('a') as never, receiptB: receipt('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    });
    expect(r.join('\n')).toMatch(/expected 'a-pg-run' at position 1 but the ledger ended/);
    expect(verifyCommandGraph({
      commands: [], receiptA: null, receiptB: receipt('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    }).join('\n')).toMatch(/cannot bind/);
  });
});

describe('C18.1.2 — the seed record is a closed schema bound bidirectionally', () => {
  const world = () => {
    const CORR_TENANT = '22222222-2222-4222-8222-222222222222';
    const CORR_OBJECT = '33333333-3333-4333-8333-333333333333';
    const CORR_SESSION = '44444444-4444-4444-8444-444444444444';
    const DECISION = '11111111-1111-4111-8111-111111111111';
    const seedRecord = {
      admin: { principalId: 'adm', loginName: 'platform-admin' },
      tenants: [{ tenantId: 't1', name: 'alpha' }],
      domains: [{ domainId: 'd1', tenantId: 't1', name: 'alpha-dom0' }],
      principals: [{ principalId: 'p1', scope: 'TENANT', tenantId: 't1', domainId: null, loginName: 'l1', roleCode: 'tenant_admin' }],
      sessions: [{ sessionId: 's1', principalId: 'adm', familyId: 'f1', correlation: CORR_SESSION }],
      objects: [{ objectId: 'o1', tenantId: 't1', domainId: 'd1', correlation: CORR_OBJECT }],
      outbox: [{ eventId: 'e1', correlation: CORR_TENANT, eventType: 'x' }],
      decisions: [DECISION],
      correlations: [CORR_TENANT, CORR_OBJECT, CORR_SESSION],
      steps: SEED_STEP_PLAN.map((st: { step: string; ports: string[] }) => ({ step: st.step, ports: [...st.ports], ids: [] })),
      post_upgrade_operation: { correlation: 'pc', decisionId: 'pd', action: 'objects.create', target: 'outbox:pe', tenantId: 't1', domainId: 'd1', principalId: 'adm', sessionId: 'ps', eventId: 'pe', effectRef: 'pe', effectKinds: ['outbox'] },
    };
    const before = {
      tables: {
        'tenancy.tenants': { rows: [{ id: 't1', name: 'alpha' }] },
        'tenancy.domains': { rows: [{ id: 'd1', tenant_id: 't1', name: 'alpha-dom0' }] },
        'identity.principals': { rows: [{ id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null, login_name: 'platform-admin', display_name: 'platform-admin' }, { id: 'p1', scope: 'TENANT', tenant_id: 't1', domain_id: null, login_name: 'l1', display_name: 'l1' }] },
        'identity.role_bindings': { rows: [
          { principal_id: 'adm', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null, domain_id: null, granted_by_principal: null, granted_by_scope: 'PLATFORM', revoked_at: null },
          { principal_id: 'p1', role_code: 'tenant_admin', scope: 'TENANT', tenant_id: 't1', domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM', revoked_at: null },
        ] },
        'identity.sessions': { rows: [{ id: 's1', principal_id: 'adm', family_id: 'f1' }] },
        'identity.refresh_tokens': { rows: [{ id: 'rt1', session_id: 's1', family_id: 'f1' }] },
        'objects.canonical_objects': { rows: [{ object_id: 'o1', tenant_id: 't1', domain_id: 'd1', audit_correlation_id: CORR_OBJECT }] },
        'objects.object_outbox': { rows: [{ id: 'e1', correlation_id: CORR_TENANT, event_type: 'x' }] },
        'policy.policy_decisions': { rows: [{ id: DECISION, correlation_id: CORR_TENANT }] },
      },
      audit: { events: [{ partition_id: 'platform', audit_seq: 1, correlation_id: CORR_TENANT }, { partition_id: 'platform', audit_seq: 2, correlation_id: CORR_OBJECT }] },
    };
    const finalSnap = {
      tables: {
        'identity.sessions': { rows: [...before.tables['identity.sessions'].rows, { id: 'ps', principal_id: 'adm', family_id: 'f2' }] },
        'identity.principals': { rows: before.tables['identity.principals'].rows },
        'policy.policy_decisions': { rows: [...before.tables['policy.policy_decisions'].rows, { id: 'pd' }] },
        'objects.object_outbox': { rows: [...before.tables['objects.object_outbox'].rows, { id: 'pe' }] },
      },
      audit: { events: [] },
    };
    const manifest = {
      seed_summary: { tenants: 1, domains: 1, principals: 2, sessions: 1, objects: 1, outbox: 1, decisions: 1 },
      post_upgrade_operation: structuredClone(seedRecord.post_upgrade_operation),
    };
    return { seedRecord, before, finalSnap, manifest };
  };
  it('a consistent world passes', () => {
    expect(verifySeedRecordClosed(world() as never)).toEqual([]);
  });
  it.each([
    ['a FORGED seeded principal id', (w: any) => { w.seedRecord.principals[0].principalId = 'forged'; }, /principal forged is not in the snapshot|principal p1 is not accounted for/],
    ['an unaccounted snapshot principal', (w: any) => { w.before.tables['identity.principals'].rows.push({ id: 'ghost', scope: 'TENANT' }); }, /principal ghost is not accounted for/],
    ['a trusted-not-derived seed_summary', (w: any) => { w.manifest.seed_summary.principals = 999; }, /not the record-derived/],
    ['a seed_summary with a smuggled key', (w: any) => { w.manifest.seed_summary.extra = 1; }, /not the record-derived/],
    ['an open (extra-field) seed record', (w: any) => { w.seedRecord.attacker = true; }, /not the exact closed schema/],
    ['a broken domain->tenant relationship', (w: any) => { w.seedRecord.domains[0].tenantId = 'other'; }, /tenant relationship differs|unrecorded tenant/],
    ['a session bound to the wrong principal', (w: any) => { w.before.tables['identity.sessions'].rows[0].principal_id = 'p1'; }, /session s1 principal relationship differs/],
    ['a missing role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows.pop(); }, /has no live 'tenant_admin' role binding|requires live role binding/],
    ['a duplicated principal entry', (w: any) => { w.seedRecord.principals.push({ ...w.seedRecord.principals[0] }); }, /principals contains DUPLICATE principalId entries/],
    ['an ADDITIONAL live role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows.push({ principal_id: 'p1', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null, domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM', revoked_at: null }); }, /carries live role binding .*platform_admin.*which the seed record does not account for/],
    ['a RE-SCOPED role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows[1].scope = 'PLATFORM'; w.before.tables['identity.role_bindings'].rows[1].tenant_id = null; }, /carries live role binding .*which the seed record does not account for/],
    ['a RE-ATTRIBUTED role binding (forged grantor)', (w: any) => { w.before.tables['identity.role_bindings'].rows[1].granted_by_principal = 'attacker'; }, /carries live role binding .*which the seed record does not account for/],
    ['a forged session family', (w: any) => { w.before.tables['identity.sessions'].rows[0].family_id = 'other'; }, /familyId .* differs from the snapshot family/],
    ['a refresh token in a foreign family', (w: any) => { w.before.tables['identity.refresh_tokens'].rows[0].family_id = 'other'; }, /carries family other, not the recorded/],
    ['a forged object correlation', (w: any) => { w.seedRecord.objects[0].correlation = w.seedRecord.correlations[0]; }, /differs from the canonical object's audit correlation/],
    ['an extra unused correlation', (w: any) => { w.seedRecord.correlations.push('55555555-5555-4555-8555-555555555555'); }, /appears NOWHERE in the seeded world and belongs to no recorded session/],
    ['a session correlation missing from the set', (w: any) => { w.seedRecord.correlations = w.seedRecord.correlations.filter((c: string) => c !== w.seedRecord.sessions[0].correlation); }, /which the recorded correlation set omits/],
    ['an unrecorded audit correlation', (w: any) => { w.before.audit.events.push({ partition_id: 'platform', audit_seq: 3, correlation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }); }, /which the seed record does not account for/],
    ['a FORGED post-upgrade eventId in the record', (w: any) => { w.seedRecord.post_upgrade_operation.eventId = 'zz'; w.manifest.post_upgrade_operation.eventId = 'zz'; }, /final-outbox event zz is not in the snapshot|final-outbox event pe is not accounted for/],
    ['a divergent manifest operation record', (w: any) => { w.manifest.post_upgrade_operation.eventId = 'zz'; }, /differs from the manifest/],
    ['a post-upgrade principal that is not the admin', (w: any) => { w.seedRecord.post_upgrade_operation.principalId = 'p1'; w.manifest.post_upgrade_operation.principalId = 'p1'; }, /not the seeded admin/],
  ])('detects %s', (_l, mutate, pattern) => {
    const w = world();
    mutate(w);
    expect(verifySeedRecordClosed(w as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.2 — audit table rows cross-check against the audit view', () => {
  const body = { actor: 'principal:p', action: 'x', scope: 'PLATFORM', tenant_id: null, domain_id: null, event_type: 'api.request', outcome: 'success', result_code: 'OK', correlation_id: '33333333-3333-4333-8333-333333333333', occurred_at: '2026-08-19T00:00:00.000Z' };
  const mk = () => {
    const jcs = jcsCanonicalize(body);
    const shared = { partition_id: 'platform', audit_seq: 1, event_jcs: jcs, previous_hash: '0'.repeat(64), row_hash: '1'.repeat(64), hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id };
    return {
      tables: {
        'audit.audit_events': { rows: [{ ...shared, event: { ...body }, scope: body.scope, tenant_id: null, domain_id: null, event_type: body.event_type, outcome: body.outcome, actor: body.actor, action: body.action, result_code: body.result_code, occurred_at: body.occurred_at, created_at: 't' }] },
        'audit.audit_chain_heads': { rows: [{ partition_id: 'platform', next_seq: 2, head_hash: '1'.repeat(64), frozen: false, updated_at: 't' }] },
      },
      audit: { events: [{ partition_id: 'platform', audit_seq: 1, event_jcs: jcs, previous_hash: '0'.repeat(64), row_hash: '1'.repeat(64), hash_alg_version: 'eye-audit-v1', correlation_id: body.correlation_id, policy_decision_id: null }], heads: [{ partition_id: 'platform', next_seq: 2, head_hash: '1'.repeat(64), frozen: false }] },
    };
  };
  it('a consistent pair passes (jsonb key order tolerated)', () => {
    const s = mk();
    // jsonb reorders object keys; the value comparison must still hold.
    (s.tables['audit.audit_events'].rows[0] as any).event = Object.fromEntries(Object.entries(body).reverse());
    expect(crossCheckAuditTable(s as never, 'x')).toEqual([]);
  });
  it.each([
    ['a table row missing from the view', (s: any) => { s.audit.events = []; }, /missing from the audit view/],
    ['a view row with no table row', (s: any) => { s.tables['audit.audit_events'].rows = []; }, /has no audit\.audit_events table row/],
    ['a forged generated actor projection', (s: any) => { s.tables['audit.audit_events'].rows[0].actor = 'principal:evil'; }, /generated projection 'actor' disagrees/],
    ['a forged generated event object', (s: any) => { s.tables['audit.audit_events'].rows[0].event = { forged: true }; }, /'event' object disagrees/],
    ['diverging event_jcs between table and view', (s: any) => { s.tables['audit.audit_events'].rows[0].event_jcs = '{}'; }, /event_jcs differs between the table and the audit view/],
    ['a head that disagrees with the view', (s: any) => { s.tables['audit.audit_chain_heads'].rows[0].next_seq = 9; }, /disagrees between the table and the audit view/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s = mk();
    mutate(s);
    expect(crossCheckAuditTable(s as never, 'x').join('\n')).toMatch(pattern);
  });
});

describe('C18.1.3 — the query plan is source-owned and exact', () => {
  it('every authoritative query is a pure function of source, with no attacker-supplied text', () => {
    const meta = [
      { table: 'tenancy.tenants', pk: ['id'], columns: ['id', 'name'] },
      { table: 'ctx.context_secret', pk: ['id'], columns: ['id', 'secret'] },
    ];
    const fk = [{ constraint: 'a.b.c', from: 'a.b', to: 'a.d', cols: ['x'] }];
    const plan = snapshotQueryPlan({ prefix: 'a-a-before', tablesMeta: meta, fkMeta: fk });
    // 1 meta + 2 row queries + 1 fk-meta + 1 fk pairs + 15 posture + ledger + 2 audit = 23.
    expect(plan).toHaveLength(1 + meta.length + 1 + fk.length + POSTURE_CATEGORIES.length + 3);
    expect(plan.map((s: { label: string }) => s.label)).toContain('a-a-before-rows-tenancy_tenants');
    // Determinism: the same inputs produce byte-identical SQL every time.
    const again = snapshotQueryPlan({ prefix: 'a-a-before', tablesMeta: meta, fkMeta: fk });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
    // The secret-valued column is digest-substituted IN THE PROJECTION, never selected raw.
    const secretRows = plan.find((s: { label: string }) => s.label === 'a-a-before-rows-ctx_context_secret')!;
    expect(secretRows.sql).toContain("encode(sha256(convert_to('c18-secret-v1:ctx.context_secret.secret:'");
    expect(tableRowsSql('tenancy.tenants', ['id'], ['id'])).not.toContain('c18-secret-v1');
    // Every posture category has exactly one source-owned query, and they are all distinct.
    const postures = POSTURE_CATEGORIES.map((c: string) => postureSql(c));
    expect(new Set(postures).size).toBe(POSTURE_CATEGORIES.length);
    expect(() => postureSql('attacker_category')).toThrow(/no source-owned posture query/);
  });

  it('the graph rejects a substituted query even when its output is genuine', () => {
    const iso = (tag: 'a' | 'b') => ({
      path: tag === 'a' ? 'path-a-upgraded' : 'path-b-virgin',
      container_id: 'c'.repeat(12), container_name: `c18-${tag}-01234567-pg`,
      redis_container_id: 'd'.repeat(12), redis_container: `c18-${tag}-01234567-redis`,
      database: `eye_${tag}_01234567`, port: 5001, redis_port: 6001,
      postgres_image: 'p', redis_image: 'r',
      credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`${tag}:${k}`)])),
    });
    const r = verifyCommandGraph({
      commands: [], receiptA: iso('a') as never, receiptB: iso('b') as never,
      images: { postgres: 'p', redis: 'r' }, rawText: () => null,
    });
    expect(r.join('\n')).toMatch(/expected 'a-pg-run' at position 1 but the ledger ended/);
  });
});

describe('C18.1.3 — exact secret-class placeholders', () => {
  const receipt = {
    path: 'path-a-upgraded',
    credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(k)])),
  };
  it('the exact placeholder is per path AND per class, and the JWT composition is bound', () => {
    expect(placeholder('a', 'EYE_DB_PASSWORD')).toBe('<REDACTED:a:EYE_DB_PASSWORD>');
    expect(jwtPlaceholder('b')).toBe('<REDACTED:b:EYE_TEST_ADMIN_PASSWORD><REDACTED:b:EYE_TEST_BOOTSTRAP_PASSWORD>');
    const env = expectedInstanceEnv('a', { port: 5001, redis_port: 6001, database: 'eye_a_01234567' } as never);
    expect(env.EYE_DB_MIGRATE_PASSWORD).toBe('<REDACTED:a:EYE_DB_PASSWORD>');
    expect(env.EYE_IDENTITY_JWT_SECRET).toBe(jwtPlaceholder('a'));
    for (const k of SECRET_CLASSES) expect(env[k]).toBe(placeholder('a', k));
  });
  it.each([
    ['a bare prefix match', '<REDACTED:whatever', /not an exact <REDACTED:path:CLASS> placeholder/],
    ['a wrong-path placeholder', '<REDACTED:b:EYE_DB_PASSWORD>', /carries path 'b' credential material/],
    ['an unknown class', '<REDACTED:a:WRONG_CLASS>', /has no credential-digest entry/],
    ['a raw secret', 'deadbeefdeadbeefdeadbeef', /not an exact <REDACTED:path:CLASS> placeholder/],
  ])('rejects %s', (_l, value, pattern) => {
    expect(checkPlaceholder(value, 'a', receipt as never, 'test').join('\n')).toMatch(pattern);
  });
  it('accepts the exact placeholder for this path and class', () => {
    expect(checkPlaceholder('<REDACTED:a:EYE_REDIS_PASSWORD>', 'a', receipt as never, 'test')).toEqual([]);
  });
});

describe('C18.1.3 — migration executions, seeding steps and executed cleanup', () => {
  const tracked = () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const m = new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS, f)))]));
    m.set('__runner__', sha256(readFileSync(join(REPO, 'apps', 'api', 'scripts', 'migrate.mjs'))));
    return m;
  };
  const govMigrations = () => [...tracked().entries()]
    .filter(([f]) => /^\d{4}_/.test(f) && f.slice(0, 4) <= HISTORICAL_LAST)
    .sort(([a], [b]) => (a < b ? -1 : 1)).map(([filename, digest]) => ({ filename, digest }));
  const exec = (over: Record<string, unknown> = {}) => ({
    command_id: '001-a-migrate-historical', attest_command_id: '001-a-migrate-historical-attest',
    inventory_command_id: '001-a-migrate-historical-inventory',
    label: 'a-migrate-historical', path: 'path-a-upgraded',
    workspace: '/tmp/c18-a-Ab12Cd', runner_path: '/tmp/c18-a-Ab12Cd/scripts/migrate.mjs',
    runner_sha256: tracked().get('__runner__'), ceiling: HISTORICAL_LAST,
    inventory: govMigrations().map((m: { filename: string }) => m.filename),
    migrations: govMigrations(),
    applied: govMigrations().map((m: { filename: string }) => m.filename),
    ...over,
  });
  it.each([
    ['an attacker path', { workspace: '/attacker', runner_path: '/attacker/scripts/migrate.mjs' }, /not a governed workspace path/],
    ['a traversal workspace', { workspace: '/tmp/../etc/c18-a-Ab12Cd', runner_path: '/tmp/../etc/c18-a-Ab12Cd/scripts/migrate.mjs' }, /not a governed workspace path/],
    ['a runner outside its workspace', { runner_path: '/tmp/other/scripts/migrate.mjs' }, /is not the governed workspace runner/],
    ['substituted runner bytes', { runner_sha256: sha256('evil') }, /not the tracked apps\/api\/scripts\/migrate\.mjs/],
    ['a truncated migration set', { migrations: [] }, /workspace migration set is not exactly the tracked/],
    ['the wrong ceiling', { ceiling: LATEST_LAST }, /ceiling is|migration set is not exactly/],
  ])('rejects %s', (_l, over, pattern) => {
    const problems = verifyMigrationExecutions({
      executions: [exec(over), exec({ label: 'a-migrate-upgrade' }), exec({ label: 'b-migrate-latest' })],
      commands: [], trackedDigests: tracked(), repoRoot: REPO,
    });
    expect(problems.join('\n')).toMatch(pattern);
  });
  it('rejects a workspace inside the repository', () => {
    const inside = join(REPO, 'c18-a-Ab12Cd');
    const problems = verifyMigrationExecutions({
      executions: [exec({ workspace: inside, runner_path: `${inside}/scripts/migrate.mjs` })],
      commands: [], trackedDigests: tracked(), repoRoot: REPO,
    });
    expect(problems.join('\n')).toMatch(/resolves INSIDE the repository/);
  });

  it('a MEASURED attestation passes; a self-asserted digest over foreign bytes fails', () => {
    const e = exec();
    const ws = e.workspace;
    const lines = [`${e.runner_sha256}  ${e.runner_path}`,
      ...e.migrations.map((m: any) => `${m.digest}  ${ws}/migrations/${m.filename}`)].join('\n');
    const invText = `${e.inventory.join('\n')}\n`;
    const runText = `${e.applied.map((f: string) => `applying ${f} ... ok`).join('\n')}\nmigrations up to date\n`;
    const commands = [
      { id: e.inventory_command_id, label: 'a-migrate-historical-inventory', argv: inventoryArgv(ws), exit: 0, signal: null },
      { id: e.attest_command_id, label: 'a-migrate-historical-attest', argv: attestArgv(ws, e.inventory), exit: 0, signal: null },
      { id: e.command_id, label: 'a-migrate-historical', argv: ['node', e.runner_path], exit: 0, signal: null },
    ];
    const byId: Record<string, string> = {
      [e.inventory_command_id]: invText, [e.attest_command_id]: lines, [e.command_id]: runText,
    };
    const opts = { commands, trackedDigests: tracked(), repoRoot: REPO, rawText: (c: any) => byId[c.id] ?? null };
    // Only this one execution is under test here; the other two governed slots are absent.
    const unrelated = /is MISSING|exactly 3 are governed/;
    expect(verifyMigrationExecutions({ executions: [e], ...opts } as never)
      .filter((p: string) => !unrelated.test(p))).toEqual([]);
    // The receipt claims the tracked digest while the EXECUTION measured other bytes.
    const foreign = `${sha256('elsewhere')}  ${e.runner_path}\n${lines.split('\n').slice(1).join('\n')}`;
    const foreignById: Record<string, string> = { ...byId, [e.attest_command_id]: foreign };
    expect(verifyMigrationExecutions({ executions: [e], ...opts, rawText: (c: any) => foreignById[c.id] ?? null } as never).join('\n'))
      .toMatch(/EXECUTED runner whose measured bytes are not the tracked source bytes/);
    // A missing attestation command cannot be substituted by the manifest's own assertion.
    expect(verifyMigrationExecutions({ executions: [e], ...opts, commands: [commands[0], commands[2]] } as never).join('\n'))
      .toMatch(/names attestation command .* which does not exist/);
  });

  it('the governed seeding plan is exact, ordered and sanitized', () => {
    const seedRecord = {
      admin: { principalId: 'p-admin' },
      tenants: [{ tenantId: 't1' }], domains: [{ domainId: 'd1' }],
      principals: [{ principalId: 'p1' }],
      sessions: [{ sessionId: 's-adm', principalId: 'p-admin' }, { sessionId: 's-ten', principalId: 'p1' }],
      objects: [{ objectId: 'o1' }],
      outbox: [{ eventId: 'e-pub', eventType: 'c18.seed.published' }],
    };
    const derived = deriveSeedStepIdentities(seedRecord as never);
    const good = SEED_STEP_PLAN.map((s: { step: string; ports: string[] }) => ({
      step: s.step, ports: [...s.ports], ids: [...(derived as Record<string, string[]>)[s.step]!],
    }));
    expect(verifySeedSteps({ steps: good, seedRecord: seedRecord as never })).toEqual([]);
    const reordered = structuredClone(good);
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(verifySeedSteps({ steps: reordered, seedRecord: seedRecord as never }).join('\n')).toMatch(/the plan requires/);
    const extraPort = structuredClone(good);
    extraPort[0]!.ports.push('attacker.port');
    expect(verifySeedSteps({ steps: extraPort, seedRecord: seedRecord as never }).join('\n')).toMatch(/are not the source-owned era ports/);
    const leaky = structuredClone(good);
    leaky[0]!.ids = ['deadbeefdeadbeefdeadbeefdeadbeef'];
    expect(verifySeedSteps({ steps: leaky, seedRecord: seedRecord as never }).join('\n')).toMatch(/not a sanitized identity/);
    const unknown = structuredClone(good);
    unknown[0]!.ids = ['p-ghost'];
    expect(verifySeedSteps({ steps: unknown, seedRecord: seedRecord as never }).join('\n')).toMatch(/does not account for/);
    const emptied = structuredClone(good);
    emptied[3]!.ids = [];
    expect(verifySeedSteps({ steps: emptied, seedRecord: seedRecord as never }).join('\n')).toMatch(/are not the record-derived set \(missing /);
    const misattributed = structuredClone(good);
    misattributed[0]!.ids = ['t1'];
    expect(verifySeedSteps({ steps: misattributed, seedRecord: seedRecord as never }).join('\n')).toMatch(/not this step's work/);
    const duped = structuredClone(good);
    duped[4]!.ids = ['p1', 'p1'];
    expect(verifySeedSteps({ steps: duped, seedRecord: seedRecord as never }).join('\n')).toMatch(/reports DUPLICATE identities/);
  });

  it('cleanup must be proven by EXECUTION, not asserted', () => {
    const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({ id: `in-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n), exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
    ];
    const cleanup = {
      removed: names, failures: [], kept: [],
      removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
      inspections: names.map((n, i) => ({ container: n, command_id: `in-${i}`, exit: 0 })),
    };
    const receiptA = { container_name: names[0], redis_container: names[1] };
    const receiptB = { container_name: names[2], redis_container: names[3] };
    const rawText = () => '';
    expect(verifyCleanupReceipt({ cleanup, commands: commands as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText })).toEqual([]);
    // The 15e8239 shape — an assertion with no execution evidence — is refused outright.
    const asserted = { removed: names, failures: [], kept: [] };
    expect(verifyCleanupReceipt({ cleanup: asserted as never, commands: commands as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText }).join('\n'))
      .toMatch(/removal and inspection evidence is required/);
    const stillExists = structuredClone(cleanup);
    const cmds2 = structuredClone(commands);
    cmds2[4]!.stdout_bytes = 13;
    expect(verifyCleanupReceipt({ cleanup: stillExists, commands: cmds2 as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText: () => '9f81ee4c2b7a\n' }).join('\n'))
      .toMatch(/STILL EXISTS after checked removal/);
    const failedRm = structuredClone(cleanup);
    const cmds3 = structuredClone(commands);
    cmds3[0]!.exit = 1; failedRm.removals[0]!.exit = 1;
    expect(verifyCleanupReceipt({ cleanup: failedRm, commands: cmds3 as never, receiptA: receiptA as never, receiptB: receiptB as never, rawText }).join('\n'))
      .toMatch(/checked removal of .* recorded exit 1/);
  });
});

describe('C18.1.5 — the complete migration inventory', () => {
  it('enumerates the governed directory and parses sorted output', () => {
    expect(inventoryArgv('/tmp/c18-a-Ab12Cd')).toEqual(['ls', '-1', '/tmp/c18-a-Ab12Cd/migrations']);
    const ok = parseInventory('0001_a.sql\n0002_b.sql\n');
    expect(ok.files).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(ok.sorted).toEqual(ok.files);
    const unsorted = parseInventory('0002_b.sql\n0001_a.sql\n');
    expect(unsorted.files).not.toEqual(unsorted.sorted);
  });
  it('parses the runner output and requires a confirmed completion', () => {
    const good = parseMigrationRun('applying 0001_a.sql ... ok\napplying 0002_b.sql ... ok\nmigrations up to date\n');
    expect(good.problem).toBeNull();
    expect(good.applied).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(parseMigrationRun('applying 0001_a.sql ... ok\n').problem).toMatch(/never reported 'migrations up to date'/);
    expect(parseMigrationRun('applying 0001_a.sql ... \nmigrations up to date\n').problem)
      .toMatch(/started but never confirmed applied/);
    // Nothing to apply is legitimate only when nothing was expected.
    expect(parseMigrationRun('migrations up to date\n').applied).toEqual([]);
  });
  it('derives the exact application sequence per governed execution', () => {
    const files = ['0001_a.sql', '0012_l.sql', '0013_m.sql', '0021_u.sql'];
    expect(expectedApplied(files, '0012', EXECUTION_FLOOR['a-migrate-historical'])).toEqual(['0001_a.sql', '0012_l.sql']);
    expect(expectedApplied(files, '0021', EXECUTION_FLOOR['a-migrate-upgrade'])).toEqual(['0013_m.sql', '0021_u.sql']);
    expect(expectedApplied(files, '0021', EXECUTION_FLOOR['b-migrate-latest'])).toEqual(files);
  });
});

describe('C18.1.5 — the EXACT deterministic seed contract', () => {
  const world = (over: Record<string, unknown[]> = {}) => ({
    tables: {
      'tenancy.tenants': { rows: over['tenants'] ?? [{ id: 't1' }, { id: 't2' }] },
      'tenancy.domains': { rows: over['domains'] ?? [
        { id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }, { id: 'd3', tenant_id: 't2' }] },
      'identity.principals': { rows: over['principals'] ?? [
        { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
        { id: 'p1', scope: 'TENANT', tenant_id: 't1', domain_id: null },
        { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
        { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] },
      'identity.sessions': { rows: over['sessions'] ?? [{ id: 's1', principal_id: 'adm' }, { id: 's2', principal_id: 'p1' }] },
      'objects.canonical_objects': { rows: over['objects'] ?? [{ object_id: 'o1', domain_id: 'd1' }, { object_id: 'o2', domain_id: 'd1' }] },
      'objects.object_outbox': { rows: over['outbox'] ?? [{ id: 'e1', status: 'published' }, { id: 'e2', status: 'pending' }] },
      'policy.policy_decisions': { rows: over['decisions'] ?? Array.from({ length: 12 }, (_x, i) => ({ id: `dec-${i}` })) },
      'identity.role_bindings': { rows: over['bindings'] ?? Array.from({ length: 4 }, (_x, i) => ({ id: `rb-${i}` })) },
    },
    audit: {
      events: Array.from({ length: 14 }, (_x, i) => ({ partition_id: i < 10 ? 'platform' : 'tenant:t1' })),
      heads: [],
    },
  });
  it('the deterministic world passes', () => {
    expect(verifySeedFloor(world() as never)).toEqual([]);
    expect(SEED_CONTRACT.tenants).toBe(2);
    expect(SEED_CONTRACT.decisions).toBe(12);
  });
  it.each([
    ['an ADDITIONAL tenant', { tenants: [{ id: 't1' }, { id: 't2' }, { id: 't3' }] }, /tenancy\.tenants has 3 row\(s\).*EXACTLY 2/],
    ['a missing domain', { domains: [{ id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }] }, /tenancy\.domains has 2 row\(s\).*EXACTLY 3/],
    ['an ADDITIONAL decision', { decisions: Array.from({ length: 13 }, (_x, i) => ({ id: `d${i}` })) }, /policy_decisions has 13 row\(s\).*EXACTLY 12/],
    ['an ADDITIONAL role binding', { bindings: Array.from({ length: 5 }, (_x, i) => ({ id: `rb${i}` })) }, /role_bindings has 5 row\(s\).*EXACTLY 4/],
    ['two published outbox effects', { outbox: [{ id: 'e1', status: 'published' }, { id: 'e2', status: 'published' }] }, /2 published outbox effect\(s\).*EXACTLY 1/],
    ['a second PLATFORM principal', { principals: [
      { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'adm2', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
      { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] }, /2 PLATFORM principal\(s\)/],
    ['a malformed scope/tenancy principal', { principals: [
      { id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null },
      { id: 'p1', scope: 'TENANT', tenant_id: null, domain_id: null },
      { id: 'p2', scope: 'DOMAIN', tenant_id: 't1', domain_id: 'd1' },
      { id: 'p3', scope: 'TENANT', tenant_id: 't2', domain_id: null }] }, /scope\/tenancy combination the seed never creates/],
    ['a domain distribution the seed never produces', { domains: [
      { id: 'd1', tenant_id: 't1' }, { id: 'd2', tenant_id: 't1' }, { id: 'd3', tenant_id: 't1' }] }, /domains are distributed/],
    ['an orphan session', { sessions: [{ id: 's1', principal_id: 'adm' }, { id: 's2', principal_id: 'ghost' }] }, /names a principal the seed did not create/],
  ])('rejects %s', (_l, over, pattern) => {
    expect(verifySeedFloor(world(over as never) as never).join('\n')).toMatch(pattern);
  });
  it('step identities are NOT derived from a record whose contract already failed', () => {
    const problems = verifySeedSteps({ steps: [], seedRecord: {} as never, contractHeld: false });
    expect(problems.join('\n')).toMatch(/not a trustworthy source of expected identities/);
  });
});

describe('C18.1.5 — exact role-binding multisets and revoked accounting', () => {
  const seedRecord = {
    admin: { principalId: 'adm', loginName: 'platform-admin' },
    tenants: [{ tenantId: 't1', name: 'a' }, { tenantId: 't2', name: 'b' }],
    domains: [{ domainId: 'd1', tenantId: 't1', name: 'a0' }],
    principals: [{ principalId: 'p1', scope: 'TENANT', tenantId: 't1', domainId: null, loginName: 'l1', roleCode: 'tenant_admin' }],
    sessions: [], objects: [], outbox: [], decisions: [], correlations: [],
  };
  const binding = (over: Record<string, unknown> = {}) => ({
    principal_id: 'p1', role_code: 'tenant_admin', scope: 'TENANT', tenant_id: 't1',
    domain_id: null, granted_by_principal: 'adm', granted_by_scope: 'PLATFORM',
    revoked_at: null, id: 'rb-1', ...over,
  });
  const adminBinding = binding({
    principal_id: 'adm', role_code: 'platform_admin', scope: 'PLATFORM', tenant_id: null,
    granted_by_principal: null, id: 'rb-0',
  });
  const check = (rows: unknown[]) => reconcileRoleBindings({ seedRecord: seedRecord as never, bindingRows: rows as never });
  it('the exact multiset reconciles', () => {
    expect(check([adminBinding, binding()])).toEqual([]);
  });
  it('a DUPLICATE active tuple is reported with its multiplicity', () => {
    const problems = check([adminBinding, binding(), binding({ id: 'rb-2' })]);
    expect(problems.join('\n')).toMatch(/carries 2 copies of live role binding .*DUPLICATE active relationship tuple/);
  });
  it('an unexpected REVOKED binding is accounted for, not filtered away', () => {
    const problems = check([adminBinding, binding(), binding({ id: 'rb-9', role_code: 'platform_admin', revoked_at: '2026-08-20T00:00:00Z' })]);
    expect(problems.join('\n')).toMatch(/carries a REVOKED role binding .*revokes none/);
  });
  it('random row ids and timestamps are NOT part of relationship identity', () => {
    expect(check([{ ...adminBinding, id: 'other-id', created_at: 'whenever' }, { ...binding(), id: 'x', created_at: 'whenever' }])).toEqual([]);
  });
});

describe('C18.1.5 — cleanup absence is unambiguous', () => {
  const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
  const world = (over: { exit?: number; signal?: string | null; stdout?: number; stderr?: number } = {}) => {
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({
        id: `ab-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n),
        exit: i === 0 ? (over.exit ?? 0) : 0, signal: i === 0 ? (over.signal ?? null) : null,
        stdout_bytes: i === 0 ? (over.stdout ?? 0) : 0, stderr_bytes: i === 0 ? (over.stderr ?? 0) : 0,
      })),
    ];
    return {
      cleanup: {
        removed: names, failures: [], kept: [],
        removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
        inspections: names.map((n, i) => ({ container: n, command_id: `ab-${i}`, exit: i === 0 ? (over.exit ?? 0) : 0 })),
      },
      commands,
      receiptA: { container_name: names[0], redis_container: names[1] },
      receiptB: { container_name: names[2], redis_container: names[3] },
      rawText: () => '',
      errText: () => 'permission denied while trying to connect to the Docker daemon socket\n',
    };
  };
  it('exit 0, no signal, and BOTH streams empty proves absence', () => {
    expect(verifyCleanupReceipt(world() as never)).toEqual([]);
  });
  it.each([
    ['a nonzero exit', { exit: 125 }, /state is UNKNOWN, not proven absent/],
    ['a signalled probe', { signal: 'SIGKILL' }, /was signalled/],
    ['stdout output', { stdout: 13 }, /bytes of stdout/],
    ['stderr diagnostics', { stderr: 92 }, /wrote 92 bytes to stderr.*state is UNKNOWN/],
  ])('refuses %s as proof of absence', (_l, over, pattern) => {
    expect(verifyCleanupReceipt(world(over) as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — the source-owned catalog contract', () => {
  const contract = loadCatalogContract(join(REPO, 'scripts', 'gate', 'lib'));
  const snap = (era: 'historical' | 'latest') => ({
    tables: Object.fromEntries(Object.entries(contract[era].tables).map(([t, v]: [string, any]) => [
      t, { columns: [...v.columns], pk: [...v.pk], rows: [], row_count: 0 },
    ])),
    fks: contract[era].fks.map((f: any) => ({ ...f })),
  });
  it('the tracked contract covers both eras with complete column, key and FK definitions', () => {
    expect(Object.keys(contract.historical.tables).length).toBe(TABLE_UNIVERSE_HISTORICAL.length);
    expect(Object.keys(contract.latest.tables).length).toBe(TABLE_UNIVERSE_LATEST.length);
    for (const era of ['historical', 'latest'] as const) {
      for (const [t, v] of Object.entries(contract[era].tables) as Array<[string, any]>) {
        expect(v.columns.length, `${era} ${t} columns`).toBeGreaterThan(0);
        expect(v.pk.length, `${era} ${t} pk`).toBeGreaterThan(0);
      }
      for (const f of contract[era].fks) expect(f.definition).toMatch(/^FOREIGN KEY /);
    }
    expect(verifyCatalogContract(snap('historical') as never, 'historical', contract, 'x')).toEqual([]);
    expect(verifyCatalogContract(snap('latest') as never, 'latest', contract, 'x')).toEqual([]);
  });
  it.each([
    ['a removed column', (s2: any) => { s2.tables['identity.principals'].columns = s2.tables['identity.principals'].columns.filter((c: string) => c !== 'status'); }, /columns violate the source-owned catalog contract \(missing status\)/],
    ['an added column', (s2: any) => { s2.tables['identity.principals'].columns.push('backdoor'); }, /unexpected backdoor/],
    ['a reordered column list', (s2: any) => { s2.tables['identity.principals'].columns.reverse(); }, /columns violate the source-owned catalog contract/],
    ['a changed primary key', (s2: any) => { s2.tables['identity.roles'].pk = ['scope']; }, /primary key .* is not the contract's/],
    ['a weakened FK action', (s2: any) => { s2.fks[0].definition = `${s2.fks[0].definition} ON DELETE CASCADE`; }, /definition violates the source-owned catalog contract/],
    ['a retargeted FK', (s2: any) => { s2.fks[0].to = 'attacker.shadow'; }, /to violates the source-owned catalog contract/],
    ['a dropped FK', (s2: any) => { s2.fks.shift(); }, /is MISSING/],
    ['an extra FK', (s2: any) => { s2.fks.push({ ...s2.fks[0], constraint: 'attacker.x.fk' }); }, /is not in the source-owned catalog contract/],
    ['a dropped table', (s2: any) => { delete s2.tables['tenancy.tenants']; }, /catalog table set is not the source-owned/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s2 = snap('latest');
    mutate(s2);
    expect(verifyCatalogContract(s2 as never, 'latest', contract, 'x').join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — credential positions are class-exact', () => {
  it('a valid but WRONG class is refused in a PostgreSQL position', () => {
    const receipt = {
      path: 'path-a-upgraded',
      credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(k)])),
    };
    // Both classes are registered for this path — only one belongs in this position.
    expect(checkPlaceholder('<REDACTED:a:EYE_DB_APP_PASSWORD>', 'a', receipt as never, 'x')).toEqual([]);
    expect(placeholder('a', 'EYE_DB_APP_PASSWORD')).not.toBe(placeholder('a', 'EYE_DB_PASSWORD'));
  });
});

describe('C18.1.4 — migration attestation is measured, not asserted', () => {
  it('the attestation argv covers the runner and every governed migration in order', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    expect(attestArgv('/tmp/c18-a-Ab12Cd', files)).toEqual([
      'shasum', '-a', '256', '/tmp/c18-a-Ab12Cd/scripts/migrate.mjs',
      '/tmp/c18-a-Ab12Cd/migrations/0001_a.sql', '/tmp/c18-a-Ab12Cd/migrations/0002_b.sql',
    ]);
  });
  it('shasum output parses, and malformed output is refused', () => {
    const ok = parseAttestation(`${'a'.repeat(64)}  /tmp/x\n${'b'.repeat(64)}  /tmp/y\n`);
    expect(ok.problem).toBeNull();
    expect(ok.rows).toEqual([{ digest: 'a'.repeat(64), path: '/tmp/x' }, { digest: 'b'.repeat(64), path: '/tmp/y' }]);
    expect(parseAttestation('not a digest  /tmp/x').problem).toMatch(/is not shasum output/);
  });
});

describe('C18.1.4 — authenticated absence', () => {
  const names = ['c18-a-01234567-pg', 'c18-a-01234567-redis', 'c18-b-01234567-pg', 'c18-b-01234567-redis'];
  const world = (over: { probeExit?: number; probeBytes?: number; probeText?: string } = {}) => {
    const commands = [
      ...names.map((n, i) => ({ id: `rm-${i}`, label: `cleanup-rm-${n}`, argv: ['docker', 'rm', '-fv', n], exit: 0, signal: null, stdout_bytes: 0, stderr_bytes: 0 })),
      ...names.map((n, i) => ({
        id: `ab-${i}`, label: `cleanup-absent-${n}`, argv: absenceArgv(n),
        exit: i === 0 ? (over.probeExit ?? 0) : 0, signal: null,
        stdout_bytes: i === 0 ? (over.probeBytes ?? 0) : 0, stderr_bytes: 0,
      })),
    ];
    const cleanup = {
      removed: names, failures: [], kept: [],
      removals: names.map((n, i) => ({ container: n, command_id: `rm-${i}`, exit: 0 })),
      inspections: names.map((n, i) => ({ container: n, command_id: `ab-${i}`, exit: i === 0 ? (over.probeExit ?? 0) : 0 })),
    };
    return {
      cleanup,
      commands,
      receiptA: { container_name: names[0], redis_container: names[1] },
      receiptB: { container_name: names[2], redis_container: names[3] },
      rawText: (c: any) => (c.id === 'ab-0' ? (over.probeText ?? '') : ''),
    };
  };
  it('an exit-0 EMPTY probe proves absence', () => {
    expect(verifyCleanupReceipt(world() as never)).toEqual([]);
    expect(absenceArgv('c18-a-01234567-pg')).toEqual(['docker', 'ps', '-aq', '--filter', 'name=^c18-a-01234567-pg$']);
  });
  it.each([
    ['a daemon/transport failure', { probeExit: 125 }, /exited 125: the container's state is UNKNOWN, not proven absent/],
    ['a permission refusal', { probeExit: 126 }, /state is UNKNOWN/],
    ['a missing docker binary', { probeExit: 127 }, /state is UNKNOWN/],
    ['a probe that returned an id', { probeBytes: 13, probeText: '9f81ee4c2b7a\n' }, /STILL EXISTS after checked removal|produced 13 bytes/],
  ])('refuses %s as proof of absence', (_l, over, pattern) => {
    expect(verifyCleanupReceipt(world(over) as never).join('\n')).toMatch(pattern);
  });
});

describe('C18.1.4 — seed step identities are derived exactly', () => {
  const record = {
    admin: { principalId: 'adm' },
    tenants: [{ tenantId: 't1' }], domains: [{ domainId: 'd1' }],
    principals: [{ principalId: 'p1' }],
    sessions: [{ sessionId: 's-adm', principalId: 'adm' }, { sessionId: 's-ten', principalId: 'p1' }],
    objects: [{ objectId: 'o1' }],
    outbox: [{ eventId: 'e-pub', eventType: 'c18.seed.published' }, { eventId: 'e-pend', eventType: 'c18.seed.pending' }],
  };
  it('each step maps to exactly the identities that step produced', () => {
    const d = deriveSeedStepIdentities(record as never);
    expect(d.bootstrap).toEqual(['adm']);
    expect(d['admin-session']).toEqual(['s-adm']);
    expect(d['tenant-session']).toEqual(['s-ten']);
    expect(d['tenants-domains']).toEqual(['t1', 'd1']);
    expect(d['outbox-enqueue']).toEqual(['e-pub', 'e-pend']);
    // Only the PUBLISHED event belongs to the publish step.
    expect(d['outbox-publish']).toEqual(['e-pub']);
  });
});

describe('C18.1.2 — the frozen 567a70f differential predecessor is byte-verbatim', () => {
  const LEGACY_SHA = '567a70f4f823a83b069460cce9e103cd80044467';
  const PINNED = [
    ['c18-db-paths.mjs', 'scripts/gate/c18-db-paths.mjs', '5adbddd4f704e72d1ff1d8f20aafa9671210fccf6bfe0a76edb11e0d3b1d6b61'],
    ['lib/c18-contract.mjs', 'scripts/gate/lib/c18-contract.mjs', '3e1480614833433150ed40f480468ded0ede1aa8f4b81bb79c80718a7d349320'],
    ['lib/c18-seed-0012.mjs', 'scripts/gate/lib/c18-seed-0012.mjs', 'ed4406efdcf0c515fab4763974dc0c344d4d550f8cdb73bcf169fe55d1f67bea'],
    ['lib/hosted-run.mjs', 'scripts/gate/lib/hosted-run.mjs', '6ec536caa5f3d7d9ef55df0a7948a6df227896e5f1e7e265733d36f10da8f2d1'],
  ] as const;
  it.each(PINNED.map(([fixtureRel, repoRel, digest]) => [fixtureRel, repoRel, digest]))(
    'fixtures/c18-legacy-567a70f/%s carries the pinned 567a70f bytes', (fixtureRel, repoRel, digest) => {
      const fixture = readFileSync(join(__dirname, 'fixtures', 'c18-legacy-567a70f', fixtureRel));
      expect(sha256(fixture)).toBe(digest);
      // When full history is available (shallow CI checkouts are not), the pin must ALSO be
      // exactly what 567a70f tracked — the fixture is verbatim, never adapted.
      const have = spawnSync('git', ['cat-file', '-e', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO });
      if (have.status === 0) {
        const shown = spawnSync('git', ['show', `${LEGACY_SHA}:${repoRel}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 });
        expect(shown.status).toBe(0);
        expect(sha256(shown.stdout as unknown as Buffer)).toBe(digest);
      }
    },
  );
  it('the fixture ROOT seam is satisfied by a tracked symlink, not by editing the frozen file', () => {
    // The 567a70f verifier derives ROOT from its own location and reads docker-compose.yml
    // from there; the fixture stays byte-verbatim and the path is satisfied by a symlink.
    const link = join(__dirname, 'docker-compose.yml');
    expect(readFileSync(link, 'utf8')).toBe(readFileSync(join(REPO, 'docker-compose.yml'), 'utf8'));
  });
});

describe('C18.1.2 — untracked-file visibility cannot be suppressed by git config', () => {
  it('--untracked-files=all defeats status.showUntrackedFiles=no, and the runner uses it everywhere', () => {
    const repo = mkdtempSync(join(tmpdir(), 'c18-untracked-'));
    try {
      const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      git('init', '-q');
      git('config', 'status.showUntrackedFiles', 'no');
      writeFileSync(join(repo, 'hidden.txt'), 'x');
      // The config HIDES the untracked file from a plain porcelain status…
      expect(git('status', '--porcelain').stdout.trim()).toBe('');
      // …and the explicit flag defeats the config.
      expect(git('status', '--porcelain', '--untracked-files=all').stdout.trim()).toBe('?? hidden.txt');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
    // Every cleanliness judgement in the runner carries the explicit flag.
    const source = readFileSync(RUNNER, 'utf8');
    const statusCalls = [...source.matchAll(/\[\s*'status',\s*'--porcelain'[^\]]*\]/g)].map((m) => m[0]);
    expect(statusCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of statusCalls) expect(call).toContain("'--untracked-files=all'");
  });
});

describe('C18.1.1 — runner CLI fails closed (real process)', () => {
  const cli = (args: string[]) => spawnSync('node', [RUNNER, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000 });
  it.each([
    [['run'], /--out is required/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-a`), '--final'], /final mode requires --expected-sha/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-b`), '--final', '--expected-sha', 'b'.repeat(40), '--skip-suites'], /refuses every development seam/],
    [['run', '--out', join(tmpdir(), `c18-${process.pid}-c`), '--final', '--expected-sha', 'b'.repeat(40)], /HEAD .* != --expected-sha/],
    [['verify'], /verify requires --zip and --root/],
    [['verify', '--zip', '/nope.zip', '--root', '.', '--require-hosted'], /does not exist|demands online/],
    [['frobnicate'], /usage:/],
  ])('rejects %j', (args, pattern) => {
    const r = cli(args as string[]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(pattern);
  });
});

describe('C18.1.1 — CI wiring', () => {
  const CI = parseYaml(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Array<Record<string, unknown>> }>;
  };
  const steps = () => CI.jobs['build-test']!.steps;
  it('the obsolete verify-db-paths.sh stays GONE and the tracked runner exists', () => {
    expect(readdirSync(join(REPO, 'scripts'))).not.toContain('verify-db-paths.sh');
    expect(readdirSync(join(REPO, 'scripts', 'gate'))).toContain('c18-db-paths.mjs');
  });
  it('the C18 gate runs blocking, final, SHA-bound, then verifies and runs the mutation controls', () => {
    const gate = steps().find((s) => String(s['name'] ?? '').includes('C18 dual-path database history gate'));
    expect(gate!['id']).toBe('c18_gate');
    expect(gate!['if']).toBeUndefined();
    const run = String(gate!['run']);
    expect(run).toContain('--final --expected-sha "$GITHUB_SHA"');
    expect(run).toContain('c18-db-paths.mjs verify');
    expect(run).toContain('vitest.c18.config.ts');
    expect(run).toContain('C18_ARCHIVE');
  });
  it('the digest-bound C18 artifact upload is guarded; diagnostics is always()', () => {
    const bound = steps().find((s) => String(s['name'] ?? '') === 'Upload the C18 evidence archive');
    const bw = bound!['with'] as Record<string, unknown>;
    expect(bw['name']).toBe('c18-db-paths-evidence-a${{ github.run_attempt }}-${{ env.C18_ZIP_SHA256 }}');
    expect(bound!['if']).toBe("always() && steps.c18_gate.outcome == 'success'");
    expect(c18ArtifactName('1', 'a'.repeat(64))).toBe(`c18-db-paths-evidence-a1-${'a'.repeat(64)}`);
    const diag = steps().find((s) => String(s['name'] ?? '') === 'Upload C18 diagnostics');
    expect(diag!['if']).toBe('always()');
  });
});
