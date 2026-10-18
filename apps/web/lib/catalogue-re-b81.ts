/**
 * CP-6 B81 §RE — THE CONTEXT BAR'S CATALOGUE STATES (CMP-010): the SYNTHETIC fixtures the catalogue renders (app/admin/governance/design/
 * catalogue/re-fixtures.tsx) through the bar's own fixture prop — one per state the bar's model names (lib/context-b80.ts barStatus:
 * platform, loading, ready, degraded, unavailable, error; dimensionLines: set, default, unresolved, not applied). No server; `may_set` is
 * false in every fixture (the live switch is B80's walk). catalogue-re-b81.test.ts proves the coverage against the model itself.
 */
import type { Me } from './observation';
import type { BarRead } from './context-b80';
import type { EffectiveTimeSupport } from './b80-seams';

export const FIXTURE_TENANT = '00000000-0000-4000-8000-0000000000b1';
export const FIXTURE_DOMAIN = '00000000-0000-4000-8000-0000000000d1';
export const FIXTURE_ME: Me = { principalId: '00000000-0000-4000-8000-0000000000a1', kind: 'human', assurance: 'fixture', homeScope: 'DOMAIN', homeTenantId: FIXTURE_TENANT, homeDomainId: FIXTURE_DOMAIN,
  bindings: [{ roleCode: 'analyst', scope: 'DOMAIN', tenantId: FIXTURE_TENANT, domainId: FIXTURE_DOMAIN }] };
const CHOICES: BarRead['choices'] = { objectives: [], scenarios: [], horizons: ['P90D'], classifications: ['internal'], as_of: '2026-10-18T00:00:00.000Z' };
const BASE: BarRead = { as_of: '2026-10-18T00:00:00.000Z', tenant_id: FIXTURE_TENANT, domain_id: FIXTURE_DOMAIN, principal_id: FIXTURE_ME.principalId, current: null, version: 0, unresolved: [], may_set: false, choices: CHOICES, policy: { bundle: 'fixture-policy@1' } };
const SET: BarRead = { ...BASE, version: 3, current: {
  context_id: '00000000-0000-4000-8000-0000000000c3', version: 3, digest: 'f'.repeat(64), set_at: '2026-10-17T09:00:00.000Z',
  objective: { id: '00000000-0000-4000-8000-0000000000e1', title: 'Corridor resilience (SYNTHETIC)', status: 'active', stale: false }, horizon: 'P90D',
  scenario: { id: '00000000-0000-4000-8000-0000000000e2', title: 'Red Sea closure (SYNTHETIC)', status: 'active', stale: false }, classification: 'internal',
  effective_at: '2026-10-01T00:00:00.000Z' } };
const UNRESOLVED: BarRead = { ...SET, unresolved: [{ dimension: 'scenario', id: '00000000-0000-4000-8000-0000000000e2', status: 'retired', reason: 'the scenario was retired after the context was set (fixture)' }] };

/** CMP-010: the bar in each state it can be in — the states the bar's own model (barStatus / dimensionLines) names. */
export const BAR_STATES: ReadonlyArray<{ key: string; title: string; expect: string; workspace: 'admin' | 'prediction'; effectiveTime?: EffectiveTimeSupport;
  fixture: { bar: BarRead | null; failure?: { status: number; message: string } | null; loading?: boolean } }> = [
  { key: 'platform', title: 'PLATFORM — no tenant or domain context', expect: 'platform', workspace: 'admin', fixture: { bar: null } },
  { key: 'loading', title: 'Loading — consequential commands held until the read answers', expect: 'loading', workspace: 'prediction', fixture: { bar: null, loading: true } },
  { key: 'default', title: 'Ready — nothing set: every dimension its stated default', expect: 'ready', workspace: 'prediction', fixture: { bar: BASE } },
  { key: 'set', title: 'Ready — every dimension set, its version and digest', expect: 'ready', workspace: 'prediction', fixture: { bar: SET } },
  { key: 'not-applied', title: 'Live-only page — the effective time declared NOT APPLIED', expect: 'ready', workspace: 'prediction', effectiveTime: 'live_only', fixture: { bar: SET } },
  { key: 'unresolved', title: 'Degraded — a dimension UNRESOLVED (reconciled on read), commands held', expect: 'degraded', workspace: 'prediction', fixture: { bar: UNRESOLVED } },
  { key: 'unavailable', title: 'Unavailable — refused (403): no context applied, commands held', expect: 'unavailable', workspace: 'prediction',
    fixture: { bar: null, failure: { status: 403, message: 'context rejected (access): a SYNTHETIC catalogue refusal' } } },
  { key: 'error', title: 'Error — the read failed (503): the LAST VALID context kept, commands held', expect: 'error', workspace: 'prediction',
    fixture: { bar: SET, failure: { status: 503, message: 'the operating context could not be read (SYNTHETIC)' } } },
];

