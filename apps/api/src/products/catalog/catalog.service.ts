/**
 * CP-6 B90 §K (0095 §K) — THE METADATA CATALOG AND DATA DISCOVERY (F-P7-F-11; V7 ch49; DAT-TR-01): the validation of what a route hands
 * in (the shape; the port judges the content against the registries) and the attention tick's step `catalog-reconcile` (order 66), which
 * runs products.reconcile_catalog under executive.attention.tick in every domain the tick visits. Every figure a harness or the
 * demonstration registers is SYNTHETIC.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { CatalogCapability } from './catalog.capabilities.js';

type Row = Record<string, unknown>;

export const CATALOG_RECONCILE_STEP = 'catalog-reconcile';
export const CATALOG_RECONCILE_ORDER = 66;
export const CATALOG_KINDS = ['schema', 'field', 'source', 'product', 'staging', 'external'] as const;
export const CATALOG_REGISTRY_KINDS = ['schema', 'field', 'source', 'product'] as const;
export const CATALOG_FLAG_KINDS = ['unowned', 'stale', 'duplicate', 'inconsistent', 'orphan', 'lineage_missing', 'ownership_lapsed'] as const;
export const LINEAGE_KINDS = ['derives_from', 'feeds', 'serves', 'describes'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
const obj = (p: Row, k: string, noun: string, correlationId: string): Row | null => {
  const v = p[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) refuse(correlationId, `${noun} rejected (shape): ${k} is an object`);
  return v as Row;
};

/** A uuid the route received (the noun names the family the refusal belongs to). */
export function assertCatalogUuid(v: unknown, noun: string, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}

