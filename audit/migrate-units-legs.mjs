#!/usr/bin/env node
/**
 * CP-6 batch B4 — profile legs (one-shot, idempotent; run once at the B4 checkpoint, kept as the record of the rewrite).
 *
 * Rewrites audit/acceptance-units/*.csv mechanically:
 *   1. `profiles` becomes the LEG VECTOR: `all` → `saas|private|onprem`; the units in OFFLINE_UNITS (a capability
 *      with an offline obligation) get `|disconnected|air-gapped` appended; `n/a` stays `n/a`.
 *   2. a 15th column `legs_verified` is inserted after `status`, empty on every row (no leg is accepted today).
 * Nothing else changes: statement, status, evidence, notes and every count by status/mandatory/package are
 * asserted identical before and after. Usage: node migrate-units-legs.mjs [dir]   (dir defaults to acceptance-units)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ? process.argv[2] : join(here, 'acceptance-units');
const OLD_HEADER = 'unit_id,statement,condition,source_rows,primary_source,capability_area,mandatory,profiles,evidence_class,status,package,evidence,remaining_work,notes';
const NEW_HEADER = 'unit_id,statement,condition,source_rows,primary_source,capability_area,mandatory,profiles,evidence_class,status,legs_verified,package,evidence,remaining_work,notes';
export const LEGS = ['saas', 'private', 'onprem', 'disconnected', 'air-gapped'];
const THREE = 'saas|private|onprem';
const FIVE = 'saas|private|onprem|disconnected|air-gapped';
// Units whose statement or condition carries an offline obligation (regex candidates 83 at fb45962, three excluded by
// inspection: AU-EXO-0001 "disconnected feature island", AU-LRN-0006 "evaluate offline", AU-UX-0189 "disconnected screens").
export const OFFLINE_UNITS = new Set(`AU-OBS-0044 AU-OBS-0073 AU-INT-0051 AU-DP-0094 AU-EXO-0053 AU-EXO-0066 AU-UX-0051 AU-UX-0112 AU-UX-0173
AU-UX-0281 AU-UX-0282 AU-UX-0354 AU-UX-0361 AU-UX-0370 AU-INF-0011 AU-UX-0373 AU-UX-0377 AU-UX-0380 AU-INF-0030 AU-INF-0066 AU-INF-0075
AU-INF-0119 AU-INF-0120 AU-INF-0175 AU-INF-0192 AU-UX-0406 AU-INF-0217 AU-INF-0224 AU-INF-0228 AU-GOV-0114 AU-INF-0236 AU-COM-0101
AU-UX-0463 AU-IDP-0127 AU-COM-0126 AU-UX-0464 AU-UX-0465 AU-INF-0251 AU-INF-0261 AU-INF-0262 AU-INF-0264 AU-INF-0274 AU-INF-0276
AU-INF-0281 AU-IDP-0161 AU-INF-0292 AU-INF-0305 AU-INF-0311 AU-INF-0319 AU-GOV-0174 AU-INF-0366 AU-INF-0385 AU-IDP-0227 AU-INF-0446
AU-INF-0490 AU-INF-0493 AU-GOV-0343 AU-IDP-0300 AU-INF-0531 AU-INF-0536 AU-INF-0586 AU-INF-0648 AU-INF-0653 AU-INF-0761 AU-INF-0831
AU-INF-0855 AU-UX-0640 AU-UX-0641 AU-UX-0642 AU-UX-0643 AU-UX-0644 AU-UX-0645 AU-UX-0646 AU-UX-0647 AU-UX-0799 AU-UX-0849 AU-UX-0882
AU-INF-0861 AU-INF-0862 AU-INF-0867`.split(/\s+/).filter(Boolean));

function parseCsv(text) { const rows = []; let row = []; let f = ''; let q = false; for (let i = 0; i < text.length; i += 1) { const ch = text[i]; if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i += 1; } else q = false; } else f += ch; } else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (ch === '\r') {} else f += ch; } if (f.length > 0 || row.length > 0) { row.push(f); rows.push(row); } return rows; }
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const write = (rows) => rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';

const tally = (units) => { const m = new Map(); for (const u of units) { const k = `${u.mandatory}|${u.status}|${u.package}`; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort().map(([k, v]) => `${k}=${v}`).join(';'); };
const before = []; const after = []; let offlineApplied = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  const rows = parseCsv(text);
  if (write(rows) !== text) throw new Error(`${f}: the writer does not round-trip this file byte-for-byte; stop`);
  const head = rows[0].join(',');
  if (head === NEW_HEADER) { console.log(`${f}: already migrated`); continue; }
  if (head !== OLD_HEADER) throw new Error(`${f}: unexpected header`);
  const out = [NEW_HEADER.split(',')];
  for (const r of rows.slice(1)) {
    if (r.length !== 14) throw new Error(`${f}: row ${r[0]} has ${r.length} fields`);
    const o = Object.fromEntries(rows[0].map((c, i) => [c, r[i]]));
    before.push({ mandatory: o.mandatory, status: o.status, package: o.package });
    let profiles;
    if (o.profiles === 'all') { profiles = OFFLINE_UNITS.has(o.unit_id) ? FIVE : THREE; if (profiles === FIVE) offlineApplied += 1; }
    else if (o.profiles === 'n/a') profiles = 'n/a';
    else throw new Error(`${f}: ${o.unit_id} profiles=${o.profiles} is neither all nor n/a`);
    const n = { ...o, profiles, legs_verified: '' };
    after.push({ mandatory: n.mandatory, status: n.status, package: n.package });
    out.push(NEW_HEADER.split(',').map((c) => n[c] ?? ''));
  }
  writeFileSync(join(dir, f), write(out));
  console.log(`${f}: ${out.length - 1} rows rewritten`);
}
if (tally(before) !== tally(after)) throw new Error('counts changed');
const missing = [...OFFLINE_UNITS].filter((id) => !before.length || offlineApplied === 0);
console.log(`units ${before.length}; counts by mandatory|status|package identical; offline legs applied to ${offlineApplied} of ${OFFLINE_UNITS.size} listed units${missing.length && offlineApplied !== OFFLINE_UNITS.size ? ' (some listed ids not found)' : ''}`);
