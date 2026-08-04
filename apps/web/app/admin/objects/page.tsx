'use client';
/**
 * Canonical object browser — truth-state badges (three channels), version
 * history, provenance, and as-of (known-at) retrieval without hindsight
 * contamination. Objects are DOMAIN-scoped.
 */
import { useCallback, useEffect, useState } from 'react';
import { call } from '../../../lib/api';
import { ErrorNote, LifecycleBadge, Panel, Receipt, Td, Th, TruthBadge, buttonStyle, inputStyle, tableStyle } from '../../../components/ui';
import { t, defaultLocale } from '../../../lib/i18n';

interface Tenant { id: string; name: string }
interface Domain { id: string; name: string }
interface ObjRow {
  object_id: string; object_type: string; object_version: string | number;
  truth_state: string; lifecycle_state: string; recorded_at: string;
  content_digest: string; correction_of: string | null;
  evidence_refs: string[]; method_ref: string | null; payload: Record<string, unknown>;
}
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

export default function ObjectsPage() {
  const locale = defaultLocale;
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [domainsByTenant, setDomainsByTenant] = useState<Record<string, Domain[]>>({});
  const [tenantId, setTenantId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [objects, setObjects] = useState<ObjRow[]>([]);
  const [selected, setSelected] = useState<ObjRow | null>(null);
  const [history, setHistory] = useState<ObjRow[]>([]);
  const [knownAt, setKnownAt] = useState('');
  const [asOfResult, setAsOfResult] = useState<ObjRow | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [subject, setSubject] = useState('');
  const [predicate, setPredicate] = useState('');
  const [objectValue, setObjectValue] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');

  useEffect(() => {
    void (async () => {
      const r = await call<{ tenants: Tenant[] }>('/v1/platform/tenants/list', {
        scope: 'PLATFORM', action: 'tenancy.tenant.list', object_type: 'TEN', side_effect_class: 'none',
      });
      if (r.ok && r.data !== undefined) {
        setTenants(r.data.tenants);
        for (const tn of r.data.tenants) {
          const d = await call<{ domains: Domain[] }>(`/v1/tenants/${tn.id}/domains/list`, {
            scope: 'TENANT', tenant_id: tn.id, action: 'tenancy.domain.list', object_type: 'CID', side_effect_class: 'none',
          });
          if (d.ok && d.data !== undefined) setDomainsByTenant((p) => ({ ...p, [tn.id]: d.data!.domains }));
        }
      } else setError(r.error ?? null);
    })();
  }, []);

  const base = tenantId !== '' && domainId !== '' ? `/v1/tenants/${tenantId}/domains/${domainId}/objects` : null;
  const scopeOver = { scope: 'DOMAIN' as const, tenant_id: tenantId, domain_id: domainId, purpose_id: 'analysis' };

  const refresh = useCallback(async () => {
    if (base === null) return;
    const r = await call<{ objects: ObjRow[] }>(`${base}/list`, {
      ...scopeOver, action: 'objects.read', object_type: 'CLM', side_effect_class: 'none',
    }, { objectType: 'CLM', limit: 50 });
    if (r.ok && r.data !== undefined) setObjects(r.data.objects);
    else setError(r.error ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createClaim() {
    if (base === null) return;
    setError(null);
    const payload = {
      objectType: 'CLM', truthState: 'asserted',
      observationTime: new Date().toISOString(),
      evidenceRefs: [evidenceRef], classification: 'internal', purposeScope: 'analysis',
      payload: { subject, predicate, object_value: objectValue },
    };
    const r = await call<{ object: ObjRow; receipt: { policyDecisionId: string; auditSeq: number } }>(
      base, { ...scopeOver, action: 'objects.create', object_type: 'CLM' }, payload,
    );
    if (r.ok && r.data !== undefined) {
      setReceipt(r.data.receipt);
      setSubject(''); setPredicate(''); setObjectValue(''); setEvidenceRef('');
      await refresh();
    } else setError(r.error ?? null);
  }

  async function openObject(o: ObjRow) {
    if (base === null) return;
    setSelected(o);
    setAsOfResult(null);
    const r = await call<{ history: ObjRow[] }>(`${base}/${o.object_id}/get`, {
      ...scopeOver, action: 'objects.read', object_type: 'CLM', object_id: o.object_id, side_effect_class: 'none',
    }, { history: true });
    if (r.ok && r.data !== undefined) setHistory(r.data.history);
  }

  async function queryKnownAt() {
    if (base === null || selected === null || knownAt === '') return;
    const r = await call<{ object: ObjRow }>(`${base}/${selected.object_id}/get`, {
      ...scopeOver, action: 'objects.read', object_type: 'CLM', object_id: selected.object_id, side_effect_class: 'none',
    }, { knownAt: new Date(knownAt).toISOString() });
    if (r.ok && r.data !== undefined) setAsOfResult(r.data.object);
    else setError(r.error ?? null);
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>{t('objects.title', locale)}</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Scope">
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
          <select style={inputStyle} value={tenantId} onChange={(e) => { setTenantId(e.target.value); setDomainId(''); }}>
            <option value="">— tenant —</option>
            {tenants.map((tn) => <option key={tn.id} value={tn.id}>{tn.name}</option>)}
          </select>
          <select style={inputStyle} value={domainId} onChange={(e) => setDomainId(e.target.value)} disabled={tenantId === ''}>
            <option value="">— domain —</option>
            {(domainsByTenant[tenantId] ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </Panel>

      {base !== null && (
        <>
          <Panel title={t('objects.create', locale)}>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
              <input style={inputStyle} placeholder="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <input style={inputStyle} placeholder="predicate" value={predicate} onChange={(e) => setPredicate(e.target.value)} />
              <input style={inputStyle} placeholder="object value" value={objectValue} onChange={(e) => setObjectValue(e.target.value)} />
              <input style={inputStyle} placeholder="evidence ref (required — provenance)" value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} />
              <button style={buttonStyle} disabled={!subject || !predicate || !objectValue || !evidenceRef} onClick={() => void createClaim()}>
                {t('objects.create', locale)}
              </button>
            </div>
            <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              Writes without provenance are rejected (EYE-PRV-001) — leave the evidence ref empty to see the rejection.
            </p>
          </Panel>

          <Panel title="Objects (current view)">
            <table style={tableStyle}>
              <thead><tr><Th>Type</Th><Th>Truth</Th><Th>Lifecycle</Th><Th>Ver</Th><Th>Recorded</Th><Th>Payload</Th><Th>Digest</Th></tr></thead>
              <tbody>
                {objects.map((o) => (
                  <tr key={`${o.object_id}@${o.object_version}`} style={{ cursor: 'pointer' }} onClick={() => void openObject(o)}>
                    <Td mono>{o.object_type}</Td>
                    <Td><TruthBadge state={o.truth_state} /></Td>
                    <Td><LifecycleBadge state={o.lifecycle_state} /></Td>
                    <Td mono>{String(o.object_version)}</Td>
                    <Td mono>{new Date(o.recorded_at).toISOString().slice(0, 19)}Z</Td>
                    <Td>{JSON.stringify(o.payload).slice(0, 60)}</Td>
                    <Td mono>{o.content_digest.slice(0, 10)}…</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {selected !== null && (
            <Panel title={`${t('objects.history', locale)} — ${selected.object_id.slice(0, 13)}…`}>
              <table style={tableStyle}>
                <thead><tr><Th>Ver</Th><Th>Truth</Th><Th>Lifecycle</Th><Th>Recorded</Th><Th>Correction of</Th><Th>Evidence</Th><Th>Payload</Th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={String(h.object_version)}>
                      <Td mono>{String(h.object_version)}</Td>
                      <Td><TruthBadge state={h.truth_state} /></Td>
                      <Td><LifecycleBadge state={h.lifecycle_state} /></Td>
                      <Td mono>{new Date(h.recorded_at).toISOString().slice(0, 19)}Z</Td>
                      <Td mono>{h.correction_of ?? '—'}</Td>
                      <Td mono>{(h.evidence_refs ?? []).join(', ') || h.method_ref || '—'}</Td>
                      <Td>{JSON.stringify(h.payload).slice(0, 50)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-12)', alignItems: 'center' }}>
                <label>{t('objects.knownat', locale)}</label>
                <input style={inputStyle} type="datetime-local" value={knownAt} onChange={(e) => setKnownAt(e.target.value)} step={1} />
                <button style={buttonStyle} onClick={() => void queryKnownAt()}>Query</button>
                {asOfResult !== null && (
                  <span>
                    → version <strong>{String(asOfResult.object_version)}</strong>: {JSON.stringify(asOfResult.payload).slice(0, 50)}
                  </span>
                )}
              </div>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
