/**
 * SCENARIO QUALITY AND COHERENCE v2 — CP-6 B27 part `quality` (migration 0097 §Q; F-P4-09; L7-C06, L7-I04, V03-T-142/-143/-334/-341,
 * ES-37-007/-008/-009, V04-T-031/-032, AI-49-003/-004, PR-33-005, FEX-12).
 *
 *   THE EVALUATION  a person's act (prediction.scenario.quality.evaluate) records the v1 QUALITY rules (distinctiveness, collapse, prohibited
 *                   contradiction, element temporal ordering, indicator freshness — fail; coverage, bias, shared signposts, review
 *                   timeliness — notes) into its OWN ledger; the v1 coherence check (0081) is untouched. A failed evaluation reads NOT
 *                   decision-active (FEX-12) beside a failed coherence check.
 *   THE PROBABILITY a named human sets a branch's probability band with a METHOD (frequency_map through a versioned FREQUENCY-TO-PROBABILITY
 *                   MAP, expert_elicitation with its record, model with a completed run) and its basis — never from narrative text; the live
 *                   branches' lows sum to at most 1; withdrawn with a reason.
 *   THE TICK        `scenario-quality` (order 68) re-evaluates an active scenario already evaluated once whose version or indicator freshness
 *                   changed, and routes `scenario.quality` to the owner once per new failure.
 *   This service validates what a route hands in, in plain words, and registers the step; the ports decide every rule.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../../executive/attention/tick.js';
import { QualityCapability } from './quality.capabilities.js';

type Row = Record<string, unknown>;

export const SCENARIO_QUALITY_STEP = 'scenario-quality';
export const SCENARIO_QUALITY_ORDER = 68;
export const QUALITY_TRIGGERS = ['declare', 'branch', 'operator'] as const;
export const PROBABILITY_METHODS = ['frequency_map', 'expert_elicitation', 'model'] as const;
/** The v1 quality rules by outcome (prediction.scenario_quality_rules v1). */
export const QUALITY_FAIL_RULES_V1 = ['indistinct_branches', 'collapse_to_one_forecast', 'prohibited_contradiction', 'element_temporal_order', 'indicator_missing', 'indicator_stale'] as const;
export const QUALITY_NOTE_RULES_V1 = ['coverage', 'bias', 'signpost_shared', 'review_overdue'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'scenario quality'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}

/** The evaluation's trigger (default operator); the tick has its own step. */
export function validateTrigger(p: Row, correlationId: string): string {
  const t = p['trigger'] ?? 'operator';
  if (typeof t !== 'string' || !(QUALITY_TRIGGERS as readonly string[]).includes(t)) {
    refuse(correlationId, 'scenario quality rejected (trigger): a person\'s evaluation is prompted by declare, branch or operator (the tick evaluates under its own step)');
  }
  return t as string;
}

export interface MapDeclaration { name: string; horizon: string; bands: Row[]; owner: string | null }
/** A frequency map's SHAPE (the port judges contiguity, order and monotonicity). */
export function validateMap(p: Row, correlationId: string): MapDeclaration {
  const name = p['name'];
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 128) refuse(correlationId, 'frequency map rejected (name): a map is named (3 to 128 characters)');
  const horizon = p['horizon'];
  if (typeof horizon !== 'string' || horizon.trim().length < 2 || horizon.trim().length > 64) refuse(correlationId, 'frequency map rejected (horizon): a map names the window its probabilities speak of (2 to 64 characters)');
  const bands = p['bands'];
  if (!Array.isArray(bands) || bands.length === 0 || bands.length > 20 || bands.some((b) => !isObject(b))) refuse(correlationId, 'frequency map rejected (bands): a map has 1 to 20 bands, each an object');
  (bands as Row[]).forEach((b, i) => {
    if (typeof b['frequency_label'] !== 'string' || !num(b['min_per_year']) || !(b['max_per_year'] === null || b['max_per_year'] === undefined || num(b['max_per_year']))
        || !num(b['probability_low']) || !num(b['probability_high'])) {
      refuse(correlationId, `frequency map rejected (bands): band ${i + 1} names a frequency_label, min_per_year, max_per_year (a number, or null for the last band) and probability_low / probability_high`);
    }
  });
  const owner = p['ownerPrincipalId'] === undefined || p['ownerPrincipalId'] === null ? null : assertUuid(p['ownerPrincipalId'], 'owner', correlationId, 'frequency map');
  return { name: (name as string).trim(), horizon: (horizon as string).trim(), bands: (bands as Row[]).map((b) => ({ ...b, max_per_year: b['max_per_year'] ?? null })), owner };
}

