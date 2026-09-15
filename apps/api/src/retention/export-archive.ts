/**
 * The customer export package's ARCHIVE (CP-6 B13; D2, C4): what a customer downloads and what a destination receives is ONE
 * file — a POSIX ustar tar of the package built in-process, with no dependency, as a PURE FUNCTION of the files and the
 * manifest's own `package.built_at`, so its sha256 — the ARCHIVE DIGEST — is recorded once at the build
 * (`retention.export_packages.archive_digest`) and re-verified on every download and delivery: the tar is rebuilt from the
 * files on disk and compared; a mismatch is refused as an integrity failure, never served.
 *
 * Determinism, entry by entry: `manifest.json` first, then the object files the manifest LISTS (`objects[].bytes.file`) sorted
 * by name; mode 0600, uid/gid 0, uname/gname empty, mtime = the manifest's `package.built_at` in whole seconds for every
 * entry, typeflag '0', no prefix field (a name over 100 bytes is refused — ours are at most 49), two zero blocks at the end.
 * The archive digest is NOT inside the manifest (the archive contains the manifest); it is authenticated by the product's
 * record and by a delivery's `delivery.json`. The customer's verifier (scripts/retention/verify-export.mjs --tar) parses the
 * same layout by the same rules, re-implemented without a dependency.
 */
import { createHash } from 'node:crypto';

/** C12: the download and the delivery refuse a package above this before any file is read; the tar is built in memory under it. */
export const EXPORT_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;

const BLOCK = 512;
const MAGIC = 'ustar\0';
const VERSION = '00';
/** A name a package archive admits: the manifest, or one object's bytes named by its manifest id (the vault's own rule, mirrored). */
const ENTRY_NAME_RE = /^(manifest\.json|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin)$/;

export interface ArchiveEntry { name: string; bytes: Buffer }

/** A refusal of the archive's own rules — the reason names which; the message is for a person. */
export class ExportArchiveError extends Error {
  constructor(readonly reason: 'name' | 'size' | 'manifest' | 'file_missing' | 'malformed', message: string) { super(message); }
}

function octal(value: number, width: number): string {
  // `width` counts the digits before the terminating NUL: 7 for the small fields, 11 for size and mtime.
  if (!Number.isInteger(value) || value < 0 || value >= 8 ** width) throw new ExportArchiveError('size', `a value of ${value} does not fit an octal field of ${width} digits`);
  return `${value.toString(8).padStart(width, '0')}\0`;
}

function header(name: string, size: number, mtimeSeconds: number): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  if (nameBytes.byteLength === 0 || nameBytes.byteLength > 100) throw new ExportArchiveError('name', `an archive entry's name is 1 to 100 bytes (${name.slice(0, 40)} is ${nameBytes.byteLength})`);
  const h = Buffer.alloc(BLOCK, 0);
  nameBytes.copy(h, 0);                                  //   0..100  name
  h.write(octal(0o600, 7), 100, 'ascii');                // 100..108  mode
  h.write(octal(0, 7), 108, 'ascii');                    // 108..116  uid
  h.write(octal(0, 7), 116, 'ascii');                    // 116..124  gid
  h.write(octal(size, 11), 124, 'ascii');                // 124..136  size
  h.write(octal(mtimeSeconds, 11), 136, 'ascii');        // 136..148  mtime
  h.fill(0x20, 148, 156);                                // 148..156  chksum: eight spaces while the sum is taken
  h.write('0', 156, 'ascii');                            // 156       typeflag: a regular file
  //                                                        157..257  linkname: empty
  h.write(MAGIC, 257, 'ascii');                          // 257..263  magic
  h.write(VERSION, 263, 'ascii');                        // 263..265  version
  //                                                        265..297  uname, 297..329 gname: empty; 329..345 devmajor/devminor: zero; 345..500 prefix: empty
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += h[i] as number;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return h;
}

/**
 * D2: the deterministic ustar tar of the entries in the order GIVEN, every entry at the same mtime; two zero blocks close it.
 * A pure function: two builds of the same entries and instant are byte-equal.
 */
