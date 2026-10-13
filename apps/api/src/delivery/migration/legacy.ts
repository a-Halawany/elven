/**
 * B94 §MG (0114 §MG) — THE LEGACY FILE, READ: the pure, deterministic half of a governed migration's rehearsal (CAP-DL-06). The stored CSV
 * evidence bytes are parsed (RFC 4180: quoted fields, doubled quotes, CRLF/LF, quoted line breaks; a UTF-8 BOM dropped), each mapped column's
 * cell is put through the mapping's transforms (a CLOSED list — the database's `onboarding.mg_transforms()` names the same eight), and every
 * row leaves with its reasons: `missing_key`, `missing_name`, `formula_cell` (a cell beginning =, +, -, @, tab or CR — the intake's own rule,
 * content-controls.ts `classifyCsvFormulaRisk` — RECORDED, NEVER EVALUATED: the cell's value is not used and the row is rejected), `bad_value`
 * (a transform the cell does not satisfy). The database classifies the rows against the target domain and digests them; nothing here decides
 * a disposition the port decides.
 *
 * FORMAT (D7, Q5): CSV ONLY. An xlsx/xls workbook (a ZIP or OLE container) is REFUSED with a clear refusal and a residual — no spreadsheet
 * parser dependency is added in B94; the customer exports the sheet to CSV. Bytes that are not UTF-8 are refused the same way.
 *
 * SUGGESTIONS (UX-66-004): `suggestMapping` proposes a field per header from a synonym table — each marked `suggested: true, approved:
 * false`; a suggestion is never preselected as approved and never becomes a mapping until a human lead PROPOSES it (basis
 * `adopted_suggestions`) and the onboarding authority approves it.
 */
import { classifyCsvFormulaRisk } from '../../observation/connectors/content-controls.js';

export const FIELDS = ['legacy_id', 'name', 'country', 'risk_rating', 'risk_category', 'annual_spend_eur', 'last_review_on'] as const;
export type Field = (typeof FIELDS)[number];
export const TRANSFORMS = ['trim', 'collapse_spaces', 'upper', 'lower', 'null_if_blank', 'iso_country', 'rating_scale', 'decimal', 'date_iso'] as const;
export type Transform = (typeof TRANSFORMS)[number];

export interface MappingColumn { column: string; field: Field | null; transforms: Transform[]; ignore: boolean }
export interface MappingSpec { key_column: string; columns: MappingColumn[]; target_kind?: string; identifier_system?: string }
export interface ParsedRow {
  row_no: number; legacy_id: string | null; name: string | null; values: Record<string, string | null>; reasons: string[]; formula_cells: string[];
}
export interface ParsedLegacy { columns: string[]; rows: ParsedRow[]; formulaCellsRecorded: string[] }

export class LegacyFormatError extends Error {
  constructor(readonly kind: 'format' | 'encoding' | 'input', message: string) { super(message); }
}

/** The container a legacy file arrives in — a workbook is refused (CSV only). */
export function detectWorkbook(bytes: Uint8Array, mediaType: string | null): 'xlsx' | 'xls' | null {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'xlsx';
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'xls';
  const mt = (mediaType ?? '').toLowerCase();
  if (mt.includes('spreadsheetml') || mt.includes('ms-excel')) return mt.includes('spreadsheetml') ? 'xlsx' : 'xls';
  return null;
}

/** RFC 4180 records (header included), each with its 1-based record number (the intake's r<n> when no field spans lines). */
export function parseCsv(text: string): Array<{ line: number; cells: string[] }> {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = []; let cell = ''; let quoted = false; let i = 0; let record = 1;
  const endCell = () => { cells.push(cell); cell = ''; };
  const endRecord = () => { endCell(); if (!(cells.length === 1 && cells[0] === '')) out.push({ line: record, cells }); cells = []; record += 1; };
  while (i < src.length) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i += 1; continue; }
      cell += ch; i += 1; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i += 1; continue; }
    if (ch === ',') { endCell(); i += 1; continue; }
    if (ch === '\r') { endRecord(); i += src[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRecord(); i += 1; continue; }
    cell += ch; i += 1;
  }
  if (quoted) throw new LegacyFormatError('input', 'the CSV ends inside a quoted field');
  if (cell !== '' || cells.length > 0) endRecord();
  return out;
}

