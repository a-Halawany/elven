/**
 * CP-6 B40 §0 — THE INTAKE SEAM'S TYPES (MAP §3 §0 item 2; the composition is intake-stages.ts — kept apart so a stage file imports
 * these without a cycle). Four stages the acquisition lifecycle calls at its existing points, each implemented
 * by ONE part in its OWN file so the lifecycle (the 2,000-line hotspot) is edited once, here, by the prelude:
 *
 *   authorize     §AP  stages/authorize-ap.ts     once per run, at the PRE-EGRESS revalidation (step 3; the stream form's too) — the run's
 *                                                acquisition authorization (contract version, purpose, rights + terms in force, credential
 *                                                reference, rate, residency, window, robots); a refusal cancels the run BEFORE any request
 *   throttle      §AP  stages/throttle-ap.ts      before EVERY request a connector makes (AcquisitionContext.throttle, called next to the
 *                                                budget meter) — the per-source token bucket; §CR's gateway calls the same stage
 *   inspect       §IN  stages/inspect-in.ts       after fetch, beside the heuristic content verdict (step 7) — the inspection engines in
 *                                                their sandbox; a quarantine decision quarantines the item with its reason class
 *   authenticate  §VA  stages/authenticate-va.ts  after inspection passes, BEFORE admission (before step 8a) — the publisher signature
 *                                                against the keys in force; FAILED is admitted marked (D6), an UNKNOWN signer quarantined
 *
 * and two RECORD hooks inside the existing transactions (the admission's 8c–8e, the quarantine case's), where the stage that decided
 * writes its side-ledger row next to the record it describes (§IN's verdicts, §VA's authenticity outcome).
 *
 * THE PRELUDE'S IMPLEMENTATIONS ARE PASS-THROUGH: authorize proceeds with no authorization, throttle proceeds at once, inspect passes with
 * no finding, authenticate is `not_evaluated` (the evidence payload's content_authenticity stays `unknown`, exactly as before), and the
 * record hooks write nothing — the lifecycle behaves exactly as it did for every contract. A part replaces ITS file's body; the interface,
 * the call sites and the composition below are the prelude's (a change to them is the integrator's, at the fold).
 *
 * D7 / D8: the stages act on SRC@v4 contracts (`ctx.v4`); a v1–v3 contract keeps its recorded behaviour — a part's stage returns the
 * pass-through answer for it (the DEF-03 PDF stays admitted under its v3 rule). Every stage fails CLOSED: a stage that cannot decide
 * (its engine unavailable, its store down) answers refuse / quarantine with its reason, never proceed.
 */
import type { AcquiredItem } from '../connectors/sdk.js';
import type { ContentVerdict } from '../connectors/content-controls.js';
import type { AcquisitionWrites } from '../observation.capabilities.js';

/** What every stage is told about the run it serves. Built by the lifecycle from the contract row it already holds; never client-supplied. */
export interface IntakeStageContext {
  form: 'command' | 'stream';
  tenantId: string;
  domainId: string;
  sourceId: string;
  contractVersion: number;
  runId: string;
  purposeId: string;
  correlationId: string;
  /** The contract row as the lifecycle read it at the revalidation (its document under `contract`). */
  contract: {
    source_key: string; connector_kind: string; acquisition_mode: 'replay' | 'live'; lifecycle_state: string; rights_state: string;
    classification_ceiling: string; residency: string; purposes: string[]; endpoints: string[]; contract: Record<string, unknown>;
  };
  /** True for an SRC@v4 contract (it carries the v4 blocks). A v1–v3 contract passes through every stage unchanged (D8). */
  v4: boolean;
}

/* ── authorize (§AP) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The incomplete-range / refusal classes an authorization may name (0123 §0 widened acquisition_incomplete_ranges.reason_class). */
export type AuthorizeRefusalClass = 'rights' | 'licence' | 'residency_refused' | 'window_closed' | 'robots_disallowed' | 'policy' | 'unavailable';
export type AuthorizeDecision =
  /** The run may go out. `authorizationId` names the recorded authorization the run cites (null: none recorded — v1–v3 / the prelude). */
  | { kind: 'proceed'; authorizationId: string | null }
  /** The run is cancelled BEFORE any request; the reason goes on run.cancelled and (stream form) on the interrupt's range. */
  | { kind: 'refuse'; reasonClass: AuthorizeRefusalClass; reason: string; authorizationId: string | null };
