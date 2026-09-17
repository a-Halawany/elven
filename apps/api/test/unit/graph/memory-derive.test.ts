/**
 * The derivation's rules at the function boundary (CP-6 B19; design §2.2, §2.4; corrections C2, C10): the statement TEMPLATE
 * of memory-derive@1.0.0 pinned byte for byte on the three shapes (an EVT with its event time, a REL with qualifiers, a warning
 * with its breaching evidence and its rule), the DIGEST the port re-computes, the classification FOLD by CLEARANCE_RANK (an
 * unknown level is restricted) and the synthetic rule (true or nothing folds true), the BASIS gate on every refusal it answers
 * (the withdrawn version, the withdrawn object, a lifecycle outside active/admitted/corrected, the imported claim, the queued /
 * rejected / case-corrected version, a warning not raised or acknowledged — expired, closed) and on what it admits (a
 * review-corrected version's own payload, a not_required payload, a raised or acknowledged warning), the EVIDENCE gate (C2: a
 * withdrawn evidence version, or an object whose latest version is withdrawn, grounds nothing; admitted and corrected pass), the
 * evidence VERSION a lineage digest names (the highest carrying it; null when none does) and the source reference's shape. No
 * database: what the B19 harness proves on a live chain, this holds on the functions.
 */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_OBJECT_TYPES, MEMORY_BASIS_KINDS, MEMORY_DERIVE_METHOD, MEMORY_DERIVED_SOURCE_KINDS, MEMORY_SERIES_KEYS_MAX,
  anySynthetic, basisGate, derivedStatementOf, evidenceGate, evidenceVersionOf, mostRestrictive, sourceRefOf, statementDigestOf,
} from '../../../src/graph/memory/derive.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const CLAIM = uid();
const claimRow = (over: Row = {}, payload: Row = {}): Row => ({
  object_id: CLAIM, object_type: 'REL', object_version: '1', lifecycle_state: 'active', truth_state: 'extracted', withdrawal_reason: null,
  payload: { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait', review: { state: 'approved', reason: 'fixture', decider: null }, ...payload },
  ...over,
});
const gate = (over: Partial<Parameters<typeof basisGate>[0]> = {}) => {
  const row = over.row ?? claimRow();
  return basisGate({ kind: 'claim', row, latest: row, caseState: null, supersededTo: null, label: `REL ${CLAIM}@1`, ...over });
};

describe('B19 · the constants the service and the port share', () => {
  it('the method, the kinds, the claim object types and the series ceiling', () => {
    expect(MEMORY_DERIVE_METHOD).toBe('memory-derive@1.0.0');
    expect([...MEMORY_BASIS_KINDS]).toEqual(['claim', 'warning']);
    expect([...MEMORY_DERIVED_SOURCE_KINDS]).toEqual(['document', 'communication', 'telemetry']);
    expect([...CLAIM_OBJECT_TYPES]).toEqual(['ENT', 'EVT', 'CLM', 'REL', 'ASM']);
    expect(MEMORY_SERIES_KEYS_MAX).toBe(20);
  });
});

describe('B19 · the statement template memory-derive@1.0.0 (§2.4), byte for byte', () => {
  it('an EVT with an event time: subject predicate object_value — as of <ISO ms>', () => {
    const s = derivedStatementOf({ kind: 'claim', payload: { claim_kind: 'event', subject: 'Bab el-Mandeb Strait', predicate: 'daily_transit_count', object_value: '39 on 2024-01-13' }, eventTime: '2024-01-13T00:00:00.000Z' });
    expect(s).toBe('Bab el-Mandeb Strait daily_transit_count 39 on 2024-01-13 — as of 2024-01-13T00:00:00.000Z');
  });
  it('a REL with qualifiers: the entries sorted by key, joined "; " in parentheses — a string as is, a number by String(), an object by JCS', () => {
    const s = derivedStatementOf({ kind: 'claim', payload: { subject: 'NORDWERK Magnet GmbH', predicate: 'stocks', object_value: 'C-4471', qualifiers: { valid_from: '2024-01-01T00:00:00Z', identifiers: { sku: 'C-4471', system: 'erp' }, count: 3, active: true } }, eventTime: '2024-01-14T00:00:00.000Z' });
    expect(s).toBe('NORDWERK Magnet GmbH stocks C-4471 (active true; count 3; identifiers {"sku":"C-4471","system":"erp"}; valid_from 2024-01-01T00:00:00Z) — as of 2024-01-14T00:00:00.000Z');
  });
  it('the harness fixture: the supply REL with valid_from; a seeded claim without an event time carries no suffix; empty qualifiers add nothing; the operands are trimmed', () => {
    expect(derivedStatementOf({ kind: 'claim', payload: { subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait', qualifiers: { valid_from: '2024-01-01T00:00:00Z' } }, eventTime: '2024-01-14T00:00:00.000Z' }))
      .toBe('NORDWERK Magnet GmbH ships_through Bab el-Mandeb Strait (valid_from 2024-01-01T00:00:00Z) — as of 2024-01-14T00:00:00.000Z');
    expect(derivedStatementOf({ kind: 'claim', payload: { subject: ' NORDWERK Magnet GmbH ', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait', qualifiers: {} }, eventTime: null }))
      .toBe('NORDWERK Magnet GmbH ships_through Bab el-Mandeb Strait');
    expect(derivedStatementOf({ kind: 'claim', payload: { subject: 'x', predicate: 'is_a', object_value: 'y', qualifiers: 'not an object' }, eventTime: null })).toBe('x is_a y');
    expect(derivedStatementOf({ kind: 'claim', payload: {}, eventTime: null })).toBe('  ');
  });
  it('a warning: title — consequence (observed <day>: <value>; rule <rule>) — the evidence entry and the indicator entry; either alone; neither', () => {
    const evidence = [
      { kind: 'evidence', evidence_object_id: uid(), evidence_version: 1, observation_at: '2023-11-12', value: 31 },
      { kind: 'flip_event', event_id: uid(), branch_id: uid() },
      { kind: 'indicator', indicator_id: uid(), rule: 'fixture:src:value < 40 for 5 consecutive observation(s)' },
    ];
    const payload = { title: 'Corridor — declared C3 — branch "Collapse" flipped', consequence: 'rebook the third shipment before the window closes', evidence };
    expect(derivedStatementOf({ kind: 'warning', payload, row: { title: 'ignored when the payload carries one', consequence: 'ignored', evidence: [] } }))
      .toBe('Corridor — declared C3 — branch "Collapse" flipped — rebook the third shipment before the window closes (observed 2023-11-12: 31; rule fixture:src:value < 40 for 5 consecutive observation(s))');
    // The row stands in for what the payload lacks.
    expect(derivedStatementOf({ kind: 'warning', payload: {}, row: { title: 'T — branch flipped', consequence: 'act before the window closes', evidence: [evidence[0]] } }))
      .toBe('T — branch flipped — act before the window closes (observed 2023-11-12: 31)');
    expect(derivedStatementOf({ kind: 'warning', payload: { title: 'T', consequence: 'C', evidence: [{ kind: 'indicator', indicator_id: uid(), rule: 'k < 1 for 1 consecutive observation(s)' }] }, row: {} }))
      .toBe('T — C (rule k < 1 for 1 consecutive observation(s))');
    expect(derivedStatementOf({ kind: 'warning', payload: { title: 'T', consequence: 'C', evidence: [{ kind: 'indicator', indicator_id: uid(), rule: null }] }, row: {} })).toBe('T — C');
  });
  it('the digest is sha256 of the UTF-8 statement, hex — what memory.record_item re-computes', () => {
    expect(statementDigestOf('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(statementDigestOf('Bab el-Mandeb — as of')).toMatch(/^[0-9a-f]{64}$/);
    expect(statementDigestOf('a')).not.toBe(statementDigestOf('b'));
  });
});

describe('B19 · the fold (D6): the most restrictive classification by CLEARANCE_RANK; synthetic when any input says true or says nothing', () => {
  it('mostRestrictive', () => {
    expect(mostRestrictive(['internal', 'confidential'])).toBe('confidential');
    expect(mostRestrictive(['public', 'internal'])).toBe('internal');
    expect(mostRestrictive(['public', 'public'])).toBe('public');
    expect(mostRestrictive(['internal', 'restricted', 'confidential'])).toBe('restricted');
    expect(mostRestrictive(['public', undefined])).toBe('restricted');
    expect(mostRestrictive(['internal', null])).toBe('restricted');
    expect(mostRestrictive(['internal', 'top-secret'])).toBe('restricted');
    expect(mostRestrictive([])).toBe('restricted');
  });
  it('anySynthetic', () => {
    expect(anySynthetic([false, true])).toBe(true);
    expect(anySynthetic([false, undefined])).toBe(true);
    expect(anySynthetic([false, null])).toBe(true);
    expect(anySynthetic([false, false])).toBe(false);
    expect(anySynthetic([true])).toBe(true);
    expect(anySynthetic([])).toBe(true);
  });
});

describe('B19 · the basis gate: the lifecycle, the latest version, the imported claim, the review case (G2), the warning state', () => {
  it('admits an approved case, a not_required payload, a review-corrected version\'s own payload (no case) and an admitted or corrected lifecycle', () => {
    expect(gate({ caseState: 'approved' })).toBeNull();
    expect(gate({ row: claimRow({}, { review: { state: 'not_required', reason: null, decider: null } }) })).toBeNull();
    expect(gate({ row: claimRow({ object_version: '2', lifecycle_state: 'corrected', truth_state: 'asserted' }, { review: { state: 'corrected', reason: 'restated', decider: 'principal:x' } }) })).toBeNull();
    expect(gate({ row: claimRow({ lifecycle_state: 'admitted' }) })).toBeNull();
    // A payload still saying queued while the CASE says approved is derivable: the case decides (G2).
    expect(gate({ row: claimRow({}, { review: { state: 'queued', reason: 'confidence below the method review threshold', decider: null } }), caseState: 'approved' })).toBeNull();
  });
  it('a withdrawn version → 409 EYE_STA_003 naming the reason; the LATEST version withdrawn while an earlier one was asked for → 409 EYE_STA_003 (no version of a withdrawn object grounds a record)', () => {
    const r = gate({ row: claimRow({ object_version: '2', lifecycle_state: 'withdrawn', truth_state: 'withdrawn', withdrawal_reason: 'the publisher withdrew it' }), label: `REL ${CLAIM}@2` });
    expect(r).toEqual({ status: 409, code: 'EYE_STA_003', message: `REL ${CLAIM}@2 was withdrawn (the publisher withdrew it); a withdrawn basis grounds no memory record` });
    expect(gate({ row: claimRow({ lifecycle_state: 'withdrawn' }) })?.message).toBe(`REL ${CLAIM}@1 was withdrawn; a withdrawn basis grounds no memory record`);
    const earlier = gate({ row: claimRow(), latest: claimRow({ object_version: '2', lifecycle_state: 'withdrawn' }) });
    expect(earlier).toEqual({ status: 409, code: 'EYE_STA_003', message: `claim ${CLAIM} was withdrawn at version 2; no version of a withdrawn object grounds a memory record` });
  });
  it('a lifecycle outside active / admitted / corrected → 409 EYE_STA_002', () => {
    for (const state of ['proposed', 'disputed', 'superseded', 'archived', 'deleted']) {
      const r = gate({ row: claimRow({ lifecycle_state: state }) });
      expect(r, state).toEqual({ status: 409, code: 'EYE_STA_002', message: `REL ${CLAIM}@1 is ${state}; a memory record is derived from an active, admitted or corrected version` });
    }
  });
  it('an imported claim (imported_from on the LATEST version — the 0077 rule) → 409 EYE_STA_002 naming the import', () => {
    const importId = uid();
    const latest = claimRow({ object_version: '2' }, { imported_from: { format: 'eye-import-provenance@1', import_id: importId, partner_key: 'harness-partner' } });
    const r = gate({ row: claimRow(), latest });
    expect(r).toEqual({ status: 409, code: 'EYE_STA_002', message: `claim ${CLAIM} is imported (import ${importId}); an imported claim is derived at its origin and re-imported; it is not derived here` });
    // The version asked for imported too (the latest is the same row).
    expect(gate({ row: latest, latest, label: `REL ${CLAIM}@2` })?.status).toBe(409);
  });
  it('queued → 409 with the payload\'s sentence first, the case\'s vocabulary word as the fallback, then "queued"; rejected → 409; case-corrected → 409 naming the successor', () => {
    const queued = gate({ row: claimRow({}, { review: { state: 'queued', reason: 'confidence below the method review threshold', decider: null } }), caseState: 'queued', queuedReason: 'below_review_threshold' });
    expect(queued).toEqual({ status: 409, code: 'EYE_STA_002', message: `REL ${CLAIM}@1 is queued for review (confidence below the method review threshold); a claim a person has not decided does not ground a memory record` });
    expect(gate({ row: claimRow({}, { review: { state: 'queued', reason: null, decider: null } }), caseState: 'queued', queuedReason: 'contradiction' })?.message).toMatch(/is queued for review \(contradiction\)/);
    expect(gate({ row: claimRow({}, { review: { state: 'queued', reason: null, decider: null } }), caseState: 'queued' })?.message).toMatch(/is queued for review \(queued\)/);
    // The CASE says queued though the payload says approved: the case decides.
    expect(gate({ caseState: 'queued' })?.status).toBe(409);
    expect(gate({ caseState: 'rejected' })).toEqual({ status: 409, code: 'EYE_STA_002', message: `REL ${CLAIM}@1 was rejected in review; it grounds no memory record` });
    expect(gate({ caseState: 'corrected', supersededTo: 2 })).toEqual({ status: 409, code: 'EYE_STA_002', message: `REL ${CLAIM}@1 was corrected in review to version 2; derive from the corrected version` });
    expect(gate({ caseState: 'corrected', supersededTo: null })?.message).toMatch(/was corrected in review to version a later one; derive from the corrected version/);
  });
  it('the order: the withdrawn version before the imported rule, the imported rule before the review case', () => {
    const importId = uid();
    const latest = claimRow({ object_version: '2', lifecycle_state: 'withdrawn' }, { imported_from: { import_id: importId } });
    expect(gate({ row: claimRow(), latest, caseState: 'queued' })?.code).toBe('EYE_STA_003');
    expect(gate({ row: claimRow(), latest: claimRow({ object_version: '2' }, { imported_from: { import_id: importId } }), caseState: 'queued' })?.message).toMatch(/is imported/);
  });
  it('a warning: raised or acknowledged admitted; expired or closed (C10) → 409 EYE_STA_002; the WRN row\'s own lifecycle gates first', () => {
    const W = uid();
    const wrn = (over: Row = {}): Row => ({ object_id: W, object_type: 'WRN', object_version: '1', lifecycle_state: 'active', truth_state: 'inferred', withdrawal_reason: null, payload: {}, ...over });
    const at = (warningState: string | null, row: Row = wrn()) => basisGate({ kind: 'warning', row, latest: row, caseState: null, supersededTo: null, label: `WRN ${W}@1`, warningState });
    expect(at('raised')).toBeNull();
    expect(at('acknowledged')).toBeNull();
    expect(at('expired')).toEqual({ status: 409, code: 'EYE_STA_002', message: `warning ${W} is expired; a memory record is derived from a raised or acknowledged warning` });
    expect(at('closed')?.message).toBe(`warning ${W} is closed; a memory record is derived from a raised or acknowledged warning`);
    expect(at(null)?.message).toBe(`warning ${W} is not raised; a memory record is derived from a raised or acknowledged warning`);
    expect(at('raised', wrn({ lifecycle_state: 'withdrawn' }))?.code).toBe('EYE_STA_003');
  });
});

describe('B19 · the evidence gate (C2): a withdrawn evidence version grounds no record', () => {
  const E = uid();
  const evd = (over: Row = {}): Row => ({ object_id: E, object_type: 'EVD', object_version: '1', lifecycle_state: 'admitted', truth_state: 'observed', withdrawal_reason: null, payload: { content_digest: 'a'.repeat(64) }, ...over });
  it('admitted and corrected versions pass; a withdrawn version → 409 EYE_STA_003 naming the reason and the basis', () => {
    expect(evidenceGate(evd(), evd(), `ENT ${CLAIM}@1`)).toBeNull();
    expect(evidenceGate(evd({ object_version: '2', lifecycle_state: 'corrected' }), evd({ object_version: '2', lifecycle_state: 'corrected' }), `ENT ${CLAIM}@1`)).toBeNull();
    const withdrawn = evd({ object_version: '2', lifecycle_state: 'withdrawn', truth_state: 'withdrawn', withdrawal_reason: 'the record was withdrawn by its publisher (harness)' });
    expect(evidenceGate(withdrawn, withdrawn, `ENT ${CLAIM}@1`)).toEqual({ status: 409, code: 'EYE_STA_003', message: `evidence ${E}@2 was withdrawn (the record was withdrawn by its publisher (harness)); ENT ${CLAIM}@1 rests on withdrawn evidence and grounds no memory record` });
    expect(evidenceGate(evd({ lifecycle_state: 'withdrawn' }), null, `ENT ${CLAIM}@1`)?.message).toBe(`evidence ${E}@1 was withdrawn; ENT ${CLAIM}@1 rests on withdrawn evidence and grounds no memory record`);
  });
  it('the object\'s LATEST version withdrawn while an earlier version was picked → 409 EYE_STA_003 (a revision-then-withdrawal)', () => {
    const r = evidenceGate(evd(), evd({ object_version: '3', lifecycle_state: 'withdrawn' }), `ENT ${CLAIM}@1`);
    expect(r).toEqual({ status: 409, code: 'EYE_STA_003', message: `evidence ${E} was withdrawn at version 3; ENT ${CLAIM}@1 rests on withdrawn evidence and grounds no memory record` });
  });
});

describe('B19 · the evidence version a lineage digest names (D14) and the source reference', () => {
  it('evidenceVersionOf picks the HIGHEST version carrying the digest, whatever the row order; null when none carries it', () => {
    const E = uid(); const digest = 'b'.repeat(64);
    const v = (n: number, d: string): Row => ({ object_id: E, object_type: 'EVD', object_version: String(n), payload: { content_digest: d } });
    expect(evidenceVersionOf([v(1, digest), v(2, digest), v(3, 'c'.repeat(64))], digest)?.['object_version']).toBe('2');
    expect(evidenceVersionOf([v(3, 'c'.repeat(64)), v(1, digest), v(2, digest)], digest)?.['object_version']).toBe('2');
    expect(evidenceVersionOf([v(1, digest)], digest)?.['object_version']).toBe('1');
    expect(evidenceVersionOf([v(1, 'c'.repeat(64))], digest)).toBeNull();
    expect(evidenceVersionOf([], digest)).toBeNull();
    // A version without a payload digest never matches.
    expect(evidenceVersionOf([{ object_id: E, object_version: '1', payload: {} }, { object_id: E, object_version: '2', payload: null }], digest)).toBeNull();
  });
  it('sourceRefOf reads SRC:<uuid>@<n>; a claim\'s SRC:<uuid>@extraction:<key> and everything else is null', () => {
    const S = uid();
    expect(sourceRefOf(`SRC:${S}@3`)).toEqual({ sourceId: S, contractVersion: 3 });
    expect(sourceRefOf(`SRC:${S.toUpperCase()}@1`)).toEqual({ sourceId: S, contractVersion: 1 });
    expect(sourceRefOf(`SRC:${S}@extraction:supply-relations`)).toBeNull();
    expect(sourceRefOf(`principal:${S}`)).toBeNull();
    expect(sourceRefOf(`SRC:not-a-uuid@1`)).toBeNull();
    expect(sourceRefOf(null)).toBeNull();
    expect(sourceRefOf(42)).toBeNull();
  });
});
