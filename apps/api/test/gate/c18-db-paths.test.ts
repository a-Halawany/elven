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
  authenticateProjections, c18ArtifactName, commandIdFor, comparePosture, compareSnapshots,
  crossCheckAuditTable, deriveIntentionalTransforms, deriveSeedSummary, orderedMigrations,
  parseResultReceipt, redactArgv, secretDigest, verifyAuditShapes, verifyChainRows,
  verifyCommandGraph, verifyCommandRecords, verifyCommandStreams, verifyIsolation,
  verifyManifestShape, verifyMigrationLedger, verifyOperationClosure, verifySeedFloor,
  verifySeedRecordClosed, verifySuiteReceipts, verifyTableUniverse,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-contract.mjs';
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
    const seedRecord = {
      admin: { principalId: 'adm', loginName: 'platform-admin' },
      tenants: [{ tenantId: 't1', name: 'alpha' }],
      domains: [{ domainId: 'd1', tenantId: 't1', name: 'alpha-dom0' }],
      principals: [{ principalId: 'p1', scope: 'TENANT', tenantId: 't1', domainId: null, loginName: 'l1', roleCode: 'tenant_admin' }],
      sessions: [{ sessionId: 's1', principalId: 'adm', familyId: 'f1' }],
      objects: [{ objectId: 'o1', tenantId: 't1', domainId: 'd1', correlation: 'c1' }],
      outbox: [{ eventId: 'e1', correlation: 'c1', eventType: 'x' }],
      decisions: ['11111111-1111-4111-8111-111111111111'],
      correlations: ['22222222-2222-4222-8222-222222222222'],
      post_upgrade_operation: { correlation: 'pc', decisionId: 'pd', action: 'objects.create', target: 'outbox:pe', tenantId: 't1', domainId: 'd1', principalId: 'adm', sessionId: 'ps', eventId: 'pe', effectRef: 'pe', effectKinds: ['outbox'] },
    };
    const before = {
      tables: {
        'tenancy.tenants': { rows: [{ id: 't1', name: 'alpha' }] },
        'tenancy.domains': { rows: [{ id: 'd1', tenant_id: 't1', name: 'alpha-dom0' }] },
        'identity.principals': { rows: [{ id: 'adm', scope: 'PLATFORM', tenant_id: null, domain_id: null, login_name: 'platform-admin', display_name: 'platform-admin' }, { id: 'p1', scope: 'TENANT', tenant_id: 't1', domain_id: null, login_name: 'l1', display_name: 'l1' }] },
        'identity.role_bindings': { rows: [{ principal_id: 'adm', role_code: 'platform_admin', revoked_at: null }, { principal_id: 'p1', role_code: 'tenant_admin', revoked_at: null }] },
        'identity.sessions': { rows: [{ id: 's1', principal_id: 'adm' }] },
        'objects.canonical_objects': { rows: [{ object_id: 'o1', tenant_id: 't1', domain_id: 'd1' }] },
        'objects.object_outbox': { rows: [{ id: 'e1', correlation_id: 'c1', event_type: 'x' }] },
        'policy.policy_decisions': { rows: [{ id: '11111111-1111-4111-8111-111111111111', correlation_id: '22222222-2222-4222-8222-222222222222' }] },
      },
      audit: { events: [{ partition_id: 'platform', audit_seq: 1, correlation_id: '22222222-2222-4222-8222-222222222222' }] },
    };
    const finalSnap = {
      tables: {
        'identity.sessions': { rows: [...before.tables['identity.sessions'].rows, { id: 'ps', principal_id: 'adm' }] },
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
    ['a missing role binding', (w: any) => { w.before.tables['identity.role_bindings'].rows.pop(); }, /has no live 'tenant_admin' role binding/],
    ['an unrecorded audit correlation', (w: any) => { w.before.audit.events.push({ partition_id: 'platform', audit_seq: 2, correlation_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }); }, /unrecorded correlation/],
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
