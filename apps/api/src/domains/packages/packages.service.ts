/**
 * B33 §PK (0111) — THE DOMAIN-PACKAGE FRAMEWORK'S SERVICE: the orchestration the ports do not do — the canonical DPG/DAS admissions beside
 * their ports, the conformance suite, the health evaluation and the acceptance focus computed from the facts READ FIRST (in their own read,
 * before the governed write — the B25 lesson: long reads never inside the 60-second commit capability), and the after-tick hook
 * `domain-package-health` (STARTED, never awaited past a bound; one in flight per domain). Every rule is a port's; a refusal is the port's
 * text in the class form `<noun> rejected (<class>): …`.
 *
 * BOUNDARY (R7): package signing and publisher identity → B77; all-layer extension namespaces → B78; marketplace and purchase → B112;
 * cross-profile parity → B111; the signed acceptance record → R2. AI proposes (an agent proposes assessments and events and runs diagnostic
 * conformance); named humans certify sections, approve material assessments, confirm events, activate, re-enable; the RESPONSE to what a
 * package shows is a decision of the decision layer (the workspace links to it; nothing here decides).
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { sql } from 'kysely';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { PACKAGE_GATE, PackageUnavailable, type PackageGate } from '../seams.js';
import { PackageCapability, type PackageReads, type PackageWrites } from './packages.capabilities.js';
import { ACCEPTANCE_VERSION, SUITE_VERSION, acceptanceFocus, evaluateHealth, runConformance, verdict, type AcceptanceFacts, type Check, type PackageFacts } from './conformance.js';
import { FUNCTIONS, SECTIONS, digestOf } from './manifest.js';
import { packageDefinitions } from './definitions.js';

type Row = Record<string, unknown>;
export const HEALTH_HOOK = 'domain-package-health';
export const DPG_SCHEMA = 'DPG@v1';
export const DAS_SCHEMA = 'DAS@v1';
export const READ = 'domain.package.read';
/** How long the tick waits on the health re-check before it lets it go on alone (B25-R: the tick is never held). */
export const HEALTH_AWAIT_MS = 5_000;
export const BOUNDARY = 'in-tenant certified domain-package framework (B33): signing and publisher identity → B77; all-layer namespaces → B78; marketplace and purchase → B112; parity → B111; signed acceptance → R2';

