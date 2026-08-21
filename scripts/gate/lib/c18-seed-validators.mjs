/**
 * C18.1.9 — THE EXECUTABLE VALIDATOR REGISTRY.
 *
 * C18.1.8 classified every column of every seed-affected table, but several classifications were
 * descriptive only: the kind and its note stated a guarantee that no verifier code executed. A
 * reassigned capability session, an inflated session epoch, a detached lifecycle or refresh-token
 * timestamp, a re-canonicalised standalone audit body and a frozen chain head all satisfied the
 * classification while contradicting it.
 *
 * Every classified column now maps to exactly one RULE FUNCTION here, and a structural
 * meta-control proves three-way equality between the catalog columns, the coverage entries and
 * the registrations in this file. A classified column with no rule, a rule with no column, and a
 * rule that is only a comment all fail.
 *
 * Each rule is `(value, row, ctx) => string[]`, returning zero or more problems. `ctx` carries the
 * resolved slot maps, the source-owned specification, the era, and row lookups.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
/** The complete PHC grammar the era's argon2id hashes use, with its governed parameters. */
const ARGON2ID_RE = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
const ARGON2ID_ALT_RE = /^\$argon2id\$v=19\$m=(\d+),p=(\d+),t=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

const at = (v) => (typeof v === 'string' || typeof v === 'number' ? new Date(v) : new Date(NaN));
const finiteTime = (v) => Number.isFinite(at(v).getTime());
const j = (v) => JSON.stringify(v);
const stable = (v) => JSON.stringify(v, (k, val) => (
  val !== null && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((kk) => [kk, val[kk]])) : val));
/** PostgreSQL renders '+00:00'; the specification writes ISO 'Z'. Compare the instants. */
const sameInstant = (a, b) => finiteTime(a) && finiteTime(b) && at(a).getTime() === at(b).getTime();

// ── Rule builders ─────────────────────────────────────────────────────────────
/** exact: one source-owned value. */
export const exact = (want, label) => (v) => (v === want ? []
  : [`is ${j(v)}; the specification requires ${j(want)}${label ? ` (${label})` : ''}`]);
/** exact, chosen per row by a source-owned selector. */
export const exactBy = (pick) => (v, row, ctx) => {
  const want = pick(row, ctx);
  return v === want ? [] : [`is ${j(v)}; the specification requires ${j(want)}`];
};
/** exact one-of, for a closed source-owned value set. */
export const oneOf = (values) => (v) => (values.includes(v) ? []
  : [`is ${j(v)}; the specification allows only ${j(values)}`]);
