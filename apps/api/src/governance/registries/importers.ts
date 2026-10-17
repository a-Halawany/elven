/**
 * B107 §RG (0115_b107_x_rg) — THE READ-ONLY IMPORTERS: pure readers of the repository's registers, turned into the rows and links one governed
 * port (governance.rg_import) records per source. They READ the files and never write them; they decide nothing the port decides (the diff,
 * the versions, the retirements are the port's). Every identity is the register's own (ADR-004): a requirement is `<volume>:<row id>`
 * (`V4:ES-01-001` — a row id alone is not unique: OBJ-40, JRN-24 and CAP-AU-* exist in V8 and V9), a chapter `<volume>:chapter:<name>`,
 * a capability its catalogue id (`CAP-FW-07`), a journey `JRN-24`, a feature `F-P7D-25`, a decision `ADR-P0-01`, an engineering exception
 * `EXCEPTIONS.md:EXC-P0-003`, an interface `L1-I01`, a schema `<object_type>@<version>`. A link is declared only between EXACT identities —
 * never by prose similarity (IA-06-003, DP-07-003); an id that resolves to nothing is listed by the port as unresolved.
 *
 * Sources: audit/requirements/*.csv (requirements; their chapters; V8 App A capabilities and App D journeys; the V9 App N / App L bindings),
 * audit/delivery/feature-rowmap.csv (+ FEATURE_TRACKER.csv's titles), DECISIONS.md, EXCEPTIONS.md (the ENGINEERING exception class, read
 * only — §PG governs the in-product exception registry; the C15 scanner dispositions are never imported), objects.interface_register and
 * objects.schema_registry (read through a governed read first). The register's delivery status (impl/verif/release, evidence, remaining
 * work) is carried as `attributes.register` — imported, never edited, and never part of the normative digest.
 */
import { createHash } from 'node:crypto';
import { csvObjects } from './csv.js';

export const PARSER = 'rg-import/1';
export type Lifecycle = 'active' | 'proposed' | 'deprecated' | 'retired';
export interface RegistryItem {
  kind: string; k: string; title: string; authority_class: string; controlling_volume: string | null; lifecycle: Lifecycle;
  attributes: Record<string, unknown>; owner_role: string | null;
}
export interface RegistryLink { from_kind: string; from_key: string; to_kind: string; to_key: string; relation: string; attributes: Record<string, unknown> }
export type SourceKind = 'requirements' | 'rowmap' | 'decisions' | 'exceptions' | 'interfaces' | 'schemas';
export interface SourcePlan {
  source_kind: SourceKind; source_path: string; source_digest: string; parser: string; detail: Record<string, unknown>;
  items: RegistryItem[]; links: RegistryLink[];
}

export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
/** Canonical JSON (sorted keys) — the digest of a database register's rows. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}
const cut = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** THE CONTROL ORDER's class of each volume (0115 §RG.2 governance.rg_volume_class — kept identical). */
export const VOLUME_CLASS: Record<string, string> = {
  V0: 'constitutional', V1: 'doctrine', V2: 'technical_baseline', V3: 'architecture', V4: 'engineering', V5: 'ai', V6: 'infrastructure', V7: 'data',
  V8: 'product', V9: 'experience', V10: 'commercial',
};
/** The volumes whose authority has a PLATFORM role today (D3); every other volume's owner is not declared by the register (stated — H2). */
const VOLUME_OWNER: Record<string, string> = { V8: 'product_authority', V9: 'design_system_authority' };

/** The controlling obligations a requirement's text states (ES-03-002): SHALL / MUST (with NOT) are mandatory; more than one is COMPOUND. */
export function obligations(text: string): { count: number; obligation: string | null; mandatory: boolean } {
  const m = text.match(/\b(shall not|shall|must not|must)\b/gi) ?? [];
  if (m.length > 0) return { count: m.length, obligation: m[0]!.toUpperCase(), mandatory: true };
  const soft = text.match(/\b(should not|should|may)\b/i);
  return { count: 0, obligation: soft === null ? null : soft[1]!.toUpperCase(), mandatory: false };
}

