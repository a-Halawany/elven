/**
 * C18 — non-vacuous behavioural and mutation controls for the dual-path database proof.
 *
 * Written against the CODE-OWNED contract (scripts/gate/lib/c18-contract.mjs) and the real
 * verifier (scripts/gate/c18-db-paths.mjs verifyEvidence). Every control below proves that a
 * specific alteration or omission — data, relationships, audit chains, migration order and
 * digests, privileges, policies, grants, credentials, suite receipts, archive members — is
 * DETECTED. The full producer runs as the blocking CI gate; these controls make its judgement
 * layer falsifiable without provisioning databases.
 */
import { describe, expect, it } from 'vitest';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  ALLOWED_TRANSFORMS, GENESIS_HASH, HISTORICAL_LAST, LATEST_LAST, SUITE_MATRIX,
  compareSnapshots, comparePosture, orderedMigrations, verifyChainRows, verifyIsolation,
  verifyLinkage, verifyMigrationLedger, verifySuiteReceipts,
  // eslint-disable-next-line import/no-relative-packages
} from '../../../../scripts/gate/lib/c18-contract.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence } from '../../../../scripts/gate/c18-db-paths.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const SHA = 'a'.repeat(40);

const trackedDigests = () => {
  const dir = join(REPO, 'apps', 'api', 'migrations');
  const { files } = orderedMigrations(readdirSync(dir)) as { files: string[] };
  return new Map(files.map((f) => [f, sha256(readFileSync(join(dir, f)))]));
};

type Snapshot = {
  label: string;
  tables: Record<string, { pk: string[]; columns: string[]; rows: Array<Record<string, unknown>>; row_count?: number }>;
  fks: Array<{ constraint: string; from: string; to: string; pairs_count: number; pairs_digest: string }>;
  posture: Record<string, unknown>;
  ledger: Array<{ filename: string; digest: string; applied_at: string }>;
  audit: { events: Array<Record<string, unknown>>; heads: Array<Record<string, unknown>> };
};

/** A minimal, fully consistent fixture world for the contract functions and the verifier. */
function fixtures() {
  const digests = trackedDigests();
  const ledgerRows = (upTo: string) => [...digests.entries()]
    .filter(([f]) => f.slice(0, 4) <= upTo)
    .map(([filename, digest]) => ({ filename, digest, applied_at: `2026-08-18 00:00:00+00` }));
  const h1 = sha256('event-1');
  const h2 = sha256('event-2');
  const events = [
    {
      partition_id: 'platform', audit_seq: 1, event_jcs: '{"n":1}', previous_hash: GENESIS_HASH,
      row_hash: h1, hash_alg_version: 'eye-audit-v1', correlation_id: 'c-1', policy_decision_id: 'd-1',
    },
    {
      partition_id: 'platform', audit_seq: 2, event_jcs: '{"n":2}', previous_hash: h1,
      row_hash: h2, hash_alg_version: 'eye-audit-v1', correlation_id: 'c-2', policy_decision_id: null,
    },
  ];
  const heads = [{ partition_id: 'platform', next_seq: 3, head_hash: h2, frozen: false }];
  const posture = { roles: [{ role: 'eye_app', login: true }], policies: ['tenancy.tenants|isolation'] };
  const before: Snapshot = {
    label: 'a-before',
    tables: {
      'tenancy.tenants': { pk: ['id'], columns: ['id', 'name'], rows: [{ id: 't1', name: 'alpha' }] },
      'identity.bootstrap_claim': { pk: ['id'], columns: ['id'], rows: [{ id: 1 }] },
      'policy.policy_decisions': { pk: ['id'], columns: ['id'], rows: [{ id: 'd-1' }] },
      'objects.object_outbox': {
        pk: ['id'], columns: ['id', 'correlation_id', 'status'],
        rows: [{ id: 'o1', correlation_id: 'c-1', status: 'published' }],
      },
    },
    fks: [{
      constraint: 'tenancy.domains.domains_tenant_fkey', from: 'tenancy.domains', to: 'tenancy.tenants',
      pairs_count: 1, pairs_digest: sha256('["t1"]'),
    }],
    posture, ledger: ledgerRows(HISTORICAL_LAST), audit: { events, heads },
  };
  const after: Snapshot = structuredClone(before);
  after.label = 'a-after';
  after.ledger = ledgerRows(LATEST_LAST);
  // The pinned intentional transforms, exactly:
  after.tables['identity.bootstrap_claim'] = {
    pk: ['id'], columns: ['id', 'nonce', 'consumed', 'consumed_at'],
    rows: [{ id: 1, nonce: 'n', consumed: true, consumed_at: 't' }],
  };
  after.tables['ctx.operation'] = { pk: ['id'], columns: ['id'], rows: [] };
  after.tables['ctx.operation_effect'] = { pk: ['id'], columns: ['id'], rows: [] };
  const virgin: Snapshot = {
    label: 'b-virgin',
    tables: structuredClone(after.tables), fks: structuredClone(after.fks),
    posture: structuredClone(posture), ledger: ledgerRows(LATEST_LAST),
    audit: { events: [], heads: [] },
  };
  virgin.tables['tenancy.tenants'].rows = [];
  virgin.tables['policy.policy_decisions'].rows = [];
  virgin.tables['objects.object_outbox'].rows = [];
  return { digests, before, after, virgin };
}

