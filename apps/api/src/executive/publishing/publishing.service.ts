/**
 * CP-6 B36 §D (0094) — THE PUBLISHING AND DISTRIBUTION CENTER (F-P6-13): the orchestration around the ports of 0094 §D, in the pipeline's
 * transaction.
 *
 *   draft     render the snapshot to EXACT BYTES (publishing.render.ts) → the port binds the publication → the bytes are written under the
 *             vault EXPORT root through the B13/B15 package writer (<export_root>/<tenant>/<domain>/<publication_id>/<blob>.bin) LAST, so a
 *             refused draft leaves no file and a failed write leaves no row;
 *   approve   the digest presented is SIGNED (the §0 signer, kind publication) and the canonical PUB version admitted (objects.admit_version
 *             under executive.publication.approve; its payload carries the bytes' sha256) BEFORE the port, which checks both and refuses a
 *             stale digest, the drafter, or a missing authority — the whole write rolls back with the signature and the object;
 *   deliver   the port places the in_app deliveries and hands back the recipients; each synthetic channel (email / teams — the B34 adapters
 *             to LOCAL sinks; no real provider) is tried per recipient and its answer recorded as a delivery with the sink's receipt;
 *   correct   a new version rendered and bound; the recipients of the prior version notified (the port raises the attention items; this
 *             service sends the channel notices); withdraw: the PUB's withdrawn version admitted (0078's lifecycle idiom) before the port;
 *   archive   the archive record (versions, receipts, signatures, events, the source's controls and holds) admitted as the PUB's archived
 *             version before the port; export: the port's gates (legal hold, residency) then manifest.json written beside the bytes.
 *
 * Every figure the demonstration publishes is SYNTHETIC; every email / teams delivery goes to a loopback sink and closes no real-provider clause.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, contentDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { VaultService, VaultIntegrityError } from '../../observation/vault/vault.service.js';
import { clearanceOf } from '../../decision/clearance.js';
import { renderReport } from '../agents/agents.service.js';
import { SignatureService } from '../signatures/signature.service.js';
import { EmailChannel } from '../attention/delivery/email.channel.js';
import { TeamsChannel } from '../attention/delivery/webhook.channel.js';
import type { ChannelAdapter, DeliveryMessage } from '../attention/delivery/channel.js';
import type { AttentionTickWrites } from '../executive.capabilities.js';
import type { PublishingReads, PublishingWrites } from './publishing.capabilities.js';
import { bytesDigest, channelMessage, documentOfBriefing, documentOfReport, renderBytes, RENDER_METHOD, type DraftIntake, type PublicationFormat, type RenderBinding, type RenderedDocument } from './publishing.render.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
export const EXPORT_FORMAT = 'eye-publication-export/1';
export const PUB_SCHEMA = 'PUB@v1';
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? (JSON.parse(v) as unknown[]).map(String) : []);
const PRIVILEGED = ['executive', 'executive_operator', 'decision_authority', 'decision_owner', 'domain_admin', 'platform_admin'];

@Injectable()
export class PublishingService {
  constructor(private readonly vault: VaultService, private readonly signer: SignatureService, private readonly email: EmailChannel, private readonly teams: TeamsChannel) {}

  private adapterOf(channel: string): ChannelAdapter | null { return channel === 'email' ? this.email : channel === 'teams' ? this.teams : null; }

  private async publicationOf(cap: PublishingReads, publicationId: string, correlationId: string): Promise<Row> {
    const p = (await cap.readPublications().selectAll().where('publication_id' as never, '=', publicationId as never).executeTakeFirst()) as Row | undefined;
    if (p === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `publication rejected (unknown_publication): no publication ${publicationId} in this domain`), 404);
    return p;
  }
  private async versionOf(cap: PublishingReads, publicationId: string, version: number, correlationId: string): Promise<Row> {
    const v = (await cap.readVersions().selectAll().where('publication_id' as never, '=', publicationId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Row | undefined;
    if (v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `publication rejected (unknown_version): publication ${publicationId} has no version ${version}`), 404);
    return v;
  }
  private async latestPub(cap: PublishingReads, publicationId: string): Promise<Row | null> {
    const o = (await cap.readCanonicalObjects().selectAll().where('object_type' as never, '=', 'PUB' as never).where('object_id' as never, '=', publicationId as never)
      .orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    return o ?? null;
  }

  /** The snapshot rendered: a briefing edition as stored, or the report render as the reporting path answers it (its own refusals stand). */
  private async render(cap: PublishingReads, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, source: { kind: 'briefing' | 'report'; id: string; version: number }, binding: RenderBinding, format: PublicationFormat, correlationId: string):
    Promise<{ src: Row; doc: RenderedDocument; bytes: Buffer; digest: string; byteLength: number }> {
    const src = await cap.sourceOf({ tenantId: scope.tenantId, domainId: scope.domainId, kind: source.kind, id: source.id, version: source.version });
    if (src['found'] !== true) throw new HttpException(errorBody('EYE_STA_001', correlationId, `publication rejected (unknown_source): ${String(src['reason'])}`), 404);
    const rs = { kind: source.kind, id: source.id, version: source.version, digest: String(src['digest']), snapshot: {} as Row };
    let doc: RenderedDocument;
    if (source.kind === 'briefing') {
      const b = (await cap.readBriefings().selectAll().where('briefing_id' as never, '=', source.id as never).executeTakeFirst()) as Row | undefined;
      if (b === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `publication rejected (unknown_source): no authorized briefing ${source.id} matches`), 404);
      doc = documentOfBriefing({ ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']) }, binding, { ...rs, snapshot: b });
    } else {
      const r = await renderReport(cap.decisionRead(), source.id, clearanceOf(principal, { tenantId: scope.tenantId, domainId: scope.domainId }), { principal_id: principal.principalId, method: RENDER_METHOD, via: 'human' }, correlationId,
        { purpose, member: principal.principalId });
      if (r.refused === true) throw new HttpException(errorBody('EYE_AUT_001', correlationId, `publication rejected (source_read): ${String(r.reason)}`), 403);
      const v = (r['version'] ?? null) as Row | null;
      if (v === null || Number(v['version']) !== source.version) throw new HttpException(errorBody('EYE_STA_001', correlationId, `publication rejected (unknown_source): the report renders the package's current version ${v === null ? 'none' : String(v['version'])}, not ${source.version}`), 404);
      // the render's own instants are not part of the bytes: the bytes are deterministic in the snapshot (the DPK by digest) and the binding
      const { rendered_at: _at, rendered_by: _by, ...snapshot } = r as Row & { rendered_at?: unknown; rendered_by?: unknown };
      void _at; void _by;
      doc = documentOfReport(snapshot, binding, { ...rs, snapshot });
    }
    const out = renderBytes(doc, format);
    return { src, doc, bytes: out.bytes, digest: out.digest, byteLength: out.byteLength };
  }

  /** d1 DRAFT. */
  async draft(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, i: DraftIntake, correlationId: string): Promise<Row> {
    const publicationId = newId(); const blobId = newId(); const vaultRef = `${publicationId}/${blobId}.bin`;
    const binding: RenderBinding = { publicationId, version: 1, title: i.title, template: i.template, classification: i.classification, accessibility: i.accessibility, external: i.external };
    const r = await this.render(cap, scope, principal, purpose, { kind: i.sourceKind, id: i.sourceId, version: i.sourceVersion }, binding, i.format, correlationId);
    const out = await cap.draft({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, title: i.title, sourceKind: i.sourceKind, sourceId: i.sourceId, sourceVersion: i.sourceVersion, sourceDigest: i.sourceDigest,
      audience: i.audience, classification: i.classification, channels: i.channels, format: i.format, accessibility: i.accessibility, template: i.template, external: i.external,
      bytesDigest: r.digest, byteLength: r.byteLength, vaultRef, renderMethod: RENDER_METHOD, actor: principal.principalId, correlationId });
    const written = await this.vault.writePackageFile(scope, publicationId, `${blobId}.bin`, r.bytes);
    if (written.contentDigest !== r.digest) throw new HttpException(errorBody('EYE_INT_001', correlationId, 'publication rejected (bytes): the bytes written do not match the bytes rendered'), 500);
    return { ...out, vault_ref: vaultRef, format: i.format, render_method: RENDER_METHOD };
  }

  private pubHeader(a: { publicationId: string; scope: Scope; objectVersion: number; lifecycle: 'active' | 'withdrawn' | 'archived'; truth: string; actor: string; drafter: string; src: Row; classification: string; controls: Row; purpose: string;
                         renderMethod: string; vaultRef: string; bytesDigest: string; format: string; byteLength: number; prior: number | null; withdrawalReason: string | null; correlationId: string; syntheticState: boolean; quality: Row }): CanonicalHeader {
    const priorRef = a.prior === null ? null : `PUB:${a.publicationId}@${a.prior}`;
    return {
      object_id: a.publicationId, object_type: 'PUB', tenant_id: a.scope.tenantId, domain_id: a.scope.domainId, scope: 'DOMAIN', object_version: String(a.objectVersion), lifecycle_state: a.lifecycle,
      owning_component: 'CP-EXE-01', accountable_owner: `principal:${a.actor}`,
      source_object_ids: [`${String(a.src['object_type'])}:${String(a.src['id'])}@${String(a.src['object_version'])}`],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: new Date().toISOString(), time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: a.truth, synthetic_state: a.syntheticState, confidence: null, uncertainty: null,
      evidence_refs: strArr(a.src['evidence_refs']).filter((x) => /^EVD:/.test(x)).slice(0, 200), provenance_ref: `principal:${a.drafter}`, method_ref: a.renderMethod,
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${a.drafter}`, `principal:${a.actor}`])],
      classification: a.classification, purpose_scope: a.purpose, rights_profile: (a.controls['rights_profile'] as string | null) ?? null, residency_profile: (a.controls['residency_profile'] as string | null) ?? null,
      retention_profile: (a.controls['retention_profile'] as string | null) ?? null, access_policy_ref: (a.controls['access_policy_ref'] as string | null) ?? null,
      quality_profile: null, quality_state: { format: a.format, byte_length: a.byteLength, ...a.quality }, freshness_state: null, schema_ref: PUB_SCHEMA, ontology_ref: null,
      correction_of: a.lifecycle === 'withdrawn' ? priorRef : null, supersedes: priorRef, withdrawal_reason: a.withdrawalReason, audit_correlation_id: a.correlationId,
      content_ref: `vault:export/${a.vaultRef}#sha256:${a.bytesDigest}`,
    };
  }
  private async admitPub(cap: PublishingWrites, header: CanonicalHeader, payload: Row, correlationId: string): Promise<{ contentDigest: string; headerDigest: string }> {
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `publication header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    const r = await cap.admitObject(header, payload, headerDigest);
    return { contentDigest: r.contentDigest, headerDigest };
  }

  /** d2 APPROVE-DIGEST: sign the digest presented, admit the PUB version, then the port (which refuses a stale digest, the drafter, no authority). */
  async approve(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, publicationId: string, version: number, digest: string, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const v = await this.versionOf(cap, publicationId, version, correlationId);
    const src = await cap.sourceOf({ tenantId: scope.tenantId, domainId: scope.domainId, kind: String(v['source_kind']), id: String(v['source_id']), version: Number(v['source_version']) });
    const prior = await this.latestPub(cap, publicationId);
    const objectVersion = prior === null ? 1 : Number(prior['object_version']) + 1;
    const sig = await this.signer.sign(cap, { tenantId: scope.tenantId, domainId: scope.domainId, action: cap.action, kind: 'publication', subjectId: publicationId, subjectVersion: version, subjectDigest: digest, actor: principal.principalId, correlationId });
    const signatureId = String(sig['signature_id']);
    const payload: Row = {
      publication_id: publicationId, version, title: String(p['title']), state: 'approved', source: { kind: String(v['source_kind']), id: String(v['source_id']), version: Number(v['source_version']), digest: String(v['source_digest']) },
      bytes: { sha256: String(v['bytes_digest']), byte_length: Number(v['byte_length']), vault_ref: String(v['vault_ref']), render_method: String(v['render_method']) },
      format: String(v['format']), audience: p['audience'], channels: strArr(p['channels']), classification: String(p['classification']), accessibility: p['accessibility'], template: String(p['template']),
      external: (p['external'] as Row | null) ?? null, drafted_by: String(v['drafted_by']), approved_by: principal.principalId, approval_digest: digest, signature_id: signatureId, withdrawal: null, archive: null,
    };
    const header = this.pubHeader({ publicationId, scope, objectVersion, lifecycle: 'active', truth: 'asserted', actor: principal.principalId, drafter: String(v['drafted_by']), src, classification: String(p['classification']),
      controls: (src['controls'] ?? {}) as Row, purpose, renderMethod: String(v['render_method']), vaultRef: String(v['vault_ref']), bytesDigest: String(v['bytes_digest']), format: String(v['format']), byteLength: Number(v['byte_length']),
      prior: prior === null ? null : Number(prior['object_version']), withdrawalReason: null, correlationId, syntheticState: src['synthetic_state'] === true, quality: { approval: 'digest confirmed byte-for-byte and signed' } });
    const admitted = await this.admitPub(cap, header, payload, correlationId);
    const r = await cap.approve({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, version, digest, signatureId, objectVersion, actor: principal.principalId, correlationId });
    return { ...r, signature: sig, pub: { object_version: objectVersion, content_digest: admitted.contentDigest, schema_ref: PUB_SCHEMA } };
  }

  private async sendNotices(cap: PublishingWrites, scope: Scope, actor: string, a: { publicationId: string; version: number; channels: string[]; recipients: string[]; externalRecipient?: string | null; kind: 'publication' | 'correction_notice' | 'withdrawal_notice'; title: string; bytesDigest: string; classification: string; reason?: string | null; changed?: Row | null; eventId: string; correlationId: string }): Promise<Row[]> {
    const out: Row[] = [];
    // the external audience's SYNTHETIC delivery: one row on the first synthetic channel (email, else teams), addressed as external:<kind>:<name> at the sink
    const targets: Array<{ recipient: string | null; external: string | null; address: string; channels: string[] }> = a.recipients.map((r) => ({ recipient: r, external: null, address: r, channels: a.channels.filter((c) => c !== 'in_app') }));
    const synthetic = a.channels.filter((c) => c !== 'in_app');
    if (a.externalRecipient && synthetic.length > 0) targets.push({ recipient: null, external: a.externalRecipient, address: a.externalRecipient.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60), channels: [synthetic[0] as string] });
    for (const t of targets) {
      for (const channel of t.channels) {
        const adapter = this.adapterOf(channel);
        const deliveryId = newId();
        const { subject, body } = channelMessage({ kind: a.kind, title: a.title, publicationId: a.publicationId, version: a.version, bytesDigest: a.bytesDigest, classification: a.classification, reason: a.reason ?? null, changed: a.changed ?? null });
        const msg: DeliveryMessage = { deliveryId, tenantId: scope.tenantId, domainId: scope.domainId, itemId: a.publicationId, itemEventId: a.eventId, itemEvent: a.kind, channel, recipient: t.address, attempt: 1, maxAttempts: 1, subject, body, correlationId: a.correlationId,
          via: null as unknown as AttentionTickWrites };
        const res = adapter === null ? { state: 'failed' as const, receipt: null, error: `${channel}: no adapter` } : await adapter.deliver(msg);
        const rec = await cap.recordDelivery({ deliveryId, tenantId: scope.tenantId, domainId: scope.domainId, publicationId: a.publicationId, version: a.version, recipient: t.recipient, externalRecipient: t.external, channel, kind: a.kind, state: res.state === 'failed' ? 'failed' : 'delivered',
          receipt: res.receipt === null ? null : { ...res.receipt, ...(t.external === null ? {} : { external_recipient: t.external, note: 'SYNTHETIC — the external audience is a local sink; no message left this machine' }) }, providerRef: res.providerRef ?? null, error: res.error ?? null, synthetic: true, actor, correlationId: a.correlationId });
        out.push({ ...rec, channel, recipient: t.recipient, external_recipient: t.external, kind: a.kind, state: res.state === 'failed' ? 'failed' : 'delivered', receipt: res.receipt, provider_ref: res.providerRef ?? null, error: res.error ?? null, synthetic_state: true });
      }
    }
    return out;
  }

  /** d2 DELIVER: the port places in_app and resolves the recipients; the synthetic channels are tried per recipient and recorded. */
  async deliver(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, publicationId: string, version: number, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const r = await cap.deliver({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, version, actor: principal.principalId, correlationId });
    const recipients = ((r['recipients'] ?? []) as Row[]).map((x) => String(x['principal_id']));
    const channelDeliveries = await this.sendNotices(cap, scope, principal.principalId, { publicationId, version, channels: strArr(r['channels']), recipients, externalRecipient: (r['external_recipient'] as string | null) ?? null, kind: 'publication', title: String(r['title']), bytesDigest: String(r['bytes_digest']),
      classification: String(p['classification']), eventId: String(r['event_id']), correlationId });
    return { ...r, channel_deliveries: channelDeliveries, external_delivery: p['external'] === null || p['external'] === undefined ? null : { synthetic: true, note: 'the external audience is SYNTHETIC: its delivery is the local sink\'s; no message left this machine' } };
  }

  async acknowledge(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, deliveryId: string, note: string | null, correlationId: string): Promise<Row> {
    return cap.acknowledge({ deliveryId, tenantId: scope.tenantId, domainId: scope.domainId, note, actor: principal.principalId, correlationId });
  }

  /** d3 CORRECT: the next version rendered and bound; the prior version's recipients notified (the items by the port, the channel notices here). */
  async correct(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, publicationId: string, a: { reason: string; sourceId: string | null; sourceVersion: number | null; sourceDigest: string }, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const cur = await this.versionOf(cap, publicationId, Number(p['current_version']), correlationId);
    const sourceId = a.sourceId ?? String(cur['source_id']);
    const sourceVersion = a.sourceVersion ?? (a.sourceId !== null && a.sourceId !== String(cur['source_id']) ? 1 : Number(cur['source_version']));
    const next = Number(cur['version']) + 1; const blobId = newId(); const vaultRef = `${publicationId}/${blobId}.bin`;
    const binding: RenderBinding = { publicationId, version: next, title: String(p['title']), template: String(p['template']), classification: String(p['classification']), accessibility: p['accessibility'] as RenderBinding['accessibility'], external: (p['external'] as RenderBinding['external']) ?? null };
    if (String(cur['source_kind']) === 'report' && sourceId !== String(cur['source_id'])) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `publication rejected (source): a report publication corrects to another version of the same package ${String(cur['source_id'])}, not to package ${sourceId}`), 422);
    const r = await this.render(cap, scope, principal, purpose, { kind: String(cur['source_kind']) as 'briefing' | 'report', id: sourceId, version: sourceVersion }, binding, String(p['format']) as PublicationFormat, correlationId);
    const out = await cap.correct({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, reason: a.reason, sourceId, sourceVersion, sourceDigest: a.sourceDigest, bytesDigest: r.digest, byteLength: r.byteLength, vaultRef, renderMethod: RENDER_METHOD, actor: principal.principalId, correlationId });
    await this.vault.writePackageFile(scope, publicationId, `${blobId}.bin`, r.bytes);
    const notified = ((out['notified'] ?? []) as Row[]).map((x) => String(x['recipient']));
    const notices = await this.sendNotices(cap, scope, principal.principalId, { publicationId, version: Number(cur['version']), channels: strArr(out['channels']), recipients: notified, kind: 'correction_notice', title: String(out['title']),
      bytesDigest: String(cur['bytes_digest']), classification: String(p['classification']), reason: a.reason, changed: (out['changed'] ?? null) as Row | null, eventId: String(out['event_id']), correlationId });
    return { ...out, vault_ref: vaultRef, bytes_digest: r.digest, byte_length: r.byteLength, notices };
  }

  /** d3 WITHDRAW: the PUB's withdrawn version admitted first (0078's idiom: lifecycle and truth state withdrawn, the reason in the header, the prior payload kept), then the port, then the notices. */
  async withdraw(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, publicationId: string, reason: string, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const prior = await this.latestPub(cap, publicationId);
    let objectVersion: number | null = null;
    if (prior !== null && String(prior['lifecycle_state']) === 'active') {
      objectVersion = Number(prior['object_version']) + 1;
      const priorPayload = (prior['payload'] ?? {}) as Row;
      const header = this.withdrawnHeader(prior, { actor: principal.principalId, purpose, reason, correlationId, objectVersion });
      await this.admitPub(cap, header, { ...priorPayload, state: 'withdrawn', withdrawal: { reason, by: principal.principalId, of_version: Number(prior['object_version']) } }, correlationId);
    }
    const r = await cap.withdraw({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, reason, objectVersion, actor: principal.principalId, correlationId });
    const notified = ((r['notified'] ?? []) as Row[]).map((x) => String(x['recipient']));
    const cur = await this.versionOf(cap, publicationId, Number(r['version']), correlationId);
    const notices = await this.sendNotices(cap, scope, principal.principalId, { publicationId, version: Number(r['version']), channels: strArr(r['channels']), recipients: notified, kind: 'withdrawal_notice', title: String(r['title']),
      bytesDigest: String(cur['bytes_digest']), classification: String(p['classification']), reason, eventId: String(r['event_id']), correlationId });
    return { ...r, notices };
  }
  /** The prior PUB header carried forward as its withdrawn version (import-package.ts importWithdrawalHeaderOf's rules, for a PUB). */
  private withdrawnHeader(prior: Row, a: { actor: string; purpose: string; reason: string; correlationId: string; objectVersion: number }): CanonicalHeader {
    const ref = `PUB:${String(prior['object_id'])}@${String(prior['object_version'])}`;
    const clock = String(prior['source_clock_quality'] ?? 'trusted');
    return {
      object_id: String(prior['object_id']), object_type: 'PUB', tenant_id: String(prior['tenant_id']), domain_id: String(prior['domain_id']), scope: 'DOMAIN', object_version: String(a.objectVersion), lifecycle_state: 'withdrawn',
      owning_component: String(prior['owning_component'] ?? 'CP-EXE-01'), accountable_owner: `principal:${a.actor}`, source_object_ids: strArr(prior['source_object_ids']),
      event_time: iso(prior['event_time']), observation_time: iso(prior['observation_time']), valid_from: iso(prior['valid_from']), valid_to: iso(prior['valid_to']), recorded_at: new Date().toISOString(),
      time_precision: String(prior['time_precision'] ?? 'exact'), source_clock_quality: (clock === 'trusted' || clock === 'degraded' ? clock : 'unknown') as CanonicalHeader['source_clock_quality'],
      truth_state: 'withdrawn', synthetic_state: prior['synthetic_state'] === true, confidence: null, uncertainty: null,
      evidence_refs: strArr(prior['evidence_refs']), provenance_ref: (prior['provenance_ref'] as string | null) ?? null, method_ref: (prior['method_ref'] as string | null) ?? null,
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.actor}`],
      classification: String(prior['classification']), purpose_scope: a.purpose, rights_profile: (prior['rights_profile'] as string | null) ?? null, residency_profile: (prior['residency_profile'] as string | null) ?? null,
      retention_profile: (prior['retention_profile'] as string | null) ?? null, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null,
      schema_ref: String(prior['schema_ref'] ?? PUB_SCHEMA), ontology_ref: null, correction_of: ref, supersedes: ref, withdrawal_reason: a.reason, audit_correlation_id: a.correlationId, content_ref: (prior['content_ref'] as string | null) ?? null,
    };
  }

  /** d5 ARCHIVE: the archive record admitted as the PUB's archived version (the source's controls on the header), then the port. */
  async archive(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, purpose: string, publicationId: string, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const record = await cap.archiveRecordOf({ publicationId });
    const prior = await this.latestPub(cap, publicationId);
    let objectVersion: number | null = null; let admitted: { contentDigest: string } | null = null;
    if (prior !== null) {
      objectVersion = Number(prior['object_version']) + 1;
      const controls = ((record['controls'] as Row | null)?.['controls'] ?? {}) as Row;
      const ref = `PUB:${publicationId}@${String(prior['object_version'])}`;
      const header: CanonicalHeader = { ...this.withdrawnHeader(prior, { actor: principal.principalId, purpose, reason: '', correlationId, objectVersion }),
        lifecycle_state: 'archived', truth_state: String(prior['truth_state']) === 'withdrawn' ? 'withdrawn' : 'asserted', correction_of: null, supersedes: ref, withdrawal_reason: (prior['withdrawal_reason'] as string | null) ?? null,
        classification: String(p['classification']), rights_profile: (controls['rights_profile'] as string | null) ?? null, residency_profile: (controls['residency_profile'] as string | null) ?? null,
        retention_profile: (controls['retention_profile'] as string | null) ?? null, access_policy_ref: (controls['access_policy_ref'] as string | null) ?? null,
        quality_state: { archive: 'versions, receipts, signatures and events carried under the source\'s controls', holds: ((record['controls'] as Row | null)?.['holds'] as unknown[] | undefined)?.length ?? 0 } };
      admitted = await this.admitPub(cap, header, { ...((prior['payload'] ?? {}) as Row), state: 'archived', archive: record }, correlationId);
    }
    const r = await cap.archive({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, objectVersion, actor: principal.principalId, correlationId });
    return { ...r, record, pub: admitted === null ? null : { object_version: objectVersion, content_digest: admitted.contentDigest } };
  }

  /** d5 EXPORT: the port's gates, then the export record (every receipt inside) as manifest.json beside the bytes, in the export path's digest discipline. */
  async exportGet(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, publicationId: string, correlationId: string): Promise<Row> {
    const check = await cap.exportCheck({ publicationId, tenantId: scope.tenantId, domainId: scope.domainId, actor: principal.principalId, correlationId });
    const record = await cap.archiveRecordOf({ publicationId });
    const pub = (record['publication'] ?? {}) as Row;
    const versions = (record['versions'] ?? []) as Row[];
    const manifest: Row = {
      format: EXPORT_FORMAT,
      package: { publication_id: publicationId, tenant_id: scope.tenantId, domain_id: scope.domainId, locator_prefix: `${scope.tenantId}/${scope.domainId}/${publicationId}/`, exported_by: `principal:${principal.principalId}`, title: pub['title'], classification: pub['classification'] },
      authorization: { archived_by: pub['archived_by'] === undefined ? null : `principal:${String(pub['archived_by'])}`, archived_at: iso(pub['archived_at']), archive_ref: pub['archive_ref'] ?? null, export_event_id: check['event_id'] },
      gates: { legal_hold: 'no active hold on the source\'s evidence (a hold refuses the export — AU-MEM-0060)', residency: 'the export stays in the vault\'s residency; an external publication of a residency-bound source is refused', classification: pub['classification'], controls: check['controls'] ?? null },
      objects: versions.map((v) => ({ object: `PUB:${publicationId}@${String(v['pub_object_version'] ?? '')}`, version: v['version'], state: v['state'], file: String(v['vault_ref']).split('/')[1], sha256: v['bytes_digest'], byte_length: v['byte_length'], format: v['format'],
                                     source: { kind: v['source_kind'], id: v['source_id'], version: v['source_version'], digest: v['source_digest'] }, approval: { by: v['approved_by'], at: iso(v['approved_at']), digest: v['approval_digest'], signature_id: v['signature_id'] }, signatures: v['signatures'] })),
      deliveries: record['deliveries'] ?? [], external_drafts: record['external_drafts'] ?? [], events: record['events'] ?? [],
    };
    const manifestDigest = contentDigest(manifest);
    const bytes = Buffer.from(`${JSON.stringify({ ...manifest, manifest_digest: manifestDigest }, null, 2)}\n`, 'utf8');
    let file: { contentDigest: string; byteLength: number; repeated: boolean };
    try {
      const w = await this.vault.writePackageFile(scope, publicationId, 'manifest.json', bytes);
      file = { ...w, repeated: false };
    } catch (e) {
      if (!(e instanceof VaultIntegrityError) || e.reason !== 'exists') throw e;
      const existing = await this.vault.readPackageFile(scope, publicationId, 'manifest.json');
      file = { contentDigest: bytesDigest(existing), byteLength: existing.byteLength, repeated: true };
    }
    return { export: { ...manifest, manifest_digest: manifestDigest }, file: { name: 'manifest.json', ...file }, check };
  }

  /** d4 REVIEW an external draft: the reviewer signs the digest when approving (before the port, which refuses the drafter and a stale digest). */
  async reviewExternalDraft(cap: PublishingWrites, scope: Scope, principal: AuthenticatedPrincipal, draftId: string, a: { verdict: string; note: string | null; digest: string }, correlationId: string): Promise<Row> {
    const d = (await cap.readExternalDrafts().selectAll().where('draft_id' as never, '=', draftId as never).executeTakeFirst()) as Row | undefined;
    if (d === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `external draft rejected (unknown_draft): no external draft ${draftId} in this domain`), 404);
    let signatureId: string | null = null; let sig: Row | null = null;
    if (a.verdict === 'approved') {
      sig = await this.signer.sign(cap, { tenantId: scope.tenantId, domainId: scope.domainId, action: cap.action, kind: 'publication', subjectId: draftId, subjectVersion: 1, subjectDigest: a.digest, actor: principal.principalId, correlationId });
      signatureId = String(sig['signature_id']);
    }
    const r = await cap.reviewExternalDraft({ draftId, tenantId: scope.tenantId, domainId: scope.domainId, verdict: a.verdict, note: a.note, digest: a.digest, signatureId, actor: principal.principalId, correlationId });
    return { ...r, signature: sig };
  }

  // ───────────────────────── reads ─────────────────────────
  private privileged(principal: AuthenticatedPrincipal, scope: Scope): boolean {
    return principal.bindings.some((b) => PRIVILEGED.includes(b.roleCode) && (b.scope === 'PLATFORM' || (b.tenantId === scope.tenantId && (b.scope === 'TENANT' || b.domainId === scope.domainId))));
  }
  async list(cap: PublishingReads, scope: Scope, principal: AuthenticatedPrincipal): Promise<Row[]> {
    const rows = (await cap.readPublications().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never).orderBy('drafted_at' as never, 'desc').limit(200).execute()) as Row[];
    const mine = this.privileged(principal, scope) ? null : new Set(((await cap.readDeliveries().select(['publication_id' as never]).where('recipient_principal_id' as never, '=', principal.principalId as never).execute()) as Row[]).map((d) => String(d['publication_id'])));
    return rows.filter((p) => mine === null || mine.has(String(p['publication_id'])) || String(p['drafted_by']) === principal.principalId).map((p) => ({ ...p, drafted_at: iso(p['drafted_at']), withdrawn_at: iso(p['withdrawn_at']), archived_at: iso(p['archived_at']), updated_at: iso(p['updated_at']) }));
  }
  async get(cap: PublishingReads, scope: Scope, principal: AuthenticatedPrincipal, publicationId: string, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const privileged = this.privileged(principal, scope) || String(p['drafted_by']) === principal.principalId;
    const versions = (await cap.readVersions().selectAll().where('publication_id' as never, '=', publicationId as never).orderBy('version' as never).execute()) as Row[];
    const deliveriesAll = (await cap.readDeliveries().selectAll().where('publication_id' as never, '=', publicationId as never).orderBy('delivered_at' as never).execute()) as Row[];
    const deliveries = privileged ? deliveriesAll : deliveriesAll.filter((d) => String(d['recipient_principal_id']) === principal.principalId);
    if (!privileged && deliveries.length === 0) throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'publication rejected (not_recipient): a publication is read by its drafter, its authorities or a recipient of one of its deliveries'), 403);
    const drafts = (await cap.readExternalDrafts().selectAll().where('publication_id' as never, '=', publicationId as never).orderBy('version' as never).execute()) as Row[];
    const events = privileged ? (await cap.readEvents().selectAll().where('publication_id' as never, '=', publicationId as never).orderBy('occurred_at' as never).execute()) as Row[] : [];
    const signed = await Promise.all(versions.map(async (v) => ({ ...v, drafted_at: iso(v['drafted_at']), approved_at: iso(v['approved_at']), signatures: await cap.signaturesOf({ kind: 'publication', id: publicationId, version: Number(v['version']) }) })));
    return { ...p, drafted_at: iso(p['drafted_at']), withdrawn_at: iso(p['withdrawn_at']), archived_at: iso(p['archived_at']), updated_at: iso(p['updated_at']), versions: signed,
      deliveries: deliveries.map((d) => ({ ...d, delivered_at: iso(d['delivered_at']), acknowledged_at: iso(d['acknowledged_at']) })),
      external_drafts: await Promise.all(drafts.map(async (d) => ({ ...d, requested_at: iso(d['requested_at']), reviewed_at: iso(d['reviewed_at']), signatures: await cap.signaturesOf({ kind: 'publication', id: String(d['draft_id']), version: 1 }) }))),
      events: events.map((e) => ({ ...e, occurred_at: iso(e['occurred_at']) })), reader: privileged ? 'privileged' : 'recipient' };
  }
  /** The exact bytes of a version, read back from the vault and VERIFIED against the recorded digest (a mismatch is said, never served as the record). */
  async bytes(cap: PublishingReads, scope: Scope, principal: AuthenticatedPrincipal, publicationId: string, version: number, correlationId: string): Promise<Row> {
    const p = await this.publicationOf(cap, publicationId, correlationId);
    const v = await this.versionOf(cap, publicationId, version, correlationId);
    if (!(this.privileged(principal, scope) || String(p['drafted_by']) === principal.principalId)) {
      const mine = (await cap.readDeliveries().select(['delivery_id' as never]).where('publication_id' as never, '=', publicationId as never).where('recipient_principal_id' as never, '=', principal.principalId as never).limit(1).execute()) as Row[];
      if (mine.length === 0) throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'publication rejected (not_recipient): the bytes are read by the drafter, the authorities or a recipient'), 403);
    }
    const [, file] = String(v['vault_ref']).split('/');
    let bytes: Buffer;
    try { bytes = await this.vault.readPackageFile(scope, publicationId, file ?? ''); } catch { return { publication_id: publicationId, version, format: v['format'], bytes_digest: v['bytes_digest'], verified: false, text: null, reason: 'the bytes are not retrievable from the export root' }; }
    const digest = bytesDigest(bytes);
    return { publication_id: publicationId, version, format: v['format'], bytes_digest: v['bytes_digest'], verified: digest === String(v['bytes_digest']), read_digest: digest, byte_length: bytes.byteLength, text: digest === String(v['bytes_digest']) ? bytes.toString('utf8') : null,
             reason: digest === String(v['bytes_digest']) ? null : 'the bytes on disk do not match the recorded digest; nothing is served as the record' };
  }
}
