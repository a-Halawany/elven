/**
 * CP-6 B29 §A (0092) — the pure logic of the twin families: the schema check, each family's own rules, the family-derived measures
 * (the enterprise's capacity utilisation from coupled process capacities, the process's line throughput, …), and the refusal
 * mapping of the composition ports' texts (the int harness phase6-composition-b29 exercises the ports themselves).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { FAMILIES, PRODUCT_FAMILIES, conformsToSchema, familyMeasures, validateFamily, type ElementSchema } from '../../src/twin/families/families.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const PROCESS: ElementSchema = {
  'line.capacity_per_day': { unit: 'units/day', description: 'line capacity', required: true },
  'line.availability': { unit: 'ratio', description: 'availability', required: false },
  'supply.capacity_per_day': { unit: 'units/day', description: 'supply capacity', required: false },
};
const REGULATION: ElementSchema = {
  'rule.effective_from': { unit: 'date', description: 'effective', required: true },
  'rule.note': { unit: null, description: 'a note', required: false },
};

describe('B29 §A families — the schema check (positive / refusal)', () => {
  it('a conforming process version passes', () => {
    expect(validateFamily('process', PROCESS, [
      { key: 'line.capacity_per_day:L1', value: 1200, unit: 'units/day' }, { key: 'line.availability', value: 0.9, unit: 'ratio' },
    ])).toEqual([]);
  });
  it('refuses an undeclared prefix, a wrong unit, a non-number, a negative quantity and a ratio above 1', () => {
    const errors = conformsToSchema(PROCESS, [
      { key: 'line.speed', value: 3, unit: 'm/s' },
      { key: 'line.capacity_per_day', value: 1200, unit: 'units/week' },
      { key: 'supply.capacity_per_day', value: 'a lot', unit: 'units/day' },
      { key: 'line.capacity_per_day:L2', value: -4, unit: 'units/day' },
      { key: 'line.availability', value: 1.4, unit: 'ratio' },
    ]);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toMatch(/^line\.speed: not an element this kind declares/);
    expect(errors[1]).toMatch(/unit units\/week — the kind declares units\/day/);
    expect(errors[2]).toMatch(/is a finite number/);
    expect(errors[3]).toMatch(/is negative/);
    expect(errors[4]).toMatch(/a ratio lies between 0 and 1/);
  });
  it('a date is a day; a unit-less entry takes no unit', () => {
    expect(conformsToSchema(REGULATION, [{ key: 'rule.effective_from', value: '2027-01-01', unit: 'date' }, { key: 'rule.note', value: 'text', unit: null }])).toEqual([]);
    expect(conformsToSchema(REGULATION, [{ key: 'rule.effective_from', value: '1 Jan 2027', unit: 'date' }])[0]).toMatch(/a date is a day/);
    expect(conformsToSchema(REGULATION, [{ key: 'rule.note', value: 'text', unit: 'EUR' }])[0]).toMatch(/the kind declares no unit/);
  });
  it('an empty schema (the supply-chain kind) checks nothing — the pre-B29 twins admit as before (recovery)', () => {
    expect(validateFamily('supply-chain', {}, [{ key: 'anything.at_all', value: 'x', unit: 'furlongs' }])).toEqual([]);
  });
  it('an x- kind (family extension) gets the schema check alone', () => {
    const schema: ElementSchema = { 'turbine.output': { unit: 'MW', description: 'output', required: true } };
    expect(validateFamily('extension', schema, [{ key: 'turbine.output', value: 4.2, unit: 'MW' }])).toEqual([]);
    expect(validateFamily('extension', schema, [{ key: 'turbine.output', value: 4.2, unit: 'kW' }])).toHaveLength(1);
  });
  it('the family rules run after the schema: a zero-capacity line; more roles filled than the headcount', () => {
    expect(validateFamily('process', PROCESS, [{ key: 'line.capacity_per_day:L1', value: 0, unit: 'units/day' }])[0]).toMatch(/a line with no capacity/);
    const org: ElementSchema = { headcount: { unit: 'people', description: 'h', required: true }, 'roles.filled': { unit: 'people', description: 'f', required: false } };
    expect(validateFamily('organisation', org, [{ key: 'headcount', value: 10, unit: 'people' }, { key: 'roles.filled:ops', value: 12, unit: 'people' }])[0]).toMatch(/12 roles filled by a headcount of 10/);
  });
  it('every product family has a definition', () => {
    for (const f of PRODUCT_FAMILIES) expect(typeof FAMILIES[f].measures).toBe('function');
  });
});

describe('B29 §A families — the family-derived measures', () => {
  it('process: throughput is the line output at its availability, bounded by the coupled supply capacity', () => {
    expect(familyMeasures('process', [{ key: 'line.capacity_per_day:L1', value: 1000, unit: 'units/day' }, { key: 'line.availability', value: 0.9, unit: 'ratio' }]))
      .toMatchObject({ throughput_per_day: 900, bottleneck: 'line' });
    expect(familyMeasures('process', [{ key: 'line.capacity_per_day:L1', value: 1000, unit: 'units/day' }, { key: 'supply.capacity_per_day', value: 620, unit: 'units/day' }]))
      .toMatchObject({ throughput_per_day: 620, bottleneck: 'supply' });
  });
  it('enterprise: capacity utilisation is demand over the effective capacity of its processes — and moves when a coupled supply capacity drops', () => {
    const base = [{ key: 'demand.per_day', value: 800, unit: 'units/day' }, { key: 'process.line_capacity_per_day:regensburg', value: 1000, unit: 'units/day' }];
    expect(familyMeasures('enterprise', [...base, { key: 'process.supply_capacity_per_day:regensburg', value: 1000, unit: 'units/day' }])).toMatchObject({ capacity_utilisation: 0.8 });
    expect(familyMeasures('enterprise', [...base, { key: 'process.supply_capacity_per_day:regensburg', value: 620, unit: 'units/day' }])).toMatchObject({ capacity_utilisation: 1.2903, effective_capacity_per_day: 620 });
  });
  it('an incomplete element measures nothing', () => {
    expect(familyMeasures('enterprise', [{ key: 'demand.per_day', value: 800, unit: 'units/day', health: 'stale' }, { key: 'process.line_capacity_per_day:a', value: 1000, unit: 'units/day' }]))
      .toMatchObject({ demand_per_day: null, capacity_utilisation: null });
  });
  it('the other families', () => {
    expect(familyMeasures('market', [{ key: 'demand.volume_per_month', value: 10000, unit: 'units/month' }, { key: 'share.own', value: 0.25, unit: 'ratio' }])).toMatchObject({ own_volume_per_month: 2500 });
    expect(familyMeasures('product', [{ key: 'unit.cost', value: 60, unit: 'EUR' }, { key: 'unit.price', value: 80, unit: 'EUR' }])).toMatchObject({ unit_margin: 20, margin_ratio: 0.25 });
    expect(familyMeasures('infrastructure', [{ key: 'asset.capacity', value: 100, unit: 'units/day' }, { key: 'asset.load', value: 90, unit: 'units/day' }, { key: 'asset.availability', value: 0.75, unit: 'ratio' }]))
      .toMatchObject({ utilisation: 1.2 });
    expect(familyMeasures('regulation', [{ key: 'rule.effective_from', value: '2027-01-11', unit: 'date' }], '2027-01-01')).toMatchObject({ in_force: false, days_until_effective: 10 });
    expect(familyMeasures('regulation', [{ key: 'rule.effective_from', value: '2027-01-11', unit: 'date' }], null)).toMatchObject({ in_force: null });
    expect(familyMeasures('organisation', [{ key: 'roles.required:ops', value: 8, unit: 'people' }, { key: 'roles.filled:ops', value: 6, unit: 'people' }])).toMatchObject({ role_coverage: 0.75 });
    expect(familyMeasures('competitor', [{ key: 'capacity.per_month', value: 5000, unit: 'units/month' }])).toMatchObject({ capacity_per_month: 5000 });
    expect(familyMeasures('extension', [{ key: 'x', value: 1, unit: null }])).toEqual({});
  });
});

describe('B29 §A — the composition ports\' refusals map to their honest answers', () => {
  const map = (message: string, code: string) => {
    const r = asObservationRefusal(Object.assign(new Error(message), { code }), '00000000-0000-4000-8000-000000000000');
    return r instanceof HttpException ? r.getStatus() : null;
  };
  it('the ownership boundary and the acting principal are 403', () => {
    expect(map('coupling rejected (ownership_boundary): the owner of upstream twin a does not write downstream twin b', '42501')).toBe(403);
    expect(map('twin link rejected (ownership): a link into twin b is declared by that twin\'s owner', '42501')).toBe(403);
    expect(map('twin contract rejected (ownership): the contract of twin a is published by its owner', '42501')).toBe(403);
    expect(map('twin kind rejected (scope): kind x-wind is not registered in this tenant and domain', '42501')).toBe(403);
    expect(map('coupling rejected (actor): recorded by the acting principal', '42501')).toBe(403);
  });
  it('absences are 404, states and duplicates 409, the caller\'s own request 422', () => {
    expect(map('coupling rejected: no such proposal p in this domain', '23503')).toBe(404);
    expect(map('twin link rejected: no such downstream twin d in this domain', '23503')).toBe(404);
    expect(map('coupling rejected (state): proposal p is applied, not proposed', '22023')).toBe(409);
    expect(map('coupling rejected (link_retired): link l was retired', '22023')).toBe(409);
    expect(map('coupling rejected (draft_conflict): the open draft (version 3) of twin d already holds k', '22023')).toBe(409);
    expect(map('twin kind rejected (duplicate): a kind named x-wind is already registered', '23505')).toBe(409);
    expect(map('twin link rejected (duplicate): twin d already consumes twin u', '23505')).toBe(409);
    expect(map('twin link rejected (retired): link l was retired at t', '22023')).toBe(409);
    expect(map('twin contract rejected (live_link): live link l consumes key k', '22023')).toBe(409);
    expect(map('twin link rejected (uncontracted_key): key k is not in the current contract (version 1) of twin u', '22023')).toBe(422);
    expect(map('twin link rejected (use_not_approved): twin u\'s contract (version 1) does not approve the use x', '22023')).toBe(422);
    expect(map('twin link rejected (cycle): twin u already depends, over live links, on twin d', '22023')).toBe(422);
    expect(map('twin kind rejected (schema): at least one element is required', '22023')).toBe(422);
  });
});
