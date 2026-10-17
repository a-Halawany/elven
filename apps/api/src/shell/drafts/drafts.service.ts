/**
 * B80 §CL-F (0118_b80_x_clf; PAT-03, UX-21-002/-003) — THE FORM DRAFT SERVICE: the pipeline's governed write for a save and a discard
 * (`shell.draft.save`, `shell.draft.discard` — human-gated at the PEP, the port re-checks the named human) and its audited read for one draft
 * and the drafts list (`shell.draft.read`). A draft is the principal's own work in progress: it is NEVER a submission — the form's act
 * (registering a source, declaring a decision package…) is its own governed write, made by the form, with its own receipt.
 *
 * THREE CLAIMS: construction (this code and phase6-drafts-b80.test.ts, every persona SYNTHETIC); demonstrated operation (the act);
 * real acceptance (UX-21-006: the shared recording path at B111, then H3) — never claimed.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { DraftCapability, type DraftDiscard, type DraftSave } from './drafts.capabilities.js';

type Row = Record<string, unknown>;
export const DRAFT_ACTIONS = { save: 'shell.draft.save', discard: 'shell.draft.discard', read: 'shell.draft.read' } as const;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const route = (tenantId: string, domainId: string, action: string, objectId: string | null): RouteInfo =>
  ({ scope: 'DOMAIN', tenantId, domainId, action, objectType: 'SDR', objectId });
/** The route's own envelope: the action, the object and the side-effect class are the route's, never the client's. */
const derive = (base: Envelope, action: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: 'SDR', object_id: objectId, side_effect_class: action === DRAFT_ACTIONS.read ? 'none' : 'reversible', message_id: newId() }) as Envelope;

/** The class of a port's refusal `form draft rejected (<class>): …` → its HTTP answer, in the PORT's words (403 actor · 404 unknown_* · 409
 *  stale|state|expired · 422 the rest). The noun is not yet in the central rows (observation-errors.ts — the integrator's); this keeps the
 *  route honest meanwhile and agrees with them once they exist. Anything else is re-thrown untouched. */
export function asDraftRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException || !(e instanceof Error)) return e;
  const m = /^form draft rejected \(([a-z_]+)\)/.exec(e.message);
  if (m === null) return e;
  const cls = m[1]!;
  const status = cls === 'actor' ? 403 : cls.startsWith('unknown_') ? 404 : ['stale', 'state', 'expired'].includes(cls) ? 409 : 422;
  const code = status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001';
  return new HttpException(errorBody(code as never, correlationId, e.message), status);
}
const mapped = async <T>(env: Envelope, f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { throw asDraftRefusal(e, env.correlation_id); } };

@Injectable()
export class DraftsService {
  constructor(private readonly pipeline: PipelineService) {}

  async read(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, a: { formKey: string | null; subjectKey: string | null; draftId: string | null }) {
    const out = await mapped(env, () => this.pipeline.consequentialRead(derive(env, DRAFT_ACTIONS.read, a.draftId), p, route(t, d, DRAFT_ACTIONS.read, a.draftId), DraftCapability.read,
      async (cap) => cap.read({ tenantId: t, domainId: d, ...a })));
    return { draft: out.result, receipt: receipt(out) };
  }

  async list(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, formKey: string | null) {
    const out = await mapped(env, () => this.pipeline.consequentialRead(derive(env, DRAFT_ACTIONS.read, null), p, route(t, d, DRAFT_ACTIONS.read, null), DraftCapability.read,
      async (cap) => cap.list({ formKey })));
    return { drafts: out.result, receipt: receipt(out) };
  }

  async save(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, a: Omit<DraftSave, 'tenantId' | 'domainId' | 'correlationId'>) {
    const out = await mapped(env, () => this.pipeline.write(derive(env, DRAFT_ACTIONS.save, null), p, route(t, d, DRAFT_ACTIONS.save, null), DraftCapability.write, async (cap) => {
      const r: Row = await cap.save({ ...a, tenantId: t, domainId: d, correlationId: env.correlation_id });
      return { result: r, targetType: 'SDR', targetId: String(r['draft_id']), targetVersion: String(r['version']), outboxEvent: null };
    }));
    return { draft: out.result, receipt: receipt(out) };
  }

  async discard(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, a: Omit<DraftDiscard, 'tenantId' | 'domainId' | 'correlationId'>) {
    const out = await mapped(env, () => this.pipeline.write(derive(env, DRAFT_ACTIONS.discard, a.draftId), p, route(t, d, DRAFT_ACTIONS.discard, a.draftId), DraftCapability.write, async (cap) => {
      const r: Row = await cap.discard({ ...a, tenantId: t, domainId: d, correlationId: env.correlation_id });
      return { result: r, targetType: 'SDR', targetId: a.draftId, targetVersion: String(r['version']), outboxEvent: null };
    }));
    return { draft: out.result, receipt: receipt(out) };
  }
}
