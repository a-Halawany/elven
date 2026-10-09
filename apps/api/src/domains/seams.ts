/**
 * B33 (0111 §0.8) — THE SEAMS between the four parts, fixed by the prelude so the parts build in parallel.
 *
 *   §TW (twin)        the twin pieces — uses the ALERT vocabulary (TW7's items are raised and closed by the SQL helpers below).
 *   §SC (supply)      supply-chain intelligence — raises `supply.dependency` / `supply.disruption` through the SQL helper; reads ALERT.
 *   §PK (packages)    the package framework — owns the PORTS on the prelude's tables domain.packages / domain.package_versions; every
 *                     package-bound write consults PACKAGE_GATE; raises `domain.package` / `domain.alert`.
 *   §CI (competitor)  competitor intelligence — consults PACKAGE_GATE (the `competitor` package); raises `domain.alert`; implements the Domain
 *                     Intelligence Agent's scan and offers it through DomainScanBridge.
 *
 * Each token has a default registered by the prelude in domains.module.ts (`/* B33 seams *\/`): PACKAGE_GATE → SqlPackageGate (the SQL seam
 * domain.package_function_state, real from the start: with no package installed it answers not_installed); ALERT → SqlAlertReads (the routed
 * items as the helpers wrote them). The DOMAIN SCAN is a static bridge (the B30 ReconciliationBridge idiom: the executive's agents.service
 * imports this file; nothing here imports the executive) whose default is the NULL scan (reads nothing, proposes nothing, says so).
 *
 * THE WRITE SIDE OF ALERT IS SQL ONLY: executive.b33_raise_routed / executive.b33_close_items are internal (SECURITY DEFINER, REVOKE PUBLIC,
 * granted to no runtime role). A part raises or closes INSIDE its own definer port (or a trigger on its own table), never from TypeScript:
 *   executive.b33_raise_routed(p_tenant uuid, p_domain uuid, p_class text, p_subject_kind text, p_subject_id uuid, p_title text, p_reasons jsonb,
 *                              p_named_owner uuid, p_cause_event uuid, p_cause_type text, p_details jsonb, p_dims jsonb, p_actor uuid,
 *                              p_correlation uuid) RETURNS jsonb {item_id, state, outcome, owner, route_roles, policy_id, policy_version, due_at, existing}
 *   executive.b33_close_items(p_tenant uuid, p_domain uuid, p_class text /* NULL = every class *\/, p_subject_kind text /* NULL = any *\/,
 *                             p_subject_id uuid, p_reason text, p_actor uuid, p_correlation uuid) RETURNS jsonb  -- the closed item ids
 *
 * A part never imports another part's files — only this file (and the prelude's domain-intelligence-agent.ts, which §CI owns).
 * BOUNDARY (R7): package signing / publisher identity → B77; all-layer namespaces → B78; marketplace and purchase → B112; parity → B111.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import type { Tx } from '../shared/db.js';

export const PACKAGE_GATE = Symbol('B33_PACKAGE_GATE');
export const ALERT = Symbol('B33_ALERT');

// ── the vocabulary (0111 §0.2) ─────────────────────────────────────────────────────────────────────────────
export const B33_SIGNAL_CLASSES = ['supply.dependency', 'supply.disruption', 'domain.alert', 'domain.package'] as const;
export type B33SignalClass = typeof B33_SIGNAL_CLASSES[number];
export const B33_SUBJECT_KINDS = ['supply_inference', 'supply_disruption', 'domain_package', 'domain_assessment', 'competitor_profile', 'watchlist'] as const;
export type B33SubjectKind = typeof B33_SUBJECT_KINDS[number];
/** the package kinds of domain.packages.domain_kind */
export const DOMAIN_KINDS = ['competitor', 'supply_chain', 'geopolitical', 'technology', 'cyber', 'financial'] as const;
export type DomainKind = typeof DOMAIN_KINDS[number];

// ── PACKAGE_GATE (0111 §0.5) ───────────────────────────────────────────────────────────────────────────────
export type PackageFunctionStateName = 'active' | 'not_installed' | 'uncertified' | 'disabled' | 'conflicted';
export interface PackageFunctionState {
  state: PackageFunctionStateName;
  package_key: string;
  function: string | null;
  package_id: string | null;
  package_version: number | null;
  semver: string | null;
  reason: string;
}
export interface PackageGateQuery { tenantId: string; domainId: string; packageKey: string; fn: string | null }

/** The governed refusal a package-bound write answers when its function is not active: `<noun> rejected (package): <reason>` (422 by the
 *  parts' class rows — `package` is "the rest"). Thrown as a plain Error so the observation-errors mapping answers it like a port's text. */
export class PackageUnavailable extends Error {
  constructor(readonly noun: string, readonly answer: PackageFunctionState) { super(`${noun} rejected (package): ${answer.reason}`); }
}

