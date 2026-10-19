/**
 * CP-6 B50 §PV (0120_b50_x_pv) — PROVENANCE, EXPLANATION, UNFIT MARKING AND THE CONTEST PATH: the routes' intake (what the database cannot be
 * handed without it — the fields present and typed), the answers mapped onto the seams (ExplainNode, ProductFitness — b50-seams.ts), and the
 * PROVENANCE AGENT (AG-014): its identity is the CODE's (version and code digest), its registration the two governed writes every agent
 * registration makes (the principal on the identity authority; the grant on the commit authority), its run a person's TRIGGER (audited under
 * graph.provenance.agent.trigger) followed by the agent's OWN act under its OWN session (graph.provenance.construct — 0060's shape).
 *
 * Everything the answer says is the port's: nothing here computes a verdict, an outcome or a boundary. THREE CLAIMS: construction (this
 * module and phase6-provenance-b50); demonstrated operation (the act, SYNTHETIC); real acceptance — never claimed.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { Db } from '../../shared/db.js';
import { IDENTITY_DB } from '../../shared/shared.module.js';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { IdentityService } from '../../identity/identity.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import type { ExplainNode, ExplainNodeKind, ExplainNodeOutcome, FitnessVerdict, ProductFitness } from '../../objects/b50-seams.js';
import { ProvenanceCapability } from './provenance.capabilities.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[A-Z]{3}$/;

/* ── THE AGENT'S IDENTITY (the code's; a changed surface is a new version and a new registration) ── */
const AGENT_DESCRIPTOR = { name: 'graph.provenance-agent', version: '1.0.0', surface: 'graph.provenance_construct', closure: 'graph.pv_closure', explain: 'b50-pv-explain-1', fitness: 'b50-pv-fitness-1', model: 'none (deterministic)' };
export const PROVENANCE_AGENT = {
  name: AGENT_DESCRIPTOR.name, version: AGENT_DESCRIPTOR.version,
  codeDigest: createHash('sha256').update(JSON.stringify(AGENT_DESCRIPTOR), 'utf8').digest('hex'),
  deterministic: true as const,
};
const DEFAULT_BUDGETS = { max_depth: 12, max_nodes: 400 };

/* ── INTAKE ── */
export interface SubjectIntake { type: string; id: string; version: number }
export function subjectIntake(p: Row, correlationId: string): SubjectIntake {
  const type = p['type']; const id = p['id']; const version = p['version'];
  if (typeof type !== 'string' || !TYPE_RE.test(type)) bad(correlationId, 'type is the object type (three capitals, e.g. CLM, FCT, BRF)');
  if (typeof id !== 'string' || !UUID_RE.test(id)) bad(correlationId, 'id is the object id (a uuid)');
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) bad(correlationId, 'version is the object version (an integer of 1 or more)');
  return { type: type as string, id: (id as string).toLowerCase(), version: version as number };
}
export function diffIntake(p: Row, correlationId: string): { type: string; id: string; from: number; to: number } {
  const s = subjectIntake({ ...p, version: p['to'] }, correlationId);
  const from = p['from'];
  if (typeof from !== 'number' || !Number.isSafeInteger(from) || from < 1) bad(correlationId, 'from is the earlier version (an integer of 1 or more)');
  return { type: s.type, id: s.id, from: from as number, to: s.version };
}
export function graphDiffIntake(p: Row, correlationId: string): { from: number; to: number } {
  const from = p['from']; const to = p['to'];
  if (typeof from !== 'number' || !Number.isSafeInteger(from) || from < 0) bad(correlationId, 'from is the earlier graph revision (an integer of 0 or more)');
  if (typeof to !== 'number' || !Number.isSafeInteger(to) || to < 1) bad(correlationId, 'to is the later graph revision (an integer of 1 or more)');
  return { from: from as number, to: to as number };
}
export function alignmentIntake(p: Row, correlationId: string): { kind: string; id: string; version: number | null } {
  const kind = p['kind']; const id = p['id']; const version = p['version'] ?? null;
  if (kind !== 'briefing' && kind !== 'publication' && kind !== 'export') bad(correlationId, "kind is 'briefing', 'publication' or 'export'");
  if (typeof id !== 'string' || !UUID_RE.test(id)) bad(correlationId, 'id is the briefing, publication or export action id (a uuid)');
  if (version !== null && (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)) bad(correlationId, 'version, when given, is the publication version (an integer of 1 or more)');
  return { kind: kind as string, id: (id as string).toLowerCase(), version: version as number | null };
}
export function text(p: Row, key: string, min: number, max: number, correlationId: string, what: string): string {
  const v = p[key];
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) bad(correlationId, `${key} is ${what} (${min} to ${max} characters)`);
  return (v as string).trim();
}
export function optionalUuid(p: Row, key: string, correlationId: string): string | null {
  const v = p[key];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) bad(correlationId, `${key}, when given, is a uuid`);
  return (v as string).toLowerCase();
}

