#!/usr/bin/env node
/**
 * Second pass over audit/requirements/*.csv (register §5, schedule step S4) — the mechanical part:
 *
 *  1. every evidence pointer is resolved against the repository tree at HEAD and at `main`, with
 *     line-range suffixes and globs tolerated; a pointer that resolves nowhere is moved out of
 *     `evidence` into `notes` as UNRESOLVED and can no longer support a `passed:*` verification;
 *  2. `release_status` is derived from where the evidence lives: `branch-only` when any cited path
 *     or migration exists only on this branch, `merged` when every cited path is on `main`, `none`
 *     when nothing is implemented — the first pass's hand-assigned labels are replaced, and the
 *     old value is kept in `notes` when it differs;
 *  3. `passed:*` requires a resolved test, spec, gate or workflow pointer; otherwise `unverified`;
 *  4. rows under package `done` are reassigned: implemented-but-unverified rows get the package
 *     of their capability area and the missing evidence as remaining work; partial rows likewise;
 *     documentary rows (verification not-applicable) become `impl_status = not-applicable` with an
 *     applicability rationale — a source convention is never turned into feature work;
 *  5. `implemented` with empty evidence is not allowed: documentary rows become not-applicable,
 *     the rest `partial` + `unverified`;
 *  6. a lossless source reference is attached: `source_ref` = the extraction file, the page (or
 *     paragraph block) and the line where the clause's opening words occur, so the full clause can
 *     always be read from audit/extraction/text (the CSV's `clause` stays a ≤ 400-character excerpt).
 *
 * The script is idempotent and prints what it changed. It never removes a row.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dir = join(here, 'requirements');
const HEADER = ['id', 'volume', 'chapter', 'page', 'clause', 'family_seed', 'capability_area', 'impl_status', 'verif_status', 'release_status', 'phase_origin', 'package', 'evidence', 'remaining_work', 'notes', 'source_ref', 'evidence_scope'];
const AREA_PACKAGE = { observation: 'P1', intelligence: 'P2', 'memory-graph': 'P3', 'data-platform': 'P3', prediction: 'P4', 'twin-simulation': 'P5', decision: 'P6', 'executive-os': 'P6', agents: 'P7-A', 'learning-evaluation': 'P7-B', marketplace: 'P7-C', 'identity-policy': 'P7-D', infrastructure: 'P7-D', ux: 'P7-E', commercial: 'P7-F', 'governance-docs': 'P7-F' };

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* ignore */ }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// ── the trees ────────────────────────────────────────────────────────────────
const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
const treeHead = new Set(execSync('git ls-files', { cwd: root }).toString().split('\n').filter(Boolean));
const treeMain = new Set(execSync('git ls-tree -r --name-only main', { cwd: root }).toString().split('\n').filter(Boolean));
const migrationsHead = [...treeHead].filter((p) => p.startsWith('apps/api/migrations/')).map((p) => p.slice('apps/api/migrations/'.length));
const PREFIXES = ['', 'apps/api/', 'apps/api/src/', 'apps/api/test/', 'apps/api/test/int/', 'apps/api/test/unit/', 'apps/api/test/gate/', 'apps/api/migrations/', 'apps/web/', 'apps/web/app/', 'apps/web/lib/', 'apps/web/components/', 'packages/', 'packages/contracts/src/', 'packages/contracts/', 'scripts/', 'scripts/gate/', '.github/workflows/', 'e2e/', 'docs/', 'infra/'];

