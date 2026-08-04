/** Browser-side RFC 8785 JCS + SHA-256 digest (mirrors @eye/contracts; golden-fixture-compatible). */
export function jcsCanonicalize(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value as number)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((v) => jcsCanonicalize(v === undefined ? null : v)).join(',') + ']';
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => {
      if (obj[k] === undefined) throw new Error(`undefined member at ${k}`);
      return JSON.stringify(k) + ':' + jcsCanonicalize(obj[k]);
    }).join(',') + '}';
  }
  throw new Error(`unsupported type ${t}`);
}

export async function contentDigest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(jcsCanonicalize(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
