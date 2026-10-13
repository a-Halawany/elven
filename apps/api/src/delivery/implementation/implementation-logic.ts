/**
 * B94 §IM+§AD — the PURE request logic of the implementation routes: each parser shapes the caller's own request (a refusal here is the
 * caller's request, answered before any port runs, in the class form `<noun> rejected (<class>): …`); the PORTS re-check every rule that
 * matters (the approver test, the digest, the gate, the person rules). Nothing here reads a record or decides a rule a port decides.
 */
import type { DeliveryNoun } from '../seams.js';

type Row = Record<string, unknown>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; noun: DeliveryNoun; cls: string; message: string; status?: number };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DIGEST = /^[0-9a-f]{64}$/;
export const ITEM_KINDS = ['milestone', 'dependency', 'stakeholder', 'process', 'journey', 'risk', 'outcome', 'feedback', 'role_requirement', 'value_measure'] as const;
export const READINESS_KINDS = ['role_filled', 'owner_resolved', 'training_coverage', 'competence_coverage', 'accessibility_attested', 'shadow_review', 'custom'] as const;
/** The kinds no residual-risk acceptance overrides (mirrors implementation.nonoverridable_kinds()). */
export const NONOVERRIDABLE = ['role_filled', 'owner_resolved', 'accessibility_attested'] as const;
export const TRANSITIONS = ['start', 'hold', 'resume', 'withdraw'] as const;
export const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'] as const;
/** The only purpose a training or competence record serves (mirrors implementation.record_purposes()). */
export const RECORD_PURPOSE = 'enablement_readiness';

const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
const fail = <T>(noun: DeliveryNoun, cls: string, message: string, status?: number): Parsed<T> => ({ ok: false, noun, cls, message, ...(status === undefined ? {} : { status }) });
const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const intOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

export function parseOpen(p: Row): Parsed<{ key: string; title: string; targetDomainId: string; onboardingProgrammeId: string | null; profile: string; plan: Row }> {
  const N: DeliveryNoun = 'implementation programme';
  const key = str(p, 'key'); const title = str(p, 'title'); const target = str(p, 'targetDomainId');
  if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(key)) return fail(N, 'key', 'a programme key is lower-case (3–63 characters)');
  if (title.length < 4 || title.length > 200) return fail(N, 'title', 'a title of 4–200 characters');
  if (!UUID.test(target)) return fail(N, 'request', 'targetDomainId is a domain id');
  const ob = p['onboardingProgrammeId'];
  if (ob !== undefined && ob !== null && (typeof ob !== 'string' || !UUID.test(ob))) return fail(N, 'request', 'onboardingProgrammeId is an onboarding programme id');
  const profile = str(p, 'deploymentProfile') || 'local-dev';
  if (!(PROFILES as readonly string[]).includes(profile)) return fail(N, 'profile', `the deployment profile is ${PROFILES.join(', ')}`);
  if (!isObj(p['plan'])) return fail(N, 'plan', 'the plan is an object stating its objective');
  return { ok: true, value: { key, title, targetDomainId: target, onboardingProgrammeId: typeof ob === 'string' ? ob : null, profile, plan: p['plan'] } };
}

export function parseRevise(p: Row): Parsed<{ expectedVersion: number; title: string | null; plan: Row | null; onboardingProgrammeId: string | null; profile: string | null }> {
  const N: DeliveryNoun = 'implementation programme';
  const v = intOf(p['expectedVersion']);
  if (v === null || v < 1) return fail(N, 'request', 'expectedVersion names the version read');
  const title = p['title'] === undefined || p['title'] === null ? null : str(p, 'title');
  const plan = p['plan'] === undefined || p['plan'] === null ? null : p['plan'];
  if (plan !== null && !isObj(plan)) return fail(N, 'plan', 'the plan is an object');
  const ob = p['onboardingProgrammeId'];
  if (ob !== undefined && ob !== null && (typeof ob !== 'string' || !UUID.test(ob))) return fail(N, 'request', 'onboardingProgrammeId is an onboarding programme id');
  const profile = p['deploymentProfile'] === undefined || p['deploymentProfile'] === null ? null : str(p, 'deploymentProfile');
  if (profile !== null && !(PROFILES as readonly string[]).includes(profile)) return fail(N, 'profile', `the deployment profile is ${PROFILES.join(', ')}`);
  if (title === null && plan === null && ob === undefined && profile === null) return fail(N, 'request', 'a revision changes the title, the plan, the onboarding link or the profile');
  return { ok: true, value: { expectedVersion: v, title, plan: plan as Row | null, onboardingProgrammeId: typeof ob === 'string' ? ob : null, profile } };
}

