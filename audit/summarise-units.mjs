#!/usr/bin/env node
/**
 * Counts over audit/acceptance-units/*.csv — units by status, the S7 accounting, the profile LEGS (batch B4) and the
 * Volume 9 CAP bindings (batch B5). Appends to audit/SUMMARY.md a section "Acceptance units". Counts only.
 *
 * S7 after B4: a mandatory unit is FINISHED only when every leg of its profile vector (saas | private | onprem, plus
 * disconnected | air-gapped where the capability has an offline obligation) carries its own signed evidence, recorded in
 * `legs_verified` as `<leg>=<pointer>`; `verified:local` (the author's harness) and `verified:ci` (the hosted chain on a
 * fresh database) are artefact verifications on NO leg and stay unfinished. `verified:all` is refused unless every leg is
 * accepted, and an accepted leg on an open unit is refused: the status can never run ahead of the evidence.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
/*
 * FAIL CLOSED (Codex, 2026-09-12). The earlier form printed its problems, exited 0, and overwrote SUMMARY.md with
 * counts that had already believed the inconsistent input: a unit marked verified:all with no leg evidence left the
 * unfinished total, and `saas=;private=;onprem=` (empty pointers) counted as three accepted legs. Now every accepted
 * leg's evidence reference is VALIDATED (a non-empty pointer to a file that exists in the repository, on a path that
 * names the leg), completion is DERIVED from validated evidence alone, and ANY problem — in the units, the legs or the
 * CAP bindings — exits 1 and leaves the previous valid summary untouched.
 *
 * Arguments (the controls run the script on fixtures without touching the tracked files):
 *   --units <dir> --requirements <dir> --aliases <file> --summary <file> --root <repository root for pointers>
 *   --check   compute and compare with the committed summary section; write nothing; exit 1 on a difference or a problem
 */
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const dir = resolve(opt('--units', join(here, 'acceptance-units')));
const reqDir = resolve(opt('--requirements', join(here, 'requirements')));
const aliasFile = resolve(opt('--aliases', join(here, 'CAP_ALIASES.md')));
const summary = resolve(opt('--summary', join(here, 'SUMMARY.md')));
const root = resolve(opt('--root', join(here, '..')));
const checkOnly = argv.includes('--check');
/** Files the repository tracks at the given root (a pointer must land on one), or what exists on disk when there is no git tree. */
let tracked = null;
try { tracked = new Set(execSync('git ls-files', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean)); } catch { tracked = null; }
const pointerExists = (path) => (tracked !== null && tracked.has(path)) || existsSync(join(root, path));
/**
 * One accepted leg's evidence reference: `<leg>=<path>[:lines][#fragment]`. The path must exist in the repository and
 * must name the leg as a path segment or a file-name prefix (docs/acceptance/onprem/slo/SLO-001.md, or …/onprem-…),
 * so a pointer cannot be shared across legs by accident. Returns null when valid, else the reason.
 */
