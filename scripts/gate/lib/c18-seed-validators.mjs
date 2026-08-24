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
/**
 * C18.1.10 — THE EXACT ARGON2ID CONTRACT, derived from the PINNED PRODUCER.
 *
 * 53a4eec declared SEED_ARGON2ID_PARAMS and never consumed it, while `phcArgon2id` accepted any
 * positive integers — so `m=1,t=1,p=1` with a four-byte salt passed, and so did the declared
 * constant itself, which was WRONG. The producer (`argon2` 0.45.1, `argon2.hash(secret,
 * { type: argon2id })` with no cost overrides) emits exactly:
 *
 *     $argon2id$v=19$m=65536,p=4,t=3$<22 b64 chars>$<43 b64 chars>
 *
 * — parameters in `m,p,t` order, standard-alphabet unpadded base64, a 16-byte salt and a 32-byte
 * tag. That single canonical spelling is the contract; a reordered, padded, url-safe, extra- or
 * duplicate-parameter form is not what this producer writes and is refused.
 */
const ARGON2ID_PHC_RE = /^\$argon2id\$v=(\d+)\$m=(\d+),p=(\d+),t=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const j = (v) => JSON.stringify(v);
/**
 * C18.1.10 — THE CANONICAL DATABASE TIMESTAMP GRAMMAR.
 *
 * 53a4eec passed every recorded instant through `new Date(v)`, which accepts prose ("Fri, 21 Aug
 * 2026 19:19:49 GMT"), alternate offsets and many other equivalent-but-noncanonical spellings. A
 * timestamp rewritten into any of those forms named the SAME instant, so every instant comparison
 * still agreed and the archive reconciled. The evidence carries exactly two canonical shapes:
 *   • a PostgreSQL column instant — `YYYY-MM-DDTHH:MM:SS[.ffffff]+00:00` (UTC, 0-6 fraction
 *     digits, because the driver trims trailing zeros); and
 *   • a canonical JSON body instant — `YYYY-MM-DDTHH:MM:SS[.fff]Z`.
 * Nothing else is a governed timestamp, whatever `Date` would make of it.
 */
export const PG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00:00$/;
export const ISO_Z_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** The canonical JSON body instant, to exact millisecond precision. */
export const ISO_Z_MILLIS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * C18.1.13 — TWO GRAMMARS, TWO PRODUCERS, TWO VALIDATORS.
 *
 * C18.1.10 accepted EITHER canonical shape wherever a governed instant appeared, and C18.1.12 kept
 * that union. It is a structural hole rather than a missing rule: a spelling is only canonical for
 * the producer that WROTE it, and a union lets a database column change format FAMILY without
 * changing its instant. A PostgreSQL `expires_at` rewritten from `…+00:00` to `…Z` names the same
 * moment, satisfied every grammar check because the union admitted both, satisfied every instant
 * comparison because the moment did not move, and passed — on the post-upgrade session and on a
 * seeded one alike.
 *
 * The two families are now distinct, and a value is judged against ITS OWN:
 *   • `db` — a PostgreSQL column instant, `YYYY-MM-DDTHH:MM:SS[.ffffff]+00:00` (UTC, 0-6 fraction
 *     digits, because the driver trims trailing zeros). `Z` is refused.
 *   • `body` — a canonical JSON body instant, `YYYY-MM-DDTHH:MM:SS.fffZ`, exactly three fraction
 *     digits, as the application and the JCS canonicalization write it. `+00:00` is refused.
 *
 * Where one producer literally COPIES the other's spelling, byte equality is the rule, not instant
 * equality. Where two producers genuinely represent the same instant differently, each side is
 * validated in its own family FIRST and only then compared as instants.
 *
 * The partition is source-owned: `BODY_FAMILY_COLUMNS` names every delivered column written in the
 * body family, and a control proves every other timestamp-valued column of every snapshot is
 * db-family, in both directions.
 */
export const TIMESTAMP_FAMILIES = Object.freeze(['db', 'body']);
export const isPgTimestamp = (v) => typeof v === 'string' && PG_TIMESTAMP_RE.test(v);
export const isJsonBodyTimestamp = (v) => typeof v === 'string' && ISO_Z_MILLIS_RE.test(v);
export const inTimestampFamily = (family, v) => (family === 'body'
  ? isJsonBodyTimestamp(v) : isPgTimestamp(v));

