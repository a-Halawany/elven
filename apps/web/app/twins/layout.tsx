'use client';
/**
 * The Twins shell — Phase 5's workspace, beside Prediction, Graph, Intelligence and
 * Observation. Same discipline as the shells it is modelled on.
 *
 * The persistent tenant/domain indicator is not decoration: cross-tenant
 * confusion is a governance failure, not a UX one, so the scope the operator is
 * acting in is on screen at all times and is resolved from the SERVER's answer
 * about who they are — never from anything the client remembered.
 *
 * B18: a principal bound at TENANT scope has no home domain; the shell offers it
 * a choice of domain to WORK IN (`lib/working-domain.ts`). A home domain always wins over it.
 *
 * B80 §SH: the shell itself is the ONE AppShell (components/shell.tsx); this layout keeps its own `useShell()` and its role flags.
 * The rail's accessible name stays "Prediction" (WORKSPACE_NAV_NAMES.twins — what the hosted suites select it by).
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Me, Scope } from '../../lib/observation';
import type { ShellBase } from '../../lib/b80-seams';
import { AppShell } from '../../components/shell';

interface ShellContext {
  scope: Scope;
  me: Me;
  /**
   * True when this operator holds resolution_manager in the working domain.
   *
   * It gates what the interface OFFERS, never what it enforces: the server
   * refuses a resolution decision or a split from anyone else regardless, and
   * hiding a control the server would refuse is courtesy, not security.
   */
  isResolutionManager: boolean;
  /** True when this operator may declare Strategy Graph objects. */
  isStrategyOwner: boolean;
  /** True when this operator may declare, ground and admit twins (and run simulations). */
  isTwinOwner: boolean;
  /** True when this operator may run, reproduce and compare simulations. */
  isSimulationOperator: boolean;
}

const Ctx = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('twins shell context is not available');
  return v;
}

function flags(b: ShellBase): ShellContext {
  const me = b.me; const scope = b.scope as Scope;
  const holds = (role: string) => me.bindings.some((x) => x.roleCode === role && (x.scope === 'PLATFORM' || (x.scope === 'DOMAIN' && x.domainId === scope.domainId)));
  const isTwinOwner = holds('twin_owner') || holds('platform_admin');
  return { scope, me, isResolutionManager: holds('resolution_manager'), isStrategyOwner: holds('strategy_owner') || holds('platform_admin'), isTwinOwner,
    isSimulationOperator: isTwinOwner || holds('simulation_operator') };
}

export default function TwinsLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="twins" provide={(b, inner) => <Ctx.Provider value={flags(b)}>{inner}</Ctx.Provider>}>{children}</AppShell>;
}