export interface PackageGate {
  /** what the function may do now (the SQL seam, under the caller's transaction and RLS) */
  state(tx: Tx, q: PackageGateQuery): Promise<PackageFunctionState>;
  /** the state when `active`; otherwise throws PackageUnavailable(noun, state) */
  assertActive(tx: Tx, q: PackageGateQuery, noun: string): Promise<PackageFunctionState>;
}

/** The prelude's default — the real seam: domain.package_function_state(tenant, domain, package_key, function). */
@Injectable()
export class SqlPackageGate implements PackageGate {
  async state(tx: Tx, q: PackageGateQuery): Promise<PackageFunctionState> {
    const r = await sql<{ s: PackageFunctionState }>`select domain.package_function_state(${q.tenantId}::uuid, ${q.domainId}::uuid, ${q.packageKey}, ${q.fn}) as s`.execute(tx);
    return r.rows[0]!.s;
  }
  async assertActive(tx: Tx, q: PackageGateQuery, noun: string): Promise<PackageFunctionState> {
    const s = await this.state(tx, q);
    if (s.state !== 'active') throw new PackageUnavailable(noun, s);
    return s;
  }
}

// ── ALERT (0111 §0.5) — the READ side; the write side is the SQL helpers named above ──────────────────────
export interface RoutedItem {
  item_id: string; signal_class: string; subject_kind: string; subject_id: string; title: string; outcome: string; state: string;
  owner_principal_id: string | null; route_roles: string[]; policy_id: string | null; policy_version: number | null; due_at: unknown;
  details: Record<string, unknown>; created_at: unknown; closed_at: unknown; closed_by: string | null;
}
export interface AlertQuery { subjectKind: string; subjectId: string; signalClass?: string | null; includeClosed?: boolean }
export interface AlertReads {
  /** the items the helpers raised on one subject (newest first), as RLS lets the caller see them */
  items(tx: Tx, q: AlertQuery): Promise<RoutedItem[]>;
}
@Injectable()
export class SqlAlertReads implements AlertReads {
  async items(tx: Tx, q: AlertQuery): Promise<RoutedItem[]> {
    const r = await sql<RoutedItem>`select item_id::text, signal_class, subject_kind, subject_id::text, title, outcome, state, owner_principal_id::text, route_roles,
        policy_id::text, policy_version, due_at, details, created_at, closed_at, closed_by::text
      from executive.attention_items
     where subject_kind = ${q.subjectKind} and subject_id = ${q.subjectId}::uuid
       and (${q.signalClass ?? null}::text is null or signal_class = ${q.signalClass ?? null})
       and (${q.includeClosed === true} or state <> 'closed')
     order by created_at desc, item_id desc`.execute(tx);
    return r.rows;
  }
}

// ── THE DOMAIN SCAN (0111 §0.3: kind domain_intelligence, task domain_scan) — a static bridge, §CI offers its scan ─────────
type Row = Record<string, unknown>;
export interface DomainScanMeter { read(what: string): void; tick(what?: string): void }
export interface DomainScanRefusal { action: string; code: string; reason: string; at: string }
export interface DomainScanArgs {
  tenantId: string; domainId: string; agentId: string; runId: string; registration: { agent_version: string; code_digest: string };
  meter: DomainScanMeter; stops: Array<Record<string, unknown>>; refusals: DomainScanRefusal[]; correlationId: string; identity: Record<string, unknown>;
}
export interface DomainScanEnv {
  env(action: string, objectType: string, objectId: string | null): Envelope;
  route(action: string, objectType: string, objectId: string | null): { scope: 'DOMAIN'; tenantId: string; domainId: string; action: string; objectType: string; objectId: string | null };
}
export type DomainScanner = (deps: DomainScanEnv, p: AuthenticatedPrincipal, a: DomainScanArgs) => Promise<Row>;

/** The prelude's default: reads nothing, proposes nothing, and says so on the run (the run FINISHES — nothing was refused). */
export const nullDomainScan: DomainScanner = async (_d, _p, a) => ({
  scanned: 0, proposed: [], marked: 'agent-produced',
  note: 'no domain scan is installed in this build (the prelude\'s default) — §CI implements the Domain Intelligence Agent\'s scan',
  provenance: { purpose: 'intelligence', package_id: null, room_id: null, classification: 'internal', contributors: [] as string[] },
  agent: a.identity,
});

let domainScanner: DomainScanner | null = null;
export const DomainScanBridge = {
  /** §CI offers its scan at module init (the latest application context's wins — a harness's restarted context replaces a closed one) */
  setScanner(s: DomainScanner | null): void { domainScanner = s; },
  /** the offered scan, or the null scan */
  scanner(): DomainScanner { return domainScanner ?? nullDomainScan; },
  installed(): boolean { return domainScanner !== null; },
};