/** The intake's formula-risk predicate, applied to one parsed cell (content-controls.ts: recorded, never evaluated). */
export function isFormulaRisk(value: string): boolean {
  const c = value.replace(/^"+/, '').trimStart();
  return /^[=+\-@\t\r]/.test(c) && c.length > 1 && !/^[-+]?\d/.test(c);
}

const RATING: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  '1': 'low', low: 'low', l: 'low', niedrig: 'low', niski: 'low',
  '2': 'medium', medium: 'medium', m: 'medium', mittel: 'medium', 'średni': 'medium', sredni: 'medium',
  '3': 'high', high: 'high', h: 'high', hoch: 'high', wysoki: 'high',
  '4': 'critical', critical: 'critical', c: 'critical', kritisch: 'critical', krytyczny: 'critical',
};

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Apply the transforms in order; a value a transform cannot satisfy is `bad_value` (named by the transform). */
export function applyTransforms(raw: string, transforms: readonly string[]): { ok: true; value: string | null } | { ok: false; transform: string } {
  let v: string | null = raw;
  for (const t of transforms) {
    if (v === null) continue;
    switch (t) {
      case 'trim': v = v.trim(); break;
      case 'collapse_spaces': v = v.replace(/\s+/g, ' ').trim(); break;
      case 'upper': v = v.toUpperCase(); break;
      case 'lower': v = v.toLowerCase(); break;
      case 'null_if_blank': v = v.trim() === '' ? null : v; break;
      case 'iso_country': { const c = v.trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) return { ok: false, transform: t }; v = c; break; }
      case 'rating_scale': { const rated: string | undefined = RATING[v.trim().toLowerCase()]; if (rated === undefined) return { ok: false, transform: t }; v = rated; break; }
      case 'decimal': {
        const c = v.replace(/[\s']/g, '');
        if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(c)) return { ok: false, transform: t };
        const [int, frac] = c.replace(/,/g, '').split('.') as [string, string | undefined];
        v = frac === undefined ? String(BigInt(int)) : `${String(BigInt(int))}.${frac}`;
        break;
      }
      case 'date_iso': {
        const s = v.trim();
        let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); let out: string | null = null;
        if (m !== null) out = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
        else if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s)) !== null) out = isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
        if (out === null) return { ok: false, transform: t };
        v = out; break;
      }
      default: return { ok: false, transform: t };
    }
  }
  return { ok: true, value: v };
}

/**
 * Parse the legacy file under a mapping: the header (the file's columns), one ParsedRow per data record (row_no = its position among the data
 * records, 1-based), the formula-risk cells the intake rule records over the whole file. Ignored columns are never read; unmapped columns are
 * the database's to count (they are in `columns`, not in the mapping).
 */
export function parseLegacy(bytes: Uint8Array, spec: MappingSpec, mediaType: string | null = 'text/csv'): ParsedLegacy {
  const workbook = detectWorkbook(bytes, mediaType);
  if (workbook !== null) {
    throw new LegacyFormatError('format', `the legacy file is an ${workbook} workbook: B94 migrates CSV only (export the sheet to CSV) — no spreadsheet parser is part of the product (residual: xlsx intake)`);
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new LegacyFormatError('encoding', 'the legacy file is not UTF-8 text; export it as UTF-8 CSV'); }
  const records = parseCsv(text);
  if (records.length === 0) throw new LegacyFormatError('input', 'the legacy file is empty');
  const header = (records[0] as { cells: string[] }).cells.map((h) => h.trim());
  const index = new Map<string, number>(); header.forEach((h, i) => { if (!index.has(h)) index.set(h, i); });
  const mapped = spec.columns.filter((c) => !c.ignore && c.field !== null);
  const rows: ParsedRow[] = [];
  let rowNo = 0;
  for (const rec of records.slice(1)) {
    if (rec.cells.every((c) => c.trim() === '')) continue;
    rowNo += 1;
    const values: Record<string, string | null> = {}; const reasons: string[] = []; const formula: string[] = [];
    for (const col of mapped) {
      const at = index.get(col.column);
      const raw = at === undefined ? '' : (rec.cells[at] ?? '');
      if (isFormulaRisk(raw)) {
        const ref = `r${rec.line}c${(at ?? 0) + 1}`;
        formula.push(ref);
        reasons.push(`formula_cell: ${col.column} (${ref}) — recorded, never evaluated`);
        values[col.field as string] = null;
        continue;
      }
      const t = applyTransforms(raw, col.transforms);
      if (!t.ok) { reasons.push(`bad_value: ${col.column} is not a valid ${t.transform}`); values[col.field as string] = null; continue; }
      values[col.field as string] = t.value === null || t.value === '' ? null : t.value;
    }
    const legacyId = values['legacy_id'] ?? null; const name = values['name'] ?? null;
    const about = (col: string | undefined) => (r: string) => col !== undefined && (r.startsWith(`formula_cell: ${col} (`) || r.startsWith(`bad_value: ${col} is`));
    if (legacyId === null && !reasons.some(about(spec.key_column))) reasons.unshift('missing_key: the key column is blank');
    if (name === null && !reasons.some(about(mapped.find((c) => c.field === 'name')?.column))) reasons.push('missing_name: the supplier name is blank');
    rows.push({ row_no: rowNo, legacy_id: legacyId, name, values, reasons, formula_cells: formula });
  }
  return { columns: header, rows, formulaCellsRecorded: classifyCsvFormulaRisk(bytes) };
}

