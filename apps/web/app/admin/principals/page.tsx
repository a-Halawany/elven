'use client';
/** Principals — administration grants technical access only (PER-18); role bindings scoped. */
import { useCallback, useEffect, useState } from 'react';
import { call } from '../../../lib/api';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../components/ui';
import { t, defaultLocale } from '../../../lib/i18n';

interface Tenant { id: string; name: string }
interface Principal { id: string; kind: string; scope: string; tenant_id: string | null; display_name: string; status: string }
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

export default function PrincipalsPage() {
  const locale = defaultLocale;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [displayName, setDisplayName] = useState('');
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState('tenant_admin');

  useEffect(() => {
    void call<{ tenants: Tenant[] }>('/v1/platform/tenants/list', {
      scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none',
    }).then((r) => { if (r.ok && r.data !== undefined) setTenants(r.data.tenants); });
  }, []);

  const refresh = useCallback(async () => {
    if (tenantId === '') return;
    const r = await call<{ principals: Principal[] }>(`/v1/tenants/${tenantId}/principals/list`, {
      scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.list', object_type: 'PRN', side_effect_class: 'none',
    });
    if (r.ok && r.data !== undefined) setPrincipals(r.data.principals);
    else setError(r.error ?? null);
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createPrincipal() {
    setError(null);
    const payload = { kind: 'human', displayName, loginName, password, roleCode };
    const r = await call<{ principal: { principalId: string }; receipt: { policyDecisionId: string; auditSeq: number } }>(
      `/v1/tenants/${tenantId}/principals`,
      { scope: 'TENANT', tenant_id: tenantId, action: 'identity.principal.create', object_type: 'PRN' },
      payload,
    );
    if (r.ok && r.data !== undefined) {
      setReceipt(r.data.receipt);
      setDisplayName(''); setLoginName(''); setPassword('');
      await refresh();
    } else setError(r.error ?? null);
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>{t('principals.title', locale)}</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      <Panel title="Scope">
        <select style={inputStyle} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">— tenant —</option>
          {tenants.map((tn) => <option key={tn.id} value={tn.id}>{tn.name}</option>)}
        </select>
      </Panel>
      {tenantId !== '' && (
        <>
          <Panel title={t('principals.create', locale)}>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
              <input style={inputStyle} placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              <input style={inputStyle} placeholder="login name (unique)" value={loginName} onChange={(e) => setLoginName(e.target.value)} />
              <input style={inputStyle} type="password" placeholder="password (min 12)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <select style={inputStyle} value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                <option value="tenant_admin">tenant_admin</option>
                <option value="auditor">auditor</option>
              </select>
              <button style={buttonStyle} disabled={displayName.length < 2 || loginName.length < 3 || password.length < 12} onClick={() => void createPrincipal()}>
                {t('principals.create', locale)}
              </button>
            </div>
          </Panel>
          <Panel title="Principals">
            <table style={tableStyle}>
              <thead><tr><Th>Name</Th><Th>Kind</Th><Th>Scope</Th><Th>Status</Th><Th>ID</Th></tr></thead>
              <tbody>
                {principals.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.display_name}</Td><Td>{p.kind}</Td><Td>{p.scope}</Td><Td>{p.status}</Td><Td mono>{p.id.slice(0, 13)}…</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </>
  );
}
