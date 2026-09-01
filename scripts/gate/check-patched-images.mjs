#!/usr/bin/env node
/**
 * Fail as soon as a PATCHED official image exists.
 *
 * SCX-0006..0009 accept residual risk for CVE-2026-14456 because no official `postgres:18-alpine`
 * or `redis:8-alpine` build carries the fixed OpenSSL (3.5.8-r0), even though Alpine published that
 * package on 2026-08-25. An acceptance that outlives its own justification is the failure mode this
 * exists to prevent: it must not quietly persist because nobody re-checked.
 *
 * So this resolves the CURRENT official digest for each tag and scans it. If the image has been
 * rebuilt, it FAILS and names the digest to re-pin to - a deliberate inversion, because the good
 * news is what has to interrupt someone.
 *
 * The scan runs at ALL severities and the verdict is made on the installed package version. A
 * severity filter would have let a reclassification from HIGH to Low read as "patched", retiring a
 * disposition while the vulnerable code sat exactly where it was.
 *
 * Usage: check-patched-images.mjs [--trivy <path>] [--cache <dir>]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RECHECK_SPEC, assessReport } from './lib/c19-patched-images.mjs';

const PLATFORM = 'linux/amd64';
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const trivy = val('--trivy') ?? 'trivy';
const cache = val('--cache') ?? mkdtempSync(join(tmpdir(), 'c15-recheck-'));
const say = (s) => process.stdout.write(`${s}\n`);

/** The digest a tag currently resolves to, read from the live registry. */
function currentDigest(tag) {
  const r = spawnSync('docker', ['buildx', 'imagetools', 'inspect', tag], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return /^Digest:\s+(sha256:[0-9a-f]{64})/m.exec(r.stdout ?? '')?.[1] ?? null;
}

const patched = [];
const indeterminate = [];
for (const tag of RECHECK_SPEC.tags) {
  const digest = currentDigest(tag);
  if (digest === null) { indeterminate.push(`${tag}: the registry digest could not be resolved`); continue; }
  const ref = `${tag.split(':')[0]}@${digest}`;
  const out = join(cache, `${tag.replace(/\W+/g, '-')}.json`);
  // NO --severity filter: the verdict must not depend on how the advisory is currently rated.
  const r = spawnSync(trivy, ['image', '--quiet', '--ignorefile', '/dev/null',
    '--platform', PLATFORM, '--cache-dir', cache, '--format', 'json', '--output', out, ref],
  { encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) { indeterminate.push(`${tag}: the scan failed (exit ${r.status})`); continue; }
  let report;
  try { report = JSON.parse(readFileSync(out, 'utf8')); } catch (e) {
    indeterminate.push(`${tag}: the scan report is unreadable (${e.message.slice(0, 80)})`);
    continue;
  }
  const verdict = assessReport(report);
  say(`${tag} -> ${digest}`);
  say(`  ${verdict.state.toUpperCase()}: ${verdict.why}`);
  if (verdict.state === 'patched') patched.push({ tag, digest });
  if (verdict.state === 'indeterminate') indeterminate.push(`${tag}: ${verdict.why}`);
}

if (indeterminate.length > 0) {
  // Fail closed. "Could not check" must not read like "nothing to do".
  process.stderr.write('\nc15-recheck: the acceptance could not be re-justified:\n');
  for (const x of indeterminate) process.stderr.write(`  ${x}\n`);
  process.exit(1);
}
if (patched.length > 0) {
  process.stderr.write(`\nc15-recheck: a PATCHED official image now exists for ${RECHECK_SPEC.advisory}.\n`);
  for (const { tag, digest } of patched) process.stderr.write(`  re-pin ${tag} to ${digest}\n`);
  process.stderr.write('Re-pin conformance.manifest.json and docker-compose.yml, then DELETE the\n'
    + 'corresponding SCX records: the gate rejects a record that matches nothing.\n');
  process.exit(1);
}
say(`c15-recheck: no patched official image yet; SCX-0006..0009 remain justified`);
