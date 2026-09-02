/**
 * Secret and URL-query redaction (PHASE1_PLAN §8.1, acceptance A10).
 *
 * "secrets + URL query strings redacted in logs, events, audit metadata."
 *
 * The rule is deliberately blunt: a URL that reaches a log, an event payload or
 * audit metadata keeps its scheme, host, port and path and LOSES ITS ENTIRE
 * QUERY STRING AND USERINFO. Not "loses the parameters we recognise" — an
 * allowlist of sensitive parameter names is a list someone has to keep correct
 * forever, and the first parameter nobody thought of is the one that leaks.
 *
 * This is also why the EU sanctions endpoint's PUBLISHED `token=` parameter is
 * never stored as a secret and never printed: the redactor does not need to know
 * that it is harmless, because it does not treat any query string as harmless.
 */

const SECRET_KEY_RE = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|api[-_]?key|token|access[-_]?token|refresh[-_]?token|secret|password|credential)$/i;

/** Redact a URL to scheme://host[:port]/path — no query, no fragment, no userinfo. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const port = u.port === '' ? '' : `:${u.port}`;
    const query = u.search === '' ? '' : '?[redacted]';
    return `${u.protocol}//${u.hostname}${port}${u.pathname}${query}`;
  } catch {
    return '[unparseable-url]';
  }
}

/** Redact a header map: sensitive names lose their value entirely. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = SECRET_KEY_RE.test(k) ? '[redacted]' : v;
  }
  return out;
}

/**
 * Redact an arbitrary structure destined for an event, log line or audit
 * metadata field. Strings that parse as absolute http(s) URLs are redacted as
 * URLs; keys that look like credentials lose their values at any depth.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[depth-limited]';
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? redactUrl(value) : value;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}
