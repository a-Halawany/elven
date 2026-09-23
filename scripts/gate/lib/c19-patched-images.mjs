/**
 * Decide whether an OFFICIAL image has been REBUILT with the fixed packages this repository needed —
 * and, since the return of 2026-09-22, whether the build the tag now names is the one the repository
 * is pinned to, or a NEWER one.
 *
 * ── PURPOSE (2026-09-10, completed 2026-09-23) ───────────────────────────────────
 * From 2026-09-10 to 2026-09-22 the service images were TEMPORARILY pinned to derived maintenance
 * builds (`ghcr.io/a-halawany/elven/{postgres,redis}`, docs/images/DERIVED_IMAGES_APPROVAL.md) because
 * no official `postgres:18-alpine` / `redis:8-alpine` build carried the util-linux, OpenSSL and c-ares
 * fixes. That route ended the day a COMPATIBLE FIXED OFFICIAL image existed for each service — on BOTH
 * `linux/amd64` and `linux/arm64` — and the recheck is what noticed it (run 35728647457, 2026-09-22).
 * The return was made through the governed process (re-pin, re-issue of the SCX records that named the
 * derived image, regenerated evidence, FINAL chain; docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md §8) and the
 * owner approved its six re-issues on 2026-09-23.
 *
 * ── AFTER THE RETURN (the owner's decision of 2026-09-23, PUBLICATION.md §8.5) ─────
 * The recheck keeps resolving the official tags at the existing cadence and decides against the
 * CONFIGURED PIN of each service (conformance.manifest.json `pinned_images`):
 *
 *   * the tag resolves to the configured pin and every watched fix is present on both platforms
 *     → PASS: the service is on the compatible official image;
 *   * the tag resolves to a DIFFERENT index that carries every watched fix on both platforms
 *     → FAIL: a NEWER compatible official build exists, and the governed re-pin (the existing update
 *       process, under which the records naming the pin are re-reviewed) is what must follow;
 *   * the tag resolves to a different index that does NOT carry every watched fix
 *     → nothing to do: the pin stays, and the run says so;
 *   * the tag resolves to the configured pin but a watched fix is NOT present, or the manifest's
 *     recorded platform children disagree with the index
 *     → FAIL: the return's premise no longer holds, or the record of it is wrong;
 *   * a platform that cannot be resolved or scanned
 *     → FAIL: "could not check" must never read like "nothing to do".
 *
 * The recheck reports; it re-pins nothing and deletes no evidence. The decision is `decideService`
 * below, a pure function over the per-platform verdict and the pin, so it can be proven without a
 * registry.
 *
 * ── WHY THE MODEL LOOKS LIKE THIS ────────────────────────────────────────────────
 * Two earlier versions were wrong in instructive ways.
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
 * So the model is each advisory's actual shape: half-open ranges, `introduced` inclusive, `fixed`
 * exclusive. A version is affected iff it falls inside one of them. Where a fix landed in an Alpine
 * package REVISION (util-linux: CVE-2026-78408 is fixed one revision after its siblings), the range
 * names the revision and the comparison is revision-aware; where it did not, the base decides.
 */

/** The platforms a compatible official image must qualify on. Both — the configured pins ship both. */
export const PLATFORMS = Object.freeze(['linux/amd64', 'linux/arm64']);

/**
 * OpenSSL's published affected ranges for CVE-2026-14456. Upstream ranges: a distribution that
 * backported the fix into an earlier revision — say `3.5.7-r1` — still reads as affected here. That
 * is the conservative direction: it keeps a service on its current pin a little longer rather
 * than declaring an official image fixed that is not.
 */
export const OPENSSL_FIX = Object.freeze({
  id: 'openssl',
  advisory: 'CVE-2026-14456',
  advisories: Object.freeze(['CVE-2026-14456']),
  packages: Object.freeze(['libcrypto3', 'libssl3']),
  ranges: Object.freeze([
    Object.freeze({ introduced: '3.5.0', fixed: '3.5.8' }),
    Object.freeze({ introduced: '3.6.0', fixed: '3.6.4' }),
    Object.freeze({ introduced: '4.0.0', fixed: '4.0.2' }),
  ]),
  note: 'upstream ranges; a distribution backport reads as affected, which fails safe',
});

