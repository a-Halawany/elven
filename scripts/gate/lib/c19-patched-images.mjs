/**
 * Decide whether an official image has been REBUILT with the fixed package.
 *
 * The first version of this asked a scanner for HIGH/CRITICAL findings and read "no finding" as
 * "patched". That is wrong in a way that matters: severity is an advisory database's editorial
 * judgement and it changes. If Trivy reclassifies CVE-2026-14456 from HIGH to Low, a severity
 * filter stops returning it, and an acceptance that exists only because the image is unpatched
 * would silently be declared resolved while the vulnerable code sat exactly where it was.
 *
 * So the decision is made on the INSTALLED PACKAGE VERSION, which is a fact about the image rather
 * than an opinion about the vulnerability. The advisory listing is still consulted, but only as
 * corroboration: if it is present the image is affected regardless of what the versions say.
 */

/** What is being watched. One record per package, matching the governed dispositions. */
export const RECHECK_SPEC = Object.freeze({
  advisory: 'CVE-2026-14456',
  packages: Object.freeze(['libcrypto3', 'libssl3']),
  fixedVersion: '3.5.8-r0',
  tags: Object.freeze(['postgres:18-alpine', 'redis:8-alpine']),
});

/**
 * Compare two Alpine package versions of the form `<dotted>-r<N>`.
 *
 * Deliberately narrow: it handles the shape these packages actually use and refuses anything else
 * rather than guessing. A comparison that silently returns 0 for input it does not understand would
 * report "not older than the fix", which is the answer that closes an acceptance.
 */
export function compareApkVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+(?:\.\d+)*)-r(\d+)$/.exec(String(v ?? '').trim());
    if (m === null) return null;
    return { parts: m[1].split('.').map(Number), rev: Number(m[2]) };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa === null || pb === null) return null;
  const n = Math.max(pa.parts.length, pb.parts.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa.parts[i] ?? 0;
    const y = pb.parts[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (pa.rev !== pb.rev) return pa.rev < pb.rev ? -1 : 1;
  return 0;
}

/**
 * `affected` | `patched` | `indeterminate`.
 *
 * `indeterminate` is a first-class answer, never folded into either of the others: a report we
 * cannot read tells us nothing about whether the acceptance is still justified, and treating that
 * as "patched" would retire a disposition on the strength of a parse failure.
 */
export function assessReport(report, spec = RECHECK_SPEC) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return { state: 'indeterminate', why: 'the scan report is not an object' };
  }
  const results = report.Results;
  if (!Array.isArray(results)) {
    return { state: 'indeterminate', why: 'the scan report carries no Results array' };
  }

  // 1 — the advisory itself, at ANY severity. Presence settles it.
  const listed = results.flatMap((r) => (Array.isArray(r.Vulnerabilities) ? r.Vulnerabilities : []))
    .filter((v) => v?.VulnerabilityID === spec.advisory);
  if (listed.length > 0) {
    const versions = [...new Set(listed.map((v) => v.InstalledVersion))].join(', ');
    return {
      state: 'affected',
      why: `${spec.advisory} is still reported (${listed.length} finding(s), installed ${versions})`,
      severities: [...new Set(listed.map((v) => v.Severity))],
    };
  }

  // 2 — the installed versions, which do not depend on how the advisory is currently rated.
  const found = new Map();
  for (const r of results) {
    for (const pkg of (Array.isArray(r.Packages) ? r.Packages : [])) {
      if (spec.packages.includes(pkg?.Name)) found.set(pkg.Name, pkg.Version);
    }
  }
  const missing = spec.packages.filter((n) => !found.has(n));
  if (missing.length > 0) {
    return {
      state: 'indeterminate',
      why: `the report lists no installed version for ${missing.join(', ')}, so whether the image `
        + 'was rebuilt cannot be decided from it',
    };
  }
  const older = [];
  for (const [name, version] of found) {
    const cmp = compareApkVersions(version, spec.fixedVersion);
    if (cmp === null) {
      return {
        state: 'indeterminate',
        why: `${name} reports version ${JSON.stringify(version)}, which is not a comparable apk `
          + 'version; refusing to guess whether it predates the fix',
      };
    }
    if (cmp < 0) older.push(`${name} ${version}`);
  }
  if (older.length > 0) {
    return {
      state: 'affected',
      why: `${older.join(', ')} still predates ${spec.fixedVersion}; the advisory is no longer `
        + 'listed, but the package was not rebuilt',
    };
  }
  const at = [...found].map(([n, v]) => `${n} ${v}`).join(', ');
  return { state: 'patched', why: `${at} is at or past ${spec.fixedVersion}` };
}