export interface AuthorizeStage {
  authorize(ctx: IntakeStageContext): Promise<AuthorizeDecision>;
}

/* ── throttle (§AP; §CR's gateway calls it too) ──────────────────────────────────────────────────────────────────────────────────── */
export interface ThrottleRequest {
  /** The URL about to be requested (a replay request too: the bucket is the contract's, whatever serves the bytes). */
  endpoint: string;
}
export type ThrottleDecision =
  /** Go now (the stage may have waited for a token before answering). */
  | { kind: 'proceed' }
  /** Do not send this request: the run fails it with the class (`rate_limited` → an incomplete range, the contract's backoff). */
  | { kind: 'refuse'; reasonClass: 'rate_limited' | 'unavailable'; reason: string; retryAfterSeconds?: number };
export interface ThrottleStage {
  throttle(ctx: IntakeStageContext, request: ThrottleRequest): Promise<ThrottleDecision>;
}

/* ── inspect (§IN) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The quarantine reason classes 0123 §0 adds to quarantine_current.reason_class (beside the historic ones). A scan that is not `clean`
 *  quarantines with the class of its outcome: detected → malware_verdict, unavailable → inspection_unavailable, failed → inspection_failed,
 *  incomplete → inspection_incomplete (DESIGN D2: an unavailable, failed or incomplete scan is NEVER a clean verdict). */
export type IntakeQuarantineClass =
  | 'active_content' | 'macro' | 'embedded_file' | 'hidden_instruction' | 'malware_verdict' | 'inspection_unavailable' | 'inspection_failed'
  | 'inspection_incomplete' | 'duplicate' | 'quality' | 'rights' | 'policy_prohibited' | 'residency_conflict' | 'destination_identity_changed'
  | 'unknown_signer' | 'response_anomaly';

/**
 * THE SCAN OUTCOME of one engine on one item (DESIGN D2; 0123 §0's domain observation.inspection_outcome). ONLY `clean` admits; every other
 * outcome fails closed → quarantine with its class. `incomplete` = the engine answered for part of the item only (a size / depth / archive
 * limit, a truncated stream); `failed` = the engine answered with an error; `unavailable` = the engine could not be reached or did not answer
 * in time (a sandbox timeout, a clamd connection refused).
 */
export const INSPECTION_OUTCOMES = ['clean', 'detected', 'unavailable', 'failed', 'incomplete'] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];
/** The quarantine class of a non-clean outcome (null for clean: it admits). */
export const QUARANTINE_CLASS_OF_OUTCOME: Readonly<Record<InspectionOutcome, IntakeQuarantineClass | null>> = Object.freeze({
  clean: null, detected: 'malware_verdict', unavailable: 'inspection_unavailable', failed: 'inspection_failed', incomplete: 'inspection_incomplete',
});

/**
 * THE ENGINE'S IDENTITY on every verdict (DESIGN D2) — which engine, which build, which signatures said it. For engine 1 (the sandboxed
 * content inspector) the rule set's digest; for engine 2 (ClamAV over clamd) the image digest the engine runs from, the engine version clamd
 * reports, and the SIGNATURE DATABASE identity: each database (main, daily, bytecode …) with its version, build time and digest.
 * Nothing here is inferred: an identity the engine did not report is null and the verdict says so.
 */
