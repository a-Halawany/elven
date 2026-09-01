/**
 * C16-R2 — MACHINE-GOVERNED CONTAINER-SCAN DISPOSITIONS.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────────
 * A bare `.trivyignore` listing 16 CVE IDs with prose governance in comments. Two
 * problems, both structural:
 *   * A bare CVE ID is GLOBAL. It suppresses that advisory in every image, every
 *     package and every path — so a genuinely new occurrence of the same CVE in a
 *     different component would be silently hidden.
 *   * Nothing machine-checked the governance. Expiry, ownership and approval lived in
 *     comments, so an expired disposition kept suppressing indefinitely.
 *
 * ── THE MODEL ────────────────────────────────────────────────────────────────────
 * The gate scans with NO suppression (`--ignorefile /dev/null`) to obtain the complete
 * finding set, then reconciles that set against governed records. Trivy's own ignore
 * mechanism is never relied upon, so suppression cannot occur without a matching
 * record. Consequences:
 *   * an UNMATCHED finding fails the gate (nothing is hidden by default);
 *   * a record matching nothing fails the gate as UNUSED (dispositions cannot rot);
 *   * expiry, scope, ownership and approval are all enforced in code.
 *
 * A record is target-specific: it must name the exact image digest, the scan platform,
 * the package, and a PURL prefix. A record with no package/PURL scope is OVERBROAD and
 * rejected — that is precisely what a bare CVE ID was.
 */
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * CODE-OWNED contract. Deliberately NOT read from the governance document: a document
 * that defines its own required fields can weaken its own validation by editing itself.
 */
export const REQUIRED_FIELDS = Object.freeze([
  'id', 'advisory_ids', 'image', 'scan_platform', 'package_name', 'package_purl',
  'installed_version', 'severities', 'result_target',
  'reason', 'compensating_controls', 'owner', 'approver',
  'evidence', 'evidence_sha256', 'evidence_files',
  'classification',
  'approved_on', 'reviewed_on', 'expires_on',
]);

/**
 * C17 step 0: the CLASSIFICATION is machine-readable and TOTAL.
 *
 * A disposition that says "we accept this risk" and one that says "this does not apply to us"
 * are different decisions with different review obligations, and until now the difference lived
 * only in prose. It is a required, enumerated field: an absent, unknown or mistyped value makes
 * the record structurally invalid, so it can never govern a finding.
 */
export const ALLOWED_CLASSIFICATIONS = Object.freeze(['RISK_ACCEPTED', 'NOT_AFFECTED']);

/**
 * CODE-OWNED type and format contract for every required field.
 *
 * Types are validated UP FRONT and a wrong type is FATAL for the record. Previously the
 * matcher itself was type-gated — `Array.isArray(r.severities) && …` and
 * `typeof r.result_target === 'string' && …` — so a string `severities` or a numeric
 * `result_target` silently SKIPPED severity or target matching and the record governed
 * findings it was never approved for.
 */
export const FIELD_TYPES = Object.freeze({
  id: 'string',
  advisory_ids: 'string[]',
  image: 'string',
  scan_platform: 'string',
  package_name: 'string',
  package_purl: 'string',
  installed_version: 'string',
  severities: 'string[]',
  result_target: 'string',
  reason: 'string',
  compensating_controls: 'string[]',
  prohibited_use: 'string[]',
  owner: 'string',
  approver: 'string',
  evidence: 'string',
  evidence_sha256: 'string',
  evidence_files: 'object[]',
  classification: 'string',
  approved_on: 'string',
  reviewed_on: 'string',
  expires_on: 'string',
});
const SHA256_HEX = /^[a-f0-9]{64}$/;
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['2.0.0']);
/** The only severities a governed record may name. */
export const ALLOWED_SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * C17.2 H — a REAL calendar date.
 *
 * `reviewed_on` was not in REQUIRED_FIELDS or FIELD_TYPES at all, so it was ignored: C17.1 could
 * record any value, or none, and nothing checked it. That is how six advisories came to sit in a
 * record approved before they existed without the gate objecting. It is now required, typed, and
 * must be a date the calendar actually has — `2026-99-99` compares greater than any run date as a
 * string and would otherwise read as "reviewed recently".
 */
