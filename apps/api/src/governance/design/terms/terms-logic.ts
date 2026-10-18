/**
 * B81 §CT (0119_b81_x_ct) — the PURE logic of the governed product language (unit-tested): the acts and their actions, who may take each act
 * in words (the PORT decides — this explains, before the act), the request shapes the routes refuse early (governance.term_entry_problem's
 * mirror), and the class-form refusal of this part's noun `design term` (mapped HERE until the integrator adds it centrally:
 * 403 actor|authority|separation_of_duties|access · 404 unknown_* · 409 state|stale|duplicate|held|expired|conflict · 422 otherwise).
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { AUDIENCES } from './content-lint.js';

export const TERM_NOUN = 'design term';
export const TERM_ACTS = ['propose', 'review', 'approve', 'publish', 'correct', 'retire'] as const;
export type TermAct = (typeof TERM_ACTS)[number];
export const termAction = (act: TermAct): string => `governance.design.term.${act}`;
/** The vendor's registry (drafts, reviews, the ledger) — PLATFORM. */
export const TERM_READ = 'governance.design.term.read';
/** The PUBLISHED catalogue (what Term and HelpPanel render) — every human context. */
export const TERM_CATALOGUE_READ = 'governance.design.term.catalogue.read';
export const TERM_CATEGORIES = ['truth_state', 'lifecycle_state', 'action', 'object', 'concept', 'instruction', 'error', 'warning', 'label'] as const;
export const CONTRIBUTOR_ROLES = ['design_system_authority', 'product_authority', 'conformance_steward', 'operations_authority'] as const;

const KEY = /^[a-z][a-z0-9_.-]{2,80}$/;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
type Row = Record<string, unknown>;
const isText = (v: unknown, min: number, max: number) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

/** governance.term_entry_problem's mirror: null, or '<class>: <message>' (the first problem, in the SQL's order). */
export function entryProblem(p: unknown): string | null {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return 'entry: a term entry is an object';
  const e = p as Row;
  if (!(TERM_CATEGORIES as readonly string[]).includes(String(e['category'] ?? ''))) return `category: the category is one of ${TERM_CATEGORIES.join(', ')}`;
  if (!isText(e['label'], 2, 120)) return 'label: the canonical label is 2–120 characters';
  if (!isText(e['definition'], 8, 1000)) return 'definition: a definition is 8–1000 characters';
  const x = e['explanations'];
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return 'explanation: the explanations are an object keyed by audience';
  for (const a of AUDIENCES) if (!isText((x as Row)[a], 8, 600)) return `explanation: the ${a} explanation is 8–600 characters (every audience is explained: ${AUDIENCES.join(', ')})`;
  for (const k of Object.keys(x).sort()) if (!(AUDIENCES as readonly string[]).includes(k)) return `explanation: ${k} is not an audience (${AUDIENCES.join(', ')})`;
  if (!isText(e['example'], 8, 600)) return 'example: help carries an example of 8–600 characters (CNT-16)';
  const cls: Record<string, string> = { protected: 'protected', synonyms: 'synonym', conditions: 'condition', cites: 'cite', glossary_keys: 'glossary' };
  for (const k of ['protected', 'synonyms', 'conditions', 'cites', 'glossary_keys']) {
    const v = e[k];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v) || v.length > 12 || v.some((s) => typeof s !== 'string')) return `${cls[k]}: ${k} is a list of at most 12 texts`;
    for (const s of v as string[]) {
      if (k === 'protected' && !isText(s, 2, 60)) return 'protected: a protected word is 2–60 characters';
      if (k === 'synonyms' && !isText(s, 2, 120)) return 'synonym: a synonym is 2–120 characters';
      if (k === 'synonyms' && s.trim().toLowerCase() === String(e['label']).trim().toLowerCase()) return 'synonym: a synonym is never the canonical label itself';
      if (k === 'conditions' && !isText(s, 8, 300)) return 'condition: a required condition is 8–300 characters';
      if (k === 'cites' && !KEY.test(s)) return 'cite: a cited term is named by its key';
      if (k === 'glossary_keys' && (s !== s.trim().toLowerCase() || s.length < 2 || s.length > 120)) return 'glossary: a domain glossary key is the lower-cased term (2–120 characters)';
    }
  }
  return null;
}

