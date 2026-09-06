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
  /** The frozen replay set to read from; the contract's declaration, or its key. */
  replaySet: string;
  contractVersion: number;
  acquisitionMode: 'replay' | 'live';
  authorityClass: 'authoritative' | 'observational';
  endpoints: string[];
  expectedSchema: {
    mediaTypes: string[];
    requiredFields: string[];
    driftTolerance: number;
    maxBytes?: number;
    /** Contract-declared transport framing. See SourceContractV1 for the rule. */
    itemPath?: string;
    itemKeyField?: string;
    itemTimeField?: string;
  };
  budgets: RunBudgets;
  egress: EgressPolicy;
  /**
   * A CLOSED-RANGE BACKFILL, declared by the contract (Phase 4 §4a).
   *
   * The poller Phase 1 shipped polls FORWARD from a checkpoint and has no end
   * condition. A historical backfill walks a closed `[from, to)` window in
   * deterministic pages and terminates. Declaring it on the contract — the
   * strategy, the window, the ordering — is what makes the traversal reviewable:
   * an ArcGIS page order is undefined without `orderByFields`, and a contract
   * that does not say how it pages has not said what it collects.
   */
  backfill?: BackfillDeclaration;
}

export type BackfillStrategy = 'period-range' | 'arcgis-offset';

export interface BackfillDeclaration {
  strategy: BackfillStrategy;
  /** The base URL range parameters are appended to. Its host must be one of the contract's endpoints'. */
  endpoint: string;
  /** Inclusive start date (YYYY-MM-DD). */
  from: string;
  /** Exclusive end date (YYYY-MM-DD), or null for "the day the run happens". */
  to: string | null;
  /** period-range: days per request window. */
  windowDays?: number;
  /** period-range: the query parameter names carrying the window. */
  startParam?: string;
  endParam?: string;
  /** arcgis-offset: rows per page (`resultRecordCount`), at most the service's maxRecordCount. */
  pageSize?: number;
  /** arcgis-offset: `orderByFields` — REQUIRED, because unordered paging can skip and duplicate rows. */
  orderBy?: string;
  /** arcgis-offset: the date field the window predicate is written against. */
  timeField?: string;
  /** arcgis-offset: the contract's static filter (e.g. `portid='chokepoint4'`), AND-ed with the window. */
  where?: string;
}

/**
 * Where a backfill stands, carried on the connector checkpoint and advanced only
 * after the database commits (§5 step 9). A run that starts with `done: true`
 * polls forward as before; one that starts with `done: false` continues the
 * backfill inside its own budget and stops when either is exhausted.
 */
export interface BackfillProgress {
  strategy: BackfillStrategy;
  from: string;
  to: string;
  /** The contract version the walk was made under. A NEW version walks again. */
  contractVersion: number;
  /** period-range: the next window's inclusive start. arcgis-offset: the next `resultOffset`. */
  cursor: string | number;
  done: boolean;
  requests: number;
  items: number;
  startedAt: string;
  finishedAt: string | null;
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
  /**
   * TRUE for an item whose key is DETERMINISTIC across runs — a backfill window
   * or a row inside one — rather than bound to the retrieval instant.
   *
   * A forward poll's item is a new observation every time, by design (§5.12). A
   * backfill window is not: retrieving 2019-01 again is the same window, and the
   * lifecycle compares its bytes with what it already holds — identical bytes are
   * an audited no-op, changed bytes are a REVISION admitted as the next version
   * of the same evidence object. Without this flag a re-run over an overlapping
   * range would admit duplicate evidence.
   */
  deterministic?: boolean;
  /**
   * For a backfilled window: the traversal cursor at which its window began, so
   * the lifecycle can roll the checkpoint back to a window it QUARANTINED rather
   * than let the cursor pass a window that was never collected.
   */
  backfillCursor?: string | number;
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
