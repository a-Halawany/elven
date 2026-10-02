import { describe, expect, it } from 'vitest';
import { activationWords } from './commitments';

/** CP-6 B36 (0094 §C4): a target's activation state is the server's; the page words it — nothing real is activated by a demonstration. */
describe('B36 collab · the activation state in words', () => {
  it('synthetic, inactive (registered / deactivated), active, retired', () => {
    expect(activationWords({ synthetic: true, state: 'active', activation_state: 'synthetic' })).toMatch(/^SYNTHETIC — no activation to make/);
    expect(activationWords({ synthetic: false, state: 'active', activation_state: 'inactive', deactivation_reason: null })).toMatch(/^INACTIVE — registered/);
    expect(activationWords({ synthetic: false, state: 'active', activation_state: 'inactive', deactivation_reason: 'the contract lapsed' })).toBe('INACTIVE — deactivated: the contract lapsed');
    expect(activationWords({ synthetic: false, state: 'active', activation_state: 'active', authorized_by_decision: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })).toMatch(/^ACTIVE — authorized by decision 0192a1b2…/);
    expect(activationWords({ synthetic: false, state: 'retired', activation_state: 'inactive' })).toBe('retired');
  });
});
