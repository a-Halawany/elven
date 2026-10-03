/**
 * SCENARIO SETS, THE COMPARATOR, THE PORTFOLIO REVIEW, LIVING SCENARIOS, CREATION TRIGGERS — CP-6 B27 part `sets` (migration 0097 §S;
 * F-P4-08: C-022, V00-T-056/-057, L7-C01/-C03/-C08, CAP-DS-01/-02, PR-33-001/-003/-006, V03-T-343, ADR-012).
 *
 *   THE SET          a named owner, a purpose, the decision package it serves, a PLURALITY policy {require: [kinds], min_branches,
 *                    min_adverse}; draft → active → retired; members (a scenario — every live branch of it — or one branch) added and
 *                    removed with who and when; its own ledger.
 *   THE CHECK        only LIVE branches count (prediction.branch_live: a suspended or closed branch, a retired scenario's, never); a new gap
 *                    raises `scenario.set_gap` to the set owner; a pass closes it. THE GATE: a package BOUND to a set is not proposed while
 *                    the check fails — `recommendation rejected (plurality): …` (409), from a trigger on the package's ledger.
 *   THE COMPARATOR   the set's branches side by side (an invoker read).
 *   THE REVIEW       a named human's portfolio review — relevance and consequence per member, the option × branch payoffs, robustness and
 *                    maximum regret computed by the port, the missing kinds, retirements proposed.
 *   LIVING           the tick step `scenario-relevance` (order 67) scores the living portfolio (members of active sets) and notifies the
 *                    scenario owner once per signpost breach.
 *   TRIGGERS         proposals from a forecast shift, a weak signal, a risk, a planning cycle — validated, routed to the strategy owners,
 *                    resolved accepted / dismissed; accepting declares nothing.
 * This service validates what a route hands in (the SHAPE, in plain words) and registers the tick step; the ports decide every rule.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../../executive/attention/tick.js';
import { SetCapability } from './sets.capabilities.js';
import { SCENARIO_KINDS_V1 } from '../scenarios.service.js';

type Row = Record<string, unknown>;

export const SCENARIO_RELEVANCE_STEP = 'scenario-relevance';
export const SCENARIO_RELEVANCE_ORDER = 67;
export const SET_STATES = ['draft', 'active', 'retired'] as const;
export const ADVERSE_KINDS = ['downside', 'disruption', 'stress', 'adversarial'] as const;
export const PROPOSAL_KINDS = ['forecast_shift', 'weak_signal', 'risk', 'planning_cycle'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const RELEVANCE_LEVELS = ['low', 'medium', 'high'] as const;
export const CONSEQUENCE_CLASSES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
/** Which field of a proposal's source names the object it rests on (the port validates the object itself). */
export const PROPOSAL_SOURCE_FIELD: Record<ProposalKind, string> = { forecast_shift: 'forecast_id', weak_signal: 'signal_id', risk: 'exposure_id', planning_cycle: 'cadence_id' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' ? (p[k] as string) : null);
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'scenario set'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}
const optionalUuid = (v: unknown, what: string, correlationId: string, noun = 'scenario set'): string | null =>
  (v === undefined || v === null || v === '' ? null : assertUuid(v, what, correlationId, noun));

/** The plurality policy's SHAPE: require ⊆ vocabulary v1 (each once), min_branches a whole number in 2..64, min_adverse in 0..64. */
export function validatePolicy(v: unknown, correlationId: string): Row {
  if (!isObject(v)) refuse(correlationId, 'scenario set rejected (policy): the plurality policy is an object {require: [kinds], min_branches, min_adverse}');
  const p = v as Row;
  for (const k of Object.keys(p)) if (!['require', 'min_branches', 'min_adverse'].includes(k)) refuse(correlationId, `scenario set rejected (policy): ${k} is not a term of the plurality policy (require, min_branches, min_adverse)`);
  const req = p['require'] ?? [];
  if (!Array.isArray(req) || req.some((k) => !(SCENARIO_KINDS_V1 as readonly string[]).includes(String(k)))) {
    refuse(correlationId, `scenario set rejected (policy): require lists kinds of scenario kind vocabulary v1 (${SCENARIO_KINDS_V1.join(', ')})`);
  }
  if (new Set(req as string[]).size !== (req as string[]).length) refuse(correlationId, 'scenario set rejected (policy): require names each kind once');
  if (p['min_branches'] !== undefined && (!whole(p['min_branches']) || (p['min_branches'] as number) < 2 || (p['min_branches'] as number) > 64)) refuse(correlationId, 'scenario set rejected (policy): min_branches is a whole number in 2..64 (a set is plural)');
  if (p['min_adverse'] !== undefined && (!whole(p['min_adverse']) || (p['min_adverse'] as number) < 0 || (p['min_adverse'] as number) > 64)) refuse(correlationId, 'scenario set rejected (policy): min_adverse is a whole number in 0..64');
  return { require: req, ...(p['min_branches'] === undefined ? {} : { min_branches: p['min_branches'] }), ...(p['min_adverse'] === undefined ? {} : { min_adverse: p['min_adverse'] }) };
}

