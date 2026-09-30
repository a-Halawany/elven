'use client';
/**
 * Risk and Opportunity — the workspace (CP-6 B32, 0089 §R; F-P4-13: WS-09, UX-35-001..006, JRN-08/-09, OBJ-22/-23, CAP-FW-04/-05).
 *
 * Risks and opportunities SIDE BY SIDE, worded the same way (UX-35-001: portfolio and scope, evidence and model, options and trade-offs,
 * ownership and action before anything secondary): each with its owner, state, accepted assessment, residual and appetite judgement, and its
 * GAPS — an incomplete exposure is marked so and a roll-up that includes it is refused by the server (WS-09: "expose gaps and prevent invalid
 * aggregation"). The primary commands are the eligible person's: identify (register a declared RSK), assess, challenge, PREVIEW then ACCEPT
 * (the owner — the exact version by its digest), add a control, sponsor (an opportunity sponsor — the evaluation it opens), open a response
 * decision, close. An AGENT's version is shown as an estimate, never as an input. What a control offers is courtesy; what the server refuses
 * is shown verbatim.
 *
 * B34 (0090 part exposures): the ACTIVE CONTEXT (tenant, domain, purpose, who is signed in) above everything; the TAXONOMY in force and the
 * one pending its activation by a second named member; the SIGNATURES of the acceptance and the sponsorship (the exact digest and the
 * signer); the DETECTIONS in words (false precision, a hold, a duplicate, an expired window, an unreviewed outcome, an unresolved owner,
 * unclassified options); the OWNER RESOLUTION route (the named resolvers, the domain administrator's re-owning act); the SCENARIOS linked;
 * the OUTCOME LOOP (each response monitored, its outcome reviewed against the exposure — effect, residual verdict, lesson); the
 * portfolio's CONCENTRATION.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { exposures, POLARITY_LABEL, STATE_LABEL, assessorLine, gapLine, likelihoodLine, methodLine, rangeLine, residualLine,
         type Aggregation, type ExposureDetail, type ExposureRow, type Polarity, type Preview, type Register, type ResponseKind,
         /* B34 (0090) */ OUTCOME_EFFECTS, RESIDUAL_VERDICTS, SCENARIO_RELATIONS, detectionLine, signatureLine,
         /* B36 (0094 §C5) */ learningLine } from '../../../lib/exposures';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number } | null;
const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');

