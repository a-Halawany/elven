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
import { Readable } from 'node:stream';

/** C12: the download and the delivery refuse a package above this before any file is read; the tar is built in memory under it. */
/** B13 (C4): the ceiling of the IN-MEMORY archive — the JSON download answer (base64) and the in-process rebuild; B15 (D2): the streamed archive has its own. */
export const EXPORT_ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
/**
 * B15 (D2): the ceiling of the STREAMED archive — the stream route, the station write and the https delivery assemble the tar from
 * the files on disk one block at a time, so the archive's size is bounded by the store and the transfer, not by memory: 64 GiB here
 * (the ustar size field admits 8 GiB per ENTRY — an object above it is refused by name, as the octal field is).
 */
export const EXPORT_STREAM_MAX_BYTES = 64 * 1024 * 1024 * 1024;
/**
 * B16 (D4): the ceiling of an INLINE import intake — the tar carried base64 inside the governed payload, decoded before the write
 * (the controller refuses a larger one as 422); a larger package comes in from a transfer station, read entry by entry.
 */
export const IMPORT_INLINE_MAX_BYTES = 64 * 1024 * 1024;

const BLOCK = 512;
const MAGIC = 'ustar\0';
const VERSION = '00';
/** A name a package archive admits: the manifest, the links file (B15) or one object's bytes named by its manifest id (the vault's own rule, mirrored). */
const ENTRY_NAME_RE = /^(manifest\.json|links\.json|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin)$/;
/** B15 (D1): the relationship closure's file — one per package, listed by the manifest's `package.links.file`. */
export const LINKS_FILE = 'links.json';

export interface ArchiveEntry { name: string; bytes: Buffer }
/** B15 (D2): an entry of the STREAMED archive — its size known ahead, its bytes opened when the stream reaches it. */
export interface StreamEntry { name: string; size: number; open: () => Readable }

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
  let manifest: { package?: { built_at?: unknown; links?: unknown }; objects?: unknown };
  try { manifest = JSON.parse(manifestBytes.toString('utf8')) as typeof manifest; } catch { throw new ExportArchiveError('manifest', 'the manifest does not parse'); }
  const builtAt = Date.parse(String(manifest?.package?.built_at ?? ''));
  if (Number.isNaN(builtAt)) throw new ExportArchiveError('manifest', 'the manifest names no package.built_at');
  const listed = listedFilesOf(manifest.objects, manifest);
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

/**
 * The files a manifest lists — the object files (`objects[].bytes.file`) and, for a package with a relationship closure (B15),
 * `package.links.file` — each once, sorted by name; a listing outside the package's rule is refused.
 */
export function listedFilesOf(objects: unknown, manifest?: { package?: { links?: unknown } } | null): string[] {
  if (!Array.isArray(objects)) throw new ExportArchiveError('manifest', 'the manifest lists no objects');
  const names = new Set<string>();
  for (const o of objects) {
    const file = (o as { bytes?: { file?: unknown } } | null)?.bytes?.file;
    if (typeof file !== 'string' || !ENTRY_NAME_RE.test(file) || file === 'manifest.json' || file === LINKS_FILE) throw new ExportArchiveError('manifest', `the manifest lists ${String(file).slice(0, 60)}, which is not a package object file`);
    if (names.has(file)) throw new ExportArchiveError('manifest', `the manifest lists ${file} twice`);
    names.add(file);
  }
  const links = manifest?.package?.links;
  if (links !== undefined && links !== null) {
    const file = (links as { file?: unknown }).file;
    if (file !== LINKS_FILE) throw new ExportArchiveError('manifest', `the manifest's links block names ${String(file).slice(0, 60)}, not ${LINKS_FILE}`);
    names.add(LINKS_FILE);
  }
  return [...names].sort();
}