export type Noun = 'domain package' | 'package conformance' | 'domain assessment' | 'watchlist' | 'domain event';
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');
/** A refusal in the class form, answered by the route before any port runs (the caller's own request). */
export function refuse(noun: Noun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class PackagesService implements OnModuleInit {
  private readonly log = new Logger('domain.packages');
  /** B25-R: the health re-check in flight per domain — a tick never starts a second one, and never waits on one longer than `healthAwaitMs`. */
  private readonly inFlight = new Map<string, { since: string; done: Promise<Row> }>();
  healthAwaitMs = HEALTH_AWAIT_MS;
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, @Inject(PACKAGE_GATE) private readonly gate: PackageGate) {}

  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: domain packages are not re-checked after the tick'); return; }
    registry.registerAfter({ name: HEALTH_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── envelopes and routes ─────────────────────────
  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  /** A server-side envelope (the hook): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: 'intelligence', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'domain-packages',
    } as unknown as Envelope;
  }
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, objectId: string | null, fn: (cap: PackageReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, READ, objectType, objectId), p, this.route(t, d, READ, objectType, objectId), PackageCapability.read, async (cap) => fn(cap));
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null,
                   fn: (cap: PackageWrites) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), PackageCapability.write,
      async (cap) => { const r = await fn(cap); return { result: r.result, targetType: r.targetType ?? objectType, targetId: r.targetId ?? objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  // ───────────────────────── reads (PK7: the workspace) ─────────────────────────
  async list(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'DPG', null, async (cap) => ({ packages: await cap.list(), read_at: await cap.now() }));
    return { ...out.result, definitions: packageDefinitions().map((x) => ({ key: x.key, kind: x.kind, title: x.title, clause: x.clause, focus: x.focus, inputs: x.manifest.controls.inputs })),
             boundary: BOUNDARY, receipt: PackagesService.receipt(out) };
  }

  /** One package as the workspace shows it: scope, portfolio (versions, sections, runs), evidence and assessments, options and monitoring
   *  (watchlists, alerts, links), the gate's answer per function (a disabled extension shown disabled with its reason), the routed items. */
  async detail(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string) {
    const out = await this.read(env, p, t, d, 'DPG', packageId, async (cap) => {
      const k = await cap.package(packageId);
      if (k === null) return null;
      const versions = await cap.versions(packageId);
      const sections: Record<string, Row> = {};
      for (const v of versions) if (['proposed', 'certified', 'active'].includes(String(v['state']))) sections[String(v['version'])] = await cap.sectionState(packageId, Number(v['version']));
      const gates: Record<string, unknown> = {};
      for (const fn of [null, ...FUNCTIONS]) gates[fn ?? 'package'] = await this.gate.state(cap.tx, { tenantId: t, domainId: d, packageKey: String(k['package_key']), fn });
      const migrations = await cap.migrations(packageId);
      const watchlists = await cap.watchlists(packageId);
      return {
        package: k, versions, sections, gates, runs: await cap.runs(packageId, 30), migrations, ledger: await cap.ledger(packageId, 100), links: await cap.links(packageId),
        assessments: await cap.assessments(packageId, 100), watchlists, alerts: await cap.alerts(packageId, null, 100), events: await cap.events(packageId, 100),
        items: await cap.items([packageId, ...migrations.map((m) => String(m['migration_id'])), ...watchlists.map((w) => String(w['watchlist_id']))]),
        read_at: await cap.now(), boundary: BOUNDARY,
      };
    });
    if (out.result === null) throw refuse('domain package', 'unknown_package', `${packageId} is not a package of this domain`, env.correlation_id, 404);
    return { ...out.result, receipt: PackagesService.receipt(out) };
  }

  async facts(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, version: number | null) {
    const out = await this.read(env, p, t, d, 'DPG', packageId, async (cap) => {
      const v = version ?? Number((await cap.versions(packageId))[0]?.['version'] ?? NaN);
      if (!Number.isFinite(v)) return null;
      return { version: v, facts: await cap.facts(packageId, v), acceptance: await cap.acceptanceFacts(packageId, v) };
    });
    if (out.result === null || out.result.facts === null) throw refuse('domain package', 'unknown_version', `package ${packageId} has no such version`, env.correlation_id, 404);
    return { ...out.result, receipt: PackagesService.receipt(out) };
  }

  async assessment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assessmentId: string, asOf: string | null) {
    const out = await this.read(env, p, t, d, 'DAS', assessmentId, async (cap) => ({
      versions: await cap.assessment(assessmentId), as_of: asOf === null ? null : await cap.assessmentAsOf(assessmentId, asOf), read_at: await cap.now(),
    }));
    if (out.result.versions.length === 0) throw refuse('domain assessment', 'unknown_assessment', `${assessmentId} is not an assessment of this domain`, env.correlation_id, 404);
    return { ...out.result, receipt: PackagesService.receipt(out) };
  }

  // ───────────────────────── PK1: declare, propose (DPG) ─────────────────────────
  async declare(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; kind: string; title: string; owner: string }) {
    const packageId = newId();
    const out = await this.write(env, p, t, d, 'domain.package.declare', 'DPG', packageId, async (cap) => ({
      result: await cap.declare({ packageId, tenantId: t, domainId: d, key: b.key, kind: b.kind, title: b.title, owner: b.owner, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { package: out.result, receipt: PackagesService.receipt(out) };
  }

  private dpgHeader(t: string, d: string, packageId: string, objectVersion: number, owner: string, actor: string, purpose: string, correlationId: string, recordedAt: string): CanonicalHeader {
    return {
      object_id: packageId, object_type: 'DPG', tenant_id: t, domain_id: d, scope: 'DOMAIN', object_version: String(objectVersion), lifecycle_state: 'active',
      owning_component: 'CP-DOM-PKG', accountable_owner: `principal:${owner}`, source_object_ids: [],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: recordedAt, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [], provenance_ref: `principal:${actor}`, method_ref: 'domain.package/1',
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${owner}`, `principal:${actor}`])],
      classification: 'internal', purpose_scope: purpose, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: DPG_SCHEMA, ontology_ref: null,
      correction_of: null, supersedes: objectVersion > 1 ? `DPG:${packageId}@${objectVersion - 1}` : null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    } as CanonicalHeader;
  }
  private async admit(cap: PackageWrites, header: CanonicalHeader, payload: Row, noun: Noun, correlationId: string) {
    const check = validateHeader(header);
    if (!check.ok) throw refuse(noun, 'object', `canonical header invalid: ${(check.errors ?? []).join('; ')}`, correlationId);
    return cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
  }

  /** PROPOSE a version: the DPG object (state proposed, the manifest and its digests — the port's own digest functions) admitted, then the port. */
  async propose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, semver: string, manifest: Row) {
    const out = await this.write(env, p, t, d, 'domain.package.version', 'DPG', packageId, async (cap) => {
      const k = await cap.package(packageId);
      if (k === null) throw refuse('domain package', 'unknown_package', `${packageId} is not a package of this domain`, env.correlation_id, 404);
      const digests = (await sql<{ m: string; s: Record<string, string> }>`select domain.dpk_manifest_digest(${JSON.stringify(manifest)}::jsonb) as m,
          (select jsonb_object_agg(x, domain.dpk_section_digest(${JSON.stringify(manifest)}::jsonb, x)) from unnest(domain.dpk_sections()) x) as s`.execute(cap.tx)).rows[0]!;
      const next = Number((await cap.versions(packageId))[0]?.['version'] ?? 0) + 1;
      const objectVersion = ((await cap.latestObjectVersion('DPG', packageId)) ?? 0) + 1;
      const payload: Row = {
        package_id: packageId, package_key: String(k['package_key']), domain_kind: String(k['domain_kind']), title: String(k['title']), version: next, semver, state: 'proposed',
        owner_principal_id: String(k['owner_principal_id']), manifest, manifest_digest: digests.m,
        sections: SECTIONS.map((s) => ({ section: s, digest: digests.s[s] })), conformance: null, disabled_functions: {}, conflict: null, boundary: BOUNDARY,
      };
      await this.admit(cap, this.dpgHeader(t, d, packageId, objectVersion, String(k['owner_principal_id']), p.principalId, env.purpose_id ?? 'intelligence', env.correlation_id, await cap.now()), payload, 'domain package', env.correlation_id);
      const r = await cap.propose({ packageId, tenantId: t, domainId: d, semver, manifest, objectVersion, actor: p.principalId, correlationId: env.correlation_id });
      return { result: { ...r, dpg: { object_version: objectVersion, schema_ref: DPG_SCHEMA } }, targetVersion: String(objectVersion) };
    });
    return { version: out.result, receipt: PackagesService.receipt(out) };
  }

  // ───────────────────────── PK2: sections, certification, activation ─────────────────────────
  async approve(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, b: { version: number; section: string; digest: string; decision: string; reason: string; validDays: number }) {
    const approvalId = newId();
    const out = await this.write(env, p, t, d, 'domain.package.approve', 'DPG', packageId, async (cap) => ({
      result: await cap.approveSection({ approvalId, packageId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { approval: out.result, receipt: PackagesService.receipt(out) };
  }

  /** CONFORMANCE (PK3): the facts read first, the suite computed, the run recorded (certification on a proposed version; diagnostic otherwise). */
  async conformance(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, version: number, mode: 'certification' | 'diagnostic') {
    const facts = await this.readFacts(env, p, t, d, packageId, version, false);
    const checks = runConformance(facts.facts);
    const runId = newId();
    const out = await this.write(env, p, t, d, 'domain.package.conformance', 'DPG', packageId, async (cap) => ({
      result: await cap.recordRun({ runId, packageId, tenantId: t, domainId: d, version, mode, suiteVersion: SUITE_VERSION, checks, factsDigest: facts.digest, factsReadAt: facts.readAt, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { run: { ...out.result, verdict_ts: verdict(checks) }, receipt: PackagesService.receipt(out) };
  }

  /** ACCEPTANCE (PK6): the kind's acceptance focus, MEASURED on the active version and recorded (mode acceptance). */
  async acceptance(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string) {
    const v = await this.activeVersion(env, p, t, d, packageId, 'package conformance');
    const facts = await this.readFacts(env, p, t, d, packageId, v, true);
    const checks = acceptanceFocus(facts.facts.package.domain_kind, facts.facts, facts.acceptance as unknown as AcceptanceFacts);
    const runId = newId();
    const out = await this.write(env, p, t, d, 'domain.package.acceptance', 'DPG', packageId, async (cap) => ({
      result: await cap.recordRun({ runId, packageId, tenantId: t, domainId: d, version: v, mode: 'acceptance', suiteVersion: `${ACCEPTANCE_VERSION}:${facts.facts.package.domain_kind}`, checks,
                                    factsDigest: facts.digest, factsReadAt: facts.readAt, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { run: out.result, receipt: PackagesService.receipt(out) };
  }

  async certify(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, version: number, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.package.certify', 'DPG', packageId, async (cap) => ({
      result: await cap.certify({ packageId, tenantId: t, domainId: d, version, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { version: out.result, receipt: PackagesService.receipt(out) };
  }

  /** ACTIVATE: the DPG object (state active, the section approvals and the certification run named) admitted, then the port. */
  async activate(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, version: number) {
    const out = await this.write(env, p, t, d, 'domain.package.activate', 'DPG', packageId, async (cap) => {
      const k = await cap.package(packageId);
      if (k === null) throw refuse('domain package', 'unknown_package', `${packageId} is not a package of this domain`, env.correlation_id, 404);
      const v = await cap.version(packageId, version);
      if (v === null) throw refuse('domain package', 'unknown_version', `${String(k['package_key'])} has no version ${version}`, env.correlation_id, 404);
      const sections = await cap.sectionState(packageId, version);
      const run = (await cap.runs(packageId, 200)).find((r) => r['mode'] === 'certification' && Number(r['version']) === version) ?? null;
      const objectVersion = ((await cap.latestObjectVersion('DPG', packageId)) ?? 0) + 1;
      const payload: Row = {
        package_id: packageId, package_key: String(k['package_key']), domain_kind: String(k['domain_kind']), title: String(k['title']), version, semver: String(v['semver']), state: 'active',
        owner_principal_id: String(k['owner_principal_id']), manifest: v['manifest'], manifest_digest: String(v['manifest_digest']),
        sections: SECTIONS.map((s) => { const x = (sections[s] ?? {}) as Row; return { section: s, digest: String(x['digest'] ?? ''), state: x['state'] ?? 'open', approver: x['approver'] ?? null, decided_at: x['decided_at'] ?? null, expires_at: x['expires_at'] ?? null, ontology_version_id: x['ontology_version_id'] ?? null }; }),
        conformance: run === null ? null : { run_id: run['run_id'], passed: run['passed'], ran_at: run['ran_at'], suite_version: run['suite_version'] },
        certified_by: v['certified_by'] ?? null, certified_at: v['certified_at'] ?? null, disabled_functions: {}, conflict: null, boundary: BOUNDARY,
      };
      await this.admit(cap, this.dpgHeader(t, d, packageId, objectVersion, String(k['owner_principal_id']), p.principalId, env.purpose_id ?? 'intelligence', env.correlation_id, await cap.now()), payload, 'domain package', env.correlation_id);
      const r = await cap.activate({ packageId, tenantId: t, domainId: d, version, objectVersion, actor: p.principalId, correlationId: env.correlation_id });
      return { result: { ...r, dpg: { object_version: objectVersion, schema_ref: DPG_SCHEMA } }, targetVersion: String(objectVersion) };
    });
    return { version: out.result, receipt: PackagesService.receipt(out) };
  }

  async retire(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.package.retire', 'DPG', packageId, async (cap) => ({
      result: await cap.retire({ packageId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { package: out.result, receipt: PackagesService.receipt(out) };
  }

  // ───────────────────────── PK4: health and re-enablement ─────────────────────────
  /** HEALTH: the active version's facts read first, the faults evaluated, the run recorded by the port (which disables, exposes, routes). */
  async health(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string) {
    const v = await this.activeVersion(env, p, t, d, packageId, 'domain package');
    const facts = await this.readFacts(env, p, t, d, packageId, v, false);
    const h = evaluateHealth(facts.facts);
    const failing = h.checks.filter((c) => !c.passed).map((c) => ({ check: c.check, findings: c.findings }));
    const digest = digestOf({ disable: h.disable, conflict: h.conflict, failing });
    const runId = newId();
    const out = await this.write(env, p, t, d, 'domain.package.health', 'DPG', packageId, async (cap) => ({
      result: await cap.recordHealth({ runId, packageId, tenantId: t, domainId: d, version: v, checks: h.checks, disable: h.disable, conflict: h.conflict, factsDigest: digest, factsReadAt: facts.readAt,
                                       actor: p.principalId, correlationId: env.correlation_id }),
    }));
    const health: Row = { ...out.result, evaluation: { disable: h.disable, conflict: h.conflict } };
    return { health, receipt: PackagesService.receipt(out) };
  }

  async enable(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, b: { version: number; functions: string[]; clearConflict: boolean; reason: string }) {
    const out = await this.write(env, p, t, d, 'domain.package.enable', 'DPG', packageId, async (cap) => ({
      result: await cap.enable({ packageId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { enabled: out.result, receipt: PackagesService.receipt(out) };
  }

  /** The after-tick hook: every ACTIVE package of the domain re-checked (each its own read and write under the attention agent's session);
   *  STARTED, awaited at most `healthAwaitMs` — a re-check that outlives the bound goes on alone and closes itself; one in flight per domain. */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const key = `${a.tenantId}:${a.domainId}`;
    const live = this.inFlight.get(key);
    if (live !== undefined) return { skipped: `a package health re-check of this domain is in flight since ${live.since}` };
    const since = new Date().toISOString();
    const done: Promise<Row> = this.recheckDomain(a).catch((e: unknown): Row => ({ error: textOf(e).slice(0, 500) })).finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, { since, done });
    let timer: NodeJS.Timeout | undefined;
    const first = await Promise.race([done, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.healthAwaitMs); })]);
    clearTimeout(timer);
    if (first !== null) return first;
    void done.then((r) => { this.log.log(`package health re-check (started ${since}) ended after the tick: ${JSON.stringify(r).slice(0, 300)}`); });
    return { in_flight: true, since, note: `the re-check goes on after the tick (waited ${this.healthAwaitMs} ms)` };
  }
  async recheckDomain(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const env = this.envelopeFor(a.principal, a.tenantId, a.domainId, READ, 'DPG', null, a.correlationId);
    const active = (await this.read(env, a.principal, a.tenantId, a.domainId, 'DPG', null, (cap) => cap.activeVersions())).result;
    const out: Row[] = [];
    for (const v of active) {
      try {
        const r = await this.health(env, a.principal, a.tenantId, a.domainId, v.package_id);
        out.push({ package_key: v.package_key, version: v.version, recorded: r.health['recorded'], newly_disabled: r.health['newly_disabled'] ?? [], conflict_exposed: r.health['conflict_exposed'] ?? false });
      } catch (e) { out.push({ package_key: v.package_key, version: v.version, error: textOf(e).slice(0, 300) }); }
    }
    return { packages: out.length, results: out };
  }

  // ───────────────────────── PK5: assessments ─────────────────────────
  async proposeAssessment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { assessmentId: string | null; key: string; template: string; subjects: string[]; statement: string; confidence: number; evidence: unknown[]; material: boolean | null }) {
    const assessmentId = b.assessmentId ?? newId();
    const out = await this.write(env, p, t, d, 'domain.assessment.propose', 'DAS', assessmentId, async (cap) => ({
      result: await cap.proposeAssessment({ assessmentId, tenantId: t, domainId: d, key: b.key, template: b.template, subjects: b.subjects, statement: b.statement, confidence: b.confidence,
                                            evidence: b.evidence, material: b.material, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { assessment: out.result, receipt: PackagesService.receipt(out) };
  }

  /** DECIDE: approve (the DAS object of the standing version admitted — approved, or limited when its source diversity is below the template's
   *  threshold — then the port) or reject. */
  async decideAssessment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assessmentId: string, b: { version: number; decision: 'approve' | 'reject'; note: string }) {
    const out = await this.write(env, p, t, d, 'domain.assessment.approve', 'DAS', assessmentId, async (cap) => {
      let objectVersion: number | null = null;
      const x = (await cap.assessment(assessmentId)).find((r) => Number(r['version']) === b.version);
      if (b.decision === 'approve' && x !== undefined && x['state'] === 'proposed') {
        const key = String(x['package_key']);
        const pkg = await cap.packageByKey(key);
        const active = pkg === null ? undefined : (await cap.versions(String(pkg['package_id']))).find((v) => v['state'] === 'active');
        const tpl = ((active?.['manifest'] as Row | undefined)?.['assessment_templates'] as Row[] | undefined)?.find((tt) => tt['key'] === x['template']);
        if (active !== undefined && tpl !== undefined) {
          const div = await cap.diversity(t, d, x['evidence'] as unknown[], Number(tpl['min_publishers'] ?? 1));
          const state = div['meets'] === true ? 'approved' : 'limited';
          objectVersion = ((await cap.latestObjectVersion('DAS', assessmentId)) ?? 0) + 1;
          const payload: Row = {
            assessment_id: assessmentId, version: b.version, template: String(x['template']), subject_entities: x['subject_entities'], statement: String(x['statement']),
            confidence: Number(x['confidence']), evidence: x['evidence'], source_diversity: div, state, material: x['material'] === true,
            package: { package_key: key, version: Number(x['package_version']) }, approved_by: p.principalId, approved_at: await cap.now(),
          };
          const header = { ...this.dpgHeader(t, d, assessmentId, objectVersion, String(pkg?.['owner_principal_id'] ?? p.principalId), p.principalId, env.purpose_id ?? 'intelligence', env.correlation_id, await cap.now()),
            object_type: 'DAS', schema_ref: DAS_SCHEMA, method_ref: 'domain.assessment/1', supersedes: objectVersion > 1 ? `DAS:${assessmentId}@${objectVersion - 1}` : null,
            evidence_refs: (x['evidence'] as Row[]).map((e) => `EVD:${String(e['id'])}@${String(e['version'])}`),
            confidence: { value: Number(x['confidence']) }, quality_state: { source_diversity: div } } as CanonicalHeader;
          await this.admit(cap, header, payload, 'domain assessment', env.correlation_id);
        }
      }
      const r = await cap.decideAssessment({ assessmentId, tenantId: t, domainId: d, version: b.version, decision: b.decision, note: b.note, objectVersion, actor: p.principalId, correlationId: env.correlation_id });
      return { result: r, targetVersion: objectVersion === null ? null : String(objectVersion) };
    });
    return { assessment: out.result, receipt: PackagesService.receipt(out) };
  }

  async limitAssessment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assessmentId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.assessment.limit', 'DAS', assessmentId, async (cap) => ({
      result: await cap.limitAssessment({ assessmentId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { assessment: out.result, receipt: PackagesService.receipt(out) };
  }

  // ───────────────────────── PK5: watchlists, events, alerts, links ─────────────────────────
  async declareWatchlist(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { watchlistId: string | null; key: string; title: string; entities: string[]; indicators: string[]; rules: unknown[]; freshnessDays: number; expectedVersion: number }) {
    const watchlistId = b.watchlistId ?? newId();
    const out = await this.write(env, p, t, d, 'domain.watchlist.declare', 'DPG', null, async (cap) => ({
      result: await cap.declareWatchlist({ watchlistId, tenantId: t, domainId: d, key: b.key, title: b.title, entities: b.entities, indicators: b.indicators, rules: b.rules, freshnessDays: b.freshnessDays,
                                           expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }),
      targetType: 'WLS', targetId: watchlistId,
    }));
    return { watchlist: out.result, receipt: PackagesService.receipt(out) };
  }
  async retireWatchlist(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, watchlistId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.watchlist.retire', 'DPG', null, async (cap) => ({
      result: await cap.retireWatchlist({ watchlistId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'WLS', targetId: watchlistId,
    }));
    return { watchlist: out.result, receipt: PackagesService.receipt(out) };
  }
  async recordEvent(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; kind: string; title: string; subjects: string[]; occurredOn: string; evidence: unknown[] }) {
    const eventId = newId();
    const out = await this.write(env, p, t, d, 'domain.event.record', 'DPG', null, async (cap) => ({
      result: await cap.recordEvent({ eventId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DEV', targetId: eventId,
    }));
    return { event: out.result, receipt: PackagesService.receipt(out) };
  }
  async confirmEvent(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, eventId: string, b: { decision: string; note: string }) {
    const out = await this.write(env, p, t, d, 'domain.event.confirm', 'DPG', null, async (cap) => ({
      result: await cap.confirmEvent({ eventId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DEV', targetId: eventId,
    }));
    return { event: out.result, receipt: PackagesService.receipt(out) };
  }
  async adjudicateAlert(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, alertId: string, b: { adjudication: string; note: string }) {
    const out = await this.write(env, p, t, d, 'domain.alert.adjudicate', 'DPG', null, async (cap) => ({
      result: await cap.adjudicateAlert({ alertId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DAL', targetId: alertId,
    }));
    return { alert: out.result, receipt: PackagesService.receipt(out) };
  }
  async resolveAlerts(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, watchlistId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.alert.resolve', 'DPG', null, async (cap) => ({
      result: await cap.resolveAlerts({ watchlistId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'WLS', targetId: watchlistId,
    }));
    return { resolution: out.result, receipt: PackagesService.receipt(out) };
  }
  async declareLink(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; kind: string; targetId: string; assessmentId: string | null; note: string }) {
    const linkId = newId();
    const out = await this.write(env, p, t, d, 'domain.link.declare', 'DPG', null, async (cap) => ({
      result: await cap.declareLink({ linkId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DLN', targetId: linkId,
    }));
    return { link: out.result, receipt: PackagesService.receipt(out) };
  }
  async withdrawLink(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, linkId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'domain.link.withdraw', 'DPG', null, async (cap) => ({
      result: await cap.withdrawLink({ linkId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'DLN', targetId: linkId,
    }));
    return { link: out.result, receipt: PackagesService.receipt(out) };
  }

  /** The package gate's answer for one function, under a real read (the workspace and §CI's pages read it the same way). */
  async gateState(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, key: string, fn: string | null, noun: Noun | null) {
    const out = await this.read(env, p, t, d, 'DPG', null, async (cap) => {
      if (noun === null) return this.gate.state(cap.tx, { tenantId: t, domainId: d, packageKey: key, fn });
      try { return await this.gate.assertActive(cap.tx, { tenantId: t, domainId: d, packageKey: key, fn }, noun); }
      catch (e) { if (e instanceof PackageUnavailable) throw refuse(noun, 'package', e.answer.reason, env.correlation_id); throw e; }
    });
    return { gate: out.result, receipt: PackagesService.receipt(out) };
  }

  // ───────────────────────── facts ─────────────────────────
  /** The facts, READ FIRST in their own governed read (never inside the write): the digest names what was read (the database instant excluded). */
  private async readFacts(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, version: number, withAcceptance: boolean) {
    const out = await this.read(env, p, t, d, 'DPG', packageId, async (cap) => ({
      facts: await cap.facts(packageId, version), acceptance: withAcceptance ? await cap.acceptanceFacts(packageId, version) : null, readAt: await cap.now(),
    }));
    const f = out.result.facts as unknown as PackageFacts | null;
    if (f === null) throw refuse('package conformance', 'unknown_version', `package ${packageId} has no version ${version} in this domain`, env.correlation_id, 404);
    const { now: _now, ...rest } = f as unknown as Row;
    return { facts: f, acceptance: out.result.acceptance, readAt: out.result.readAt, digest: digestOf({ rest, acceptance: out.result.acceptance }) };
  }
  private async activeVersion(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, packageId: string, noun: Noun): Promise<number> {
    const out = await this.read(env, p, t, d, 'DPG', packageId, async (cap) => ({ k: await cap.package(packageId), v: (await cap.versions(packageId)).find((x) => x['state'] === 'active') ?? null }));
    if (out.result.k === null) throw refuse(noun, 'unknown_package', `${packageId} is not a package of this domain`, env.correlation_id, 404);
    if (out.result.v === null) throw refuse(noun, 'state', `package ${String(out.result.k['package_key'])} has no active version`, env.correlation_id, 409);
    return Number(out.result.v['version']);
  }
}

export type { Check };
