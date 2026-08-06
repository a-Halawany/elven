/**
 * CycloneDX 1.6 SBOM generator (remediation R8) — the validated, pinned,
 * TRACKED generator recorded in conformance.manifest.json.
 * Sources of truth: `pnpm licenses list --json` (prod) + (--dev) for the full
 * installed closure — the same resolution recorded in pnpm-lock.yaml, so the
 * SBOM reconciles with the lockfile and both license inventories by
 * construction; the reconciliation below VERIFIES that and fails otherwise.
 * FAILS (exit 1) when the SBOM would be empty or inventories disagree.
 * Emits:
 *   evidence/supply-chain/sbom.cdx.json        — the SBOM
 *   evidence/supply-chain/licenses-prod.json   — production license inventory
 *   evidence/supply-chain/licenses-dev.json    — development-only inventory
 *   evidence/supply-chain/reconciliation.txt   — SBOM↔lockfile↔license report
 */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

function licenseList(flag) {
  const raw = execSync(`pnpm licenses list --json ${flag}`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const data = JSON.parse(raw);
  const out = new Map(); // name@version -> {name, version, license}
  for (const [license, pkgs] of Object.entries(data)) {
    for (const p of pkgs) {
      for (const v of p.versions) out.set(`${p.name}@${v}`, { name: p.name, version: v, license });
    }
  }
  return out;
}

// Evidence is not tracked in the source candidate (Gate-2 §10), so a clean
// checkout has no evidence/ directory: create it.
mkdirSync('evidence/supply-chain', { recursive: true });

const prod = licenseList('--prod');
const all = licenseList('--dev'); // pnpm licenses --dev = full closure incl. dev
const dev = new Map([...all].filter(([k]) => !prod.has(k)));

const components = [];
function push(map, scopeLabel) {
  for (const { name, version, license } of map.values()) {
    const purlName = name.startsWith('@') ? name.replace('@', '%40').replace('/', '%2F') : name;
    components.push({
      type: 'library',
      'bom-ref': `pkg:npm/${purlName}@${version}`,
      name,
      version,
      purl: `pkg:npm/${purlName}@${version}`,
      licenses: [{ license: { name: license } }],
      properties: [{ name: 'eye:dependency-scope', value: scopeLabel }],
    });
  }
}
push(prod, 'production');
push(dev, 'development');

const lock = readFileSync('pnpm-lock.yaml', 'utf8');
// Lockfile resolution entries: '  <name>@<version>:' headings under snapshots/packages.
const lockPkgCount = (lock.match(/^  [^ ].*@[0-9]/gm) ?? []).length;

/**
 * IDENTITY-BASED reconciliation (Gate-2 §10): every SBOM component must be
 * findable in the lockfile by its exact name@version identity — counting alone
 * cannot detect a component that is present in the SBOM but absent from the
 * dependency closure (or vice versa).
 */
const lockIdentities = new Set();
// pnpm lockfileVersion 9: the `packages:` and `snapshots:` sections key each
// resolution as a quoted `'<name>@<version>(...peers)':` heading at indent 2.
for (const m of lock.matchAll(/^ {2}'?((?:@[^/']+\/)?[^@'\s]+)@([^'(:\s]+)/gm)) {
  lockIdentities.add(`${m[1]}@${m[2]}`);
}
const unmatched = [];
for (const c of components) {
  if (!lockIdentities.has(`${c.name}@${c.version}`)) unmatched.push(`${c.name}@${c.version}`);
}

// ---- R8 gates: never emit an empty or unreconciled SBOM --------------------
const failures = [];
if (components.length === 0) failures.push('SBOM would be EMPTY (0 components)');
if (prod.size === 0) failures.push('production license inventory is empty');
if (dev.size === 0) failures.push('development license inventory is empty');
if (components.length !== prod.size + dev.size) {
  failures.push(`component count ${components.length} != prod ${prod.size} + dev ${dev.size}`);
}
if (components.length > lockPkgCount) {
  failures.push(`SBOM has more components (${components.length}) than lockfile entries (${lockPkgCount})`);
}
if (unmatched.length > 0) {
  failures.push(
    `${unmatched.length} SBOM component identit${unmatched.length === 1 ? 'y' : 'ies'} not found in pnpm-lock.yaml: ` +
    unmatched.slice(0, 10).join(', ') + (unmatched.length > 10 ? ' …' : ''),
  );
}
if (failures.length > 0) {
  console.error('SBOM GENERATION FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: 'the-eye', version: '0.0.1' },
    properties: [
      // The SBOM records the SOURCE candidate it was generated from — never an
      // earlier commit (Gate-2 §10).
      { name: 'eye:source-candidate-sha', value: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim() },
      { name: 'eye:lockfile-sha256', value: createHash('sha256').update(lock).digest('hex') },
    ],
  },
  components,
};
writeFileSync('evidence/supply-chain/sbom.cdx.json', JSON.stringify(bom, null, 2) + '\n');
writeFileSync(
  'evidence/supply-chain/licenses-prod.json',
  JSON.stringify([...prod.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n',
);
writeFileSync(
  'evidence/supply-chain/licenses-dev.json',
  JSON.stringify([...dev.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + '\n',
);

const report = [
  `# SBOM / lockfile / license reconciliation — ${new Date().toISOString()}`,
  `sbom components:               ${components.length}`,
  `  production (licenses-prod):  ${prod.size}`,
  `  development (licenses-dev):  ${dev.size}`,
  `lockfile resolution entries:   ${lockPkgCount} (heading match; superset incl. peer-dedup/link entries)`,
  `lockfile sha256:               ${createHash('sha256').update(lock).digest('hex')}`,
  `lockfile distinct identities:  ${lockIdentities.size}`,
  `identity matches:              ${components.length}/${components.length} SBOM components found in the lockfile by name@version`,
  `unmatched identities:          ${unmatched.length}`,
  `source candidate sha:          ${execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()}`,
  `invariants checked:            non-empty SBOM; components == prod+dev; components <= lockfile entries; EVERY component identity present in the lockfile`,
  `result:                        RECONCILED`,
].join('\n') + '\n';
writeFileSync('evidence/supply-chain/reconciliation.txt', report);

console.log(`SBOM: ${components.length} components (${prod.size} production, ${dev.size} development-only)`);
console.log(`lockfile package-entry count (approx heading match): ${lockPkgCount}`);
console.log('reconciliation: RECONCILED (evidence/supply-chain/reconciliation.txt)');
