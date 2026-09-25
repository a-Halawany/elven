#!/usr/bin/env node
/**
 * The delivery plan's tracker check (audit/delivery/; baseline 2026-09-24, corrected 2026-09-25 by the bounded review of 5da4799).
 *
 * FEATURE_TRACKER.csv groups the 6,264 atomic requirement rows (audit/requirements/*.csv) into features through
 * feature-rowmap.csv. Each open feature has ONE completing stage (`stage`: where its construction — or, for a
 * feature with no software, its whole work — is done) and at most ONE verification stage (`verify_stage`: the
 * H or R stage holding its comprehensive verification or external proof). The STAGE is authoritative for the
 * milestone, the owner and the target date; the feature row mirrors it.
 *
 * `--write` DERIVES, then the check runs:
 *   tracker: the row counts and the computed status; milestone / owner / target_date from the completing stage;
 *            effort = stage effort + verify effort.
 *   stages:  completing_features and verifying_features from the tracker; effort = own effort + the completing
 *            features' stage effort + the verifying features' verify effort; depends_on = the stages completing
 *            the completing features' dependencies (pkg:P7-D = B65) ∪ extra_depends_on; an H stage depends on M1,
 *            an R stage on H1 H2 H3.
 * The check fails on: an unmapped or twice-mapped row; a stale count or status; a feature without exactly one
 * completing stage, or listed by more than one; a verify stage that is not H/R or does not list it; a milestone,
 * owner or date that differs from its stage; an effort that does not add up; a dependency not reachable through
 * the stage graph; a cycle; a stage with no completing feature lacking its own effort, scenes or explicit
 * conditions.
 *
 * Status is computed from the rows, never judged (functioning = every row implemented or not-applicable; missing =
 * every row missing; partial otherwise; externally-blocked carried from the characterisation). A computed label is
 * a planning group label, not a verification result. Acceptance verification is a separate ledger
 * (audit/acceptance-units, audit/summarise-units.mjs); no percentage is computed here.
 *
 * Run: node audit/delivery/feature-tracker.mjs            (check; exit 1 on any problem)
 *      node audit/delivery/feature-tracker.mjs --write    (derive, write, then check)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const reqDir = join(here, '..', 'requirements');
const write = process.argv.includes('--write');

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
const writeTable = (path, t) => writeFileSync(path, [t.head.join(','), ...t.rows.map((r) => t.head.map((c) => esc(r[c])).join(','))].join('\n') + '\n');
const num = (v) => Number(v || 0);
const fmt = (n) => String(Math.round(n * 100) / 100);
const words = (s) => String(s || '').split(/\s+/).filter(Boolean);
const STAGE_ID = /^(B|H|R)\d+$/;
const MILESTONE = { M1: 'implementation', M2: 'hardening', M4: 'deployment-readiness' };

const problems = [];
const key = (file, volume, id) => `${file}|${volume}|${id}`;

// ── requirement rows and the row map ─────────────────────────────────────────────────────────────────────────
const req = new Map();
for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.csv')).sort()) {
  for (const r of readTable(join(reqDir, f)).rows) {
    const k = key(f, r.volume.trim(), r.id.trim());
    if (req.has(k)) problems.push(`requirement row twice: ${k}`);
    req.set(k, r.impl_status.trim());
  }
}
const mapped = new Map();
for (const m of readTable(join(here, 'feature-rowmap.csv')).rows) {
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

// ── tables ───────────────────────────────────────────────────────────────────────────────────────────────────
const trackerPath = join(here, 'FEATURE_TRACKER.csv');
const stagesPath = join(here, 'STAGES.csv');
const tracker = readTable(trackerPath);
const stagesT = readTable(stagesPath);
const stages = new Map(stagesT.rows.map((s) => [s.stage, s]));
const feats = new Map(tracker.rows.map((t) => [t.feature_id, t]));
for (const fid of counts.keys()) if (!feats.has(fid)) problems.push(`the map names a feature the tracker lacks: ${fid}`);
const isOpen = (t) => !['done', 'not-applicable'].includes(t.package);
const open = tracker.rows.filter(isOpen);

const computedStatus = (t, c) => {
  if (t.package === 'not-applicable') return 'n/a';
  if (t.status === 'externally-blocked') return 'externally-blocked';
  if (c.implemented + c.na === c.rows) return 'functioning';
  if (c.missing === c.rows) return 'missing';
  return 'partial';
};
const depStage = (d) => (d === 'pkg:P7-D' ? 'B65' : feats.get(d)?.stage);
const featureDeps = (t) => String(t.depends_on || '').split(';').map((x) => x.trim()).filter((x) => /^F-/.test(x) || x === 'pkg:P7-D');

// ── derive (--write) ─────────────────────────────────────────────────────────────────────────────────────────
if (write) {
  for (const t of tracker.rows) {
    const c = counts.get(t.feature_id) ?? { rows: 0, implemented: 0, partial: 0, missing: 0, na: 0 };
    Object.assign(t, { rows: c.rows, rows_implemented: c.implemented, rows_partial: c.partial, rows_missing: c.missing, status: computedStatus(t, c) });
    if (!isOpen(t)) continue;
    t.effort_lo = fmt(num(t.stage_effort_lo) + num(t.verify_effort_lo));
    t.effort_hi = fmt(num(t.stage_effort_hi) + num(t.verify_effort_hi));
  }
  const implStages = stagesT.rows.filter((s) => s.milestone === 'M1').map((s) => s.stage);
  for (const s of stagesT.rows) {
    const comp = open.filter((t) => t.stage === s.stage).map((t) => t.feature_id);
    const ver = open.filter((t) => t.verify_stage === s.stage).map((t) => t.feature_id);
    s.completing_features = comp.join(' ');
    s.verifying_features = ver.join(' ');
    s.effort_lo = fmt(num(s.own_effort_lo) + comp.reduce((a, f) => a + num(feats.get(f).stage_effort_lo), 0) + ver.reduce((a, f) => a + num(feats.get(f).verify_effort_lo), 0));
    s.effort_hi = fmt(num(s.own_effort_hi) + comp.reduce((a, f) => a + num(feats.get(f).stage_effort_hi), 0) + ver.reduce((a, f) => a + num(feats.get(f).verify_effort_hi), 0));
    if (s.milestone === 'M1') {
      const d = new Set(words(s.extra_depends_on));
      for (const f of comp) for (const dep of featureDeps(feats.get(f))) { const ds = depStage(dep); if (ds && ds !== s.stage && implStages.includes(ds)) d.add(ds); }
      s.depends_on = [...d].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).join(' ');
    } else if (s.milestone === 'M2') s.depends_on = 'M1';
    else s.depends_on = 'H1 H2 H3';
  }
  for (const t of open) {
    const s = stages.get(t.stage); if (!s) continue;
    t.milestone = MILESTONE[s.milestone]; t.owner = s.owner; t.target_date = s.target_merged; t.lane = s.lane;
  }
  writeTable(trackerPath, tracker); writeTable(stagesPath, stagesT);
}

// ── the stage graph ──────────────────────────────────────────────────────────────────────────────────────────
const depsOf = (s) => {
  const d = words(s.depends_on);
  if (d.includes('M1')) return stagesT.rows.filter((x) => x.milestone === 'M1').map((x) => x.stage);
  return d;
};
for (const s of stagesT.rows) {
  if (!STAGE_ID.test(s.stage)) problems.push(`stage id not fixed-form: ${s.stage}`);
  if (!MILESTONE[s.milestone]) problems.push(`${s.stage}: unknown milestone ${s.milestone}`);
  for (const d of depsOf(s)) if (!stages.has(d)) problems.push(`${s.stage} depends on unknown stage ${d}`);
}
const closure = new Map();
const visiting = new Set();
function reach(id) {
  if (closure.has(id)) return closure.get(id);
  if (visiting.has(id)) { problems.push(`cycle through ${id}`); return new Set(); }
  visiting.add(id);
  const out = new Set();
  for (const d of depsOf(stages.get(id) ?? { depends_on: '' })) { out.add(d); for (const x of reach(d)) out.add(x); }
  visiting.delete(id); closure.set(id, out); return out;
}
for (const s of stagesT.rows) reach(s.stage);

// ── checks ───────────────────────────────────────────────────────────────────────────────────────────────────
const listedComp = new Map(); const listedVer = new Map();
for (const s of stagesT.rows) {
  for (const f of words(s.completing_features)) { listedComp.set(f, [...(listedComp.get(f) ?? []), s.stage]); if (!feats.has(f)) problems.push(`${s.stage} lists unknown feature ${f}`); }
  for (const f of words(s.verifying_features)) { listedVer.set(f, [...(listedVer.get(f) ?? []), s.stage]); if (!feats.has(f)) problems.push(`${s.stage} verifies unknown feature ${f}`); }
}
const near = (a, b) => Math.abs(a - b) < 1e-6;
for (const t of tracker.rows) {
  const c = counts.get(t.feature_id) ?? { rows: 0, implemented: 0, partial: 0, missing: 0, na: 0 };
  const want = { rows: c.rows, rows_implemented: c.implemented, rows_partial: c.partial, rows_missing: c.missing, status: computedStatus(t, c) };
  for (const [col, v] of Object.entries(want)) if (String(t[col]) !== String(v)) problems.push(`${t.feature_id}: ${col} is ${t[col]}, the rows say ${v} (run --write)`);
  if (!isOpen(t)) continue;
  const s = stages.get(t.stage);
  const comp = listedComp.get(t.feature_id) ?? [];
  if (t.status !== 'functioning') {
    if (!s) { problems.push(`${t.feature_id}: open with no known completing stage (${t.stage || 'none'})`); continue; }
    if (comp.length !== 1 || comp[0] !== t.stage) problems.push(`${t.feature_id}: completing stage ${t.stage}, listed by [${comp.join(' ')}] — exactly one completing assignment required`);
  }
  if (!s) continue;
  const ver = listedVer.get(t.feature_id) ?? [];
  if (t.verify_stage) {
    const vs = stages.get(t.verify_stage);
    if (!vs || !['M2', 'M4'].includes(vs.milestone)) problems.push(`${t.feature_id}: verify stage ${t.verify_stage} is not an H or R stage`);
    if (ver.length !== 1 || ver[0] !== t.verify_stage) problems.push(`${t.feature_id}: verify stage ${t.verify_stage}, listed by [${ver.join(' ')}]`);
    if (!(num(t.verify_effort_hi) > 0)) problems.push(`${t.feature_id}: a verify stage without verify effort`);
  } else if (ver.length || num(t.verify_effort_hi) > 0) problems.push(`${t.feature_id}: verify effort or a verifying listing without a verify stage`);
  if (t.milestone !== MILESTONE[s.milestone]) problems.push(`${t.feature_id}: milestone ${t.milestone}, its stage ${t.stage} is ${s.milestone} (${MILESTONE[s.milestone]})`);
  if (t.owner !== s.owner) problems.push(`${t.feature_id}: owner ${t.owner}, its stage says ${s.owner}`);
  if (t.target_date !== s.target_merged) problems.push(`${t.feature_id}: target ${t.target_date}, its stage says ${s.target_merged}`);
  if (!near(num(t.effort_lo), num(t.stage_effort_lo) + num(t.verify_effort_lo)) || !near(num(t.effort_hi), num(t.stage_effort_hi) + num(t.verify_effort_hi))) problems.push(`${t.feature_id}: effort ≠ stage effort + verify effort`);
  for (const dep of featureDeps(t)) {
    const d = dep === 'pkg:P7-D' ? null : feats.get(dep);
    if (d && (!isOpen(d) || d.status === 'functioning')) continue;
    const ds = depStage(dep);
    if (!ds) { problems.push(`${t.feature_id}: dependency ${dep} has no stage`); continue; }
    if (ds !== t.stage && !reach(t.stage).has(ds)) problems.push(`${t.feature_id} (${t.stage}) depends on ${dep} (${ds}), which ${t.stage} does not reach`);
  }
}
for (const s of stagesT.rows) {
  const comp = words(s.completing_features); const ver = words(s.verifying_features);
  const lo = num(s.own_effort_lo) + comp.reduce((a, f) => a + num(feats.get(f)?.stage_effort_lo), 0) + ver.reduce((a, f) => a + num(feats.get(f)?.verify_effort_lo), 0);
  const hi = num(s.own_effort_hi) + comp.reduce((a, f) => a + num(feats.get(f)?.stage_effort_hi), 0) + ver.reduce((a, f) => a + num(feats.get(f)?.verify_effort_hi), 0);
  if (!near(lo, num(s.effort_lo)) || !near(hi, num(s.effort_hi))) problems.push(`${s.stage}: effort ${s.effort_lo}–${s.effort_hi}, the features and own effort add to ${fmt(lo)}–${fmt(hi)} (run --write)`);
  if (!s.completion_conditions.trim()) problems.push(`${s.stage}: no completion conditions`);
  if (!s.demo_scenes.trim()) problems.push(`${s.stage}: no demonstration scenes (or an explicit 'none (…)')`);
  if (comp.length === 0 && s.milestone === 'M1') {
    if (!(num(s.own_effort_hi) > 0)) problems.push(`${s.stage}: completes no feature and has no own effort`);
    if (/the completing features/.test(s.completion_conditions)) problems.push(`${s.stage}: completes no feature but its conditions refer to "the completing features"`);
  }
  if (s.milestone === 'M1' && !/^A\d$/.test(s.owner)) problems.push(`${s.stage}: implementation stage without an account owner`);
}

// ── summary ──────────────────────────────────────────────────────────────────────────────────────────────────
const by = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
const sum = (xs, c) => fmt(xs.reduce((a, x) => a + num(x[c]), 0));
console.log(`requirement rows ${req.size}; mapped ${mapped.size}; features ${tracker.rows.length} (open-register ${open.length}); stages ${stagesT.rows.length}`);
console.log('open-register features by computed status:', JSON.stringify(by(open, (t) => t.status)));
console.log('open-register features by milestone of their completing stage:', JSON.stringify(by(open, (t) => t.milestone)));
for (const m of ['M1', 'M2', 'M4']) {
  const ss = stagesT.rows.filter((s) => s.milestone === m);
  console.log(`${m}: ${ss.length} stages, effort ${sum(ss, 'effort_lo')}–${sum(ss, 'effort_hi')} units`);
}
console.log(`features: stage effort ${sum(open, 'stage_effort_lo')}–${sum(open, 'stage_effort_hi')}, verify effort ${sum(open, 'verify_effort_lo')}–${sum(open, 'verify_effort_hi')}; own stage effort ${sum(stagesT.rows, 'own_effort_lo')}–${sum(stagesT.rows, 'own_effort_hi')}`);
console.log('rows by implementation status:', JSON.stringify(by([...req.values()], (x) => x)));
console.log('Acceptance verification is counted separately: node audit/summarise-units.mjs (no percentage here).');
if (problems.length > 0) { console.error(`\n${problems.length} problem(s):`); for (const p of problems.slice(0, 60)) console.error(`- ${p}`); process.exit(1); }
console.log('tracker check: PASS');
