/**
 * CP-6 B50 §PV (migration 0120_b50_x_pv) — PROVENANCE, EXPLANATION, UNFIT MARKING AND THE CONTEST PATH (F-P3-03 + HX-14), on a real database
 * with the product's own routes (in process) and an ISOLATED vault (the four roots under one temporary directory, set before the boot):
 *
 *   PV1 · EXPLAIN (V03-T-194, ES-28-004, AI-06-003, AI-29-004): a claim's backward PATH — product → evidence (the byte span) → source; the
 *         extraction method, the run (agent), the model call (model, prompt, runtime), the retrieval and admission policy decisions, the review —
 *         WITH the abstained, failed, denied and challenged nodes as typed nodes; the tool boundary CARRIED (B70), translation CARRIED (B85).
 *   PV2 · EXPLAIN across the boundaries on real products: a forecast (the synchronous request, the event), a decision package version (the
 *         gate's workflow, the approvals), a run (its operator); the forward preview (options citing, constructed edges, briefings).
 *   PV3 · THE REVISION DIFF (V03-T-192): header and payload JSON-pointer changes, the correction chain, the downstream impact (recorded +
 *         preview); the graph revisions between two heads; the refusals in the class form.
 *   PV4 · THE GENERIC UNFIT (DP-23-005): the evaluation (fit only on a fully examined history), the governed MARK (the verdict is the
 *         evaluation's, routed recompute | adjudication), the hook — a package option and an export REFUSED for an unfit product, a product
 *         resting on one (through the agent's edges) refused, the publication and gate uses refused; the mark lifted by a re-evaluation; the
 *         history kept.
 *   PV5 · ALIGNMENT (AI-29-001, AI-29-003): a composed briefing; a briefing whose narrative cites a line it does not carry and an item that
 *         resolves to nothing — misaligned, and its BRF unfit (unsupported_claim); an export's evidence with its custody; translation carried.
 *   PV6 · THE CONTEST PATH (HX-14): open → under_review → upheld | dismissed | withdrawn; reviewer ≠ opener ≠ owner; evidence submission by a
 *         party; escalation only when overdue on the DATABASE clock; a decision and a run routed to their own paths; an upheld challenge enters
 *         the fitness evaluation.
 *   PV7 · THE PROVENANCE AGENT (AG-014): registered (0060's shape), triggered by a person, acting under its own session; deterministic (a second
 *         run constructs nothing new); an incomplete history REPORTED (gaps, outcome incomplete) — never concealed; revoked → refused.
 *   PV8 · CUSTODY-TRANSFER EXERCISES (DP-23-006): an evidence version ARCHIVED and RESTORED (the vault tier moves, B12) and EXPORTED (B11/B15)
 *         — the custody chain read and verified after each move; lineage closure, digest verification (a tampered lineage digest is an
 *         unverifiable artifact), model and human attribution, historical reconstruction (the earlier version as recorded).
 *   PV9 · THE SHAPE: the hook re-declared whole (STABLE, invoker, its search path, no grant); the tables FORCE RLS with no write grant; the
 *         ports definer with a fixed search path and their grants.
 *
 * Every row here is SYNTHETIC fixture data (personas D. Ivanova — analyst, the opener; K. Müller — knowledge owner, the reviewer; the
 * steward; the administrators). THREE CLAIMS: this harness is CONSTRUCTION evidence only; the act is demonstrated operation; real
 * acceptance is never claimed here. The §PV refusal nouns are not mapped centrally yet (the integrator maps them): their class and SQLSTATE
 * are asserted; §0's `object use rejected (unfit)` is mapped (409) and asserted with its status.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { ProvenanceController } from '../../src/graph/provenance/provenance.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { PROVENANCE_AGENT } from '../../src/graph/provenance/provenance.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { TERMS_CSV } from './phase5-fixtures.js';

// The ISOLATED vault of this run (uploads write evidence bytes; the archive / restore / export moves write the other roots).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b50-pv-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Node = { nodeId: string; kind: string; ref: string; label: string; outcome: string; at: string | null; actor: string | null; parents: string[]; span: { start: number; end: number } | null; boundary?: string };
type Explain = { ref: string; root: string; nodes: Node[]; edges: Row[]; outcomes: Record<string, number>; boundaries: Record<string, unknown>; gaps: Row[]; truncated: boolean; incomplete: boolean; carried: Row[]; forward: Row; product: Row };
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type Claim = { id: string; version: number; runId: string; methodId: string; evidence: Evd; digest: string };

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let pv: ProvenanceController; let retention: RetentionController;
let ivanova: AuthenticatedPrincipal; let mueller: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let rSteward: AuthenticatedPrincipal; let rAuthority: AuthenticatedPrincipal; let mueller2: AuthenticatedPrincipal;
let E1: Evd; let E2: Evd; let E3: Evd; let good: Claim; let bare: Claim; let tampered: Claim; let corr: Claim;
let agentId = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;

/** A refusal: the HTTP status the central mapping gives (null while a §PV noun is unmapped), the RAW message, the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};

/* ───────────── the routes (in process) ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, type: string | null, id: string | null) => h.req(as, action, type ?? 'PRV', id, 'graph');
const explain = async (as: AuthenticatedPrincipal, type: string, id: string, version: number) => (await pv.explain(req(as, 'graph.provenance.read', type, id), T(), D(), { payload: { type, id, version } })).explain as unknown as Explain;
const diff = (as: AuthenticatedPrincipal, payload: Row) => pv.diff(req(as, 'graph.provenance.read', String(payload['type'] ?? 'CLM'), String(payload['id'] ?? '')), T(), D(), { payload }) as Promise<{ diff: Row }>;
const graphDiff = (as: AuthenticatedPrincipal, payload: Row) => pv.graphDiff(req(as, 'graph.provenance.read', 'GRV', null), T(), D(), { payload }) as Promise<{ diff: Row }>;
const fitness = async (as: AuthenticatedPrincipal, type: string, id: string, version: number) =>
  (await pv.fitness(req(as, 'graph.provenance.read', type, id), T(), D(), { payload: { type, id, version } })).fitness as unknown as { evaluation: Row & { verdict: string; reasons: string[]; gaps: string[]; detail: Row[]; truncated: boolean }; mark: Row | null; refusesUse: boolean; history: Row[] };
const mark = (as: AuthenticatedPrincipal, payload: Row) => pv.mark(req(as, 'graph.provenance.fitness.mark', String(payload['type']), String(payload['id'])), T(), D(), { payload }) as Promise<{ mark: Row; receipt: Row }>;
const alignment = (as: AuthenticatedPrincipal, payload: Row) => pv.alignment(req(as, 'graph.provenance.read', 'BRF', String(payload['id'])), T(), D(), { payload }) as Promise<{ alignment: Row & { citations: Row[]; summary: Record<string, number>; verdict: string; disclosures: Row; translation: Row } }>;
const openChallenge = (as: AuthenticatedPrincipal, payload: Row) => pv.open(req(as, 'graph.provenance.challenge.open', 'KCH', null), T(), D(), { payload }) as Promise<{ challenge: Row }>;
const chAct = (as: AuthenticatedPrincipal, act: 'review' | 'evidence' | 'decide' | 'withdraw' | 'escalate', id: string, payload: Row = {}) => {
  const r = req(as, `graph.provenance.challenge.${act}`, 'KCH', id);
  const b = { payload };
  const p = act === 'review' ? pv.review(r, T(), D(), id) : act === 'evidence' ? pv.evidence(r, T(), D(), id, b) : act === 'decide' ? pv.decide(r, T(), D(), id, b)
    : act === 'withdraw' ? pv.withdraw(r, T(), D(), id, b) : pv.escalate(r, T(), D(), id);
  return p as Promise<{ challenge: Row }>;
};
const listChallenges = (as: AuthenticatedPrincipal, payload: Row = {}) => pv.challenges(req(as, 'graph.provenance.read', 'KCH', null), T(), D(), { payload }) as Promise<{ challenges: { challenges: Row[]; routes: Row } }>;
const registerAgent = (as: AuthenticatedPrincipal, payload: Row) => pv.register(h.req(as, 'graph.provenance.agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: Row }>;
const runAgent = (as: AuthenticatedPrincipal, id: string, payload: Row) => pv.run(req(as, 'graph.provenance.agent.trigger', 'AGT', id), T(), D(), id, { payload }) as Promise<{ run: Row; agent: Row; receipt: Row; trigger: Row }>;
const revokeAgent = (as: AuthenticatedPrincipal, id: string, reason: string) => pv.revoke(h.req(as, 'graph.provenance.agent.revoke', 'AGT', id, 'platform.administration'), T(), D(), id, { payload: { reason } }) as Promise<{ agent: Row }>;
const agentState = (as: AuthenticatedPrincipal) => pv.agent(req(as, 'graph.provenance.read', 'AGT', null), T(), D()) as Promise<{ agent: { agents: Row[]; runs: Row[] } }>;
// retention (the custody-transfer exercises)
const rOpen = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string } }>;
const rResolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const rApprove = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved (B50 §PV custody exercise, synthetic)' } });
const rExecute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Row }>;
const rVerify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Row }>;
const approvedAction = async (payload: Row): Promise<string> => {
  const o = await rOpen(rSteward, payload);
  const r = await rResolve(rSteward, o.action.actionId);
  await rApprove(rAuthority, o.action.actionId, String(r.scope['scope_digest']));
  return o.action.actionId;
};
const manifestOf = async (evd: Evd) => String((await one(sql`select payload ->> 'manifest_id' m from objects.canonical_objects where object_id = ${evd.id}::uuid and object_version = ${evd.version}`))['m']);
const custodyEvents = async (manifestId: string) => (await sql<{ event: string }>`select event from observation.custody_events where manifest_id = ${manifestId}::uuid order by occurred_at, event_id`.execute(h.su)).rows.map((r) => r.event);

/* ───────────── the planted world (the B21/B23 idiom: no cheap real extraction run — the gateway's replay needs a recorded call) ───────────── */
/** A claim version as the extraction admits it: the canonical object (its header digest), the lineage row, optionally the gateway call. */
async function plantClaim(evidence: Evd, o: { id?: string; version?: number; lineage?: boolean; evidenceDigest?: string; callOutcome?: 'completed' | 'abstained' | null; subject?: string;
  correctionOf?: string | null; lifecycle?: string; objectValue?: string; retrievalDecision?: string; admissionDecision?: string; runId?: string; methodId?: string } = {}): Promise<Claim> {
  const id = o.id ?? uuidv7(); const version = o.version ?? 1; const now = new Date().toISOString();
  const runId = o.runId ?? uuidv7(); const methodId = o.methodId ?? uuidv7(); const callId = o.callOutcome === undefined || o.callOutcome === null ? null : uuidv7();
  const payload: Row = { claim_kind: 'claim', subject: o.subject ?? 'Port of Hamburg throughput', predicate: 'is', object_value: o.objectValue ?? 'reduced by 12% (SYNTHETIC)', confidence: 0.91,
    review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: (o.lifecycle ?? 'active') as CanonicalHeader['lifecycle_state'], owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture-extraction',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: o.correctionOf ?? null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, evidence_refs, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, schema_ref, correction_of, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${header.lifecycle_state}, 'CP-INT-01', 'agent:fixture-extraction', ${JSON.stringify(header.source_object_ids)}::jsonb, ${now}::timestamptz, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false,
            ${JSON.stringify(header.evidence_refs)}::jsonb, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', 'CLM@v1', ${header.correction_of}, ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  if (callId !== null) {
    await sql`insert into intelligence.gateway_calls (call_id, scope, tenant_id, domain_id, run_id, method_id, mode, request_digest, response_digest, model_id, model_weights_digest, runtime_version, prompt_version, decoding_digest, outcome, latency_ms, correlation_id)
      values (${callId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${runId}::uuid, ${methodId}::uuid, 'replay', ${'a'.repeat(64)}, ${o.callOutcome === 'completed' ? 'b'.repeat(64) : null}, 'fixture-model-7b', ${'c'.repeat(64)}, 'fixture-runtime@1', 'claims-prompt@3', ${'d'.repeat(64)}, ${o.callOutcome}, 120, ${uuidv7()}::uuid)`.execute(h.su);
  }
  if (o.lineage !== false) {
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${id}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${runId}::uuid, ${methodId}::uuid, ${callId}::uuid, 'replay', ${evidence.id}::uuid, ${o.evidenceDigest ?? evidence.bytesDigest}, 0, 7, 0.91,
              ${o.retrievalDecision ?? uuidv7()}::uuid, 1, ${o.admissionDecision ?? uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  }
  return { id, version, runId, methodId, evidence, digest };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await h.app.get(VaultService).ensureRoots();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { ProvenanceController: P } = await import('../../src/graph/provenance/provenance.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  pv = h.app.get(P); retention = h.app.get(R);
  ivanova = await h.humanWithSession(['domain_analyst'], 'b50-d-ivanova');
  mueller = await h.humanWithSession(['knowledge_owner'], 'b50-k-mueller');
  mueller2 = await h.humanWithSession(['knowledge_owner'], 'b50-k-owner-2');
  steward = await h.humanWithSession(['data_steward'], 'b50-data-steward');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b50-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b50-tenant-admin', 'TENANT');
  rSteward = await h.humanWithSession(['retention_steward'], 'b50-retention-steward');
  rAuthority = await h.humanWithSession(['retention_authority'], 'b50-retention-authority', 'TENANT');
  // THE EVIDENCE (real uploads: EVD objects whose custody the upload recorded) and the claims planted on it
  [E1, E2, E3] = (await h.upload([
    { filename: 'b50-pv-portwatch-1.csv', text: TERMS_CSV.replace('assumption', 'assumption (PortWatch bulletin 1)'), documentTime: '2024-01-14T00:00:00Z' },
    { filename: 'b50-pv-portwatch-2.csv', text: TERMS_CSV.replace('assumption', 'assumption (PortWatch bulletin 2)'), documentTime: '2024-01-15T00:00:00Z' },
    { filename: 'b50-pv-portwatch-3.csv', text: TERMS_CSV.replace('assumption', 'assumption (PortWatch bulletin 3)'), documentTime: '2024-01-16T00:00:00Z' },
  ])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd, Evd, Evd];
}, 900_000);

afterAll(async () => {
  await h?.close();
  rmSync(VAULT_DIR, { recursive: true, force: true });
}, 120_000);

describe('PV1 · EXPLAIN — the backward path with the denied / abstained / challenged / failed nodes (V03-T-194, ES-28-004, AI-06-003, AI-29-004)', () => {
  it('a claim with full lineage: product → evidence (the span) → its sources; the method, the run (agent), the model call (model), the policy decisions (synchronous), the review (human)', async () => {
    // the policy decisions the lineage names: real ones (the upload's own decisions are the harness's nearest), so their outcome is read, not assumed
    const pol = (await sql<{ id: string }>`select id::text from policy.policy_decisions where tenant_id = ${T()}::uuid and decision = 'allow' order by created_at desc limit 2`.execute(h.su)).rows.map((r) => r.id);
    good = await plantClaim(E1, { callOutcome: 'completed', retrievalDecision: pol[0], admissionDecision: pol[1] });
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, decided_at, decider_principal_id, decision_reason, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${good.id}::uuid, 1, ${good.runId}::uuid, ${good.methodId}::uuid, 'below_review_threshold', 0.62, 'approved', clock_timestamp(), ${mueller.principalId}::uuid, 'the span reads as stated (fixture)', ${uuidv7()}::uuid)`.execute(h.su);
    const x = await explain(ivanova, 'CLM', good.id, 1);
    expect(x.ref).toBe(`CLM:${good.id}@1`);
    const root = x.nodes.find((n) => n.nodeId === x.root)!;
    expect(root).toMatchObject({ kind: 'product', outcome: 'ok' });
    const evd = x.nodes.find((n) => n.nodeId === `obj:EVD:${E1.id}@${E1.version}`)!;
    expect(evd).toMatchObject({ kind: 'evidence', outcome: 'ok', span: { start: 0, end: 7 } });
    expect(root.parents).toContain(evd.nodeId);
    const kinds = (k: string) => x.nodes.filter((n) => n.kind === k);
    expect(kinds('method').map((n) => n.ref)).toEqual(expect.arrayContaining(['fixture-extraction@1.0.0', `method:${good.methodId}`]));
    expect(x.nodes.find((n) => n.nodeId === `run:${good.runId}`)).toMatchObject({ kind: 'agent_run', boundary: 'agent' });
    const model = x.nodes.find((n) => n.kind === 'model_call')!;
    expect(model).toMatchObject({ boundary: 'model', outcome: 'ok' });
    expect(model.label).toMatch(/model fixture-model-7b · prompt claims-prompt@3 · runtime fixture-runtime@1 \(completed\)/);   // AI-29-004: model, prompt, runtime
    expect(x.nodes.filter((n) => n.kind === 'policy_decision' && n.boundary === 'synchronous' && n.outcome === 'ok').length).toBeGreaterThanOrEqual(1);
    expect(x.nodes.find((n) => n.kind === 'review' && n.boundary === 'human')).toMatchObject({ outcome: 'ok', actor: mueller.principalId });
    for (const p of root.parents) expect(x.nodes.some((n) => n.nodeId === p), p).toBe(true);   // every parent is a node of the answer
    // the evidence rests on its observation and source (the closure reaches them), every reference resolving
    expect(x.nodes.some((n) => n.kind === 'source')).toBe(true);
    expect(x.gaps).toEqual([]);
    expect(x.incomplete).toBe(false);
    // the TOOL boundary has no gateway (B70) and translation does not exist (B85): carried, said so
    expect(x.boundaries['tool']).toMatchObject({ nodes: 0, state: 'carried', carrier: expect.stringMatching(/^B70/) });
    expect(x.carried.map((r) => r['what'])).toEqual(['tool', 'translation']);
  });

  it('the paths that did not succeed are NODES: an abstention of the same run, a failed model call, a PDP denial naming the claim, a live challenge', async () => {
    // abstentions and a failure of the claim's own run (planted with the run id — the gateway records them per run)
    await sql`insert into intelligence.gateway_calls (call_id, scope, tenant_id, domain_id, run_id, method_id, mode, request_digest, model_id, model_weights_digest, runtime_version, prompt_version, decoding_digest, outcome, latency_ms, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${good.runId}::uuid, ${good.methodId}::uuid, 'replay', ${'e'.repeat(64)}, 'fixture-model-7b', ${'c'.repeat(64)}, 'fixture-runtime@1', 'claims-prompt@3', ${'d'.repeat(64)}, 'abstained', 80, ${uuidv7()}::uuid),
             (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${good.runId}::uuid, ${good.methodId}::uuid, 'replay', ${'f'.repeat(64)}, 'fixture-model-7b', ${'c'.repeat(64)}, 'fixture-runtime@1', 'claims-prompt@3', ${'d'.repeat(64)}, 'failed', 30000, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, null, null, ${good.runId}::uuid, ${good.methodId}::uuid, 'abstained', null, 'queued', ${uuidv7()}::uuid)`.execute(h.su);
    // a DENIED act naming the claim: the analyst tries the knowledge owner's mark — the PDP refuses and records it (object_id = the claim)
    const denied = await refusal(mark(ivanova, { type: 'CLM', id: good.id, version: 1, note: 'an analyst cannot mark fitness (fixture)' }));
    expect(denied.status).toBe(403);
    // a LIVE challenge by D. Ivanova
    const ch = (await openChallenge(ivanova, { type: 'CLM', id: good.id, version: 1, grounds: 'The bulletin counts transhipments twice; the throughput fall is overstated.', disputed: ['object_value'] })).challenge;
    expect(ch).toMatchObject({ state: 'open', subject: { kind: 'claim', type: 'CLM', id: good.id, version: 1 } });
    const x = await explain(mueller, 'CLM', good.id, 1);
    const by = (o: string) => x.nodes.filter((n) => n.outcome === o);
    expect(by('abstained').map((n) => n.kind).sort()).toEqual(['model_call', 'review']);
    expect(by('failed').map((n) => n.kind)).toEqual(['model_call']);
    expect(by('denied').some((n) => n.kind === 'policy_decision' && /graph\.provenance\.fitness\.mark/.test(n.label))).toBe(true);
    expect(by('challenged').map((n) => n.ref)).toEqual([`knowledge-challenge:${String(ch['challenge_id'])}`]);
    expect(x.outcomes).toMatchObject({ abstained: 2, failed: 1, challenged: 1 });
    const root = x.nodes.find((n) => n.nodeId === x.root)!;
    for (const n of [...by('abstained'), ...by('failed'), ...by('challenged')]) expect(root.parents).toContain(n.nodeId);
    // the reader's scope: a refusal for the wrong domain, a 404-class refusal for an unknown product
    const unknown = await refusal(explain(ivanova, 'CLM', uuidv7(), 1));
    expect(unknown.message).toMatch(/^provenance rejected \(unknown_object\): CLM .* v1 is not recorded in this domain/);
    expect(unknown.code).toBe('23503');
    expect((await refusal(explain(ivanova, 'clm' as never, good.id, 1))).status).toBe(422);
  });
});

describe('PV2 · EXPLAIN across the boundaries on real products; the forward preview', () => {
  it('a forecast: its request (synchronous, the audit correlation), its event (outbox), its method; the forward preview names what cites it', async () => {
    const f = await one(sql`select object_version::int v from objects.canonical_objects where object_id = ${w.forecastId}::uuid order by object_version desc limit 1`);
    const x = await explain(ivanova, 'FCT', w.forecastId, Number(f['v']));
    expect(x.nodes.find((n) => n.nodeId === x.root)).toMatchObject({ kind: 'product' });
    expect(Number(x.boundaries['synchronous'])).toBeGreaterThanOrEqual(1);
    expect(x.nodes.some((n) => n.boundary === 'synchronous' && /^request [a-z_.]+ \(success\)$/.test(n.label))).toBe(true);
    expect(x.nodes.some((n) => n.boundary === 'event' && /^event ForecastIssued \(/.test(n.label))).toBe(true);
    expect(x.nodes.some((n) => n.boundary === 'human' && n.kind === 'human_action')).toBe(true);   // the source's registrar, named on its version
    expect(x.nodes.some((n) => n.kind === 'method')).toBe(true);
    expect(x.forward).toMatchObject({ preview: true });
    for (const k of ['claims', 'constructed', 'options', 'briefings', 'publications', 'strategy', 'invalidations']) expect(Array.isArray(x.forward[k]), k).toBe(true);
  });

  it('a decision package version: the gate action (workflow), the approval (human), the citations (option_citation) — and the cited run\'s operator', async () => {
    const P = await c.committed();
    const x = await explain(w.executive, 'DPK', P.pkg, P.v);
    expect(x.nodes.some((n) => n.kind === 'approval' && n.outcome === 'ok' && n.actor === w.approver.principalId)).toBe(true);
    expect(x.edges.some((e) => e['basis'] === 'option_citation' && String(e['ref']).startsWith(`SIM:${w.rerouteId}`))).toBe(true);
    expect(x.nodes.some((n) => n.nodeId === `obj:SIM:${w.rerouteId}@1`)).toBe(true);
    expect(x.nodes.find((n) => n.nodeId === `simrun:${w.rerouteId}`)).toMatchObject({ kind: 'agent_run', boundary: 'workflow', outcome: 'ok' });
    // OVERRIDDEN and WORKFLOW: a proposed version read in the gate (a gate action — the workflow boundary), approved, then the approval revoked
    const Q = await c.proposed();
    const analyst = await h.humanWithSession(['domain_analyst'], 'b50-gate-reader');
    await w.decisions.gateAct(h.req(analyst, 'decision.gate.review', 'DPK', Q.pkg, 'decision'), T(), D(), Q.pkg, String(Q.v), 'review', { payload: { rationale: 'Read the options and their citations (B50 §PV, synthetic).' } });
    const ap = await c.approve(Q.pkg, Q.v, { decision: 'approve', versionDigest: Q.digest, rationale: 'The reroute keeps the line running (synthetic).' });
    await c.revoke(Q.pkg, ap.approval.approvalId, 'The bulletin it rested on was restated (synthetic).');
    const q = await explain(w.executive, 'DPK', Q.pkg, Q.v);
    expect(q.nodes.find((n) => n.ref === `approval:${ap.approval.approvalId}`)).toMatchObject({ kind: 'approval', outcome: 'overridden', boundary: 'human' });
    expect(q.nodes.some((n) => n.kind === 'workflow' && n.boundary === 'workflow' && /^gate review \(/.test(n.label))).toBe(true);
    expect(Number(q.boundaries['workflow'])).toBeGreaterThanOrEqual(1);
    expect(Number(q.boundaries['human'])).toBeGreaterThanOrEqual(1);
    // the forward side of the cited run: the package's option names it (a preview, never a recorded walk)
    const run = await explain(w.executive, 'SIM', w.rerouteId, 1);
    expect((run.forward['options'] as Row[]).some((o) => o['ref'] === `DPK:${P.pkg}@${P.v}`)).toBe(true);
  });
});

describe('PV3 · THE REVISION DIFF (V03-T-192) — header, payload, the correction chain, downstream impact; the graph revisions between heads', () => {
  it('two versions of a claim: the header fields and payload pointers that changed, the chain between, the impact recorded and the preview', async () => {
    const v1 = await plantClaim(E2, { objectValue: 'reduced by 12% (SYNTHETIC)' });
    corr = await plantClaim(E2, { id: v1.id, version: 2, correctionOf: `${v1.id}@1`, objectValue: 'reduced by 7% (SYNTHETIC, restated)' });
    const d = (await diff(ivanova, { type: 'CLM', id: v1.id, from: 1, to: 2 })).diff;
    expect((d['header'] as Row[]).map((r) => r['field'])).toEqual(expect.arrayContaining(['content_digest', 'correction_of', 'audit_correlation_id']));
    expect((d['header'] as Row[]).find((r) => r['field'] === 'correction_of')).toMatchObject({ before: null, after: `${v1.id}@1` });
    expect(d['payload']).toEqual([{ pointer: '/object_value', op: 'changed', before: 'reduced by 12% (SYNTHETIC)', after: 'reduced by 7% (SYNTHETIC, restated)' }]);
    expect((d['chain'] as Row[]).map((r) => [r['version'], r['correction_of']])).toEqual([[2, `${v1.id}@1`]]);
    expect(d['impact']).toMatchObject({ recorded: [], preview: { preview: true } });
    // CORRECTED is a node of the earlier version's path: a later version corrects it
    const x1 = await explain(ivanova, 'CLM', v1.id, 1);
    expect(x1.nodes.find((n) => n.kind === 'correction')).toMatchObject({ outcome: 'corrected', ref: `CLM:${v1.id}@2` });
    expect(x1.outcomes['corrected']).toBeGreaterThanOrEqual(1);
    // historical reconstruction: the earlier version AS RECORDED (its own digest and payload)
    expect((d['from'] as Row)['digest']).toBe(v1.digest);
    expect(((d['from'] as Row)['record'] as Row)['payload']).toMatchObject({ object_value: 'reduced by 12% (SYNTHETIC)' });
    const back = await refusal(diff(ivanova, { type: 'CLM', id: v1.id, from: 2, to: 2 }));
    expect(back.message).toMatch(/^provenance rejected \(versions\): a revision diff compares an earlier version with a later one \(from 2 to 2\)/);
    expect(back.code).toBe('22023');
    const missing = await refusal(diff(ivanova, { type: 'CLM', id: v1.id, from: 1, to: 3 }));
    expect(missing.message).toMatch(/^provenance rejected \(unknown_version\): CLM .* v3 is not recorded in this domain/);
    expect(missing.code).toBe('23503');
  });

  it('the graph revisions between two heads: the ledger rows, the counts, and the head steps made outside a change set counted, never hidden', async () => {
    const head = Number((await one(sql`select head from graph.revision_heads where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))['head'] ?? 0);
    expect(head).toBeGreaterThanOrEqual(1);   // the world's entity events advanced it
    const g = (await graphDiff(ivanova, { from: 0, to: head })).diff;
    expect(g).toMatchObject({ from: 0, to: head, head });
    expect(Number(g['unrecorded'])).toBe(head - (g['revisions'] as Row[]).length);
    const beyond = await refusal(graphDiff(ivanova, { from: 0, to: head + 5 }));
    expect(beyond.message).toMatch(/^provenance rejected \(unknown_revision\): the domain's graph is at revision \d+/);
  });
});

