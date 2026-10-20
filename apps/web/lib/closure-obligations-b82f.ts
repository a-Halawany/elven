/**
 * B82-F cc — THE OWNER'S CORRECTION OBLIGATIONS for /observation/corrections/obligations: the affected product's owner (a decision owner, an
 * executive, an executive operator, a decision approver …) reaches the obligation they answer for WITHOUT the case page (graph.read is not
 * theirs). Pure functions over the server's answer (graph.correction_obligations, `graph.closure.obligation.read`): which acts the SERVER
 * says are open (never inferred here — the ports re-check every one at the act), the form's own unmet conditions in words, and the stall
 * escalations in words. Nothing here shows an obligation closed unless the server's row says so.
 */
import { consumerStateWord, deadlineWords } from './closure-b50';

type Row = Record<string, unknown>;
export type ObligationAct = 'acknowledge' | 'recompute' | 'except';
export const OBLIGATION_ACTS: readonly ObligationAct[] = ['acknowledge', 'recompute', 'except'];

export interface ObligationActAnswer { allowed: boolean; reason: string | null; action: string }
export interface Obligation {
  case: { case_id: string; kind: string; closure_state: string; reason: string; received_at: string | null; applied_at: string | null };
  corrected: Array<{ object_id: string; from_version: number | null; to_version: number | null }>;
  consumer_ref: string; consumer_kind: 'affected_product' | 'subscription'; product_kind: string | null; object_type: string | null;
  product_id: string | null; product_version: number | null; title: string | null; class: string | null;
  state: string; closing: boolean; deadline: string | null; overdue: boolean; frozen: boolean; as_owner: boolean; basis: string | null;
  state_digest: string;
  latest_act: { state: string; at: string; by_you: boolean; recompute_ref: string | null; exception_expires_at: string | null } | null;
  escalations: Array<{ item_id: string; state: string; due_at: string | null; escalations: number; created_at: string }>;
  acts: { acknowledge: ObligationActAnswer; recompute: ObligationActAnswer; except: ObligationActAnswer & { expires_after: string; expires_by: string; exception_max_days: number; record_authority_owner_required: boolean } };
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const isRow = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const act = (v: unknown): ObligationActAnswer | null => (isRow(v) && typeof v['allowed'] === 'boolean' ? { allowed: v['allowed'] as boolean, reason: str(v['reason']), action: String(v['action'] ?? '') } : null);

/** The server's answer as obligations; a malformed row is DROPPED and counted (said on the page), never guessed at. */
export function parseObligations(answer: unknown): { obligations: Obligation[]; dropped: number; contractVersion: number | null; asOf: string | null } {
  const rows = isRow(answer) && Array.isArray(answer['obligations']) ? (answer['obligations'] as unknown[]) : [];
  const out: Obligation[] = [];
  let dropped = 0;
  for (const r of rows) {
    const k = isRow(r) && isRow(r['case']) ? (r['case'] as Row) : null;
    const a = isRow(r) && isRow(r['acts']) ? (r['acts'] as Row) : null;
    const ack = act(a?.['acknowledge']); const rc = act(a?.['recompute']); const ex = act(a?.['except']);
    if (!isRow(r) || k === null || ack === null || rc === null || ex === null || typeof r['consumer_ref'] !== 'string' || typeof k['case_id'] !== 'string' || typeof r['state'] !== 'string' || typeof r['state_digest'] !== 'string') { dropped += 1; continue; }
    const exRow = a!['except'] as Row;
    out.push({
      case: { case_id: k['case_id'] as string, kind: String(k['kind'] ?? 'correction'), closure_state: String(k['closure_state'] ?? 'open'), reason: String(k['reason'] ?? ''), received_at: str(k['received_at']), applied_at: str(k['applied_at']) },
      corrected: (Array.isArray(r['corrected']) ? (r['corrected'] as Row[]) : []).map((c) => ({ object_id: String(c['object_id']), from_version: typeof c['from_version'] === 'number' ? (c['from_version'] as number) : null, to_version: typeof c['to_version'] === 'number' ? (c['to_version'] as number) : null })),
      consumer_ref: r['consumer_ref'] as string, consumer_kind: r['consumer_kind'] === 'subscription' ? 'subscription' : 'affected_product', product_kind: str(r['product_kind']), object_type: str(r['object_type']),
      product_id: str(r['product_id']), product_version: typeof r['product_version'] === 'number' ? (r['product_version'] as number) : null, title: str(r['title']), class: str(r['class']),
      state: r['state'] as string, closing: r['closing'] === true, deadline: str(r['deadline']), overdue: r['overdue'] === true, frozen: r['frozen'] === true, as_owner: r['as_owner'] === true, basis: str(r['basis']),
      state_digest: r['state_digest'] as string,
      latest_act: isRow(r['latest_act']) ? { state: String((r['latest_act'] as Row)['state']), at: String((r['latest_act'] as Row)['at']), by_you: (r['latest_act'] as Row)['by_you'] === true,
        recompute_ref: str((r['latest_act'] as Row)['recompute_ref']), exception_expires_at: str((r['latest_act'] as Row)['exception_expires_at']) } : null,
      escalations: (Array.isArray(r['escalations']) ? (r['escalations'] as Row[]) : []).map((e) => ({ item_id: String(e['item_id']), state: String(e['state']), due_at: str(e['due_at']), escalations: Number(e['escalations'] ?? 0), created_at: String(e['created_at']) })),
      acts: { acknowledge: ack, recompute: rc, except: { ...ex, expires_after: String(exRow['expires_after'] ?? ''), expires_by: String(exRow['expires_by'] ?? ''), exception_max_days: Number(exRow['exception_max_days'] ?? 30), record_authority_owner_required: exRow['record_authority_owner_required'] === true } },
    });
  }
  return { obligations: out, dropped, contractVersion: isRow(answer) && typeof answer['contract_version'] === 'number' ? (answer['contract_version'] as number) : null, asOf: isRow(answer) ? str(answer['as_of']) : null };
}

/** Whether the SERVER says this act is open now, and why not — the Command Review's eligibility (the port re-checks it at the act). */
export function actEligibility(o: Obligation, a: ObligationAct): { can: boolean; reason: string | null; role: null; basis: string } {
  const x = o.acts[a];
  return x.allowed ? { can: true, reason: null, role: null, basis: o.basis ?? 'the server answered that you answer for this consumer' }
    : { can: false, reason: x.reason ?? 'the server answered that this act is not open to you now', role: null, basis: 'not eligible' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The form's own unmet conditions, in words (the constraints the server answered; it re-checks them). `expiresAt` is an ISO instant or ''. */
export function obligationFormProblems(o: Obligation | null, a: ObligationAct, f: { note: string; recomputeRef: string; expiresAt: string; owner: string }): string[] {
  if (o === null) return ['choose one of your obligations'];
  const p: string[] = [];
  const text = f.note.trim();
  if (a === 'except') {
    if (text.length < 16 || text.length > 2000) p.push('state the reason the consumer cannot close now (16 to 2000 characters)');
    const t = Date.parse(f.expiresAt);
    if (f.expiresAt === '' || Number.isNaN(t)) p.push('enter the instant the exception expires');
    else if (t <= Date.parse(o.acts.except.expires_after) || t > Date.parse(o.acts.except.expires_by)) p.push(`the exception expires after now and within ${o.acts.except.exception_max_days} day(s)`);
    if (!UUID.test(f.owner.trim())) p.push('name the exception\'s owner (a principal id — yours by default)');
  } else {
    if (text.length < 8 || text.length > 2000) p.push('say what was reviewed (8 to 2000 characters)');
    if (a === 'recompute' && f.recomputeRef.trim() === '') p.push('name the re-run record (TYPE:<id>@<version>, or export_package:<id>)');
  }
  return p;
}

/** The obligation's state and deadline in words (the server's instants; the database clock decided "overdue"). */
export function obligationStateWords(o: Obligation, contractVersion: number | null): { state: string; next: string; deadline: string } {
  const w = consumerStateWord(o.state);
  return { state: `${w.glyph} ${w.label}`, next: w.next, deadline: deadlineWords(o, contractVersion) };
}

/** The stall escalations of this consumer in words (the attention items the sweep routed to its owner). */
export function escalationWords(o: Pick<Obligation, 'escalations'>): string[] {
  return o.escalations.map((e) => `stall item ${e.item_id.slice(0, 8)}… — ${e.state}${e.escalations > 0 ? `, escalated ${e.escalations} time(s)` : ''}; due ${e.due_at ?? 'not set'}`);
}

/** The latest act on the consumer in words; whose it was is said only as "yours" or "another person's". */
export function latestActWords(o: Pick<Obligation, 'latest_act'>): string {
  const l = o.latest_act;
  if (l === null) return 'no act is recorded yet';
  return `${consumerStateWord(l.state).label} at ${l.at} by ${l.by_you ? 'you' : 'another person'}${l.recompute_ref === null ? '' : ` (re-run ${l.recompute_ref})`}${l.exception_expires_at === null ? '' : ` — expires ${l.exception_expires_at}`}`;
}
