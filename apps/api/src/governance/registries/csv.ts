/**
 * B107 §RG — a strict RFC 4180 CSV reader (quoted fields, doubled quotes, CR LF / LF, embedded newlines). Pure; no dependency. A malformed
 * file (an unterminated quote, a row whose width differs from the header) is REFUSED whole — the importer never guesses a row.
 */
export class CsvError extends Error {}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = []; let field = ''; let i = 0; let quoted = false; let fieldStarted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < s.length) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') {
      if (fieldStarted && field.length > 0) throw new CsvError(`a quote inside an unquoted field (row ${rows.length + 1})`);
      quoted = true; fieldStarted = true; i += 1; continue;
    }
    if (c === ',') { row.push(field); field = ''; fieldStarted = false; i += 1; continue; }
    if (c === '\r' && s[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; fieldStarted = false; i += 2; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; fieldStarted = false; i += 1; continue; }
    field += c; fieldStarted = true; i += 1;
  }
  if (quoted) throw new CsvError('an unterminated quoted field');
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Rows as objects keyed by the header; every row exactly as wide as the header. */
export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ''));
  const header = rows[0];
  if (header === undefined) throw new CsvError('an empty file (no header)');
  return rows.slice(1).map((r, n) => {
    if (r.length !== header.length) throw new CsvError(`row ${n + 2} has ${r.length} fields; the header has ${header.length}`);
    const o: Record<string, string> = {};
    header.forEach((h, k) => { o[h] = r[k] ?? ''; });
    return o;
  });
}
