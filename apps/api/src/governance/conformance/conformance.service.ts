/**
 * B107 §CM (0115_b107_x_cm) — CONFORMANCE MANIFESTS, THE RELEASE-CANDIDATE RECORD, THE LOCAL CONFORMANCE MONITOR: the orchestration the ports do
 * not do.
 *
 *   THE MANIFEST (ES-01-001, ES-02-002, ES-31..40-002, ES-65-001, V04-T-004, V07-T-005, IA-01-005): the steward REGISTERS the COMMITTED,
 *     generated `conformance/components.manifest.json` — the server reads the file, its digest and its index (the caller supplies no content);
 *     an UNMAPPED unit is refused after its finding commits (422 `unmapped_unit`);
 *   THE RELEASE CANDIDATE (ES-01-005, V04-T-001, IA-01-006, DP-67-006 — B65 SUBSTITUTED: not a release): ASSEMBLE binds the server's own build
 *     identity (head SHA, policy bundle and its digest, configuration digest; the port reads the migration head and the registered manifest);
 *     CHECK records the verdict and its evidence holds, then answers a refusal in the server's words (held 409 > stale 409 > evidence 422 >
 *     unverifiable 422 > foreign_version 422); ATTEST (independent assurance, human-gated): signed first (`manifest_attestation`, the PLATFORM
 *     signer), the port re-checks the approver test and the candidate at that instant; WITHDRAW;
 *   THE MONITOR (V03-T-479, IA-01-002, DP-65-002 — local; production monitoring R1): the after-tick hook `governance-conformance` — its own READ
 *     (governance.read under the attention agent) FIRST, the findings computed (conformance-logic.ts), then its own WRITE
 *     (governance.conformance.monitor) — never one statement across a context (B33-H); one in flight per process; the steward runs the same at
 *     PLATFORM;
 *   THE CONFORMANCE SERVICE (DAT-GV-09): a state per component (componentStates — never inferred) and the closure gap report (V04-T-018,
 *     V07-T-004).
 *
 * THREE CLAIMS: CONSTRUCTION (this code + phase6-conformance-b107); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, `claim = demonstration`);
 * a release (B65), production admission and production monitoring (R1), real acceptance (R2) — never claimed.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { BOUNDARY, derive, domainRoute, platformRoute, receipt, refuseGovernance, type GovernanceRoute } from '../seams.js';
import { ConformanceCap, type ConformanceCapability } from './conformance.capabilities.js';
import { attestEligibility, closureGaps, componentStates, monitorFindings, refusalOf, DRIFT_KINDS, LIVE_CANDIDATE_STATES, type MonitorObservation } from './conformance-logic.js';
import { buildIdentity, manifestPath, readCommittedManifest } from './build-identity.js';
import { PlatformSigner } from './platform-signer.js';

type Row = Record<string, unknown>;
export const READ = 'governance.read';
export const MONITOR = 'governance.conformance.monitor';
export const MONITOR_HOOK = 'governance-conformance';
export const CM_BOUNDARY = `${BOUNDARY} §CM: a release candidate is a LOCAL conformance record (B65 substituted) — never a release, never production admission (R1); the manifest is generated from source (construction) and SLO targets in it are declared (B64 computes); the monitor watches this local runtime — production monitoring is R1; layer reconciliation is B109/B110.`;
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class ConformanceService implements OnModuleInit {
  private readonly log = new Logger('governance.conformance');
  readonly signer = new PlatformSigner();
  /** one monitor pass in flight per process (every domain's tick would otherwise start one) */
  private inFlight: Promise<Row> | null = null;
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    if (ticks === null) { this.log.warn('no attention tick registry in this application: the conformance monitor runs only when the steward runs it'); return; }
    ticks.registerAfter({ name: MONITOR_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, route: GovernanceRoute, fn: (cap: ConformanceCapability) => Promise<T>) {
    return this.pipeline.consequentialRead(derive(env, route.action, route.objectType, route.objectId), p, route, ConformanceCap, async (cap) => fn(cap));
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, route: GovernanceRoute,
                   fn: (cap: ConformanceCapability) => Promise<{ result: T; evidence?: { outcome: 'success' | 'failure'; resultCode: string; metadata?: Row } }>) {
    return this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, ConformanceCap, async (cap) => {
      const r = await fn(cap);
      return { result: r.result, targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null, ...(r.evidence === undefined ? {} : { evidence: r.evidence }) };
    });
  }
  /** A server-side envelope (the hook): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, t: string, d: string, action: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: t, domain_id: d, principal_id: `principal:${principal.principalId}`, purpose_id: 'governance', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'CFN', object_id: null,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'governance-conformance',
    } as unknown as Envelope;
  }

  // ───────────────────────── THE WORKSPACE READ ─────────────────────────
  /** The conformance workspace: the build identity, the committed vs registered manifest, the candidates (holds, signatures verified), the
   *  findings and monitor runs, the state per component (never inferred), the closure gap report, the ledger. */
  async workspace(env: Envelope, p: AuthenticatedPrincipal) {
    const identity = buildIdentity();
    const committed = readCommittedManifest(manifestPath());
    const out = await this.read(env, p, platformRoute(READ, 'CFN', null), async (cap) => {
      const manifest = await cap.currentManifest();
      const index = (await cap.currentIndex())?.['index'] as Row | undefined;
      const candidates = await cap.candidates(200);
      const findings = await cap.findings(300);
      const openDrift = findings.filter((f) => f['state'] === 'open' && (DRIFT_KINDS as readonly string[]).includes(String(f['kind']))).length;
      const openHolds: Record<string, number> = Object.fromEntries(candidates.map((c) => [String(c['candidate_id']), ((c['open_holds'] ?? []) as unknown[]).length]));
      const components = componentStates({
        components: ((index?.['components'] ?? []) as Row[]),
        registered: manifest === null ? null : { version: Number(manifest['version']), file_digest: String(manifest['file_digest']) },
        candidates: candidates.map((c) => ({ candidate_id: String(c['candidate_id']), version: Number(c['version']), label: String(c['label']), state: String(c['state']),
          manifest_digest: String(c['manifest_digest']), proposed_at: new Date(String(c['proposed_at'])).toISOString(), head_sha: String(c['head_sha']) })),
        openHoldsBySubject: openHolds, openDriftFindings: openDrift,
      });
      return {
        identity, migration_head: await cap.migrationHead(), manifest, manifests: await cap.manifests(20),
        sync: !committed.readable ? { state: 'unreadable', reason: committed.reason } : manifest === null ? { state: 'unregistered' }
          : manifest['file_digest'] === committed.fileDigest ? { state: 'in_sync' } : { state: 'drift', committed: committed.fileDigest, registered: manifest['file_digest'] },
        committed: { readable: committed.readable, path: committed.path, file_digest: committed.fileDigest ?? null, summary: committed.summary ?? null, layers: committed.layers ?? [],
                     unmapped: (committed.index?.units ?? []).filter((u) => u['mapped'] === false).map((u) => u['path']) },
        candidates: candidates.map((c) => ({ ...c, signatures: ((c['signatures'] ?? []) as Row[]).map((s) => ({ ...s, verified: this.signer.verify(s as { key_id: string; signature: string; subject_digest: string }) })) })),
        last_conformant: candidates.find((c) => c['state'] === 'attested' || c['state'] === 'conformant') ?? null,
        findings, runs: await cap.runs(30), components,
        component_totals: components.reduce<Record<string, number>>((acc, c) => { acc[c.state] = (acc[c.state] ?? 0) + 1; return acc; }, {}),
        closure: committed.readable && committed.manifest !== undefined ? closureGaps(committed.manifest) : null,
        artifacts: await cap.artifactCounts(), ledger: await cap.ledger(100), signer: this.signer.publicKey() === null ? null : { key_id: this.signer.publicKey()?.keyId },
        read_at: await cap.now(),
      };
    });
    return { ...out.result, boundary: CM_BOUNDARY, receipt: receipt(out) };
  }

  /** The committed manifest's units and logical components (filtered by layer and unit kind — the page's selection). */
  async manifestView(env: Envelope, p: AuthenticatedPrincipal, filter: { layer: string | null; kind: string | null }) {
    const committed = readCommittedManifest(manifestPath());
    if (!committed.readable || committed.manifest === undefined) throw refuseGovernance('conformance manifest', 'state', committed.reason ?? 'the committed manifest cannot be read', env.correlation_id, 409);
    const m = committed.manifest;
    const out = await this.read(env, p, platformRoute(READ, 'CFN', null), async (cap) => ({ read_at: await cap.now() }));
    const units = ((m['deployable_units'] ?? []) as Row[]).filter((u) => (filter.kind === null || u['kind'] === filter.kind) && (filter.layer === null || ((u['layers'] ?? []) as string[]).includes(filter.layer)));
    const logical = ((m['logical_components'] ?? []) as Row[]).filter((c) => filter.layer === null || c['layer'] === filter.layer);
    return { file_digest: committed.fileDigest, schema: committed.schema, summary: committed.summary, layers: committed.layers, filter, units, logical_components: logical,
             service_manifests: m['service_manifests'], ai_planes: m['ai_planes'], frozen_contracts: m['frozen_contracts'], evidence_families: m['evidence_families'],
             generated_artifacts: m['generated_artifacts'], profiles: m['profiles'], read_at: out.result.read_at, boundary: CM_BOUNDARY, receipt: receipt(out) };
  }

  // ───────────────────────── THE MANIFEST ─────────────────────────
  async registerManifest(env: Envelope, p: AuthenticatedPrincipal) {
    const committed = readCommittedManifest(manifestPath());
    if (!committed.readable || committed.index === undefined || committed.fileDigest === undefined) {
      throw refuseGovernance('conformance manifest', 'state', `${committed.reason ?? 'the committed manifest cannot be read'} — regenerate it (node apps/api/src/governance/conformance/generate-components-manifest.mjs --write) and commit`, env.correlation_id, 409);
    }
    const out = await this.write(env, p, platformRoute('governance.conformance.manifest.register', 'CFN', null), async (cap) => {
      const r = await cap.registerManifest({ path: 'conformance/components.manifest.json', schema: committed.schema ?? '', generator: committed.generator ?? '', fileDigest: committed.fileDigest ?? '',
        index: committed.index as unknown as Row, summary: committed.summary ?? {}, actor: p.principalId, correlationId: env.correlation_id });
      return r['refused'] === true ? { result: r, evidence: { outcome: 'failure', resultCode: 'EYE-REQ-001', metadata: { refused: true, unmapped: r['unmapped'] } } } : { result: r };
    });
    if (out.result['refused'] === true) {
      const unmapped = (out.result['unmapped'] ?? []) as Row[];
      const e = refuseGovernance('conformance manifest', 'unmapped_unit', `${unmapped.map((u) => `${String(u['path'])} (${String(u['why'])})`).join('; ')} — the non-conformant record is preserved as a finding; map each unit and regenerate`, env.correlation_id, 422);
      throw new HttpException({ ...(e.getResponse() as Row), refused: out.result, receipt: receipt(out) }, 422);
    }
    return { manifest: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE RELEASE CANDIDATE ─────────────────────────
  async assemble(env: Envelope, p: AuthenticatedPrincipal, b: { candidateId: string | null; expectedVersion: number; label: string; scope: Row; from: string; to: string; evidence: Row[]; builders: string[] }) {
    const id = buildIdentity();
    const out = await this.write(env, p, platformRoute('governance.conformance.candidate.assemble', 'RCN', b.candidateId), async (cap) => ({
      result: await cap.assemble({ ...b, headSha: id.head_sha, policy: id.policy_bundle, configDigest: id.config_digest, profile: 'local-dev', actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { candidate: out.result, identity: id, boundary: CM_BOUNDARY, receipt: receipt(out) };
  }
  /** THE CHECK: the verdict and its holds COMMIT; a refusal is answered after, in the server's words. */
  async check(env: Envelope, p: AuthenticatedPrincipal, candidateId: string, version: number) {
    const out = await this.write(env, p, platformRoute('governance.conformance.candidate.check', 'RCN', candidateId), async (cap) => {
      const r = await cap.check({ candidateId, version, actor: p.principalId, correlationId: env.correlation_id });
      return r['outcome'] === 'conformant' ? { result: r } : { result: r, evidence: { outcome: 'failure', resultCode: r['outcome'] === 'held' ? 'EYE-STA-002' : 'EYE-REQ-001', metadata: { outcome: r['outcome'] } } };
    });
    const refusal = refusalOf(out.result);
    if (refusal !== null) {
      const e = refuseGovernance('release candidate', refusal.cls, refusal.message, env.correlation_id, refusal.status);
      throw new HttpException({ ...(e.getResponse() as Row), check: out.result, receipt: receipt(out) }, refusal.status);
    }
    return { check: out.result, receipt: receipt(out) };
  }
  /** The attestation's preview: the candidate, its EXACT digest, the CALLER's eligibility in words, the consequence. */
  async preview(env: Envelope, p: AuthenticatedPrincipal, candidateId: string) {
    const out = await this.read(env, p, platformRoute(READ, 'RCN', candidateId), async (cap) => {
      const c = await cap.candidate(candidateId, null);
      if (c === null) return null;
      const eligibility = attestEligibility({ principalKind: (await cap.principalKind(p.principalId)) ?? p.kind, principalId: p.principalId,
        holdsAssurance: await cap.holdsRole(p.principalId, ['independent_assurance']), candidate: c, openHolds: Number(c['open_holds'] ?? 0) });
      return { candidate: c, digest: c['digest'], eligibility, read_at: await cap.now(),
        consequence: `attesting records independent assurance's Ed25519 signature (manifest_attestation) over digest ${String(c['digest']).slice(0, 16)}… of ${String(c['label'])} v${String(c['version'])} and marks it attested — it is NOT a release (B65), NOT production admission (R1), NOT real acceptance (R2); the port re-checks the candidate at that instant` };
    });
    if (out.result === null) throw refuseGovernance('release candidate', 'unknown_candidate', `${candidateId} is not a release candidate`, env.correlation_id, 404);
    return { ...out.result, signer_bound: this.signer.bound(), boundary: CM_BOUNDARY, receipt: receipt(out) };
  }
  /** ATTEST: signed FIRST (only the version's own digest, only when the decision names it), then the port verifies everything again. */
  async attest(env: Envelope, p: AuthenticatedPrincipal, candidateId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, platformRoute('governance.conformance.candidate.attest', 'RCN', candidateId), async (cap) => {
      const c = await cap.candidate(candidateId, b.version);
      let sig = { keyId: '', signature: '' };
      if (c !== null && c['state'] === 'conformant' && c['digest'] === b.digest) sig = this.signer.sign(b.digest, env.correlation_id);
      return { result: await cap.attest({ candidateId, version: b.version, digest: b.digest, reason: b.reason, keyId: sig.keyId, signature: sig.signature, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { attestation: out.result, receipt: receipt(out) };
  }
  async withdraw(env: Envelope, p: AuthenticatedPrincipal, candidateId: string, b: { version: number; reason: string }) {
    const out = await this.write(env, p, platformRoute('governance.conformance.candidate.withdraw', 'RCN', candidateId), async (cap) => ({
      result: await cap.withdraw({ candidateId, version: b.version, reason: b.reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { candidate: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE MONITOR ─────────────────────────
  /** What the monitor observes — read under the caller's route (governance.read), never inside the write. */
  private async observe(cap: ConformanceCapability): Promise<MonitorObservation> {
    const id = buildIdentity();
    const m = await cap.currentManifest();
    const cands = (await cap.candidates(500)).filter((c) => (LIVE_CANDIDATE_STATES as readonly string[]).includes(String(c['state'])));
    return {
      identity: { head_sha: id.head_sha, policy_bundle: id.policy_bundle, manifest: { readable: id.manifest.readable, file_digest: id.manifest.file_digest, reason: id.manifest.reason, path: id.manifest.path } },
      migration_head: await cap.migrationHead(),
      registered: m === null ? null : { manifest_id: String(m['manifest_id']), version: Number(m['version']), file_digest: String(m['file_digest']) },
      candidates: cands.map((c) => ({ candidate_id: String(c['candidate_id']), version: Number(c['version']), label: String(c['label']), state: String(c['state']), head_sha: String(c['head_sha']),
        migration_head: String(c['migration_head']), policy_bundle: (c['policy_bundle'] ?? {}) as { version?: string; digest?: string }, manifest_digest: String(c['manifest_digest']),
        evidence: ((c['evidence'] ?? []) as Row[]).map((e) => ({ item: Number(e['item']), ref: String(e['ref']), family: String(e['family']), valid_until: new Date(String(e['valid_until'])).toISOString() })) })),
      holds: (await cap.candidateHolds()).map((h) => ({ hold_id: String(h['hold_id']), subject_artifact: String(h['subject_artifact']), reason_kind: String(h['reason_kind']), reason: String(h['reason']) })),
      exceptions: (await cap.exceptionArtifacts()).map((x) => ({ artifact_id: String(x['artifact_id']), external_key: String(x['external_key']), title: String(x['title']), expires_at: String(x['expires_at']) })),
      now: await cap.now(),
    };
  }
  /** One monitor pass: READ FIRST (its own audited read), then the WRITE (its own action) — on the route given (PLATFORM: the steward;
   *  DOMAIN: the tick's domain under the attention agent). */
  async monitor(env: Envelope, p: AuthenticatedPrincipal, via: 'tick' | 'steward', at: { t: string; d: string } | null) {
    const readRoute = at === null ? platformRoute(READ, 'CFN', null) : domainRoute(at.t, at.d, READ, 'CFN', null);
    const observed = (await this.read({ ...env, action: READ } as Envelope, p, readRoute, async (cap) => this.observe(cap))).result;
    const findings = monitorFindings(observed);
    const writeRoute = at === null ? platformRoute(MONITOR, 'CFN', null) : domainRoute(at.t, at.d, MONITOR, 'CFN', null);
    const out = await this.write({ ...env, action: MONITOR } as Envelope, p, writeRoute, async (cap) => ({
      result: await cap.recordMonitor({ observed: { identity: observed.identity, migration_head: observed.migration_head, registered: observed.registered,
        candidates: observed.candidates.map((c) => ({ candidate_id: c.candidate_id, version: c.version, state: c.state })) }, findings, via, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { monitor: { ...out.result, findings: findings.map((f) => ({ kind: f.kind, fingerprint: f.fingerprint, summary: f.summary, hold: f.hold })) }, receipt: receipt(out) };
  }
  /** The after-tick hook: one pass in flight per process; a failure is answered on the tick's run (never undoes the tick) and the next tick
   *  observes again. */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    if (this.inFlight !== null) return { skipped: 'a conformance monitor pass is in flight' };
    const run = (async (): Promise<Row> => {
      try {
        const r = await this.monitor(this.envelopeFor(a.principal, a.tenantId, a.domainId, MONITOR, a.correlationId), a.principal, 'tick', { t: a.tenantId, d: a.domainId });
        const m = r.monitor as Row;
        return { recorded: m['recorded'], opened: m['opened'], resolved: m['resolved'], holds_opened: m['holds_opened'], holds_lifted: m['holds_lifted'], open: m['open'] };
      } catch (e) { return { error: textOf(e).slice(0, 500) }; }
    })().finally(() => { this.inFlight = null; });
    this.inFlight = run;
    return run;
  }

  /** A recorded PLATFORM signature verified against the bound key. */
  verifySignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.signer.verify(row); }
}
