/**
 * C18.1 — mutation and differential controls against a GENUINE evidence archive.
 *
 * The archive path arrives in C18_ARCHIVE (produced moments earlier by the real runner on
 * this exact checkout). Every control mutates a COPY one defect at a time, rebinding every
 * attacker-controlled hash, length and checksum so the mutation reaches the intended semantic
 * layer, and requires the C18.1 verifier to reject it. The differential family additionally
 * proves the FROZEN d5061b8 verifier (fixtures/c18-legacy-d5061b8) ACCEPTED the corresponding
 * false pass — the defect class C18.1 exists to close.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import {
  lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence } from '../../../../scripts/gate/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacyVerify } from './fixtures/c18-legacy-d5061b8/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy8a } from './fixtures/c18-legacy-8a23526/c18-db-paths.mjs';
import { auditRowHash, jcsCanonicalize } from '@eye/contracts';

const REPO = join(__dirname, '..', '..', '..', '..');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const ARCHIVE = process.env['C18_ARCHIVE'] ?? '';

type Mutator = (dir: string) => void;

function walkFiles(d: string, base: string, out: string[]) {
  for (const name of readdirSync(d).sort()) {
    const abs = join(d, name);
    if (lstatSync(abs).isDirectory()) walkFiles(abs, base, out);
    else out.push(relative(base, abs));
  }
}

/** Repair EVERY attacker-controlled checksum so only the semantic layer can reject. */
function rebind(dir: string) {
  const files: string[] = [];
  walkFiles(dir, dir, files);
  const lines = files.filter((f) => f !== 'SHA256SUMS.txt' && !f.endsWith('.zip'))
    .map((f) => `${sha256(readFileSync(join(dir, f)))}  ${f}`).sort();
  writeFileSync(join(dir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
}

function mutateArchive(mutate: Mutator, { rebindAfter = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'c18-mut-'));
  expect(spawnSync('unzip', ['-q', ARCHIVE, '-d', dir]).status).toBe(0);
  mutate(dir);
  if (rebindAfter) rebind(dir);
  const zip = join(dir, 'mutated.zip');
  expect(spawnSync('zip', ['-qrX', zip, '.', '-x', 'mutated.zip'], { cwd: dir }).status).toBe(0);
  return { dir, zip };
}

const editJson = (dir: string, name: string, edit: (doc: any) => void) => {
  const p = join(dir, name);
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  edit(doc);
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
};

async function expectReject(mutate: Mutator, pattern: RegExp, opts: { rebindAfter?: boolean } = {}) {
  const { dir, zip } = mutateArchive(mutate, opts);
  try {
    const r = await verifyEvidence({ zipPath: zip, root: REPO });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(pattern);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('C18.1 — the genuine archive verifies, then every single-defect mutation is rejected', () => {
  beforeAll(() => {
    expect(ARCHIVE, 'C18_ARCHIVE must point at the archive the gate just produced').not.toBe('');
  });

  it('BASELINE: the genuine archive passes offline candidate verification', async () => {
    const r = await verifyEvidence({ zipPath: ARCHIVE, root: REPO });
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('BASELINE: redaction engaged — the ledger holds placeholders, and no secret-shaped argv survives', () => {
    const dir = mkdtempSync(join(tmpdir(), 'c18-base-'));
    try {
      expect(spawnSync('unzip', ['-q', ARCHIVE, '-d', dir]).status).toBe(0);
      const commands = readFileSync(join(dir, 'commands.json'), 'utf8');
      expect(commands).toContain('<REDACTED:');
      expect(commands).not.toMatch(/POSTGRES_PASSWORD=[0-9a-f]{16}/);
      expect(commands).not.toMatch(/PGPASSWORD=[0-9a-f]{16}/);
      expect(commands).not.toMatch(/--requirepass",\s*"[0-9a-f]{16}/);
      const before = readFileSync(join(dir, 'path-a-before.json'), 'utf8');
      // The ctx signing secret never appears raw: its column is a domain-separated digest.
      expect(before).not.toMatch(/"secret":\s*"\\\\x[0-9a-f]{16}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['a tampered snapshot byte (checksum layer)', (d: string) => {
      editJson(d, 'path-a-after.json', (doc) => { doc.tables['tenancy.tenants'].rows[0].name = 'TAMPERED'; });
    }, /does not hash to its manifest digest/, { rebindAfter: false }],
    ['a REBOUND tampered preserved value', (d: string) => {
      editJson(d, 'path-a-after.json', (doc) => { doc.tables['tenancy.tenants'].rows[0].name = 'TAMPERED'; });
    }, /column 'name' changed/, {}],
    ['a wholesale gate relabel', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.gate = 'NOT-C18'; });
    }, /field 'gate' is malformed/, {}],
    ['an unknown manifest field', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.attacker_note = 'trust me'; });
    }, /UNKNOWN field 'attacker_note'/, {}],
    ['a missing manifest field', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { delete doc.source_tree; });
    }, /MISSING field 'source_tree'/, {}],
    ['a dirty-after-run flag', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.worktree_clean_after = false; });
    }, /field 'worktree_clean_after' is malformed/, {}],
    ['a rebound skip-suites seam', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.skip_suites_dev_seam = true; });
    }, /development seam; it is not proof/, {}],
    ['recorded cleanup failures', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.cleanup.failures = ['docker rm -fv failed']; });
    }, /cleanup failures or kept containers/, {}],
    ['a rewoven audit chain with a NON-production hash formula', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => {
        const rows = doc.audit.events.filter((e: any) => e.partition_id === 'platform');
        rows[0].event_jcs = jcsCanonicalize({ ...JSON.parse(rows[0].event_jcs), actor: 'principal:forged' });
        let prev = '0'.repeat(64);
        for (const e of rows) {
          e.previous_hash = prev;
          e.row_hash = sha256(e.event_jcs + prev); // consistent links, WRONG formula
          prev = e.row_hash;
        }
        const head = doc.audit.heads.find((h: any) => h.partition_id === 'platform');
        head.head_hash = prev;
      });
    }, /row_hash does not recompute under the production formula/, {}],
    ['a rewoven closure event using the PRODUCTION formula', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => {
        const manifest = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
        const corr = manifest.post_upgrade_operation.correlation;
        const rows = doc.audit.events;
        const byPartition = new Map<string, any[]>();
        for (const e of rows) {
          if (!byPartition.has(e.partition_id)) byPartition.set(e.partition_id, []);
          byPartition.get(e.partition_id)!.push(e);
        }
        for (const part of byPartition.values()) {
          part.sort((x, y) => Number(x.audit_seq) - Number(y.audit_seq));
          let prev = '0'.repeat(64);
          for (const e of part) {
            const body = JSON.parse(e.event_jcs);
            if (e.correlation_id === corr && body.policy_decision_id !== null) body.actor = 'principal:forged';
            e.event_jcs = jcsCanonicalize(body);
            e.previous_hash = prev;
            e.row_hash = auditRowHash({
              partitionId: e.partition_id, auditSeq: Number(e.audit_seq),
              previousHash: prev, event: body,
            });
            prev = e.row_hash;
          }
          const head = doc.audit.heads.find((h: any) => h.partition_id === part[0].partition_id);
          if (head) { head.head_hash = prev; head.next_seq = part.length + 1; }
        }
      });
    }, /actor differs from the recorded actor|canonical bytes or hash changed/, {}],
    ['a deleted audit world', (d: string) => {
      for (const f of ['path-a-before.json', 'path-a-after.json', 'path-a-final.json']) {
        editJson(d, f, (doc) => { doc.audit.events = []; doc.audit.heads = []; });
      }
    }, /seed floor: platform audit partition has 0/, {}],
    ['a removed operation-ledger row', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.tables['ctx.operation'].rows = []; });
    }, /ctx\.operation has no row for the recorded post-upgrade correlation/, {}],
    ['a removed operation effect', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.tables['ctx.operation_effect'].rows = []; });
    }, /no row for the post-upgrade operation/, {}],
    ['an altered required-transform value', (d: string) => {
      editJson(d, 'path-a-after.json', (doc) => {
        doc.tables['identity.bootstrap_claim'].rows[0].consumed = true;
      });
    }, /added column 'consumed' is true, expected the DDL default false/, {}],
    ['a changed FK definition (retarget with identical local values)', (d: string) => {
      const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
      const preserved = new Set(before.fks.map((f: { constraint: string }) => f.constraint));
      editJson(d, 'path-a-after.json', (doc) => {
        // Mutate a PRESERVED constraint — an after-only 0013 FK would never be compared.
        const target = doc.fks.find((f: { constraint: string }) => preserved.has(f.constraint));
        target.definition = target.definition.replace(/REFERENCES [a-z_.]+/, 'REFERENCES evil.shadow');
      });
    }, /DEFINITION changed across the upgrade/, {}],
    ['a missing primary key', (d: string) => {
      editJson(d, 'path-a-before.json', (doc) => { doc.tables['tenancy.tenants'].pk = []; });
    }, /has NO PRIMARY KEY/, {}],
    ['a shared Redis container', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.receipts['path-b-virgin'].redis_container = doc.receipts['path-a-upgraded'].redis_container;
        doc.receipts['path-b-virgin'].redis_container_id = doc.receipts['path-a-upgraded'].redis_container_id;
      });
    }, /SHARED redis_container/, {}],
    ['a missing credential-digest key', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        delete doc.receipts['path-b-virgin'].credential_digests.EYE_REDIS_PASSWORD;
      });
    }, /credential digest keys are not exactly the code-owned secret classes/, {}],
    ['a cross-path credential collision', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.receipts['path-b-virgin'].credential_digests.EYE_DB_PASSWORD = doc.receipts['path-a-upgraded'].credential_digests.EYE_DB_PASSWORD;
      });
    }, /shared the 'EYE_DB_PASSWORD' credential/, {}],
    ['fake suite output with a rebound self-declared pass', (d: string) => {
      const manifest = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const r = manifest.suite_receipts[0];
      const fake = Buffer.from('suite output\n');
      writeFileSync(join(d, r.stdout_file), fake);
      editJson(d, 'c18-manifest.json', (doc) => {
        const x = doc.suite_receipts[0];
        x.stdout_bytes = fake.byteLength;
        x.stdout_sha256 = sha256(fake);
      });
    }, /does not contain a passing vitest summary/, {}],
    ['a duplicated suite receipt', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts.push({ ...doc.suite_receipts[0] });
      });
    }, /DUPLICATE suite receipt|SHARES stream/, {}],
    ['two receipts sharing one stream', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts[1].stdout_file = doc.suite_receipts[0].stdout_file;
        doc.suite_receipts[1].stdout_bytes = doc.suite_receipts[0].stdout_bytes;
        doc.suite_receipts[1].stdout_sha256 = doc.suite_receipts[0].stdout_sha256;
      });
    }, /SHARES stream/, {}],
    ['a missing stderr stream file', (d: string) => {
      const manifest = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      rmSync(join(d, manifest.suite_receipts[0].stderr_file));
    }, /MISSING|names missing stream/, {}],
    ['wrong parsed test counts', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts[0].tests_passed += 5;
        doc.suite_receipts[0].tests_total += 5;
      });
    }, /parsed counts .* do not match the receipt/, {}],
    ['a wrong suite command', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts[0].argv_redacted = ['echo', 'ok'];
      });
    }, /is not the matrix command/, {}],
    ['a tampered RESULT receipt', (d: string) => {
      const p = join(d, 'RESULT-PASS.txt');
      writeFileSync(p, `${readFileSync(p, 'utf8')}extra: trailing\n`);
    }, /trailing content beyond the exact contract/, {}],
    ['a smuggled bound top-level file', (d: string) => {
      writeFileSync(join(d, 'stowaway.txt'), 'bound and checksummed');
    }, /top-level inventory .* is not the exact contract set/, {}],
    ['a raw file bound to no command', (d: string) => {
      writeFileSync(join(d, 'raw', '999-ghost.stdout.txt'), 'ghost');
    }, /bound to no command-ledger entry/, {}],
    ['a traversal checksum path', (d: string) => {
      const p = join(d, 'SHA256SUMS.txt');
      writeFileSync(p, `${readFileSync(p, 'utf8')}${'0'.repeat(64)}  ../escape.txt\n`);
    }, /unsafe path '\.\.\/escape\.txt'/, { rebindAfter: false }],
    ['a duplicate checksum entry', (d: string) => {
      const text = readFileSync(join(d, 'SHA256SUMS.txt'), 'utf8');
      const first = text.split('\n').filter(Boolean)[0];
      writeFileSync(join(d, 'SHA256SUMS.txt'), `${text}${first}\n`);
    }, /DUPLICATE checksum entry/, { rebindAfter: false }],
  ] as ReadonlyArray<[string, Mutator, RegExp, { rebindAfter?: boolean }]>)(
    'REJECTS %s', async (_label, mutate, pattern, opts) => {
      await expectReject(mutate, pattern, opts);
    },
  );

  it('REJECTS a duplicate ZIP member and a symlink member before extraction', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'c18-zipsafety-'));
    try {
      const dup = join(dir, 'dup.zip');
      const build = spawnSync('python3', ['-c', [
        'import sys, zipfile',
        'src, dst = sys.argv[1], sys.argv[2]',
        'with zipfile.ZipFile(src) as z:',
        '    items = [(i.filename, z.read(i.filename)) for i in z.infolist() if not i.is_dir()]',
        'with zipfile.ZipFile(dst, "w") as o:',
        '    for n, b in items: o.writestr(n, b)',
        '    o.writestr("c18-manifest.json", [b for n, b in items if n == "c18-manifest.json"][0])',
      ].join('\n'), ARCHIVE, dup], { encoding: 'utf8' });
      expect(build.status, build.stderr).toBe(0);
      const r1 = await verifyEvidence({ zipPath: dup, root: REPO });
      expect(r1.ok).toBe(false);
      expect(r1.problems.join('\n')).toMatch(/DUPLICATE entry 'c18-manifest\.json'/);

      const symSrc = join(dir, 'symsrc');
      mkdirSync(symSrc);
      writeFileSync(join(symSrc, 'real.txt'), 'x');
      symlinkSync('real.txt', join(symSrc, 'link.txt'));
      const symZip = join(dir, 'sym.zip');
      expect(spawnSync('zip', ['-qyrX', symZip, '.'], { cwd: symSrc }).status).toBe(0);
      const r2 = await verifyEvidence({ zipPath: symZip, root: REPO });
      expect(r2.ok).toBe(false);
      expect(r2.problems.join('\n')).toMatch(/symlink/);

      const trav = join(dir, 'trav.zip');
      const t = spawnSync('python3', ['-c', [
        'import sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as o:',
        '    o.writestr("../escape.txt", "evil")',
        '    o.writestr("c18-manifest.json", "{}")',
      ].join('\n'), trav], { encoding: 'utf8' });
      expect(t.status, t.stderr).toBe(0);
      const r3 = await verifyEvidence({ zipPath: trav, root: REPO });
      expect(r3.ok).toBe(false);
      expect(r3.problems.join('\n')).toMatch(/unsafe archive path/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('C18.1 — DIFFERENTIAL: the frozen d5061b8 verifier ACCEPTED what C18.1 rejects', () => {
  /** The wholesale-forged archive the OLD verifier accepted: fake SHA, arbitrary suite text,
   * self-declared exits, empty audit world, thin posture — built exactly in the old synthetic
   * fixture's shape. */
  function forgedLegacyArchive() {
    const d = mkdtempSync(join(tmpdir(), 'c18-legacy-forge-'));
    const digests: Record<string, string> = {};
    const dir = join(REPO, 'apps', 'api', 'migrations');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      digests[f] = sha256(readFileSync(join(dir, f)));
    }
    const ledger = (upTo: string) => Object.entries(digests)
      .filter(([f]) => f.slice(0, 4) <= upTo)
      .map(([filename, digest]) => ({ filename, digest, applied_at: '2026-08-18 00:00:00+00' }));
    const posture = { anything: [] };
    const snap = (label: string, upTo: string) => ({
      label,
      tables: {
        'tenancy.tenants': { pk: ['id'], columns: ['id'], rows: [] },
        'identity.bootstrap_claim': { pk: ['id'], columns: ['id', 'nonce', 'consumed', 'consumed_at'], rows: [] },
        'ctx.operation': { pk: ['operation_id'], columns: ['operation_id'], rows: [] },
        'ctx.operation_effect': { pk: ['id'], columns: ['id'], rows: [] },
      },
      fks: [], posture, ledger: ledger(upTo), audit: { events: [], heads: [] },
    });
    const beforeSnap = snap('a-before', '0012');
    delete (beforeSnap.tables as Record<string, unknown>)['ctx.operation'];
    delete (beforeSnap.tables as Record<string, unknown>)['ctx.operation_effect'];
    writeFileSync(join(d, 'path-a-before.json'), JSON.stringify(beforeSnap));
    writeFileSync(join(d, 'path-a-after.json'), JSON.stringify(snap('a-after', '0021')));
    writeFileSync(join(d, 'path-a-final.json'), JSON.stringify(snap('a-final', '0021')));
    writeFileSync(join(d, 'path-a-seed-record.json'), '{}');
    writeFileSync(join(d, 'path-b-virgin.json'), JSON.stringify(snap('b-virgin', '0021')));
    mkdirSync(join(d, 'raw'));
    const receipts = [] as Array<Record<string, unknown>>;
    let i = 1;
    for (const [suite, where] of [
      ['acceptance', 'path-a-upgraded'], ['integration', 'path-a-upgraded'],
      ['acceptance', 'path-b-virgin'], ['integration', 'path-b-virgin'],
    ]) {
      writeFileSync(join(d, 'raw', `${i}.stdout.txt`), 'suite output\n');
      writeFileSync(join(d, 'raw', `${i}.stderr.txt`), '');
      receipts.push({
        suite, path: where, exit_status: 0,
        stdout_file: `raw/${i}.stdout.txt`, stderr_file: `raw/${i}.stderr.txt`,
      });
      i += 1;
    }
    const fakeSha = 'f'.repeat(40);
    writeFileSync(join(d, 'c18-manifest.json'), JSON.stringify({
      gate: 'NOT-C18', mode: 'preliminary', source_sha: fakeSha, worktree_clean: false,
      skip_suites_dev_seam: false, historical_last: '0012', latest_last: '0021',
      migration_digests: digests,
      receipts: {
        'path-a-upgraded': {
          path: 'path-a-upgraded', container_name: 'x-a', redis_container: 'shared-redis',
          database: 'db_a', port: 1, redis_port: 3, postgres_image: 'p', redis_image: 'r',
          credential_digests: { EYE_DB_PASSWORD: sha256('cred-a') },
        },
        'path-b-virgin': {
          path: 'path-b-virgin', container_name: 'x-b', redis_container: 'shared-redis',
          database: 'db_b', port: 2, redis_port: 3, postgres_image: 'p', redis_image: 'r',
          // Same REDIS instance for both paths — INVISIBLE to the d5061b8 verifier.
          credential_digests: { EYE_DB_PASSWORD: sha256('cred-b') },
        },
      },
      suite_receipts: receipts,
    }));
    writeFileSync(join(d, 'RESULT-PASS.txt'), `outcome: PASS\nsource_sha: ${fakeSha}\ncontradiction: outcome above is unearned\n`);
    rebind(d);
    const zip = join(d, 'evidence.zip');
    expect(spawnSync('zip', ['-qrX', zip, '.', '-x', 'evidence.zip'], { cwd: d }).status).toBe(0);
    return { dir: d, zip };
  }

  it('the WHOLESALE-FORGED archive: legacy PASSED it; C18.1 rejects it on many axes', async () => {
    const { dir, zip } = forgedLegacyArchive();
    try {
      const legacy = await legacyVerify({ zipPath: zip, root: REPO });
      expect(legacy.ok, `the frozen d5061b8 verifier must accept this forgery (it did on delivery day); problems: ${legacy.problems.join('; ')}`).toBe(true);
      const now = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(now.ok).toBe(false);
      const joined = now.problems.join('\n');
      expect(joined).toMatch(/field 'gate' is malformed/);
      expect(joined).toMatch(/MISSING field/);
      expect(joined).toMatch(/is not this checkout's HEAD/);
      expect(joined).toMatch(/seed floor/);
      expect(joined).toMatch(/posture categories .* are not the exact code-owned set/);
      expect(joined).toMatch(/RESULT receipt line/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('empty audit world + self-declared suites: legacy accepted the CLASS, C18.1 rejects each member', async () => {
    const { dir, zip } = forgedLegacyArchive();
    try {
      const legacy = await legacyVerify({ zipPath: zip, root: REPO });
      expect(legacy.ok).toBe(true);
      const now = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(now.problems.join('\n')).toMatch(/does not contain a passing vitest summary|fields .* are not the exact contract set/);
      expect(now.problems.join('\n')).toMatch(/platform audit partition has 0/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('C18.1.1 — new single-defect mutations against the genuine archive are rejected', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a raw context secret injected into a raw receipt', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const c = cmds.find((x: any) => x.label.endsWith('a-before-rows-ctx_context_secret'));
      writeFileSync(join(d, 'raw', `${c.id}.stdout.txt`), '[{"id": 1, "secret": "\\\\x0339c7ea2ccab4989612b021553f1e1dc6cea5ae39b9320d8f0c26cdd9b29c4b"}]');
    }, /raw ctx\.context_secret bytea value|raw bytea secret column/],
    ['a processed table row altered while raw stays intact', (d: string) => {
      editJson(d, 'path-a-after.json', (doc) => {
        doc.tables['tenancy.tenants'].rows[0].name = `${doc.tables['tenancy.tenants'].rows[0].name}-X`;
      });
    }, /rows differ from their raw query receipt|column 'name' changed/],
    ['a deleted complete nonempty table', (d: string) => {
      editJson(d, 'path-a-after.json', (doc) => { delete doc.tables['identity.credentials']; });
    }, /'identity\.credentials' is MISSING|table set differs/],
    ['an emptied seed record', (d: string) => {
      writeFileSync(join(d, 'path-a-seed-record.json'), '{}\n');
    }, /seed record .* is empty or missing|seed record .* count/],
    ['a false manifest source_tree', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.source_tree = 'b'.repeat(40); });
    }, /source_tree .* is not this checkout/],
    ['a tampered manifest suite_matrix', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.suite_matrix.integration.expected_tests = 1; });
    }, /suite_matrix is not exactly the code-owned matrix/],
    ['a false seed_summary count', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.seed_summary.tenants = 99; });
    }, /seed record tenants count .* != manifest seed_summary 99|!= pre-upgrade table/],
    ['a wrong cleanup removal set', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.cleanup.removed = ['x', 'y', 'z', 'w']; });
    }, /cleanup\.removed is not exactly the four/],
    ['an empty final migration ledger', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.ledger = []; });
    }, /final-ledger: .* requires exactly 21|DISAPPEARED/],
    ['a contradictory audit projection over a genuine body', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => {
        const e = doc.audit.events.find((x: any) => x.partition_id === 'platform');
        e.correlation_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      });
    }, /projected correlation_id disagrees/],
    ['an altered operation effect kind', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.tables['ctx.operation_effect'].rows[0].effect_kind = 'evil'; });
    }, /effect kinds/],
    ['an unfinalized post-upgrade operation', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => {
        const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
        doc.tables['ctx.operation'].rows.find((o: any) => o.correlation_id === m.post_upgrade_operation.correlation).finalized = false;
      });
    }, /not finalized/],
    ['an attacker postgres image', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.receipts['path-a-upgraded'].postgres_image = 'evil@sha256:abc'; });
    }, /postgres image is not the digest-pinned/],
    ['a relabelled isolation path', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.receipts['path-a-upgraded'].path = 'path-b-virgin'; });
    }, /label is/],
    ['a within-path credential reuse', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        const cd = doc.receipts['path-a-upgraded'].credential_digests;
        cd.EYE_REDIS_PASSWORD = cd.EYE_DB_PASSWORD;
      });
    }, /credential digest REUSED/],
    ['a single-test suite argv with a matching 1/1 stream', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const rc = m.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded');
      const fake = Buffer.from('Tests  1 passed (1)\n');
      writeFileSync(join(d, rc.stdout_file), fake);
      editJson(d, 'c18-manifest.json', (doc) => {
        const x = doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded');
        x.argv_redacted = ['pnpm', '--filter', '@eye/api', 'test:int', 'test/one.ts'];
        x.stdout_bytes = fake.byteLength; x.stdout_sha256 = sha256(fake);
        x.tests_passed = 1; x.tests_total = 1;
      });
    }, /is not EXACTLY the matrix command/],
    ['a suite command recording exit 97', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const rc = m.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded');
      editJson(d, 'commands.json', (cmds) => { cmds.find((c: any) => c.id === rc.command_id).exit = 97; });
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded').exit_status = 97;
      });
    }, /records exit 97|recorded exit 97/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.1 — DIFFERENTIAL: the frozen 8a23526 verifier ACCEPTED what C18.1.1 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('the RAW SECRET LEAK: 8a23526 accepts a raw-secret receipt; C18.1.1 rejects it', async () => {
    const m = mutateArchive((d) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const c = cmds.find((x: any) => x.label.endsWith('a-before-rows-ctx_context_secret'));
      writeFileSync(join(d, 'raw', `${c.id}.stdout.txt`),
        '[{"id": 1, "secret": "\\\\x0339c7ea2ccab4989612b021553f1e1dc6cea5ae39b9320d8f0c26cdd9b29c4b"}]');
    });
    try {
      const old = await legacy8a({ zipPath: m.zip, root: REPO });
      // The 8a23526 verifier neither scans raw receipts nor reconstructs from them, so the raw
      // secret survives its inspection — the exact leak C18.1.1 closes. (Its clean-tree checks
      // still pass because this runs from the exact source checkout.)
      const oldSaw = old.problems.join('\n');
      expect(oldSaw).not.toMatch(/bytea|context_secret|raw query receipt/);
      const now = await verifyEvidence({ zipPath: m.zip, root: REPO });
      expect(now.ok).toBe(false);
      expect(now.problems.join('\n')).toMatch(/raw ctx\.context_secret bytea value|raw bytea secret column|rows differ from their raw query receipt/);
    } finally { rmSync(m.dir, { recursive: true, force: true }); }
  });

  it('RAW-VS-PROCESSED: 8a23526 accepts an altered processed row with intact raw; C18.1.1 rejects', async () => {
    const m = mutateArchive((d) => {
      editJson(d, 'path-a-after.json', (doc) => {
        // A row DELETED from the processed snapshot while its raw query receipt still shows it.
        doc.tables['identity.roles'].rows.pop();
        doc.tables['identity.roles'].row_count = doc.tables['identity.roles'].rows.length;
      });
    });
    try {
      const old = await legacy8a({ zipPath: m.zip, root: REPO });
      expect(old.problems.join('\n')).not.toMatch(/raw query receipt|rows differ/);
      const now = await verifyEvidence({ zipPath: m.zip, root: REPO });
      expect(now.ok).toBe(false);
      expect(now.problems.join('\n')).toMatch(/rows differ from their raw query receipt|cardinality changed/);
    } finally { rmSync(m.dir, { recursive: true, force: true }); }
  });
});

