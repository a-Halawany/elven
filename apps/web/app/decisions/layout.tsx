'use client';
/**
 * The Decisions shell — Phase 6's workspaces (Decisions, Briefings), beside Twins,
 * Prediction, Graph, Intelligence and Observation. Same discipline as the shells it
 * is modelled on: the scope on screen is the SERVER's answer about who this is; the
 * role flags gate what the interface OFFERS, never what it enforces — an approval, a
 * commit or a review is refused by the server from anyone else regardless.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getSession, health, setSession } from '../../lib/api';
import { whoAmI, type Me, type Scope } from '../../lib/observation';
import { DegradedBanner } from '../../components/ui';

interface ShellContext {
  scope: Scope; me: Me;
  isDecisionOwner: boolean; isApprover: boolean; isAuthority: boolean; isExecutive: boolean;
}
const Ctx = createContext<ShellContext | null>(null);
export function useShell(): ShellContext {
  const v = useContext(Ctx);
  if (v === null) throw new Error('decisions shell context is not available');
  return v;
}
export const NAV = [
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];

export default function DecisionsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (getSession() === null) { router.replace('/login'); return; }
    void (async () => {
      const r = await whoAmI();
      if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the server did not confirm this session’s scope'); return; }
      setMe(r.data.me);
    })();
    const check = async () => { const h = await health(); setDegraded(h.status !== 'ok'); };
    void check();
    const id = setInterval(() => void check(), 15000);
    return () => clearInterval(id);
  }, [router]);
  if (problem !== null) return <main style={{ padding: 'var(--eye-space-32)' }}><h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Decisions</h1><p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p></main>;
  if (me === null) return null;
  if (me.homeTenantId === null || me.homeDomainId === null) {
    return <main style={{ padding: 'var(--eye-space-32)' }}><h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Decisions</h1>
      <p role="alert">This workspace operates inside one Intelligence Domain. The signed-in principal is bound at <strong>{me.homeScope}</strong> scope and has no home domain, so there is no domain to open.</p></main>;
  }
  const scope: Scope = { tenantId: me.homeTenantId, domainId: me.homeDomainId };
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const value: ShellContext = { scope, me, isDecisionOwner: holds('decision_owner') || holds('platform_admin'), isApprover: holds('decision_approver'), isAuthority: holds('decision_authority'), isExecutive: holds('executive') };
  return (
    <Ctx.Provider value={value}>
      <div style={{ minBlockSize: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DegradedBanner visible={degraded} detail="the API reports degraded audit availability" />
        <header role="banner" style={{ display: 'flex', alignItems: 'center', gap: 'var(--eye-space-16)', flexWrap: 'wrap', background: 'var(--eye-color-surface-secondary)', borderBlockEnd: '1px solid var(--eye-color-border-default)', paddingBlock: 'var(--eye-space-8)', paddingInline: 'var(--eye-space-16)' }}>
          <strong style={{ color: 'var(--eye-color-ink-strong)' }}>Decisions</strong>
          <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
            tenant <bdi style={{ fontFamily: 'var(--eye-font-mono)' }}>{scope.tenantId.slice(0, 8)}…</bdi>{' · '}domain <bdi style={{ fontFamily: 'var(--eye-font-mono)' }}>{scope.domainId.slice(0, 8)}…</bdi>
          </span>
          <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{me.bindings.map((b) => b.roleCode).join(' · ') || 'no role binding'}</span>
          <span style={{ marginInlineStart: 'auto' }}>
            <button type="button" style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }} onClick={() => { setSession(null); router.replace('/login'); }}>Sign out</button>
          </span>
        </header>
        <div style={{ display: 'flex', flex: 1, minInlineSize: 0 }}>
          <nav aria-label="Decisions" style={{ inlineSize: 'clamp(3.5rem, 14vw, 13rem)', borderInlineEnd: '1px solid var(--eye-color-border-default)', padding: 'var(--eye-space-8)', background: 'var(--eye-color-surface-primary)' }}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {NAV.map((n) => {
                const active = n.href === '/decisions' ? pathname === n.href : pathname.startsWith(n.href);
                return (
                  <li key={n.href} style={{ marginBlockEnd: 'var(--eye-space-4)' }}>
                    <Link href={n.href} aria-current={active ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 'var(--eye-space-8)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', textDecoration: 'none', color: active ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-default)', background: active ? 'var(--eye-color-selection)' : 'transparent', fontWeight: active ? 650 : 400 }}>
                      <span aria-hidden="true">{n.glyph}</span><span className="eye-nav-label">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <main style={{ flex: 1, minInlineSize: 0, padding: 'var(--eye-space-24)', background: 'var(--eye-color-canvas)' }}>{children}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