export function validateAssetRegistration(p: Row, correlationId: string): { kind: string; ref: string; title: string; description: string | null; owner: string | null; classification: string | null;
                                                                           contracts: Row | null; locations: unknown[] | null; glossaryTerms: string[]; quality: Row | null; slo: Row | null } {
  const kind = str(p, 'kind'); const ref = str(p, 'ref'); const title = str(p, 'title');
  if (kind === null || !(CATALOG_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `catalog asset rejected (kind): ${kind ?? 'null'} is not a catalog asset kind (schema | field | source | product | staging | external)`);
  if (ref === null || ref.trim().length < 1 || ref.trim().length > 200) refuse(correlationId, 'catalog asset rejected (ref): an asset is identified by its kind and a reference (1–200 characters)');
  if (title === null || title.trim().length < 2 || title.trim().length > 200) refuse(correlationId, 'catalog asset rejected (title): a title is 2–200 characters');
  const description = str(p, 'description');
  const owner = p['ownerPrincipalId'] === undefined || p['ownerPrincipalId'] === null ? null : assertCatalogUuid(p['ownerPrincipalId'], 'catalog asset', 'owner', correlationId);
  const classification = str(p, 'classification');
  if (classification !== null && !(CLASSIFICATIONS as readonly string[]).includes(classification)) refuse(correlationId, `catalog asset rejected (classification): ${classification} is not public, internal, confidential or restricted`);
  const contracts = obj(p, 'contracts', 'catalog asset', correlationId);
  const quality = obj(p, 'quality', 'catalog asset', correlationId);
  const slo = obj(p, 'slo', 'catalog asset', correlationId);
  const locations = p['locations'] === undefined || p['locations'] === null ? null : p['locations'];
  if (locations !== null && !Array.isArray(locations)) refuse(correlationId, 'catalog asset rejected (shape): locations is an array of references');
  const terms = p['glossaryTerms'] === undefined || p['glossaryTerms'] === null ? [] : p['glossaryTerms'];
  if (!Array.isArray(terms) || terms.some((t) => typeof t !== 'string' || t.trim().length < 2 || t.trim().length > 120)) refuse(correlationId, 'catalog asset rejected (term): a glossary term is 2–120 characters');
  return { kind: kind as string, ref: (ref as string).trim(), title: (title as string).trim(), description: description === null || description.trim() === '' ? null : description.trim(), owner, classification,
           contracts, locations: locations as unknown[] | null, glossaryTerms: (terms as string[]).map((t) => t.trim()), quality, slo };
}

export function validateOwner(p: Row, correlationId: string): string {
  return assertCatalogUuid(p['ownerPrincipalId'], 'catalog asset', 'owner', correlationId);
}

export function validateLineage(p: Row, correlationId: string): { from: string; to: string; kind: string; evidence: Row } {
  const from = assertCatalogUuid(p['fromAssetId'], 'lineage', 'from_asset', correlationId);
  const to = assertCatalogUuid(p['toAssetId'], 'lineage', 'to_asset', correlationId);
  const kind = str(p, 'kind');
  if (kind === null || !(LINEAGE_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `lineage rejected (kind): ${kind ?? 'null'} is not a lineage kind (derives_from | feeds | serves | describes)`);
  const evidence = obj(p, 'evidence', 'lineage', correlationId) ?? {};
  return { from, to, kind: kind as string, evidence };
}

export function validateTerm(p: Row, correlationId: string): { term: string; definition: string; owner: string } {
  const term = str(p, 'term'); const definition = str(p, 'definition');
  if (term === null || term.trim().length < 2 || term.trim().length > 120) refuse(correlationId, 'glossary term rejected (term): a term is 2–120 characters');
  if (definition === null || definition.trim().length < 8) refuse(correlationId, 'glossary term rejected (definition): a definition is 8 characters or more');
  const owner = assertCatalogUuid(p['ownerPrincipalId'], 'glossary term', 'owner', correlationId);
  return { term: (term as string).trim(), definition: (definition as string).trim(), owner };
}

export function validateFlag(p: Row, correlationId: string): { kind: string; reason: string; clear: boolean } {
  const kind = str(p, 'kind'); const reason = str(p, 'reason');
  if (kind === null || !(CATALOG_FLAG_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `catalog asset rejected (flag): ${kind ?? 'null'} is not a flag kind (unowned | stale | duplicate | inconsistent | orphan | lineage_missing | ownership_lapsed)`);
  if (reason === null || reason.trim().length < 8) refuse(correlationId, 'catalog asset rejected (reason): a flag is set or cleared with a reason (8 characters or more)');
  const clear = p['clear'] === undefined ? false : p['clear'];
  if (typeof clear !== 'boolean') refuse(correlationId, 'catalog asset rejected (shape): clear is a boolean');
  return { kind: kind as string, reason: (reason as string).trim(), clear: clear as boolean };
}

export function validateSearch(p: Row, correlationId: string): { q: string; kinds: string[] | null; limit: number } {
  const q = p['q'] === undefined || p['q'] === null ? '' : p['q'];
  if (typeof q !== 'string' || q.length > 200) refuse(correlationId, 'catalog rejected (query): a search query is text of at most 200 characters');
  const kinds = p['kinds'] === undefined || p['kinds'] === null ? null : p['kinds'];
  if (kinds !== null && (!Array.isArray(kinds) || kinds.some((k) => typeof k !== 'string' || !(CATALOG_KINDS as readonly string[]).includes(k)))) refuse(correlationId, 'catalog rejected (kinds): each kind is schema, field, source, product, staging or external');
  return { q: (q as string).trim(), kinds: kinds as string[] | null, limit: limitOf(p, 50) };
}

export const limitOf = (p: Row, dflt = 200): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(500, Math.trunc(p['limit'] as number))) : dflt);

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly log = new Logger('products.catalog');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The tick step (the planning service's idiom: the registry found when the executive module is loaded; the step reconciles every domain the tick visits). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the catalog reconciliation is not scheduled'); return; }
    registry.register({ name: CATALOG_RECONCILE_STEP, order: CATALOG_RECONCILE_ORDER, run: async (c: AttentionTickContext) => this.reconcile(c) });
  }
  private async reconcile(c: AttentionTickContext): Promise<Row> {
    const r = await CatalogCapability.tick(c.tx, 'executive.attention.tick').reconcile({ runId: newId(), tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
    return { run_id: r['run_id'], counts: r['counts'] };
  }
}
