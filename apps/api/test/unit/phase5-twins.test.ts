import { describe, expect, it } from 'vitest';
import { entityDigest, validateElementIntake, validateTwinIntake } from '../../src/twin/twins/twin.service.js';
import { foldControls } from '../../src/prediction/controls.js';

describe('P5-M1 · intake validation and the folds a TWN header rests on', () => {
  it('a twin intake needs a boundary, an owner, a model and a validation status with limitations', () => {
    const ok = { kind: 'supply-chain', title: 'Twin', statement: 'Statement', boundary: ['01a07147-48fd-70f9-a572-9450a7982891'], owner: '01a07147-48fd-70f9-a572-9450a7982892',
      behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['x'] } };
    expect(validateTwinIntake(ok, 'c').boundary.length).toBe(1);
    for (const bad of [{ ...ok, boundary: [] }, { ...ok, boundary: ['nope'] }, { ...ok, owner: 'x' }, { ...ok, behaviourModelRef: 'x' }, { ...ok, validation: { status: 'ok' } }]) {
      expect(() => validateTwinIntake(bad as never, 'c')).toThrow();
    }
  });
  it('an element intake cannot carry materiality; citations are typed', () => {
    const e = validateElementIntake({ key: 'inventory.on_hand:SYN-PART-MAG', kind: 'observed', value: 1, material: false,
      citations: [{ kind: 'evidence', id: '01a07147-48fd-70f9-a572-9450a7982891' }] } as never, 'c');
    expect('material' in e).toBe(false);
    expect(e.citations[0]?.version).toBeNull();
    expect(() => validateElementIntake({ key: 'x', kind: 'guessed', value: 1, citations: [] } as never, 'c')).toThrow();
    expect(() => validateElementIntake({ key: 'k', kind: 'assumed', value: 1, citations: [{ kind: 'document', id: 'x' }] } as never, 'c')).toThrow();
  });
  it('an entity citation digest is stable for the same identity and differs when the identity differs', () => {
    const a = entityDigest({ entity_id: 'e', entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', lifecycle_state: 'active' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(entityDigest({ entity_id: 'e', entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', lifecycle_state: 'active' })).toBe(a);
    expect(entityDigest({ entity_id: 'e', entity_type: 'place', canonical_name: 'Bab-el-Mandeb', lifecycle_state: 'active' })).not.toBe(a);
  });
  it('the header fold is fail-closed and synthetic folds upward', () => {
    const f = foldControls([{ synthetic_state: false, classification: 'internal' }, { synthetic_state: true, classification: 'confidential', residency_profile: 'EU-only' }]);
    expect(f.synthetic_state).toBe(true);
    expect(f.classification).toBe('confidential');
    expect(f.residency_profile).toBe('EU-only');
    expect(foldControls([]).classification).toBe('restricted');
  });
});
