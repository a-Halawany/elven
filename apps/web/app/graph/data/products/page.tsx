'use client';
/**
 * Data products — the registry (CP-6 B90 part `products`, 0095 §0 + §R; F-P7-F-09; DP-41-002).
 *
 * THE LIST: every governed data product of the domain with its state, its owner, its released version and the verdict of its latest
 * SCORECARD (computed by the schedule, never on read) — each a link to the product's own page. THE REGISTRATION: the owner's or the
 * steward's act (the identity, the kind among App G's twenty, the purpose, the OWNER — a named human). Every state and verdict here is the
 * server's, AS OF the instant the answer states; nothing is computed on the client.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../../layout';
import { products, OVERALL_LABEL, PRODUCT_KINDS, STATE_LABEL, short, type ProductListRow } from '../../../../lib/products-b90';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../strategy/form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;

export default function ProductsPage() {
  const { scope, me } = useShell();
  const mayRegister = me.bindings.some((b) => ['platform_admin', 'domain_admin', 'data_steward', 'executive', 'executive_operator', 'domain_analyst', 'forecast_owner', 'strategy_owner', 'knowledge_owner', 'twin_owner', 'risk_owner', 'decision_owner'].includes(b.roleCode));
  const isSteward = me.bindings.some((b) => ['platform_admin', 'domain_admin', 'data_steward'].includes(b.roleCode));
  const [rows, setRows] = useState<ProductListRow[] | null>(null);
  const [at, setAt] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [stateFilter, setStateFilter] = useState('');
  // the registration form
  const [key, setKey] = useState(''); const [title, setTitle] = useState(''); const [kind, setKind] = useState('dataset'); const [purpose, setPurpose] = useState(''); const [owner, setOwner] = useState('');

  const load = async () => {
    const r = await products.list(scope, stateFilter === '' ? {} : { state: stateFilter });
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the products could not be read'); return; }
    setRows(r.data.products); setAt(r.data.at); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope, stateFilter]);
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await load();
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the data products…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Data products</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        A data product is an accountable operational contract, not a renamed table: an owner (a named human), a versioned declaration (contract, serving modes,
        inputs, outputs, SLO, policy, cost, quality), reviews by someone other than the owner, consumers who accept the contract themselves, and a scorecard the
        schedule computes. Every state and verdict here is the server&apos;s, as of {at === '' ? 'the read' : fmtInstant(at)}.
      </p>

      <label htmlFor="state-filter">State</label>
      <select id="state-filter" style={inputStyle} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
        <option value="">— every state —</option>
        {(Object.keys(STATE_LABEL) as Array<keyof typeof STATE_LABEL>).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      {rows.length === 0 ? <Empty>No data product is registered in this domain{stateFilter === '' ? '' : ` in the state ${stateFilter}`}.</Empty> : (
        <table style={tableStyle} aria-label="data products">
          <thead><tr><Th>Product</Th><Th>Kind</Th><Th>State</Th><Th>Owner</Th><Th>Released</Th><Th>Scorecard</Th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.product_id}>
                <Td><Link href={`/graph/data/products/${p.product_id}`}>{p.title}</Link><br /><Mono>{p.product_key}</Mono></Td>
                <Td>{p.kind}</Td>
                <Td><span aria-label="product state">{STATE_LABEL[p.state]}</span></Td>
                <Td mono>{short(p.owner_principal_id)}</Td>
                <Td>{p.released_version === null ? 'none' : `v${p.released_version}`}{p.current_version > (p.released_version ?? 0) ? ` (v${p.current_version} declared)` : ''}</Td>
                <Td>{p.scorecard === null ? <span aria-label="scorecard verdict">no scorecard yet — the schedule computes one per tick on a released product</span>
                  : <span aria-label="scorecard verdict">{OVERALL_LABEL[p.scorecard.overall]} · {p.scorecard.attainment_pct === null ? 'attainment unknown' : `${p.scorecard.attainment_pct}% vs floor ${p.scorecard.floor_pct}%`} · {fmtInstant(p.scorecard.computed_at)}</span>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mayRegister ? (
        <section aria-labelledby="register-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="register-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Register a product</h2>
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>{isSteward ? 'As a steward you may name another owner; ' : ''}the owner is a named, active human of the tenant. A declaration (a version) follows on the product&apos;s page; a release needs an accepted admission review by someone else.</p>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
            <label htmlFor="key">Key (2–64 lower-case letters, digits, dots and dashes)</label>
            <input id="key" style={inputStyle} value={key} onChange={(e) => setKey(e.target.value)} />
            <label htmlFor="title">Title</label>
            <input id="title" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="kind">Kind (App G&apos;s twenty product patterns)</label>
            <select id="kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>{PRODUCT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
            <label htmlFor="purpose">Purpose (8 characters or more)</label>
            <input id="purpose" style={inputStyle} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <label htmlFor="owner">Owner principal id (empty: yourself)</label>
            <input id="owner" style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)} />
            <div><GovernedButton label="Register product" pendingLabel="registering" disabled={key.trim().length < 2 || title.trim().length < 2 || purpose.trim().length < 8}
              onRun={run(() => products.register(scope, { key: key.trim(), title: title.trim(), kind, purpose: purpose.trim(), ownerPrincipalId: owner.trim() === '' ? me.principalId : owner.trim() }))} /></div>
          </div>
          <Receipt receipt={receipt} />
        </section>
      ) : null}
    </>
  );
}
