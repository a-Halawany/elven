#!/usr/bin/env node
/**
 * The delivery plan's tracker check (audit/delivery/, the baseline of 2026-09-24).
 *
 * The tracker (FEATURE_TRACKER.csv) groups the 6,264 atomic requirement rows (audit/requirements/*.csv)
 * into features through feature-rowmap.csv, and every open feature into one stage of STAGES.csv. This
 * script recomputes each feature's row counts from the requirement CSVs and fails when:
 *   - a requirement row is unmapped or mapped twice, or the map names a row that no longer exists;
 *   - the map names a feature the tracker does not carry;
 *   - a feature's recorded counts or computed status differ from the requirement rows (the tracker is stale);
 *   - an open feature has no stage, its stage does not exist, or the stage does not list it;
 *   - a stage depends on a stage that does not exist.
 *
 * Status is computed from the rows, never judged: functioning = every row implemented or not-applicable;
 * missing = every row missing; partial otherwise; externally-blocked is carried from the characterisation
 * (the feature cannot complete without a named external prerequisite). Acceptance verification is a
 * separate count (audit/acceptance-units, audit/summarise-units.mjs) and no percentage is computed here.
 *
 * Run: node audit/delivery/feature-tracker.mjs            (check; exit 1 on any problem)
 *      node audit/delivery/feature-tracker.mjs --write    (rewrite the count and status columns, then check)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reqDir = join(here, '..', 'requirements');

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* ignore */ }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
function readTable(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const head = rows.shift();
  return { head, rows: rows.filter((r) => !(r.length === 1 && r[0] === '')).map((r) => Object.fromEntries(head.map((c, i) => [c, r[i] ?? '']))) };
}
const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const problems = [];
const key = (file, volume, id) => `${file}|${volume}|${id}`;

const req = new Map();
for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.csv')).sort()) {
  for (const r of readTable(join(reqDir, f)).rows) {
    const k = key(f, r.volume.trim(), r.id.trim());
    if (req.has(k)) problems.push(`requirement row twice: ${k}`);
    req.set(k, r.impl_status.trim());
  }
}

const rowmap = readTable(join(here, 'feature-rowmap.csv')).rows;
const mapped = new Map();
for (const m of rowmap) {
  const k = key(m.file, m.volume, m.row_id);
  if (mapped.has(k)) problems.push(`row mapped twice: ${k}`);
  if (!req.has(k)) problems.push(`the map names a row that does not exist: ${k}`);
  mapped.set(k, m.feature_id);
}
for (const k of req.keys()) if (!mapped.has(k)) problems.push(`requirement row not mapped to a feature: ${k}`);

const counts = new Map();
for (const [k, fid] of mapped) {
  const st = req.get(k); if (st === undefined) continue;
  const c = counts.get(fid) ?? { rows: 0, implemented: 0, partial: 0, missing: 0, na: 0 };
  c.rows += 1;
  if (st === 'implemented') c.implemented += 1; else if (st === 'partial') c.partial += 1;
  else if (st === 'missing') c.missing += 1; else if (st === 'not-applicable') c.na += 1;
  else problems.push(`unknown impl_status "${st}" at ${k}`);
  counts.set(fid, c);
}

const stagesT = readTable(join(here, 'STAGES.csv'));
const stages = new Map(stagesT.rows.map((s) => [s.stage, s]));
for (const s of stagesT.rows) {
  if (!/^(B|H|R)\d+$/.test(s.stage)) problems.push(`stage id not fixed-form: ${s.stage}`);
  for (const d of s.depends_on.split(/\s+/).filter((x) => /^(B|H|R)\d+$/.test(x))) if (!stages.has(d)) problems.push(`${s.stage} depends on unknown stage ${d}`);
}

const trackerPath = join(here, 'FEATURE_TRACKER.csv');
const tracker = readTable(trackerPath);
const ids = new Set(tracker.rows.map((t) => t.feature_id));
for (const fid of counts.keys()) if (!ids.has(fid)) problems.push(`the map names a feature the tracker lacks: ${fid}`);
const write = process.argv.includes('--write');
const computed = (t, c) => {
  if (t.package === 'not-applicable') return 'n/a';
  if (t.status === 'externally-blocked') return 'externally-blocked';
  if (c.implemented + c.na === c.rows) return 'functioning';
  if (c.missing === c.rows) return 'missing';
  return 'partial';
};
for (const t of tracker.rows) {
  const c = counts.get(t.feature_id) ?? { rows: 0, implemented: 0, partial: 0, missing: 0, na: 0 };
  const status = computed(t, c);
  const want = { rows: c.rows, rows_implemented: c.implemented, rows_partial: c.partial, rows_missing: c.missing, status };
  for (const [col, v] of Object.entries(want)) {
    if (String(t[col]) !== String(v)) {
      if (write) t[col] = String(v); else problems.push(`${t.feature_id}: ${col} is ${t[col]}, the rows say ${v} (run --write)`);
    }
  }
  const open = !['done', 'not-applicable'].includes(t.package) && t.status !== 'functioning';
  if (open) {
    const s = stages.get(t.stage);
    if (!s) problems.push(`${t.feature_id}: open with no known stage (${t.stage || 'none'})`);
    else if (!s.completing_features.split(/\s+/).includes(t.feature_id)) problems.push(`${t.feature_id}: stage ${t.stage} does not list it`);
  }
}
for (const s of stagesT.rows) for (const f of s.completing_features.split(/\s+/).filter(Boolean)) if (!ids.has(f)) problems.push(`${s.stage} lists unknown feature ${f}`);

if (write) {
  const out = [tracker.head.join(','), ...tracker.rows.map((t) => tracker.head.map((c) => esc(t[c])).join(','))].join('\n') + '\n';
  writeFileSync(trackerPath, out);
}

const product = tracker.rows.filter((t) => !['done', 'not-applicable'].includes(t.package));
const by = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log(`requirement rows ${req.size}; mapped ${mapped.size}; features ${tracker.rows.length} (open-register features ${product.length}); stages ${stages.size}`);
console.log('open-register features by status:', JSON.stringify(by(product, (t) => t.status)));
console.log('open-register features by milestone:', JSON.stringify(by(product, (t) => t.milestone)));
console.log('rows by implementation status:', JSON.stringify(by([...req.values()], (x) => x)));
console.log('Acceptance verification is counted separately: node audit/summarise-units.mjs (no percentage here).');
if (problems.length > 0) { console.error(`\n${problems.length} problem(s):`); for (const p of problems.slice(0, 50)) console.error(`- ${p}`); process.exit(1); }
console.log('tracker check: PASS');
