import { describe, expect, it } from 'vitest';
import { conditionsOf, factorsOf, optionMarkLine, reasonsLine, useMark } from './validity-b31';

describe('validity-b31 words (B31 §V)', () => {
  it('a decision use is a glyph, a token and words — never colour alone', () => {
    expect(useMark('decision')).toEqual({ glyph: '●', token: '--eye-color-success', text: 'DECISION-GRADE' });
    expect(useMark('diagnostic').text).toBe('DIAGNOSTIC ONLY');
    expect(useMark('refused')).toMatchObject({ glyph: '⚑', text: 'REFUSED FOR DECISION' });
    expect(useMark('other').text).toBe('OTHER');
  });
  it('an option mark names the invalidated input and the refusal at the next derivation', () => {
    expect(optionMarkLine('input_invalidated', true)).toMatch(/^INPUT INVALIDATED .* refused at its next derivation/);
    expect(optionMarkLine('input_invalidated', false)).not.toMatch(/next derivation/);
    expect(optionMarkLine('diagnostic_only', false)).toMatch(/^DIAGNOSTIC ONLY/);
    expect(optionMarkLine(null, false)).toBe('every cited run is decision-grade');
  });
  it('the reasons read in one line', () => {
    expect(reasonsLine([])).toBe('no reason stands against decision use');
    expect(reasonsLine([{ class: 'unpromoted', detail: 'no reviewer' }, { class: 'branch_suspended', detail: 'x' }])).toBe('unpromoted: no reviewer; branch suspended: x');
  });
  it('conditions and factors parse from lines (a JSON value when it parses, a bare key takes the bound value)', () => {
    expect(conditionsOf('a=1\n b = "x" \nc\n\nd=text')).toEqual([{ key: 'a', value: 1 }, { key: 'b', value: 'x' }, { key: 'c' }, { key: 'd', value: 'text' }]);
    expect(factorsOf('id-1=corridor_delay_days\nnoequals\n id-2 = lead_time ')).toEqual([{ assumptionId: 'id-1', factorKey: 'corridor_delay_days' }, { assumptionId: 'id-2', factorKey: 'lead_time' }]);
  });
});
