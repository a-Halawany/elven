/**
 * CommonJS bridge to the canonical secret loader (Gate-2.1 §9).
 *
 * playwright.config.ts is compiled to CJS, so it cannot `import` the ESM module
 * directly. Rather than maintain a second copy of the generation logic, this
 * bridge re-implements ONLY the file plumbing and delegates the key list to the
 * canonical module by reading it — so the two can never disagree about WHICH
 * credentials exist. The fallback inside playwright.config.ts remains as a last
 * resort if even this bridge cannot be loaded.
 */
const { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, statSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { join } = require('node:path');

/** Parse the canonical GENERATED_KEYS list out of scripts/local-env.mjs. */
function canonicalKeys(root) {
  const src = readFileSync(join(root, 'scripts', 'local-env.mjs'), 'utf8');
  const block = /const GENERATED_KEYS = \[([\s\S]*?)\];/.exec(src);
  if (block === null) throw new Error('local-env.cjs: canonical GENERATED_KEYS list not found');
  return [...block[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
}

function loadLocalEnv(root = join(__dirname, '..')) {
  const keys = canonicalKeys(root);
  const dir = join(root, '.eye-local');
  const file = join(dir, 'env');
  if (existsSync(dir)) {
    try {
      if ((statSync(dir).mode & 0o777) !== 0o700) chmodSync(dir, 0o700);
    } catch { /* best effort */ }
  }
  if (existsSync(file) && (statSync(file).mode & 0o777) !== 0o600) {
    chmodSync(file, 0o600);
    console.warn(`[eye] repaired permissions on ${file} to 0600`);
  }
  const stored = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) stored[m[1]] = m[2];
    }
  }
  let dirty = false;
  for (const key of keys) {
    if (process.env[key]) continue;
    if (stored[key] === undefined) {
      stored[key] = randomBytes(24).toString('base64url');
      dirty = true;
    }
    process.env[key] = stored[key];
  }
  if (!process.env['EYE_DB_MIGRATE_PASSWORD'] && stored['EYE_DB_MIGRATE_PASSWORD'] === undefined) {
    stored['EYE_DB_MIGRATE_PASSWORD'] = stored['EYE_DB_PASSWORD'] ?? process.env['EYE_DB_PASSWORD'];
    dirty = true;
  }
  process.env['EYE_DB_MIGRATE_PASSWORD'] ??= stored['EYE_DB_MIGRATE_PASSWORD'];
  if (dirty) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, Object.entries(stored).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return { ...process.env };
}

module.exports = { loadLocalEnv, canonicalKeys };
