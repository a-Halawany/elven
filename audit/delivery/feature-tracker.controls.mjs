#!/usr/bin/env node
/**
 * Controls for audit/delivery/feature-tracker.mjs — the SLICE dependency `F-…@Bnn` (B80, 2026-10-17): a consumer that genuinely requires the
 * slice of a feature delivered at Bnn depends on Bnn, not on the feature's later completing stage; everything else stays as it was.
 *
 * Fixture runs in a temporary copy of audit/requirements and audit/delivery, never touching the tracked audit:
 *   P1 — the tracked audit as committed: the check passes; B81, B82 and B84 depend on B80 (the slice), none on B111 (the recording path);
 *        F-P7-E-01 / -03 / -05 complete at B111 (their construction is not counted as delivered)              → exit 0
 *   N1 — a slice naming no feature (F-P7-E-99@B80)                                                              → exit 1, "names no feature"
 *   N2 — a slice naming no stage (F-P7-E-05@B999)                                                               → exit 1, "names no stage"
 *   N3 — a cycle through slices (B83's F-P7-E-13 on F-P7-E-09@B85 while B85 depends on B83), derived (--write)  → exit 1, "cycle"
 *   P2 — an UNQUALIFIED dependency keeps its meaning: B83's F-P7-E-13 on F-P7-E-06 (no slice), derived (--write)
 *        → B82 depends on B111 (the feature's completing stage) — full completion where it is required
 *   (B81 / B82, 2026-10-19: B81's and B82's features now complete later — so N3 and P2 use B83's F-P7-E-13; P1 adds each stage's slice.)
 *   (B40, 2026-10-21: P1 adds B40's slice — B41, B42, B43, B44, B46 and B109 depend on B40, none on B111 / B54; B40 depends on nothing.)
 * Run: node audit/delivery/feature-tracker.controls.mjs   (exit 1 on any failed control)
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const audit = join(here, '..');
let failed = 0;
const check = (label, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!cond) failed += 1; };

/** A fresh copy: <tmp>/requirements, <tmp>/delivery (the script resolves both from its own directory). */
function fixture() {
  const d = mkdtempSync(join(tmpdir(), 'eye-tracker-controls-'));
  cpSync(join(audit, 'requirements'), join(d, 'requirements'), { recursive: true });
  cpSync(here, join(d, 'delivery'), { recursive: true });
  return d;
}
function run(d, write = false) {
  try {
    const out = execFileSync('node', [join(d, 'delivery', 'feature-tracker.mjs'), ...(write ? ['--write'] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
}
/** Set one feature's depends_on in the fixture's tracker (a minimal CSV edit on the feature's own line). */
function setDeps(d, featureId, deps) {
  const p = join(d, 'delivery', 'FEATURE_TRACKER.csv');
  const lines = readFileSync(p, 'utf8').split('\n');
  const head = lines[0].split(',');
  const di = head.indexOf('depends_on');
  const parse = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const i = lines.findIndex((l) => l.startsWith(`${featureId},`));
  const cells = parse(lines[i]); cells[di] = deps; lines[i] = cells.map(esc).join(',');
  writeFileSync(p, lines.join('\n'));
}
/** A CSV table as objects (quoted fields with commas and quotes). */
function table(path) {
  const text = readFileSync(path, 'utf8'); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const stageDeps = (d, stage) => (table(join(d, 'delivery', 'STAGES.csv')).find((r) => r.stage === stage)?.depends_on ?? '');

// P1 — the tracked audit as committed
{
  const r = run(fixture());
  check('P1 the tracked audit passes the check', r.code === 0, r.out.trim().split('\n').slice(-1)[0]);
  const stages = table(join(here, 'STAGES.csv'));
  const deps = (s) => stages.find((r) => r.stage === s)?.depends_on ?? '';
  for (const s of ['B81', 'B82', 'B84']) check(`P1 ${s} depends on B80 (the delivered slice), not on B111 (the recording path)`, deps(s).split(' ').includes('B80') && !deps(s).split(' ').includes('B111'), deps(s));
  const tracker = table(join(here, 'FEATURE_TRACKER.csv'));
  for (const f of ['F-P7-E-01', 'F-P7-E-03', 'F-P7-E-05']) check(`P1 ${f} completes at B111 (its construction is not counted as delivered at B80)`, tracker.find((r) => r.feature_id === f)?.stage === 'B111');
  /* B81 (2026-10-19): the slice delivered at B81 — B82, B83, B84 and B85 depend on B81, none on B111 or B100; the six features complete later */
  for (const s of ['B82', 'B83', 'B84', 'B85']) check(`P1 ${s} depends on B81 (the delivered slice), not on B111 / B100`, deps(s).split(' ').includes('B81') && !deps(s).split(' ').includes('B111') && !deps(s).split(' ').includes('B100'), deps(s));
  for (const [f, s] of [['F-P7-E-02', 'B111'], ['F-P7-E-04', 'B111'], ['F-P7-E-06', 'B111'], ['F-P7-E-18', 'B111'], ['F-P7-E-19', 'B100'], ['F-P7-E-20', 'B111']]) check(`P1 ${f} completes at ${s} (its construction is not counted as delivered at B81)`, tracker.find((r) => r.feature_id === f)?.stage === s);
  /* B50 (2026-10-19): F-P3-01 completes at B50; the others later — B51 and B54 depend on B50 (the slice), B26 and B111 not on B85 */
  for (const s of ['B51', 'B54']) check(`P1 ${s} depends on B50 (the delivered slice)`, deps(s).split(' ').includes('B50'), deps(s));
  for (const s of ['B26', 'B111']) check(`P1 ${s} does not wait on B85 (F-P3-03's later completion — the slice delivered at B50 is what it needs)`, !deps(s).split(' ').includes('B85'), deps(s));
  for (const [f, s] of [['F-P3-01', 'B50'], ['F-P3-02', 'B111'], ['F-P3-03', 'B85'], ['F-P3-04', 'B111'], ['F-P3-05', 'B26']]) check(`P1 ${f} completes at ${s}`, tracker.find((r) => r.feature_id === f)?.stage === s);
  /* B82 (2026-10-19): F-P7-E-07 completes at B111, F-P7-E-21 at B83 — B83 and B84 depend on B82 (the slice), never on B111 */
  for (const s of ['B83', 'B84']) check(`P1 ${s} depends on B82 (the delivered slice), not on B111`, deps(s).split(' ').includes('B82') && !deps(s).split(' ').includes('B111'), deps(s));
  for (const [f, s] of [['F-P7-E-07', 'B111'], ['F-P7-E-21', 'B83']]) check(`P1 ${f} completes at ${s}`, tracker.find((r) => r.feature_id === f)?.stage === s);
  /* B40 (2026-10-21): F-P1-04 completes at B40; F-P1-01 and F-P1-03 at B111, F-P1-02 at B54, F-P1-12 at B109 — the dependents on B40's slice
     (DESIGN D1: B41 and B42 carry residues of F-P1-01 while depending on it — left unqualified that would be a cycle), never on B111 / B54 */
  for (const s of ['B41', 'B42', 'B43', 'B44', 'B46', 'B109']) check(`P1 ${s} depends on B40 (the delivered slice), not on B111 / B54`, deps(s).split(' ').includes('B40') && !deps(s).split(' ').includes('B111') && !deps(s).split(' ').includes('B54'), deps(s));
  check('P1 B40 depends on nothing (its own features\' slices are its own)', deps('B40') === '', deps('B40'));
  for (const [f, s] of [['F-P1-01', 'B111'], ['F-P1-02', 'B54'], ['F-P1-03', 'B111'], ['F-P1-04', 'B40'], ['F-P1-12', 'B109']]) check(`P1 ${f} completes at ${s}`, tracker.find((r) => r.feature_id === f)?.stage === s);
  check('P1 F-P1-04 is functioning by its rows (all seven implemented at B40)', tracker.find((r) => r.feature_id === 'F-P1-04')?.status === 'functioning');
}
// N1 — a slice naming no feature
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-99@B80'); const r = run(d); check('N1 a slice naming no feature is refused', r.code === 1 && /names no feature/.test(r.out)); }
// N2 — a slice naming no stage
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-05@B999'); const r = run(d); check('N2 a slice naming no stage is refused', r.code === 1 && /names no stage/.test(r.out)); }
// N3 — a cycle through slices, derived
{ const d = fixture(); setDeps(d, 'F-P7-E-13', 'F-P7-E-06@B81; F-P7-E-07@B82; F-P7-E-21@B82; F-P7-E-09@B85'); const r = run(d, true); check('N3 a cycle through slices is still detected', r.code === 1 && /cycle/.test(r.out), r.out.split('\n').find((l) => /cycle/.test(l)) ?? ''); }
// P2 — an unqualified dependency resolves to the completing stage
{ const d = fixture(); setDeps(d, 'F-P7-E-13', 'F-P7-E-06; F-P7-E-07@B82; F-P7-E-21@B82'); run(d, true); const deps = stageDeps(d, 'B83'); check('P2 an unqualified dependency keeps its meaning — B83 then depends on B111 (full completion)', deps.split(' ').includes('B111'), deps); }

console.log(failed === 0 ? 'controls: all passed' : `controls: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
