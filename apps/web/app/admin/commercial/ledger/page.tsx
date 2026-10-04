'use client';
/**
 * THE COST AND RESOURCE LEDGER — CP-6 B91 part `ledger` (0105 §LE; F-P7-F-02: IA-70-001/-002/-003/-005, DP-70-001/-002/-005, DQM-040,
 * DAT-DL-07, V10-T-016). One page, read in the signed-in session's own scope:
 *   the commercial authority (PLATFORM) — the rate cards (set a version from an instant), a tenant's ledger, its SYNTHETIC invoices (import,
 *     reconcile), the optimisation decisions (record one with its trade-offs; one touching a protected control is refused by the server);
 *   the tenant administrator (TENANT) — the budgets (declare; revise), and the ledger;
 *   a domain's reader or a budget's owner (DOMAIN) — the domain's view of the ledger; the owner revises its budget.
 * Everything renders VERBATIM from the server's answer as of the database instant it states: the variance, the run-rate forecast, the
 * thresholds raised, the anomaly, the reconciliation's differences. Usage the ledger could not price is shown UNPRICED, never zero; energy is
 * an ESTIMATE. Each act is reviewed before it is sent (PAT-07-lite) and its receipt shown.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSession } from '../../../../lib/api';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../../components/ui';
import {
  ADJUSTABLE_CONTROLS, DIMENSIONS, EVENT_LABEL, differencesOf, energyLine, ledger, money, varianceLine,
  type BudgetRow, type LedgerScope, type LedgerView, type PlatformView,
} from '../../../../lib/ledger-b91';

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' } as const;
const secondary = { ...buttonStyle, background: 'var(--eye-color-surface-secondary)', color: 'var(--eye-color-ink-default)', borderColor: 'var(--eye-color-border-default)' };
const row = { display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' as const, alignItems: 'end', marginBlock: 'var(--eye-space-8)' };
const iso = (local: string) => (local === '' ? '' : new Date(local).toISOString());

function scopeOf(): LedgerScope | null {
  const s = getSession()?.scope;
  if (s === undefined) return null;
  if (s.scope === 'PLATFORM') return { scope: 'PLATFORM' };
  if (s.scope === 'TENANT' && s.tenantId !== null) return { scope: 'TENANT', tenantId: s.tenantId };
  if (s.scope === 'DOMAIN' && s.tenantId !== null && s.domainId !== null) return { scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId };
  return null;
}

export default function LedgerPage() {
  const [scope] = useState<LedgerScope | null>(() => scopeOf());
  const [view, setView] = useState<LedgerView | null>(null);
  const [platform, setPlatform] = useState<PlatformView | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [review, setReview] = useState<{ what: string; run: () => Promise<void> } | null>(null);

  const refresh = useCallback(async () => {
    if (scope === null) return;
    if (scope.scope === 'PLATFORM') {
      const r = await ledger.readPlatform(tenantId === '' ? {} : { tenantId });
      if (r.ok && r.data !== undefined) { setPlatform(r.data.ledger); setView(r.data.ledger.tenant); } else setError(r.error ?? null);
    } else {
      const r = await ledger.read(scope);
      if (r.ok && r.data !== undefined) setView(r.data.ledger); else setError(r.error ?? null);
    }
  }, [scope, tenantId]);
  useEffect(() => { void refresh(); }, [refresh]);

  /** Every act: reviewed, then sent; the server's refusal shown verbatim, the receipt on success. */
  const act = (what: string, send: () => Promise<{ ok: boolean; data?: { receipt: Rcpt }; error?: Err | undefined }>) => setReview({ what, run: async () => {
    setError(null); setReview(null);
    const r = await send();
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); await refresh(); } else setError(r.error ?? null);
  } });

  if (scope === null) return <p role="alert">No session scope: sign in again (the page never guesses a tenant).</p>;
  const isPlatform = scope.scope === 'PLATFORM';
  const tenantScope = scope.scope === 'PLATFORM' ? null : scope;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Cost and resource ledger</h1>
      <p style={muted}>
        {scope.scope} scope{view !== null ? ` · as of ${view.as_of} (the database's instant) · window ${view.window.from} → ${view.window.to}` : ''} · every figure on this demonstration is SYNTHETIC ·
        invoices are SYNTHETIC — a real billing account is the external prerequisite for reconciling to actual cost
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {review !== null && (
        <div role="dialog" aria-label="review" style={{ border: '1px solid var(--eye-color-warning)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
          <p style={{ color: 'var(--eye-color-warning)', marginBlock: 0 }}>Review before sending: {review.what}</p>
          <div style={row}>
            <button style={buttonStyle} onClick={() => void review.run()}>Confirm</button>
            <button style={secondary} onClick={() => setReview(null)}>Cancel</button>
          </div>
        </div>
      )}

      {isPlatform && platform !== null && (
        <Panel title="Tenant">
          <label style={muted}>Tenant ledger{' '}
            <select style={inputStyle} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">— none (the vendor's records only) —</option>
              {platform.tenants.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>)}
            </select>
          </label>
        </Panel>
      )}

      {view !== null && <Budgets view={view} tenantScope={tenantScope} act={act} />}
      {view !== null && <Spend view={view} />}
      <RateCardsPanel cards={(platform ?? view)?.rate_cards ?? null} isPlatform={isPlatform} act={act} />
      {view !== null && <Invoices view={view} isPlatform={isPlatform} act={act} />}
      <Optimisations rows={view?.optimisations ?? platform?.optimisations ?? []} isPlatform={isPlatform} tenantId={view?.tenant_id ?? null} act={act} />
    </>
  );
}

