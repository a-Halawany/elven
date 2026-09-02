/**
 * RSS/Atom connector — cohort 1, PHASE1_PLAN §10.1.
 *
 * WHAT "FRAMING" MEANS HERE, precisely, because the distinction is the whole of
 * §10.1: the raw response is preserved as a PARENT evidence object, and each feed
 * item becomes a CHILD whose bytes are an exact byte range of that parent. The
 * child records where in the parent it came from and by which method
 * (`rss-framing@<parser version>`), and nothing else. No title is interpreted, no
 * date is normalised into a meaning, no link is followed.
 *
 * The item key is the feed's own `guid` (or `id`) PAIRED WITH its `pubDate`. That
 * pairing is deliberate and is what makes DEF-06 work: a guid that reappears with
 * a new pubDate is a NEW OBSERVATION of a corrected item, not a replay of the old
 * one — and a guid that reappears with the SAME pubDate inside one run is the
 * exact-replay case that no-ops.
 */
import { createHash } from 'node:crypto';
import { egress } from './http-client.js';
import { ReplayResponder } from './replay.js';
import { parseXmlBounded, RSS_METHOD_REF, PARSER_VERSION } from './xml-parse.js';
import type { AcquiredItem, AcquisitionContext, AcquisitionOutput, Connector } from './sdk.js';

const VERSION = '1.0.0';

interface FeedItem {
  key: string;
  guid: string | null;
  pubDate: string | null;
  byteStart: number;
  byteEnd: number;
}

export class RssConnector implements Connector {
  readonly kind = 'rss' as const;
  readonly name = 'observation.rss';
  readonly version = VERSION;
  readonly codeDigest = createHash('sha256')
    .update(`${this.name}@${VERSION}:${RSS_METHOD_REF}:${PARSER_VERSION}`)
    .digest('hex');

  async acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    const { binding } = ctx;
    const endpoint = binding.endpoints[0];
    if (endpoint === undefined) {
      return { items: [], checkpoint: ctx.checkpoint ?? {}, bytesTransferred: 0, requestsMade: 0 };
    }
    ctx.budget.spendRequest();

    let body: Buffer;
    let transport: AcquiredItem['transport'];
    let filename = 'feed.xml';

    if (binding.acquisitionMode === 'replay') {
      const replay = new ReplayResponder(ctx.replayRoot);
      const got = await replay.fetch(binding.replaySet, endpoint);
      if (got === null) {
        return { items: [], checkpoint: ctx.checkpoint ?? {}, bytesTransferred: 0, requestsMade: 1 };
      }
      body = got.body;
      filename = got.entry.file;
      transport = {
        connector: this.name, connectorVersion: VERSION, methodRef: RSS_METHOD_REF,
        endpoint, httpStatus: got.entry.status, retainedHeaders: got.entry.retained_headers,
        tlsVerified: null, originAllowlisted: null,
      };
    } else {
      const res = await egress({ url: endpoint, policy: binding.egress });
      body = res.body;
      transport = {
        connector: this.name, connectorVersion: VERSION, methodRef: RSS_METHOD_REF,
        endpoint: res.finalUrlRedacted, httpStatus: res.status, retainedHeaders: res.headers,
        tlsVerified: res.tlsVerified, originAllowlisted: res.originAllowlisted,
        pinnedAddress: res.pinnedAddress, redirectHops: res.hops,
      };
    }
    ctx.budget.spendBytes(body.byteLength);

    // The RAW RESPONSE IS THE PARENT EVIDENCE. It is preserved whole, before any
    // framing, so the framing can always be re-derived from — and checked
    // against — exactly what arrived.
    const parent: AcquiredItem = {
      itemKey: `feed:${endpoint}@${digestShort(body)}`,
      bytes: body,
      declaredMediaType: transport.retainedHeaders['content-type'] ?? 'application/xml',
      filename,
      publisherTime: transport.retainedHeaders['last-modified'] ?? null,
      transport,
    };

    const parsed = await parseXmlBounded(body.toString('utf8'));
    if (!parsed.ok) {
      // A feed we cannot parse within budget yields its PARENT ONLY. The bytes are
      // still preserved; nothing is framed out of something we could not read.
      return {
        items: [], parent, checkpoint: ctx.checkpoint ?? {},
        bytesTransferred: body.byteLength, requestsMade: 1,
      };
    }

    const frames = locateItems(body, parsed.value);
    const items: AcquiredItem[] = frames.map((f) => ({
      itemKey: f.key,
      bytes: body.subarray(f.byteStart, f.byteEnd),
      declaredMediaType: 'application/xml',
      filename: `${sanitize(f.guid ?? f.key)}.item.xml`,
      publisherTime: f.pubDate,
      transport: { ...transport, methodRef: RSS_METHOD_REF },
      parentItemKey: parent.itemKey,
      fragment: { byteStart: f.byteStart, byteEnd: f.byteEnd, methodRef: RSS_METHOD_REF },
    }));

    return {
      items, parent,
      checkpoint: { lastFeedDigest: digestShort(body), lastItemCount: items.length },
      bytesTransferred: body.byteLength,
      requestsMade: 1,
    };
  }
}

/**
 * Locate each item's EXACT byte range in the original response.
 *
 * The parsed tree gives the guid and pubDate; the byte range comes from scanning
 * the original bytes for the item element boundaries. Deriving the range from the
 * bytes rather than re-serialising the parse is what makes the child evidence a
 * true fragment of the parent — a re-serialisation would be a new document that
 * merely resembles the original.
 */
function locateItems(body: Buffer, parsed: Record<string, unknown>): FeedItem[] {
  const text = body.toString('utf8');
  const isAtom = 'feed' in parsed;
  const open = isAtom ? '<entry' : '<item';
  const close = isAtom ? '</entry>' : '</item>';
  const out: FeedItem[] = [];
  let cursor = 0;
  while (out.length < 5000) {
    const start = text.indexOf(open, cursor);
    if (start < 0) break;
    // Guard against <items> or <itemgroup> matching a prefix of <item>.
    const after = text[start + open.length];
    if (after !== undefined && !/[\s>/]/.test(after)) { cursor = start + open.length; continue; }
    const end = text.indexOf(close, start);
    if (end < 0) break;
    const endExclusive = end + close.length;
    const fragment = text.slice(start, endExclusive);
    const guid = firstTag(fragment, isAtom ? 'id' : 'guid');
    const pubDate = firstTag(fragment, isAtom ? 'updated' : 'pubDate');
    // Byte offsets, not character offsets: the fragment must be addressable in
    // the stored bytes even when the feed is not ASCII.
    const byteStart = Buffer.byteLength(text.slice(0, start), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(fragment, 'utf8');
    out.push({
      key: `${guid ?? `offset:${byteStart}`}@${pubDate ?? 'no-pubdate'}`,
      guid, pubDate, byteStart, byteEnd,
    });
    cursor = endExclusive;
  }
  return out;
}

function firstTag(fragment: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(fragment);
  if (m?.[1] !== undefined) return m[1].trim();
  // Atom <id> may be self-closing with an href attribute.
  const attr = new RegExp(`<${tag}[^>]*\\bhref="([^"]+)"`, 'i').exec(fragment);
  return attr?.[1] ?? null;
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
}

function digestShort(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex').slice(0, 16);
}