/* ── THE ANSWERS ON THE SEAMS ── */
const KINDS: readonly ExplainNodeKind[] = ['source', 'evidence', 'claim', 'method', 'model_call', 'agent_run', 'review', 'approval', 'signature', 'policy_decision', 'workflow', 'human_action', 'correction', 'product'];
const OUTCOMES: readonly ExplainNodeOutcome[] = ['ok', 'denied', 'abstained', 'challenged', 'overridden', 'corrected', 'failed', 'unresolved'];
type Boundary = NonNullable<ExplainNode['boundary']>;
const BOUNDARIES: readonly Boundary[] = ['synchronous', 'event', 'workflow', 'agent', 'model', 'human', 'tool'];

/** One port node onto the seam's ExplainNode (camelCase); an unknown kind or outcome is a fault of the port, never re-labelled here. */
export function toExplainNode(n: Row): ExplainNode & { depth?: number; digest?: string; classification?: string } {
  const kind = String(n['kind']) as ExplainNodeKind; const outcome = String(n['outcome']) as ExplainNodeOutcome;
  if (!KINDS.includes(kind)) throw new Error(`graph.explain answered an unknown node kind ${kind}`);
  if (!OUTCOMES.includes(outcome)) throw new Error(`graph.explain answered an unknown node outcome ${outcome}`);
  const boundary = n['boundary'] === null || n['boundary'] === undefined ? undefined : String(n['boundary']) as Boundary;
  if (boundary !== undefined && !BOUNDARIES.includes(boundary)) throw new Error(`graph.explain answered an unknown boundary ${boundary}`);
  const span = n['span'] as { start?: number; end?: number } | null | undefined;
  return {
    nodeId: String(n['node_id']), kind, ref: String(n['ref']), label: String(n['label']), outcome, at: (n['at'] as string | null) ?? null, actor: (n['actor'] as string | null) ?? null,
    parents: Array.isArray(n['parents']) ? (n['parents'] as unknown[]).map(String) : [],
    span: span !== null && span !== undefined && typeof span.start === 'number' && typeof span.end === 'number' ? { start: span.start, end: span.end } : null,
    ...(boundary === undefined ? {} : { boundary }),
    ...(typeof n['depth'] === 'number' ? { depth: n['depth'] } : {}), ...(typeof n['digest'] === 'string' ? { digest: n['digest'] } : {}),
    ...(typeof n['classification'] === 'string' ? { classification: n['classification'] } : {}),
  };
}
export function toExplainView(r: Row) {
  return {
    ref: r['ref'], root: r['root'], method: r['method'], asOf: r['as_of'], product: r['product'],
    nodes: (Array.isArray(r['nodes']) ? (r['nodes'] as Row[]) : []).map(toExplainNode),
    edges: r['edges'], outcomes: r['outcomes'], boundaries: r['boundaries'], gaps: r['gaps'], truncated: r['truncated'] === true, incomplete: r['incomplete'] === true,
    examined: r['examined'], bounds: r['bounds'], carried: r['carried'], forward: r['forward'],
  };
}
type Gap = { kind: ProductFitness['reasons'][number]; ref: string; at: string; reason: string };
/** The evaluation onto ProductFitness (the gaps in words), the recorded mark beside it — never merged: the mark is what use reads. */
export function toFitnessView(r: Row) {
  const ev = (r['evaluation'] ?? {}) as Row;
  const gaps = (Array.isArray(ev['gaps']) ? ev['gaps'] : []) as Gap[];
  const evaluation: ProductFitness & { examined: number; truncated: boolean; ruleVersion: string; evaluatedAt: string; detail: Gap[] } = {
    ref: String(ev['ref']), verdict: String(ev['verdict']) as FitnessVerdict, reasons: (ev['reasons'] ?? []) as ProductFitness['reasons'],
    gaps: gaps.map((g) => `${g.kind}: ${g.reason} (at ${g.at})`), examined: Number(ev['examined'] ?? 0), truncated: ev['truncated'] === true,
    ruleVersion: String(ev['rule_version']), evaluatedAt: String(ev['evaluated_at']), detail: gaps,
  };
  return { ref: r['ref'], evaluation, mark: r['mark'] ?? null, refusesUse: r['refuses_use'] === true, history: r['history'] ?? [] };
}

