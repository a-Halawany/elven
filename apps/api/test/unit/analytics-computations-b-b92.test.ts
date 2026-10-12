/*
 * CP-6 B92 §MCB — the pure pieces of computations B: the twenty-three contracts (definitionsB) against the rules the definition table and
 * §MD's propose port apply (key form, lengths, kinds, a rate's numerator and denominator, the window, NO person dimension, privacy,
 * k ≥ 5, the threshold's shape, a non-empty `serves` (V01-T-040), the purpose keys, computationKey ⇔ supported, an unsupported reason that
 * NAMES its carrier stage); the two request parsers of the routes (the temporal declaration, the search review); and EVERY refusal text
 * the part's migration raises driven through the central mapper with its SQLSTATE (403 → 404 → 409 → 422 by class).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { definitionsB, MCB_METRIC_KEYS } from '../../src/analytics/computations-b/definitions-b.js';
import { parseSearchReview, parseTemporalDeclaration, QUERY_CLASSES, TIME_FIELDS } from '../../src/analytics/computations-b/computations-b.controller.js';
import { PERSON_DIMENSIONS } from '../../src/analytics/seams.js';

/** Existing domain role codes (identity.roles) an owner may be — the named human the act binds holds it. */
const ROLE_CODES = ['data_steward', 'auditor', 'knowledge_owner', 'ontology_steward', 'collection_manager', 'record_authority', 'domain_admin', 'product_analytics_owner', 'commercial_authority', 'executive'];
const PURPOSES = ['product-quality', 'mission-outcomes', 'governance-assurance', 'service-reliability', 'analytics-cost', 'experience-telemetry'];
const COMPUTED = ['MET-006', 'MET-007', 'MET-008', 'MET-009', 'MET-010', 'MET-011', 'MET-012', 'MET-013', 'MET-014', 'MET-017', 'MET-018', 'MET-031', 'MET-033', 'MET-036', 'MET-037'];
const UNSUPPORTED: Record<string, RegExp> = { 'MET-015': /\bB55\b/, 'MET-016': /\bB52\b.*\bH1\b/, 'MET-032': /\bH2\b/, 'MET-034': /\bB108\b.*\bB107\/H3\b/, 'MET-035': /\bB106\b/,
  'MET-038': /\bB64\b/, 'MET-039': /\bB94\b/, 'MET-040': /\bB76\b/ };

