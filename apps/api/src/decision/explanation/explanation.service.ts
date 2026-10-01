/**
 * EXPLANATION AND APPEAL — CP-6 B35 part `explanation` (migration 0101 §E; F-P6-03 completed: V00-T-027, AI-04-001..004, AI-63-005,
 * AI-64-002..004, AI-ADR-014, AI-C046, AI-C047, AG-040, AR-019, V05-T-005, V05-T-022 (App. L), V10-T-007/-008).
 *
 *   THE EXPLANATION   a governed object the SERVER generates from the subject's preserved state (a package version, an option, a forecast,
 *                     a run; a recommendation of §R and an analysis of §A when those parts are installed) — its items separated by
 *                     category (source evidence, deterministic transformation, model inference, agent judgment, human assessment), with
 *                     counter-evidence, competing hypotheses, likelihood vs impact, confidence vs evidence quality, the App. L contract, and
 *                     a digest binding it to that state. A moved subject reads STALE until it is generated again.
 *   THE RENDERING     natural language by a named human or the decision agent (the Explainability Agent's stand-in: it renders only),
 *                     admitted only through the FAITHFULNESS CHECK v1; withdrawn as unfaithful by an upheld appeal on it.
 *   THE CASE          contest and appeal: standing v1, scope, grounds, evidence, a response deadline, an adjudicator from the bench who is
 *                     neither the appellant nor the subject's owner, adjudication upheld | dismissed | partly_upheld with the correction and
 *                     the impact, notification (decision.appeal), closure; the appeal of a DECIDED package records reopen_required.
 *   THE DEADLINE      the tick step `appeal-deadlines` (order 71) marks a case past its deadline once and notifies its adjudicator.
 * This service validates what a route hands in (the SHAPE, in plain words) and registers the tick step; the ports decide every rule.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { ExplanationCapability, type AppealSubjectKind, type ExplanationSubjectKind } from './explanation.capabilities.js';

type Row = Record<string, unknown>;

export const APPEAL_DEADLINES_STEP = 'appeal-deadlines';
export const APPEAL_DEADLINES_ORDER = 71;
export const EXPLANATION_SUBJECT_KINDS = ['package_version', 'recommendation', 'analysis', 'forecast', 'run', 'option'] as const;
export const APPEAL_SUBJECT_KINDS = ['package', 'forecast', 'source', 'claim', 'recommendation', 'explanation'] as const;
export const ITEM_CATEGORIES = ['source_evidence', 'deterministic_transformation', 'model_inference', 'agent_judgment', 'human_assessment'] as const;
export const APPEAL_OUTCOMES = ['upheld', 'dismissed', 'partly_upheld'] as const;
export const APPEAL_STATES = ['opened', 'under_review', 'adjudicated', 'closed'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_ID = /^I[1-9][0-9]{0,3}$/;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const versionOrNull = (v: unknown, noun: string, correlationId: string): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, `${noun} rejected (version): a version is a positive integer`);
  return v as number;
};

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'explanation'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}

export interface SubjectCommand { subjectKind: ExplanationSubjectKind; subjectId: string; subjectVersion: number | null }
/** The subject's SHAPE: one of the six kinds, its uuid, the version (required for a package version and an analysis). */
export function validateSubject(p: Row, correlationId: string): SubjectCommand {
  const kind = p['subjectKind'];
  if (typeof kind !== 'string' || !(EXPLANATION_SUBJECT_KINDS as readonly string[]).includes(kind)) {
    refuse(correlationId, `explanation rejected (subject_kind): an explanation explains a ${EXPLANATION_SUBJECT_KINDS.join(', ')}`);
  }
  const subjectId = assertUuid(p['subjectId'], 'subject', correlationId);
  const subjectVersion = versionOrNull(p['subjectVersion'], 'explanation', correlationId);
  if ((kind === 'package_version' || kind === 'analysis') && subjectVersion === null) refuse(correlationId, `explanation rejected (version): a ${String(kind)} is explained at a named version`);
  return { subjectKind: kind as ExplanationSubjectKind, subjectId, subjectVersion };
}