const SYNONYMS: Array<{ field: Field; re: RegExp; transforms: Transform[] }> = [
  { field: 'legacy_id', re: /^(supplier|vendor|lieferant(en)?|dostawc[ay])[\s_-]*(no|nr|number|id|code|key)\.?$|^(lieferanten|kreditor)[-\s]?nr\.?$/i, transforms: ['trim', 'upper'] },
  { field: 'name', re: /^((supplier|vendor|lieferant|dostawca)[\s_-]*)?name$|^(supplier|vendor|lieferant|dostawca)$/i, transforms: ['trim', 'collapse_spaces'] },
  { field: 'country', re: /^(country|land|kraj)([\s_-]*code)?$/i, transforms: ['iso_country'] },
  { field: 'risk_rating', re: /^(risk[\s_-]*(rating|level|class)|risikostufe|ryzyko)$/i, transforms: ['rating_scale'] },
  { field: 'risk_category', re: /^(category|kategorie|kategoria|risk[\s_-]*category)$/i, transforms: ['trim', 'lower', 'null_if_blank'] },
  { field: 'annual_spend_eur', re: /^(annual[\s_-]*spend|jahresvolumen|spend)[\s_-]*(\(?eur\)?)?$/i, transforms: ['null_if_blank', 'decimal'] },
  { field: 'last_review_on', re: /^(last[\s_-]*review(ed)?([\s_-]*(on|date))?|letzte[\s_-]*pr(ü|ue)fung)$/i, transforms: ['null_if_blank', 'date_iso'] },
];

/** Automation's SUGGESTIONS for a header (UX-66-004): each `suggested`, NEVER `approved`; a column with no confident field is left unmapped. */
export function suggestMapping(header: readonly string[]): Array<{ column: string; field: Field | null; transforms: Transform[]; basis: string; suggested: true; approved: false }> {
  const used = new Set<Field>();
  return header.map((raw) => {
    const column = raw.trim();
    const hit = SYNONYMS.find((s) => !used.has(s.field) && s.re.test(column));
    if (hit === undefined) return { column, field: null, transforms: [], basis: 'no confident match — the lead maps or ignores it', suggested: true as const, approved: false as const };
    used.add(hit.field);
    return { column, field: hit.field, transforms: [...hit.transforms], basis: `header "${column}" reads as ${hit.field}`, suggested: true as const, approved: false as const };
  });
}

/** The mapping's validation, mirrored from onboarding.mg_validate_spec (a route refuses early; the PORT is authoritative). */
export function specProblems(spec: MappingSpec): string[] {
  const out: string[] = [];
  if (!Array.isArray(spec.columns) || spec.columns.length === 0) return ['a mapping has at least one column'];
  const cols = new Set<string>(); const fields = new Set<string>();
  for (const c of spec.columns) {
    if (cols.has(c.column)) out.push(`column "${c.column}" is mapped twice`);
    cols.add(c.column);
    if (c.ignore && c.field !== null) out.push(`column "${c.column}" is either ignored or mapped`);
    if (!c.ignore && c.field === null) out.push(`column "${c.column}" maps to a field or is ignored`);
    if (c.field !== null && !(FIELDS as readonly string[]).includes(c.field)) out.push(`${c.field} is not a canonical field`);
    if (c.field !== null && fields.has(c.field)) out.push(`${c.field} is mapped from two columns`);
    if (c.field !== null) fields.add(c.field);
    for (const t of c.transforms ?? []) if (!(TRANSFORMS as readonly string[]).includes(t)) out.push(`${t} is not a transform of the closed list`);
  }
  if (!fields.has('legacy_id') || !fields.has('name')) out.push('a supplier mapping maps legacy_id and name');
  if (!spec.columns.some((c) => c.column === spec.key_column && c.field === 'legacy_id')) out.push('key_column is the column mapped to legacy_id');
  return out;
}