/** The verification method of a row (ES-03-001, ES-67-001): STATED by the specification ("Spec verification class: …"), else EXECUTED as the
 *  register records (passed:harness / ci / browser), else a test in the evidence scope — each with its basis; otherwise none (listed by the
 *  orphan rule RG-V01, never invented). */
export function verificationMethod(row: Record<string, string>): { method: string; basis: string | null } {
  const stated = /Spec verification class: ([^.]+)\./.exec(row['notes'] ?? '');
  if (stated !== null) return { method: stated[1]!.trim(), basis: 'stated' };
  const verif = row['verif_status'] ?? '';
  if (verif.startsWith('passed:')) return { method: `executed (${verif.slice('passed:'.length)})`, basis: 'register_status' };
  if ((row['evidence_scope'] ?? '').split('+').includes('test')) return { method: 'test (evidence scope)', basis: 'evidence_scope' };
  return { method: '', basis: null };
}

/** Requirement-like identities in a text (exact tokens; resolution against the registry decides what they are). */
export function requirementTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:L\d{1,2}-[CI]\d{2}|(?:[A-Z][A-Z0-9]{0,6}-)+\d{2,3}(?:-\d{3})?)\b/g)) out.add(m[0]);
  return [...out];
}

/** id → the volumes that carry it (a row id alone may be ambiguous: it then resolves to EVERY volume carrying it, stated). */
export type RequirementIndex = Map<string, string[]>;
export function requirementIndex(files: Array<{ text: string }>): RequirementIndex {
  const idx: RequirementIndex = new Map();
  for (const f of files) for (const r of csvObjects(f.text)) {
    const id = (r['id'] ?? '').trim(); const vol = (r['volume'] ?? '').trim();
    if (id === '' || vol === '') continue;
    const v = idx.get(id) ?? []; if (!v.includes(vol)) v.push(vol); idx.set(id, v);
  }
  return idx;
}
export function resolveRequirementKeys(tokens: string[], idx: RequirementIndex): { keys: string[]; unresolved: string[] } {
  const keys: string[] = []; const unresolved: string[] = [];
  for (const t of tokens) { const v = idx.get(t); if (v === undefined) unresolved.push(t); else for (const vol of v) keys.push(`${vol}:${t}`); }
  return { keys: [...new Set(keys)].sort(), unresolved };
}

// ───────────────────────── audit/requirements/*.csv ─────────────────────────
const chapterKey = (vol: string, chapter: string) => cut(`${vol}:chapter:${chapter}`, 200);
/** One requirement file → its requirements, its chapters (requirement part_of chapter), the V8 App A capabilities and App D journeys (each
 *  maps_to its row), and the V9 bindings (App N: a capability maps_to its V9 row and the V9 chapters the footer names — a capability the V8
 *  catalogue (`v8Catalogue`) does not define is declared by its V9 row; App L: a journey maps_to its V9 row). */
