'use client';
/**
 * Tenants & domains — governed creation with an explicit review step
 * (deliberate action, PAT-07-lite: review → confirm; no default approval).
 * Everything renders from authoritative receipts only.
 */
import { useCallback, useEffect, useState } from 'react';
import { call } from '../../../lib/api';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../components/ui';
import { t, defaultLocale } from '../../../lib/i18n';

interface Tenant { id: string; name: string; status: string; created_at: string }
interface Domain { id: string; name: string; status: string }
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

export default function TenantsPage() {
  const locale = defaultLocale;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [domains, setDomains] = useState<Record<string, Domain[]>>({});
  const [name, setName] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [domainName, setDomainName] = useState('');
  const [domainTarget, setDomainTarget] = useState<string>('');

  const refresh = useCallback(async () => {
    const r = await call<{ tenants: Tenant[] }>('/v1/platform/tenants/list', {
      scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none',
    });
    if (r.ok && r.data !== undefined) {
      setTenants(r.data.tenants);
      for (const tn of r.data.tenants) {
        const d = await call<{ domains: Domain[] }>(`/v1/tenants/${tn.id}/domains/list`, {
          scope: 'TENANT', tenant_id: tn.id, action: 'tenancy.domain.list', object_type: 'CID', side_effect_class: 'none',
        });
        if (d.ok && d.data !== undefined) setDomains((prev) => ({ ...prev, [tn.id]: d.data!.domains }));
      }
    } else setError(r.error ?? null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createTenant() {
    setError(null);
    const payload = { name, residency: 'local-dev' };
    const r = await call<{ tenant: Tenant; receipt: { policyDecisionId: string; auditSeq: number } }>(
      '/v1/platform/tenants',
      { scope: 'PLATFORM', action: 'tenancy.tenant.create', object_type: 'TEN' },
      payload,
    );
    setReviewing(false);
    if (r.ok && r.data !== undefined) {
      setReceipt(r.data.receipt);
      setName('');
      await refresh();
    } else setError(r.error ?? null);
  }

  async function createDomain(tenantId: string) {
    setError(null);
    const payload = { name: domainName };
    const r = await call<{ domain: Domain; receipt: { policyDecisionId: string; auditSeq: number } }>(
      `/v1/tenants/${tenantId}/domains`,
      { scope: 'TENANT', tenant_id: tenantId, action: 'tenancy.domain.create', object_type: 'CID' },
      payload,
    );
    if (r.ok && r.data !== undefined) {
      setReceipt(r.data.receipt);
      setDomainName('');
      setDomainTarget('');
      await refresh();
    } else setError(r.error ?? null);
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>{t('tenants.title', locale)}</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title={t('tenants.create', locale)}>
        {!reviewing ? (
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
            <input style={inputStyle} placeholder={t('tenants.name', locale)} value={name} onChange={(e) => setName(e.target.value)} minLength={2} />
            <button style={buttonStyle} disabled={name.length < 2} onClick={() => setReviewing(true)}>
              {t('tenants.create', locale)}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--eye-color-warning)' }}>{t('tenants.review', locale)}</p>
            <p>
              <strong>{t('tenants.name', locale)}:</strong> <code style={{ fontFamily: 'var(--eye-font-mono)' }}>{name}</code>
            </p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
              <button style={buttonStyle} onClick={() => void createTenant()}>{t('tenants.confirm', locale)}</button>
              <button style={{ ...buttonStyle, background: 'var(--eye-color-surface-secondary)', color: 'var(--eye-color-ink-default)', borderColor: 'var(--eye-color-border-default)' }} onClick={() => setReviewing(false)}>
                {t('common.cancel', locale)}
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={t('domains.title', locale)}>
        <table style={tableStyle}>
          <thead>
            <tr><Th>Tenant</Th><Th>Status</Th><Th>ID</Th><Th>Domains</Th><Th>{t('domains.create', locale)}</Th></tr>
          </thead>
          <tbody>
            {tenants.map((tn) => (
              <tr key={tn.id}>
                <Td>{tn.name}</Td>
                <Td>{tn.status}</Td>
                <Td mono>{tn.id.slice(0, 13)}…</Td>
                <Td>{(domains[tn.id] ?? []).map((d) => d.name).join(', ') || '—'}</Td>
                <Td>
                  {domainTarget === tn.id ? (
                    <span style={{ display: 'inline-flex', gap: 'var(--eye-space-4)' }}>
                      <input style={{ ...inputStyle, blockSize: 'var(--eye-size-control-sm)' }} placeholder={t('domains.name', locale)} value={domainName} onChange={(e) => setDomainName(e.target.value)} />
                      <button style={{ ...buttonStyle, blockSize: 'var(--eye-size-control-sm)' }} disabled={domainName.length < 2} onClick={() => void createDomain(tn.id)}>✓</button>
                    </span>
                  ) : (
                    <button style={{ ...buttonStyle, blockSize: 'var(--eye-size-control-sm)', background: 'var(--eye-color-surface-secondary)', color: 'var(--eye-color-accent-strong)' }} onClick={() => setDomainTarget(tn.id)}>
                      +
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
