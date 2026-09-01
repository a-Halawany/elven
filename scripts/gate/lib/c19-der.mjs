/**
 * C19 — A MINIMAL DER READER, FOR THE ONE THING NODE WILL NOT TELL US.
 *
 * Fulcio records the signing identity in X.509 extensions under the 1.3.6.1.4.1.57264 arc: which
 * repository, which ref, which commit, which workflow, which event, which runner environment.
 * Those extensions ARE the identity — the certificate's subject is empty — and Node's
 * `X509Certificate` exposes only a handful of well-known fields, none of them these.
 *
 * So the certificate is parsed far enough to read them, and no further. This is not a general
 * ASN.1 library and must not become one: it walks a Certificate to its extension list, returns the
 * raw bytes for the OIDs asked for, and refuses anything it does not understand rather than
 * guessing. Every length is bounds-checked against the buffer, because this parses attacker-
 * supplied bytes and a parser that reads past its input is a vulnerability, not a bug.
 */

/** One DER tag-length-value, plus where the next one starts. */
export function readTLV(buf, offset = 0) {
  if (offset + 2 > buf.length) throw new Error('c19-der: truncated before a tag');
  const tag = buf[offset];
  let i = offset + 1;
  let length = buf[i];
  i += 1;
  if (length === 0x80) throw new Error('c19-der: indefinite length is not valid DER');
  if ((length & 0x80) !== 0) {
    const n = length & 0x7f;
    if (n === 0 || n > 4) throw new Error(`c19-der: unsupported length-of-length ${n}`);
    if (i + n > buf.length) throw new Error('c19-der: truncated length');
    length = 0;
    for (let k = 0; k < n; k += 1) length = (length << 8) | buf[i + k];
    i += n;
  }
  if (length < 0 || i + length > buf.length) throw new Error('c19-der: length runs past the buffer');
  return { tag, start: i, length, value: buf.subarray(i, i + length), end: i + length };
}

/** Every immediate child of a constructed element. */
export function children(buf) {
  const out = [];
  let off = 0;
  while (off < buf.length) {
    const t = readTLV(buf, off);
    out.push(t);
    off = t.end;
  }
  return out;
}

/** Decode an OBJECT IDENTIFIER's contents into dotted form. */
export function decodeOid(value) {
  if (value.length === 0) throw new Error('c19-der: empty OID');
  const parts = [Math.floor(value[0] / 40), value[0] % 40];
  let acc = 0;
  for (let i = 1; i < value.length; i += 1) {
    acc = acc * 128 + (value[i] & 0x7f);
    if ((value[i] & 0x80) === 0) { parts.push(acc); acc = 0; }
  }
  return parts.join('.');
}

const SEQUENCE = 0x30;
const CONTEXT_3 = 0xa3;      // [3] EXPLICIT — the extensions member of a TBSCertificate
const OID = 0x06;
const BOOLEAN = 0x01;
const OCTET_STRING = 0x04;
const UTF8_STRING = 0x0c;

/**
 * Every extension in an X.509 certificate, keyed by dotted OID, with its raw contents.
 *
 * The walk is explicit rather than a search for the first `[3]`: a TBSCertificate's optional
 * members are all context-tagged, and pattern-matching on the tag alone would happily read
 * `issuerUniqueID` as an extension list on a certificate shaped to encourage that.
 */
export function certificateExtensions(der) {
  const cert = readTLV(der, 0);
  if (cert.tag !== SEQUENCE) throw new Error('c19-der: not a Certificate');
  const [tbs] = children(cert.value);
  if (tbs === undefined || tbs.tag !== SEQUENCE) throw new Error('c19-der: no TBSCertificate');

  const fields = children(tbs.value);
  // TBSCertificate ::= SEQUENCE { [0] version, serialNumber, signature, issuer, validity,
  //                               subject, subjectPublicKeyInfo, [1] issuerUID, [2] subjectUID,
  //                               [3] extensions }
  const extsField = fields.find((f) => f.tag === CONTEXT_3);
  if (extsField === undefined) return new Map();
  const [extSeq] = children(extsField.value);
  if (extSeq === undefined || extSeq.tag !== SEQUENCE) throw new Error('c19-der: malformed extensions');

  const out = new Map();
  for (const ext of children(extSeq.value)) {
    if (ext.tag !== SEQUENCE) throw new Error('c19-der: malformed extension');
    const parts = children(ext.value);
    if (parts.length < 2 || parts[0].tag !== OID) throw new Error('c19-der: extension without an OID');
    const oid = decodeOid(parts[0].value);
    const critical = parts[1].tag === BOOLEAN ? parts[1].value[0] !== 0 : false;
    const valuePart = parts[parts.length - 1];
    if (valuePart.tag !== OCTET_STRING) throw new Error(`c19-der: extension ${oid} has no value`);
    out.set(oid, { critical, raw: valuePart.value });
  }
  return out;
}

/**
 * Fulcio's V2 identity extensions wrap their text in a DER UTF8String inside the extension's
 * OCTET STRING; the older V1 ones store the text directly. Both are accepted, but the wrapper is
 * REQUIRED to be exactly a UTF8String when present — accepting any tag here would let a
 * certificate carry one value that a strict parser reads and another that a lax one does.
 */
export function extensionString(entry) {
  if (entry === undefined) return null;
  const raw = entry.raw;
  if (raw.length >= 2 && raw[0] === UTF8_STRING) {
    const inner = readTLV(raw, 0);
    if (inner.end !== raw.length) throw new Error('c19-der: trailing bytes after a UTF8String extension');
    return inner.value.toString('utf8');
  }
  return raw.toString('utf8');
}

/** Convert a PEM block to DER. */
export function pemToDer(pem) {
  const m = /-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/.exec(String(pem));
  if (m === null) throw new Error('c19-der: not a PEM block');
  return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
}