/** B15 (D2): the exact size of the archive of the given entries — headers, bytes, padding and the two zero blocks. */
export function archiveSizeOf(entries: Array<{ size: number }>): number {
  let total = BLOCK * 2;
  for (const e of entries) total += BLOCK + Math.ceil(e.size / BLOCK) * BLOCK;
  return total;
}

/**
 * B15 (D2): the STREAMED archive — the same bytes `buildUstar` produces for the same entries and instant (the harness holds the two
 * to be equal), assembled one entry at a time from the sources opened as the stream reaches them; the sha256 accumulated as the
 * blocks pass, so the digest is known when the stream ends and never needs the archive in memory. `digest()` resolves when the
 * stream has ended; a source that yields other than its declared size ends the stream with an error (the archive would not be
 * the one the size announced).
 */
export function ustarStream(entries: StreamEntry[], mtimeSeconds: number): { stream: Readable; size: number; digest: () => Promise<string> } {
  if (!Number.isInteger(mtimeSeconds) || mtimeSeconds < 0) throw new ExportArchiveError('manifest', 'the archive instant is a whole number of seconds since the epoch');
  const headers = entries.map((e) => header(e.name, e.size, mtimeSeconds)); // the names and sizes checked before the first byte
  const hash = createHash('sha256');
  let settled: { resolve: (d: string) => void; reject: (e: Error) => void } | null = null;
  let done: string | null = null; let failure: Error | null = null;
  const digest = () => new Promise<string>((resolve, reject) => { if (done !== null) resolve(done); else if (failure !== null) reject(failure); else settled = { resolve, reject }; });
  async function* blocks(): AsyncGenerator<Buffer> {
    try {
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i] as StreamEntry;
        const h = headers[i] as Buffer;
        hash.update(h); yield h;
        let seen = 0;
        for await (const chunk of e.open()) {
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          seen += b.byteLength;
          if (seen > e.size) throw new ExportArchiveError('size', `${e.name} yielded more than its declared ${e.size} bytes`);
          hash.update(b); yield b;
        }
        if (seen !== e.size) throw new ExportArchiveError('size', `${e.name} yielded ${seen} bytes, not its declared ${e.size}`);
        const pad = (BLOCK - (e.size % BLOCK)) % BLOCK;
        if (pad > 0) { const z = Buffer.alloc(pad, 0); hash.update(z); yield z; }
      }
      const end = Buffer.alloc(BLOCK * 2, 0);
      hash.update(end); yield end;
      done = hash.digest('hex');
      settled?.resolve(done);
    } catch (e) {
      failure = e instanceof Error ? e : new Error(String(e));
      settled?.reject(failure);
      throw failure;
    }
  }
  return { stream: Readable.from(blocks()), size: archiveSizeOf(entries), digest };
}

export function archiveDigestOf(tar: Buffer): string {
  return createHash('sha256').update(tar).digest('hex');
}

/**
 * B16 (D4, §3.1): an entry of a SCANNED archive — its name, its declared size and typeflag, and its bytes as an async iterable that
 * yields exactly `size` bytes in order. The body is consumed BEFORE the next entry is yielded: the scan is one pass over the source
 * in constant memory, so a consumer that asks for the next entry without reading a body finds that body drained (read and hashed,
 * never held). `regular` is what the typeflag says ('0' or NUL): only a regular file is a package file.
 */
export interface ScannedEntry { name: string; size: number; typeflag: string; regular: boolean; body: AsyncIterable<Buffer> }

