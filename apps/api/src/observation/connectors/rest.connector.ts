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
import { egress as liveEgress, EgressRefused, type EgressPolicy, type EgressResult } from './http-client.js';
import { ReplayResponder } from './replay.js';
import type { AcquiredItem, AcquisitionContext, AcquisitionOutput, BackfillDeclaration,
  BackfillProgress, Connector } from './sdk.js';

/**
 * 1.2.0 adds the CLOSED-RANGE BACKFILL (Phase 4 §4a). The framing method refs
 * are unchanged — a backfilled window is framed exactly as a polled response —
 * and the version bump is what makes a backfilled item attributable to the code
 * that walked the range rather than to the poller that did not.
 */
const VERSION = '1.2.0';
/** The traversal method recorded on every backfilled parent item. */
export const BACKFILL_METHOD_REF = `rest-backfill-traversal@${VERSION}`;

/** The transport a connector uses. Injectable so a traversal can be tested against a double. */
export type Egress = (a: { url: string; headers: Record<string, string>; policy: EgressPolicy }) => Promise<EgressResult>;
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
    .update(`${this.name}@${VERSION}:${REST_METHOD_REF}:${BACKFILL_METHOD_REF}`)
    .digest('hex');

  private readonly egress: Egress;

  constructor(opts: { egress?: Egress } = {}) {
    this.egress = opts.egress ?? liveEgress;
  }

  async acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    const { binding } = ctx;
    const checkpoint = (ctx.checkpoint ?? {}) as Record<string, unknown>;
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

    /*
     * A BACKFILL RUNS INSTEAD OF A FORWARD POLL, UNTIL IT IS DONE.
     *
     * The declared window is walked inside THIS run's budget and the progress is
     * carried on the checkpoint. A run that finds the backfill unfinished continues
     * it and touches no forward endpoint; a run that finds it finished polls
     * forward exactly as Phase 1 did. The budget is the contract's own — a backfill
     * that needs more requests than one run allows takes several runs, which is the
     * plan's answer to a budget it is not permitted to raise silently.
     */
    if (replay === null && binding.backfill !== undefined) {
      const progress = backfillProgressOf(checkpoint, binding.backfill, binding.contractVersion);
      if (!progress.done) {
        const walked = await this.backfill(ctx, binding.backfill, progress);
        nextCheckpoint['backfill'] = walked.progress;
        return {
          items: [...walked.parents, ...walked.items],
          checkpoint: nextCheckpoint,
          bytesTransferred: walked.bytes, requestsMade: walked.requests,
        };
      }
      nextCheckpoint['backfill'] = progress;
    }

    for (const endpoint of binding.endpoints) {
      ctx.budget.spendRequest();
      requestsMade += 1;

      if (replay !== null) {
        // The SAME connector, the SAME framing, recorded bytes instead of the wire.
        const got = await replay.fetch(binding.replaySet, endpoint);
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
      const cp = checkpoint[endpoint] as { etag?: string; lastModified?: string } | undefined;
      if (cp?.etag !== undefined) conditional['if-none-match'] = cp.etag;
      if (cp?.lastModified !== undefined) conditional['if-modified-since'] = cp.lastModified;

      try {
        const res = await this.egress({ url: endpoint, headers: conditional, policy: binding.egress });
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

  /**
   * Walk the declared window from where the checkpoint left off, within budget.
   *
   * DETERMINISTIC KEYS. A backfilled item is keyed by the window (or page) it
   * covers, never by the retrieval instant, and is flagged `deterministic` — so a
   * re-run over the same range is recognised by the lifecycle as the same window
   * rather than admitted again as new evidence.
   *
   * THE BUDGET IS RESPECTED BEFORE IT IS SPENT. The loop stops when the next
   * request would exceed the run's request budget, leaving the cursor where the
   * next run should resume. A run never ends by breaching the budget it was
   * given; it ends by declining to.
   */
  private async backfill(
    ctx: AcquisitionContext, decl: BackfillDeclaration, start: BackfillProgress,
  ): Promise<{ items: AcquiredItem[]; parents: AcquiredItem[]; progress: BackfillProgress;
               bytes: number; requests: number }> {
    const { binding } = ctx;
    const progress: BackfillProgress = { ...start };
    const items: AcquiredItem[] = [];
    const parents: AcquiredItem[] = [];
    let bytes = 0;
    let requests = 0;
    const budget = binding.budgets.maxRequestsPerRun;

    while (!progress.done && requests < budget) {
      const step = nextRequest(decl, progress);
      ctx.budget.spendRequest();
      requests += 1;
      const res = await this.egress({ url: step.url, headers: {}, policy: binding.egress });
      if (res.status < 200 || res.status >= 300) {
        throw new EgressRefused('transport_failure', `backfill endpoint answered ${res.status}`);
      }
      ctx.budget.spendBytes(res.body.byteLength);
      bytes += res.body.byteLength;

      const parentItem: AcquiredItem = {
        itemKey: step.itemKey,
        bytes: res.body,
        declaredMediaType: res.headers['content-type'] ?? null,
        filename: step.filename,
        publisherTime: res.headers['last-modified'] ?? null,
        deterministic: true,
        transport: {
          connector: this.name,
          connectorVersion: VERSION,
          methodRef: BACKFILL_METHOD_REF,
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
      else {
        parents.push(parentItem);
        // A framed child inherits determinism from the window it was cut from.
        items.push(...framed.map((f) => ({ ...f, deterministic: true })));
      }

      const advanced = advance(decl, progress, step, res.body, framed?.length ?? 0);
      progress.cursor = advanced.cursor;
      progress.done = advanced.done;
      progress.requests += 1;
      progress.items += framed?.length ?? 1;
      if (progress.done) progress.finishedAt = new Date().toISOString();
    }
    return { items, parents, progress, bytes, requests };
  }
}

/* ───────────────────────── backfill traversal ───────────────────────── */

/**
 * Where to resume. A checkpoint that carries no backfill, one for a DIFFERENT
 * declaration (window or strategy changed), or one made under an EARLIER
 * contract version, starts from the declaration's own beginning. The last of
 * these is how an operator re-collects a range after a publisher restatement:
 * register a new contract version, and the walk runs again — identical windows
 * no-op, changed windows become revisions.
 */
export function backfillProgressOf(
  checkpoint: Record<string, unknown>, decl: BackfillDeclaration, contractVersion: number,
): BackfillProgress {
  const to = decl.to ?? new Date().toISOString().slice(0, 10);
  const prior = checkpoint['backfill'] as Partial<BackfillProgress> | undefined;
  if (prior !== undefined && prior.strategy === decl.strategy && prior.from === decl.from
      && prior.to === to && prior.contractVersion === contractVersion
      && prior.cursor !== undefined && typeof prior.done === 'boolean') {
    return {
      strategy: decl.strategy, from: decl.from, to, contractVersion, cursor: prior.cursor, done: prior.done,
      requests: prior.requests ?? 0, items: prior.items ?? 0,
      startedAt: prior.startedAt ?? new Date().toISOString(), finishedAt: prior.finishedAt ?? null,
    };
  }
  return {
    strategy: decl.strategy, from: decl.from, to, contractVersion,
    cursor: decl.strategy === 'period-range' ? decl.from : 0,
    done: false, requests: 0, items: 0, startedAt: new Date().toISOString(), finishedAt: null,
  };
}

interface Step { url: string; itemKey: string; filename: string; windowStart: string; windowEnd: string; offset: number }

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The next request the traversal makes, and the deterministic key of what it returns. */
export function nextRequest(decl: BackfillDeclaration, progress: BackfillProgress): Step {
  const base = decl.endpoint;
  const sep = base.includes('?') ? '&' : '?';
  if (decl.strategy === 'period-range') {
    const windowStart = String(progress.cursor);
    // The window is [start, start + days); the publisher's end parameter is inclusive.
    const exclusiveEnd = addDays(windowStart, decl.windowDays ?? 366);
    const windowEnd = exclusiveEnd < progress.to ? exclusiveEnd : progress.to;
    const inclusiveEnd = addDays(windowEnd, -1);
    const url = `${base}${sep}${encodeURIComponent(decl.startParam ?? 'startPeriod')}=${windowStart}`
      + `&${encodeURIComponent(decl.endParam ?? 'endPeriod')}=${inclusiveEnd}`;
    return {
      url, windowStart, windowEnd, offset: 0,
      itemKey: `${safeUrl(base)}@backfill:${windowStart}..${windowEnd}`,
      filename: `${windowStart}_${inclusiveEnd}.json`,
    };
  }
  // arcgis-offset: one closed window, walked in ordered pages.
  const offset = Number(progress.cursor);
  const where = `(${decl.where ?? '1=1'}) AND (${decl.timeField} >= TIMESTAMP '${progress.from} 00:00:00' `
    + `AND ${decl.timeField} < TIMESTAMP '${progress.to} 00:00:00')`;
  const url = `${base}${sep}where=${encodeURIComponent(where)}&outFields=*`
    + `&orderByFields=${encodeURIComponent(decl.orderBy as string)}`
    + `&resultOffset=${offset}&resultRecordCount=${decl.pageSize ?? 1000}&f=json`;
  return {
    url, windowStart: progress.from, windowEnd: progress.to, offset,
    itemKey: `${safeUrl(base)}@backfill:${progress.from}..${progress.to}#${offset}`,
    filename: `${progress.from}_${progress.to}_${offset}.json`,
  };
}

/** Advance the cursor after a page, and decide whether the window is exhausted. */
function advance(
  decl: BackfillDeclaration, progress: BackfillProgress, step: Step, body: Buffer, framedCount: number,
): { cursor: string | number; done: boolean } {
  if (decl.strategy === 'period-range') {
    const next = step.windowEnd;
    return { cursor: next, done: next >= progress.to };
  }
  // ArcGIS states whether a page was cut short (`exceededTransferLimit`). When
  // the service says so, that is the answer; when it says nothing, a page
  // smaller than the page size — or an empty one — is the last. Both are read
  // from the bytes, never assumed.
  let exceeded: boolean | null = null;
  let count = framedCount;
  try {
    const parsed = JSON.parse(body.toString('utf8')) as { exceededTransferLimit?: boolean; features?: unknown[] };
    if (typeof parsed.exceededTransferLimit === 'boolean') exceeded = parsed.exceededTransferLimit;
    if (Array.isArray(parsed.features)) count = parsed.features.length;
  } catch { /* an unframeable page ends the walk below */ }
  const pageSize = decl.pageSize ?? 1000;
  const more = exceeded !== null ? exceeded : count >= pageSize;
  return { cursor: step.offset + count, done: !more || count === 0 };
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
