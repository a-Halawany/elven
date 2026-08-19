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
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  HISTORICAL_LAST, LATEST_LAST, POSTURE_CATEGORIES, SECRET_CLASSES, SUITE_MATRIX,
  TABLE_UNIVERSE_HISTORICAL, TABLE_UNIVERSE_LATEST,
  authenticateProjections, c18ArtifactName, comparePosture, compareSnapshots,
  deriveIntentionalTransforms, orderedMigrations, parseResultReceipt, redactArgv, secretDigest,
  verifyAuditShapes, verifyChainRows, verifyIsolation, verifyManifestShape,
  verifyMigrationLedger, verifyOperationClosure, verifySeedFloor, verifySuiteReceipts,
  verifyTableUniverse,
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

describe('C18.1.1 — operation closure exactness', () => {
  const expected = { correlation: 'c', decisionId: 'd', action: 'objects.create', target: 'outbox:o', tenantId: 't', domainId: 'dm', principalId: 'p', sessionId: 's', effectRef: 'o', effectKinds: ['outbox'] };
  const snap = () => ({
    tables: {
      'ctx.operation': { rows: [{ operation_id: 'op', correlation_id: 'c', decision_id: 'd', principal_id: 'p', tenant_id: 't', domain_id: 'dm', session_id: 's', action: 'objects.create', target: 'outbox:o', finalized: true, expected_outcome: 'success' }] },
      'ctx.operation_effect': { rows: [{ operation_id: 'op', effect_kind: 'outbox', effect_ref: 'o' }] },
      'policy.policy_decisions': { rows: [{ id: 'd', decision: 'allow', action: 'objects.create', correlation_id: 'c' }] },
    },
    audit: { events: [{ partition_id: 'tenant:t', audit_seq: 1, correlation_id: 'c', policy_decision_id: 'd', event_jcs: jcsCanonicalize({ outcome: 'success', action: 'objects.create', tenant_id: 't', actor: 'principal:p' }) }] },
  });
  it('the exact chain passes', () => {
    expect(verifyOperationClosure({ snapshot: snap() as never, expected: expected as never })).toEqual([]);
  });
  it.each([
    ['unfinalized', (s: any) => { s.tables['ctx.operation'].rows[0].finalized = false; }, /not finalized/],
    ['failure outcome', (s: any) => { s.tables['ctx.operation'].rows[0].expected_outcome = 'failure'; }, /expected_outcome/],
    ['wrong effect kind', (s: any) => { s.tables['ctx.operation_effect'].rows[0].effect_kind = 'evil'; }, /effect kinds/],
    ['non-allow decision', (s: any) => { s.tables['policy.policy_decisions'].rows[0].decision = 'deny'; }, /not an allow/],
    ['forged audit actor', (s: any) => { s.audit.events[0].event_jcs = jcsCanonicalize({ outcome: 'success', action: 'objects.create', tenant_id: 't', actor: 'principal:evil' }); }, /actor/],
    ['extra conflicting operation', (s: any) => { s.tables['ctx.operation'].rows.push({ ...s.tables['ctx.operation'].rows[0] }); }, /exactly one is required/],
  ])('detects %s', (_l, mutate, pattern) => {
    const s = snap(); mutate(s);
    expect(verifyOperationClosure({ snapshot: s as never, expected: expected as never }).join('\n')).toMatch(pattern);
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
