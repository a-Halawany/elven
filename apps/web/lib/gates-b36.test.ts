import { describe, expect, it } from 'vitest';
import { GATE_STATES, boardActsFor, buildExpectedEffect, buildMissingInformation, denialLine, distributionLine, gateStateMark, signatureLine } from './gates-b36';

/** CP-6 B36 (0094 §G): the gate's completion is worded from the record; the helpers shape what is sent and never judge a signature or a gate. */
describe('the gate completion client', () => {
  const ID = '0190b1c2-d3e4-7000-8000-000000000001';
  it('the uniform state vocabulary is the prelude\'s (executive.gate_states) and every state has a glyph, a token and a word', () => {
    expect([...GATE_STATES]).toEqual(['drafted', 'review_requested', 'information_requested', 'deferred', 'challenged', 'recused', 'approved', 'rejected', 'overridden', 'withdrawn']);
    for (const s of GATE_STATES) { const m = gateStateMark(s); expect(m.glyph.length).toBeGreaterThan(0); expect(m.token).toMatch(/^--eye-color-/); expect(m.text.length).toBeGreaterThan(3); }
    expect(gateStateMark('challenged').text).toBe('CHALLENGED — held');
    expect(gateStateMark('nonsense').text).toBe('NONSENSE');
  });
  it('a signature line says VERIFIED only when the server said so', () => {
    expect(signatureLine({ signer: ID, key_id: 'ed25519:0123456789abcdef', signed_at: '2026-09-30T10:00:00Z', verified: true })).toBe('✓ VERIFIED — signed by 0190b1c2… with ed25519:0123456789abcdef at 2026-09-30T10:00:00Z');
    expect(signatureLine({ signer: ID, key_id: 'ed25519:0123456789abcdef', verified: false })).toMatch(/^✕ NOT VERIFIED/);
    expect(signatureLine({})).toBe('✕ NOT VERIFIED — signed by unknown signer with no key');
  });
  it('a denial and a distribution row in words', () => {
    expect(denialLine({ principal_id: ID, action: 'decision.commit', reason: 'no qualifying role binding for action in resolved scope', policy_decision_id: ID }))
      .toBe('denied: 0190b1c2… tried decision.commit — no qualifying role binding for action in resolved scope (policy decision 0190b1c2…)');
    expect(distributionLine({ recipient_principal_id: ID, channel: 'email', synthetic_state: true, state: 'delivered', receipt: { sink_message_id: 'm-1' } })).toBe('0190b1c2… via email (SYNTHETIC — a local sink): DELIVERED — m-1');
    expect(distributionLine({ recipient_principal_id: ID, channel: 'in_app', synthetic_state: false, state: 'delivered', receipt: { proof: 'stands on the decisions surface' } })).toBe('0190b1c2… via in_app: DELIVERED — stands on the decisions surface');
    expect(distributionLine({ recipient_principal_id: ID, channel: 'sms', synthetic_state: true, state: 'failed', receipt: null, error: 'sms: no local webhook sink' })).toMatch(/FAILED — sms: no local webhook sink$/);
  });
  it('the field builders type an item or say why not (the server re-validates naming the field)', () => {
    expect(buildMissingInformation({ what: 'the broker quote', owner: ID, needed_by: '2026-10-15' })).toEqual({ what: 'the broker quote', owner: ID, needed_by: '2026-10-15' });
    expect(buildMissingInformation({ what: 'x', owner: ID, needed_by: '2026-10-15' })).toMatch(/what is missing/);
    expect(buildMissingInformation({ what: 'the quote', owner: 'nope', needed_by: '2026-10-15' })).toMatch(/principal/);
    expect(buildMissingInformation({ what: 'the quote', owner: ID, needed_by: 'soon' })).toMatch(/day/);
    expect(buildExpectedEffect({ effect: 'fewer line stops', measure: 'line_stop_days', direction: 'down', horizon: '90d', basis: 'the intervention run' })).toMatchObject({ direction: 'down', horizon: '90d' });
    expect(buildExpectedEffect({ effect: 'fewer line stops', measure: 'line_stop_days', direction: 'sideways', horizon: '90d', basis: 'the run' })).toMatch(/direction/);
    expect(buildExpectedEffect({ effect: 'fewer line stops', measure: 'line_stop_days', direction: 'down', horizon: '2y', basis: 'the run' })).toMatch(/horizon/);
  });
  it('the board acts offered follow the version state and the member\'s own standing', () => {
    expect(boardActsFor('proposed', null, false)).toEqual(['approve', 'reject', 'defer']);
    expect(boardActsFor('approved', 'approve', false)).toEqual(['defer']);
    expect(boardActsFor('under_review', null, true)).toEqual([]);
    expect(boardActsFor('committed', null, false)).toEqual([]);
  });
});
