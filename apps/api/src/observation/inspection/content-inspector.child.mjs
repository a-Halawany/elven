/**
 * CP-6 B40 §IN — ENGINE 1, THE CONTENT INSPECTOR (DESIGN D2, D3, D7; F-P1-03). This file IS the rule set: the inspector's identity on every
 * verdict carries the sha256 of these bytes (content-inspector.ts), so a changed rule is a changed engine.
 *
 * It runs ONLY as a confined child (sandbox/spawn-confined.ts): Node 24's permission model with fs READ of exactly the one item and this
 * script, no fs write, no child process, no worker, no addon, no code generation from strings, a 128 MiB heap and a 5 s wall clock — the
 * environment stripped. It imports node built-ins only (fs read, zlib, crypto for nothing secret). Network denial is NOT a property of the
 * launcher (D3): the inspector opens no socket, and the network-level denial is B103/B109's.
 *
 * Usage: node <flags> content-inspector.child.mjs <item-path>   stdin: {"filename": "...", "declaredType": "..."}
 * Answer (one JSON object on stdout): { engine, version, outcome: clean | detected | incomplete | failed, findings: [{code, class, offset,
 * length, detail}], parse: { format, structure_ok }, detail }. A finding is a CODE, a CLASS, byte OFFSETS and a short detail — NEVER the
 * content it found (D9). Classes: `malware` (an embedded executable, a polyglot, a decompression bomb — the outcome is `detected`),
 * `active_content`, `macro`, `embedded_file`, `hidden_instruction` (the SRC@v4 content_policy rules on these — D7), `limit` (a scan budget
 * reached: the outcome is `incomplete`, never clean), `info` (recorded, no effect).
 *
 * DETERMINISTIC: patterns, structure and byte offsets — no model, no network, no randomness. The same bytes always give the same answer.
 */
import { readFileSync } from 'node:fs';
import { inflateSync, inflateRawSync, gunzipSync } from 'node:zlib';

const ENGINE = 'content-inspector';
const VERSION = '1.0.0';
const LIMITS = Object.freeze({
  maxScanBytes: 64 * 1024 * 1024,        // an item larger than this is scanned in part only → incomplete
  maxInflateTotal: 32 * 1024 * 1024,     // all decompression of one item together
  maxInflatePerStream: 16 * 1024 * 1024, // one stream / entry
  maxRatio: 200,                         // a stream that expands more than this (and past 1 MiB) is a decompression bomb
  bombFloor: 1024 * 1024,
  maxZipEntries: 1024,
  maxFindings: 120,
  maxNesting: 2,
});

/* ── the deterministic hidden-instruction patterns (Q7: no model) ───────────────────────────────────────────────────────────────── */
const INSTRUCTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|the|your)\b[^.\n]{0,24}\b(instructions?|prompts?|rules|directions|context|guidelines)\b/i,
  /\byou are now\b/i,
  /\b(system prompt|developer message|jailbreak)\b/i,
  /\b(mark|treat|classify|rate|record|flag)\b[^.\n]{0,40}\b(as\s+)?(approved|trusted|verified|safe|compliant|cleared)\b/i,
  /\bdo not (tell|reveal|mention|disclose|inform|report)\b/i,
  /\b(new|updated|real) instructions?\s*:/i,
  /\b(assistant|ai|model|llm|chatbot|agent)\b[^.\n]{0,30}\b(must|should|shall)\b[^.\n]{0,40}\b(approve|ignore|reply|respond|output|say)\b/i,
];
const hasInstruction = (s) => INSTRUCTION_PATTERNS.some((re) => re.test(s));
/** Zero-width / invisible characters (a BOM at offset 0 is not one). */
const ZERO_WIDTH = /[​‌‍⁠⁡⁢⁣⁤᠎﻿]/;