export default function ExposuresPage() {
  const { scope, me } = useShell();
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && (b.domainId === scope.domainId || b.scope !== 'DOMAIN'));
  const isRiskOwner = holds('risk_owner'); const isSponsor = holds('opportunity_sponsor');
  const mayIdentify = isRiskOwner || isSponsor || holds('domain_analyst') || holds('strategy_owner') || holds('domain_admin');
  const [reg, setReg] = useState<Register | null>(null);
  const [prio, setPrio] = useState<Array<{ group: string; items: Array<ExposureRow & { position: number }> }> | null>(null);
  const [open, setOpen] = useState<ExposureDetail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [agg, setAgg] = useState<Aggregation | null>(null);
  const [form, setForm] = useState({ rsk: '', polarity: 'risk' as Polarity, category: '', owner: me.principalId, cadence: '30' });
  const [a, setA] = useState({ mechanism: '', pLow: '', pHigh: '', plausibility: '', low: '', high: '', unit: 'EUR', horizon: '', window: '', options: '' });
  const [why, setWhy] = useState('');
  const [ctl, setCtl] = useState({ title: '', kind: 'preventive' as 'preventive' | 'detective' | 'corrective', low: '0.3', high: '0.5' });
  const [sp, setSp] = useState({ option: '', rationale: '', conditions: '', budget: '' });
  const [resp, setResp] = useState<ResponseKind>('mitigate');
  const [closeWith, setCloseWith] = useState({ criterion: 'resolved', reason: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<R>(null);
  /* B34 (0090) */
  type Tax = { current: { version: number } | null; pending: { version: number; published_by?: string } | null; activation: Record<string, unknown> | null; rule: string };
  const [tax, setTax] = useState<Tax | null>(null);
  const [taxReason, setTaxReason] = useState('');
  const [reown, setReown] = useState({ owner: '', reason: '' });
  const [scn, setScn] = useState({ id: '', relation: 'materializes_in' as (typeof SCENARIO_RELATIONS)[number], rationale: '' });
  const [rv, setRv] = useState({ effect: 'effective' as (typeof OUTCOME_EFFECTS)[number], verdict: 'stands' as (typeof RESIDUAL_VERDICTS)[number], lesson: '' });
  /* B36 (0094 §C5): the learn step — what was expected, what happened, what changes in the basis */
  const [ln, setLn] = useState({ expected: '', observed: '', basisChange: '' });
  const mayActivate = holds('executive') || holds('domain_admin') || holds('platform_admin');
  const mayResolve = holds('domain_admin') || holds('platform_admin');
  /* end B34 */

  const load = async () => {
    const [l, p, t] = await Promise.all([exposures.list(scope), exposures.priority(scope), exposures.taxonomy(scope)]);
    if (!l.ok || l.data === undefined) { setProblem(l.error?.message ?? 'the register could not be read'); return; }
    setReg(l.data);
    if (t.ok && t.data !== undefined) setTax(t.data.taxonomy as unknown as Tax);   // B34 (0090): in force and pending
    if (p.ok && p.data !== undefined) setPrio(p.data.priority.groups);
  };
  const reopen = async (id: string) => {
    const r = await exposures.get(scope, id);
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the exposure could not be read');
    setOpen(r.data); setPreview(null);
  };
  useEffect(() => { void load(); }, [scope]);
  /** Every governed act: the server's answer or its refusal, verbatim. */
  const act = async <T,>(what: string, run: () => Promise<{ ok: boolean; data?: T & { receipt?: R }; error?: { message: string } }>, after?: (d: T) => Promise<void> | void) => {
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = r.error?.message ?? `${what} was refused`; setProblem(m); throw new Error(m); }
    setProblem(null); setReceipt(r.data.receipt ?? null); setLast(what);
    if (after) await after(r.data);
    await load();
  };

  if (reg === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading the risk and opportunity register…</Empty>;
  const x = open?.exposure ?? null;
  const assessment = (): Record<string, unknown> => ({
    mechanism: a.mechanism, horizon: a.horizon, impact: { low: Number(a.low), high: Number(a.high), unit: a.unit },
    ...(a.pLow.trim() !== '' && a.pHigh.trim() !== '' ? { probability: { low: Number(a.pLow), high: Number(a.pHigh) } } : {}),
    ...(a.plausibility === '' ? {} : { plausibility: a.plausibility }), ...(a.window.trim() === '' ? {} : { response_window_hours: Number(a.window) }),
    options: a.options.split(';').map((o) => o.trim()).filter((o) => o !== '').map((o) => { const [key, kind, ...label] = o.split(':'); return { key: String(key).trim(), kind: String(kind ?? '').trim(), label: label.join(':').trim() }; }),
  });

  const column = (polarity: Polarity, rows: ExposureRow[]) => (
    <section aria-labelledby={`${polarity}-h`} style={{ ...cardStyle, flex: '1 1 26rem' }}>
      <h2 id={`${polarity}-h`} style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{POLARITY_LABEL[polarity]}</h2>
      {rows.length === 0 ? <Empty>None registered.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Roll up</Th><Th>Exposure</Th><Th>State</Th><Th>Residual · appetite</Th><Th>Completeness</Th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.exposure_id}>
              <Td><input type="checkbox" aria-label={`include ${r.title ?? r.exposure_id} in a roll-up`} checked={picked.includes(r.exposure_id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, r.exposure_id] : picked.filter((p) => p !== r.exposure_id))} /></Td>
              <Td><button type="button" onClick={() => void reopen(r.exposure_id).catch((e: Error) => setProblem(e.message))}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{r.title ?? short(r.exposure_id)}</button>
                <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{r.category_key} · owner <Mono>{short(r.owner_principal_id)}</Mono>{r.sponsor_principal_id ? <> · sponsor <Mono>{short(r.sponsor_principal_id)}</Mono></> : null}</div></Td>
              <Td>{STATE_LABEL[r.state]}</Td>
              <Td>{residualLine(r.residual ?? null)}</Td>
              <Td><span style={{ color: r.gaps.length === 0 ? 'var(--eye-color-ink-default)' : 'var(--eye-color-warning)', fontWeight: r.gaps.length === 0 ? 400 : 650 }}>{gapLine(r.gaps)}</span></Td>
            </tr>))}</tbody>
        </table>
      )}
    </section>
  );

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Risk and opportunity</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        {reg.counts.risks} risk(s) · {reg.counts.opportunities} opportunity(ies) · {reg.counts.with_gaps} incomplete · {reg.counts.outside_appetite} outside appetite ·
        taxonomy {reg.taxonomy === null ? 'none published' : `v${reg.taxonomy.version}`} · as of {fmtInstant(reg.at)}
      </p>
      {/* B34 (0090): THE ACTIVE CONTEXT — where every act on this page is recorded, under which purpose, by whom */}
      <p aria-label="active context" style={{ fontSize: 'var(--eye-type-label-sm)' }}>
        Active context — tenant <Mono>{scope.tenantId}</Mono> · domain <Mono>{scope.domainId}</Mono> · purpose <Mono>prediction</Mono> · signed in as <Mono>{me.principalId}</Mono>
      </p>
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
      <UnknownNote>{reg.rule}</UnknownNote>

      {/* B34 (0090): THE TAXONOMY in force and the one pending its activation by a second named member */}
      <section aria-labelledby="tax-h" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="tax-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Taxonomy</h2>
        <p>{tax?.current ? `in force: version ${tax.current.version}` : 'no taxonomy in force — nothing can be registered'}
          {tax?.activation ? <> · activated by <Mono>{short(tax.activation['activated_by'])}</Mono>{tax.activation['grandfathered'] === true ? ' (carried from before the activation step)' : ''}</> : null}</p>
        {tax?.pending ? (
          <>
            <p>version {tax.pending.version} is PUBLISHED and PENDING its activation — a second named member activates it; its publisher never does.</p>
            {mayActivate ? (
              <>
                <label htmlFor="tax-reason">Activation reason (8..2000 characters)</label>
                <input id="tax-reason" style={inputStyle} value={taxReason} onChange={(e) => setTaxReason(e.target.value)} />
                <GovernedButton label={`Activate version ${tax.pending.version}`} pendingLabel="activating" variant="critical"
                  onRun={() => act(`taxonomy version ${tax.pending!.version} is in force`, () => exposures.activateTaxonomy(scope, tax.pending!.version, taxReason))} />
              </>
            ) : null}
          </>
        ) : null}
        {tax ? <UnknownNote>{tax.rule}</UnknownNote> : null}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-16)' }}>
        {column('risk', reg.risks)}
        {column('opportunity', reg.opportunities)}
      </div>

      <section aria-labelledby="agg-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="agg-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Roll up the selected ({picked.length})</h2>
        <GovernedButton label="Aggregate" pendingLabel="counting each driver once" disabled={picked.length < 2}
          onRun={() => act('the exposures were rolled up', () => exposures.aggregate(scope, picked), (d) => { setAgg(d.aggregation); })} />
        <UnknownNote>A shared driver is ONE event, counted once (the largest residual). The residuals add only where a person declared the exposures independent; otherwise the total is a range. An exposure with a gap refuses the roll-up — the refusal names each one.</UnknownNote>
        {agg === null ? null : (
          <>
            <p><strong>{methodLine(agg)}</strong></p>
            <p>{agg.basis}</p>
            <ul>{agg.clusters.map((c, i) => <li key={i}>{c.members.map(short).join(' + ')} — {c.rule}{c.shared_drivers.length > 0 ? <> · shared: {c.shared_drivers.map((d) => `${d.kind} ${short(d.id)}`).join(', ')}</> : null}</li>)}</ul>
            {agg.agent_estimates_not_used.length > 0 ? <UnknownNote>{agg.agent_estimates_not_used.length} agent correlation estimate(s) shown, not used: a recommendation is never an input.</UnknownNote> : null}
          </>
        )}
      </section>

      {/* B34 (0090): THE CONCENTRATION — which category or shared driver carries the accepted residual (within polarity and unit) */}
      {(reg.concentration ?? []).length === 0 ? null : (
        <section aria-labelledby="conc-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="conc-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Concentration — where the accepted residual sits</h2>
          <ul>{(reg.concentration ?? []).map((k, i) => (
            <li key={i}>{k.concentrated ? '⚠ CONCENTRATED — ' : ''}{k.polarity} · {k.unit} · {k.dimension} <Mono>{k.dimension === 'driver' ? short(k.key) : k.key}</Mono> carries {Math.round(Number(k.share) * 1000) / 10}% over {k.members} of {k.of} exposure(s)</li>
          ))}</ul>
          <UnknownNote>{reg.concentration?.[0]?.rule ?? ''}</UnknownNote>
        </section>
      )}

      {prio === null ? null : (
        <section aria-labelledby="prio-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="prio-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Priority — decomposed, never a score</h2>
          {prio.map((g) => (
            <div key={g.group}>
              <h3>{g.group}</h3>
              <ol>{g.items.map((it) => <li key={it.exposure_id}>{it.title ?? short(it.exposure_id)} — <span style={{ color: 'var(--eye-color-ink-muted)' }}>{it.priority?.explanation ?? 'no input'}</span></li>)}</ol>
            </div>
          ))}
          <UnknownNote>Lexicographic: the first dimension that differs decides; a dimension with no input ranks after one with. Ranked within polarity and unit.</UnknownNote>
        </section>
      )}

      {mayIdentify ? (
        <section aria-labelledby="reg-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="reg-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Identify — register a declared RSK</h2>
          <UnknownNote>Declare the RSK in the Strategy Graph first (its rests_on are its drivers); this registers its polarity, category and OWNER — a named risk owner.</UnknownNote>
          <label htmlFor="r-id">RSK strategy object id</label>
          <input id="r-id" style={inputStyle} value={form.rsk} onChange={(e) => setForm({ ...form, rsk: e.target.value })} />
          <label htmlFor="r-pol">Polarity</label>
          <select id="r-pol" style={inputStyle} value={form.polarity} onChange={(e) => setForm({ ...form, polarity: e.target.value as Polarity })}><option value="risk">risk</option><option value="opportunity">opportunity</option></select>
          <label htmlFor="r-cat">Category</label>
          <select id="r-cat" style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">(choose)</option>
            {(reg.taxonomy?.categories ?? []).filter((c) => c.polarity === form.polarity || c.polarity === 'both').map((c) => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
          </select>
          <label htmlFor="r-own">Owner (a risk owner&apos;s principal id)</label>
          <input id="r-own" style={inputStyle} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          <label htmlFor="r-cad">Review every (days)</label>
          <input id="r-cad" style={inputStyle} value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })} />
          <GovernedButton label="Register" pendingLabel="registering" onRun={() => act('the exposure was registered', () => exposures.register(scope,
            { strategyObjectId: form.rsk.trim(), polarity: form.polarity, category: form.category, owner: form.owner.trim(), ...(form.cadence.trim() === '' ? {} : { reviewEveryDays: Number(form.cadence) }) }))} />
        </section>
      ) : null}

      {open === null || x === null ? null : (
        <section aria-labelledby="x-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="x-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{POLARITY_LABEL[x.polarity].slice(0, 1)} {x.title}</h2>
          <p>{x.statement}</p>
          <p><strong>{STATE_LABEL[x.state]}</strong> · {gapLine(x.gaps)}</p>
          <dl>
            <DefinitionRow term="Owner">{x.owner_principal_id === me.principalId ? 'you' : <Mono>{x.owner_principal_id}</Mono>} — accepts the assessment (PER-10)</DefinitionRow>
            <DefinitionRow term="Objectives it rests on">{open.objectives.length === 0 ? 'none — strategic relevance: no input' : open.objectives.map(short).join(', ')}</DefinitionRow>
            <DefinitionRow term="Drivers">{open.drivers.map((d) => `${d.driver_kind} ${short(d.driver_id)} (${d.source})`).join(' · ')}</DefinitionRow>
            <DefinitionRow term="Residual">{residualLine(open.residuals[open.residuals.length - 1] ?? null)}</DefinitionRow>
            {open.residuals.length === 0 ? null : <DefinitionRow term="Computation">{open.residuals[open.residuals.length - 1]!.computation}</DefinitionRow>}
            {open.candidate ? <DefinitionRow term="Warning">candidate <Mono>{short(open.candidate['candidate_id'])}</Mono> — {String(open.candidate['state'])}{open.warning ? <> → warning <Mono>{short(open.warning['warning_id'])}</Mono>, routed to <Mono>{short(open.warning['routed_to'])}</Mono></> : null}</DefinitionRow> : null}
            {x.sponsor_principal_id ? <DefinitionRow term="Sponsor"><Mono>{x.sponsor_principal_id}</Mono></DefinitionRow> : null}
            {/* B34 (0090): the polarity on the canonical RSK and the SIGNATURES */}
            <DefinitionRow term="Polarity on the RSK">{open.canonical_polarity ?? 'not stated on the RSK — registered as ' + x.polarity}</DefinitionRow>
            <DefinitionRow term="Acceptance signature"><span title={String(open.signatures?.accepted?.digest ?? '')}>{signatureLine(open.signatures?.accepted, (id) => (id === me.principalId ? 'you' : id))}</span></DefinitionRow>
            {x.polarity === 'opportunity' ? <DefinitionRow term="Sponsorship signature"><span title={String(open.signatures?.sponsored?.digest ?? '')}>{signatureLine(open.signatures?.sponsored, (id) => (id === me.principalId ? 'you' : id))}</span></DefinitionRow> : null}
          </dl>

          {/* B34 (0090): THE DETECTIONS, each in the rule's own words */}
          <h3>Detections</h3>
          {(open.detections ?? []).length === 0 ? <Empty>No detection: no false precision, hold, duplicate, expired window, unreviewed outcome or unresolved owner.</Empty> : (
            <ul aria-label="detections">{(open.detections ?? []).map((d, i) => <li key={i}>{detectionLine(d)}</li>)}</ul>
          )}

          {/* B34 (0090): THE OWNER RESOLUTION — a missing or inactive owner is routed to the named resolvers, who re-own the exposure */}
          <section aria-labelledby="owner-h">
            <h3 id="owner-h">Owner resolution</h3>
            {(() => {
              const u = (open.detections ?? []).find((d) => d.kind === 'owner_unresolved');
              return u === undefined
                ? <p>The owner is a named, active risk owner: nothing to resolve (an owner is never re-owned around them).</p>
                : <p>⚑ The owner is no longer an active risk owner — routed to {(u.resolvers ?? []).length === 0 ? 'no active domain administrator (none is named in this domain)' : (u.resolvers ?? []).map((r) => r.name ?? r.principal_id).join(', ')} (domain administrators).</p>;
            })()}
            {mayResolve && x.state !== 'closed' ? (
              <>
                <label htmlFor="reown-owner">New owner (a risk owner&apos;s principal id)</label>
                <input id="reown-owner" style={inputStyle} value={reown.owner} onChange={(e) => setReown({ ...reown, owner: e.target.value })} />
                <label htmlFor="reown-reason">Reason (8..2000 characters)</label>
                <input id="reown-reason" style={inputStyle} value={reown.reason} onChange={(e) => setReown({ ...reown, reason: e.target.value })} />
                <GovernedButton label="Re-own the exposure" pendingLabel="re-owning" variant="critical"
                  onRun={() => act('the exposure was re-owned', () => exposures.resolveOwner(scope, x.exposure_id, reown.owner, reown.reason), () => reopen(x.exposure_id))} />
              </>
            ) : null}
          </section>

          {/* B34 (0090): THE SCENARIOS linked to the exposure */}
          <h3>Scenarios</h3>
          {(open.scenarios ?? []).length === 0 ? <Empty>No scenario is linked.</Empty> : (
            <ul>{(open.scenarios ?? []).map((k) => <li key={k.link_id}>{k.relation.replace(/_/g, ' ')} — {k.scenario_title ?? short(k.scenario_id)} ({k.scenario_state ?? 'state unknown'}): {k.rationale}</li>)}</ul>
          )}
          {mayIdentify && x.state !== 'closed' ? (
            <>
              <input aria-label="scenario id" placeholder="scenario id" style={inputStyle} value={scn.id} onChange={(e) => setScn({ ...scn, id: e.target.value })} />
              <select aria-label="scenario relation" style={inputStyle} value={scn.relation} onChange={(e) => setScn({ ...scn, relation: e.target.value as (typeof SCENARIO_RELATIONS)[number] })}>
                {SCENARIO_RELATIONS.map((k) => <option key={k}>{k}</option>)}
              </select>
              <input aria-label="scenario rationale" placeholder="rationale" style={inputStyle} value={scn.rationale} onChange={(e) => setScn({ ...scn, rationale: e.target.value })} />
              <GovernedButton label="Link the scenario" pendingLabel="linking" variant="quiet"
                onRun={() => act('the scenario was linked', () => exposures.linkScenario(scope, x.exposure_id, { scenarioId: scn.id, relation: scn.relation, rationale: scn.rationale }), () => reopen(x.exposure_id))} />
            </>
          ) : null}

          <h3>Assessments — the evidence and the model</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>v</Th><Th>Likelihood</Th><Th>{x.polarity === 'risk' ? 'Impact' : 'Value'}</Th><Th>Horizon · window</Th><Th>Options</Th><Th>By</Th><Th>Digest</Th></tr></thead>
            <tbody>{open.versions.map((v) => (
              <tr key={v.version}>
                <Td mono>{v.version}</Td><Td>{likelihoodLine(v)}</Td><Td>{rangeLine(v.impact_low, v.impact_high, v.unit)}</Td>
                <Td>{v.horizon} · {v.response_window_hours === null ? 'no window' : `${v.response_window_hours} h`}</Td>
                <Td>{v.options.map((o) => `${o.label} (${o.kind})`).join('; ') || 'none'}</Td>
                <Td>{assessorLine(v)}</Td><Td mono>{v.digest.slice(0, 12)}…</Td>
              </tr>))}</tbody>
          </table>
          {x.owner_principal_id === me.principalId ? (
            <>
              <h3>Accept an assessment — the owner&apos;s act, after the preview</h3>
              {open.versions.filter((v) => v.state === 'proposed' || v.state === 'contested').map((v) => (
                <GovernedButton key={v.version} label={`Preview version ${v.version}`} pendingLabel="computing the consequence" variant="quiet"
                  onRun={() => act('the consequence was previewed', () => exposures.preview(scope, x.exposure_id, v.version), (d) => { setPreview(d.preview); })} />
              ))}
              {preview === null ? null : (
                <div role="region" aria-label="consequence preview" style={{ borderInlineStart: '3px solid var(--eye-color-warning)', paddingInlineStart: 'var(--eye-space-8)' }}>
                  <p><strong>Version {preview.version}</strong> · digest <Mono>{preview.digest}</Mono> · {assessorLine({ assessed_kind: preview.assessed_kind, estimate_rule: null, state: preview.state as 'proposed' })}</p>
                  <p>{preview.consequence}</p>
                  <p>Residual: {residualLine(preview.residual)} — {preview.residual.computation}</p>
                  <p>Supersedes: {preview.would_supersede.length === 0 ? 'nothing' : preview.would_supersede.map((n) => `v${n}`).join(', ')}</p>
                  <label htmlFor="acc-why">Rationale (8..2000 characters)</label>
                  <input id="acc-why" style={inputStyle} value={why} onChange={(e) => setWhy(e.target.value)} />
                  <GovernedButton label={`Accept version ${preview.version}`} pendingLabel="accepting" variant="critical" disabled={!preview.acceptable}
                    onRun={() => act('the assessment was accepted', () => exposures.accept(scope, x.exposure_id, preview.version, preview.digest, why), () => reopen(x.exposure_id))} />
                </div>
              )}
            </>
          ) : null}
          {mayIdentify ? (
            <>
              <h3>Assess (a new version — the accepted one stands until its owner accepts another)</h3>
              <label htmlFor="a-m">Mechanism</label><input id="a-m" style={inputStyle} value={a.mechanism} onChange={(e) => setA({ ...a, mechanism: e.target.value })} />
              <label htmlFor="a-pl">Probability low / high (a bracket in [0, 1]) — or a plausibility</label>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
                <input id="a-pl" aria-label="probability low" style={inputStyle} value={a.pLow} onChange={(e) => setA({ ...a, pLow: e.target.value })} />
                <input aria-label="probability high" style={inputStyle} value={a.pHigh} onChange={(e) => setA({ ...a, pHigh: e.target.value })} />
                <select aria-label="plausibility" style={inputStyle} value={a.plausibility} onChange={(e) => setA({ ...a, plausibility: e.target.value })}><option value="">(no plausibility)</option><option>low</option><option>medium</option><option>high</option></select>
              </div>
              <label htmlFor="a-lo">{x.polarity === 'risk' ? 'Impact' : 'Value'} low / high / unit</label>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
                <input id="a-lo" aria-label="range low" style={inputStyle} value={a.low} onChange={(e) => setA({ ...a, low: e.target.value })} />
                <input aria-label="range high" style={inputStyle} value={a.high} onChange={(e) => setA({ ...a, high: e.target.value })} />
                <input aria-label="unit" style={inputStyle} value={a.unit} onChange={(e) => setA({ ...a, unit: e.target.value })} />
              </div>
              <label htmlFor="a-h">Horizon</label><input id="a-h" style={inputStyle} value={a.horizon} onChange={(e) => setA({ ...a, horizon: e.target.value })} />
              <label htmlFor="a-w">Response window (hours)</label><input id="a-w" style={inputStyle} value={a.window} onChange={(e) => setA({ ...a, window: e.target.value })} />
              <label htmlFor="a-o">Options (key:kind:label; …)</label><input id="a-o" style={inputStyle} value={a.options} onChange={(e) => setA({ ...a, options: e.target.value })} />
              <GovernedButton label="Propose the assessment" pendingLabel="recording" onRun={() => act('the assessment was proposed', () => exposures.assess(scope, x.exposure_id, x.current_version, assessment()), () => reopen(x.exposure_id))} />
              <h3>Challenge the latest version</h3>
              <input aria-label="the challenge's reason" style={inputStyle} value={why} onChange={(e) => setWhy(e.target.value)} />
              <GovernedButton label="Challenge" pendingLabel="recording" variant="quiet" disabled={open.versions.length === 0}
                onRun={() => act('the version was challenged', () => exposures.contest(scope, x.exposure_id, open.versions[open.versions.length - 1]!.version, why), () => reopen(x.exposure_id))} />
            </>
          ) : null}

          {x.polarity === 'risk' ? (
            <>
              <h3>Controls</h3>
              <ul>{open.controls.map((c) => <li key={c.control_id}>{c.title} ({c.control_kind}) — effectiveness {rangeLine(c.effectiveness_low, c.effectiveness_high, null)} · owner <Mono>{short(c.owner_principal_id)}</Mono></li>)}</ul>
              {isRiskOwner ? (
                <>
                  <input aria-label="control title" style={inputStyle} value={ctl.title} onChange={(e) => setCtl({ ...ctl, title: e.target.value })} />
                  <select aria-label="control kind" style={inputStyle} value={ctl.kind} onChange={(e) => setCtl({ ...ctl, kind: e.target.value as 'preventive' })}><option>preventive</option><option>detective</option><option>corrective</option></select>
                  <input aria-label="effectiveness low" style={inputStyle} value={ctl.low} onChange={(e) => setCtl({ ...ctl, low: e.target.value })} />
                  <input aria-label="effectiveness high" style={inputStyle} value={ctl.high} onChange={(e) => setCtl({ ...ctl, high: e.target.value })} />
                  <GovernedButton label="Add the control" pendingLabel="recomputing the residual" onRun={() => act('the control was added', () => exposures.addControl(scope, x.exposure_id,
                    { title: ctl.title, kind: ctl.kind, effectiveness: { low: Number(ctl.low), high: Number(ctl.high) }, owner: me.principalId }), () => reopen(x.exposure_id))} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <h3>Hypotheses</h3>
              <ul>{open.hypotheses.map((hy) => <li key={hy.version}>v{hy.version}: {hy.statement} — falsified if: {hy.falsifier} · value {rangeLine(hy.value_low, hy.value_high, hy.unit)} · {String(hy.timing['window'] ?? '')}{hy.required_capabilities.length > 0 ? <> · needs {hy.required_capabilities.map(short).join(', ')}</> : null}</li>)}</ul>
              {isSponsor && x.sponsor_principal_id === null ? (
                <>
                  <h3>Sponsor — the sponsor&apos;s act; it opens an owned evaluation</h3>
                  <input aria-label="option key" placeholder="option key" style={inputStyle} value={sp.option} onChange={(e) => setSp({ ...sp, option: e.target.value })} />
                  <input aria-label="rationale" placeholder="rationale" style={inputStyle} value={sp.rationale} onChange={(e) => setSp({ ...sp, rationale: e.target.value })} />
                  <input aria-label="conditions (one per ;)" placeholder="conditions (;)" style={inputStyle} value={sp.conditions} onChange={(e) => setSp({ ...sp, conditions: e.target.value })} />
                  <input aria-label="budget (EUR)" placeholder="budget (EUR)" style={inputStyle} value={sp.budget} onChange={(e) => setSp({ ...sp, budget: e.target.value })} />
                  {open.versions.filter((v) => v.state !== 'superseded' && v.state !== 'contested').map((v) => (
                    <GovernedButton key={v.version} label={`Sponsor version ${v.version}`} pendingLabel="sponsoring" variant="critical" disabled={v.assessed_kind === 'agent' && v.state !== 'accepted'}
                      onRun={() => act('the opportunity was sponsored', () => exposures.sponsor(scope, x.exposure_id, v.version, v.digest, {
                        option_key: sp.option, rationale: sp.rationale, conditions: sp.conditions.split(';').map((c) => c.trim()).filter((c) => c !== ''),
                        ...(sp.budget.trim() === '' ? {} : { budget: { amount: Number(sp.budget), unit: 'EUR' } }) }), () => reopen(x.exposure_id))} />
                  ))}
                </>
              ) : null}
            </>
          )}

          <h3>Responses — the decisions and their outcomes</h3>
          {open.responses.length === 0 ? <Empty>No response decision is open.</Empty> : (
            <ul>{open.responses.map((r) => <li key={r.response_id}><strong>{r.response_kind}</strong> — decision <Mono>{short(r.decision_object_id)}</Mono>, package <Mono>{short(r.package_id)}</Mono> {String(r.package?.['state'] ?? '')} · {r.outcomes.length === 0 ? 'no outcome recorded yet' : r.outcomes.map((o) => `${String(o['criterion_key'])}: ${o['met'] === true ? 'met' : 'not met'}`).join(', ')}</li>)}</ul>
          )}
          {/* B34 (0090): THE OUTCOME LOOP — each response monitored against the exposure; its outcome reviewed (effect, residual verdict, lesson) */}
          {open.responses.length === 0 ? null : (
            <ul aria-label="responses monitored">{open.responses.map((r) => (
              <li key={`m-${r.response_id}`}>{r.response_kind} · monitor: <strong>{r.monitor?.state ?? 'unknown'}</strong>{r.monitor?.owed ? <> — owed: {r.monitor.owed}</> : null}
                {(r.reviews ?? []).map((k) => <div key={k.review_id}>reviewed: {k.effect.replace(/_/g, ' ')} · residual {k.residual_verdict} · lesson: {k.lesson}</div>)}
                {/* B36 (0094 §C5): THE LEARN STEP (JRN-09) — each review's learning on the lineage; the owner or the sponsor records the one still owed */}
                {(r.learnings ?? []).map((l) => <div key={l.learning_id} aria-label="learning">learned: {learningLine(l)}</div>)}
                {(r.learn_owed ?? []).length > 0 && (x.owner_principal_id === me.principalId || x.sponsor_principal_id === me.principalId) ? (
                  <div aria-label="learn step">
                    <p style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>Learn: the review is recorded; what was expected, what happened, what changes in the estimate&apos;s basis?</p>
                    <input aria-label="what was expected" placeholder="what was expected (8..2000)" style={inputStyle} value={ln.expected} onChange={(e) => setLn({ ...ln, expected: e.target.value })} />
                    <input aria-label="what happened" placeholder="what happened (8..2000)" style={inputStyle} value={ln.observed} onChange={(e) => setLn({ ...ln, observed: e.target.value })} />
                    <input aria-label="what changes in the basis" placeholder="what changes in the estimate's basis (16..4000)" style={inputStyle} value={ln.basisChange} onChange={(e) => setLn({ ...ln, basisChange: e.target.value })} />
                    <GovernedButton label="Record the learning" pendingLabel="recording the learning"
                      onRun={() => act('the learning was recorded on the exposure', () => exposures.recordLearning(scope, x.exposure_id, { reviewId: String((r.learn_owed ?? [])[0]), ...ln }), () => reopen(x.exposure_id))} />
                  </div>
                ) : null}
                {r.monitor?.state === 'outcome_recorded' && (x.owner_principal_id === me.principalId || x.sponsor_principal_id === me.principalId) ? (
                  <div>
                    <select aria-label="outcome effect" style={inputStyle} value={rv.effect} onChange={(e) => setRv({ ...rv, effect: e.target.value as (typeof OUTCOME_EFFECTS)[number] })}>{OUTCOME_EFFECTS.map((k) => <option key={k}>{k}</option>)}</select>
                    <select aria-label="residual verdict" style={inputStyle} value={rv.verdict} onChange={(e) => setRv({ ...rv, verdict: e.target.value as (typeof RESIDUAL_VERDICTS)[number] })}>{RESIDUAL_VERDICTS.map((k) => <option key={k}>{k}</option>)}</select>
                    <input aria-label="lesson" placeholder="the lesson (16..4000)" style={inputStyle} value={rv.lesson} onChange={(e) => setRv({ ...rv, lesson: e.target.value })} />
                    <GovernedButton label="Review the outcome" pendingLabel="reviewing the residual"
                      onRun={() => act('the outcome was reviewed against the exposure', () => exposures.reviewOutcome(scope, x.exposure_id, { responseId: r.response_id, effect: rv.effect, residualVerdict: rv.verdict, lesson: rv.lesson }), () => reopen(x.exposure_id))} />
                  </div>
                ) : null}
              </li>))}</ul>
          )}
          {(x.owner_principal_id === me.principalId || x.sponsor_principal_id === me.principalId) && x.state !== 'closed' ? (
            <>
              <select aria-label="response kind" style={inputStyle} value={resp} onChange={(e) => setResp(e.target.value as ResponseKind)}>
                {(x.polarity === 'risk' ? ['mitigate', 'transfer', 'avoid', 'accept'] : ['exploit', 'accept']).map((k) => <option key={k}>{k}</option>)}
              </select>
              <GovernedButton label="Open a response decision" pendingLabel="declaring the decision and its package" variant="quiet"
                onRun={() => act('a response decision was opened', () => exposures.openDecision(scope, x.exposure_id, resp), () => reopen(x.exposure_id))} />
              <h3>Close — with its criterion and reason</h3>
              <select aria-label="closure criterion" style={inputStyle} value={closeWith.criterion} onChange={(e) => setCloseWith({ ...closeWith, criterion: e.target.value })}>
                {['resolved', 'mitigated', 'realized', 'expired', 'pursued', 'abandoned', 'duplicate', 'withdrawn'].map((k) => <option key={k}>{k}</option>)}
              </select>
              <input aria-label="closure reason" style={inputStyle} value={closeWith.reason} onChange={(e) => setCloseWith({ ...closeWith, reason: e.target.value })} />
              <GovernedButton label="Close the exposure" pendingLabel="closing" variant="critical"
                onRun={() => act('the exposure was closed', () => exposures.close(scope, x.exposure_id, closeWith.criterion, closeWith.reason), () => reopen(x.exposure_id))} />
            </>
          ) : null}
          {x.state === 'closed' && x.closure ? <p><strong>Closed</strong> — {String(x.closure['criterion'])}: {String(x.closure['reason'])}</p> : null}

          <h3>The exposure&apos;s record</h3>
          <ol>{open.events.map((e, i) => <li key={i}><Mono>{e.event}</Mono> · {fmtInstant(e.occurred_at)} · <Mono>{short(e.actor_principal_id)}</Mono></li>)}</ol>
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      {/* B34 (0090) integrator: the receipt of EVERY governed act on the page (a taxonomy activation too — not only an opened exposure's) */}
      <Receipt receipt={receipt} />
    </>
  );
}