/**
 * util-linux (CVE-2026-53612 family), 2026-09: seven HIGH advisories against `libuuid` in
 * `postgres:18-alpine` (Alpine 3.24, fixed in 2.42.3-r0 / -r1) and `setpriv` in `redis:8-alpine`
 * (Alpine 3.23, fixed in 2.41.6-r0 / -r1). Alpine PACKAGE versions, revision included:
 * CVE-2026-78408 is fixed one revision later than its siblings, so `2.42.3-r0` is still affected and
 * only `-r1` is clear.
 */
const UTIL_LINUX_ADVISORIES = Object.freeze([
  'CVE-2026-53612', 'CVE-2026-53613', 'CVE-2026-53614', 'CVE-2026-76642',
  'CVE-2026-78408', 'CVE-2026-78409', 'CVE-2026-78410',
]);
const UTIL_LINUX_RANGES = Object.freeze([
  Object.freeze({ introduced: '2.42.0', fixed: '2.42.3-r1' }), // Alpine 3.24
  Object.freeze({ introduced: '2.41.0', fixed: '2.41.6-r1' }), // Alpine 3.22 / 3.23
]);
export const UTIL_LINUX_POSTGRES_FIX = Object.freeze({
  id: 'util-linux/postgres',
  advisory: 'CVE-2026-53612',
  advisories: UTIL_LINUX_ADVISORIES,
  packages: Object.freeze(['libuuid']),
  ranges: UTIL_LINUX_RANGES,
  note: 'Alpine package ranges, revision-aware',
});
export const UTIL_LINUX_REDIS_FIX = Object.freeze({
  id: 'util-linux/redis',
  advisory: 'CVE-2026-53612',
  advisories: UTIL_LINUX_ADVISORIES,
  packages: Object.freeze(['setpriv']),
  ranges: UTIL_LINUX_RANGES,
  note: 'Alpine package ranges, revision-aware',
});

/**
 * c-ares (CVE-2026-33630), postgres only: fixed in 1.34.8 (Alpine 1.34.8-r0). `introduced: '0'`
 * because every earlier 1.34.x the official image has shipped is affected and the conservative
 * reading of an unknown lower bound is "affected".
 */
export const C_ARES_FIX = Object.freeze({
  id: 'c-ares',
  advisory: 'CVE-2026-33630',
  advisories: Object.freeze(['CVE-2026-33630']),
  packages: Object.freeze(['c-ares']),
  ranges: Object.freeze([Object.freeze({ introduced: '0', fixed: '1.34.8' })]),
  note: 'upstream fixed version; no lower bound, which fails safe',
});

/** Kept under its historical name: the OpenSSL spec was the first the recheck watched. */
export const RECHECK_SPEC = OPENSSL_FIX;

/**
 * The services, the OFFICIAL tag each one is watched on, the repository that tag names, and every
 * fix a build of that tag must carry — on every platform in PLATFORMS — before it is a compatible
 * fixed official image for that service.
 */
export const SERVICES = Object.freeze({
  postgres: Object.freeze({
    tag: 'postgres:18-alpine',
    /** The repository the official tag names; the configured pin has been under it since 2026-09-22. */
    repository: 'postgres',
    fixes: Object.freeze([OPENSSL_FIX, UTIL_LINUX_POSTGRES_FIX, C_ARES_FIX]),
    /**
     * The governed records scoped to this service's CONFIGURED image, which a re-pin re-scopes.
     * SCX-0002..0005 govern its linux/amd64 child; SCX-0010 and SCX-0011 govern the linux/arm64
     * child, which the gate began scanning on 2026-09-10. Re-issued on 2026-09-10 for the derived
     * image and on 2026-09-23 for the official index the compose file returned to on 2026-09-22
     * (docs/SCANNER_DISPOSITIONS.md §3.9). A re-pin to a NEWER build re-scopes ALL of them, on both
     * platforms, or the ones left behind fail as unused. A control holds this list equal to the
     * tracked records that name the configured pin.
     */
    records: Object.freeze(['SCX-0002', 'SCX-0003', 'SCX-0004', 'SCX-0005', 'SCX-0010', 'SCX-0011']),
  }),
  redis: Object.freeze({
    tag: 'redis:8-alpine',
    repository: 'redis',
    fixes: Object.freeze([OPENSSL_FIX, UTIL_LINUX_REDIS_FIX]),
    records: Object.freeze([]),
  }),
});

