/**
 * B80 §CB (0118 §CB) — THE OPERATING CONTEXT BAR's service: the intakes (pure, exported for the unit test) and the shaping of the reads.
 * The service decides nothing a port decides: the ports compare the acting principal, the human, the role, the staleness, the basis and the
 * impact digest; the PDP admits the roles (every human domain role sets a context — DESIGN D3). Refusals in the server's words, the class
 * form `context rejected (<class>): …` (B36 home's rows map the noun: actor 403, stale 409, the rest 422).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { ContextReads, ContextWrites, ProposedContext } from './context.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
export const CONTEXT_HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CONTEXT_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const MAX_INVALIDATED = 200;

const bad = (correlationId: string, cls: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, `context rejected (${cls}): ${m}`), 422); };
const idOrNull = (v: unknown, name: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) bad(correlationId, name, `${name} must be an id or null`);
  return v as string;
};

/** The proposed context — every dimension stated (no default is guessed for the person: the horizon and the ceiling are chosen). */
export function validateProposed(p: Row, correlationId: string): ProposedContext {
  const horizon = p['horizon'];
  if (typeof horizon !== 'string' || !(CONTEXT_HORIZONS as readonly string[]).includes(horizon)) bad(correlationId, 'horizon', `the horizon is one of ${CONTEXT_HORIZONS.join(', ')}`);
  const classification = p['classification'];
  if (typeof classification !== 'string' || !(CONTEXT_CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, 'classification', `the classification ceiling is one of ${CONTEXT_CLASSIFICATIONS.join(', ')}`);
  const eff = p['effectiveAt'];
  let effectiveAt: string | null = null;
  if (eff !== undefined && eff !== null && eff !== '') {
    if (typeof eff !== 'string' || Number.isNaN(Date.parse(eff))) bad(correlationId, 'effective_at', 'the effective time is an instant or null (live)');
    effectiveAt = new Date(eff as string).toISOString();
  }
  return { objectiveId: idOrNull(p['objectiveId'], 'objective', correlationId), horizon: horizon as string, scenarioId: idOrNull(p['scenarioId'], 'scenario', correlationId),
           classification: classification as string, effectiveAt };
}

export interface CommitIntake { proposed: ProposedContext; basisContextId: string | null; impactDigest: string; invalidated: string[] }
/** The commit names the preview it was decided on: the basis (the context the preview was computed over, null when none was set) and its digest. */
export function validateCommit(p: Row, correlationId: string): CommitIntake {
  const proposed = validateProposed(p, correlationId);
  if (!Object.prototype.hasOwnProperty.call(p, 'basisContextId')) bad(correlationId, 'preview', 'a context is committed only from its impact preview — basisContextId (null when no context was set) is required');
  const basisContextId = idOrNull(p['basisContextId'], 'basis', correlationId);
  const impactDigest = p['impactDigest'];
  if (typeof impactDigest !== 'string' || !HEX64.test(impactDigest)) bad(correlationId, 'preview', 'a context is committed only from its impact preview — the impact digest is required');
  const inv = p['invalidated'] ?? [];
  if (!Array.isArray(inv) || inv.length > MAX_INVALIDATED || inv.some((k) => typeof k !== 'string' || k.length < 1 || k.length > 200)) {
    bad(correlationId, 'previews', `the invalidated previews are a list of at most ${MAX_INVALIDATED} keys of 1–200 characters`);
  }
  return { proposed, basisContextId, impactDigest: impactDigest as string, invalidated: inv as string[] };
}

@Injectable()
export class ContextBarService {
  /** The bar's read with the policy bundle in force (the policy dimension) and the dimensions this read cannot honour stated. */
  async bar(cap: ContextReads, a: { tenantId: string; domainId: string; principalId: string; policyVersion: string }): Promise<Row> {
    const b = await cap.bar({ tenantId: a.tenantId, domainId: a.domainId, principalId: a.principalId });
    return { ...b, policy: { bundle: a.policyVersion } };
  }
  impact(cap: ContextReads, a: { tenantId: string; domainId: string; principalId: string; proposed: ProposedContext }): Promise<Row> {
    return cap.impact(a);
  }
  commit(cap: ContextWrites, a: { contextId: string; tenantId: string; domainId: string; intake: CommitIntake; actor: string; correlationId: string }): Promise<Row> {
    return cap.commit({ contextId: a.contextId, tenantId: a.tenantId, domainId: a.domainId, proposed: a.intake.proposed, basisContextId: a.intake.basisContextId,
                        impactDigest: a.intake.impactDigest, invalidated: a.intake.invalidated, actor: a.actor, correlationId: a.correlationId });
  }
}
