/**
 * B50 §CL — THE CORRECTION-CLOSURE MODEL for /observation/corrections/[caseId] (the case page) and the §CL library components: the
 * consumer states in words, the deadline in words, the freeze marker and its case link, which consumer acts this person may take (with the
 * reason when not — the server re-checks every one), the close readiness (the server's reasons, never inferred), the closure record's
 * summary and the correction impact NOTICE (HX-18) sections. Pure functions over the server's answer (graph.correction_closure_read); nothing
 * here decides a closure, a class or a freeze, and nothing is shown closed, current or acknowledged unless the server's row says so.
 */
import type { AffectedClass, ClosureRecord, ConsumerAck, ConsumerAckState, FreezeState } from './b50-seams';
import type { ConsequenceView } from './authority-b81';

type Row = Record<string, unknown>;

/** One consumer of a case, as graph.correction_closure_read answers it. */
export interface ClosureConsumer {
  consumer_kind: 'affected_product' | 'subscription';
  consumer_ref: string;
  product_kind: string | null; object_type: string | null; product_id: string | null; product_version: number | null;
  class: AffectedClass | string | null; material: boolean; owner: string | null; title: string | null; bucket: string | null;
  subscription_id: string | null; delivery_state: string | null; failure_class: string | null;
  state: ServerConsumerState | string; closing: boolean; deadline: string | null; overdue: boolean; frozen: boolean;
  ack: { ack_id: string; state: string; by: string; at: string; note: string | null; recompute_ref: string | null; exception: { reason: string; expires_at: string; owner: string } | null } | null;
}
export type ServerConsumerState = 'current' | 'pending' | 'acknowledged' | 'recomputed' | 'bounded_exception' | 'exception_expired' | 'delivered' | 'failed';

/** The consumer states in words: a glyph AND a word (never colour alone), and what happens next. An unknown state is the server's word. */
export const CONSUMER_STATE_WORDS: Readonly<Record<ServerConsumerState, { glyph: string; label: string; next: string; closing: boolean }>> = {
  current: { glyph: '=', label: 'current', next: 'it already reflects the correction; nothing is owed', closing: true },
  pending: { glyph: '○', label: 'pending', next: 'its owner acknowledges it, records the recompute or grants a bounded exception', closing: false },
  acknowledged: { glyph: '✓', label: 'acknowledged', next: 'its owner reviewed it; nothing was rewritten', closing: true },
  recomputed: { glyph: '↻', label: 'recomputed', next: 'its re-run record is named', closing: true },
  bounded_exception: { glyph: '⧗', label: 'bounded exception', next: 'residual exposure until the exception expires; its owner answers for it', closing: true },
  exception_expired: { glyph: '!', label: 'exception expired', next: 'the exception lapsed: the consumer is open again', closing: false },
  delivered: { glyph: '✓', label: 'delivered', next: 'the subscription applied the change (its own ledger acknowledges it)', closing: true },
  failed: { glyph: '✕', label: 'delivery failed', next: 'the subscription\'s owner acknowledges the failure once the consumer re-read the change, or grants a bounded exception', closing: false },
};

export function consumerStateWord(state: string): { glyph: string; label: string; next: string; known: boolean } {
  const w = (CONSUMER_STATE_WORDS as Record<string, { glyph: string; label: string; next: string }>)[state];
  return w === undefined ? { glyph: '?', label: state, next: 'not a known consumer state — read the record', known: false } : { ...w, known: true };
}

/** The ConsumerAck seam (lib/b50-seams) of one server row: the latest act, or pending. */
export function toConsumerAck(caseId: string, c: ClosureConsumer): ConsumerAck {
  const known: readonly ConsumerAckState[] = ['pending', 'acknowledged', 'recomputed', 'bounded_exception', 'failed'];
  const st = (known as readonly string[]).includes(c.state) ? (c.state as ConsumerAckState) : 'pending';
  return {
    ackId: c.ack?.ack_id ?? null, caseId, consumer: { kind: c.consumer_kind, ref: c.consumer_ref }, state: st, by: c.ack?.by ?? null, at: c.ack?.at ?? null,
    exception: c.ack?.exception === null || c.ack?.exception === undefined ? null : { reason: c.ack.exception.reason, expiresAt: c.ack.exception.expires_at, owner: c.ack.exception.owner },
  };
}

/** The deadline in words, from the server's instants only (the database clock decides "overdue"; this never computes it). */
export function deadlineWords(c: Pick<ClosureConsumer, 'closing' | 'deadline' | 'overdue' | 'state' | 'consumer_kind'>, contractVersion: number | null): string {
  if (c.closing) return 'closed — no deadline';
  if (c.consumer_kind === 'subscription' && c.state === 'failed') return 'stalled at once: a failed delivery is an immediate stall';
  if (c.deadline === null) return contractVersion === null ? 'no window: the domain has declared no closure contract' : 'no window for this consumer class';
  return c.overdue ? `past its acknowledgement window (due ${c.deadline}) — the case is stalled` : `acknowledgement due by ${c.deadline}`;
}

