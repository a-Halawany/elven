/**
 * B81 §SI (0119_b81_x_si) — THE SEARCH AND INTENT SERVICE: the intake shaped (types only — the port decides every rule: the receipts, the
 * policy version and the cutoff, the digest, the stale check, nothing preselected, the clarification of an ambiguous reading, the command
 * as a hand-off, the human), the pipeline idiom (an audited consequential read; a governed write with its receipt), the refusals in the
 * class form `saved search rejected (<class>): …` / `intent record rejected (<class>): …`.
 *
 *   saved search    save (`shell.search.save`) · read (`shell.search.read`) — DOMAIN
 *   intent record   record (`shell.intent.record`) — DOMAIN
 *
 * NOTHING EXECUTES: saving a search keeps what the person saw; recording an intent keeps what was typed and how it was read. Neither runs a
 * command, approves, acknowledges or advances anything — a command the palette found opens its page's Command Review, where the page's own
 * governed, human-gated action decides.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { SearchCapability } from './search.capabilities.js';

type Row = Record<string, unknown>;
export type SearchNoun = 'saved search' | 'intent record';
/** The nouns this part's refusals speak in — to be mapped centrally (observation-errors.ts) at integration. */
export const SEARCH_NOUNS: readonly SearchNoun[] = ['saved search', 'intent record'];
export const SEARCH_SAVE = 'shell.search.save';
export const SEARCH_READ = 'shell.search.read';
export const INTENT_RECORD = 'shell.intent.record';
export const PALETTE_MODES = ['goto', 'search', 'ask', 'command'] as const;
export const INTENT_OUTCOMES = ['chosen', 'literal', 'cancelled', 'command_review', 'navigated', 'unsupported'] as const;
export const SEARCH_LEGS = ['graph', 'strategy', 'catalog', 'exposures', 'packages'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** A refusal in the class form, answered by the route before any port runs (the caller's own request). */
export function refuseSearch(noun: SearchNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const optUuid = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : typeof v === 'string' && UUID.test(v) ? v : undefined);

export interface SaveIntake { name: string; expectedVersion: number; query: string; intent: Row | null; filters: Row | null; legs: Row[]; results: Row[]; intentRecordId: string | null }
/** The save's intake: the TYPES of what the port validates item by item (the port is the authority on every rule). */
export function validateSearchSave(p: Row, cid: string): SaveIntake {
  const name = str(p['name']);
  if (name === null || name.trim() === '') throw refuseSearch('saved search', 'name', 'a saved search is named (1–120 characters)', cid);
  const query = str(p['query']);
  if (query === null || query.trim() === '') throw refuseSearch('saved search', 'query', 'the query is kept as typed (1–500 characters)', cid);
  const ev = p['expectedVersion'];
  if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) throw refuseSearch('saved search', 'version', 'expectedVersion is the version the client read (0 for a new name)', cid);
  const intent = p['intent'] === undefined || p['intent'] === null ? null : p['intent'];
  if (intent !== null && !isObj(intent)) throw refuseSearch('saved search', 'intent', 'the interpretation the search ran under is an object', cid);
  const filters = p['filters'] === undefined || p['filters'] === null ? null : p['filters'];
  if (filters !== null && !isObj(filters)) throw refuseSearch('saved search', 'filters', 'the filters are an object {kinds?, legs?}', cid);
  const legs = p['legs'];
  if (!Array.isArray(legs) || legs.length === 0 || !legs.every(isObj)) throw refuseSearch('saved search', 'legs', 'the search names the legs it ran, each {leg, receipt, state, note}', cid);
  const results = p['results'] === undefined ? [] : p['results'];
  if (!Array.isArray(results) || !results.every(isObj)) throw refuseSearch('saved search', 'results', 'the results are an array of {leg, kind, id, version, label}', cid);
  const ir = optUuid(p['intentRecordId']);
  if (ir === undefined) throw refuseSearch('saved search', 'intent', 'intentRecordId names one of your intent records (a uuid), or none', cid);
  return { name, expectedVersion: ev, query, intent, filters, legs, results, intentRecordId: ir };
}

export interface IntentIntake { mode: string; input: string; interpreter: string; interpretation: Row; alternatives: Row[]; clarification: string | null; choice: string | null;
  outcome: string; commandAction: string | null; respondsTo: string | null }
/** The intent record's intake: the TYPES (the port decides: nothing preselected, an ambiguous reading asks, a command is only a hand-off). */
export function validateIntentRecord(p: Row, cid: string): IntentIntake {
  const mode = str(p['mode']);
  if (mode === null || !(PALETTE_MODES as readonly string[]).includes(mode)) throw refuseSearch('intent record', 'mode', 'the mode is goto, search, ask or command — the palette never infers it silently', cid);
  const input = str(p['input']);
  if (input === null || input.trim() === '') throw refuseSearch('intent record', 'input', 'the input is kept as typed (1–500 characters)', cid);
  const interpreter = str(p['interpreter']);
  if (interpreter === null) throw refuseSearch('intent record', 'interpreter', 'the record names the deterministic interpreter\'s version', cid);
  const interpretation = p['interpretation'];
  if (!isObj(interpretation)) throw refuseSearch('intent record', 'interpretation', 'the interpretation is an object {kind, scoped_query, kinds, terms, command, uncertainty, reason}', cid);
  const alternatives = p['alternatives'] === undefined ? [] : p['alternatives'];
  if (!Array.isArray(alternatives) || !alternatives.every(isObj)) throw refuseSearch('intent record', 'alternatives', 'the alternatives are an array of {key, label, kind, target}', cid);
  const outcome = str(p['outcome']);
  if (outcome === null || !(INTENT_OUTCOMES as readonly string[]).includes(outcome)) {
    throw refuseSearch('intent record', 'outcome', 'the outcome is chosen, literal, cancelled, command_review, navigated or unsupported — nothing is ever recorded as executed', cid);
  }
  const nullable = (k: string, cls: string, what: string): string | null => {
    const v = p[k];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw refuseSearch('intent record', cls, what, cid);
    return v;
  };
  const respondsTo = optUuid(p['respondsTo']);
  if (respondsTo === undefined) throw refuseSearch('intent record', 'unknown_intent', 'respondsTo names one of your intent records (a uuid), or none', cid);
  return { mode, input, interpreter, interpretation, alternatives, outcome, respondsTo,
    clarification: nullable('clarification', 'clarification', 'the clarification is the question asked, in words'),
    choice: nullable('choice', 'choice', 'the choice is one alternative\'s key, or none'),
    commandAction: nullable('commandAction', 'command', 'the command is a governed action name, or none') };
}

type Scope = { tenantId: string; domainId: string };
const routeOf = (s: Scope, action: string, objectType: string, objectId: string | null): RouteInfo =>
  ({ scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope);
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Injectable()
export class SearchService {
  constructor(private readonly pipeline: PipelineService) {}

  /** The principal's OWN saved searches of this domain and recent intent records; `savedSearchId` = that one version exactly as saved. */
  async read(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const id = optUuid(body['savedSearchId']);
    if (id === undefined) throw refuseSearch('saved search', 'unknown_saved_search', 'savedSearchId names a saved search (a uuid)', env.correlation_id, 404);
    const history = typeof body['history'] === 'number' && Number.isInteger(body['history']) ? Math.max(0, Math.min(50, body['history'])) : 5;
    const out = await this.pipeline.consequentialRead(derive(env, SEARCH_READ, 'SRH', id), p, routeOf(s, SEARCH_READ, 'SRH', id), SearchCapability.read,
      async (cap, scope) => cap.searchesOf({ principalId: p.principalId, tenantId: scope.tenantId ?? s.tenantId, domainId: scope.domainId ?? s.domainId, savedSearchId: id, history }));
    return { searches: out.result, receipt: receipt(out) };
  }

  /** A new version of the person's saved search (append-only; the port verifies every searched leg's receipt and computes the digest). */
  async save(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validateSearchSave(body, env.correlation_id);
    const savedSearchId = newId();
    const out = await this.pipeline.write(derive(env, SEARCH_SAVE, 'SRH', savedSearchId), p, routeOf(s, SEARCH_SAVE, 'SRH', savedSearchId), SearchCapability.write,
      async (cap, scope) => {
        const r = await cap.saveSearch({ savedSearchId, tenantId: scope.tenantId ?? s.tenantId, domainId: scope.domainId ?? s.domainId, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'SRH', targetId: String(r['saved_search_id'] ?? savedSearchId), targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { savedSearch: out.result, receipt: receipt(out) };
  }

  /** One intent record (append-only): what was typed, how it was read, what was offered, what the person chose. It executes nothing. */
  async record(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validateIntentRecord(body, env.correlation_id);
    const intentId = newId();
    const out = await this.pipeline.write(derive(env, INTENT_RECORD, 'ITN', intentId), p, routeOf(s, INTENT_RECORD, 'ITN', intentId), SearchCapability.write,
      async (cap, scope) => {
        const r = await cap.recordIntent({ intentId, tenantId: scope.tenantId ?? s.tenantId, domainId: scope.domainId ?? s.domainId, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'ITN', targetId: String(r['intent_id'] ?? intentId), targetVersion: null, outboxEvent: null };
      });
    return { intent: out.result, receipt: receipt(out) };
  }
}