export interface Sentence { text: string; cites: string[] }
export interface RenderCommand { audience: { role: string; language: string; accessibility: string | null }; sentences: Sentence[] }
/** The rendering's SHAPE: an audience {role, language, accessibility?} and 1–40 sentences {text (8–1000), cites: [I<n>, …]}. The port
 *  runs the faithfulness check against the explanation's own items. */
export function validateRender(p: Row, correlationId: string): RenderCommand {
  const a = p['audience'];
  if (!isObject(a) || !text(a['role'], 2, 64) || !text(a['language'], 2, 16) || (a['accessibility'] !== undefined && a['accessibility'] !== null && !text(a['accessibility'], 2, 200))) {
    refuse(correlationId, 'explanation rejected (audience): the audience names a role (2-64 characters) and a language (2-16), with an optional accessibility note');
  }
  const s = validateSentences(p['sentences'], correlationId);
  const au = a as Row;
  return { audience: { role: (au['role'] as string).trim(), language: (au['language'] as string).trim(), accessibility: typeof au['accessibility'] === 'string' ? (au['accessibility'] as string).trim() : null }, sentences: s };
}
export function validateSentences(v: unknown, correlationId: string): Sentence[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > 40) refuse(correlationId, 'explanation rejected (sentences): a rendering is 1 to 40 sentences, each {text, cites: [item ids]}');
  return (v as unknown[]).map((x, i) => {
    if (!isObject(x) || typeof x['text'] !== 'string' || !Array.isArray(x['cites']) || (x['cites'] as unknown[]).some((c) => typeof c !== 'string' || !ITEM_ID.test(c))) {
      refuse(correlationId, `explanation rejected (sentences): sentence ${i + 1} is {text, cites: ["I1", …]}`);
    }
    return { text: (x as Row)['text'] as string, cites: [...((x as Row)['cites'] as string[])] };
  });
}

export interface OpenCommand { subjectKind: AppealSubjectKind; subjectId: string; subjectVersion: number | null; explanationId: string | null; scope: Row; grounds: string; evidence: Row[]; deadlineAt: string | null }
/** The case's SHAPE: the subject (one of six kinds), the explanation it cites (optional), the scope {statement, fields?, items?, rendering_id?},
 *  the grounds (16–4000), the evidence (≤ 20 {kind, ref|id|statement}), the deadline (an instant, optional: the port defaults it to 14 days). */
export function validateOpen(p: Row, correlationId: string): OpenCommand {
  const kind = p['subjectKind'];
  if (typeof kind !== 'string' || !(APPEAL_SUBJECT_KINDS as readonly string[]).includes(kind)) {
    refuse(correlationId, `appeal rejected (subject_kind): a case contests a ${APPEAL_SUBJECT_KINDS.join(', ')}`);
  }
  const subjectId = assertUuid(p['subjectId'], 'subject', correlationId, 'appeal');
  const subjectVersion = versionOrNull(p['subjectVersion'], 'appeal', correlationId);
  const explanationId = p['explanationId'] === undefined || p['explanationId'] === null ? null : assertUuid(p['explanationId'], 'explanation', correlationId, 'appeal');
  const sc = p['scope'];
  if (!isObject(sc) || !text(sc['statement'], 8, 1000)) refuse(correlationId, 'appeal rejected (scope): the scope states what is contested (statement, 8 to 1000 characters; optional fields[] and items[]; optional rendering_id)');
  const scope = sc as Row;
  if (scope['fields'] !== undefined && (!Array.isArray(scope['fields']) || (scope['fields'] as unknown[]).some((f) => typeof f !== 'string' || f.length > 120))) refuse(correlationId, 'appeal rejected (scope): fields is a list of field names');
  if (scope['items'] !== undefined && (!Array.isArray(scope['items']) || (scope['items'] as unknown[]).some((f) => typeof f !== 'string' || !ITEM_ID.test(f)))) refuse(correlationId, 'appeal rejected (scope): items is a list of explanation item ids (I1, I2, …)');
  if (scope['rendering_id'] !== undefined) assertUuid(scope['rendering_id'], 'scope', correlationId, 'appeal');
  if (!text(p['grounds'], 16, 4000)) refuse(correlationId, 'appeal rejected (grounds): the grounds are stated (16 to 4000 characters)');
  const ev = p['evidence'] ?? [];
  if (!Array.isArray(ev) || ev.length > 20 || ev.some((e) => !isObject(e) || typeof e['kind'] !== 'string')) refuse(correlationId, 'appeal rejected (evidence): the evidence is a list of at most 20 {kind, ref | id | statement}');
  const d = p['deadlineAt'];
  if (d !== undefined && d !== null && (typeof d !== 'string' || Number.isNaN(Date.parse(d)))) refuse(correlationId, 'appeal rejected (deadline): the deadline is an instant (ISO 8601)');
  return { subjectKind: kind as AppealSubjectKind, subjectId, subjectVersion, explanationId, scope: { ...scope, statement: (scope['statement'] as string).trim() }, grounds: (p['grounds'] as string).trim(),
           evidence: ev as Row[], deadlineAt: typeof d === 'string' ? new Date(d).toISOString() : null };
}

