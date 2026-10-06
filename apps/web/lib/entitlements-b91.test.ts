import { describe, expect, it } from 'vitest';
import { availabilityLine, capabilityLine, cellText, licenceLine, limitsLine, type Availability, type Capability } from './entitlements-b91';

/** CP-6 B91 §EN (0105): the catalogue page WORDS the server's record — it never decides what is licensed or available. SYNTHETIC. */
describe('the entitlement record is worded, never judged on the client', () => {
  const cap = (over: Partial<Capability>): Capability => ({
    capability_key: 'simulation', version: 1, label: 'Simulation', description: 'd', action_prefixes: ['simulation.', 'twin.'], included_in: null, core: false,
    entitlement_unit: 'runs, capacity and model limits', tier: 'strategic_cell', built: true, spec_refs: [], cannot_remove: '', status: 'active', ...over,
  });
  it('a capability names its tier, its actions (or its parent) and whether it is built', () => {
    expect(capabilityLine(cap({}))).toBe('strategic cell · simulation.*, twin.* · unit: runs, capacity and model limits');
    expect(capabilityLine(cap({ core: true, tier: 'core', action_prefixes: ['audit.'] }))).toBe('CORE · audit.* · unit: runs, capacity and model limits');
    expect(capabilityLine(cap({ action_prefixes: [], included_in: 'simulation' }))).toMatch(/licensed with simulation/);
    expect(capabilityLine(cap({ action_prefixes: [], built: false }))).toMatch(/no action of its own · not built yet/);
  });
  it('a matrix cell, the limits and the licence are the server\'s words', () => {
    expect(cellText('core')).toBe('● core — cannot be removed');
    expect(cellText('unlicensed')).toBe('○ not licensed');
    expect(cellText('uncontracted')).toMatch(/not gated/);
    expect(cellText('something')).toBe('something');
    expect(limitsLine({})).toBe('no limits declared');
    expect(limitsLine({ users: 25, simulation_compute: { quantity: 3600, unit: 'wall_seconds', period: 'month' } })).toBe('users 25 · simulation compute 3600 wall_seconds per month');
    expect(licenceLine(null)).toMatch(/^uncontracted/);
    expect(licenceLine({ version: 3, state: 'grace', package_key: 'sim-suite', effective_to: null })).toBe('licence v3 · grace · package sim-suite · open-ended');
  });
  it('an availability is the server\'s reason, verbatim', () => {
    const a: Availability = { available: false, action: 'simulation.experiment.declare', contracted: true, exemption: null, capability: { key: 'simulation', label: 'Simulation', core: false },
      licence: { licence_id: 'l', version: 2, state: 'active', package_key: 'fd' }, state: 'active',
      reason: 'capability unavailable (entitlement): simulation is not licensed for this tenant (active; licence v2) — reads of existing records … stay available',
      stays_available: 's', grace: { in_grace: false, grace_until: null, last_valid: null } };
    expect(availabilityLine(a)).toBe(`UNAVAILABLE — ${a.reason}`);
    expect(availabilityLine({ ...a, available: true, reason: 'exempt (warning_control): …' })).toBe('AVAILABLE — exempt (warning_control): …');
  });
});