describe('C18.1 — producer lifecycle and output-directory refusals (real CLI)', () => {
  const RUNNER = join(REPO, 'scripts', 'gate', 'c18-db-paths.mjs');
  const cli = (args: string[], env: Record<string, string> = {}) => spawnSync('node', [RUNNER, ...args], {
    cwd: REPO, encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...env },
  });

  it('REFUSES prepopulated output', () => {
    const out = mkdtempSync(join(tmpdir(), 'c18-preout-'));
    writeFileSync(join(out, 'stale.txt'), 'x');
    const r = cli(['run', '--out', out]);
    expect(r.status).not.toBe(0);
    expect(`${r.stderr}${r.stdout}`).toMatch(/is not EMPTY; refusing prepopulated output/);
    rmSync(out, { recursive: true, force: true });
  });

  it('REFUSES output that resolves INSIDE the repository through a symlink', () => {
    const holder = mkdtempSync(join(tmpdir(), 'c18-symout-'));
    const inside = join(REPO, 'node_modules', '.c18-symlink-target');
    mkdirSync(inside, { recursive: true });
    const link = join(holder, 'link');
    symlinkSync(inside, link);
    try {
      const r = cli(['run', '--out', link]);
      expect(r.status).not.toBe(0);
      expect(`${r.stderr}${r.stdout}`).toMatch(/must resolve OUTSIDE the repository/);
    } finally {
      rmSync(holder, { recursive: true, force: true });
      rmSync(inside, { recursive: true, force: true });
    }
  });

  it('PARTIAL PROVISIONING tears down: a failing docker leaves zero c18 containers', () => {
    // A poisoned docker forwards everything EXCEPT `port`, which fails right after both
    // containers exist — provisioning dies mid-flight; checked cleanup must still run.
    const shimDir = mkdtempSync(join(tmpdir(), 'c18-shim-'));
    const real = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(join(shimDir, 'docker'), `#!/bin/sh\nif [ "$1" = "port" ]; then echo poisoned >&2; exit 1; fi\nexec ${real} "$@"\n`);
    spawnSync('chmod', ['+x', join(shimDir, 'docker')]);
    const out = mkdtempSync(join(tmpdir(), 'c18-partial-'));
    rmSync(out, { recursive: true, force: true });
    try {
      const r = cli(['run', '--out', out], { PATH: `${shimDir}:${process.env['PATH']}` });
      expect(r.status).not.toBe(0);
      expect(`${r.stderr}${r.stdout}`).toMatch(/cannot resolve mapped port|port.*failed/);
      // Failure evidence exists on this exit path.
      expect(readFileSync(join(out, 'RESULT-FAIL.txt'), 'utf8')).toContain('phase: path-a-provision');
      // And the containers created before the failure are GONE (checked docker rm -fv ran).
      const ps = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout;
      expect(ps.split('\n').filter((n) => /^c18-[ab]-[0-9a-f]{8}-(pg|redis)$/.test(n))).toEqual([]);
    } finally {
      rmSync(shimDir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
});
