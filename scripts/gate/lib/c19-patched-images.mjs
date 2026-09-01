/**
 * Decide whether an official image has been REBUILT with a fixed package.
 *
 * Two earlier versions of this were wrong in instructive ways.
 *
 * The first asked a scanner for HIGH/CRITICAL findings and read "no finding" as "patched". Severity
 * is an advisory database's editorial judgement and it changes; reading a reclassification as a fix
 * would retire a disposition while the vulnerable code sat exactly where it was.
 *
 * The second compared every version against a single threshold, `3.5.8-r0`. CVE-2026-14456 does not
 * have one threshold. It has three branch-specific ranges, and a single global compare gets two
 * whole classes of answer wrong: it calls 3.6.0 and 4.0.0 "patched" because they sort above 3.5.8
 * while they are squarely inside their own affected ranges, and it calls 3.4.x "affected" because
 * it sorts below, when that branch predates the QUIC listener entirely.
 *
 * So the model is the advisory's actual shape: half-open ranges per branch. A version is affected
 * iff it falls inside one of them.
 */

/**
 * OpenSSL's published affected ranges for CVE-2026-14456. `introduced` is inclusive, `fixed` is
 * exclusive - the shape the advisory itself uses.
 */
export const RECHECK_SPEC = Object.freeze({
  advisory: 'CVE-2026-14456',
  packages: Object.freeze(['libcrypto3', 'libssl3']),
  ranges: Object.freeze([
    Object.freeze({ introduced: '3.5.0', fixed: '3.5.8' }),
    Object.freeze({ introduced: '3.6.0', fixed: '3.6.4' }),
    Object.freeze({ introduced: '4.0.0', fixed: '4.0.2' }),
  ]),
  tags: Object.freeze(['postgres:18-alpine', 'redis:8-alpine']),
  /**
   * The ranges are UPSTREAM. A distribution that backported the fix into an earlier revision - say
   * `3.5.7-r1` - still reads as affected here. That is the conservative direction: it keeps an
   * acceptance in force that could have been retired, rather than retiring one that should stand.
   */
  note: 'upstream ranges; a distribution backport reads as affected, which fails safe',
});

/** `{ base: [major, minor, patch], rev }`, or null for anything this does not understand. */
export function parseApkVersion(v) {
  const m = /^(\d+(?:\.\d+)*)(?:-r(\d+))?$/.exec(String(v ?? '').trim());
  if (m === null) return null;
  return { base: m[1].split('.').map(Number), rev: m[2] === undefined ? null : Number(m[2]) };
}