const isRealDate = (v) => {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const ADVISORY_ID = /^(CVE-\d{4}-\d{4,}|GHSA-[a-z0-9-]+|[A-Z]+-\d{4}-\d+)$/;

export function loadScannerExclusions(root) {
  const path = join(root, 'scripts/gate/scanner-exclusions.json');
  const raw = readFileSync(path, 'utf8');
  return { doc: JSON.parse(raw), raw, path: 'scripts/gate/scanner-exclusions.json' };
}

/** Every advisory id a record covers (single or list form). */
export function advisoryIdsOf(record) {
  const ids = [];
  if (typeof record.advisory_id === 'string') ids.push(record.advisory_id);
  for (const id of Array.isArray(record.advisory_ids) ? record.advisory_ids : []) ids.push(id);
  return ids;
}

/**
 * Validate the governance of every record, independent of any scan.
 * `runDate` is an ISO YYYY-MM-DD string; `tracked` decides whether an evidence path is
 * under version control.
 */
export function validateRecords(doc, { runDate, root, isTracked, readEvidence }) {
  const problems = [];

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc.schema_version)) {
    problems.push(
      `scanner-exclusions schema_version ${JSON.stringify(doc.schema_version)} is not one of ` +
      `the code-owned supported versions (${SUPPORTED_SCHEMA_VERSIONS.join(', ')})`,
    );
  }

  const seenIds = new Set();
  const seenScopes = new Map();
  /** Indices whose records are structurally invalid and must never govern anything. */
  const recordFatal = new Set();

  for (const [i, r] of (doc.records ?? []).entries()) {
    const where = `records[${i}]${typeof r.id === 'string' ? ` (${r.id})` : ''}`;

    // PRESENCE, then TYPE. A record whose types are wrong is structurally invalid and is
    // marked fatal, so it can never reach consequence matching with a field the matcher
    // would have skipped.
    let typeFatal = false;
    for (const field of REQUIRED_FIELDS) {
      const v = r[field];
      const empty = v === undefined || v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0);
      if (empty) {
        problems.push(`${where}: missing required field '${field}'`);
        typeFatal = true;
        continue;
      }
      const want = FIELD_TYPES[field];
      if (want === 'string' && typeof v !== 'string') {
        problems.push(`${where}: field '${field}' must be a string, got ${describeType(v)}`);
        typeFatal = true;
      } else if (want === 'object[]') {
        if (!Array.isArray(v)) {
          problems.push(`${where}: field '${field}' must be an array, got ${describeType(v)}`);
          typeFatal = true;
        } else if (v.some((e) => e === null || typeof e !== 'object' || Array.isArray(e))) {
          problems.push(`${where}: field '${field}' must contain only objects`);
          typeFatal = true;
        }
      } else if (want === 'string[]') {
        if (!Array.isArray(v)) {
          problems.push(`${where}: field '${field}' must be an array of strings, got ${describeType(v)}`);
          typeFatal = true;
        } else if (v.some((x) => typeof x !== 'string')) {
          problems.push(`${where}: field '${field}' contains a non-string element`);
          typeFatal = true;
        }
      }
    }
    if (typeFatal) {
      // Do not evaluate semantics on a structurally invalid record: every later check
      // would be reasoning about values whose types it cannot rely on.
      recordFatal.add(i);
      continue;
    }

    // EVIDENCE DIGEST: lowercase 64-hex, recomputed from the exact tracked bytes.
    if (!SHA256_HEX.test(r.evidence_sha256)) {
      problems.push(
        `${where}: evidence_sha256 must be a lowercase 64-character hex SHA-256 digest`,
      );
      recordFatal.add(i);
    } else if (readEvidence !== undefined) {
      const bytes = readEvidence(r.evidence);
      if (bytes === null) {
        problems.push(`${where}: evidence '${r.evidence}' does not exist`);
        recordFatal.add(i);
      } else {
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== r.evidence_sha256) {
          problems.push(
            `${where}: evidence digest mismatch — '${r.evidence}' hashes to ${actual}, the ` +
            `record claims ${r.evidence_sha256}`,
          );
          recordFatal.add(i);
        }
      }
    }

    // CLASSIFICATION: enumerated, and fatal when it is not one of the code-owned values.
    if (!ALLOWED_CLASSIFICATIONS.includes(r.classification)) {
      problems.push(
        `${where}: classification ${JSON.stringify(r.classification)} is not one of ` +
        `${ALLOWED_CLASSIFICATIONS.join(', ')}`,
      );
      recordFatal.add(i);
    }

    // TECHNICAL EVIDENCE FILES: a typed array, each entry a tracked, regular, in-tree file
    // whose bytes hash to the digest the record declares. Prose citing an analysis is not the
    // analysis; this is what makes the claim checkable without reading the document.
    const seenEvidencePaths = new Set();
    for (const [j, e] of (Array.isArray(r.evidence_files) ? r.evidence_files : []).entries()) {
      const at = `${where}: evidence_files[${j}]`;
      const rel = e.path;
      const want = e.sha256;
      if (typeof rel !== 'string' || rel === '') {
        problems.push(`${at} has no 'path'`);
        recordFatal.add(i);
        continue;
      }
      if (typeof want !== 'string' || !SHA256_HEX.test(want)) {
        problems.push(`${at} ('${rel}') sha256 must be a lowercase 64-character hex digest`);
        recordFatal.add(i);
        continue;
      }
      if (seenEvidencePaths.has(rel)) {
        problems.push(`${at} repeats '${rel}'`);
        recordFatal.add(i);
        continue;
      }
      seenEvidencePaths.add(rel);
      // Traversal safety BEFORE any filesystem access: an absolute path or a `..` segment
      // could name a file outside the repository entirely.
      if (rel.startsWith('/') || rel.split('/').includes('..')) {
        problems.push(`${at} '${rel}' must be a repository-relative path with no '..' segment`);
        recordFatal.add(i);
        continue;
      }
      const abs = join(root, rel);
      let st = null;
      try { st = lstatSync(abs); } catch { st = null; }
      if (st === null) {
        problems.push(`${at} '${rel}' does not exist`);
        recordFatal.add(i);
        continue;
      }
      if (!st.isFile()) {
        problems.push(`${at} '${rel}' is not a regular file`);
        recordFatal.add(i);
        continue;
      }
      if (isTracked !== undefined && !isTracked(rel)) {
        problems.push(`${at} '${rel}' is not tracked in version control`);
        recordFatal.add(i);
        continue;
      }
      if (readEvidence !== undefined) {
        const bytes = readEvidence(rel);
        if (bytes === null) {
          problems.push(`${at} '${rel}' could not be read`);
          recordFatal.add(i);
          continue;
        }
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== want) {
          problems.push(`${at} '${rel}' hashes to ${actual}, the record claims ${want}`);
          recordFatal.add(i);
        }
      }
    }

    // H: dates must be REAL, and an amendment cannot have been reviewed before it was approved
    // or in the future. An advisory added later than the approval belongs in its own record.
    for (const f of ['approved_on', 'reviewed_on', 'expires_on']) {
      if (!isRealDate(r[f])) {
        problems.push(`${where}: ${f} is ${JSON.stringify(r[f])}, which is not a real calendar date (YYYY-MM-DD)`);
        recordFatal.add(i);
      }
    }
    if (!recordFatal.has(i)) {
      if (r.reviewed_on < r.approved_on) {
        problems.push(`${where}: reviewed_on ${r.reviewed_on} precedes approved_on ${r.approved_on}`);
        recordFatal.add(i);
      }
      if (r.reviewed_on > runDate) {
        problems.push(`${where}: reviewed_on ${r.reviewed_on} is in the future relative to ${runDate}`);
        recordFatal.add(i);
      }
      if (r.expires_on <= r.approved_on) {
        problems.push(`${where}: expires_on ${r.expires_on} is not after approved_on ${r.approved_on}`);
        recordFatal.add(i);
      }
    }

    const ids = advisoryIdsOf(r);
    if (ids.length === 0) {
      problems.push(`${where}: declares no advisory_id or advisory_ids`);
    }
    for (const id of ids) {
      if (!ADVISORY_ID.test(id)) problems.push(`${where}: '${id}' is not a recognised advisory id`);
    }
    if (new Set(ids).size !== ids.length) {
      problems.push(`${where}: duplicate advisory ids within the record`);
    }

    if (typeof r.id === 'string') {
      if (seenIds.has(r.id)) problems.push(`${where}: duplicate record id '${r.id}'`);
      seenIds.add(r.id);
    }

    // OVERBROAD: a disposition must be scoped to a package, not just an advisory.
    if (typeof r.package_purl === 'string' && !r.package_purl.startsWith('pkg:')) {
      problems.push(`${where}: package_purl '${r.package_purl}' is not a PURL`);
    }
    // A legacy PREFIX field is no longer accepted: a prefix can match a different
    // installed version of the same package, which is a different finding.
    if (r.package_purl_prefix !== undefined) {
      problems.push(
        `${where}: 'package_purl_prefix' is no longer accepted — a prefix can match a ` +
        'different installed version. Declare the exact `package_purl`.',
      );
    }
    // Severity must be an explicit governed array, never a composite label.
    if (!Array.isArray(r.severities)) {
      if (typeof r.severity === 'string') {
        problems.push(
          `${where}: 'severity' ${JSON.stringify(r.severity)} is an ambiguous scalar — declare an ` +
          "explicit `severities` array (a record approved for HIGH must not absorb a CRITICAL)",
        );
      }
    } else {
      if (r.severities.length === 0) problems.push(`${where}: severities is empty`);
      for (const sev of r.severities) {
        if (!ALLOWED_SEVERITIES.includes(sev)) {
          problems.push(`${where}: severity '${sev}' is not one of ${ALLOWED_SEVERITIES.join(', ')}`);
        }
      }
      if (new Set(r.severities).size !== r.severities.length) {
        problems.push(`${where}: duplicate entries in severities`);
      }
    }
    if (typeof r.image === 'string' && !/@sha256:[a-f0-9]{64}$/.test(r.image)) {
      problems.push(`${where}: image '${r.image}' must be digest-pinned`);
    }
    if (typeof r.scan_platform === 'string' && !/^[a-z0-9]+\/[a-z0-9]+$/.test(r.scan_platform)) {
      problems.push(`${where}: scan_platform '${r.scan_platform}' is not an os/arch pair`);
    }

    // Ownership and approval must be separable parties.
    if (typeof r.owner === 'string' && r.owner === r.approver) {
      problems.push(
        `${where}: approver '${r.approver}' is the same party as the owner; a disposition ` +
        'cannot approve itself',
      );
    }

    // Dates: well formed, chronological, unexpired.
    for (const f of ['approved_on', 'expires_on']) {
      if (typeof r[f] === 'string' && !ISO_DATE.test(r[f])) {
        problems.push(`${where}: ${f} '${r[f]}' is not an ISO YYYY-MM-DD date`);
      }
    }
    if (ISO_DATE.test(String(r.approved_on)) && ISO_DATE.test(String(r.expires_on))) {
      if (r.expires_on <= r.approved_on) {
        problems.push(`${where}: expires_on ${r.expires_on} is not after approved_on ${r.approved_on}`);
      }
      if (r.approved_on > runDate) {
        problems.push(`${where}: approved_on ${r.approved_on} is in the future relative to ${runDate}`);
      }
      /**
       * `<=`, not `<`. The evidence document says "every record expires 2026-11-05 and is rejected
       * by the gate from that date", and `<` rejected it only from the 6th - the record stayed in
       * force through the whole of its stated expiry day. Aligning the code with the sentence that
       * governs it costs a day of suppression and removes a contradiction.
       */
      /**
       * `prohibited_use` states where the acceptance does NOT apply, and a RISK_ACCEPTED record
       * cannot omit it.
       *
       * Validating it only when present left it removable: deleting the scope boundary produced no
       * finding at all, so the one field saying "not for production data, not for Phase 1" could be
       * dropped silently. A NOT_AFFECTED record accepts no risk and therefore bounds none, which is
       * why the requirement follows the classification rather than the record id.
       */
      if (r.classification === 'RISK_ACCEPTED' && r.prohibited_use === undefined) {
        problems.push(`${where}: a RISK_ACCEPTED record must declare prohibited_use; an acceptance `
          + 'without a stated scope is an acceptance without a limit');
      }
      if (r.prohibited_use !== undefined) {
        if (!Array.isArray(r.prohibited_use) || r.prohibited_use.length === 0) {
          problems.push(`${where}: prohibited_use must be a nonempty array of scope strings`);
        } else if (r.prohibited_use.some((x) => typeof x !== 'string' || x.trim() === '')) {
          problems.push(`${where}: every prohibited_use entry must be a nonempty string`);
        }
      }
      if (r.expires_on <= runDate) {
        problems.push(`${where}: EXPIRED — expires_on ${r.expires_on} is not after the run date `
          + `${runDate}; a record is rejected ON its stated expiry date, not the day after`);
      }
    }

    // Evidence must be a real, tracked, repository-relative file.
    if (typeof r.evidence === 'string' && r.evidence !== '') {
      if (r.evidence.startsWith('/') || r.evidence.includes('..')) {
        problems.push(`${where}: evidence '${r.evidence}' must be a repository-relative path`);
      } else if (!existsSync(join(root, r.evidence))) {
        problems.push(`${where}: evidence '${r.evidence}' does not exist`);
      } else if (isTracked !== undefined && !isTracked(r.evidence)) {
        problems.push(`${where}: evidence '${r.evidence}' is not tracked in version control`);
      }
    }

    // Duplicate scope: two records covering the same advisory+image+package.
    for (const id of ids) {
      const key = `${id}|${r.image}|${r.scan_platform}|${r.package_purl}|${r.result_target}`;
      if (seenScopes.has(key)) {
        problems.push(`${where}: duplicates the scope already covered by ${seenScopes.get(key)}`);
      } else {
        seenScopes.set(key, r.id ?? where);
      }
    }
  }

  return { problems, fatalIndices: [...recordFatal].sort((a, b) => a - b) };
}

