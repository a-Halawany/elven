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
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

// eslint-disable-next-line import/no-relative-packages
import {
  deriveSourceBinding, ingestArchive, verifyEvidence, verifySemantics,
} from '../../../../scripts/gate/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { commandIdFor } from '../../../../scripts/gate/lib/c18-contract.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacyVerify } from './fixtures/c18-legacy-d5061b8/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy8a } from './fixtures/c18-legacy-8a23526/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy567 } from './fixtures/c18-legacy-567a70f/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy15e } from './fixtures/c18-legacy-15e8239/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy83d } from './fixtures/c18-legacy-83d158c/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy7be } from './fixtures/c18-legacy-7be02b8/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy8362 } from './fixtures/c18-legacy-8362cba/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacyDcc } from './fixtures/c18-legacy-dccfcf2/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacyBfc } from './fixtures/c18-legacy-bfc8695/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy774 } from './fixtures/c18-legacy-77489f5/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { buildCoverageReport as legacy774Coverage } from './fixtures/c18-legacy-77489f5/lib/c18-seed-coverage.mjs';
// eslint-disable-next-line import/no-relative-packages
import { verifyEvidence as legacy53a } from './fixtures/c18-legacy-53a4eec/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { buildCoverageReport as legacy53aCoverage } from './fixtures/c18-legacy-53a4eec/lib/c18-seed-coverage.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  deriveSourceBinding as deriveA42Binding, verifyEvidence as legacyA42,
  verifySemantics as legacyA42Semantics,
} from './fixtures/c18-legacy-a424505/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { buildCoverageReport as legacyA42Coverage } from './fixtures/c18-legacy-a424505/lib/c18-seed-coverage.mjs';
// eslint-disable-next-line import/no-relative-packages
import {
  deriveSourceBinding as derive2c3Binding, verifyEvidence as legacy2c3,
  verifySemantics as legacy2c3Semantics,
} from './fixtures/c18-legacy-2c3cab3/c18-db-paths.mjs';
// eslint-disable-next-line import/no-relative-packages
import { buildCoverageReport as legacy2c3Coverage } from './fixtures/c18-legacy-2c3cab3/lib/c18-seed-coverage.mjs';
import { auditRowHash, canonicalHeaderDigest, jcsCanonicalize } from '@eye/contracts';

const REPO = join(__dirname, '..', '..', '..', '..');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const ARCHIVE = process.env['C18_ARCHIVE'] ?? '';
/** A fixed forged identifier: mutations must be deterministic so a failure is reproducible. */
const FORGED_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SNAP_FILES: ReadonlyArray<[string, string]> = [
  ['path-a-preseed.json', 'a-a-preseed'], ['path-a-before.json', 'a-a-before'],
  ['path-a-after.json', 'a-a-after'], ['path-a-final.json', 'a-a-final'],
  ['path-b-virgin.json', 'b-b-virgin'],
];
/** The SEEDED path-A snapshots: everything the governed seed wrote is visible in these. */
/** The snapshots a given archive actually carries (predecessor formats omit the pre-seed one). */
const presentSnaps = (d: string): ReadonlyArray<[string, string]> =>
  SNAP_FILES.filter(([f]) => existsSync(join(d, f)));
