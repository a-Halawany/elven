/**
 * CP-6 B29 §A (0092) — FAMILIES, COMPOSITION CONTRACTS, LINKS, COUPLING AND THE DEPENDENCY-COMPLETENESS MEASURE (F-P5-01; L5-C06;
 * V03-T-473).
 *
 * A twin's CONTRACT is its interface: the element keys it exposes (unit, cadence) and its APPROVED USES (method families, decision
 * classes), published by its owner. A DOWNSTREAM twin LINKS to an upstream's contract — named keys, one approved decision class — and
 * the port refuses an uncontracted key, an unapproved use, a cycle and anyone but the downstream owner. When an upstream version is
 * admitted on `actual`, each live link gets a COUPLING PROPOSAL (0092 §A.5, in the admission's transaction); the downstream owner
 * APPLIES it — the existing version and ground ports open or extend the downstream draft with the coupled elements, each citing the
 * upstream version (citation kind `twin`) — or DECLINES it. The upstream owner never writes the downstream twin. Admission stays the
 * downstream owner's own act, and the family validator checks it like any other.
 *
 * The intake checks here refuse what is malformed before the pipeline (422); the ports judge everything else.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { METHOD_FAMILIES } from '../methods/types.js';
import { familyMeasures, type FamilyElement } from '../families/families.js';
import type { CompositionReads, ContractWrites, CouplingWrites, KindWrites, LinkWrites } from './composition.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/;
const CLASS = /^[a-z][a-z0-9-]{1,40}$/;
const CADENCES = ['on-admission', 'daily', 'weekly', 'monthly', 'quarterly'] as const;

export interface KindIntake { kind: string; description: string; elementSchema: Record<string, { unit: string | null; description: string; required: boolean }> }
export interface ContractIntake { exposed: Record<string, { unit: string | null; cadence: string }>; approvedUses: { method_families: string[]; decision_classes: string[] } }
export interface LinkIntake { upstreamTwinId: string; downstreamTwinId: string; mapping: Array<{ from: string; to: string }>; use: string }

const bad = (correlationId: string) => (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

export function validateKindIntake(m: Record<string, unknown>, correlationId: string): KindIntake {
  const no = bad(correlationId);
  if (typeof m['kind'] !== 'string' || !/^x-[a-z0-9-]{2,39}$/.test(m['kind'])) no('kind must be named x-<name> (lower-case letters, digits and dashes) — a domain\'s own kind never shadows a product kind');
  if (typeof m['description'] !== 'string' || m['description'].trim().length < 8 || m['description'].length > 2000) no('description must say what the kind represents (8–2000 characters)');
  const s = m['elementSchema'];
  if (typeof s !== 'object' || s === null || Array.isArray(s) || Object.keys(s).length === 0 || Object.keys(s).length > 64) no('elementSchema must declare 1–64 element prefixes');
  const schema: KindIntake['elementSchema'] = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    const e = v as Record<string, unknown>;
    if (!/^[a-z][a-z0-9_.-]*$/.test(k) || typeof e !== 'object' || e === null || !(e['unit'] === null || typeof e['unit'] === 'string')
        || typeof e['description'] !== 'string' || typeof e['required'] !== 'boolean') {
      no(`elementSchema.${k} must be a lower-case prefix with { unit: text or null, description: text, required: boolean }`);
    }
    schema[k] = { unit: e['unit'] as string | null, description: e['description'] as string, required: e['required'] as boolean };
  }
  if (!Object.values(schema).some((e) => e.required)) no('elementSchema must mark at least one element required (the required prefixes are the kind\'s material keys)');
  return { kind: m['kind'] as string, description: (m['description'] as string).trim(), elementSchema: schema };
}

export function validateContractIntake(m: Record<string, unknown>, correlationId: string): ContractIntake {
  const no = bad(correlationId);
  const x = m['exposed'];
  if (typeof x !== 'object' || x === null || Array.isArray(x) || Object.keys(x).length === 0 || Object.keys(x).length > 128) no('exposed must name 1–128 element keys as { key: { unit, cadence } }');
  const exposed: ContractIntake['exposed'] = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const e = v as Record<string, unknown>;
    if (!KEY.test(k) || typeof e !== 'object' || e === null || !(e['unit'] === null || typeof e['unit'] === 'string') || !(CADENCES as readonly string[]).includes(e['cadence'] as string)) {
      no(`exposed.${k} must be an element key with { unit: text or null, cadence: ${CADENCES.join(' | ')} }`);
    }
    exposed[k] = { unit: e['unit'] as string | null, cadence: e['cadence'] as string };
  }
  const u = (m['approvedUses'] ?? {}) as Record<string, unknown>;
  const families = u['methodFamilies'] ?? u['method_families'] ?? [];
  const classes = u['decisionClasses'] ?? u['decision_classes'] ?? [];
  if (!Array.isArray(families) || !families.every((f) => (METHOD_FAMILIES as readonly string[]).includes(f as string))) no(`approvedUses.methodFamilies must list method families (${METHOD_FAMILIES.join(', ')})`);
  if (!Array.isArray(classes) || !classes.every((c) => typeof c === 'string' && CLASS.test(c))) no('approvedUses.decisionClasses must list short lower-case decision classes');
  return { exposed, approvedUses: { method_families: [...new Set(families as string[])], decision_classes: [...new Set(classes as string[])] } };
}

export function validateLinkIntake(m: Record<string, unknown>, correlationId: string): LinkIntake {
  const no = bad(correlationId);
  if (typeof m['upstreamTwinId'] !== 'string' || !UUID.test(m['upstreamTwinId'])) no('upstreamTwinId must be a twin id');
  if (typeof m['downstreamTwinId'] !== 'string' || !UUID.test(m['downstreamTwinId'])) no('downstreamTwinId must be a twin id');
  const mapping = m['mapping'];
  if (!Array.isArray(mapping) || mapping.length === 0 || mapping.length > 64
      || !mapping.every((e) => typeof e === 'object' && e !== null && typeof (e as Row)['from'] === 'string' && KEY.test((e as Row)['from'] as string)
                               && typeof (e as Row)['to'] === 'string' && KEY.test((e as Row)['to'] as string))) {
    no('mapping must list 1–64 entries { from: an upstream contract key, to: a downstream element key }');
  }
  if (typeof m['use'] !== 'string' || !CLASS.test(m['use'])) no('use must name the decision class the coupling serves');
  return { upstreamTwinId: m['upstreamTwinId'] as string, downstreamTwinId: m['downstreamTwinId'] as string,
           mapping: (mapping as Row[]).map((e) => ({ from: e['from'] as string, to: e['to'] as string })), use: m['use'] as string };
}

export function validateReason(m: Record<string, unknown>, correlationId: string): string {
  if (typeof m['reason'] !== 'string' || m['reason'].trim().length < 8 || m['reason'].length > 2000) bad(correlationId)('reason must state why (8–2000 characters)');
  return (m['reason'] as string).trim();
}

/** A DATE column names a day (the driver hands it back at LOCAL midnight): rendered as the day it names (the twin service's rule). */
function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

