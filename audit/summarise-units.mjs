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
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'acceptance-units');
const reqDir = join(here, 'requirements');
const aliasFile = join(here, 'CAP_ALIASES.md');
const summary = join(here, 'SUMMARY.md');
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
  u.accepted = u.legs_verified ? u.legs_verified.split(/;\s*/).filter(Boolean).map((e) => e.split('=')[0].trim()) : [];
  if (!STATUSES.has(u.status)) problems.push(`${u.unit_id}: status '${u.status}' unknown`);
  const notLeg = u.accepted.filter((l) => !u.legs.includes(l)); if (notLeg.length) problems.push(`${u.unit_id}: legs_verified names ${notLeg.join(',')} outside profiles`);
  if (u.legs_verified && !/=/.test(u.legs_verified)) problems.push(`${u.unit_id}: legs_verified without a per-leg evidence pointer`);
  const every = u.legs.length > 0 && u.legs.every((l) => u.accepted.includes(l));
  if (u.status === 'verified:all' && !every) problems.push(`${u.unit_id}: verified:all without every leg accepted`);
  if (every && u.status !== 'verified:all') problems.push(`${u.unit_id}: every leg accepted but status ${u.status}`);
  if ((u.status === 'open' || u.profiles === 'n/a') && u.accepted.length) problems.push(`${u.unit_id}: accepted legs on an open or n/a unit`);
}
const count = (items, key) => { const m = new Map(); for (const i of items) { const k = i[key] || '(empty)'; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort(); };
const covered = new Set(); for (const u of units) for (const s of u.source_rows.split(/;\s*/)) if (s.trim()) covered.add(s.trim());
let totalRows = 0; const rowIds = new Set(); const v8Caps = new Set(); const v9CapRows = [];
for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.csv'))) { const rows = parseCsv(readFileSync(join(reqDir, f), 'utf8')); const head = rows.shift(); for (const r of rows) { if (r.length !== head.length) continue; totalRows += 1; rowIds.add(`${r[1]}:${r[0]}`); if (r[1] === 'V8' && /^CAP-[A-Z]{2}-\d{2}$/.test(r[0])) v8Caps.add(r[0]); if (r[1] === 'V9' && /^CAP-[A-Z]{2}-\d{2}$/.test(r[0])) v9CapRows.push({ id: r[0], cap_alias: head.includes('cap_alias') ? r[head.indexOf('cap_alias')] : undefined }); } }
const coveredKnown = [...covered].filter((c) => rowIds.has(c)).length;
// S7 accounting: a mandatory unit is UNFINISHED unless every leg it applies to is accepted (status verified:all).
// `verified:local` (the author's harness) and `verified:ci` (the hosted chain, fresh database) are artefact verifications on no leg: progress, counted apart.
const unfinished = (u) => u.mandatory === 'yes' && u.status !== 'not-applicable' && u.status !== 'verified:all';
const mandatoryOpen = units.filter(unfinished);
const byStatus = (s) => units.filter((u) => u.mandatory === 'yes' && u.status === s);
const mOpen = byStatus('open'); const mLocal = byStatus('verified:local'); const mCi = byStatus('verified:ci'); const mAll = byStatus('verified:all');
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
md.push(`Units: ${units.length}. Source rows referenced: ${covered.size} (${coveredKnown} resolve to register rows of ${totalRows}). **Mandatory units UNFINISHED for full-profile acceptance: ${mandatoryOpen.length}** = ${mOpen.length} in status open + ${mLocal.length} verified on the author's harness only (verified:local) + ${mCi.length} verified on the hosted chain only (verified:ci); ${withLegs.length} of them carry at least one accepted profile leg. Mandatory units verified on every leg they apply to (verified:all): ${mAll.length}. (S7: a unit is finished only when every leg of its profile vector carries its own signed evidence; a harness run on any machine is not a leg.) Mandatory units classified not-applicable (reconciled individually, see audit/UNIT_REPAIRS.md): ${mandatoryNA.length}. CAP bindings of Volume 9: ${v9CapRows.length} = ${capDefined} defined in Volume 8 Appendix A + ${capAliased} resolved by alias (${[...aliases.values()].filter((a) => a.kind !== 'defined').length} alias rows in audit/CAP_ALIASES.md); unresolved ${capProblems.length}${capProblems.length ? ' — ' + capProblems.join('; ') : ''}. Problems: ${problems.length}${problems.length ? ' — ' + problems.slice(0, 20).join('; ') : ''}.`);
md.push(''); md.push('| Status | units |'); md.push('|---|---|'); for (const [k, v] of count(units, 'status')) md.push(`| ${k} | ${v} |`);
md.push(''); md.push('| Package | unfinished mandatory units | open | verified:local | verified:ci | with ≥ 1 accepted leg |'); md.push('|---|---|---|---|---|---|');
for (const [k, v] of count(mandatoryOpen, 'package')) { const p = (arr) => arr.filter((u) => (u.package || '(empty)') === k).length; md.push(`| ${k} | ${v} | ${p(mOpen)} | ${p(mLocal)} | ${p(mCi)} | ${p(withLegs)} |`); }
md.push(''); md.push('| Profiles (leg vector) | units | mandatory |'); md.push('|---|---|---|'); for (const [k, v] of count(units, 'profiles')) md.push(`| ${k.replace(/\|/g, "\\|")} | ${v} | ${units.filter((u) => (u.profiles || "(empty)") === k && u.mandatory === "yes").length} |`);
md.push(''); md.push('| Leg | mandatory units applying | accepted (leg evidence) |'); md.push('|---|---|---|'); for (const l of LEGS) md.push(`| ${l} | ${units.filter((u) => u.mandatory === 'yes' && u.legs.includes(l)).length} | ${units.filter((u) => u.mandatory === 'yes' && u.accepted.includes(l)).length} |`);
let s = existsSync(summary) ? readFileSync(summary, 'utf8') : ''; const idx = s.indexOf('\n## Acceptance units'); if (idx >= 0) s = s.slice(0, idx); writeFileSync(summary, s.replace(/\s+$/, '') + '\n' + md.join('\n') + '\n');
console.log(`units ${units.length}; rows covered ${coveredKnown}/${totalRows}; mandatory unfinished ${mandatoryOpen.length} (open ${mOpen.length} + verified:local ${mLocal.length} + verified:ci ${mCi.length}; with accepted legs ${withLegs.length}); verified:all ${mAll.length}; mandatory n/a ${mandatoryNA.length}; legs ${LEGS.map((l) => `${l} ${units.filter((u) => u.mandatory === 'yes' && u.accepted.includes(l)).length}/${units.filter((u) => u.mandatory === 'yes' && u.legs.includes(l)).length}`).join(', ')}; CAP bindings ${v9CapRows.length} (${capDefined} defined + ${capAliased} alias), unresolved ${capProblems.length}; problems ${problems.length}`);