export function requirementsSource(path: string, text: string, v8Catalogue: ReadonlySet<string> = new Set()): SourcePlan {
  const rows = csvObjects(text);
  const items: RegistryItem[] = []; const links: RegistryLink[] = [];
  const chapters = new Map<string, { vol: string; chapter: string }>();
  for (const r of rows) {
    const id = (r['id'] ?? '').trim(); const vol = (r['volume'] ?? '').trim(); const clause = (r['clause'] ?? '').trim(); const chapter = (r['chapter'] ?? '').trim();
    if (id === '' || vol === '' || VOLUME_CLASS[vol] === undefined) throw new Error(`${path}: a row with id "${id}" and volume "${vol}" is not a registry row`);
    const ob = obligations(clause); const vm = verificationMethod(r);
    const key = `${vol}:${id}`;
    items.push({
      kind: 'requirement', k: key, title: cut(`${id} — ${clause || '(no clause text)'}`, 500), authority_class: VOLUME_CLASS[vol]!, controlling_volume: vol, lifecycle: 'active',
      owner_role: VOLUME_OWNER[vol] ?? null,
      attributes: {
        role: 'requirement', id, volume: vol, chapter, page: r['page'] ?? '', clause, clause_digest: sha256(clause), family_seed: r['family_seed'] ?? '',
        capability_area: r['capability_area'] ?? '', phase_origin: r['phase_origin'] ?? '', package: r['package'] ?? '', source_ref: r['source_ref'] ?? '',
        evidence_scope: r['evidence_scope'] ?? '', cap_alias: r['cap_alias'] ?? '', verification_method: vm.method, verification_basis: vm.basis,
        mandatory: ob.mandatory, obligation: ob.obligation, obligations: ob.count,
        register: { impl_status: r['impl_status'] ?? '', verif_status: r['verif_status'] ?? '', release_status: r['release_status'] ?? '', evidence: r['evidence'] ?? '',
                    remaining_work: r['remaining_work'] ?? '', notes: r['notes'] ?? '' },
      },
    });
    if (chapter !== '') {
      chapters.set(chapterKey(vol, chapter), { vol, chapter });
      links.push({ from_kind: 'requirement', from_key: key, to_kind: 'standard', to_key: chapterKey(vol, chapter), relation: 'part_of', attributes: {} });
    }
    // the product's own catalogues (V8): the capability and the journey are artifacts of their own, each mapped to its defining row
    if (vol === 'V8' && id.startsWith('CAP-') && chapter.startsWith('Appendix A')) {
      items.push({ kind: 'capability', k: id, title: cut(`${id} — ${clause}`, 500), authority_class: 'product', controlling_volume: 'V8', lifecycle: 'active', owner_role: 'product_authority',
                   attributes: { role: 'capability', id, statement: clause } });
      links.push({ from_kind: 'capability', from_key: id, to_kind: 'requirement', to_key: key, relation: 'maps_to', attributes: {} });
    }
    if (vol === 'V8' && id.startsWith('JRN-')) {
      items.push({ kind: 'journey', k: id, title: cut(`${id} — ${clause}`, 500), authority_class: 'product', controlling_volume: 'V8', lifecycle: 'active', owner_role: 'product_authority',
                   attributes: { role: 'journey', id, statement: clause } });
      links.push({ from_kind: 'journey', from_key: id, to_kind: 'requirement', to_key: key, relation: 'maps_to', attributes: {} });
    }
    if (vol === 'V9' && id.startsWith('CAP-')) {
      // a capability V9 binds that the V8 catalogue does not define is an artifact of its own, defined by its V9 row (stated as such)
      if (!v8Catalogue.has(id)) {
        items.push({ kind: 'capability', k: id, title: cut(`${id} — bound by V9 Appendix N (not in the V8 capability catalogue)`, 500), authority_class: 'experience', controlling_volume: 'V9',
                     lifecycle: 'active', owner_role: 'design_system_authority', attributes: { role: 'capability', id, statement: clause, defined_by: 'V9 Appendix N' } });
      }
      links.push({ from_kind: 'capability', from_key: id, to_kind: 'requirement', to_key: key, relation: 'maps_to', attributes: {} });
      const bound = /to chapter\(s\) ([\d,\s]+)/.exec(clause);
      for (const n of (bound?.[1] ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '')) {
        const ch = [...new Set(rows.filter((x) => x['volume'] === 'V9' && (x['chapter'] ?? '').startsWith(`${n} `)).map((x) => x['chapter']!.trim()))];
        for (const c of ch) links.push({ from_kind: 'capability', from_key: id, to_kind: 'standard', to_key: chapterKey('V9', c), relation: 'maps_to', attributes: { chapter_number: n } });
      }
    }
    if (vol === 'V9' && id.startsWith('JRN-')) links.push({ from_kind: 'journey', from_key: id, to_kind: 'requirement', to_key: key, relation: 'maps_to', attributes: {} });
  }
  for (const [k, c] of chapters) {
    items.push({ kind: 'standard', k, title: cut(`${c.vol} ${c.chapter}`, 500), authority_class: VOLUME_CLASS[c.vol]!, controlling_volume: c.vol, lifecycle: 'active',
                 owner_role: VOLUME_OWNER[c.vol] ?? null, attributes: { role: 'chapter', volume: c.vol, chapter: c.chapter } });
  }
  return { source_kind: 'requirements', source_path: path, source_digest: sha256(text), parser: PARSER, detail: { rows: rows.length, chapters: chapters.size }, items, links };
}

