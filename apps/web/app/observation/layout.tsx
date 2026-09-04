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
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getSession, health, setSession } from '../../lib/api';
import { whoAmI, type Me, type Scope } from '../../lib/observation';
import { DegradedBanner } from '../../components/ui';

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

const NAV = [
  { href: '/observation', label: 'Overview', glyph: '◎' },
  { href: '/observation/sources', label: 'Sources', glyph: '⛁' },
  { href: '/observation/evidence', label: 'Evidence', glyph: '❑' },
  { href: '/observation/quarantine', label: 'Quarantine', glyph: '⚠' },
  { href: '/observation/corrections', label: 'Corrections', glyph: '⟳' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
];

export default function ObservationLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (getSession() === null) {
      router.replace('/login');
      return;
    }
    void (async () => {
      const r = await whoAmI();
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the server did not confirm this session’s scope');
        return;
      }
      setMe(r.data.me);
    })();
    const check = async () => {
      const h = await health();
      setDegraded(h.status !== 'ok');
    };
    void check();
    const id = setInterval(() => void check(), 15000);
    return () => clearInterval(id);
  }, [router]);

  if (problem !== null) {
    return (
      <main style={{ padding: 'var(--eye-space-32)' }}>
        <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Observation Operations</h1>
        <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p>
      </main>
    );
  }
  // FAIL CLOSED: nothing renders until the server has said which scope this is.
  if (me === null) return null;

  if (me.homeTenantId === null || me.homeDomainId === null) {
    return (
      <main style={{ padding: 'var(--eye-space-32)' }}>
        <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Observation Operations</h1>
        <p role="alert">
          This workspace operates inside one Intelligence Domain. The signed-in principal is bound at{' '}
          <strong>{me.homeScope}</strong> scope and has no home domain, so there is no domain to open.
        </p>
      </main>
    );
  }

  const scope: Scope = { tenantId: me.homeTenantId, domainId: me.homeDomainId };
  const isCollectionManager = me.bindings.some(
    (b) => b.roleCode === 'collection_manager' && b.domainId === me.homeDomainId,
  );

  return (
    <Ctx.Provider value={{ scope, me, isCollectionManager }}>
      <div style={{ minBlockSize: '100vh', display: 'flex', flexDirection: 'column' }}>
        <DegradedBanner visible={degraded} detail="the API reports degraded audit availability" />
        <header
          role="banner"
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--eye-space-16)', flexWrap: 'wrap',
            background: 'var(--eye-color-surface-secondary)',
            borderBlockEnd: '1px solid var(--eye-color-border-default)',
            paddingBlock: 'var(--eye-space-8)', paddingInline: 'var(--eye-space-16)',
          }}
        >
          <strong style={{ color: 'var(--eye-color-ink-strong)' }}>Observation Operations</strong>
          <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
            tenant <bdi style={{ fontFamily: 'var(--eye-font-mono)' }}>{scope.tenantId.slice(0, 8)}…</bdi>
            {' · '}domain <bdi style={{ fontFamily: 'var(--eye-font-mono)' }}>{scope.domainId.slice(0, 8)}…</bdi>
          </span>
          <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
            {me.bindings.map((b) => b.roleCode).join(' · ') || 'no role binding'}
          </span>
          <span style={{ marginInlineStart: 'auto' }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}
              onClick={() => { setSession(null); router.replace('/login'); }}
            >
              Sign out
            </button>
          </span>
        </header>
        <div style={{ display: 'flex', flex: 1, minInlineSize: 0 }}>
          <nav
            aria-label="Observation Operations"
            style={{
              inlineSize: 'clamp(3.5rem, 14vw, 13rem)',
              borderInlineEnd: '1px solid var(--eye-color-border-default)',
              padding: 'var(--eye-space-8)',
              background: 'var(--eye-color-surface-primary)',
            }}
          >
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {NAV.map((n) => {
                const active = n.href === '/observation' ? pathname === n.href : pathname.startsWith(n.href);
                return (
                  <li key={n.href} style={{ marginBlockEnd: 'var(--eye-space-4)' }}>
                    <Link
                      href={n.href}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--eye-space-8)',
                        padding: 'var(--eye-space-8)',
                        borderRadius: 'var(--eye-radius-md)',
                        textDecoration: 'none',
                        color: active ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-default)',
                        background: active ? 'var(--eye-color-selection)' : 'transparent',
                        fontWeight: active ? 650 : 400,
                      }}
                    >
                      <span aria-hidden="true">{n.glyph}</span>
                      <span className="eye-nav-label">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <main style={{ flex: 1, minInlineSize: 0, padding: 'var(--eye-space-24)', background: 'var(--eye-color-canvas)' }}>
            {children}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