/**
 * The only columns whose delivered values are written in the BODY family. `audit_events.occurred_at`
 * is populated FROM the canonical body, so the column carries the body's own spelling; every other
 * timestamp column in the evidence is a PostgreSQL rendering.
 */
export const BODY_FAMILY_COLUMNS = Object.freeze(['audit.audit_events.occurred_at']);
export const timestampFamilyOf = (table, column) => (
  BODY_FAMILY_COLUMNS.includes(`${table}.${column}`) ? 'body' : 'db');

/**
 * Parse ONLY an instant canonical for the named family. A value in the OTHER family is not "the
 * same time written differently" — for this producer it is not a governed timestamp at all, and it
 * yields NaN so every rule rejects it.
 */
const at = (v, family = 'db') => (inTimestampFamily(family, v) ? new Date(v) : new Date(NaN));
const finiteTime = (v, family = 'db') => Number.isFinite(at(v, family).getTime());
/** The reason a value is not canonical FOR ITS OWN FAMILY, for a precise finding. */
const whyNotCanonical = (v, family = 'db') => {
  if (typeof v !== 'string') return `is ${j(v)}, which is not a timestamp string`;
  const other = family === 'db' ? 'body' : 'db';
  if (inTimestampFamily(other, v)) {
    return `is ${j(v)}, which is the ${other} timestamp grammar; this value is written by the `
      + `${family} producer and must carry the ${family} grammar`;
  }
  if (Number.isFinite(new Date(v).getTime())) {
    return `is ${j(v)}, which is parseable but NOT the canonical ${family} timestamp grammar`;
  }
  return `is ${j(v)}, which is not a valid instant`;
};
const stable = (v) => JSON.stringify(v, (k, val) => (
  val !== null && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((kk) => [kk, val[kk]])) : val));
/**
 * Compare instants that may have been written by DIFFERENT producers: each side is validated in its
 * own family first, and only then compared as moments.
 */