// ───────────────────────── audit/delivery/feature-rowmap.csv (+ FEATURE_TRACKER.csv) ─────────────────────────
export function rowmapSource(path: string, rowmapText: string, trackerText: string): SourcePlan {
  const map = csvObjects(rowmapText); const tracker = csvObjects(trackerText);
  const features = new Map<string, Record<string, string>>(tracker.map((t) => [t['feature_id'] ?? '', t]));
  const ids = [...new Set(map.map((r) => (r['feature_id'] ?? '').trim()).filter((x) => x !== ''))].sort();
  const items: RegistryItem[] = ids.map((id) => {
    const t = features.get(id) ?? {};
    return { kind: 'feature', k: id, title: cut(`${id} — ${t['title'] ?? '(no tracker title)'}`, 500), authority_class: 'implementation', controlling_volume: null, lifecycle: 'active', owner_role: null,
             attributes: { role: 'feature', id, title: t['title'] ?? '', package: t['package'] ?? '', volumes: t['volumes'] ?? '', verify_stage: t['verify_stage'] ?? '',
                           ...(t['owner'] !== undefined && t['owner'] !== '' ? { owner_declared: t['owner'] } : {}),
                           register: { status: t['status'] ?? '', stage: t['stage'] ?? '', rows: t['rows'] ?? '', rows_implemented: t['rows_implemented'] ?? '', rows_partial: t['rows_partial'] ?? '',
                                       rows_missing: t['rows_missing'] ?? '' } } };
  });
  const links: RegistryLink[] = map.filter((r) => (r['feature_id'] ?? '') !== '').map((r) => ({
    from_kind: 'feature', from_key: r['feature_id']!.trim(), to_kind: 'requirement', to_key: `${r['volume']!.trim()}:${r['row_id']!.trim()}`, relation: 'implements', attributes: { file: r['file'] ?? '' },
  }));
  const trackerDigest = sha256(trackerText); const rowmapDigest = sha256(rowmapText);
  return { source_kind: 'rowmap', source_path: path, source_digest: sha256(`${rowmapDigest}:${trackerDigest}`), parser: PARSER,
           detail: { rows: map.length, features: ids.length, rowmap_digest: rowmapDigest, tracker: 'audit/delivery/FEATURE_TRACKER.csv', tracker_digest: trackerDigest }, items, links };
}