/** The proposal's route-level shape (key, locale, entry); the port re-checks everything (dilution, conflicts, provenance included). */
export function proposalProblem(p: Row): string | null {
  if (typeof p['key'] !== 'string' || !KEY.test(p['key'])) return 'key: a term key is 3–81 lower-case letters, digits, dots, hyphens and underscores';
  if (p['locale'] !== undefined && (typeof p['locale'] !== 'string' || !LOCALE.test(p['locale']))) return 'locale: a locale is a language code (en, en-GB …)';
  if (p['expectedVersion'] !== undefined && (typeof p['expectedVersion'] !== 'number' || !Number.isInteger(p['expectedVersion']) || p['expectedVersion'] < 0)) return 'request: expectedVersion is a whole number';
  return entryProblem(p['entry']);
}

/** WHY a principal may not take a term act, in words (empty = eligible as far as the page can tell; the PORT decides). */
export function termEligibility(a: { act: Exclude<TermAct, 'propose'>; kind: string; roles: readonly string[]; principal: string; proposer: string | null; state: string; published?: boolean }): string[] {
  const out: string[] = [];
  const has = (r: string) => a.roles.includes(r);
  if (a.kind !== 'human') out.push('a named human takes this act — an agent or a system never reviews, approves, publishes, corrects or retires product language');
  const own = a.proposer !== null && a.principal === a.proposer;
  switch (a.act) {
    case 'review':
      if (!has('design_system_authority') && !has('conformance_steward')) out.push('you hold neither design_system_authority nor conformance_steward');
      if (own) out.push('you proposed it — no self-review');
      if (a.state !== 'proposed') out.push(`it is ${a.state}, not proposed`);
      break;
    case 'approve':
    case 'publish':
      if (!has('design_system_authority')) out.push('you do not hold design_system_authority');
      if (own) out.push(`you proposed it — no self-${a.act === 'approve' ? 'approval' : 'publication'}`);
      if (a.act === 'approve' && a.state !== 'reviewed') out.push(`it is ${a.state}, not reviewed ready`);
      if (a.act === 'publish' && a.state !== 'approved') out.push(`it is ${a.state}, not approved`);
      break;
    case 'correct':
      if (!CONTRIBUTOR_ROLES.some(has)) out.push('you hold no contributor role of the design system');
      if (a.published !== true) out.push('it has no published version — revise it by a new proposal');
      break;
    case 'retire':
      if (!has('design_system_authority')) out.push('you do not hold design_system_authority');
      if (a.state === 'retired' || a.state === 'superseded') out.push(`it is already ${a.state}`);
      break;
  }
  return out;
}

const STATUS: Array<[RegExp, number, string]> = [
  [/^design term rejected \((actor|authority|separation_of_duties|access)\)/, 403, 'EYE_AUT_001'],
  [/^design term rejected \(unknown_[a-z_]+\)/, 404, 'EYE_STA_001'],
  [/^design term rejected \((state|stale|duplicate|held|expired|conflict)\)/, 409, 'EYE_STA_002'],
  [/^design term rejected \(/, 422, 'EYE_REQ_001'],
];
/** The class-form refusal of a port's `design term rejected (<class>): …` text, or null for anything else (the central filter maps it). */
export function termRefusal(e: unknown, correlationId: string): HttpException | null {
  if (e instanceof HttpException) return null;
  const message = e instanceof Error ? e.message : '';
  for (const [re, status, code] of STATUS) if (re.test(message)) return new HttpException(errorBody(code as never, correlationId, message), status);
  return null;
}
/** A refusal the route answers before any port runs. */
export function refuseTerm(cls: string, message: string, correlationId: string, status = 422): HttpException {
  const code = status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001';
  return new HttpException(errorBody(code as never, correlationId, `${TERM_NOUN} rejected (${cls}): ${message}`), status);
}
/** A '<class>: <message>' problem as a route refusal. */
export function refuseProblem(problem: string, correlationId: string): HttpException {
  const i = problem.indexOf(': ');
  return refuseTerm(i < 0 ? 'request' : problem.slice(0, i), i < 0 ? problem : problem.slice(i + 2), correlationId);
}
