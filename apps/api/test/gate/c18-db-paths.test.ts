/**
 * C18.1 — hermetic controls for the dual-path contract and runner CLI.
 *
 * The DEEP mutation and differential controls run in test/gate/c18-mutation-controls.ctl.ts
 * against a GENUINE archive inside the C18 gate step (the old synthetic "positive" fixture —
 * which passed with a fake SHA and arbitrary suite text — is deleted; that false pass is now
 * itself a differential control). This file keeps the layer that needs no database: contract
 * falsifiability on typed fixtures, redaction, transform derivation, CLI fail-closed
 * behaviour, and the parsed-YAML CI wiring.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  ISOLATION_FIELDS, HISTORICAL_LAST, LATEST_LAST, POSTURE_CATEGORIES, SECRET_CLASSES,
  SUITE_MATRIX,
  c18ArtifactName, comparePosture, compareSnapshots, deriveIntentionalTransforms,
  orderedMigrations, parseResultReceipt, redactArgv, secretDigest, verifyChainRows,
  verifyIsolation, verifyManifestShape, verifyMigrationLedger, verifyOperationClosure,
  verifySeedFloor, verifySuiteReceipts,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-contract.mjs';
import { auditRowHash, jcsCanonicalize } from '@eye/contracts';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs');
const MIGRATIONS = join(REPO, 'apps', 'api', 'migrations');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

describe('C18.1 — secrets never enter evidence structures', () => {
  it('argv redaction replaces every class with a structured placeholder', () => {
    const secrets: Array<[string, string]> = [['a:EYE_DB_PASSWORD', 'deadbeef01'], ['a:EYE_REDIS_PASSWORD', 'cafef00d02']];
    const argv = ['docker', 'run', '-e', 'POSTGRES_PASSWORD=deadbeef01', 'redis-server', '--requirepass', 'cafef00d02'];
    const red = redactArgv(argv, secrets);
    expect(red.join(' ')).not.toContain('deadbeef01');
    expect(red.join(' ')).not.toContain('cafef00d02');
    expect(red).toContain('-e');
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

describe('C18.1 — intentional transforms are DERIVED from source migrations', () => {
  it('derives exactly the 0013 tables and 0016 bootstrap-claim columns, with DDL semantics', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const t = deriveIntentionalTransforms(MIGRATIONS, files);
    expect(t.tablesAdded.map((x: { table: string }) => x.table)).toEqual(['ctx.operation', 'ctx.operation_effect']);
    expect(t.columnsAdded.map((x: { table: string; column: string }) => `${x.table}.${x.column}`)).toEqual([
      'identity.bootstrap_claim.consumed', 'identity.bootstrap_claim.consumed_at',
      'identity.bootstrap_claim.nonce',
    ]);
    const consumed = t.columnsAdded.find((x: { column: string }) => x.column === 'consumed') as { not_null: boolean; default: string };
    expect(consumed.not_null).toBe(true);
    expect(consumed.default).toBe('false');
  });
});

describe('C18.1 — contract falsifiability on typed fixtures', () => {
  const event = (partition: string, seq: number, prev: string, body: Record<string, unknown>) => {
    const jcs = jcsCanonicalize(body);
    return {
      partition_id: partition, audit_seq: seq, event_jcs: jcs, previous_hash: prev,
      row_hash: auditRowHash({ partitionId: partition, auditSeq: seq, previousHash: prev, event: body as never }),
      hash_alg_version: 'eye-audit-v1', correlation_id: String(body['correlation_id']),
      policy_decision_id: (body['policy_decision_id'] as string | null) ?? null,
    };
  };
  const chainFixture = () => {
    const e1 = event('platform', 1, '0'.repeat(64), { n: 1, correlation_id: 'c-1', policy_decision_id: null });
    const e2 = event('platform', 2, e1.row_hash, { n: 2, correlation_id: 'c-2', policy_decision_id: null });
    return {
      events: [e1, e2],
      heads: [{ partition_id: 'platform', next_seq: 3, head_hash: e2.row_hash, frozen: false }],
    };
  };

  it('a production-hashed chain passes; every forgery axis is detected', () => {
    const good = chainFixture();
    expect(verifyChainRows({ ...good, jcs: jcsCanonicalize, rowHash: auditRowHash })).toEqual([]);
    const nonCanonical = chainFixture();
    nonCanonical.events[0]!.event_jcs = '{"n": 1, "correlation_id": "c-1", "policy_decision_id": null}';
    expect(verifyChainRows({ ...nonCanonical, jcs: jcsCanonicalize, rowHash: auditRowHash }).join('\n'))
      .toMatch(/stored event_jcs is NOT canonical|row_hash does not recompute/);
    const wrongHash = chainFixture();
    wrongHash.events[1]!.row_hash = sha256('forged');
    expect(verifyChainRows({ ...wrongHash, jcs: jcsCanonicalize, rowHash: auditRowHash }).join('\n'))
      .toMatch(/row_hash does not recompute under the production formula/);
    const ghostHead = chainFixture();
    ghostHead.events = [];
    expect(verifyChainRows({ ...ghostHead, jcs: jcsCanonicalize, rowHash: auditRowHash }).join('\n'))
      .toMatch(/claims history .* but the partition has no rows/);
  });

  it('the seed floor rejects an emptied world on every axis', () => {
    const emptySnap = { tables: {}, audit: { events: [], heads: [] } };
    const problems = verifySeedFloor(emptySnap as never).join('\n');
    expect(problems).toMatch(/tenancy\.tenants has 0/);
    expect(problems).toMatch(/platform audit partition has 0/);
    expect(problems).toMatch(/no tenant audit partition exists/);
  });

  it('posture comparison requires the EXACT category set and nonempty authority surfaces', () => {
    const full = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, [`${c}-entry`]]));
    expect(comparePosture(full, structuredClone(full))).toEqual([]);
    expect(comparePosture({}, {}).join('\n')).toMatch(/not the exact code-owned set/);
    const empties = Object.fromEntries(POSTURE_CATEGORIES.map((c: string) => [c, []]));
    expect(comparePosture(empties, structuredClone(empties)).join('\n'))
      .toMatch(/cannot be vacuously equal/);
    const diverged = structuredClone(full);
    diverged['table_grants'] = ['other'];
    expect(comparePosture(full, diverged).join('\n')).toMatch(/'table_grants' differs/);
  });

  it('FK definition changes and missing PKs are detected even with identical local values', () => {
    const mk = () => ({
      tables: { 't.x': { pk: ['id'], columns: ['id'], rows: [{ id: 1 }] } },
      fks: [{
        constraint: 't.x.fk', from: 't.x', to: 't.y',
        definition: 'FOREIGN KEY (id) REFERENCES t.y(id) ON DELETE CASCADE',
        validated: true, deferrable: false, pairs_count: 1, pairs_digest: sha256('p'),
      }],
    });
    const transforms = { tablesAdded: [], columnsAdded: [] };
    expect(compareSnapshots(mk() as never, mk() as never, transforms as never)).toEqual([]);
    const retarget = mk();
    retarget.fks[0]!.definition = 'FOREIGN KEY (id) REFERENCES evil.shadow(id) ON DELETE CASCADE';
    expect(compareSnapshots(mk() as never, retarget as never, transforms as never).join('\n'))
      .toMatch(/DEFINITION changed across the upgrade/);
    const actions = mk();
    actions.fks[0]!.definition = 'FOREIGN KEY (id) REFERENCES t.y(id) ON DELETE SET NULL';
    expect(compareSnapshots(mk() as never, actions as never, transforms as never).join('\n'))
      .toMatch(/DEFINITION changed across the upgrade/);
    const noPk = mk();
    noPk.tables['t.x']!.pk = [];
    expect(compareSnapshots(noPk as never, mk() as never, transforms as never).join('\n'))
      .toMatch(/has NO PRIMARY KEY/);
  });

  it('isolation typing rejects missing/extra keys, shared instances and credential collisions', () => {
    const creds = () => Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`a:${k}`)]));
    const mk = (over: Record<string, unknown> = {}) => ({
      path: 'path-a-upgraded', container_id: 'ida', container_name: 'ca',
      redis_container_id: 'idra', redis_container: 'cra', database: 'da', port: 1,
      redis_port: 2, postgres_image: 'p', redis_image: 'r', credential_digests: creds(), ...over,
    });
    const b = mk({
      path: 'path-b-virgin', container_id: 'idb', container_name: 'cb', redis_container_id: 'idrb',
      redis_container: 'crb', database: 'db', port: 3, redis_port: 4,
      credential_digests: Object.fromEntries(SECRET_CLASSES.map((k: string) => [k, sha256(`b:${k}`)])),
    });
    expect(verifyIsolation(mk() as never, b as never)).toEqual([]);
    expect(verifyIsolation(mk() as never, { ...b, redis_container: 'cra', redis_container_id: 'idra' } as never).join('\n'))
      .toMatch(/SHARED redis_container/);
    const missing = structuredClone(b) as Record<string, unknown>;
    delete missing['redis_container_id'];
    expect(verifyIsolation(mk() as never, missing as never).join('\n')).toMatch(/not the exact typed set/);
    const sharedCred = structuredClone(b);
    (sharedCred.credential_digests as Record<string, string>)['EYE_DB_PASSWORD'] = (mk().credential_digests as Record<string, string>)['EYE_DB_PASSWORD']!;
    expect(verifyIsolation(mk() as never, sharedCred as never).join('\n')).toMatch(/shared the 'EYE_DB_PASSWORD' credential/);
    expect(ISOLATION_FIELDS).toContain('redis_container_id');
  });

  it('the manifest shape and RESULT receipt are typed and exact', () => {
    expect(verifyManifestShape(null).join('\n')).toMatch(/not an object/);
    expect(verifyManifestShape({ gate: 'C18' }).join('\n')).toMatch(/MISSING field 'mode'/);
    expect(verifyManifestShape({ gate: 'C19' }).join('\n')).toMatch(/field 'gate' is malformed/);
    const manifest = { mode: 'final', source_sha: 'a'.repeat(40) };
    expect(parseResultReceipt(
      `outcome: PASS\ngate: C18\nmode: final\nsource_sha: ${'a'.repeat(40)}\npaths: path-a-upgraded, path-b-virgin\n`,
      manifest as never,
    )).toEqual([]);
    expect(parseResultReceipt('outcome: PASS\n', manifest as never).join('\n')).toMatch(/RESULT receipt line 2/);
    expect(parseResultReceipt(
      `outcome: PASS\ngate: C18\nmode: final\nsource_sha: ${'a'.repeat(40)}\npaths: path-a-upgraded, path-b-virgin\nsmuggled: line\n`,
      manifest as never,
    ).join('\n')).toMatch(/trailing content/);
  });

  it('the honest suite matrix names acceptance per INSTANCE, never per path', () => {
    expect(SUITE_MATRIX.acceptance.runs_on).toEqual(['instance-a-server', 'instance-b-server']);
    expect(SUITE_MATRIX.acceptance.reason).toContain('SELF-MANAGED');
    expect(SUITE_MATRIX.integration.runs_on).toEqual(['path-a-upgraded', 'path-b-virgin']);
    expect(SUITE_MATRIX['unit-gate-hermetic'].runs_on).toEqual(['once-only']);
    expect(SUITE_MATRIX['browser-regression'].runs_on).toEqual(['once-only']);
  });

  it('suite receipts with missing tuples or arbitrary self-declarations are rejected', () => {
    expect(verifySuiteReceipts(SUITE_MATRIX, []).join('\n')).toMatch(/has no receipt for path-a-upgraded/);
    const half = [{
      suite: 'integration', path: 'path-a-upgraded', command_id: 'x', argv_redacted: ['echo'],
      timeout_ms: 1, exit_status: 0, signal: null, stdout_file: 'a', stderr_file: 'b',
      exit_file: 'c', stdout_bytes: 1, stdout_sha256: 'd', stderr_bytes: 0, stderr_sha256: 'e',
      tests_passed: 1, tests_total: 1,
    }];
    expect(verifySuiteReceipts(SUITE_MATRIX, half as never).join('\n')).toMatch(/is not the matrix command/);
  });

  it('operation closure demands the recorded chain, not inference from suite success', () => {
    const snap = { tables: { 'ctx.operation': { rows: [] }, 'ctx.operation_effect': { rows: [] }, 'policy.policy_decisions': { rows: [] } }, audit: { events: [] } };
    expect(verifyOperationClosure({ snapshot: snap as never, expected: null }).join('\n'))
      .toMatch(/closure claim is unproven/);
    expect(verifyOperationClosure({
      snapshot: snap as never,
      expected: { correlation: 'c', decisionId: 'd', action: 'a', target: 't', tenantId: 'x', principalId: 'p' } as never,
    }).join('\n')).toMatch(/no row for the recorded post-upgrade correlation/);
  });

  it('migration ledger falsification axes stay closed', () => {
    const { files } = orderedMigrations(readdirSync(MIGRATIONS)) as { files: string[] };
    const digests = new Map(files.map((f) => [f, sha256(readFileSync(join(MIGRATIONS, f)))]));
    const ledger = files.filter((f) => f.slice(0, 4) <= HISTORICAL_LAST)
      .map((filename) => ({ filename, digest: digests.get(filename)!, applied_at: 't' }));
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger, expectLast: HISTORICAL_LAST })).toEqual([]);
    const forged = structuredClone(ledger);
    forged[3]!.digest = sha256('evil');
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: forged, expectLast: HISTORICAL_LAST }).join('\n'))
      .toMatch(/tracked bytes hash to/);
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: ledger.slice(1), expectLast: HISTORICAL_LAST }).join('\n'))
      .toMatch(/order broken|requires exactly/);
    expect(LATEST_LAST).toBe('0021');
  });
});

describe('C18.1 — runner CLI fails closed (real process)', () => {
  const cli = (args: string[]) => spawnSync('node', [RUNNER, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000 });
  it.each([
    [['run'], /--out is required/],
    [['run', '--out', join(tmpdir(), 'x'), '--bogus'], /unknown argument --bogus|--bogus requires a value/],
    [['run', '--out', join(tmpdir(), 'x'), '--final'], /final mode requires --expected-sha/],
    [['run', '--out', join(tmpdir(), 'x'), '--final', '--expected-sha', 'nothex'], /final mode requires --expected-sha/],
    [['run', '--out', join(tmpdir(), 'x'), '--final', '--expected-sha', 'b'.repeat(40), '--skip-suites'], /refuses every development seam/],
    [['run', '--out', join(tmpdir(), 'x'), '--final', '--expected-sha', 'b'.repeat(40), '--keep-containers'], /refuses every development seam/],
    [['run', '--out', join(tmpdir(), `c18-wrongsha-${process.pid}`), '--final', '--expected-sha', 'b'.repeat(40)], /HEAD .* != --expected-sha/],
    [['verify'], /verify requires --zip and --root/],
    [['verify', '--zip', '/nope.zip', '--root', '.', '--evil'], /unknown argument --evil|--evil requires a value/],
    [['verify', '--zip', '/nope.zip', '--root', '.', '--require-hosted'], /does not exist|demands online/],
    [['frobnicate'], /usage:/],
  ])('rejects %j', (args, pattern) => {
    const r = cli(args as string[]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(pattern);
  });
});

describe('C18.1 — CI wiring', () => {
  const CI = parseYaml(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Array<Record<string, unknown>> }>;
  };
  const steps = () => CI.jobs['build-test']!.steps;

  it('the obsolete scripts/verify-db-paths.sh stays GONE and the tracked runner exists', () => {
    expect(readdirSync(join(REPO, 'scripts'))).not.toContain('verify-db-paths.sh');
    expect(readdirSync(join(REPO, 'scripts', 'gate'))).toContain('c18-db-paths.mjs');
  });

  it('the C18 gate runs blocking, final, SHA-bound, then verifies and runs the mutation controls', () => {
    const gate = steps().find((s) => String(s['name'] ?? '').includes('C18 dual-path database history gate'));
    expect(gate).toBeDefined();
    expect(gate!['id']).toBe('c18_gate');
    expect(gate!['if']).toBeUndefined();
    const run = String(gate!['run']);
    expect(run).toContain('--final --expected-sha "$GITHUB_SHA"');
    expect(run).toContain('c18-db-paths.mjs verify');
    expect(run).toContain('vitest.c18.config.ts');
    expect(run).toContain('C18_ARCHIVE');
  });

  it('the digest-bound C18 artifact upload is guarded; the diagnostics upload is always()', () => {
    const bound = steps().find((s) => String(s['name'] ?? '') === 'Upload the C18 evidence archive');
    expect(bound).toBeDefined();
    const bw = bound!['with'] as Record<string, unknown>;
    expect(bw['name']).toBe('c18-db-paths-evidence-a${{ github.run_attempt }}-${{ env.C18_ZIP_SHA256 }}');
    expect(bw['path']).toBe('${{ runner.temp }}/c18-artifact');
    expect(bw['if-no-files-found']).toBe('error');
    expect(bound!['if']).toBe("always() && steps.c18_gate.outcome == 'success'");
    expect(c18ArtifactName('1', 'a'.repeat(64))).toBe(`c18-db-paths-evidence-a1-${'a'.repeat(64)}`);

    const diag = steps().find((s) => String(s['name'] ?? '') === 'Upload C18 diagnostics');
    expect(diag).toBeDefined();
    const dw = diag!['with'] as Record<string, unknown>;
    expect(dw['name']).toBe('c18-diagnostics-a${{ github.run_attempt }}');
    expect(dw['path']).toBe('${{ runner.temp }}/c18-out');
    expect(diag!['if']).toBe('always()');
  });
});