describe('PV4 · THE GENERIC UNFIT (DP-23-005) — the evaluation, the governed mark, the hook at a package option, an export, a resting product', () => {
  it('the evaluation: the fully examined claim is FIT; a claim without its lineage is UNFIT (incomplete_lineage); a lineage digest that is no evidence\'s is UNFIT (unverifiable_artifact)', async () => {
    const f = await fitness(ivanova, 'CLM', corr.id, 2);
    expect(f.evaluation).toMatchObject({ verdict: 'fit', reasons: [], truncated: false, ruleVersion: 'b50-pv-fitness-1' });
    expect(f.mark).toBeNull(); expect(f.refusesUse).toBe(false);
    bare = await plantClaim(E3, { lineage: false });
    const b = await fitness(ivanova, 'CLM', bare.id, 1);
    expect(b.evaluation).toMatchObject({ verdict: 'unfit', reasons: ['incomplete_lineage'] });
    expect(b.evaluation.gaps[0]).toMatch(/^incomplete_lineage: an extracted claim without its lineage row/);
    tampered = await plantClaim(E3, { evidenceDigest: '0'.repeat(64) });
    const t = await fitness(ivanova, 'CLM', tampered.id, 1);
    expect(t.evaluation).toMatchObject({ verdict: 'unfit', reasons: ['unverifiable_artifact'] });
    expect(t.evaluation.gaps.join(' ')).toMatch(/the lineage names evidence bytes 000000000000; no version of evidence .* carries them/);
  });

  it('THE MARK: the knowledge owner records the evaluation\'s verdict (never the caller\'s), routed; the analyst is refused by the PDP; a mark without a route, a short note, an unknown object refused; a replay answers the first', async () => {
    expect((await refusal(mark(ivanova, { type: 'CLM', id: bare.id, version: 1, route: 'recompute', note: 'an analyst attempt (fixture)' }))).status).toBe(403);
    const noRoute = await refusal(mark(mueller, { type: 'CLM', id: bare.id, version: 1, note: 'the lineage row is missing (fixture)' }));
    expect(noRoute.message).toMatch(/^product fitness rejected \(route\): the evaluation finds CLM:.* unfit \(incomplete_lineage\); the mark routes it/);
    expect((await refusal(mark(mueller, { type: 'CLM', id: bare.id, version: 1, route: 'recompute', note: 'short' }))).status).toBe(422);
    const unknown = await refusal(mark(mueller, { type: 'CLM', id: uuidv7(), version: 1, route: 'recompute', note: 'nothing recorded (fixture)' }));
    expect(unknown.message).toMatch(/^product fitness rejected \(unknown_object\)/); expect(unknown.code).toBe('23503');
    const markId = uuidv7();
    const m = (await mark(mueller, { type: 'CLM', id: bare.id, version: 1, route: 'recompute', note: 'the extraction recorded no lineage row; re-run it (fixture)', markId })).mark;
    expect(m).toMatchObject({ mark_id: markId, verdict: 'unfit', reasons: ['incomplete_lineage'], route: 'recompute', routed_to: null, rule_version: 'b50-pv-fitness-1', refuses_use: true, replayed: false });
    expect((await mark(mueller, { type: 'CLM', id: bare.id, version: 1, route: 'recompute', note: 'the extraction recorded no lineage row; re-run it (fixture)', markId })).mark).toMatchObject({ mark_id: markId, replayed: true });
    const dup = await refusal(mark(mueller2, { type: 'CLM', id: bare.id, version: 1, route: 'recompute', note: 'another person reusing the id (fixture)', markId }));
    expect(dup.message).toMatch(/^product fitness rejected \(duplicate\)/); expect(dup.code).toBe('23505');
    const f = await fitness(ivanova, 'CLM', bare.id, 1);
    expect(f.refusesUse).toBe(true); expect(f.mark).toMatchObject({ verdict: 'unfit', route: 'recompute', marked_by: mueller.principalId });
    // the steward marks the tampered one (adjudication: a person decides whether the evidence is the one the claim read)
    expect((await mark(steward, { type: 'CLM', id: tampered.id, version: 1, route: 'adjudication', note: 'the lineage digest is no evidence version (fixture)' })).mark).toMatchObject({ verdict: 'unfit', route: 'adjudication' });
  });

  it('THE HOOK at a package option: an option citing the unfit claim is REFUSED (409) in §0\'s words; citing the fit claim it is set', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'B50 §PV hook package (SYNTHETIC)', statement: 'whether to rely on the throughput claim', owner: w.owner.principalId });
    const pkg = d.package.packageId; const v = (await c.open(pkg)).version.version;
    const r = await refusal(c.option(pkg, v, { key: 'rely', title: 'Rely on the throughput claim', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'claim', id: bare.id, version: 1, digest: bare.digest }] }));
    expect(r.message).toMatch(/object use rejected \(unfit\): CLM .* v1 is marked unfit \(incomplete_lineage\) by mark .*; it is not used for decision_option; the mark routed it to recompute/);
    expect(r.status).toBe(409);
    expect((await c.option(pkg, v, { key: 'rely', title: 'Rely on the restated claim', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'claim', id: corr.id, version: 2, digest: corr.digest }] })).option.optionId).toBeTruthy();
  });

  it('THE HOOK for every decision-active use, and through the constructed lineage: publication, gate and export refuse the unfit; a product RESTING on it refuses too', async () => {
    for (const use of ['publication', 'gate', 'export']) {
      const r = await refusal(sql`select objects.assert_usable('CLM', ${bare.id}::uuid, 1, ${use})`.execute(h.su));
      expect(r.message, use).toMatch(new RegExp(`^object use rejected \\(unfit\\): CLM ${bare.id} v1 is marked unfit .* not used for ${use}`));
    }
    // no mark is no refusal (the hook never evaluates): the tampered claim's sibling, unmarked, passes; an unknown object passes (§HD's question)
    await sql`select objects.assert_usable('CLM', ${good.id}::uuid, 1, 'decision_option')`.execute(h.su);
    await sql`select objects.assert_usable('FCT', gen_random_uuid(), 1, 'gate')`.execute(h.su);
  });

  it('THE HOOK at an EXPORT build: evidence whose custody broke (an integrity failure after its last verified custody) is marked unfit; the export is refused; a re-verification lifts it and the export is built — both marks kept', async () => {
    const m3 = await manifestOf(E3);
    // the fault, as the vault's integrity check records it (synthetic fault injection: the bytes failed their digest)
    await sql`insert into observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, source_id, contract_version, event, actor, digest_verified, details, correlation_id)
      select gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${m3}::uuid, ${E3.id}::uuid, bm.source_id, bm.contract_version, 'custody.integrity_failed', 'principal:' || ${domainAdmin.principalId}, false, '{"fixture":"B50 §PV fault"}'::jsonb, gen_random_uuid()
        from observation.blob_manifests bm where bm.manifest_id = ${m3}::uuid`.execute(h.su);
    const f = await fitness(steward, 'EVD', E3.id, E3.version);
    expect(f.evaluation).toMatchObject({ verdict: 'unfit', reasons: ['broken_custody'] });
    const m1 = (await mark(steward, { type: 'EVD', id: E3.id, version: E3.version, route: 'adjudication', note: 'the bytes failed their digest; custody is broken (fixture)' })).mark;
    expect(m1).toMatchObject({ verdict: 'unfit', reasons: ['broken_custody'] });
    const exportId = await approvedAction({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [m3], classificationCeiling: 'internal' } });
    const refused = await refusal(rExecute(rSteward, exportId));
    expect(refused.message).toMatch(/object use rejected \(unfit\): EVD .* is marked unfit \(broken_custody\) .* not used for export/);
    expect(refused.status).toBe(409);
    // the re-verification (the vault's check passing again under the same digest), then the re-evaluation lifts the mark
    await sql`insert into observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, source_id, contract_version, event, actor, content_digest, digest_verified, details, correlation_id)
      select gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${m3}::uuid, ${E3.id}::uuid, bm.source_id, bm.contract_version, 'custody.verified', 'principal:' || ${domainAdmin.principalId}, bm.content_digest, true, '{"fixture":"B50 §PV re-verified"}'::jsonb, gen_random_uuid()
        from observation.blob_manifests bm where bm.manifest_id = ${m3}::uuid`.execute(h.su);
    const m2 = (await mark(steward, { type: 'EVD', id: E3.id, version: E3.version, note: 'the bytes verified again under their digest (fixture)' })).mark;
    expect(m2).toMatchObject({ verdict: 'fit', route: null, lifted: true, supersedes: m1['mark_id'], refuses_use: false });
    const again = await approvedAction({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [m3], classificationCeiling: 'internal' } });
    expect((await rExecute(rSteward, again)).execution).toMatchObject({ executed: 1 });
    expect((await fitness(steward, 'EVD', E3.id, E3.version)).history.map((x) => x['verdict'])).toEqual(['unfit', 'fit']);   // the gap preserved
    (globalThis as Record<string, unknown>)['__b50pvExport'] = again;
  });
});

