/**
 * B107 §0 — every B107 noun maps centrally (observation-errors.ts `B107 §0`): 403 actor / ownership / authority / separation_of_duties /
 * person / access, 404 unknown_*, 409 state / stale / duplicate / held / expired, 422 the rest — and the route-side helper agrees.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { GOVERNANCE_NOUNS, refuseGovernance } from '../../src/governance/seams.js';

const status = (msg: string) => asObservationRefusal(Object.assign(new Error(msg), { code: '42501' }), 'c')?.getStatus() ?? null;

describe('B107 §0 · the refusal rows', () => {
  it('each noun × class maps to its status', () => {
    for (const noun of GOVERNANCE_NOUNS) {
      for (const cls of ['actor', 'ownership', 'authority', 'separation_of_duties', 'person', 'access']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(403);
      for (const cls of ['unknown_artifact', 'unknown_record']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(404);
      for (const cls of ['state', 'stale', 'duplicate', 'held', 'expired']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(409);
      for (const cls of ['reason', 'request', 'scope']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(422);
    }
  });
  it('the route helper speaks the same class form', () => {
    const e = refuseGovernance('acceptance record', 'separation_of_duties', 'never accepted by its proposer', 'c', 403);
    expect(e.getStatus()).toBe(403);
    expect((e.getResponse() as { message: string }).message).toBe('acceptance record rejected (separation_of_duties): never accepted by its proposer');
  });
});
