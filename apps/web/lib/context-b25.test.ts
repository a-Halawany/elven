import { describe, expect, it } from 'vitest';
import { divergedLine, environmentFacts, environmentLine, featureGroup, featureValue, freshLine, gapLine, outcomeMark, short } from './context-b25';

/** CP-6 B25 part `context` (0108 §CX): the grounding page is worded from the record (the outcome is the port's; a differing environment is said). */
describe('the grounding page is worded from the record', () => {
  it('a replay outcome carries a glyph and words, never colour alone', () => {
    expect(outcomeMark('REPRODUCED')).toMatchObject({ glyph: '✓', token: '--eye-color-success' });
    expect(outcomeMark('DIVERGED').text.startsWith('DIVERGED — ')).toBe(true);
    expect(outcomeMark('MAYBE').glyph).toBe('?');
  });
  it('what diverged is named, with its note', () => {
    expect(divergedLine([])).toBe('nothing diverged');
    expect(divergedLine([{ what: 'output' }, { what: 'evidence.readable', note: '1 pinned evidence version(s) could not be read' }])).toBe('output; evidence.readable (1 pinned evidence version(s) could not be read)');
  });
  it('an environment that differs is SAID, with the facts that differ', () => {
    expect(environmentLine(true, [])).toMatch(/^the same environment/);
    expect(environmentLine(false, ['implementation_digest'])).toBe('a DIFFERENT environment: implementation_digest differ — the reproduction across environments is reported, not hidden');
  });
  it('the fresh grounding is reported beside the replay, never substituted', () => {
    expect(freshLine(null, 3)).toBe('no fresh grounding was read');
    expect(freshLine({ revision_head: 3, differs: false, what: [] }, 3)).toBe('a grounding now (revision 3) would pin the same inputs');
    expect(freshLine({ revision_head: 5, differs: true, what: ['graph.revision_head', 'graph.edges'] }, 3))
      .toBe('a grounding now would differ (revision 5 against the pinned 3): graph.revision_head, graph.edges — the replay is held to the pinned set, not to the graph as it stands');
  });
  it('gaps, features and environments read as words', () => {
    expect(gapLine({ key: 'twin.snapshot', required: false, reason: 'no twin served' })).toBe('twin.snapshot: no twin served');
    expect(gapLine({ key: 'evidence.versions', required: true, reason: 'none known' })).toBe('evidence.versions (required): none known');
    expect(featureValue({ key: 'twin.shock.corridor_delay_days', source: 's', digest: 'd', value: 14 })).toBe('14');
    expect(featureValue({ key: 'twin.terms.kg_per_unit', source: 's', digest: 'd', value: 0.44565217 })).toBe('0.4457');
    expect(featureValue({ key: 'twin.route.plan', source: 's', digest: 'd' })).toBe('structured — pinned by its digest');
    expect(featureGroup('graph.edges.ships_through')).toBe('graph');
    expect(featureGroup('assumption.x')).toBe('assumption');
    expect(environmentFacts(null)).toBe('no environment recorded (an ungrounded forecast)');
    expect(environmentFacts({ node: 'v22.1.0', platform: 'darwin', arch: 'arm64', method_ref: 'seasonal-naive@1', implementation_digest: '7da8dc6d086417600f198d4d', assembler_version: 'assembler@1' }))
      .toBe('node v22.1.0 · darwin/arm64 · seasonal-naive@1 · implementation 7da8dc6d0864… · assembler@1');
    expect(short('abcdefghij', 4)).toBe('abcd…');
  });
});
