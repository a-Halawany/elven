/**
 * B33 §PK (0111) — SEMANTIC VERSIONS AND RANGES for the package release (contract compatibility, PR-31-006 / UX-36-006). Pure; unit-tested
 * (test/unit/phase6-packages-b33.test.ts). A range is a space-separated conjunction of comparators: `1.2.3` (exact), `=1.2.3`, `>=1.0.0`,
 * `>1.0.0`, `<2.0.0`, `<=2.0.0`, `^1.2.0` (same major, ≥), `~1.2.0` (same major.minor, ≥), `*` (any); `||` separates alternatives.
 */
export interface SemVer { major: number; minor: number; patch: number }

const RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(s: string): SemVer | null {
  const m = RE.exec(String(s ?? '').trim());
  if (m === null) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareSemver(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** The kind of change from `from` to `to`: major (breaking), minor, patch, same, or downgrade. */
export function changeKind(from: SemVer, to: SemVer): 'major' | 'minor' | 'patch' | 'same' | 'downgrade' {
  const c = compareSemver(to, from);
  if (c < 0) return 'downgrade';
  if (c === 0) return 'same';
  if (to.major !== from.major) return 'major';
  if (to.minor !== from.minor) return 'minor';
  return 'patch';
}

function comparator(token: string, v: SemVer): boolean | null {
  const t = token.trim();
  if (t === '*' || t === '') return true;
  const m = /^(\^|~|>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(t);
  if (m === null) return null;
  const op = m[1] ?? '=';
  const r = parseSemver(m[2] as string) as SemVer;
  const c = compareSemver(v, r);
  switch (op) {
    case '=': return c === 0;
    case '>': return c > 0;
    case '>=': return c >= 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '^': return v.major === r.major && c >= 0;
    case '~': return v.major === r.major && v.minor === r.minor && c >= 0;
    default: return null;
  }
}

/** Whether `version` satisfies `range`; null when the range (or the version) is not well-formed. */
export function satisfies(version: string, range: string): boolean | null {
  const v = parseSemver(version);
  if (v === null || typeof range !== 'string') return null;
  const alternatives = range.split('||');
  let any = false;
  for (const alt of alternatives) {
    const tokens = alt.trim().split(/\s+/).filter((x) => x !== '');
    let all = true;
    for (const tok of tokens.length === 0 ? ['*'] : tokens) {
      const r = comparator(tok, v);
      if (r === null) return null;
      if (!r) { all = false; }
    }
    if (all) any = true;
  }
  return any;
}

/** Whether a range is well-formed (every comparator parses). */
export function validRange(range: string): boolean {
  return satisfies('0.0.0', range) !== null;
}