/** Every fix the recheck watches, in the order it reports them. */
export const RECHECK_SPECS = Object.freeze([OPENSSL_FIX, UTIL_LINUX_POSTGRES_FIX, UTIL_LINUX_REDIS_FIX, C_ARES_FIX]);

/** The advisory ids a spec watches, whichever field names them. */
export function advisoriesOf(spec) {
  return Array.isArray(spec?.advisories) && spec.advisories.length > 0 ? spec.advisories : [spec?.advisory].filter(Boolean);
}

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

/** Is this version inside one of the spec's affected ranges? null when unparseable. */
export function isAffectedVersion(version, spec = RECHECK_SPEC) {
  const p = parseApkVersion(version);
  if (p === null) return null;
  for (const r of spec.ranges) {
    const introduced = parseApkVersion(r.introduced);
    const fixed = parseApkVersion(r.fixed);
    if (compareBase(p.base, introduced.base) < 0) continue;
    if (compareBase(p.base, fixed.base) < 0) return true;
    // At the fixed BASE: affected only when the range names a revision the package has not reached.
    // An unknown revision on the package reads as affected — the conservative direction.
    if (compareBase(p.base, fixed.base) === 0 && fixed.rev !== null && (p.rev === null || p.rev < fixed.rev)) return true;
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
 * `affected` | `patched` | `indeterminate`, for ONE fix in ONE scan report.
 *
 * `indeterminate` is a first-class answer and is never folded into the others: a report we cannot
 * read, or one that disagrees with itself, tells us nothing about whether the official image was
 * rebuilt. Declaring an image fixed on the strength of a parse failure or a contradiction is the
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
  const ids = advisoriesOf(spec);
  const label = ids.join('/');
  const listed = results.flatMap((r) => (Array.isArray(r?.Vulnerabilities) ? r.Vulnerabilities : []))
    .filter((v) => ids.includes(v?.VulnerabilityID));

  // ── 3. reconcile the two before trusting either ──
  const at = [...inventory].map(([n, vs]) => `${n} ${vs[0]}`).join(', ');
  if (listed.length > 0 && affectedByInventory.length === 0) {
    const rows = [...new Set(listed.map((v) => `${v.PkgName} ${v.InstalledVersion}`))].join(', ');
    return {
      state: 'indeterminate',
      why: `${label} is still reported (${rows}) but the installed inventory is outside every `
        + `affected range (${at}); the report disagrees with itself and cannot settle whether the `
        + 'image was rebuilt',
    };
  }
  if (affectedByInventory.length > 0) {
    return {
      state: 'affected',
      why: `${affectedByInventory.join(', ')} falls inside an affected range`
        + (listed.length > 0 ? ` and ${label} is reported (${listed.length} row(s))`
          : `; ${label} is no longer listed, but the package was not rebuilt`),
      severities: [...new Set(listed.map((v) => v.Severity))],
      versions: at,
    };
  }
  return { state: 'patched', why: `${at} is outside every affected range for ${label}`, versions: at };
}

/**
 * The verdict for ONE SERVICE from its per-platform reports:
 *
 *   `fixed`         every fix is `patched` on EVERY platform in PLATFORMS — a compatible fixed
 *                   official image exists for the service (subject to the governed return);
 *   `affected`      at least one fix is still `affected` somewhere, and nothing is indeterminate;
 *   `indeterminate` any platform is missing, unreadable or contradictory — "could not check" must
 *                   never read like either of the others.
 *
 * `reports` maps platform → parsed trivy report, or null when that platform could not be scanned
 * (`platformErrors` says why). A platform ABSENT from the official index is a fact about the image
 * (it does not qualify), recorded as indeterminate here on purpose: the recheck exists to say when
 * the return CAN happen, and an image that cannot run on one of the two platforms cannot be checked
 * for it, let alone chosen.
 */
export function assessService(service, reports, platformErrors = {}, platforms = PLATFORMS) {
  const spec = SERVICES[service];
  if (spec === undefined) throw new Error(`unknown service ${JSON.stringify(service)}`);
  const perPlatform = {};
  let indeterminate = 0;
  let affected = 0;
  for (const platform of platforms) {
    const report = reports?.[platform] ?? null;
    if (report === null) {
      perPlatform[platform] = {
        error: platformErrors[platform] ?? 'no report',
        fixes: Object.fromEntries(spec.fixes.map((f) => [f.id, { state: 'indeterminate', why: platformErrors[platform] ?? 'no report' }])),
      };
      indeterminate += spec.fixes.length;
      continue;
    }
    const fixes = {};
    for (const fix of spec.fixes) {
      const v = assessReport(report, fix);
      fixes[fix.id] = v;
      if (v.state === 'indeterminate') indeterminate += 1;
      if (v.state === 'affected') affected += 1;
    }
    perPlatform[platform] = { error: null, fixes };
  }
  const state = indeterminate > 0 ? 'indeterminate' : affected > 0 ? 'affected' : 'fixed';
  return { service, tag: spec.tag, state, platforms: perPlatform, records: [...spec.records] };
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PINNED_REF = /^([^@\s]+)@(sha256:[0-9a-f]{64})$/;

/**
 * The CONFIGURED PIN of each watched service, read from conformance.manifest.json (`pinned_images`),
 * the document the compose file is held equal to by CI's "Pinned-digest consistency" step.
 *
 * Throws on anything malformed rather than answering with a partial map: the recheck decides
 * against these values, and a pin it cannot read is an indeterminate check, not a pass.
 */
export function readConfiguredPins(manifest, services = SERVICES) {
  const pinned = manifest?.pinned_images;
  if (pinned === null || typeof pinned !== 'object' || Array.isArray(pinned)) {
    throw new Error('conformance.manifest.json has no pinned_images object');
  }
  const out = {};
  for (const [service, spec] of Object.entries(services)) {
    const entry = pinned[service];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`pinned_images.${service} is missing`);
    }
    const m = typeof entry.digest === 'string' ? PINNED_REF.exec(entry.digest) : null;
    if (m === null) {
      throw new Error(`pinned_images.${service}.digest ${JSON.stringify(entry.digest)} is not a name@sha256:<64 hex> reference`);
    }
    const children = {};
    const declared = entry.platform_children;
    if (declared !== undefined) {
      if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
        throw new Error(`pinned_images.${service}.platform_children is not an object`);
      }
      for (const [platform, digest] of Object.entries(declared)) {
        if (typeof digest !== 'string' || !DIGEST.test(digest)) {
          throw new Error(`pinned_images.${service}.platform_children[${platform}] ${JSON.stringify(digest)} is not a sha256 digest`);
        }
        children[platform] = digest;
      }
    }
    out[service] = {
      service,
      tag: spec.tag,
      reference: entry.digest,
      repository: m[1],
      digest: m[2],
      human_tag: typeof entry.human_tag === 'string' ? entry.human_tag : null,
      pinned_at: typeof entry.pinned_at === 'string' ? entry.pinned_at : null,
      children,
    };
  }
  return out;
}

