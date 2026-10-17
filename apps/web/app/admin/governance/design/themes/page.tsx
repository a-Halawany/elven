'use client';
/**
 * CUSTOMER THEMES — the Design System Authority's seat (CP-6 B80 §TK; PLATFORM): every tenant's theme proposals awaiting certification, a
 * version's preview and its SIGNED certification (the outcome is the server's recomputation of the contrast matrix). A tenant's brand owner
 * proposes, activates, rolls back and retires at /brand/themes (the admin shell is PLATFORM's). The views are themes-view.tsx's.
 */
import { useEffect, useState } from 'react';
import { ThemesView } from './themes-view';

export default function ThemesPlatformPage() {
  const [tenant, setTenant] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  useEffect(() => { const q = new URLSearchParams(window.location.search); setFrom(q.get('tenant')); }, []);
  useEffect(() => { if (from !== null && /^[0-9a-f-]{36}$/i.test(from)) setTenant(from); }, [from]);
  return (
    <>
      <h1 className="eye-type-heading-1">Customer themes — certification</h1>
      <p className="eye-tk-muted">A customer theme maps brand expression onto the allowed tokens only. Certification is the Design System Authority&apos;s signed act; the contrast matrix is recomputed from the stored mapping and decides. <a href="/admin/governance/design/tokens">Inspect the tokens</a>.</p>
      <ThemesView seat="platform" tenantId={tenant} />
    </>
  );
}
