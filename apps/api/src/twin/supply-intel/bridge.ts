/**
 * CP-6 B33 §SC (0111) — THE BRIDGE between the Supply Chain Agent's scan (executive/agents/supply-chain-agent.ts, which the executive's
 * agents.service runs under the agent's own session) and the supply-intelligence steps this part adds to it (twin/supply-intel), without a
 * module import from the twin side to the executive (the B30 ReconciliationBridge idiom: the executive imports twin files; the twin imports
 * nothing of the executive's agents). SupplyIntelService offers its steps at module init; the latest application context's service wins (a
 * harness's restarted context replaces the closed one). With no service offered (a unit test), the scan does B29's steps only and says so.
 */
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { PipelineService } from '../../pipeline/pipeline.service.js';

type Row = Record<string, unknown>;
export interface SupplyScanMeter { read(what: string): void; tick(what?: string): void }
export interface SupplyScanRefusal { action: string; code: string; reason: string; at: string }
export interface SupplyIntelScanArgs {
  tenantId: string; domainId: string; agentId: string; runId: string; meter: SupplyScanMeter; stops: Array<Record<string, unknown>>;
  refusals: SupplyScanRefusal[]; correlationId: string; identity: Record<string, unknown>;
}
export interface SupplyIntelScanEnv {
  pipeline: PipelineService;
  env(action: string, objectType: string, objectId: string | null): Envelope;
  route(action: string, objectType: string, objectId: string | null): { scope: 'DOMAIN'; tenantId: string; domainId: string; action: string; objectType: string; objectId: string | null };
}
export type SupplyIntelScanner = (d: SupplyIntelScanEnv, p: AuthenticatedPrincipal, a: SupplyIntelScanArgs) => Promise<Row>;

let scanner: SupplyIntelScanner | null = null;
let identity: { version: string; digest: string } | null = null;
export const SupplyIntelBridge = {
  setScanner(s: SupplyIntelScanner | null): void { scanner = s; },
  scanner(): SupplyIntelScanner | null { return scanner; },
  /** the Supply Chain Agent's runtime identity (supply-chain-agent.ts offers it at import): the hook never starts a DRIFTED agent's scan (R2) */
  setIdentity(i: { version: string; digest: string }): void { identity = i; },
  identity(): { version: string; digest: string } | null { return identity; },
};
