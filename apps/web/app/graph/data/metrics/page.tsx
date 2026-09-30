'use client';
/**
 * Semantic metrics (the certified semantic layer) — CP-6 B90 part `metrics` (0095 §M; F-P7-F-10: DP-44-001..006, DAT-SV-04; V0 C-034).
 *
 * THE MODELS: each a product of kind metric with a DECLARATIVE definition (a whitelisted measure, a grain, a unit, an aggregation, the
 * dimensions and filters, the effective time), its state in words, its certification (by whom, until when, SIGNED — the key and the
 * instant), its last valid version when withdrawn or expired, its definition diffs. THE SERVE PANEL: the grain (the model's or one of the
 * measure's), the filters, the instant (datetime-local), the VIEW toggle — the executive view serves certified metrics only and its
 * REFUSAL of an uncertified model is shown as the server's refusal; the analyst view serves it MARKED. Every value is the server's, with
 * the grain, the definition version and digest and the SOURCE REVISION. THE OWNER'S ACTS: certify (an expiry; signed), withdraw (a reason).
 * THE STEWARD'S: define a model on a product of kind metric. Nothing here is computed on the client.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { metrics, STATE_LABEL, VIEW_LABEL, certificationLine, diffLine, expiryWithinLimit, filtersOfLines, instantOfLocal, valueLine,
  type Aggregation, type MeasureSpec, type MetricRow, type MetricView, type ProductRow, type ServingAnswer } from '../../../../lib/metrics-b90';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../strategy/form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const AGGREGATIONS: Aggregation[] = ['sum', 'avg', 'min', 'max', 'last', 'count'];

export default function MetricsPage() {
  const { scope, me } = useShell();
  const isSteward = me.bindings.some((b) => (b.roleCode === 'data_steward' || b.roleCode === 'domain_admin') && (b.domainId === me.homeDomainId || b.scope === 'PLATFORM'));
  const [models, setModels] = useState<MetricRow[] | null>(null);
  const [catalog, setCatalog] = useState<Record<string, MeasureSpec>>({});
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [modelId, setModelId] = useState('');
  const [view, setView] = useState<MetricRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the serve panel
  const [grain, setGrain] = useState('');
  const [filterText, setFilterText] = useState('');
  const [asOf, setAsOf] = useState('');
  const [serveView, setServeView] = useState<MetricView>('executive');
  const [serving, setServing] = useState<ServingAnswer | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  // the owner's acts
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [recalcAt, setRecalcAt] = useState('');
  const [recalc, setRecalc] = useState<Record<string, unknown> | null>(null);
  // the define form
  const [productId, setProductId] = useState(''); const [measure, setMeasure] = useState(''); const [defGrain, setDefGrain] = useState(''); const [unit, setUnit] = useState('');
  const [aggregation, setAggregation] = useState<Aggregation>('last'); const [dims, setDims] = useState<string[]>([]); const [defFilters, setDefFilters] = useState(''); const [effective, setEffective] = useState('');

  const loadAll = async () => {
    const [m, c] = await Promise.all([metrics.list(scope), metrics.catalog(scope)]);
    if (!m.ok || m.data === undefined) { setProblem(m.error?.message ?? 'the metrics could not be read'); return; }
    setModels(m.data.metrics);
    if (c.ok && c.data !== undefined) setCatalog(c.data.measures);
    if (isSteward) { const pr = await metrics.products(scope); if (pr.ok && pr.data !== undefined) setProducts(pr.data.products); }
    setModelId((prev) => (prev === '' ? (m.data?.metrics[0]?.model_id ?? '') : prev));
  };
  const loadView = async () => {
    if (modelId === '') { setView(null); return; }
    const r = await metrics.get(scope, modelId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the metric could not be read'); return; }
    setView(r.data.metric);
    setGrain((prev) => (prev === '' ? r.data!.metric.grain : prev));
  };
  useEffect(() => { void loadAll(); }, [scope]);
  useEffect(() => { void loadView(); }, [scope, modelId]);
  const reload = async () => { await loadAll(); await loadView(); };
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await reload();
  };
  const serve = async () => {
    if (view === null) return;
    setServing(null); setRefusal(null);
    const r = await metrics.serve(scope, view.metric_key, { grain: grain === '' ? null : grain, filters: filtersOfLines(filterText), asOf: instantOfLocal(asOf), view: serveView });
    if (!r.ok || r.data === undefined) { setRefusal(r.error?.message ?? 'the serve was refused'); return; }
    setServing(r.data.serving); setReceipt(r.data.receipt);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (models === null) return <Empty>reading the metrics…</Empty>;
  const isOwner = view !== null && view.owner_principal_id === me.principalId;
  const spec = view === null ? null : (view.measure_spec ?? catalog[view.measure] ?? null);
  const defSpec = measure === '' ? null : (catalog[measure] ?? null);
  const active = view?.active_certification ?? null;
  const activeWithSignatures = active === null ? null : (view?.certifications.find((c) => c.certification_id === active.certification_id) ?? active);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Semantic metrics</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        A semantic model is a product of kind metric with a declarative definition: a whitelisted measure over the platform&apos;s own data, a grain, a unit,
        dimensions and filters, an effective time. The owner certifies a version (signed, with an expiry); the executive view serves certified metrics only —
        dashboards are access modes, never a parallel truth. Every value here is the server&apos;s, with its grain and source revision.
      </p>

      <label htmlFor="metric">Metric</label>
      <select id="metric" style={inputStyle} value={modelId} onChange={(e) => { setModelId(e.target.value); setServing(null); setRefusal(null); setGrain(''); setRecalc(null); }}>
        <option value="">— choose —</option>
        {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.title} · {m.metric_key} · {m.state}</option>)}
      </select>

      {view === null ? <Empty>{models.length === 0 ? 'No semantic model is declared in this domain yet.' : 'Choose a metric.'}</Empty> : (
        <>
          <section aria-labelledby="model-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="model-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{view.title}</h2>
            <dl>
              <DefinitionRow term="Key · product"><Mono>{view.metric_key}</Mono> · product {view.product_state}{view.released_version !== null ? ` (released v${view.released_version})` : ''}</DefinitionRow>
              <DefinitionRow term="State"><span aria-label="metric state">{STATE_LABEL[view.state]}</span></DefinitionRow>
              <DefinitionRow term="Definition"><span aria-label="definition line">{view.measure} · grain {view.grain} · {view.aggregation} · unit {view.unit} · dimensions {view.dimensions.join(', ') || 'none'} · filters {JSON.stringify(view.filters)} · effective from {fmtInstant(view.effective_from)}</span></DefinitionRow>
              <DefinitionRow term="Version">v{view.current_version} — digest <Mono>{(view.versions.find((v) => v.version === view.current_version)?.digest ?? '').slice(0, 16)}…</Mono>{view.certified_version !== null ? ` · certified v${view.certified_version}` : ''}{view.last_valid_version !== null && view.state !== 'certified' ? ` · last valid v${view.last_valid_version} (frozen)` : ''}</DefinitionRow>
              <DefinitionRow term="Certification"><span aria-label="certification line">{certificationLine(activeWithSignatures)}</span></DefinitionRow>
              <DefinitionRow term="Owner"><Mono>{view.owner_principal_id.slice(0, 8)}…</Mono>{isOwner ? ' (you)' : ''}</DefinitionRow>
            </dl>
            {isOwner ? (
              <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)' }}>
                <label htmlFor="expiry">Certification expiry (within {366} days; the certification is signed with the executive key)</label>
                <input id="expiry" type="datetime-local" style={inputStyle} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                <label htmlFor="reason">Withdrawal reason (8 characters or more)</label>
                <input id="reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                  <GovernedButton label={`Certify v${view.current_version} (sign)`} pendingLabel="certifying" disabled={view.state === 'certified' || !expiryWithinLimit(instantOfLocal(expiry) ?? '', new Date())}
                    onRun={run(() => metrics.certify(scope, view.model_id, view.current_version, instantOfLocal(expiry) ?? ''))} />
                  <GovernedButton label="Withdraw certification" pendingLabel="withdrawing" variant="critical" disabled={view.state !== 'certified' || reason.trim().length < 8} onRun={run(() => metrics.withdraw(scope, view.model_id, reason))} />
                </div>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="serve-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="serve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Serve</h2>
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <label htmlFor="grain">Grain (the model&apos;s, or one the measure allows)</label>
              <select id="grain" style={inputStyle} value={grain} onChange={(e) => setGrain(e.target.value)}>
                {(spec?.grains ?? [view.grain]).map((g) => <option key={g} value={g}>{g}{g === view.grain ? ' (the model\'s)' : ''}</option>)}
              </select>
              <label htmlFor="filters">Filters (one per line, dimension=value; on the declared dimensions {view.dimensions.join(', ') || '— none declared'})</label>
              <textarea id="filters" style={{ ...textareaStyle, minBlockSize: '3rem' }} value={filterText} onChange={(e) => setFilterText(e.target.value)} />
              <label htmlFor="as-of">As of (blank = now, the server&apos;s clock)</label>
              <input id="as-of" type="datetime-local" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)' }}>
                <legend>View</legend>
                {(['executive', 'analyst'] as MetricView[]).map((v) => (
                  <label key={v} style={{ display: 'block' }}>
                    <input type="radio" name="view" value={v} checked={serveView === v} onChange={() => setServeView(v)} /> {VIEW_LABEL[v]}
                  </label>
                ))}
              </fieldset>
              <div><GovernedButton label="Serve" pendingLabel="serving" onRun={serve} /></div>
            </div>
            {refusal !== null ? <div aria-label="serve refusal" role="alert" style={{ marginBlockStart: 'var(--eye-space-12)', color: 'var(--eye-color-critical)' }}>Refused by the server: {refusal}</div> : null}
            {serving !== null ? (
              <div style={{ marginBlockStart: 'var(--eye-space-16)' }}>
                <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Served — {serving.view} view · grain {serving.grain} · as of {fmtInstant(serving.as_of)}</h3>
                <dl>
                  <DefinitionRow term="Standing"><span aria-label="serving standing">{serving.certified ? '● certified' : '○ UNCERTIFIED — marked'} · {serving.note}</span></DefinitionRow>
                  <DefinitionRow term="Definition">v{serving.version} · digest <Mono>{serving.digest.slice(0, 16)}…</Mono> · {serving.measure} · {serving.aggregation} · unit {serving.unit} · effective from {fmtInstant(serving.effective_from)}</DefinitionRow>
                  <DefinitionRow term="Source revision"><span aria-label="source revision">{serving.source}: <Mono>{serving.source_revision}</Mono> over {serving.source_rows} row(s){serving.freshness_seconds !== null ? ` · freshness ${Math.round(serving.freshness_seconds)} s` : ''}</span></DefinitionRow>
                  <DefinitionRow term="Certification">{serving.certification === null ? 'none' : `${serving.certification.state} · until ${fmtInstant(serving.certification.expires_at)}`}{serving.last_valid_version !== null ? ` · last valid v${serving.last_valid_version}` : ''}</DefinitionRow>
                </dl>
                {serving.values.length === 0 ? <Empty>No value at the instant (the source has no rows at or before it).</Empty> : (
                  <table style={tableStyle} aria-label="served values">
                    <thead><tr><Th>Grain key ({serving.grain})</Th><Th>Value ({serving.unit})</Th></tr></thead>
                    <tbody>{serving.values.map((v) => <tr key={v.grain_key}><Td mono>{v.grain_key}</Td><Td>{valueLine(v, serving.unit).replace(`${v.grain_key}: `, '')}</Td></tr>)}</tbody>
                  </table>
                )}
              </div>
            ) : null}
          </section>

          {isOwner || isSteward ? (
            <section aria-labelledby="recalc-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
              <h2 id="recalc-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Recalculate (reproducibility)</h2>
              <p style={{ color: 'var(--eye-color-ink-muted)' }}>Re-serves at a past instant with the definition effective then and compares the source revision with the serving recorded at that instant; a mismatch withdraws the certification and names the serving that diverged.</p>
              <label htmlFor="recalc-at">Instant of a recorded serving</label>
              <input id="recalc-at" type="datetime-local" step="1" style={inputStyle} value={recalcAt} onChange={(e) => setRecalcAt(e.target.value)} />
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label="Recalculate" pendingLabel="recalculating" disabled={instantOfLocal(recalcAt) === null} onRun={async () => {
                  const r = await metrics.recalculate(scope, view.model_id, instantOfLocal(recalcAt) ?? '');
                  if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the recalculation was refused');
                  setRecalc(r.data.recalculation); setReceipt(r.data.receipt); await reload();
                }} />
              </div>
              {recalc !== null ? <p aria-label="recalculation result">{recalc['reproduced'] === true ? '● reproduced — the source revision matches the serving' : `✕ NOT reproduced — the source revision diverged from serving ${String((recalc['diverged_serving'] as Record<string, unknown> | null)?.['serving_id'] ?? '')}; the certification is withdrawn`}</p> : null}
            </section>
          ) : null}

          <section aria-labelledby="history-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="history-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Versions, certifications, diffs, servings</h2>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Versions</h3>
            <ul aria-label="versions" style={{ paddingInlineStart: '1rem' }}>
              {view.versions.map((v) => <li key={v.version}>v{v.version} — digest <Mono>{v.digest.slice(0, 16)}…</Mono> · effective from {fmtInstant(v.effective_from)} · declared {fmtInstant(v.declared_at)} by <Mono>{v.declared_by.slice(0, 8)}…</Mono></li>)}
            </ul>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Certifications</h3>
            {view.certifications.length === 0 ? <Empty>Never certified.</Empty> : (
              <ul aria-label="certifications" style={{ paddingInlineStart: '1rem' }}>
                {view.certifications.map((c) => <li key={c.certification_id}>v{c.version} · MET object v{c.met_object_version} · {certificationLine(c)}</li>)}
              </ul>
            )}
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Definition diffs</h3>
            {view.diffs.length === 0 ? <Empty>No certified definition was re-declared.</Empty> : (
              <ul aria-label="diffs" style={{ paddingInlineStart: '1rem' }}>{view.diffs.map((d) => <li key={d.diff_id}>{diffLine(d)} — recorded {fmtInstant(d.recorded_at)}</li>)}</ul>
            )}
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Servings (the last twenty)</h3>
            {view.servings.length === 0 ? <Empty>Never served.</Empty> : (
              <ul aria-label="servings" style={{ paddingInlineStart: '1rem' }}>
                {view.servings.map((s) => <li key={s.serving_id}>{fmtInstant(s.served_at)} · {s.view} · grain {s.grain} · as of {fmtInstant(s.as_of)} · v{s.version} · {s.certified ? 'certified' : 'UNCERTIFIED'} · revision <Mono>{s.source_revision.slice(0, 16)}…</Mono></li>)}
              </ul>
            )}
          </section>
        </>
      )}

      {isSteward ? (
        <section aria-labelledby="define-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="define-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Define a model (a steward&apos;s or the owner&apos;s act)</h2>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
            <label htmlFor="product">Product of kind metric</label>
            <select id="product" style={inputStyle} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— choose —</option>
              {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.title} · {p.product_key} · {p.state}</option>)}
            </select>
            <label htmlFor="measure">Measure (the whitelist)</label>
            <select id="measure" style={inputStyle} value={measure} onChange={(e) => { setMeasure(e.target.value); setDefGrain(''); setDims([]); }}>
              <option value="">— choose —</option>
              {Object.entries(catalog).map(([k, s]) => <option key={k} value={k}>{k} — {s.source}</option>)}
            </select>
            {defSpec !== null ? (
              <>
                <p style={{ color: 'var(--eye-color-ink-muted)' }}>{defSpec.description}</p>
                <label htmlFor="def-grain">Grain</label>
                <select id="def-grain" style={inputStyle} value={defGrain} onChange={(e) => setDefGrain(e.target.value)}>
                  <option value="">— choose —</option>
                  {defSpec.grains.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <label htmlFor="def-aggregation">Aggregation</label>
                <select id="def-aggregation" style={inputStyle} value={aggregation} onChange={(e) => setAggregation(e.target.value as Aggregation)}>
                  {AGGREGATIONS.filter((a) => defSpec.aggregations.includes(a)).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)' }}>
                  <legend>Dimensions</legend>
                  {defSpec.dimensions.map((d) => (
                    <label key={d} style={{ display: 'block' }}>
                      <input type="checkbox" checked={dims.includes(d)} onChange={(e) => setDims(e.target.checked ? [...dims, d] : dims.filter((x) => x !== d))} /> {d}
                    </label>
                  ))}
                </fieldset>
              </>
            ) : null}
            <label htmlFor="unit">Unit (e.g. EUR, points, units)</label>
            <input id="unit" style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} />
            <label htmlFor="def-filters">Filters (one per line, dimension=value, on the chosen dimensions)</label>
            <textarea id="def-filters" style={{ ...textareaStyle, minBlockSize: '3rem' }} value={defFilters} onChange={(e) => setDefFilters(e.target.value)} />
            <label htmlFor="effective">Effective from (blank = now, the server&apos;s clock)</label>
            <input id="effective" type="datetime-local" style={inputStyle} value={effective} onChange={(e) => setEffective(e.target.value)} />
            <div>
              <GovernedButton label="Define (the next version)" pendingLabel="defining" disabled={productId === '' || measure === '' || defGrain === '' || unit.trim() === ''}
                onRun={run(async () => {
                  const r = await metrics.define(scope, productId, { measure, unit: unit.trim(), aggregation, grain: defGrain, dimensions: dims, filters: filtersOfLines(defFilters), effectiveFrom: instantOfLocal(effective) });
                  if (r.ok) setModelId(productId);
                  return r;
                })} />
            </div>
          </div>
        </section>
      ) : null}

      <Receipt receipt={receipt} />
    </>
  );
}
