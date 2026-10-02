import { describe, expect, it } from 'vitest';
import { completenessLabel, familyWords, measureText, proposalLines, upstreamLine } from './composition';

/** CP-6 B29 §A (0092): the composition words are the server's figures, stated with glyph + label + token (never colour alone). */
describe('composition is stated, never derived', () => {
  it('dependency completeness reads as n of m with the missing named, complete, or nothing required', () => {
    expect(completenessLabel({ required_count: 3, satisfied_count: 2, missing: ['market'] }))
      .toEqual({ glyph: '◐', token: '--eye-color-warning', text: '2 of 3 required families linked — missing market' });
    expect(completenessLabel({ required_count: 1, satisfied_count: 0, missing: ['supply-chain|supply-network'] }).text).toMatch(/missing supply-chain or supply-network$/);
    expect(completenessLabel({ required_count: 3, satisfied_count: 3, missing: [] })).toMatchObject({ glyph: '●', token: '--eye-color-success' });
    expect(completenessLabel({ required_count: 0, satisfied_count: 0, missing: [] }).text).toBe('no dependencies required by this kind');
    expect(completenessLabel(null).text).toBe('dependency completeness not read');
    expect(familyWords('a|b|c')).toBe('a or b or c');
  });
  it('a proposal names the upstream key beside the downstream one, and the upstream version it cites', () => {
    expect(proposalLines({ elements: [{ key: 'process.supply_capacity_per_day:regensburg', from_key: 'supply.capacity_per_day', kind: 'assumed', value: 620, unit: 'units/day' }] }))
      .toEqual(['process.supply_capacity_per_day:regensburg ← supply.capacity_per_day = 620 units/day (assumed)']);
    expect(upstreamLine({ upstream_citation: { kind: 'twin', id: '0199aabb-ccdd-7eef-8000-000000000001', version: 3, digest: '9f8e7d6c'.padEnd(64, '0') } }))
      .toBe('twin 0199aabb…@v3 (digest 9f8e7d6c…)');
  });
  it('a ratio measure shows its percentage; an absent one says it is not derivable', () => {
    expect(measureText('capacity_utilisation', 1.2903)).toBe('1.2903 (129%)');
    expect(measureText('throughput_per_day', 620)).toBe('620');
    expect(measureText('capacity_utilisation', null)).toBe('not derivable from the admitted state');
  });
});
