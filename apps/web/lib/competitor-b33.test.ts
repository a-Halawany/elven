import { describe, expect, it } from 'vitest';
import { changeLines, comparisonLine, diversityLine, factLine, identityLine, presentedMark, versionLine, type Diversity } from './competitor-b33';

const div = (over: Partial<Diversity> = {}): Diversity => ({ evidence: 2, publishers: 2, contracts: 2, independent_publishers: 2, publisher_list: [], contract_list: [], unknown_origin: 0,
  correlated: [], single_origin: false, threshold: 2, below_threshold: false, ...over });

describe('competitor intelligence words (B33 §CI) — the record worded, never judged', () => {
  it('a limited profile is never shown current: its reasons in words', () => {
    expect(presentedMark({ state: 'current', reasons: [] }).text).toBe('CURRENT');
    expect(presentedMark({ state: 'limited', reasons: ['coverage stale (no evidence within 30 days)', 'revalidation open (identity)'] }).text)
      .toBe('LIMITED — coverage stale (no evidence within 30 days); revalidation open (identity)');
    expect(presentedMark(null).text).toBe('NO APPROVED PROFILE');
  });
  it('a version: its effective day as the day it names, its state, why limited, and its state AS IT WAS at a replayed instant', () => {
    expect(versionLine({ version: 3, state: 'approved', effective_from: '2026-10-01', limited_reasons: [], cause: 'approval' })).toBe('v3 · effective from 2026-10-01 · APPROVED · by approval');
    expect(versionLine({ version: 7, state: 'limited', effective_from: '2026-10-08', limited_reasons: [{ class: 'identity', reason: 'the evidence is no longer resolved' }], cause: 'revalidation' }))
      .toBe('v7 · effective from 2026-10-08 · LIMITED (the evidence is no longer resolved) · by revalidation');
    expect(versionLine({ version: 2, state: 'superseded', state_then: 'approved', effective_from: '2026-03-01', limited_reasons: [], cause: 'approval' })).toBe('v2 · effective from 2026-03-01 · APPROVED · by approval');
  });
  it('facts, diversity and identity in words — correlated sources named, nothing imputed', () => {
    expect(factLine({ key: 'capability:capacity', kind: 'capability', value: { amount: 40000, unit: 'units/month', period: 'month', population: 'gear motors 0.1–5 kW' }, citations: [{}, {}], confidence: 0.85 }))
      .toBe('capability:capacity: 40000 units/month per month (gear motors 0.1–5 kW) · confidence 85% · 2 citation(s)');
    expect(factLine({ key: 'market:poland', kind: 'market', value: { name: 'Poland' }, citations: [{}], confidence: 0.7, limited: true, limited_reasons: [{ class: 'identity', reason: 'x' }] }))
      .toBe('market:poland: Poland · confidence 70% · 1 citation(s) · LIMITED (identity)');
    expect(diversityLine(div())).toBe('2 independent publisher(s) of 2 · 2 contract(s) · 2 evidence item(s)');
    expect(diversityLine(div({ independent_publishers: 1, single_origin: true, below_threshold: true, correlated: [{ kind: 'same_bytes', evidence: ['a', 'b'], sources: ['s1', 's2'] }] })))
      .toBe('1 independent publisher(s) of 2 · 2 contract(s) · 2 evidence item(s) · correlated: the same bytes through 2 sources · BELOW THE THRESHOLD OF 2');
    expect(diversityLine(null)).toBe('not measured');
    expect(identityLine({ state: 'mistaken', resolved: 1, mistaken: 1, unresolved: 0 })).toBe('MISTAKEN — 1 resolved through the graph, 1 mistaken, 0 unresolved');
  });
  it('a proposal\'s change and a comparison\'s state in words', () => {
    expect(changeLines({ events: [{ kind: 'plant_opened', place: 'Tangier', effective_date: '2026-10-01' }], changes: [{ op: 'add', fact: { key: 'facility:tangier' } }],
                         interpretation: { statement: 'Atlas opened a plant', confidence: 0.86 } }))
      .toEqual(['event plant_opened · Tangier · effective 2026-10-01', 'add facility:tangier', 'interpretation (confidence 86%): Atlas opened a plant']);
    expect(comparisonLine({ state: 'suspended', basis_key: 'cap', basis_version: 1, limited_reasons: [], suspended_reason: 'basis superseded' })).toBe('SUSPENDED — basis superseded');
    expect(comparisonLine({ state: 'current', basis_key: 'cap', basis_version: 2, limited_reasons: [], suspended_reason: null })).toBe('CURRENT on cap v2');
  });
});
