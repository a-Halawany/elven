/**
 * B33 §CI — the pure logic of competitor intelligence: the manifest's content, the Domain Intelligence Agent's DETERMINISTIC reading of
 * extracted claims (one event per movement citing every evidence item that reports it; no repeat of a held fact; the interpretation's
 * confidence the lowest cited — never from narrative), the backlog grouping, the identity's digest and a DATE as the day it names.
 * Every claim below is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { COMPETITOR_FUNCTIONS, DEFAULT_PREDICATE_MAP, competitorManifest, dayOf, draftFromClaims, groupBacklog, slug, type BacklogClaim } from '../../src/domains/competitor/competitor-logic.js';
import { DOMAIN_INTELLIGENCE_AGENT_DIGEST, DOMAIN_INTELLIGENCE_AGENT_VERSION } from '../../src/domains/domain-intelligence-agent.js';

const D64 = (c: string) => c.repeat(64);
const claim = (id: string, evidence: string, predicate: string, confidence: number, qualifiers: Record<string, unknown> = {}, at = '2026-10-09T10:00:00.000000Z', object = 'Tangier, Morocco'): BacklogClaim => ({
  claim_id: id, claim_version: 1, claim_type: 'EVT', claim_digest: D64(id.slice(0, 1)), recorded_at: at, evidence_id: evidence, evidence_version: 1, evidence_digest: D64('e'),
  payload: { subject: 'Atlas Getriebemotoren AG (SYNTHETIC)', predicate, object_value: object, confidence, qualifiers },
  places: [{ entity_id: 'place-tng', name: 'Tangier, Morocco (SYNTHETIC)' }],
});
const ATLAS = { name: 'Atlas Getriebemotoren AG (SYNTHETIC)' };
const Q = { effective_date: '2026-10-01', capacity_per_month: 12000, product: 'gear motors', market: 'Morocco' };

describe('the competitor package manifest (§CI owns its content)', () => {
  it('declares the six gated functions, the predicate map, the material kinds, the diversity threshold, the coverage freshness and the twin families; it maps onto the core types, never forks them', () => {
    const m = competitorManifest('1.2.0', ['src-a']);
    expect(COMPETITOR_FUNCTIONS).toEqual(['profile', 'collect', 'assess', 'compare', 'alert', 'twin']);
    const c = m['competitor'] as Record<string, unknown>;
    expect(c['functions']).toEqual([...COMPETITOR_FUNCTIONS]);
    expect(c['diversity']).toEqual({ min_publishers: 2 });
    expect(c['coverage']).toEqual({ default_freshness_days: 30 });
    expect(c['twin']).toMatchObject({ key: 'capacity.per_month', families: { competitor: 'competitor', market: 'market' }, link: { from: 'market', to: 'competitor' } });
    expect((m['ontology_extension'] as Record<string, unknown>)['mappings']).toEqual(expect.arrayContaining([{ type: 'competitor', maps_to: 'organization' }, { type: 'plant_site', maps_to: 'place' }]));
    expect(m['release']).toMatchObject({ semver: '1.2.0' });
    expect(m['source_set']).toEqual([{ source_key: 'src-a', purposes: ['intelligence'], required: false }]);
    expect(String(c['boundary'])).toMatch(/B77.*B78.*B112.*B111.*R2/);
    // B33 act-found: §PK's form — risk_meaning a list on the taxonomy in force; the purposes per source given
    expect(m['risk_meaning']).toEqual([expect.objectContaining({ category_key: 'market' })]);
    expect(competitorManifest('1.0.0', ['s'], { purposes: ['observation'] })['source_set']).toEqual([{ source_key: 's', purposes: ['observation'], required: false }]);
  });
  it('the agent identity: version 1.0.0 and a digest over the method text (a changed text is a new digest)', () => {
    expect(DOMAIN_INTELLIGENCE_AGENT_VERSION).toBe('1.0.0');
    expect(DOMAIN_INTELLIGENCE_AGENT_DIGEST).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the Domain Intelligence Agent\'s reading (deterministic)', () => {
  it('positive: a release and a trade report of the same plant → ONE event and ONE fact citing BOTH evidence items; the interpretation\'s confidence the lowest cited', () => {
    const d = draftFromClaims(ATLAS, [], [claim('a1', 'ev-release', 'opens_plant', 0.9, Q), claim('b2', 'ev-trade', 'opens_plant', 0.86, Q, '2026-10-09T10:05:00.000000Z')], DEFAULT_PREDICATE_MAP, '2026-10-09');
    expect(d).not.toBeNull();
    const content = d!.content as Record<string, unknown>;
    expect(content['effective_from']).toBe('2026-10-01');
    const events = content['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'plant_opened', effective_date: '2026-10-01', place_entity_id: 'place-tng', market: 'Morocco', details: expect.objectContaining({ capacity_per_month: 12000 }) });
    expect((events[0]!['citations'] as unknown[]).length).toBe(4);   // two claims + two evidence items
    const changes = content['changes'] as Array<Record<string, unknown>>;
    expect(changes.map((c) => [c['op'], (c['fact'] as Record<string, unknown>)['key']])).toEqual([['add', 'facility:tangier-morocco-synthetic']]);
    expect((changes[0]!['fact'] as Record<string, unknown>)['confidence']).toBe(0.86);
    expect(content['interpretation']).toMatchObject({ confidence: 0.86, confidence_basis: expect.stringMatching(/never derived from narrative/) });
    expect(String((content['interpretation'] as Record<string, unknown>)['statement'])).toMatch(/^Atlas Getriebemotoren AG \(SYNTHETIC\) opened a plant in Tangier, Morocco \(SYNTHETIC\) effective 2026-10-01 \(capacity 12000 units\/month\)/);
    expect(d!.evidence.sort()).toEqual(['ev-release', 'ev-trade']);
    expect(d!.recordedThrough).toBe('2026-10-09T10:05:00.000000Z');
  });
  it('refusal: an unmapped predicate is listed, not guessed; a fact the profile already holds with that value is not proposed again → nothing to propose', () => {
    expect(draftFromClaims(ATLAS, [], [claim('c3', 'ev', 'rumoured_to', 0.9)], DEFAULT_PREDICATE_MAP, '2026-10-09')).toBeNull();
    const held = [{ key: 'capability:capacity', value: { amount: 40000, unit: 'units/month', period: 'month', population: 'all products' } }];
    expect(draftFromClaims(ATLAS, held, [claim('d4', 'ev', 'reports_capacity', 0.9, { capacity_per_month: 40000 }, undefined, '40000')], DEFAULT_PREDICATE_MAP, '2026-10-09')).toBeNull();
    const mixed = draftFromClaims(ATLAS, [], [claim('e5', 'ev', 'rumoured_to', 0.9), claim('f6', 'ev', 'opens_plant', 0.7, Q)], DEFAULT_PREDICATE_MAP, '2026-10-09');
    expect(mixed!.unmapped).toEqual([{ claim_id: 'e5', predicate: 'rumoured_to' }]);
  });
  it('recovery: a changed value of a held fact is a REPLACE; a claim without an effective day takes the database\'s day', () => {
    const held = [{ key: 'capability:capacity', value: { amount: 40000, unit: 'units/month', period: 'month', population: 'all products' } }];
    const d = draftFromClaims(ATLAS, held, [claim('g7', 'ev', 'reports_capacity', 0.9, { capacity_per_month: 52000 }, undefined, '52000')], DEFAULT_PREDICATE_MAP, '2026-10-09');
    expect((d!.content['changes'] as Array<Record<string, unknown>>)[0]).toMatchObject({ op: 'replace', fact: { key: 'capability:capacity', value: { amount: 52000 } } });
    expect(d!.content['effective_from']).toBe('2026-10-09');
  });
});

describe('the backlog grouping, slugs and days', () => {
  it('groups by competitor, oldest first, recording what was read through', () => {
    const row = (competitor: string, id: string, at: string) => ({ competitor_id: competitor, name: competitor, package_key: 'competitor', claim_id: id, claim_version: 1, claim_type: 'EVT',
      claim_digest: D64('a'), payload: {}, recorded_at: at, evidence_id: 'ev', evidence_version: 1, evidence_digest: D64('b'), places: [] });
    const g = groupBacklog([row('k', 'x1', '2026-10-09T10:00:00.000002Z'), row('a', 'x2', '2026-10-09T09:00:00.000000Z'), row('k', 'x3', '2026-10-09T10:00:00.000001Z')]);
    expect(g.map((x) => [x.competitorId, x.claims.length, x.recordedThrough])).toEqual([['a', 1, '2026-10-09T09:00:00.000000Z'], ['k', 2, '2026-10-09T10:00:00.000002Z']]);
  });
  it('slug and dayOf', () => {
    expect(slug('Tangier, Morocco (SYNTHETIC)')).toBe('tangier-morocco-synthetic');
    expect(slug('Düsseldorf')).toBe('dusseldorf');
    expect(slug('   ')).toBe('unnamed');
    expect(dayOf(new Date(2026, 9, 1))).toBe('2026-10-01');   // the driver's local midnight is the day it names
    expect(dayOf('2026-10-01T00:00:00Z')).toBe('2026-10-01');
    expect(dayOf(null)).toBeNull();
  });
});
