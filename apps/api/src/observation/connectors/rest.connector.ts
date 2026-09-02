/**
 * Generic governed REST poller — cohort 1 (PHASE1_PLAN §2, §8.1).
 *
 * "Generic" means the contract describes the endpoints, the expected media
 * types, the required fields and the drift tolerance, and this connector honours
 * that description. It does NOT mean it understands any particular API: it
 * fetches, records transport evidence, checks the declared schema shape, and
 * yields bytes. Nothing here interprets a value.
 *
 * ETag / If-Modified-Since are carried on the checkpoint so a poll that finds
 * nothing new costs one conditional request, and so a resumed run continues from
 * the last COMMITTED checkpoint rather than re-fetching the world.
 */
import { createHash } from 'node:crypto';
import { egress, EgressRefused } from './http-client.js';
import { ReplayResponder } from './replay.js';
import type { AcquiredItem, AcquisitionContext, AcquisitionOutput, Connector } from './sdk.js';

const VERSION = '1.0.0';
export const REST_METHOD_REF = `rest-transport-framing@${VERSION}`;

export class RestConnector implements Connector {
  readonly kind = 'rest' as const;
  readonly name = 'observation.rest';
  readonly version = VERSION;
  readonly codeDigest = createHash('sha256')
    .update(`${this.name}@${VERSION}:${REST_METHOD_REF}`)
    .digest('hex');

  async acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    const { binding } = ctx;
    const checkpoint = (ctx.checkpoint ?? {}) as Record<string, { etag?: string; lastModified?: string }>;
    const items: AcquiredItem[] = [];
    const nextCheckpoint: Record<string, unknown> = { ...checkpoint };
    let bytesTransferred = 0;
    let requestsMade = 0;

    const replay = binding.acquisitionMode === 'replay'
      ? new ReplayResponder(ctx.replayRoot)
      : null;

    for (const endpoint of binding.endpoints) {
      ctx.budget.spendRequest();
      requestsMade += 1;

      if (replay !== null) {
        // The SAME connector, the SAME framing, recorded bytes instead of the wire.
        const got = await replay.fetch(binding.sourceKey, endpoint);
        if (got === null) continue;
        ctx.budget.spendBytes(got.body.byteLength);
        bytesTransferred += got.body.byteLength;
        items.push({
          itemKey: itemKeyFor(endpoint, got.entry.retrieved_at),
          bytes: got.body,
          declaredMediaType: got.entry.retained_headers['content-type'] ?? null,
          filename: got.entry.file,
          publisherTime: got.entry.retained_headers['last-modified'] ?? null,
          transport: {
            connector: this.name,
            connectorVersion: VERSION,
            methodRef: REST_METHOD_REF,
            endpoint,
            httpStatus: got.entry.status,
            retainedHeaders: got.entry.retained_headers,
            // A replayed response makes NO transport-authenticity claim. It was
            // verified when captured; asserting it again now would be a lie about
            // what this run did.
            tlsVerified: null,
            originAllowlisted: null,
          },
        });
        continue;
      }

      const conditional: Record<string, string> = {};
      const cp = checkpoint[endpoint];
      if (cp?.etag !== undefined) conditional['if-none-match'] = cp.etag;
      if (cp?.lastModified !== undefined) conditional['if-modified-since'] = cp.lastModified;

      try {
        const res = await egress({ url: endpoint, headers: conditional, policy: binding.egress });
        if (res.status === 304) {
          // Nothing new. Not an error, not an item, and not a freshness failure.
          continue;
        }
        if (res.status < 200 || res.status >= 300) {
          throw new EgressRefused('transport_failure', `endpoint answered ${res.status}`);
        }
        ctx.budget.spendBytes(res.body.byteLength);
        bytesTransferred += res.body.byteLength;
        nextCheckpoint[endpoint] = {
          ...(res.headers['etag'] !== undefined ? { etag: res.headers['etag'] } : {}),
          ...(res.headers['last-modified'] !== undefined ? { lastModified: res.headers['last-modified'] } : {}),
        };
        items.push({
          itemKey: itemKeyFor(endpoint, new Date().toISOString()),
          bytes: res.body,
          declaredMediaType: res.headers['content-type'] ?? null,
          filename: filenameFor(endpoint),
          publisherTime: res.headers['last-modified'] ?? null,
          transport: {
            connector: this.name,
            connectorVersion: VERSION,
            methodRef: REST_METHOD_REF,
            endpoint: res.finalUrlRedacted,
            httpStatus: res.status,
            retainedHeaders: res.headers,
            tlsVerified: res.tlsVerified,
            originAllowlisted: res.originAllowlisted,
            pinnedAddress: res.pinnedAddress,
            redirectHops: res.hops,
          },
        });
      } catch (e) {
        // A refusal is EVIDENCE, not a silent skip: it propagates so the run
        // records why this endpoint produced nothing.
        throw e;
      }
    }

    return { items, checkpoint: nextCheckpoint, bytesTransferred, requestsMade };
  }
}

/**
 * The item's natural key inside the source. It binds the ENDPOINT and the
 * RETRIEVAL INSTANT, never the content digest: identical bytes retrieved later
 * are a NEW OBSERVATION (§5.12), and a digest-keyed item would silently collapse
 * the two.
 */
function itemKeyFor(endpoint: string, retrievedAt: string): string {
  const u = safeUrl(endpoint);
  return `${u}@${retrievedAt}`;
}

function safeUrl(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return endpoint.slice(0, 200);
  }
}

function filenameFor(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    const last = u.pathname.split('/').filter(Boolean).pop() ?? 'response';
    return last.includes('.') ? last : `${last}.json`;
  } catch {
    return 'response.bin';
  }
}