export interface SetDeclaration { title: string; purpose: string; owner: string | null; policy: Row; packageId: string | null }
export function validateSetDeclaration(p: Row, correlationId: string): SetDeclaration {
  const title = str(p, 'title');
  if (title === null || title.trim().length < 2 || title.trim().length > 256) refuse(correlationId, 'scenario set rejected (title): a set has a title of 2 to 256 characters');
  const purpose = str(p, 'purpose');
  if (purpose === null || purpose.trim().length < 8 || purpose.trim().length > 2000) refuse(correlationId, 'scenario set rejected (purpose): a set states its purpose (8 to 2000 characters)');
  return { title: (title as string).trim(), purpose: (purpose as string).trim(), owner: optionalUuid(p['ownerPrincipalId'], 'owner', correlationId), policy: validatePolicy(p['policy'], correlationId),
           packageId: optionalUuid(p['packageId'], 'package', correlationId) };
}

export function validateMember(p: Row, correlationId: string): { scenarioId: string; branchId: string | null } {
  return { scenarioId: assertUuid(p['scenarioId'], 'scenario', correlationId), branchId: optionalUuid(p['branchId'], 'branch', correlationId) };
}

export function validateReason(p: Row, correlationId: string, what: string, noun = 'scenario set'): string {
  const r = str(p, 'reason');
  if (r === null || r.trim().length < 8 || r.trim().length > 2000) refuse(correlationId, `${noun} rejected (reason): a ${what} says why (8 to 2000 characters)`);
  return (r as string).trim();
}

export interface ReviewIntake { members: Row[]; options: Row[] | null; payoffs: Row; unit: string; retirements: Row[]; note: string }
/** A portfolio review's SHAPE (the port judges the members, the options, the matrix's coverage of every live branch, and computes). */
export function validateReview(p: Row, correlationId: string): ReviewIntake {
  const members = p['members'];
  if (!Array.isArray(members) || members.length === 0) refuse(correlationId, 'portfolio review rejected (members): the review rates every member [{member_id, relevance, consequence}]');
  for (const m of members as unknown[]) {
    if (!isObject(m) || typeof m['member_id'] !== 'string' || !UUID.test(m['member_id'])) refuse(correlationId, 'portfolio review rejected (members): each rating names a member_id');
    const mm = m as Row;
    if (!(RELEVANCE_LEVELS as readonly string[]).includes(String(mm['relevance']))) refuse(correlationId, 'portfolio review rejected (relevance): each member is rated low, medium or high');
    if (!(CONSEQUENCE_CLASSES as readonly string[]).includes(String(mm['consequence']))) refuse(correlationId, 'portfolio review rejected (consequence): each member carries a consequence class C0..C4');
  }
  const options = p['options'];
  if (options !== undefined && options !== null) {
    if (!Array.isArray(options)) refuse(correlationId, 'portfolio review rejected (options): the options are a list [{key, title}] (or omitted: the bound package\'s)');
    for (const o of options as unknown[]) {
      if (!isObject(o) || typeof o['key'] !== 'string' || !OPTION_KEY.test(o['key']) || typeof o['title'] !== 'string' || o['title'].trim().length < 2) {
        refuse(correlationId, 'portfolio review rejected (options): each option has a key (lower-case, 1-64) and a title (2-256 characters)');
      }
    }
  }
  const payoffs = p['payoffs'];
  if (!isObject(payoffs)) refuse(correlationId, 'portfolio review rejected (payoffs): the payoffs are an object {option_key: {branch_id: number}}');
  for (const [k, row] of Object.entries(payoffs as Row)) {
    if (!isObject(row)) refuse(correlationId, `portfolio review rejected (payoffs): option ${k}'s payoffs are an object {branch_id: number}`);
    for (const [b, v] of Object.entries(row as Row)) {
      if (!UUID.test(b) || typeof v !== 'number' || !Number.isFinite(v)) refuse(correlationId, `portfolio review rejected (payoffs): option ${k} pays a finite number per branch id`);
    }
  }
  const unit = str(p, 'unit');
  if (unit === null || unit.trim().length < 1 || unit.trim().length > 64) refuse(correlationId, 'portfolio review rejected (unit): the payoffs name their unit (1 to 64 characters)');
  const retirements = p['retirements'] ?? [];
  if (!Array.isArray(retirements)) refuse(correlationId, 'portfolio review rejected (retirements): retirements are a list [{scenario_id, note}]');
  for (const r of retirements as unknown[]) {
    if (!isObject(r) || typeof r['scenario_id'] !== 'string' || !UUID.test(r['scenario_id']) || typeof r['note'] !== 'string' || r['note'].trim().length < 8) {
      refuse(correlationId, 'portfolio review rejected (retirements): each proposed retirement names a scenario_id and a note (8+ characters)');
    }
  }
  const note = str(p, 'note');
  if (note === null || note.trim().length < 8 || note.trim().length > 4000) refuse(correlationId, 'portfolio review rejected (note): a review states its conclusion (8 to 4000 characters)');
  return { members: members as Row[], options: options === undefined || options === null ? null : (options as Row[]), payoffs: payoffs as Row, unit: (unit as string).trim(), retirements: retirements as Row[], note: (note as string).trim() };
}