describe('definitionsB — the contracts admit the definition table and §MD\'s rules', () => {
  it('exactly the part\'s rows MET-006..018 and MET-031..040, each once', () => {
    expect(MCB_METRIC_KEYS).toEqual(['MET-006', 'MET-007', 'MET-008', 'MET-009', 'MET-010', 'MET-011', 'MET-012', 'MET-013', 'MET-014', 'MET-015', 'MET-016', 'MET-017', 'MET-018',
      'MET-031', 'MET-032', 'MET-033', 'MET-034', 'MET-035', 'MET-036', 'MET-037', 'MET-038', 'MET-039', 'MET-040']);
    expect(definitionsB.filter((c) => c.computationKey !== null).map((c) => c.metricKey)).toEqual(COMPUTED);
  });
  for (const c of definitionsB) {
    it(`${c.metricKey}: the table's checks and the contract rules`, () => {
      expect(c.metricKey).toMatch(/^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/);
      expect(c.title.trim().length).toBeGreaterThanOrEqual(4); expect(c.title.length).toBeLessThanOrEqual(200);
      expect(c.meaning.trim().length).toBeGreaterThanOrEqual(8);
      expect(c.unit.trim().length).toBeGreaterThanOrEqual(1); expect(c.unit.length).toBeLessThanOrEqual(40);
      expect(['rate', 'duration', 'ratio', 'count', 'score']).toContain(c.kind);
      expect(['higher', 'lower', 'band', 'track']).toContain(c.direction);
      if (c.kind === 'rate') { expect(c.numerator).toBeTruthy(); expect(c.denominator).toBeTruthy(); }
      expect(['calendar_quarter', 'calendar_month', 'rolling_days']).toContain(c.window.kind);
      expect(c.window.clock).toBe('record');                                             // every §MCB source has only the record clock (said in each computation)
      expect(c.dimensions.filter((d) => (PERSON_DIMENSIONS as readonly string[]).includes(d))).toEqual([]);
      expect(c.privacyClass).toBe('aggregate'); expect(c.kMin).toBeGreaterThanOrEqual(5); expect(c.floorN).toBeGreaterThanOrEqual(1);
      expect(Object.keys(c.threshold).every((k) => k === 'target' || k === 'band')).toBe(true);
      expect(PURPOSES).toContain(c.purposeKey);
      const s = c.serves as Record<string, unknown>;
      expect((Array.isArray(s['objective_ids']) && (s['objective_ids'] as unknown[]).length > 0) || (Array.isArray(s['decision_classes']) && (s['decision_classes'] as unknown[]).length > 0)
        || (typeof s['value_measure'] === 'string' && s['value_measure'] !== '')).toBe(true);
      expect(c.cadence.trim().length).toBeGreaterThanOrEqual(3); expect(c.cadence.length).toBeLessThanOrEqual(60);
      expect(c.action.trim().length).toBeGreaterThanOrEqual(8); expect(c.action).toMatch(/never an automatic or punitive decision/);
      expect(c.retirement.trim().length).toBeGreaterThanOrEqual(8);
      expect(c.sourceRefs).toContain(c.metricKey);
      // §MD's contract validator (the integrator's notes)
      expect(String(c.population['subject'] ?? '').trim().length).toBeGreaterThanOrEqual(3);
      expect(c.population['app_m_owner']).toBeTruthy();
      expect(c.exclusions.every((x) => typeof x.rule === 'string' && x.rule.length > 0 && typeof x.reason === 'string' && x.reason.length > 0)).toBe(true);
      expect(c.action).toMatch(/review|investigation/);
      if ('target' in c.threshold) { expect(['higher', 'lower']).toContain(c.direction); if (c.kind === 'rate') { expect(c.threshold.target).toBeGreaterThanOrEqual(0); expect(c.threshold.target).toBeLessThanOrEqual(1); } }
      if ('band' in c.threshold) { expect(['band', 'track']).toContain(c.direction); if (c.kind === 'rate') expect(c.threshold.band!.every((v) => v >= 0 && v <= 1)).toBe(true); }
      expect(ROLE_CODES).toContain(c.ownerRole);
      if (c.computationKey === null) expect(c.dimensions).toEqual([]);
      if (c.computationKey === null) {
        expect(c.unsupportedReason?.trim().length ?? 0).toBeGreaterThanOrEqual(8);
        expect(c.unsupportedReason).toMatch(UNSUPPORTED[c.metricKey]!);
        expect(c.unsupportedReason).toMatch(/no (honest )?source in the product/);
      } else {
        expect(c.unsupportedReason).toBeNull();
        expect(c.computationKey).toBe(`${c.metricKey.toLowerCase().replace('-', '')}_${c.computationKey.split('_').slice(1).join('_')}`);
      }
    });
  }
});

