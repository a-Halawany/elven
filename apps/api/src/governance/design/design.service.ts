/**
 * B107 §DG (0115_b107_x_dg; F-P7-E-17) — DESIGN GOVERNANCE: the orchestration the ports do not do.
 *
 *   THE BASELINE (UX-01, UX-ADR-001): register (proposed) → compare → attest (the Design System Authority, SIGNED `baseline_decision` first —
 *     the port verifies it) | reject; an attestation whose members do not resolve to an approved owner is HELD (the hold commits, then 409).
 *   THE ASSETS (REL-01): the inventory (read FIRST from the repository by design-source.ts, then registered) and the owner's approval.
 *   THE PRINCIPLES (UX-03): declared by the authority; the LINT (design-lint.ts — the repository read first, the evaluation recorded after);
 *     a review; NARROW expiring exceptions (signed `exception_approval`).
 *   THE CONTRIBUTIONS (UX-72): propose / amend / review / accept (SIGNED `design_contribution`) / reject / publish / deprecate / adopt / measure /
 *     migrate / retire / close — each its own action; a HELD step commits its hold, then 409.
 *   THE TRACE (UX-08, REL-02): links recorded; the bidirectional trace, orphans and contradictions read.
 *   EXPERIENCE LEARNING (UX-ADR-024): the intake route and the attention tick's step `design-experience-intake` open contribution proposals
 *     from B92 `design_change_proposal` actions — nothing else.
 *   DESIGN ACCEPTANCE (UX-ADR-023, REL-24; DOMAIN): propose → attest per obligation (SIGNED executive.signatures `design_acceptance`) →
 *     accepted; the tick's step `design-acceptance-expiry` withholds an accepted record whose evidence expired (attention raised).
 *   THE CONFORMANCE PACKAGE (UX-70-006, UX-66-006; DOMAIN): generated and LEFT UNSIGNED (R2).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-design-b107); DEMONSTRATED OPERATION (SYNTHETIC personas, `claim = demonstration`);
 * REAL ACCEPTANCE (named independent design authorities, H3 / R2) — never claimed. MET-034 stays unsupported; the context bar stays B80's.
 */
import { createHash } from 'node:crypto';
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, derive, domainRoute, platformRoute, receipt, refuseGovernance, type GovernanceNoun } from '../seams.js';
import { DesignCap, type DesignCapability } from './design.capabilities.js';
import { compareBaselines, eligibility, nextSteps, OBLIGATION_ROLE, stepAction, type BaselineVersion, type ContributionStep, type Obligation } from './design-logic.js';
import { lintDesign } from './design-lint.js';
import { inventoryFrom, readRepository } from './design-source.js';
import { signPlatform } from './design-signing.js';
/* B82 cf: dg-lint-4 (the chart-grammar lint) and its ratchet */
import { chartRatchet, lintCharts } from './charts/chart-lint.js';
import { CHART_LINT_RATCHET } from './charts/chart-lint-ratchet.js';
/* end B82 cf */

type Row = Record<string, unknown>;
export const READ = 'governance.read';
export const INTAKE_STEP = 'design-experience-intake';
export const EXPIRY_STEP = 'design-acceptance-expiry';
export const DG_BOUNDARY = `${BOUNDARY} §DG: a design acceptance or a conformance package here is construction and demonstration evidence; the signed acceptance of the independent conformance package (UX-70-006, UX-66-006) by named independent authorities is R2 / H3 and is never recorded here — the package is left UNSIGNED. MET-034 stays unsupported (B108 → H3). The general context bar is B80's.`;
const TICK = 'executive.attention.tick';

