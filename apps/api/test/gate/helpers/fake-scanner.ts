/**
 * Fake `docker` and `trivy` executables, so the recheck CLI can be driven as a real subprocess.
 *
 * Source-text assertions cannot show what a program DOES. These build a directory that goes on the
 * child's PATH, so `check-patched-images.mjs` resolves and executes them exactly as it would the
 * real tools — and they record their argv, which is how the platform and the digest-resolved
 * reference are proved rather than assumed.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type PkgSpec = Record<string, string | string[]>;

export interface ReportSpec {
  /** Installed versions per package. An array plants a duplicate/conflicting inventory. */
  packages?: PkgSpec;
  /** Advisory rows to include, as `[severity, packageName, installedVersion]`. */
  vulns?: Array<[string, string, string]>;
  /** Replace the whole document — for malformed and incomplete reports. */
  raw?: unknown;
}

export function buildReport(spec: ReportSpec): unknown {
  if ('raw' in spec) return spec.raw;
  const packages = spec.packages ?? { libcrypto3: '3.5.7-r0', libssl3: '3.5.7-r0' };
  const Packages = Object.entries(packages).flatMap(([Name, v]) =>
    (Array.isArray(v) ? v : [v]).map((Version) => ({ Name, Version })));
  return {
    SchemaVersion: 2,
    ArtifactType: 'container_image',
    Results: [{
      Target: 'image (alpine 3.24.1)',
      Class: 'os-pkgs',
      Type: 'alpine',
      Packages,
      Vulnerabilities: (spec.vulns ?? []).map(([Severity, PkgName, InstalledVersion]) => ({
        VulnerabilityID: 'CVE-2026-14456', PkgName, InstalledVersion, Severity,
        FixedVersion: '3.5.8-r0',
      })),
    }],
  };
}

export interface FakeToolchain {
  /** Put this first on PATH. */
  binDir: string;
  /** Every argv the fakes were invoked with, in order. */
  calls: () => Array<{ tool: string; argv: string[] }>;
}

/**
 * @param digests   tag -> digest the fake `docker` reports; a null value makes it fail.
 * @param reports   tag -> report the fake `trivy` writes; a null value makes it exit nonzero.
 * @param dir       a scratch directory to build in.
 */
export function fakeToolchain(dir: string, {
  digests, reports, trivyWritesNothing = false,
}: {
  digests: Record<string, string | null>;
  reports: Record<string, unknown | null>;
  trivyWritesNothing?: boolean;
}): FakeToolchain {
  const binDir = join(dir, 'bin');
  const dataDir = join(dir, 'data');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const log = join(dataDir, 'calls.jsonl');
  writeFileSync(log, '');
  writeFileSync(join(dataDir, 'digests.json'), JSON.stringify(digests));
  writeFileSync(join(dataDir, 'reports.json'), JSON.stringify(reports));

  // A node shim rather than shell: it has to parse argv, write a file at --output, and record
  // itself, which is more than a here-doc should be asked to do legibly.
  const shim = (tool: string) => `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)},
  JSON.stringify({ tool: ${JSON.stringify(tool)}, argv }) + '\\n');
const digests = JSON.parse(fs.readFileSync(${JSON.stringify(join(dataDir, 'digests.json'))}, 'utf8'));
const reports = JSON.parse(fs.readFileSync(${JSON.stringify(join(dataDir, 'reports.json'))}, 'utf8'));
const keyFor = (s) => Object.keys(digests).find((t) => s.includes(t.split(':')[0]));
if (${JSON.stringify(tool)} === 'docker') {
  const tag = argv[argv.length - 1];
  const d = digests[tag];
  if (d === null || d === undefined) { process.stderr.write('no such tag\\n'); process.exit(1); }
  process.stdout.write('Name:      docker.io/library/' + tag + '\\n');
  process.stdout.write('MediaType: application/vnd.oci.image.index.v1+json\\n');
  process.stdout.write('Digest:    ' + d + '\\n');
  process.exit(0);
}
const ref = argv[argv.length - 1];
const tag = keyFor(ref);
const report = reports[tag];
if (report === null || report === undefined) { process.stderr.write('scan failed\\n'); process.exit(1); }
const out = argv[argv.indexOf('--output') + 1];
if (!${JSON.stringify(trivyWritesNothing)}) fs.writeFileSync(out, JSON.stringify(report));
process.exit(0);
`;
  for (const tool of ['docker', 'trivy']) {
    writeFileSync(join(binDir, tool), shim(tool), { mode: 0o755 });
  }
  return {
    binDir,
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n')
      .filter(Boolean).map((l) => JSON.parse(l)) : []),
  };
}
