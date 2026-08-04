'use client';
/**
 * WS-19 shell: global context bar + workspace rail + work canvas.
 * Fail closed on missing session; degraded state visibly marked (never hidden).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getSession, health, setSession } from '../../lib/api';
import { DegradedBanner } from '../../components/ui';
import { t, defaultLocale } from '../../lib/i18n';

const NAV = [
  { href: '/admin', key: 'nav.overview' },
  { href: '/admin/tenants', key: 'nav.tenants' },
  { href: '/admin/principals', key: 'nav.principals' },
  { href: '/admin/objects', key: 'nav.objects' },
  { href: '/admin/audit', key: 'nav.audit' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const locale = defaultLocale;

  useEffect(() => {
    if (getSession() === null) {
      router.replace('/login');
      return;
    }
    setReady(true);
    const check = async () => {
      const h = await health();
      setDegraded(h.status !== 'ok');
    };
    void check();
    const id = setInterval(() => void check(), 10000);
    return () => clearInterval(id);
  }, [router]);

  if (!ready) return null; // fail closed: nothing renders without a session

  return (
    <div style={{ minBlockSize: '100vh', display: 'flex', flexDirection: 'column' }}>
      <DegradedBanner visible={degraded} detail={t('shell.degraded.api', locale)} />
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--eye-space-16)',
          background: 'var(--eye-color-surface-secondary)',
          borderBlockEnd: '1px solid var(--eye-color-border-default)',
          paddingBlock: 'var(--eye-space-8)', paddingInline: 'var(--eye-space-16)',
        }}
      >
        <strong style={{ color: 'var(--eye-color-ink-strong)' }}>{t('app.title', locale)}</strong>
        <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
          {t('shell.context.scope', locale)}: PLATFORM · {t('shell.context.deployment', locale)}: local-dev
        </span>
        <span style={{ marginInlineStart: 'auto' }}>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}
            onClick={() => { setSession(null); router.replace('/login'); }}
          >
            {t('shell.logout', locale)}
          </button>
        </span>
      </header>
      <div style={{ display: 'flex', flex: 1 }}>
        <nav
          aria-label="workspace"
          style={{
            inlineSize: '220px',
            borderInlineEnd: '1px solid var(--eye-color-border-default)',
            padding: 'var(--eye-space-16)',
            background: 'var(--eye-color-surface-primary)',
          }}
        >
          <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)', marginBlockEnd: 'var(--eye-space-8)' }}>
            WS-19 · {t('app.workspace', locale)}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV.map((n) => (
              <li key={n.href} style={{ marginBlockEnd: 'var(--eye-space-4)' }}>
                <Link
                  href={n.href}
                  style={{
                    display: 'block',
                    padding: 'var(--eye-space-8)',
                    borderRadius: 'var(--eye-radius-md)',
                    textDecoration: 'none',
                    color: pathname === n.href ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-default)',
                    background: pathname === n.href ? 'var(--eye-color-selection)' : 'transparent',
                    fontWeight: pathname === n.href ? 650 : 400,
                  }}
                >
                  {t(n.key, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main style={{ flex: 1, padding: 'var(--eye-space-24)', background: 'var(--eye-color-canvas)' }}>{children}</main>
      </div>
    </div>
  );
}
