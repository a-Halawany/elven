/**
 * B81 §CT (0119_b81_x_ct; F-P7-E-18: UX-69-001…006, UX-ADR-021, GLB-20, CNT-01…07/10/14/15/16) — THE GOVERNED PRODUCT LANGUAGE: the
 * orchestration the ports do not do.
 *
 *   PLATFORM (the vendor's registry — base /v1/governance/design/terms):
 *     read · :id/preview                  every version (drafts, reviews and returns included), the ledger, the published catalogue and the
 *                                         CONTENT VERSION (the digest of the published terms AND of the message catalogue apps/web/messages/en.json);
 *                                         one version with its automated checks recomputed and the CALLER's eligibility in words;
 *     propose · :id/correct               a contributor's acts (human-gated; the port re-checks the human and the role);
 *     :id/review                          a named reviewer's act (the Design System Authority or the conformance steward; never the proposer);
 *     :id/approve · :id/publish · :id/retire   the Design System Authority's acts (human-gated; never the proposer, never an agent);
 *     content-lint                        dg-lint-3 over the repository's web source, recorded through B107's evaluation port under
 *                                         governance.design.evaluate, with THE RATCHET against the committed findings list.
 *   EVERY CONTEXT (PLATFORM, TENANT, DOMAIN — …/terms/catalogue/read): the PUBLISHED catalogue in a locale with its verified-fallback marks; in a
 *     DOMAIN, each term's linked entries of B90's domain glossary beside it (read under the caller's RLS — never merged).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-terms-b81); DEMONSTRATED OPERATION (the act — SYNTHETIC personas; `claim =
 * demonstration`); REAL ACCEPTANCE (audience comprehension evidence; the independent conformance package — B111's shared non-demonstration
 * path, then H3) — never.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../../shared/auth-types.js';
import { newId } from '../../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../../pipeline/pipeline.service.js';
import { receipt } from '../../seams.js';
import { DesignCap } from '../design.capabilities.js';
import { readRepository, repoRoot } from '../design-source.js';
import { TermCap, type TermCapability } from './terms.capabilities.js';
import { TERM_CATALOGUE_READ, TERM_READ, refuseTerm, termAction, termEligibility, termRefusal } from './terms-logic.js';
import { CONTENT_PRINCIPLE, lintContent, ratchet } from './content-lint.js';
import { CONTENT_LINT_RATCHET } from './content-lint-ratchet.js';

type Row = Record<string, unknown>;
export const CT_BOUNDARY = 'construction, demonstrated operation and real acceptance are three different claims: every term here is `claim = demonstration` (SYNTHETIC on a demonstration); audience comprehension evidence with named executive, analyst and operator audiences and the independent conformance package are the shared non-demonstration recording path at B111, then H3 — never recorded here. The product language is the vendor\'s (PLATFORM); a domain\'s glossary (B90) is linked by key and read beside a term, never merged. The Arabic catalogue, locale negotiation and translation workflow are B85\'s.';

const platformRoute = (action: string, objectId: string | null, objectType = 'TRM'): RouteInfo => ({ scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId });
function derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
  const none = action.endsWith('.read') || action.endsWith('.preview');
  return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: none ? 'none' : 'reversible', message_id: newId() } as Envelope;
}
/** The digest of the message catalogue the web ships (null when this deployment carries no source tree). */
export function messagesDigest(root = repoRoot()): string | null {
  if (root === null) return null;
  const p = join(root, 'apps/web/messages/en.json');
  return existsSync(p) ? createHash('sha256').update(readFileSync(p, 'utf8')).digest('hex') : null;
}
/** THE CONTENT VERSION (UX-69-002): the published terms' digest and the message catalogue's, digested together. */
export const contentVersion = (termsDigest: string, messages: string | null): string =>
  createHash('sha256').update(`terms:${termsDigest}\nmessages:${messages ?? 'absent'}`).digest('hex');

@Injectable()
export class TermsService {
  constructor(private readonly pipeline: PipelineService) {}