/* ── the answer ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const findings = [];
let incompleteBecause = null;
const add = (code, cls, offset, length, detail) => {
  if (findings.length >= LIMITS.maxFindings) { incompleteBecause ??= 'the finding budget was reached'; return; }
  if (findings.some((f) => f.code === code && f.offset === offset)) return;
  const f = { code, class: cls };
  if (Number.isInteger(offset) && offset >= 0) f.offset = offset;
  if (Number.isInteger(length) && length >= 0) f.length = length;
  if (typeof detail === 'string' && detail.length > 0) f.detail = detail.slice(0, 240);
  findings.push(f);
};
let inflated = 0;
/** Bounded decompression: null on a corrupt stream; { bomb: true } when the stream exceeds its cap at an implausible ratio. */
function inflateBounded(kind, data) {
  const room = Math.min(LIMITS.maxInflatePerStream, LIMITS.maxInflateTotal - inflated);
  if (room <= 0) { incompleteBecause ??= 'the decompression budget for this item was spent'; return { skipped: true }; }
  try {
    const fn = kind === 'raw' ? inflateRawSync : kind === 'gzip' ? gunzipSync : inflateSync;
    const out = fn(data, { maxOutputLength: room });
    inflated += out.length;
    if (out.length >= LIMITS.bombFloor && data.length > 0 && out.length / data.length > LIMITS.maxRatio) return { out, bomb: true };
    return { out };
  } catch (e) {
    const code = e && typeof e === 'object' ? e.code : undefined;
    if (code === 'ERR_BUFFER_TOO_LARGE' || (e instanceof RangeError)) {
      // the stream would expand past its cap: a bomb when the ratio is implausible, otherwise the scan is incomplete
      if (data.length > 0 && room / data.length > LIMITS.maxRatio) return { bomb: true };
      incompleteBecause ??= 'a compressed stream exceeds the per-stream decompression cap';
      return { skipped: true };
    }
    return null;
  }
}

/* ── formats ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const startsWith = (b, sig, off = 0) => sig.every((v, i) => b[off + i] === v);
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
function sniff(b) {
  const head = b.subarray(0, Math.min(b.length, 1024)).toString('latin1');
  if (startsWith(b, [0x4d, 0x5a]) && peAt(b, 0)) return 'exe-pe';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return 'exe-elf';
  if (machoAt(b, 0)) return 'exe-macho';
  if (head.includes('%PDF-')) return 'pdf';
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWith(b, OLE2)) return 'ole2';
  if (startsWith(b, [0x1f, 0x8b])) return 'gzip';
  return 'text';
}
function peAt(b, off) {
  if (off + 0x40 > b.length) return false;
  const e = b.readUInt32LE(off + 0x3c);
  return e >= 0x40 && e <= 4096 && off + e + 4 <= b.length && startsWith(b, [0x50, 0x45, 0x00, 0x00], off + e);
}
function machoAt(b, off) {
  if (off + 8 > b.length) return false;
  const m = b.readUInt32BE(off);
  // FEEDFACE / FEEDFACF / CEFAEDFE / CFFAEDFE (CAFEBABE is shared with Java class files — not counted)
  return m === 0xfeedface || m === 0xfeedfacf || m === 0xcefaedfe || m === 0xcffaedfe;
}

/** Executables and polyglots anywhere in the bytes (offset > 0 — the item's own type is decided by sniff). */
function scanEmbeddedExecutables(b, base, where) {
  for (let i = b.indexOf('MZ', 1, 'latin1'); i > 0 && i < b.length; i = b.indexOf('MZ', i + 2, 'latin1')) {
    if (peAt(b, i)) add('exe.embedded_pe', 'malware', base + i, undefined, `a Windows PE executable header inside ${where}`);
  }
  for (let i = b.indexOf('\x7fELF', 1, 'latin1'); i > 0; i = b.indexOf('\x7fELF', i + 4, 'latin1')) {
    if ((b[i + 4] === 1 || b[i + 4] === 2) && (b[i + 5] === 1 || b[i + 5] === 2) && b[i + 6] === 1) {
      add('exe.embedded_elf', 'malware', base + i, undefined, `an ELF executable header inside ${where}`);
    }
  }
}