/** The freeze marker: the words and the case link. A frozen product stays visible; the marker never hides it. */
export function freezeMarker(f: FreezeState): { frozen: boolean; text: string; href: string | null } {
  if (!f.frozen) return { frozen: false, text: 'not frozen', href: null };
  return f.caseId === null
    ? { frozen: true, text: 'FROZEN by a correction case — publication, delivery and export are refused until it closes', href: null }
    : { frozen: true, text: `FROZEN by correction case ${f.caseId.slice(0, 8)}… — publication, delivery and export are refused until it closes`, href: `/observation/corrections/${f.caseId}` };
}

/** Who the signed-in person is on this case (the server's facts: the roles in this domain; who applied the case). */
export interface CaseActor { principalId: string; roles: readonly string[]; appliedBy: string | null }
export type ConsumerAct = 'acknowledge' | 'recompute' | 'except' | 'freeze';
export interface ActAvailability { enabled: boolean; reason: string | null }

/**
 * The acts this person may take on one consumer — the PORT's rules mirrored so the controls are disabled with the reason (the server
 * re-checks every one): the owner closes; a product with no owner is a knowledge owner's or the domain administrator's; a human review is
 * never the correction authority's and never recomputed; an exception is also a record authority's or the domain administrator's; a freeze
 * is the domain administrator's, the collection manager's, a knowledge owner's or a data steward's; nothing on a closed case.
 */
export function consumerActs(c: ClosureConsumer, me: CaseActor, caseClosed: boolean): Record<ConsumerAct, ActAvailability> {
  const no = (reason: string): ActAvailability => ({ enabled: false, reason });
  const yes: ActAvailability = { enabled: true, reason: null };
  const has = (...r: string[]) => r.some((x) => me.roles.includes(x));
  if (caseClosed) { const r = no('the case is closed; its record never changes'); return { acknowledge: r, recompute: r, except: r, freeze: r }; }
  if (!c.material) { const r = no('the product is current — it already reflects the correction'); return { acknowledge: r, recompute: r, except: r, freeze: r }; }
  const ownerMine = c.owner !== null && c.owner === me.principalId;
  const closer = (extra: readonly string[]): ActAvailability => {
    if (c.class === 'human_review' && me.appliedBy !== null && me.principalId === me.appliedBy) return no('separation of duties: the correction authority who applied the case never acknowledges a human review — its owner decides');
    if (ownerMine) return yes;
    if (c.owner === null) return has('knowledge_owner', 'domain_admin', ...extra) ? yes : no('no active owner is recorded: a knowledge owner or the domain administrator closes it');
    return extra.length > 0 && has(...extra) ? yes : no(`its owner (${c.owner.slice(0, 8)}…) closes it`);
  };
  const closed = ['acknowledged', 'recomputed', 'delivered', 'current'].includes(String(c.state));
  const ackBase = closed ? no(`it is already ${consumerStateWord(String(c.state)).label}`) : null;
  const acknowledge = ackBase ?? (c.consumer_kind === 'subscription' && c.state !== 'failed' ? no('the subscription\'s own ledger acknowledges an applied delivery; a person acknowledges a failed one') : closer(c.consumer_kind === 'subscription' ? ['domain_admin'] : []));
  const recompute = ackBase ?? (c.consumer_kind === 'subscription' ? no('a subscription consumer is acknowledged or excepted, never recomputed')
    : c.class === 'human_review' ? no('a person\'s decision or commitment is reviewed by its owner, never recomputed (no automatic rewrite)') : closer([]));
  const except = closed || c.state === 'bounded_exception' ? no(`it is already ${consumerStateWord(String(c.state)).label}`) : closer(['record_authority', 'domain_admin']);
  const freeze = c.consumer_kind !== 'affected_product' ? no('only an affected product is frozen')
    : c.closing ? no('its consumer is closed') : c.frozen ? no('it is already frozen')
    : has('domain_admin', 'collection_manager', 'knowledge_owner', 'data_steward') ? yes : no('a freeze is the domain administrator\'s, the collection manager\'s, a knowledge owner\'s or a data steward\'s act');
  return { acknowledge, recompute, except, freeze };
}

