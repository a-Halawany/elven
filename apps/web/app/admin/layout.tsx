'use client';
/**
 * WS-19 shell: global context bar + workspace rail + work canvas.
 * Fail closed on missing session; degraded state visibly marked (never hidden).
 *
 * B80 §SH: the ONE AppShell (components/shell.tsx) in its PLATFORM form — no whoAmI (as before), the header "Scope: PLATFORM ·
 * Deployment: local-dev", the rail named "workspace" (the hosted suites' selector) with its WS-19 caption, the labels from the message
 * catalogue (lib/shell-b80.ts ADMIN_NAV_KEYS keeps every part's marked line), the health poll every 10 s.
 */
import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell workspace="admin">{children}</AppShell>;
}
