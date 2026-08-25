/**
 * C17 §6 — MACHINE-GOVERNED LEGAL DISPOSITIONS, SEPARATE FROM SECURITY EXCLUSIONS.
 *
 * ── WHY A SECOND DOCUMENT ────────────────────────────────────────────────────────
 * `scanner-exclusions.json` governs decisions about VULNERABILITIES. A licence decision is a
 * different kind of judgement, made by different people, on different evidence, with a
 * different review cycle. Putting them in one document would let a record approved for one
 * purpose suppress a finding of the other kind — a security exclusion silencing a licence
 * failure, or a legal sign-off silencing a CVE. The two sets are kept apart, and the controls
 * prove neither can reach the other's findings.
 *
 * A disposition is EXACT: it names one target, one canonical PURL and one version. It cannot be
 * widened to a name, a range or a whole target, because a decision made about one artifact is
 * not a decision about its next release.
 */
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.0.0']);
export const ALLOWED_TARGETS = Object.freeze(['production', 'development']);
export const ALLOWED_ISSUES = Object.freeze([
  'no_declared_licence', 'unclassified_licence', 'unparseable_manifest', 'not_materialized',
  'no_manifest', 'contradictory_licence',
]);
export const ALLOWED_CLASSIFICATIONS = Object.freeze([
  'APPROVED_FOR_USE', 'APPROVED_WITH_CONDITIONS', 'NOT_APPLICABLE',
]);

export const REQUIRED_FIELDS = Object.freeze([
  'id', 'target', 'purl', 'version', 'issue', 'classification', 'rationale',
  'owner', 'approver', 'evidence_files', 'approved_on', 'reviewed_on', 'expires_on',
  'permitted_use', 'prohibited_use',
]);

const SHA256_HEX = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^LGL-\d{4}$/;

/**
 * C17.1 D — a REAL CALENDAR DATE, not a string that looks like one.
 *
 * The shape test alone accepts `2026-99-99` and `2026-02-31`. Both would then be compared as
 * strings — and `'2026-99-99' > runDate` is true for any plausible run date, so an impossible
 * expiry read as "not yet expired" and the record governed indefinitely. The date must round-trip
 * through `Date.UTC`: a month or day the calendar does not have changes under normalisation and
 * is rejected.
 */
export function isRealDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/**
 * CODE-OWNED type contract. Presence alone is not enough: a field of the wrong type reaches the
 * semantic checks as a value they cannot reason about, which is how `severities: 'HIGH'` once
 * passed a substring test in the security document.
 */
export const FIELD_TYPES = Object.freeze({
  id: 'string',
  target: 'string',
  purl: 'string',
  version: 'string',
  issue: 'string',
  classification: 'string',
  rationale: 'string',
  owner: 'string',
  approver: 'string',
  evidence_files: 'evidence[]',
  approved_on: 'date',
  reviewed_on: 'date',
  expires_on: 'date',
  permitted_use: 'string[]',
  prohibited_use: 'string[]',
});

const describeType = (v) => (Array.isArray(v) ? 'array' : (v === null ? 'null' : typeof v));

export function loadLegalDispositions(root) {
  const path = join(root, 'scripts/gate/legal-dispositions.json');
  const raw = readFileSync(path, 'utf8');
  return { doc: JSON.parse(raw), raw, path: 'scripts/gate/legal-dispositions.json' };
}

/**
 * Validate governance independently of any inventory. `unresolvedKeys` is the set of
 * `target|purl|version|issue` tuples the inventory actually raised, so a disposition covering
 * nothing is reported as UNUSED — a decision nobody needs is a decision nobody has reviewed.
 */
