import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCss } from './registry.js';

const out = join(dirname(fileURLToPath(import.meta.url)), 'tokens.css');
writeFileSync(out, buildCss());
console.log(`tokens.css written (${buildCss().length} bytes)`);
