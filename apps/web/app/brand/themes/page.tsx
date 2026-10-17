'use client';
/**
 * CUSTOMER THEMES — the tenant brand owner's seat (CP-6 B80 §TK; TENANT, branding_authority): the theme in force and its rollback, every
 * version and its certification, the proposal form with its live preview, activate and retire. The tenant is the one the SERVER reported
 * for this session (never inferred); the views are themes-view.tsx's.
 */
import { useBrandShell } from '../layout';
import { ThemesView } from '../../admin/governance/design/themes/themes-view';

export default function BrandThemesPage() {
  const shell = useBrandShell();
  return (
    <>
      <h1 className="eye-type-heading-1">Brand themes</h1>
      {shell.tenantId === null
        ? <p role="status" className="eye-tk-gap">This session holds no branding authority for a tenant — the brand themes of a tenant are its brand owner&apos;s.</p>
        : <ThemesView seat="tenant" tenantId={shell.tenantId} />}
    </>
  );
}
