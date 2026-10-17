import { describe, expect, it } from 'vitest';
import { confirmStepDefaults, edit, submitHolds, validateForm, type FieldValue } from './forms-b80';
import { SPECS, duplicateOptionKeys, initialValues, optionKey, requestsOf, sequenceText } from './package-form-b80';

/**
 * CP-6 B80 §CL-F — the decision-package form over the EXISTING routes: the bodies are the shapes decision.controller.ts validates
 * (validatePackageIntake, validateOptionIntake — restated here, the server still decides), and a sequence failing part-way is said as
 * exactly what was recorded. SYNTHETIC: "Bab el-Mandeb corridor reroute (SYNTHETIC)".
 */
const ME = '0190a0b0-0000-7000-8000-00000000b80a';
const DEC = '0190a0b0-0000-7000-8000-00000000dec1';
const RUN = '0190a0b0-0000-7000-8000-00000000a001';
const filled = (): Record<string, FieldValue> => {
  const v = initialValues(ME, '2026-10-17T10:00:00.000Z');
  v['decision'] = edit(DEC); v['title'] = edit('Bab el-Mandeb corridor reroute (SYNTHETIC)');
  v['statement'] = edit('Whether to reroute the corridor shipments via the Cape while the strait is closed (SYNTHETIC).');
  v['observed_through'] = edit('2024-01-17');
  v[optionKey(0, 'key')] = edit('reroute-cape'); v[optionKey(0, 'title')] = edit('Reroute via the Cape');
  v[optionKey(0, 'citeKind')] = edit('run'); v[optionKey(0, 'citeId')] = edit(RUN); v[optionKey(0, 'risks')] = edit('two weeks longer, higher freight');
  v[optionKey(1, 'key')] = edit('wait'); v[optionKey(1, 'title')] = edit('Wait for the corridor to reopen'); v[optionKey(1, 'kind')] = edit('status_quo');
  v[optionKey(1, 'reason')] = edit('no run models waiting; rests on the corridor assumption');
  return v;
};

describe('the bodies are the existing routes\' shapes', () => {
  it('declare → { decisionObjectId, title, statement, owner }; open → { knownAt, observedThrough as a DAY }; one body per used option', () => {
    const r = requestsOf(filled());
    expect(r.declare).toEqual({ decisionObjectId: DEC, title: 'Bab el-Mandeb corridor reroute (SYNTHETIC)', statement: 'Whether to reroute the corridor shipments via the Cape while the strait is closed (SYNTHETIC).', owner: ME });
    expect(r.open).toEqual({ knownAt: '2026-10-17T10:00:00.000Z', observedThrough: '2024-01-17' });
    expect(r.options).toEqual([
      { key: 'reroute-cape', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: RUN }], risks: ['two weeks longer', 'higher freight'], opportunities: [] },
      { key: 'wait', title: 'Wait for the corridor to reopen', kind: 'status_quo', consequences: [], unsimulatedReason: 'no run models waiting; rests on the corridor assumption', risks: [], opportunities: [] },
    ]);
  });
  it('unused option slots send nothing; a blank observed-through is null (not an invented day)', () => {
    const v = filled(); v['observed_through'] = edit('');
    for (const f of ['key', 'title', 'reason']) v[optionKey(1, f)] = edit('');
    const r = requestsOf(v);
    expect(r.options.map((o) => o.key)).toEqual(['reroute-cape']);
    expect(r.open.observedThrough).toBeNull();
  });
});

describe('the server\'s rules, shown before the act', () => {
  it('the DEC and the owner are ids; the title and statement bounds; option keys, kinds and the not-simulated reason', () => {
    const v = filled();
    v['decision'] = edit('not-a-dec'); v['title'] = edit('x'); v[optionKey(0, 'key')] = edit('Reroute Cape');
    v[optionKey(1, 'reason')] = edit('short'); v[optionKey(0, 'citeKind')] = edit('');
    expect(validateForm(SPECS, v).map((e) => e.message)).toEqual([
      'The decision (DEC) is an identifier (a UUID)', 'Package title needs at least 2 characters (it has 1)',
      'Option 1 key must be like reroute-cape or status-quo', 'Option 1: say what kind of record the consequence is',
      'Option 2 cites no consequence: say, in at least eight characters, why it was not simulated']);
  });
  it('duplicate option keys are found before the server refuses them', () => {
    const v = filled(); v[optionKey(1, 'key')] = edit('reroute-cape');
    expect(duplicateOptionKeys(requestsOf(v))).toEqual(['reroute-cape']);
  });
  it('the owner and the known-at instant are PROPOSED defaults until their steps are continued past; then nothing holds', () => {
    let v = filled();
    expect(submitHolds({ specs: SPECS, values: v, reviewedDigest: 'd', currentDigest: 'd' }).filter((h) => h.kind === 'unconfirmed_proposal').map((h) => h.field)).toEqual(expect.arrayContaining(['owner', 'known_at']));
    for (const s of [0, 1, 2]) { expect(validateForm(SPECS, v, s), `step ${s}`).toEqual([]); v = confirmStepDefaults(SPECS, v, s); }
    expect(submitHolds({ specs: SPECS, values: v, reviewedDigest: 'd', currentDigest: 'd' })).toEqual([]);
  });
});

describe('a sequence failing part-way is said as exactly what was recorded', () => {
  const rc = { policyDecisionId: '0190a0b0-0000-7000-8000-000000000p01', auditSeq: 41 };
  it('all recorded → complete; a refusal or an unknown answer part-way → NOT complete, each act listed', () => {
    expect(sequenceText([{ step: 'declare', ok: true, receipt: rc, error: null, unknown: false }, { step: 'open', ok: true, receipt: { ...rc, auditSeq: 42 }, error: null, unknown: false }], 2))
      .toMatchObject({ complete: true, title: 'Declared — 2 governed acts recorded, each with its receipt' });
    const part = sequenceText([{ step: 'declare', ok: true, receipt: rc, error: null, unknown: false },
      { step: 'open', ok: false, receipt: null, error: { code: 'EYE_AUT_001', message: 'no qualifying role binding for action in resolved scope', correlationId: 'c' }, unknown: false }], 3);
    expect(part.complete).toBe(false);
    expect(part.title).toBe('NOT complete — 1 of 3 acts recorded; the next was not');
    expect(part.lines[1]).toBe('✕ open — refused: no qualifying role binding for action in resolved scope');
    const lost = sequenceText([{ step: 'declare', ok: false, receipt: null, error: null, unknown: true }], 2);
    expect(lost.lines[0]).toMatch(/outcome UNKNOWN \(no answer\); check the package on the Decisions page before trying again/);
    expect(`${lost.title}`).not.toMatch(/^Declared/);
  });
});