/** Resolve one pointer to a tracked path (or a directory prefix with files under it). Returns { path, scope } or null. */
function resolvePointer(raw) {
  let p = raw.trim().replace(/^`|`$/g, '').replace(/^\[|\]$/g, '');
  // "path: case name", "path:12-34 (note)", "path:20+", "migrations/0028 declared …": keep the path token only
  const m = /^([\w./@*\[\]-]+?\.(?:ts|tsx|sql|mjs|js|json|yml|yaml|md|sh|cjs))(?=[:\s(,]|$)/.exec(p);
  if (m) p = m[1];
  else { p = p.replace(/^([\w./@*\[\]-]+)[:\s(,].*$/s, '$1'); }
  p = p.replace(/[.,;)]+$/, '');
  if (!p || !/[/.]/.test(p)) return null;
  const globbed = p.includes('*');
  const stem = globbed ? p.slice(0, p.indexOf('*')).replace(/\/$/, '') : p;
  const migration = /^(\d{4})(?:[_\w-]*\.sql)?$/.exec(stem.split('/').pop() ?? '');
  const scopeOf = (path) => (treeMain.has(path) ? 'main' : 'branch');
  for (const pre of PREFIXES) {
    const cand = pre + stem;
    if (treeHead.has(cand)) return { path: cand, scope: scopeOf(cand) };
    if (globbed || stem.endsWith('/') || !stem.split('/').pop().includes('.')) {
      const under = [...treeHead].filter((f) => f.startsWith(cand.replace(/\/$/, '') + '/'));
      if (under.length > 0) return { path: cand.replace(/\/$/, '') + '/**', scope: under.every((f) => treeMain.has(f)) ? 'main' : 'branch' };
    }
  }
  if (migration) {
    const hit = migrationsHead.find((m) => m.startsWith(migration[1]));
    if (hit) { const full = 'apps/api/migrations/' + hit; return { path: full, scope: scopeOf(full) }; }
  }
  return null;
}
const isTestPointer = (path) => /(^|\/)(test|tests|e2e)\//.test(path) || /\.(test|spec)\.tsx?$/.test(path) || /\.github\/workflows\//.test(path) || /scripts\/gate\//.test(path) || /scripts\/phase\d\/verify/.test(path);

// ── source references ─────────────────────────────────────────────────────────
const textCache = new Map();
function loadText(vol) {
  const n = Number(vol.slice(1));
  const file = `v${String(n).padStart(2, '0')}.txt`;
  if (!textCache.has(file)) {
    const p = join(here, 'extraction', 'text', file);
    if (!existsSync(p)) { textCache.set(file, null); }
    else {
      const lines = readFileSync(p, 'utf8').split('\n');
      const norm = lines.map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase());
      const markers = []; let cur = null;
      for (let i = 0; i < lines.length; i += 1) { const m = /^=== (PAGE|PARA|SLIDE) (\d+) ===/.exec(lines[i]); if (m) cur = `${m[1].toLowerCase()} ${m[2]}`; markers.push(cur); }
      textCache.set(file, { file, lines, norm, markers, joined: norm.join('\n') });
    }
  }
  return textCache.get(file);
}
function sourceRef(vol, clause) {
  const t = loadText(vol); if (t === null) return '';
  const words = clause.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[…]+$/, '');
  const probe = words.slice(0, 70);
  if (probe.length < 12) return '';
  // exact line containing the opening words, else a window of two lines
  let idx = t.norm.findIndex((l) => l.includes(probe));
  if (idx < 0) {
    const short = probe.slice(0, 40);
    idx = t.norm.findIndex((l, i) => (l + ' ' + (t.norm[i + 1] ?? '')).includes(short));
  }
  if (idx < 0) return '';
  return `${t.file}:${t.markers[idx] ?? 'no-marker'}:L${idx + 1}`;
}

