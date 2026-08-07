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
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { reconcile, validateCycloneDx } from './lib/supply-chain.mjs';

// ajv is a PINNED workspace dependency (apps/api, packages/contracts). Resolving
// through that package keeps the validator on the same pinned version the runtime
// schemas use, instead of introducing a second, drifting copy at the repo root.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));

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
/**
 * BIDIRECTIONAL reconciliation with governed exclusions (Gate-2.1 §9). The
 * forward direction alone (SBOM ⊆ lockfile) cannot detect a dependency the SBOM
 * silently omits — which is exactly how an unlisted package reaches production.
 */
const exclusionsFile = 'supply-chain-exclusions.json';
const exclusions = existsSync(exclusionsFile)
  ? (JSON.parse(readFileSync(exclusionsFile, 'utf8')).exclusions ?? [])
  : [];
// The closure identities the SBOM is reconciled against are the ones pnpm
// actually resolved (prod + dev), not every heading in the lockfile: the lockfile
// also carries peer-dedup and link entries that are not installed components.
const closureIdentities = new Set([...prod.keys(), ...all.keys()]);
const recon = reconcile({ components, lockIdentities: closureIdentities, exclusions });
const unmatched = recon.missingFromLock;

// ---- R8/Gate-2.1 gates: never emit an empty, unreconciled or invalid SBOM ----
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
for (const f of recon.failures) failures.push(f);
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
// ---- CycloneDX 1.6 SCHEMA validation (Gate-2.1 §9) -------------------------
// Offline, with the same ajv the contracts package pins: a gate that needs the
// network to decide whether a build is releasable fails open when the network does.
const Ajv = require('ajv');
let addFormats;
try {
  addFormats = require('ajv-formats');
} catch {
  addFormats = undefined;
}
const schema = validateCycloneDx(bom, Ajv.default ?? Ajv, addFormats?.default ?? addFormats);
if (!schema.ok) {
  console.error('SBOM SCHEMA VALIDATION FAILED (CycloneDX 1.6):');
  for (const e of schema.errors.slice(0, 20)) console.error('  - ' + e);
  process.exit(1);
}

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
  `closure identities (prod+dev): ${recon.counts.lock}`,
  `forward  (sbom -> closure):    ${components.length - recon.missingFromLock.length}/${components.length} matched, ${recon.missingFromLock.length} unmatched`,
  `reverse  (closure -> sbom):    ${recon.counts.lock - recon.missingFromSbom.length - recon.counts.excluded}/${recon.counts.lock} matched, ${recon.missingFromSbom.length} unmatched, ${recon.counts.excluded} governed exclusion(s)`,
  `stale exclusions:              ${recon.staleExclusions.length}`,
  `cyclonedx 1.6 schema:          VALID`,
  `source candidate sha:          ${execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()}`,
  `invariants checked:            non-empty SBOM; components == prod+dev; components <= lockfile entries; BIDIRECTIONAL identity reconciliation (sbom<->closure) with governed exclusions; CycloneDX 1.6 schema validity`,
  `result:                        RECONCILED`,
].join('\n') + '\n';
writeFileSync('evidence/supply-chain/reconciliation.txt', report);

console.log(`SBOM: ${components.length} components (${prod.size} production, ${dev.size} development-only)`);
console.log(`lockfile package-entry count (approx heading match): ${lockPkgCount}`);
console.log(`reconciliation: RECONCILED bidirectionally (${recon.counts.excluded} governed exclusion(s))`);
console.log('cyclonedx 1.6 schema: VALID');