type Act = (what: string, send: () => Promise<{ ok: boolean; data?: { receipt: Rcpt }; error?: Err | undefined }>) => void;

function Budgets({ view, tenantScope, act }: { view: LedgerView; tenantScope: Exclude<LedgerScope, { scope: 'PLATFORM' }> | null; act: Act }) {
  const [label, setLabel] = useState(''); const [cap, setCap] = useState('all'); const [kind, setKind] = useState('month'); const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState('EUR');
  const [owner, setOwner] = useState(''); const [reason, setReason] = useState(''); const [revising, setRevising] = useState<BudgetRow | null>(null);
  return (
    <Panel title="Budgets (variance, run-rate forecast, thresholds, anomaly)">
      <p style={muted}>A budget RAISES a commercial.usage item to its named owner at its thresholds and on a spend anomaly; it never stops, deletes or hides work.</p>
      <table style={tableStyle}>
        <thead><tr><Th>Budget</Th><Th>Scope</Th><Th>Owner</Th><Th>Variance and forecast</Th><Th>Recent events</Th><Th>{' '}</Th></tr></thead>
        <tbody>
          {view.budgets.map((b) => (
            <tr key={b.budget_id}>
              <Td>{b.label} · v{b.version} · {b.capability_key} · {b.period_kind} · {money(b.amount, b.currency)} · thresholds {b.thresholds.join('/')}% · anomaly k={b.anomaly_rule.k} over {b.anomaly_rule.window_days} days</Td>
              <Td>{b.scope}{b.domain_id !== null ? ` ${b.domain_id.slice(0, 8)}…` : ''}</Td>
              <Td mono>{b.owner_principal_id.slice(0, 13)}…</Td>
              <Td>{b.variance === null ? '—' : varianceLine(b.variance)}</Td>
              <Td>{b.events.slice(0, 4).map((e) => <div key={e.event_id}>{e.recorded_at.slice(0, 16)} · {EVENT_LABEL[e.event]}{e.threshold !== null ? ` (${e.threshold}%)` : ''}{e.day !== null ? ` (${e.day})` : ''}</div>)}</Td>
              <Td>{tenantScope !== null && <button style={secondary} onClick={() => { setRevising(b); setAmount(String(b.amount)); setOwner(b.owner_principal_id); setLabel(b.label); setCurrency(b.currency); }}>Revise</button>}</Td>
            </tr>
          ))}
          {view.budgets.length === 0 && <tr><Td>No budget is declared for this tenant.</Td></tr>}
        </tbody>
      </table>
      {tenantScope !== null && (
        <div>
          <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>{revising === null ? 'Declare a budget (the tenant administrator)' : `Revise "${revising.label}" (v${revising.version} → v${revising.version + 1}; the administrator or the owner)`}</h3>
          <div style={row}>
            <label style={muted}>Label <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
            {revising === null && <label style={muted}>Capability <input style={inputStyle} value={cap} onChange={(e) => setCap(e.target.value)} /></label>}
            {revising === null && <label style={muted}>Period <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}><option value="month">month</option><option value="quarter">quarter</option><option value="year">year</option></select></label>}
            <label style={muted}>Amount <input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label style={muted}>Currency <input style={{ ...inputStyle, inlineSize: '5em' }} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></label>
            <label style={muted}>Owner (principal id) <input style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)} /></label>
            <label style={muted}>Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button style={buttonStyle} disabled={label.length < 4 || amount === '' || owner === '' || reason.length < 8}
              onClick={() => act(revising === null ? `declare "${label}": ${amount} ${currency} per ${kind}, owner ${owner}` : `revise "${label}" to ${amount} ${currency}, owner ${owner}`,
                () => ledger.setBudget(tenantScope, revising === null
                  ? { label, capabilityKey: cap, periodKind: kind, amount, currency, ownerPrincipalId: owner, reason }
                  : { budgetId: revising.budget_id, expectedVersion: revising.version, label, amount, currency, ownerPrincipalId: owner, reason }))}>
              {revising === null ? 'Declare' : 'Revise'}
            </button>
            {revising !== null && <button style={secondary} onClick={() => setRevising(null)}>Cancel</button>}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Spend({ view }: { view: LedgerView }) {
  return (
    <Panel title="Spend, unit data cost and the energy ESTIMATE">
      {!view.complete && (
        <p role="status" style={{ color: 'var(--eye-color-warning)' }}>
          UNPRICED usage in the window (no rate in force): {view.unpriced.map((u) => `${u.dimension} ${u.unit} × ${u.usage_records}`).join('; ')} — the totals below are a floor, not complete.
        </p>
      )}
      <table style={tableStyle}>
        <thead><tr><Th>Dimension</Th><Th>Unit</Th><Th>Quantity</Th><Th>Amount</Th><Th>Entries</Th></tr></thead>
        <tbody>{view.totals.map((t) => <tr key={`${t.dimension}:${t.unit}:${t.currency}`}><Td>{t.dimension}</Td><Td>{t.unit}</Td><Td mono>{t.quantity}</Td><Td mono>{money(t.amount, t.currency)}</Td><Td>{t.entries}</Td></tr>)}</tbody>
      </table>
      <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Unit data cost (DQM-040: asset + tenant + deployment + product + consumer + window)</h3>
      <table style={tableStyle}>
        <thead><tr><Th>Asset</Th><Th>Deployment</Th><Th>Product</Th><Th>Consumer</Th><Th>Dimension</Th><Th>Unit cost</Th><Th>Amount</Th></tr></thead>
        <tbody>{view.unit_cost.map((u, i) => (
          <tr key={i}><Td>{u.asset_ref}</Td><Td>{u.profile}</Td><Td mono>{u.product_id?.slice(0, 8) ?? '—'}</Td><Td mono>{u.consumer_principal_id?.slice(0, 8) ?? '—'}</Td><Td>{u.dimension} ({u.unit})</Td>
            <Td mono>{money(u.unit_cost, u.currency)} / {u.unit}</Td><Td mono>{money(u.amount, u.currency)}</Td></tr>
        ))}</tbody>
      </table>
      <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Energy — an ESTIMATE</h3>
      <p style={muted}>{view.energy.basis}</p>
      <ul>{view.energy.rows.map((e) => <li key={`${e.dimension}:${e.unit}`}>{energyLine(e)}</li>)}</ul>
    </Panel>
  );
}

function RateCardsPanel({ cards, isPlatform, act }: { cards: LedgerView['rate_cards'] | null; isPlatform: boolean; act: Act }) {
  const [dim, setDim] = useState<string>('simulation_compute'); const [unit, setUnit] = useState(''); const [price, setPrice] = useState(''); const [currency, setCurrency] = useState('EUR');
  const [kwh, setKwh] = useState(''); const [basis, setBasis] = useState(''); const [from, setFrom] = useState(''); const [reason, setReason] = useState('');
  return (
    <Panel title="Rate cards (versioned from an instant)">
      <table style={tableStyle}>
        <thead><tr><Th>Card</Th><Th>In force</Th><Th>Energy coefficient</Th><Th>Scheduled</Th></tr></thead>
        <tbody>{(cards?.current ?? []).map((c) => (
          <tr key={c.rate_key}>
            <Td>{c.rate_key}</Td>
            <Td>{c.in_force === null ? 'none in force yet' : `v${c.in_force.version}: ${money(c.in_force.price_per_unit, c.in_force.currency)} per unit since ${c.in_force.effective_from}${c.in_force.synthetic ? ' (SYNTHETIC)' : ''}`}</Td>
            <Td>{c.in_force?.energy_kwh_per_unit != null ? `${c.in_force.energy_kwh_per_unit} kWh/unit — ESTIMATE: ${c.in_force.energy_basis}` : 'none (not estimated)'}</Td>
            <Td>{c.scheduled.map((s) => `v${s.version} from ${s.effective_from}`).join('; ') || '—'}</Td>
          </tr>
        ))}</tbody>
      </table>
      {isPlatform && (
        <div style={row}>
          <label style={muted}>Dimension <select style={inputStyle} value={dim} onChange={(e) => setDim(e.target.value)}>{DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
          <label style={muted}>Unit <input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
          <label style={muted}>Price per unit <input style={inputStyle} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label style={muted}>Currency <input style={{ ...inputStyle, inlineSize: '5em' }} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></label>
          <label style={muted}>kWh per unit (ESTIMATE) <input style={inputStyle} inputMode="decimal" value={kwh} onChange={(e) => setKwh(e.target.value)} /></label>
          <label style={muted}>Energy basis <input style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value)} /></label>
          <label style={muted}>Effective from <input type="datetime-local" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={muted}>Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button style={buttonStyle} disabled={unit === '' || price === '' || from === '' || reason.length < 8}
            onClick={() => act(`price ${dim}:${unit} at ${price} ${currency} from ${from} (SYNTHETIC)`, () => ledger.setRateCard({ dimension: dim, unit, pricePerUnit: price, currency,
              energyKwhPerUnit: kwh === '' ? null : kwh, energyBasis: kwh === '' ? null : basis, effectiveFrom: iso(from), synthetic: true, reason }))}>Set a version</button>
        </div>
      )}
    </Panel>
  );
}

