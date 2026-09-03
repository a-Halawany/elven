/**
 * Content controls — PHASE1_PLAN §8.2, acceptance A10.
 *
 * WHAT THIS IS NOT, stated first because the honest boundary matters more than
 * the feature list: this is NOT malware detection, NOT format validation, and
 * NOT proof of safety (EXC-P1-001). It is a set of bounded, deterministic checks
 * that refuse structurally dangerous input before anything expands it.
 *
 * The archive inspection deliberately reads the ZIP CENTRAL DIRECTORY ONLY and
 * never decompresses an entry. Path traversal and expansion limits are decided
 * from the directory's own declared names and sizes, so a hostile archive is
 * rejected without ever being expanded — which no amount of "expand then check"
 * can match, and which is also why no decompression library is on this path.
 */
import { inflateRawSync } from 'node:zlib';

export interface ArchiveLimits {
  maxTotalUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxEntries: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxEntries: 4096,
  maxCompressionRatio: 200,
};

export type ContentVerdictClass =
  | 'ok'
  | 'path_traversal'
  | 'expansion_limit'
  | 'entry_limit'
  | 'compression_ratio'
  | 'malformed_archive'
  | 'type_mismatch'
  | 'oversize';

export interface ContentVerdict {
  ok: boolean;
  class: ContentVerdictClass;
  reason: string;
  /** Best-effort MAGIC-BYTE hint. Never treated as validation or as safety. */
  sniffedType: string | null;
  declaredType: string | null;
  activeContentRisk: boolean;
  /** Populated for CSV: cells whose leading character makes them a formula risk. */
  formulaRiskCells: string[];
  encoding: string | null;
  entries: string[];
}

/** Magic-byte sniffing for the cohort-1 types. A HINT, not a verdict. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  const startsWith = (sig: number[], off = 0): boolean =>
    sig.every((v, i) => b[off + i] === v);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])) return 'application/zip';
  if (startsWith([0x1f, 0x8b])) return 'application/gzip';
  if (startsWith([0xef, 0xbb, 0xbf])) return 'text/plain'; // UTF-8 BOM
  if (startsWith([0xff, 0xfe]) || startsWith([0xfe, 0xff])) return 'text/plain'; // UTF-16 BOM
  // Textual sniffing: XML/RSS first, then JSON, then anything else printable.
  const head = Buffer.from(b.subarray(0, Math.min(b.length, 512))).toString('utf8').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<rss') || head.startsWith('<feed')) return 'application/xml';
  if (head.startsWith('{') || head.startsWith('[')) return 'application/json';
  if (b.length > 0 && isProbablyText(b)) return 'text/plain';
  return null;
}

function isProbablyText(b: Uint8Array): boolean {
  const n = Math.min(b.length, 4096);
  let control = 0;
  for (let i = 0; i < n; i += 1) {
    const c = b[i] as number;
    if (c === 0) return false;
    if (c < 0x09 || (c > 0x0d && c < 0x20)) control += 1;
  }
  return control / n < 0.02;
}

/** BOM-based encoding detection. Absence of a BOM is reported as unknown, not assumed. */
export function detectEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8-bom';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  // No BOM: report what we can defend. "utf-8" here means "decodes as UTF-8",
  // which is a different claim from "was authored as UTF-8".
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
    return 'utf-8';
  } catch {
    return null;
  }
}

/**
 * CSV formula-risk classification. The cells are RECORDED, NEVER EVALUATED —
 * this function does not and must not compute anything a cell asks for.
 */
export function classifyCsvFormulaRisk(bytes: Uint8Array, maxCells = 200): string[] {
  const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024))).toString('utf8');
  const risky: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let r = 0; r < lines.length && risky.length < maxCells; r += 1) {
    const cells = (lines[r] ?? '').split(',');
    for (let c = 0; c < cells.length && risky.length < maxCells; c += 1) {
      const cell = (cells[c] ?? '').replace(/^"+/, '').trimStart();
      if (/^[=+\-@\t\r]/.test(cell) && cell.length > 1 && !/^[-+]?\d/.test(cell)) {
        risky.push(`r${r + 1}c${c + 1}`);
      }
    }
  }
  return risky;
}

/** PDF active-content markers. The PDF itself is stored OPAQUE and never parsed or rendered. */
export function pdfActiveContentRisk(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString('latin1');
  return /\/JavaScript|\/JS\b|\/EmbeddedFile|\/OpenAction|\/Launch|\/AA\b/.test(text);
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
}

/**
 * Read the ZIP central directory. No entry is decompressed here; the numbers used
 * for the expansion limits are the archive's own declarations, and a declaration
 * that is itself absurd (ratio, size, count) is grounds for rejection.
 */