export interface ProbabilityCommand { method: string; low: number | null; high: number | null; mapId: string | null; basis: Row }
/** A probability's SHAPE: the method, the band (not for frequency_map), the map (only for frequency_map), the basis object. A narrative
 *  basis is refused here too (the port refuses it whatever the route). */
export function validateProbability(p: Row, correlationId: string): ProbabilityCommand {
  const method = p['method'];
  if (typeof method !== 'string' || !(PROBABILITY_METHODS as readonly string[]).includes(method)) refuse(correlationId, 'branch probability rejected (method): the method is frequency_map, expert_elicitation or model');
  const basis = p['basis'];
  if (!isObject(basis)) refuse(correlationId, 'branch probability rejected (basis): a probability states its basis (an object)');
  if (Object.prototype.hasOwnProperty.call(basis, 'narrative')) {
    refuse(correlationId, 'branch probability rejected (narrative): a probability is never derived from narrative text — state the observed frequency, the elicitation record or the model run');
  }
  const low = p['low'] === undefined || p['low'] === null ? null : p['low'];
  const high = p['high'] === undefined || p['high'] === null ? null : p['high'];
  if ((low !== null && !num(low)) || (high !== null && !num(high))) refuse(correlationId, 'branch probability rejected (band): low and high are numbers in [0, 1]');
  if (method === 'frequency_map') {
    if (low !== null || high !== null) refuse(correlationId, 'branch probability rejected (band): the frequency_map method computes the band from the map; state the frequency, not the band');
  } else if (low === null || high === null || (low as number) < 0 || (high as number) > 1 || (low as number) > (high as number)) {
    refuse(correlationId, `branch probability rejected (band): the ${method as string} method states the band (low ≤ high, both in [0, 1])`);
  }
  const mapId = p['mapId'] === undefined || p['mapId'] === null ? null : assertUuid(p['mapId'], 'map', correlationId, 'branch probability');
  if (method === 'frequency_map' && mapId === null) refuse(correlationId, 'branch probability rejected (map): the frequency_map method names the map');
  if (method !== 'frequency_map' && mapId !== null) refuse(correlationId, 'branch probability rejected (map): only the frequency_map method names a map');
  return { method: method as string, low: low as number | null, high: high as number | null, mapId, basis: basis as Row };
}

export function validateWithdrawal(p: Row, correlationId: string): string {
  const r = p['reason'];
  if (typeof r !== 'string' || r.trim().length < 8 || r.trim().length > 2000) refuse(correlationId, 'branch probability rejected (reason): a withdrawal says why (8 to 2000 characters)');
  return (r as string).trim();
}

/** A band in words (never a single point when the band is wide). */
export function bandLine(low: number, high: number): string {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  return low === high ? pct(low) : `${pct(low)}–${pct(high)}`;
}

@Injectable()
export class ScenarioQualityService implements OnModuleInit {
  private readonly log = new Logger('prediction.scenarios.quality');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The step (the events service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: scenario quality is not re-evaluated by the tick'); return; }
    registry.register({ name: SCENARIO_QUALITY_STEP, order: SCENARIO_QUALITY_ORDER, run: async (c: AttentionTickContext) => this.sweep(c) });
  }
  /** `scenario-quality`: the scenarios evaluated once whose version or indicator freshness changed, judged by the port. */
  private async sweep(c: AttentionTickContext): Promise<Row> {
    return QualityCapability.tick(c.tx, 'executive.attention.tick').sweep({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
