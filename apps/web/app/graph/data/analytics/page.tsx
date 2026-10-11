'use client';
/**
 * Product analytics — THE METRIC CATALOG (CP-6 B92 §MD; 0113_b92_x_md: PR-70-002/-003, CAP-DL-11, V01-T-040; the prelude's compute surface).
 *
 * THREE TABS. DEFINITIONS: every metric key with its current definition (state in words — draft / proposed / approved / superseded / retired /
 * rejected) and its latest results per period (determinate / INDETERMINATE with its reasons, n and floor — never a zero — / UNSUPPORTED with its
 * carrier / PREVIEW marked); one key's CONTRACT CARD (every field of App M's Contract control, the version history, the field-level diff, the
 * approve / reject with a reason for a product analytics owner — at the digest shown; the retire), its results by period, the COMPUTE form for an
 * analyst (period, scope, cohort, preview), and THE DRILL-DOWN (definition → result → records). PURPOSES: the register a privacy officer decides.
 * SCOPES: "the corridor" — its entities, objectives, series and geographies. Every act goes through its governed route with a receipt; a
 * refusal is the server's words. Humans approve; nothing here computes, approves or decides on the client.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import {
  CONTRACT_FIELDS, PERIOD_RE, byPeriod, catalogApi, dayOf, diffValue, previousQuarter, resultMark, stateMark, thresholdLine, valueLine,
  type CatalogRow, type DefinitionCard, type DefinitionVersion, type Purpose, type ScopeRow,
} from '../../../../lib/analytics-md-b92';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';
import { ResultDrilldown } from './_catalog/result-drilldown';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Row = Record<string, unknown>;
type Tab = 'definitions' | 'purposes' | 'scopes';
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
type Res = { ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt?: ReceiptT } };

export default function AnalyticsCatalogPage() {
  return <Suspense fallback={null}><Catalog /></Suspense>;
}

function MarkText({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
const field = (v: unknown): string => (v === null || v === undefined ? '—none—' : typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : JSON.stringify(v));
const list = (s: string): string[] => s.split(/[\s,]+/).map((x) => x.trim()).filter((x) => x !== '');

function Catalog() {
  const { scope, me } = useShell();
  const params = useSearchParams();
  const roles = new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope === 'TENANT').map((b) => b.roleCode));
  const isOwner = roles.has('product_analytics_owner'); const isAnalyst = roles.has('product_analyst'); const isPrivacy = roles.has('privacy_officer');
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab | null) ?? 'definitions');
  const [catalog, setCatalog] = useState<CatalogRow[] | null>(null);
  const [note, setNote] = useState('');
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [metricKey, setMetricKey] = useState<string>(params.get('metric') ?? '');
  const [card, setCard] = useState<DefinitionCard | null>(null);
  const [shownVersion, setShownVersion] = useState<number | null>(null);
  const [resultId, setResultId] = useState<string>(params.get('result') ?? '');
  const [reason, setReason] = useState('');
  // compute form
  const [period, setPeriod] = useState(previousQuarter(new Date()));
  const [scopeKey, setScopeKey] = useState(''); const [cohortDim, setCohortDim] = useState(''); const [cohortValue, setCohortValue] = useState(''); const [preview, setPreview] = useState(false);
  // propose forms
  const [contractText, setContractText] = useState(''); const [ownerId, setOwnerId] = useState('');
  const [pKey, setPKey] = useState(''); const [pTitle, setPTitle] = useState(''); const [pKind, setPKind] = useState('product_improvement'); const [pDesc, setPDesc] = useState(''); const [pDays, setPDays] = useState('180');
  const [sKey, setSKey] = useState(''); const [sTitle, setSTitle] = useState(''); const [sDesc, setSDesc] = useState(''); const [sEnt, setSEnt] = useState(''); const [sObj, setSObj] = useState(''); const [sSer, setSSer] = useState(''); const [sGeo, setSGeo] = useState('');

  const loadAll = async () => {
    const [c, pu, sc] = await Promise.all([catalogApi.catalog(scope), catalogApi.purposes(scope), catalogApi.scopes(scope)]);
    if (!c.ok || c.data === undefined) { setProblem(c.error?.message ?? 'the catalog could not be read'); return; }
    setCatalog(c.data.catalog); setNote(c.data.catalog_note);
    if (pu.ok && pu.data !== undefined) setPurposes(pu.data.purposes);
    if (sc.ok && sc.data !== undefined) setScopes(sc.data.scopes);
    setMetricKey((prev) => (prev === '' ? (c.data?.catalog[0]?.metric_key ?? '') : prev));
  };
  // the key chosen LAST wins: a slower answer for an earlier choice is dropped
  const wanted = useRef('');
  const loadCard = async () => {
    wanted.current = metricKey;
    if (metricKey === '') { setCard(null); return; }
    const asked = metricKey;
    const r = await catalogApi.card(scope, asked);
    if (wanted.current !== asked) return;
    if (!r.ok || r.data === undefined) { setCard(null); setProblem(r.error?.message ?? 'the definition could not be read'); return; }
    setProblem(null); setCard(r.data); setShownVersion(r.data.versions[0]?.version ?? null);
  };
  useEffect(() => { void loadAll(); }, [scope]);
  useEffect(() => { setResultId(''); void loadCard(); }, [scope, metricKey]);

  /** Every command: the server's words on a refusal, the receipt on success, everything read again. */
  const act = async (fn: () => Promise<Res>, what: string) => {
    const r = await fn();
    if (!r.ok) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`); throw new Error(what); }
    setProblem(null); setReceipt(r.data?.receipt ?? null);
    await loadAll(); await loadCard();
  };

  if (catalog === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading the metric catalog…</Empty>;
  const versions = card?.versions ?? [];
  const shown: DefinitionVersion | undefined = versions.find((v) => v.version === shownVersion) ?? versions[0];
  const proposed = versions.find((v) => v.state === 'proposed');
  const approvedV = versions.find((v) => v.state === 'approved');
  const reasonOk = reason.trim().length >= 8;
  const approvedScopes = scopes.filter((s) => s.state === 'approved');
  const dims = (approvedV?.contract['dimensions'] as string[] | undefined) ?? [];

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Product analytics — the metric catalog</h1>
      <p style={muted}>
        Every product metric is a governed contract: its purpose (approved by a named privacy officer), its population, numerator and denominator,
        window and clock, exclusions, cohort dimensions (never a person), privacy class, floor, threshold and the review a breach opens, what it serves,
        its owner and its retirement. A named product analytics owner who did not propose it approves it at the digest shown. Results are computed by the
        server with their records; a result that cannot be determined says why — it is never shown as zero.
      </p>
      <p style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>Boundary: signed acceptance (R2); accessibility conformance (B107/H3); deployment parity (B106); customer onboarding time (B94). A synthetic demonstration never closes a clause that needs the real integration. {note}</p>

      <div role="tablist" aria-label="Catalog sections" style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-12)' }}>
        {(['definitions', 'purposes', 'scopes'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={{ fontWeight: tab === t ? 700 : 400 }}>{t[0]!.toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      {tab === 'definitions' ? (
        <>
          <section aria-labelledby="mc-list" style={section}>
            <h2 id="mc-list" style={h2}>Definitions</h2>
            {catalog.length === 0 ? <Empty>No metric is defined in this domain.</Empty> : (
              <ScrollBox label="Metric definitions">
                <table style={tableStyle}>
                  <thead><tr><Th>Metric</Th><Th>State</Th><Th>Kind</Th><Th>Purpose</Th><Th>Owner</Th><Th>Latest results by period</Th><Th>Uses</Th></tr></thead>
                  <tbody>{catalog.map((c) => (
                    <tr key={c.metric_key}>
                      <Td><button type="button" onClick={() => setMetricKey(c.metric_key)} aria-pressed={c.metric_key === metricKey} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>{c.metric_key}</button> {c.title}</Td>
                      <Td><MarkText m={stateMark(c.state)} /> v{c.version}{c.supported ? '' : ' · UNSUPPORTED'}</Td>
                      <Td>{c.kind} ({c.unit})</Td>
                      <Td>{c.purpose_key}</Td>
                      <Td>{c.owner_name ?? <Mono>{c.owner_principal_id}</Mono>}</Td>
                      <Td>{c.results_by_period.length === 0 ? 'not computed' : c.results_by_period.slice(0, 4).map((r) => (
                        <div key={r.result_id}><button type="button" onClick={() => { setMetricKey(c.metric_key); setResultId(r.result_id); }} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>{r.period_key}{r.scope_key ? ` · ${r.scope_key}` : ''}</button>: <MarkText m={resultMark(r)} /> {valueLine({ ...r, kind: c.kind, unit: c.unit }, c.floor_n)}{r.definition_version !== c.version ? ` (on v${r.definition_version})` : ''}</div>
                      ))}</Td>
                      <Td>{c.uses}{c.b90_catalog_entry ? ' · catalogued' : ''}</Td>
                    </tr>))}</tbody>
                </table>
              </ScrollBox>
            )}
          </section>

          {card === null ? <Empty>No metric chosen.</Empty> : (
            <section aria-labelledby="mc-card" style={section}>
              <h2 id="mc-card" style={h2}>{card.metric_key} — {String(shown?.['title'] ?? '')}</h2>
              <p>
                Version{' '}
                <select aria-label="Version shown" style={inputStyle} value={shown?.version ?? ''} onChange={(e) => setShownVersion(Number(e.target.value))}>
                  {versions.map((v) => <option key={v.version} value={v.version}>v{v.version} — {stateMark(v.state).text}</option>)}
                </select>{' '}
                {shown ? <><MarkText m={stateMark(shown.state)} /> · digest <Mono title={shown.digest}>{shown.digest.slice(0, 16)}…</Mono></> : null}
              </p>
              {shown ? (
                <dl>
                  {CONTRACT_FIELDS.map(([k, label]) => (
                    <DefinitionRow key={k} term={label}>{k === 'owner_principal_id' ? (shown.owner_name ?? field(shown.contract[k])) : field(shown.contract[k])}</DefinitionRow>
                  ))}
                  <DefinitionRow term="Proposed">{shown.proposed_by_name ?? shown.proposed_by} · {fmtInstant(shown['proposed_at'])}</DefinitionRow>
                  <DefinitionRow term="Decided">{shown.decided_by === null ? 'not yet — awaiting a named product analytics owner (never the proposer)' : `${shown.decided_by_name ?? shown.decided_by} · ${fmtInstant(shown.decided_at)} — ${shown.decision_reason ?? ''}`}</DefinitionRow>
                  {shown.effective_from ? <DefinitionRow term="Effective from">{fmtInstant(shown.effective_from)}{shown.superseded_at ? ` — superseded ${fmtInstant(shown.superseded_at)}` : ''}</DefinitionRow> : null}
                  {shown.retired_at ? <DefinitionRow term="Retired">{fmtInstant(shown.retired_at)} — {shown.retire_reason}</DefinitionRow> : null}
                </dl>
              ) : null}

              <h3>Version history</h3>
              <table style={tableStyle}>
                <thead><tr><Th>Version</Th><Th>State</Th><Th>Proposed by</Th><Th>Decided by</Th><Th>Digest</Th></tr></thead>
                <tbody>{versions.map((v) => (
                  <tr key={v.version}><Td>v{v.version}</Td><Td><MarkText m={stateMark(v.state)} /></Td><Td>{v.proposed_by_name ?? v.proposed_by}</Td><Td>{v.decided_by_name ?? '—'}</Td><Td mono>{v.digest.slice(0, 16)}…</Td></tr>
                ))}</tbody>
              </table>
              {card.diff === null ? <p style={muted}>One version only — no diff.</p> : (
                <>
                  <h3>What changed from v{String(card.diff.from['version'])} to v{String(card.diff.to['version'])}</h3>
                  {card.diff.changed.length === 0 ? <p>No contract field differs.</p> : (
                    <table style={tableStyle}>
                      <thead><tr><Th>Field</Th><Th>From</Th><Th>To</Th></tr></thead>
                      <tbody>{card.diff.changed.map((x) => <tr key={x.field}><Td>{x.field}</Td><Td mono>{diffValue(x.from)}</Td><Td mono>{diffValue(x.to)}</Td></tr>)}</tbody>
                    </table>
                  )}
                </>
              )}

              {isOwner && (proposed !== undefined || approvedV !== undefined) ? (
                <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                  <label htmlFor="mc-reason" style={{ display: 'block' }}>Reason (8+ characters — recorded with your decision)</label>
                  <textarea id="mc-reason" style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                  {proposed !== undefined ? (
                    <p>
                      Deciding <strong>v{proposed.version}</strong> at digest <Mono>{proposed.digest.slice(0, 16)}…</Mono>{proposed.proposed_by === me.principalId ? ' — you proposed it: the server refuses your decision (separation of duties)' : ''}.{' '}
                      <GovernedButton label="Approve" pendingLabel="Approving…" disabled={!reasonOk} onRun={() => act(() => catalogApi.decide(scope, proposed.definition_id, { decision: 'approve', digest: proposed.digest, reason: reason.trim() }), 'the approval was refused')} />{' '}
                      <GovernedButton label="Reject" pendingLabel="Rejecting…" variant="critical" disabled={!reasonOk} onRun={() => act(() => catalogApi.decide(scope, proposed.definition_id, { decision: 'reject', digest: proposed.digest, reason: reason.trim() }), 'the rejection was refused')} />
                    </p>
                  ) : null}
                  {approvedV !== undefined ? (
                    <p>
                      <GovernedButton label={`Retire v${approvedV.version}`} pendingLabel="Retiring…" variant="critical" disabled={!reasonOk}
                        onRun={() => act(() => catalogApi.retire(scope, approvedV.definition_id, reason.trim()), 'the retirement was refused')} />{' '}
                      <span style={muted}>Retirement stops computation; the results, records and uses stay readable, and the uses are listed.</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <h3>Results by period</h3>
              {card.results.length === 0 ? <Empty>Not computed yet — no period has a result.</Empty> : (
                <ScrollBox label="Results by period">
                  <table style={tableStyle}>
                    <thead><tr><Th>Period</Th><Th>Scope · cohort</Th><Th>Standing</Th><Th>Value</Th><Th>Threshold</Th><Th>Computed</Th><Th>Records</Th></tr></thead>
                    <tbody>{byPeriod(card.results).flatMap((g) => g.results.map((r) => (
                      <tr key={r.result_id}>
                        <Td>{g.period}</Td>
                        <Td>{r.scope_key ? `${r.scope_key} v${String(r.scope_version)}` : 'the whole domain'}{Object.keys((r['cohort'] as Row | undefined) ?? {}).length > 0 ? ` · ${JSON.stringify(r['cohort'])}` : ''}</Td>
                        <Td><MarkText m={resultMark(r)} /> · v{r.definition_version}</Td>
                        <Td>{valueLine({ ...r, kind: String(r['kind']), unit: String(r['unit']) }, Number(versions.find((v) => v.version === r.definition_version)?.floor_n ?? NaN) || null)}</Td>
                        <Td>{thresholdLine(r.threshold_eval)}</Td>
                        <Td>{fmtInstant(r.computed_at)}</Td>
                        <Td><button type="button" onClick={() => setResultId(r.result_id)} aria-pressed={resultId === r.result_id}>Drill down</button></Td>
                      </tr>)))}</tbody>
                  </table>
                </ScrollBox>
              )}

              {(isAnalyst || isOwner) && approvedV !== undefined || (isAnalyst || isOwner) && proposed !== undefined ? (
                <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                  <h3>Compute</h3>
                  <p style={muted}>The server computes the approved definition (or, as a marked PREVIEW, the proposed one) over the named period: a calendar quarter (2026-Q3), a month (2026-09) or N days ending with a day (R90@2026-10-12). A partial or thin period is answered INDETERMINATE with its reasons.</p>
                  <label htmlFor="mc-period">Period</label>{' '}
                  <input id="mc-period" style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value.trim())} aria-invalid={!PERIOD_RE.test(period)} />{' '}
                  <label htmlFor="mc-scope">Scope</label>{' '}
                  <select id="mc-scope" style={inputStyle} value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
                    <option value="">the whole domain</option>
                    {approvedScopes.map((s) => <option key={s.scope_id} value={s.scope_key}>{s.title} ({s.scope_key} v{s.version})</option>)}
                  </select>{' '}
                  <label htmlFor="mc-cohort">Cohort</label>{' '}
                  <select id="mc-cohort" style={inputStyle} value={cohortDim} onChange={(e) => setCohortDim(e.target.value)}>
                    <option value="">the whole population</option>
                    {dims.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>{' '}
                  {cohortDim !== '' ? <input aria-label="Cohort value" style={inputStyle} value={cohortValue} onChange={(e) => setCohortValue(e.target.value)} /> : null}{' '}
                  <label><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> preview (the proposed version)</label>{' '}
                  <GovernedButton label="Compute" pendingLabel="Computing…" disabled={!PERIOD_RE.test(period) || (cohortDim !== '' && cohortValue.trim() === '')} onRun={async () => {
                    const r = await catalogApi.compute(scope, { metricKey: card.metric_key, period, scopeKey: scopeKey === '' ? null : scopeKey, cohort: cohortDim === '' ? {} : { [cohortDim]: cohortValue.trim() }, preview });
                    if (!r.ok || r.data === undefined) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'the computation was refused'}`); throw new Error('compute'); }
                    setProblem(null); setReceipt(r.data.receipt); setResultId(String(r.data.result.result_id)); await loadCard(); await loadAll();
                  }} />
                </div>
              ) : null}

              {resultId !== '' ? <ResultDrilldown scope={scope} resultId={resultId} canReplay={isAnalyst || isOwner} onReplayed={() => { void loadCard(); }} /> : null}

              <h3>Uses</h3>
              {card.uses.length === 0 ? <p style={muted}>No result of this metric is cited yet.</p> : (
                <ul>{card.uses.map((u) => <li key={u.use_id}>{u.used_in_kind.replace(/_/g, ' ')} <Mono>{u.used_in_id}</Mono> cites v{u.definition_version} {u.period_key} ({u.result_state.toUpperCase()}) · {dayOf(u.used_at)}{u.note ? ` — ${u.note}` : ''}</li>)}</ul>
              )}
              <h3>Ledger</h3>
              <ul>{card.ledger.slice(0, 30).map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {e.event}{e.version ? ` v${e.version}` : ''} by {e.actor_name ?? 'a principal'}</li>)}</ul>
            </section>
          )}

          {isAnalyst || isOwner ? (
            <section aria-labelledby="mc-propose" style={section}>
              <h2 id="mc-propose" style={h2}>Propose a definition version</h2>
              <p style={muted}>The contract as JSON (the MetricContract form: metricKey, title, meaning, kind, unit, direction, population, numerator, denominator, exclusions, window, dimensions, privacyClass, kMin, floorN, threshold, purposeKey, serves, cadence, ownerRole, action, retirement, quality, costAllocation, computationKey, params, unsupportedReason, sourceRefs) and its named owner. The server validates the whole contract; a named product analytics owner who is not you decides it.</p>
              <label htmlFor="mc-owner">Owner (principal id)</label>{' '}
              <input id="mc-owner" style={inputStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value.trim())} />
              <label htmlFor="mc-contract" style={{ display: 'block' }}>Contract</label>
              <textarea id="mc-contract" style={{ ...textareaStyle, minBlockSize: '12rem', fontFamily: 'var(--eye-font-mono, monospace)' }} value={contractText} onChange={(e) => setContractText(e.target.value)} />
              <GovernedButton label="Propose" pendingLabel="Proposing…" disabled={contractText.trim() === ''} onRun={async () => {
                let contract: Row;
                try { contract = JSON.parse(contractText) as Row; } catch { setProblem('the contract is not JSON'); throw new Error('json'); }
                await act(() => catalogApi.propose(scope, contract, ownerId === '' ? null : ownerId), 'the proposal was refused');
                const k = String(contract['metricKey'] ?? contract['metric_key'] ?? ''); if (k !== '') setMetricKey(k);
              }} />
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'purposes' ? (
        <section aria-labelledby="mc-purposes" style={section}>
          <h2 id="mc-purposes" style={h2}>Purposes</h2>
          <p style={muted}>What product analytics and telemetry may serve. A named privacy officer approves each version (never its proposer); a purpose of evaluating, scoring, ranking or watching people is refused.</p>
          {purposes.length === 0 ? <Empty>No purpose is registered.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Purpose</Th><Th>Kind</Th><Th>State</Th><Th>Retention</Th><Th>Proposed / decided</Th><Th>Definitions</Th><Th>Decision</Th></tr></thead>
              <tbody>{purposes.map((p) => (
                <tr key={p.purpose_id}>
                  <Td>{p.title} <Mono>{p.purpose_key} v{p.version}</Mono><div style={muted}>{p.description}</div></Td>
                  <Td>{p.purpose_kind}</Td>
                  <Td><MarkText m={stateMark(p.state)} /></Td>
                  <Td>{p.retention_days} days</Td>
                  <Td>{p.proposed_by_name ?? p.proposed_by} · {dayOf(p.proposed_at)}{p.decided_by_name ? ` / ${p.decided_by_name} · ${dayOf(p.decided_at)}` : ''}</Td>
                  <Td>{p.definitions_naming_it}</Td>
                  <Td>{isPrivacy && p.state === 'proposed' ? (
                    <>
                      <GovernedButton label="Approve" pendingLabel="Approving…" disabled={!reasonOk} onRun={() => act(() => catalogApi.decidePurpose(scope, p.purpose_id, { decision: 'approve', digest: p.digest, reason: reason.trim() }), 'refused')} />{' '}
                      <GovernedButton label="Reject" pendingLabel="Rejecting…" variant="critical" disabled={!reasonOk} onRun={() => act(() => catalogApi.decidePurpose(scope, p.purpose_id, { decision: 'reject', digest: p.digest, reason: reason.trim() }), 'refused')} />
                    </>
                  ) : isPrivacy && p.state === 'approved' ? (
                    <GovernedButton label="Retire" pendingLabel="Retiring…" variant="critical" disabled={!reasonOk} onRun={() => act(() => catalogApi.retirePurpose(scope, p.purpose_id, reason.trim()), 'refused')} />
                  ) : null}</Td>
                </tr>))}</tbody>
            </table>
          )}
          {isPrivacy ? (<><label htmlFor="mc-preason" style={{ display: 'block' }}>Reason for a decision or retirement (8+ characters)</label><textarea id="mc-preason" style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></>) : null}
          {isAnalyst || isOwner ? (
            <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
              <h3>Propose a purpose</h3>
              <input aria-label="Purpose key" placeholder="key (e.g. product-quality)" style={inputStyle} value={pKey} onChange={(e) => setPKey(e.target.value.trim())} />{' '}
              <input aria-label="Purpose title" placeholder="title" style={inputStyle} value={pTitle} onChange={(e) => setPTitle(e.target.value)} />{' '}
              <select aria-label="Purpose kind" style={inputStyle} value={pKind} onChange={(e) => setPKind(e.target.value)}>
                {['product_improvement', 'mission_outcome', 'governance', 'reliability', 'cost'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>{' '}
              <input aria-label="Retention days" style={inputStyle} value={pDays} onChange={(e) => setPDays(e.target.value.trim())} />
              <textarea aria-label="Purpose description" placeholder="what the purpose serves (16+ characters)" style={textareaStyle} value={pDesc} onChange={(e) => setPDesc(e.target.value)} />
              <GovernedButton label="Propose purpose" pendingLabel="Proposing…" disabled={pKey === '' || !/^\d+$/.test(pDays)} onRun={() => act(() => catalogApi.proposePurpose(scope, { key: pKey, title: pTitle, kind: pKind, description: pDesc, retentionDays: Number(pDays) }), 'refused')} />
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'scopes' ? (
        <section aria-labelledby="mc-scopes" style={section}>
          <h2 id="mc-scopes" style={h2}>Scopes</h2>
          <p style={muted}>A named population scope ("the corridor"): the graph entities, objectives, series and geographies a computation restricts to — each computation states its own scope rule. A named product analytics owner approves each version (never its proposer).</p>
          {scopes.length === 0 ? <Empty>No scope is registered.</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Scope</Th><Th>State</Th><Th>Entities</Th><Th>Objectives</Th><Th>Series · geographies</Th><Th>Results</Th><Th>Decision</Th></tr></thead>
              <tbody>{scopes.map((s) => (
                <tr key={s.scope_id}>
                  <Td>{s.title} <Mono>{s.scope_key} v{s.version}</Mono><div style={muted}>{s.description}</div></Td>
                  <Td><MarkText m={stateMark(s.state)} /></Td>
                  <Td>{s.entities.map((e) => e.name).join(', ') || '—none—'}</Td>
                  <Td>{s.objectives.map((o) => o.title).join(', ') || '—none—'}</Td>
                  <Td>{[...s.series_keys, ...s.geographies].join(', ') || '—none—'}</Td>
                  <Td>{s.results_under_it}</Td>
                  <Td>{isOwner && s.state === 'proposed' ? (
                    <>
                      <GovernedButton label="Approve" pendingLabel="Approving…" disabled={!reasonOk} onRun={() => act(() => catalogApi.decideScope(scope, s.scope_id, { decision: 'approve', digest: s.digest, reason: reason.trim() }), 'refused')} />{' '}
                      <GovernedButton label="Reject" pendingLabel="Rejecting…" variant="critical" disabled={!reasonOk} onRun={() => act(() => catalogApi.decideScope(scope, s.scope_id, { decision: 'reject', digest: s.digest, reason: reason.trim() }), 'refused')} />
                    </>
                  ) : isOwner && s.state === 'approved' ? (
                    <GovernedButton label="Retire" pendingLabel="Retiring…" variant="critical" disabled={!reasonOk} onRun={() => act(() => catalogApi.retireScope(scope, s.scope_id, reason.trim()), 'refused')} />
                  ) : null}</Td>
                </tr>))}</tbody>
            </table>
          )}
          {isOwner ? (<><label htmlFor="mc-sreason" style={{ display: 'block' }}>Reason for a decision or retirement (8+ characters)</label><textarea id="mc-sreason" style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></>) : null}
          {isAnalyst || isOwner ? (
            <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
              <h3>Propose a scope</h3>
              <input aria-label="Scope key" placeholder="key (e.g. red-sea-corridor)" style={inputStyle} value={sKey} onChange={(e) => setSKey(e.target.value.trim())} />{' '}
              <input aria-label="Scope title" placeholder="title" style={inputStyle} value={sTitle} onChange={(e) => setSTitle(e.target.value)} />
              <input aria-label="Entity ids" placeholder="entity ids (comma-separated)" style={{ ...inputStyle, display: 'block', inlineSize: '100%' }} value={sEnt} onChange={(e) => setSEnt(e.target.value)} />
              <input aria-label="Objective ids" placeholder="objective ids (comma-separated)" style={{ ...inputStyle, display: 'block', inlineSize: '100%' }} value={sObj} onChange={(e) => setSObj(e.target.value)} />
              <input aria-label="Series keys" placeholder="series keys (comma-separated)" style={{ ...inputStyle, display: 'block', inlineSize: '100%' }} value={sSer} onChange={(e) => setSSer(e.target.value)} />
              <input aria-label="Geographies" placeholder="geographies (comma-separated)" style={{ ...inputStyle, display: 'block', inlineSize: '100%' }} value={sGeo} onChange={(e) => setSGeo(e.target.value)} />
              <textarea aria-label="Scope description" placeholder="how the scope applies (8+ characters)" style={textareaStyle} value={sDesc} onChange={(e) => setSDesc(e.target.value)} />
              <GovernedButton label="Propose scope" pendingLabel="Proposing…" disabled={sKey === ''} onRun={() => act(() => catalogApi.proposeScope(scope, { key: sKey, title: sTitle, description: sDesc, entityIds: list(sEnt), objectiveIds: list(sObj), seriesKeys: list(sSer), geographies: sGeo.split(',').map((x) => x.trim()).filter((x) => x !== '') }), 'refused')} />
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
