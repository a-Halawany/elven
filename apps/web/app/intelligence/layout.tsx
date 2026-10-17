'use client';
/**
 * The Intelligence shell — Phase 2's workspace, beside Observation Operations.
 *
 * The persistent tenant/domain indicator is not decoration: cross-tenant
 * confusion is a governance failure, not a UX one, so the scope the operator is
 * acting in is on screen at all times and is resolved from the SERVER's answer
 * about who they are — never from anything the client remembered.
 *
 * B18: a principal bound at TENANT scope has no home domain; the shell offers it
 * a choice of domain to WORK IN (`lib/working-domain.ts`). A home domain always wins over it.
 *
 * B80 §SH: the shell itself is the ONE AppShell (components/shell.tsx); this layout keeps its own `useShell()` and its role flag.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Me, Scope } from '../../lib/observation';
import type { ShellBase } from '../../lib/b80-seams';
import { AppShell } from '../../components/shell';

interface ShellContext {
  scope: Scope;
  me: Me;
  /**
   * True when this operator holds extraction_manager in the working domain.
   *
   * It gates what the interface OFFERS, never what it enforces: the server
   * refuses an approval or a review decision from anyone else regardless, and
   * hiding a control the server would refuse is courtesy, not security.
   */
  isExtractionManager: boolean;
}

const Ctx = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('intelligence shell context is not available');
  return v;
}

function flags(b: ShellBase): ShellContext {
  const me = b.me;
  return { scope: b.scope as Scope, me, isExtractionManager: me.bindings.some((x) => x.roleCode === 'extraction_manager' && x.domainId === me.homeDomainId) };
}

export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="intelligence" provide={(b, inner) => <Ctx.Provider value={flags(b)}>{inner}</Ctx.Provider>}>{children}</AppShell>;
}
