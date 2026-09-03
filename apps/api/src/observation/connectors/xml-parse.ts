/**
 * Bounded XML/feed parsing — PHASE1_PLAN §8.3, acceptance A10.
 *
 * The parser runs in a dedicated worker thread with a wall-clock budget and a
 * heap ceiling. On breach the worker is TERMINATED and the item is quarantined —
 * never retried in-process, never partially trusted.
 *
 * The thread is RESOURCE isolation, not a security sandbox (see xml-worker.js).
 */
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import * as fault from '../fault-injection.js';

export interface ParserLimits {
  maxBytes: number;
  maxDepth: number;
  timeoutMs: number;
  maxOldGenerationSizeMb: number;
}

export const DEFAULT_PARSER_LIMITS: ParserLimits = {
  maxBytes: 16 * 1024 * 1024,
  maxDepth: 64,
  timeoutMs: 5000,
  maxOldGenerationSizeMb: 128,
};

/**
 * The EXACT pinned parser version, re-resolved at implementation start under
 * ADR-P0-01 (the plan pinned 5.10.1; 5.11.1 is the current patched release) and
 * recorded in the lockfile. It is carried on every framed item as method lineage,
 * so an item's framing can always be attributed to the code that produced it.
 */
export const PARSER_VERSION = '5.11.1';
export const RSS_METHOD_REF = `rss-framing@${PARSER_VERSION}`;

export type ParseFailureClass = 'budget_bytes' | 'budget_depth' | 'budget_time' | 'malformed';

export type ParseOutcome =
  | { ok: true; value: Record<string, unknown>; depth: number }
  | { ok: false; reason: string; class: ParseFailureClass };

/**
 * The worker file sits beside this module in the source tree; the build copies it
 * next to the emitted module. `__dirname` resolves both because this package
 * emits CommonJS. If the emitted tree has not had the worker copied into it, we
 * fall back to the source location rather than failing at the first feed.
 */
function workerPath(): string {
  const local = join(__dirname, 'xml-worker.js');
  if (existsSync(local)) return local;
  return join(__dirname.replace(`${sep}dist${sep}`, `${sep}src${sep}`), 'xml-worker.js');
}

export async function parseXmlBounded(
  xml: string,
  limits: ParserLimits = DEFAULT_PARSER_LIMITS,
): Promise<ParseOutcome> {
  fault.at('f16.during_validation');
  if (xml.length > limits.maxBytes) {
    return { ok: false, reason: 'input exceeds the parser byte budget', class: 'budget_bytes' };
  }
  return new Promise<ParseOutcome>((resolve) => {
    let settled = false;
    const worker = new Worker(workerPath(), {
      workerData: { xml, limits },
      resourceLimits: {
        maxOldGenerationSizeMb: limits.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: 32,
      },
    });
    const done = (r: ParseOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => {
      // KILL ON BUDGET BREACH. The caller quarantines the item; it is never handed
      // back half-parsed.
      done({ ok: false, reason: 'parsing exceeded the wall-clock budget and the worker was terminated', class: 'budget_time' });
    }, limits.timeoutMs);

    worker.on('message', (m: { ok: boolean; value?: Record<string, unknown>; depth?: number; reason?: string }) => {
      if (m.ok) {
        done({ ok: true, value: m.value ?? {}, depth: m.depth ?? 0 });
        return;
      }
      const reason = m.reason ?? 'xml rejected';
      done({
        ok: false,
        reason,
        class: reason.includes('depth') ? 'budget_depth' : reason.includes('byte') ? 'budget_bytes' : 'malformed',
      });
    });
    worker.on('error', () => done({ ok: false, reason: 'parser worker failed', class: 'malformed' }));
    // A worker killed by its own heap ceiling exits non-zero without a message.
    worker.on('exit', (code) => {
      if (!settled) {
        done({ ok: false, reason: `parser worker exited (${code}) within its resource limits`, class: 'budget_time' });
      }
    });
  });
}
