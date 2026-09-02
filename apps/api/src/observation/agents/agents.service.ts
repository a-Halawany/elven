/**
 * Agent registry — PHASE1_PLAN §11.
 *
 * An agent identity is INSTANCE- AND VERSION-SPECIFIC: a new version is a new
 * principal and a new registration, never an update in place. That is what makes
 * "which code produced this evidence?" answerable from the custody chain alone —
 * an agent record that mutated its version would erase the answer for everything
 * it had already collected.
 *
 * The registry also creates the agent's PRINCIPAL and its DOMAIN role binding, so
 * an agent's authority is visible in exactly the same tables a human's is. There
 * is no parallel authority system for machines.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ObservationReads, RegistryWrites } from '../observation.capabilities.js';
import type { Connector, RunBudgets } from '../connectors/sdk.js';

export interface AgentRow {
  agent_id: string;
  principal_id: string;
  agent_kind: string;
  connector: string;
  agent_version: string;
  code_digest: string;
  owner_principal_id: string;
  source_id: string | null;
  budgets: Record<string, unknown>;
  status: string;
  [k: string]: unknown;
}

export interface RegisterAgentInput {
  agentKind: 'observation' | 'crawler' | 'collection';
  connector: string;
  agentVersion: string;
  codeDigest: string;
  ownerPrincipalId: string;
  sourceId: string;
  budgets: RunBudgets;
}

@Injectable()
export class AgentsService {
  /**
   * Register an agent instance bound to one source contract. The principal is
   * created by the caller (the controller, on the identity authority) and passed
   * in — this service never mints identity itself, so the identity boundary stays
   * where Phase 0 put it.
   */
  async register(
    cap: RegistryWrites,
    ctx: ScopeContext,
    correlationId: string,
    agentPrincipalId: string,
    input: RegisterAgentInput,
    agentId: string,
  ): Promise<{ agentId: string; principalId: string }> {
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(input.agentVersion)) {
      throw new HttpException(
        errorBody('EYE_REQ_001', correlationId, 'agent version must be an exact semantic version'),
        422,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(input.codeDigest)) {
      throw new HttpException(
        errorBody('EYE_REQ_001', correlationId, 'agent code digest must be a SHA-256 hex digest'),
        422,
      );
    }
    await cap.registerAgent({
      agentId,
      tenantId: ctx.tenantId as string,
      domainId: ctx.domainId as string,
      principalId: agentPrincipalId,
      agentKind: input.agentKind,
      connector: input.connector,
      agentVersion: input.agentVersion,
      codeDigest: input.codeDigest,
      owner: input.ownerPrincipalId,
      sourceId: input.sourceId,
      budgets: input.budgets as unknown as Record<string, unknown>,
      eventId: newId(),
      correlationId,
    });
    return { agentId, principalId: agentPrincipalId };
  }

  async revoke(
    cap: RegistryWrites, ctx: ScopeContext, correlationId: string, agentId: string, reason: string,
  ): Promise<{ agentId: string; status: 'revoked' }> {
    await cap.revokeAgent({
      agentId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
      reason, eventId: newId(), correlationId,
    });
    return { agentId, status: 'revoked' };
  }

  async list(cap: ObservationReads, sourceId: string | null): Promise<AgentRow[]> {
    let q = cap.readAgents().selectAll().orderBy('created_at' as never, 'desc').limit(200);
    if (sourceId !== null) q = q.where('source_id' as never, '=', sourceId as never);
    return (await q.execute()) as AgentRow[];
  }

  /**
   * Find the active agent for a source and connector. Returns null rather than
   * throwing: a source with no registered agent is a configuration state to
   * report, not an error to raise inside a scheduler tick.
   */
  async activeFor(cap: ObservationReads, sourceId: string, connector: Connector): Promise<AgentRow | null> {
    const row = (await cap
      .readAgents()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .where('connector' as never, '=', connector.name as never)
      .where('agent_version' as never, '=', connector.version as never)
      .where('code_digest' as never, '=', connector.codeDigest as never)
      .where('status' as never, '=', 'active' as never)
      .executeTakeFirst()) as AgentRow | undefined;
    return row ?? null;
  }
}

/** The display name an agent principal carries. The version is IN the name (§11). */
export function agentDisplayName(kind: string, connector: string, version: string): string {
  return `agent:${kind}.${connector}@${version}`;
}

/** A stable per-instance login name, so the principal is addressable and unique. */
export function agentLoginName(connector: string, version: string, codeDigest: string): string {
  return `agent.${connector}.${version}.${createHash('sha256').update(codeDigest).digest('hex').slice(0, 12)}`;
}