describe('PV5 · ALIGNMENT (AI-29-001, AI-29-003) — briefings, an export; the unlabelled unsupported claim makes the briefing UNFIT', () => {
  let briefingId = '';
  it('a composed briefing (the real composer): its object lines checked, its ledger-event lines disclosed; the domain\'s claim WITHOUT lineage is cited unsupported and unlabelled — MISALIGNED, the BRF UNFIT; translation carried (B85)', async () => {
    const P = await c.proposed();
    const room = (await c.openRoom({ packageId: P.pkg, title: 'B50 §PV corridor room (SYNTHETIC)', reviewEveryDays: 7 })).room.roomId;
    await c.membership(room, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    const b = (await c.compose({ roomId: room, knownAt: new Date().toISOString(), priorBriefingId: null })).briefing;
    briefingId = b.briefingId;
    const a = (await alignment(w.executive, { kind: 'briefing', id: briefingId })).alignment;
    expect(a).toMatchObject({ kind: 'briefing', translation: { state: 'carried', carrier: expect.stringMatching(/^B85/) } });
    expect(a.summary['citations']).toBe(a.citations.length);
    // every line that cites a recorded object resolves; the bound ones carry evidence (a claim its lineage span), the synthetic runs their label
    expect(a.summary['unresolved']).toBe(0);
    expect(a.citations.filter((x) => String(x['ref']).startsWith('SIM:')).every((x) => x['label'] === 'synthetic')).toBe(true);
    expect(a.citations.find((x) => x['ref'] === `CLM:${good.id}@1`)).toMatchObject({ bound: true, span: { start: 0, end: 7 } });
    // the claim planted without its lineage (PV4) is in the domain, so the composer cites it: unsupported and unlabelled
    expect(a.summary['unsupported_unlabelled']).toBe(1);
    expect(a.citations.filter((x) => x['aligned'] === false).map((x) => x['ref'])).toEqual([`CLM:${bare.id}@1`]);
    expect(a.verdict).toBe('misaligned');
    expect(Number(a.disclosures['event_lines'])).toBeGreaterThanOrEqual(1);   // the package events of the room's package
    expect(a.disclosures).toMatchObject({ narrative: b.narrative !== null });
    const f = await fitness(w.executive, 'BRF', briefingId, 1);
    expect(f.evaluation.verdict).toBe('unfit');
    expect(f.evaluation.detail.some((g) => g['kind'] === 'unsupported_claim' && String(g['reason']).includes(bare.id))).toBe(true);
  });

  it('a briefing whose narrative cites a line it does not carry and whose item resolves to nothing: MISALIGNED, and its BRF evaluates UNFIT (unsupported_claim)', async () => {
    const bad = uuidv7(); const ghost = uuidv7();
    await sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, source_states, degraded, narrative, narrative_cites, content_digest, header_digest, controls, correlation_id)
      select ${bad}::uuid, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, null, watermark, sources,
             items || jsonb_build_array(jsonb_build_object('item_id', 'claim:' || ${ghost}::text || '@1', 'kind', 'claim', 'id', ${ghost}::text, 'version', 1, 'title', 'a claim nobody recorded (SYNTHETIC)')),
             windows, source_states, degraded, 'The corridor is closed (SYNTHETIC).', '["line-that-is-not-there"]'::jsonb, content_digest, header_digest, controls, gen_random_uuid()
        from executive.briefings where briefing_id = ${briefingId}::uuid`.execute(h.su);
    await sql`insert into objects.canonical_objects select (jsonb_populate_record(null::objects.canonical_objects, to_jsonb(o) || jsonb_build_object('object_id', ${bad}::text, 'object_version', 1))).*
      from objects.canonical_objects o where o.object_id = ${briefingId}::uuid order by o.object_version desc limit 1`.execute(h.su);
    const a = (await alignment(w.executive, { kind: 'briefing', id: bad })).alignment;
    expect(a.verdict).toBe('misaligned');
    expect(a.summary['unsupported_unlabelled']).toBe(3);
    expect(a.citations.filter((x) => x['aligned'] === false).map((x) => x['reason']).sort()).toEqual(['does not resolve in this domain', 'the narrative cites a line the briefing does not carry', 'unsupported and unlabelled']);
    const f = await fitness(w.executive, 'BRF', bad, 1);
    expect(f.evaluation.verdict).toBe('unfit');
    expect(f.evaluation.reasons).toContain('unsupported_claim');
    const unknown = await refusal(alignment(w.executive, { kind: 'briefing', id: uuidv7() }));
    expect(unknown.message).toMatch(/^provenance rejected \(unknown_object\): no briefing/);
  });

  it('an export\'s alignment: each executed manifest\'s evidence bound, its custody intact; the withheld disclosed', async () => {
    const exportId = String((globalThis as Record<string, unknown>)['__b50pvExport']);
    const a = (await alignment(rSteward, { kind: 'export', id: exportId })).alignment;
    expect(a.kind).toBe('export');
    const evd = a.citations.filter((x) => String(x['ref']).startsWith('EVD:'));
    expect(evd).toHaveLength(1);
    expect(evd[0]).toMatchObject({ resolves: true, bound: true, custody: 'intact', artifact: 'verified', aligned: true });
    expect(a.verdict).toBe('aligned');
  });
});

describe('PV6 · THE CONTEST PATH (HX-14) — knowledge challenges in B21\'s shape; decisions and runs routed', () => {
  let chId = '';
  it('routing and standing: a decision and a run are routed to their own paths; the owner never challenges its own product; one live challenge per person', async () => {
    const P = await c.proposed();
    const dpk = await refusal(openChallenge(ivanova, { type: 'DPK', id: P.pkg, version: P.v, grounds: 'The package rests on a restated bulletin (SYNTHETIC).' }));
    expect(dpk.message).toMatch(/^knowledge challenge rejected \(routed\): a decision is contested through its own paths — an appeal \(decision\.appeal\.open, B35\) or a gate challenge \(decision\.challenge\.raise, B36\)/);
    const sim = await refusal(openChallenge(ivanova, { type: 'SIM', id: w.rerouteId, version: 1, grounds: 'The reroute run assumes the Cape is open (SYNTHETIC).' }));
    expect(sim.message).toMatch(/^knowledge challenge rejected \(routed\): a simulation run is contested through its simulation challenge/);
    const f = await one(sql`select object_version::int v from objects.canonical_objects where object_id = ${w.forecastId}::uuid order by object_version desc limit 1`);
    const own = await refusal(openChallenge(await h.openSession(w.twinOwner), { type: 'FCT', id: w.forecastId, version: Number(f['v']), grounds: 'My own forecast is wrong (SYNTHETIC) — I should correct it.' }));
    expect(own.message).toMatch(/^knowledge challenge rejected \(separation_of_duties\): the owner of FCT .* corrects it \(a correction\), never challenges it/);
    const dup = await refusal(openChallenge(ivanova, { type: 'CLM', id: good.id, version: 1, grounds: 'A second challenge while the first is live (SYNTHETIC).' }));
    expect(dup.message).toMatch(/^knowledge challenge rejected \(duplicate\)/); expect(dup.code).toBe('23505');
    const short = await refusal(openChallenge(ivanova, { type: 'CLM', id: corr.id, version: 2, grounds: 'too short' }));
    expect(short.status).toBe(422);
    chId = String((await listChallenges(ivanova, { subjectId: good.id, state: 'live' })).challenges.challenges[0]!['challenge_id']);
  });

  it('evidence by a party; review by a steward who is neither opener nor owner; the reviewer alone decides; UPHELD enters the fitness evaluation', async () => {
    const ev = (await chAct(ivanova, 'evidence', chId, { ref: `EVD:${E2.id}@${E2.version}`, digest: E2.digest, note: 'The second bulletin restates the figure.' })).challenge;
    expect(ev['evidence']).toMatchObject({ party: 'opener', ref: `EVD:${E2.id}@${E2.version}` });
    expect((await refusal(chAct(mueller, 'evidence', chId, { ref: `EVD:${E2.id}@${E2.version}`, digest: E2.digest, note: 'not a party yet (fixture)' }))).message).toMatch(/^knowledge challenge rejected \(actor\): evidence is submitted by a party/);
    expect((await refusal(chAct(ivanova, 'evidence', chId, { ref: `EVD:${E2.id}@${E2.version}`, digest: 'a'.repeat(64), note: 'a wrong digest (fixture)' }))).message).toMatch(/^knowledge challenge rejected \(evidence\): .* carries digest/);
    expect((await refusal(chAct(ivanova, 'review', chId))).status).toBe(403);   // the analyst holds no reviewing role (the PDP)
    const r = (await chAct(mueller, 'review', chId)).challenge;
    expect(r).toMatchObject({ state: 'under_review', reviewer: mueller.principalId });
    const other = await refusal(chAct(mueller2, 'decide', chId, { decision: 'dismissed', note: 'Another owner deciding someone else\'s review.' }));
    expect(other.message).toMatch(/^knowledge challenge rejected \(actor\): challenge .* is under review by another person; its reviewer decides it/);
    const d = (await chAct(mueller, 'decide', chId, { decision: 'upheld', note: 'The bulletin double counts transhipments; the claim is overstated.' })).challenge;
    expect(d).toMatchObject({ state: 'upheld', decided_by: mueller.principalId, next: expect.stringMatching(/fitness evaluation now reads unsupported_claim/) });
    expect((await refusal(chAct(ivanova, 'withdraw', chId, { reason: 'too late to withdraw (fixture)' }))).message).toMatch(/^knowledge challenge rejected \(state\): challenge .* is upheld; only a live challenge is withdrawn/);
    const f = await fitness(ivanova, 'CLM', good.id, 1);
    expect(f.evaluation).toMatchObject({ verdict: 'unfit', reasons: ['unsupported_claim'] });
    const x = await explain(ivanova, 'CLM', good.id, 1);
    expect(x.nodes.find((n) => n.ref === `knowledge-challenge:${chId}`)).toMatchObject({ outcome: 'challenged', label: expect.stringMatching(/^knowledge challenge upheld/) });
    const listed = (await listChallenges(mueller, { subjectId: good.id })).challenges;
    expect((listed.challenges[0]!['events'] as Row[]).map((e) => e['event'])).toEqual(['challenge.opened', 'challenge.evidence_submitted', 'challenge.review_started', 'challenge.upheld']);
    expect(listed.routes).toMatchObject({ decision: expect.stringMatching(/B35/), run: expect.stringMatching(/B21/) });
  });

  it('separation: a knowledge owner who opened a challenge never reviews it; ESCALATION only once overdue on the database clock; withdrawal by the opener alone; a dismissal', async () => {
    const own = (await openChallenge(mueller2, { type: 'CLM', id: corr.id, version: 2, grounds: 'The restated figure omits the Brunsbüttel berth (SYNTHETIC).', reviewWithinDays: 1 })).challenge;
    const id2 = String(own['challenge_id']);
    expect((await refusal(chAct(mueller2, 'review', id2))).message).toMatch(/^knowledge challenge rejected \(separation_of_duties\): reviewing a knowledge challenge is never done by its proposer/);
    const early = await refusal(chAct(mueller2, 'escalate', id2));
    expect(early.message).toMatch(/^knowledge challenge rejected \(state\): challenge .* is not overdue; its review is due by .* \(the database clock reads/);
    // the clock fixture: the due instant set one minute in the past (the database clock decides overdue, never the caller's)
    await sql`update graph.knowledge_challenges set review_by = clock_timestamp() - interval '1 minute' where challenge_id = ${id2}::uuid`.execute(h.su);
    const e = (await chAct(mueller2, 'escalate', id2)).challenge;
    expect(e).toMatchObject({ escalations: 1, escalated_to_roles: ['domain_admin'], overdue: false });
    expect((await refusal(chAct(ivanova, 'withdraw', id2, { reason: 'not my challenge (fixture)' }))).message).toMatch(/^knowledge challenge rejected \(actor\): a challenge is withdrawn by its opener/);
    expect((await chAct(mueller2, 'withdraw', id2, { reason: 'The berth is counted in the second annex.' })).challenge).toMatchObject({ state: 'withdrawn' });
    // a dismissal leaves the product fit
    const third = String((await openChallenge(ivanova, { type: 'CLM', id: corr.id, version: 2, grounds: 'The restated figure is too precise for one bulletin (SYNTHETIC).' })).challenge['challenge_id']);
    await chAct(steward, 'review', third);
    expect((await chAct(steward, 'decide', third, { decision: 'dismissed', note: 'Two independent bulletins agree on the restated figure.' })).challenge).toMatchObject({ state: 'dismissed' });
    expect((await fitness(ivanova, 'CLM', corr.id, 2)).evaluation.verdict).toBe('fit');
  });
});

describe('PV7 · THE PROVENANCE AGENT (AG-014) — registered, triggered by a person, deterministic, cannot conceal, revocable', () => {
  it('registration (0060\'s shape): the tenant administrator registers it with an accountable owner; a second active agent is refused; the analyst cannot trigger it', async () => {
    expect((await refusal(registerAgent(domainAdmin, { ownerPrincipalId: mueller.principalId }))).status).toBe(403);
    const a = (await registerAgent(tenantAdmin, { ownerPrincipalId: mueller.principalId, budgets: { max_depth: 8, max_nodes: 200 } })).agent;
    expect(a).toMatchObject({ version: PROVENANCE_AGENT.version, code_digest: PROVENANCE_AGENT.codeDigest, owner: mueller.principalId, budgets: { max_depth: 8, max_nodes: 200 }, status: 'active', role: 'provenance_agent', deterministic: true });
    agentId = String(a['agent_id']);
    const p = await one(sql`select kind, display_name from identity.principals where id = ${String(a['principal_id'])}::uuid`);
    expect(p).toMatchObject({ kind: 'agent', display_name: expect.stringMatching(/^agent:graph\.provenance-agent@1\.0\.0 \(/) });
    const dup = await refusal(registerAgent(tenantAdmin, { ownerPrincipalId: mueller.principalId }));
    expect(dup.message).toMatch(/^provenance agent rejected \(duplicate\)/);
    expect((await refusal(runAgent(ivanova, agentId, { type: 'CLM', id: corr.id, version: 2 }))).status).toBe(403);
  });

  it('a run: the person triggers, the AGENT acts under its own session; edges constructed from recorded lineage; a second run constructs nothing new (deterministic)', async () => {
    const r1 = await runAgent(mueller, agentId, { type: 'CLM', id: corr.id, version: 2 });
    expect(r1.run).toMatchObject({ subject: `CLM:${corr.id}@2`, outcome: 'complete', gaps: [], truncated: false, replayed: false });
    expect(Number(r1.run['edges_constructed'])).toBeGreaterThanOrEqual(2);   // CLM v2 → EVD (refs, lineage), → CLM v1 (correction_of), and onward
    expect(r1.agent['principalId']).not.toBe(mueller.principalId);
    const acted = await one(sql`select principal_id::text p, action, decision from policy.policy_decisions where id = ${String(r1.receipt['policyDecisionId'])}::uuid`);
    expect(acted).toMatchObject({ p: `principal:${String(r1.agent['principalId'])}`, action: 'graph.provenance.construct', decision: 'allow' });
    const edges = await one(sql`select count(*)::int n from graph.provenance_edges where dependent_id = ${corr.id}::uuid and dependent_version = 2`);
    expect(edges['n']).toBeGreaterThanOrEqual(2);
    const bases = (await sql<{ basis: string }>`select distinct basis from graph.provenance_edges where dependent_id = ${corr.id}::uuid and dependent_version = 2 order by basis`.execute(h.su)).rows.map((x) => x.basis);
    expect(bases).toEqual(expect.arrayContaining(['claim_lineage', 'correction_of', 'evidence_refs']));
    const r2 = await runAgent(mueller, agentId, { type: 'CLM', id: corr.id, version: 2 });
    expect(r2.run).toMatchObject({ outcome: 'complete', edges_constructed: 0, edges_existing: Number(r1.run['edges_constructed']) + Number(r1.run['edges_existing']) });
  });

  it('an INCOMPLETE history is reported, never concealed: the claim without lineage — outcome incomplete with every gap; nothing constructed to what does not resolve', async () => {
    const r = await runAgent(steward, agentId, { type: 'CLM', id: bare.id, version: 1 });
    expect(r.run).toMatchObject({ outcome: 'incomplete' });
    expect((r.run['gaps'] as Row[]).map((g) => g['kind'])).toContain('incomplete_lineage');
    const st = (await agentState(mueller)).agent;
    expect(st.runs.find((x) => x['subject'] === `CLM:${bare.id}@1`)).toMatchObject({ outcome: 'incomplete' });
    // the explanation shows the agent's run as a node of the product's history
    const x = await explain(ivanova, 'CLM', bare.id, 1);
    expect(x.nodes.some((n) => n.kind === 'agent_run' && /^provenance agent 1\.0\.0: incomplete/.test(n.label) && n.outcome === 'unresolved')).toBe(true);
    expect(x.incomplete).toBe(true);
  });

  it('THE HOOK through the constructed edges: a claim RESTING on the unfit evidence refuses (naming the upstream); the lift of the upstream mark frees it', async () => {
    const onE3 = await plantClaim(E3, {});
    await runAgent(mueller, agentId, { type: 'CLM', id: onE3.id, version: 1 });
    await sql`select objects.assert_usable('CLM', ${onE3.id}::uuid, 1, 'decision_option')`.execute(h.su);   // E3's current mark is fit (lifted in PV4)
    // a new unfit mark on E3 (a second integrity failure, then the steward's mark)
    const m3 = await manifestOf(E3);
    await sql`insert into observation.custody_events (event_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, source_id, contract_version, event, actor, digest_verified, details, correlation_id)
      select gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${m3}::uuid, ${E3.id}::uuid, bm.source_id, bm.contract_version, 'custody.integrity_failed', 'principal:' || ${domainAdmin.principalId}, false, '{"fixture":"B50 §PV second fault"}'::jsonb, gen_random_uuid()
        from observation.blob_manifests bm where bm.manifest_id = ${m3}::uuid`.execute(h.su);
    await mark(steward, { type: 'EVD', id: E3.id, version: E3.version, route: 'adjudication', note: 'the bytes failed their digest again (fixture)' });
    const r = await refusal(sql`select objects.assert_usable('CLM', ${onE3.id}::uuid, 1, 'decision_option')`.execute(h.su));
    expect(r.message).toMatch(new RegExp(`^object use rejected \\(unfit\\): CLM ${onE3.id} v1 rests on EVD ${E3.id} v${E3.version}, marked unfit \\(broken_custody\\)`));
    expect(r.status).toBe(409);
  });

  it('revocation: the domain administrator revokes it; the next trigger is refused (no active agent)', async () => {
    expect((await revokeAgent(domainAdmin, agentId, 'The agent is replaced by a new version (fixture).')).agent).toMatchObject({ status: 'revoked' });
    const r = await refusal(runAgent(mueller, agentId, { type: 'CLM', id: corr.id, version: 2 }));
    expect(r.status).toBe(404);
    expect(r.message).toMatch(/^provenance agent rejected \(unknown_agent\)/);
  });
});

describe('PV8 · CUSTODY-TRANSFER EXERCISES (DP-23-006) — archive, restore, export; the chain verified after each move', () => {
  it('E1 archived to the cold tier and restored to the hot tier (B12), then exported (B11/B15): custody intact after each move, the evaluation fit, the chain in order', async () => {
    const m1 = await manifestOf(E1);
    const arc = await approvedAction({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [m1] } });
    expect((await rExecute(rSteward, arc)).execution).toMatchObject({ executed: 1 });
    expect((await rVerify(rSteward, arc)).verification).toMatchObject({ verified: true });
    expect((await fitness(ivanova, 'EVD', E1.id, E1.version)).evaluation.verdict).toBe('fit');
    const res = await approvedAction({ kind: 'restore', targetKind: 'evidence', selector: { manifestIds: [m1] } });
    expect((await rExecute(rSteward, res)).execution).toMatchObject({ executed: 1 });
    expect((await rVerify(rSteward, res)).verification).toMatchObject({ verified: true });
    const exp = await approvedAction({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [m1], classificationCeiling: 'internal' } });
    expect((await rExecute(rSteward, exp)).execution).toMatchObject({ executed: 1 });
    const chain = await custodyEvents(m1);
    const at = (e: string) => chain.indexOf(e);
    expect(at('custody.archived')).toBeGreaterThan(-1);
    expect(at('custody.restored')).toBeGreaterThan(at('custody.archived'));
    expect(at('custody.exported')).toBeGreaterThan(at('custody.restored'));
    const f = await fitness(ivanova, 'EVD', E1.id, E1.version);
    expect(f.evaluation).toMatchObject({ verdict: 'fit', reasons: [] });
    const a = (await alignment(rSteward, { kind: 'export', id: exp })).alignment;
    expect(a.citations.find((x) => String(x['ref']).startsWith('EVD:'))).toMatchObject({ custody: 'intact', artifact: 'verified' });
    // lineage closure from the claim through the moved evidence: still complete
    const x = await explain(ivanova, 'CLM', corr.id, 2);
    expect(x.gaps).toEqual([]);
  });

  it('digest verification, model and human attribution: the tampered lineage is an unverifiable artifact in the closure; the model call names its model and prompt; the reviewer is named', async () => {
    const t = await explain(ivanova, 'CLM', tampered.id, 1);
    expect(t.gaps.map((g) => g['kind'])).toContain('unverifiable_artifact');   // (and E3's broken custody since PV7)
    expect(t.nodes.some((n) => n.kind === 'evidence' && n.outcome === 'unresolved' && /^unverifiable_artifact: the lineage names evidence bytes/.test(n.label))).toBe(true);
    const g = await explain(ivanova, 'CLM', good.id, 1);
    expect(g.nodes.find((n) => n.kind === 'model_call' && n.outcome === 'ok')!.label).toMatch(/fixture-model-7b .* claims-prompt@3/);
    expect(g.nodes.some((n) => n.kind === 'review' && n.actor === mueller.principalId)).toBe(true);
  });
});

describe('PV9 · THE SHAPE — the hook re-declared whole, the tables, the ports', () => {
  it('objects._lineage_usable: STABLE, invoker, search path objects, pg_catalog, pg_temp, no runtime grant, marked B50 pv', async () => {
    const r = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_functiondef(p.oid) def,
      has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt from pg_proc p where p.oid = 'objects._lineage_usable(text, uuid, integer, text)'::regprocedure`);
    expect(r).toMatchObject({ v: 's', d: false, cfg: 'search_path=objects, pg_catalog, pg_temp', app: false, cmt: false });
    expect(String(r['def'])).toContain('B50 pv');
  });
  it('the eight ledgers FORCE RLS, SELECT to eye_app / eye_commit, no write grant; the append-only ones refuse an update', async () => {
    for (const t of ['product_fitness_marks', 'knowledge_challenges', 'knowledge_challenge_events', 'knowledge_challenge_evidence', 'provenance_agents', 'provenance_agent_events', 'provenance_runs', 'provenance_edges']) {
      const r = await one(sql`select c.relrowsecurity rls, c.relforcerowsecurity frc, has_table_privilege('eye_app', c.oid, 'SELECT') app_sel, has_table_privilege('eye_commit', c.oid, 'SELECT') cmt_sel,
        has_table_privilege('eye_commit', c.oid, 'INSERT') ins, has_table_privilege('eye_commit', c.oid, 'UPDATE') upd, has_table_privilege('eye_app', c.oid, 'INSERT') app_ins
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'graph' and c.relname = ${t}`);
      expect(r, t).toEqual({ rls: true, frc: true, app_sel: true, cmt_sel: true, ins: false, upd: false, app_ins: false });
    }
    expect((await refusal(sql`update graph.product_fitness_marks set note = 'rewritten note' where true`.execute(h.su))).message).toMatch(/append-only/i);
  });
  it('the ports: SECURITY DEFINER with a fixed search path; the writes to eye_commit only; the reads to eye_app and eye_commit; the internals with no grant', async () => {
    const writes = ['graph.mark_product_fitness', 'graph.open_knowledge_challenge', 'graph.review_knowledge_challenge', 'graph.submit_knowledge_challenge_evidence', 'graph.decide_knowledge_challenge',
      'graph.withdraw_knowledge_challenge', 'graph.escalate_knowledge_challenge', 'graph.register_provenance_agent', 'graph.revoke_provenance_agent', 'graph.provenance_construct'];
    const reads = ['graph.explain', 'graph.revision_diff', 'graph.graph_revision_diff', 'graph.product_fitness', 'graph.alignment_check', 'graph.knowledge_challenges_read', 'graph.provenance_agent_state'];
    const internals = ['graph.pv_closure', 'graph.pv_upstream', 'graph.pv_evd_custody', 'graph.pv_fitness_eval', 'graph.pv_alignment', 'graph.pv_cite', 'graph.pv_downstream', 'graph.pv_resolve', 'graph.pv_current_mark'];
    const of = async (name: string) => one(sql`select bool_and(p.prosecdef) d, bool_and(p.proconfig is not null and array_to_string(p.proconfig, ',') like 'search_path=%pg_temp') sp,
      bool_or(has_function_privilege('public', p.oid, 'EXECUTE')) pub, bool_or(has_function_privilege('eye_app', p.oid, 'EXECUTE')) app, bool_or(has_function_privilege('eye_commit', p.oid, 'EXECUTE')) cmt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname = ${name}`);
    for (const f of writes) expect(await of(f), f).toEqual({ d: true, sp: true, pub: false, app: false, cmt: true });
    for (const f of reads) expect(await of(f), f).toEqual({ d: true, sp: true, pub: false, app: true, cmt: true });
    for (const f of internals) expect(await of(f), f).toMatchObject({ pub: false, app: false, cmt: false });
  });
});