describe('the route parsers (the ports re-check every rule)', () => {
  it('a temporal declaration: three capitals, a non-empty subset of the four time fields (deduplicated, sorted), a reason, the version read; a retirement names no fields', () => {
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: ['valid_from', 'observation_time', 'valid_from'], reason: 'observations name their times', expectedVersion: 0 }))
      .toEqual({ ok: true, value: { objectType: 'OBS', required: ['observation_time', 'valid_from'], retire: false, reason: 'observations name their times', expectedVersion: 0 } });
    expect(parseTemporalDeclaration({ objectType: 'OBS', retire: true, reason: 'the model is replaced', expectedVersion: 2 })).toMatchObject({ ok: true, value: { retire: true, required: [] } });
    expect(parseTemporalDeclaration({ objectType: 'obs', requiredFields: ['valid_from'], reason: 'lowercase type', expectedVersion: 0 })).toMatchObject({ ok: false, cls: 'object_type' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: ['recorded_at'], reason: 'recorded_at is constructed', expectedVersion: 0 })).toMatchObject({ ok: false, cls: 'fields' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: [], reason: 'nothing required', expectedVersion: 0 })).toMatchObject({ ok: false, cls: 'fields' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: ['valid_from', 3], reason: 'a number among the fields', expectedVersion: 0 })).toMatchObject({ ok: false, cls: 'fields' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', retire: true, requiredFields: ['valid_from'], reason: 'retire with fields', expectedVersion: 1 })).toMatchObject({ ok: false, cls: 'fields' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: ['valid_from'], reason: 'short', expectedVersion: 0 })).toMatchObject({ ok: false, cls: 'reason' });
    expect(parseTemporalDeclaration({ objectType: 'OBS', requiredFields: ['valid_from'], reason: 'no version read here' })).toMatchObject({ ok: false, cls: 'request' });
    expect(TIME_FIELDS).toEqual(['event_time', 'observation_time', 'valid_from', 'valid_to']);
  });
  it('a search review: the search id, relevant | not_relevant, a query class of the QUERY (never a person), a reason', () => {
    const id = '01a084f5-757f-7f03-9cf5-315d74426481';
    expect(parseSearchReview({ searchId: id, verdict: 'relevant', queryClass: 'warning', reason: 'the hits answered it' })).toEqual({ ok: true, value: { searchId: id, verdict: 'relevant', queryClass: 'warning', reason: 'the hits answered it' } });
    expect(parseSearchReview({ searchId: 'x', verdict: 'relevant', queryClass: 'warning', reason: 'the hits answered it' })).toMatchObject({ ok: false, cls: 'request' });
    expect(parseSearchReview({ searchId: id, verdict: 'maybe', queryClass: 'warning', reason: 'the hits answered it' })).toMatchObject({ ok: false, cls: 'verdict' });
    expect(parseSearchReview({ searchId: id, verdict: 'relevant', queryClass: 'person', reason: 'the hits answered it' })).toMatchObject({ ok: false, cls: 'query_class' });
    expect(parseSearchReview({ searchId: id, verdict: 'relevant', queryClass: 'warning', reason: 'short' })).toMatchObject({ ok: false, cls: 'reason' });
    expect(QUERY_CLASSES.filter((q) => (PERSON_DIMENSIONS as readonly string[]).includes(q))).toEqual([]);
  });
});

describe('every refusal text of 0113_b92_x_mcb.sql through the central mapper', () => {
  const sqlText = (() => { const all = readFileSync(fileURLToPath(new URL('../../migrations/0113_b92_product_analytics_metric_catalog_ux_telemetry.sql', import.meta.url)), 'utf8'); const a = all.indexOf('-- §MCB — computations B'); const b = all.indexOf('-- §CO — the standing evaluation', a + 1); if (a < 0 || b < 0) throw new Error('the folded 0113 lost its section banners'); return all.slice(a, b); })();
  const raises = [...sqlText.matchAll(/RAISE EXCEPTION '((?:metric definition|metric computation) rejected \(([a-z_]+)\):[^']*(?:''[^']*)*)'[^;]*?USING ERRCODE = '([0-9A-Z]{5})'/g)]
    .map((m) => ({ text: m[1]!.replace(/''/g, '\''), cls: m[2]!, code: m[3]! }));
  it('the part raises its refusals in the class form (the nouns of seams.ts)', () => {
    expect(raises.length).toBe(19);
    expect(new Set(raises.map((r) => r.cls))).toEqual(new Set(['actor', 'authority', 'reason', 'object_type', 'unknown_object_type', 'stale', 'state', 'fields', 'duplicate', 'verdict', 'query_class',
      'unknown_search', 'separation_of_duties']));
  });
  it('each maps 403 (actor, authority, separation_of_duties) → 404 (unknown_*) → 409 (state, stale, duplicate) → 422 (the rest)', () => {
    for (const r of raises) {
      const message = r.text.replace(/%/g, 'X');
      const ex = asObservationRefusal({ message, code: r.code }, 'unit');
      expect(ex, message).not.toBeNull();
      const want = ['actor', 'authority', 'separation_of_duties'].includes(r.cls) ? 403 : r.cls.startsWith('unknown_') ? 404 : ['state', 'stale', 'duplicate'].includes(r.cls) ? 409 : 422;
      expect(ex!.getStatus(), message).toBe(want);
    }
  });
});