@Injectable()
export class ProvenanceService {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly principals: PrincipalsService,
    private readonly identity: IdentityService,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
  ) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** REGISTER: the agent's principal (kind agent, role provenance_agent) on the identity authority, then its grant on the commit authority. */
  async registerAgent(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, p: Row) {
    const owner = p['ownerPrincipalId'];
    if (typeof owner !== 'string' || !UUID_RE.test(owner)) bad(envelope.correlation_id, 'ownerPrincipalId (the accountable human) is a uuid');
    const narrow = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 ? Math.min(v, dflt) : dflt);
    const b = (p['budgets'] ?? {}) as Row;
    const budgets = { max_depth: narrow(b['max_depth'], DEFAULT_BUDGETS.max_depth), max_nodes: narrow(b['max_nodes'], DEFAULT_BUDGETS.max_nodes) };
    const A = PROVENANCE_AGENT; const principalId = newId(); const agentId = newId();
    await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, actor,
      { scope: 'DOMAIN', tenantId, domainId, action: 'identity.principal.create', objectType: 'PRN', objectId: principalId, authority: 'identity' }, PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, { principalId, correlationId: envelope.correlation_id, kind: 'agent', scope: 'DOMAIN', tenantId, domainId,
          displayName: `agent:${A.name}@${A.version} (${A.codeDigest.slice(0, 12)})`,
          loginName: `agent-graph-provenance-${A.version}-${A.codeDigest.slice(0, 12)}-${principalId.slice(-6)}`, roleCode: 'provenance_agent' });
        return { result: { principalId }, targetType: 'PRN', targetId: principalId, targetVersion: '1', outboxEvent: null };
      });
    const out = await this.pipeline.write({ ...envelope, action: 'graph.provenance.agent.register', message_id: newId() }, actor,
      this.route(tenantId, domainId, 'graph.provenance.agent.register', 'AGT', agentId), ProvenanceCapability.agentRegistry,
      async (cap) => {
        const r = await cap.registerAgent({ agentId, tenantId, domainId, principalId, version: A.version, codeDigest: A.codeDigest, owner: owner as string, budgets,
          actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { ...r, role: 'provenance_agent', deterministic: true }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  async revokeAgent(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, agentId: string, reason: string) {
    const out = await this.pipeline.write(envelope, actor, this.route(tenantId, domainId, 'graph.provenance.agent.revoke', 'AGT', agentId), ProvenanceCapability.agentRegistry,
      async (cap) => {
        const r = await cap.revokeAgent({ agentId, tenantId, domainId, reason, actor: actor.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The agent's run session (0060 §4's shape): an identity operation; the grant, version and code digest verified by the port. */
  private async openRunSession(a: { agentId: string; tenantId: string; domainId: string; correlationId: string }): Promise<AuthenticatedPrincipal> {
    const A = PROVENANCE_AGENT; const sessionId = newId(); const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = randomBytes(32).toString('base64url');
    const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + Math.max(this.cfg['eye.identity.access_ttl_seconds'], 900) * 1000);
    let principalId: string;
    try {
      principalId = await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ principal_id: string }>`select graph.provenance_agent_session_open(${sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${A.version}, ${A.codeDigest}, ${sha(refreshToken)}, ${sha(contextKey)}, ${expiresAt}, ${familyId}::uuid) as principal_id`.execute(tx);
        const p = rows.rows[0]?.principal_id;
        if (typeof p !== 'string') throw new Error('the provenance agent session port returned no principal');
        await sql`select audit.commit_identity_event(${p}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: A.version, code_digest: A.codeDigest, assurance: 'agent_grant', family: A.name })}::jsonb)`.execute(tx);
        return p;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') {
        throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, `provenance agent rejected (authority): the grant does not open a session — ${(e as Error).message}`), 403);
      }
      throw e;
    }
    const token = await this.identity.signAccess(principalId, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) throw new Error('the provenance agent session could not be verified after issuance');
    return verified;
  }

  /**
   * RUN: a person TRIGGERS (graph.provenance.agent.trigger — the registry read under the person's context, audited); the agent then acts
   * under its OWN session through the ordinary pipeline (graph.provenance.construct) — the person's authority never flows into the agent's act.
   */
  async runAgent(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, agentId: string, s: SubjectIntake) {
    // the trigger is a person's act (the PDP's human gate, discharged here: a consequential read carries no PEP gate of its own)
    if (!(actor.kind === 'human' && (actor.assurance === 'password' || actor.assurance === 'break_glass'))) {
      throw new HttpException(errorBody('EYE_WFL_002', envelope.correlation_id, `human gate: graph.provenance.agent.trigger requires a named human principal at session assurance (principal kind ${actor.kind})`), 403);
    }
    const trigger = await this.pipeline.consequentialRead(envelope, actor, this.route(tenantId, domainId, 'graph.provenance.agent.trigger', 'AGT', agentId), ProvenanceCapability.read,
      async (cap) => cap.agentState({ tenantId, domainId }));
    const agents = (Array.isArray(trigger.result['agents']) ? trigger.result['agents'] : []) as Row[];
    const live = agents.find((x) => x['agent_id'] === agentId && x['status'] === 'active');
    if (live === undefined) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `provenance agent rejected (unknown_agent): no active provenance agent ${agentId} in this domain`), 404);
    }
    const agent = await this.openRunSession({ agentId, tenantId, domainId, correlationId: envelope.correlation_id });
    const runId = newId();
    const env = { ...envelope, message_id: newId(), principal_id: `principal:${agent.principalId}`, action: 'graph.provenance.construct', purpose_id: 'graph',
                  object_type: s.type, object_id: s.id, side_effect_class: 'reversible', consequence_class: 'C2', trace_id: 'graph-provenance-agent' } as unknown as Envelope;
    const out = await this.pipeline.write(env, agent, this.route(tenantId, domainId, 'graph.provenance.construct', s.type, s.id), ProvenanceCapability.construct,
      async (cap) => {
        const r = await cap.construct({ runId, tenantId, domainId, type: s.type, id: s.id, version: s.version, agentVersion: PROVENANCE_AGENT.version, codeDigest: PROVENANCE_AGENT.codeDigest, correlationId: envelope.correlation_id });
        return { result: r, targetType: s.type, targetId: s.id, targetVersion: String(s.version), outboxEvent: null,
                 evidence: { outcome: 'success', resultCode: 'OK', metadata: { run_id: runId, outcome: r['outcome'], gaps: Array.isArray(r['gaps']) ? (r['gaps'] as unknown[]).length : 0 } } };
      });
    return { run: out.result, agent: { agentId, principalId: agent.principalId, version: PROVENANCE_AGENT.version, codeDigest: PROVENANCE_AGENT.codeDigest },
             receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq }, trigger: { policyDecisionId: trigger.policyDecisionId, auditSeq: trigger.auditSeq } };
  }
}