/** A readable type name for a diagnostic, distinguishing null and arrays from objects. */
function describeType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Reconcile governed records against the ACTUAL finding set from an unsuppressed scan.
 *
 * `findings` is a flat list of { advisory_id, image, package_name, purl, severity, target }.
 */
export function reconcileFindings(doc, findings, opts = {}) {
  // A structurally invalid record cannot govern anything, so it is removed from the
  // matching set entirely — otherwise it could still absorb a finding on the strength of
  // its advisory id alone.
  const fatal = new Set(opts.fatalIndices ?? []);
  const records = (doc.records ?? []).filter((_, i) => !fatal.has(i));
  const matchedBy = new Map();
  const unmatched = [];
  const mismatchDetail = [];
  const scanPlatform = opts.scanPlatform ?? null;

  const keyOf = (f) => `${f.advisory_id}|${f.image}|${f.purl ?? f.package_name}`;

  for (const f of findings) {
    // EVERY consequence-relevant field must agree. A record that matches on advisory id
    // alone is the bare-CVE-id problem in a different costume: it would govern a finding
    // in another package, another platform, another installed version or another severity.
    const reasons = [];
    const record = records.find((r) => {
      const why = [];
      if (!advisoryIdsOf(r).includes(f.advisory_id)) return false;
      if (r.image !== f.image) why.push(`image ${r.image} != ${f.image}`);
      if (scanPlatform !== null && r.scan_platform !== scanPlatform) {
        why.push(`platform ${r.scan_platform} != resolved ${scanPlatform}`);
      }
      if (r.package_name !== f.package_name) why.push(`package ${r.package_name} != ${f.package_name}`);
      if (r.package_purl !== f.purl) why.push(`purl ${r.package_purl} != ${f.purl}`);
      if (r.installed_version !== f.installed_version) {
        why.push(`installed_version ${r.installed_version} != ${f.installed_version}`);
      }
      // UNCONDITIONAL. Every consequence-relevant field is compared without a type guard:
      // a record that reached this point has already passed the code-owned type contract,
      // and a wrong type must never buy an exemption from matching.
      // FAIL CLOSED on a wrong type rather than coercing. `'HIGH'.includes('HIGH')` is
      // TRUE for a STRING, so comparing without an array check would let a string
      // `severities` match anyway — the very bypass this correction exists to remove.
      const severities = Array.isArray(r.severities) ? r.severities : null;
      if (severities === null) {
        why.push(`severities is ${describeType(r.severities)}, not an array of severities`);
      } else if (!severities.includes(f.severity)) {
        why.push(`severity ${f.severity} not in [${severities.join(', ')}]`);
      }
      if (r.result_target !== f.target) {
        why.push(`result_target ${JSON.stringify(r.result_target)} != ${JSON.stringify(f.target)}`);
      }
      if (why.length > 0) {
        reasons.push(`${r.id ?? '(unnamed)'}: ${why.join('; ')}`);
        return false;
      }
      return true;
    });
    if (record === undefined) {
      unmatched.push(f);
      if (reasons.length > 0) {
        mismatchDetail.push(`${f.advisory_id} (${f.severity}, ${f.package_name}): ${reasons.join(' | ')}`);
      }
      continue;
    }
    const id = record.id ?? '(unnamed)';
    matchedBy.set(id, [...(matchedBy.get(id) ?? []), keyOf(f)]);
  }

  const unused = records
    .filter((r) => (matchedBy.get(r.id ?? '(unnamed)') ?? []).length === 0)
    .map((r) => r.id ?? '(unnamed)');

  const staleAdvisories = [];
  for (const r of records) {
    const covered = new Set(
      (matchedBy.get(r.id ?? '(unnamed)') ?? []).map((k) => k.split('|')[0]),
    );
    for (const id of advisoryIdsOf(r)) {
      if (!covered.has(id)) staleAdvisories.push(`${r.id ?? '(unnamed)'}: ${id}`);
    }
  }

  return {
    total_findings: findings.length,
    matched: [...matchedBy.entries()].map(([id, keys]) => ({ record: id, findings: keys.sort() }))
      .sort((a, b) => (a.record < b.record ? -1 : 1)),
    unmatched: unmatched
      .map((f) => `${f.advisory_id} ${f.severity} ${f.package_name} ${f.purl ?? ''} in ${f.image}`)
      .sort(),
    near_miss_detail: mismatchDetail.sort(),
    unused_records: unused.sort(),
    stale_advisory_ids: staleAdvisories.sort(),
  };
}

/** Flatten a trivy JSON image report into the finding shape reconcileFindings expects. */
export function findingsFromTrivyJson(reportText, image) {
  const doc = JSON.parse(reportText);
  const out = [];
  for (const result of doc.Results ?? []) {
    for (const v of result.Vulnerabilities ?? []) {
      out.push({
        advisory_id: v.VulnerabilityID,
        image,
        package_name: v.PkgName ?? null,
        purl: v.PkgIdentifier?.PURL ?? null,
        severity: v.Severity ?? null,
        target: result.Target ?? null,
        installed_version: v.InstalledVersion ?? null,
        fixed_version: v.FixedVersion ?? null,
      });
    }
  }
  return out.sort((a, b) => (`${a.advisory_id}${a.purl}` < `${b.advisory_id}${b.purl}` ? -1 : 1));
}
