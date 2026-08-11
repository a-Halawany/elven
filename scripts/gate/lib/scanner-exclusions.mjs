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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CODE-OWNED contract. Deliberately NOT read from the governance document: a document
 * that defines its own required fields can weaken its own validation by editing itself.
 */
export const REQUIRED_FIELDS = Object.freeze([
  'id', 'image', 'scan_platform', 'package_name', 'package_purl_prefix',
  'reason', 'compensating_controls', 'owner', 'approver', 'evidence',
  'approved_on', 'expires_on',
]);
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(['1.0.0']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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
  for (const id of record.advisory_ids ?? []) ids.push(id);
  return ids;
}

/**
 * Validate the governance of every record, independent of any scan.
 * `runDate` is an ISO YYYY-MM-DD string; `tracked` decides whether an evidence path is
 * under version control.
 */
export function validateRecords(doc, { runDate, root, isTracked }) {
  const problems = [];

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc.schema_version)) {
    problems.push(
      `scanner-exclusions schema_version ${JSON.stringify(doc.schema_version)} is not one of ` +
      `the code-owned supported versions (${SUPPORTED_SCHEMA_VERSIONS.join(', ')})`,
    );
  }

  const seenIds = new Set();
  const seenScopes = new Map();

  for (const [i, r] of (doc.records ?? []).entries()) {
    const where = `records[${i}]${typeof r.id === 'string' ? ` (${r.id})` : ''}`;

    for (const field of REQUIRED_FIELDS) {
      const v = r[field];
      const empty = v === undefined || v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0);
      if (empty) problems.push(`${where}: missing required field '${field}'`);
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
    if (typeof r.package_purl_prefix === 'string' && !r.package_purl_prefix.startsWith('pkg:')) {
      problems.push(`${where}: package_purl_prefix '${r.package_purl_prefix}' is not a PURL`);
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
      if (r.expires_on < runDate) {
        problems.push(`${where}: EXPIRED — expires_on ${r.expires_on} is before the run date ${runDate}`);
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
      const key = `${id}|${r.image}|${r.package_purl_prefix}`;
      if (seenScopes.has(key)) {
        problems.push(`${where}: duplicates the scope already covered by ${seenScopes.get(key)}`);
      } else {
        seenScopes.set(key, r.id ?? where);
      }
    }
  }

  return problems;
}

/**
 * Reconcile governed records against the ACTUAL finding set from an unsuppressed scan.
 *
 * `findings` is a flat list of { advisory_id, image, package_name, purl, severity, target }.
 */
export function reconcileFindings(doc, findings) {
  const records = doc.records ?? [];
  const matchedBy = new Map();          // record id -> [finding keys]
  const unmatched = [];

  const keyOf = (f) => `${f.advisory_id}|${f.image}|${f.purl ?? f.package_name}`;

  for (const f of findings) {
    const record = records.find((r) => {
      if (!advisoryIdsOf(r).includes(f.advisory_id)) return false;
      if (r.image !== f.image) return false;
      if (typeof r.package_name === 'string' && r.package_name !== f.package_name) return false;
      if (typeof r.package_purl_prefix === 'string') {
        if (typeof f.purl !== 'string' || !f.purl.startsWith(r.package_purl_prefix)) return false;
      }
      return true;
    });
    if (record === undefined) {
      unmatched.push(f);
      continue;
    }
    const id = record.id ?? '(unnamed)';
    matchedBy.set(id, [...(matchedBy.get(id) ?? []), keyOf(f)]);
  }

  const unused = records
    .filter((r) => (matchedBy.get(r.id ?? '(unnamed)') ?? []).length === 0)
    .map((r) => r.id ?? '(unnamed)');

  // Advisory ids declared inside a record that matched nothing at all.
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
