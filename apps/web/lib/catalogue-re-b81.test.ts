/**
 * CP-6 B81 §RE — CMP-010: the catalogue renders EVERY state of the operating context bar. Proven against the bar's OWN model (barStatus,
 * dimensionLines — lib/context-b80.ts), not a copy of it: each fixture yields the state it is titled with, and together they cover every
 * bar state and every dimension state the model can produce. Plus the real catalogue source renders each fixture through the bar's prop.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAR_STATES } from './catalogue-re-b81';
import { barStatus, consequentialAllowed, dimensionLines } from './context-b80';

const run = (s: (typeof BAR_STATES)[number]) => {
  const status = barStatus({ workspace: s.workspace, bar: s.fixture.bar, loading: s.fixture.loading === true, failure: s.fixture.failure ?? null });
  const lines = dimensionLines({ workspace: s.workspace, bar: s.fixture.bar, roles: ['analyst'], ...(s.effectiveTime === undefined ? {} : { effectiveTime: s.effectiveTime }) });
  return { status, lines };
};

describe('every context-bar state is in the catalogue', () => {
  it('each fixture produces exactly the state it names', () => {
    for (const s of BAR_STATES) expect(run(s).status.state, s.key).toBe(s.expect);
  });
  it('together they cover every bar state and every dimension state of the model', () => {
    expect(new Set(BAR_STATES.map((s) => run(s).status.state))).toEqual(new Set(['platform', 'loading', 'ready', 'degraded', 'unavailable', 'error']));
    expect(new Set(BAR_STATES.flatMap((s) => run(s).lines.map((l) => l.state)))).toEqual(new Set(['set', 'default', 'unresolved', 'not_applied']));
  });
  it('the held states hold consequential commands; ready and platform do not; no fixture offers the switch (nothing calls a server)', () => {
    for (const s of BAR_STATES) {
      const { status } = run(s);
      expect(consequentialAllowed(status).allowed, s.key).toBe(['ready', 'platform'].includes(s.expect));
      expect(status.maySwitch, s.key).toBe(false);
    }
    const err = BAR_STATES.find((s) => s.key === 'error')!;
    expect(err.fixture.bar).not.toBeNull(); // the last valid context kept on screen
  });
  it('the catalogue renders each fixture through GlobalContextBar\'s fixture prop', () => {
    const src = readFileSync(join(__dirname, '..', 'app/admin/governance/design/catalogue/re-fixtures.tsx'), 'utf8');
    expect(src).toMatch(/\{BAR_STATES\.map\(\(s\) => \(/);
    expect(src).toMatch(/<GlobalContextBar workspace=\{s\.workspace\} me=\{ME\} scope=\{s\.workspace === 'admin' \? null : \{ tenantId: T, domainId: D \}\} fixture=\{s\.fixture\}/);
    expect(readFileSync(join(__dirname, '..', 'app/admin/governance/design/catalogue/page.tsx'), 'utf8')).toMatch(/<ReCatalogue \/>/);
  });
});
