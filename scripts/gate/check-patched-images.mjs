#!/usr/bin/env node
/**
 * Resolve each service's OFFICIAL tag, scan both platform children of the index it names, and decide
 * against the CONFIGURED PIN — and REPORT.
 *
 * From 2026-09-10 to 2026-09-22 the service images were pinned, TEMPORARILY and by owner approval
 * (docs/images/DERIVED_IMAGES_APPROVAL.md), to derived maintenance builds under
 * `ghcr.io/a-halawany/elven/`, because no official `postgres:18-alpine` or `redis:8-alpine` build
 * carried the util-linux, OpenSSL and c-ares fixes. This check is what noticed the official rebuilds
 * (run 35728647457) and the compose file returned to them on 2026-09-22; the owner approved the six SCX
 * re-issues on 2026-09-23 (docs/SUPPLY_CHAIN_MAINTENANCE_2026-09.md §8).
 *
 * AFTER THE RETURN (the owner's decision of 2026-09-23 — PUBLICATION.md §8.5, SUPPLY_CHAIN_MAINTENANCE
 * §8.4) the check keeps running at the existing cadence and decides against the pin each service is
 * configured to (conformance.manifest.json `pinned_images`, held equal to docker-compose.yml by CI):
 *
 *   * the tag resolves to the CONFIGURED pin and every watched fix is present on `linux/amd64` AND
 *     `linux/arm64`                                → PASS ("the configured pin is the compatible official image");
 *   * the tag resolves to a DIFFERENT index that carries every watched fix on both platforms
 *                                                  → FAIL: a NEWER compatible official build exists — the
 *     deliberate inversion, because the good news is what has to interrupt someone — and the governed
 *     re-pin (the existing update process: re-pin, verify provenance and compatibility, re-issue or retire
 *     the SCX records that name the pin, regenerate evidence, FINAL chain) is what must follow;
 *   * the tag resolves to a different index that does NOT carry every watched fix → nothing to do, said;
 *   * the tag resolves to the configured pin but a watched fix is NOT present, or the manifest's recorded
 *     platform children disagree with the index → FAIL: the return's premise or its record is wrong;
 *   * an indeterminate check (a platform not resolvable or scannable, a report that contradicts itself)
 *                                                  → FAIL: "could not check" must not read like "nothing to do".
 *
 * It re-pins NOTHING and deletes NO evidence. The decision is `decideService` in
 * lib/c19-patched-images.mjs, pure and proven by the unit suite without a registry.
 *
 * Usage: check-patched-images.mjs [--trivy <path>] [--cache <dir>] [--manifest <path>]
 *   --manifest defaults to the tracked conformance.manifest.json; the override exists for the controls
 *   that prove the decision against a crafted pin, and this script produces no evidence to launder.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, SERVICES, assessService, decideService, readConfiguredPins } from './lib/c19-patched-images.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const trivy = val('--trivy') ?? 'trivy';
const cache = val('--cache') ?? mkdtempSync(join(tmpdir(), 'c15-recheck-'));
const manifestPath = val('--manifest') ?? join(ROOT, 'conformance.manifest.json');
// The scans write their reports here. A caller-supplied --cache that does not exist yet would make
// the scan fail for a reason that has nothing to do with the images.
mkdirSync(cache, { recursive: true });
const say = (s) => process.stdout.write(`${s}\n`);
const warn = (s) => process.stderr.write(`${s}\n`);

// ── the configured pins, read before anything is resolved ────────────────────────
// A pin that cannot be read is an indeterminate check: there is nothing to decide against.
let pins;
try {
  pins = readConfiguredPins(JSON.parse(readFileSync(manifestPath, 'utf8')));
} catch (e) {
  warn(`\nc15-recheck: the configured pins could not be read from ${manifestPath} `
    + `(${(e instanceof Error ? e.message : String(e)).slice(0, 200)}); nothing can be decided against.`);
  process.exit(1);
}

/**
 * The official INDEX a tag currently resolves to, read from the live registry, and its per-platform
 * children. `--raw` returns the index bytes themselves, so the children are derived from the
 * document rather than from a formatted listing. A single-platform manifest has no children.
 */
function resolveOfficial(tag) {
  const r = spawnSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', tag], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) return { error: `the registry index could not be resolved (${(r.stderr ?? '').trim().slice(0, 160) || `docker exited ${r.status}`})` };
  let doc;
  try { doc = JSON.parse(r.stdout); } catch (e) {
    return { error: `the registry index is not JSON (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})` };
  }
  const d = spawnSync('docker', ['buildx', 'imagetools', 'inspect', tag], { encoding: 'utf8' });
  const digest = d.status === 0 ? /^Digest:\s+(sha256:[0-9a-f]{64})/m.exec(d.stdout ?? '')?.[1] ?? null : null;
  if (digest === null) return { error: 'the registry index digest could not be resolved' };
  // The child for each watched platform, chosen by the SAME rule the gate's resolver uses
  // (scripts/gate/lib/scanner-provenance.mjs): os and architecture must match, an attestation
  // manifest (unknown/unknown) is never a child, and a variant is compared only when the watched
  // platform names one — official images list arm64 as `linux/arm64/v8`, which satisfies
  // `linux/arm64`.
  const runnable = (Array.isArray(doc.manifests) ? doc.manifests : [])
    .filter((m) => typeof m?.digest === 'string' && typeof m?.platform?.os === 'string'
      && typeof m?.platform?.architecture === 'string'
      && !(m.platform.os === 'unknown' && m.platform.architecture === 'unknown'));
  const children = {};
  for (const platform of PLATFORMS) {
    const [wantOs, wantArch, wantVariant] = platform.split('/');
    const match = runnable.find((m) => m.platform.os === wantOs && m.platform.architecture === wantArch
      && (wantVariant === undefined || (m.platform.variant ?? wantVariant) === wantVariant));
    if (match !== undefined) children[platform] = match.digest;
  }
  return { digest, children, single: !Array.isArray(doc.manifests) };
}

