/**
 * B80 §TK (0118_b80_x_tk; F-P7-E-03: UX-68-001…005, UX-ADR-022, PAT-41, REL-16, UX-17-005, UX-05-003/-005) — THE GOVERNED CUSTOMER THEME:
 * the orchestration the ports do not do.
 *
 *   TENANT (the tenant's themes — base /v1/tenants/:t/governance/design/themes):
 *     read · in-force/read · :id/preview      the theme versions, certifications, activations, the theme IN FORCE and the ledger; a version's
 *                                             contrast matrix computed from the STORED mapping with the CALLER's eligibility in words;
 *     propose · :id/activate · rollback · :id/retire   the brand owner's acts (human-gated; the port re-checks the human and the role);
 *     :id/certify                             the Design System Authority's act (human-gated; never the proposer, never an agent): the
 *                                             certification digest previewed is SIGNED first (B36's key reference), then the port
 *                                             recomputes the matrix and decides — a REFUSED certification commits its record and is
 *                                             answered 409 `design theme rejected (contrast): <the failing pairs and their ratios>`.
 *   PLATFORM (the Design System Authority's queue — /v1/governance/design/themes/queue/read): every tenant's themes awaiting certification.
 *   PLATFORM (the library lint — /v1/governance/design/library/lint): dg-lint-2 over the repository's web source (forks of library components,
 *     token values redefined), recorded through B107's evaluation port under governance.design.evaluate; and the library's props contracts
 *     (the compatibility gate's evidence).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-themes-b80); DEMONSTRATED OPERATION (the act — SYNTHETIC brand owner, tenant
 * and theme; `claim = demonstration`); REAL ACCEPTANCE (a real customer's brand acceptance; the named design authorities — H3 / R2) — never.
 */
import { HttpException, Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../../shared/auth-types.js';
import { newId } from '../../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../../pipeline/pipeline.service.js';
import { receipt } from '../../seams.js';
import { DesignCap } from '../design.capabilities.js';
import { readRepository } from '../design-source.js';
import { ThemeCap, type ThemeCapability } from './themes.capabilities.js';
import { signCertification } from './themes-signing.js';
import { THEME_IN_FORCE_READ, THEME_READ, refuseTheme, themeAction, themeEligibility, themeRefusal } from './themes-logic.js';
import { FORK_PRINCIPLE, libraryContracts, lintLibrary } from './library-lint.js';

type Row = Record<string, unknown>;
export const TK_BOUNDARY = 'construction, demonstrated operation and real acceptance are three different claims: every theme and certification here is `claim = demonstration` (SYNTHETIC on a demonstration); a real customer\'s brand acceptance and the named design authorities\' attestation are H3 / R2 and never recorded here. A customer theme maps brand expression only (the accent, the surface tints, the wordmark, the logo); it applies on screen in light and dark — print and forced colours render the certified core palette.';

const tenantRoute = (t: string, action: string, objectId: string | null): RouteInfo => ({ scope: 'TENANT', tenantId: t, domainId: null, action, objectType: 'THM', objectId });
const platformRoute = (action: string, objectType: string, objectId: string | null): RouteInfo => ({ scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId });
function derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
  const none = action.endsWith('.read') || action.endsWith('.preview');
  return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: none ? 'none' : 'reversible', message_id: newId() } as Envelope;
}

@Injectable()
export class ThemesService {
  constructor(private readonly pipeline: PipelineService) {}

