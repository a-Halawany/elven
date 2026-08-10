/**
 * RFC 8785 — JSON Canonicalization Scheme (JCS).
 *
 * Canonical byte serialization used for ALL digests in The Eye:
 * object content digests, audit chain hashes, policy input digests,
 * decision digests. (ADR-P0-09, ADR-P0-13)
 *
 * Rules implemented per RFC 8785:
 * - Object members sorted by code-unit order of property names (UTF-16).
 * - No insignificant whitespace.
 * - Numbers serialized per ECMAScript Number::toString (shortest round-trip),
 *   which JSON.stringify already provides. NaN/Infinity are rejected.
 * - Strings escaped per JSON with the shortest escape forms (JSON.stringify).
 * - undefined values / functions are rejected (not silently dropped) so that
 *   two semantically different inputs can never share canonical bytes.
 *
 * Gate-2.2 C11 — STRICT I-JSON ACCEPTANCE. Anything that cannot be represented
 * unambiguously as I-JSON is REJECTED rather than coerced, because a coercion is a
 * silent change of meaning that two different inputs can share bytes through:
 * - LONE SURROGATES in keys or values (unpaired \uD800-\uDFFF) are not valid
 *   Unicode and cannot round-trip through UTF-8 bytes.
 * - SPARSE ARRAYS (holes) previously serialized as empty slots, producing
 *   syntactically INVALID JSON (`[1,,3]`) with no error at all.
 * - `undefined` ARRAY ELEMENTS are no longer converted to `null`; `[undefined]`
 *   and `[null]` are different inputs and must not share canonical bytes.
 * - NON-PLAIN OBJECTS (Date, Map, Set, RegExp, class instances, boxed primitives)
 *   previously enumerated to `{}` — a Date silently canonicalized to the same bytes
 *   as an empty object. They must be converted explicitly by the caller.
 */

export class JcsError extends Error {
  override readonly name = 'JcsError';
}

/** True if the string contains an unpaired UTF-16 surrogate (invalid Unicode). */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      // high surrogate must be followed by a low surrogate
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : NaN;
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true; // low surrogate without a preceding high surrogate
    }
  }
  return false;
}

/** A plain JSON object: object literal or null-prototype, nothing exotic. */
function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) throw new JcsError('non-finite number cannot be canonicalized');
    // ECMAScript number-to-string is what RFC 8785 specifies.
    return JSON.stringify(n);
  }
  if (t === 'string') {
    if (hasLoneSurrogate(value as string)) {
      throw new JcsError('string contains an unpaired UTF-16 surrogate; not valid I-JSON');
    }
    return JSON.stringify(value);
  }
  if (t === 'bigint') throw new JcsError('bigint cannot be canonicalized; convert to string explicitly');
  if (t === 'undefined' || t === 'function' || t === 'symbol') {
    throw new JcsError(`${t} cannot be canonicalized`);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      // A HOLE is not `undefined`: it is an absent index. Serializing it produced
      // invalid JSON, and coercing it to null would invent a value.
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        throw new JcsError(`sparse array: index ${i} is a hole; arrays must be dense`);
      }
      const v = value[i];
      if (v === undefined) {
        throw new JcsError(
          `undefined array element at index ${i} — use null explicitly if that is the intended value`,
        );
      }
      parts.push(canonicalize(v));
    }
    return '[' + parts.join(',') + ']';
  }
  if (t === 'object') {
    if (!isPlainObject(value as object)) {
      const ctor = (value as object).constructor?.name ?? 'unknown';
      throw new JcsError(
        `non-plain object (${ctor}) cannot be canonicalized; convert it explicitly ` +
        '(a Date/Map/Set/class instance would otherwise serialize to {})',
      );
    }
    const obj = value as Record<string, unknown>;
    // RFC 8785: sort keys by UTF-16 code units.
    const keys = Object.keys(obj).sort();
    const members: string[] = [];
    for (const k of keys) {
      if (hasLoneSurrogate(k)) {
        throw new JcsError(`object key contains an unpaired UTF-16 surrogate; not valid I-JSON`);
      }
      const v = obj[k];
      if (v === undefined) {
        throw new JcsError(`undefined member value at key "${k}" — omit the key or use null explicitly`);
      }
      members.push(JSON.stringify(k) + ':' + canonicalize(v));
    }
    return '{' + members.join(',') + '}';
  }
  throw new JcsError(`unsupported type: ${t}`);
}

/** Canonical JSON string per RFC 8785. */
export function jcsCanonicalize(value: unknown): string {
  return canonicalize(value);
}

/** Canonical UTF-8 bytes per RFC 8785. */
export function jcsBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
