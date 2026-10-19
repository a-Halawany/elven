'use client';
/**
 * THE BRAND WORKSPACE shell — CP-6 B80 §TK: where a TENANT principal (the customer's brand owner, branding_authority) reaches the tenant's
 * themes. The admin shell is PLATFORM's (its header states PLATFORM scope) and the domain shells need a working domain a brand owner does not
 * have, so this small TENANT shell carries the brand surface until §SH's AppShell folds it into the workspace registry (the integrator's
 * swap — WorkspaceKey has no `brand` yet). FAIL CLOSED: nothing renders until the server has said who this is; the tenant shown and used is
 * the one the SERVER reports for the session's TENANT binding of branding_authority (never inferred); the degraded state is visible; the
 * banner, the navigation's accessible name ("Brand") and "Sign out" follow the hosted suites' conventions. The tenant's theme IN FORCE is
 * applied to the workspace through ThemeScope (its fallback stated).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getSession, health, setSession } from '../../lib/api';
import { whoAmI, type Me } from '../../lib/observation';
import { DegradedBanner } from '../../components/ui';
import { ThemeScope } from '../../components/theme';
import { Identifier } from '../../components/text';

interface BrandShell { me: Me; tenantId: string | null; isBrandOwner: boolean }
const Ctx = createContext<BrandShell | null>(null);
export function useBrandShell(): BrandShell {
  const v = useContext(Ctx);
  if (v === null) throw new Error('brand shell context is not available');
  return v;
}

/** The tenant of the session's TENANT branding_authority binding (the server's answer), or its home tenant when it is TENANT-homed. */
function brandTenant(me: Me): string | null {
  const b = me.bindings.find((x) => x.roleCode === 'branding_authority' && x.scope === 'TENANT' && x.tenantId !== null);
  if (b !== undefined) return b.tenantId;
  return me.homeScope === 'TENANT' ? me.homeTenantId : null;
}

const NAV = [{ href: '/brand/themes', label: 'Brand themes' }];

export default function BrandLayout({ children }: { children: ReactNode }) {
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

  if (problem !== null) {
    return <main className="eye-tk-shell-main"><h1 className="eye-type-heading-1">Brand</h1><p role="alert" className="eye-tk-gap">{problem}</p></main>;
  }
  if (me === null) return null; // fail closed
  const tenantId = brandTenant(me);
  const isBrandOwner = me.bindings.some((b) => b.roleCode === 'branding_authority' && b.scope === 'TENANT');

  return (
    <Ctx.Provider value={{ me, tenantId, isBrandOwner }}>
      <ThemeScope tenantId={tenantId}>
        <div className="eye-tk-shell-body">
          <DegradedBanner visible={degraded} detail="the API reports degraded audit availability" />
          <header role="banner" className="eye-tk-shell-header">
            <strong>Brand</strong>
            <span className="eye-tk-muted">scope TENANT · tenant {tenantId === null ? 'none' : <Identifier value={tenantId} max={12} copy={false} />}</span>
            <span className="eye-tk-muted">{me.bindings.map((b) => b.roleCode).join(' · ') || 'no role binding'}</span>
            <nav aria-label="Brand" className="eye-tk-nav">
              <ul>{NAV.map((n) => <li key={n.href}><Link href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined}>{n.label}</Link></li>)}</ul>
            </nav>
            <button type="button" className="eye-tk-signout" onClick={() => { setSession(null); router.replace('/login'); }}>Sign out</button>
          </header>
          <main className="eye-tk-shell-main">{children}</main>
        </div>
      </ThemeScope>
    </Ctx.Provider>
  );
}
