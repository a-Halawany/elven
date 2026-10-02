/**
 * THE REMEDIATION WORKFLOW ON SOURCE COVERAGE LOSS — CP-6 B28 (0088 §R; the B24 carryover (a)).
 *
 *   list       the remediations of ONE source (the open one first, then the latest), each with its ledger, and the source's health
 *              now (with its basis) — `observation.coverage_remediation.read`;
 *   open       from a source.coverage_loss item: its owner or a collection manager opens it, naming the OWNER (an active human
 *              holding collection_manager or domain_admin; the opener when none is named) and why; refused while the source is
 *              healthy, and while another remediation of the source is open;
 *   step       fallback_source (an active, healthy source of the domain) | recollect (NAMES a collection run of this source started
 *              since the opening — the operator triggers it through the existing collection path, POST …/sources/:id/collect; the
 *              remediation never starts or schedules one) | accept_gap (a reason, recorded by a SECOND person — never the owner —
 *              holding collection_manager or domain_admin);
 *   close      recovered (only while the source is healthy now) | gap_accepted (only through a recorded accept_gap step);
 *   withdraw   with a reason.
 *
 * The ports judge every rule and refuse in their own words (`coverage remediation rejected (<class>): …`); this service checks only
 * the request's own shape and that the remediation named in the path is the path source's (a remediation of another source answers
 * as absent). The automatic closure on recovery is the source-health subscriber's (observation.mark_source_impact). Stateless.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { ScopeContext } from '../../shared/scope.js';
import { newId } from '../../shared/ids.js';
import type { CoverageRemediationReads, CoverageRemediationWrites, HealthNow, RemediationAnswer } from './coverage-remediation.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The remediation's states (the table's CHECK); the first two are OPEN (one per source). */
export const REMEDIATION_STATES = ['open', 'in_progress', 'closed_recovered', 'closed_gap_accepted', 'withdrawn'] as const;
/** The steps a remediation records. */
export const STEP_KINDS = ['fallback_source', 'recollect', 'accept_gap'] as const;
/** How a remediation closes (a withdrawal is its own act). */
export const CLOSURE_KINDS = ['recovered', 'gap_accepted'] as const;
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null);
const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const absent = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_STA_001', correlationId, msg), 404); };
const uuidOrNull = (v: unknown, correlationId: string, what: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) bad(correlationId, `${what}, when given, is an id`);
  return v as string;
};

/** One remediation as the list serves it: the row, the source named, and its ledger. */
export interface RemediationView {
  remediation_id: string; source_id: string; item_id: string; owner_principal_id: string; opened_by: string; state: string;
  health_at_opening: Row; gap_from: string | null; gap_to: string | null; gap: Row; steps: Row[]; closure: Row | null; reason: string;
  opened_at: string | null; updated_at: string | null; closed_at: string | null;
  events: Array<{ event_id: string; event: string; actor_principal_id: string; details: Row; occurred_at: string | null }>;
}
export interface SourceRemediations { source_id: string; source_name: string | null; source_key: string | null; health_now: HealthNow; remediations: RemediationView[] }

export interface OpenIntake { itemId?: unknown; owner?: unknown; reason?: unknown }
export interface StepIntake { kind?: unknown; fallbackSourceId?: unknown; runId?: unknown; reason?: unknown }
export interface CloseIntake { kind?: unknown; note?: unknown }
export interface WithdrawIntake { reason?: unknown }
export interface ListFilter { state?: unknown; limit?: unknown }

@Injectable()
export class CoverageRemediationService {
  /** The remediations of one source with their ledgers and the source's health now. */
  async list(cap: CoverageRemediationReads, ctx: ScopeContext, sourceId: string, filter: ListFilter, correlationId: string): Promise<SourceRemediations> {
    if (!UUID.test(sourceId)) bad(correlationId, 'the source id is not a source id');
    const state = filter.state === undefined || filter.state === null || filter.state === '' ? 'all' : filter.state;
    if (state !== 'all' && state !== 'open' && !(REMEDIATION_STATES as readonly unknown[]).includes(state)) bad(correlationId, `state is all, open or one of ${REMEDIATION_STATES.join(', ')}`);
    const limit = typeof filter.limit === 'number' && Number.isInteger(filter.limit) && filter.limit >= 1 && filter.limit <= 200 ? filter.limit : 50;
    const contract = ((await cap.readSourceContracts().select(['source_id', 'name', 'source_key'] as never).where('source_id' as never, '=', sourceId as never)
      .orderBy('contract_version' as never, 'desc').limit(1).execute()) as Row[])[0];
    if (contract === undefined) absent(correlationId, 'no authorized source matches');
    let q = cap.readRemediations().selectAll().where('source_id' as never, '=', sourceId as never).orderBy('opened_at' as never, 'desc').orderBy('remediation_id' as never).limit(limit);
    if (state === 'open') q = q.where('state' as never, 'in', ['open', 'in_progress'] as never);
    else if (state !== 'all') q = q.where('state' as never, '=', state as never);
    const rows = (await q.execute()) as Row[];
    const ids = rows.map((r) => String(r['remediation_id']));
    const events = ids.length === 0 ? [] : ((await cap.readRemediationEvents().selectAll().where('remediation_id' as never, 'in', ids as never)
      .orderBy('occurred_at' as never).orderBy('event_id' as never).execute()) as Row[]);
    const remediations = rows.map((r) => this.view(r, events.filter((e) => String(e['remediation_id']) === String(r['remediation_id']))));
    // the open one first (one per source), then the latest
    remediations.sort((a, b) => Number(b.state === 'open' || b.state === 'in_progress') - Number(a.state === 'open' || a.state === 'in_progress'));
    return { source_id: sourceId, source_name: String((contract as Row)['name']), source_key: String((contract as Row)['source_key']),
             health_now: await cap.healthNow({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, sourceId }), remediations };
  }

