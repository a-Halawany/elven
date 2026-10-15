/**
 * B107 §PG — THE REPOSITORY'S EXCEPTION REGISTERS, READ ONLY (DESIGN D8, Q6). Two classes the product SHOWS but never governs:
 *
 *   ENGINEERING — `EXCEPTIONS.md` (the owner's prose register, EXC-P0-* / EXC-P1-*): parsed from its yaml blocks; every entry whose expiry
 *     day has passed while it still reads `open` is REPORTED as expired (EXC-P0-003 expired 2026-09-30) — never renewed, closed or edited
 *     here: renewing or closing it is the owner's act on the file (its entries are frozen for the product).
 *   SUPPLY CHAIN — the C15 scanner dispositions (`scripts/gate/scanner-exclusions.json`, SCX-*), enforced by the C15 gate and bounded by the
 *     owner's STANDING AUTHORIZATION (docs/SCANNER_DISPOSITIONS.md §3.11): listed with their expiry for visibility only — never imported into
 *     the in-product registry, never re-governed, never expired by the product.
 *
 * The in-product registry (governance.ws_exceptions) is THE ONE exception registry for product exceptions; these two are its read-only
 * neighbours. Nothing here writes a file. A missing file is reported `unavailable` (never inferred empty or in date).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface EngineeringException {
  id: string; title: string; owner: string; approver: string; requirement_ids: string[]; expiry_date: string | null; status: string;
  /** status reads open and the expiry day is before today (UTC day). */
  expired: boolean; days_past_expiry: number | null;
}
export interface SupplyChainDisposition {
  id: string; image: string; scan_platform: string; package: string; installed_version: string; severities: string[]; classification: string;
  owner: string; approver: string; approved_on: string | null; expires_on: string | null; expired: boolean;
}
export interface RegisterRead<T> { source: string; available: boolean; digest: string | null; entries: T[]; note: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const unquote = (v: string): string => v.trim().replace(/^["']|["']$/g, '');
/** The value of a top-level `key: value` line, without a trailing `# comment`. */
function scalar(block: string, key: string): string {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block);
  if (m === null) return '';
  const raw = (m[1] ?? '').trim();
  if (raw.startsWith('"') || raw.startsWith("'")) return unquote(raw.replace(/\s+#.*$/, ''));
  return raw.replace(/\s+#.*$/, '').trim();
}
function list(block: string, key: string): string[] {
  const v = scalar(block, key);
  const m = /^\[(.*)\]$/.exec(v);
  return m === null ? (v === '' ? [] : [v]) : (m[1] ?? '').split(',').map((x) => unquote(x)).filter((x) => x.length > 0);
}

/** PURE: the engineering exceptions of an EXCEPTIONS.md text, each judged against `today` (YYYY-MM-DD, UTC). Only yaml blocks carrying an
 *  `exception_id` are entries (the security-correction records are not exceptions). */
export function parseEngineeringExceptions(text: string, today: string): EngineeringException[] {
  if (!DAY.test(today)) throw new Error('today is a day (YYYY-MM-DD)');
  const out: EngineeringException[] = [];
  const blocks = text.split('```yaml').slice(1).map((b) => b.split('```')[0] ?? '');
  for (const b of blocks) {
    const id = scalar(b, 'exception_id');
    if (id === '') continue;
    const expiry = scalar(b, 'expiry_date');
    const status = scalar(b, 'status').toLowerCase();
    const day = DAY.test(expiry) ? expiry : null;
    const expired = day !== null && status === 'open' && day < today;
    out.push({ id, title: scalar(b, 'title'), owner: scalar(b, 'owner'), approver: scalar(b, 'approver'), requirement_ids: list(b, 'requirement_ids'), expiry_date: day, status,
               expired, days_past_expiry: expired && day !== null ? daysBetween(day, today) : null });
  }
  return out;
}

/** PURE: the C15 dispositions of a scanner-exclusions.json text (the current `records`), each with its expiry judged against `today`. */
export function parseSupplyChainDispositions(text: string, today: string): SupplyChainDisposition[] {
  if (!DAY.test(today)) throw new Error('today is a day (YYYY-MM-DD)');
  const doc = JSON.parse(text) as { records?: Array<Record<string, unknown>> };
  return (doc.records ?? []).map((r) => {
    const expires = typeof r['expires_on'] === 'string' && DAY.test(String(r['expires_on'])) ? String(r['expires_on']) : null;
    const image = String(r['image'] ?? '');
    return {
      id: String(r['id'] ?? ''), image: image.includes('@sha256:') ? `${image.split('@sha256:')[0]}@sha256:${(image.split('@sha256:')[1] ?? '').slice(0, 12)}…` : image,
      scan_platform: String(r['scan_platform'] ?? ''), package: String(r['package_name'] ?? ''), installed_version: String(r['installed_version'] ?? ''),
      severities: Array.isArray(r['severities']) ? (r['severities'] as unknown[]).map(String) : [], classification: String(r['classification'] ?? ''),
      owner: String(r['owner'] ?? ''), approver: String(r['approver'] ?? ''), approved_on: typeof r['approved_on'] === 'string' ? String(r['approved_on']) : null,
      expires_on: expires, expired: expires !== null && expires < today,
    };
  });
}

/** The repository root: EYE_REPO_ROOT, else the nearest ancestor of the working directory (or of this module) holding EXCEPTIONS.md. */
export function repositoryRoot(): string | null {
  const env = process.env['EYE_REPO_ROOT'];
  if (typeof env === 'string' && env.length > 0 && existsSync(join(env, 'EXCEPTIONS.md'))) return env;
  for (const start of [process.cwd(), __dirname]) {  // the API compiles to CommonJS: __dirname is this module's directory
    let d = resolve(start);
    for (let i = 0; i < 12; i++) {
      if (existsSync(join(d, 'EXCEPTIONS.md')) && existsSync(join(d, 'scripts', 'gate'))) return d;
      const up = dirname(d); if (up === d) break; d = up;
    }
  }
  return null;
}
const todayUtc = (): string => new Date().toISOString().slice(0, 10);
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** READ (never write) both registers from the repository, judged against today (UTC). */
export function readRepositoryRegisters(today = todayUtc()): { engineering: RegisterRead<EngineeringException>; supply_chain: RegisterRead<SupplyChainDisposition>; read_on: string } {
  const root = repositoryRoot();
  const read = <T>(rel: string, parse: (t: string) => T[], note: string): RegisterRead<T> => {
    if (root === null || !existsSync(join(root, rel))) return { source: rel, available: false, digest: null, entries: [], note: `${rel} is not readable from this process — UNAVAILABLE (never inferred empty or in date)` };
    try {
      const text = readFileSync(join(root, rel), 'utf8');
      return { source: rel, available: true, digest: sha(text), entries: parse(text), note };
    } catch (e) {
      return { source: rel, available: false, digest: null, entries: [], note: `${rel} could not be parsed (${e instanceof Error ? e.message.slice(0, 120) : 'error'}) — UNAVAILABLE` };
    }
  };
  return {
    engineering: read('EXCEPTIONS.md', (t) => parseEngineeringExceptions(t, today),
      'ENGINEERING exceptions — the owner\'s register, read only: an expired entry is REPORTED here and never renewed, closed or edited by the product (the owner\'s act on EXCEPTIONS.md)'),
    supply_chain: read('scripts/gate/scanner-exclusions.json', (t) => parseSupplyChainDispositions(t, today),
      'SUPPLY-CHAIN dispositions (C15 SCX) — enforced by the C15 gate under the owner\'s standing authorization (docs/SCANNER_DISPOSITIONS.md §3.11); shown read only, never governed here'),
    read_on: today,
  };
}
