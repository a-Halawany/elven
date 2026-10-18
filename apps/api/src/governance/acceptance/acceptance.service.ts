/**
 * B107 §AR (0115_b107_x_ar) — SCOPE-SPECIFIC ACCEPTANCE: the orchestration the ports do not do.
 *
 *   THE EVIDENCE VAULT (INF-OP-12, DAT-OP-12): items recorded by reference (B94's records and the shared artifacts verified, never rewritten).
 *   PROPOSE (PR-71-001/-002, ADR-023, PAT-48): the exact scope tuple; the port refuses blanket, missing, stale and held.
 *   VERIFY (JRN-24 customer verify) → ATTEST each obligation (PR-71-003, ES-71-002): SIGNED FIRST (SignatureService, subject
 *     `acceptance_attestation`, bound to governance.acceptance.attest) and then the port verifies the signature and the approver test.
 *   THE SWEEP (FEX-31, ES-71-004/-005, IA-71-005): the attention tick's STEP `acceptance-evidence-expiry` (inside the tick's write) and the
 *     `acceptance.evidence_expiry` TIMER (WorkflowTimerRegistry, fired by the tick's step 20); an explicit run (governance.acceptance.sweep).
 *   THE GATE (Q5): the product authority marks a capability enforce_acceptance (PLATFORM); the pipeline's `B107 acceptance` block asks.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-acceptance-b107); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK personas;
 * every record claim = 'demonstration'); REAL ACCEPTANCE (named independent and customer authorities — R2; production admission R1) — never
 * claimed, and the record cannot carry it.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { WorkflowTimerRegistry } from '../../executive/workflow/timers.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, domainRoute, governedRead, governedWrite, platformRoute, receipt, refuseGovernance } from '../seams.js';
import { AcceptanceCap, type AcceptanceCapability } from './acceptance.capabilities.js';
import { acceptanceGateCache } from './acceptance-gate.js';
import { consequencePreview } from './acceptance-logic.js';

type Row = Record<string, unknown>;
export const READ = 'governance.acceptance.read';
export const SWEEP_STEP = 'acceptance-evidence-expiry';
export const EXPIRY_TIMER = 'acceptance.evidence_expiry';
export const AR_BOUNDARY = `${BOUNDARY} §AR: an acceptance record here is scope-specific and claim = demonstration; the attesters on a demonstration are SYNTHETIC personas; the named real authorities (ES-71-002 staffing — H2) and the real independent and customer acceptance (R2) are external.`;

@Injectable()
export class AcceptanceService implements OnModuleInit {
  private readonly log = new Logger('governance.acceptance');
  /** The executive signer (stateless — the key by reference from the environment, as every B36 / B94 part signs). */
  readonly signer = new SignatureService();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null; let timers: WorkflowTimerRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    try { timers = this.moduleRef.get(WorkflowTimerRegistry, { strict: false }); } catch { timers = null; }
    if (timers !== null) {
      timers.register({ kind: EXPIRY_TIMER, handle: async (c, t) => AcceptanceCap(c.tx, 'executive.attention.tick').timer({ timerId: t.timer_id, t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    } else this.log.warn('no workflow timer registry in this application: acceptance.evidence_expiry timers are not fired (the sweep still reconciles)');
    if (ticks === null) { this.log.warn('no attention tick registry in this application: acceptance records are not swept'); return; }
    // the sweep, a tick STEP (inside the tick's write, bound to executive.attention.tick; nothing written when nothing changed)
    ticks.register({ name: SWEEP_STEP, order: 42, run: async (c) => AcceptanceCap(c.tx, 'executive.attention.tick').sweep({ t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, objectId: string | null, fn: (cap: AcceptanceCapability) => Promise<T>) {
    return governedRead(this.pipeline, env, p, domainRoute(t, d, READ, objectType, objectId), AcceptanceCap, fn);
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, fn: (cap: AcceptanceCapability) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, domainRoute(t, d, action, objectType, objectId), AcceptanceCap, async (cap) => ({ result: await fn(cap) }));
  }

  // ───────────────────────── THE WORKSPACE READ ─────────────────────────
  /** The domain's acceptance workspace: the records (every version; proposals never styled as acceptances — the page's), the evidence vault
   *  with currency, the accepted-scope answer per subject, the journeys, the review triggers, the expansion holds, the attestation tasks and
   *  open attention, the gate's register, the subjects and exceptions a record may name, the ledger. */
  async workspace(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'ACR', null, async (cap) => {
      const records = await cap.records(300);
      const latest = new Map<string, Row>();
      for (const r of records) { const k = String(r['record_id']); if (!latest.has(k)) latest.set(k, r); }
      const journeys: Record<string, Row | null> = {};
      for (const r of latest.values()) journeys[`${String(r['record_id'])}:${String(r['version'])}`] = await cap.journey(String(r['record_id']), Number(r['version']));
      const keys = [...new Set([...latest.values()].map((r) => String(r['subject_key'])))].sort();
      const scopes: Row[] = [];
      for (const k of keys) scopes.push(await cap.scope(t, d, k));
      return { records, journeys, scopes, evidence: await cap.evidence(300), triggers: await cap.triggers(100), holds: await cap.holds(), enforcement: await cap.enforcement(),
               subjects: await cap.subjects(), exceptions: await cap.exceptions(), items: await cap.items(), tasks: await cap.tasks(), ledger: await cap.ledger(100), read_at: await cap.now() };
    });
    return { ...out.result, signer: this.signer.publicKey() === null ? null : { key_id: this.signer.publicKey()?.keyId }, boundary: AR_BOUNDARY, receipt: receipt(out) };
  }
  /** The accepted-scope read for one subject (FEX-31, CAP-AU-11). */
  async scope(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, key: string) {
    const out = await this.read(env, p, t, d, 'ACR', null, async (cap) => cap.scope(t, d, key));
    return { scope: out.result, boundary: AR_BOUNDARY, receipt: receipt(out) };
  }
  /** OBJ-40's attestation preview: the exact version and digest, the caller's eligibility per obligation (in words), the consequence preview,
   *  the journey, what the sweep would find now. */
  async preview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, version: number) {
    const out = await this.read(env, p, t, d, 'ACR', recordId, async (cap) => {
      const record = (await cap.records(300)).find((r) => r['record_id'] === recordId && Number(r['version']) === version) ?? null;
      if (record === null) return null;
      return { record, eligibility: await cap.eligibility(recordId, version, p.principalId), journey: await cap.journey(recordId, version), findings: await cap.findings(recordId, version),
               consequence: consequencePreview(record as never), read_at: await cap.now() };
    });
    if (out.result === null) throw refuseGovernance('acceptance record', 'unknown_record', `${recordId} v${version} is not an acceptance record of this domain`, env.correlation_id, 404);
    return { ...out.result, boundary: AR_BOUNDARY, receipt: receipt(out) };
  }
  /** THE REPLAY: a record's history, oldest first, from the ledger alone. */
  async history(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string) {
    const out = await this.read(env, p, t, d, 'ACR', recordId, async (cap) => ({ events: await cap.history(recordId), read_at: await cap.now() }));
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE WRITES ─────────────────────────
  async recordEvidence(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { kind: string; title: string; subjectKind: string; subjectId: string | null; subjectVersion: number | null;
                         digest: string | null; pointer: string | null; covers: Row; outcome: string; capturedAt: string; validUntil: string; renews: string | null }) {
    const evidenceId = newId();
    const out = await this.write(env, p, t, d, 'governance.acceptance.evidence.record', 'AEV', evidenceId, (cap) => cap.recordEvidence({ evidenceId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { evidence: out.result, receipt: receipt(out) };
  }
  async propose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { recordId: string | null; kind: string; title: string; subjectKey: string; scope: Row; obligations: string[];
                  evidence: string[]; conditions: Row[]; exceptions: string[]; operational: Row | null; builders: string[]; expectedVersion: number }) {
    const recordId = b.recordId ?? newId();
    const out = await this.write(env, p, t, d, 'governance.acceptance.propose', 'ACR', recordId, (cap) => cap.propose({ ...b, recordId, t, d, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async verify(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, b: { version: number; digest: string; outcome: string; findings: string }) {
    const out = await this.write(env, p, t, d, 'governance.acceptance.verify', 'ACR', recordId, (cap) => cap.verify({ recordId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { verification: out.result, receipt: receipt(out) };
  }
  /** ATTEST: signed first (only the version's own digest, only while proposed) — the port then verifies the signature and every rule. */
  async attest(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, b: { version: number; obligation: string; decision: 'attest' | 'withhold'; digest: string; reason: string }) {
    const action = 'governance.acceptance.attest';
    const out = await this.write(env, p, t, d, action, 'ACR', recordId, async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'attest') {
        const v = await cap.recordVersion(recordId, b.version);
        // sign only the version's own digest, while proposed, and never twice for one person (the port answers that in its own words)
        if (v !== null && v['state'] === 'proposed' && v['digest'] === b.digest && !(await cap.attestedBy(recordId, b.version, p.principalId))) {
          const s = await this.signer.sign(cap, { tenantId: t, domainId: d, action, kind: 'acceptance_attestation' as unknown as SignatureSubjectKind, subjectId: recordId, subjectVersion: b.version,
                                                  subjectDigest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
          signatureId = String(s['signature_id'] ?? '') || null;
        }
      }
      return cap.attest({ recordId, t, d, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { attestation: out.result, receipt: receipt(out) };
  }
  async trigger(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, b: { kind: string; policy: string; detail: Row; reason: string }) {
    const out = await this.write(env, p, t, d, 'governance.acceptance.trigger', 'ACR', recordId, (cap) => cap.trigger({ recordId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async conditionMet(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, b: { version: number; key: string; evidenceId: string; reason: string }) {
    const out = await this.write(env, p, t, d, 'governance.acceptance.condition.close', 'ACR', recordId, (cap) => cap.conditionMet({ recordId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { condition: out.result, receipt: receipt(out) };
  }
  async withdraw(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'governance.acceptance.withdraw', 'ACR', recordId, (cap) => cap.withdraw({ recordId, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  /** An explicit reconciliation (the steward or the operations authority) — the same port the tick's step runs. */
  async sweep(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.write(env, p, t, d, 'governance.acceptance.sweep', 'ACR', null, (cap) => cap.sweep({ t, d, actor: p.principalId, correlationId: env.correlation_id }));
    return { sweep: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE GATE's REGISTER (PLATFORM) ─────────────────────────
  async enforce(env: Envelope, p: AuthenticatedPrincipal, b: { capabilityKey: string; enforced: boolean; prefixes: string[]; reason: string }) {
    const out = await governedWrite(this.pipeline, env, p, platformRoute('governance.acceptance.enforce', 'CAP', null), AcceptanceCap,
      async (cap) => ({ result: await cap.enforce({ ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    acceptanceGateCache.invalidate();
    return { enforcement: out.result, receipt: receipt(out) };
  }
  async enforcementRead(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await governedRead(this.pipeline, env, p, platformRoute(READ, 'CAP', null), AcceptanceCap, async (cap) => ({ enforcement: await cap.enforcement(), subjects: await cap.subjects(), read_at: await cap.now() }));
    return { ...out.result, boundary: AR_BOUNDARY, receipt: receipt(out) };
  }
  /** A recorded attestation signature verified against the bound key (the workspace shows it). */
  verifySignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.signer.verify(row); }
}