@Injectable()
export class CompositionService {
  async registerKind(cap: KindWrites, ctx: ScopeContext, a: KindIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.registerKind({ kind: a.kind, description: a.description, elementSchema: a.elementSchema, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
                              actor, eventId: newId(), correlationId });
  }

  async publishContract(cap: ContractWrites, ctx: ScopeContext, twinId: string, a: ContractIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.publishContract({ twinId, exposed: a.exposed, approvedUses: a.approvedUses, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
                                 actor, eventId: newId(), correlationId });
  }

  async declareLink(cap: LinkWrites, ctx: ScopeContext, linkId: string, a: LinkIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.declareLink({ linkId, upstreamTwinId: a.upstreamTwinId, downstreamTwinId: a.downstreamTwinId, mapping: a.mapping, use: a.use,
                             tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actor, eventId: newId(), correlationId });
  }

  async retireLink(cap: LinkWrites, ctx: ScopeContext, linkId: string, reason: string, actor: string, correlationId: string): Promise<Row> {
    return cap.retireLink({ linkId, reason, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actor, eventId: newId(), correlationId });
  }

  async applyCoupling(cap: CouplingWrites, ctx: ScopeContext, proposalId: string, actor: string, correlationId: string): Promise<Row> {
    return cap.applyCoupling({ proposalId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actor, eventId: newId(), correlationId });
  }