export function buildUstar(entries: ArchiveEntry[], mtimeSeconds: number): Buffer {
  if (!Number.isInteger(mtimeSeconds) || mtimeSeconds < 0) throw new ExportArchiveError('manifest', 'the archive instant is a whole number of seconds since the epoch');
  const parts: Buffer[] = [];
  for (const e of entries) {
    parts.push(header(e.name, e.bytes.byteLength, mtimeSeconds));
    parts.push(e.bytes);
    const pad = (BLOCK - (e.bytes.byteLength % BLOCK)) % BLOCK;
    if (pad > 0) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(parts);
}

/**
 * The entries of a ustar archive, in order (the harness's and the verifier's twin): 512-byte headers, the name NUL-terminated
 * within its 100 bytes, the size in octal at 124..136, the typeflag at 156 (a regular file only), the magic at 257, the checksum
 * recomputed; a malformed archive is refused rather than read partially.
 */
export function parseUstar(buf: Buffer): ArchiveEntry[] {
  if (buf.byteLength % BLOCK !== 0) throw new ExportArchiveError('malformed', `the archive is not a whole number of 512-byte blocks (${buf.byteLength} bytes)`);
  const out: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + BLOCK <= buf.byteLength) {
    const h = buf.subarray(offset, offset + BLOCK);
    if (h.every((b) => b === 0)) {
      // The end: two zero blocks and nothing after them.
      const rest = buf.subarray(offset);
      if (rest.byteLength !== BLOCK * 2 || !rest.every((b) => b === 0)) throw new ExportArchiveError('malformed', 'the archive does not end in exactly two zero blocks');
      return out;
    }
    if (h.toString('ascii', 257, 263) !== MAGIC) throw new ExportArchiveError('malformed', `the header at offset ${offset} carries no ustar magic`);
    const declared = h.toString('ascii', 148, 156);
    const stored = parseInt(declared.replace(/[\0 ]+$/, ''), 8);
    let sum = 0;
    for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
    if (!Number.isInteger(stored) || stored !== sum) throw new ExportArchiveError('malformed', `the header checksum at offset ${offset} does not verify`);
    const typeflag = h[156];
    if (typeflag !== 0x30 && typeflag !== 0) throw new ExportArchiveError('malformed', `the entry at offset ${offset} is not a regular file`);
    const nul = h.indexOf(0, 0);
    const name = h.toString('utf8', 0, nul < 0 || nul > 100 ? 100 : nul);
    const sizeField = h.toString('ascii', 124, 136).replace(/[\0 ]+$/, '');
    if (!/^[0-7]{1,11}$/.test(sizeField)) throw new ExportArchiveError('malformed', `the size of ${name} is not octal`);
    const size = parseInt(sizeField, 8);
    const start = offset + BLOCK;
    const end = start + size;
    if (end > buf.byteLength) throw new ExportArchiveError('malformed', `the entry ${name} declares ${size} bytes past the end of the archive`);
    out.push({ name, bytes: Buffer.from(buf.subarray(start, end)) });
    offset = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new ExportArchiveError('malformed', 'the archive ends without its two zero blocks');
}

/**
 * C4: the archive of a package from the MANIFEST's bytes and the object files — the instant is the manifest's own
 * `package.built_at` (never the row's), the entries `manifest.json` first, then the files the manifest LISTS, sorted by name.
 * A listed file the caller did not supply, a supplied file the manifest does not list, or a name outside the package's rule
 * is refused: the archive is the manifest's, not the directory's. `sha256` of the result is the archive digest.
 */
export function archiveOfPackage(manifestBytes: Buffer, files: ArchiveEntry[]): Buffer {
  let manifest: { package?: { built_at?: unknown }; objects?: unknown };
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) as typeof manifest; } catch { throw new ExportArchiveError('manifest', 'the manifest does not parse'); }
  const builtAt = Date.parse(String(manifest?.package?.built_at ?? ''));
  if (Number.isNaN(builtAt)) throw new ExportArchiveError('manifest', 'the manifest names no package.built_at');
  const listed = listedFilesOf(manifest.objects);
  const byName = new Map<string, Buffer>();
  for (const f of files) {
    if (!ENTRY_NAME_RE.test(f.name) || f.name === 'manifest.json') throw new ExportArchiveError('name', `${f.name.slice(0, 60)} is not a package object file`);
    if (byName.has(f.name)) throw new ExportArchiveError('name', `${f.name} is supplied twice`);
    byName.set(f.name, f.bytes);
  }
  const entries: ArchiveEntry[] = [{ name: 'manifest.json', bytes: manifestBytes }];
  for (const name of listed) {
    const bytes = byName.get(name);
    if (bytes === undefined) throw new ExportArchiveError('file_missing', `the manifest lists ${name}, which is not present`);
    entries.push({ name, bytes });
  }
  for (const name of byName.keys()) if (!listed.includes(name)) throw new ExportArchiveError('name', `${name} is present but the manifest does not list it`);
  return buildUstar(entries, Math.floor(builtAt / 1000));
}

/** The object files a manifest lists (`objects[].bytes.file`), each once, sorted by name; a listing outside the package's rule is refused. */
export function listedFilesOf(objects: unknown): string[] {
  if (!Array.isArray(objects)) throw new ExportArchiveError('manifest', 'the manifest lists no objects');
  const names = new Set<string>();
  for (const o of objects) {
    const file = (o as { bytes?: { file?: unknown } } | null)?.bytes?.file;
    if (typeof file !== 'string' || !ENTRY_NAME_RE.test(file) || file === 'manifest.json') throw new ExportArchiveError('manifest', `the manifest lists ${String(file).slice(0, 60)}, which is not a package object file`);
    if (names.has(file)) throw new ExportArchiveError('manifest', `the manifest lists ${file} twice`);
    names.add(file);
  }
  return [...names].sort();
}

export function archiveDigestOf(tar: Buffer): string {
  return createHash('sha256').update(tar).digest('hex');
}