export interface EngineIdentity {
  /** `content-inspector` (engine 1) | `clamav` (engine 2) | a later engine's name. */
  engine: string;
  engineVersion: string | null;
  /** The OCI image digest (sha256:…) the engine runs from; null for an in-process / sandboxed-script engine. */
  imageDigest: string | null;
  /** Engine 1: the digest of its rule set. Engine 2: null (its rules are the signature databases). */
  ruleSetDigest: string | null;
  /** Engine 2: the signature databases in force at the scan; [] for an engine without one. */
  signatureDatabases: Array<{ name: string; version: string | null; buildTime: string | null; digest: string | null }>;
}
/** One engine's verdict on one item: its identity, its outcome and its findings. */
export interface EngineVerdict {
  identity: EngineIdentity;
  outcome: InspectionOutcome;
  findings: InspectionFinding[];
  /** When the engine was asked and when it answered (or the launcher gave up). */
  startedAt: string;
  finishedAt: string;
  /** For a non-clean outcome other than `detected`: why (a timeout, a refused connection, an engine error) — never content. */
  detail?: string;
}
export interface InspectInput {
  item: AcquiredItem;
  /** The bytes as stored in the quarantine volume (steps 5–6): the locator the sandbox reads, the verified digest. */
  stored: { locator: string; contentDigest: string; byteLength: number };
  /** The existing heuristic verdict (content-controls.ts), already computed; the stage never weakens it (an item it refused stays refused). */
  heuristic: ContentVerdict;
}
/** One finding of one engine — a code (a rule id, a signature name), offsets and classes, NEVER content (D9). */
export interface InspectionFinding { code: string; offset?: number; length?: number; detail?: string }
export type InspectDecision =
  /** Every engine the contract requires answered `clean` (the prelude: no engine ran — `verdicts` is empty and nothing is recorded). */
  | { kind: 'pass'; verdicts: EngineVerdict[] }
  /** At least one engine answered other than `clean`, or a content rule (active content, macros, embedded files, hidden instructions) applies. */
  | { kind: 'quarantine'; reasonClass: IntakeQuarantineClass; reason: string; verdicts: EngineVerdict[] };
export interface InspectStage {
  inspect(ctx: IntakeStageContext, input: InspectInput): Promise<InspectDecision>;
  /** Inside the admission transaction (the item was admitted) or the quarantine transaction (it was not): record every engine's verdict WITH its identity. */
  record(cap: AcquisitionWrites, ctx: IntakeStageContext, at: IntakeRecordPoint, decision: InspectDecision): Promise<void>;
}

/* ── authenticate (§VA) ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface AuthenticateInput {
  item: AcquiredItem;
  stored: { locator: string; contentDigest: string; byteLength: number };
}
/** The four outcomes §VA records per EVD version (its side ledger); the EVD@v1 payload field keeps its own enum (verified | unknown | not_applicable). */
export type AuthenticityOutcome = 'verified' | 'failed' | 'unsigned' | 'unavailable';
export type AuthenticityDecision =
  /** Not evaluated (v1–v3, the prelude): the payload's content_authenticity is `unknown`, exactly as before. */
  | { kind: 'not_evaluated' }
  /** Admit, with the outcome for the side ledger and the EVD@v1 payload value (`verified` only for verified; `unknown` otherwise). FAILED is admitted marked (D6). */
  | { kind: 'admit'; outcome: AuthenticityOutcome; payloadContentAuthenticity: 'verified' | 'unknown' | 'not_applicable'; detail: Record<string, unknown> }
  /** An UNKNOWN signer (no anchor in force) is quarantined (D6, the B16 rule). */
  | { kind: 'quarantine'; reasonClass: 'unknown_signer'; reason: string; detail: Record<string, unknown> };
export interface AuthenticateStage {
  authenticate(ctx: IntakeStageContext, input: AuthenticateInput): Promise<AuthenticityDecision>;
  record(cap: AcquisitionWrites, ctx: IntakeStageContext, at: IntakeRecordPoint, decision: AuthenticityDecision): Promise<void>;
}

/** Where a record hook runs: inside the admission (the EVD version written) or inside the quarantine case's opening. */
export type IntakeRecordPoint =
  | { kind: 'admitted'; evdObjectId: string; evdVersion: number; manifestId: string; contentDigest: string; itemKey: string }
  | { kind: 'quarantined'; caseId: string; manifestId: string; contentDigest: string; itemKey: string };

/** A refusal a stage raised inside a connector (the throttle hook): the run records it with its class and fails closed. */
export class IntakeStageRefused extends Error {
  constructor(readonly stage: 'authorize' | 'throttle' | 'inspect' | 'authenticate', readonly reasonClass: string, message: string,
              readonly retryAfterSeconds?: number) {
    super(message);
  }
}

