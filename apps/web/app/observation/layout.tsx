'use client';
/**
 * WS-02 Observation Operations shell.
 *
 * The persistent tenant/domain indicator is not decoration: cross-tenant
 * confusion is a governance failure, not a UX one, so the scope the operator is
 * acting in is on screen at all times and is resolved from the SERVER's answer
 * about who they are — never from anything the client remembered.
 *
 * The rail collapses to icons below 1024px and the layout is built from logical
 * properties throughout, so it mirrors under `dir="rtl"` without a second
 * stylesheet.
 *
 * B18: a principal bound at TENANT scope has no home domain; the shell offers it
 * a choice of domain to WORK IN (`lib/working-domain.ts` — the tab's, the
 * principal's, shown in the header, changeable). The choice names the domain
 * the envelopes carry; the server resolves the route's scope and the policy
 * decides what the principal may do there. A home domain always wins over it.
 *
 * B80 §SH: the session check, the server's answer, the working domain, the health poll, the banner and the rail are the ONE
 * AppShell's (components/shell.tsx); this layout keeps its own `useShell()` and its role flag as a thin wrapper.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Me, Scope } from '../../lib/observation';
import type { ShellBase } from '../../lib/b80-seams';
import { AppShell } from '../../components/shell';

interface ShellContext {
  scope: Scope;
  me: Me;
  /** True when this operator holds collection_manager in the working domain. */
  isCollectionManager: boolean;
}

const Ctx = createContext<ShellContext | null>(null);

export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('observation shell context is not available');
  return v;
}

function flags(b: ShellBase): ShellContext {
  const me = b.me;
  return { scope: b.scope as Scope, me, isCollectionManager: me.bindings.some((x) => x.roleCode === 'collection_manager' && x.domainId === me.homeDomainId) };
}

export default function ObservationLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="observation" provide={(b, inner) => <Ctx.Provider value={flags(b)}>{inner}</Ctx.Provider>}>{children}</AppShell>;
}