describe('C18 — the code-owned contract is complete and falsifiable', () => {
  it('the suite matrix states where every suite runs, including honest once-only entries', () => {
    expect(Object.keys(SUITE_MATRIX).sort()).toEqual(
      ['acceptance', 'browser-regression', 'integration', 'unit-gate-hermetic'],
    );
    for (const spec of Object.values(SUITE_MATRIX)) {
      expect(spec.runs_on.length).toBeGreaterThan(0);
      expect(typeof spec.reason).toBe('string');
    }
    expect(SUITE_MATRIX.acceptance.runs_on).toEqual(['path-a-upgraded', 'path-b-virgin']);
    expect(SUITE_MATRIX.integration.runs_on).toEqual(['path-a-upgraded', 'path-b-virgin']);
    expect(SUITE_MATRIX['unit-gate-hermetic'].runs_on).toEqual(['once-only']);
    expect(SUITE_MATRIX['browser-regression'].runs_on).toEqual(['once-only']);
  });

  it('the historical/latest boundary is contract-owned and matches the tracked migrations', () => {
    const digests = trackedDigests();
    expect(digests.size).toBe(21);
    expect(HISTORICAL_LAST).toBe('0012');
    expect(LATEST_LAST).toBe('0021');
    expect([...digests.keys()][11].startsWith('0012')).toBe(true);
  });

  it('a consistent fixture world PASSES every contract check (the controls are non-vacuous)', () => {
    const { digests, before, after, virgin } = fixtures();
    expect(compareSnapshots(before, after, ALLOWED_TRANSFORMS)).toEqual([]);
    expect(verifyChainRows({ events: before.audit.events, heads: before.audit.heads })).toEqual([]);
    expect(verifyChainRows({ events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events })).toEqual([]);
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: before.ledger, expectLast: HISTORICAL_LAST })).toEqual([]);
    expect(verifyMigrationLedger({ trackedDigests: digests, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger })).toEqual([]);
    expect(comparePosture(after.posture, virgin.posture)).toEqual([]);
    expect(verifyLinkage({
      auditEvents: after.audit.events,
      decisions: after.tables['policy.policy_decisions'].rows as Array<{ id: string }>,
      outbox: after.tables['objects.object_outbox'].rows,
    })).toEqual([]);
  });

  it.each([
    ['an altered value', (a: Snapshot) => { a.tables['tenancy.tenants'].rows[0]['name'] = 'TAMPERED'; }, /column 'name' changed/],
    ['a lost row', (a: Snapshot) => { a.tables['tenancy.tenants'].rows = []; }, /was LOST across the upgrade/],
    ['a re-keyed identity', (a: Snapshot) => { a.tables['tenancy.tenants'].rows[0]['id'] = 't9'; }, /was LOST across the upgrade/],
    ['a disappeared table', (a: Snapshot) => { delete a.tables['tenancy.tenants']; }, /DISAPPEARED across the upgrade/],
    ['a disappeared column', (a: Snapshot) => { a.tables['tenancy.tenants'].columns = ['id']; }, /column 'tenancy.tenants.name' DISAPPEARED/],
    ['an un-allow-listed new table', (a: Snapshot) => { a.tables['evil.stowaway'] = { pk: ['id'], columns: ['id'], rows: [] }; }, /appeared without being an allow-listed/],
    ['an un-allow-listed new column', (a: Snapshot) => { a.tables['tenancy.tenants'].columns.push('backdoor'); }, /appeared without being an allow-listed/],
    ['a changed FK pair-set', (a: Snapshot) => { a.fks[0].pairs_digest = sha256('forged'); }, /pair-set changed/],
    ['a dropped FK constraint', (a: Snapshot) => { a.fks = []; }, /FK .*DISAPPEARED/],
  ])('preservation violation is DETECTED: %s', (_label, mutate, pattern) => {
    const { before, after } = fixtures();
    mutate(after);
    expect(compareSnapshots(before, after, ALLOWED_TRANSFORMS).join('\n')).toMatch(pattern);
  });

  it.each([
    ['a sequence gap', (s: Snapshot) => { s.audit.events[1]!['audit_seq'] = 3; }, /GAP at seq/],
    ['a broken hash link', (s: Snapshot) => { s.audit.events[1]!['previous_hash'] = sha256('x'); }, /previous_hash does not chain/],
    ['a disagreeing head', (s: Snapshot) => { s.audit.heads[0]!['head_hash'] = sha256('y'); }, /head .*disagrees/],
    ['a missing head', (s: Snapshot) => { s.audit.heads = []; }, /has no chain head/],
  ])('audit-chain violation is DETECTED: %s', (_label, mutate, pattern) => {
    const { after } = fixtures();
    mutate(after);
    expect(verifyChainRows({ events: after.audit.events, heads: after.audit.heads }).join('\n')).toMatch(pattern);
  });

  it('a REWRITTEN pre-upgrade audit row is detected across the upgrade', () => {
    const { before, after } = fixtures();
    after.audit.events[0]!['event_jcs'] = '{"n":"forged"}';
    expect(verifyChainRows({
      events: after.audit.events, heads: after.audit.heads, priorEvents: before.audit.events,
    }).join('\n')).toMatch(/canonical bytes or hash changed/);
  });

  it.each([
    ['a broken policy linkage', (s: Snapshot) => { s.tables['policy.policy_decisions'].rows = []; }, /policy decision .*does not exist/],
    ['an orphaned outbox effect', (s: Snapshot) => { s.tables['objects.object_outbox'].rows[0]!['correlation_id'] = 'c-none'; }, /no corresponding audit event/],
  ])('policy→operation→effect violation is DETECTED: %s', (_label, mutate, pattern) => {
    const { after } = fixtures();
    mutate(after);
    expect(verifyLinkage({
      auditEvents: after.audit.events,
      decisions: after.tables['policy.policy_decisions'].rows as Array<{ id: string }>,
      outbox: after.tables['objects.object_outbox'].rows,
    }).join('\n')).toMatch(pattern);
  });

  it.each([
    ['a changed digest', (l: Snapshot['ledger']) => { l[3]!.digest = sha256('evil'); }, /tracked bytes hash to/],
    ['a missing migration', (l: Snapshot['ledger']) => { l.splice(5, 1); }, /requires exactly|order broken/],
    ['a swapped filename/digest binding', (l: Snapshot['ledger']) => { const t = l[2]!.filename; l[2]!.filename = l[3]!.filename; l[3]!.filename = t; }, /tracked bytes hash to/],
    ['an untracked filename', (l: Snapshot['ledger']) => { l[0]!.filename = '0001_evil.sql'; }, /not a tracked migration/],
  ])('migration-ledger violation is DETECTED: %s', (_label, mutate, pattern) => {
    const { digests, before } = fixtures();
    mutate(before.ledger);
    expect(verifyMigrationLedger({
      trackedDigests: digests, ledger: before.ledger, expectLast: HISTORICAL_LAST,
    }).join('\n')).toMatch(pattern);
  });

  it('a re-recorded historical row across the upgrade is DETECTED', () => {
    const { digests, before, after } = fixtures();
    after.ledger[0]!.applied_at = '2027-01-01 00:00:00+00';
    expect(verifyMigrationLedger({
      trackedDigests: digests, ledger: after.ledger, expectLast: LATEST_LAST, priorLedger: before.ledger,
    }).join('\n')).toMatch(/re-recorded across the upgrade/);
  });

  it.each([
    ['a grant/privilege delta', (p: Record<string, unknown>) => { p['roles'] = [{ role: 'eye_app', login: false }]; }],
    ['a dropped RLS policy', (p: Record<string, unknown>) => { p['policies'] = []; }],
    ['an extra posture category', (p: Record<string, unknown>) => { p['extra_surface'] = ['x']; }],
  ])('posture divergence between histories is DETECTED: %s', (_label, mutate) => {
    const { after, virgin } = fixtures();
    mutate(after.posture);
    expect(comparePosture(after.posture, virgin.posture).length).toBeGreaterThan(0);
  });

  it('suite-receipt violations are DETECTED: missing, failing and out-of-matrix receipts', () => {
    const good = [
      { suite: 'acceptance', path: 'path-a-upgraded', exit_status: 0, stdout_file: 'x', stderr_file: 'y' },
      { suite: 'acceptance', path: 'path-b-virgin', exit_status: 0, stdout_file: 'x', stderr_file: 'y' },
      { suite: 'integration', path: 'path-a-upgraded', exit_status: 0, stdout_file: 'x', stderr_file: 'y' },
      { suite: 'integration', path: 'path-b-virgin', exit_status: 0, stdout_file: 'x', stderr_file: 'y' },
    ];
    expect(verifySuiteReceipts(SUITE_MATRIX, good)).toEqual([]);
    expect(verifySuiteReceipts(SUITE_MATRIX, good.slice(1)).join('\n')).toMatch(/has no receipt for path-a-upgraded/);
    const failing = structuredClone(good);
    failing[2]!.exit_status = 1;
    expect(verifySuiteReceipts(SUITE_MATRIX, failing).join('\n')).toMatch(/recorded exit 1/);
    const extra = [...good, { suite: 'browser-regression', path: 'path-a-upgraded', exit_status: 0, stdout_file: 'x', stderr_file: 'y' }];
    expect(verifySuiteReceipts(SUITE_MATRIX, extra).join('\n')).toMatch(/not in the code-owned matrix/);
  });

  it('credential or instance sharing between the paths is DETECTED', () => {
    const a = {
      container_name: 'c18-a-1-pg', database: 'eye_a_1', port: 55001,
      credential_digests: { EYE_DB_PASSWORD: sha256('a'), EYE_DB_APP_PASSWORD: sha256('b') },
    };
    const b = {
      container_name: 'c18-b-1-pg', database: 'eye_b_1', port: 55002,
      credential_digests: { EYE_DB_PASSWORD: sha256('c'), EYE_DB_APP_PASSWORD: sha256('d') },
    };
    expect(verifyIsolation(a, b)).toEqual([]);
    expect(verifyIsolation(a, { ...b, database: a.database }).join('\n')).toMatch(/shared a database name/);
    expect(verifyIsolation(a, { ...b, port: a.port }).join('\n')).toMatch(/shared a database port/);
    expect(verifyIsolation(a, {
      ...b, credential_digests: { ...b.credential_digests, EYE_DB_PASSWORD: a.credential_digests.EYE_DB_PASSWORD },
    }).join('\n')).toMatch(/shared the 'EYE_DB_PASSWORD' credential/);
  });
});

