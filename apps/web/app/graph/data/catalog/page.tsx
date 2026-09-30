'use client';
/**
 * The Metadata Catalog (DAT-TR-01) — CP-6 B90 part `catalog` (0095 §K; F-P7-F-11; V7 ch49 DP-49-001..006).
 *
 * THE SEARCH: full text over the catalog, served DISCOVERABLE entries within the reader's clearance only; what is hidden is counted, never
 * shown. THE HITS: owner, kind, the flags in words, trusted / discoverable. THE ASSET PANEL: the lineage upstream and downstream, the
 * glossary terms, the quality and the SLO, the flags with since and reason, the ledger. THE COVERAGE DEBT: per kind — total, owned,
 * trusted, discoverable, with lineage, the flags — and the last reconciliation. THE STEWARD's acts: register a staging or external asset,
 * set an owner, declare lineage, define a term, run the reconciliation. THE OWNER's act: recertify their ownership. Nothing here is
 * computed on the client: every mark and every count is the server's, AS OF the instant the answer states.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { catalog, CATALOG_KINDS, CLASSIFICATIONS, FLAG_KINDS, KIND_LABEL, LINEAGE_KINDS, LINEAGE_LABEL, coverageLine, dayOf, flagLine, hiddenLine, lineageLine, trustLine,
  type AssetRow, type AssetView, type CatalogKind, type Classification, type Coverage, type FlagKind, type LineageKind, type RunRow, type SearchAnswer, type TermRow } from '../../../../lib/catalog-b90';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, Receipt } from '../../strategy/form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;

export default function CatalogPage() {
  const { scope, me } = useShell();
  const isSteward = me.bindings.some((b) => (b.roleCode === 'platform_admin') || ((b.roleCode === 'data_steward' || b.roleCode === 'domain_admin') && b.domainId === me.homeDomainId));
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the search
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | CatalogKind>('');
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  // the panel
  const [assetId, setAssetId] = useState('');
  const [view, setView] = useState<AssetView | null>(null);
  // the acts' inputs
  const [ownerId, setOwnerId] = useState('');
  const [flagKind, setFlagKind] = useState<FlagKind>('inconsistent'); const [flagReason, setFlagReason] = useState('');
  const [toAsset, setToAsset] = useState(''); const [edgeKind, setEdgeKind] = useState<LineageKind>('feeds');
  // the register form
  const [rKind, setRKind] = useState<CatalogKind>('staging'); const [rRef, setRRef] = useState(''); const [rTitle, setRTitle] = useState(''); const [rDesc, setRDesc] = useState('');
  const [rOwner, setROwner] = useState(''); const [rClass, setRClass] = useState<Classification>('internal'); const [rTerms, setRTerms] = useState('');
  // the term form
  const [tTerm, setTTerm] = useState(''); const [tDef, setTDef] = useState(''); const [tOwner, setTOwner] = useState('');

  const loadAll = async () => {
    const [c, a, t] = await Promise.all([catalog.coverage(scope), catalog.list(scope, { limit: 500 }), catalog.terms(scope)]);
    if (!c.ok || c.data === undefined) { setProblem(c.error?.message ?? 'the coverage could not be read'); return; }
    setCoverage(c.data.coverage); setRuns(c.data.runs);
    if (a.ok && a.data !== undefined) setAssets(a.data.assets);
    if (t.ok && t.data !== undefined) setTerms(t.data.terms);
  };
  const loadView = async () => {
    if (assetId === '') { setView(null); return; }
    const r = await catalog.read(scope, assetId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the asset could not be read'); return; }
    setView(r.data.asset);
  };
  useEffect(() => { void loadAll(); }, [scope]);
  useEffect(() => { void loadView(); }, [scope, assetId]);
  const reload = async () => { await loadAll(); await loadView(); if (answer !== null) await search(); };
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await reload();
  };
  const search = async () => {
    const r = await catalog.search(scope, q, kind === '' ? null : [kind]);
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the search was refused');
    setAnswer(r.data.search); setReceipt(r.data.receipt);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (coverage === null) return <Empty>reading the catalog…</Empty>;
  const isOwner = view !== null && view.owner_principal_id === me.principalId;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Metadata Catalog</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        One entry per data asset — a schema, a canonical field, a source, a data product, a staging or an external asset — with its owner, classification, contracts,
        lineage, glossary, quality, service levels and lifecycle. The catalog describes and indexes authority; the owning registries stay authoritative. A search serves
        discoverable entries within your clearance and counts what it hides. Every mark here is the server&apos;s, as of {fmtInstant(coverage.at)}.
      </p>

      <section aria-labelledby="search-h" style={{ ...cardStyle }}>
        <h2 id="search-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Search</h2>
        <label htmlFor="q">Search the catalog (title, description, reference, glossary term, owner)</label>
        <input id="q" style={inputStyle} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search().catch((err: Error) => setProblem(err.message)); }} />
        <label htmlFor="kind">Kind</label>
        <select id="kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as '' | CatalogKind)}>
          <option value="">— every kind —</option>
          {CATALOG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <div><GovernedButton label="Search" pendingLabel="searching" onRun={search} /></div>
        {answer === null ? null : (
          <>
            <LiveStatus><span aria-label="hidden line">{hiddenLine(answer)}</span> · your clearance is {answer.clearance}</LiveStatus>
            {answer.hits.length === 0 ? <Empty>No discoverable entry matches.</Empty> : (
              <ul aria-label="catalog hits" style={{ paddingInlineStart: '1rem' }}>
                {answer.hits.map((h) => (
                  <li key={h.asset_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                    <button type="button" onClick={() => setAssetId(h.asset_id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', textDecoration: 'underline' }}>{h.title}</button>
                    {' '}· {KIND_LABEL[h.kind]} <Mono>{h.ref}</Mono> · owner {h.owner_name ?? '— none'} · <span aria-label="trust line">{trustLine(h)}</span>
                    {h.flags.length === 0 ? null : <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{h.flags.map((f) => <li key={f.kind}>{flagLine(f)}</li>)}</ul>}
                    {h.upstream.length + h.downstream.length === 0 ? null : (
                      <ul aria-label={`lineage of ${h.title}`} style={{ margin: 0, paddingInlineStart: '1rem' }}>
                        {h.upstream.map((n) => <li key={n.edge_id}>{lineageLine('upstream', n)}</li>)}
                        {h.downstream.map((n) => <li key={n.edge_id}>{lineageLine('downstream', n)}</li>)}
                      </ul>
                    )}
                    {h.product !== null && h.product.released_version !== null ? <span> · released v{h.product.released_version}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {view === null ? null : (
        <section aria-labelledby="asset-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="asset-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{view.title}</h2>
          <dl>
            <DefinitionRow term="Identity">{KIND_LABEL[view.kind]} · <Mono>{view.ref}</Mono></DefinitionRow>
            <DefinitionRow term="Owner">{view.owner_name ?? '— none (coverage debt)'}{view.owner_principal_id ? <> <Mono>{view.owner_principal_id.slice(0, 8)}…</Mono> · recertify by {dayOf(view.recertify_by)}</> : null}</DefinitionRow>
            <DefinitionRow term="Classification · lifecycle">{view.classification} · {view.lifecycle_state}</DefinitionRow>
            <DefinitionRow term="Trust"><span aria-label="asset trust line">{trustLine(view)}</span></DefinitionRow>
            <DefinitionRow term="Observed">{view.last_observed_at === null ? 'no registry observation (declared as is)' : `last seen in its registry ${fmtInstant(view.last_observed_at)}`}</DefinitionRow>
            {view.description ? <DefinitionRow term="Description">{view.description}</DefinitionRow> : null}
            <DefinitionRow term="Glossary terms">{view.terms.length === 0 ? (view.glossary_terms.length === 0 ? 'none' : view.glossary_terms.join(', ') + ' (not defined in the glossary)') : (
              <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{view.terms.map((t) => <li key={t.term_id}><strong>{t.term}</strong> — {t.definition} (owner {t.owner_name ?? t.owner_principal_id.slice(0, 8)}, v{t.version})</li>)}</ul>
            )}</DefinitionRow>
            {view.product !== null ? <DefinitionRow term="Product">{view.product.product_key} · {view.product.state}{view.product.released_version !== null ? ` · released v${view.product.released_version}` : ' · not released'}
              {Object.keys(view.product.slo).length === 0 ? ' · no SLO observation' : <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{Object.entries(view.product.slo).map(([m, o]) => <li key={m}>{m}: {o.value}{o.threshold !== null ? ` / ${o.threshold}` : ''} · {o.met ? 'met' : 'NOT MET'} · {fmtInstant(o.observed_at)}</li>)}</ul>}</DefinitionRow> : null}
          </dl>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Flags</h3>
          {view.flags.length === 0 ? <Empty>No flag stands on this asset.</Empty> : <ul aria-label="flags" style={{ paddingInlineStart: '1rem' }}>{view.flags.map((f) => <li key={f.kind}>{flagLine(f)}</li>)}</ul>}
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Lineage</h3>
          {view.upstream.length === 0 ? <Empty>No upstream lineage is declared.</Empty> : <ul aria-label="upstream" style={{ paddingInlineStart: '1rem' }}>{view.upstream.map((n) => <li key={n.edge_id}><button type="button" onClick={() => setAssetId(n.asset_id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>{lineageLine('upstream', n)}</button> · declared {fmtInstant(n.declared_at)}</li>)}</ul>}
          {view.downstream.length === 0 ? <Empty>No downstream lineage is declared.</Empty> : <ul aria-label="downstream" style={{ paddingInlineStart: '1rem' }}>{view.downstream.map((n) => <li key={n.edge_id}><button type="button" onClick={() => setAssetId(n.asset_id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>{lineageLine('downstream', n)}</button> · declared {fmtInstant(n.declared_at)}</li>)}</ul>}
          <details><summary>quality · SLO · contracts · locations</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--eye-type-label-sm)' }}>{JSON.stringify({ quality: view.quality, slo: view.slo, contracts: view.contracts, locations: view.locations, consumers: view.consumers, release: view.release }, null, 1)}</pre></details>
          <details><summary>ledger ({view.events.length})</summary><ul style={{ paddingInlineStart: '1rem' }}>{view.events.map((e) => <li key={e.event_id}>{e.event} · {fmtInstant(e.occurred_at)}{e.details['flag'] ? ` · ${String(e.details['flag'])}` : ''}{e.details['reason'] ? ` — ${String(e.details['reason'])}` : ''}</li>)}</ul></details>

          {isOwner ? (
            <div style={{ marginBlockStart: 'var(--eye-space-16)' }}>
              <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>You own this asset: recertifying moves the date forward by {coverage.recertification_period} and clears a lapse.</p>
              <GovernedButton label="Recertify my ownership" pendingLabel="recertifying" onRun={run(() => catalog.recertify(scope, view.asset_id))} />
            </div>
          ) : null}
          {isSteward ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)' }}>
              <label htmlFor="owner-id">Set the owner (principal id — a named, active human)</label>
              <input id="owner-id" style={inputStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} />
              <div><GovernedButton label="Set owner" pendingLabel="setting" disabled={ownerId.trim().length < 32} onRun={run(() => catalog.setOwner(scope, view.asset_id, ownerId.trim()))} /></div>
              <label htmlFor="edge-to">Declare lineage: this asset → (kind) → the target</label>
              <select id="edge-kind" aria-label="Lineage kind" style={inputStyle} value={edgeKind} onChange={(e) => setEdgeKind(e.target.value as LineageKind)}>{LINEAGE_KINDS.map((k) => <option key={k} value={k}>{LINEAGE_LABEL[k]}</option>)}</select>
              <select id="edge-to" style={inputStyle} value={toAsset} onChange={(e) => setToAsset(e.target.value)}>
                <option value="">— choose the target —</option>
                {assets.filter((a) => a.asset_id !== view.asset_id).map((a) => <option key={a.asset_id} value={a.asset_id}>{a.title} · {KIND_LABEL[a.kind]}</option>)}
              </select>
              <div><GovernedButton label="Declare lineage" pendingLabel="declaring" disabled={toAsset === ''} onRun={run(() => catalog.declareLineage(scope, { fromAssetId: view.asset_id, toAssetId: toAsset, kind: edgeKind }))} /></div>
              <label htmlFor="flag-kind">Flag by hand (or clear a flag)</label>
              <select id="flag-kind" style={inputStyle} value={flagKind} onChange={(e) => setFlagKind(e.target.value as FlagKind)}>{FLAG_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select>
              <label htmlFor="flag-reason">Reason (8 characters or more)</label>
              <input id="flag-reason" style={inputStyle} value={flagReason} onChange={(e) => setFlagReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                <GovernedButton label="Set flag" pendingLabel="flagging" disabled={flagReason.trim().length < 8} onRun={run(() => catalog.flag(scope, view.asset_id, flagKind, flagReason, false))} />
                <GovernedButton label="Clear flag" pendingLabel="clearing" variant="quiet" disabled={flagReason.trim().length < 8} onRun={run(() => catalog.flag(scope, view.asset_id, flagKind, flagReason, true))} />
              </div>
            </div>
          ) : null}
        </section>
      )}

      <section aria-labelledby="coverage-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="coverage-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Coverage debt</h2>
        <LiveStatus><span aria-label="coverage totals">
          {coverage.totals.total} entries · {coverage.totals.unowned} unowned · {coverage.totals.untrusted} untrusted · {coverage.totals.undiscoverable} undiscoverable · {coverage.totals.lineage_covered} with lineage · {coverage.totals.flagged} flagged · {coverage.open_items} open coverage item(s)
        </span></LiveStatus>
        {Object.keys(coverage.kinds).length === 0 ? <Empty>The catalog is empty — a reconciliation creates the entries from the registries.</Empty> : (
          <ul aria-label="coverage debt" style={{ paddingInlineStart: '1rem' }}>
            {Object.entries(coverage.kinds).sort(([a], [b]) => a.localeCompare(b)).map(([k, s]) => <li key={k}>{coverageLine(k, s)}</li>)}
          </ul>
        )}
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
          {coverage.last_reconciliation === null ? 'No reconciliation has run in this domain.' : `Last reconciliation ${fmtInstant(coverage.last_reconciliation.finished_at)} (${coverage.last_reconciliation.trigger}): ${coverage.last_reconciliation.counts.seen} seen · ${coverage.last_reconciliation.counts.created} created · ${coverage.last_reconciliation.counts.cleared} cleared · ${coverage.last_reconciliation.counts.attention_items} attention item(s)`}
          {' '}· staleness {coverage.staleness_period} · recertification {coverage.recertification_period}
        </p>
        {isSteward ? <div><GovernedButton label="Run the reconciliation" pendingLabel="reconciling" onRun={run(() => catalog.reconcile(scope))} /></div> : null}
        {runs.length === 0 ? null : <details><summary>runs ({runs.length})</summary><ul style={{ paddingInlineStart: '1rem' }}>{runs.map((r) => <li key={r.run_id}>{fmtInstant(r.finished_at)} · {r.trigger} · {r.counts.seen} seen · {r.counts.created} created · flags {JSON.stringify(r.counts.flagged_by_kind)} · {r.counts.cleared} cleared</li>)}</ul></details>}
      </section>

      <section aria-labelledby="entries-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="entries-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Entries</h2>
        <label htmlFor="asset">Asset</label>
        <select id="asset" style={inputStyle} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
          <option value="">— choose —</option>
          {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.title} · {KIND_LABEL[a.kind]}{a.flags.length > 0 ? ` · ${a.flags.map((f) => f.kind.replace('_', ' ')).join(', ')}` : ''}</option>)}
        </select>
      </section>

      <section aria-labelledby="glossary-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="glossary-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Glossary</h2>
        {terms.length === 0 ? <Empty>No term is defined in this domain.</Empty> : <ul aria-label="glossary" style={{ paddingInlineStart: '1rem' }}>{terms.map((t) => <li key={t.term_id}><strong>{t.term}</strong> — {t.definition} · owner {t.owner_name ?? t.owner_principal_id.slice(0, 8)} · v{t.version}</li>)}</ul>}
        {isSteward ? (
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
            <label htmlFor="t-term">Term</label><input id="t-term" style={inputStyle} value={tTerm} onChange={(e) => setTTerm(e.target.value)} />
            <label htmlFor="t-def">Definition (8 characters or more)</label><input id="t-def" style={inputStyle} value={tDef} onChange={(e) => setTDef(e.target.value)} />
            <label htmlFor="t-owner">Term owner (principal id)</label><input id="t-owner" style={inputStyle} value={tOwner} onChange={(e) => setTOwner(e.target.value)} />
            <div><GovernedButton label="Define term" pendingLabel="defining" disabled={tTerm.trim().length < 2 || tDef.trim().length < 8 || tOwner.trim().length < 32} onRun={run(() => catalog.defineTerm(scope, { term: tTerm, definition: tDef, ownerPrincipalId: tOwner.trim() }))} /></div>
          </div>
        ) : null}
      </section>

      {!isSteward ? (
        <UnknownNote>
          Registering an asset, setting an owner, declaring lineage, defining a term, flagging and running the reconciliation are the data steward&apos;s acts (<Mono>data_steward</Mono>);
          an owner registers their own asset and recertifies their ownership. The attention tick reconciles the catalog on its schedule.
        </UnknownNote>
      ) : (
        <section aria-labelledby="register-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="register-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Register an asset</h2>
          <label htmlFor="r-kind">Kind (a staging or external asset is accepted as declared; a registry kind by its reference)</label>
          <select id="r-kind" style={inputStyle} value={rKind} onChange={(e) => setRKind(e.target.value as CatalogKind)}>{CATALOG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          <label htmlFor="r-ref">Reference (a table, a file drop, an extract; a schema TYPE@vN; a source key; a product id)</label><input id="r-ref" style={inputStyle} value={rRef} onChange={(e) => setRRef(e.target.value)} />
          <label htmlFor="r-title">Title</label><input id="r-title" style={inputStyle} value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
          <label htmlFor="r-desc">Description</label><input id="r-desc" style={inputStyle} value={rDesc} onChange={(e) => setRDesc(e.target.value)} />
          <label htmlFor="r-owner">Owner (principal id; empty registers it unowned — coverage debt)</label><input id="r-owner" style={inputStyle} value={rOwner} onChange={(e) => setROwner(e.target.value)} />
          <label htmlFor="r-class">Classification</label>
          <select id="r-class" style={inputStyle} value={rClass} onChange={(e) => setRClass(e.target.value as Classification)}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <label htmlFor="r-terms">Glossary terms (comma-separated)</label><input id="r-terms" style={inputStyle} value={rTerms} onChange={(e) => setRTerms(e.target.value)} />
          <GovernedButton label="Register asset" pendingLabel="registering" disabled={rRef.trim().length < 1 || rTitle.trim().length < 2}
            onRun={run(() => catalog.register(scope, { kind: rKind, ref: rRef.trim(), title: rTitle.trim(), description: rDesc.trim() === '' ? undefined : rDesc.trim(), ownerPrincipalId: rOwner.trim() === '' ? null : rOwner.trim(), classification: rClass,
              glossaryTerms: rTerms.split(',').map((t) => t.trim()).filter((t) => t !== '') }))} />
        </section>
      )}
      <Receipt receipt={receipt} />
    </>
  );
}
