/**
 * B80 review item — THE CATALOGUE WALK'S FIXTURE SESSION (`EYE_B80_FIXTURE_SESSION=1`) is a TEST-SIDE device of one DEMO walk
 * (e2e/phase6-b80-catalogue.demo.spec.ts): the walk writes a synthetic object into its own browser's sessionStorage so the catalogue's static
 * fixtures render without an API. It is not an authentication path: no product source reads the flag or mints a session (only lib/api.ts's
 * setSession writes `eye.session`, from a real sign-in), the hosted browser gate never runs a *.demo.spec.ts (playwright.config.ts
 * testIgnore), and the API refuses the synthetic token on every governed route (401 EYE-IDN-002 — evidence/cp6/b80-fixture-session.txt). This
 * regression guard keeps it that way.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const ROOT = join(WEB, '..', '..');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const product = [...walk(join(WEB, 'app')), ...walk(join(WEB, 'components')), ...walk(join(WEB, 'lib'))]
  .map((p) => ({ path: relative(WEB, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));

describe('the catalogue walk\'s fixture session is a test-side device, never an authentication path', () => {
  it('no product source reads the fixture flag or names the synthetic principal', () => {
    expect(product.filter((f) => /EYE_B80_FIXTURE_SESSION|synthetic-catalogue-walker|synthetic-not-a-token/.test(f.text)).map((f) => f.path)).toEqual([]);
  });
  it('only lib/api.ts writes the session (from a real sign-in); nothing else mints one', () => {
    expect(product.filter((f) => /sessionStorage\.setItem\(\s*['"]eye\.session['"]/.test(f.text)).map((f) => f.path)).toEqual(['lib/api.ts']);
  });
  it('the flag lives only in DEMO walks, which the hosted browser gate never runs', () => {
    const e2e = readdirSync(join(ROOT, 'e2e')).filter((n) => /\.spec\.ts$/.test(n));
    const using = e2e.filter((n) => readFileSync(join(ROOT, 'e2e', n), 'utf8').includes('EYE_B80_FIXTURE_SESSION'));
    expect(using.length).toBeGreaterThan(0);
    expect(using.every((n) => n.endsWith('.demo.spec.ts'))).toBe(true);
    expect(readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8')).toMatch(/testIgnore:\s*\[\s*'\*\*\/\*\.demo\.spec\.ts'\s*\]/);
  });
});
