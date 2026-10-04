'use client';
/**
 * USAGE METERS AND CAPS — CP-6 B91 part `meters` (0105 §ME; F-P7-F-02: the meters per tenant, capability and profile, with caps).
 * The tenant's administrator reads every meter (model inference in calls — the gateway records no tokens; source consumption in requests
 * and bytes; simulation compute in wall time; storage in evidence bytes; data product consumption in events and servings), the caps with
 * their standing, the breaches and the latest records; and sets a cap (review → confirm; the server bounds it by the licence). A domain
 * reader sees its domain. Everything renders from the server's record only; a refusal is shown verbatim.
 *
 * THE BOUNDARY: a cap makes NEW work unavailable, explained — it never deletes work, never removes a control; only simulation compute
 * has an admission point that stops (the experiment claim and the envelope sweep), every other cap warns.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession } from '../../../../lib/api';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../../components/ui';
import {
  DIMENSIONS, STOPPABLE, UNITS, breachLine, capLine, dimensionLabel, licenceLine, quantity, readUsage, setCap,
  type CapIntake, type Dimension, type Scope, type Usage,
} from '../../../../lib/meters-b91';

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
const secondary = { ...buttonStyle, background: 'var(--eye-color-surface-secondary)', color: 'var(--eye-color-ink-default)', borderColor: 'var(--eye-color-border-default)' };
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' } as const;

export default function UsagePage() {
  const [scope, setScope] = useState<Scope | null>(null);
  const [platformTenant, setPlatformTenant] = useState('');
  const [isPlatform, setIsPlatform] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [intake, setIntake] = useState<CapIntake>({ dimension: 'simulation_compute', unit: 'wall_ms', period: 'day', limit: 3_600_000, action: 'stop', reason: '' });
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s?.scope === undefined) return;
    if (s.scope.scope === 'PLATFORM') { setIsPlatform(true); return; }
    if (s.scope.tenantId !== null) setScope({ tenantId: s.scope.tenantId, domainId: s.scope.scope === 'DOMAIN' ? s.scope.domainId : null });
  }, []);

  const refresh = useCallback(async () => {
    if (scope === null) return;
    const r = await readUsage(scope);
    if (r.ok && r.data !== undefined) { setUsage(r.data.usage); setError(null); } else setError(r.error ?? null);
  }, [scope]);
  useEffect(() => { void refresh(); }, [refresh]);

  const isTenantAdmin = scope !== null && scope.domainId === null && (getSession()?.bindings ?? []).some((b) => b.roleCode === 'tenant_admin' && b.scope === 'TENANT' && b.tenantId === scope.tenantId);
  const stopAllowed = STOPPABLE.includes(intake.dimension);

  async function confirmCap() {
    if (scope === null) return;
    setError(null);
    const r = await setCap(scope.tenantId, { ...intake, action: stopAllowed ? intake.action : 'warn' });
    setReviewing(false);
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setIntake((x) => ({ ...x, reason: '' })); await refresh(); } else setError(r.error ?? null);
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Usage meters and caps</h1>
      <p style={muted}>
        The meters record what the platform measured, per tenant, domain, capability and profile. A cap stops <em>new</em> work only where an
        admission point enforces it (simulation compute); every other cap warns. No cap deletes work, removes a control or acts for a person.
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      {isPlatform && scope === null ? (
        <Panel title="Tenant">
          <label style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center' }}>
            Tenant id
            <input style={inputStyle} value={platformTenant} onChange={(e) => setPlatformTenant(e.target.value.trim())} />
          </label>
          <button style={{ ...buttonStyle, marginBlockStart: 'var(--eye-space-8)' }} disabled={platformTenant.length !== 36} onClick={() => setScope({ tenantId: platformTenant, domainId: null })}>Read the meters</button>
        </Panel>
      ) : null}

      {usage !== null ? (
        <>
          <Panel title="Licence">
            <p data-testid="licence-line">{licenceLine(usage.licence)}</p>
            <p style={muted}>As of {usage.at.slice(0, 19).replace('T', ' ')} UTC (the database&apos;s clock) · {usage.domain_id === null ? 'the whole tenant' : `domain ${usage.domain_id.slice(0, 8)}`}</p>
          </Panel>

          <Panel title="Meters">
            <table style={tableStyle} aria-label="Meters">
              <thead><tr><Th>Dimension</Th><Th>Unit</Th><Th>Capability</Th><Th>Today</Th><Th>This month</Th><Th>All time</Th><Th>Records</Th></tr></thead>
              <tbody>
                {usage.meters.map((m) => (
                  <tr key={`${m.dimension}/${m.unit}`}>
                    <Td>{dimensionLabel(m.dimension)}{m.gauge ? ' (latest sample)' : ''}</Td><Td>{m.unit}</Td><Td>{m.capability}</Td>
                    <Td>{quantity(m.today, m.unit)}</Td><Td>{quantity(m.this_month, m.unit)}</Td><Td>{quantity(m.all_time, m.unit)}</Td><Td>{m.records}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usage.meters.length === 0 ? <p style={muted}>Nothing metered yet.</p> : null}
            <ul style={muted} aria-label="Not metered">{usage.not_metered.map((n) => <li key={n}>Not metered: {n}</li>)}</ul>
          </Panel>

          <Panel title="Caps">
            <ul aria-label="Caps" style={{ paddingInlineStart: 'var(--eye-space-16)' }}>
              {usage.caps.map((c) => (
                <li key={`${c.cap_id}@${c.version}`} style={{ color: c.reached ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-default)' }}>
                  {capLine(c)} <span style={muted}>(v{c.version}{c.scope === 'DOMAIN' ? `, domain ${String(c.domain_id).slice(0, 8)}` : ', the tenant'}{c.licence !== null ? `, licence v${c.licence.version}` : ', uncontracted'} — {c.reason})</span>
                </li>
              ))}
            </ul>
            {usage.caps.length === 0 ? <p style={muted}>No cap is set: nothing is stopped or warned for usage.</p> : null}

            {isTenantAdmin ? (
              !reviewing ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', alignItems: 'end', marginBlockStart: 'var(--eye-space-8)' }}>
                  <label style={{ display: 'flex', flexDirection: 'column' }}>Dimension
                    <select style={inputStyle} value={intake.dimension} onChange={(e) => { const d = e.target.value as Dimension; setIntake((x) => ({ ...x, dimension: d, unit: UNITS[d][0] ?? null, action: STOPPABLE.includes(d) ? x.action : 'warn' })); }}>
                      {DIMENSIONS.map((d) => <option key={d} value={d}>{dimensionLabel(d)}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column' }}>Unit
                    <select style={inputStyle} value={intake.unit ?? ''} onChange={(e) => setIntake((x) => ({ ...x, unit: e.target.value }))}>
                      {UNITS[intake.dimension].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column' }}>Period
                    <select style={inputStyle} value={intake.period} onChange={(e) => setIntake((x) => ({ ...x, period: e.target.value as 'day' | 'month' }))}>
                      <option value="day">day</option><option value="month">month</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column' }}>Limit
                    <input style={inputStyle} type="number" min={1} value={intake.limit} onChange={(e) => setIntake((x) => ({ ...x, limit: Number(e.target.value) }))} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column' }}>Action
                    <select style={inputStyle} value={stopAllowed ? intake.action : 'warn'} onChange={(e) => setIntake((x) => ({ ...x, action: e.target.value as 'stop' | 'warn' }))}>
                      {stopAllowed ? <option value="stop">stop new work</option> : null}
                      <option value="warn">warn only</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', flex: 1, minInlineSize: '240px' }}>Reason
                    <input style={inputStyle} value={intake.reason} onChange={(e) => setIntake((x) => ({ ...x, reason: e.target.value }))} />
                  </label>
                  <button style={buttonStyle} disabled={intake.reason.trim().length < 8 || !(intake.limit > 0)} onClick={() => setReviewing(true)}>Review the cap</button>
                  {!stopAllowed ? <p style={{ ...muted, flexBasis: '100%' }}>{intake.dimension === 'model_inference' ? 'Model inference is warn only: a stop at the gateway would refuse an extraction mid-run.' : 'Warn only: no admission point enforces a stop on this dimension.'}</p> : null}
                </div>
              ) : (
                <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                  <p style={{ color: 'var(--eye-color-warning)' }}>
                    Set {dimensionLabel(intake.dimension)} · {quantity(intake.limit, intake.unit ?? '')} per {intake.period} · {stopAllowed && intake.action === 'stop' ? 'stop new work at admission' : 'warn only'} — {intake.reason}.
                    The server bounds it by the licence and supersedes the live cap of the same dimension, unit and period.
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
                    <button style={buttonStyle} onClick={() => void confirmCap()}>Confirm the cap</button>
                    <button style={secondary} onClick={() => setReviewing(false)}>Cancel</button>
                  </div>
                </div>
              )
            ) : <p style={muted}>A cap is set by the tenant&apos;s administrator.</p>}
          </Panel>

          <Panel title="Breaches">
            <ul aria-label="Breaches" style={{ paddingInlineStart: 'var(--eye-space-16)' }}>
              {usage.breaches.map((b) => <li key={b.breach_id}>{b.occurred_at.slice(0, 19).replace('T', ' ')} UTC — {breachLine(b)}</li>)}
            </ul>
            {usage.breaches.length === 0 ? <p style={muted}>No cap was reached.</p> : null}
          </Panel>

          {usage.domains !== null && usage.domains.length > 0 ? (
            <Panel title="By domain (this month)">
              <table style={tableStyle} aria-label="By domain">
                <thead><tr><Th>Domain</Th><Th>Dimension</Th><Th>This month</Th></tr></thead>
                <tbody>{usage.domains.map((d) => <tr key={`${d.domain_id}/${d.dimension}/${d.unit}`}><Td>{d.domain ?? d.domain_id.slice(0, 8)}</Td><Td>{dimensionLabel(d.dimension)} ({d.unit})</Td><Td>{quantity(d.this_month, d.unit)}</Td></tr>)}</tbody>
              </table>
            </Panel>
          ) : null}

          <Panel title="Latest records">
            <table style={tableStyle} aria-label="Latest records">
              <thead><tr><Th>When (UTC)</Th><Th>Dimension</Th><Th>Quantity</Th><Th>Source</Th><Th>Profile</Th></tr></thead>
              <tbody>
                {usage.records.map((r) => (
                  <tr key={r.usage_id}>
                    <Td>{r.occurred_at.slice(0, 19).replace('T', ' ')}</Td><Td>{dimensionLabel(r.dimension)}</Td><Td>{quantity(Number(r.quantity), r.unit)}</Td>
                    <Td mono>{r.source_kind}:{r.source_ref.slice(0, 13)}</Td><Td>{r.profile}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      ) : null}
    </>
  );
}