  private async guarded<T>(cid: string, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) { const r = termRefusal(e, cid); if (r !== null) throw r; throw e; }
  }
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, route: RouteInfo, fn: (cap: TermCapability) => Promise<T>) {
    return this.guarded(env.correlation_id, () => this.pipeline.consequentialRead(derive(env, route.action, route.objectType, route.objectId), p, route, TermCap, async (cap) => fn(cap)));
  }
  private write<T extends Row>(env: Envelope, p: AuthenticatedPrincipal, route: RouteInfo, fn: (cap: TermCapability) => Promise<T>) {
    return this.guarded(env.correlation_id, () => this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, TermCap, async (cap) => ({
      result: await fn(cap), targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null })));
  }
  private roles(p: AuthenticatedPrincipal): string[] { return p.bindings.filter((b) => b.scope === 'PLATFORM').map((b) => b.roleCode); }

  // ───────────────────────── reads ─────────────────────────
  async registry(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.read(env, p, platformRoute(TERM_READ, null), async (cap) => {
      const cat = await cap.catalogue('en');
      return { terms: await cap.terms(null), catalogue: cat, ledger: await cap.ledger(80), read_at: await cap.now(),
               content_version: { value: contentVersion(String(cat['content_digest']), messagesDigest()), terms_digest: cat['content_digest'], messages_digest: messagesDigest() } };
    });
    return { ...out.result, boundary: CT_BOUNDARY, receipt: receipt(out) };
  }
  /** One version, its automated checks recomputed, the artifact on the core — and the caller's eligibility in words. */
  async preview(env: Envelope, p: AuthenticatedPrincipal, termId: string, version: number) {
    const out = await this.read(env, p, platformRoute(TERM_READ, termId), async (cap) => {
      const t = await cap.term(termId, version);
      if (t === null) return null;
      const base = { kind: p.kind, roles: this.roles(p), principal: p.principalId, proposer: String(t['proposed_by']), state: String(t['state']), published: t['has_published'] === true };
      return { ...t, artifact: await cap.artifact(termId),
               eligibility: { review: termEligibility({ ...base, act: 'review' }), approve: termEligibility({ ...base, act: 'approve' }), publish: termEligibility({ ...base, act: 'publish' }),
                              correct: termEligibility({ ...base, act: 'correct' }), retire: termEligibility({ ...base, act: 'retire' }) },
               consequence: {
                 review: ['the automated checks are recomputed and recorded: dilution, the reading grade of every explanation against its audience\'s ceiling, cited terms not yet published'],
                 approve: ['the exact version becomes eligible for publication; the checks are re-run'],
                 publish: ['the version becomes the canonical term every page renders; the published predecessor is superseded and stays readable', 'a correction is shown with its original, replacement, impact and action'],
                 retire: ['the version is no longer offered; its history is retained and never deleted — this cannot be undone (a new key is needed to reuse the concept)'] } };
    });
    if (out.result === null) throw refuseTerm('unknown_term', `${termId} has no version ${version}`, env.correlation_id, 404);
    return { preview: out.result, boundary: CT_BOUNDARY, receipt: receipt(out) };
  }
  /** THE PUBLISHED CATALOGUE in a locale, from any context; in a DOMAIN the linked entries of B90's glossary beside each term (never merged). */
  async catalogue(env: Envelope, p: AuthenticatedPrincipal, locale: string, t: string | null = null, d: string | null = null) {
    const route: RouteInfo = d !== null ? { scope: 'DOMAIN', tenantId: t, domainId: d, action: TERM_CATALOGUE_READ, objectType: 'TRM', objectId: null }
      : t !== null ? { scope: 'TENANT', tenantId: t, domainId: null, action: TERM_CATALOGUE_READ, objectType: 'TRM', objectId: null } : platformRoute(TERM_CATALOGUE_READ, null);
    const out = await this.read(env, p, route, async (cap) => {
      const cat = await cap.catalogue(locale);
      const terms = (cat['terms'] ?? []) as Row[];
      let glossary: Row[] = [];
      if (d !== null) {
        const keys = [...new Set(terms.flatMap((x) => ((x['entry'] as Row)['glossary_keys'] ?? []) as string[]))];
        glossary = await cap.glossary(keys);
      }
      const linked = terms.map((x) => {
        const keys = ((x['entry'] as Row)['glossary_keys'] ?? []) as string[];
        return { ...x, domain_glossary: d === null ? null : glossary.filter((g) => keys.includes(String(g['term_key']))) };
      });
      return { ...cat, terms: linked, read_at: await cap.now(),
               content_version: { value: contentVersion(String(cat['content_digest']), messagesDigest()), terms_digest: cat['content_digest'], messages_digest: messagesDigest() },
               glossary_note: d === null ? 'the domain glossary (B90) is read in a domain context' : 'domain glossary entries are B90\'s, linked by key and shown beside the canonical term — never merged into it' };
    });
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the contributor's acts ─────────────────────────
  async propose(env: Envelope, p: AuthenticatedPrincipal, b: { termId: string | null; key: string; locale: string; expectedVersion: number; entry: Row }) {
    const id = b.termId ?? newId();
    const out = await this.write(env, p, platformRoute(termAction('propose'), id), async (cap) =>
      cap.propose({ termId: b.termId, key: b.key, locale: b.locale, expectedVersion: b.expectedVersion, entry: b.entry, actor: p.principalId, correlationId: env.correlation_id }));
    return { term: out.result, receipt: receipt(out) };
  }
  async correct(env: Envelope, p: AuthenticatedPrincipal, termId: string, b: { expectedVersion: number; entry: Row; impact: string; action: string }) {
    const out = await this.write(env, p, platformRoute(termAction('correct'), termId), async (cap) =>
      cap.correct({ termId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { term: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the reviewer's and the Design System Authority's acts ─────────────────────────
  async review(env: Envelope, p: AuthenticatedPrincipal, termId: string, b: { version: number; digest: string; outcome: string; notes: string }) {
    const out = await this.write(env, p, platformRoute(termAction('review'), termId), async (cap) => cap.review({ termId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: receipt(out) };
  }
  async approve(env: Envelope, p: AuthenticatedPrincipal, termId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, platformRoute(termAction('approve'), termId), async (cap) => cap.approve({ termId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { term: out.result, receipt: receipt(out) };
  }
  async publish(env: Envelope, p: AuthenticatedPrincipal, termId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, platformRoute(termAction('publish'), termId), async (cap) => cap.publish({ termId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { term: out.result, receipt: receipt(out) };
  }
  async retire(env: Envelope, p: AuthenticatedPrincipal, termId: string, b: { version: number; reason: string }) {
    const out = await this.write(env, p, platformRoute(termAction('retire'), termId), async (cap) => cap.retire({ termId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { term: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── PLATFORM: the content lint (dg-lint-3) and its ratchet ─────────────────────────
  async lintContent(env: Envelope, p: AuthenticatedPrincipal, given: { files: Array<{ path: string; text: string }> } | null) {
    const files = given?.files ?? readRepository()?.files ?? null;
    if (files === null) throw refuseTerm('state', 'this deployment carries no web source to lint', env.correlation_id, 409);
    const lint = lintContent(files);
    const evaluationId = newId();
    const route = platformRoute('governance.design.evaluate', evaluationId, 'DSE');
    const out = await this.guarded(env.correlation_id, () => this.pipeline.write(derive(env, route.action, route.objectType, route.objectId), p, route, DesignCap, async (cap) => ({
      result: await cap.recordEvaluation({ evaluationId, source: 'lint', assetId: null, assetVersion: null, inputDigest: lint.inputDigest, rulesVersion: lint.rulesVersion,
        findings: lint.findings.map((f) => ({ rule: f.rule, principle: CONTENT_PRINCIPLE, file: f.file, line: f.line, excerpt: f.excerpt, note: f.note })), actor: p.principalId, correlationId: env.correlation_id }),
      targetType: route.objectType, targetId: route.objectId, targetVersion: null, outboxEvent: null })));
    const r = ratchet(lint.findings, CONTENT_LINT_RATCHET);
    return { evaluation: { ...out.result, files: lint.files, counts: lint.counts },
             ratchet: { holds: r.holds, baseline: r.baseline, current: r.current, regressions: r.regressions, resolved: r.resolved.length,
                        rule: 'the committed findings list only shrinks: a finding outside it is a regression; a committed one no longer found is removed from the list' },
             receipt: receipt(out) };
  }
}