function Invoices({ view, isPlatform, act }: { view: LedgerView; isPlatform: boolean; act: Act }) {
  const [ref, setRef] = useState(''); const [ps, setPs] = useState(''); const [pe, setPe] = useState(''); const [lines, setLines] = useState('[{"dimension":"simulation_compute","unit":"wall_s","quantity":0,"amount":0}]');
  const [tol, setTol] = useState('0.01');
  type Line = { dimension: string; unit: string; quantity: number; amount: number };
  let parsed: Line[] | null = null;
  try { const p = JSON.parse(lines) as unknown; parsed = Array.isArray(p) ? (p as Line[]) : null; } catch { parsed = null; }
  const total = parsed === null ? '' : (Math.round(parsed.reduce((a, l) => a + Number(l.amount) * 100, 0)) / 100).toFixed(2);
  return (
    <Panel title="Invoices and reconciliation (SYNTHETIC invoices)">
      {view.invoices.map((i) => (
        <div key={i.invoice_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
          <strong>{i.invoice_ref}</strong> · {i.period_start} → {i.period_end} · {money(i.total, i.currency)} · {i.synthetic ? 'SYNTHETIC' : ''}
          {i.reconciliations.map((r) => (
            <div key={r.reconciliation_id} style={muted}>
              reconciliation v{r.version} ({r.reconciled_at.slice(0, 16)}, tolerance {r.tolerance}): <strong>{r.outcome}</strong>{r.outcome === 'differences' ? ` — ${differencesOf(r).join('; ')}` : ''}
            </div>
          ))}
          {isPlatform && <button style={secondary} onClick={() => act(`reconcile ${i.invoice_ref} within ${tol} ${i.currency}`, () => ledger.reconcile(i.invoice_id, tol))}>Reconcile</button>}
        </div>
      ))}
      {view.invoices.length === 0 && <p style={muted}>No invoice imported.</p>}
      {isPlatform && (
        <div style={row}>
          <label style={muted}>Reference <input style={inputStyle} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label style={muted}>Period start <input type="date" style={inputStyle} value={ps} onChange={(e) => setPs(e.target.value)} /></label>
          <label style={muted}>Period end <input type="date" style={inputStyle} value={pe} onChange={(e) => setPe(e.target.value)} /></label>
          <label style={muted}>Lines (JSON) <textarea style={{ ...inputStyle, blockSize: '4em', inlineSize: '28em' }} value={lines} onChange={(e) => setLines(e.target.value)} /></label>
          <label style={muted}>Tolerance <input style={{ ...inputStyle, inlineSize: '6em' }} value={tol} onChange={(e) => setTol(e.target.value)} /></label>
          <button style={buttonStyle} disabled={ref === '' || ps === '' || pe === '' || parsed === null}
            onClick={() => act(`import SYNTHETIC invoice ${ref} (${ps} → ${pe}, total ${total} EUR)`, () => ledger.importInvoice({ tenantId: view.tenant_id, invoiceRef: ref, periodStart: ps, periodEnd: pe,
              currency: 'EUR', total, issuer: 'THE EYE vendor (SYNTHETIC)', synthetic: true, lines: parsed ?? [] }))}>Import SYNTHETIC invoice</button>
        </div>
      )}
    </Panel>
  );
}

function Optimisations({ rows, isPlatform, tenantId, act }: { rows: LedgerView['optimisations']; isPlatform: boolean; tenantId: string | null; act: Act }) {
  const [title, setTitle] = useState(''); const [control, setControl] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [tradeoff, setTradeoff] = useState(''); const [rationale, setRationale] = useState(''); const [decision, setDecision] = useState<'adopt' | 'defer'>('adopt');
  return (
    <Panel title="Optimisation decisions (trade-offs; never residency, isolation, retention or recovery)">
      <ul>{rows.map((o) => (
        <li key={o.decision_id}>{o.decided_at.slice(0, 16)} · <strong>{o.decision}</strong> · {o.title} · changes {o.changes.map((c) => c.control).join(', ')} · trade-offs: {o.tradeoffs.map((t) => `${t.dimension}: ${t.effect}`).join('; ')}</li>
      ))}</ul>
      {rows.length === 0 && <p style={muted}>No optimisation recorded.</p>}
      {isPlatform && (
        <div style={row}>
          <label style={muted}>Title <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label style={muted}>Control <input style={inputStyle} list="cle-controls" value={control} onChange={(e) => setControl(e.target.value)} /></label>
          <datalist id="cle-controls">{ADJUSTABLE_CONTROLS.map((c) => <option key={c} value={c} />)}</datalist>
          <label style={muted}>From <input style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label style={muted}>To <input style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label style={muted}>Trade-off (dimension: effect) <input style={inputStyle} value={tradeoff} onChange={(e) => setTradeoff(e.target.value)} /></label>
          <label style={muted}>Rationale <input style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} /></label>
          <label style={muted}>Decision <select style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value as 'adopt' | 'defer')}><option value="adopt">adopt</option><option value="defer">defer</option></select></label>
          <button style={buttonStyle} disabled={title.length < 4 || control === '' || to === '' || rationale.length < 8}
            onClick={() => {
              const [dimension, ...effect] = tradeoff.split(':');
              act(`${decision} "${title}": ${control} ${from} → ${to}`, () => ledger.recordOptimisation({ tenantId, title, decision, changes: [{ control, from, to }],
                tradeoffs: tradeoff.trim() === '' ? [] : [{ dimension: (dimension ?? '').trim(), effect: effect.join(':').trim() }], rationale }));
            }}>Record the decision</button>
        </div>
      )}
    </Panel>
  );
}
