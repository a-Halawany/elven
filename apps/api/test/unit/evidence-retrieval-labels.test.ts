/**
 * CP-6 B21.2 (AU-MEM-0067's vault clause, Class B; design-p2-harness.md §3.9, D2.2, D2.6): the two literals the route, the
 * series reader, the harness regexes and the web page share — pinned byte for byte. `INTEGRITY_REFUSED_MESSAGE` is A7's one
 * sentence for a refused read under a reachable root (the route's 409 and the series' `refused (409): …` tombstone);
 * `TIER_UNREACHABLE_LABEL(root)` is the degraded answer's label for an unreachable root (the download's `degraded.label`, the
 * series' `degraded (EYE-DEG-001): …` reason, the evidence page's block). No database.
 */
import { describe, expect, it } from 'vitest';
import { INTEGRITY_REFUSED_MESSAGE, TIER_UNREACHABLE_LABEL } from '../../src/observation/vault/evidence.service.js';

describe('B21.2 · the evidence retrieval\'s labels', () => {
  it('the archive root\'s label, byte for byte', () => {
    expect(TIER_UNREACHABLE_LABEL('archive')).toBe('the archive root of the vault could not be reached; this evidence\'s record — its manifest, digest, tier and custody — is served; its bytes are not, and nothing about them was verified or refuted; retry when the tier is mounted (retention/tier/state names the roots)');
  });
  it('the evidence root\'s label, byte for byte', () => {
    expect(TIER_UNREACHABLE_LABEL('evidence')).toBe('the evidence root of the vault could not be reached; this evidence\'s record — its manifest, digest, tier and custody — is served; its bytes are not, and nothing about them was verified or refuted; retry when the tier is mounted (retention/tier/state names the roots)');
  });
  it('the refused read\'s one sentence (A7): the string the route and the series share', () => {
    expect(INTEGRITY_REFUSED_MESSAGE).toBe('evidence bytes failed integrity verification and were not served');
  });
});