export function validateLegalDispositions(doc, { runDate, root, isTracked, unresolvedKeys = null }) {
  const problems = [];
  const valid = [];

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc?.schema_version)) {
    problems.push(
      `legal-dispositions schema_version ${JSON.stringify(doc?.schema_version)} is not one of `
      + `the code-owned supported versions (${SUPPORTED_SCHEMA_VERSIONS.join(', ')})`,
    );
    return { problems, valid };
  }
  const records = Array.isArray(doc.records) ? doc.records : null;
  if (records === null) {
    problems.push('legal-dispositions has no records array');
    return { problems, valid };
  }

  const seenIds = new Set();
  const seenScopes = new Map();
  for (const [i, r] of records.entries()) {
    const where = `legal-dispositions[${i}]${typeof r?.id === 'string' ? ` (${r.id})` : ''}`;
    let fatal = false;
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      problems.push(`${where}: is not an object`);
      continue;
    }
    for (const f of REQUIRED_FIELDS) {
      const v = r[f];
      const empty = v === undefined || v === null
        || (typeof v === 'string' && v.trim() === '')
        || (Array.isArray(v) && v.length === 0);
      if (empty) { problems.push(`${where}: missing required field '${f}'`); fatal = true; continue; }
      // TYPE, before any semantic check can reason about the value.
      const want = FIELD_TYPES[f];
      if (want === 'string' || want === 'date') {
        if (typeof v !== 'string') {
          problems.push(`${where}: field '${f}' must be a string, got ${describeType(v)}`);
          fatal = true;
        } else if (want === 'date' && !isRealDate(v)) {
          problems.push(`${where}: field '${f}' is ${JSON.stringify(v)}, which is not a real calendar date (YYYY-MM-DD)`);
          fatal = true;
        }
      } else if (want === 'string[]') {
        if (!Array.isArray(v)) {
          problems.push(`${where}: field '${f}' must be an array of strings, got ${describeType(v)}`);
          fatal = true;
        } else if (v.some((e) => typeof e !== 'string' || e.trim() === '')) {
          problems.push(`${where}: field '${f}' must contain only nonempty strings`);
          fatal = true;
        }
      } else if (want === 'evidence[]') {
        if (!Array.isArray(v)) {
          problems.push(`${where}: field '${f}' must be an array of {path, sha256} records, got ${describeType(v)}`);
          fatal = true;
        } else if (v.some((e) => e === null || typeof e !== 'object' || Array.isArray(e))) {
          problems.push(`${where}: field '${f}' must contain only {path, sha256} objects`);
          fatal = true;
        }
      }
    }
    if (fatal) continue;

    if (!ID.test(r.id)) { problems.push(`${where}: id must match LGL-NNNN`); fatal = true; }
    if (seenIds.has(r.id)) { problems.push(`${where}: duplicate id '${r.id}'`); fatal = true; }
    seenIds.add(r.id);
    if (!ALLOWED_TARGETS.includes(r.target)) {
      problems.push(`${where}: target ${JSON.stringify(r.target)} is not one of ${ALLOWED_TARGETS.join(', ')}`);
      fatal = true;
    }
    if (!ALLOWED_ISSUES.includes(r.issue)) {
      problems.push(`${where}: issue ${JSON.stringify(r.issue)} is not one of ${ALLOWED_ISSUES.join(', ')}`);
      fatal = true;
    }
    if (!ALLOWED_CLASSIFICATIONS.includes(r.classification)) {
      problems.push(`${where}: classification ${JSON.stringify(r.classification)} is not one of ${ALLOWED_CLASSIFICATIONS.join(', ')}`);
      fatal = true;
    }
    // OVERBROAD: a wildcard, a bare name, or a PURL with no version pins nothing.
    if (typeof r.purl !== 'string' || !r.purl.startsWith('pkg:') || !r.purl.includes('@')) {
      problems.push(`${where}: purl ${JSON.stringify(r.purl)} must be a complete canonical PURL including a version`);
      fatal = true;
    } else if (/[*?]/.test(r.purl)) {
      problems.push(`${where}: purl ${JSON.stringify(r.purl)} is OVERBROAD; a disposition names one artifact`);
      fatal = true;
    } else if (!r.purl.endsWith(`@${r.version}`)) {
      problems.push(`${where}: purl ${JSON.stringify(r.purl)} does not end with the declared version '${r.version}'`);
      fatal = true;
    }
    if (r.owner === r.approver) {
      problems.push(`${where}: approver must differ from owner (both '${r.owner}')`);
      fatal = true;
    }
    // Dates are already known to be REAL calendar dates by the type pass, so ordering can be
    // compared. The run date is validated too: a caller passing rubbish must not make every
    // record look current.
    if (!isRealDate(runDate)) {
      problems.push(`legal-dispositions: run date ${JSON.stringify(runDate)} is not a real calendar date`);
      fatal = true;
    } else {
      if (r.approved_on > runDate) { problems.push(`${where}: approved_on ${r.approved_on} is in the future relative to ${runDate}`); fatal = true; }
      if (r.expires_on <= runDate) { problems.push(`${where}: expired on ${r.expires_on} (run date ${runDate})`); fatal = true; }
      if (r.reviewed_on < r.approved_on) { problems.push(`${where}: reviewed_on precedes approved_on`); fatal = true; }
      if (r.expires_on <= r.approved_on) { problems.push(`${where}: expires_on ${r.expires_on} is not after approved_on ${r.approved_on}`); fatal = true; }
      if (r.reviewed_on > runDate) { problems.push(`${where}: reviewed_on ${r.reviewed_on} is in the future relative to ${runDate}`); fatal = true; }
    }
    // Evidence: typed, tracked, in-tree, byte-equal.
    for (const [j, e] of (Array.isArray(r.evidence_files) ? r.evidence_files : []).entries()) {
      const at = `${where}: evidence_files[${j}]`;
      if (typeof e?.path !== 'string' || e.path === '') { problems.push(`${at} has no path`); fatal = true; continue; }
      if (typeof e?.sha256 !== 'string' || !SHA256_HEX.test(e.sha256)) { problems.push(`${at} ('${e.path}') sha256 must be lowercase 64-hex`); fatal = true; continue; }
      if (e.path.startsWith('/') || e.path.split('/').includes('..')) { problems.push(`${at} '${e.path}' must be repository-relative with no '..'`); fatal = true; continue; }
      const abs = join(root, e.path);
      let st = null;
      try { st = lstatSync(abs); } catch { st = null; }
      if (st === null || !st.isFile()) { problems.push(`${at} '${e.path}' is missing or is not a regular file`); fatal = true; continue; }
      if (isTracked !== undefined && !isTracked(e.path)) { problems.push(`${at} '${e.path}' is not tracked in version control`); fatal = true; continue; }
      const actual = createHash('sha256').update(readFileSync(abs)).digest('hex');
      if (actual !== e.sha256) { problems.push(`${at} '${e.path}' hashes to ${actual}, the record claims ${e.sha256}`); fatal = true; }
    }
    const scope = `${r.target}|${r.purl}|${r.issue}`;
    if (seenScopes.has(scope)) {
      problems.push(`${where}: duplicates the scope already covered by ${seenScopes.get(scope)}`);
      fatal = true;
    }
    seenScopes.set(scope, r.id);
    if (fatal) continue;

    if (unresolvedKeys !== null && !unresolvedKeys.has(scope)) {
      problems.push(`${where}: UNUSED — no unresolved licence finding matches ${scope}`);
      continue;
    }
    valid.push(r);
  }
  return { problems, valid };
}

/** The scope key an unresolved inventory finding presents to the disposition set. */
export const unresolvedScopeKey = (u) => `${u.target}|${u.purl}|${u.issue}`;