  /** Open from a source.coverage_loss item; the owner defaults to the opener. The port judges the item, the people and the source's health. */
  async open(cap: CoverageRemediationWrites, ctx: ScopeContext, sourceId: string, intake: OpenIntake, actor: string, correlationId: string): Promise<RemediationAnswer> {
    if (!UUID.test(sourceId)) bad(correlationId, 'the source id is not a source id');
    if (typeof intake.itemId !== 'string' || !UUID.test(intake.itemId)) bad(correlationId, 'itemId is the source.coverage_loss attention item the remediation answers');
    const owner = uuidOrNull(intake.owner, correlationId, 'owner') ?? actor;
    return cap.openRemediation({ remediationId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, sourceId, itemId: intake.itemId as string, owner,
      reason: typeof intake.reason === 'string' ? intake.reason : null, actor, eventId: newId(), correlationId });
  }

  async step(cap: CoverageRemediationWrites, ctx: ScopeContext, sourceId: string, remediationId: string, intake: StepIntake, actor: string, correlationId: string): Promise<RemediationAnswer> {
    await this.ofSource(cap, sourceId, remediationId, correlationId);
    if (typeof intake.kind !== 'string' || !(STEP_KINDS as readonly string[]).includes(intake.kind)) bad(correlationId, `kind is one of ${STEP_KINDS.join(', ')}`);
    return cap.addStep({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, remediationId, kind: intake.kind as string,
      fallbackSourceId: uuidOrNull(intake.fallbackSourceId, correlationId, 'fallbackSourceId'), runId: uuidOrNull(intake.runId, correlationId, 'runId'),
      reason: typeof intake.reason === 'string' ? intake.reason : null, actor, eventId: newId(), correlationId });
  }

  async close(cap: CoverageRemediationWrites, ctx: ScopeContext, sourceId: string, remediationId: string, intake: CloseIntake, actor: string, correlationId: string): Promise<RemediationAnswer> {
    await this.ofSource(cap, sourceId, remediationId, correlationId);
    if (typeof intake.kind !== 'string' || !(CLOSURE_KINDS as readonly string[]).includes(intake.kind)) bad(correlationId, `kind is one of ${CLOSURE_KINDS.join(', ')}`);
    if (intake.note !== undefined && intake.note !== null && typeof intake.note !== 'string') bad(correlationId, 'note, when given, is text');
    return cap.closeRemediation({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, remediationId, kind: intake.kind as string,
      note: typeof intake.note === 'string' ? intake.note : null, actor, eventId: newId(), correlationId });
  }

  async withdraw(cap: CoverageRemediationWrites, ctx: ScopeContext, sourceId: string, remediationId: string, intake: WithdrawIntake, actor: string, correlationId: string): Promise<RemediationAnswer> {
    await this.ofSource(cap, sourceId, remediationId, correlationId);
    return cap.withdrawRemediation({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, remediationId,
      reason: typeof intake.reason === 'string' ? intake.reason : null, actor, eventId: newId(), correlationId });
  }

  /** The remediation named in the path is the path source's (read under RLS); another source's, or none, answers as absent. */
  private async ofSource(cap: CoverageRemediationReads, sourceId: string, remediationId: string, correlationId: string): Promise<void> {
    if (!UUID.test(sourceId) || !UUID.test(remediationId)) bad(correlationId, 'the source id and the remediation id are ids');
    const r = (await cap.readRemediations().select(['remediation_id', 'source_id'] as never).where('remediation_id' as never, '=', remediationId as never).executeTakeFirst()) as Row | undefined;
    if (r === undefined || String(r['source_id']) !== sourceId) absent(correlationId, `coverage remediation rejected (unknown_remediation): no coverage remediation ${remediationId} of source ${sourceId} in this domain`);
  }

  private view(r: Row, events: Row[]): RemediationView {
    return {
      remediation_id: String(r['remediation_id']), source_id: String(r['source_id']), item_id: String(r['item_id']), owner_principal_id: String(r['owner_principal_id']),
      opened_by: String(r['opened_by']), state: String(r['state']), health_at_opening: (r['health_at_opening'] ?? {}) as Row, gap_from: iso(r['gap_from']), gap_to: iso(r['gap_to']),
      gap: (r['gap'] ?? {}) as Row, steps: Array.isArray(r['steps']) ? (r['steps'] as Row[]) : [], closure: (r['closure'] ?? null) as Row | null, reason: String(r['reason']),
      opened_at: iso(r['opened_at']), updated_at: iso(r['updated_at']), closed_at: iso(r['closed_at']),
      events: events.map((e) => ({ event_id: String(e['event_id']), event: String(e['event']), actor_principal_id: String(e['actor_principal_id']), details: (e['details'] ?? {}) as Row, occurred_at: iso(e['occurred_at']) })),
    };
  }
}