export function parseTransition(act: string, p: Row): Parsed<{ act: string; expectedVersion: number; reason: string }> {
  const N: DeliveryNoun = 'implementation programme';
  if (!(TRANSITIONS as readonly string[]).includes(act)) return fail(N, 'act', `the act is ${TRANSITIONS.join(', ')}`, 404);
  const v = intOf(p['expectedVersion']);
  if (v === null || v < 1) return fail(N, 'request', 'expectedVersion names the version read');
  const reason = str(p, 'reason');
  if (reason.length < 8) return fail(N, 'reason', 'a transition states its reason (8+ characters)');
  return { ok: true, value: { act, expectedVersion: v, reason } };
}

export function parseItem(p: Row): Parsed<{ kind: string; key: string; title: string | null; attributes: Row; expectedVersion: number; retire: boolean }> {
  const N: DeliveryNoun = 'implementation programme';
  const kind = str(p, 'kind');
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) return fail(N, 'kind', `the kind is one of ${ITEM_KINDS.join(', ')}`);
  const key = str(p, 'key');
  if (!/^[a-z][a-z0-9_.-]{1,62}$/.test(key)) return fail(N, 'key', 'an item key is lower-case (2–63 characters)');
  const attributes = p['attributes'] === undefined ? {} : p['attributes'];
  if (!isObj(attributes)) return fail(N, 'attributes', 'the attributes are an object');
  const v = p['expectedVersion'] === undefined ? 0 : intOf(p['expectedVersion']);
  if (v === null || v < 0) return fail(N, 'request', 'expectedVersion is 0 for a new item or the version read');
  const retire = p['retire'] === true;
  const title = p['title'] === undefined || p['title'] === null ? null : str(p, 'title');
  if (!retire && (title === null || title.length < 4)) return fail(N, 'title', 'an item has a title (4–200 characters)');
  return { ok: true, value: { kind, key, title, attributes, expectedVersion: v, retire } };
}

export function parseDecision(noun: DeliveryNoun, p: Row, decisions: readonly string[]): Parsed<{ decision: string; digest: string; reason: string }> {
  const decision = str(p, 'decision');
  if (!decisions.includes(decision)) return fail(noun, 'decision', `the decision is ${decisions.join(' or ')}`);
  const digest = str(p, 'digest');
  if (!DIGEST.test(digest)) return fail(noun, 'digest', 'the decision names the exact digest it read (64 hex)');
  const reason = str(p, 'reason');
  if (reason.length < 8) return fail(noun, 'reason', 'a decision states its reason (8+ characters)');
  return { ok: true, value: { decision, digest, reason } };
}

export function parseReadiness(p: Row): Parsed<{ key: string; kind: string; title: string; spec: Row; blocking: boolean; accountableRole: string | null; expectedVersion: number }> {
  const N: DeliveryNoun = 'readiness item';
  const kind = str(p, 'kind');
  if (!(READINESS_KINDS as readonly string[]).includes(kind)) return fail(N, 'kind', `the kind is one of ${READINESS_KINDS.join(', ')}`);
  const key = str(p, 'key');
  if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(key)) return fail(N, 'key', 'an item key is lower-case (3–63 characters)');
  const title = str(p, 'title');
  if (title.length < 4 || title.length > 200) return fail(N, 'title', 'a title of 4–200 characters');
  const spec = p['spec'] === undefined ? {} : p['spec'];
  if (!isObj(spec)) return fail(N, 'spec', 'the spec is an object');
  if (p['blocking'] !== undefined && typeof p['blocking'] !== 'boolean') return fail(N, 'request', 'blocking is true or false');
  const v = p['expectedVersion'] === undefined ? 0 : intOf(p['expectedVersion']);
  if (v === null || v < 0) return fail(N, 'request', 'expectedVersion is 0 for a new item or the version read');
  const role = p['accountableRole'] === undefined || p['accountableRole'] === null ? null : str(p, 'accountableRole');
  return { ok: true, value: { key, kind, title, spec, blocking: p['blocking'] !== false, accountableRole: role, expectedVersion: v } };
}

export function parseGolive(p: Row): Parsed<{ decision: 'approve' | 'withhold'; gateDigest: string; cadenceId: string | null; journeys: string[]; reason: string }> {
  const N: DeliveryNoun = 'go-live gate';
  const decision = str(p, 'decision');
  if (decision !== 'approve' && decision !== 'withhold') return fail(N, 'decision', 'approve or withhold');
  const gateDigest = str(p, 'gateDigest');
  if (!DIGEST.test(gateDigest)) return fail(N, 'digest', 'the decision names the exact gate digest it read (64 hex)');
  const cad = p['cadenceId'];
  if (cad !== undefined && cad !== null && (typeof cad !== 'string' || !UUID.test(cad))) return fail(N, 'cadence', 'cadenceId is an executive cadence id');
  const js = p['journeys'] === undefined ? [] : p['journeys'];
  if (!Array.isArray(js) || !js.every((x) => typeof x === 'string' && UUID.test(x))) return fail(N, 'journeys', 'journeys is a list of priority-journey item ids');
  if (decision === 'approve' && (typeof cad !== 'string')) return fail(N, 'cadence', 'go-live names the accepted operating cadence');
  if (decision === 'approve' && js.length === 0) return fail(N, 'journeys', 'go-live names at least one accepted priority journey');
  const reason = str(p, 'reason');
  if (reason.length < 8) return fail(N, 'reason', 'a go-live decision states its reason (8+ characters)');
  return { ok: true, value: { decision, gateDigest, cadenceId: typeof cad === 'string' ? cad : null, journeys: [...new Set(js as string[])], reason } };
}