const SEEDED_SNAPS: ReadonlyArray<[string, string]> = [
  ['path-a-before.json', 'a-a-before'], ['path-a-after.json', 'a-a-after'],
  ['path-a-final.json', 'a-a-final'],
];
/** Rewrite a table across every SEEDED path-A snapshot AND its command-bound raw receipt. */
function everywhereA(d: string, table: string, apply: (r: any) => void) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc) => {
      for (const r of doc.tables[table].rows) apply(r);
      doc.tables[table].row_count = doc.tables[table].rows.length;
    });
    const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-rows-${table.replace('.', '_')}`, 'stdout',
      Buffer.from(JSON.stringify(after.tables[table].rows)));
  }
}
/** Append one row to a seeded table in every seeded snapshot, consistently. */
function appendRow(d: string, table: string, make: (rows: any[]) => any) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc) => {
      const t = doc.tables[table];
      t.rows = [...t.rows, make(t.rows)];
      t.row_count = t.rows.length;
    });
    const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-rows-${table.replace('.', '_')}`, 'stdout',
      Buffer.from(JSON.stringify(after.tables[table].rows)));
  }
}
/** Remove the first matching row from a seeded table in every seeded snapshot. */
function dropRow(d: string, table: string, match: (r: any) => boolean) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc) => {
      const t = doc.tables[table];
      const i = t.rows.findIndex(match);
      if (i >= 0) t.rows.splice(i, 1);
      t.row_count = t.rows.length;
    });
    const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-rows-${table.replace('.', '_')}`, 'stdout',
      Buffer.from(JSON.stringify(after.tables[table].rows)));
  }
}
/**
 * C18.1.8 adds an authenticated pre-seed snapshot, its command-bound receipts and a
 * machine-readable coverage report. This produces exactly what the bfc8695 producer emitted.
 */
/**
 * C18.1.9 publishes each coverage column as {kind, era, executable_rule, source_owned_value};
 * 77489f5 published the bare kind. Regenerating the report with the FROZEN module produces
 * exactly the bytes that producer emitted, so the differential leg is byte-faithful rather than
 * hand-approximated.
 */
/**
 * C18.1.10 — each predecessor's coverage report is source-DERIVED, so for an unmutated tree it is
 * the same bytes every time. It is computed once per suite and reused; a mutated tree still
 * recomputes, because the report must reflect what the archive actually carries.
 */
const DOWNGRADE_CACHE = new Map<string, string>();
function coverageFor(dir: string, key: string, build: (a: any, b: any) => unknown) {
  const preseed = JSON.parse(readFileSync(join(dir, 'path-a-preseed.json'), 'utf8'));
  const before = JSON.parse(readFileSync(join(dir, 'path-a-before.json'), 'utf8'));
  const stamp = `${key}:${sha256(JSON.stringify(preseed))}:${sha256(JSON.stringify(before))}`;
  const hit = DOWNGRADE_CACHE.get(stamp);
  if (hit !== undefined) return hit;
  const text = `${JSON.stringify(build(preseed, before), null, 2)}\n`;
  DOWNGRADE_CACHE.set(stamp, text);
  return text;
}

/**
 * C18.1.10's coverage report states each column's kind, era, executability AND whether it has a
 * source-owned value; 53a4eec's did not carry the last field, and several kinds and notes differ.
 * Regenerating with the FROZEN module reproduces exactly what that producer emitted.
 */
function downgradeTo53a4eec(dir: string) {
  writeFileSync(join(dir, 'seed-coverage.json'),
    coverageFor(dir, '53a4eec', (preseed, before) => legacy53aCoverage({ preseed, before })));
}

/**
 * C18.1.12 classifies the two governed-lifetime columns as source-owned formulas rather than bare
 * timestamps, which changes the delivered coverage REPORT. Every frozen differential regenerates
 * the report with its OWN module, so each one keeps measuring the semantic change it was written
 * for rather than a contract version number.
 */
function downgradeToA424505(dir: string) {
  writeFileSync(join(dir, 'seed-coverage.json'),
    coverageFor(dir, 'a424505', (preseed, before) => legacyA42Coverage({ preseed, before })));
}

function downgradeTo77489f5(dir: string) {
  writeFileSync(join(dir, 'seed-coverage.json'),
    coverageFor(dir, '77489f5', (preseed, before) => legacy774Coverage({ preseed, before })));
}

function downgradeToBfc8695(dir: string) {
  editJson(dir, 'commands.json', (cmds: any[]) => {
    for (let i = cmds.length - 1; i >= 0; i -= 1) {
      if (!String(cmds[i].label).startsWith('a-a-preseed-')) continue;
      for (const st of ['stdout', 'stderr', 'exit']) rmSync(join(dir, 'raw', `${cmds[i].id}.${st}.txt`), { force: true });
      cmds.splice(i, 1);
    }
  });
  rmSync(join(dir, 'path-a-preseed.json'), { force: true });
  rmSync(join(dir, 'seed-coverage.json'), { force: true });
  renumberCommands(dir);
}

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

/**
 * C18.1.10 — THE PRISTINE EXTRACTION, taken ONCE per suite.
 *
 * C18.1.9 unzipped the archive, mutated it, rezipped it and let the CLI unzip it again for every
 * one of ~234 controls, which is why the suite took hours. The genuine archive is now ingested
 * and authenticated once; each semantic control copies that pristine tree, mutates the copy and
 * runs the SAME shared semantic core the CLI runs. Archive-boundary properties keep real ZIPs.
 */
let PRISTINE_DIR: string | null = null;
let PRISTINE_DIGEST = '';
const pristineDir = () => {
  if (PRISTINE_DIR === null) {
    const d = mkdtempSync(join(tmpdir(), 'c18-pristine-'));
    expect(spawnSync('unzip', ['-q', ARCHIVE, '-d', d]).status).toBe(0);
    PRISTINE_DIR = d;
    PRISTINE_DIGEST = dirDigest(d);
  }
  return PRISTINE_DIR;
};
/** A stable digest of a whole tree, so a control can prove it never touched the baseline. */
function dirDigest(d: string) {
  const files: string[] = [];
  walkFiles(d, d, files);
  return files.sort().map((f) => `${f}:${sha256(readFileSync(join(d, f)))}`).join('|');
}
/** The authenticated immutable member map for a directory. */
function membersFromDir(d: string) {
  const files: string[] = [];
  walkFiles(d, d, files);
  return new Map(files.sort().map((f) => [f, readFileSync(join(d, f))] as const));
}

/** The pristine member map, read ONCE and reused by every semantic control. */
let PRISTINE_MEMBERS: Map<string, Buffer> | null = null;
const pristineMembers = () => {
  if (PRISTINE_MEMBERS === null) PRISTINE_MEMBERS = membersFromDir(pristineDir());
  return PRISTINE_MEMBERS;
};

/**
 * Apply exactly the declared mutation, rebind every attacker-controlled checksum, and return the
 * resulting member map together with the members that actually changed.
 *
 * Copying the 1,013-member tree cost 223 ms per control — by far the dominant cost once the ZIP
 * round-trip was gone — so the mutation is applied IN PLACE and the tree is then restored
 * byte-exactly from the cached pristine map. Reading and hashing the whole tree costs 17 ms, so
 * the restoration is verified rather than assumed: every control asserts the baseline is
 * byte-identical afterwards.
 */
function mutateMembers(mutate: Mutator, { rebindAfter = true } = {}) {
  const src = pristineDir();
  const pristine = pristineMembers();
  try {
    mutate(src);
    if (rebindAfter) rebind(src);
    const members = membersFromDir(src);
    const changed = [...members.keys()].filter((k) => !pristine.has(k)
      || sha256(members.get(k) as Buffer) !== sha256(pristine.get(k) as Buffer));
    const removed = [...pristine.keys()].filter((k) => !members.has(k));
    return { members, changed: [...changed, ...removed].sort() };
  } finally {
    // Restore EXACTLY the pristine bytes, then prove the restoration was complete.
    const now: string[] = [];
    walkFiles(src, src, now);
    for (const f of now) if (!pristine.has(f)) rmSync(join(src, f), { force: true });
    for (const [f, bytes] of pristine) {
      const abs = join(src, f);
      if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(bytes)) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
    }
    expect(dirDigest(src), 'the pristine baseline was not restored').toBe(PRISTINE_DIGEST);
  }
}

/**
 * Real-ZIP form, for archive-boundary properties and the frozen-predecessor differentials, whose
 * verifiers are frozen and take a zipPath. It reuses the pristine tree rather than re-extracting
 * the archive for each control, and restores it byte-exactly afterwards.
 */
function mutateArchive(mutate: Mutator, { rebindAfter = true } = {}) {
  const src = pristineDir();
  const pristine = pristineMembers();
  const out = mkdtempSync(join(tmpdir(), 'c18-zip-'));
  const zip = join(out, 'mutated.zip');
  try {
    mutate(src);
    if (rebindAfter) rebind(src);
    expect(spawnSync('zip', ['-qrX', zip, '.'], { cwd: src }).status).toBe(0);
  } finally {
    const now: string[] = [];
    walkFiles(src, src, now);
    for (const f of now) if (!pristine.has(f)) rmSync(join(src, f), { force: true });
    for (const [f, bytes] of pristine) {
      const abs = join(src, f);
      if (!existsSync(abs) || sha256(readFileSync(abs)) !== sha256(bytes)) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
    }
    expect(dirDigest(src), 'the pristine baseline was not restored').toBe(PRISTINE_DIGEST);
  }
  return { dir: out, zip };
}

const editJson = (dir: string, name: string, edit: (doc: any) => void) => {
  const p = join(dir, name);
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  edit(doc);
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
};

/**
 * The checkout's source binding, derived ONCE. It is identical for every archive judged against
 * this checkout, and shelling out to git per control cost about 22 ms each — real time on a
 * loaded hosted runner. The binding is still checked against every archive.
 */
let SOURCE_BINDING: unknown = null;
const sourceBinding = () => {
  if (SOURCE_BINDING === null) SOURCE_BINDING = deriveSourceBinding(REPO);
  return SOURCE_BINDING;
};

/**
 * C18.1.12 — the frozen legs run through the MEMBER MAP too.
 *
 * A differential leg that builds a real ZIP and re-ingests it costs about a second per case, and
 * the frozen a424505 and 2c3cab3 verifiers both carry the split ingress/semantic architecture, so
 * they can judge the same member map the corrected verifier judges. Real-ZIP ingress controls are
 * kept separately and unchanged — this only stops paying for ingress twice per semantic case.
 */
const LEGACY_BINDINGS = new Map<string, unknown>();
const legacyBinding = (key: string, derive: (root: string) => unknown) => {
  if (!LEGACY_BINDINGS.has(key)) LEGACY_BINDINGS.set(key, derive(REPO));
  return LEGACY_BINDINGS.get(key);
};

async function expectReject(mutate: Mutator, pattern: RegExp, opts: { rebindAfter?: boolean } = {}) {
  const { members } = mutateMembers(mutate, opts);
  const r = await verifySemantics({ members, root: REPO, sourceBinding: sourceBinding() });
  expect(r.ok).toBe(false);
  expect(r.problems.join('\n')).toMatch(pattern);
}

/** The same judgement through the REAL CLI path, proving the two are equivalent. */
async function expectRejectViaZip(mutate: Mutator, pattern: RegExp, opts: { rebindAfter?: boolean } = {}) {
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
    }, /closing audit event actor is .*principal:forged|canonical bytes or hash changed/, {}],
    ['a deleted audit world', (d: string) => {
      for (const f of ['path-a-before.json', 'path-a-after.json', 'path-a-final.json']) {
        editJson(d, f, (doc) => { doc.audit.events = []; doc.audit.heads = []; });
      }
    }, /seed contract: platform audit partition has 0|is missing from the audit view/, {}],
    ['a removed operation-ledger row', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.tables['ctx.operation'].rows = []; });
    }, /ctx\.operation has no row for the recorded post-upgrade correlation|rows differ from their raw query receipt|row_count/, {}],
    ['a removed operation effect', (d: string) => {
      editJson(d, 'path-a-final.json', (doc) => { doc.tables['ctx.operation_effect'].rows = []; });
    }, /no row for the post-upgrade operation|rows differ from their raw query receipt|row_count/, {}],
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
    }, /shared the 'EYE_DB_PASSWORD' credential|credential digest REUSED/, {}],
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
    }, /does not contain a passing vitest summary|EXACTLY one passing vitest summary|not the code-owned count|bytes\/digest do not match/, {}],
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
    }, /parsed counts .* do not match the receipt|not the code-owned count|recorded counts/, {}],
    ['a wrong suite command', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => {
        doc.suite_receipts[0].argv_redacted = ['echo', 'ok'];
      });
    }, /is not (EXACTLY )?the matrix command/, {}],
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
      expect(joined).toMatch(/seed contract|MISSING field 'seed_summary'/);
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
    }, /seed record fields are not the exact closed schema/],
    ['a false manifest source_tree', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.source_tree = 'b'.repeat(40); });
    }, /source_tree .* is not this checkout/],
    ['a tampered manifest suite_matrix', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.suite_matrix.integration.expected_tests = 1; });
    }, /suite_matrix is not exactly the code-owned matrix/],
    ['a false seed_summary count', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.seed_summary.tenants = 99; });
    }, /seed_summary .* is not the record-derived/],
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

/** Rewrite a processed snapshot table AND its command-bound raw receipt consistently, with
 * the ledger's stream digest rebound — the full-rebinding discipline every C18.1.2 mutation
 * follows so only the SEMANTIC layer can reject. */
function setStream(dir: string, label: string, stream: 'stdout' | 'stderr' | 'exit', content: Buffer) {
  editJson(dir, 'commands.json', (cmds: any[]) => {
    const c = cmds.find((x) => x.label === label);
    expect(c, `ledger command '${label}'`).toBeDefined();
    writeFileSync(join(dir, 'raw', `${c.id}.${stream}.txt`), content);
    c[`${stream}_bytes`] = content.byteLength;
    c[`${stream}_sha256`] = sha256(content);
  });
}
function rewriteRowsAndRaw(dir: string, snapFile: string, pfx: string, table: string, editRows: (rows: any[]) => void) {
  editJson(dir, snapFile, (doc) => {
    editRows(doc.tables[table].rows);
    doc.tables[table].row_count = doc.tables[table].rows.length;
    setStream(dir, `${pfx}-rows-${table.replace('.', '_')}`, 'stdout', Buffer.from(JSON.stringify(doc.tables[table].rows)));
  });
}
/** Renumber the whole ledger after an insertion/deletion: position-bound ids, renamed raw
 * streams, and manifest suite receipts all rebound — the id-sequence check alone must NOT be
 * what stops a doctored ledger. */
function renumberCommands(dir: string) {
  const cmds = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8')) as any[];
  const staged = cmds.map((c) => ({
    c,
    streams: Object.fromEntries((['stdout', 'stderr', 'exit'] as const).map((s) => [
      s, readFileSync(join(dir, 'raw', `${c.id}.${s}.txt`)),
    ])),
  }));
  const idMap = new Map<string, string>();
  staged.forEach(({ c }, i) => {
    const nid = commandIdFor(i + 1, c.label);
    if (!idMap.has(c.id)) idMap.set(c.id, nid);
    c.id = nid;
  });
  rmSync(join(dir, 'raw'), { recursive: true, force: true });
  mkdirSync(join(dir, 'raw'));
  for (const { c, streams } of staged) {
    for (const s of ['stdout', 'stderr', 'exit'] as const) {
      writeFileSync(join(dir, 'raw', `${c.id}.${s}.txt`), streams[s] as Buffer);
    }
  }
  writeFileSync(join(dir, 'commands.json'), `${JSON.stringify(cmds, null, 2)}\n`);
  editJson(dir, 'c18-manifest.json', (doc) => {
    for (const r of doc.suite_receipts) {
      r.command_id = idMap.get(r.command_id) ?? r.command_id;
      r.stdout_file = `raw/${r.command_id}.stdout.txt`;
      r.stderr_file = `raw/${r.command_id}.stderr.txt`;
      r.exit_file = `raw/${r.command_id}.exit.txt`;
    }
    for (const e of doc.migration_executions ?? []) {
      e.command_id = idMap.get(e.command_id) ?? e.command_id;
      if (e.attest_command_id !== undefined) e.attest_command_id = idMap.get(e.attest_command_id) ?? e.attest_command_id;
      if (e.inventory_command_id !== undefined) e.inventory_command_id = idMap.get(e.inventory_command_id) ?? e.inventory_command_id;
    }
    for (const phase of ['removals', 'inspections']) {
      for (const row of doc.cleanup?.[phase] ?? []) row.command_id = idMap.get(row.command_id) ?? row.command_id;
    }
  });
}

describe('C18.1.2 — DIFFERENTIAL: the TEN false passes the frozen 567a70f verifier ACCEPTED', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 567a70f verifier accepts the genuine archive in ITS format', async () => {
    // C18.1.3 raised the evidence format, so the predecessor is shown the same run downgraded to
    // the shape its own producer emitted (see downgradeTo15e8239).
    const { dir, zip } = mutateArchive(downgradeTo15e8239);
    try {
      const r = await legacy567({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each([
    ['1: a DUPLICATE command-ledger entry', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        const i = c.findIndex((x) => x.label === 'a-port-5432');
        c.splice(i + 1, 0, { ...c[i] });
      });
      renumberCommands(d);
    }, /DUPLICATE command label 'a-port-5432'/],
    ['2: a DELETED provisioning command and its three streams', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        const i = c.findIndex((x) => x.label === 'a-redis-run');
        for (const ext of ['stdout', 'stderr', 'exit']) rmSync(join(d, 'raw', `${c[i].id}.${ext}.txt`));
        c.splice(i, 1);
      });
      renumberCommands(d);
    }, /command graph: expected 'a-redis-run'/],
    ['3: a non-suite command and its raw exit changed to 97', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => { c.find((x) => x.label === 'a-migrate-historical').exit = 97; });
      setStream(d, 'a-migrate-historical', 'exit', Buffer.from('97\n'));
    }, /'a-migrate-historical' recorded exit 97 signal null; the graph requires success/],
    ['4: a tampered a-port-5432 stdout receipt', (d: string) => {
      setStream(d, 'a-port-5432', 'stdout', Buffer.from('0.0.0.0:1\n127.0.0.1:1\n'));
    }, /'a-port-5432' port-discovery output does not equal the recorded path-a-upgraded port/],
    ['5: a FORGED seeded principal id', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => {
        doc.principals[0].principalId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      });
    }, /seed record principal ffffffff-ffff-4fff-8fff-ffffffffffff is not in the snapshot/],
    ['6: manifest seed_summary.principals set to 999', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.seed_summary.principals = 999; });
    }, /manifest seed_summary .* is not the record-derived/],
    ['7: a FORGED post-upgrade eventId in manifest AND seed record', (d: string) => {
      const forged = 'ffffffff-ffff-4fff-8fff-fffffffffffe';
      editJson(d, 'c18-manifest.json', (doc) => { doc.post_upgrade_operation.eventId = forged; });
      editJson(d, 'path-a-seed-record.json', (doc) => { doc.post_upgrade_operation.eventId = forged; });
    }, /does not name its recorded eventId|has no objects\.object_outbox row|final-outbox event/],
    ['8: identical attacker posture.roles on BOTH paths with genuine raw retained', (d: string) => {
      const forged = { role: 'eye_attacker', login: true, super: true, createrole: true, createdb: true, bypassrls: true, inherit: true, connlimit: -1 };
      editJson(d, 'path-a-after.json', (doc) => { doc.posture.roles = [...doc.posture.roles, forged]; });
      editJson(d, 'path-b-virgin.json', (doc) => {
        const after = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8'));
        doc.posture.roles = after.posture.roles;
      });
    }, /posture category 'roles' differs from its raw receipt/],
    ['9: the closure decision flipped to evidence_only=true (raw rebound)', (d: string) => {
      const po = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8')).post_upgrade_operation;
      rewriteRowsAndRaw(d, 'path-a-final.json', 'a-a-final', 'policy.policy_decisions', (rows) => {
        rows.find((r) => r.id === po.decisionId).evidence_only = true;
      });
    }, /evidence_only=true; an ENFORCED closure requires evidence_only=false/],
    ['10: the closure decision principal changed to principal:attacker (raw rebound)', (d: string) => {
      const po = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8')).post_upgrade_operation;
      rewriteRowsAndRaw(d, 'path-a-final.json', 'a-a-final', 'policy.policy_decisions', (rows) => {
        rows.find((r) => r.id === po.decisionId).principal_id = 'principal:attacker';
      });
    }, /decision principal is "principal:attacker"/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)(
    'case %s — 567a70f ACCEPTS it; C18.1.2 REJECTS it for its semantic reason',
    async (_label, mutate, pattern) => {
      const legacyCase = mutateArchive((d) => { downgradeTo15e8239(d); mutate(d); });
      try {
        const old = await legacy567({ zipPath: legacyCase.zip, root: REPO });
        expect(old.ok, `the frozen 567a70f verifier must accept this rebound false package; problems: ${old.problems.join('; ')}`).toBe(true);
      } finally {
        rmSync(legacyCase.dir, { recursive: true, force: true });
      }
      await expectReject(mutate, pattern);
    },
  );
});

describe('C18.1.2 — command-graph, binding and projection controls (new-verifier rejections)', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['two adjacent snapshot commands REORDERED (renumbered)', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        const i = c.findIndex((x) => x.label === 'a-a-before-roles');
        [c[i], c[i + 1]] = [c[i + 1], c[i]];
      });
      renumberCommands(d);
    }, /command graph: expected 'a-a-before-roles'/],
    ['an extra unknown trailing command with bound streams', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        const id = commandIdFor(c.length + 1, 'attacker-extra');
        const out = Buffer.from('');
        writeFileSync(join(d, 'raw', `${id}.stdout.txt`), out);
        writeFileSync(join(d, 'raw', `${id}.stderr.txt`), out);
        writeFileSync(join(d, 'raw', `${id}.exit.txt`), '0\n');
        c.push({
          id, label: 'attacker-extra', argv: ['true'], cwd: '.', env: {}, timeout_ms: 1000,
          exit: 0, signal: null, stdout_bytes: 0, stdout_sha256: sha256(out),
          stderr_bytes: 0, stderr_sha256: sha256(out), exit_bytes: 3, exit_sha256: sha256('0\n'),
        });
      });
    }, /unauthorized trailing command|expected .* found 'attacker-extra'/],
    ['a command relocated to a foreign cwd', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => { c.find((x) => x.label === 'a-migrate-historical').cwd = '/tmp'; });
    }, /cwd "\/tmp" is not the repository root/],
    ['a suite command bound to the WRONG database', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        c.find((x) => x.label === 'a-suite-integration').env.EYE_DB_NAME = 'eye_b_00000000';
      });
    }, /'a-suite-integration' env EYE_DB_NAME .* binding requires/],
    ['a suite command with an unredacted-looking secret env', (d: string) => {
      editJson(d, 'commands.json', (c: any[]) => {
        c.find((x) => x.label === 'a-suite-integration').env.EYE_DB_PASSWORD = 'not-a-placeholder';
      });
    }, /env EYE_DB_PASSWORD is "not-a-placeholder"/],
    ['a pg-run container id contradicting the isolation receipt', (d: string) => {
      setStream(d, 'a-pg-run', 'stdout', Buffer.from(`${'f'.repeat(64)}\n`));
    }, /'a-pg-run' raw container id does not match the path-a-upgraded isolation receipt/],
    ['a forged audit-table projection over a genuine JCS body (raw rebound)', (d: string) => {
      rewriteRowsAndRaw(d, 'path-a-final.json', 'a-a-final', 'audit.audit_events', (rows) => {
        rows.find((r) => r.partition_id === 'platform').actor = 'principal:attacker';
      });
    }, /generated projection 'actor' disagrees with its canonical event_jcs/],
    ['an audit-table row diverging from the audit view (raw rebound)', (d: string) => {
      rewriteRowsAndRaw(d, 'path-a-final.json', 'a-a-final', 'audit.audit_events', (rows) => {
        rows.pop();
      });
    }, /audit view row .* has no audit\.audit_events table row|rows differ from their raw query receipt/],
    ['a tampered tables-meta receipt hiding a table (ledger rebound)', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const c = cmds.find((x: any) => x.label === 'a-a-before-tables-meta');
      const meta = JSON.parse(readFileSync(join(d, 'raw', `${c.id}.stdout.txt`), 'utf8'));
      setStream(d, 'a-a-before-tables-meta', 'stdout', Buffer.from(JSON.stringify(meta.slice(1))));
    }, /not the source-owned 26-table universe|table set differs/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/**
 * C18.1.3 raises the EVIDENCE format (governed migration-execution receipts, sanitized seeding
 * step receipts, executed-cleanup commands and receipts, per-session identity correlations), so
 * the frozen 15e8239 verifier cannot read a C18.1.3 archive at all. To compare the two verifiers
 * honestly across that change, each differential applies THE SAME mutation to each verifier's own
 * genuine archive: the frozen verifier judges a faithful downgrade of this run's archive to the
 * exact shape its own producer emitted, and C18.1.3 judges the archive as produced. Both archives
 * describe the same run at the same source SHA.
 */
function downgradeTo15e8239(dir: string) {
  // Formats stack: C18.1.4 -> 83d158c -> 15e8239. Normalise the newer layer first.
  downgradeTo83d158c(dir);
  editJson(dir, 'commands.json', (cmds: any[]) => {
    for (let i = cmds.length - 1; i >= 0; i -= 1) {
      if (/^cleanup-(rm|inspect)-/.test(cmds[i].label)) {
        for (const ext of ['stdout', 'stderr', 'exit']) rmSync(join(dir, 'raw', `${cmds[i].id}.${ext}.txt`), { force: true });
        cmds.splice(i, 1);
      }
    }
  });
  editJson(dir, 'c18-manifest.json', (m) => {
    delete m.migration_executions;
    m.cleanup = { removed: m.cleanup.removed, failures: m.cleanup.failures, kept: m.cleanup.kept };
  });
  editJson(dir, 'path-a-seed-record.json', (s) => {
    delete s.steps;
    for (const sess of s.sessions) delete sess.correlation;
  });
}

/** Mutations that exist in BOTH evidence formats, so one function can be applied to each. */
/**
 * C18.1.4 raises the evidence format again (per-migration attestation commands, authenticated
 * absence probes, `attest_command_id`), so the 83d158c verifier cannot read a C18.1.4 archive.
 * This produces EXACTLY what the 83d158c producer emitted for the same run: attestations removed,
 * absence probes restored to the `docker inspect`-exits-nonzero form its graph expected, and the
 * ledger renumbered so every position-bound id is correct again.
 */
/**
 * C18.1.5 adds a per-execution workspace INVENTORY command, rebuilds the attestation argv from
 * the enumerated directory, and records `inventory`/`applied` on each execution receipt. This
 * produces exactly what the 7be02b8 producer emitted for the same run.
 */
/**
 * C18.1.6 enumerates the governed workspace with the tracked cross-platform helper (canonical
 * JSON, dot-prefixed names, file types) instead of `ls -1`, and records the helper's digest.
 * This produces exactly what the 8362cba producer emitted for the same run.
 */
function downgradeTo8362cba(dir: string) {
  downgradeToBfc8695(dir);
  const manifest = JSON.parse(readFileSync(join(dir, 'c18-manifest.json'), 'utf8'));
  const byLabel = new Map<string, any>((manifest.migration_executions ?? []).map((e: any) => [e.label, e]));
  editJson(dir, 'commands.json', (cmds: any[]) => {
    for (const c of cmds) {
      const label = String(c.label);
      if (label.endsWith('-inventory')) {
        const e = byLabel.get(label.replace(/-inventory$/, ''));
        if (e === undefined) continue;
        // 8362cba enumerated with `ls -1`, which emits line-delimited names.
        c.argv = ['ls', '-1', `${e.workspace}/migrations`];
        const names = (e.inventory ?? []).map((x: any) => x?.name ?? x);
        const out = Buffer.from(`${names.join('\n')}\n`);
        writeFileSync(join(dir, 'raw', `${c.id}.stdout.txt`), out);
        c.stdout_bytes = out.byteLength;
        c.stdout_sha256 = sha256(out);
      } else if (label.endsWith('-attest')) {
        const e = byLabel.get(label.replace(/-attest$/, ''));
        if (e === undefined) continue;
        // 8362cba's attestation covered the runner and the migrations only — never the helper.
        const helperPath = `${e.workspace}/scripts/c18-inventory.mjs`;
        c.argv = (c.argv as string[]).filter((a) => a !== helperPath);
        const kept = readFileSync(join(dir, 'raw', `${c.id}.stdout.txt`), 'utf8')
          .split('\n').filter((l) => !l.endsWith(`  ${helperPath}`)).join('\n');
        const out = Buffer.from(kept);
        writeFileSync(join(dir, 'raw', `${c.id}.stdout.txt`), out);
        c.stdout_bytes = out.byteLength;
        c.stdout_sha256 = sha256(out);
      }
    }
  });
  editJson(dir, 'c18-manifest.json', (m) => {
    for (const e of m.migration_executions ?? []) {
      e.inventory = (e.inventory ?? []).map((x: any) => x?.name ?? x);
      delete e.inventory_helper_sha256;
    }
  });
}

function downgradeTo7be02b8(dir: string) {
  downgradeTo8362cba(dir);
  const manifest = JSON.parse(readFileSync(join(dir, 'c18-manifest.json'), 'utf8'));
  const byLabel = new Map<string, any>((manifest.migration_executions ?? []).map((e: any) => [e.label, e]));
  editJson(dir, 'commands.json', (cmds: any[]) => {
    for (let i = cmds.length - 1; i >= 0; i -= 1) {
      const c = cmds[i];
      if (String(c.label).endsWith('-inventory')) {
        for (const st of ['stdout', 'stderr', 'exit']) rmSync(join(dir, 'raw', `${c.id}.${st}.txt`), { force: true });
        cmds.splice(i, 1);
        continue;
      }
      if (String(c.label).endsWith('-attest')) {
        // 7be02b8 built the attestation argv from the manifest's CLAIMED migration list.
        const e = byLabel.get(String(c.label).replace(/-attest$/, ''));
        if (e !== undefined) {
          c.argv = ['shasum', '-a', '256', `${e.workspace}/scripts/migrate.mjs`,
            ...e.migrations.map((m: any) => `${e.workspace}/migrations/${m.filename}`)];
        }
      }
    }
  });
  editJson(dir, 'c18-manifest.json', (m) => {
    for (const e of m.migration_executions ?? []) {
      delete e.inventory_command_id;
      delete e.inventory;
      delete e.applied;
    }
  });
  renumberCommands(dir);
}

function downgradeTo83d158c(dir: string) {
  downgradeTo7be02b8(dir);
  editJson(dir, 'commands.json', (cmds: any[]) => {
    for (let i = cmds.length - 1; i >= 0; i -= 1) {
      const c = cmds[i];
      if (String(c.label).endsWith('-attest')) {
        for (const s of ['stdout', 'stderr', 'exit']) rmSync(join(dir, 'raw', `${c.id}.${s}.txt`), { force: true });
        cmds.splice(i, 1);
        continue;
      }
      if (String(c.label).startsWith('cleanup-absent-')) {
        const name = String(c.label).slice('cleanup-absent-'.length);
        c.label = `cleanup-inspect-${name}`;
        c.argv = ['docker', 'inspect', name];
        c.exit = 1;
        const exitBuf = Buffer.from('1\n');
        writeFileSync(join(dir, 'raw', `${c.id}.exit.txt`), exitBuf);
        c.exit_bytes = exitBuf.byteLength;
        c.exit_sha256 = sha256(exitBuf);
      }
    }
  });
  editJson(dir, 'c18-manifest.json', (m) => {
    for (const e of m.migration_executions ?? []) delete e.attest_command_id;
    for (const row of m.cleanup?.inspections ?? []) row.exit = 1;
  });
  renumberCommands(dir);
}

const SHARED_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['1: snapshot SQL substitution behind genuine output', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'a-a-before-rows-tenancy_tenants');
      c.argv[c.argv.length - 1] = "select coalesce(json_agg(to_jsonb(t) order by t.\"id\"), '[]'::json) from tenancy.tenants t where 1=1";
    });
  }, /is not the source-owned/],
  ['2: posture SQL substitution behind genuine output', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'a-a-after-roles');
      c.argv[c.argv.length - 1] = "select '[]'::json";
    });
  }, /is not the source-owned/],
  ['3: any other snapshot query replaced', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'b-b-virgin-constraints');
      c.argv[c.argv.length - 1] = 'select 1';
    });
  }, /is not the source-owned/],
  ['4: attacker migration-runner path', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'a-migrate-historical');
      c.argv[1] = '/attacker/scripts/migrate.mjs';
    });
    if (existsSync(join(d, 'c18-manifest.json'))) {
      editJson(d, 'c18-manifest.json', (m) => {
        if (!Array.isArray(m.migration_executions)) return;
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
        e.runner_path = '/attacker/scripts/migrate.mjs';
        e.workspace = '/attacker';
      });
    }
  }, /is not a governed workspace path|is not the governed workspace runner/],
  ['5: wrong suite secret class', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      cmds.find((x) => x.label === 'a-suite-integration').env.EYE_DB_PASSWORD = '<REDACTED:attacker:WRONG_CLASS>';
    });
  }, /env EYE_DB_PASSWORD is .*attacker:WRONG_CLASS/],
  ['6: wrong Redis secret class', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'a-redis-run');
      c.argv[c.argv.length - 1] = '<REDACTED:a:EYE_DB_PASSWORD>';
    });
  }, /requirepass is not the path-a EYE_REDIS_PASSWORD class/],
  ['7: Path-A command carrying a Path-B placeholder', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      cmds.find((x) => x.label === 'a-suite-integration').env.EYE_DB_APP_PASSWORD = '<REDACTED:b:EYE_DB_APP_PASSWORD>';
    });
  }, /env EYE_DB_APP_PASSWORD is .*REDACTED:b:/],
  ['7b: two secret classes swapped within one path', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      const c = cmds.find((x) => x.label === 'a-suite-acceptance');
      c.env.EYE_DB_COMMIT_PASSWORD = '<REDACTED:a:EYE_DB_IDENTITY_PASSWORD>';
      c.env.EYE_DB_IDENTITY_PASSWORD = '<REDACTED:a:EYE_DB_COMMIT_PASSWORD>';
    });
  }, /env EYE_DB_COMMIT_PASSWORD is/],
  ['7c: wrong-path PGPASSWORD in argv', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      cmds.find((x) => x.label === 'a-a-before-ledger').argv[3] = 'PGPASSWORD=<REDACTED:b:EYE_DB_PASSWORD>';
    });
  }, /carries path 'b' credential material in a path-'a' command/],
  ['8: forged session familyId', (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => { doc.sessions[0].familyId = FORGED_UUID; });
  }, /familyId .* differs from the snapshot family/],
  ['9: forged canonical-object correlation', (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => { doc.objects[0].correlation = doc.objects[1].correlation; });
  }, /differs from the canonical object's audit correlation/],
  ['10: extra unused correlation UUID', (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => { doc.correlations.push(FORGED_UUID); });
  }, /appears NOWHERE in the seeded world and belongs to no recorded session/],
  ['11: an ADDITIONAL live role binding', (d) => {
    const seed = JSON.parse(readFileSync(join(d, 'path-a-seed-record.json'), 'utf8'));
    const analyst = seed.principals.find((p: any) => p.roleCode === 'domain_analyst');
    let forged: any = null;
    for (const [snapFile, pfx] of [['path-a-before.json', 'a-a-before'], ['path-a-after.json', 'a-a-after'], ['path-a-final.json', 'a-a-final']]) {
      editJson(d, snapFile!, (doc) => {
        const t = doc.tables['identity.role_bindings'];
        if (forged === null) {
          forged = {
            ...t.rows.find((r: any) => r.role_code === 'tenant_admin'), id: FORGED_UUID,
            principal_id: analyst.principalId, role_code: 'platform_admin', scope: 'PLATFORM',
            tenant_id: null, domain_id: null,
          };
        }
        t.rows = [...t.rows, { ...forged }].sort((a: any, b: any) => (a.id < b.id ? -1 : 1));
        t.row_count = t.rows.length;
      });
      const doc = JSON.parse(readFileSync(join(d, snapFile!), 'utf8'));
      setStream(d, `${pfx}-rows-identity_role_bindings`, 'stdout', Buffer.from(JSON.stringify(doc.tables['identity.role_bindings'].rows)));
    }
  }, /carries live role binding .*platform_admin.*which the seed record does not account for/],
  ['12: swapped Path-A/Path-B integration suite streams', (d) => {
    editJson(d, 'c18-manifest.json', (doc) => {
      const a = doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded');
      const b = doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-b-virgin');
      for (const f of ['stdout_file', 'stderr_file', 'exit_file', 'stdout_bytes', 'stdout_sha256', 'stderr_bytes', 'stderr_sha256']) {
        const t = a[f]; a[f] = b[f]; b[f] = t;
      }
    });
  }, /is not its own command's stream/],
  ['12b: suite streams AND command_id swapped together', (d) => {
    editJson(d, 'c18-manifest.json', (doc) => {
      const a = doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-a-upgraded');
      const b = doc.suite_receipts.find((r: any) => r.suite === 'integration' && r.path === 'path-b-virgin');
      for (const f of ['command_id', 'stdout_file', 'stderr_file', 'exit_file', 'stdout_bytes', 'stdout_sha256', 'stderr_bytes', 'stderr_sha256']) {
        const t = a[f]; a[f] = b[f]; b[f] = t;
      }
    });
  }, /command environment is not the path-[ab].* instance binding/],
];

describe('C18.1.3 — DIFFERENTIAL: the frozen 15e8239 verifier ACCEPTED what C18.1.3 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: C18.1.3 accepts the genuine archive; 15e8239 accepts its faithful downgrade', async () => {
    const now = await verifyEvidence({ zipPath: ARCHIVE, root: REPO });
    expect(now.problems).toEqual([]);
    const { dir, zip } = mutateArchive(downgradeTo15e8239);
    try {
      const old = await legacy15e({ zipPath: zip, root: REPO });
      expect(old.problems, 'the downgrade must be exactly what the 15e8239 producer emitted').toEqual([]);
      expect(old.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(SHARED_MUTATIONS)('%s — 15e8239 ACCEPTS it; C18.1.3 REJECTS it', async (_label, mutate, pattern) => {
    // Leg 1: the frozen verifier, judging its own producer's evidence shape, accepts the mutation.
    const legacyCase = mutateArchive((d) => { downgradeTo15e8239(d); mutate(d); });
    try {
      const old = await legacy15e({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen 15e8239 verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    // Leg 2: C18.1.3, judging the same mutation of the archive as produced, rejects it for the
    // intended semantic reason.
    await expectReject(mutate, pattern);
  });

  it('13: cleanup EXECUTION and governed seeding receipts — 15e8239 required neither', async () => {
    const { dir, zip } = mutateArchive(downgradeTo15e8239);
    try {
      const old = await legacy15e({ zipPath: zip, root: REPO });
      expect(old.ok, 'the frozen verifier accepts evidence in which cleanup was only ASSERTED').toBe(true);
      const now = await verifyEvidence({ zipPath: zip, root: REPO });
      expect(now.ok).toBe(false);
      const joined = now.problems.join('\n');
      expect(joined).toMatch(/cleanup fields are not the exact closed receipt set|expected 'cleanup-rm-/);
      expect(joined).toMatch(/migration_executions|governed migration-execution receipt/);
      expect(joined).toMatch(/seed record fields are not the exact closed schema|governed seed step/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('C18.1.3 — direct rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['an attacker runner inside a governed-LOOKING workspace', (d: string) => {
      const forged = '/tmp/c18-a-abc123';
      editJson(d, 'commands.json', (cmds: any[]) => {
        cmds.find((x) => x.label === 'a-migrate-historical').argv[1] = `${forged}/scripts/migrate.mjs`;
      });
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
        e.workspace = forged; e.runner_path = `${forged}/scripts/migrate.mjs`;
        e.runner_sha256 = sha256('attacker runner');
      });
    }, /ran a runner whose bytes are not the tracked/],
    ['a migration workspace holding migrations beyond its ceiling', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
        e.migrations = e.migrations.slice(0, 8);
      });
    }, /workspace migration set is not exactly the tracked/],
    ['a migration execution bound to another command', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
        const other = m.migration_executions.find((x: any) => x.label === 'b-migrate-latest');
        e.command_id = other.command_id;
      });
    }, /bound to command|is bound to a different command/],
    ['a deleted cleanup removal command', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const victim = m.cleanup.removals[0];
      editJson(d, 'commands.json', (cmds: any[]) => {
        const i = cmds.findIndex((c) => c.id === victim.command_id);
        for (const ext of ['stdout', 'stderr', 'exit']) rmSync(join(d, 'raw', `${cmds[i].id}.${ext}.txt`));
        cmds.splice(i, 1);
      });
    }, /expected 'cleanup-rm-|names a command id that does not exist|breaks the sequence/],
    ['a post-removal absence probe that found the container', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const probe = m.cleanup.inspections[0];
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const label = cmds.find((c: any) => c.id === probe.command_id).label;
      setStream(d, label, 'stdout', Buffer.from('9f81ee4c2b7a\n'));
    }, /STILL EXISTS after checked removal|returned output — the container still exists|produced \d+ bytes/],
    ['a cleanup removal recorded as failed', (d: string) => {
      editJson(d, 'c18-manifest.json', (doc) => { doc.cleanup.failures = ['docker rm -fv refused']; });
    }, /cleanup failures or kept containers|records removal failures/],
    ['a forged governed seeding-step port list', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => { doc.steps[3].ports = [...doc.steps[3].ports, 'attacker.port']; });
    }, /ports .* are not the source-owned era ports/],
    ['a seeding step reporting an unaccounted identity', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => { doc.steps[0].ids = [FORGED_UUID]; });
    }, /reports identity .* which the closed seed record does not account for/],
    ['a reordered governed seeding plan', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => {
        const t = doc.steps[1]; doc.steps[1] = doc.steps[2]; doc.steps[2] = t;
      });
    }, /governed seed step \d+ is '.*', the plan requires/],
    ['a MISSING live role binding (15e8239 already caught this one)', (d: string) => {
      const seed = JSON.parse(readFileSync(join(d, 'path-a-seed-record.json'), 'utf8'));
      const victim = seed.principals[0].principalId;
      for (const [snapFile, pfx] of [['path-a-before.json', 'a-a-before'], ['path-a-after.json', 'a-a-after'], ['path-a-final.json', 'a-a-final']]) {
        editJson(d, snapFile!, (doc) => {
          const t = doc.tables['identity.role_bindings'];
          t.rows = t.rows.filter((r: any) => r.principal_id !== victim);
          t.row_count = t.rows.length;
        });
        const doc = JSON.parse(readFileSync(join(d, snapFile!), 'utf8'));
        setStream(d, `${pfx}-rows-identity_role_bindings`, 'stdout', Buffer.from(JSON.stringify(doc.tables['identity.role_bindings'].rows)));
      }
    }, /requires \d+ live role binding\(s\).*the snapshot carries 0|has no live 'tenant_admin' role binding/],
    ['a session correlation the recorded set omits', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => {
        const victim = doc.sessions[0].correlation;
        doc.correlations = doc.correlations.filter((c: string) => c !== victim);
      });
    }, /names correlation .* which the recorded correlation set omits/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/** Mutations that exist in BOTH the C18.1.4 and 83d158c evidence formats. */
const C1814_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['2: a PostgreSQL credential position carrying another VALID class', (d) => {
    editJson(d, 'commands.json', (cmds: any[]) => {
      for (const c of cmds) {
        if (c.label === 'a-a-before-ledger' || c.label === 'a-pg-confirm-0') {
          c.argv[3] = '<REDACTED:a:EYE_DB_APP_PASSWORD>'.replace(/^/, 'PGPASSWORD=');
        }
      }
    });
  }, /this position requires the path-a EYE_DB_PASSWORD class/],
  ['3: a self-asserted runner digest over a foreign workspace', (d) => {
    editJson(d, 'c18-manifest.json', (m) => {
      const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
      const forged = String(e.workspace).replace(/c18-a-[A-Za-z0-9]{6}$/, 'c18-a-Xy7Z9q');
      e.workspace = forged;
      e.runner_path = `${forged}/scripts/migrate.mjs`;
    });
    const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
    const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
    editJson(d, 'commands.json', (cmds: any[]) => {
      cmds.find((c) => c.label === 'a-migrate-historical').argv[1] = e.runner_path;
      const attest = cmds.find((c) => c.label === 'a-migrate-historical-attest');
      if (attest !== undefined) {
        attest.argv = attest.argv.map((a: string, i: number) => (
          i >= 3 ? a.replace(/c18-a-[A-Za-z0-9]{6}/, 'c18-a-Xy7Z9q') : a
        ));
      }
    });
  }, /attestation line 1 hashed|EXECUTED runner whose measured bytes/],
  ['4a: a REMOVED column, processed + raw + checksums rebound', (d) => {
    for (const [snapFile, pfx] of presentSnaps(d)) {
      const doc = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      if (!doc.tables['identity.principals'].columns.includes('revocation_epoch')) continue;
      editJson(d, snapFile, (dd) => {
        const t = dd.tables['identity.principals'];
        t.columns = t.columns.filter((c: string) => c !== 'revocation_epoch');
        t.rows = t.rows.map((r: any) => { const { revocation_epoch, ...rest } = r; void revocation_epoch; return rest; });
        t.row_count = t.rows.length;
        dd.posture.columns = dd.posture.columns.filter((c: string) => !c.includes('identity.principals|revocation_epoch'));
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      setStream(d, `${pfx}-rows-identity_principals`, 'stdout', Buffer.from(JSON.stringify(after.tables['identity.principals'].rows)));
      setStream(d, `${pfx}-columns`, 'stdout', Buffer.from(JSON.stringify(after.posture.columns)));
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const metaCmd = cmds.find((c: any) => c.label === `${pfx}-tables-meta`);
      const meta = JSON.parse(readFileSync(join(d, 'raw', `${metaCmd.id}.stdout.txt`), 'utf8'));
      for (const m of meta) {
        if (m.table === 'identity.principals') m.columns = m.columns.filter((c: string) => c !== 'revocation_epoch');
      }
      setStream(d, `${pfx}-tables-meta`, 'stdout', Buffer.from(JSON.stringify(meta)));
    }
  }, /columns violate the source-owned catalog contract \(missing revocation_epoch\)/],
  ['4b: a WEAKENED foreign-key referential action on both paths', (d) => {
    const TARGET = 'identity.sessions.sessions_principal_id_fkey';
    for (const [snapFile, pfx] of presentSnaps(d)) {
      const doc = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      const target = doc.fks.find((f: any) => f.constraint === TARGET);
      if (target === undefined) continue;
      const newDef = `${target.definition} ON DELETE CASCADE`;
      editJson(d, snapFile, (dd) => {
        for (const f of dd.fks) if (f.constraint === TARGET) f.definition = newDef;
        dd.posture.constraints = dd.posture.constraints.map((c: string) => (
          c.includes('sessions_principal_id_fkey') ? c.replace(target.definition, newDef) : c
        ));
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const fkCmd = cmds.find((c: any) => c.label === `${pfx}-fk-meta`);
      const meta = JSON.parse(readFileSync(join(d, 'raw', `${fkCmd.id}.stdout.txt`), 'utf8'));
      for (const m of meta) if (m.constraint === TARGET) m.definition = newDef;
      setStream(d, `${pfx}-fk-meta`, 'stdout', Buffer.from(JSON.stringify(meta)));
      setStream(d, `${pfx}-constraints`, 'stdout', Buffer.from(JSON.stringify(after.posture.constraints)));
    }
  }, /foreign key '.*sessions_principal_id_fkey' definition violates the source-owned catalog contract/],
  ['5: a role binding re-scoped and re-attributed', (d) => {
    const seed = JSON.parse(readFileSync(join(d, 'path-a-seed-record.json'), 'utf8'));
    const victim = seed.principals.find((p: any) => p.roleCode === 'tenant_admin');
    for (const [snapFile, pfx] of SEEDED_SNAPS) {
      editJson(d, snapFile, (dd) => {
        for (const r of dd.tables['identity.role_bindings'].rows) {
          if (r.principal_id === victim.principalId && r.role_code === 'tenant_admin') {
            r.scope = 'PLATFORM';
            r.tenant_id = null;
            r.granted_by_principal = FORGED_UUID;
            r.granted_by_scope = 'DOMAIN';
          }
        }
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      setStream(d, `${pfx}-rows-identity_role_bindings`, 'stdout', Buffer.from(JSON.stringify(after.tables['identity.role_bindings'].rows)));
    }
  }, /carries live role binding .*which the seed record does not account for/],
  ['6a: a governed seed step reporting NO identities', (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => { doc.steps[3].ids = []; });
  }, /identities are not the record-derived set \(missing /],
  ["6b: a seed step claiming another step's identity", (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => { doc.steps[0].ids = [doc.tenants[0].tenantId]; });
  }, /not this step's work/],
  ['6c: a duplicated identity inside a seed collection', (d) => {
    editJson(d, 'path-a-seed-record.json', (doc) => {
      doc.principals.push({ ...doc.principals[0] });
      doc.steps[4].ids = doc.principals.map((p: any) => p.principalId);
    });
    editJson(d, 'c18-manifest.json', (m) => { m.seed_summary.principals += 1; });
  }, /contains DUPLICATE principalId entries/],
  ['7: cleanup "absence" proved by a failed docker probe', (d) => {
    const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
    const probe = m.cleanup.inspections[0];
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const label = cmds.find((c: any) => c.id === probe.command_id).label;
    editJson(d, 'commands.json', (cs: any[]) => { cs.find((c) => c.id === probe.command_id).exit = 125; });
    setStream(d, label, 'exit', Buffer.from('125\n'));
    setStream(d, label, 'stderr', Buffer.from('Cannot connect to the Docker daemon at unix:///var/run/docker.sock.\n'));
    editJson(d, 'c18-manifest.json', (doc) => { doc.cleanup.inspections[0].exit = 125; });
  }, /absence probe for .* exited 125/],
];

describe('C18.1.4 — DIFFERENTIAL: the frozen 83d158c verifier ACCEPTED what C18.1.4 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 83d158c verifier accepts the genuine archive in ITS format', async () => {
    const { dir, zip } = mutateArchive(downgradeTo83d158c);
    try {
      const r = await legacy83d({ zipPath: zip, root: REPO });
      expect(r.problems, 'the downgrade must be exactly what the 83d158c producer emitted').toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1814_MUTATIONS)('%s — 83d158c ACCEPTS it; C18.1.4 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { downgradeTo83d158c(d); mutate(d); });
    try {
      const old = await legacy83d({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen 83d158c verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.4 — adjacent-field rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a POSTGRES_PASSWORD carrying another valid class', (d: string) => {
      editJson(d, 'commands.json', (cmds: any[]) => {
        cmds.find((c) => c.label === 'a-pg-run').argv[8] = 'POSTGRES_PASSWORD=<REDACTED:a:EYE_DB_SYSTEM_PASSWORD>';
      });
    }, /this position requires the path-a EYE_DB_PASSWORD class/],
    ['a --requirepass carrying the database class', (d: string) => {
      editJson(d, 'commands.json', (cmds: any[]) => {
        const c = cmds.find((x) => x.label === 'b-redis-run');
        c.argv[c.argv.length - 1] = '<REDACTED:b:EYE_DB_PASSWORD>';
      });
    }, /this position requires the path-b EYE_REDIS_PASSWORD class/],
    ['an attestation that hashed a foreign migration file', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const attest = cmds.find((c: any) => c.label === 'b-migrate-latest-attest');
      const out = readFileSync(join(d, 'raw', `${attest.id}.stdout.txt`), 'utf8').split('\n');
      out[3] = `${sha256('attacker migration')}  ${out[3]!.split('  ')[1]}`;
      setStream(d, 'b-migrate-latest-attest', 'stdout', Buffer.from(out.join('\n')));
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'b-migrate-latest');
        e.migrations[2].digest = sha256('attacker migration');
      });
    }, /EXECUTED migration .* whose measured bytes are not the tracked source bytes/],
    ['a migration receipt whose digest disagrees with its attestation', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-upgrade');
        e.runner_sha256 = sha256('elsewhere');
      });
    }, /runner_sha256 disagrees with the attested measurement|not the tracked apps\/api\/scripts\/migrate\.mjs/],
    ['a deleted attestation command', (d: string) => {
      editJson(d, 'commands.json', (cmds: any[]) => {
        const i = cmds.findIndex((c) => c.label === 'a-migrate-upgrade-attest');
        for (const ext of ['stdout', 'stderr', 'exit']) rmSync(join(d, 'raw', `${cmds[i].id}.${ext}.txt`));
        cmds.splice(i, 1);
      });
    }, /expected 'a-migrate-upgrade-attest'|attestation command .* which does not exist|breaks the sequence/],
    ['an absence probe that returned a container id', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const probe = m.cleanup.inspections[1];
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const label = cmds.find((c: any) => c.id === probe.command_id).label;
      setStream(d, label, 'stdout', Buffer.from('9f81ee4c2b7a\n'));
    }, /returned .*container id|returned output — the container still exists|produced \d+ bytes/],
    ['a primary key altered in the catalog', (d: string) => {
      editJson(d, 'path-b-virgin.json', (doc) => { doc.tables['identity.roles'].pk = ['scope']; });
      const after = JSON.parse(readFileSync(join(d, 'path-b-virgin.json'), 'utf8'));
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const metaCmd = cmds.find((c: any) => c.label === 'b-b-virgin-tables-meta');
      const meta = JSON.parse(readFileSync(join(d, 'raw', `${metaCmd.id}.stdout.txt`), 'utf8'));
      for (const m of meta) if (m.table === 'identity.roles') m.pk = ['scope'];
      setStream(d, 'b-b-virgin-tables-meta', 'stdout', Buffer.from(JSON.stringify(meta)));
      void after;
    }, /primary key .* is not the contract's/],
    ['an extra foreign key not in the catalog contract', (d: string) => {
      editJson(d, 'path-b-virgin.json', (doc) => {
        doc.fks.push({
          constraint: 'attacker.shadow.fk', from: 'attacker.shadow', to: 'tenancy.tenants',
          definition: 'FOREIGN KEY (x) REFERENCES tenancy.tenants(id)', validated: true,
          deferrable: false, pairs_count: 0, pairs_digest: sha256('[]'),
        });
      });
    }, /is not in the source-owned catalog contract|reconstructed from raw differs/],
    ['a seed step whose identity set is a strict subset', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => { doc.steps[7].ids = [doc.outbox[0].eventId]; });
    }, /identities are not the record-derived set \(missing /],
    ['a duplicated session in the seed record', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => {
        doc.sessions.push({ ...doc.sessions[0] });
      });
      editJson(d, 'c18-manifest.json', (m) => { m.seed_summary.sessions += 1; });
    }, /sessions contains DUPLICATE sessionId entries/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/** Mutations expressible in BOTH the C18.1.5 and 7be02b8 evidence formats. */
const C1815_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['1a: an ADDITIONAL migration applied by the runner', (d) => {
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const c = cmds.find((x: any) => x.label === 'a-migrate-historical');
    const out = readFileSync(join(d, 'raw', `${c.id}.stdout.txt`), 'utf8');
    setStream(d, 'a-migrate-historical', 'stdout', Buffer.from(
      out.replace('migrations up to date', 'applying 0013_attacker_backdoor.sql ... ok\nmigrations up to date'),
    ));
    editJson(d, 'c18-manifest.json', (m) => {
      const e = m.migration_executions?.find((x: any) => x.label === 'a-migrate-historical');
      if (e?.applied !== undefined) e.applied = [...e.applied, '0013_attacker_backdoor.sql'];
    });
  }, /0013_attacker_backdoor\.sql/],
  ['1b: an ADDITIONAL migration file in the governed workspace', (d) => {
    const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
    const e = (m.migration_executions ?? []).find((x: any) => x.label === 'b-migrate-latest');
    if (e === undefined || !Array.isArray(e.inventory)) return; // 7be02b8 records no inventory
    const extra = '0022_attacker_backdoor.sql';
    const asEntries = e.inventory.every((x: any) => typeof x === 'object');
    const names = e.inventory.map((x: any) => x?.name ?? x);
    const inv = [...names, extra].sort();
    const ws = e.workspace;
    setStream(d, 'b-migrate-latest-inventory', 'stdout', asEntries
      ? Buffer.from(`${JSON.stringify(inv.map((n: string) => ({ name: n, type: 'file' })))}\n`)
      : Buffer.from(`${inv.join('\n')}\n`));
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const at = cmds.find((c: any) => c.label === 'b-migrate-latest-attest');
    const lines = readFileSync(join(d, 'raw', `${at.id}.stdout.txt`), 'utf8').trimEnd().split('\n');
    lines.push(`${sha256('attacker backdoor')}  ${ws}/migrations/${extra}`);
    lines.sort((x, y) => (x.split('  ')[1]! < y.split('  ')[1]! ? -1 : 1));
    setStream(d, 'b-migrate-latest-attest', 'stdout', Buffer.from(`${lines.join('\n')}\n`));
    editJson(d, 'commands.json', (cs: any[]) => {
      cs.find((c) => c.label === 'b-migrate-latest-attest').argv = [
        'shasum', '-a', '256', `${ws}/scripts/migrate.mjs`, ...inv.map((f: string) => `${ws}/migrations/${f}`),
      ];
    });
    editJson(d, 'c18-manifest.json', (mm) => {
      const ee = mm.migration_executions.find((x: any) => x.label === 'b-migrate-latest');
      ee.inventory = asEntries ? inv.map((n: string) => ({ name: n, type: 'file' })) : inv;
    });
  }, /0022_attacker_backdoor\.sql/],
  ['2: an ADDITIONAL seeded tenant', (d) => {
    const extraTenant = 'ffffffff-1111-4fff-8fff-ffffffffff01';
    for (const [snapFile, pfx] of SEEDED_SNAPS) {
      editJson(d, snapFile, (doc) => {
        const t = doc.tables['tenancy.tenants'];
        t.rows = [...t.rows, { ...t.rows[0], id: extraTenant, name: 'c18-tenant-attacker' }];
        t.row_count = t.rows.length;
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      setStream(d, `${pfx}-rows-tenancy_tenants`, 'stdout', Buffer.from(JSON.stringify(after.tables['tenancy.tenants'].rows)));
    }
    editJson(d, 'path-a-seed-record.json', (doc) => {
      doc.tenants.push({ tenantId: extraTenant, name: 'c18-tenant-attacker' });
      doc.steps[3].ids = [...doc.tenants.map((t: any) => t.tenantId), ...doc.domains.map((x: any) => x.domainId)];
    });
    editJson(d, 'c18-manifest.json', (m) => { m.seed_summary.tenants += 1; });
  }, /tenancy\.tenants has 3 row\(s\); the deterministic governed seed produces EXACTLY 2/],
  ['3a: a DUPLICATE active role-binding tuple', (d) => {
    const forgedId = 'ffffffff-2222-4fff-8fff-ffffffffff02';
    for (const [snapFile, pfx] of SEEDED_SNAPS) {
      editJson(d, snapFile, (doc) => {
        const t = doc.tables['identity.role_bindings'];
        const victim = t.rows.find((r: any) => r.role_code === 'tenant_admin');
        t.rows = [...t.rows, { ...victim, id: forgedId }];
        t.row_count = t.rows.length;
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      setStream(d, `${pfx}-rows-identity_role_bindings`, 'stdout', Buffer.from(JSON.stringify(after.tables['identity.role_bindings'].rows)));
    }
  }, /carries 2 copies of live role binding .*DUPLICATE active relationship tuple|identity\.role_bindings has 5 row\(s\)/],
  ['3b: an UNEXPECTED revoked role binding', (d) => {
    const forgedId = 'ffffffff-3333-4fff-8fff-ffffffffff03';
    for (const [snapFile, pfx] of SEEDED_SNAPS) {
      editJson(d, snapFile, (doc) => {
        const t = doc.tables['identity.role_bindings'];
        const victim = t.rows.find((r: any) => r.role_code === 'tenant_admin');
        t.rows = [...t.rows, {
          ...victim, id: forgedId, role_code: 'platform_admin', scope: 'PLATFORM',
          tenant_id: null, domain_id: null, revoked_at: '2026-08-20T00:00:00+00:00',
        }];
        t.row_count = t.rows.length;
      });
      const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
      setStream(d, `${pfx}-rows-identity_role_bindings`, 'stdout', Buffer.from(JSON.stringify(after.tables['identity.role_bindings'].rows)));
    }
  }, /carries a REVOKED role binding .*the deterministic governed seed revokes none|identity\.role_bindings has 5 row\(s\)/],
  ['4: a CONTRADICTORY stderr on a "successful" absence probe', (d) => {
    const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
    const probe = m.cleanup.inspections[0];
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const label = cmds.find((c: any) => c.id === probe.command_id).label;
    setStream(d, label, 'stderr', Buffer.from(
      'error during connect: permission denied while trying to connect to the Docker daemon socket\n',
    ));
  }, /wrote \d+ bytes to stderr.*the state is UNKNOWN/],
];

describe('C18.1.5 — DIFFERENTIAL: the frozen 7be02b8 verifier ACCEPTED what C18.1.5 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 7be02b8 verifier accepts the genuine archive in ITS format', async () => {
    const { dir, zip } = mutateArchive(downgradeTo7be02b8);
    try {
      const r = await legacy7be({ zipPath: zip, root: REPO });
      expect(r.problems, 'the downgrade must be exactly what the 7be02b8 producer emitted').toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1815_MUTATIONS)('%s — 7be02b8 ACCEPTS it; C18.1.5 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { downgradeTo7be02b8(d); mutate(d); });
    try {
      const old = await legacy7be({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen 7be02b8 verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.5 — adjacent-field rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a workspace inventory missing an authorized migration', (d: string) => {
      setInventory(d, 'a-migrate-historical', invOf(d, 'a-migrate-historical').slice(0, -1));
    }, /missing: "0012_evidence_capability_and_port_binding\.sql"|holds 11 entr/],
    ['a workspace inventory listing a DUPLICATE file', (d: string) => {
      const inv = invOf(d, 'a-migrate-historical');
      setInventory(d, 'a-migrate-historical', [inv[0]!, ...inv]);
    }, /DUPLICATE entry|holds 13 entr/],
    ['an inventory receipt out of sorted order', (d: string) => {
      setInventory(d, 'a-migrate-historical', [...invOf(d, 'a-migrate-historical')].reverse());
    }, /not in canonical sorted order/],
    ['an execution receipt whose inventory[] contradicts the enumerated directory', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'b-migrate-latest');
        e.inventory = e.inventory.slice(0, -1);
      });
    }, /inventory\[\] disagrees with the enumerated directory|did not hash exactly the governed runner/],
    ['a deleted inventory command', (d: string) => {
      editJson(d, 'commands.json', (cmds: any[]) => {
        const i = cmds.findIndex((c) => c.label === 'a-migrate-upgrade-inventory');
        for (const ext of ['stdout', 'stderr', 'exit']) rmSync(join(d, 'raw', `${cmds[i].id}.${ext}.txt`));
        cmds.splice(i, 1);
      });
    }, /expected 'a-migrate-upgrade-inventory'|inventory command .* which does not exist|breaks the sequence/],
    ['a runner that never reported completion', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const c = cmds.find((x: any) => x.label === 'b-migrate-latest');
      const out = readFileSync(join(d, 'raw', `${c.id}.stdout.txt`), 'utf8');
      setStream(d, 'b-migrate-latest', 'stdout', Buffer.from(out.replace(/^migrations up to date$/m, '')));
    }, /runner emitted \d+ line\(s\)|runner output line/],
    ['an applied\\[\\] that disagrees with the runner output', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-upgrade');
        e.applied = e.applied.slice(0, -1);
      });
    }, /applied\[\] .* is not the governed sequence/],
    ['a missing seeded decision (exact cardinality)', (d: string) => {
      for (const [snapFile, pfx] of SEEDED_SNAPS) {
        editJson(d, snapFile, (doc) => {
          const t = doc.tables['policy.policy_decisions'];
          t.rows = t.rows.slice(0, -1);
          t.row_count = t.rows.length;
        });
        const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
        setStream(d, `${pfx}-rows-policy_policy_decisions`, 'stdout', Buffer.from(JSON.stringify(after.tables['policy.policy_decisions'].rows)));
      }
    }, /policy\.policy_decisions has \d+ row\(s\); the deterministic governed seed produces EXACTLY 12|LOST across the upgrade/],
    ['a second published outbox effect', (d: string) => {
      for (const [snapFile, pfx] of SEEDED_SNAPS) {
        editJson(d, snapFile, (doc) => {
          const t = doc.tables['objects.object_outbox'];
          const pending = t.rows.find((r: any) => r.status === 'pending');
          if (pending !== undefined) pending.status = 'published';
        });
        const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
        setStream(d, `${pfx}-rows-objects_object_outbox`, 'stdout', Buffer.from(JSON.stringify(after.tables['objects.object_outbox'].rows)));
      }
    }, /outbox effect\(s\); the governed seed produces EXACTLY 1|changed across the upgrade/],
    ['an absence probe that was signalled', (d: string) => {
      const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
      const probe = m.cleanup.inspections[2];
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const label = cmds.find((c: any) => c.id === probe.command_id).label;
      editJson(d, 'commands.json', (cs: any[]) => {
        const c = cs.find((x) => x.id === probe.command_id);
        c.exit = null;
        c.signal = 'SIGKILL';
      });
      setStream(d, label, 'exit', Buffer.from('signal:SIGKILL\n'));
      editJson(d, 'c18-manifest.json', (mm) => { mm.cleanup.inspections[2].exit = null; });
    }, /was signalled|exited null/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/** Rewrite every path-A snapshot table AND its raw receipt consistently. */
function renameEverywhere(d: string, table: string, match: (r: any) => boolean, apply: (r: any) => void) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc) => { for (const r of doc.tables[table].rows) if (match(r)) apply(r); });
    const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-rows-${table.replace('.', '_')}`, 'stdout',
      Buffer.from(JSON.stringify(after.tables[table].rows)));
  }
}
/** Replace an execution's inventory receipt AND its recorded inventory[] consistently. */
function setInventory(d: string, label: string, entries: Array<{ name: string; type: string }>) {
  setStream(d, `${label}-inventory`, 'stdout', Buffer.from(`${JSON.stringify(entries)}\n`));
  editJson(d, 'c18-manifest.json', (m) => {
    m.migration_executions.find((x: any) => x.label === label).inventory = entries;
  });
}
const invOf = (d: string, label: string): Array<{ name: string; type: string }> => JSON.parse(
  readFileSync(join(d, 'c18-manifest.json'), 'utf8'),
).migration_executions.find((x: any) => x.label === label).inventory;