export function validateAssign(p: Row, correlationId: string): { adjudicator: string } {
  return { adjudicator: assertUuid(p['adjudicator'], 'adjudicator', correlationId, 'appeal') };
}

export interface AdjudicateCommand { outcome: (typeof APPEAL_OUTCOMES)[number]; rationale: string; correction: string | null }
export function validateAdjudicate(p: Row, correlationId: string): AdjudicateCommand {
  const o = p['outcome'];
  if (typeof o !== 'string' || !(APPEAL_OUTCOMES as readonly string[]).includes(o)) refuse(correlationId, 'appeal rejected (outcome): a case is upheld, dismissed or partly_upheld');
  if (!text(p['rationale'], 16, 4000)) refuse(correlationId, 'appeal rejected (rationale): the adjudication states its rationale (16 to 4000 characters)');
  const c = p['correction'];
  if (o !== 'dismissed' && !text(c, 8, 2000)) refuse(correlationId, 'appeal rejected (correction): an upheld or partly upheld case states the correction and the owning layer that makes it (8 to 2000 characters)');
  return { outcome: o as AdjudicateCommand['outcome'], rationale: (p['rationale'] as string).trim(), correction: o === 'dismissed' ? null : (c as string).trim() };
}

export function validateClose(p: Row, correlationId: string): { note: string } {
  if (!text(p['note'], 8, 2000)) refuse(correlationId, 'appeal rejected (note): the closure says why (8 to 2000 characters)');
  return { note: (p['note'] as string).trim() };
}

/** The items per category (the surface's separation, counted): every category present, zero when none. */
export function itemsByCategory(items: Array<{ category?: unknown }>): Record<(typeof ITEM_CATEGORIES)[number], number> {
  const out = Object.fromEntries(ITEM_CATEGORIES.map((c) => [c, 0])) as Record<(typeof ITEM_CATEGORIES)[number], number>;
  for (const i of items) if (typeof i.category === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(i.category)) out[i.category as (typeof ITEM_CATEGORIES)[number]] += 1;
  return out;
}

@Injectable()
export class AppealDeadlinesService implements OnModuleInit {
  private readonly log = new Logger('decision.appeal-deadlines');
  constructor(private readonly moduleRef: ModuleRef) {}
  /** The tick step (the planning service's idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: appeal deadlines are flagged by the reads only'); return; }
    registry.register({ name: APPEAL_DEADLINES_STEP, order: APPEAL_DEADLINES_ORDER, run: async (c: AttentionTickContext) => this.sweep(c) });
  }
  /** `appeal-deadlines`: every open case past its response deadline marked once; its adjudicator (or the bench) notified — judged by the port. */
  private async sweep(c: AttentionTickContext): Promise<Row> {
    return ExplanationCapability.tick(c.tx, 'executive.attention.tick').flagOverdue({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }
}
