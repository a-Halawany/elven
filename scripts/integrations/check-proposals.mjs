/**
 * Validate the live-source PROPOSALS with the product's own contract validator, without
 * registering anything. Prints one line per draft: the key, the mode, the rights state,
 * the attribution, and the validator's verdict. Exit 1 if any draft is invalid.
 *
 *   node scripts/integrations/check-proposals.mjs     (after `pnpm --filter @eye/api build`)
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EU_SANCTIONS_LIVE } from './proposals/eu-sanctions-live.mjs';
import { WORLDBANK_LIVE } from './proposals/worldbank-indicators-live.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { validateSourceContract } = require(join(ROOT, 'apps/api/dist/observation/sources/source-contract.js'));

let bad = 0;
for (const c of [...EU_SANCTIONS_LIVE, WORLDBANK_LIVE]) {
  const v = validateSourceContract(c);
  const line = `${c.source_key}@v${c.lifecycle.contract_version} · ${c.acquisition_mode} · rights ${c.authority_and_rights.rights_state} · credential ${String(c.security_and_operations.credential_ref)} · "${c.authority_and_rights.attribution}"`;
  if (v.ok) console.log(`  ✓ valid   ${line}`);
  else { bad += 1; console.log(`  ✗ INVALID ${line}\n      ${v.errors.join('\n      ')}`); }
}
console.log(bad === 0 ? '\nevery proposal is a well-formed contract; none is registered' : `\n${bad} proposal(s) invalid`);
process.exit(bad === 0 ? 0 : 1);
