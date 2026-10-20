/**
 * B82 §EV — the citation, the viewer, custody, rights, verification and disclosure contract as pure functions (lib/evidence-b82.ts). Every
 * fixture is SYNTHETIC (the server's answer shapes, graph.resolve_citation / the segment route). CONSTRUCTION only.
 */
import { describe, expect, it } from 'vitest';
import {
  OUTCOME_WORDS, OUTCOMES, citationOfItemId, SEGMENT_MAX_BYTES, VERIFICATION_WORDS, base64ToBytes, bytesVerification, citationHref, citationKey, citationLabel, citationLine, custodySummary,
  custodyTimeline, decisionReady, evidenceCard, evidenceDisclosure, parseCitations, rightsNotice, segmentRequestOf, signatureVerifications, splitSegment, toResolution, toRights,
  verificationSummary, viewerKind, viewerStatement, worstOutcome,
} from './evidence-b82';

const E = '01a084f5-7979-76cf-8e3b-a7b0e96f55e0';
const C = '01a084f5-9d6d-7000-8000-000000000001';
const D64 = 'a'.repeat(64);
const leafRow = (over: Record<string, unknown> = {}) => ({
  path: [`CLM:${C}@1`, `EVD:${E}@2`], span_basis: 'claim_lineage',
  evidence: { id: E, version: 2, digest: D64, byte_start: 471, byte_end: 854, media_type: 'application/json', byte_length: 1200, source_id: '01a084f5-7643-7c01-ac15-9a488ed983b1', contract_version: 1,
    lifecycle: 'corrected', truth_state: 'observed', synthetic: true, recorded_at: '2026-10-18T08:00:00.000000Z', fragment: { byte_start: 471, byte_end: 854, method_ref: 'json-array-framing@1.2.0', parent_evd_id: E } },
  digest_ok: true, custody: { events: 3, last_event_at: '2026-10-18T09:00:00.000000Z', last_verified_at: '2026-10-18T09:00:00.000000Z', last_failed_at: null, state: 'intact' },
  rights: null, contract_rights_state: 'confirmed', tier: 'hot', correction: { correction_of: `EVD:${E}@1`, corrected_by: null }, outcome: 'resolved', reasons: [], detail: null, ...over,
});
const resolutionRow = (over: Record<string, unknown> = {}, leaves = [leafRow()]) => ({
  ref: { kind: 'claim', id: C, version: 1, digest: D64 }, outcome: 'resolved', own: { outcome: 'resolved', digest_binds: 'version', detail: null,
    object: { type: 'CLM', lifecycle: 'active', truth_state: 'extracted', synthetic: true, recorded_at: '2026-10-18T08:00:00Z', title: 'transits', correction_of: null, corrected_by: null } },
  leaves, truncated: false, depth: 4, method: 'b82-ev-resolve-1', as_of: '2026-10-19T08:00:00.000000Z', ...over,
});