export function parsePath(p: Row): Parsed<{ programmeId: string | null; key: string; title: string | null; roles: string[]; contentRef: string | null; expectedVersion: number; retire: boolean }> {
  const N: DeliveryNoun = 'training path';
  const key = str(p, 'key');
  if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(key)) return fail(N, 'key', 'a path key is lower-case (3–63 characters)');
  const retire = p['retire'] === true;
  const roles = p['roles'] === undefined ? [] : p['roles'];
  if (!Array.isArray(roles) || !roles.every((r) => typeof r === 'string' && /^[a-z][a-z_]{2,62}$/.test(r))) return fail(N, 'roles', 'roles is a list of role codes');
  if (!retire && roles.length === 0) return fail(N, 'roles', 'a path names the roles whose holders complete it');
  const prog = p['programmeId'];
  if (prog !== undefined && prog !== null && (typeof prog !== 'string' || !UUID.test(prog))) return fail(N, 'request', 'programmeId is a programme id');
  const v = p['expectedVersion'] === undefined ? 0 : intOf(p['expectedVersion']);
  if (v === null || v < 0) return fail(N, 'request', 'expectedVersion is 0 for a new path or the version read');
  return { ok: true, value: { programmeId: typeof prog === 'string' ? prog : null, key, title: p['title'] === undefined ? null : str(p, 'title'), roles: [...new Set(roles as string[])],
                              contentRef: p['contentRef'] === undefined ? null : str(p, 'contentRef'), expectedVersion: v, retire } };
}

/** A person record request: the purpose is enablement readiness, the outcome complete | not_yet — a score, a rank or another purpose is refused here and in the port. */
export function parsePersonRecord(noun: 'training record' | 'competence record', p: Row): Parsed<{ subject: string; outcome: string; purpose: string; note: string | null; retainDays: number | null }> {
  const subject = str(p, 'subject');
  if (!UUID.test(subject)) return fail(noun, 'subject', 'subject is the principal id of the person the record is about');
  for (const banned of ['score', 'rank', 'rating', 'percentile', 'grade']) {
    if (p[banned] !== undefined) return fail(noun, 'person', `a ${noun} carries no ${banned}: complete | not_yet only — no employee-performance inference`, 403);
  }
  const outcome = str(p, noun === 'training record' ? 'state' : 'outcome');
  if (outcome !== 'complete' && outcome !== 'not_yet') return fail(noun, noun === 'training record' ? 'state_value' : 'outcome', 'complete or not_yet — no score, no rank');
  const purpose = str(p, 'purpose') || RECORD_PURPOSE;
  if (purpose !== RECORD_PURPOSE) return fail(noun, 'purpose', `a ${noun} serves enablement readiness only — never a performance purpose (asked: ${purpose})`);
  const rd = p['retainDays'] === undefined || p['retainDays'] === null ? null : intOf(p['retainDays']);
  if (p['retainDays'] !== undefined && p['retainDays'] !== null && (rd === null || rd < 30 || rd > 1095)) return fail(noun, 'retention', 'retained 30–1095 days');
  const note = p['note'] === undefined || p['note'] === null ? null : str(p, 'note');
  if (note !== null && note.length > 500) return fail(noun, 'note', 'a note of at most 500 characters');
  return { ok: true, value: { subject, outcome, purpose, note, retainDays: rd } };
}

// ───────────── wording (the page and the reports; never judging) ─────────────
/** One gate line as text: the item, its state, its reason; an unsatisfied non-overridable item says it is not overridable. */
export function gateLine(b: { title?: unknown; kind?: unknown; reason?: unknown; overridable?: unknown }): string {
  const nonover = b.overridable === false && (NONOVERRIDABLE as readonly string[]).includes(String(b.kind));
  return `${String(b.title ?? b.kind)} — ${String(b.reason ?? 'unsatisfied')}${nonover ? ' (not overridable: it is filled, never waived)' : ''}`;
}

/** The share a cohort count shows, or INDETERMINATE below k (never a percentage of fewer than k people). */
export function cohortShare(complete: number, holders: number, k = 5): string {
  if (holders < k) return `INDETERMINATE — ${holders} holder(s), below k = ${k}: no share is shown`;
  return `${complete} of ${holders} (${Math.round((complete / holders) * 100)} %)`;
}
