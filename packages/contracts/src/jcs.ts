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
 */

export class JcsError extends Error {
  override readonly name = 'JcsError';
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
  if (t === 'string') return JSON.stringify(value);
  if (t === 'bigint') throw new JcsError('bigint cannot be canonicalized; convert to string explicitly');
  if (t === 'undefined' || t === 'function' || t === 'symbol') {
    throw new JcsError(`${t} cannot be canonicalized`);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    // RFC 8785: sort keys by UTF-16 code units.
    const keys = Object.keys(obj).sort();
    const members: string[] = [];
    for (const k of keys) {
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