describe('THE CITATION — parsed once each, labelled, linked to exactly what it names; seven outcomes in words', () => {
  it('parseCitations keeps each well-formed citation once and counts the malformed — never guesses', () => {
    const r = parseCitations([{ kind: 'evidence', id: E.toUpperCase(), version: 2, digest: D64 }, { kind: 'evidence', id: E, version: 2, digest: D64 }, { kind: 'claim', id: C, version: '1', digest: null },
      { kind: 'gossip', id: E, version: 1, digest: null }, { kind: 'run', id: 'x', version: 1, digest: null }, { kind: 'run', id: E, version: 0, digest: null }, { kind: 'run', id: E, version: 1, digest: 'abc' }, null]);
    expect(r.refs).toEqual([{ kind: 'evidence', id: E, version: 2, digest: D64 }, { kind: 'claim', id: C, version: 1, digest: null }]);
    expect(r.rejected).toBe(5);   // the duplicate is kept once, not counted malformed
    expect(parseCitations(undefined)).toEqual({ refs: [], rejected: 0 });
  });
  it('labels, keys and links: evidence opens its page; another type its explanation at exactly the cited version; an estimate has no page here', () => {
    expect(citationLabel({ kind: 'run', id: E, version: 1, digest: null })).toBe('simulation run 01a084f5… v1');
    expect(citationKey({ kind: 'evidence', id: E.toUpperCase(), version: 2, digest: null })).toBe(`evidence:${E}@2`);
    expect(citationHref({ kind: 'evidence', id: E, version: 2, digest: null })).toBe(`/observation/evidence/${E}`);
    expect(citationHref({ kind: 'run', id: E, version: 3, digest: null })).toBe(`/graph/explain/SIM/${E}?version=3`);
    expect(citationHref({ kind: 'estimate', id: E, version: 1, digest: null })).toBeNull();
  });
  it('a briefing item id names its citation (unbound: items carry no digest) — or nothing, never a guess', () => {
    expect(citationOfItemId(`claim:${C.toUpperCase()}@2`)).toEqual({ kind: 'claim', id: C, version: 2, digest: null });
    expect(citationOfItemId(`indicator:${C}@1`)).toBeNull();
    expect(citationOfItemId('ledger:attention.raised#12')).toBeNull();
    expect(citationOfItemId(`claim:${C}@0`)).toBeNull();
  });
  it('every outcome has a glyph and a word; the worst wins; only RESOLVED is decision-ready', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual([...OUTCOMES].sort());
    for (const o of OUTCOMES) { expect(OUTCOME_WORDS[o].word.length).toBeGreaterThan(3); expect(OUTCOME_WORDS[o].token).toMatch(/^color\./); }
    expect(worstOutcome(['resolved', 'corrected', 'stale_citation'])).toBe('stale_citation');
    expect(worstOutcome(['withdrawn', 'inaccessible', 'rights_expired'])).toBe('inaccessible');
    expect(worstOutcome([])).toBe('resolved');
    expect(OUTCOMES.filter(decisionReady)).toEqual(['resolved']);
  });
  it('toResolution maps the server\'s answer onto the seam, keeping the own outcome, the reasons, the span basis and the fragment', () => {
    const r = toResolution(resolutionRow());
    expect(r.ref).toEqual({ kind: 'claim', id: C, version: 1, digest: D64 });
    expect(r.own).toMatchObject({ outcome: 'resolved', digestBinds: 'version', object: { type: 'CLM', truthState: 'extracted' } });
    const l = r.leaves[0]!;
    expect(l.evidence).toEqual({ id: E, version: 2, digest: D64, byteStart: 471, byteEnd: 854, mediaType: 'application/json' });
    expect(l).toMatchObject({ spanBasis: 'claim_lineage', digestOk: true, tier: 'hot', custodyState: 'intact', correction: { correctionOf: `EVD:${E}@1`, correctedBy: null },
      fragment: { byteStart: 471, byteEnd: 854, methodRef: 'json-array-framing@1.2.0', parentId: E }, contractRightsState: 'confirmed' });
    expect(toResolution({ ...resolutionRow(), outcome: 'mystery' }).outcome).toBe('unverifiable');   // an unknown word is never read as resolved
  });
  it('the citation line: resolved says what the digest binds; anything else gives its reasons in the server\'s words', () => {
    expect(citationLine(toResolution(resolutionRow()))).toMatchObject({ outcome: '✓ RESOLVED', binds: 'the digest binds this version', detail: null, ready: true });
    const stale = toResolution(resolutionRow({ outcome: 'unverifiable', own: { outcome: 'stale_citation', digest_binds: 'none', detail: 'the citation carries digest ffff…', object: null } },
      [leafRow({ outcome: 'unverifiable', detail: 'the cited span 5–999999 does not lie within the 1200 recorded bytes' })]));
    expect(citationLine(stale)).toMatchObject({ outcome: '◍ UNVERIFIABLE', binds: 'no digest carried — the version is named, not bound', ready: false,
      detail: 'the citation carries digest ffff…; the cited span 5–999999 does not lie within the 1200 recorded bytes' });
  });
});

