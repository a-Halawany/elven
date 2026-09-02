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

const VERSION = '1.1.0';
export const REST_METHOD_REF = `rest-transport-framing@${VERSION}`;
/**
 * The framing method recorded on every child item. Naming the method and its
 * version on the item is what lets a later framing change be seen as different
 * lineage rather than as data that quietly changed shape.
 */
export const JSON_ARRAY_METHOD_REF = `json-array-framing@${VERSION}`;

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
    // Raw responses preserved as PARENT evidence when framing is declared, so a
    // child fragment always has the exact bytes it was cut from.
    const parents: AcquiredItem[] = [];
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
        const transport = {
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
        };
        const parentItem: AcquiredItem = {
          itemKey: itemKeyFor(endpoint, got.entry.retrieved_at),
          bytes: got.body,
          declaredMediaType: got.entry.retained_headers['content-type'] ?? null,
          filename: got.entry.file,
          publisherTime: got.entry.retained_headers['last-modified'] ?? null,
          transport,
        };
        const framed = frame(parentItem, binding.expectedSchema);
        if (framed === null) items.push(parentItem);
        else { parents.push(parentItem); items.push(...framed); }
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
        const parentItem: AcquiredItem = {
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
        };
        const framed = frame(parentItem, binding.expectedSchema);
        if (framed === null) items.push(parentItem);
        else { parents.push(parentItem); items.push(...framed); }
      } catch (e) {
        // A refusal is EVIDENCE, not a silent skip: it propagates so the run
        // records why this endpoint produced nothing.
        throw e;
      }
    }

    return {
      items: [...parents, ...items],
      checkpoint: nextCheckpoint, bytesTransferred, requestsMade,
    };
  }
}

/**
 * Contract-declared JSON framing.
 *
 * The parent bytes are searched for each element's EXACT BYTE RANGE, so a child
 * is a true fragment of what arrived rather than a re-serialisation that merely
 * resembles it. Nothing here interprets a field: `item_key_field` says which
 * value ADDRESSES an element and `item_time_field` says which carries the
 * publisher's own time, both named by the contract.
 *
 * Returns null when the contract declares no framing, when the payload is not
 * JSON, or when the declared path is not an array — in every one of those cases
 * the response is admitted whole, which is the honest answer for a payload this
 * connector cannot address into.
 */
function frame(parent: AcquiredItem, expected: {
  itemPath?: string; itemKeyField?: string; itemTimeField?: string;
}): AcquiredItem[] | null {
  if (expected.itemPath === undefined || expected.itemKeyField === undefined) return null;
  const text = Buffer.from(parent.bytes).toString('utf8');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const array = readPath(parsed, expected.itemPath);
  if (!Array.isArray(array)) return null;

  // The element SPANS in the original bytes, found by walking the array's own
  // braces. Re-serialising an element and searching for it would depend on the
  // publisher's exact indentation; walking the text does not, and it is what
  // makes a child a TRUE fragment of the parent rather than a lookalike.
  const spans = arrayElementSpans(text, expected.itemPath);
  if (spans === null || spans.length !== array.length) return null;

  const out: AcquiredItem[] = [];
  for (let i = 0; i < array.length; i += 1) {
    const element = array[i];
    const span = spans[i] as { start: number; end: number };
    const key = String(readPath(element, expected.itemKeyField) ?? '');
    if (key === '') continue;
    const fragmentText = text.slice(span.start, span.end);
    const byteStart = Buffer.byteLength(text.slice(0, span.start), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(fragmentText, 'utf8');

    const time = expected.itemTimeField !== undefined
      ? readPath(element, expected.itemTimeField) : null;
    out.push({
      // The PARENT's key prefixes the child's, so three chokepoints publishing the
      // same dates produce three distinct items rather than one and two replays.
      itemKey: `${parent.itemKey}#${expected.itemPath}:${key}`,
      bytes: Buffer.from(fragmentText, 'utf8'),
      declaredMediaType: 'application/json',
      filename: `${key.replace(/[^A-Za-z0-9._-]+/g, '-')}.item.json`,
      publisherTime: typeof time === 'string' ? time : null,
      transport: { ...parent.transport, methodRef: JSON_ARRAY_METHOD_REF },
      parentItemKey: parent.itemKey,
      fragment: { byteStart, byteEnd, methodRef: JSON_ARRAY_METHOD_REF },
    });
  }
  return out.length > 0 ? out : null;
}

/**
 * The exact character spans of a JSON array's top-level elements.
 *
 * Walks the raw text tracking string state, escapes and nesting depth, so the
 * spans are correct whatever the publisher's whitespace. Returns null if the
 * declared key cannot be located unambiguously — in which case the caller admits
 * the payload whole rather than guessing at a framing it could not verify.
 */
function arrayElementSpans(text: string, path: string): Array<{ start: number; end: number }> | null {
  const key = path.split('.').pop() as string;
  const needle = `"${key}"`;
  const keyAt = text.indexOf(needle);
  if (keyAt < 0 || text.indexOf(needle, keyAt + 1) >= 0) return null; // absent or ambiguous
  let i = text.indexOf('[', keyAt + needle.length);
  if (i < 0) return null;
  // Nothing but whitespace and the colon may sit between the key and the array.
  if (!/^\s*:\s*$/.test(text.slice(keyAt + needle.length, i))) return null;

  const spans: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let elementStart = -1;
  for (i += 1; i < text.length; i += 1) {
    const c = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; if (depth === 0 && elementStart < 0) elementStart = i; continue; }
    if (c === '{' || c === '[') { if (depth === 0 && elementStart < 0) elementStart = i; depth += 1; continue; }
    if (c === '}' || c === ']') {
      if (depth === 0) {
        // The array's own closing bracket.
        if (elementStart >= 0) spans.push({ start: elementStart, end: i });
        return spans;
      }
      depth -= 1;
      if (depth === 0 && elementStart >= 0) { spans.push({ start: elementStart, end: i + 1 }); elementStart = -1; }
      continue;
    }
    if (c === ',' && depth === 0) {
      if (elementStart >= 0) { spans.push({ start: elementStart, end: i }); elementStart = -1; }
      continue;
    }
    if (depth === 0 && elementStart < 0 && !/\s/.test(c)) elementStart = i;
  }
  return null;
}

function readPath(value: unknown, path: string): unknown {
  let cursor: unknown = value;
  for (const part of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}



/**
 * The item's natural key inside the source. It binds the ENDPOINT and the
 * RETRIEVAL INSTANT, never the content digest: identical bytes retrieved later
 * are a NEW OBSERVATION (§5.12), and a digest-keyed item would silently collapse
 * the two.
 */
function itemKeyFor(endpoint: string, retrievedAt: string): string {
  return `${safeUrl(endpoint)}@${retrievedAt}`;
}

/**
 * A stable, non-disclosing identifier for an endpoint.
 *
 * The QUERY IS PART OF THE IDENTITY — three PortWatch chokepoints differ only in
 * their `where=` clause, and collapsing them would make three distinct payloads
 * look like replays of one. It is included as a DIGEST rather than verbatim,
 * because §8.1 redacts query strings everywhere they would otherwise be stored,
 * and an item key is stored.
 */
function safeUrl(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    const base = `${u.hostname}${u.pathname}`;
    if (u.search === '') return base;
    return `${base}?${createHash('sha256').update(u.search).digest('hex').slice(0, 16)}`;
  } catch {
    return createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
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