// ───────────────────────── DECISIONS.md ─────────────────────────
export function decisionsSource(path: string, text: string, idx: RequirementIndex): SourcePlan {
  const table = new Map<string, { title: string; status: string; date: string }>();
  for (const m of text.matchAll(/^\|\s*(ADR-[A-Z0-9]+-\d+)\s*\|\s*(.+?)\s*\|\s*([A-Za-z]+)\s*\|\s*([\d-]+)\s*\|\s*$/gm)) table.set(m[1]!, { title: m[2]!, status: m[3]!, date: m[4]! });
  const sections = new Map<string, string>();
  const heads = [...text.matchAll(/^## (ADR-[A-Z0-9]+-\d+) — (.*)$/gm)];
  heads.forEach((h, n) => {
    const end = n + 1 < heads.length ? heads[n + 1]!.index! : text.length;
    sections.set(h[1]!, text.slice(h.index!, end).replace(/\n---\s*\n[\s\S]*$/, '\n').trim());
  });
  const items: RegistryItem[] = []; const links: RegistryLink[] = []; const unresolved: Record<string, string[]> = {};
  for (const id of [...new Set([...table.keys(), ...sections.keys()])].sort()) {
    const row = table.get(id); const body = sections.get(id) ?? '';
    const anchors = /\*\*Anchors:\*\*\s*(.*)$/m.exec(body)?.[1] ?? '';
    const r = resolveRequirementKeys(requirementTokens(anchors), idx);
    if (r.unresolved.length > 0) unresolved[id] = r.unresolved;
    const status = row?.status ?? 'unstated';
    items.push({ kind: 'decision_record', k: id, title: cut(`${id} — ${row?.title ?? (/^## [^—]+— (.*)$/m.exec(body)?.[1] ?? '(untitled)')}`, 500), authority_class: 'project_decision', controlling_volume: null,
                 lifecycle: status === 'Superseded' ? 'deprecated' : status === 'Proposed' ? 'proposed' : 'active', owner_role: null,
                 attributes: { role: 'decision', id, status, date: row?.date ?? '', anchors, body_digest: sha256(body), unresolved_anchors: r.unresolved } });
    for (const k of r.keys) links.push({ from_kind: 'decision_record', from_key: id, to_kind: 'requirement', to_key: k, relation: 'cites', attributes: { anchor: true } });
  }
  return { source_kind: 'decisions', source_path: path, source_digest: sha256(text), parser: PARSER, detail: { decisions: items.length, unresolved_anchors: unresolved }, items, links };
}

// ───────────────────────── EXCEPTIONS.md (the engineering class — read only) ─────────────────────────
function yamlValue(raw: string): unknown {
  let v = raw.trim();
  if (!v.startsWith('"') && !v.startsWith('[')) v = v.replace(/\s+#.*$/, '').trim();
  if (v.startsWith('"') && v.lastIndexOf('"') > 0) return v.slice(1, v.lastIndexOf('"'));
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((x) => x.trim()).filter((x) => x !== '');
  return v;
}
export function parseExceptionBlock(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}; let listKey: string | null = null;
  for (const line of block.split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item !== null && listKey !== null) { (out[listKey] as string[]).push(item[1]!.trim()); continue; }
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv === null) continue;
    if (kv[2]!.trim() === '') { listKey = kv[1]!; out[listKey] = []; continue; }
    listKey = null; out[kv[1]!] = yamlValue(kv[2]!);
  }
  return out;
}
export function exceptionsSource(path: string, text: string, idx: RequirementIndex): SourcePlan {
  const items: RegistryItem[] = []; const links: RegistryLink[] = [];
  for (const m of text.matchAll(/```yaml\n([\s\S]*?)```/g)) {
    const y = parseExceptionBlock(m[1]!);
    const id = typeof y['exception_id'] === 'string' ? y['exception_id'] : '';
    if (id === '') continue;
    const status = String(y['status'] ?? 'unstated');
    const reqs = Array.isArray(y['requirement_ids']) ? (y['requirement_ids'] as string[]) : [];
    const r = resolveRequirementKeys(reqs, idx);
    items.push({ kind: 'exception', k: `EXCEPTIONS.md:${id}`, title: cut(`${id} — ${String(y['title'] ?? '')}`, 500), authority_class: 'project_exception', controlling_volume: null,
                 lifecycle: status === 'closed' ? 'retired' : status === 'proposed' ? 'proposed' : 'active', owner_role: null,
                 attributes: { role: 'exception', class: 'engineering', id, status, expiry_date: String(y['expiry_date'] ?? ''), owner_declared: String(y['owner'] ?? ''), approver: String(y['approver'] ?? ''),
                               consequence_class: String(y['consequence_class'] ?? ''), fields: y, unresolved_requirements: r.unresolved,
                               note: 'imported read-only from EXCEPTIONS.md (the engineering class); renewing or closing it is the owner\'s; §PG governs the in-product registry' } });
    for (const k of r.keys) links.push({ from_kind: 'exception', from_key: `EXCEPTIONS.md:${id}`, to_kind: 'requirement', to_key: k, relation: 'excepts', attributes: {} });
  }
  return { source_kind: 'exceptions', source_path: path, source_digest: sha256(text), parser: PARSER, detail: { exceptions: items.length }, items, links };
}
/** An engineering exception's expiry as of a day (a DATE is the day it names): expired when the day is after its expiry date. Reported, never
 *  blocking, never closed here (Q6). */