describe('THE VIEWER — the cited span in place; media and geospatial stated as B83\'s', () => {
  it('kinds by media type; a statement for what is not rendered in place', () => {
    expect(['text/csv', 'application/json', 'application/ld+json', 'application/geo+json', 'image/png', 'application/pdf', 'application/octet-stream', null].map(viewerKind))
      .toEqual(['text', 'json', 'json', 'geo', 'media', 'media', 'binary', 'text']);
    expect(viewerStatement('media')).toMatch(/B83’s \(chapter 31, UX-31-001\)/);
    expect(viewerStatement('geo')).toMatch(/B83’s \(chapter 31, UX-31-003\)/);
    expect(viewerStatement('text')).toBeNull();
  });
  it('the governed read a leaf asks for: its exact version and span with context; a span over 64 KiB is cut and said; no bytes, no read', () => {
    const l = toResolution(resolutionRow()).leaves[0]!;
    expect(segmentRequestOf(l)).toEqual({ evdId: E, version: 2, byteStart: 471, byteEnd: 854, context: 256, note: null });
    const big = { evidence: { ...l.evidence!, byteStart: 0, byteEnd: SEGMENT_MAX_BYTES + 10 } };
    expect(segmentRequestOf(big)).toMatchObject({ byteEnd: SEGMENT_MAX_BYTES, note: expect.stringMatching(/its first 65536 are read here/) });
    expect(segmentRequestOf({ evidence: null })).toEqual({ problem: 'this leaf names no evidence bytes; there is nothing to read' });
    expect(segmentRequestOf({ evidence: { ...l.evidence!, byteStart: 9, byteEnd: 9 } })).toMatchObject({ problem: expect.stringMatching(/empty or malformed/) });
  });
  it('the served window split at the cited offsets — UTF-8 for text (a lossy decode said), hexadecimal for media and binary', () => {
    const bytes = base64ToBytes(Buffer.from('ab[CITED]cd', 'utf8').toString('base64'));
    expect(splitSegment(bytes, { start: 2, end: 9 }, 'text')).toEqual({ before: 'ab', cited: '[CITED]', after: 'cd', encoding: 'utf-8', lossy: false, citedBytes: 7 });
    expect(splitSegment(Uint8Array.from([0xff, 0x00, 0x10]), { start: 1, end: 2 }, 'binary')).toEqual({ before: 'ff', cited: '00', after: '10', encoding: 'hex', lossy: false, citedBytes: 1 });
    const euro = new TextEncoder().encode('x€y');   // € is three bytes: a window boundary inside it decodes lossily, and says so
    expect(splitSegment(euro, { start: 2, end: 4 }, 'text').lossy).toBe(true);
    expect(splitSegment(bytes, { start: 50, end: 60 }, 'text')).toMatchObject({ cited: '', citedBytes: 0 });   // offsets outside the window clip, never throw
  });
});