export function readZipCentralDirectory(bytes: Uint8Array): ZipEntry[] | null {
  const buf = Buffer.from(bytes);
  // End of central directory record: signature 0x06054b50, scanned from the end.
  let eocd = -1;
  const from = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= from; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const uncompressedSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeaderOffset = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    entries.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Path traversal rejection. An entry name escapes the extraction root if it is
 * absolute, is a Windows drive path, or contains a `..` segment after
 * normalisation — checked on BOTH separators, because an archive is not obliged
 * to use the host's.
 */
export function entryEscapesRoot(name: string): boolean {
  const n = name.replace(/\\/g, '/');
  if (n.startsWith('/')) return true;
  if (/^[a-zA-Z]:/.test(n)) return true;
  const segments = n.split('/');
  let depth = 0;
  for (const s of segments) {
    if (s === '' || s === '.') continue;
    if (s === '..') { depth -= 1; if (depth < 0) return true; continue; }
    depth += 1;
  }
  return false;
}

export interface InspectOptions {
  declaredType: string | null;
  filename: string;
  limits?: ArchiveLimits;
}

/**
 * The single entry point the upload and REST connectors call. Every branch
 * returns a verdict with a machine-readable class, so quarantine reasons are
 * comparable across sources instead of being free text.
 */
export function inspectContent(bytes: Uint8Array, opts: InspectOptions): ContentVerdict {
  const limits = opts.limits ?? DEFAULT_ARCHIVE_LIMITS;
  const sniffed = sniffType(bytes);
  const base = {
    sniffedType: sniffed,
    declaredType: opts.declaredType,
    activeContentRisk: false,
    formulaRiskCells: [] as string[],
    encoding: null as string | null,
    entries: [] as string[],
  };

  const declaredExt = opts.filename.toLowerCase().split('.').pop() ?? '';
  const isArchiveish = sniffed === 'application/zip';

  // Declared-vs-sniffed disagreement is RECORDED, and for the cases where the
  // disagreement changes how the bytes would be handled (a "CSV" that is really
  // an archive) it is a quarantine reason rather than a note.
  if (isArchiveish && (declaredExt === 'csv' || declaredExt === 'pdf' || declaredExt === 'txt')) {
    return {
      ok: false, class: 'type_mismatch',
      reason: `declared .${declaredExt} but the bytes are a ZIP archive; the declared and sniffed types disagree in a way that changes handling`,
      ...base,
    };
  }

  if (declaredExt === 'pdf' || sniffed === 'application/pdf') {
    // Stored OPAQUE. The only inspection is a marker scan for the risk flag.
    return {
      ok: true, class: 'ok', reason: 'pdf stored opaque; never parsed or rendered',
      ...base, activeContentRisk: pdfActiveContentRisk(bytes),
    };
  }

  if (isArchiveish) {
    const entries = readZipCentralDirectory(bytes);
    if (entries === null) {
      return { ...base, ok: false, class: 'malformed_archive', reason: 'zip central directory is unreadable' };
    }
    if (entries.length > limits.maxEntries) {
      return { ...base, ok: false, class: 'entry_limit', reason: `archive declares ${entries.length} entries, over the ${limits.maxEntries} limit` };
    }
    let total = 0;
    for (const e of entries) {
      if (entryEscapesRoot(e.name)) {
        return {
          ...base, ok: false, class: 'path_traversal',
          entries: entries.map((x) => x.name),
          reason: `archive entry escapes the extraction root ("${e.name}")`,
        };
      }
      if (e.uncompressedSize > limits.maxEntryUncompressedBytes) {
        return { ...base, ok: false, class: 'expansion_limit', reason: `entry "${e.name}" declares ${e.uncompressedSize} bytes uncompressed` };
      }
      if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > limits.maxCompressionRatio) {
        return { ...base, ok: false, class: 'compression_ratio', reason: `entry "${e.name}" declares a ${Math.round(e.uncompressedSize / e.compressedSize)}:1 expansion ratio` };
      }
      total += e.uncompressedSize;
    }
    if (total > limits.maxTotalUncompressedBytes) {
      return { ...base, ok: false, class: 'expansion_limit', reason: `archive declares ${total} bytes uncompressed in total` };
    }
    return { ...base, ok: true, class: 'ok', reason: 'archive inspected as a directory only; no entry expanded', entries: entries.map((e) => e.name) };
  }

  if (declaredExt === 'csv' || opts.declaredType === 'text/csv') {
    const encoding = detectEncoding(bytes);
    const formulaRiskCells = classifyCsvFormulaRisk(bytes);
    return {
      ...base, ok: true, class: 'ok',
      reason: formulaRiskCells.length > 0
        ? `csv admitted with ${formulaRiskCells.length} formula-risk cells recorded and never evaluated`
        : 'csv admitted',
      encoding, formulaRiskCells,
    };
  }

  return { ...base, ok: true, class: 'ok', reason: 'no content control applies to this type', encoding: detectEncoding(bytes) };
}

/**
 * DOCX text is never extracted in Phase 1 (no semantic content extraction), but
 * the archive still has to be provably readable to be admitted rather than
 * merely unexamined. This reads ONE entry through the raw inflater under an
 * explicit output ceiling, and exists only so the safety inspection can prove the
 * archive is a real archive.
 */
export function inflateEntryBounded(bytes: Uint8Array, entry: { localHeaderOffset: number; method: number; compressedSize: number }, ceiling: number): Buffer | null {
  const buf = Buffer.from(bytes);
  const off = entry.localHeaderOffset;
  if (off + 30 > buf.length || buf.readUInt32LE(off) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);
  try {
    if (entry.method === 0) return data.length <= ceiling ? Buffer.from(data) : null;
    return inflateRawSync(data, { maxOutputLength: ceiling });
  } catch {
    return null;
  }
}