/* ── text (JSON / XML / CSV / HTML / plain) ─────────────────────────────────────────────────────────────────────────────────────── */
function zeroWidthIn(text, base, codeFor, where) {
  // decoded text offsets are character offsets; a byte offset is recomputed for the first hit (UTF-8)
  const re = new RegExp(ZERO_WIDTH.source, 'g');
  let m; let n = 0; let first = -1;
  while ((m = re.exec(text)) !== null) {
    if (m.index === 0 && m[0] === '﻿') continue;   // a BOM
    n += 1; if (first < 0) first = m.index;
  }
  if (n > 0) add(codeFor, 'hidden_instruction', base + Buffer.byteLength(text.slice(0, first), 'utf8'), undefined, `${n} zero-width / invisible character(s) in ${where}`);
}
/** Text, not binary: no NUL in the first 4 KiB and under 2 % control characters (content-controls.ts's test). */
function probablyText(b) {
  const n = Math.min(b.length, 4096); let control = 0;
  for (let i = 0; i < n; i += 1) { const c = b[i]; if (c === 0) return false; if (c < 0x09 || (c > 0x0d && c < 0x20)) control += 1; }
  return n === 0 || control / n < 0.02;
}
function scanText(b, base, where) {
  if (!probablyText(b)) return;   // binary of an unrecognised format: no text rule applies (it is still scanned for executables)
  const text = b.toString('utf8');
  zeroWidthIn(text, base, 'text.zero_width', where);
  // instruction phrases in text a reader does not see: HTML / XML comments and elements styled invisible
  const hidden = /<!--([\s\S]{0,20000}?)-->|<[^>]{0,400}style\s*=\s*["'][^"']{0,200}(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|color\s*:\s*#?f{3}(f{3})?\b|opacity\s*:\s*0(\.0+)?\b)[^"']{0,200}["'][^>]{0,200}>([\s\S]{0,4000}?)</gi;
  let m;
  while ((m = hidden.exec(text)) !== null) {
    const inner = (m[1] ?? '') + ' ' + (m[5] ?? '');
    if (hasInstruction(inner)) add('text.hidden_instruction', 'hidden_instruction', base + Buffer.byteLength(text.slice(0, m.index), 'utf8'), Buffer.byteLength(m[0], 'utf8'),
      `an instruction phrase in text a reader does not see (${m[1] !== undefined ? 'a comment' : 'an element styled invisible'}) in ${where}`);
  }
}

/* ── PDF ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const PDF_NAMES = new Map([
  ['JavaScript', ['pdf.javascript', 'active_content', 'a JavaScript action']],
  ['JS', ['pdf.js', 'active_content', 'a /JS script entry']],
  ['OpenAction', ['pdf.open_action', 'active_content', 'an action run when the document opens']],
  ['Launch', ['pdf.launch', 'active_content', 'a Launch action (starts an application)']],
  ['AA', ['pdf.additional_actions', 'active_content', 'additional actions (/AA) triggered by viewer events']],
  ['EmbeddedFile', ['pdf.embedded_file', 'embedded_file', 'an embedded file stream']],
  ['EmbeddedFiles', ['pdf.embedded_file', 'embedded_file', 'an embedded files name tree']],
]);
const decodeName = (n) => n.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function scanPdfNames(s, base, where) {
  const re = /\/([A-Za-z0-9#]{1,64})/g; let m;
  while ((m = re.exec(s)) !== null) {
    const name = decodeName(m[1]);
    const hit = PDF_NAMES.get(name);
    if (hit !== undefined) add(hit[0], hit[1], base + m.index, m[0].length, `${hit[2]}${m[1].includes('#') ? ' (name obfuscated with #-escapes)' : ''}${where === '' ? '' : ` ${where}`}`);
  }
}
/** A PDF string literal or hex string, decoded (UTF-16BE when it starts with FEFF). */
function pdfString(tok) {
  let bytes;
  if (tok.startsWith('<')) {
    const hex = tok.slice(1, -1).replace(/\s+/g, '');
    bytes = Buffer.from(hex.length % 2 === 0 ? hex : `${hex}0`, 'hex');
  } else {
    const inner = tok.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[e] ?? String.fromCharCode(parseInt(e, 8)));
    bytes = Buffer.from(inner, 'latin1');
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = ''; for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return bytes.toString('latin1');
}
const PDF_STRING = /\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>/g;
/** Text runs a reader does not see — white fill, invisible render mode (3 Tr), a font size under 2 pt — carrying an instruction phrase. */
function scanContentStream(s, base, where) {
  const ops = /(\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>|\[[^\]]{0,20000}\]|\/[A-Za-z0-9#]+|-?\d*\.?\d+|[A-Za-z'"*]+)/g;
  const stack = []; let st = { white: false, invisible: false, tiny: false };
  const nums = []; let m;
  while ((m = ops.exec(s)) !== null) {
    const t = m[0];
    if (/^-?\d*\.?\d+$/.test(t)) { nums.push(Number(t)); if (nums.length > 8) nums.shift(); continue; }
    if (t.startsWith('/')) { nums.length = 0; continue; }
    if (t.startsWith('(') || t.startsWith('<') || t.startsWith('[')) {
      const text = t.startsWith('[') ? (t.match(PDF_STRING) ?? []).map(pdfString).join('') : pdfString(t);
      if (ZERO_WIDTH.test(text)) add('pdf.text_zero_width', 'hidden_instruction', base + m.index, t.length, `zero-width characters in a text run ${where}`.trim());
      if ((st.white || st.invisible || st.tiny) && hasInstruction(text)) {
        const why = [st.white ? 'white fill' : null, st.invisible ? 'invisible render mode' : null, st.tiny ? 'a font under 2 pt' : null].filter(Boolean).join(', ');
        add('pdf.hidden_text_instruction', 'hidden_instruction', base + m.index, t.length, `an instruction phrase in a text run a reader does not see (${why}) ${where}`.trim());
      }
      nums.length = 0; continue;
    }
    switch (t) {
      case 'q': stack.push({ ...st }); break;
      case 'Q': st = stack.pop() ?? { white: false, invisible: false, tiny: false }; break;
      case 'rg': case 'sc': case 'scn': if (nums.length >= 3) st.white = nums.slice(-3).every((x) => x >= 0.95); break;
      case 'g': if (nums.length >= 1) st.white = nums[nums.length - 1] >= 0.95; break;
      case 'k': if (nums.length >= 4) st.white = nums.slice(-4).every((x) => x <= 0.05); break;
      case 'Tr': if (nums.length >= 1) st.invisible = nums[nums.length - 1] === 3; break;
      case 'Tf': if (nums.length >= 1) st.tiny = Math.abs(nums[nums.length - 1]) < 2; break;
      default: break;
    }
    nums.length = 0;
  }
}
function scanPdf(b, base, depth) {
  const s = b.toString('latin1');
  // the names are read from the document's STRUCTURE — the bytes outside stream bodies (a compressed body is binary: read raw it would
  // spell a name by chance) — and from each inflated stream below
  scanPdfNames(s.replace(/((?<!end)stream\r?\n)([\s\S]*?)(endstream)/g, (_, a, body, c) => a + ' '.repeat(body.length) + c), base, '');
  // the streams: raw ones scanned as they are; Flate ones inflated (bounded) and scanned — names, text runs, executables, nesting
  const streamRe = /(?<!end)stream\r?\n/g; let m; let ok = /startxref\s+\d+/.test(s) && s.includes('%%EOF');
  while ((m = streamRe.exec(s)) !== null) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    if (end < 0) { ok = false; break; }
    const dictStart = s.lastIndexOf('<<', m.index);
    const dict = dictStart >= 0 ? s.slice(dictStart, m.index) : '';
    let body = b.subarray(start, end);
    let where = `in the stream at byte ${base + start}`;
    if (/\/FlateDecode/.test(dict)) {
      const r = inflateBounded('zlib', body);
      if (r === null) { add('pdf.stream_undecodable', 'info', base + start, end - start, 'a compressed stream that does not inflate'); streamRe.lastIndex = end; continue; }
      if (r.bomb) { add('bomb.pdf_flate', 'malware', base + start, end - start, 'a compressed stream that expands past the plausible ratio (a decompression bomb)'); streamRe.lastIndex = end; continue; }
      if (r.skipped) { streamRe.lastIndex = end; continue; }
      body = r.out; where = `inside the compressed stream at byte ${base + start}`;
      scanPdfNames(body.toString('latin1'), base + start, where);
    }
    const bs = body.toString('latin1');
    if (/\b(BT|Tj|TJ)\b/.test(bs)) scanContentStream(bs, base + start, where);
    scanEmbeddedExecutables(body, base + start, `a PDF stream`);
    if (depth < LIMITS.maxNesting && (startsWith(body, [0x50, 0x4b, 0x03, 0x04]) || startsWith(body, OLE2))) inspect(body, base + start, depth + 1, 'an embedded stream');
    streamRe.lastIndex = end;
  }
  // the metadata: /Title /Subject /Keywords /Author /Creator /Producer — zero-width characters or an instruction phrase
  const meta = /\/(Title|Subject|Keywords|Author|Creator|Producer)\s*(\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>)/g;
  while ((m = meta.exec(s)) !== null) {
    const v = pdfString(m[2]);
    if (ZERO_WIDTH.test(v)) add('pdf.metadata_zero_width', 'hidden_instruction', base + m.index, m[0].length, `zero-width characters in the document metadata (/${m[1]})`);
    if (hasInstruction(v)) add('pdf.metadata_instruction', 'hidden_instruction', base + m.index, m[0].length, `an instruction phrase in the document metadata (/${m[1]})`);
  }
  // text after the last end-of-file marker
  const eof = s.lastIndexOf('%%EOF');
  if (eof >= 0) {
    const tail = s.slice(eof + 5);
    if (tail.trim().length > 0) {
      const at = base + eof + 5 + (tail.length - tail.trimStart().length);
      if (hasInstruction(tail) || ZERO_WIDTH.test(Buffer.from(tail, 'latin1').toString('utf8'))) add('pdf.post_eof_instruction', 'hidden_instruction', at, tail.trim().length, 'an instruction phrase or invisible characters after the last %%EOF');
      else add('pdf.post_eof_data', 'info', at, tail.trim().length, 'bytes after the last %%EOF');
    }
  }
  // a PDF that is also an archive (a polyglot)
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd > 0 && b.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) > 0) add('polyglot.pdf_zip', 'malware', base + eocd, 22, 'the PDF is also a ZIP archive (a polyglot)');
  return ok;
}

