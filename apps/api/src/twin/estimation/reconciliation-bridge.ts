/**
 * CP-6 B30 §ES (0103) — THE BRIDGE between the twin's estimation and the executive's agent runtime, without a module import either way
 * beyond the established direction (the executive's agents.service imports this file, as it imports the supply-chain agent's twin code; the
 * twin module imports nothing of the executive's agents):
 *   the SCANNER — the Reconciliation Agent's reconcile_scan, offered by EstimationService at module init and called by AgentsService.run
 *                 under the agent's own session;
 *   the RUNNER  — AgentsService.run, offered by the executive at construction and called by the `twin-estimation` after-tick hook when a
 *                 proposal check is pending and the domain has an active Reconciliation Agent.
 * One process, one application: the latest application context's service wins (a harness's restarted context replaces the closed one).
 */
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';

type Row = Record<string, unknown>;
export interface ScanMeter { read(what: string): void; tick(what?: string): void }
export interface ScanRefusal { action: string; code: string; reason: string; at: string }
export interface ScanArgs {
  tenantId: string; domainId: string; agentId: string; runId: string; registration: { agent_version: string; code_digest: string };
  meter: ScanMeter; stops: Array<Record<string, unknown>>; refusals: ScanRefusal[]; correlationId: string; identity: Record<string, unknown>;
}
export interface ScanEnv {
  env(action: string, objectType: string, objectId: string | null): Envelope;
  route(action: string, objectType: string, objectId: string | null): { scope: 'DOMAIN'; tenantId: string; domainId: string; action: string; objectType: string; objectId: string | null };
}
export type ReconcileScanner = (deps: ScanEnv, p: AuthenticatedPrincipal, a: ScanArgs) => Promise<Row>;
export interface AgentRunArgs {
  /* B33 integration: THE GENERIC RUNNER — AgentsService.run runs any task of the agent's kind; the after-tick hooks that start an agent's scan
     (B30's twin-estimation: reconcile_scan; B33 §SC's twin-supply-scan: supply_scan) name their task here. B33 §CI reaches the same
     AgentsService.run through ModuleRef (the domains module); both are the one runtime — one seam, two doors, documented in domains/seams.ts. */
  agentId: string; tenantId: string; domainId: string; task: 'reconcile_scan' | 'supply_scan' | 'domain_scan'; trigger: { kind: 'operator' | 'scheduler' | 'request'; principalId: string | null; ref: string | null };
  roomId: null; packageId: null; version: null; correlationId: string;
}
export type AgentRunner = (a: AgentRunArgs) => Promise<{ runId: string; agentId: string; outcome: string; stopReason: string | null }>;

let scanner: ReconcileScanner | null = null;
let runner: AgentRunner | null = null;

export const ReconciliationBridge = {
  setScanner(s: ReconcileScanner): void { scanner = s; },
  scanner(): ReconcileScanner | null { return scanner; },
  setRunner(r: AgentRunner): void { runner = r; },
  runner(): AgentRunner | null { return runner; },
};