// ── the pass ──────────────────────────────────────────────────────────────────
const stats = { rows: 0, unresolved: 0, releaseChanged: 0, passedDowngraded: 0, doneReassigned: 0, documentary: 0, implNoEvidence: 0, sourceRefs: 0, sourceRefMissing: 0 };
for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) {
  const rows = parseCsv(readFileSync(join(dir, f), 'utf8'));
  const inHeader = rows.shift();
  const out = [];
  for (const r of rows) {
    if (r.length === 1 && r[0].trim() === '') continue;
    const o = Object.fromEntries(inHeader.map((c, i) => [c, (r[i] ?? '').trim()]));
    for (const c of HEADER) if (!(c in o)) o[c] = '';
    stats.rows += 1;
    const note = (msg) => { o.notes = o.notes ? `${o.notes} | ${msg}` : msg; };
    // 1. pointers
    const resolved = []; const unresolved = []; const scopes = new Set();
    for (const raw of o.evidence.split(/;\s*/)) {
      const ptr = raw.trim(); if (!ptr) continue;
      const looksLikePath = /[\w.-]+\/[\w./*-]+|\.(ts|tsx|sql|mjs|js|json|yml|yaml|md|sh|cjs)(\b|$)/.test(ptr);
      if (!looksLikePath) { resolved.push(ptr); continue; }             // a test-case name or a prose pointer, kept as is
      const hit = resolvePointer(ptr);
      if (hit === null) { unresolved.push(ptr); continue; }
      resolved.push(ptr); scopes.add(hit.scope);
      if (isTestPointer(hit.path)) scopes.add('test');
    }
    if (unresolved.length > 0) {
      stats.unresolved += unresolved.length;
      const already = /UNRESOLVED pointer/.test(o.notes);
      if (!already) note(`UNRESOLVED pointer(s) at ${head.slice(0, 7)}: ${unresolved.join('; ')}`);
      o.evidence = resolved.join('; ');
    }
    o.evidence_scope = [...scopes].sort().join('+');
    // 2. release status from the evidence
    const oldRelease = o.release_status;
    let release;
    if (o.impl_status === 'missing') release = 'none';
    else if (scopes.has('branch')) release = 'branch-only';
    else if (scopes.has('main')) release = 'merged';
    else release = o.impl_status === 'not-applicable' ? 'none' : (resolved.length > 0 ? oldRelease || 'none' : 'none');
    if (release !== oldRelease) { stats.releaseChanged += 1; note(`release_status ${oldRelease || '(empty)'} → ${release} from the evidence at ${head.slice(0, 7)}`); o.release_status = release; }
    // 3. passed:* needs a resolved test pointer
    if (o.verif_status.startsWith('passed') && !scopes.has('test')) {
      stats.passedDowngraded += 1;
      note(`${o.verif_status} lacked a resolved test/CI pointer → unverified`);
      o.verif_status = 'unverified';
    }
    // 4/5. done rows and implemented-without-evidence rows
    const documentary = o.verif_status === 'not-applicable';
    if (o.package === 'done') {
      if (documentary) { o.impl_status = 'not-applicable'; o.package = 'not-applicable'; stats.documentary += 1; if (!/applicability/.test(o.notes)) note('applicability: a documentary or normative-language row of the source; no product behaviour is claimed or owed by it'); }
      else if (o.impl_status === 'implemented' && o.verif_status === 'unverified') { o.package = AREA_PACKAGE[o.capability_area] ?? 'P7-F'; if (!o.remaining_work) o.remaining_work = 'verification evidence of the required class (harness, browser, CI or deployment) for the released artefact'; stats.doneReassigned += 1; }
      else if (o.impl_status !== 'implemented') { o.package = AREA_PACKAGE[o.capability_area] ?? 'P7-F'; if (!o.remaining_work) o.remaining_work = 'the obligations the first pass left unnamed under done: decompose in the acceptance units'; stats.doneReassigned += 1; }
    }
    if (o.impl_status === 'implemented' && o.evidence.trim() === '') {
      stats.implNoEvidence += 1;
      if (documentary) { o.impl_status = 'not-applicable'; o.package = 'not-applicable'; if (!/applicability/.test(o.notes)) note('applicability: documentary row; no evidence is owed'); }
      else { o.impl_status = 'partial'; o.verif_status = 'unverified'; note('implemented without evidence → partial/unverified'); }
    }
    if (o.impl_status === 'not-applicable' && o.package === 'done') o.package = 'not-applicable';
    // 6. source reference
    if (!o.source_ref) { o.source_ref = sourceRef(o.volume, o.clause); if (o.source_ref) stats.sourceRefs += 1; else stats.sourceRefMissing += 1; }
    out.push(HEADER.map((c) => esc(o[c] ?? '')).join(','));
  }
  writeFileSync(join(dir, f), HEADER.join(',') + '\n' + out.join('\n') + '\n');
}
console.log(JSON.stringify({ head: head.slice(0, 7), ...stats }, null, 2));