describe('CUSTODY — every event in order, in words; a failure and an unreachable root never hidden', () => {
  it('oldest first; a segment read names its span; the alarms are flagged; the summary counts them', () => {
    const rows = [
      { event: 'custody.retrieved', actor: 'principal:i', occurredAt: '2026-10-19T09:00:00Z', digestVerified: true, details: { purpose: 'evidence_segment', segment: '471-854' } },
      { event: 'custody.admitted', actor: 'agent:upload@1', occurredAt: '2026-10-18T08:00:00Z', digestVerified: true },
      { event: 'custody.integrity_failed', actor: 'principal:i', occurredAt: '2026-10-19T10:00:00Z', digestVerified: false, details: { failure: 'corrupt' } },
      { event: 'custody.retrieval_degraded', actor: 'principal:i', occurredAt: '2026-10-19T11:00:00Z', digestVerified: null },
    ];
    const t = custodyTimeline(rows);
    expect(t.map((x) => x.word)).toEqual(['admitted', 'read', 'INTEGRITY FAILED', 'ROOT UNREACHABLE — nothing verified or refuted']);
    expect(t[1]).toMatchObject({ note: 'the cited span 471–854 was read (evidence_segment)', verified: '✓ digest verified', alarm: false });
    expect(t[2]).toMatchObject({ note: 'failure: corrupt', verified: '✕ digest NOT verified', alarm: true });
    expect(t[3]!.verified).toBe('— not applicable');
    expect(custodySummary(rows)).toBe('4 custody event(s), oldest first · 2 integrity failure(s) or unreachable read(s) recorded — shown in the list');
    expect(custodySummary([])).toBe('no custody event is recorded for this evidence');
  });
});

describe('RIGHTS — the governed terms beside the contract\'s own statement; "no expiry declared" when none', () => {
  const contract = { rightsState: 'confirmed', licence: 'CC BY 4.0 (SYNTHETIC)', permittedUse: ['analysis'], attribution: 'Source: fixture', retention: '7 years' };
  const terms = (over: Record<string, unknown> = {}) => toRights({ terms_id: E, version: 2, source_id: C, contract_version: 1, expires_at: null, purposes: ['decision support'], prohibited_uses: [],
    attribution: null, declared_by: 'principal:f-aydin', declared_at: '2026-10-19T08:00:00Z', state: 'in_force', ...over });
  it('no terms declared: stated, never blank; nothing blocked by inference', () => {
    expect(rightsNotice({ terms: null, contract, now: new Date() })).toMatchObject({ state: 'none_declared', headline: 'No rights terms declared — no expiry declared', expiry: 'no expiry declared', blocksDecisionUse: false });
  });
  it('in force, expired, withdrawn: the server\'s state shown; expired and withdrawn block decision-active use; an expiry passed since the read is said', () => {
    expect(rightsNotice({ terms: terms(), contract, now: new Date() })).toMatchObject({ state: 'in_force', headline: '✓ Rights terms in force', expiry: 'no expiry declared', blocksDecisionUse: false });
    expect(rightsNotice({ terms: terms({ state: 'expired', expires_at: '2026-10-01T00:00:00Z' }), contract: null, now: new Date() })).toMatchObject({ headline: '⊘ RIGHTS EXPIRED — no decision-active use', expiry: 'expired 2026-10-01T00:00:00Z', blocksDecisionUse: true });
    expect(rightsNotice({ terms: terms({ state: 'withdrawn' }), contract: null, now: new Date() }).blocksDecisionUse).toBe(true);
    const passed = rightsNotice({ terms: terms({ expires_at: '2026-10-19T09:00:00Z' }), contract: null, now: new Date('2026-10-19T10:00:00Z') });
    expect(passed).toMatchObject({ staleSinceRead: true, headline: '⚠ The declared expiry has passed since this read — read the terms again', blocksDecisionUse: false });
    expect(toRights({ nothing: 1 })).toBeNull();
  });
});