/** The close: the SERVER's readiness reasons, plus the page's own conditions (the projection check read, the authority). Never inferred. */
export function closeReadiness(read: { readiness?: { ready?: unknown; reasons?: unknown; projections_checked?: unknown } | null; closure?: Row | null; tracked?: unknown }, me: CaseActor): { enabled: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (read.tracked !== true) reasons.push('the case has no closure record — it was applied before B50; adopt it first');
  if (read.closure !== null && read.closure !== undefined && read.closure['state'] === 'closed') reasons.push('the case is closed');
  if (!me.roles.includes('collection_manager') && !me.roles.includes('domain_admin')) reasons.push('a case is closed by the correction authority (collection manager) or the domain administrator');
  const r = read.readiness ?? null;
  for (const x of Array.isArray(r?.reasons) ? (r!.reasons as unknown[]) : []) reasons.push(String(x));
  if (r?.projections_checked !== true) reasons.push('run the projection check in this read first (the close re-checks it in its own write)');
  if (r?.ready !== true && reasons.length === 0) reasons.push('the server has not answered that the case is ready');
  return { enabled: reasons.length === 0, reasons };
}

/** The closure record's summary in words (from the record the server wrote; nothing recounted here). */
export function closureSummary(rec: Pick<ClosureRecord, 'reachedConsumers' | 'failedDeliveries' | 'residualExposure' | 'acknowledgements' | 'projectionsReconciled' | 'auditDigest'>): string {
  return `${rec.reachedConsumers} consumer(s) reached · ${rec.failedDeliveries.length} failed deliver${rec.failedDeliveries.length === 1 ? 'y' : 'ies'} · `
    + `${rec.residualExposure.length} under a bounded exception (residual exposure) · ${rec.acknowledgements.length} act(s) recorded · `
    + `projections ${rec.projectionsReconciled ? 'reconciled' : 'NOT reconciled'} · audit digest ${rec.auditDigest.slice(0, 12)}…`;
}

/** The ClosureRecord seam of the server's record (graph.correction_closures.record + its digest), or null when the case is not closed. */
export function toClosureRecord(closure: Row | null | undefined, record: Row | null | undefined): ClosureRecord | null {
  if (closure === null || closure === undefined || closure['state'] !== 'closed' || record === null || record === undefined) return null;
  const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
  return {
    closureId: String(record['closure_id']), caseId: String(record['case_id']), closedBy: String(record['closed_by']), closedAt: String(record['closed_at']),
    reachedConsumers: Number(record['reached_consumers'] ?? 0),
    failedDeliveries: arr(record['failed_deliveries']).map((f) => ({ ref: String(f['ref']), failureClass: String(f['failure'] ?? 'failed') })),
    residualExposure: arr(record['residual_exposure']).map((x) => {
      const e = (x['exception'] ?? null) as Row | null;
      return { ref: String(x['ref']), class: String(x['class']) as AffectedClass, exception: e === null ? null : { reason: String(e['reason']), expiresAt: String(e['expires_at']), owner: String(e['owner']) } };
    }),
    acknowledgements: arr(record['acknowledgements']).map((a) => ({
      ackId: String(a['ack_id']), caseId: String(record['case_id']), consumer: { kind: (a['consumer_kind'] === 'subscription' ? 'subscription' : 'affected_product') as 'subscription' | 'affected_product', ref: String(a['consumer_ref']) },
      state: String(a['state']) as ConsumerAckState, by: a['by'] === null ? null : String(a['by']), at: a['at'] === null ? null : String(a['at']),
      exception: a['exception'] === null || a['exception'] === undefined ? null : { reason: String((a['exception'] as Row)['reason']), expiresAt: String((a['exception'] as Row)['expires_at']), owner: String((a['exception'] as Row)['owner']) },
    })),
    projectionsReconciled: ((record['projections'] ?? {}) as Row)['reconciled'] === true, auditDigest: String(closure['audit_digest'] ?? ''),
  };
}

/** The correction impact NOTICE (HX-18): the original, the correction, the affected products, the decisions, the required review, the closure — in order. */
export function noticeSections(notice: Row | null | undefined): Array<{ key: string; heading: string; items: string[] }> {
  if (notice === null || notice === undefined) return [];
  const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
  const corr = (notice['correction'] ?? {}) as Row;
  const clo = (notice['closure'] ?? {}) as Row;
  return [
    { key: 'original', heading: 'The original', items: arr(notice['original']).map((o) => `${String(o['object_id'])}: version ${String(o['from_version'] ?? '?')} superseded by ${String(o['to_version'] ?? '?')}`) },
    { key: 'correction', heading: 'The correction', items: [`${String(corr['kind'] ?? 'correction')}: ${String(corr['reason'] ?? '')}`, `received ${String(corr['received_at'] ?? '—')}; applied ${String(corr['applied_at'] ?? '—')}`] },
    { key: 'affected', heading: 'The affected products', items: arr(notice['affected_products']).map((p) => `${String(p['title'] ?? p['ref'])} — ${String(p['class'])}, ${consumerStateWord(String(p['state'])).label}${p['frozen'] === true ? ', FROZEN' : ''}`) },
    { key: 'decisions', heading: 'The decisions', items: arr(notice['decisions']).map((p) => `${String(p['title'] ?? p['ref'])} — ${consumerStateWord(String(p['state'])).label}`) },
    { key: 'review', heading: 'The required review', items: arr(notice['required_review']).map((p) => `${String(p['title'] ?? p['ref'])}: its owner's review, ${consumerStateWord(String(p['state'])).label}`) },
    { key: 'closure', heading: 'The closure', items: [clo['state'] === 'closed' ? `closed ${String(clo['closed_at'])} — audit digest ${String(clo['audit_digest'] ?? '').slice(0, 12)}…` : clo['state'] === 'not_tracked' ? 'not tracked: applied before B50 (adopt it to track)' : `open (${String(clo['state'] ?? 'open')}) — it closes when every material consumer is owned`] },
  ];
}

