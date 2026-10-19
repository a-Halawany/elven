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
 *   N3 — a cycle through slices (a B81 feature on F-P7-E-21@B82 while B82 depends on B81), derived (--write)    → exit 1, "cycle"
 *   P2 — an UNQUALIFIED dependency keeps its meaning: a B81 feature on F-P7-E-05 (no slice), derived (--write)
 *        → B81 depends on B111 (the feature's completing stage) — full completion where it is required
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
}
// N1 — a slice naming no feature
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-99@B80'); const r = run(d); check('N1 a slice naming no feature is refused', r.code === 1 && /names no feature/.test(r.out)); }
// N2 — a slice naming no stage
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-05@B999'); const r = run(d); check('N2 a slice naming no stage is refused', r.code === 1 && /names no stage/.test(r.out)); }
// N3 — a cycle through slices, derived
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-05@B80; F-P7-E-21@B82'); const r = run(d, true); check('N3 a cycle through slices is still detected', r.code === 1 && /cycle/.test(r.out), r.out.split('\n').find((l) => /cycle/.test(l)) ?? ''); }
// P2 — an unqualified dependency resolves to the completing stage
{ const d = fixture(); setDeps(d, 'F-P7-E-04', 'F-P7-E-01@B80; F-P7-E-05'); run(d, true); const deps = stageDeps(d, 'B81'); check('P2 an unqualified dependency keeps its meaning — B81 then depends on B111 (full completion)', deps.split(' ').includes('B111'), deps); }

console.log(failed === 0 ? 'controls: all passed' : `controls: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
