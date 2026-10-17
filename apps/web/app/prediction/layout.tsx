'use client';
/**
 * The Prediction shell — Phase 4's workspace, beside Graph, Intelligence and
 * Observation. Same discipline as the Graph shell it is modelled on.
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
  /** True when this operator may issue forecasts, declare scenarios and acknowledge warnings. */
  isForecastOwner: boolean;
}

const Ctx = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('prediction shell context is not available');
  return v;
}

function flags(b: ShellBase): ShellContext {
  const me = b.me;
  const has = (role: string) => me.bindings.some((x) => x.roleCode === role && x.domainId === me.homeDomainId);
  return { scope: b.scope as Scope, me, isResolutionManager: has('resolution_manager'), isStrategyOwner: has('strategy_owner'), isForecastOwner: has('forecast_owner') };
}

export default function PredictionLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="prediction" provide={(b, inner) => <Ctx.Provider value={flags(b)}>{inner}</Ctx.Provider>}>{children}</AppShell>;
}