/**
 * The DECISION for one service after the return: the verdict of the tag's CURRENT index, judged
 * against the CONFIGURED pin. Pure, so it can be proven without a registry.
 *
 * `resolved` is `{ digest, children }` for the tag's current index (`digest` null when the index
 * could not be resolved); `verdict` is `assessService(...)` over that index's children; `pin` is
 * this service's entry from `readConfiguredPins`.
 *
 * Returns `{ kind, pass, lines, digest, pinned, moved }`:
 *   `indeterminate`     FAIL  a platform could not be resolved or scanned (or the verdict says so);
 *   `pinned-children`   FAIL  the tag is the pin but the manifest's platform_children disagree with
 *                             the index — the record of the return is wrong, and a scan of the
 *                             children the manifest names would be a scan of something else;
 *   `pinned-fixed`      PASS  the tag is the configured pin and every watched fix is present on
 *                             both platforms: the service is on the compatible official image;
 *   `pinned-affected`   FAIL  the tag is the configured pin but a watched fix is NOT present: the
 *                             return's premise no longer holds and someone has to look;
 *   `newer-fixed`       FAIL  a DIFFERENT index carries every watched fix on both platforms — a
 *                             NEWER compatible official build; the governed re-pin (the existing
 *                             update process) is what must follow;
 *   `moved-affected`    PASS  a different index that does not carry every watched fix: the pin
 *                             stays; nothing to do, said out loud.
 */
