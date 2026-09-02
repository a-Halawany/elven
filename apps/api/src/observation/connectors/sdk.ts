/**
 * Connector adapter SDK — PHASE1_PLAN §12 (P1-M3), ADR-P1-07.
 *
 * A connector performs TRANSPORT FRAMING AND SAFETY VALIDATION ONLY. There is no
 * hook here for interpreting what an item means: no field mapping, no entity
 * extraction, no normalisation of values. Semantic interpretation is Phase 2, and
 * the absence of a place to put it is the enforcement.
 *
 * Every item a connector yields carries `methodRef` — the exact framing method
 * and version that produced it — so an item can always be attributed to the code
 * that framed it, and a later framing change is visible as a different lineage
 * rather than as silently different data.
 */
import type { EgressPolicy } from './http-client.js';

export type ConnectorKind = 'upload' | 'rss' | 'rest';

/** The budgets a run may not exceed (§11). Breach stops the run and escalates. */
export interface RunBudgets {
  maxRequestsPerRun: number;
  maxBytesPerRun: number;
  maxConcurrency: number;
  timeoutMs: number;
  maxRetries: number;
  costUnits?: number;
}

export interface SourceBinding {
  sourceId: string;
  sourceKey: string;
  contractVersion: number;
  acquisitionMode: 'replay' | 'live';
  authorityClass: 'authoritative' | 'observational';
  endpoints: string[];
  expectedSchema: {
    mediaTypes: string[];
    requiredFields: string[];
    driftTolerance: number;
    maxBytes?: number;
  };
  budgets: RunBudgets;
  egress: EgressPolicy;
}

/** Transport evidence retained for an acquired item. No semantic field exists. */
export interface TransportEvidence {
  connector: string;
  connectorVersion: string;
  methodRef: string;
  endpoint: string | null;
  httpStatus: number | null;
  retainedHeaders: Record<string, string>;
  tlsVerified: boolean | null;
  originAllowlisted: boolean | null;
  pinnedAddress?: string | null;
  redirectHops?: Array<{ urlRedacted: string; status: number; credentialsCarried: boolean }>;
}

export interface AcquiredItem {
  /** Natural key WITHIN the source. Part of the §5.12 attempt key. */
  itemKey: string;
  bytes: Uint8Array;
  declaredMediaType: string | null;
  filename: string;
  /** The publisher's own time for the item, when it publishes one. Never invented. */
  publisherTime: string | null;
  transport: TransportEvidence;
  /** For per-item framing of a parent payload (§10.1). */
  parentItemKey?: string | null;
  fragment?: { byteStart: number; byteEnd: number; methodRef: string } | null;
}

export interface AcquisitionOutput {
  items: AcquiredItem[];
  /** Opaque connector checkpoint; advanced only AFTER the DB commit (§5 step 9). */
  checkpoint: Record<string, unknown>;
  /** Bytes actually moved, for budget accounting. */
  bytesTransferred: number;
  requestsMade: number;
  /** A raw parent payload preserved as its own EVD when the connector frames items out of it. */
  parent?: AcquiredItem | null;
}

export interface AcquisitionContext {
  binding: SourceBinding;
  checkpoint: Record<string, unknown> | null;
  /** Consumed as the run proceeds; a connector must respect it, not merely report it. */
  budget: BudgetMeter;
  /** Replay fixture root; used only when the contract's acquisition_mode is `replay`. */
  replayRoot: string;
}

export class BudgetExceeded extends Error {
  constructor(readonly resource: 'requests' | 'bytes' | 'time', message: string) {
    super(message);
  }
}

/**
 * Budgets that are ACTUALLY ENFORCED rather than reported. Every connector calls
 * `spendRequest` / `spendBytes` before doing the thing, so a breach stops the run
 * at the boundary instead of being noticed afterwards.
 */
export class BudgetMeter {
  private requests = 0;
  private bytes = 0;
  private readonly startedAt = Date.now();

  constructor(private readonly budgets: RunBudgets) {}

  spendRequest(): void {
    this.requests += 1;
    if (this.requests > this.budgets.maxRequestsPerRun) {
      throw new BudgetExceeded('requests', `run exceeded its ${this.budgets.maxRequestsPerRun}-request budget`);
    }
    if (Date.now() - this.startedAt > this.budgets.timeoutMs) {
      throw new BudgetExceeded('time', `run exceeded its ${this.budgets.timeoutMs}ms budget`);
    }
  }

  spendBytes(n: number): void {
    this.bytes += n;
    if (this.bytes > this.budgets.maxBytesPerRun) {
      throw new BudgetExceeded('bytes', `run exceeded its ${this.budgets.maxBytesPerRun}-byte budget`);
    }
  }

  get spent(): { requests: number; bytes: number; elapsedMs: number } {
    return { requests: this.requests, bytes: this.bytes, elapsedMs: Date.now() - this.startedAt };
  }
}

export interface Connector {
  readonly kind: ConnectorKind;
  readonly name: string;
  readonly version: string;
  /** Stable digest of the connector's own framing behaviour, recorded on every run. */
  readonly codeDigest: string;
  acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput>;
}

/**
 * Schema-drift check against the contract's declared expectations (§7). Drift
 * beyond the declared tolerance QUARANTINES; it never admits-and-flags, because a
 * silently admitted gap becomes a fact.
 */
export function checkSchemaDrift(
  parsed: unknown,
  expected: SourceBinding['expectedSchema'],
): { ok: true } | { ok: false; missing: string[]; reason: string } {
  if (expected.requiredFields.length === 0) return { ok: true };
  const missing: string[] = [];
  for (const field of expected.requiredFields) {
    if (!hasPath(parsed, field)) missing.push(field);
  }
  if (missing.length > expected.driftTolerance) {
    return {
      ok: false,
      missing,
      reason: `required field${missing.length > 1 ? 's' : ''} ${missing.map((m) => `\`${m}\``).join(', ')} absent (contract tolerance ${expected.driftTolerance})`,
    };
  }
  return { ok: true };
}

/** Dotted path presence, with `[]` meaning "present in every element of an array". */
function hasPath(value: unknown, path: string): boolean {
  const parts = path.split('.');
  let cursor: unknown = value;
  for (const part of parts) {
    if (part === '[]') {
      if (!Array.isArray(cursor)) return false;
      const rest = parts.slice(parts.indexOf(part) + 1).join('.');
      return cursor.length > 0 && cursor.every((c) => (rest === '' ? true : hasPath(c, rest)));
    }
    if (cursor === null || typeof cursor !== 'object') return false;
    if (Array.isArray(cursor)) {
      return cursor.length > 0 && cursor.every((c) => hasPath(c, parts.slice(parts.indexOf(part)).join('.')));
    }
    if (!(part in (cursor as Record<string, unknown>))) return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return true;
}