/** slot: the value must be exactly the id the named slot resolved to (or exactly null). */
export const slotRef = (pick) => (v, row, ctx) => {
  const want = pick(row, ctx);
  return (v ?? null) === (want ?? null) ? []
    : [`is ${j(v)}; the resolved slot relationship requires ${j(want)}`];
};
/** generated-id: UUID grammar, and — where given — uniqueness within its table. */
export const generatedId = ({ unique = false } = {}) => (v, row, ctx) => {
  if (typeof v !== 'string' || !UUID_RE.test(v)) return [`is ${j(v)}, which is not a generated UUID`];
  if (!unique) return [];
  const seen = ctx.tableRows.filter((r) => r[ctx.column] === v).length;
  return seen === 1 ? [] : [`value ${j(v)} appears ${seen} times; every generated ${ctx.column} is unique`];
};
/** digest: full hex grammar plus its declared semantic relationship. */
export const digest = ({ bytes = 32, relatesTo = null } = {}) => (v, row, ctx) => {
  const problems = [];
  const re = bytes === 32 ? HEX64_RE : new RegExp(`^[0-9a-f]{${bytes * 2}}$`);
  if (typeof v !== 'string' || !re.test(v)) problems.push(`is ${j(v)}, which is not a ${bytes}-byte hex digest`);
  if (relatesTo !== null) {
    const want = relatesTo(row, ctx);
    if (want !== undefined && v !== want) problems.push(`does not equal ${j(want)}, the value it must mirror`);
  }
  return problems;
};
/** digest with a complete PHC grammar and governed parameters; never exposes the secret. */
export const phcArgon2id = () => (v) => {
  if (typeof v !== 'string') return [`is ${j(v)}, which is not a PHC string`];
  const m = ARGON2ID_RE.exec(v) ?? ARGON2ID_ALT_RE.exec(v);
  if (m === null) return ['does not satisfy the complete argon2id PHC grammar'];
  const nums = [Number(m[1]), Number(m[2]), Number(m[3])].filter((n) => Number.isInteger(n) && n > 0);
  return nums.length === 3 ? [] : ['carries non-positive argon2id parameters'];
};
/** timestamp: a finite canonical instant, plus its declared lifecycle relationships. */
export const timestamp = ({ nullable = false, relations = [] } = {}) => (v, row, ctx) => {
  if (v === null || v === undefined) {
    return nullable ? [] : ['is null; the specification requires a recorded time'];
  }
  if (!finiteTime(v)) return [`is ${j(v)}, which is not a finite timestamp`];
  const problems = [];
  for (const rel of relations) {
    const p = rel(v, row, ctx);
    if (p !== null) problems.push(p);
  }
  return problems;
};
/** timestamp relation: this value must be the same instant as another source-owned time. */
export const sameTimeAs = (pick, what) => (v, row, ctx) => {
  const other = pick(row, ctx);
  if (other === undefined) return null;
  return sameInstant(v, other) ? null : `is ${j(v)}, which is not the same instant as ${what} (${j(other)})`;
};
/** timestamp relation: this value must be strictly before another. */
export const before = (pick, what) => (v, row, ctx) => {
  const other = pick(row, ctx);
  if (other === undefined || !finiteTime(other)) return null;
  return at(v).getTime() < at(other).getTime() ? null : `is ${j(v)}, which is not before ${what} (${j(other)})`;
};
/** timestamp relation: this value must be at or after another. */
export const notBefore = (pick, what) => (v, row, ctx) => {
  const other = pick(row, ctx);
  if (other === undefined || !finiteTime(other)) return null;
  return at(v).getTime() >= at(other).getTime() ? null : `is ${j(v)}, which precedes ${what} (${j(other)})`;
};
/** volatile: an explicit allowed set, type and nullability — never "unchecked". */
export const volatileField = ({ allowed = null, type = null, nullable = true, era = null }) => (v, row, ctx) => {
  if (era !== null && ctx.era !== era) {
    return v === undefined ? [] : [`is present in the ${ctx.era} era, where the specification does not carry it`];
  }
  if (v === null || v === undefined) return nullable ? [] : ['is null; the specification requires a value'];
  if (allowed !== null && !allowed.includes(v)) return [`is ${j(v)}; the specification allows only ${j(allowed)}`];
  if (type !== null && typeof v !== type) return [`is a ${typeof v}; the specification requires a ${type}`];
  return [];
};
/** formula: independently recomputed from source-owned inputs. */
export const formula = (compute, what) => (v, row, ctx) => {
  const want = compute(row, ctx);
  if (want === undefined) return [];
  const same = (typeof want === 'object' && want !== null) ? stable(v) === stable(want) : v === want;
  return same ? [] : [`is ${j(v)}; ${what} recomputes to ${j(want)}`];
};
/** exact structural value (objects/arrays), compared by stable ordering. */
export const exactShape = (want) => (v) => (stable(v) === stable(want) ? []
  : [`is ${j(v)}; the specification requires ${j(want)}`]);
export const exactShapeBy = (pick) => (v, row, ctx) => {
  const want = pick(row, ctx);
  return stable(v) === stable(want) ? [] : [`is ${j(v)}; the specification requires ${j(want)}`];
};
/** A column whose complete validation is performed by a named dedicated model. */
export const byModel = (modelName, check) => (v, row, ctx) => {
  const problems = check(v, row, ctx);
  return problems.map((p) => `${p} [${modelName}]`);
};

export const helpers = { UUID_RE, HEX64_RE, at, finiteTime, sameInstant, stable };

/**
 * A timestamp stamped INSIDE the governed seeding window. `offsetMs` widens the window's upper
 * bound for a column whose value is a governed lifetime in the future (a credential expiry).
 */
export const inSeedWindow = ({ nullable = false, offsetMs = 0, relations = [] } = {}) => (v, row, ctx) => {
  if (v === null || v === undefined) {
    return nullable ? [] : ['is null; the specification requires an instant'];
  }
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return [`is ${JSON.stringify(v)}, which is not a valid instant`];
  const w = ctx.seedWindow?.();
  const out = [];
  if (w !== undefined && w !== null) {
    if (t < w.lo || t > w.hi + offsetMs) {
      out.push(`is ${JSON.stringify(v)}, which falls outside the governed seeding window `
        + `(${new Date(w.lo).toISOString()} … ${new Date(w.hi + offsetMs).toISOString()})`);
    }
  }
  for (const rel of relations) {
    const problem = rel(v, row, ctx);
    if (problem !== null) out.push(problem);
  }
  return out;
};

/**
 * A value with NO source-owned expectation: the specification can state its grammar and its
 * uniqueness, and nothing more. Marked explicitly so the mutation matrix does not pretend a
 * perturbation would be caught — the honest alternative to a rule that silently permits anything.
 */
export const opaque = (check) => Object.assign((v, row, ctx) => check(v, row, ctx), { opaque: true });