/** Compare dotted numeric version parts. Component-wise, so 3.10 > 3.9. */
function compareBase(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Compare two package versions, including the `-rN` revision when both carry one.
 * Returns null when either side is not a version this understands - never 0, because "equal" is an
 * answer and "I could not read it" is not.
 */
export function compareApkVersions(a, b) {
  const pa = parseApkVersion(a);
  const pb = parseApkVersion(b);
  if (pa === null || pb === null) return null;
  const base = compareBase(pa.base, pb.base);
  if (base !== 0) return base;
  if (pa.rev === null || pb.rev === null) return 0;
  if (pa.rev !== pb.rev) return pa.rev < pb.rev ? -1 : 1;
  return 0;
}

/** Is this version inside one of the advisory's affected ranges? null when unparseable. */
export function isAffectedVersion(version, spec = RECHECK_SPEC) {
  const p = parseApkVersion(version);
  if (p === null) return null;
  for (const r of spec.ranges) {
    const introduced = parseApkVersion(r.introduced);
    const fixed = parseApkVersion(r.fixed);
    if (compareBase(p.base, introduced.base) >= 0 && compareBase(p.base, fixed.base) < 0) return true;
  }
  return false;
}

/**
 * Every observed version per watched package - a LIST, not a map entry.
 *
 * A `Map` set in a loop silently keeps whichever row came last, so an image reporting one package at
 * two conflicting versions produced an answer that depended on result ordering. Two versions of one
 * package is a contradiction about what is installed, and contradictions are indeterminate.
 */
export function inventoryVersions(results, spec = RECHECK_SPEC) {
  const seen = new Map(spec.packages.map((n) => [n, []]));
  for (const r of (Array.isArray(results) ? results : [])) {
    for (const pkg of (Array.isArray(r?.Packages) ? r.Packages : [])) {
      if (seen.has(pkg?.Name)) seen.get(pkg.Name).push(pkg.Version);
    }
  }
  return seen;
}

/**
 * `affected` | `patched` | `indeterminate`.
 *
 * `indeterminate` is a first-class answer and is never folded into the others: a report we cannot
 * read, or one that disagrees with itself, tells us nothing about whether the acceptance is still
 * justified. Retiring a disposition on the strength of a parse failure or a contradiction is the
 * outcome this exists to prevent.
 */
export function assessReport(report, spec = RECHECK_SPEC) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return { state: 'indeterminate', why: 'the scan report is not an object' };
  }
  const results = report.Results;
  if (!Array.isArray(results)) {
    return { state: 'indeterminate', why: 'the scan report carries no Results array' };
  }

  // ── 1. the installed inventory, which is a fact about the image ──
  const inventory = inventoryVersions(results, spec);
  const missing = [...inventory].filter(([, v]) => v.length === 0).map(([n]) => n);
  if (missing.length > 0) {
    return {
      state: 'indeterminate',
      why: `the report lists no installed version for ${missing.join(', ')}, so whether the image `
        + 'was rebuilt cannot be decided from it',
    };
  }
  const conflicting = [...inventory]
    .filter(([, vs]) => new Set(vs).size > 1)
    .map(([n, vs]) => `${n} (${[...new Set(vs)].join(' vs ')})`);
  if (conflicting.length > 0) {
    return {
      state: 'indeterminate',
      why: `the report gives more than one installed version for ${conflicting.join(', ')}; which `
        + 'one is installed decides the verdict, so a contradiction cannot be resolved by picking one',
    };
  }

  const affectedByInventory = [];
  for (const [name, versions] of inventory) {
    const version = versions[0];
    const affected = isAffectedVersion(version, spec);
    if (affected === null) {
      return {
        state: 'indeterminate',
        why: `${name} reports version ${JSON.stringify(version)}, which is not a comparable version; `
          + 'refusing to guess which advisory range it falls in',
      };
    }
    if (affected) affectedByInventory.push(`${name} ${version}`);
  }

  // ── 2. the advisory rows, at ANY severity ──
  const listed = results.flatMap((r) => (Array.isArray(r?.Vulnerabilities) ? r.Vulnerabilities : []))
    .filter((v) => v?.VulnerabilityID === spec.advisory);

  // ── 3. reconcile the two before trusting either ──
  if (listed.length > 0 && affectedByInventory.length === 0) {
    const rows = [...new Set(listed.map((v) => `${v.PkgName} ${v.InstalledVersion}`))].join(', ');
    const inv = [...inventory].map(([n, vs]) => `${n} ${vs[0]}`).join(', ');
    return {
      state: 'indeterminate',
      why: `${spec.advisory} is still reported (${rows}) but the installed inventory is outside every `
        + `affected range (${inv}); the report disagrees with itself and cannot settle whether the `
        + 'image was rebuilt',
    };
  }
  if (affectedByInventory.length > 0) {
    return {
      state: 'affected',
      why: `${affectedByInventory.join(', ')} falls inside an affected range`
        + (listed.length > 0 ? ` and ${spec.advisory} is reported (${listed.length} row(s))`
          : `; ${spec.advisory} is no longer listed, but the package was not rebuilt`),
      severities: [...new Set(listed.map((v) => v.Severity))],
    };
  }
  const at = [...inventory].map(([n, vs]) => `${n} ${vs[0]}`).join(', ');
  return { state: 'patched', why: `${at} is outside every affected range for ${spec.advisory}` };
}
