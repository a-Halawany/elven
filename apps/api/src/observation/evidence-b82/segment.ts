/**
 * CP-6 B82 §EV — THE EVIDENCE SEGMENT's pure rules (UX-26-003, CMP-028): the request's shape and the window served around the cited span.
 * The cited span is [byteStart, byteEnd) of the evidence version's ORIGINAL bytes; at most 64 KiB is cited; at most 1 KiB of context is served
 * either side (so the viewer can show the span in place, highlighted). The window never leaves the bytes; a span that does is refused AFTER
 * the bytes were read and verified (the read happened and is in custody; the request was wrong) — `evidence segment rejected (span)`.
 */
export const SEGMENT_MAX_BYTES = 65_536;
export const SEGMENT_MAX_CONTEXT = 1_024;

export interface SegmentRequest { version: number | null; byteStart: number; byteEnd: number; context: number }
export interface SegmentWindow { cited: { start: number; end: number }; served: { start: number; end: number }; highlight: { start: number; end: number } }

const int = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** The request's problem in the class form (`evidence segment rejected (<class>): …`), or the request. */
export function segmentIntake(p: Record<string, unknown>): SegmentRequest | { problem: string } {
  const version = p['version'] === undefined || p['version'] === null ? null : p['version'];
  if (version !== null && (!int(version) || version < 1)) return { problem: 'evidence segment rejected (version): version, when given, is the evidence version (an integer of 1 or more)' };
  const s = p['byteStart']; const e = p['byteEnd'];
  if (!int(s) || s < 0 || !int(e) || e <= s) return { problem: 'evidence segment rejected (span): byteStart and byteEnd name the cited bytes [byteStart, byteEnd) — integers, 0 ≤ byteStart < byteEnd' };
  if (e - s > SEGMENT_MAX_BYTES) return { problem: `evidence segment rejected (oversize): a cited span is at most ${SEGMENT_MAX_BYTES} bytes (asked ${e - s}); the whole object is the governed download` };
  const c = p['context'] === undefined || p['context'] === null ? 0 : p['context'];
  if (!int(c) || c < 0 || c > SEGMENT_MAX_CONTEXT) return { problem: `evidence segment rejected (context): context is 0 to ${SEGMENT_MAX_CONTEXT} bytes either side of the span` };
  return { version: version as number | null, byteStart: s, byteEnd: e, context: c };
}

/** The window served for a span within `length` bytes, or null when the span does not lie within them. */
export function segmentWindow(r: SegmentRequest, length: number): SegmentWindow | null {
  if (r.byteEnd > length) return null;
  const start = Math.max(0, r.byteStart - r.context);
  const end = Math.min(length, r.byteEnd + r.context);
  return { cited: { start: r.byteStart, end: r.byteEnd }, served: { start, end }, highlight: { start: r.byteStart - start, end: r.byteEnd - start } };
}