/** The closure state of a case in words, for the corrections list (an applied case is never shown closed by its apply). */
export function closureStateWords(state: string): string {
  switch (state) {
    case 'open': return 'open — the propagation closes when every material consumer is owned';
    case 'stalled': return 'STALLED — a consumer is past its window or failed; its products are frozen';
    case 'closed': return 'closed — the closure record is written';
    case 'not_tracked': return 'not tracked — applied before B50 (adopt it to track its closure)';
    default: return state;
  }
}

/** The case acts' PDP names (graph.closure.*) — what each Command Review binds. */
export const CLOSURE_ACTIONS = {
  acknowledge: 'graph.closure.acknowledge', recompute: 'graph.closure.acknowledge', except: 'graph.closure.except', freeze: 'graph.closure.freeze',
  lift: 'graph.closure.freeze.lift', close: 'graph.closure.close', adopt: 'graph.closure.adopt', sweep: 'graph.closure.sweep',
} as const;
export type ClosureActKey = keyof typeof CLOSURE_ACTIONS;

/** The stated consequence of each act (the command catalogue's words; no server preview exists for these acts — the server decides on the act). */
export function actConsequence(act: ClosureActKey, subject: string): ConsequenceView {
  const base = { users: ['the consumer\'s owner', 'the correction authority'], audit: 'recorded on the case\'s closure ledger and the audit chain with your name', source: 'stated' as const, blockers: [] };
  switch (act) {
    case 'acknowledge': return { ...base, effect: `${subject} is recorded acknowledged: its owner reviewed it — nothing is rewritten`, affected: [subject], reversibility: 'append-only: a later act supersedes it; the acknowledgement stays recorded', residualRisk: 'none beyond the owner\'s judgement' };
    case 'recompute': return { ...base, effect: `${subject} is recorded recomputed, naming its re-run record`, affected: [subject], reversibility: 'append-only: the act stays recorded', residualRisk: 'the re-run record must exist and post-date the correction (the server checks)' };
    case 'except': return { ...base, effect: `${subject} is closed by a BOUNDED EXCEPTION until its expiry: residual exposure, owned by the named person`, affected: [subject], reversibility: 'it lapses at its expiry and the consumer is open again; the exception stays recorded', residualRisk: 'the product still rests on the corrected input until it is reconciled' };
    case 'freeze': return { ...base, effect: `${subject} is FROZEN: its publication, delivery and export are refused while the case is open`, affected: [subject], reversibility: 'lifted when its consumer is owned or the case closes; the freeze stays recorded', residualRisk: 'publication of what cites it waits' };
    case 'lift': return { ...base, effect: `the freeze on ${subject} is lifted before the case closes`, affected: [subject], reversibility: 'the lift stays recorded; the server refuses it while what it guards is unresolved', residualRisk: 'publication of the product is possible again' };
    case 'close': return { ...base, effect: `correction case ${subject} is CLOSED: the closure record is written with its audit digest, its freezes lift, its stall items close`, affected: [subject], reversibility: 'cannot be undone — the closure record never changes; the case and its history are kept', residualRisk: 'any bounded exception stays residual exposure until it expires' };
    case 'adopt': return { ...base, effect: `correction case ${subject} (applied before B50) gets a closure record; its windows run from its apply instant`, affected: [subject], reversibility: 'the adoption stays recorded; the record is closed only by the close', residualRisk: 'consumers already past their windows stall the case at the next sweep, and its open products freeze' };
    default: return { ...base, effect: 'the domain\'s open cases are swept now on the database clock: overdue or failed consumers stall their case, its open products freeze and their owners are paged', affected: ['the domain\'s open correction cases'], reversibility: 'every freeze and item stays recorded; they lift and close with the case', residualRisk: 'none beyond the declared contract' };
  }
}
