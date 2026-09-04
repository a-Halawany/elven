/**
 * Evidence browsing and retrieval — PHASE1_PLAN §9, acceptance A2/A7.
 *
 * The custody chain this assembles is the product's central claim, so it is built
 * from stored rows only and never from anything reconstructed at read time:
 * source contract version, agent identity and code digest, run, endpoint and
 * transport evidence, the four times, the byte digest and each point it was
 * verified, and the four authenticity concepts as four separate answers.
 *
 * A retrieval RE-VERIFIES THE DIGEST. A missing blob and a corrupt blob both fail
 * closed with an audited integrity error, and both answer in the same shape a
 * denied read does — so a caller cannot distinguish "not yours", "not there" and
 * "damaged" from the outside.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AcquisitionWrites, ObservationReads } from '../observation.capabilities.js';
import { VaultService, VaultIntegrityError } from './vault.service.js';

export interface EvidenceSummary {
  object_id: string;
  object_version: number;
  recorded_at: Date;
  observation_time: Date | null;
  event_time: Date | null;
  lifecycle_state: string;
  truth_state: string;
  synthetic_state: boolean;
  provenance_ref: string | null;
  method_ref: string | null;
  payload: Record<string, unknown>;
  [k: string]: unknown;
}

export interface RetrievalResult {
  filename: string;
  contentDigest: string;
  byteLength: number;
  base64: string;
  integrity: 'verified' | 'unavailable';
}

@Injectable()
export class EvidenceService {
  constructor(private readonly vault: VaultService) {}

  /**
   * The evidence browser lists the CURRENT version of each object.
   *
   * Every version is retained and reachable — through the detail view's version
   * history and through a known-at query — but a list that returned v1 and v2 as
   * two rows would show one corrected object as two pieces of evidence, and an
   * operator acting on that list would act on both.
   */
  async list(cap: ObservationReads, sourceId: string | null, limit: number): Promise<EvidenceSummary[]> {
    let q = cap
      .readCanonicalObjects()
      .selectAll()
      .where('object_type' as never, '=', 'EVD' as never)
      .orderBy('recorded_at' as never, 'desc')
      .limit(Math.min(limit, 500) * 4);
    if (sourceId !== null) {
      // Provenance carries the source, so filtering by source needs no join and
      // no denormalised column that could drift from the object.
      q = q.where('provenance_ref' as never, 'like', `SRC:${sourceId}@%` as never);
    }
    const rows = (await q.execute()) as EvidenceSummary[];
    const current = new Map<string, EvidenceSummary>();
    for (const r of rows) {
      const prev = current.get(r.object_id);
      if (prev === undefined || Number(r.object_version) > Number(prev.object_version)) {
        current.set(r.object_id, r);
      }
    }
    return [...current.values()]
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
      .slice(0, Math.min(limit, 500));
  }

  /**
   * The full custody view. `knownAt` reproduces the state of knowledge at an
   * instant: later corrections are invisible, which is what makes a decision
   * defensible after the world has moved on.
   */
  async detail(
    cap: ObservationReads, evdId: string, knownAt: string | null, correlationId: string,
  ): Promise<Record<string, unknown>> {
    let q = cap
      .readCanonicalObjects()
      .selectAll()
      .where('object_id' as never, '=', evdId as never)
      .orderBy('object_version' as never, 'desc')
      .limit(1);
    if (knownAt !== null) {
      const t = new Date(knownAt);
      if (Number.isNaN(t.getTime())) {
        throw new HttpException(errorBody('EYE_TMP_001', correlationId, 'invalid known-at instant'), 400);
      }
      q = q.where('recorded_at' as never, '<=', t as never);
    }
    const evd = (await q.executeTakeFirst()) as EvidenceSummary | undefined;
    if (evd === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'no authorized evidence object matches'), 404);
    }

    const payload = evd.payload as { obs_object_id?: string; manifest_id?: string; parent_evd_id?: string | null };
    const obs = payload.obs_object_id !== undefined
      ? ((await cap
          .readCanonicalObjects()
          .selectAll()
          .where('object_id' as never, '=', payload.obs_object_id as never)
          .orderBy('object_version' as never, 'desc')
          .limit(1)
          .executeTakeFirst()) as EvidenceSummary | undefined)
      : undefined;

    const custody = (await cap
      .readCustody()
      .selectAll()
      .where('evd_object_id' as never, '=', evdId as never)
      .orderBy('occurred_at' as never)
      .execute()) as Array<Record<string, unknown>>;

    const manifest = payload.manifest_id !== undefined
      ? ((await cap
          .readManifests()
          .selectAll()
          .where('manifest_id' as never, '=', payload.manifest_id as never)
          .executeTakeFirst()) as Record<string, unknown> | undefined)
      : undefined;

    const tombstone = payload.manifest_id !== undefined
      ? ((await cap
          .readTombstones()
          .selectAll()
          .where('manifest_id' as never, '=', payload.manifest_id as never)
          .executeTakeFirst()) as Record<string, unknown> | undefined)
      : undefined;

    const obsPayload = obs?.payload as { source_id?: string; run_id?: string } | undefined;
    const source = obsPayload?.source_id !== undefined
      ? ((await cap
          .readSourceContracts()
          .selectAll()
          .where('source_id' as never, '=', obsPayload.source_id as never)
          .orderBy('contract_version' as never, 'desc')
          .limit(1)
          .executeTakeFirst()) as Record<string, unknown> | undefined)
      : undefined;

    const run = obsPayload?.run_id !== undefined
      ? ((await cap
          .readRuns()
          .selectAll()
          .where('run_id' as never, '=', obsPayload.run_id as never)
          .executeTakeFirst()) as Record<string, unknown> | undefined)
      : undefined;

    const versions = (await cap
      .readCanonicalObjects()
      .selectAll()
      .where('object_id' as never, '=', evdId as never)
      .orderBy('object_version' as never)
      .execute()) as EvidenceSummary[];

    return {
      evidence: evd,
      observation: obs ?? null,
      source: source ?? null,
      run: run ?? null,
      manifest: manifest ?? null,
      tombstone: tombstone ?? null,
      custody,
      versionHistory: versions.map((v) => ({
        object_version: Number(v.object_version),
        lifecycle_state: v.lifecycle_state,
        truth_state: v.truth_state,
        recorded_at: v.recorded_at,
        correction_of: v['correction_of'],
        withdrawal_reason: v['withdrawal_reason'],
      })),
      /*
       * The four times, named, so the UI does not have to know which header field
       * means which axis — and so an absent one reads as an explicit "none
       * recorded" rather than as a missing key.
       */
      fourTimes: {
        event: evd.event_time,
        observation: evd.observation_time ?? obs?.observation_time ?? null,
        valid: { from: evd['valid_from'] ?? null, to: evd['valid_to'] ?? null },
        record: evd.recorded_at,
      },
      knownAt,
    };
  }

  /**
   * Retrieve the original bytes. Called INSIDE the governed transaction, so the
   * custody entry for the retrieval commits with the policy and audit records
   * that authorized it.
   */
  async retrieve(
    cap: AcquisitionWrites, ctx: ScopeContext, actor: string, evdId: string, correlationId: string,
    /**
     * Optional detail about WHY this retrieval happened, merged into the custody
     * entry. An operator download passes nothing and the record is unchanged; a
     * machine reader — Phase 2 extraction — passes its purpose, method and run so
     * the custody chain says which extraction read these bytes and under what.
     *
     * It cannot change what is verified, what is served, or what is refused: it
     * only says more about a read that happened anyway.
     */
    context: Readonly<Record<string, string>> = {},
  ): Promise<RetrievalResult> {
    const evd = (await cap
      .readCanonicalObjects()
      .selectAll()
      .where('object_id' as never, '=', evdId as never)
      .orderBy('object_version' as never, 'desc')
      .limit(1)
      .executeTakeFirst()) as EvidenceSummary | undefined;
    if (evd === undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'no authorized evidence object matches'), 404);
    }
    const payload = evd.payload as {
      manifest_id: string; locator: string; content_digest: string; vault: 'evidence' | 'quarantine';
      obs_object_id: string;
    };

    // A withdrawn object's BYTES are not served. The record stays; the content
    // does not move again.
    if (evd.lifecycle_state === 'withdrawn') {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'this evidence has been withdrawn and its bytes are no longer served'), 409);
    }

    const tombstone = (await cap
      .readTombstones()
      .selectAll()
      .where('manifest_id' as never, '=', payload.manifest_id as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    if (tombstone !== undefined) {
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'the bytes for this evidence have been governed-deleted'), 409);
    }

    const manifest = (await cap
      .readManifests()
      .selectAll()
      .where('manifest_id' as never, '=', payload.manifest_id as never)
      .executeTakeFirst()) as { locator: string; content_digest: string; vault: string } | undefined;
    if (manifest === undefined) {
      // Retrieval resolves through the MANIFEST ONLY. No manifest, no bytes — this
      // is what makes an aborted admission's orphan unreachable.
      throw new HttpException(
        errorBody('EYE_STA_001', correlationId, 'no authorized evidence object matches'), 404);
    }

    let integrity: RetrievalResult['integrity'] = 'verified';
    let bytes: Buffer;
    try {
      const read = await this.vault.read(
        manifest.vault as 'evidence' | 'quarantine',
        { tenantId: ctx.tenantId as string, domainId: ctx.domainId as string },
        manifest.locator, manifest.content_digest);
      bytes = read.bytes;
    } catch (e) {
      integrity = 'unavailable';
      // The FAILURE is recorded in custody before the request answers, so an
      // integrity error is evidence rather than only an error message.
      await cap.appendCustody({
        eventId: newId(),
        tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
        manifestId: payload.manifest_id, obsObjectId: payload.obs_object_id, evdObjectId: evdId,
        sourceId: sourceIdOf(evd), contractVersion: contractVersionOf(evd), runId: null,
        event: 'custody.integrity_failed', actor,
        agentPrincipalId: null, agentVersion: null, codeDigest: null,
        connector: null, connectorVersion: null, methodRef: null,
        contentDigest: manifest.content_digest, digestVerified: false,
        details: {
          failure: e instanceof VaultIntegrityError ? e.reason : 'unknown',
          // No filesystem path, no locator, no hint about what else exists.
          disclosure: 'none',
          ...context,
        },
        correlationId,
      });
      throw new HttpException(
        errorBody('EYE_INT_001', correlationId, 'evidence bytes failed integrity verification and were not served'), 409);
    }

    await cap.appendCustody({
      eventId: newId(),
      tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      manifestId: payload.manifest_id, obsObjectId: payload.obs_object_id, evdObjectId: evdId,
      sourceId: sourceIdOf(evd), contractVersion: contractVersionOf(evd), runId: null,
      event: 'custody.retrieved', actor,
      agentPrincipalId: null, agentVersion: null, codeDigest: null,
      connector: null, connectorVersion: null, methodRef: null,
      contentDigest: manifest.content_digest, digestVerified: true,
      details: { verified_on_read: true, byte_length: bytes.byteLength, ...context },
      correlationId,
    });

    return {
      filename: `${evdId}.bin`,
      contentDigest: manifest.content_digest,
      byteLength: bytes.byteLength,
      base64: bytes.toString('base64'),
      integrity,
    };
  }
}

function sourceIdOf(evd: EvidenceSummary): string {
  const m = /^SRC:([0-9a-f-]{36})@/.exec(String(evd.provenance_ref ?? ''));
  return m?.[1] ?? '00000000-0000-0000-0000-000000000000';
}

function contractVersionOf(evd: EvidenceSummary): number {
  const m = /@(\d+)$/.exec(String(evd.provenance_ref ?? ''));
  return m?.[1] !== undefined ? Number(m[1]) : 1;
}