export function decideService(resolved, verdict, pin) {
  const service = verdict.service;
  const tag = verdict.tag;
  const fixes = Object.keys(verdict.platforms[PLATFORMS[0]]?.fixes ?? {});
  const digest = typeof resolved?.digest === 'string' ? resolved.digest : null;
  const children = resolved?.children ?? {};
  const pinned = pin?.digest ?? null;
  const moved = digest !== null && pinned !== null && digest !== pinned;
  const base = { service, tag, digest, pinned, moved, state: verdict.state, records: verdict.records };

  if (verdict.state === 'indeterminate' || digest === null || pinned === null) {
    return { ...base, kind: 'indeterminate', pass: false, lines: [] };
  }
  if (!moved) {
    const disagree = PLATFORMS
      .filter((p) => pin.children[p] !== undefined && children[p] !== undefined && pin.children[p] !== children[p])
      .map((p) => `${p}: the index lists ${children[p]}, the manifest names ${pin.children[p]}`);
    if (disagree.length > 0) {
      return {
        ...base,
        kind: 'pinned-children',
        pass: false,
        lines: [
          `${service}: the tag ${tag} resolves to the configured pin ${pinned}, but the manifest's platform_children`
            + ' disagree with the index it names:',
          ...disagree.map((d) => `  ${d}`),
          '  The record of the return is wrong or the manifest was edited; correct conformance.manifest.json'
            + ' through the governed process. Nothing was re-pinned and no evidence was deleted.',
        ],
      };
    }
    if (verdict.state === 'fixed') {
      return {
        ...base,
        kind: 'pinned-fixed',
        pass: true,
        lines: [
          `${service}: the configured pin is the compatible official image (${tag} -> ${pinned}; every watched fix`
            + ` (${fixes.join(', ')}) is present on ${PLATFORMS.join(' and ')})`,
        ],
      };
    }
    const affected = PLATFORMS.flatMap((p) => Object.entries(verdict.platforms[p].fixes)
      .filter(([, f]) => f.state === 'affected').map(([id, f]) => `${p} [${id}]: ${f.why}`));
    return {
      ...base,
      kind: 'pinned-affected',
      pass: false,
      lines: [
        `${service}: the CONFIGURED pin ${pinned} (${tag}) does NOT carry every watched fix:`,
        ...affected.map((a) => `  ${a}`),
        "  The return's premise no longer holds for this pin. Re-review the pin and the records scoped to it"
          + ` (${verdict.records.length > 0 ? verdict.records.join(', ') : 'none'}) through the governed process`
          + ' (docs/SCANNER_DISPOSITIONS.md §5). Nothing was re-pinned and no evidence was deleted.',
      ],
    };
  }
  if (verdict.state === 'fixed') {
    return {
      ...base,
      kind: 'newer-fixed',
      pass: false,
      lines: [
        `a COMPATIBLE FIXED OFFICIAL image now exists for ${service}: ${tag} -> ${digest}`,
        `  NEWER than the configured pin ${pinned}: the tag has moved.`,
        ...PLATFORMS.map((p) => `  ${p} child ${children[p] ?? digest}`),
        `  every watched fix (${fixes.join(', ')}) is present on both platforms.`,
        '  This is a REPORT: nothing was re-pinned and no evidence was deleted. Move the service to the newer',
        '  official image through the governed process — re-pin docker-compose.yml and conformance.manifest.json',
        `  to ${tag.split(':')[0]}@${digest}, verify its provenance and compatibility, ${verdict.records.length > 0
          ? `re-issue or retire ${verdict.records.join(', ')} (they name the configured pin)`
          : 'confirm no SCX record names the configured pin'}, regenerate the`,
        '  evidence, run the FINAL chain (docs/SCANNER_DISPOSITIONS.md §5; docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md §8.4).',
      ],
    };
  }
  const affected = PLATFORMS.flatMap((p) => Object.entries(verdict.platforms[p].fixes)
    .filter(([, f]) => f.state === 'affected').map(([id]) => `${p} [${id}]`));
  return {
    ...base,
    kind: 'moved-affected',
    pass: true,
    lines: [
      `${service}: the tag ${tag} now resolves to ${digest}, which does not carry every watched fix`
        + ` (${affected.join(', ')} affected); the configured pin ${pinned} stays — nothing to do`,
    ],
  };
}