describe('VERIFICATION — VERIFIED / FAILED / UNAVAILABLE / NOT CHECKED; never verified by inference', () => {
  it('the bytes facet from the governed read; the signature facets from the verifier\'s outcome; the summary', () => {
    expect(Object.keys(VERIFICATION_WORDS).sort()).toEqual(['failed', 'not_checked', 'unavailable', 'verified']);
    expect(bytesVerification(null).outcome).toBe('not_checked');
    expect(bytesVerification({ integrity: 'verified', contentDigest: D64, at: 't' })).toMatchObject({ outcome: 'verified', detail: expect.stringMatching(/re-hashed on this read/) });
    expect(bytesVerification({ integrity: 'failed', at: 't' }).outcome).toBe('failed');
    expect(bytesVerification({ integrity: 'unavailable', at: 't' })).toMatchObject({ outcome: 'unavailable', detail: expect.stringMatching(/neither|nothing about the bytes/) });
    const sigs = signatureVerifications([{ signer: 'p1', key_id: 'ed25519:1', verification: { outcome: 'verified', reason: 'ok' } }, { signer: 'p2', key_id: 'ed25519:2', verification: { outcome: 'unavailable', reason: 'no key is on file' } },
      { signer: 'p3', key_id: 'ed25519:3', verification: { outcome: 'mystery' } }], 't');
    expect(sigs.map((s) => s.outcome)).toEqual(['verified', 'unavailable', 'unavailable']);
    expect(verificationSummary(sigs)).toEqual({ outcome: 'unavailable', text: '1 verified · 0 failed · 2 unavailable · 0 not checked' });
    expect(verificationSummary([sigs[0]!, bytesVerification(null)]).outcome).toBe('not_checked');
    expect(verificationSummary([sigs[0]!]).outcome).toBe('verified');
    expect(verificationSummary([]).outcome).toBe('not_checked');
  });
});

describe('DISCLOSURE (HX-01) and THE CARD (CMP-025)', () => {
  it('sources, citations, versions, cutoff, omissions and the policy scope; unresolved → viewable, not decision-ready', () => {
    const ok = toResolution(resolutionRow());
    const bad = toResolution(resolutionRow({ outcome: 'withdrawn', truncated: true, ref: { kind: 'run', id: E, version: 1, digest: null } }, [leafRow({ evidence: null, outcome: 'unverifiable' })]));
    const d = evidenceDisclosure([ok, bad], { withheld: 2, cutoff: '2026-10-18T00:00:00Z' });
    expect(d).toMatchObject({ sources: '1 source(s)', citations: '2 citation(s) · 1 evidence leaf(s)', cutoff: 'known at 2026-10-18T00:00:00Z', decisionReady: false,
      policyScope: 'policy-filtered: this reader sees part of the scope', reasons: ['simulation run 01a084f5… v1: withdrawn'] });
    expect(d.omissions).toEqual(['1 citation(s) were cut at their lineage depth — not every evidence leaf is listed', '1 lineage path(s) reach no evidence bytes', '2 item(s) withheld under policy from this reader']);
    expect(evidenceDisclosure([ok]).decisionReady).toBe(true);
    expect(evidenceDisclosure([ok]).omissions).toEqual(['none recorded by this read']);
    expect(evidenceDisclosure([ok], { digest: 'c'.repeat(64) }).digest).toBe(`this read's resolution digest ${'c'.repeat(16)}…`);
    expect(evidenceDisclosure([]).decisionReady).toBe(false);   // nothing cited is not decision-ready by default
  });
  it('the card: source, truth, authority, rights ("no expiry declared"), digest, custody, freshness, tier — each stated, never blank', () => {
    const c = evidenceCard(toResolution(resolutionRow()).leaves[0]!, new Date('2026-10-18T10:00:00Z'));
    expect(c.title).toBe('Evidence 01a084f5… v2');
    expect(c.lines.map((l) => l.term)).toEqual(['Source', 'Truth', 'Authority', 'Rights', 'Digest', 'Custody', 'Freshness', 'Tier', 'Transformation']);
    expect(c.lines.find((l) => l.term === 'Transformation')!.value).toBe(`a fragment of evidence 01a084f5… bytes 471–854, framed by json-array-framing@1.2.0`);
    expect(c.lines.find((l) => l.term === 'Rights')!.value).toBe('no rights terms declared — no expiry declared');
    expect(c.lines.find((l) => l.term === 'Truth')!.value).toBe('observed · SYNTHETIC');
    expect(c.lines.find((l) => l.term === 'Freshness')!.value).toMatch(/^recorded 2 h ago/);
    expect(c.lines.every((l) => l.value !== '')).toBe(true);
  });
});
