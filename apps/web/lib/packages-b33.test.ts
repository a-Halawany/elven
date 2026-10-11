import { describe, expect, it } from 'vitest';
import { coverageLine, dayOf, diversityLine, gateMark, measuredLine, runLine, sectionLine, versionMark } from './packages-b33';

/** CP-6 B33 §PK (0111): the Domains workspace is WORDED, never computed on the client — the certification, the suite, the health and the gate are the server's. */
describe('the domain-package workspace words what the server recorded', () => {
  it('a gate state is a glyph, a token and words — a disabled or conflicted function is critical, never softened', () => {
    expect(gateMark('active')).toMatchObject({ glyph: '●', text: 'ACTIVE' });
    expect(gateMark('disabled')).toMatchObject({ glyph: '⊘', token: '--eye-color-critical', text: 'DISABLED' });
    expect(gateMark('conflicted')).toMatchObject({ glyph: '⚑', token: '--eye-color-critical', text: 'CONFLICTED' });
    expect(gateMark('uncertified').text).toBe('NOT CERTIFIED');
    expect(gateMark('odd').text).toBe('ODD');
    expect(versionMark('proposed').text).toBe('PROPOSED (certification pending)');
    expect(versionMark('certified').text).toBe('CERTIFIED (not yet active)');
  });
  it('a run names its verdict and its failing blocking checks; an agent\'s run says it certifies nothing', () => {
    const checks = [{ check: 'canonical_mapping', passed: false, severity: 'blocking' as const, findings: ['x'] }, { check: 'inputs_statement', passed: false, severity: 'advisory' as const, findings: ['y'] }];
    expect(runLine({ mode: 'certification', passed: false, checks, run_by_kind: 'human' })).toBe('CERTIFICATION FAILED: canonical_mapping');
    expect(runLine({ mode: 'diagnostic', passed: false, checks, run_by_kind: 'agent' })).toBe('DIAGNOSTIC FAILED: canonical_mapping — an agent\'s run (diagnostic; it certifies nothing)');
    expect(runLine({ mode: 'health', passed: true, checks: [], run_by_kind: 'agent' })).toMatch(/^HEALTH PASSED/);
  });
  it('a section says who approved it until when, an expired approval is said, an open one awaits a specialist', () => {
    expect(sectionLine('ontology', { state: 'approved', digest: 'd', expires_at: '2027-10-09T10:00:00Z', ontology_version_id: 'o' })).toBe('ontology: APPROVED until 2027-10-09 — with the steward\'s ontology version');
    expect(sectionLine('methodology', { state: 'expired', digest: 'd', expires_at: '2026-01-01T00:00:00Z' })).toBe('methodology: EXPIRED (approved, the approval lapsed until 2026-01-01)');
    expect(sectionLine('assessment', undefined)).toBe('assessment: OPEN — awaiting a domain specialist');
    expect(sectionLine('escalation', { state: 'rejected', digest: 'd' })).toBe('escalation: REJECTED');
  });
  it('source diversity says correlated and single-origin sources and a shortfall', () => {
    expect(diversityLine({ publishers: 2, contracts: 3, threshold: 2, meets: true, correlated_publishers: ['IMF'], single_origin: false })).toBe('2 publisher(s), 3 contract(s), threshold 2 — meets; correlated: IMF');
    expect(diversityLine({ publishers: 1, contracts: 2, threshold: 2, meets: false, correlated_publishers: [], single_origin: true })).toBe('1 publisher(s), 2 contract(s), threshold 2 — BELOW the threshold; single origin');
    expect(diversityLine(null)).toBe('—');
  });
  it('a watchlist\'s coverage is fresh or STALE against its freshness at the read\'s instant; never covered is said', () => {
    expect(coverageLine({ last_covered_at: '2026-10-01T00:00:00Z', freshness_days: 14, read_at: '2026-10-09T00:00:00Z' })).toEqual({ stale: false, text: 'fresh — last covered 8 day(s) ago (freshness 14 days)' });
    expect(coverageLine({ last_covered_at: '2026-09-01T00:00:00Z', freshness_days: 14, read_at: '2026-10-09T00:00:00Z' }).stale).toBe(true);
    expect(coverageLine({ last_covered_at: null, freshness_days: 14, read_at: '2026-10-09T00:00:00Z' }).text).toMatch(/^NO COVERAGE/);
  });
  it('a DATE is the day it names; a measurement keeps its numbers', () => {
    expect(dayOf('2026-10-09')).toBe('2026-10-09');
    expect(dayOf('2026-10-09T23:30:00-05:00')).toBe('2026-10-09');
    expect(dayOf(null)).toBe('—');
    expect(measuredLine({ n: 5, precision: 0.8, min_n: 5, outside: [] })).toBe('n 5 · precision 0.8 · min n 5');
  });
});