/** Mutations expressible in BOTH the C18.1.6 and 8362cba evidence formats. */
const C1816_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['1a: a DOT-PREFIXED .sql the runner applied', (d) => {
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const run = cmds.find((c: any) => c.label === 'b-migrate-latest');
    const out = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8');
    setStream(d, 'b-migrate-latest', 'stdout', Buffer.from(
      out.replace('migrations up to date', 'applying .0022_hidden.sql ... ok\nmigrations up to date'),
    ));
  }, /UNEXPECTED: "applying \.0022_hidden\.sql \.\.\. ok"|the governed sequence is exactly/],
  ['1b: a DOT-PREFIXED file whose name contains WHITESPACE', (d) => {
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const run = cmds.find((c: any) => c.label === 'b-migrate-latest');
    const out = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8');
    setStream(d, 'b-migrate-latest', 'stdout', Buffer.from(
      out.replace('migrations up to date', 'applying .0022 hidden backdoor.sql ... ok\nmigrations up to date'),
    ));
  }, /UNEXPECTED: "applying \.0022 hidden backdoor\.sql \.\.\. ok"|the governed sequence is exactly/],
  ['1c: an UNKNOWN extra line in the migration output', (d) => {
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const run = cmds.find((c: any) => c.label === 'a-migrate-historical');
    const out = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8');
    setStream(d, 'a-migrate-historical', 'stdout', Buffer.from(`${out}granting superuser to eye_attacker ... done\n`));
  }, /UNEXPECTED: "granting superuser to eye_attacker \.\.\. done"|the governed sequence is exactly/],
  ['1d: NONEMPTY stderr on a successful migration command', (d) => {
    setStream(d, 'a-migrate-upgrade', 'stderr', Buffer.from('WARNING: applied out-of-band statement from /tmp/attacker.sql\n'));
  }, /wrote \d+ byte\(s\) to stderr; a governed command that succeeded emits none/],
  ['2a: a consistently RENAMED tenant', (d) => {
    renameEverywhere(d, 'tenancy.tenants', (r) => r.name === 'c18-tenant-alpha', (r) => { r.name = 'c18-tenant-attacker'; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const t of doc.tenants) if (t.name === 'c18-tenant-alpha') t.name = 'c18-tenant-attacker';
    });
  }, /0 tenant row\(s\) match the source-owned slot 'tenant-alpha'/],
  ['2b: a consistently RENAMED domain', (d) => {
    renameEverywhere(d, 'tenancy.domains', (r) => r.name === 'c18-tenant-alpha-dom0', (r) => { r.name = 'attacker-dom'; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const x of doc.domains) if (x.name === 'c18-tenant-alpha-dom0') x.name = 'attacker-dom';
    });
  }, /0 domain row\(s\) match the source-owned slot 'alpha-dom0'/],
  ['2c: a consistently RENAMED principal login/display name', (d) => {
    renameEverywhere(d, 'identity.principals', (r) => r.login_name === 'c18-alpha-analyst',
      (r) => { r.login_name = 'c18-attacker'; r.display_name = 'c18-attacker'; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const p of doc.principals) if (p.loginName === 'c18-alpha-analyst') p.loginName = 'c18-attacker';
    });
  }, /0 principal row\(s\) match the source-owned slot 'alpha-analyst'/],
  ['2d: a consistently CHANGED principal role', (d) => {
    const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const victim = before.tables['identity.principals'].rows.find((r: any) => r.login_name === 'c18-alpha-analyst');
    renameEverywhere(d, 'identity.role_bindings', (r) => r.principal_id === victim.id, (r) => { r.role_code = 'tenant_admin'; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const p of doc.principals) if (p.loginName === 'c18-alpha-analyst') p.roleCode = 'tenant_admin';
    });
  }, /principal slot 'alpha-analyst' holds role\(s\) \["tenant_admin"\]/],
  ['2e: a consistently CHANGED outbox event type', (d) => {
    renameEverywhere(d, 'objects.object_outbox', (r) => r.event_type === 'c18.seed.pending',
      (r) => { r.event_type = 'c18.attacker.event'; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const o of doc.outbox) if (o.eventType === 'c18.seed.pending') o.eventType = 'c18.attacker.event';
    });
  }, /0 outbox row\(s\) match the source-owned slot 'outbox-pending'/],
  ['2f: a consistently MOVED canonical object', (d) => {
    const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const otherDomain = before.tables['tenancy.domains'].rows.find((r: any) => r.name === 'c18-tenant-alpha-dom1');
    const victim = before.tables['objects.canonical_objects'].rows[0];
    renameEverywhere(d, 'objects.canonical_objects', (r) => r.object_id === victim.object_id,
      (r) => { r.domain_id = otherDomain.id; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const o of doc.objects) if (o.objectId === victim.object_id) o.domainId = otherDomain.id;
    });
  }, /object slot 'claim-\d' header field 'domain_id'|content_digest .* does not recompute|matches no source-owned object slot/],
  ['2g: a consistently CHANGED session owner', (d) => {
    const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const analyst = before.tables['identity.principals'].rows.find((r: any) => r.login_name === 'c18-alpha-analyst');
    const seed = JSON.parse(readFileSync(join(d, 'path-a-seed-record.json'), 'utf8'));
    const victimSession = seed.sessions[1];
    renameEverywhere(d, 'identity.sessions', (r) => r.id === victimSession.sessionId,
      (r) => { r.principal_id = analyst.id; });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const x of doc.sessions) if (x.sessionId === victimSession.sessionId) x.principalId = analyst.id;
    });
  }, /unclaimed session\(s\) belong to principal slot 'alpha-admin'|matches no source-owned session slot/],
];

