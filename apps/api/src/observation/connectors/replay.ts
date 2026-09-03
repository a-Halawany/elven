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
}

export interface ReplayManifest {
  set: string;
  source_key: string;
  captured_by: string;
  manifest_version: string;
  entries: ReplayEntry[];
}

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
    const entry = manifest.entries.find((e) => e.url === url);
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
      const got = await this.fetch(set, entry.url);
      if (got !== null) out.push(got);
    }
    return out;
  }
}
