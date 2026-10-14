/**
 * B94 §IM+§AD (0114 §IM) — THE IMPLEMENTATION PROGRAMME'S SERVICE (D8, D9, D12; PR-68-001..006, CAP-DL-07/08, AT-68, WS-20): the
 * orchestration the ports do not do — the workspace's reads composed under the reader's own RLS (a person's records filtered per person),
 * the gate read LIVE before any act that names its digest, the SIGNING of a go-live approval and of a residual-risk acceptance in the same
 * transaction as the port (SignatureService; sealed by implementation.seal_signature — a deferred constraint refuses an unsigned one), and the
 * HELD path: a go-live refused 409 `held` by the port is followed by the gate's recorded evaluation (the `implementation.readiness` item and,
 * for an owner gap, `responsibility.gap` raised — IA-04-005) under the refused human's own `implementation.gate.evaluate`, then the refusal
 * is answered in the port's words.
 *
 * Every rule is a port's. THREE CLAIMS: construction (this code), demonstrated operation (the act's SYNTHETIC personas), real customer
 * acceptance (R2 — never claimed: every go-live record says `demonstration`).
 */
import { HttpException, Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { asObservationRefusal } from '../../observation/observation-errors.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, domainRoute, governedRead, governedWrite, receipt, refuseDelivery, tenantRoute, type DeliveryNoun } from '../seams.js';
import { ImplementationCapability, type ImplementationReads, type ImplementationWrites } from './implementation.capabilities.js';
import { ADOPTION_CONTRACTS } from './adoption-definitions.js';

type Row = Record<string, unknown>;
export const READ = 'implementation.read';
export const SELF_READ = 'implementation.self.read';
/** The signature subject kind of a go-live and a residual-risk acceptance (0114 §0.3; the prelude's SignatureSubjectKind type does not list B94's kinds yet). */
const READINESS_KIND: SignatureSubjectKind = 'readiness';
export const IM_BOUNDARY = `${BOUNDARY} The go-live gate is released only by readiness (never by a measure, a cohort result or a percentage); an unfilled accountable role, an unresolved owner and an inaccessible path are never overridable; training and competence are complete | not_yet, subject-visible, purpose-bound (enablement readiness), cohorts only above k = 5.`;

const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class ImplementationService {
  /** The executive signer (no dependencies — the B36 signer by key reference; a deployment that binds no key refuses the signed acts). */
  private readonly signer = new SignatureService();
  constructor(private readonly pipeline: PipelineService) {}

  private tread<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, objectId: string | null, fn: (cap: ImplementationReads) => Promise<T>) {
    return governedRead(this.pipeline, env, p, tenantRoute(t, READ, 'IMP', objectId), ImplementationCapability.read, fn);
  }
  private dread<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string | null, fn: (cap: ImplementationReads) => Promise<T>, action = READ) {
    return governedRead(this.pipeline, env, p, domainRoute(t, d, action, 'IMP', objectId), ImplementationCapability.read, fn);
  }
  private twrite<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, action: string, objectId: string | null, fn: (cap: ImplementationWrites) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, tenantRoute(t, action, 'IMP', objectId), ImplementationCapability.write, async (cap) => ({ result: await fn(cap) }));
  }
  private dwrite<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectId: string | null, fn: (cap: ImplementationWrites) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, domainRoute(t, d, action, 'IMP', objectId), ImplementationCapability.write, async (cap) => ({ result: await fn(cap) }));
  }

  // ───────────────────────── the workspace's reads (WS-20; status of the gate and its blocking items first) ─────────────────────────
  async list(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string | null) {
    const read = async (cap: ImplementationReads) => {
      const programmes = await cap.programmes(d);
      const out: Row[] = [];
      for (const pr of programmes) {
        const gate = ['accepted', 'withdrawn'].includes(String(pr['state'])) ? null : await cap.gate(t, String(pr['target_domain_id']), String(pr['programme_id']));
        out.push({ ...pr, gate: gate === null ? { state: pr['state'] } : { state: gate['state'], digest: gate['digest'], blocking: gate['blocking'] } });
      }
      return { programmes: out, read_at: await cap.now() };
    };
    const r = d === null ? await this.tread(env, p, t, null, read) : await this.dread(env, p, t, d, null, read);
    return { ...r.result, boundary: IM_BOUNDARY, receipt: receipt(r) };
  }

  /** One programme as the workspace shows it: the gate (live) and its blocking items FIRST, then readiness, enablement (coverage counts; the
   *  person records the reader may see), cohorts and adoption measures, shadow findings and reviews, the go-live decisions with their
   *  signatures, the programme's parts, changes, versions, the routed items and the ledger. */
  async detail(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string | null, programmeId: string) {
    const read = async (cap: ImplementationReads) => {
      const pr = await cap.programme(programmeId);
      if (pr === null || (d !== null && pr['target_domain_id'] !== d)) return null;
      const dom = String(pr['target_domain_id']);
      const items = await cap.items(programmeId);
      const measureKeys = [...new Set([...ADOPTION_CONTRACTS.map((c) => c.metricKey), 'MET-039',
        ...items.filter((i) => i['kind'] === 'value_measure').map((i) => String((i['attributes'] as Row)['metric_key']))])];
      const readiness = await cap.readiness(programmeId);
      const changes = await cap.changes(programmeId);
      const decisions = await cap.decisions(programmeId);
      const residuals = await cap.residuals(programmeId);
      return {
        programme: pr, gate: await cap.gate(t, dom, programmeId), readiness, residuals, decisions,
        enablement: { coverage: await cap.coverage(t, dom), paths: await cap.paths(dom), records: await cap.personRecords(dom) },
        cohorts: await cap.cohorts(programmeId), measures: await cap.measures(dom, measureKeys), shadow: await cap.shadow(dom, programmeId),
        items, changes, versions: await cap.versions(programmeId), evaluations: await cap.evaluations(programmeId, 20), attention: await cap.attention(programmeId),
        tasks: await cap.tasks(programmeId), cadences: await cap.cadences(dom),
        ledger: await cap.ledger([programmeId, ...readiness.map((x) => String(x['item_id'])), ...changes.map((x) => String(x['change_id'])),
                                  ...decisions.map((x) => String(x['decision_id'])), ...residuals.map((x) => String(x['acceptance_id']))], 200),
        read_at: await cap.now(),
      };
    };
    const r = d === null ? await this.tread(env, p, t, programmeId, read) : await this.dread(env, p, t, d, programmeId, read);
    if (r.result === null) throw refuseDelivery('implementation programme', 'unknown_programme', `${programmeId} is not an implementation programme ${d === null ? 'of this tenant' : 'of this domain'}`, env.correlation_id, 404);
    return { ...r.result, boundary: IM_BOUNDARY, receipt: receipt(r) };
  }

  /** The caller's OWN training and competence records (subject-visible: PR-68-002, the privacy boundary). */
  async myRecords(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const r = await this.dread(env, p, t, d, p.principalId, async (cap) => ({ ...(await cap.ownRecords(p.principalId, d)), read_at: await cap.now() }), SELF_READ);
    return { ...r.result, note: 'your own records: complete | not_yet, for enablement readiness only — never a score, a rank or a performance purpose', receipt: receipt(r) };
  }

  // ───────────────────────── §IM.1 the programme (TENANT acts) ─────────────────────────
  async open(env: Envelope, p: AuthenticatedPrincipal, t: string, b: { key: string; title: string; targetDomainId: string; onboardingProgrammeId: string | null; profile: string; plan: Row }) {
    const programmeId = newId();
    const r = await this.twrite(env, p, t, 'implementation.programme.open', programmeId, (cap) => cap.open({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: r.result, receipt: receipt(r) };
  }
  async revise(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { expectedVersion: number; title: string | null; plan: Row | null; onboardingProgrammeId: string | null; profile: string | null }) {
    const r = await this.twrite(env, p, t, 'implementation.programme.revise', programmeId, (cap) => cap.revise({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: r.result, receipt: receipt(r) };
  }
  async transition(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { act: string; expectedVersion: number; reason: string }) {
    const r = await this.twrite(env, p, t, `implementation.programme.${b.act}`, programmeId, (cap) => cap.transition({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: r.result, receipt: receipt(r) };
  }
  async recordItem(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { kind: string; key: string; title: string | null; attributes: Row; expectedVersion: number; retire: boolean }) {
    const itemId = newId();
    const r = await this.twrite(env, p, t, 'implementation.item.record', programmeId, (cap) => cap.recordItem({ itemId, programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { item: r.result, receipt: receipt(r) };
  }
  async proposeChange(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { title: string; description: string; impact: Row }) {
    const changeId = newId();
    const r = await this.twrite(env, p, t, 'implementation.change.propose', changeId, (cap) => cap.proposeChange({ changeId, programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { change: r.result, receipt: receipt(r) };
  }
  async decideChange(env: Envelope, p: AuthenticatedPrincipal, t: string, changeId: string, b: { decision: string; digest: string; reason: string }) {
    const r = await this.twrite(env, p, t, 'implementation.change.approve', changeId, (cap) => cap.decideChange({ changeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { change: r.result, receipt: receipt(r) };
  }

  // ───────────────────────── §IM.2 readiness and the gate (DOMAIN acts on the target domain) ─────────────────────────
  async declareReadiness(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string,
                         b: { key: string; kind: string; title: string; spec: Row; blocking: boolean; accountableRole: string | null; expectedVersion: number }) {
    const itemId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.readiness.declare', programmeId, (cap) => cap.declareReadiness({ itemId, programmeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { item: r.result, receipt: receipt(r) };
  }
  async retireReadiness(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, itemId: string, b: { expectedVersion: number; reason: string }) {
    const r = await this.dwrite(env, p, t, d, 'implementation.readiness.retire', itemId, (cap) => cap.retireReadiness({ itemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { item: r.result, receipt: receipt(r) };
  }
  async confirmReadiness(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, itemId: string, b: { version: number; digest: string; statement: string }) {
    const confirmationId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.readiness.confirm', itemId, (cap) => cap.confirmReadiness({ confirmationId, itemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { confirmation: r.result, receipt: receipt(r) };
  }
  /** RESIDUAL RISK (the onboarding authority): the port checks and records, the signer signs its digest, the seal binds the signature — one transaction. */
  async acceptResidual(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, itemId: string, b: { version: number; digest: string; reason: string }) {
    const acceptanceId = newId();
    const action = 'implementation.readiness.accept_residual';
    const r = await this.dwrite(env, p, t, d, action, itemId, async (cap) => {
      const row = await cap.acceptResidual({ acceptanceId, itemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id });
      const sig = await this.signer.sign(cap, { tenantId: t, domainId: d, action, kind: READINESS_KIND, subjectId: acceptanceId, subjectVersion: 1, subjectDigest: String(row['digest']), actor: p.principalId, correlationId: env.correlation_id });
      const seal = await cap.seal({ kind: 'residual', subjectId: acceptanceId, tenantId: t, domainId: d, signatureId: String(sig['signature_id']), actor: p.principalId, correlationId: env.correlation_id });
      return { ...row, signature: seal };
    });
    return { acceptance: r.result, receipt: receipt(r) };
  }
  async evaluateGate(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string) {
    const evaluationId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.gate.evaluate', programmeId, (cap) => cap.recordGate({ evaluationId, programmeId, tenantId: t, domainId: d, actor: p.principalId, correlationId: env.correlation_id }));
    return { gate: r.result, receipt: receipt(r) };
  }

  // ───────────────────────── §IM.3 go-live ─────────────────────────
  /** GO-LIVE: the port decides (the approver test, the gate READY at the digest named, the cadence and the priority journeys); an approval
   *  is signed and sealed in the same transaction. A `held` refusal records the gate's evaluation (raising its items) as the refused human,
   *  then answers the port's refusal. Withholding is recorded and changes nothing else (WS-20: prior safe operation preserved). */
  async golive(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string, b: { decision: 'approve' | 'withhold'; gateDigest: string; cadenceId: string | null; journeys: string[]; reason: string }) {
    const decisionId = newId();
    const action = 'implementation.golive.approve';
    try {
      const r = await this.dwrite(env, p, t, d, action, programmeId, async (cap) => {
        const row = await cap.decideGolive({ decisionId, programmeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id });
        if (b.decision !== 'approve') return { ...row, signature: null };
        const sig = await this.signer.sign(cap, { tenantId: t, domainId: d, action, kind: READINESS_KIND, subjectId: decisionId, subjectVersion: 1, subjectDigest: String(row['digest']), actor: p.principalId, correlationId: env.correlation_id });
        const seal = await cap.seal({ kind: 'golive', subjectId: decisionId, tenantId: t, domainId: d, signatureId: String(sig['signature_id']), actor: p.principalId, correlationId: env.correlation_id });
        return { ...row, signature_id: seal['signature_id'], signature: seal };
      });
      return { decision: r.result, receipt: receipt(r) };
    } catch (e) {
      const mapped = e instanceof HttpException ? e : asObservationRefusal(e, env.correlation_id);
      if (mapped !== null && mapped.getStatus() === 409 && /^go-live gate rejected \(held\)/.test(textOf(mapped))) {
        let gate: Row | null = null;
        try { gate = (await this.evaluateGate(env, p, t, d, programmeId)).gate as Row; } catch { gate = null; }
        const err = mapped.getResponse() as Row;
        throw new HttpException({ ...err, gate: gate === null ? null : { state: gate['state'], digest: gate['digest'], blocking: gate['blocking'], raised: gate['raised'] } }, 409);
      }
      throw e;
    }
  }

  // ───────────────────────── §AD enablement, cohorts, shadow workflows ─────────────────────────
  async declarePath(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { programmeId: string | null; key: string; title: string | null; roles: string[]; contentRef: string | null; expectedVersion: number; retire: boolean }) {
    const pathId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.training.path.declare', pathId, (cap) => cap.declarePath({ pathId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { path: r.result, receipt: receipt(r) };
  }
  async attestPath(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, pathId: string, b: { version: number; digest: string; verdict: string; statement: string }) {
    const attestationId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.training.path.attest', pathId, (cap) => cap.attestPath({ attestationId, pathId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { attestation: r.result, receipt: receipt(r) };
  }
  async recordTraining(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { pathId: string; version: number; subject: string; outcome: string; purpose: string; note: string | null; retainDays: number | null }) {
    const recordId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.training.record', recordId, (cap) => cap.recordTraining({ recordId, pathId: b.pathId, tenantId: t, domainId: d, version: b.version, subject: b.subject,
      state: b.outcome, purpose: b.purpose, note: b.note, retainDays: b.retainDays, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: r.result, receipt: receipt(r) };
  }
  async recordCompetence(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; role: string; subject: string; outcome: string; purpose: string; note: string | null; retainDays: number | null }) {
    const recordId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.competence.record', recordId, (cap) => cap.recordCompetence({ recordId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: r.result, receipt: receipt(r) };
  }
  async declareCohort(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string, b: { dimensions: Row; from: string | null; to: string | null }) {
    const cohortId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.cohort.declare', cohortId, (cap) => cap.declareCohort({ cohortId, programmeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { cohort: r.result, receipt: receipt(r) };
  }
  async recordShadow(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { sourceId: string; attempt: Row }) {
    const findingId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.shadow.record', findingId, (cap) => cap.recordShadow({ findingId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { finding: r.result, receipt: receipt(r) };
  }
  async resolveShadow(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, findingId: string, remediation: string) {
    const r = await this.dwrite(env, p, t, d, 'implementation.shadow.resolve', findingId, (cap) => cap.resolveShadow({ findingId, tenantId: t, domainId: d, remediation, actor: p.principalId, correlationId: env.correlation_id }));
    return { finding: r.result, receipt: receipt(r) };
  }
  async reviewShadow(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string, statement: string) {
    const reviewId = newId();
    const r = await this.dwrite(env, p, t, d, 'implementation.shadow.review', reviewId, (cap) => cap.reviewShadow({ reviewId, programmeId, tenantId: t, domainId: d, statement, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: r.result, receipt: receipt(r) };
  }

  /** A refusal in the class form for a parser's answer (the caller's own request). */
  static refuse(noun: DeliveryNoun, cls: string, message: string, correlationId: string, status = 422): HttpException { return refuseDelivery(noun, cls, message, correlationId, status); }
}