const sameInstant = (a, b, famA = 'db', famB = 'db') => finiteTime(a, famA) && finiteTime(b, famB)
  && at(a, famA).getTime() === at(b, famB).getTime();

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
  // C18.1.14: `(v ?? null) === (want ?? null)` equated an UNRESOLVED slot with a legitimate null,
  // so a slot that failed to resolve validated a null column. Absence and null are distinguished,
  // and an unresolved expectation is a finding.
  if (want === undefined) {
    return ['cannot be judged: the slot relationship did not resolve, so this reference proves nothing'];
  }
  if (v === undefined) return [`is ABSENT; the resolved slot relationship requires ${j(want)}`];
  return v === want ? [] : [`is ${j(v)}; the resolved slot relationship requires ${j(want)}`];
};
/** generated-id: UUID grammar, and — where given — uniqueness within its table. */
export const generatedId = ({ unique = false } = {}) => (v, row, ctx) => {
  if (typeof v !== 'string' || !UUID_RE.test(v)) return [`is ${j(v)}, which is not a generated UUID`];
  if (!unique) return [];
  const seen = ctx.tableRows.filter((r) => r[ctx.column] === v).length;
  return seen === 1 ? [] : [`value ${j(v)} appears ${seen} times; every generated ${ctx.column} is unique`];
};
/** digest: full hex grammar plus its declared semantic relationship. */
export const digest = ({ bytes = 32, relatesTo = null, unique = false } = {}) => (v, row, ctx) => {
  const problems = [];
  const re = bytes === 32 ? HEX64_RE : new RegExp(`^[0-9a-f]{${bytes * 2}}$`);
  if (typeof v !== 'string' || !re.test(v)) problems.push(`is ${j(v)}, which is not a ${bytes}-byte hex digest`);
  if (relatesTo !== null) {
    const want = relatesTo(row, ctx);
    if (want !== undefined && v !== want) problems.push(`does not equal ${j(want)}, the value it must mirror`);
  }
  // C18.1.10 — `unique` was accepted and then IGNORED, so two sessions could share one otherwise
  // valid context key digest. Independently generated digests are now required to be distinct.
  if (unique === true && Array.isArray(ctx?.tableRows) && typeof ctx?.column === 'string') {
    const n = ctx.tableRows.filter((r) => r[ctx.column] === v).length;
    if (n > 1) problems.push(`value ${j(v)} appears ${n} times; every generated digest is unique`);
  }
  return problems;
};
/** digest with a complete PHC grammar and governed parameters; never exposes the secret. */
export const phcArgon2id = (params) => (v) => {
  if (typeof v !== 'string') return [`is ${j(v)}, which is not a PHC string`];
  const m = ARGON2ID_PHC_RE.exec(v);
  if (m === null) {
    return [`does not satisfy the canonical argon2id PHC grammar `
      + `($argon2id$v=<n>$m=<n>,p=<n>,t=<n>$<salt>$<hash>, standard unpadded base64)`];
  }
  const [, ver, mem, par, time, salt, hash] = m;
  const out = [];
  const want = (label, actual, expected) => {
    if (Number(actual) !== expected) {
      out.push(`carries ${label}=${actual}; the governed configuration is ${label}=${expected}`);
    }
  };
  want('v', ver, params.v);
  want('m', mem, params.m);
  want('p', par, params.p);
  want('t', time, params.t);
  // Canonical unpadded base64 of exactly the governed byte lengths. Decoding then re-encoding
  // catches a string that is base64-shaped but not a canonical encoding of those bytes.
  const check = (label, b64, bytes) => {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== bytes) {
      out.push(`carries a ${buf.length}-byte ${label}; the governed configuration uses ${bytes} bytes`);
      return;
    }
    if (buf.toString('base64').replace(/=+$/, '') !== b64) {
      out.push(`carries a non-canonical base64 ${label}`);
    }
  };
  check('salt', salt, params.saltBytes);
  check('hash', hash, params.hashBytes);
  return out;
};
/** timestamp: a finite canonical instant, plus its declared lifecycle relationships. */
export const timestamp = ({ nullable = false, relations = [], family = null } = {}) => (v, row, ctx) => {
  const fam = family ?? timestampFamilyOf(ctx?.table, ctx?.column);
  if (v === undefined) return ['is ABSENT; a recorded column carries an explicit value, not nothing'];
  if (v === null) {
    return nullable ? [] : ['is null; the specification requires a recorded time'];
  }
  if (!finiteTime(v, fam)) return [whyNotCanonical(v, fam)];
  const problems = [];
  for (const rel of relations) {
    const p = rel(v, row, ctx);
    if (p !== null) problems.push(p);
  }
  return problems;
};
/** timestamp relation: this value must be the same instant as another source-owned time. */
export const sameTimeAs = (pick, what, { family = null, otherFamily = null } = {}) => (v, row, ctx) => {
  const fam = family ?? timestampFamilyOf(ctx?.table, ctx?.column);
  const otherFam = otherFamily ?? fam;
  const other = pick(row, ctx);
  // C18.1.14: an unresolved counterpart is a FINDING; returning `null` reported the relation
  // satisfied when it had not been checked at all.
  if (other === undefined) return `cannot be judged: ${what} did not resolve`;
  return sameInstant(v, other, fam, otherFam) ? null
    : `is ${j(v)}, which is not the same instant as ${what} (${j(other)})`;
};
/** timestamp relation: this value must be strictly before another. */
export const before = (pick, what, { family = null, otherFamily = null } = {}) => (v, row, ctx) => {
  const fam = family ?? timestampFamilyOf(ctx?.table, ctx?.column);
  const otherFam = otherFamily ?? fam;
  const other = pick(row, ctx);
  if (other === undefined) return `cannot be judged: ${what} did not resolve`;
  if (!finiteTime(other, otherFam)) {
    return `cannot be judged: ${what} (${j(other)}) is not canonical for its own family`;
  }
  return at(v, fam).getTime() < at(other, otherFam).getTime() ? null
    : `is ${j(v)}, which is not before ${what} (${j(other)})`;
};
/** timestamp relation: this value must be at or after another. */
export const notBefore = (pick, what, { family = null, otherFamily = null } = {}) => (v, row, ctx) => {
  const fam = family ?? timestampFamilyOf(ctx?.table, ctx?.column);
  const otherFam = otherFamily ?? fam;
  const other = pick(row, ctx);
  if (other === undefined) return `cannot be judged: ${what} did not resolve`;
  if (!finiteTime(other, otherFam)) {
    return `cannot be judged: ${what} (${j(other)}) is not canonical for its own family`;
  }
  return at(v, fam).getTime() >= at(other, otherFam).getTime() ? null
    : `is ${j(v)}, which precedes ${what} (${j(other)})`;
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
  // C18.1.14: an unresolved computation is a FINDING, not a pass. C18.1.12 closed exactly this
  // shape in `bound()`; the audit found it still standing here, where a slot that fails to resolve
  // would silence the rule that depends on it.
  if (want === undefined) {
    return ['cannot be judged: ' + what + ' did not resolve, so this formula proves nothing'];
  }
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

/**
 * C18.1.12 — CONJUNCTIVE RULES, AND A BINDING THAT CANNOT PASS BY DEFAULT.
 *
 * `2c3cab3` bound the paired fields of the post-upgrade world to each other and to nothing else. A
 * `family_id` had to equal its counterpart's `family_id`; a refresh-token hash had to equal its
 * session's. Neither carried a GRAMMAR, so `"not-a-uuid"` written into both linked rows, and
 * `"not-a-digest"` written into both token-hash fields, agreed with themselves and passed.
 *
 * Worse, the binding treated an UNRESOLVED counterpart as success: `if (want === undefined) return
 * []`. Deleting `family_id` from BOTH rows made each side's expectation undefined, so both rules
 * returned no findings and the field simply vanished from the governed world. That is the single
 * most dangerous shape a validator can have — silence that reads as approval.
 *
 * Two things follow. A binding whose counterpart does not resolve is a FINDING, never a pass. And
 * a value that must satisfy several independent claims — a grammar AND an equality — must be
 * judged by ALL of them, which is what `allOf` composes.
 */

/** Run every rule and report every finding; no rule may mask another. */
export const allOf = (...rules) => (v, row, ctx) => rules.flatMap((r) => r(v, row, ctx));

/**
 * A value that must equal a counterpart elsewhere in the same world. An unresolved counterpart is
 * a finding: the claim could not be checked, and an unchecked claim is not a satisfied one.
 */
export const boundValue = (pick, what) => (v, row, ctx) => {
  let want;
  try { want = pick(row, ctx); } catch (err) { return [`could not resolve ${what}: ${err.message}`]; }
  if (want === undefined) {
    return [`cannot be judged: ${what} did not resolve, so this binding proves nothing`];
  }
  if (v === undefined) return [`is absent; ${what} is ${j(want)}`];
  return stable(v) === stable(want) ? [] : [`is ${j(v)}; ${what} is ${j(want)}`];
};

/** A uuid-shaped value bound to its counterpart. Coordinated equality alone is not sufficient. */
export const uuidBound = (pick, what) => allOf(
  (v) => (typeof v === 'string' && UUID_RE.test(v) ? [] : [`is ${j(v)}, which is not a uuid`]),
  boundValue(pick, what),
);

/** A sha-256 hex digest bound to its counterpart. */
export const digestBound = (pick, what) => allOf(
  (v) => (typeof v === 'string' && HEX64_RE.test(v) ? []
    : [`is ${j(v)}, which is not a sha-256 hex digest`]),
  boundValue(pick, what),
);

/**
 * A canonical instant bound to its counterpart BY SPELLING, not merely by instant. Two strings
 * that name the same moment in different notations are not the same recorded value, and rebinding
 * every linked field to the same alternative spelling must not launder the change.
 */
export const canonicalTimestampBound = (pick, what, { family = 'db' } = {}) => allOf(
  (v) => (inTimestampFamily(family, v) ? [] : [whyNotCanonical(v, family)]),
  boundValue(pick, what),
);

/** A prefixed identifier — `principal:<uuid>`, `outbox:<uuid>` — whose suffix must be a real uuid. */
export const prefixedUuid = (prefix) => (v) => {
  if (typeof v !== 'string' || !v.startsWith(`${prefix}:`)) {
    return [`is ${j(v)}, which is not a ${prefix}:<uuid> identifier`];
  }
  const suffix = v.slice(prefix.length + 1);
  return UUID_RE.test(suffix) ? [] : [`is ${j(v)}, whose ${prefix} suffix is not a uuid`];
};

export const helpers = { UUID_RE, HEX64_RE, ISO_Z_MILLIS_RE, at, finiteTime, sameInstant, stable };

/**
 * A timestamp stamped INSIDE the governed seeding window. `offsetMs` widens the window's upper
 * bound for a column whose value is a governed lifetime in the future (a credential expiry).
 */
export const inSeedWindow = ({
  nullable = false, offsetMs = 0, relations = [], family = null,
} = {}) => (v, row, ctx) => {
  const fam = family ?? timestampFamilyOf(ctx?.table, ctx?.column);
  if (v === undefined) return ['is ABSENT; a recorded column carries an explicit value, not nothing'];
  if (v === null) {
    return nullable ? [] : ['is null; the specification requires an instant'];
  }
  if (!finiteTime(v, fam)) return [whyNotCanonical(v, fam)];
  const t = at(v, fam).getTime();
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