/** Scan one platform child of the official image; the report, or an error string. */
function scanChild(tag, ref, platform) {
  const out = join(cache, `${tag.replace(/\W+/g, '-')}-${platform.replace(/\W+/g, '-')}.json`);
  // NO --severity filter: the verdict must not depend on how an advisory is currently rated.
  const r = spawnSync(trivy, ['image', '--quiet', '--ignorefile', '/dev/null',
    '--platform', platform, '--cache-dir', cache, '--format', 'json', '--output', out, ref],
  { encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) return { error: `the scan failed (exit ${r.status})` };
  try { return { report: JSON.parse(readFileSync(out, 'utf8')) }; } catch (e) {
    return { error: `the scan report is unreadable (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})` };
  }
}

const decisions = [];
for (const [service, spec] of Object.entries(SERVICES)) {
  const tag = spec.tag;
  const pin = pins[service];
  const resolved = resolveOfficial(tag);
  if (resolved.error !== undefined) {
    say(`${service}: ${tag} -> UNRESOLVED (${resolved.error}); configured pin ${pin.digest}`);
    const v = assessService(service, {}, Object.fromEntries(PLATFORMS.map((p) => [p, resolved.error])));
    decisions.push({ ...decideService({ digest: null, children: {} }, v, pin), verdict: v });
    continue;
  }
  say(`${service}: ${tag} -> ${resolved.digest}${resolved.single ? ' (single-platform manifest)' : ''}`
    + ` — configured pin ${pin.digest} (${resolved.digest === pin.digest ? 'THE SAME index' : 'a DIFFERENT index'})`);
  const repo = tag.split(':')[0];
  const reports = {};
  const errors = {};
  for (const platform of PLATFORMS) {
    const child = resolved.single ? null : resolved.children[platform];
    if (!resolved.single && child === undefined) {
      errors[platform] = `the official index has no ${platform} child`;
      say(`  ${platform}: ABSENT from the index`);
      continue;
    }
    // The reference is the resolved DIGEST, never the moving tag — the child's when the index has
    // one, the index's own when it is a single manifest.
    const ref = `${repo}@${child ?? resolved.digest}`;
    const scanned = scanChild(tag, ref, platform);
    if (scanned.error !== undefined) {
      errors[platform] = scanned.error;
      say(`  ${platform}: ${ref} -> ${scanned.error}`);
      continue;
    }
    reports[platform] = scanned.report;
    say(`  ${platform}: ${ref}`);
  }
  const v = assessService(service, reports, errors);
  for (const platform of PLATFORMS) {
    const p = v.platforms[platform];
    for (const [id, f] of Object.entries(p.fixes)) say(`    [${id}] ${platform} ${f.state.toUpperCase()}: ${f.why}`);
  }
  say(`  ${service}: ${v.state.toUpperCase()}`);
  decisions.push({ ...decideService({ digest: resolved.digest, children: resolved.children }, v, pin), verdict: v });
}

// ── the decisions, in the order a reader needs them: indeterminate first, then the failures ──
const indeterminate = decisions.filter((d) => d.kind === 'indeterminate');
if (indeterminate.length > 0) {
  // Fail closed. "Could not check" must not read like "nothing to do".
  warn('\nc15-recheck: the official images could not be checked on both platforms:');
  for (const d of indeterminate) {
    for (const platform of PLATFORMS) {
      const p = d.verdict.platforms[platform];
      if (p.error !== null) { warn(`  ${d.tag} ${platform}: ${p.error}`); continue; }
      for (const [id, f] of Object.entries(p.fixes)) if (f.state === 'indeterminate') warn(`  ${d.tag} ${platform} [${id}]: ${f.why}`);
    }
  }
  process.exit(1);
}

const failed = decisions.filter((d) => !d.pass);
for (const d of failed) {
  warn('');
  d.lines.forEach((line, i) => warn(i === 0 ? `c15-recheck: ${line}` : line));
}
for (const d of decisions.filter((x) => x.pass)) say(`\n${d.lines.join('\n')}`);
if (failed.length > 0) process.exit(1);

const onPin = decisions.filter((d) => d.kind === 'pinned-fixed').map((d) => d.service);
const moved = decisions.filter((d) => d.kind === 'moved-affected').map((d) => d.service);
say(`\nc15-recheck: PASS — ${onPin.length > 0 ? `${onPin.join(' and ')} on the configured official pin${onPin.length > 1 ? 's' : ''} with every watched fix on both platforms` : ''}`
  + `${onPin.length > 0 && moved.length > 0 ? '; ' : ''}`
  + `${moved.length > 0 ? `${moved.join(' and ')}: the tag moved to a build that does not qualify, the configured pin stays` : ''}`
  + '; no NEWER compatible official build; nothing re-pinned, no evidence deleted.');
