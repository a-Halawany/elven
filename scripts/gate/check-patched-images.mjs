#!/usr/bin/env node
/**
 * Fail as soon as a PATCHED official image exists.
 *
 * SCX-0006..0009 accept residual risk for CVE-2026-14456 because no official `postgres:18-alpine`
 * or `redis:8-alpine` build carries the fixed OpenSSL (3.5.8-r0), even though Alpine published that
 * package on 2026-08-25. An acceptance that outlives its own justification is the failure mode this
 * exists to prevent: it must not quietly persist because nobody re-checked.
 *
 * So this resolves the CURRENT official digest for each tag and scans it. If the advisory is gone,
 * it FAILS and names the digest to re-pin to - a deliberate inversion, because the good news is
 * what has to interrupt someone.
 *
 * Usage: check-patched-images.mjs [--trivy <path>] [--cache <dir>]
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ADVISORY = 'CVE-2026-14456';
const PLATFORM = 'linux/amd64';
const TAGS = ['postgres:18-alpine', 'redis:8-alpine'];

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

let patched = [];
let unresolved = [];
for (const tag of TAGS) {
  const digest = currentDigest(tag);
  if (digest === null) { unresolved.push(tag); continue; }
  const ref = `${tag.split(':')[0]}@${digest}`;
  const out = join(cache, `${tag.replace(/\W+/g, '-')}.json`);
  const r = spawnSync(trivy, ['image', '--quiet', '--severity', 'HIGH,CRITICAL',
    '--ignorefile', '/dev/null', '--platform', PLATFORM, '--cache-dir', cache,
    '--format', 'json', '--output', out, ref], { encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) { unresolved.push(`${tag} (scan failed)`); continue; }
  let doc;
  try { doc = JSON.parse(readFileSync(out, 'utf8')); } catch { unresolved.push(`${tag} (unreadable)`); continue; }
  const hits = (doc.Results ?? []).flatMap((x) => x.Vulnerabilities ?? [])
    .filter((v) => v.VulnerabilityID === ADVISORY);
  say(`${tag} -> ${digest}: ${hits.length === 0 ? 'PATCHED' : `still affected (${hits[0].InstalledVersion})`}`);
  if (hits.length === 0) patched.push({ tag, digest });
}

if (unresolved.length > 0) {
  // Fail closed. "Could not check" must not read like "nothing to do".
  process.stderr.write(`c15-recheck: could not check ${unresolved.join(', ')}; an unchecked tag is `
    + 'not evidence that the acceptance is still justified\n');
  process.exit(1);
}
if (patched.length > 0) {
  process.stderr.write(`\nc15-recheck: a PATCHED official image now exists for ${ADVISORY}.\n`);
  for (const { tag, digest } of patched) {
    process.stderr.write(`  re-pin ${tag} to ${digest}\n`);
  }
  process.stderr.write('Re-pin conformance.manifest.json and docker-compose.yml, then DELETE the\n'
    + 'corresponding SCX records: the gate rejects a record that matches nothing.\n');
  process.exit(1);
}
say(`c15-recheck: no patched official image yet; SCX-0006..0009 remain justified`);
