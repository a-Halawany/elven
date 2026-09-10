#!/usr/bin/env node
/**
 * Detect a COMPATIBLE FIXED OFFICIAL image for each service, and REPORT it.
 *
 * Since 2026-09-10 the service images are pinned, TEMPORARILY and by owner approval
 * (docs/images/DERIVED_IMAGES_APPROVAL.md), to derived maintenance builds under
 * `ghcr.io/a-halawany/elven/`, because no official `postgres:18-alpine` or `redis:8-alpine` build
 * carried the util-linux, OpenSSL and c-ares fixes. That route is meant to end. This resolves the
 * CURRENT official index for each service's tag, scans its `linux/amd64` AND `linux/arm64` children,
 * and decides — on installed package versions, never on severity — whether every watched fix is
 * present on both platforms.
 *
 * It re-pins NOTHING and deletes NO evidence. When a service qualifies it FAILS — a deliberate
 * inversion, because the good news is what has to interrupt someone — and names the official index
 * and its children, so the return can be done through the governed process: re-pin
 * docker-compose.yml and conformance.manifest.json, re-issue or retire the SCX records that name the
 * derived image (SCX-0002..0005 today), regenerate evidence, run the FINAL chain. An indeterminate
 * check also fails: "could not check" must not read like "nothing to do".
 *
 * Usage: check-patched-images.mjs [--trivy <path>] [--cache <dir>]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLATFORMS, SERVICES, assessService } from './lib/c19-patched-images.mjs';

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const trivy = val('--trivy') ?? 'trivy';
const cache = val('--cache') ?? mkdtempSync(join(tmpdir(), 'c15-recheck-'));
// The scans write their reports here. A caller-supplied --cache that does not exist yet would make
// the scan fail for a reason that has nothing to do with the images.
mkdirSync(cache, { recursive: true });
const say = (s) => process.stdout.write(`${s}\n`);
const warn = (s) => process.stderr.write(`${s}\n`);

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

const verdicts = [];
for (const [service, spec] of Object.entries(SERVICES)) {
  const tag = spec.tag;
  const resolved = resolveOfficial(tag);
  if (resolved.error !== undefined) {
    say(`${service}: ${tag} -> UNRESOLVED (${resolved.error})`);
    verdicts.push({ ...assessService(service, {}, Object.fromEntries(PLATFORMS.map((p) => [p, resolved.error]))), digest: null, children: {} });
    continue;
  }
  say(`${service}: ${tag} -> ${resolved.digest}${resolved.single ? ' (single-platform manifest)' : ''}`);
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
  verdicts.push({ ...v, digest: resolved.digest, children: resolved.children });
}

const indeterminate = verdicts.filter((v) => v.state === 'indeterminate');
const fixed = verdicts.filter((v) => v.state === 'fixed');

if (indeterminate.length > 0) {
  // Fail closed. "Could not check" must not read like "nothing to do".
  warn('\nc15-recheck: the official images could not be checked on both platforms:');
  for (const v of indeterminate) {
    for (const platform of PLATFORMS) {
      const p = v.platforms[platform];
      if (p.error !== null) { warn(`  ${v.tag} ${platform}: ${p.error}`); continue; }
      for (const [id, f] of Object.entries(p.fixes)) if (f.state === 'indeterminate') warn(`  ${v.tag} ${platform} [${id}]: ${f.why}`);
    }
  }
  process.exit(1);
}
if (fixed.length > 0) {
  for (const v of fixed) {
    warn(`\nc15-recheck: a COMPATIBLE FIXED OFFICIAL image now exists for ${v.service}: ${v.tag} -> ${v.digest}`);
    for (const platform of PLATFORMS) warn(`  ${platform} child ${v.children[platform] ?? v.digest}`);
    warn(`  every watched fix (${Object.keys(v.platforms[PLATFORMS[0]].fixes).join(', ')}) is present on both platforms.`);
    warn('  This is a REPORT: nothing was re-pinned and no evidence was deleted. Return the service to the');
    warn(`  official image through the governed process — re-pin docker-compose.yml and conformance.manifest.json`);
    warn(`  to ${v.tag.split(':')[0]}@${v.digest}, verify its provenance and compatibility, ${v.records.length > 0
      ? `re-issue or retire ${v.records.join(', ')} (they name the derived image)`
      : 'confirm no SCX record names the derived image'}, regenerate the`);
    warn('  evidence, run the FINAL chain (docs/SCANNER_DISPOSITIONS.md §5).');
  }
  process.exit(1);
}
say('\nc15-recheck: no compatible fixed official image yet for any service; the derived images '
  + '(ghcr.io/a-halawany/elven/postgres, ghcr.io/a-halawany/elven/redis) remain the pinned route, '
  + 'and SCX-0002..0005 remain scoped to the derived postgres image.');