export function exceptionExpired(expiryDate: string, onDay: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) && onDay > expiryDate;
}

// ───────────────────────── objects.interface_register / objects.schema_registry ─────────────────────────
export function interfacesSource(rows: Array<Record<string, unknown>>): SourcePlan {
  const sorted = [...rows].sort((a, b) => String(a['interface_id']).localeCompare(String(b['interface_id'])));
  const items: RegistryItem[] = []; const links: RegistryLink[] = [];
  for (const r of sorted) {
    const id = String(r['interface_id']);
    items.push({ kind: 'interface', k: id, title: cut(`${id} ${String(r['name'])} — ${String(r['contract'])}`, 500), authority_class: 'architecture', controlling_volume: 'V3', lifecycle: 'active', owner_role: null,
                 attributes: { role: 'interface', id, layer: r['layer'], layer_name: r['layer_name'], name: r['name'], style: r['style'], contract: r['contract'], transport: r['transport'],
                               reliability: r['reliability'], failure: r['failure'], requirement: r['requirement'],
                               register: { binding_state: r['binding_state'], bound_to: r['bound_to'], schema_version: r['schema_version'] } } });
    const req = String(r['requirement'] ?? '');
    if (/^V\d{1,2}:.+$/.test(req)) links.push({ from_kind: 'interface', from_key: id, to_kind: 'requirement', to_key: req, relation: 'maps_to', attributes: {} });
  }
  return { source_kind: 'interfaces', source_path: 'objects.interface_register', source_digest: sha256(canonical(sorted)), parser: PARSER, detail: { interfaces: items.length }, items, links };
}
export function schemasSource(rows: Array<Record<string, unknown>>): SourcePlan {
  const sorted = [...rows].sort((a, b) => `${String(a['object_type'])}@${String(a['schema_version'])}`.localeCompare(`${String(b['object_type'])}@${String(b['schema_version'])}`));
  const items: RegistryItem[] = sorted.map((r) => ({
    kind: 'schema', k: `${String(r['object_type'])}@${String(r['schema_version'])}`, title: cut(`${String(r['object_type'])} schema ${String(r['schema_version'])}`, 500), authority_class: 'implementation',
    controlling_volume: null, lifecycle: 'active', owner_role: null,
    attributes: { role: 'schema', object_type: r['object_type'], schema_version: r['schema_version'], compatibility: r['compatibility'], json_schema_digest: sha256(canonical(r['json_schema'])) },
  }));
  return { source_kind: 'schemas', source_path: 'objects.schema_registry', source_digest: sha256(canonical(sorted.map((r) => ({ ...r, json_schema: sha256(canonical(r['json_schema'])) })))),
           parser: PARSER, detail: { schemas: items.length }, items, links: [] };
}

/** The capability ids the V8 App A catalogue defines (so the V9 import declares only the ones V8 does not). */
export function v8CapabilityIds(v08Text: string): Set<string> {
  return new Set(csvObjects(v08Text).filter((r) => r['volume'] === 'V8' && (r['id'] ?? '').startsWith('CAP-') && (r['chapter'] ?? '').startsWith('Appendix A')).map((r) => r['id']!.trim()));
}
