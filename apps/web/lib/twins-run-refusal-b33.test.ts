import { describe, expect, it } from 'vitest';
import { runRefusalLine } from './twins';

// B33 act-found: the Simulations page shows a refused run in the server's words (GovernedButton alone showed only FAILED)
describe('runRefusalLine', () => {
  it('carries the code and the server\'s own words', () => {
    expect(runRefusalLine({ code: 'EYE-REQ-001', message: 'run rejected (envelope): outside the operating envelope of supply-flow@1 (corridor_delay_days = 75 outside [0, 60]); a run outside the envelope needs a twin owner\'s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)' }))
      .toBe('EYE-REQ-001 run rejected (envelope): outside the operating envelope of supply-flow@1 (corridor_delay_days = 75 outside [0, 60]); a run outside the envelope needs a twin owner\'s acknowledgement (envelope.acknowledge true with a reason of 8+ characters)');
  });
  it('says the run was refused when the server gave no words', () => {
    expect(runRefusalLine(undefined)).toBe('the run was refused');
  });
});