function legEvidenceProblem(leg, pointer) {
  if (!pointer) return 'no evidence pointer';
  const path = pointer.replace(/[#:].*$/, '').trim();
  if (!path) return 'no evidence pointer';
  if (/^(\/|\.\.)/.test(path)) return `pointer '${pointer}' leaves the repository`;
  if (!pointerExists(path)) return `pointer '${pointer}' does not resolve to a file in the repository`;
  const segments = path.split('/');
  if (!segments.some((seg) => seg === leg || seg.startsWith(`${leg}-`) || seg.startsWith(`${leg}.`))) return `pointer '${pointer}' does not name the leg ${leg} on its path`;
  return null;
}
function parseCsv(text) { const rows = []; let row = []; let f = ''; let q = false; for (let i = 0; i < text.length; i += 1) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i += 1; } else q = false; } else f += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (ch === '\r') {} else f += ch; } if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row); } return rows; }
const HEADER = 'unit_id,statement,condition,source_rows,primary_source,capability_area,mandatory,profiles,evidence_class,status,legs_verified,package,evidence,remaining_work,notes';
// B4 — the leg vocabulary (Volume 0 ch. 22 / C-042 three modes; PR-65-001 and CAP-DL-01 add disconnected and air-gapped).
const LEGS = ['saas', 'private', 'onprem', 'disconnected', 'air-gapped'];
const STATUSES = new Set(['open', 'verified:local', 'verified:ci', 'verified:all', 'not-applicable']);
const units = []; const problems = [];
if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) {
  const rows = parseCsv(readFileSync(join(dir, f), 'utf8')); const head = rows.shift();
  if (head.join(',') !== HEADER) problems.push(`${f}: header differs`);
  for (const r of rows) { if (r.length === 1 && r[0].trim() === '') continue; if (r.length !== head.length) { problems.push(`${f}: bad row ${r[0]}`); continue; } const o = Object.fromEntries(head.map((c, i) => [c, (r[i] ?? '').trim()])); o.file = f; units.push(o); }
}
// B4 — parse and validate the leg vector and the accepted legs.
//   profiles      : `n/a` or legs in canonical order joined by `|` (e.g. saas|private|onprem, saas|private|onprem|disconnected|air-gapped); `all` is no longer a value.
//   legs_verified : empty, or `<leg>=<pointer to the signed per-leg result>` entries joined by `;` — a subset of profiles.
//   status        : open | verified:local | verified:ci | verified:all | not-applicable.
//   Rules: verified:all ⇔ every leg of profiles is in legs_verified; open ⇒ legs_verified empty; n/a ⇒ legs_verified empty.
for (const u of units) {
  u.legs = u.profiles === 'n/a' ? [] : u.profiles.split('|');
  if (u.profiles !== 'n/a') { const bad = u.legs.filter((l) => !LEGS.includes(l)); if (bad.length || new Set(u.legs).size !== u.legs.length) problems.push(`${u.unit_id}: profiles '${u.profiles}' is not a leg vector`); else if (u.legs.join('|') !== LEGS.filter((l) => u.legs.includes(l)).join('|')) problems.push(`${u.unit_id}: legs out of canonical order`); }
  // Every accepted leg carries a VALIDATED evidence reference; an entry that does not validate is a problem and counts for nothing.
  const entries = u.legs_verified ? u.legs_verified.split(/;\s*/).filter(Boolean) : [];
  u.accepted = [];
  for (const e of entries) {
    const eq = e.indexOf('='); const leg = (eq < 0 ? e : e.slice(0, eq)).trim(); const pointer = eq < 0 ? '' : e.slice(eq + 1).trim();
    if (!LEGS.includes(leg)) { problems.push(`${u.unit_id}: legs_verified names '${leg}', not a leg`); continue; }
    if (!u.legs.includes(leg)) { problems.push(`${u.unit_id}: legs_verified names ${leg} outside profiles`); continue; }
    if (u.accepted.includes(leg)) { problems.push(`${u.unit_id}: leg ${leg} accepted twice`); continue; }
    const why = legEvidenceProblem(leg, pointer);
    if (why !== null) { problems.push(`${u.unit_id}: leg ${leg}: ${why}`); continue; }
    u.accepted.push(leg);
  }
  if (!STATUSES.has(u.status)) problems.push(`${u.unit_id}: status '${u.status}' unknown`);
  // Completion is DERIVED from validated evidence: verified:all is legitimate only when every leg validated.
  u.everyLegValidated = u.legs.length > 0 && u.legs.every((l) => u.accepted.includes(l));
  if (u.status === 'verified:all' && !u.everyLegValidated) problems.push(`${u.unit_id}: verified:all without validated evidence on every leg (${u.legs.filter((l) => !u.accepted.includes(l)).join(',') || 'no legs'})`);
  if (u.everyLegValidated && u.status !== 'verified:all') problems.push(`${u.unit_id}: every leg accepted but status ${u.status}`);
  if ((u.status === 'open' || u.profiles === 'n/a') && entries.length) problems.push(`${u.unit_id}: accepted legs on an open or n/a unit`);
}
const count = (items, key) => { const m = new Map(); for (const i of items) { const k = i[key] || '(empty)'; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort(); };
const covered = new Set(); for (const u of units) for (const s of u.source_rows.split(/;\s*/)) if (s.trim()) covered.add(s.trim());
let totalRows = 0; const rowIds = new Set(); const v8Caps = new Set(); const v9CapRows = [];
for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.csv'))) { const rows = parseCsv(readFileSync(join(reqDir, f), 'utf8')); const head = rows.shift(); for (const r of rows) { if (r.length !== head.length) continue; totalRows += 1; rowIds.add(`${r[1]}:${r[0]}`); if (r[1] === 'V8' && /^CAP-[A-Z]{2}-\d{2}$/.test(r[0])) v8Caps.add(r[0]); if (r[1] === 'V9' && /^CAP-[A-Z]{2}-\d{2}$/.test(r[0])) v9CapRows.push({ id: r[0], cap_alias: head.includes('cap_alias') ? r[head.indexOf('cap_alias')] : undefined }); } }
const coveredKnown = [...covered].filter((c) => rowIds.has(c)).length;
// S7 accounting: a mandatory unit is UNFINISHED unless every leg it applies to is accepted (status verified:all).
// `verified:local` (the author's harness) and `verified:ci` (the hosted chain, fresh database) are artefact verifications on no leg: progress, counted apart.
const unfinished = (u) => u.mandatory === 'yes' && u.status !== 'not-applicable' && !(u.status === 'verified:all' && u.everyLegValidated);
const mandatoryOpen = units.filter(unfinished);
// A unit that CLAIMS verified:all without validated evidence on every leg is unfinished AND a problem (never silently accepted).
const mInconsistent = units.filter((u) => u.mandatory === 'yes' && u.status === 'verified:all' && !u.everyLegValidated);
const byStatus = (s) => units.filter((u) => u.mandatory === 'yes' && u.status === s);
const mOpen = byStatus('open'); const mLocal = byStatus('verified:local'); const mCi = byStatus('verified:ci');
const mAll = units.filter((u) => u.mandatory === 'yes' && u.status === 'verified:all' && u.everyLegValidated);
const mandatoryNA = byStatus('not-applicable');
const withLegs = mandatoryOpen.filter((u) => u.accepted.length > 0);
// B5 — every Volume 9 CAP binding resolves to a Volume 8 capability or a versioned alias.
const aliases = new Map(); // V9 id → { version, targets[] }
if (existsSync(aliasFile)) for (const line of readFileSync(aliasFile, 'utf8').split('\n')) { const m = /^\|\s*(CAP-[A-Z]{2}-\d{2})\s*\|\s*(alias-v\d+|defined)\s*\|\s*([^|]*)\|/.exec(line); if (m) aliases.set(m[1], { kind: m[2], targets: m[3].split('+').map((t) => t.trim()).filter(Boolean) }); }
const capProblems = [];
for (const row of v9CapRows) {
  const a = aliases.get(row.id);
  if (v8Caps.has(row.id)) { if (a && a.kind !== 'defined') capProblems.push(`${row.id}: defined in V8 but aliased`); if (row.cap_alias !== undefined && row.cap_alias !== 'defined') capProblems.push(`${row.id}: cap_alias '${row.cap_alias}' ≠ defined`); continue; }
  if (!a || a.kind === 'defined') { capProblems.push(`${row.id}: cited by V9, not in V8 Appendix A, no alias`); continue; }
  const missing = a.targets.filter((t) => !v8Caps.has(t)); if (missing.length) capProblems.push(`${row.id}: alias target(s) ${missing.join('+')} not in V8 Appendix A`);
  if (row.cap_alias !== undefined && row.cap_alias !== `${a.kind}:${a.targets.join('+')}`) capProblems.push(`${row.id}: cap_alias '${row.cap_alias}' ≠ ${a.kind}:${a.targets.join('+')}`);
}
for (const u of units) for (const m of u.source_rows.matchAll(/V9:(CAP-[A-Z]{2}-\d{2})/g)) if (!v8Caps.has(m[1]) && !aliases.has(m[1])) capProblems.push(`${u.unit_id}: binds ${m[1]} which resolves nowhere`);
const capDefined = v9CapRows.filter((r) => v8Caps.has(r.id)).length; const capAliased = v9CapRows.length - capDefined;
const md = [];
md.push(''); md.push('## Acceptance units (from audit/acceptance-units, generated by audit/summarise-units.mjs)'); md.push('');
md.push(`Units: ${units.length}. Source rows referenced: ${covered.size} (${coveredKnown} resolve to register rows of ${totalRows}). **Mandatory units UNFINISHED for full-profile acceptance: ${mandatoryOpen.length}** = ${mOpen.length} in status open + ${mLocal.length} verified on the author's harness only (verified:local) + ${mCi.length} verified on the hosted chain only (verified:ci)${mInconsistent.length ? ` + ${mInconsistent.length} claiming verified:all without validated evidence on every leg (a problem, never accepted)` : ''}; ${withLegs.length} of them carry at least one accepted profile leg (each with a validated evidence reference). Mandatory units verified on every leg they apply to (verified:all, every leg's evidence validated): ${mAll.length}. (S7: a unit is finished only when every leg of its profile vector carries its own signed evidence; a harness run on any machine is not a leg.) Mandatory units classified not-applicable (reconciled individually, see audit/UNIT_REPAIRS.md): ${mandatoryNA.length}. CAP bindings of Volume 9: ${v9CapRows.length} = ${capDefined} defined in Volume 8 Appendix A + ${capAliased} resolved by alias (${[...aliases.values()].filter((a) => a.kind !== 'defined').length} alias rows in audit/CAP_ALIASES.md); unresolved ${capProblems.length}${capProblems.length ? ' — ' + capProblems.join('; ') : ''}. Problems: ${problems.length}${problems.length ? ' — ' + problems.slice(0, 20).join('; ') : ''}.`);
md.push(''); md.push('| Status | units |'); md.push('|---|---|'); for (const [k, v] of count(units, 'status')) md.push(`| ${k} | ${v} |`);
md.push(''); md.push('| Package | unfinished mandatory units | open | verified:local | verified:ci | with ≥ 1 accepted leg |'); md.push('|---|---|---|---|---|---|');
for (const [k, v] of count(mandatoryOpen, 'package')) { const p = (arr) => arr.filter((u) => (u.package || '(empty)') === k).length; md.push(`| ${k} | ${v} | ${p(mOpen)} | ${p(mLocal)} | ${p(mCi)} | ${p(withLegs)} |`); }
md.push(''); md.push('| Profiles (leg vector) | units | mandatory |'); md.push('|---|---|---|'); for (const [k, v] of count(units, 'profiles')) md.push(`| ${k.replace(/\|/g, "\\|")} | ${v} | ${units.filter((u) => (u.profiles || "(empty)") === k && u.mandatory === "yes").length} |`);
md.push(''); md.push('| Leg | mandatory units applying | accepted (leg evidence) |'); md.push('|---|---|---|'); for (const l of LEGS) md.push(`| ${l} | ${units.filter((u) => u.mandatory === 'yes' && u.legs.includes(l)).length} | ${units.filter((u) => u.mandatory === 'yes' && u.accepted.includes(l)).length} |`);
const allProblems = [...problems, ...capProblems];
const section = md.join('\n') + '\n';
if (allProblems.length > 0) {
  // FAIL CLOSED: the previous valid summary is left as it is; the problems are the output.
  console.error(`REFUSED: ${allProblems.length} problem(s) — the summary was NOT written:`);
  for (const p of allProblems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else if (checkOnly) {
  const current = existsSync(summary) ? readFileSync(summary, 'utf8') : ''; const idx = current.indexOf('\n## Acceptance units');
  const committed = idx >= 0 ? current.slice(idx + 1) : '';
  if (committed.trim() !== section.trim()) { console.error(`CHECK FAILED: the committed acceptance-unit section of ${summary} differs from the units; run the summariser and commit`); process.exitCode = 1; }
  else console.log('check: the committed acceptance-unit section matches the units');
} else {
  let s = existsSync(summary) ? readFileSync(summary, 'utf8') : ''; const idx = s.indexOf('\n## Acceptance units'); if (idx >= 0) s = s.slice(0, idx);
  writeFileSync(summary, s.replace(/\s+$/, '') + '\n' + section);
}
console.log(`units ${units.length}; rows covered ${coveredKnown}/${totalRows}; mandatory unfinished ${mandatoryOpen.length} (open ${mOpen.length} + verified:local ${mLocal.length} + verified:ci ${mCi.length}${mInconsistent.length ? ` + inconsistent ${mInconsistent.length}` : ''}; with accepted legs ${withLegs.length}); verified:all ${mAll.length}; mandatory n/a ${mandatoryNA.length}; legs ${LEGS.map((l) => `${l} ${units.filter((u) => u.mandatory === 'yes' && u.accepted.includes(l)).length}/${units.filter((u) => u.mandatory === 'yes' && u.legs.includes(l)).length}`).join(', ')}; CAP bindings ${v9CapRows.length} (${capDefined} defined + ${capAliased} alias), unresolved ${capProblems.length}; problems ${problems.length}`);
