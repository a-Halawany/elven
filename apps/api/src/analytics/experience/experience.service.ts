/**
 * B92 §UX (0113_b92_x_ux; UX-70-001..006, CAP-PD-09; DESIGN D12–D14) — THE EXPERIENCE SERVICE: one governed port, route and receipt per verb —
 * consent (the person's own), define / review / hold / release / retire telemetry, record (pseudonymous, minimised, under consent), journeys,
 * segments, baselines, thresholds, experiments (propose, two approvals, assignment, analysis, conclusion), findings and the human-decided
 * actions they lead to (with the consequence preview), the purge, the export; and the reads (the person's own state, the workspace with the
 * four-part anatomy, the preview, an export). Every rule is a port's; a refusal is the port's text in the class form `<noun> rejected
 * (<class>): …`.
 *
 * THE TELEMETRY RECORD: the envelope's audit names the act (who recorded A telemetry event, when) — never the stored event: the route passes no
 * object id, the port takes no correlation id and returns no event id, the row keeps the UTC day only. An attempt the port COUNTS but does not
 * collect (held, retired, purpose unavailable, outside the whitelist) is committed with its count and THEN answered with the port's refusal
 * (the B21.2 evidence idiom: the audit row says TELEMETRY_NOT_COLLECTED; a thrown refusal would roll the count back); a person without consent
 * is answered `{collected: false, reason: 'not_consented'}` — never an error.
 *
 * CLAIMS: software capability. Harness and demo data are SYNTHETIC; the signed acceptance (UX-70-006) is R2 / B107's.
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { refuseAnalytics } from '../seams.js';
import { ExperienceCapability, type ExperienceReads, type ExperienceWrites } from './experience.capabilities.js';
import { BOUNDARY_UX } from './experience-logic.js';

type Row = Record<string, unknown>;
export const ANALYTICS_READ = 'analytics.read';
export const CONSENT_READ = 'analytics.consent.read';
export const ASSIGNMENT_READ = 'analytics.experiment.assignment.read';
type Effect<T> = { result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null; evidence?: { outcome?: 'success'; resultCode: string; metadata?: Record<string, unknown> } };

@Injectable()
export class ExperienceService {
  constructor(private readonly pipeline: PipelineService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, fn: (cap: ExperienceReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), ExperienceCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, fn: (cap: ExperienceWrites) => Promise<Effect<T>>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), ExperienceCapability.write,
      async (cap) => {
        const r = await fn(cap);
        return { result: r.result, targetType: r.targetType === undefined ? objectType : r.targetType, targetId: r.targetId === undefined ? objectId : r.targetId,
                 targetVersion: r.targetVersion ?? null, outboxEvent: null, ...(r.evidence === undefined ? {} : { evidence: r.evidence }) };
      });
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }
  private async simple(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, type: string, id: string | null, key: string,
                       fn: (cap: ExperienceWrites) => Promise<Row>, targetId?: (r: Row) => string | null) {
    const out = await this.write(env, p, t, d, action, type, id, async (cap) => { const r = await fn(cap); return { result: r, targetId: targetId === undefined ? id : targetId(r) }; });
    return { [key]: out.result, receipt: ExperienceService.receipt(out) };
  }

  /* ───────────── the person's own ───────────── */
  async self(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, CONSENT_READ, 'ACN', null, async (cap) => cap.self(t, d));
    return { ...out.result, boundary: BOUNDARY_UX, receipt: ExperienceService.receipt(out) };
  }
  consent(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, purposeKey: string, decision: 'granted' | 'withdrawn') {
    const id = newId();
    return this.simple(env, p, t, d, decision === 'granted' ? 'analytics.consent.grant' : 'analytics.consent.withdraw', 'ACN', null, 'consent',
      (cap) => cap.consent({ id, t, d, purposeKey, decision, actor: p.principalId, correlationId: env.correlation_id }), (r) => (r['unchanged'] === true ? null : id));
  }
  async assignment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, experimentId: string) {
    const out = await this.read(env, p, t, d, ASSIGNMENT_READ, 'AEX', experimentId, async (cap) => cap.assignment(t, d, experimentId));
    if (out.result === null) throw refuseAnalytics('ux experiment', 'unknown_experiment', `${experimentId} is not an experiment of this domain`, env.correlation_id, 404);
    return { assignment: out.result, receipt: ExperienceService.receipt(out) };
  }
  /** RECORD: see the header — counted-but-refused attempts are committed, then answered with the port's refusal. */
  async record(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { eventKey: string; outcome: string | null; durationMs: number | null; fields: Row; deviceClass: string | null; locale: string | null; experimentId: string | null }) {
    const out = await this.write(env, p, t, d, 'analytics.telemetry.record', 'ATE', null, async (cap) => {
      const r = await cap.record({ t, d, ...b, actor: p.principalId });
      const collected = r['collected'] === true;
      return { result: r, targetType: 'ATE', targetId: null,
               evidence: { resultCode: collected ? 'OK' : 'TELEMETRY_NOT_COLLECTED', metadata: { collected, reason: r['reason'] ?? null } } };
    });
    const refused = out.result['refused'] as { status: number; cls: string; message: string } | undefined;
    if (refused !== undefined && refused !== null) throw refuseAnalytics('telemetry event', refused.cls, refused.message, env.correlation_id, refused.status);
    return { telemetry: out.result, receipt: ExperienceService.receipt(out) };
  }

  /* ───────────── telemetry definitions ───────────── */
  define(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { eventKey: string; title: string; journeyKey: string; stepKey: string; fields: Row }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.telemetry.define', 'ATD', id, 'definition', (cap) => cap.define({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  review(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string, b: { decision: string; reason: string; digest: string }) {
    return this.simple(env, p, t, d, 'analytics.telemetry.review', 'ATD', id, 'definition', (cap) => cap.review({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  hold(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string, hold: boolean, reason: string) {
    return this.simple(env, p, t, d, hold ? 'analytics.telemetry.hold' : 'analytics.telemetry.release', 'ATD', id, 'definition',
      (cap) => cap.hold({ id, t, d, hold, reason, actor: p.principalId, correlationId: env.correlation_id }));
  }
  retire(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string, reason: string) {
    return this.simple(env, p, t, d, 'analytics.telemetry.retire', 'ATD', id, 'definition', (cap) => cap.retire({ id, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }));
  }
  purge(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reason: string) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.telemetry.purge', 'APG', id, 'purge', (cap) => cap.purge({ id, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }));
  }

  /* ───────────── journeys, segments, baselines, thresholds ───────────── */
  journey(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; title: string; purposeKey: string; objective: string; objectiveIds: string[]; steps: string[]; floor: number | null }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.journey.declare', 'AJN', id, 'journey', (cap) => cap.journey({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  segment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; dimension: string; value: string; k: number | null }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.segment.declare', 'ASG', id, 'segment', (cap) => cap.segment({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  baseline(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { journeyKey: string; measure: string; stepKey: string | null; segmentKey: string | null; period: string }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.baseline.record', 'ABL', id, 'baseline', (cap) => cap.baseline({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  proposeThreshold(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { journeyKey: string; measure: string; stepKey: string | null; segmentKey: string | null; bound: string; value: number; rationale: string }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.threshold.propose', 'ATH', id, 'threshold', (cap) => cap.proposeThreshold({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  decideThreshold(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string, b: { decision: string; reason: string; digest: string | null }) {
    return this.simple(env, p, t, d, b.decision === 'retire' ? 'analytics.experience.threshold.retire' : 'analytics.experience.threshold.decide', 'ATH', id, 'threshold',
      (cap) => cap.decideThreshold({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }

  /* ───────────── experiments ───────────── */
  proposeExperiment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { journeyKey: string; title: string; hypothesis: string; measure: string; stepKey: string | null; variants: unknown[]; minSample: number }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experiment.propose', 'AEX', id, 'experiment', (cap) => cap.proposeExperiment({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  approveExperiment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, experimentId: string, b: { role: string; decision: string; reason: string; digest: string }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experiment.approve', 'AEX', experimentId, 'experiment',
      (cap) => cap.approveExperiment({ id, t, d, experimentId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  analyse(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, experimentId: string) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experiment.analyse', 'AEX', experimentId, 'analysis',
      (cap) => cap.analyse({ id, t, d, experimentId, actor: p.principalId, correlationId: env.correlation_id }));
  }
  conclude(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, experimentId: string, b: { conclusion: string; arm: string | null; analysisId: string; analysisDigest: string; reason: string }) {
    return this.simple(env, p, t, d, 'analytics.experiment.conclude', 'AEX', experimentId, 'experiment',
      (cap) => cap.conclude({ t, d, experimentId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }

  /* ───────────── findings → actions ───────────── */
  proposeFinding(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { originKind: string; originId: string; journeyKey: string | null; statement: string; evidence: Row }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.finding.propose', 'AFI', id, 'finding', (cap) => cap.proposeFinding({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
  }
  async preview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, findingId: string, kind: string | null, targetId: string | null) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'AFI', findingId, async (cap) => cap.preview(t, d, findingId, kind, targetId));
    if (out.result === null) throw refuseAnalytics('experience action', 'unknown_finding', `${findingId} is not a finding of this domain`, env.correlation_id, 404);
    return { preview: out.result, receipt: ExperienceService.receipt(out) };
  }
  decideAction(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, findingId: string, b: { decision: string; kind: string | null; targetId: string | null; reason: string; findingDigest: string; previewDigest: string }) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.experience.action.decide', 'AAC', findingId, 'action',
      (cap) => cap.decideAction({ id, t, d, findingId, ...b, actor: p.principalId, correlationId: env.correlation_id }), () => id);
  }

  /* ───────────── the export and the reads ───────────── */
  exportCreate(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, title: string) {
    const id = newId();
    return this.simple(env, p, t, d, 'analytics.export.create', 'AXP', id, 'export', (cap) => cap.exportCreate({ id, t, d, title, actor: p.principalId, correlationId: env.correlation_id }));
  }
  async exportRead(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, exportId: string) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'AXP', exportId, async (cap) => cap.exportRead(exportId));
    if (out.result === null) throw refuseAnalytics('analytics export', 'unknown_export', `${exportId} is not an export of this domain`, env.correlation_id, 404);
    return { export: out.result, receipt: ExperienceService.receipt(out) };
  }
  async workspace(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, ANALYTICS_READ, 'AJN', null, async (cap) => cap.workspace(t, d));
    return { ...out.result, boundary: BOUNDARY_UX, receipt: ExperienceService.receipt(out) };
  }
}
