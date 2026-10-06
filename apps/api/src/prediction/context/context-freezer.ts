/**
 * B25 §CX (0108) — CONTEXT_FREEZER implemented: GroundedContextFreezer REPLACES the prelude's NullContextFreezer (prediction.module.ts,
 * the `B25 seams` block). Any issuing path (§CX's grounded issue, §MR's portfolio issue, §EN's ensemble members) calls
 *
 *     const frozen = await freezer.freeze(tx, { tenantId, domainId, seriesKey, subjectEntityId, targetKey, knownAt, observedThrough, assumptions, actor, correlationId });
 *     const env = freezer.environment(methodRef);
 *
 * INSIDE its own write transaction and hands `frozen.informationSetId` and `env` to the issue (b25.columns.information_set_id and
 * .environment = { ...env.facts, digest: env.digest }; b25.payload.information_set = frozen.summary and .environment = env.facts …). The
 * pin trigger (pcx_fct_information_set) then binds the forecast to the set: same series, subject and cut-off, and every evidence version
 * the forecast cites among the set's.
 *
 * `tx` is the Kysely transaction of the write — passed as is, or as an object carrying it in `tx` (a capability wrapper). The freeze port
 * serves the issuing actions (prediction.forecast.issue / .portfolio.issue / .ensemble.issue) and prediction.information_set.freeze.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { Tx } from '../../shared/db.js';
import { forecastEnvironment } from '../../shared/forecast-environment.js';
import { PdpService } from '../../policy/pdp.service.js';
import type { ContextFreezer, ForecastEnvironment, FreezeRequest, FrozenInformationSet } from '../portfolio/seams.js';
import { ASSEMBLER_VERSION, assembleManifest, canonicalRequest, summaryOf, type Manifest } from './assembler.js';
import { ContextCapability, type FreezeWrites } from './context.capabilities.js';
import { registerLegacyMethods } from './legacy-methods.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The PDP bundle version in force (the policy section of every manifest names it). */
export const PDP_BUNDLE_VERSION = new PdpService().bundleVersion;

/** The transaction a seam caller handed: the Kysely transaction itself, or an object carrying it as `tx`. */
export function resolveTx(t: unknown): Tx {
  const o = t as { executeQuery?: unknown; selectFrom?: unknown; tx?: unknown } | null;
  if (o !== null && typeof o === 'object' && typeof o.executeQuery === 'function' && typeof o.selectFrom === 'function') return o as unknown as Tx;
  if (o !== null && typeof o === 'object' && o.tx !== undefined) return resolveTx(o.tx);
  throw new Error('CONTEXT_FREEZER.freeze needs the write transaction (a Kysely transaction, or an object carrying it as `tx`)');
}

/** The request's contract (L6-C02 contract validation): typed ids, an instant, a day — before anything is read. */
export function validateFreezeRequest(req: FreezeRequest, correlationId: string): void {
  const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
  if (typeof req.seriesKey !== 'string' || req.seriesKey.trim().length < 2) bad('an information set names its series (seriesKey)');
  if (typeof req.knownAt !== 'string' || Number.isNaN(new Date(req.knownAt).getTime())) bad('an information set names its cut-off (knownAt, an instant)');
  if (req.observedThrough !== null && (typeof req.observedThrough !== 'string' || !DAY.test(req.observedThrough))) bad('observedThrough is a day (YYYY-MM-DD) or null');
  if (req.subjectEntityId !== null && (typeof req.subjectEntityId !== 'string' || !UUID.test(req.subjectEntityId))) bad('subjectEntityId is a uuid or null');
  if (!Array.isArray(req.assumptions) || !req.assumptions.every((a) => typeof a === 'string' && UUID.test(a))) bad('assumptions are the ids (uuids) of ASU objects');
  if (req.targetKey !== null && typeof req.targetKey !== 'string') bad('targetKey is a string or null');
}

/**
 * ASSEMBLE AND FREEZE through a capability bound to the write's transaction: the grounding read, the manifest (assembler@1), the port.
 * Answers the frozen set with its manifest (the caller's payload summary is `summary`).
 */
export async function freezeWith(cap: FreezeWrites, req: FreezeRequest, pdpBundle: string = PDP_BUNDLE_VERSION): Promise<FrozenInformationSet & { manifest: Manifest }> {
  validateFreezeRequest(req, req.correlationId);
  const request = canonicalRequest(req);
  const ctx = await cap.groundingContext({ seriesKey: request.series_key, knownAt: request.known_at, assumptions: request.assumptions, twin: null });
  const { manifest, digest } = assembleManifest(request, ctx, { pdpBundle });
  const setId = newId();
  await cap.freezeSet({ setId, tenantId: req.tenantId, domainId: req.domainId, request: request as unknown as Record<string, unknown>,
    manifest: manifest as unknown as Record<string, unknown>, manifestDigest: digest, assemblerVersion: ASSEMBLER_VERSION,
    actor: req.actor, eventId: newId(), correlationId: req.correlationId });
  return {
    informationSetId: setId, manifestDigest: digest,
    graph: { revisionHead: manifest.graph.revision_head, knownAt: manifest.graph.known_at },
    twin: manifest.twin === null ? null : { twinId: manifest.twin.twin_id, version: manifest.twin.version, stateSetDigest: manifest.twin.state_set_digest },
    features: manifest.features.map((f) => ({ key: f.key, source: f.source, digest: f.digest, ...(f.value === undefined ? {} : { value: f.value }) })),
    coverageGaps: manifest.coverage_gaps.map((g) => `${g.key}: ${g.reason}`),
    summary: summaryOf(setId, digest, manifest),
    manifest,
  };
}

@Injectable()
export class GroundedContextFreezer implements ContextFreezer {
  constructor() { registerLegacyMethods(); }

  async freeze(tx: unknown, req: FreezeRequest): Promise<FrozenInformationSet | null> {
    const cap = ContextCapability.freeze(resolveTx(tx), 'prediction.information_set.freeze');
    const { manifest: _m, ...frozen } = await freezeWith(cap, req);
    return frozen;
  }

  environment(methodRef: string): ForecastEnvironment | null {
    const e = forecastEnvironment(methodRef, ASSEMBLER_VERSION);
    return { digest: e.digest, facts: e.facts as unknown as Record<string, unknown> };
  }
}