  /** Every call: a port's `design theme rejected (<class>): …` answered in the class form (this part's noun, mapped here). */
  private async guarded<T>(cid: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { const r = themeRefusal(e, cid); if (r !== null) throw r; throw e; }
  }
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, route: RouteInfo, fn: (cap: ThemeCapability) => Promise<T>) {
    return this.guarded(env.correlation_id, () => this.pipeline.consequentialRead(derive(env, route.action, route.objectType, route.objectId), p, route, ThemeCap, async (cap) => fn(cap)));
  }
  private write<T extends Row>(env: Envelope, p: AuthenticatedPrincipal, route: RouteInfo, fn: (cap: ThemeCapability) => Promise<T>, refusedWhen?: (r: T) => boolean) {
    return this.guarded(env.correlation_id, () => this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, ThemeCap, async (cap) => {
      const r = await fn(cap);
      const refused = refusedWhen?.(r) === true;
      return { result: r, targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null,
               ...(refused ? { evidence: { outcome: 'failure' as const, resultCode: 'EYE-STA-002', metadata: { refused: true, failing: (r['failing_text'] ?? []) as unknown } } } : {}) };
    }));
  }
  private holds(p: AuthenticatedPrincipal, role: string, t: string | null): boolean {
    return p.bindings.some((b) => b.roleCode === role && (b.scope === 'PLATFORM' || (b.scope === 'TENANT' && t !== null && b.tenantId === t)));
  }

  // ───────────────────────── reads ─────────────────────────
  async tenantRead(env: Envelope, p: AuthenticatedPrincipal, t: string) {
    const out = await this.read(env, p, tenantRoute(t, THEME_READ, null), async (cap) => {
      const core = await cap.coreMatrix();
      return { themes: await cap.themes(t), activations: await cap.activations(t), in_force: await cap.inForce(t), ledger: await cap.ledger(t, 80),
               core: { rules_version: core['rules_version'], outcome: core['outcome'], pairs: core['pairs'], modes: core['modes'] }, read_at: await cap.now() };
    });
    return { ...out.result, boundary: TK_BOUNDARY, receipt: receipt(out) };
  }
  async inForce(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string | null = null) {
    const route: RouteInfo = d === null ? tenantRoute(t, THEME_IN_FORCE_READ, null) : { scope: 'DOMAIN', tenantId: t, domainId: d, action: THEME_IN_FORCE_READ, objectType: 'THM', objectId: null };
    const out = await this.read(env, p, route, async (cap) => ({ in_force: await cap.inForce(t), read_at: await cap.now() }));
    return { ...out.result, receipt: receipt(out) };
  }
  async queue(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.read(env, p, platformRoute(THEME_READ, 'THM', null), async (cap) => {
      const all = await cap.themes(null);
      return { awaiting: all.filter((x) => x['state'] === 'proposed'), recent: all.filter((x) => x['certification'] !== null).slice(0, 40), ledger: await cap.ledger(null, 60), read_at: await cap.now() };
    });
    return { ...out.result, boundary: TK_BOUNDARY, receipt: receipt(out) };
  }
  /** The version, its matrix from the STORED mapping, the failing pairs in words, the certification digest — and the caller's eligibility. */
  async preview(env: Envelope, p: AuthenticatedPrincipal, t: string, themeId: string, version: number) {
    const out = await this.read(env, p, tenantRoute(t, themeAction('preview'), themeId), async (cap) => {
      const v = await cap.preview(themeId, version);
      if (v === null) return null;
      const inForce = await cap.inForce(t);
      const current = (inForce['activation'] ?? null) as Row | null;
      const isInForce = current !== null && current['theme_id'] === themeId && current['theme_version'] === version;
      const base = { kind: p.kind, holdsBrand: this.holds(p, 'branding_authority', t), holdsDsa: this.holds(p, 'design_system_authority', null), principal: p.principalId,
                     proposer: String(v['proposed_by']), state: String(v['state']), inForce: isInForce };
      return { ...v, in_force: isInForce, eligibility: { certify: themeEligibility({ ...base, act: 'certify' }), activate: themeEligibility({ ...base, act: 'activate' }),
                                                          retire: themeEligibility({ ...base, act: 'retire' }) },
               consequence: { certify: ['the matrix is recomputed from the stored mapping and decides: CERTIFIED when every pair passes, REFUSED with the failing pairs named', 'the certification is signed with your key over the digest shown'],
                              activate: ['the version becomes the tenant\'s theme in force on screen (light and dark); print and forced colours keep the certified core palette', 'a rollback returns to the theme before it'] } };
    });
    if (out.result === null) throw refuseTheme('unknown_theme', `${themeId} has no version ${version} in this tenant`, env.correlation_id, 404);
    return { preview: out.result, boundary: TK_BOUNDARY, receipt: receipt(out) };
  }

  // ───────────────────────── the brand owner's acts ─────────────────────────
  async propose(env: Envelope, p: AuthenticatedPrincipal, t: string, b: { themeId: string | null; key: string; expectedVersion: number; title: string; mapping: Row }) {
    const id = b.themeId ?? newId();
    const out = await this.write(env, p, tenantRoute(t, themeAction('propose'), id), async (cap) =>
      cap.propose({ themeId: b.themeId, tenant: t, key: b.key, expectedVersion: b.expectedVersion, title: b.title, mapping: b.mapping, actor: p.principalId, correlationId: env.correlation_id }));
    return { theme: out.result, receipt: receipt(out) };
  }
  async activate(env: Envelope, p: AuthenticatedPrincipal, t: string, themeId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, tenantRoute(t, themeAction('activate'), themeId), async (cap) =>
      cap.activate({ themeId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { activation: out.result, receipt: receipt(out) };
  }
  async rollback(env: Envelope, p: AuthenticatedPrincipal, t: string, b: { expectedActivation: string | null; reason: string }) {
    const out = await this.write(env, p, tenantRoute(t, themeAction('rollback'), b.expectedActivation), async (cap) =>
      cap.rollback({ tenant: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { activation: out.result, receipt: receipt(out) };
  }
  async retire(env: Envelope, p: AuthenticatedPrincipal, t: string, themeId: string, b: { version: number; reason: string }) {
    const out = await this.write(env, p, tenantRoute(t, themeAction('retire'), themeId), async (cap) =>
      cap.retire({ themeId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { theme: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the Design System Authority's act ─────────────────────────
  async certify(env: Envelope, p: AuthenticatedPrincipal, t: string, themeId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, tenantRoute(t, themeAction('certify'), themeId), async (cap) => {
      // sign only the digest the port will recompute for a still-proposed version (a stale digest or a decided version: the port refuses, unsigned)
      const v = await cap.preview(themeId, b.version);
      let signatureId: string | null = null;
      if (v !== null && v['state'] === 'proposed' && v['certification_digest'] === b.digest) {
        signatureId = await signCertification(cap, { themeId, version: b.version, digest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
      }
      return cap.certify({ themeId, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
    }, (r) => r['outcome'] === 'refused');
    if (out.result['outcome'] === 'refused') {
      const pairs = (out.result['failing_text'] ?? []) as string[];
      const e = refuseTheme('contrast', `v${b.version} is REFUSED certification — ${pairs.length} failing pair${pairs.length === 1 ? '' : 's'}: ${pairs.join('; ')}; the certified core theme stays in force; correct the mapping in a new version`, env.correlation_id, 409);
      throw new HttpException({ ...(e.getResponse() as Row), certification: out.result, receipt: receipt(out) }, 409);
    }
    return { certification: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── PLATFORM: the library lint (dg-lint-2) and the props contracts ─────────────────────────
  async lintLibrary(env: Envelope, p: AuthenticatedPrincipal, given: { files: Array<{ path: string; text: string }> } | null) {
    const files = given?.files ?? readRepository()?.files ?? null;
    if (files === null) throw refuseTheme('state', 'this deployment carries no web source to lint', env.correlation_id, 409);
    const lint = lintLibrary(files);
    const evaluationId = newId();
    const route = platformRoute('governance.design.evaluate', 'DSE', evaluationId);
    const out = await this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, DesignCap, async (cap) => ({
      result: await cap.recordEvaluation({ evaluationId, source: 'lint', assetId: null, assetVersion: null, inputDigest: lint.inputDigest, rulesVersion: lint.rulesVersion,
        findings: lint.findings.map((f) => ({ rule: f.rule, principle: FORK_PRINCIPLE, file: f.file, line: f.line, excerpt: f.excerpt, note: f.note })), actor: p.principalId, correlationId: env.correlation_id }),
      targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null }));
    return { evaluation: { ...out.result, files: lint.files, counts: lint.counts, library: lint.library.length }, contracts: libraryContracts(files), receipt: receipt(out) };
  }
}
