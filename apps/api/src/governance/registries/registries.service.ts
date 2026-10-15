/**
 * B107 §RG (0115_b107_x_rg) — THE REGISTRIES, TRACEABILITY AND CHANGE IMPACT: the orchestration the ports do not do.
 *
 *   IMPORT (the conformance steward): the repository's registers READ (files: no database; the database registers: a governed read FIRST),
 *     parsed (importers.ts), then ONE governed write per source (governance.rg_import — idempotent, the source's sha256 recorded); then, when
 *     a source changed a normative artifact, the CHANGE IMPACT recorded (governance.rg_record_impact, trigger `import`) — ES-02-005: conformance
 *     re-evaluated when a controlling specification changes. The repository is never written.
 *   REGISTER / LINK / RETIRE (the steward): the normative-artifact registry and the trace links; a registration that changes a normative
 *     artifact records its impact the same way (trigger `register`).
 *   TRACE / ORPHANS / LINT / INHERITANCE / ADMISSION / SNAPSHOT: governed, audited reads (governance.read).
 *   IMPACT: previewed (a read, with its digest) → recorded on the digest shown (the steward; a moved link set is STALE).
 *   RECONCILE INHERITANCE (the steward): holds opened or lifted by the port.
 *   VERIFICATION: a report normalised here (reports.ts), ingested (the steward); REVIEWED by independent assurance (human-gated; the port
 *     re-checks: never the ingester, never the runner, never an agent).
 *   FIXTURES: registered / rebuilt and quarantined (the steward), APPROVED by independent assurance (human-gated; never a builder); the
 *     SWEEP reads the expired fixtures first, then quarantines each (reason `stale`) in its own write.
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-registries-b107); DEMONSTRATED OPERATION (the act with SYNTHETIC personas);
 * PRODUCTION ADMISSION / REAL ACCEPTANCE (R1/R2/H3) — never claimed: the admission check is the construction half only.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PdpService } from '../../policy/pdp.service.js';
import { BOUNDARY, domainRoute, governedRead, governedWrite, platformRoute, receipt, refuseGovernance } from '../seams.js';
import { RegistriesCap, type RegistriesCapability } from './registries.capabilities.js';
import { buildIdentity, repoRoot } from './build-identity.js';
import {
  type SourcePlan, decisionsSource, exceptionExpired, exceptionsSource, interfacesSource, requirementIndex, requirementsSource, rowmapSource, schemasSource, sha256, v8CapabilityIds,
} from './importers.js';
import { type VerificationReport, fromGateReceipt, fromPlaywright, fromVitest } from './reports.js';

type Row = Record<string, unknown>;
export const READ = 'governance.read';
export const SOURCE_NAMES = ['requirements', 'rowmap', 'decisions', 'exceptions', 'interfaces', 'schemas'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];
export const RG_BOUNDARY = `${BOUNDARY} §RG: the repository's registers (audit/requirements/*.csv, the rowmap and tracker, DECISIONS.md, EXCEPTIONS.md) are imported READ-ONLY and stay authoritative — nothing here writes them, marks a unit verified:all or stands for a leg pointer; the C15 dispositions are never imported. The admission check is the construction half; production admission is R1.`;

@Injectable()
export class RegistriesService {
  constructor(private readonly pipeline: PipelineService, private readonly moduleRef: ModuleRef) {}

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, objectType: string, objectId: string | null, fn: (cap: RegistriesCapability) => Promise<T>) {
    return governedRead(this.pipeline, env, p, platformRoute(READ, objectType, objectId), RegistriesCap, fn);
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, fn: (cap: RegistriesCapability) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, platformRoute(action, objectType, objectId), RegistriesCap, async (cap) => ({ result: await fn(cap) }));
  }
  private bundle(): string | null {
    try { return this.moduleRef.get(PdpService, { strict: false }).bundleVersion; } catch { return null; }
  }
  /** The build identity's API half (the database half is added by the port: governance.rg_build_identity). */
  build(): Row { return buildIdentity(this.bundle()) as unknown as Row; }

  // ───────────────────────── reading the repository's registers (files — never written) ─────────────────────────
  private requirementFiles(root: string): Array<{ path: string; text: string }> {
    const dir = join(root, 'audit', 'requirements');
    return readdirSync(dir).filter((f) => /^v[0-9]+(?:-v[0-9]+)?\.csv$/.test(f)).sort().map((f) => ({ path: `audit/requirements/${f}`, text: readFileSync(join(dir, f), 'utf8') }));
  }
  /** The file sources, parsed (pure). Order: requirements by volume (V8's catalogues before V9's bindings), the rowmap, decisions, exceptions. */
  planFiles(names: readonly SourceName[], root = repoRoot()): SourcePlan[] {
    const files = this.requirementFiles(root);
    const plans: SourcePlan[] = [];
    const at = <X>(path: string, fn: () => X): X => { try { return fn(); } catch (e) { throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`); } };
    const v08 = files.find((f) => f.path.endsWith('/v08.csv'));
    const catalogue = v08 === undefined ? new Set<string>() : at(v08.path, () => v8CapabilityIds(v08.text));
    if (names.includes('requirements')) for (const f of files) plans.push(at(f.path, () => requirementsSource(f.path, f.text, catalogue)));
    if (names.includes('rowmap')) plans.push(at('audit/delivery/feature-rowmap.csv', () => rowmapSource('audit/delivery/feature-rowmap.csv', readFileSync(join(root, 'audit/delivery/feature-rowmap.csv'), 'utf8'),
                                                          readFileSync(join(root, 'audit/delivery/FEATURE_TRACKER.csv'), 'utf8'))));
    if (names.includes('decisions') || names.includes('exceptions')) {
      const idx = at('audit/requirements', () => requirementIndex(files));
      if (names.includes('decisions')) plans.push(decisionsSource('DECISIONS.md', readFileSync(join(root, 'DECISIONS.md'), 'utf8'), idx));
      if (names.includes('exceptions')) plans.push(exceptionsSource('EXCEPTIONS.md', readFileSync(join(root, 'EXCEPTIONS.md'), 'utf8'), idx));
    }
    return plans;
  }
  /** The CURRENT digest of every file source (the reconciliation of desired = the repository against observed = the last import). */
  currentFileDigests(root = repoRoot()): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    const safe = (f: () => string): string | null => { try { return f(); } catch { return null; } };
    for (const f of safe(() => readdirSync(join(root, 'audit', 'requirements')).join('\n'))?.split('\n').filter((x) => /^v[0-9]+(?:-v[0-9]+)?\.csv$/.test(x)).sort() ?? []) {
      out[`audit/requirements/${f}`] = safe(() => sha256(readFileSync(join(root, 'audit/requirements', f))));
    }
    const rm = safe(() => sha256(readFileSync(join(root, 'audit/delivery/feature-rowmap.csv')))); const tr = safe(() => sha256(readFileSync(join(root, 'audit/delivery/FEATURE_TRACKER.csv'))));
    out['audit/delivery/feature-rowmap.csv'] = rm === null || tr === null ? null : sha256(`${rm}:${tr}`);
    out['DECISIONS.md'] = safe(() => sha256(readFileSync(join(root, 'DECISIONS.md'))));
    out['EXCEPTIONS.md'] = safe(() => sha256(readFileSync(join(root, 'EXCEPTIONS.md'))));
    return out;
  }

  // ───────────────────────── THE OVERVIEW ─────────────────────────
  async overview(env: Envelope, p: AuthenticatedPrincipal) {
    const root = repoRoot();
    const files = this.currentFileDigests(root);
    const out = await this.read(env, p, 'GRG', null, async (cap) => {
      const db = { 'objects.interface_register': interfacesSource(await cap.interfaceRows()).source_digest, 'objects.schema_registry': schemasSource(await cap.schemaRows()).source_digest };
      const latest = await cap.latestImports();
      const today = await cap.today();
      const desired: Record<string, string | null> = { ...files, ...db };
      const reconciliation = Object.keys(desired).sort().map((path) => {
        const last = latest.find((l) => l['source_path'] === path) ?? null;
        return { source_path: path, current_digest: desired[path], imported_digest: last?.['source_digest'] ?? null, imported_at: last?.['imported_at'] ?? null,
                 state: last === null ? 'never_imported' : desired[path] === null ? 'source_unreadable' : last['source_digest'] === desired[path] ? 'in_sync' : 'drifted' };
      });
      const engineering = (await cap.engineeringExceptions()).map((e) => ({ ...e, expired: e['status'] === 'open' && exceptionExpired(String(e['expiry_date'] ?? ''), today) }));
      return {
        database_identity: await cap.dbIdentity(), today, sources: latest, reconciliation, counts: await cap.counts(), orphans: await cap.orphans(null, 5, 0), lint: await cap.lint(10),
        holds: await cap.holds(100), impacts: await cap.impacts(10), verification: await cap.verificationRecords(25), fixtures: await cap.fixtures(),
        engineering_exceptions: engineering, requirement_snapshot: await cap.snapshot(['requirement']), ledger: await cap.ledger(30), read_at: await cap.now(),
      };
    });
    return { ...out.result, build: this.build(), boundary: RG_BOUNDARY, receipt: receipt(out) };
  }

  // ───────────────────────── IMPORT ─────────────────────────
  async importRegisters(env: Envelope, p: AuthenticatedPrincipal, names: readonly SourceName[]) {
    const root = repoRoot();
    // READ FIRST: the files (pure) and the database registers (a governed read) — the writes below are short
    let plans: SourcePlan[];
    try { plans = this.planFiles(names, root); } catch (e) {
      // a malformed or unreadable register is refused WHOLE, before any write (nothing is guessed, nothing partial is recorded)
      throw refuseGovernance('requirement registry', 'source', `the repository's registers could not be read: ${e instanceof Error ? e.message : String(e)}`, env.correlation_id);
    }
    if (names.includes('interfaces') || names.includes('schemas')) {
      const rows = (await this.read(env, p, 'GRG', null, async (cap) => ({ i: await cap.interfaceRows(), s: await cap.schemaRows() }))).result;
      if (names.includes('interfaces')) plans.push(interfacesSource(rows.i));
      if (names.includes('schemas')) plans.push(schemasSource(rows.s));
    }
    const build = this.build();
    const results: Row[] = []; const changed: string[] = []; let lastImport: string | null = null;
    for (const plan of plans) {
      const importId = newId();
      const out = await this.write(env, p, 'governance.registry.import', 'RGI', importId, async (cap) => cap.import({ plan, build, actor: p.principalId, importId, correlationId: env.correlation_id }));
      const r = out.result;
      const imp = (r['import'] ?? {}) as Row;
      if (r['unchanged'] !== true) {
        lastImport = importId;
        for (const c of (Array.isArray(imp['changed']) ? imp['changed'] : []) as string[]) changed.push(c);
      }
      results.push({ source_path: plan.source_path, source_kind: plan.source_kind, rows: plan.items.length, links: plan.links.length, unchanged: r['unchanged'] === true,
                     counts: imp['counts'] ?? null, unresolved: imp['unresolved'] ?? [], import_id: r['unchanged'] === true ? imp['import_id'] : importId, receipt: receipt(out) });
    }
    // ES-02-005: a normative change re-evaluates the dependents (chunks of 500, deterministic order)
    const impacts: Row[] = [];
    const uniq = [...new Set(changed)].sort();
    for (let i = 0; i < uniq.length; i += 500) {
      impacts.push(await this.recordImpact(env, p, uniq.slice(i, i + 500).map((id) => ({ artifact_id: id })), 8, null, 'import', lastImport));
    }
    return { imported: results, impacts, boundary: RG_BOUNDARY };
  }

  // ───────────────────────── REGISTER / LINK ─────────────────────────
  async register(env: Envelope, p: AuthenticatedPrincipal, b: { kind: string; key: string; expectedVersion: number; title: string; authorityClass: string; volume: string | null; lifecycle: string;
                                                                attributes: Row; supersedes: string | null; parent: string | null; owner: string | null; ownerRole: string | null }) {
    const out = await this.write(env, p, 'governance.registry.register', 'ART', null, async (cap) => cap.register({ ...b, actor: p.principalId, correlationId: env.correlation_id }));
    const changed = (Array.isArray(out.result['changed_artifacts']) ? out.result['changed_artifacts'] : []) as string[];
    const impact = changed.length === 0 ? null : await this.recordImpact(env, p, changed.map((id) => ({ artifact_id: id })), 8, null, 'register', String(out.result['artifact_id']));
    return { artifact: out.result, impact, receipt: receipt(out) };
  }
  async link(env: Envelope, p: AuthenticatedPrincipal, b: { from: string; to: string; relation: string; attributes: Row; reason: string }) {
    const out = await this.write(env, p, 'governance.trace.link', 'LNK', null, async (cap) => cap.link({ ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { link: out.result, receipt: receipt(out) };
  }
  async retireLink(env: Envelope, p: AuthenticatedPrincipal, linkId: string, reason: string) {
    const out = await this.write(env, p, 'governance.trace.link', 'LNK', linkId, async (cap) => cap.retireLink({ linkId, reason, actor: p.principalId, correlationId: env.correlation_id }));
    return { link: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE READS ─────────────────────────
  /** An artifact named by id, or by kind + key (resolved inside the same read). */
  private async idOf(cap: RegistriesCapability, ref: { artifactId: string | null; kind: string | null; key: string | null }, cid: string): Promise<string> {
    if (ref.artifactId !== null) return ref.artifactId;
    const id = await cap.artifactId(ref.kind ?? '', ref.key ?? '');
    if (id === null) throw refuseGovernance('trace link', 'unknown_artifact', `no current ${ref.kind ?? '?'} ${ref.key ?? '?'} in the registry`, cid, 404);
    return id;
  }
  async trace(env: Envelope, p: AuthenticatedPrincipal, ref: { artifactId: string | null; kind: string | null; key: string | null }, depth: number, asOf: string | null) {
    const out = await this.read(env, p, 'ART', ref.artifactId, async (cap) => cap.trace(await this.idOf(cap, ref, env.correlation_id), depth, asOf));
    return { trace: out.result, receipt: receipt(out) };
  }
  async resolve(env: Envelope, p: AuthenticatedPrincipal, kind: string, key: string, asOf: string | null) {
    const out = await this.read(env, p, 'ART', null, async (cap) => cap.resolve(kind, key, asOf));
    return { resolution: out.result, receipt: receipt(out) };
  }
  async search(env: Envelope, p: AuthenticatedPrincipal, q: string, kind: string | null, limit: number) {
    const out = await this.read(env, p, 'ART', null, async (cap) => cap.search(q, kind, limit));
    return { artifacts: out.result, receipt: receipt(out) };
  }
  async orphans(env: Envelope, p: AuthenticatedPrincipal, rule: string | null, limit: number, offset: number) {
    const out = await this.read(env, p, 'ART', null, async (cap) => cap.orphans(rule, limit, offset));
    return { orphans: out.result, receipt: receipt(out) };
  }
  async lint(env: Envelope, p: AuthenticatedPrincipal, limit: number) {
    const out = await this.read(env, p, 'ART', null, async (cap) => cap.lint(limit));
    return { lint: out.result, receipt: receipt(out) };
  }
  async inheritance(env: Envelope, p: AuthenticatedPrincipal, ref: { artifactId: string | null; kind: string | null; key: string | null }) {
    const out = await this.read(env, p, 'ART', ref.artifactId, async (cap) => cap.inheritance(await this.idOf(cap, ref, env.correlation_id)));
    return { inheritance: out.result, receipt: receipt(out) };
  }
  async admission(env: Envelope, p: AuthenticatedPrincipal, ref: { artifactId: string | null; kind: string | null; key: string | null }) {
    const out = await this.read(env, p, 'ART', ref.artifactId, async (cap) => cap.admission(await this.idOf(cap, ref, env.correlation_id)));
    return { admission: out.result, receipt: receipt(out) };
  }
  async snapshot(env: Envelope, p: AuthenticatedPrincipal, kinds: string[]) {
    const out = await this.read(env, p, 'ART', null, async (cap) => cap.snapshot(kinds));
    return { snapshot: out.result, build: this.build(), receipt: receipt(out) };
  }

  // ───────────────────────── CHANGE IMPACT ─────────────────────────
  private async changesOf(cap: RegistriesCapability, cid: string, changes: Array<{ artifactId: string | null; kind: string | null; key: string | null; proposedDigest: string | null }>): Promise<Row[]> {
    const out: Row[] = [];
    for (const c of changes) out.push({ artifact_id: await this.idOf(cap, c, cid), ...(c.proposedDigest === null ? {} : { proposed_digest: c.proposedDigest }) });
    return out;
  }
  async impactPreview(env: Envelope, p: AuthenticatedPrincipal, changes: Array<{ artifactId: string | null; kind: string | null; key: string | null; proposedDigest: string | null }>, depth: number) {
    const out = await this.read(env, p, 'IMP', null, async (cap) => cap.impact(await this.changesOf(cap, env.correlation_id, changes), depth));
    return { impact: out.result, receipt: receipt(out) };
  }
  async impactRecord(env: Envelope, p: AuthenticatedPrincipal, changes: Array<{ artifactId: string | null; kind: string | null; key: string | null; proposedDigest: string | null }>, depth: number,
                     expectedDigest: string, trigger: 'change' | 'proposal') {
    // the identities resolved in a read FIRST; the port recomputes the impact and refuses a moved answer (stale)
    const resolved = (await this.read(env, p, 'IMP', null, async (cap) => this.changesOf(cap, env.correlation_id, changes))).result;
    return { impact: await this.recordImpact(env, p, resolved, depth, expectedDigest, trigger, null) };
  }
  private async recordImpact(env: Envelope, p: AuthenticatedPrincipal, changes: Row[], depth: number, expectedDigest: string | null, trigger: string, triggerRef: string | null): Promise<Row> {
    const impactId = newId();
    const out = await this.write(env, p, 'governance.impact.record', 'IMP', impactId, async (cap) => cap.recordImpact({ impactId, changes, depth, expectedDigest, trigger, triggerRef,
      build: this.build(), actor: p.principalId, correlationId: env.correlation_id }));
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── INHERITANCE (holds) ─────────────────────────
  async reconcile(env: Envelope, p: AuthenticatedPrincipal, refs: Array<{ artifactId: string | null; kind: string | null; key: string | null }>) {
    const ids = (await this.read(env, p, 'ART', null, async (cap) => { const o: string[] = []; for (const r of refs) o.push(await this.idOf(cap, r, env.correlation_id)); return o; })).result;
    const out = await this.write(env, p, 'governance.trace.check', 'ART', null, async (cap) => cap.reconcile({ ids, actor: p.principalId, correlationId: env.correlation_id }));
    return { reconciliation: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── VERIFICATION ─────────────────────────
  normalise(format: string, name: string, raw: string, cite: string[], fixtures: string[]): VerificationReport {
    if (format === 'vitest') return fromVitest(name, raw, cite, fixtures);
    if (format === 'playwright') return fromPlaywright(name, raw, cite, fixtures);
    return fromGateReceipt(name, raw, cite, fixtures);
  }
  async ingest(env: Envelope, p: AuthenticatedPrincipal, b: { report: VerificationReport; validDays: number; claim: string; runnerPrincipal: string | null }) {
    const recordId = newId(); const build = this.build();
    const validUntil = new Date(Date.now() + b.validDays * 86_400_000).toISOString();
    const report = { ...b.report, identity: { ...b.report.identity, build }, execution: { ...b.report.execution, ingested_by: p.principalId, runner_principal: b.runnerPrincipal },
                     valid_until: validUntil, claim: b.claim };
    const out = await this.write(env, p, 'governance.verification.ingest', 'VER', recordId, async (cap) => cap.ingest({ recordId, report, build, actor: p.principalId, correlationId: env.correlation_id }));
    return { verification: out.result, receipt: receipt(out) };
  }
  async verificationRead(env: Envelope, p: AuthenticatedPrincipal, recordId: string) {
    const out = await this.read(env, p, 'VER', recordId, async (cap) => ({ record: (await cap.verificationRecords(500)).find((r) => r['record_id'] === recordId) ?? null, cases: await cap.verificationCases(recordId) }));
    return { ...out.result, receipt: receipt(out) };
  }
  async review(env: Envelope, p: AuthenticatedPrincipal, recordId: string, b: { decision: string; digest: string; reason: string }) {
    const reviewId = newId();
    const out = await this.write(env, p, 'governance.verification.review', 'VER', recordId, async (cap) => cap.review({ recordId, ...b, reviewId, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── A DOMAIN'S DECISION-ACTIVE PRODUCTS (DOMAIN) ─────────────────────────
  /** The domain's administrator or executive declares that its briefing / decision package / forecast CITES the vendor's contracts (by kind and
   *  key, resolved in a read first): the product then appears among a contract change's decision-active dependents. */
  async declareProduct(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { kind: string; objectId: string; title: string; cites: Array<{ artifactId: string | null; kind: string | null; key: string | null }>; reason: string }) {
    const ids = (await governedRead(this.pipeline, env, p, domainRoute(t, d, READ, 'ART', null), RegistriesCap, async (cap) => {
      const o: string[] = []; for (const c of b.cites) o.push(await this.idOf(cap, c, env.correlation_id)); return o;
    })).result;
    const out = await governedWrite(this.pipeline, env, p, domainRoute(t, d, 'governance.trace.domain_cite', 'ART', b.objectId), RegistriesCap, async (cap) => ({
      result: await cap.declareProduct({ t, d, kind: b.kind, objectId: b.objectId, title: b.title, cites: ids, reason: b.reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { product: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── FIXTURES ─────────────────────────
  async registerFixture(env: Envelope, p: AuthenticatedPrincipal, b: { key: string; expectedVersion: number; title: string; attributes: Row; reason: string }) {
    const decisionId = newId();
    const out = await this.write(env, p, 'governance.fixture.register', 'FIX', null, async (cap) => cap.registerFixture({ ...b, decisionId, actor: p.principalId, correlationId: env.correlation_id }));
    return { fixture: out.result, receipt: receipt(out) };
  }
  async approveFixture(env: Envelope, p: AuthenticatedPrincipal, fixtureId: string, b: { version: number; digest: string; reason: string }) {
    const decisionId = newId();
    const out = await this.write(env, p, 'governance.fixture.approve', 'FIX', fixtureId, async (cap) => cap.approveFixture({ fixtureId, ...b, decisionId, actor: p.principalId, correlationId: env.correlation_id }));
    return { fixture: out.result, receipt: receipt(out) };
  }
  async quarantineFixture(env: Envelope, p: AuthenticatedPrincipal, fixtureId: string, b: { reasonClass: string; reason: string }) {
    const decisionId = newId();
    const out = await this.write(env, p, 'governance.fixture.quarantine', 'FIX', fixtureId, async (cap) => cap.quarantineFixture({ fixtureId, ...b, decisionId, actor: p.principalId, correlationId: env.correlation_id }));
    return { fixture: out.result, receipt: receipt(out) };
  }
  /** The expiry SWEEP: the expired fixtures READ first, then each quarantined (reason `stale`) in its own write. */
  async sweepFixtures(env: Envelope, p: AuthenticatedPrincipal) {
    const expired = (await this.read(env, p, 'FIX', null, async (cap) => cap.expiredFixtures())).result;
    const quarantined: Row[] = [];
    for (const f of expired) {
      quarantined.push((await this.quarantineFixture(env, p, String(f['artifact_id']), { reasonClass: 'stale', reason: `expired on ${String(f['valid_until'])} (the expiry sweep)` })).fixture);
    }
    return { expired: expired.length, quarantined };
  }
}