  async declineCoupling(cap: CouplingWrites, ctx: ScopeContext, proposalId: string, reason: string, actor: string, correlationId: string): Promise<Row> {
    return cap.declineCoupling({ proposalId, reason, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actor, eventId: newId(), correlationId });
  }

  /** The product kinds and the caller's own x- kinds (the registry's row security decides; nothing of another tenant is read). */
  async listKinds(cap: CompositionReads): Promise<Row[]> {
    const rows = (await cap.readKinds().selectAll().orderBy('kind' as never).execute()) as Row[];
    return rows.map((k) => ({ kind: k['kind'], family: k['family'], description: k['description'], element_schema: k['element_schema'], material_keys: k['material_keys'],
                              required_dependencies: k['required_dependencies'], default_methods: k['default_methods'],
                              scope: k['tenant_id'] === null ? 'product' : 'domain', registered_by: k['registered_by'] ?? null }));
  }

  async listContracts(cap: CompositionReads, twinId: string): Promise<Row[]> {
    return (await cap.readContracts().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('contract_version' as never, 'desc').execute()) as Row[];
  }

  async listLinks(cap: CompositionReads, twinId: string | null, state: string | null): Promise<Row[]> {
    let q = cap.readLinks().selectAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    if (twinId !== null) q = q.where((eb: any) => eb.or([eb('upstream_twin_id', '=', twinId), eb('downstream_twin_id', '=', twinId)]));
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('declared_at' as never).execute()) as Row[];
  }

  async listProposals(cap: CompositionReads, twinId: string | null, state: string | null): Promise<Row[]> {
    let q = cap.readProposals().selectAll();
    if (twinId !== null) q = q.where('downstream_twin_id' as never, '=', twinId as never);
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('proposed_at' as never, 'desc').execute()) as Row[];
  }

  async getProposal(cap: CompositionReads, proposalId: string): Promise<Row | undefined> {
    return (await cap.readProposals().selectAll().where('proposal_id' as never, '=', proposalId as never).executeTakeFirst()) as Row | undefined;
  }

  /** L5-C06: what the twin must be linked to, what it is linked to (transitively, over live links), what is missing, and the ratio. */
  async completeness(cap: CompositionReads, ctx: ScopeContext, twinId: string): Promise<Row | null> {
    return cap.completeness({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, twinId });
  }

  /**
   * The FAMILY-DERIVED MEASURES of a version (the latest admitted on `actual` when none is named): read from its complete elements —
   * the coupled ones included — as the version stands; the regulation family's "in force" is judged at the version's world cut-off.
   */
  async measures(cap: CompositionReads, twinId: string, version: number | null): Promise<Row | null> {
    const twin = (await cap.readTwins().select(['twin_id', 'kind'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
    if (twin === undefined) return null;
    const kind = (await cap.readKinds().select(['kind', 'family'] as never).where('kind' as never, '=', twin['kind'] as never).executeTakeFirst()) as Row | undefined;
    let vq = cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never);
    vq = version === null ? vq.where('branch_id' as never, '=', 'actual' as never).where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc')
                          : vq.where('version' as never, '=', version as never);
    const v = (await vq.executeTakeFirst()) as Row | undefined;
    const family = (kind?.['family'] as string | null | undefined) ?? null;
    if (v === undefined) return { twin_id: twinId, kind: twin['kind'], family, version: null, measures: {} };
    const els = (await cap.readElements().select(['key', 'value', 'unit', 'health'] as never)
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', v['version'] as never).orderBy('key' as never).execute()) as Row[];
    const elements: FamilyElement[] = els.map((e) => ({ key: String(e['key']), value: e['value'], unit: (e['unit'] as string | null) ?? null, health: (e['health'] as string | null) ?? null }));
    const asOf = dayOf(v['observed_through']);
    return { twin_id: twinId, kind: twin['kind'], family, version: Number(v['version']), state: v['state'], as_of: asOf, measures: familyMeasures(family, elements, asOf) };
  }
}
