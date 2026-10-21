/**
 * @eye/connector-sdk 1.0.0 — the declarations of the published connector SDK (CP-6 B40 §CR). See index.js for the contract in words.
 * The connector contract below is the one the API's first-party connectors implement (apps/api src/observation/connectors/sdk.ts carries
 * the same shapes with the API's own extensions; a type-level conformance check in apps/api holds the two together).
 */

export declare const SDK_NAME: '@eye/connector-sdk';
export declare const SDK_VERSION: string;
export declare const CELL_PROTOCOL: 'eye-cell/1';
export type ConnectorKind = 'upload' | 'rss' | 'rest' | 'adapter';
export declare const CONNECTOR_KINDS: readonly ConnectorKind[];
export declare const FIRST_PARTY_CONNECTOR_KINDS: readonly Exclude<ConnectorKind, 'adapter'>[];
export declare const CELL_LIMITS: Readonly<{
  maxItems: number; maxItemBytes: number; maxItemKeyChars: number; maxLogLines: number; maxLogChars: number; maxErrorChars: number;
}>;
export declare const GATEWAY_PATH: '/v1/fetch';
export declare const GATEWAY_TOKEN_HEADER: 'x-eye-cell-token';
export declare const FRAME_TYPES: readonly ['hello', 'item', 'log', 'done', 'error'];

/* ── the connector contract (transport framing and safety validation only — no semantic interpretation) ───────────────────────────── */
export interface RunBudgets {
  maxRequestsPerRun: number; maxBytesPerRun: number; maxConcurrency: number; timeoutMs: number; maxRetries: number; costUnits?: number;
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
/** One framed item: the platform's lifecycle admits it (or quarantines it) — never the connector. */
export interface AcquiredItem {
  itemKey: string;
  bytes: Uint8Array;
  declaredMediaType: string | null;
  filename: string;
  publisherTime: string | null;
  publisherTimeValue?: unknown;
  transport: TransportEvidence;
  parentItemKey?: string | null;
  fragment?: { byteStart: number; byteEnd: number; methodRef: string } | null;
  deterministic?: boolean;
  pollKey?: string;
  backfillCursor?: string | number;
  checkpointAfter?: Record<string, unknown>;
}
export interface AcquisitionOutput {
  items: AcquiredItem[];
  checkpoint: Record<string, unknown>;
  bytesTransferred: number;
  requestsMade: number;
  parent?: AcquiredItem | null;
}
/** What a connector is given for one run (the API's own context carries more: the binding's egress policy, the replay root, the budget meter). */
export interface AcquisitionContextBase {
  checkpoint: Record<string, unknown> | null;
  /** Called before every request: resolves when it may go, throws to refuse it (the platform's per-source rate). */
  throttle?: (request: { endpoint: string }) => Promise<void>;
}
/** The contract every connector implements. */
export interface Connector {
  readonly kind: ConnectorKind;
  readonly name: string;
  readonly version: string;
  /** Stable digest of the connector's own framing behaviour, recorded on every run. */
  readonly codeDigest: string;
  acquire(ctx: AcquisitionContextBase): Promise<AcquisitionOutput>;
}

/* ── the adapter (runs in a cell) ─────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface AdapterManifest {
  name: string;
  version: string;
  entry: string;
  author: string;
  declared_destinations: string[];
  purposes: string[];
  data_classes: string[];
  protocol: 'eye-cell/1';
  [k: string]: unknown;
}
export interface GatewayAnswer { status: number; headers: Record<string, string>; body: Uint8Array }
export interface GatewayFetchInit {
  method?: 'GET';
  headers?: { accept?: string };
  /** The purpose of this request (default: the package's first); refused when the package or the contract does not name it. */
  purpose?: string;
  /** The data class of what this request collects (default: the package's first); refused when the package does not declare it. */
  dataClass?: string;
}
export type GatewayFetch = (url: string, init?: GatewayFetchInit) => Promise<GatewayAnswer>;
export interface AdapterItem { itemKey: string; bytes: Uint8Array; mediaType?: string | null; filename?: string | null; publisherTime?: string | null }
/** The frozen context an adapter's `acquire(ctx)` receives inside its cell. */
export interface AdapterContext {
  readonly protocol: 'eye-cell/1';
  readonly sdkVersion: string;
  /** The checkpoint the platform holds for the source (what the last committed run returned), or null. */
  readonly cursor: Record<string, unknown> | null;
  readonly purpose: string | null;
  readonly gatewayFetch: GatewayFetch;
  emit(item: AdapterItem): void;
  log(text: string): void;
}
/** An adapter module: `export async function acquire(ctx)`; it may return the checkpoint the next run continues from. */
export interface AdapterModule {
  acquire(ctx: AdapterContext): Promise<void | { checkpoint?: Record<string, unknown> | null }>;
}

/* ── the cell protocol eye-cell/1 ─────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface CellStartFrame {
  protocol: 'eye-cell/1';
  sdk: string;
  run: { source_key: string; contract_version: number; purpose: string | null };
  gateway: { url: string; token: string };
  package: { dir: string; entry: string; name: string; version: string };
  checkpoint: Record<string, unknown> | null;
}
export type CellFrame =
  | { t: 'hello'; protocol: 'eye-cell/1'; sdk: string | null; package: { name: string; version: string } }
  | { t: 'item'; itemKey: string; bytes: Buffer; sha256: string; mediaType: string | null; publisherTime: string | null; filename: string | null }
  | { t: 'log'; msg: string }
  | { t: 'done'; checkpoint: Record<string, unknown> | null }
  | { t: 'error'; class: string; refusalClass: string | null; message: string };

export declare class GatewayRefused extends Error {
  readonly refusalClass: string;
  constructor(refusalClass: string, message: string);
}
export declare function sha256Hex(bytes: Uint8Array | string): string;
export declare function packageDigest(files: ReadonlyArray<{ file: string; sha256: string }>): string;
export declare function validateAdapterManifest(m: unknown, fileNames?: readonly string[] | null): { ok: boolean; problems: string[] };
export declare function isPackageFileName(name: unknown): boolean;
export declare function encodeFrame(frame: Record<string, unknown>): string;
export declare function validateFrame(x: unknown): { frame: CellFrame; problem?: undefined } | { problem: string; frame?: undefined };
export declare function parseFrames(text: string): { frames: CellFrame[]; problems: string[] };
export declare function createGatewayFetch(gateway: { url: string; token: string; timeoutMs?: number }): GatewayFetch;
