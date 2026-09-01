/**
 * A minimal DER writer — just enough X.509 to build a Sigstore fixture from scratch.
 *
 * Why not openssl: the SCT signing input is the certificate's own TBS with the SCT extension
 * removed, so the generator has to produce two TBS encodings that differ in exactly one extension.
 * Driving that through a CLI means depending on byte-identical re-encoding across OpenSSL and
 * LibreSSL (macOS ships the latter). Writing the bytes here makes it exact, deterministic and
 * dependency-free.
 */
export const SEQ = 0x30;
export const SET = 0x31;

export function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) b.unshift(v % 256);
  return Buffer.from([0x80 | b.length, ...b]);
}
export function tlv(tag, content) {
  const c = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), len(c.length), c]);
}
export const seq = (...parts) => tlv(SEQ, parts.flat());
export const set = (...parts) => tlv(SET, parts.flat());
export const octet = (b) => tlv(0x04, b);
export const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
export const ia5 = (s) => tlv(0x16, Buffer.from(s, 'utf8'));
export const printable = (s) => tlv(0x13, Buffer.from(s, 'utf8'));
export const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
export const explicit = (n, b) => tlv(0xa0 | n, b);
export const implicitPrim = (n, b) => tlv(0x80 | n, b);

/** Unsigned INTEGER, with the leading zero DER requires when the high bit is set. */
export function int(value) {
  let b = Buffer.isBuffer(value) ? value : Buffer.from(value.toString(16).padStart(2, '0').replace(/^(.(..)*)$/, '0$1'), 'hex');
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && (b[i + 1] & 0x80) === 0) i += 1;
  b = b.subarray(i);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

/** BIT STRING with an explicit count of unused trailing bits. */
export const bitString = (b, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), b]));

export function oid(dotted) {
  const p = dotted.split('.').map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const n of p.slice(2)) {
    const chunk = [];
    let v = n;
    do { chunk.unshift(v & 0x7f); v >>>= 7; } while (v > 0);
    for (let i = 0; i < chunk.length - 1; i += 1) chunk[i] |= 0x80;
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

/** UTCTime, which X.509 uses for years 1950–2049. */
export function utcTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  return tlv(0x17, Buffer.from(
    `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}`
    + `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`, 'ascii'));
}

/** A one-attribute RDN sequence, e.g. CN=…. An empty name is `SEQUENCE {}`, which Fulcio uses. */
export const name = (attrs) => seq(attrs.map(([o, v]) => set(seq(oid(o), printable(v)))));

/** AlgorithmIdentifier for ecdsa-with-SHA256, which carries no parameters. */
export const ecdsaSha256 = () => seq(oid('1.2.840.10045.4.3.2'));

export const extension = (o, critical, value) => seq(
  [oid(o), ...(critical ? [bool(true)] : []), octet(value)],
);

/** Big-endian fixed-width integer, for the TLS-style structures CT uses. */
export function uint(value, bytes) {
  const b = Buffer.alloc(bytes);
  let v = BigInt(value);
  for (let i = bytes - 1; i >= 0; i -= 1) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