/* ── ZIP / OOXML ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function zipDirectory(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const entries = [];
  for (let i = 0; i < count && i < LIMITS.maxZipEntries; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10); const csize = buf.readUInt32LE(off + 20); const usize = buf.readUInt32LE(off + 24);
    const nl = buf.readUInt16LE(off + 28); const xl = buf.readUInt16LE(off + 30); const cl = buf.readUInt16LE(off + 32); const lho = buf.readUInt32LE(off + 42);
    entries.push({ name: buf.subarray(off + 46, off + 46 + nl).toString('utf8'), method, csize, usize, lho });
    off += 46 + nl + xl + cl;
  }
  if (count > LIMITS.maxZipEntries) incompleteBecause ??= `the archive declares ${count} entries; ${LIMITS.maxZipEntries} were inspected`;
  return entries;
}
function zipEntryData(buf, e) {
  if (e.lho + 30 > buf.length || buf.readUInt32LE(e.lho) !== 0x04034b50) return null;
  const start = e.lho + 30 + buf.readUInt16LE(e.lho + 26) + buf.readUInt16LE(e.lho + 28);
  return { start, data: buf.subarray(start, start + e.csize) };
}
const EXECUTABLE_ENTRY = /\.(exe|dll|scr|com|msi|bat|cmd|ps1|vbs|vbe|js|jse|wsf|hta|jar|sh|app|lnk)$/i;
/** One w:r run of WordprocessingML: hidden (w:vanish), white (w:color FFFFFF) or tiny (w:sz under 4 half-points). */
function scanWordRuns(xml, base, where) {
  const runRe = /<w:r[ >][\s\S]{0,20000}?<\/w:r>/g; let m;
  while ((m = runRe.exec(xml)) !== null) {
    const r = m[0];
    const vanish = /<w:vanish(\s*\/>|\s+w:val="(true|1|on)")/.test(r);
    const white = /<w:color\s+w:val="(FFFFFF|ffffff)"/.test(r);
    const tiny = /<w:sz\s+w:val="([0-3])"/.test(r);
    if (!(vanish || white || tiny)) continue;
    const text = (r.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
    if (hasInstruction(text)) add('ooxml.hidden_text_instruction', 'hidden_instruction', base, undefined,
      `an instruction phrase in a text run a reader does not see (${[vanish ? 'hidden' : null, white ? 'white' : null, tiny ? 'under 2 pt' : null].filter(Boolean).join(', ')}) in ${where}`);
  }
}
function scanZip(b, base, depth) {
  const entries = zipDirectory(b);
  if (entries === null) { add('zip.directory_unreadable', 'info', base, undefined, 'the ZIP central directory is unreadable'); return false; }
  let macroEnabled = false;
  for (const e of entries) {
    const n = e.name.replace(/\\/g, '/');
    const at = base + e.lho;
    if (/(^|\/)vbaProject\.bin$/i.test(n)) add('ooxml.vba_project', 'macro', at, e.csize, `a VBA macro project (${n})`);
    else if (/(^|\/)vbaData\.xml$/i.test(n)) add('ooxml.vba_data', 'macro', at, e.csize, `macro data (${n})`);
    else if (/(^|\/)activeX\/.+\.bin$/i.test(n)) add('ooxml.activex', 'active_content', at, e.csize, `an ActiveX control binary (${n})`);
    else if (/(^|\/)embeddings\/.+/i.test(n)) add('ooxml.embedded_object', 'embedded_file', at, e.csize, `an embedded object (${n})`);
    if (EXECUTABLE_ENTRY.test(n)) add('zip.executable_entry', 'embedded_file', at, e.csize, `an entry named as an executable or script (${n.split('/').pop()})`);
    if (e.csize > 0 && e.usize / e.csize > LIMITS.maxRatio && e.usize > LIMITS.bombFloor) add('bomb.zip_declared', 'malware', at, e.csize, `an entry declaring a ${Math.round(e.usize / e.csize)}:1 expansion`);
    const d = zipEntryData(b, e);
    if (d === null) continue;
    let body = null;
    if (e.method === 0) body = d.data;
    else if (e.method === 8) {
      const r = inflateBounded('raw', d.data);
      if (r === null) { add('zip.entry_undecodable', 'info', at, e.csize, `an entry that does not inflate (${n.split('/').pop()})`); continue; }
      if (r.bomb) { add('bomb.zip', 'malware', at, e.csize, `an entry that expands past the plausible ratio (${n.split('/').pop()})`); continue; }
      if (r.skipped) continue;
      body = r.out;
    } else { add('zip.entry_method', 'info', at, e.csize, `an entry compressed with method ${e.method} (not inspected)`); incompleteBecause ??= `an entry uses compression method ${e.method}`; continue; }
    if (startsWith(body, OLE2) && !/vbaProject\.bin$/i.test(n)) add('ooxml.ole_stream', 'embedded_file', at, e.csize, `an OLE compound stream (${n.split('/').pop()})`);
    if (startsWith(body, [0x4d, 0x5a]) && peAt(body, 0)) add('exe.entry_pe', 'malware', at, e.csize, `a Windows PE executable inside the archive (${n.split('/').pop()})`);
    if (startsWith(body, [0x7f, 0x45, 0x4c, 0x46])) add('exe.entry_elf', 'malware', at, e.csize, `an ELF executable inside the archive (${n.split('/').pop()})`);
    if (n === '[Content_Types].xml' && /macroEnabled|vbaProject/i.test(body.toString('utf8'))) macroEnabled = true;
    if (/\.(xml|rels|txt|html?|json|csv)$/i.test(n)) {
      const xml = body.toString('utf8');
      if (/^(word|xl|ppt)\//.test(n)) scanWordRuns(xml, at, `the entry ${n.split('/').pop()}`);
      if (/docProps\/(core|app|custom)\.xml$/.test(n) && hasInstruction(xml.replace(/<[^>]+>/g, ' '))) add('ooxml.metadata_instruction', 'hidden_instruction', at, e.csize, 'an instruction phrase in the document properties');
      scanText(body, at, `the entry ${n.split('/').pop()}`);
    }
    if (depth < LIMITS.maxNesting && (startsWith(body, [0x50, 0x4b, 0x03, 0x04]) || body.subarray(0, 1024).toString('latin1').includes('%PDF-'))) inspect(body, at, depth + 1, `the entry ${n.split('/').pop()}`);
    else if (depth >= LIMITS.maxNesting && startsWith(body, [0x50, 0x4b, 0x03, 0x04])) incompleteBecause ??= 'archives nested deeper than the inspector follows';
  }
  if (macroEnabled) add('ooxml.macro_enabled', 'macro', base, undefined, 'the package declares a macro-enabled content type');
  // an archive whose first KiB is also a PDF header (a polyglot)
  if (b.subarray(0, 1024).toString('latin1').includes('%PDF-')) add('polyglot.zip_pdf', 'malware', base, undefined, 'the archive is also a PDF (a polyglot)');
  return true;
}

/* ── OLE2 compound files (legacy Office) ────────────────────────────────────────────────────────────────────────────────────────── */
const utf16 = (s) => Buffer.from(s, 'utf16le');
function scanOle2(b, base) {
  for (const [needle, code, cls, what] of [['_VBA_PROJECT', 'ole2.vba_project', 'macro', 'a VBA project storage'], ['Macros', 'ole2.macros', 'macro', 'a Macros storage'],
                                           ['Ole10Native', 'ole2.ole_native', 'embedded_file', 'an embedded native object'], ['ObjectPool', 'ole2.object_pool', 'embedded_file', 'an embedded object pool']]) {
    const i = b.indexOf(utf16(needle));
    if (i >= 0) add(code, cls, base + i, needle.length * 2, what);
  }
  return true;
}

/* ── the dispatcher ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function inspect(b, base, depth, where) {
  const kind = sniff(b);
  if (kind === 'exe-pe' || kind === 'exe-elf' || kind === 'exe-macho') {
    add(`exe.${kind.slice(4)}`, 'malware', base, undefined, `${where === '' ? 'the item' : where} is an executable (${kind.slice(4)})`);
    return { format: kind, ok: true };
  }
  scanEmbeddedExecutables(b, base, where === '' ? 'the item' : where);
  if (kind === 'pdf') return { format: 'pdf', ok: scanPdf(b, base, depth) };
  if (kind === 'zip') return { format: 'zip', ok: scanZip(b, base, depth) };
  if (kind === 'ole2') return { format: 'ole2', ok: scanOle2(b, base) };
  if (kind === 'gzip') {
    const r = inflateBounded('gzip', b);
    if (r === null) return { format: 'gzip', ok: false };
    if (r.bomb) { add('bomb.gzip', 'malware', base, b.length, 'a gzip stream that expands past the plausible ratio'); return { format: 'gzip', ok: true }; }
    if (r.out !== undefined && depth < LIMITS.maxNesting) inspect(r.out, base, depth + 1, 'the gzip contents');
    return { format: 'gzip', ok: true };
  }
  scanText(b, base, where === '' ? 'the item' : where);
  return { format: 'text', ok: true };
}

async function main() {
  const path = process.argv[2];
  let meta = {};
  try { const chunks = []; for await (const c of process.stdin) chunks.push(c); const raw = Buffer.concat(chunks).toString('utf8'); if (raw.trim() !== '') meta = JSON.parse(raw); } catch { meta = {}; }
  let bytes;
  try { bytes = readFileSync(path); } catch (e) {
    process.stdout.write(JSON.stringify({ engine: ENGINE, version: VERSION, outcome: 'failed', findings: [], parse: null, detail: `the item could not be read (${e && e.code ? e.code : 'error'})` }));
    return;
  }
  let scan = bytes;
  if (bytes.length > LIMITS.maxScanBytes) { scan = bytes.subarray(0, LIMITS.maxScanBytes); incompleteBecause = `the item (${bytes.length} bytes) exceeds the ${LIMITS.maxScanBytes}-byte scan limit; scanned in part`; add('limit.size', 'limit', LIMITS.maxScanBytes, bytes.length - LIMITS.maxScanBytes, 'not scanned past this offset'); }
  let parse;
  try { parse = inspect(scan, 0, 0, ''); } catch (e) {
    process.stdout.write(JSON.stringify({ engine: ENGINE, version: VERSION, outcome: 'failed', findings, parse: null, detail: `the inspector could not complete (${e instanceof Error ? e.name : 'error'})` }));
    return;
  }
  if (incompleteBecause !== null && !findings.some((f) => f.class === 'limit')) add('limit.scan', 'limit', undefined, undefined, incompleteBecause);
  const outcome = findings.some((f) => f.class === 'malware') ? 'detected' : incompleteBecause !== null ? 'incomplete' : 'clean';
  process.stdout.write(JSON.stringify({
    engine: ENGINE, version: VERSION, outcome, findings,
    parse: { format: parse.format, structure_ok: parse.ok === true, declared_type: typeof meta.declaredType === 'string' ? meta.declaredType : null },
    detail: incompleteBecause,
  }));
}
await main();
