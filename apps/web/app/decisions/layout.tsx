'use client';
/**
 * The Decisions shell — Phase 6's workspaces (Decisions, Briefings), beside Twins,
 * Prediction, Graph, Intelligence and Observation. Same discipline as the shells it
 * is modelled on: the scope on screen is the SERVER's answer about who this is; the
 * role flags gate what the interface OFFERS, never what it enforces — an approval, a
 * commit or a review is refused by the server from anyone else regardless.
 *
 * B18: a principal bound at TENANT scope has no home domain; the shell offers it a
 * choice of domain to WORK IN (`lib/working-domain.ts`). A home domain always wins over it.
 *
 * B80 §SH: the shell itself is the ONE AppShell (components/shell.tsx); this layout keeps its own `useShell()`, its role flags, the
 * exported `NAV` (lib/shell-b80.ts DECISIONS_NAV — every part's marked line kept there) and B36's external-collaborator adaptation
 * (the gate, the one-line rail, the grant on the banner) through AppShell's `adapt`.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { Me, Scope } from '../../lib/observation';
import type { ShellBase } from '../../lib/b80-seams';
import { DECISIONS_NAV } from '../../lib/shell-b80';
import { AppShell, type AppShellAdapt } from '../../components/shell';
/* B36 (0094 §C1): the external collaborator's bounded surface */ import { externalSurface, type GrantSurface } from '../../lib/workflow'; /* end B36 */

interface ShellContext {
  scope: Scope; me: Me;
  isDecisionOwner: boolean; isApprover: boolean; isAuthority: boolean; isExecutive: boolean;
  /* B36 (0094) gates: the board member (PER-01) and the tenant's auditor (a challenger) */ isBoardMember: boolean; isAuditor: boolean;
  /* B36 (0094 §C1) collab: an EXTERNAL collaborator sees one surface — its workspace under its grant */ isExternal: boolean; externalGrant: GrantSurface | null;
}
const Ctx = createContext<ShellContext | null>(null);
export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('decisions shell context is not available');
  return v;
}
export const NAV = DECISIONS_NAV;

/* B36 (0094 §C1) collab: the server's answer for an external is BOUNDED TO ITS GRANT — the shell shows the workspace surface only; an expired or ended grant signs it out of everything */
function surfaceOf(me: Me) {
  const surface = externalSurface(me.external === undefined ? null : { grants: me.external.grants as unknown as GrantSurface[], expired: me.external.expired });
  const isExternal = me.external !== undefined;
  return { surface, isExternal, externalGrant: isExternal && surface.kind === 'workspace' ? surface.grant : null };
}
function adapt(b: ShellBase, api: { signOut: () => void }): AppShellAdapt {
  const { surface, isExternal, externalGrant } = surfaceOf(b.me);
  if (isExternal && surface.kind !== 'workspace') {
    return { gate: (
      <main className="eye-shell-gate"><h1>Collaboration</h1>
        <p role="alert">Your access has ended: the grant is <strong>{surface.kind === 'expired' ? surface.reason : 'not live'}</strong>. Nothing of this tenant is shown to you beyond it.</p>
        <button type="button" className="eye-link-button" onClick={api.signOut}>Sign out</button></main>) };
  }
  return {
    nav: isExternal ? NAV.filter((n) => n.href === '/decisions/workspaces') : NAV,
    /* B36 (0094 §C1) collab: the external's grant on the banner — what bounds this surface */
    banner: externalGrant !== null ? <span aria-label="your grant" className="eye-shell-grant">
      external collaborator · {externalGrant.workspace_title} · purpose {externalGrant.purpose} · audience {externalGrant.audience_ceiling} · access ends {String(externalGrant.expires_at ?? '').slice(0, 10)}</span> : undefined,
  };
}
/* end B36 collab */

function flags(b: ShellBase): ShellContext {
  const me = b.me; const scope = b.scope as Scope;
  const holds = (role: string) => me.bindings.some((x) => x.roleCode === role && (x.scope === 'PLATFORM' || (x.scope === 'DOMAIN' && x.domainId === scope.domainId)));
  const { isExternal, externalGrant } = surfaceOf(me);
  return { scope, me, isDecisionOwner: holds('decision_owner') || holds('platform_admin'), isApprover: holds('decision_approver'), isAuthority: holds('decision_authority'), isExecutive: holds('executive'),
    /* B36 (0094) gates */ isBoardMember: holds('board_member'), isAuditor: me.bindings.some((x) => x.roleCode === 'auditor' && x.scope === 'TENANT' && x.tenantId === scope.tenantId) /* end B36 gates */,
    /* B36 (0094 §C1) collab */ isExternal, externalGrant /* end B36 collab */ };
}

export default function DecisionsLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="decisions" adapt={adapt} provide={(b, inner) => <Ctx.Provider value={flags(b)}>{inner}</Ctx.Provider>}>{children}</AppShell>;
}