describe('C18 — the delivered archive itself is falsifiable (real verifier, real archives)', () => {
  /** Build a complete, internally consistent synthetic evidence archive. */
  function buildArchive(mutate: (dir: string) => void = () => {}, postMutate: (dir: string) => void = () => {}) {
    const d = mkdtempSync(join(tmpdir(), 'c18-ctl-'));
    const { before, after, virgin, digests } = fixtures();
    const receipts = {
      'path-a-upgraded': {
        path: 'path-a-upgraded', container_name: 'c18-a-1-pg', redis_container: 'c18-a-1-redis',
        database: 'eye_a_1', port: 55001, redis_port: 55101,
        credential_digests: { EYE_DB_PASSWORD: sha256('pa') },
      },
      'path-b-virgin': {
        path: 'path-b-virgin', container_name: 'c18-b-1-pg', redis_container: 'c18-b-1-redis',
        database: 'eye_b_1', port: 55002, redis_port: 55102,
        credential_digests: { EYE_DB_PASSWORD: sha256('pb') },
      },
    };
    const suiteReceipts = [
      { suite: 'acceptance', path: 'path-a-upgraded', exit_status: 0, stdout_file: 'raw/1.stdout.txt', stderr_file: 'raw/1.stderr.txt' },
      { suite: 'integration', path: 'path-a-upgraded', exit_status: 0, stdout_file: 'raw/2.stdout.txt', stderr_file: 'raw/2.stderr.txt' },
      { suite: 'acceptance', path: 'path-b-virgin', exit_status: 0, stdout_file: 'raw/3.stdout.txt', stderr_file: 'raw/3.stderr.txt' },
      { suite: 'integration', path: 'path-b-virgin', exit_status: 0, stdout_file: 'raw/4.stdout.txt', stderr_file: 'raw/4.stderr.txt' },
    ];
    mkdirSync(join(d, 'raw'));
    for (const r of suiteReceipts) {
      writeFileSync(join(d, r.stdout_file), 'suite output\n');
      writeFileSync(join(d, r.stderr_file), '');
    }
    writeFileSync(join(d, 'path-a-before.json'), JSON.stringify(before));
    writeFileSync(join(d, 'path-a-after.json'), JSON.stringify(after));
    writeFileSync(join(d, 'path-b-virgin.json'), JSON.stringify(virgin));
    writeFileSync(join(d, 'c18-manifest.json'), JSON.stringify({
      gate: 'C18', mode: 'final', source_sha: SHA, worktree_clean: true, skip_suites_dev_seam: false,
      historical_last: HISTORICAL_LAST, latest_last: LATEST_LAST,
      migration_digests: Object.fromEntries(digests), receipts, suite_receipts: suiteReceipts,
    }));
    writeFileSync(join(d, 'RESULT-PASS.txt'), `outcome: PASS\nmode: final\nsource_sha: ${SHA}\n`);
    mutate(d);
    const files: string[] = [];
    const walk = (p: string, base: string) => {
      for (const name of readdirSync(p).sort()) {
        const abs = join(p, name);
        if (spawnSync('test', ['-d', abs]).status === 0) walk(abs, base);
        else files.push(abs.slice(base.length + 1));
      }
    };
    walk(d, d);
    const lines = files.filter((f) => f !== 'SHA256SUMS.txt')
      .map((f) => `${sha256(readFileSync(join(d, f)))}  ${f}`).sort();
    writeFileSync(join(d, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
    postMutate(d);
    const zip = join(d, 'evidence.zip');
    expect(spawnSync('zip', ['-qrX', zip, '.', '-x', 'evidence.zip'], { cwd: d, encoding: 'utf8' }).status).toBe(0);
    return { dir: d, zip };
  }

  it('a consistent archive VERIFIES (baseline is non-vacuous)', async () => {
    const { dir, zip } = buildArchive();
    try {
      const r = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([
    ['a REBOUND tampered snapshot', (d: string) => {
      const p = join(d, 'path-a-after.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.tables['tenancy.tenants'].rows[0].name = 'TAMPERED';
      writeFileSync(p, JSON.stringify(doc));
      rebind(d); // …and when the checksums are repaired, the CONTRACT must catch it.
    }, /column 'name' changed/],
    ['a rebound skip-suites seam', (d: string) => {
      const p = join(d, 'c18-manifest.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.skip_suites_dev_seam = true;
      writeFileSync(p, JSON.stringify(doc));
      rebind(d);
    }, /development seam; it is not proof/],
    ['a rebound omitted suite receipt', (d: string) => {
      const p = join(d, 'c18-manifest.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.suite_receipts = doc.suite_receipts.slice(1);
      writeFileSync(p, JSON.stringify(doc));
      rebind(d);
    }, /has no receipt for/],
    ['a rebound shared credential', (d: string) => {
      const p = join(d, 'c18-manifest.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.receipts['path-b-virgin'].credential_digests = doc.receipts['path-a-upgraded'].credential_digests;
      writeFileSync(p, JSON.stringify(doc));
      rebind(d);
    }, /shared the 'EYE_DB_PASSWORD' credential/],
    ['a missing RESULT receipt', (d: string) => { rmSync(join(d, 'RESULT-PASS.txt')); rebind(d); }, /no RESULT-PASS receipt/],
    ['a rebound missing raw suite output', (d: string) => { rmSync(join(d, 'raw', '1.stdout.txt')); rebind(d); }, /names missing raw output|checksum names missing file/],
  ])('archive mutation is DETECTED: %s', async (_label, mutate, pattern) => {
    const { dir, zip } = buildArchive(mutate);
    try {
      const r = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([
    ['a tampered snapshot byte (checksum layer)', (d: string) => {
      const p = join(d, 'path-a-after.json');
      const doc = JSON.parse(readFileSync(p, 'utf8'));
      doc.tables['tenancy.tenants'].rows[0].name = 'TAMPERED';
      writeFileSync(p, JSON.stringify(doc));
    }, /does not hash to its manifest digest/],
    ['an unbound smuggled file', (d: string) => { writeFileSync(join(d, 'stowaway.txt'), 'x'); }, /not bound by the checksum manifest/],
    ['a self-referential checksum manifest', (d: string) => {
      const p = join(d, 'SHA256SUMS.txt');
      writeFileSync(p, `${readFileSync(p, 'utf8')}${'0'.repeat(64)}  SHA256SUMS.txt\n`);
    }, /lists itself/],
  ])('post-binding archive mutation is DETECTED: %s', async (_label, postMutate, pattern) => {
    const { dir, zip } = buildArchive(() => {}, postMutate as (d: string) => void);
    try {
      const r = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  /** Repair every checksum after a semantic mutation, so only the CONTRACT can reject it. */
  function rebind(d: string) {
    const files: string[] = [];
    const walk = (p: string, base: string) => {
      for (const name of readdirSync(p).sort()) {
        const abs = join(p, name);
        if (spawnSync('test', ['-d', abs]).status === 0) walk(abs, base);
        else files.push(abs.slice(base.length + 1));
      }
    };
    walk(d, d);
    const lines = files.filter((f) => f !== 'SHA256SUMS.txt' && f !== 'evidence.zip')
      .map((f) => `${sha256(readFileSync(join(d, f)))}  ${f}`).sort();
    writeFileSync(join(d, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  }
});

describe('C18 — runner argument validation fails closed (real CLI)', () => {
  const cli = (args: string[]) => spawnSync('node', [RUNNER, ...args], { cwd: REPO, encoding: 'utf8', timeout: 30_000 });

  it.each([
    [['run'], /--out is required/],
    [['run', '--out', '/tmp/x', '--bogus'], /unknown argument --bogus|--bogus requires a value/],
    [['run', '--out', '/tmp/x', '--final'], /final mode requires --expected-sha/],
    [['run', '--out', '/tmp/x', '--final', '--expected-sha', 'nothex'], /final mode requires --expected-sha/],
    [['run', '--out', '/tmp/x', '--final', '--expected-sha', 'b'.repeat(40), '--skip-suites'], /refuses every development seam/],
    [['run', '--out', '/tmp/x', '--final', '--expected-sha', 'b'.repeat(40), '--keep-containers'], /refuses every development seam/],
    [['verify'], /verify requires --zip and --root/],
    [['verify', '--zip', '/nope.zip', '--root', '.', '--evil'], /unknown argument --evil|--evil requires a value/],
    [['frobnicate'], /usage:/],
  ])('rejects %j', (args, pattern) => {
    const r = cli(args as string[]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(pattern);
  });

  it('final mode with a WRONG expected SHA refuses before provisioning anything', () => {
    const r = cli(['run', '--out', join(tmpdir(), 'c18-never'), '--final', '--expected-sha', 'b'.repeat(40)]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/HEAD .* != --expected-sha/);
  });
});

describe('C18 — CI wiring and replacement of the obsolete script', () => {
  const CI = parseYaml(readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: Record<string, { steps: Array<Record<string, unknown>> }>;
  };

  it('the obsolete scripts/verify-db-paths.sh is GONE and the tracked runner exists', () => {
    expect(readdirSync(join(REPO, 'scripts'))).not.toContain('verify-db-paths.sh');
    expect(readdirSync(join(REPO, 'scripts', 'gate'))).toContain('c18-db-paths.mjs');
  });

  it('C18 runs as a BLOCKING build-test step in real final mode, bound to the run SHA', () => {
    const steps = CI.jobs['build-test']!.steps;
    const gate = steps.find((s) => String(s['name'] ?? '').includes('C18 dual-path database history gate'));
    expect(gate, 'the C18 gate step must exist').toBeDefined();
    expect(gate!['id']).toBe('c18_gate');
    expect(gate!['if'], 'the gate must be unconditional — it cannot pass by being skipped').toBeUndefined();
    const run = String(gate!['run']);
    expect(run).toContain('--final --expected-sha "$GITHUB_SHA"');
    expect(run).toContain('c18-db-paths.mjs verify');
    expect(run).toContain('$RUNNER_TEMP/c18-out');
  });

  it('the C18 evidence upload is attempt-scoped, runner-temp, and DIAGNOSTIC (always)', () => {
    const steps = CI.jobs['build-test']!.steps;
    const upload = steps.find((s) => String(s['name'] ?? '') === 'Upload C18 dual-path evidence');
    expect(upload).toBeDefined();
    const w = upload!['with'] as Record<string, unknown>;
    expect(w['name']).toBe('c18-db-paths-evidence-a${{ github.run_attempt }}');
    expect(w['path']).toBe('${{ runner.temp }}/c18-out');
    // always(): a RED C18 run's failure evidence must survive; the artifact name carries no
    // digest, so there is nothing a failed producer could leave dangling.
    expect(upload!['if']).toBe('always()');
    expect(w['if-no-files-found']).toBe('warn');
  });

  it('the gate restores ONLY the regenerated clean-typecheck evidence, failing on anything else', () => {
    const steps = CI.jobs['build-test']!.steps;
    const gate = steps.find((s) => String(s['name'] ?? '').includes('C18 dual-path database history gate'));
    const run = String(gate!['run']);
    expect(run).toContain('git restore evidence/clean-typecheck.txt');
    expect(run).toContain('unexpected dirty worktree before the C18 gate');
    expect(run).toContain('[ "$DIRTY" != " M evidence/clean-typecheck.txt" ]');
  });
});