export interface ProposalIntake { kind: ProposalKind; source: Row; title: string; rationale: string }
/** A proposal's SHAPE: the kind, its source naming the object (the port validates the object: superseded, escalated, above appetite, reset). */
export function validateProposal(p: Row, correlationId: string): ProposalIntake {
  const kind = str(p, 'kind');
  if (kind === null || !(PROPOSAL_KINDS as readonly string[]).includes(kind)) refuse(correlationId, `scenario proposal rejected (kind): a proposal comes from ${PROPOSAL_KINDS.join(', ')}`);
  const source = p['source'];
  if (!isObject(source)) refuse(correlationId, 'scenario proposal rejected (source): the source is an object naming the object it rests on');
  const field = PROPOSAL_SOURCE_FIELD[kind as ProposalKind];
  assertUuid((source as Row)[field], 'source', correlationId, 'scenario proposal');
  if (kind === 'forecast_shift') {
    const b = (source as Row)['band_pct'];
    if (typeof b !== 'number' || !(b > 0) || b > 10) refuse(correlationId, 'scenario proposal rejected (source): a forecast shift states band_pct, a fraction of the earlier median in (0, 10]');
  }
  const title = str(p, 'title');
  if (title === null || title.trim().length < 4 || title.trim().length > 256) refuse(correlationId, 'scenario proposal rejected (title): a proposal names the scenario it proposes (4 to 256 characters)');
  const rationale = str(p, 'rationale');
  if (rationale === null || rationale.trim().length < 8 || rationale.trim().length > 4000) refuse(correlationId, 'scenario proposal rejected (rationale): a proposal says why (8 to 4000 characters)');
  return { kind: kind as ProposalKind, source: source as Row, title: (title as string).trim(), rationale: (rationale as string).trim() };
}

export function validateResolution(p: Row, correlationId: string): { resolution: 'accepted' | 'dismissed'; note: string } {
  const r = str(p, 'resolution');
  if (r !== 'accepted' && r !== 'dismissed') refuse(correlationId, 'scenario proposal rejected (resolution): a proposal is accepted or dismissed');
  const note = str(p, 'note');
  if (note === null || note.trim().length < 8 || note.trim().length > 4000) refuse(correlationId, 'scenario proposal rejected (note): a resolution says why (8 to 4000 characters)');
  return { resolution: r as 'accepted' | 'dismissed', note: (note as string).trim() };
}

@Injectable()
export class ScenarioSetsService implements OnModuleInit {
  private readonly log = new Logger('prediction.scenario-sets');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The tick step (the planning service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: scenario relevance is not scored by the tick'); return; }
    registry.register({ name: SCENARIO_RELEVANCE_STEP, order: SCENARIO_RELEVANCE_ORDER, run: async (c: AttentionTickContext) => this.relevance(c) });
  }
  /** `scenario-relevance`: the living portfolio (members of active sets) scored; signposts notified once per breach — judged by the port. */
  private async relevance(c: AttentionTickContext): Promise<Row> {
    return SetCapability.tick(c.tx, 'executive.attention.tick').scoreRelevance({ tenantId: c.tenantId, domainId: c.domainId, trigger: 'tick', actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
