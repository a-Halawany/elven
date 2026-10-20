/**
 * Frozen replay responder — REPLAY_DATA_MANIFEST §4.
 *
 * "Serve replay from a local fixture responder honouring the same source
 * contract, so the connector under test is the connector that ships."
 *
 * That is the whole design constraint. This module answers a connector's request
 * with the recorded response — status, retained headers, body bytes, retrieval
 * instant — so the REST and RSS connectors take the identical code path whether
 * the bytes come from the network or from the frozen set. There is no
 * `if (replay)` branch inside a connector.
 *
 * A fixture whose bytes do not match its recorded digest FAILS CLOSED. The demo
 * script says to stop on a digest mismatch rather than narrate past it; this is
 * where that stop actually happens.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ReplayEntry {
  /** The URL this response was captured from, exactly as requested. */
  url: string;
  retrieved_at: string;
  status: number;
  retained_headers: Record<string, string>;
  file: string;
  sha256: string;
  byte_length: number;
  acquisition_mode: 'replay';
  /** Present when the manifest deliberately plants a defect (REPLAY_DATA_MANIFEST §3). */
  planted_defect?: string;
  /* B40 ap */
  /**
   * OPTIONAL: the ORDER in which several recorded answers to ONE url are served (CP-6 B40 §AP, DESIGN D10 — the port-authority set answers
   * 429 + Retry-After, 429 + Retry-After, then 200). The nth request for the url in this process is served the entry of the nth attempt;
   * past the last, the last is served again. A url recorded once, and every entry without `attempt`, reads exactly as before.
   */
  attempt?: number;
  /* end B40 ap */
}

export interface ReplayManifest {
  set: string;
  source_key: string;
  captured_by: string;
  manifest_version: string;
  entries: ReplayEntry[];
  /* B23 (0084) stream */
  /**
   * OPTIONAL: the set's pages as STREAM PARTITIONS (L1-I02's stream form over replay). Each partition declares its range and
   * its ORDERED pages; a page names the entry that serves it (by URL — the entry's digest is verified on every read, as for
   * any replay read) or declares a planted PUBLISHER GAP, which the stream reports as an explicit incomplete range. A set
   * without this block is exactly what it was.
   */
  stream?: { partitions: Record<string, ReplayStreamPartition> };
  /* end B23 stream */
}

/* B23 (0084) stream */
export interface ReplayStreamPartition {
  label?: string;
  range: { from: string; to: string };
  pages: Array<{ from: string; to: string; url?: string; gap?: string }>;
}
/* end B23 stream */

export class ReplayIntegrityError extends Error {
  constructor(readonly entry: string, message: string) {
    super(message);
  }
}

export class ReplayResponder {
  private readonly cache = new Map<string, ReplayManifest>();

  constructor(private readonly root: string) {}

  async manifest(set: string): Promise<ReplayManifest> {
    const cached = this.cache.get(set);
    if (cached !== undefined) return cached;
    const path = join(resolve(this.root), set, 'MANIFEST.json');
    const parsed = JSON.parse(await readFile(path, 'utf8')) as ReplayManifest;
    this.cache.set(set, parsed);
    return parsed;
  }

  /**
   * Fetch a recorded response. The digest is verified on EVERY read: a fixture
   * that has drifted from its manifest is an integrity failure, not a warning.
   */
  async fetch(set: string, url: string): Promise<{ entry: ReplayEntry; body: Buffer } | null> {
    const manifest = await this.manifest(set);
    /* B40 ap: attempt-ordered answers (a url recorded with `attempt`) — otherwise the first entry, exactly as before */
    const ordered = manifest.entries.filter((e) => e.url === url && typeof e.attempt === 'number').sort((a, b) => (a.attempt as number) - (b.attempt as number));
    const entry = ordered.length > 0 ? ordered[Math.min(nextAttempt(this.root, set, url), ordered.length) - 1] : manifest.entries.find((e) => e.url === url);
    /* end B40 ap */
    if (entry === undefined) return null;
    const body = await readFile(join(resolve(this.root), set, entry.file));
    const digest = createHash('sha256').update(body).digest('hex');
    if (digest !== entry.sha256) {
      throw new ReplayIntegrityError(entry.file, 'replay fixture does not match its recorded digest');
    }
    if (body.byteLength !== entry.byte_length) {
      throw new ReplayIntegrityError(entry.file, 'replay fixture byte length does not match its manifest');
    }
    return { entry, body };
  }

  /** Every entry in a set, for connectors that enumerate rather than address. */
  async all(set: string): Promise<Array<{ entry: ReplayEntry; body: Buffer }>> {
    const manifest = await this.manifest(set);
    const out: Array<{ entry: ReplayEntry; body: Buffer }> = [];
    for (const entry of manifest.entries) {
      /* B40 ap: an attempt-ordered url is enumerated once (as one request: the answer of its next attempt) */
      if (typeof entry.attempt === 'number' && manifest.entries.some((e) => e.url === entry.url && typeof e.attempt === 'number' && e.attempt < (entry.attempt as number))) continue;
      /* end B40 ap */
      const got = await this.fetch(set, entry.url);
      if (got !== null) out.push(got);
    }
    return out;
  }
}

/* B40 ap — the attempt counter of attempt-ordered urls, per process (replay root, set, url). */
const attempts = new Map<string, number>();
function nextAttempt(root: string, set: string, url: string): number {
  const key = `${resolve(root)}\u0000${set}\u0000${url}`;
  const n = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, n);
  return n;
}
/** TEST CONTROL ONLY: start every attempt-ordered url from its first answer again (a harness case that replays the throttled set afresh). */
export function resetReplayAttemptsForTests(): void { attempts.clear(); }
/* end B40 ap */
