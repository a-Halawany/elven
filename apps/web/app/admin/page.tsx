'use client';
import { useEffect, useState } from 'react';
import { health } from '../../lib/api';
import { Panel } from '../../components/ui';
import { t, defaultLocale } from '../../lib/i18n';

export default function OverviewPage() {
  const locale = defaultLocale;
  const [h, setH] = useState<{ status: string; db?: boolean }>({ status: '…' });
  useEffect(() => { void health().then(setH); }, []);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>{t('overview.title', locale)}</h1>
      <Panel title="Service health (telemetry-only classification)">
        <p>
          API: <strong style={{ color: h.status === 'ok' ? 'var(--eye-color-success)' : 'var(--eye-color-degraded)' }}>{h.status}</strong>
          {' · '}database: <strong>{h.db === true ? 'connected' : 'unavailable'}</strong>
        </p>
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
          Degraded state is always visibly marked; a stale answer presented as current is an integrity failure (Vol 3 Ch.45).
        </p>
      </Panel>
      <Panel title="Phase 0 scope">
        <ul style={{ color: 'var(--eye-color-ink-default)' }}>
          <li>Governed tenants & Customer Intelligence Domains (PLATFORM / TENANT / DOMAIN scopes, fail closed)</li>
          <li>Four-value ABAC policy decisions with enforced obligations — every request carries POL + AUD evidence</li>
          <li>Hash-chained append-only audit ledger with pre-incident seals and tamper response</li>
          <li>Canonical objects: 40-field header, four-axis temporal model, non-destructive correction, known-at retrieval</li>
        </ul>
      </Panel>
    </>
  );
}
