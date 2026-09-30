/**
 * SCENARIO ANATOMY — CP-6 B27 part `anatomy` (migration 0097 §A; F-P4-07; V00-T-055, V02-T-068/-070/-116/-164, L7-C02/-C04/-C07,
 * V03-T-137/-141/-332/-338, ES-37-001, AI-49-002, PR-33-002, OBJ-26).
 *
 *   THE ELEMENTS    drivers (exogenous or endogenous), actors (their agency), mechanisms (cause → effect), interventions (who acts, on which
 *                   driver or mechanism, the expected effect) and impacts (on which entity or objective, direction, magnitude band,
 *                   horizon) — of the whole scenario or one branch; each versioned (declare, revise naming the version read, retire with a
 *                   reason; never deleted), resting on other elements of the scenario by id and on the domain's graph by id.
 *   THE REGISTER    a link from the scenario (or a branch) to a live ASU of the Knowledge Graph, CRITICAL or not, with the condition that
 *                   invalidates it (the ASU's state, a named claim disputed or withdrawn, an indicator breach); versioned and reasoned.
 *   THE SUSPENSION  the ASU's invalidation (graph.set_assumption_state → invalidated) SUSPENDS every live branch a critical link names, in
 *                   the same transaction (a trigger on graph.strategy_events), and tasks the branch owner (scenario.suspension); a person
 *                   may suspend with a reason; the branch or scenario owner REINSTATES with a note once no critical linked assumption of
 *                   the branch is still invalidated. A suspended branch does not flip, is not simulated and is not decision-active.
 *   THE RECORDS     narrative, implication and option records (PR-33-002) by a named author, their citations validated.
 * This service validates what a route hands in, in plain words, and composes the READ's intervention → mechanism → impact map (pure);
 * the ports decide every rule.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;

export const ELEMENT_KINDS = ['driver', 'actor', 'mechanism', 'intervention', 'impact'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export const RECORD_KINDS = ['narrative', 'implication', 'option'] as const;
export const CONDITION_KINDS = ['state', 'claim', 'indicator'] as const;
export const CITATION_KINDS = ['claim', 'evidence', 'entity', 'strategy'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (p: Row, k: string): string => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
const optionalUuid = (p: Row, k: string, noun: string, correlationId: string): string | null => {
  const v = p[k];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${k}): ${k} is a uuid`);
  return (v as string).toLowerCase();
};
const optionalVersion = (p: Row, k: string, noun: string, correlationId: string): number | null => {
  const v = p[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, `${noun} rejected (${k}): ${k} is a positive whole number (the version you read)`);
  return v as number;
};

export function assertId(v: string, what: string, noun: string, correlationId: string): string {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${noun} rejected (unknown_${what}): no such ${what} in this domain`), 404);
  return v.toLowerCase();
}

export interface ElementIntake { branchId: string | null; kind: ElementKind; name: string; description: string; attributes: Row; graphRefs: Row[]; expectedVersion: number | null }
/** An element's SHAPE (the port judges the kind's attributes, the dependencies and the graph references). */
export function validateElement(p: Row, correlationId: string): ElementIntake {
  const kind = text(p, 'kind');
  if (!(ELEMENT_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `scenario element rejected (kind): ${kind === '' ? 'the kind is required' : `${kind} is not an element kind`} (driver, actor, mechanism, intervention, impact)`);
  const name = text(p, 'name'); const description = text(p, 'description');
  if (name.length < 2 || name.length > 128) refuse(correlationId, 'scenario element rejected (name): the name is 2-128 characters');
  if (description.length < 8 || description.length > 4096) refuse(correlationId, 'scenario element rejected (description): the description is 8-4096 characters');
  const attributes = p['attributes'] === undefined ? {} : p['attributes'];
  if (!isObject(attributes)) refuse(correlationId, 'scenario element rejected (attributes): the attributes are an object');
  const refs = p['graphRefs'] === undefined ? [] : p['graphRefs'];
  if (!Array.isArray(refs) || refs.some((r) => !isObject(r))) refuse(correlationId, 'scenario element rejected (graph_ref): graphRefs is a list of {kind: entity|strategy, id}');
  return { branchId: optionalUuid(p, 'branchId', 'scenario element', correlationId), kind: kind as ElementKind, name, description, attributes: attributes as Row, graphRefs: refs as Row[],
           expectedVersion: optionalVersion(p, 'expectedVersion', 'scenario element', correlationId) };
}

export function validateReason(p: Row, key: string, min: number, noun: string, correlationId: string): string {
  const v = text(p, key);
  if (v.length < min) refuse(correlationId, `${noun} rejected (${key}): the ${key} states why (${min}+ characters)`);
  return v;
}

export interface LinkIntake { assumptionId: string; branchId: string | null; critical: boolean; condition: Row; rationale: string; expectedVersion: number | null }
export function validateLink(p: Row, correlationId: string): LinkIntake {
  const assumptionId = optionalUuid(p, 'assumptionId', 'scenario assumption', correlationId);
  if (assumptionId === null) refuse(correlationId, 'scenario assumption rejected (assumptionId): the link names the assumption (an ASU of the Knowledge Graph)');
  if (typeof p['critical'] !== 'boolean') refuse(correlationId, 'scenario assumption rejected (critical): the link says whether the assumption is critical (critical: true|false)');
  const condition = p['condition'] === undefined ? { kind: 'state' } : p['condition'];
  if (!isObject(condition)) refuse(correlationId, 'scenario assumption rejected (condition): the invalidation condition is {kind: state|claim|indicator, …, text}');
  const c = condition as Row;
  const kind = typeof c['kind'] === 'string' ? c['kind'] : 'state';
  if (!(CONDITION_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `scenario assumption rejected (condition): ${kind} is not a condition kind (state, claim, indicator)`);
  const rationale = text(p, 'rationale');
  if (rationale.length < 8) refuse(correlationId, 'scenario assumption rejected (rationale): the link states why the scenario rests on the assumption (8+ characters)');
  const cond: Row = { kind, text: typeof c['text'] === 'string' ? c['text'].trim() : '' };
  if (kind === 'claim') cond['claim_id'] = c['claimId'] ?? c['claim_id'];
  if (kind === 'indicator') cond['indicator_id'] = c['indicatorId'] ?? c['indicator_id'];
  return { assumptionId: assumptionId as string, branchId: optionalUuid(p, 'branchId', 'scenario assumption', correlationId), critical: p['critical'] as boolean, condition: cond, rationale,
           expectedVersion: optionalVersion(p, 'expectedVersion', 'scenario assumption', correlationId) };
}

export interface RecordIntake { branchId: string | null; kind: string; title: string; body: string; cites: Array<{ kind: string; id: string }>; supersedes: string | null }
export function validateRecord(p: Row, correlationId: string): RecordIntake {
  const kind = text(p, 'kind');
  if (!(RECORD_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `scenario record rejected (kind): ${kind === '' ? 'the kind is required' : `${kind} is not a record kind`} (narrative, implication, option)`);
  const title = text(p, 'title'); const body = text(p, 'body');
  if (title.length < 2 || title.length > 256) refuse(correlationId, 'scenario record rejected (title): the title is 2-256 characters');
  if (body.length < 8 || body.length > 8000) refuse(correlationId, 'scenario record rejected (body): the body is 8-8000 characters');
  const cites = p['cites'] === undefined ? [] : p['cites'];
  if (!Array.isArray(cites) || cites.some((c) => !isObject(c) || !(CITATION_KINDS as readonly string[]).includes(String((c as Row)['kind'])) || typeof (c as Row)['id'] !== 'string' || !UUID.test(String((c as Row)['id'])))) {
    refuse(correlationId, 'scenario record rejected (cites): a citation is {kind: claim|evidence|entity|strategy, id: <uuid>}');
  }
  return { branchId: optionalUuid(p, 'branchId', 'scenario record', correlationId), kind, title, body,
           cites: (cites as Row[]).map((c) => ({ kind: String(c['kind']), id: String(c['id']).toLowerCase() })), supersedes: optionalUuid(p, 'supersedes', 'scenario record', correlationId) };
}

export function validateSuspend(p: Row, correlationId: string): { reason: string; elementId: string | null } {
  return { reason: validateReason(p, 'reason', 16, 'branch suspension', correlationId), elementId: optionalUuid(p, 'elementId', 'branch suspension', correlationId) };
}

/* ───────────── THE MAP (pure): interventions → the drivers and mechanisms they act on → the impacts that follow ───────────── */
export interface AnatomyElement {
  element_id: string; scenario_id: string; branch_id: string | null; kind: ElementKind; name: string; description: string; attributes: Row; graph_refs: Row[];
  version: number; state: 'active' | 'retired';
}
export interface InterventionPath {
  intervention: { element_id: string; name: string; by: string; expected_effect: string };
  targets: Array<{ element_id: string; kind: string; name: string }>;
  mechanisms: Array<{ element_id: string; name: string; cause: string; effect: string }>;
  impacts: Array<{ element_id: string; name: string; on: Row | null; direction: string; magnitude: string; horizon: string }>;
  /** An intervention whose chain reaches no impact is named, never dropped. */
  unmapped: boolean;
}
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The elements a branch sees: the scenario-wide ones and its own (active only). `null` → the scenario-wide ones alone. */
export function visibleElements(elements: AnatomyElement[], branchId: string | null): AnatomyElement[] {
  return elements.filter((e) => e.state === 'active' && (e.branch_id === null || e.branch_id === branchId));
}

/**
 * The intervention → mechanism → impact map of one branch (or the whole scenario). An intervention's TARGETS are drivers or mechanisms; its
 * MECHANISMS are the targeted mechanisms and every mechanism resting (dependencies) on a targeted driver or on a mechanism already reached
 * (transitively); its IMPACTS are the impacts resting on the intervention itself, on a targeted driver or on a reached mechanism.
 */
export function mapInterventions(elements: AnatomyElement[], branchId: string | null): InterventionPath[] {
  const seen = visibleElements(elements, branchId);
  const byId = new Map(seen.map((e) => [e.element_id, e]));
  const mechanisms = seen.filter((e) => e.kind === 'mechanism');
  const impacts = seen.filter((e) => e.kind === 'impact');
  return seen.filter((e) => e.kind === 'intervention').sort((a, b) => a.name.localeCompare(b.name)).map((iv) => {
    const targets = ids(iv.attributes['targets']).map((id) => byId.get(id)).filter((e): e is AnatomyElement => e !== undefined);
    const reached = new Set<string>([iv.element_id, ...targets.map((t) => t.element_id)]);
    const mech = new Map<string, AnatomyElement>(targets.filter((t) => t.kind === 'mechanism').map((t) => [t.element_id, t]));
    for (let grew = true; grew;) {
      grew = false;
      for (const m of mechanisms) {
        if (mech.has(m.element_id)) continue;
        if (ids(m.attributes['dependencies']).some((d) => reached.has(d))) { mech.set(m.element_id, m); reached.add(m.element_id); grew = true; }
      }
    }
    const hit = impacts.filter((im) => ids(im.attributes['dependencies']).some((d) => reached.has(d))).sort((a, b) => a.name.localeCompare(b.name));
    return {
      intervention: { element_id: iv.element_id, name: iv.name, by: String(iv.attributes['by'] ?? ''), expected_effect: String(iv.attributes['expected_effect'] ?? '') },
      targets: targets.map((t) => ({ element_id: t.element_id, kind: t.kind, name: t.name })),
      mechanisms: [...mech.values()].sort((a, b) => a.name.localeCompare(b.name)).map((m) => ({ element_id: m.element_id, name: m.name, cause: String(m.attributes['cause'] ?? ''), effect: String(m.attributes['effect'] ?? '') })),
      impacts: hit.map((im) => ({ element_id: im.element_id, name: im.name, on: isObject(im.attributes['on']) ? (im.attributes['on'] as Row) : null, direction: String(im.attributes['direction'] ?? ''),
                                  magnitude: String(im.attributes['magnitude'] ?? ''), horizon: String(im.attributes['horizon'] ?? '') })),
      unmapped: hit.length === 0,
    };
  });
}

/** Active elements grouped by kind (each kind present, possibly empty), in name order. */
export function groupByKind(elements: AnatomyElement[]): Record<ElementKind, AnatomyElement[]> {
  const out = Object.fromEntries(ELEMENT_KINDS.map((k) => [k, [] as AnatomyElement[]])) as Record<ElementKind, AnatomyElement[]>;
  for (const e of elements) if (e.state === 'active') out[e.kind].push(e);
  for (const k of ELEMENT_KINDS) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

@Injectable()
export class AnatomyService {
  /**
   * The READ composed: the port's answer (verbatim) plus, for the scenario and for each branch, its elements grouped by kind (the scenario-wide
   * ones and its own) and its intervention → mechanism → impact map. Nothing here changes a state the port computed.
   */
  compose(raw: Row): Row {
    const elements = (Array.isArray(raw['elements']) ? raw['elements'] : []) as AnatomyElement[];
    const branches = (Array.isArray(raw['branches']) ? raw['branches'] : []) as Row[];
    return {
      ...raw,
      scenario_wide: { elements_by_kind: groupByKind(visibleElements(elements, null)), map: mapInterventions(elements, null) },
      branches: branches.map((b) => {
        const id = String(b['branch_id']);
        const own = elements.filter((e) => e.branch_id === id);
        return { ...b, elements_by_kind: groupByKind(own), map: mapInterventions(elements, id) };
      }),
    };
  }
}
