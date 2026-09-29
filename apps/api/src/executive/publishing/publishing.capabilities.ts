/**
 * CP-6 B36 §D (0094) — THE PUBLISHING CAPABILITIES: the reads a publication is drafted, delivered and archived from, and the writes the
 * ports of 0094 §D back — one class per port group, minted by the pipeline for the bound action. The report render reads through the
 * decision capability on the same transaction (renderReport takes DecisionCapability.read); the canonical PUB is admitted through
 * objects.admit_version under the publication's own canonical-write action; the signature is the §0 signer's (SignatureWrites).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { DecisionCapability } from '../../decision/decision.capabilities.js';
import type { SignatureWrites } from '../signatures/signature.service.js';

type Row = Record<string, unknown>;

abstract class PublishingCore implements SignatureWrites {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  /** One statement under the bound action (the ports assert it); the §0 signer calls this to record a signature. */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  /** The decision reader on THIS transaction — the report render reads packages, versions, options, dissent and approvals through it. */
  decisionRead(): ReturnType<typeof DecisionCapability.read> { return DecisionCapability.read(this.#tx, this.#action); }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PublishingReads extends SignatureWrites {
  readonly action: string;
  readPublications(): any;
  readVersions(): any;
  readDeliveries(): any;
  readEvents(): any;
  readExternalDrafts(): any;
  readBriefings(): any;
  readCanonicalObjects(): any;
  decisionRead(): ReturnType<typeof DecisionCapability.read>;
  /** The source of a publication as its canonical record says it (0094 §D.3 executive.publication_source). */
  sourceOf(a: { tenantId: string; domainId: string; kind: string; id: string; version: number }): Promise<Row>;
  /** The recipients an audience resolves to now. */
  recipientsOf(a: { tenantId: string; domainId: string; audience: Row }): Promise<Row[]>;
  /** The archive record (versions, receipts, signatures, events, controls). */
  archiveRecordOf(a: { publicationId: string }): Promise<Row>;
  /** The §0 signatures of a subject. */
  signaturesOf(a: { kind: string; id: string; version: number }): Promise<Row[]>;
}

export interface PublishingWrites extends PublishingReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  draft(a: { publicationId: string; tenantId: string; domainId: string; title: string; sourceKind: string; sourceId: string; sourceVersion: number; sourceDigest: string; audience: Row; classification: string; channels: string[]; format: string;
             accessibility: Row; template: string; external: Row | null; bytesDigest: string; byteLength: number; vaultRef: string; renderMethod: string; actor: string; correlationId: string }): Promise<Row>;
  approve(a: { publicationId: string; tenantId: string; domainId: string; version: number; digest: string; signatureId: string; objectVersion: number; actor: string; correlationId: string }): Promise<Row>;
  deliver(a: { publicationId: string; tenantId: string; domainId: string; version: number; actor: string; correlationId: string }): Promise<Row>;
  recordDelivery(a: { deliveryId: string; tenantId: string; domainId: string; publicationId: string; version: number; recipient: string; channel: string; kind: string; state: string; receipt: Row | null; providerRef: string | null; error: string | null; synthetic: boolean; actor: string; correlationId: string }): Promise<Row>;
  acknowledge(a: { deliveryId: string; tenantId: string; domainId: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
  correct(a: { publicationId: string; tenantId: string; domainId: string; reason: string; sourceVersion: number; sourceDigest: string; bytesDigest: string; byteLength: number; vaultRef: string; renderMethod: string; actor: string; correlationId: string }): Promise<Row>;
  withdraw(a: { publicationId: string; tenantId: string; domainId: string; reason: string; objectVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  archive(a: { publicationId: string; tenantId: string; domainId: string; objectVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  exportCheck(a: { publicationId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  reviewExternalDraft(a: { draftId: string; tenantId: string; domainId: string; verdict: string; note: string | null; digest: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

class PublishingCapabilityImpl extends PublishingCore implements PublishingWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readPublications(): any { return this.from('executive.publications'); }
  readVersions(): any { return this.from('executive.publication_versions'); }
  readDeliveries(): any { return this.from('executive.publication_deliveries'); }
  readEvents(): any { return this.from('executive.publication_events'); }
  readExternalDrafts(): any { return this.from('executive.external_drafts'); }
  readBriefings(): any { return this.from('executive.briefings'); }
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  async sourceOf(a: { tenantId: string; domainId: string; kind: string; id: string; version: number }): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select executive.publication_source(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.id}::uuid, ${a.version}::int) as r`);
    return rows[0]?.r ?? { found: false, reason: 'no answer' };
  }
  async recipientsOf(a: { tenantId: string; domainId: string; audience: Row }): Promise<Row[]> {
    const rows = await this.call<{ r: Row[] }>(sql`select executive.publication_recipients(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.audience)}::jsonb) as r`);
    return rows[0]?.r ?? [];
  }
  async archiveRecordOf(a: { publicationId: string }): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select executive.publication_archive_record(${a.publicationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async signaturesOf(a: { kind: string; id: string; version: number }): Promise<Row[]> {
    const rows = await this.call<{ r: Row[] }>(sql`select executive.signature_of(${a.kind}, ${a.id}::uuid, ${a.version}::int) as r`);
    return rows[0]?.r ?? [];
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('publication admission returned no row');
    return { contentDigest: r.content_digest };
  }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const rows = await this.call<{ r: Row }>(q);
    return rows[0]?.r ?? {};
  }
  draft(a: Parameters<PublishingWrites['draft']>[0]): Promise<Row> {
    return this.one(sql`select executive.draft_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.sourceKind}, ${a.sourceId}::uuid, ${a.sourceVersion}::int, ${a.sourceDigest},
      ${JSON.stringify(a.audience)}::jsonb, ${a.classification}, ${a.channels}::text[], ${a.format}, ${JSON.stringify(a.accessibility)}::jsonb, ${a.template}, ${a.external === null ? null : JSON.stringify(a.external)}::jsonb,
      ${a.bytesDigest}, ${a.byteLength}::int, ${a.vaultRef}, ${a.renderMethod}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  approve(a: Parameters<PublishingWrites['approve']>[0]): Promise<Row> {
    return this.one(sql`select executive.approve_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.signatureId}::uuid, ${a.objectVersion}::bigint, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  deliver(a: Parameters<PublishingWrites['deliver']>[0]): Promise<Row> {
    return this.one(sql`select executive.deliver_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  recordDelivery(a: Parameters<PublishingWrites['recordDelivery']>[0]): Promise<Row> {
    return this.one(sql`select executive.record_publication_delivery(${a.deliveryId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.publicationId}::uuid, ${a.version}::int, ${a.recipient}::uuid, ${a.channel}, ${a.kind}, ${a.state},
      ${a.receipt === null ? null : JSON.stringify(a.receipt)}::jsonb, ${a.providerRef}, ${a.error}, ${a.synthetic}::boolean, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  acknowledge(a: Parameters<PublishingWrites['acknowledge']>[0]): Promise<Row> {
    return this.one(sql`select executive.acknowledge_publication(${a.deliveryId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  correct(a: Parameters<PublishingWrites['correct']>[0]): Promise<Row> {
    return this.one(sql`select executive.correct_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.sourceVersion}::int, ${a.sourceDigest}, ${a.bytesDigest}, ${a.byteLength}::int, ${a.vaultRef}, ${a.renderMethod}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  withdraw(a: Parameters<PublishingWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select executive.withdraw_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.objectVersion}::bigint, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  archive(a: Parameters<PublishingWrites['archive']>[0]): Promise<Row> {
    return this.one(sql`select executive.archive_publication(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectVersion}::bigint, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  exportCheck(a: Parameters<PublishingWrites['exportCheck']>[0]): Promise<Row> {
    return this.one(sql`select executive.export_publication_check(${a.publicationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  reviewExternalDraft(a: Parameters<PublishingWrites['reviewExternalDraft']>[0]): Promise<Row> {
    return this.one(sql`select executive.review_external_draft(${a.draftId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.verdict}, ${a.note}, ${a.digest}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const PublishingCapability = {
  read(tx: Tx, action: string): PublishingReads { return new PublishingCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): PublishingWrites { return new PublishingCapabilityImpl(tx, action); },
};
