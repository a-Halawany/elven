/**
 * License inventory — allowlist-checked (ADR-P0-16).
 * Walks installed workspace dependencies, records name@version + license,
 * fails on any license outside the allowlist.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const ALLOW = new Set([
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD',
  'BlueOak-1.0.0', 'CC-BY-4.0', 'CC0-1.0', 'Unlicense', 'Python-2.0',
  'MIT OR Apache-2.0', '(MIT OR CC0-1.0)', 'Apache-2.0 OR MIT', '(Apache-2.0 OR MPL-1.1)',
  '(MIT AND CC-BY-3.0)', 'MPL-2.0', '(AFL-2.1 OR BSD-3-Clause)', '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(MIT AND Zlib)', '(WTFPL OR MIT)', 'LGPL-3.0-or-later',
]);

const raw = execSync('pnpm licenses list --json --prod', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const data = JSON.parse(raw);
const inventory = [];
const violations = [];
for (const [license, pkgs] of Object.entries(data)) {
  for (const p of pkgs) {
    inventory.push({ name: p.name, versions: p.versions, license });
    if (!ALLOW.has(license)) violations.push(`${p.name} (${license})`);
  }
}
mkdirSync('sbom', { recursive: true });
writeFileSync('sbom/license-inventory.json', JSON.stringify(inventory, null, 2));
console.log(`license inventory: ${inventory.length} packages recorded`);
if (violations.length > 0) {
  console.error('LICENSE VIOLATIONS (not in allowlist):');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
