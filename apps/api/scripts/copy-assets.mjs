/**
 * Copy non-TypeScript runtime assets into the emitted tree.
 *
 * The feed parser runs in a worker thread whose entry point is plain JavaScript
 * (see src/observation/connectors/xml-worker.js). tsc does not copy .js files, so
 * without this step the emitted build would silently fall back to loading the
 * worker from the source tree — which works in this repo and would fail in any
 * deployment that ships dist alone. Copying it is the honest fix.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const ASSETS = ['src/observation/connectors/xml-worker.js'];

for (const rel of ASSETS) {
  const from = join(root, rel);
  const to = join(root, rel.replace(/^src\//, 'dist/'));
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  console.log(`copied ${rel} -> ${rel.replace(/^src\//, 'dist/')}`);
}