describe('C18.1.6 — DIFFERENTIAL: the frozen 8362cba verifier ACCEPTED what C18.1.6 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 8362cba verifier accepts the genuine archive in ITS format', async () => {
    const { dir, zip } = mutateArchive(downgradeTo8362cba);
    try {
      const r = await legacy8362({ zipPath: zip, root: REPO });
      expect(r.problems, 'the downgrade must be exactly what the 8362cba producer emitted').toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1816_MUTATIONS)('%s — 8362cba ACCEPTS it; C18.1.6 REJECTS it', async (label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { downgradeTo8362cba(d); mutate(d); });
    let legacyAccepted = false;
    try {
      const old = await legacy8362({ zipPath: legacyCase.zip, root: REPO });
      legacyAccepted = old.ok;
      // 1a is the one case 8362cba already caught: `\S+` matches a dot-prefixed name with no
      // whitespace, so its sequence check fired. Recorded honestly rather than overclaimed.
      if (!label.startsWith('1a')) {
        expect(old.ok, `the frozen 8362cba verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
      }
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    void legacyAccepted;
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.6 — inventory and seed-spec adjacent rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a dot-prefixed .sql present in the enumerated directory', (d: string) => {
      setInventory(d, 'b-migrate-latest',
        [{ name: '.0022_hidden.sql', type: 'file' }, ...invOf(d, 'b-migrate-latest')]);
    }, /violates the migration filename grammar|UNAUTHORIZED: "\.0022_hidden\.sql"/],
    ['a dot-prefixed name containing whitespace in the directory', (d: string) => {
      setInventory(d, 'b-migrate-latest',
        [{ name: '.0022 hidden backdoor.sql', type: 'file' }, ...invOf(d, 'b-migrate-latest')]);
    }, /violates the migration filename grammar|UNAUTHORIZED: "\.0022 hidden backdoor\.sql"/],
    ['an ordinary additional file in the directory', (d: string) => {
      setInventory(d, 'a-migrate-historical',
        [...invOf(d, 'a-migrate-historical'), { name: 'zz_notes.txt', type: 'file' }]);
    }, /violates the migration filename grammar|UNAUTHORIZED: "zz_notes\.txt"/],
    ['a MISSING file in the directory', (d: string) => {
      setInventory(d, 'a-migrate-historical', invOf(d, 'a-migrate-historical').slice(0, -1));
    }, /missing: "0012_evidence_capability_and_port_binding\.sql"|holds 11 entr/],
    ['a DUPLICATE entry in the directory', (d: string) => {
      const inv = invOf(d, 'a-migrate-historical');
      setInventory(d, 'a-migrate-historical', [inv[0]!, ...inv]);
    }, /lists a DUPLICATE entry/],
    ['a NON-REGULAR entry (directory) in the migration directory', (d: string) => {
      const inv = invOf(d, 'a-migrate-historical').map((e, i) => (i === 0 ? { ...e, type: 'directory' } : e));
      setInventory(d, 'a-migrate-historical', inv);
    }, /is a directory, not a regular file/],
    ['a SYMLINK masquerading as a migration', (d: string) => {
      const inv = invOf(d, 'a-migrate-historical').map((e, i) => (i === 1 ? { ...e, type: 'symlink' } : e));
      setInventory(d, 'a-migrate-historical', inv);
    }, /is a symlink, not a regular file/],
    ['a REORDERED inventory', (d: string) => {
      setInventory(d, 'a-migrate-historical', [...invOf(d, 'a-migrate-historical')].reverse());
    }, /is not in canonical sorted order/],
    ['a DUPLICATED application line', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const run = cmds.find((c: any) => c.label === 'a-migrate-historical');
      const lines = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8').split('\n');
      lines.splice(1, 0, lines[0]!);
      setStream(d, 'a-migrate-historical', 'stdout', Buffer.from(lines.join('\n')));
    }, /runner emitted \d+ line\(s\)|runner output line \d+ is/],
    ['a MALFORMED application line', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const run = cmds.find((c: any) => c.label === 'a-migrate-historical');
      const text = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8');
      setStream(d, 'a-migrate-historical', 'stdout',
        Buffer.from(text.replace('applying 0001_roles_and_schemas.sql ... ok', 'applying 0001_roles_and_schemas.sql ... OK')));
    }, /runner output line 1 is/],
    ['a MISSING terminal status line', (d: string) => {
      const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
      const run = cmds.find((c: any) => c.label === 'b-migrate-latest');
      const text = readFileSync(join(d, 'raw', `${run.id}.stdout.txt`), 'utf8');
      setStream(d, 'b-migrate-latest', 'stdout',
        Buffer.from(text.replace('role passwords synchronized from environment\n', '')));
    }, /runner emitted \d+ line\(s\)/],
    ['NONEMPTY stderr on a successful inventory command', (d: string) => {
      setStream(d, 'a-migrate-historical-inventory', 'stderr', Buffer.from('(node:1) ExperimentalWarning\n'));
    }, /inventory wrote \d+ byte\(s\) to stderr/],
    ['NONEMPTY stderr on a successful attestation command', (d: string) => {
      setStream(d, 'b-migrate-latest-attest', 'stderr', Buffer.from('shasum: cannot read /tmp/other\n'));
    }, /attestation wrote \d+ byte\(s\) to stderr/],
    ['an inventory helper that is not the tracked one', (d: string) => {
      editJson(d, 'c18-manifest.json', (m) => {
        m.migration_executions[0].inventory_helper_sha256 = sha256('attacker helper');
      });
    }, /helper whose bytes are not the tracked scripts\/gate\/lib\/c18-inventory\.mjs/],
    ['a governed step attributing another slot\'s identity', (d: string) => {
      editJson(d, 'path-a-seed-record.json', (doc) => {
        doc.steps.find((x: any) => x.step === 'canonical-objects').ids = doc.outbox.map((o: any) => o.eventId);
      });
    }, /identities are not the record-derived set|not this step's work/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/** The header exactly as ADMITTED (string version, ISO-Z times), so a digest recomputes. */
const admittedHeader = (row: any) => {
  const { payload, content_digest, ...rest } = row;
  void payload; void content_digest;
  return {
    ...rest,
    object_version: String(rest.object_version),
    observation_time: '2026-08-01T00:00:00.000Z',
    recorded_at: '2026-08-01T00:00:00.000Z',
  };
};

/** Mutations expressible in BOTH the C18.1.7 and dccfcf26 evidence shapes. */
const C1817_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['1: pretty-printed inventory JSON the helper could never emit', (d) => {
    const m = JSON.parse(readFileSync(join(d, 'c18-manifest.json'), 'utf8'));
    const e = m.migration_executions.find((x: any) => x.label === 'a-migrate-historical');
    setStream(d, 'a-migrate-historical-inventory', 'stdout',
      Buffer.from(`${JSON.stringify(e.inventory, null, 2)}\n`));
  }, /inventory receipt bytes are not the canonical encoding the tracked helper emits/],
  ['2: an attestation receipt containing an impossible blank line', (d) => {
    const cmds = JSON.parse(readFileSync(join(d, 'commands.json'), 'utf8'));
    const c = cmds.find((x: any) => x.label === 'b-migrate-latest-attest');
    const lines = readFileSync(join(d, 'raw', `${c.id}.stdout.txt`), 'utf8').trimEnd().split('\n');
    lines.splice(2, 0, '');
    setStream(d, 'b-migrate-latest-attest', 'stdout', Buffer.from(`${lines.join('\n')}\n`));
  }, /attestation line "" is not shasum output|attestation receipt bytes are not the exact ordered/],
  ['3: a canonical-object subject rename with a derived object_value', (d) => {
    everywhereA(d, 'objects.canonical_objects', (r) => {
      if (r.payload?.subject !== 'c18-claim-2') return;
      r.payload = { subject: 'c18-attacker', predicate: 'asserts', object_value: 'v-c18-attacker' };
    });
  }, /0 canonical object row\(s\) match the source-owned slot 'claim-2'/],
  ['4: a subject rename WITH a correctly recomputed production content digest', (d) => {
    everywhereA(d, 'objects.canonical_objects', (r) => {
      if (r.payload?.subject !== 'c18-claim-2') return;
      const payload = { subject: 'c18-attacker', predicate: 'asserts', object_value: 'v-c18-attacker' };
      r.payload = payload;
      r.content_digest = canonicalHeaderDigest(admittedHeader(r) as never, payload as never);
    });
  }, /0 canonical object row\(s\) match the source-owned slot 'claim-2'/],
  ['5: a seeded decision changed from allow to deny', (d) => {
    everywhereA(d, 'policy.policy_decisions', (r) => {
      if (r.object_type === 'CLM') r.decision = 'deny';
    });
  }, /decision is "deny"; the operation plan requires "allow"/],
  ['6: the deterministic outbox payload changed', (d) => {
    everywhereA(d, 'objects.object_outbox', (r) => {
      if (r.event_type === 'c18.seed.pending') r.payload = { seed: 'attacker', event: 'c18.seed.pending' };
    });
  }, /outbox slot 'outbox-pending' payload .* is not the specification's/],
  ["7: an object admission re-pointed at another actor's operation", (d) => {
    const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const victim = before.tables['objects.canonical_objects'].rows
      .find((r: any) => r.payload?.subject === 'c18-claim-2');
    // A tenant-create operation: performed by platform-admin on the admin session, never by
    // alpha-admin. The row, its digest AND the seed record are all re-pointed, so only the
    // operation-plan relationship rule can catch it.
    const tenantDecision = before.tables['policy.policy_decisions'].rows
      .find((r: any) => r.action === 'tenancy.tenant.create');
    everywhereA(d, 'objects.canonical_objects', (r) => {
      if (r.object_id !== victim.object_id) return;
      r.audit_correlation_id = tenantDecision.correlation_id;
      r.content_digest = canonicalHeaderDigest(admittedHeader(r) as never, r.payload as never);
    });
    editJson(d, 'path-a-seed-record.json', (doc) => {
      for (const o of doc.objects) {
        if (o.objectId === victim.object_id) o.correlation = tenantDecision.correlation_id;
      }
    });
  }, /names audit correlation .* which is not the correlation of the operation that admitted it/],
];

describe('C18.1.7 — DIFFERENTIAL: the frozen dccfcf26 verifier ACCEPTED what C18.1.7 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen dccfcf26 verifier accepts the genuine archive', async () => {
    const { dir, zip } = mutateArchive(downgradeToBfc8695);
    try {
      const r = await legacyDcc({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1817_MUTATIONS)('%s — dccfcf26 ACCEPTS it; C18.1.7 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { mutate(d); downgradeToBfc8695(d); });
    try {
      const old = await legacyDcc({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen dccfcf26 verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.7 — adjacent single-defect rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a deterministic object header field (classification)', (d: string) => {
      everywhereA(d, 'objects.canonical_objects', (r) => { r.classification = 'public'; });
    }, /header field 'classification' is "public"/],
    ['a deterministic object header field (accountable_owner)', (d: string) => {
      everywhereA(d, 'objects.canonical_objects', (r) => { r.accountable_owner = 'principal:attacker'; });
    }, /header field 'accountable_owner' is "principal:attacker"/],
    ['a deterministic object header field (evidence_refs)', (d: string) => {
      everywhereA(d, 'objects.canonical_objects', (r) => { r.evidence_refs = ['evd:attacker']; });
    }, /header field 'evidence_refs'/],
    ['a stale content digest left unrecomputed', (d: string) => {
      everywhereA(d, 'objects.canonical_objects', (r) => {
        if (r.payload?.subject === 'c18-claim-1') r.content_digest = sha256('stale');
      });
    }, /content_digest .* does not recompute under the production canonicalizer/],
    ['a decision re-scoped away from its operation', (d: string) => {
      everywhereA(d, 'policy.policy_decisions', (r) => {
        if (r.object_type === 'tenancy.tenant') r.scope = 'DOMAIN';
      });
    }, /scope is "DOMAIN"; the operation plan requires "PLATFORM"/],
    ['a decision re-tenanted away from its operation', (d: string) => {
      const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
      const tenant = before.tables['tenancy.tenants'].rows[0];
      everywhereA(d, 'policy.policy_decisions', (r) => {
        if (r.object_type === 'identity.principal') r.tenant_id = tenant.id;
      });
    }, /tenant_id is .* the operation plan requires null/],
    ['a decision detached from its audit correlation', (d: string) => {
      everywhereA(d, 'policy.policy_decisions', (r) => {
        if (r.object_type === 'outbox') r.correlation_id = 'ffffffff-1111-4fff-8fff-ffffffffff01';
      });
    }, /carries a different correlation than its decision|audit event\(s\) close the decision/],
    ['a decision with a forged input digest', (d: string) => {
      everywhereA(d, 'policy.policy_decisions', (r) => {
        if (r.object_type === 'CLM') r.input_digest = sha256('forged');
      });
    }, /input_digest does not recompute under the source-owned formula/],
    ['a decision carrying obligations the plan does not', (d: string) => {
      everywhereA(d, 'policy.policy_decisions', (r) => {
        if (r.object_type === 'tenancy.domain') r.obligations = [{ obligation: 'notify' }];
      });
    }, /carries obligations the operation plan does not/],
    ['an outbox effect with the wrong attempt count', (d: string) => {
      everywhereA(d, 'objects.object_outbox', (r) => { r.attempts = 3; });
    }, /outbox slot .* attempts is 3; the specification requires 1/],
    ['a published outbox effect still holding a lease', (d: string) => {
      everywhereA(d, 'objects.object_outbox', (r) => {
        if (r.status === 'published') r.lease_id = 'ffffffff-2222-4fff-8fff-ffffffffff02';
      });
    }, /is published but still holds a lease/],
    ['a pending outbox effect carrying a publication time', (d: string) => {
      everywhereA(d, 'objects.object_outbox', (r) => {
        if (r.status === 'pending') r.published_at = '2026-08-20T00:00:00+00:00';
      });
    }, /is pending but carries a published_at/],
    ['an unclaimed extra policy decision', (d: string) => {
      everywhereA(d, 'policy.policy_decisions', () => { /* rows appended below */ });
      for (const [snapFile, pfx] of SEEDED_SNAPS) {
        editJson(d, snapFile, (doc) => {
          const t = doc.tables['policy.policy_decisions'];
          t.rows = [...t.rows, { ...t.rows[0], id: 'ffffffff-3333-4fff-8fff-ffffffffff03' }];
          t.row_count = t.rows.length;
        });
        const after = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
        setStream(d, `${pfx}-rows-policy_policy_decisions`, 'stdout',
          Buffer.from(JSON.stringify(after.tables['policy.policy_decisions'].rows)));
      }
    }, /matches no operation in the source-owned plan|policy decision\(s\) name entity slot|EXACTLY 12/],
    ['a duplicated object slot assignment', (d: string) => {
      everywhereA(d, 'objects.canonical_objects', (r) => {
        r.payload = { subject: 'c18-claim-1', predicate: 'asserts', object_value: 'v-c18-claim-1' };
      });
    }, /2 canonical object row\(s\) match the source-owned slot 'claim-1'/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});

/** Append one production-valid audit event to every path-A snapshot, fully rebound. */
function appendAuditEvent(d: string) {
  const corr = '99999999-1111-4999-8999-999999999901';
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    const doc = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    const view = doc.audit.events.filter((e: any) => e.partition_id === 'platform');
    const last = view[view.length - 1];
    const seq = Number(last.audit_seq) + 1;
    const body = {
      action: 'admin.note', actor: 'principal:c18-observer', causation_id: null,
      clock_quality: 'trusted', context_mode: 'bootstrap', correlation_id: corr,
      delegation_id: null, domain_id: null, event_type: 'admin.note', metadata: {},
      occurred_at: '2026-08-24T00:00:00.000Z', outcome: 'success', policy_decision_id: null,
      policy_version: null, purpose_id: 'observation', request_digest: null, result_code: 'OK',
      scope: 'PLATFORM', session_id: null, target_id: null, target_type: 'SES',
      target_version: null, tenant_id: null, trace_id: null,
    };
    const jcs = jcsCanonicalize(body as never);
    const rowHash = auditRowHash({ partitionId: 'platform', auditSeq: seq, previousHash: last.row_hash, event: body as never });
    const order = (a: any, b: any) => (a.partition_id === b.partition_id
      ? Number(a.audit_seq) - Number(b.audit_seq) : (a.partition_id < b.partition_id ? -1 : 1));
    doc.audit.events = [...doc.audit.events, {
      partition_id: 'platform', audit_seq: seq, event_jcs: jcs, previous_hash: last.row_hash,
      row_hash: rowHash, hash_alg_version: 'eye-audit-v1', correlation_id: corr, policy_decision_id: null,
    }].sort(order);
    const head = doc.audit.heads.find((h: any) => h.partition_id === 'platform');
    head.next_seq = seq + 1; head.head_hash = rowHash;
    const tbl = doc.tables['audit.audit_events'];
    const model = tbl.rows.find((r: any) => r.partition_id === 'platform');
    tbl.rows = [...tbl.rows, {
      ...model, partition_id: 'platform', audit_seq: seq, event_jcs: jcs, event: body,
      previous_hash: last.row_hash, row_hash: rowHash, hash_alg_version: 'eye-audit-v1',
      correlation_id: corr, scope: 'PLATFORM', tenant_id: null, domain_id: null,
      event_type: 'admin.note', outcome: 'success', actor: 'principal:c18-observer',
      action: 'admin.note', result_code: 'OK', occurred_at: '2026-08-24T00:00:00.000Z',
      created_at: '2026-08-24T00:00:00+00:00',
    }].sort(order);
    tbl.row_count = tbl.rows.length;
    for (const h of doc.tables['audit.audit_chain_heads'].rows) {
      if (h.partition_id === 'platform') { h.next_seq = seq + 1; h.head_hash = rowHash; }
    }
    writeFileSync(join(d, snapFile), `${JSON.stringify(doc, null, 2)}\n`);
    const now = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-audit-events`, 'stdout', Buffer.from(JSON.stringify(now.audit.events)));
    setStream(d, `${pfx}-audit-heads`, 'stdout', Buffer.from(JSON.stringify(now.audit.heads)));
    setStream(d, `${pfx}-rows-audit_audit_events`, 'stdout', Buffer.from(JSON.stringify(now.tables['audit.audit_events'].rows)));
    setStream(d, `${pfx}-rows-audit_audit_chain_heads`, 'stdout', Buffer.from(JSON.stringify(now.tables['audit.audit_chain_heads'].rows)));
  }
  editJson(d, 'path-a-seed-record.json', (doc) => { doc.correlations.push(corr); });
}

/** The five proven cases, expressible in BOTH the C18.1.8 and bfc8695 evidence shapes. */
const C1818_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['1: a seeded tenant suspended', (d) => {
    everywhereA(d, 'tenancy.tenants', (r) => { if (r.name === 'c18-tenant-beta') r.status = 'suspended'; });
  }, /tenant slot 'tenant-beta' status is "suspended"/],
  ['2: the bootstrap principal disabled', (d) => {
    everywhereA(d, 'identity.principals', (r) => { if (r.login_name === 'platform-admin') r.status = 'disabled'; });
  }, /principal slot 'platform-admin' status is "disabled"/],
  ['3: a seeded session revoked', (d) => {
    const before = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const victim = before.tables['identity.sessions'].rows[0];
    everywhereA(d, 'identity.sessions', (r) => { if (r.id === victim.id) r.status = 'revoked'; });
  }, /session slot '.*' status is "revoked"/],
  ['4: a seeded domain retention profile changed', (d) => {
    everywhereA(d, 'tenancy.domains', (r) => { if (String(r.name).endsWith('-dom0')) r.retention_profile = 'attacker-retention'; });
  }, /domain slot '.*' retention_profile is "attacker-retention"/],
  ['5: one additional production-valid audit event', appendAuditEvent,
    /belongs to no planned seed operation or standalone event|the source-owned plan writes exactly/],
];

describe('C18.1.8 — DIFFERENTIAL: the frozen bfc8695 verifier ACCEPTED what C18.1.8 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen bfc8695 verifier accepts the genuine archive in ITS format', async () => {
    const { dir, zip } = mutateArchive(downgradeToBfc8695);
    try {
      const r = await legacyBfc({ zipPath: zip, root: REPO });
      expect(r.problems, 'the downgrade must be exactly what the bfc8695 producer emitted').toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1818_MUTATIONS)('%s — bfc8695 ACCEPTS it; C18.1.8 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { mutate(d); downgradeToBfc8695(d); });
    try {
      const old = await legacyBfc({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen bfc8695 verifier must accept this rebound mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.8 — adjacent single-defect rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a tenant residency profile change', (d: string) => {
      everywhereA(d, 'tenancy.tenants', (r) => { r.residency_profile = 'attacker-region'; });
    }, /tenant slot '.*' residency_profile is "attacker-region"/],
    ['a domain status change', (d: string) => {
      everywhereA(d, 'tenancy.domains', (r) => { r.status = 'suspended'; });
    }, /domain slot '.*' status is "suspended"/],
    ['a principal revocation epoch change', (d: string) => {
      everywhereA(d, 'identity.principals', (r) => { if (r.login_name === 'c18-alpha-admin') r.revocation_epoch = 7; });
    }, /principal slot 'alpha-admin' revocation_epoch is 7/],
    ['a session carrying a revocation time', (d: string) => {
      everywhereA(d, 'identity.sessions', (r) => { r.revoked_at = '2026-08-24T00:00:00+00:00'; });
    }, /session slot '.*' revoked_at is/],
    ['a session bound below its owner epoch', (d: string) => {
      everywhereA(d, 'identity.sessions', (r) => { r.bound_epoch = 0; });
    }, /bound_epoch 0 predates its owner's revocation epoch/],
    ['an EXTRA refresh-token row', (d: string) => {
      everywhereA(d, 'identity.refresh_tokens', () => { /* appended below */ });
      appendRow(d, 'identity.refresh_tokens', (rows) => ({ ...rows[0], id: 'ffffffff-0001-4fff-8fff-ffffffffff01' }));
    }, /refresh token\(s\); the seed issues exactly 2|has 2 refresh token\(s\)/],
    ['a MISSING refresh-token row', (d: string) => {
      dropRow(d, 'identity.refresh_tokens', (r) => r.generation === 1);
    }, /refresh token\(s\); the seed issues exactly 2|has 0 refresh token\(s\)/],
    ['an invalidated refresh token', (d: string) => {
      everywhereA(d, 'identity.refresh_tokens', (r) => { r.invalidated_at = '2026-08-24T00:00:00+00:00'; });
    }, /refresh token .* invalidated_at is/],
    ['a replaced refresh token', (d: string) => {
      everywhereA(d, 'identity.refresh_tokens', (r) => { r.replaced_by = 'ffffffff-0002-4fff-8fff-ffffffffff02'; });
    }, /refresh token .* replaced_by is/],
    ['a credential with the wrong status', (d: string) => {
      everywhereA(d, 'identity.credentials', (r) => { if (r.status === 'active') r.status = 'revoked'; });
    }, /credential\(s\); the seed writes exactly one active credential|holds \d+ credential\(s\)/],
    ['a credential owned by no seeded principal', (d: string) => {
      everywhereA(d, 'identity.credentials', (r) => { if (r.status === 'rotated') r.principal_id = 'ffffffff-0003-4fff-8fff-ffffffffff03'; });
    }, /belongs to no seeded principal slot|credential\(s\) \(0 rotated/],
    ['a bootstrap claim naming another principal', (d: string) => {
      everywhereA(d, 'identity.bootstrap_claim', (r) => { r.principal_id = 'ffffffff-0004-4fff-8fff-ffffffffff04'; });
    }, /bootstrap claim names a principal other than the platform-admin slot/],
    ['an EXTRA tenancy lifecycle event', (d: string) => {
      appendRow(d, 'tenancy.lifecycle_events', (rows) => ({ ...rows[0], id: 'ffffffff-0005-4fff-8fff-ffffffffff05' }));
    }, /lifecycle event\(s\) match the planned|matches no planned entity/],
    ['a MISSING tenancy lifecycle event', (d: string) => {
      dropRow(d, 'tenancy.lifecycle_events', (r) => r.event === 'domain.created');
    }, /0 lifecycle event\(s\) match the planned 'domain.created'/],
    ['an EXTRA ctx.issued capability row', (d: string) => {
      appendRow(d, 'ctx.issued', (rows) => ({ ...rows[0], nonce: 'ffffffff-0006-4fff-8fff-ffffffffff06' }));
    }, /capability row\(s\) for .*the plan mints exactly/],
    ['a MISSING ctx.issued capability row', (d: string) => {
      dropRow(d, 'ctx.issued', (r) => r.op_class === 'bootstrap');
    }, /0 capability row\(s\) for "bootstrap\|identity.bootstrap.platform_admin"/],
    ['a misattributed capability class', (d: string) => {
      everywhereA(d, 'ctx.issued', (r) => { if (r.op_class === 'outbox') r.op_class = 'C2'; });
    }, /capability row\(s\) for "outbox\|objects.outbox.publish"|which the capability plan does not mint/],
    ['a consumed capability the era ports never stamp', (d: string) => {
      everywhereA(d, 'ctx.issued', (r) => { r.consumed_at = '2026-08-24T00:00:00+00:00'; });
    }, /records a consumption the era ports never stamp/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('REJECTS %s', async (_label, mutate, pattern) => {
    await expectReject(mutate, pattern);
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

  it('REFUSES a hidden untracked file: status.showUntrackedFiles=no cannot fool final mode', () => {
    const stealth = join(REPO, '.c18-stealth-untracked.txt');
    const prior = spawnSync('git', ['config', '--get', 'status.showUntrackedFiles'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
    try {
      spawnSync('git', ['config', 'status.showUntrackedFiles', 'no'], { cwd: REPO });
      writeFileSync(stealth, 'hidden');
      // The repo config HIDES the file from a plain porcelain status — the exact seam.
      expect(spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout).not.toContain('.c18-stealth-untracked');
      const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
      const out = join(tmpdir(), `c18-stealth-${process.pid}`);
      const r = cli(['run', '--final', '--expected-sha', head, '--out', out]);
      rmSync(out, { recursive: true, force: true });
      expect(r.status).not.toBe(0);
      expect(`${r.stderr}${r.stdout}`).toMatch(/requires a clean worktree[\s\S]*\.c18-stealth-untracked\.txt/);
    } finally {
      rmSync(stealth, { force: true });
      if (prior === '') spawnSync('git', ['config', '--unset', 'status.showUntrackedFiles'], { cwd: REPO });
      else spawnSync('git', ['config', 'status.showUntrackedFiles', prior], { cwd: REPO });
    }
  });

  it('SIGTERM mid-provisioning: checked cleanup runs and failure evidence is written', async () => {
    const c18Containers = () => spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' })
      .stdout.split('\n').filter((n) => /^c18-[ab]-[0-9a-f]{8}-(pg|redis)$/.test(n));
    expect(c18Containers(), 'no concurrent c18 run may be active for this control').toEqual([]);
    const out = join(tmpdir(), `c18-sigterm-${process.pid}`);
    rmSync(out, { recursive: true, force: true });
    const child = spawn('node', [RUNNER, 'run', '--out', out], { cwd: REPO, stdio: 'ignore' });
    try {
      const started = Date.now();
      while (Date.now() - started < 90_000 && c18Containers().length === 0) {
        await new Promise((resolve) => { setTimeout(resolve, 1000); });
      }
      expect(c18Containers().length, 'provisioning must be underway before the signal').toBeGreaterThan(0);
      child.kill('SIGTERM');
      const code = await new Promise<number | null>((resolve) => { child.once('exit', (c) => resolve(c)); });
      expect(code).not.toBe(0);
      expect(readFileSync(join(out, 'RESULT-FAIL.txt'), 'utf8')).toContain('interrupted by SIGTERM; checked cleanup executed');
      // The checked docker rm -fv teardown ran: zero c18 containers survive the signal.
      expect(c18Containers()).toEqual([]);
    } finally {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      rmSync(out, { recursive: true, force: true });
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

/**
 * Rewrite one audit event's canonical BODY and rechain its whole partition with the production
 * hashes — the strongest form of the mutation, in which every checksum, canonicalization, chain
 * link and head the verifier can recompute agrees with the forged body.
 */
function rewriteAuditBody(d: string, pick: (body: any) => boolean, edit: (body: any) => void) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc: any) => {
      const rows = doc.tables['audit.audit_events'].rows;
      const target = rows.find((r: any) => pick(r.event));
      if (target === undefined) return;
      edit(target.event);
      const byPartition = [...new Set(rows.map((r: any) => r.partition_id))];
      for (const partition of byPartition) {
        const chain = rows.filter((r: any) => r.partition_id === partition)
          .sort((a: any, b: any) => Number(a.audit_seq) - Number(b.audit_seq));
        let previous = '0'.repeat(64);
        for (const r of chain) {
          r.event_jcs = jcsCanonicalize(r.event);
          r.previous_hash = previous;
          r.row_hash = auditRowHash({
            partitionId: r.partition_id, auditSeq: Number(r.audit_seq),
            previousHash: previous, event: r.event,
          });
          previous = r.row_hash;
          const view = doc.audit.events.find((e: any) => e.partition_id === r.partition_id
            && Number(e.audit_seq) === Number(r.audit_seq));
          if (view !== undefined) {
            view.event_jcs = r.event_jcs; view.previous_hash = r.previous_hash; view.row_hash = r.row_hash;
          }
        }
        const last = chain[chain.length - 1];
        for (const h of doc.tables['audit.audit_chain_heads'].rows) {
          if (h.partition_id === partition) { h.head_hash = last.row_hash; }
        }
        for (const h of doc.audit.heads) {
          if (h.partition_id === partition) { h.head_hash = last.row_hash; }
        }
      }
    });
    const now = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-audit-events`, 'stdout', Buffer.from(JSON.stringify(now.audit.events)));
    setStream(d, `${pfx}-audit-heads`, 'stdout', Buffer.from(JSON.stringify(now.audit.heads)));
    setStream(d, `${pfx}-rows-audit_audit_events`, 'stdout',
      Buffer.from(JSON.stringify(now.tables['audit.audit_events'].rows)));
    setStream(d, `${pfx}-rows-audit_audit_chain_heads`, 'stdout',
      Buffer.from(JSON.stringify(now.tables['audit.audit_chain_heads'].rows)));
  }
}

/**
 * Pick ONE deterministic target key before mutating. A `done` flag captured across snapshots is
 * the classic error here: it fires on the first snapshot only, so the later ones keep the
 * original value and SNAPSHOT PRESERVATION rejects the archive instead of the rule under test.
 * Selecting a stable key up front makes the mutator idempotent across every snapshot.
 */
function pickKey(d: string, table: string, key = 'id', where: (r: any) => boolean = () => true) {
  const doc = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
  const found = doc.tables[table].rows.filter(where).map((r: any) => String(r[key])).sort();
  expect(found.length, `no ${table} row matches`).toBeGreaterThan(0);
  return found[0];
}

/** Rewrite chain-head rows across every seeded snapshot AND the audit view they must agree with. */
function everyHead(d: string, apply: (h: any) => void) {
  for (const [snapFile, pfx] of SEEDED_SNAPS) {
    editJson(d, snapFile, (doc: any) => {
      for (const h of doc.tables['audit.audit_chain_heads'].rows) apply(h);
      for (const h of doc.audit.heads) apply(h);
    });
    const now = JSON.parse(readFileSync(join(d, snapFile), 'utf8'));
    setStream(d, `${pfx}-audit-heads`, 'stdout', Buffer.from(JSON.stringify(now.audit.heads)));
    setStream(d, `${pfx}-rows-audit_audit_chain_heads`, 'stdout',
      Buffer.from(JSON.stringify(now.tables['audit.audit_chain_heads'].rows)));
  }
}

/**
 * C18.1.9 — the classification-versus-enforcement class.
 *
 * 77489f5 published a machine-readable classification of every seeded column but did not execute
 * most of it. Each mutation below contradicts the PUBLISHED classification and was accepted by
 * the complete frozen 77489f5 verifier.
 */
const C1819_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['a capability moved onto another session, tally preserved', (d: string) => {
    const nonce = pickKey(d, 'ctx.issued', 'nonce', (r) => r.op_class === 'C1');
    const doc = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const held = doc.tables['ctx.issued'].rows.find((r: any) => r.nonce === nonce).session_id;
    const other = doc.tables['identity.sessions'].rows
      .map((r: any) => r.id).sort().find((x: string) => x !== held) ?? FORGED_UUID;
    everywhereA(d, 'ctx.issued', (r) => { if (r.nonce === nonce) r.session_id = other; });
  }, /is not in the source-owned capability multiset/],

  ['a session bound to an INFLATED revocation epoch', (d: string) => {
    const id = pickKey(d, 'identity.sessions');
    everywhereA(d, 'identity.sessions', (r) => { if (r.id === id) r.bound_epoch = 99; });
  }, /bound_epoch is 99/],

  ['a lifecycle event detached from the entity it records', (d: string) => {
    const id = pickKey(d, 'tenancy.lifecycle_events');
    everywhereA(d, 'tenancy.lifecycle_events', (r) => {
      if (r.id === id) r.occurred_at = '2026-08-21T10:00:00.000000+00:00';
    });
  }, /is not the same instant as the created entity's creation time/],

  ['a refresh token detached from the session that issued it', (d: string) => {
    const id = pickKey(d, 'identity.refresh_tokens');
    everywhereA(d, 'identity.refresh_tokens', (r) => {
      if (r.id === id) r.issued_at = '2026-08-21T10:00:00.000000+00:00';
    });
  }, /is not the same instant as its session's issue time/],

  ['a seeded chain head marked FROZEN', (d: string) => {
    everyHead(d, (h) => { if (h.partition_id === 'platform') h.frozen = true; });
  }, /audit_chain_heads\.frozen is true/],

  ['a standalone audit body rechained onto a policy version', (d: string) => {
    // policy_version lives ONLY inside the canonical body. 77489f5 judged the projected columns
    // and the chain, both of which this mutation rebuilds, so it reconciled completely.
    rewriteAuditBody(d,
      (body) => body.action === 'identity.credential.rotate',
      (body) => { body.policy_version = 'bundle-v1'; });
  }, /body policy_version is "bundle-v1"; the specification requires null/],
];

describe('C18.1.9 — DIFFERENTIAL: the frozen 77489f5 verifier ACCEPTED what C18.1.9 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 77489f5 verifier accepts the genuine archive', async () => {
    const { dir, zip } = mutateArchive(downgradeTo77489f5);
    try {
      const r = await legacy774({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C1819_MUTATIONS)('%s — 77489f5 ACCEPTS it; C18.1.9 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { mutate(d); downgradeTo77489f5(d); });
    try {
      const old = await legacy774({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen 77489f5 verifier must accept this mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.9 — adjacent single-defect rejections on the genuine archive', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it.each([
    ['a LOWERED session bound epoch', (d: string) => {
      const id = pickKey(d, 'identity.sessions');
      everywhereA(d, 'identity.sessions', (r) => { if (r.id === id) r.bound_epoch = 0; });
    }, /bound_epoch is 0/],
    ['a duplicated capability nonce', (d: string) => {
      const [keep, dupe] = (() => {
        const doc = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
        const ns = doc.tables['ctx.issued'].rows.map((r: any) => r.nonce).sort();
        return [ns[0], ns[1]];
      })();
      everywhereA(d, 'ctx.issued', (r) => { if (r.nonce === dupe) r.nonce = keep; });
    }, /appears 2 times; every generated nonce is unique/],
    ['a capability given a consumption instant', (d: string) => {
      const nonce = pickKey(d, 'ctx.issued', 'nonce');
      everywhereA(d, 'ctx.issued', (r) => {
        if (r.nonce === nonce) r.consumed_at = '2026-08-21T11:00:00.000000+00:00';
      });
    }, /ctx\.issued\.consumed_at/],
    ['an active credential given a rotation instant', (d: string) => {
      const id = pickKey(d, 'identity.credentials', 'id', (r) => r.status === 'active');
      everywhereA(d, 'identity.credentials', (r) => {
        if (r.id === id) r.rotated_at = '2026-08-21T11:00:00.000000+00:00';
      });
    }, /on an ACTIVE credential; the specification requires null/],
    ['a credential hash outside the Argon2id PHC grammar', (d: string) => {
      const id = pickKey(d, 'identity.credentials');
      everywhereA(d, 'identity.credentials', (r) => {
        if (r.id === id) r.secret_hash = '$argon2i$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA';
      });
    }, /secret_hash/],
    ['a governed timestamp moved outside the seeding window', (d: string) => {
      const id = pickKey(d, 'identity.principals');
      everywhereA(d, 'identity.principals', (r) => {
        if (r.id === id) r.created_at = '2020-01-01T00:00:00.000000+00:00';
      });
    }, /falls outside the governed seeding window/],
    ['a chain head stamped at an instant its last event did not land', (d: string) => {
      everyHead(d, (h) => {
        if (h.partition_id === 'platform' && 'updated_at' in h) h.updated_at = '2026-09-01T00:00:00.000000+00:00';
      });
    }, /the head is stamped when its last event lands/],
    ['a live role binding marked revoked', (d: string) => {
      const id = pickKey(d, 'identity.role_bindings');
      everywhereA(d, 'identity.role_bindings', (r) => {
        if (r.id === id) r.revoked_at = '2026-08-21T11:00:00.000000+00:00';
      });
    }, /role_bindings\.revoked_at|holds role/],
    ['a coverage report that claims a column is not executable', (d: string) => {
      editJson(d, 'seed-coverage.json', (doc: any) => {
        doc.tables['tenancy.tenants'].columns.status.executable_rule = false;
      });
    }, /not the source-derived coverage of this evidence/],
    ['a coverage report that renames a column KIND', (d: string) => {
      editJson(d, 'seed-coverage.json', (doc: any) => {
        doc.tables['identity.sessions'].columns.bound_epoch.kind = 'volatile';
      });
    }, /not the source-derived coverage of this evidence/],
  ] as ReadonlyArray<[string, Mutator, RegExp]>)('rejects %s', async (_l, mutate, pattern) => {
    await expectReject(mutate, pattern);
  });
});


/**
 * C18.1.10 — the gaps the frozen 53a4eec verifier could not see.
 *
 * Each mutation was put to the COMPLETE frozen predecessor with every attacker-controlled
 * checksum rebound before any of this pass's code was written, and each was ACCEPTED.
 */
const C11810_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['a final-only value change on an untouched table', (d: string) => {
    inFinalOnly(d, 'tenancy.tenants', (t: any) => { t.rows[0].retention_profile = 'extended'; });
  }, /'tenancy\.tenants' changed, but the governed operation does not touch it/],

  ['a final-only principal status change', (d: string) => {
    inFinalOnly(d, 'identity.principals', (t: any) => { t.rows[0].status = 'disabled'; });
  }, /'identity\.principals' changed, but the governed operation does not touch it/],

  ['an EXTRA row present only in the final snapshot', (d: string) => {
    inFinalOnly(d, 'identity.role_bindings', (t: any) => {
      t.rows = [...t.rows, { ...t.rows[0], id: FORGED_UUID }];
    });
  }, /'identity\.role_bindings' changed, but the governed operation does not touch it/],

  ['a seeded row DELETED only in the final snapshot', (d: string) => {
    inFinalOnly(d, 'tenancy.lifecycle_events', (t: any) => { t.rows = t.rows.slice(1); });
  }, /'tenancy\.lifecycle_events' changed, but the governed operation does not touch it/],

  ['a WEAK but well-formed argon2id credential hash', (d: string) => {
    const id = pickKey(d, 'identity.credentials');
    everywhereA(d, 'identity.credentials', (r) => {
      if (r.id === id) {
        r.secret_hash = '$argon2id$v=19$m=1,p=1,t=1$QUFBQUFBQUFBQUFBQUFBQQ$QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI';
      }
    });
  }, /carries m=1; the governed configuration is m=65536/],

  ['argon2id parameters C18.1.9 wrongly declared as governed', (d: string) => {
    const id = pickKey(d, 'identity.credentials');
    everywhereA(d, 'identity.credentials', (r) => {
      if (r.id === id) r.secret_hash = r.secret_hash.replace('m=65536,p=4,t=3', 'm=19456,p=1,t=2');
    });
  }, /the governed configuration is m=65536/],

  ['two sessions sharing ONE otherwise valid context key digest', (d: string) => {
    const keep = pickKey(d, 'identity.sessions');
    const doc = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const src = doc.tables['identity.sessions'].rows.find((r: any) => r.id === keep).context_key_hash;
    everywhereA(d, 'identity.sessions', (r) => { if (r.id !== keep) r.context_key_hash = src; });
  }, /appears 2 times; every generated digest is unique/],

  ['an outbox row repointed at ANOTHER genuine correlation, seed record rebound', (d: string) => {
    const doc = JSON.parse(readFileSync(join(d, 'path-a-before.json'), 'utf8'));
    const ob = doc.tables['objects.object_outbox'].rows;
    const other = ob.find((r: any) => r.event_type === 'c18.seed.pending').correlation_id;
    everywhereA(d, 'objects.object_outbox', (r) => {
      if (r.event_type === 'c18.seed.published') r.correlation_id = other;
    });
    editJson(d, 'path-a-seed-record.json', (rec: any) => {
      for (const o of rec.outbox ?? []) if (o.eventType === 'c18.seed.published') o.correlation = other;
    });
  }, /the decision that enqueued this row carries/],

  ['a NONCANONICAL but parseable spelling of the SAME instant', (d: string) => {
    // The offset is respelled without its colon. The instant is bit-for-bit identical, so every
    // ordering and equality rule still agrees and ONLY the grammar can object — which is what
    // makes this a clean test of the grammar rather than of some other relationship. (A
    // toUTCString() form would also truncate the sub-second part and trip an ordering rule
    // instead, making the control depend on where the fraction happened to fall.)
    const id = pickKey(d, 'tenancy.domains');
    everywhereA(d, 'tenancy.domains', (r) => {
      if (r.id === id) r.activated_at = String(r.activated_at).replace('+00:00', '+0000');
    });
  }, /parseable but NOT the canonical governed timestamp grammar/],

  ['bootstrap timing moved later but still inside the seed window', (d: string) => {
    everywhereA(d, 'identity.bootstrap_claim', (r) => {
      r.claimed_at = new Date(Date.parse(r.claimed_at) + 60_000).toISOString().replace('Z', '+00:00');
    });
  }, /the audited bootstrap landed at/],
];

/** Rewrite a table in the FINAL snapshot only, rebinding that snapshot's command receipt. */
function inFinalOnly(d: string, table: string, apply: (t: any) => void) {
  editJson(d, 'path-a-final.json', (doc: any) => {
    apply(doc.tables[table]);
    doc.tables[table].row_count = doc.tables[table].rows.length;
  });
  const now = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'));
  setStream(d, `a-a-final-rows-${table.replace('.', '_')}`, 'stdout',
    Buffer.from(JSON.stringify(now.tables[table].rows)));
}

describe('C18.1.10 — DIFFERENTIAL: the frozen 53a4eec verifier ACCEPTED what C18.1.10 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('NON-VACUITY: the frozen 53a4eec verifier accepts the genuine archive', async () => {
    const { dir, zip } = mutateArchive(downgradeTo53a4eec);
    try {
      const r = await legacy53a({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C11810_MUTATIONS)('%s — 53a4eec ACCEPTS it; C18.1.10 REJECTS it', async (_label, mutate, pattern) => {
    const legacyCase = mutateArchive((d) => { mutate(d); downgradeTo53a4eec(d); });
    try {
      const old = await legacy53a({ zipPath: legacyCase.zip, root: REPO });
      expect(old.ok, `the frozen 53a4eec verifier must accept this mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    } finally { rmSync(legacyCase.dir, { recursive: true, force: true }); }
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.10 — the semantic core and the production CLI agree', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('a mutation rejected through the member map is rejected through the real ZIP path', async () => {
    const mutate: Mutator = (d) => {
      inFinalOnly(d, 'tenancy.tenants', (t: any) => { t.rows[0].retention_profile = 'extended'; });
    };
    const pattern = /does not touch it/;
    await expectReject(mutate, pattern);
    await expectRejectViaZip(mutate, pattern);
  });

  it('a control declares exactly the members it changes, and never touches the baseline', () => {
    const { changed } = mutateMembers((d) => {
      inFinalOnly(d, 'tenancy.tenants', (t: any) => { t.rows[0].retention_profile = 'extended'; });
    });
    // The snapshot, its command receipt, the ledger that records the receipt digest, and the
    // checksum manifest — nothing else.
    expect(changed).toContain('path-a-final.json');
    expect(changed).toContain('commands.json');
    expect(changed).toContain('SHA256SUMS.txt');
    expect(changed.filter((f) => f.startsWith('raw/'))).toHaveLength(1);
    expect(changed).toHaveLength(4);
  });
});


/**
 * C18.1.11 — the post-upgrade world the frozen a424505 verifier could not see.
 *
 * a424505 authenticated the after -> final boundary by COUNTING. Every mutation below changes a
 * column of a row the governed operation INSERTS or UPDATES, leaves every count intact, and was
 * accepted by the complete frozen verifier with ZERO findings.
 */
function finalOnly(d: string, table: string, apply: (t: any) => void) {
  editJson(d, 'path-a-final.json', (doc: any) => {
    apply(doc.tables[table]);
    doc.tables[table].row_count = doc.tables[table].rows.length;
  });
  const now = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'));
  setStream(d, `a-a-final-rows-${table.replace('.', '_')}`, 'stdout',
    Buffer.from(JSON.stringify(now.tables[table].rows)));
}
/** The row the governed post-upgrade operation inserted: present in final, absent from after. */
function insertedRow(d: string, table: string, key: string) {
  const a = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8')).tables[table]?.rows ?? [];
  const f = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8')).tables[table].rows;
  const seen = new Set(a.map((r: any) => JSON.stringify(r[key])));
  return f.find((r: any) => !seen.has(JSON.stringify(r[key])));
}

const C11811_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['the new session is marked revoked', (d) => {
    const id = insertedRow(d, 'identity.sessions', 'id').id;
    finalOnly(d, 'identity.sessions', (t) => { t.rows.find((r: any) => r.id === id).status = 'revoked'; });
  }, /identity\.sessions\.status/],

  ['the new session is repointed at another principal', (d) => {
    const row = insertedRow(d, 'identity.sessions', 'id');
    const others = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8'))
      .tables['identity.principals'].rows.map((p: any) => p.id).sort();
    const other = others.find((p: string) => p !== row.principal_id);
    finalOnly(d, 'identity.sessions', (t) => { t.rows.find((r: any) => r.id === row.id).principal_id = other; });
  }, /identity\.sessions\.principal_id/],

  ['the new session carries an inflated bound epoch', (d) => {
    const id = insertedRow(d, 'identity.sessions', 'id').id;
    finalOnly(d, 'identity.sessions', (t) => { t.rows.find((r: any) => r.id === id).bound_epoch = 99; });
  }, /identity\.sessions\.bound_epoch/],

  ['the new refresh token claims a later generation', (d) => {
    const id = insertedRow(d, 'identity.refresh_tokens', 'id').id;
    finalOnly(d, 'identity.refresh_tokens', (t) => { t.rows.find((r: any) => r.id === id).generation = 7; });
  }, /identity\.refresh_tokens\.generation/],

  ['the new refresh token is detached from its session', (d) => {
    const id = insertedRow(d, 'identity.refresh_tokens', 'id').id;
    finalOnly(d, 'identity.refresh_tokens', (t) => {
      t.rows.find((r: any) => r.id === id).token_hash = 'e'.repeat(64);
    });
  }, /identity\.refresh_tokens\.token_hash/],

  ['a post-upgrade capability is bound to another action', (d) => {
    const nonce = insertedRow(d, 'ctx.issued', 'nonce').nonce;
    finalOnly(d, 'ctx.issued', (t) => {
      t.rows.find((r: any) => r.nonce === nonce).bound_action = 'tenancy.tenant.create';
    });
  }, /ctx\.issued\.bound_action|capability/],

  ['a post-upgrade capability is marked consumed', (d) => {
    const nonce = insertedRow(d, 'ctx.issued', 'nonce').nonce;
    finalOnly(d, 'ctx.issued', (t) => {
      t.rows.find((r: any) => r.nonce === nonce).consumed_at = '2026-08-21T22:00:00.000000+00:00';
    });
  }, /ctx\.issued\.consumed_at/],

  ['the operation claims a different runtime role', (d) => {
    finalOnly(d, 'ctx.operation', (t) => { t.rows[0].runtime_role = 'postgres'; });
  }, /ctx\.operation\.runtime_role/],

  ['the operation claims obligations were executed', (d) => {
    finalOnly(d, 'ctx.operation', (t) => { t.rows[0].obligations_executed = true; });
  }, /ctx\.operation\.obligations_executed/],

  ['the operation effect is recorded before the operation opened', (d) => {
    finalOnly(d, 'ctx.operation_effect', (t) => {
      t.rows[0].recorded_at = '2020-01-01T00:00:00.000000+00:00';
    });
  }, /ctx\.operation_effect\.recorded_at/],

  ['the closure decision is stamped at another instant', (d) => {
    const id = insertedRow(d, 'policy.policy_decisions', 'id').id;
    finalOnly(d, 'policy.policy_decisions', (t) => {
      t.rows.find((r: any) => r.id === id).created_at = '2020-01-01T00:00:00.000000+00:00';
    });
  }, /policy\.policy_decisions\.created_at/],

  ['the outbox payload is rewritten', (d) => {
    const id = insertedRow(d, 'objects.object_outbox', 'id').id;
    finalOnly(d, 'objects.object_outbox', (t) => {
      t.rows.find((r: any) => r.id === id).payload = { c18: 'tampered' };
    });
  }, /objects\.object_outbox\.payload/],

  ['the outbox row claims delivery attempts', (d) => {
    const id = insertedRow(d, 'objects.object_outbox', 'id').id;
    finalOnly(d, 'objects.object_outbox', (t) => { t.rows.find((r: any) => r.id === id).attempts = 5; });
  }, /objects\.object_outbox\.attempts/],

  ['the advanced chain head is stamped at another instant', (d) => {
    const fin = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'));
    const aft = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8'));
    const seen = new Set(aft.tables['audit.audit_events'].rows.map((e: any) => `${e.partition_id}#${e.audit_seq}`));
    const closing = fin.tables['audit.audit_events'].rows
      .find((e: any) => !seen.has(`${e.partition_id}#${e.audit_seq}`));
    finalOnly(d, 'audit.audit_chain_heads', (t) => {
      t.rows.find((h: any) => h.partition_id === closing.partition_id)
        .updated_at = '2026-09-01T00:00:00.000000+00:00';
    });
  }, /audit\.audit_chain_heads\.updated_at/],

  ['the rotated seed credential expiry drifts by five milliseconds', (d) => {
    everywhereA(d, 'identity.credentials', (r) => {
      if (r.status !== 'rotated') return;
      r.expires_at = new Date(Date.parse(r.expires_at) + 5).toISOString().replace('Z', '+00:00');
    });
  }, /credential lifecycle: the expiry implies a marking instant/],
];

describe('C18.1.11 — DIFFERENTIAL: the frozen a424505 verifier ACCEPTED what C18.1.11 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  const judgeA42 = async (mutate: Mutator) => {
    const { members } = mutateMembers((d) => { downgradeToA424505(d); mutate(d); });
    return legacyA42Semantics({
      members, root: REPO, sourceBinding: legacyBinding('a424505', deriveA42Binding),
    });
  };

  it('NON-VACUITY: the frozen a424505 verifier accepts the genuine archive', async () => {
    const r = await judgeA42(() => {});
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('the frozen a424505 leg agrees through the real ZIP ingress as well', async () => {
    const { dir, zip } = mutateArchive(downgradeToA424505);
    try {
      const r = await legacyA42({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C11811_MUTATIONS)('%s — a424505 ACCEPTS it; C18.1.11 REJECTS it', async (_label, mutate, pattern) => {
    const old = await judgeA42(mutate);
    expect(old.ok, `the frozen a424505 verifier must accept this mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    await expectReject(mutate, pattern);
  });
});

describe('C18.1.11 — one finding never suppresses an independent check', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  it('a post-upgrade finding and a seeded-world finding are BOTH reported', async () => {
    const { members } = mutateMembers((d) => {
      finalOnly(d, 'ctx.operation', (t) => { t.rows[0].runtime_role = 'postgres'; });
      everywhereA(d, 'identity.sessions', (r) => { r.bound_epoch = 99; });
    });
    const r = await verifySemantics({ members, root: REPO, sourceBinding: sourceBinding() });
    const text = r.problems.join('\n');
    expect(text, 'the post-upgrade finding must survive').toMatch(/ctx\.operation\.runtime_role/);
    expect(text, 'the seeded-world finding must survive').toMatch(/bound_epoch/);
  });

  it('the post-upgrade registry proof runs even when the operation record is unusable', async () => {
    const { members } = mutateMembers((d) => {
      editJson(d, 'c18-manifest.json', (m: any) => { m.post_upgrade_operation = null; });
      finalOnly(d, 'identity.sessions', (t) => { t.columns.push('smuggled'); });
    });
    const r = await verifySemantics({ members, root: REPO, sourceBinding: sourceBinding() });
    expect(r.problems.join('\n')).toMatch(/'identity\.sessions\.smuggled' is in the delivered catalog but not classified/);
  });
});

/**
 * C18.1.12's contract classifies the two governed-lifetime columns as source-owned formulas rather
 * than bare timestamps, so the delivered coverage REPORT differs from 2c3cab3's. Regenerating it
 * with the FROZEN module reproduces exactly what that producer emitted, which keeps the
 * differential measuring the SEMANTIC change rather than a contract version number.
 */
function downgradeTo2c3cab3(dir: string) {
  writeFileSync(join(dir, 'seed-coverage.json'),
    coverageFor(dir, '2c3cab3', (preseed, before) => legacy2c3Coverage({ preseed, before })));
}

/** Respell an instant without moving it: the PostgreSQL offset written another legal way. */
const respellPg = (v: string) => String(v).replace('+00:00', '+0000');

/** Rebuild every audit chain in the FINAL snapshot, plus its heads, projections and receipts. */
function rechainFinal(d: string) {
  editJson(d, 'path-a-final.json', (doc: any) => {
    const rows = doc.tables['audit.audit_events'].rows;
    for (const partition of [...new Set(rows.map((r: any) => r.partition_id))]) {
      const chain = rows.filter((r: any) => r.partition_id === partition)
        .sort((a: any, b: any) => Number(a.audit_seq) - Number(b.audit_seq));
      let previous = '0'.repeat(64);
      for (const r of chain) {
        r.event_jcs = jcsCanonicalize(r.event);
        r.previous_hash = previous;
        r.row_hash = auditRowHash({
          partitionId: r.partition_id, auditSeq: Number(r.audit_seq),
          previousHash: previous, event: r.event,
        });
        previous = r.row_hash;
        const view = doc.audit.events.find((e: any) => e.partition_id === r.partition_id
          && Number(e.audit_seq) === Number(r.audit_seq));
        if (view !== undefined) {
          view.event_jcs = r.event_jcs;
          view.previous_hash = r.previous_hash;
          view.row_hash = r.row_hash;
          if (r.event?.policy_decision_id !== undefined) view.policy_decision_id = r.event.policy_decision_id;
          if (r.event?.correlation_id !== undefined) view.correlation_id = r.event.correlation_id;
        }
      }
      const last = chain[chain.length - 1];
      for (const h of [...doc.tables['audit.audit_chain_heads'].rows, ...doc.audit.heads]) {
        if (h.partition_id !== partition) continue;
        h.head_hash = last.row_hash;
        h.next_seq = Number(last.audit_seq) + 1;
      }
    }
  });
  const now = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'));
  setStream(d, 'a-a-final-audit-events', 'stdout', Buffer.from(JSON.stringify(now.audit.events)));
  setStream(d, 'a-a-final-audit-heads', 'stdout', Buffer.from(JSON.stringify(now.audit.heads)));
  setStream(d, 'a-a-final-rows-audit_audit_events', 'stdout',
    Buffer.from(JSON.stringify(now.tables['audit.audit_events'].rows)));
  setStream(d, 'a-a-final-rows-audit_audit_chain_heads', 'stdout',
    Buffer.from(JSON.stringify(now.tables['audit.audit_chain_heads'].rows)));
}

/** The head the governed operation advanced: the one final changed relative to after. */
function advancedHead(d: string) {
  const stale = new Set(JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8'))
    .tables['audit.audit_chain_heads'].rows.map((h: any) => JSON.stringify(h)));
  return JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'))
    .tables['audit.audit_chain_heads'].rows.find((h: any) => !stale.has(JSON.stringify(h)));
}

/**
 * The eleven residual packages the C18.1.12 review reproduced, at ARCHIVE level. Every one is
 * fully rebound — the processed snapshots, the command-bound raw receipts, those commands' byte
 * lengths and digests, the manifest and seed record where relevant, the audit canonicalization,
 * row hashes and heads where relevant, and SHA256SUMS.txt.
 */
const C11812_MUTATIONS: ReadonlyArray<[string, Mutator, RegExp]> = [
  ['one planned capability tuple is minted twice and the other never', (d) => {
    const after = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8')).tables['ctx.issued'].rows;
    const seen = new Set(after.map((r: any) => r.nonce));
    const minted = JSON.parse(readFileSync(join(d, 'path-a-final.json'), 'utf8'))
      .tables['ctx.issued'].rows.filter((r: any) => !seen.has(r.nonce));
    const identity = minted.find((r: any) => r.op_class === 'identity');
    const other = minted.find((r: any) => r.op_class !== 'identity');
    finalOnly(d, 'ctx.issued', (t: any) => {
      const row = t.rows.find((r: any) => r.nonce === other.nonce);
      row.op_class = identity.op_class;
      row.bound_action = identity.bound_action;
      row.session_id = identity.session_id;
    });
  }, /post-upgrade capabilities:/],

  ['the new session and its refresh row share a non-uuid family', (d) => {
    const s = insertedRow(d, 'identity.sessions', 'id');
    const r = insertedRow(d, 'identity.refresh_tokens', 'id');
    finalOnly(d, 'identity.sessions', (t: any) => {
      t.rows.find((x: any) => x.id === s.id).family_id = 'not-a-uuid';
    });
    finalOnly(d, 'identity.refresh_tokens', (t: any) => {
      t.rows.find((x: any) => x.id === r.id).family_id = 'not-a-uuid';
    });
  }, /family_id is "not-a-uuid", which is not a uuid/],

  ['both linked refresh-token hashes are not digests', (d) => {
    const s = insertedRow(d, 'identity.sessions', 'id');
    const r = insertedRow(d, 'identity.refresh_tokens', 'id');
    finalOnly(d, 'identity.sessions', (t: any) => {
      t.rows.find((x: any) => x.id === s.id).refresh_token_hash = 'not-a-digest';
    });
    finalOnly(d, 'identity.refresh_tokens', (t: any) => {
      t.rows.find((x: any) => x.id === r.id).token_hash = 'not-a-digest';
    });
  }, /which is not a sha-256 hex digest/],

  ['the family is DELETED from both linked rows', (d) => {
    const s = insertedRow(d, 'identity.sessions', 'id');
    const r = insertedRow(d, 'identity.refresh_tokens', 'id');
    finalOnly(d, 'identity.sessions', (t: any) => { delete t.rows.find((x: any) => x.id === s.id).family_id; });
    finalOnly(d, 'identity.refresh_tokens', (t: any) => { delete t.rows.find((x: any) => x.id === r.id).family_id; });
  }, /'identity\.sessions' row is MISSING field 'family_id'/],

  ['both linked token-hash fields are DELETED', (d) => {
    const s = insertedRow(d, 'identity.sessions', 'id');
    const r = insertedRow(d, 'identity.refresh_tokens', 'id');
    finalOnly(d, 'identity.sessions', (t: any) => { delete t.rows.find((x: any) => x.id === s.id).refresh_token_hash; });
    finalOnly(d, 'identity.refresh_tokens', (t: any) => { delete t.rows.find((x: any) => x.id === r.id).token_hash; });
  }, /row is MISSING field 'refresh_token_hash'/],

  ['both linked issue instants are respelled to the same moment', (d) => {
    const s = insertedRow(d, 'identity.sessions', 'id');
    const r = insertedRow(d, 'identity.refresh_tokens', 'id');
    finalOnly(d, 'identity.sessions', (t: any) => {
      const row = t.rows.find((x: any) => x.id === s.id);
      row.issued_at = respellPg(row.issued_at);
    });
    finalOnly(d, 'identity.refresh_tokens', (t: any) => {
      const row = t.rows.find((x: any) => x.id === r.id);
      row.issued_at = respellPg(row.issued_at);
    });
  }, /issued_at is ".*\+0000", which is not the canonical governed timestamp grammar/],

  ['every seeded and post-upgrade session lifetime is doubled consistently', (d) => {
    everywhereA(d, 'identity.sessions', (row: any) => {
      const lived = Date.parse(row.expires_at) - Date.parse(row.issued_at);
      row.expires_at = new Date(Date.parse(row.issued_at) + lived * 2).toISOString().replace('Z', '+00:00');
    });
  }, /the source governs every session at 3600s/],

  ['every seeded and post-upgrade capability lifetime is doubled consistently', (d) => {
    everywhereA(d, 'ctx.issued', (row: any) => {
      const lived = Date.parse(row.expires_at) - Date.parse(row.issued_at);
      row.expires_at = new Date(Date.parse(row.issued_at) + lived * 2).toISOString().replace('Z', '+00:00');
    });
  }, /the source governs every capability at \d+s/],

  ['the advanced head’s stamp is respelled to the same instant', (d) => {
    const head = advancedHead(d);
    finalOnly(d, 'audit.audit_chain_heads', (t: any) => {
      const row = t.rows.find((h: any) => h.partition_id === head.partition_id);
      row.updated_at = respellPg(row.updated_at);
    });
  }, /audit_chain_heads\.updated_at is ".*\+0000", which is not the canonical governed timestamp grammar/],

  ['the closing event’s instant is respelled in row AND body, then fully rechained', (d) => {
    editJson(d, 'path-a-final.json', (doc: any) => {
      const aft = JSON.parse(readFileSync(join(d, 'path-a-after.json'), 'utf8'));
      const seen = new Set(aft.tables['audit.audit_events'].rows
        .map((e: any) => `${e.partition_id}#${e.audit_seq}`));
      const closing = doc.tables['audit.audit_events'].rows
        .find((e: any) => !seen.has(`${e.partition_id}#${e.audit_seq}`));
      const respelt = String(closing.event.occurred_at).replace(/\.(\d{3})Z$/, '.$1000Z');
      closing.event = { ...closing.event, occurred_at: respelt };
      closing.occurred_at = respelt;
    });
    rechainFinal(d);
  }, /not the exact millisecond JSON instant grammar/],

  ['the post-upgrade decision id is a coordinated non-uuid everywhere', (d) => {
    const BAD = 'decision-not-a-uuid';
    const old = insertedRow(d, 'policy.policy_decisions', 'id').id;
    finalOnly(d, 'policy.policy_decisions', (t: any) => {
      t.rows.find((r: any) => r.id === old).id = BAD;
    });
    finalOnly(d, 'ctx.operation', (t: any) => {
      for (const r of t.rows) if (r.decision_id === old) r.decision_id = BAD;
    });
    editJson(d, 'path-a-final.json', (doc: any) => {
      for (const r of doc.tables['audit.audit_events'].rows) {
        if (r.event?.policy_decision_id === old) r.event = { ...r.event, policy_decision_id: BAD };
        if (r.policy_decision_id === old) r.policy_decision_id = BAD;
      }
    });
    rechainFinal(d);
    editJson(d, 'c18-manifest.json', (m: any) => {
      if (m.post_upgrade_operation?.decisionId === old) m.post_upgrade_operation.decisionId = BAD;
    });
    editJson(d, 'path-a-seed-record.json', (r: any) => {
      if (r.post_upgrade_operation?.decisionId === old) r.post_upgrade_operation.decisionId = BAD;
    });
  }, /decision_id is "decision-not-a-uuid", which is not a uuid/],
];

describe('C18.1.12 — DIFFERENTIAL: the frozen 2c3cab3 verifier ACCEPTED what C18.1.12 rejects', () => {
  beforeAll(() => { expect(ARCHIVE).not.toBe(''); });

  const judge2c3 = async (mutate: Mutator) => {
    const { members } = mutateMembers((d) => { downgradeTo2c3cab3(d); mutate(d); });
    return legacy2c3Semantics({
      members, root: REPO, sourceBinding: legacyBinding('2c3cab3', derive2c3Binding),
    });
  };

  it('NON-VACUITY: the frozen 2c3cab3 verifier accepts the genuine archive', async () => {
    const r = await judge2c3(() => {});
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('the frozen 2c3cab3 leg agrees through the real ZIP ingress as well', async () => {
    const { dir, zip } = mutateArchive(downgradeTo2c3cab3);
    try {
      const r = await legacy2c3({ zipPath: zip, root: REPO });
      expect(r.problems).toEqual([]);
      expect(r.ok).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(C11812_MUTATIONS)('%s — 2c3cab3 ACCEPTS it; C18.1.12 REJECTS it', async (_label, mutate, pattern) => {
    const old = await judge2c3(mutate);
    expect(old.ok, `the frozen 2c3cab3 verifier must accept this mutation; problems: ${old.problems.join('; ')}`).toBe(true);
    await expectReject(mutate, pattern);
  });

  it('the same judgement holds through the real ZIP ingress, not only the member map', async () => {
    // The semantic core is exercised above for speed; this proves the production path agrees.
    await expectRejectViaZip(C11812_MUTATIONS[0]![1], C11812_MUTATIONS[0]![2]);
    await expectRejectViaZip(C11812_MUTATIONS[3]![1], C11812_MUTATIONS[3]![2]);
  });
});
