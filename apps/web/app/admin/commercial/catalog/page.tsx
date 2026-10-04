'use client';
/**
 * The commercial catalogue — CP-6 B91 §EN (0105; F-P7-F-01). The vendor's view (the commercial authority, PLATFORM): the capability
 * catalogue (core rows cannot be removed), the packages, SKUs and offers, and THE MATRIX — every tenant × every capability, as the server
 * reads it (core, licensed, not licensed, uncontracted, grace, suspended, lapsed). One governed act here: a licence version issued to a
 * tenant (review → confirm; human-gated at the PEP). Every row renders from the authoritative response; nothing here decides what is
 * available. Every offer, package and SKU is SYNTHETIC.
 *
 * BOUNDARY (ADR-022): an entitlement makes a capability unavailable, explained. It never removes audit, warnings and their acknowledgement,
 * corrections and withdrawals, export, identity or a human decision — those are never gated, whatever the licence says.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../../components/ui';
import { capabilityLine, cellText, issueLicence, limitsLine, readCatalog, type Catalog } from '../../../../lib/entitlements-b91';

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

export default function CommercialCatalogPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [tenantId, setTenantId] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const refresh = useCallback(async () => {
    const r = await readCatalog();
    if (r.ok && r.data !== undefined) setCatalog(r.data.catalog);
    else setError(r.error ?? null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function issue() {
    setError(null);
    const r = await issueLicence(tenantId, { skuCode, orderRef, reason });
    setReviewing(false);
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setOrderRef(''); setReason(''); await refresh(); }
    else setError(r.error ?? null);
  }

  const live = (catalog?.capabilities ?? []).filter((c) => c.status === 'active');
  const enforced = live.filter((c) => c.core || c.action_prefixes.length > 0);
  const activeSkus = (catalog?.skus ?? []).filter((s) => s.status === 'active');
  const tenant = (catalog?.matrix ?? []).find((m) => m.tenant_id === tenantId);
  const sku = activeSkus.find((s) => s.sku_code === skuCode);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Commercial catalogue</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        Availability only: a licence makes a capability available or unavailable, explained. Audit, warnings and their acknowledgement,
        corrections and withdrawals, export, identity and every human decision stay available whatever a licence says.
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="The matrix — tenants × capabilities">
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle} aria-label="entitlement matrix">
            <thead>
              <tr><Th>Tenant</Th><Th>Licence</Th>{enforced.map((c) => <Th key={c.capability_key}>{c.label}</Th>)}</tr>
            </thead>
            <tbody>
              {(catalog?.matrix ?? []).map((m) => (
                <tr key={m.tenant_id}>
                  <Td>{m.name}</Td>
                  <Td>{m.licence_version === null ? 'uncontracted' : `v${m.licence_version} · ${m.state} · ${m.package_key ?? ''}`}</Td>
                  {enforced.map((c) => <Td key={c.capability_key}><span aria-label={`${m.name} ${c.capability_key}`}>{cellText(m.cells[c.capability_key] ?? '')}</span></Td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Issue a licence version">
        {!reviewing ? (
          <div style={{ maxInlineSize: '40rem' }}>
            <Field id="lic-tenant" label="Tenant">{(id) => (
              <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                <option value="">choose a tenant</option>
                {(catalog?.matrix ?? []).map((m) => <option key={m.tenant_id} value={m.tenant_id}>{m.name}</option>)}
              </select>)}</Field>
            <Field id="lic-sku" label="SKU">{(id) => (
              <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={skuCode} onChange={(e) => setSkuCode(e.target.value)}>
                <option value="">choose a SKU</option>
                {activeSkus.map((s) => <option key={s.sku_code} value={s.sku_code}>{s.sku_code} — {s.title} ({s.package_key} v{s.package_version}, {s.term_months} months)</option>)}
              </select>)}</Field>
            <Field id="lic-order" label="Order reference">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />}</Field>
            <Field id="lic-reason" label="Reason (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            <button style={buttonStyle} disabled={tenantId === '' || skuCode === '' || orderRef.length < 2 || reason.length < 8} onClick={() => setReviewing(true)}>Review</button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--eye-color-warning)' }}>
              A new licence version for <strong>{tenant?.name}</strong>
              {tenant?.licence_version != null ? <> supersedes v{tenant.licence_version}</> : <> is its first: the availability gate starts to apply</>}.
              Package {sku?.package_key} v{sku?.package_version}; core is always included.
            </p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
              <button style={buttonStyle} onClick={() => void issue()}>Issue the licence</button>
              <button style={{ ...buttonStyle, background: 'var(--eye-color-surface-secondary)', color: 'var(--eye-color-ink-default)', borderColor: 'var(--eye-color-border-default)' }} onClick={() => setReviewing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Capabilities">
        <table style={tableStyle} aria-label="capabilities">
          <thead><tr><Th>Capability</Th><Th>Scope</Th><Th>Cannot be removed</Th><Th>Rows</Th></tr></thead>
          <tbody>
            {live.map((c) => (
              <tr key={c.capability_key}>
                <Td><strong>{c.label}</strong>{c.core ? ' (core)' : ''}</Td>
                <Td>{capabilityLine(c)}</Td>
                <Td>{c.cannot_remove}</Td>
                <Td mono>{c.spec_refs.join(', ')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Packages, SKUs and offers">
        <table style={tableStyle} aria-label="packages">
          <thead><tr><Th>Package</Th><Th>Capabilities</Th><Th>Limits</Th><Th>Status</Th></tr></thead>
          <tbody>
            {(catalog?.packages ?? []).filter((p) => p.status !== 'superseded').map((p) => (
              <tr key={`${p.package_key}-${p.version}`}>
                <Td>{p.title} <span style={{ color: 'var(--eye-color-ink-muted)' }}>({p.package_key} v{p.version})</span></Td>
                <Td>{p.capabilities.length === 0 ? 'core only' : `core + ${p.capabilities.join(', ')}`}</Td>
                <Td>{limitsLine(p.limits)}</Td>
                <Td>{p.status}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          {activeSkus.map((s) => <li key={s.sku_code}><code>{s.sku_code}</code> — {s.title} · {s.package_key} v{s.package_version} · {s.term_months} months</li>)}
          {(catalog?.offers ?? []).filter((o) => o.status === 'published').map((o) => <li key={o.offer_key}>Offer <strong>{o.title}</strong>: {o.summary} ({o.sku_codes.join(', ')})</li>)}
        </ul>
      </Panel>
    </>
  );
}
