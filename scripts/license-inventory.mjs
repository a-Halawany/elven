/**
 * License inventory — allowlist-checked over PRODUCTION AND DEVELOPMENT closures
 * (ADR-P0-16; Gate-2.1 §9).
 *
 * Checking production alone was the gap: a copyleft build tool, test harness or
 * codegen dependency is still shipped inside the repository, still executed in
 * CI, and still a licence obligation. Both scopes are gated here, and a violation
 * is attributed to the scope it came from.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { checkLicenses, LICENSE_ALLOWLIST } from './lib/supply-chain.mjs';

function inventory(flag) {
  const raw = execSync(`pnpm licenses list --json ${flag}`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const data = JSON.parse(raw);
  const out = [];
  for (const [license, pkgs] of Object.entries(data)) {
    for (const p of pkgs) {
      for (const v of p.versions) out.push({ name: p.name, version: v, license });
    }
  }
  return out;
}

const prod = inventory('--prod');
const all = inventory('--dev'); // pnpm --dev returns the full closure
const prodIds = new Set(prod.map((p) => `${p.name}@${p.version}`));
const dev = all.filter((p) => !prodIds.has(`${p.name}@${p.version}`));

const result = checkLicenses({ production: prod, development: dev }, LICENSE_ALLOWLIST);

mkdirSync('sbom', { recursive: true });
writeFileSync(
  'sbom/license-inventory.json',
  JSON.stringify({ production: prod, development: dev }, null, 2) + '\n',
);
console.log(`license inventory: ${result.checked} packages checked (${prod.length} production, ${dev.length} development-only)`);

if (!result.ok) {
  console.error('LICENSE VIOLATIONS (not in the allowlist):');
  for (const v of result.violations) console.error(`  - [${v.scope}] ${v.name} (${v.license})`);
  process.exit(1);
}
console.log('license gate: PASS (production and development)');