/**
 * B16 (D4): the customer verifier's `scanUstarFile` (scripts/retention/verify-export.mjs) as a STREAM SCANNER, re-implemented without
 * a dependency and by the same rules, so the product reads an inbound package exactly as the customer's tool does: 512-byte headers,
 * the magic `ustar` at 257, the checksum recomputed and accepted unsigned or signed, the size in octal, the prefix joined when the
 * version is `00`, the typeflag at 156 (regular is '0' or NUL — another kind is yielded and left to the caller), an entry that runs past
 * the end of the source, a name that appears twice, a lone zero block, non-zero bytes after the two-block trailer and a source that
 * ends without the trailer, each a MALFORMED archive: one `ExportArchiveError('malformed', …)` thrown from the entries generator (and
 * from `digest()`/`size()`), the scan stopped where it was, nothing invented. The sha256 and the byte count accumulate over EVERY byte
 * read — the headers, the bodies, the padding and the trailer — so an archive of any size digests in constant memory and the digest is
 * known when the entries are exhausted: `digest()` and `size()` resolve after the trailer has been read and the remainder verified.
 */
export function scanUstarStream(source: Readable): { entries: AsyncGenerator<ScannedEntry>; digest: () => Promise<string>; size: () => Promise<number> } {
  const hash = createHash('sha256');
  let total = 0;
  let done: { digest: string; size: number } | null = null; let failure: Error | null = null;
  const waiters: Array<{ resolve: (d: { digest: string; size: number }) => void; reject: (e: Error) => void }> = [];
  const settled = (): Promise<{ digest: string; size: number }> => new Promise((resolve, reject) => {
    if (done !== null) resolve(done); else if (failure !== null) reject(failure); else waiters.push({ resolve, reject });
  });
  const malformed = (message: string): ExportArchiveError => new ExportArchiveError('malformed', message);

  // THE READER: the source's chunks, pulled as needed and never ahead of need; every byte handed out is hashed and counted here, once.
  const iterator = source[Symbol.asyncIterator]();
  let pending: Buffer = Buffer.alloc(0);
  let ended = false;
  const pull = async (): Promise<boolean> => {
    if (ended) return false;
    const next = await iterator.next();
    if (next.done === true) { ended = true; return false; }
    const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value as Uint8Array);
    if (chunk.byteLength === 0) return pull();
    pending = pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);
    return true;
  };
  /** Up to `n` bytes (fewer at the end of the source), hashed and counted; an empty buffer at the end. */
  const take = async (n: number): Promise<Buffer> => {
    while (pending.byteLength < n && (await pull())) { /* filled */ }
    const out = pending.subarray(0, Math.min(n, pending.byteLength));
    pending = pending.subarray(out.byteLength);
    hash.update(out); total += out.byteLength;
    return out;
  };
  /** Exactly `n` bytes, or the truncation error the verifier raises. */
  const exact = async (n: number, what: () => string): Promise<Buffer> => {
    const parts: Buffer[] = []; let got = 0;
    while (got < n) {
      const piece = await take(n - got);
      if (piece.byteLength === 0) throw malformed(what());
      parts.push(Buffer.from(piece)); got += piece.byteLength;
    }
    return parts.length === 1 ? (parts[0] as Buffer) : Buffer.concat(parts);
  };
  const isZero = (b: Buffer): boolean => { for (let i = 0; i < b.byteLength; i += 1) if (b[i] !== 0) return false; return true; };
  const field = (b: Buffer, o: number, n: number): string => { const end = b.indexOf(0, o); const stop = end < 0 || end > o + n ? o + n : end; return b.toString('utf8', o, stop); };
  const octal = (b: Buffer, o: number, n: number, what: string, at: number): number => {
    const t = field(b, o, n).replace(/[\s\0]+$/, '').trimStart();
    if (!/^[0-7]+$/.test(t)) throw malformed(`${what} at offset ${at + o} is not octal (${JSON.stringify(t)})`);
    return parseInt(t, 8);
  };

  let bodyRemaining = 0; let bodyPad = 0; let bodyName = '';
  /** The rest of the current entry's body and its padding, read and hashed; a body the consumer did not finish is drained here. */
  const finishBody = async (): Promise<void> => {
    while (bodyRemaining > 0) {
      const piece = await take(Math.min(bodyRemaining, 4 * 1024 * 1024));
      if (piece.byteLength === 0) throw malformed(`the entry ${JSON.stringify(bodyName)} needs ${bodyRemaining} more byte(s); the archive is truncated`);
      bodyRemaining -= piece.byteLength;
    }
    if (bodyPad > 0) { await exact(bodyPad, () => `the padding of ${JSON.stringify(bodyName)} runs past the end of the archive; the archive is truncated`); bodyPad = 0; }
  };
  async function* body(name: string, size: number): AsyncGenerator<Buffer> {
    while (bodyRemaining > 0) {
      const piece = await take(Math.min(bodyRemaining, 4 * 1024 * 1024));
      if (piece.byteLength === 0) throw malformed(`the entry ${JSON.stringify(name)} needs ${bodyRemaining} more byte(s) of its ${size}; the archive is truncated`);
      bodyRemaining -= piece.byteLength;
      yield Buffer.from(piece);
    }
  }

  async function* entries(): AsyncGenerator<ScannedEntry> {
    const names = new Set<string>();
    let off = 0;
    try {
      for (;;) {
        await finishBody();
        const h = await take(BLOCK);
        if (h.byteLength === 0) {
          if (off === 0) throw malformed('the archive is empty');
          throw malformed(`the archive ends at ${off} byte(s) without the two-block end-of-archive trailer`);
        }
        if (h.byteLength < BLOCK) throw malformed(`the archive is truncated at offset ${off} (${h.byteLength} of ${BLOCK} byte(s) read)`);
        if (isZero(h)) {
          const h2 = await take(BLOCK);
          if (h2.byteLength < BLOCK || !isZero(h2)) throw malformed(`a single zero block at offset ${off} is not the two-block end-of-archive trailer`);
          // Whatever follows the trailer must be zero padding (the verifier's rule); it is read and hashed, never kept.
          for (;;) {
            const rest = await take(4 * 1024 * 1024);
            if (rest.byteLength === 0) break;
            if (!isZero(rest)) throw malformed(`byte(s) after the end-of-archive trailer at offset ${off} are not zero padding`);
          }
          done = { digest: hash.digest('hex'), size: total };
          for (const w of waiters) w.resolve(done);
          waiters.length = 0;
          return;
        }
        const header = Buffer.from(h);
        if (header.toString('latin1', 257, 262) !== 'ustar') throw malformed(`no ustar magic in the header at offset ${off}`);
        const recorded = octal(header, 148, 8, 'the header checksum', off);
        let unsigned = 0; let signed = 0;
        for (let i = 0; i < BLOCK; i += 1) { const b = i >= 148 && i < 156 ? 0x20 : (header[i] as number); unsigned += b; signed += b > 127 ? b - 256 : b; }
        if (recorded !== unsigned && recorded !== signed) throw malformed(`the header checksum at offset ${off} does not add up (recorded ${recorded}, computed ${unsigned})`);
        const version = header.toString('latin1', 263, 265);
        const prefix = version === '00' ? field(header, 345, 155) : '';
        const name = prefix.length > 0 ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100);
        const size = octal(header, 124, 12, `the size of ${JSON.stringify(name)}`, off);
        const typeflag = header[156] as number;
        if (names.has(name)) throw malformed(`the entry ${JSON.stringify(name)} appears twice`);
        names.add(name);
        bodyName = name; bodyRemaining = size; bodyPad = (BLOCK - (size % BLOCK)) % BLOCK;
        const entry: ScannedEntry = { name, size, typeflag: typeflag === 0 ? '\\0' : String.fromCharCode(typeflag), regular: typeflag === 0x30 || typeflag === 0, body: body(name, size) };
        off += BLOCK + size + bodyPad;
        yield entry;
      }
    } catch (e) {
      failure = e instanceof Error ? e : new Error(String(e));
      for (const w of waiters) w.reject(failure);
      waiters.length = 0;
      throw failure;
    }
  }
  return { entries: entries(), digest: () => settled().then((d) => d.digest), size: () => settled().then((d) => d.size) };
}
