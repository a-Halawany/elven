/**
 * CP-6 B90 §K (0095 §K, part `catalog`) — the pure parts: the route validators (the shape a route accepts before the port judges the
 * content), the refusal rows of the section's families (`catalog asset rejected`, `catalog rejected`, `glossary term rejected`, `lineage
 * rejected` — every class the migration raises, run through the mapper) and the PDP rules the section adds.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { CATALOG_RECONCILE_ORDER, CATALOG_RECONCILE_STEP, validateAssetRegistration, validateFlag, validateLineage, validateSearch, validateTerm } from '../../src/products/catalog/catalog.service.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const CID = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const U1 = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const U2 = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
const mapped = (message: string, code = '22023'): { status: number; text: string } => {
  const e = asObservationRefusal(pg(message, code), 'unit');
  if (!(e instanceof HttpException)) throw new Error(`${message} did not map`);
  return { status: e.getStatus(), text: String((e.getResponse() as { message?: string }).message ?? '') };
};
const refusedWith = (f: () => unknown): { status: number; text: string } => {
  try { f(); } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), text: String((e.getResponse() as { message?: string }).message ?? '') };
    throw e;
  }
  throw new Error('the validator should have refused');
};

describe('B90 catalog · the validators', () => {
  it('a registration: the six kinds, a ref, a title, an optional owner uuid, the four classifications, the shapes, the terms', () => {
    const ok = validateAssetRegistration({ kind: 'staging', ref: ' ais_staging_w40 ', title: ' AIS staging ', description: '  ', classification: 'internal', glossaryTerms: [' Transit '], locations: ['relation:x'] }, CID);
    expect(ok).toMatchObject({ kind: 'staging', ref: 'ais_staging_w40', title: 'AIS staging', description: null, owner: null, classification: 'internal', glossaryTerms: ['Transit'], locations: ['relation:x'], contracts: null });
    expect(validateAssetRegistration({ kind: 'external', ref: 'p', title: 'pp', ownerPrincipalId: U1 }, CID).owner).toBe(U1);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'table', ref: 'x', title: 'xx' }, CID))).toMatchObject({ status: 422, text: expect.stringMatching(/^catalog asset rejected \(kind\)/) });
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: '', title: 'xx' }, CID)).text).toMatch(/^catalog asset rejected \(ref\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'x' }, CID)).text).toMatch(/^catalog asset rejected \(title\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'xx', ownerPrincipalId: 'nobody' }, CID)).text).toMatch(/^catalog asset rejected \(owner\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'xx', classification: 'secret' }, CID)).text).toMatch(/^catalog asset rejected \(classification\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'xx', contracts: [] }, CID)).text).toMatch(/^catalog asset rejected \(shape\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'xx', locations: {} }, CID)).text).toMatch(/^catalog asset rejected \(shape\)/);
    expect(refusedWith(() => validateAssetRegistration({ kind: 'staging', ref: 'x', title: 'xx', glossaryTerms: ['a'] }, CID)).text).toMatch(/^catalog asset rejected \(term\)/);
  });
  it('lineage: two uuids, one of the four kinds, an object of evidence; a term: 2–120 characters, a definition of 8+, an owner uuid; a flag: one of the seven with a reason; a search: text of at most 200 characters and known kinds', () => {
    expect(validateLineage({ fromAssetId: U1, toAssetId: U2, kind: 'feeds' }, CID)).toEqual({ from: U1, to: U2, kind: 'feeds', evidence: {} });
    expect(refusedWith(() => validateLineage({ fromAssetId: 'x', toAssetId: U2, kind: 'feeds' }, CID)).text).toMatch(/^lineage rejected \(from_asset\)/);
    expect(refusedWith(() => validateLineage({ fromAssetId: U1, toAssetId: U2, kind: 'uses' }, CID)).text).toMatch(/^lineage rejected \(kind\)/);
    expect(refusedWith(() => validateLineage({ fromAssetId: U1, toAssetId: U2, kind: 'feeds', evidence: [] }, CID)).text).toMatch(/^lineage rejected \(shape\)/);
    expect(validateTerm({ term: ' Transit ', definition: 'a passage through the corridor', ownerPrincipalId: U1 }, CID)).toEqual({ term: 'Transit', definition: 'a passage through the corridor', owner: U1 });
    expect(refusedWith(() => validateTerm({ term: 'T', definition: 'a passage through the corridor', ownerPrincipalId: U1 }, CID)).text).toMatch(/^glossary term rejected \(term\)/);
    expect(refusedWith(() => validateTerm({ term: 'Transit', definition: 'short', ownerPrincipalId: U1 }, CID)).text).toMatch(/^glossary term rejected \(definition\)/);
    expect(refusedWith(() => validateTerm({ term: 'Transit', definition: 'a passage through the corridor' }, CID)).text).toMatch(/^glossary term rejected \(owner\)/);
    expect(validateFlag({ kind: 'inconsistent', reason: 'the registries disagree', clear: true }, CID)).toEqual({ kind: 'inconsistent', reason: 'the registries disagree', clear: true });
    expect(validateFlag({ kind: 'orphan', reason: 'no owner and no lineage' }, CID).clear).toBe(false);
    expect(refusedWith(() => validateFlag({ kind: 'bogus', reason: 'the registries disagree' }, CID)).text).toMatch(/^catalog asset rejected \(flag\)/);
    expect(refusedWith(() => validateFlag({ kind: 'orphan', reason: 'short' }, CID)).text).toMatch(/^catalog asset rejected \(reason\)/);
    expect(refusedWith(() => validateFlag({ kind: 'orphan', reason: 'no owner and no lineage', clear: 'yes' }, CID)).text).toMatch(/^catalog asset rejected \(shape\)/);
    expect(validateSearch({ q: ' Red Sea ', kinds: ['source'], limit: 10 }, CID)).toEqual({ q: 'Red Sea', kinds: ['source'], limit: 10 });
    expect(validateSearch({}, CID)).toEqual({ q: '', kinds: null, limit: 50 });
    expect(refusedWith(() => validateSearch({ q: 'x'.repeat(201) }, CID)).text).toMatch(/^catalog rejected \(query\)/);
    expect(refusedWith(() => validateSearch({ q: 'x', kinds: ['table'] }, CID)).text).toMatch(/^catalog rejected \(kinds\)/);
  });
  it('the tick step is catalog-reconcile at order 66 (after the scorecards 64 and the metric certification 65)', () => {
    expect(CATALOG_RECONCILE_STEP).toBe('catalog-reconcile');
    expect(CATALOG_RECONCILE_ORDER).toBe(66);
  });
});

describe('B90 catalog · the refusal rows (every class the migration raises, in B9\'s order)', () => {
  it('403: the acting principal, the authority, the owner\'s own recertification', () => {
    for (const t of ['catalog asset rejected (actor): catalogued by the acting principal', 'catalog asset rejected (authority): an asset is catalogued by a data steward, or by its owner as their own',
      'catalog asset rejected (not_owner): ownership of source x is recertified by its owner', 'catalog rejected (authority): a reconciliation is run by a data steward, or by the attention tick',
      'glossary term rejected (authority): a term is defined by a data steward', 'lineage rejected (authority): lineage is declared by a data steward or by the owner of either asset', 'lineage rejected (actor): declared by the acting principal']) {
      expect(mapped(t, '42501'), t).toMatchObject({ status: 403 });
    }
  });
  it('404: the absences', () => {
    for (const t of ['catalog asset rejected (unknown_asset): x is not a catalog asset of this domain', 'catalog asset rejected (unknown_owner): the owner is a named, active human of the tenant',
      'catalog asset rejected (unknown_ref): source no-such-source names no row of its registry', 'glossary term rejected (unknown_owner): a term\'s owner is a named, active human of the tenant',
      'lineage rejected (unknown_asset): x is not a catalog asset of this domain']) {
      expect(mapped(t), t).toMatchObject({ status: 404 });
    }
  });
  it('409: the record\'s state and the duplicates', () => {
    for (const t of ['catalog asset rejected (duplicate): staging ais_staging_w40 is already catalogued in this domain', 'catalog asset rejected (state): staging x is already owned by y',
      'catalog asset rejected (state): staging x has no owner to recertify; a data steward sets one first', 'catalog asset rejected (state): external x already carries the flag duplicate',
      'glossary term rejected (state): Transit is already defined so, by that owner', 'lineage rejected (duplicate): a live feeds edge from source a to product b is already declared']) {
      expect(mapped(t, '23505'), t).toMatchObject({ status: 409 });
    }
  });
  it('422: the caller\'s own request', () => {
    for (const t of ['catalog asset rejected (kind): table is not a catalog asset kind (schema | field | source | product | staging | external)', 'catalog asset rejected (ref): an asset is identified by its kind and a reference (1–200 characters)',
      'catalog asset rejected (title): a title is 2–200 characters', 'catalog asset rejected (classification): secret is not public, internal, confidential or restricted', 'catalog asset rejected (shape): contracts, quality and slo are objects',
      'catalog asset rejected (term): a glossary term is 2–120 characters', 'catalog asset rejected (flag): bogus is not a flag kind (unowned | stale | duplicate | inconsistent | orphan | lineage_missing | ownership_lapsed)',
      'catalog asset rejected (reason): a flag is set or cleared with a reason (8 characters or more)', 'catalog rejected (query): a search query is text of at most 200 characters', 'catalog rejected (kinds): each kind is schema, field, source, product, staging or external',
      'glossary term rejected (term): a term is 2–120 characters', 'glossary term rejected (definition): a definition is 8 characters or more', 'lineage rejected (self): an asset has no lineage to itself',
      'lineage rejected (kind): uses is not a lineage kind (derives_from | feeds | serves | describes)', 'lineage rejected (evidence): the evidence is an object', 'lineage rejected (assets): an edge names two catalog assets']) {
      expect(mapped(t), t).toMatchObject({ status: 422 });
    }
  });
  it('the prelude\'s family is untouched and no catalog noun is read by it', () => {
    expect(mapped('data product rejected (not_owner): product x is released by its owner', '42501').status).toBe(403);
    expect(mapped('catalog asset rejected (not_owner): x', '42501').text).toMatch(/^catalog asset rejected/);
  });
});

describe('B90 catalog · the PDP rules', () => {
  const pdp = new PdpService();
  const T = '11111111-1111-4111-8111-111111111111'; const D = '22222222-2222-4222-8222-222222222222';
  const decide = (action: string, role: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({ action, principal: { principalId: U1, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }] },
    delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive', consequenceClass: 'C2', objectType: 'CAT', objectId: null,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput).decision;
  it('the steward catalogues, sets owners, defines terms, flags and reconciles; an analyst does none of those but registers, declares lineage and recertifies (the port holds the owner rule)', () => {
    for (const a of ['products.catalog.asset.register', 'products.catalog.owner.set', 'products.catalog.recertify', 'products.catalog.lineage.declare', 'products.catalog.term.define', 'products.catalog.flag', 'products.catalog.reconcile', 'products.catalog.search', 'products.catalog.read']) {
      expect(decide(a, 'data_steward'), a).toMatch(/^allow/);
      expect(decide(a, 'domain_admin'), a).toMatch(/^allow/);
      expect(decide(a, 'collection_manager'), a).toBe('deny');
    }
    for (const a of ['products.catalog.owner.set', 'products.catalog.term.define', 'products.catalog.flag', 'products.catalog.reconcile']) {
      expect(decide(a, 'domain_analyst'), a).toBe('deny');
      expect(decide(a, 'executive'), a).toBe('deny');
    }
    for (const a of ['products.catalog.asset.register', 'products.catalog.lineage.declare', 'products.catalog.recertify', 'products.catalog.search', 'products.catalog.read']) {
      expect(decide(a, 'domain_analyst'), a).toMatch(/^allow/);
    }
  });
  it('the readers: the tenant administrator and the auditor search and read (the port hides what is above their clearance — none); the planning agent reads', () => {
    expect(decide('products.catalog.search', 'tenant_admin', 'TENANT')).toMatch(/^allow/);
    expect(decide('products.catalog.read', 'auditor', 'TENANT')).toMatch(/^allow/);
    expect(decide('products.catalog.read', 'planning_agent')).toMatch(/^allow/);
    expect(decide('products.catalog.reconcile', 'tenant_admin', 'TENANT')).toBe('deny');
  });
});