@Injectable()
export class DesignGovernanceService implements OnModuleInit {
  private readonly log = new Logger('governance.design');
  /** The DOMAIN signer (executive.signatures `design_acceptance`) — B36's, stateless, the key by reference. */
  readonly signer = new SignatureService();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    if (ticks === null) { this.log.warn('no attention tick registry in this application: experience actions are not taken in and design acceptances are not swept by the tick'); return; }
    // EXPERIENCE LEARNING: the agent OPENS proposals only (the port asserts the tick's own action); nothing written when nothing is new
    ticks.register({ name: INTAKE_STEP, order: 27, run: async (c) => DesignCap(c.tx, TICK).intake({ t: c.tenantId, d: c.domainId, actionId: null, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    // EVIDENCE EXPIRY: an accepted design acceptance whose evidence expired is WITHHELD (attention raised); nothing written when nothing expired
    ticks.register({ name: EXPIRY_STEP, order: 28, run: async (c) => DesignCap(c.tx, TICK).sweepAcceptances({ t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private pread<T>(env: Envelope, p: AuthenticatedPrincipal, objectType: string, objectId: string | null, fn: (cap: DesignCapability) => Promise<T>) {
    return this.pipeline.consequentialRead(derive(env, READ, objectType, objectId), p, platformRoute(READ, objectType, objectId), DesignCap, async (cap) => fn(cap));
  }
  private dread<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string, objectId: string | null, fn: (cap: DesignCapability) => Promise<T>) {
    return this.pipeline.consequentialRead(derive(env, READ, objectType, objectId), p, domainRoute(t, d, READ, objectType, objectId), DesignCap, async (cap) => fn(cap));
  }
  private write<T extends Row>(env: Envelope, p: AuthenticatedPrincipal, route: ReturnType<typeof platformRoute>, fn: (cap: DesignCapability) => Promise<T>) {
    return this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, DesignCap, async (cap) => {
      const r = await fn(cap);
      const held = r['held'] === true;
      return { result: r, targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null,
               ...(held ? { evidence: { outcome: 'failure' as const, resultCode: 'EYE-STA-002', metadata: { held: true, blocking: r['blocking'] ?? r['blockers'] ?? null } } } : {}) };
    });
  }
  /** A HELD act: its hold committed with the write (the audit row reads failure), then refused 409 in the server's words with the blocking list. */
  private held(noun: GovernanceNoun, out: { result: Row; policyDecisionId: string; auditSeq: number }, what: string, correlationId: string): never {
    const blocking = (out.result['blocking'] ?? out.result['blockers'] ?? []) as Row[];
    const e = refuseGovernance(noun, 'held', `${what} — ${blocking.map((b) => String(b['reason'])).join('; ')}; the work is preserved and the hold stays visible until it is resolved`, correlationId, 409);
    throw new HttpException({ ...(e.getResponse() as Row), held: { blocking, hold_id: out.result['hold_id'] ?? null }, receipt: receipt(out) }, 409);
  }
  private holds(p: AuthenticatedPrincipal, role: string): boolean { return p.bindings.some((b) => b.roleCode === role && b.scope === 'PLATFORM'); }

  // ───────────────────────── THE WORKSPACE (PLATFORM read) ─────────────────────────
  async workspace(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.pread(env, p, 'DSB', null, async (cap) => ({
      authority: { role: 'design_system_authority', holders: await cap.authority(), product_meaning: 'governed by the product authority (UX-01-004)' },
      conformance: await cap.conformance(), baselines: await cap.baselines(), assets: await cap.assets(), principles: await cap.principles(), evaluations: await cap.evaluations(20),
      exceptions: await cap.exceptions(), contributions: (await cap.contributions()).map((c) => ({ ...c, next_steps: nextSteps(String(c['kind']), String(c['stage'])) })),
      orphans: await cap.orphans(), ledger: await cap.ledger(80), read_at: await cap.now(),
    }));
    return { ...out.result, boundary: DG_BOUNDARY, receipt: receipt(out) };
  }
  async trace(env: Envelope, p: AuthenticatedPrincipal, b: { artifactId: string | null; query: string | null; depth: number }) {
    const out = await this.pread(env, p, 'TRC', b.artifactId, async (cap) => {
      if (b.artifactId === null) return { matches: await cap.findArtifacts(b.query ?? '', 40), trace: null };
      const root = await cap.artifact(b.artifactId);
      return root === null ? null : { root, trace: await cap.trace(b.artifactId, b.depth), read_at: await cap.now() };
    });
    if (out.result === null) throw refuseGovernance('design baseline', 'unknown_artifact', `${String(b.artifactId)} is not a current artifact`, env.correlation_id, 404);
    return { ...out.result, receipt: receipt(out) };
  }
  async compare(env: Envelope, p: AuthenticatedPrincipal, baselineId: string, from: number, to: number) {
    const out = await this.pread(env, p, 'DSB', baselineId, async (cap) => ({ a: await cap.baselineVersion(baselineId, from), b: await cap.baselineVersion(baselineId, to) }));
    if (out.result.a === null || out.result.b === null) throw refuseGovernance('design baseline', 'unknown_baseline', `${baselineId} has no version ${out.result.a === null ? from : to}`, env.correlation_id, 404);
    return { comparison: compareBaselines(out.result.a as unknown as BaselineVersion, out.result.b as unknown as BaselineVersion), receipt: receipt(out) };
  }
  /** The approval's preview: what is decided (the exact digest), its consequence, and the CALLER's eligibility in words (the port decides). */
  async preview(env: Envelope, p: AuthenticatedPrincipal, what: 'baseline' | 'contribution' | 'exception' | 'asset', id: string, version: number | null) {
    const out = await this.pread(env, p, what === 'baseline' ? 'DSB' : what === 'contribution' ? 'DSC' : what === 'exception' ? 'DSX' : 'DSA', id, async (cap) => {
      if (what === 'baseline') {
        const b = version === null ? null : await cap.baselineVersion(id, version);
        if (b === null) return null;
        const blockers = (await cap.baselines()).find((x) => x['baseline_id'] === id && x['version'] === version)?.['blockers'] ?? [];
        return { subject: b, digest: b['digest'], consequence: [`version ${version} becomes THE controlling design baseline (the attested one before it is superseded, still readable)`,
                   'the attestation is signed with your key over the digest shown', 'it refines Volumes 0 and 3–8 and never alters them'], blockers,
                 eligibility: eligibility({ kind: p.kind, principal: p.principalId, holds: this.holds(p, 'design_system_authority'), role: 'design_system_authority', proposer: String(b['proposed_by']),
                                            builders: [], state: String(b['state']), expectedState: 'proposed' }) };
      }
      if (what === 'contribution') {
        const c = await cap.contribution(id);
        if (c === null) return null;
        const constitutional = c['constitutional'] === true;
        const role = constitutional ? 'product_authority' : 'design_system_authority';
        return { subject: c, digest: c['digest'], blockers: c['blockers'], consequence: [constitutional ? 'ratifies a constitutional amendment (the product authority\'s act — UX-72-004)' : 'accepts the change into the design system (signed)',
                   'publication writes the next version; the prior version stays readable for its consumers', 'telemetry never changes a pattern: only this human act does'],
                 eligibility: eligibility({ kind: p.kind, principal: p.principalId, holds: this.holds(p, role), role, proposer: String(c['proposed_by']), builders: (c['builders'] ?? []) as string[],
                                            state: String(c['stage']), expectedState: 'in_review' }) };
      }
      if (what === 'exception') {
        const x = await cap.exception(id);
        if (x === null) return null;
        return { subject: x, digest: x['digest'], consequence: ['the principle is waived for ONE asset version only, until the expiry shown; it covers nothing after it'],
                 eligibility: eligibility({ kind: p.kind, principal: p.principalId, holds: this.holds(p, 'design_system_authority'), role: 'design_system_authority', proposer: String(x['requested_by']),
                                            builders: [], owner: (x['asset_owner'] ?? null) as string | null, state: String(x['state']), expectedState: 'requested' }) };
      }
      const a = await cap.asset(id);
      if (a === null) return null;
      return { subject: a, digest: a['digest'], consequence: ['the asset becomes APPROVED with the named person as its one accountable owner (REL-01)'],
               eligibility: eligibility({ kind: p.kind, principal: p.principalId, holds: this.holds(p, 'design_system_authority'), role: 'design_system_authority', proposer: String(a['registered_by']),
                                          builders: [], state: String(a['status']), expectedState: 'proposed' }) };
    });
    if (out.result === null) throw refuseGovernance('design baseline', `unknown_${what}`, `${id} is not a design ${what}${version === null ? '' : ` v${version}`}`, env.correlation_id, 404);
    return { ...out.result, boundary: DG_BOUNDARY, receipt: receipt(out) };
  }

  // ───────────────────────── ASSETS, PRINCIPLES, EVALUATIONS, EXCEPTIONS (PLATFORM writes) ─────────────────────────
  /** The INVENTORY: the repository read FIRST (read-only), then registered; or the given assets. */
  async registerInventory(env: Envelope, p: AuthenticatedPrincipal, given: Row[] | null) {
    let assets = given; let source: Row = { reader: 'request' };
    if (assets === null) {
      const repo = readRepository();
      if (repo === null) throw refuseGovernance('design baseline', 'state', 'this deployment carries no source tree to inventory (apps/web, packages/tokens)', env.correlation_id, 409);
      assets = inventoryFrom(repo.files, repo.versions) as unknown as Row[];
      source = { reader: 'design-source.ts', files: repo.files.length, versions: repo.versions };
    }
    const importId = newId();
    const out = await this.write(env, p, platformRoute('governance.design.asset.register', 'DSA', null), async (cap) =>
      cap.registerAssets({ importId, assets: assets ?? [], source, actor: p.principalId, correlationId: env.correlation_id }));
    return { inventory: out.result, receipt: receipt(out) };
  }
  async approveAsset(env: Envelope, p: AuthenticatedPrincipal, assetId: string, b: { version: number; owner: string; digest: string; reason: string }) {
    const out = await this.write(env, p, platformRoute('governance.design.asset.approve', 'DSA', assetId), async (cap) =>
      cap.approveAsset({ assetId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { asset: out.result, receipt: receipt(out) };
  }
  async declarePrinciple(env: Envelope, p: AuthenticatedPrincipal, b: { key: string; expectedVersion: number; kind: string; statement: string; prohibited: string | null; patterns: string[]; remediation: string;
                                                                       lintRule: string | null; unwaivable: boolean; state: string; reason: string }) {
    const out = await this.write(env, p, platformRoute('governance.design.principle.declare', 'DSP', null), async (cap) => cap.declarePrinciple({ ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { principle: out.result, receipt: receipt(out) };
  }
  /** THE LINT: the web source read FIRST (read-only), linted (pure), then the evaluation recorded (the port judges the verdict). */
  async runLint(env: Envelope, p: AuthenticatedPrincipal, given: { files: Array<{ path: string; text: string }> } | null) {
    const files = given?.files ?? readRepository()?.files ?? null;
    if (files === null) throw refuseGovernance('design principle', 'state', 'this deployment carries no web source to lint', env.correlation_id, 409);
    const lint = lintDesign(files);
    const evaluationId = newId();
    const out = await this.write(env, p, platformRoute('governance.design.evaluate', 'DSE', evaluationId), async (cap) =>
      cap.recordEvaluation({ evaluationId, source: 'lint', assetId: null, assetVersion: null, inputDigest: lint.inputDigest, rulesVersion: lint.rulesVersion,
                             findings: lint.findings.map((f) => ({ rule: f.rule, file: f.file, line: f.line, excerpt: f.excerpt })), actor: p.principalId, correlationId: env.correlation_id }));
    return { evaluation: { ...out.result, files: lint.files, counts: lint.counts }, receipt: receipt(out) };
  }
  /* B82 cf — THE CHART-GRAMMAR LINT (dg-lint-4, UX-ADR-015 / REL-17): the web source read FIRST (read-only), linted (pure), the evaluation
     recorded through B107's port under the principle `design.evidence-bearing-charts` the Design System Authority declares (the port refuses
     a finding naming no active principle — `unknown_principle`), then the RATCHET: the committed findings only shrink. The port judges. */
  async runChartLint(env: Envelope, p: AuthenticatedPrincipal, given: { files: Array<{ path: string; text: string }> } | null) {
    const files = given?.files ?? readRepository()?.files ?? null;
    if (files === null) throw refuseGovernance('design principle', 'state', 'this deployment carries no web source to lint', env.correlation_id, 409);
    const lint = lintCharts(files);
    const evaluationId = newId();
    const out = await this.write(env, p, platformRoute('governance.design.evaluate', 'DSE', evaluationId), async (cap) =>
      cap.recordEvaluation({ evaluationId, source: 'lint', assetId: null, assetVersion: null, inputDigest: lint.inputDigest, rulesVersion: lint.rulesVersion,
                             findings: lint.findings.map((f) => ({ rule: f.rule, principle: f.principle, file: f.file, line: f.line, excerpt: f.excerpt, note: f.note })), actor: p.principalId, correlationId: env.correlation_id }));
    const r = chartRatchet(lint.findings, CHART_LINT_RATCHET);
    return { evaluation: { ...out.result, files: lint.files, counts: lint.counts },
             ratchet: { holds: r.holds, baseline: r.baseline, current: r.current, regressions: r.regressions, resolved: r.resolved.length,
                        rule: 'the committed findings list only shrinks: a finding outside it is a regression; a committed one no longer found is removed from the list' },
             receipt: receipt(out) };
  }
  /* end B82 cf */
  async recordReview(env: Envelope, p: AuthenticatedPrincipal, b: { assetId: string; assetVersion: number; findings: Row[]; notes: string }) {
    const evaluationId = newId();
    const out = await this.write(env, p, platformRoute('governance.design.evaluate', 'DSE', evaluationId), async (cap) =>
      cap.recordEvaluation({ evaluationId, source: 'review', assetId: b.assetId, assetVersion: b.assetVersion, inputDigest: createHash('sha256').update(JSON.stringify({ notes: b.notes, findings: b.findings })).digest('hex'),
                             rulesVersion: 'review', findings: b.findings, actor: p.principalId, correlationId: env.correlation_id }));
    return { evaluation: out.result, receipt: receipt(out) };
  }
  async requestException(env: Envelope, p: AuthenticatedPrincipal, b: { principle: string; assetId: string; reason: string; compensating: string; expiresAt: string; renews: string | null }) {
    const exceptionId = newId();
    const out = await this.write(env, p, platformRoute('governance.design.exception.request', 'DSX', exceptionId), async (cap) => cap.requestException({ exceptionId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { exception: out.result, receipt: receipt(out) };
  }
  async decideException(env: Envelope, p: AuthenticatedPrincipal, exceptionId: string, b: { decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.design.exception.decide';
    const out = await this.write(env, p, platformRoute(action, 'DSX', exceptionId), async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'approve') {
        const x = await cap.exception(exceptionId);
        // sign only the exception's own digest, only when the decision names it (the port refuses a stale digest either way)
        if (x !== null && x['state'] === 'requested' && x['digest'] === b.digest) {
          signatureId = await signPlatform(cap, { action, kind: 'exception_approval', subjectId: exceptionId, subjectVersion: 1, subjectDigest: b.digest, role: 'design_system_authority',
                                                 actor: p.principalId, correlationId: env.correlation_id, noun: 'design principle' });
        }
      }
      return cap.decideException({ exceptionId, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { exception: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE CONTRIBUTION QUEUE ─────────────────────────
  async proposeContribution(env: Envelope, p: AuthenticatedPrincipal, b: { kind: string; target: string | null; proposal: Row; summary: string; plans: Row; constitutional: boolean }) {
    const id = newId();
    const out = await this.write(env, p, platformRoute('governance.design.contribution.propose', 'DSC', id), async (cap) => cap.proposeContribution({ id, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { contribution: out.result, receipt: receipt(out) };
  }
  async amendContribution(env: Envelope, p: AuthenticatedPrincipal, id: string, b: { revision: number; target: string | null; proposal: Row; summary: string; plans: Row }) {
    const out = await this.write(env, p, platformRoute('governance.design.contribution.amend', 'DSC', id), async (cap) => cap.amendContribution({ id, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { contribution: out.result, receipt: receipt(out) };
  }
  /** One step. ACCEPT is signed first (the port verifies the signature); a HELD step commits its hold, then 409. */
  async advance(env: Envelope, p: AuthenticatedPrincipal, id: string, step: ContributionStep, b: { revision: number; digest: string | null; reason: string; evidence: Row }) {
    const action = stepAction(step);
    const out = await this.write(env, p, platformRoute(action, 'DSC', id), async (cap) => {
      let signatureId: string | null = null;
      if (step === 'accept' && b.digest !== null) {
        const c = await cap.contribution(id);
        if (c !== null && c['stage'] === 'in_review' && c['digest'] === b.digest && c['revision'] === b.revision && ((c['blockers'] ?? []) as unknown[]).length === 0) {
          signatureId = await signPlatform(cap, { action, kind: 'design_contribution', subjectId: id, subjectVersion: b.revision, subjectDigest: b.digest,
                                                 role: c['constitutional'] === true ? 'product_authority' : 'design_system_authority', actor: p.principalId, correlationId: env.correlation_id, noun: 'design contribution' });
        }
      }
      return cap.advanceContribution({ id, step, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
    });
    if (out.result['held'] === true) this.held('design contribution', out, `the ${step} step is held`, env.correlation_id);
    return { contribution: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE BASELINE ─────────────────────────
  async proposeBaseline(env: Envelope, p: AuthenticatedPrincipal, b: { baselineId: string | null; expectedVersion: number; title: string; dsv: string; scope: Row; members: string[] }) {
    const baselineId = b.baselineId ?? newId();
    const out = await this.write(env, p, platformRoute('governance.design.baseline.propose', 'DSB', baselineId), async (cap) =>
      cap.proposeBaseline({ ...b, baselineId, actor: p.principalId, correlationId: env.correlation_id }));
    return { baseline: out.result, receipt: receipt(out) };
  }
  async decideBaseline(env: Envelope, p: AuthenticatedPrincipal, baselineId: string, b: { version: number; decision: 'attest' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.design.baseline.decide';
    const out = await this.write(env, p, platformRoute(action, 'DSB', baselineId), async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'attest') {
        const v = await cap.baselineVersion(baselineId, b.version);
        const blockers = (await cap.baselines()).find((x) => x['baseline_id'] === baselineId && x['version'] === b.version)?.['blockers'] as unknown[] | undefined;
        // sign only an unheld proposal's own digest (a held attestation commits its hold unsigned; the port refuses a stale digest either way)
        if (v !== null && v['state'] === 'proposed' && v['digest'] === b.digest && (blockers ?? []).length === 0) {
          signatureId = await signPlatform(cap, { action, kind: 'baseline_decision', subjectId: baselineId, subjectVersion: b.version, subjectDigest: b.digest, role: 'design_system_authority',
                                                 actor: p.principalId, correlationId: env.correlation_id, noun: 'design baseline' });
        }
      }
      return cap.decideBaseline({ baselineId, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
    });
    if (out.result['held'] === true) this.held('design baseline', out, `design baseline v${b.version} cannot be attested`, env.correlation_id);
    return { baseline: out.result, receipt: receipt(out) };
  }
  async recordLink(env: Envelope, p: AuthenticatedPrincipal, b: { from: string | null; to: string | null; relation: string | null; retire: string | null }) {
    const out = await this.write(env, p, platformRoute('governance.design.link.record', 'TRC', b.retire ?? b.from), async (cap) => cap.recordLink({ ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { link: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: intake, design acceptance, telemetry evidence, conformance packages ─────────────────────────
  async domainRead(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.dread(env, p, t, d, 'DAC', null, async (cap) => {
      const now = await cap.now();
      const acceptances = (await cap.acceptances()).map((r) => ({ ...r, attest: (r['obligations'] as string[]).map((o) => {
        const done = ((r['attestations'] ?? []) as Row[]).some((a) => a['obligation'] === o);
        const role = OBLIGATION_ROLE[o as Obligation];
        return { obligation: o, role, attested: done, eligibility: done ? ['already attested'] : eligibility({ kind: p.kind, principal: p.principalId,
          holds: p.bindings.some((b) => b.roleCode === role && (b.scope === 'PLATFORM' || (b.scope === 'TENANT' && b.tenantId === t))), role, proposer: String(r['proposed_by']),
          builders: (r['builders'] ?? []) as string[], state: String(r['state']), expectedState: 'proposed',
          already: ((r['attestations'] ?? []) as Row[]).some((a) => a['principal'] === p.principalId) }) };
      }) }));
      return { baseline: await cap.attestedBaseline(), acceptances, intakes: await cap.intakes(), pending_actions: await cap.pendingActions(), packages: await cap.packages(30),
               telemetry: await cap.telemetryEvidence(t, d), accessibility: await cap.accessibilitySlots(), read_at: now };
    });
    return { ...out.result, boundary: DG_BOUNDARY, receipt: receipt(out) };
  }
  async packageRead(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string) {
    const out = await this.dread(env, p, t, d, 'DCP', id, async (cap) => cap.package(id));
    if (out.result === null) throw refuseGovernance('conformance package', 'unknown_package', `${id} is not a conformance package of this domain`, env.correlation_id, 404);
    return { package: out.result, receipt: receipt(out) };
  }
  async intake(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, actionId: string | null) {
    const action = 'governance.design.intake';
    const out = await this.pipeline.write(derive(env, action, 'DSC', actionId), p, domainRoute(t, d, action, 'DSC', actionId), DesignCap, async (cap) => ({
      result: await cap.intake({ t, d, actionId, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DSC', targetId: actionId, targetVersion: null, outboxEvent: null }));
    return { intake: out.result, receipt: receipt(out) };
  }
  async proposeAcceptance(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { acceptanceId: string | null; expectedVersion: number; baselineId: string; components: string[]; tuple: Row;
                                                                                               evidence: unknown[]; findings: unknown[]; conditions: unknown[]; obligations: string[]; builders: string[] }) {
    const id = b.acceptanceId ?? newId(); const action = 'governance.design.acceptance.propose';
    const out = await this.pipeline.write(derive(env, action, 'DAC', id), p, domainRoute(t, d, action, 'DAC', id), DesignCap, async (cap) => ({
      result: await cap.proposeAcceptance({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DAC', targetId: id, targetVersion: null, outboxEvent: null }));
    return { acceptance: out.result, receipt: receipt(out) };
  }
  /** ATTEST one obligation: signed first (executive.signatures `design_acceptance`, the B36 signer), then the port verifies it. */
  async attestAcceptance(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, id: string, b: { version: number; obligation: string; digest: string; reason: string }) {
    const action = 'governance.design.acceptance.attest';
    const out = await this.pipeline.write(derive(env, action, 'DAC', id), p, domainRoute(t, d, action, 'DAC', id), DesignCap, async (cap) => {
      let signatureId: string | null = null;
      const r = await cap.acceptanceVersion(id, b.version);
      const attested = ((r?.['attestations'] ?? []) as Row[]);
      if (r !== null && r['state'] === 'proposed' && r['digest'] === b.digest && (r['obligations'] as string[]).includes(b.obligation)
          && !attested.some((a) => a['obligation'] === b.obligation || a['principal'] === p.principalId)) {
        const s = await this.signer.sign(cap, { tenantId: t, domainId: d, action, kind: 'design_acceptance' as unknown as SignatureSubjectKind, subjectId: id, subjectVersion: b.version,
                                                subjectDigest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
        signatureId = String(s['signature_id'] ?? '') || null;
      }
      return { result: await cap.attestAcceptance({ id, t, d, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DAC', targetId: id, targetVersion: String(b.version), outboxEvent: null };
    });
    return { acceptance: out.result, receipt: receipt(out) };
  }
  async generatePackage(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { target: string; acceptanceId: string | null }) {
    const id = newId(); const action = 'governance.design.package.generate';
    const out = await this.pipeline.write(derive(env, action, 'DCP', id), p, domainRoute(t, d, action, 'DCP', id), DesignCap, async (cap) => ({
      result: await cap.generatePackage({ id, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DCP', targetId: id, targetVersion: null, outboxEvent: null }));
    return { package: out.result, receipt: receipt(out) };
  }
}
