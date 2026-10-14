/**
 * B94 §0 — every B94 noun maps centrally (observation-errors.ts `B94 §0`): 403 for actor / ownership / authority / separation_of_duties /
 * person / access, 404 for unknown_*, 409 for state / stale / duplicate / held, 422 for the rest — and the route-side refusal helper agrees.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { DELIVERY_NOUNS, refuseDelivery } from '../../src/delivery/seams.js';

const status = (msg: string) => asObservationRefusal(Object.assign(new Error(msg), { code: '42501' }), 'c')?.getStatus() ?? null;

describe('B94 §0 · the refusal rows', () => {
  it('each noun × class maps to its status', () => {
    for (const noun of DELIVERY_NOUNS) {
      for (const cls of ['actor', 'ownership', 'authority', 'separation_of_duties', 'person', 'access']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(403);
      for (const cls of ['unknown_case', 'unknown_programme']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(404);
      for (const cls of ['state', 'stale', 'duplicate', 'held']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(409);
      for (const cls of ['reason', 'request', 'mapping']) expect(status(`${noun} rejected (${cls}): x`), `${noun}/${cls}`).toBe(422);
    }
  });
  it('the route helper speaks the same class form', () => {
    const e = refuseDelivery('support grant', 'access', 'no live grant', 'c', 403);
    expect(e.getStatus()).toBe(403);
    expect((e.getResponse() as { message: string }).message).toBe('support grant rejected (access): no live grant');
  });
});
