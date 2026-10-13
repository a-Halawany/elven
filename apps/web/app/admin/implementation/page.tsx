'use client';
/**
 * THE IMPLEMENTATION WORKSPACE — CP-6 B94 §IM+§AD (0114 §IM; WS-20, CAP-DL-07/08, PR-68-001..006). In the order WS-20 sets: the GLOBAL
 * CONTEXT (tenant, domain, role) always visible; the GO-LIVE GATE's status and its BLOCKING items first (evaluated live by the server — never
 * a stored "ready" flag); the go-live controls (offered only to a named sponsor or authority who is not a lead, on the exact digest, with the
 * consequence stated; withholding acceptance keeps the prior safe operation); then readiness items, enablement (accessible paths, coverage
 * COUNTS per role, the person records this reader may see), cohorts and adoption measures (below k INDETERMINATE), shadow findings, the
 * decisions with their signatures, the programme's parts, changes and ledger. Proposals are never styled like approvals; refusals are shown
 * in the server's words; every object shows its version, digest, effective time, freshness and the receipt. Every record is SYNTHETIC.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../lib/api';
import {
  acts, blockingLine, cohortShare, consequencePreview, contextLine, contextOf, dayText, gateLabel, goliveEligibility, itemLabel, latestGuard, listProgrammes, measureLine, myRecords, readProgramme,
  type Gate, type GateItem, type Programme, type ProgrammeDetail, type Receipt as Rcpt,
} from '../../../lib/delivery-im-b94';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { GovernedButton, Mono, ScrollBox, fmtInstant } from '../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' } as const;
const proposedStyle = { borderInlineStart: '3px dashed var(--eye-color-border-strong)', paddingInlineStart: 'var(--eye-space-8)' } as const;
const approvedStyle = { borderInlineStart: '3px solid var(--eye-color-success)', paddingInlineStart: 'var(--eye-space-8)' } as const;

export default function ImplementationPage() {
  const session = getSession();
  const ctx = useMemo(() => contextOf(session), [session]);
  const [programmes, setProgrammes] = useState<Array<Programme & { gate: Partial<Gate> }>>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [mine, setMine] = useState<{ training: Row[]; competence: Row[] } | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [reason, setReason] = useState('');
  const [cadence, setCadence] = useState('');
  const [journeys, setJourneys] = useState<string[]>([]);
  const [residualReason, setResidualReason] = useState('');
  const [statement, setStatement] = useState('');
  const guard = useRef(latestGuard());

  const t = ctx.tenantId;
  const loadList = useCallback(async () => {
    if (t === null) return;
    const r = await listProgrammes(t, ctx.scope === 'DOMAIN' ? ctx.domainId : null);
    if (r.ok && r.data !== undefined) setProgrammes(r.data.programmes); else setError(r.error ?? null);
  }, [t, ctx.scope, ctx.domainId]);
  useEffect(() => { void loadList(); }, [loadList]);

  const target = programmes.find((p) => p.programme_id === selected) ?? null;
  const load = useCallback(async () => {
    if (t === null || target === null) { setDetail(null); return; }
    const n = guard.current.next();
    const r = await readProgramme(t, target.target_domain_id, target.programme_id);
    if (!guard.current.current(n)) return;                                                  // a later selection answered first: this answer is stale
    if (r.ok && r.data !== undefined) { setDetail(r.data); setError(null); } else { setDetail(null); setError(r.error ?? null); }
    const m = await myRecords(t, target.target_domain_id);
    if (guard.current.current(n)) setMine(m.ok && m.data !== undefined ? { training: m.data.training, competence: m.data.competence } : null);
  }, [t, target]);
  useEffect(() => { void load(); }, [load]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setError(null); await load(); await loadList(); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };

  const gate = detail?.gate ?? null;
  const d = target?.target_domain_id ?? null;
  const elig = goliveEligibility(ctx, gate);
  const g = gateLabel(gate?.state ?? 'held');
  const priority = (detail?.items ?? []).filter((i) => i['kind'] === 'journey' && (i['attributes'] as Row)['priority'] === true);
  const isAuthority = ctx.roles.includes('onboarding_authority') && !ctx.roles.includes('implementation_lead');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Implementation, readiness and go-live</h1>
      <p data-testid="global-context" style={{ ...muted, fontFamily: 'var(--eye-font-mono)' }}>{contextLine(ctx)}</p>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
        The gate reads readiness only: no measure, cohort result or percentage releases it; an unfilled accountable role, an unresolved owner and an inaccessible path are never overridable.
        Training and competence are complete | not yet — no score, no rank, no performance inference. Every record here is SYNTHETIC; an in-product go-live demonstrates the software (customer acceptance is R2).
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      <Panel title="Programme">
        <label>Implementation programme
          <select style={inputStyle} value={selected} onChange={(e) => { setSelected(e.target.value); setReceipt(null); }}>
            <option value="">choose a programme</option>
            {programmes.map((p) => <option key={p.programme_id} value={p.programme_id}>{p.title} · v{p.version} · {p.state} · gate {String(p.gate?.state ?? '—')}</option>)}
          </select>
        </label>
        <span style={muted}> {programmes.length} programme(s){ctx.scope === 'DOMAIN' ? ' targeting this domain' : ' of the tenant'}</span>
      </Panel>
      {detail === null || gate === null ? (selected === '' ? <p>No programme selected.</p> : <p>Loading the programme…</p>) : (
        <>
          <Panel title="Go-live gate (status first)">
            <p data-testid="gate-state"><strong style={{ color: `var(${g.token})` }}>{g.text}</strong></p>
            <p style={muted}>programme v{detail.programme.version} · {detail.programme.state} · domain {detail.programme.domain_name ?? detail.programme.target_domain_id} ({detail.programme.domain_status ?? '—'})
              · gate digest <Mono>{gate.digest}</Mono> · evaluated {fmtInstant(gate.evaluated_at)} · read {fmtInstant(detail.read_at)}</p>
            {gate.blocking.length > 0 ? (
              <ol aria-label="blocking items" data-testid="blocking" style={{ color: 'var(--eye-color-critical)' }}>
                {gate.blocking.map((b) => <li key={`${b.kind}-${b.item_key}`}>{blockingLine(b)}</li>)}
              </ol>
            ) : <p>No blocking item stands.</p>}
            {gate.owner_gap ? <p role="alert" style={{ color: 'var(--eye-color-warning)' }}>No unambiguous accountable owner: the go-live stops and the gap stays visible until it is filled (IA-04-005).</p> : null}
            <p style={muted}>{gate.rule}</p>
            <GovernedButton label="Re-evaluate the gate" pendingLabel="evaluating" variant="quiet" disabled={d === null || t === null}
              onRun={async () => after(await acts.evaluate(t!, d!, detail.programme.programme_id))} />
          </Panel>

          <Panel title="Go-live decision">
            <p data-testid="golive-eligibility" style={{ color: elig.approve ? 'var(--eye-color-success)' : 'var(--eye-color-ink-muted)' }}>{elig.reason}</p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
              <label>Accepted operating cadence
                <select style={inputStyle} value={cadence} onChange={(e) => setCadence(e.target.value)}>
                  <option value="">choose a cadence</option>
                  {detail.cadences.map((c) => <option key={String(c['cadence_id'])} value={String(c['cadence_id'])}>{String(c['period'])} #{String(c['sequence'])} · opened {fmtInstant(c['opened_at'])}</option>)}
                </select>
              </label>
              <fieldset><legend style={muted}>Accepted priority journeys</legend>
                {priority.length === 0 ? <span style={muted}>the programme declares no priority journey</span> : priority.map((j) => (
                  <label key={String(j['item_id'])} style={{ marginInlineEnd: 'var(--eye-space-8)' }}>
                    <input type="checkbox" checked={journeys.includes(String(j['item_id']))}
                      onChange={(e) => setJourneys(e.target.checked ? [...journeys, String(j['item_id'])] : journeys.filter((x) => x !== String(j['item_id'])))} />
                    {String(j['title'])} ({String((j['attributes'] as Row)['journey_ref'])})
                  </label>))}
              </fieldset>
              <label>Reason<input type="text" style={{ ...inputStyle, minInlineSize: '20rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>
            </div>
            <p data-testid="consequence" style={{ fontSize: 'var(--eye-type-body-sm)' }}>{consequencePreview(detail.programme, gate, journeys, cadence === '' ? null : cadence)}</p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
              <GovernedButton label="Approve go-live (signed)" pendingLabel="approving" disabled={!elig.approve || reason.trim().length < 8 || cadence === '' || journeys.length === 0}
                onRun={async () => after(await acts.golive(t!, d!, detail.programme.programme_id, { decision: 'approve', gateDigest: gate.digest, cadenceId: cadence, journeys, reason: reason.trim() }))} />
              <GovernedButton label="Withhold acceptance" pendingLabel="withholding" variant="quiet" disabled={!elig.withhold || reason.trim().length < 8}
                onRun={async () => after(await acts.golive(t!, d!, detail.programme.programme_id, { decision: 'withhold', gateDigest: gate.digest, reason: reason.trim() }))} />
            </div>
            <ul aria-label="go-live decisions" style={{ fontSize: 'var(--eye-type-body-sm)' }}>
              {detail.decisions.map((x) => (
                <li key={String(x['decision_id'])} style={x['decision'] === 'approve' ? approvedStyle : proposedStyle}>
                  {fmtInstant(x['decided_at'])} — <strong>{String(x['decision']).toUpperCase()}</strong> by {String(x['decided_by_name'] ?? x['decided_by'])} ({String(x['decided_role'])}) at gate <Mono>{String(x['gate_digest']).slice(0, 12)}…</Mono>
                  {' '}· claim {String(x['claim'])} · {Array.isArray(x['signatures']) && (x['signatures'] as Row[]).length > 0 ? `signed ${String((x['signatures'] as Row[])[0]!['key_id'])}` : 'unsigned (a withhold is recorded, not signed)'} — {String(x['reason'])}
                </li>))}
            </ul>
          </Panel>

          <Panel title="Readiness items (evaluated live)">
            <ScrollBox label="readiness items">
              <table style={tableStyle}><thead><tr><Th>Item</Th><Th>Kind</Th><Th>State</Th><Th>Why</Th><Th>Facts</Th><Th>Version · digest</Th><Th>Acts</Th></tr></thead>
                <tbody>{gate.items.map((it: GateItem) => { const l = itemLabel(it.state); return (
                  <tr key={it.item_id}>
                    <Td>{it.title}{it.blocking ? '' : ' (non-blocking)'}</Td><Td>{it.kind}</Td>
                    <Td><span style={{ color: `var(${l.token})` }}>{l.mark} {l.text}</span>{!it.overridable ? <span style={muted}> · not overridable</span> : null}</Td>
                    <Td>{it.reason ?? '—'}</Td><Td><Mono>{JSON.stringify(it.facts)}</Mono></Td><Td>v{it.version} · <Mono>{it.digest.slice(0, 12)}…</Mono></Td>
                    <Td>
                      {it.kind === 'custom' && it.state !== 'satisfied' ? (
                        <GovernedButton label="Confirm" pendingLabel="confirming" variant="quiet" disabled={statement.trim().length < 8 || ctx.roles.includes('implementation_lead')}
                          onRun={async () => after(await acts.confirm(t!, d!, it.item_id, { version: it.version, digest: it.digest, statement: statement.trim() }))} />) : null}
                      {it.state === 'unsatisfied' && it.blocking && it.overridable ? (
                        <GovernedButton label="Accept as residual risk (signed)" pendingLabel="accepting" variant="critical" disabled={!isAuthority || residualReason.trim().length < 12}
                          onRun={async () => after(await acts.acceptResidual(t!, d!, it.item_id, { version: it.version, digest: it.digest, reason: residualReason.trim() }))} />) : null}
                    </Td>
                  </tr>); })}</tbody></table>
            </ScrollBox>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
              <label>Confirmation statement<input type="text" style={inputStyle} value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="what was confirmed (8+)" /></label>
              <label>Residual-risk reason<input type="text" style={inputStyle} value={residualReason} onChange={(e) => setResidualReason(e.target.value)} placeholder="the risk accepted (12+); the onboarding authority only" /></label>
            </div>
            {!isAuthority ? <p style={muted}>Residual risk is accepted only by a named onboarding authority who is not a lead — and never for an unfilled role, an unresolved owner or an inaccessible path.</p> : null}
          </Panel>

          <Panel title="Enablement (accessible training, competence — counts per role)">
            <ul style={{ fontSize: 'var(--eye-type-body-sm)' }}>
              {detail.enablement.coverage.paths.map((p) => (
                <li key={String(p['path_key'])}><strong>{String(p['title'])}</strong> v{String(p['version'])} · accessibility <strong>{String((p['accessibility'] as Row)['state'])}</strong> · <Mono>{String(p['digest']).slice(0, 12)}…</Mono>
                  {' '}— {(p['by_role'] as Row[]).map((r) => `${String(r['role'])}: ${String(r['complete'])} of ${String(r['holders'])} complete`).join(' · ')}</li>))}
            </ul>
            <p style={muted}>{detail.enablement.coverage.note}</p>
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Competence: {detail.enablement.coverage.competence.length === 0 ? 'none recorded' : detail.enablement.coverage.competence.map((c) => `${String(c['competence_key'])} (${String(c['role'])}): ${String(c['complete'])} of ${String(c['recorded'])} recorded complete`).join(' · ')}</p>
            <p style={muted}>Person records visible to you: {detail.enablement.records.training.length} training, {detail.enablement.records.competence.length} competence (the subject, the recorder and the authorities see a person's records).</p>
            {mine !== null ? <p data-testid="my-records" style={{ fontSize: 'var(--eye-type-body-sm)' }}>Your own records: {mine.training.map((r) => `${String(r['path_key'])} v${String(r['path_version'])} ${String(r['state'])}`).join(', ') || 'no training record'}; {mine.competence.map((r) => `${String(r['competence_key'])} ${String(r['outcome'])}`).join(', ') || 'no competence record'}.</p> : null}
          </Panel>

          <Panel title="Cohorts and adoption measures (k ≥ 5)">
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Cohorts (role × wave — never a person): {detail.cohorts.length === 0 ? 'none declared' : detail.cohorts.map((c) => `${String(c['role_code'])} × ${String(c['wave_key'])}`).join(' · ')}</p>
            <ul aria-label="measures" style={{ fontSize: 'var(--eye-type-body-sm)' }}>{detail.measures.map((m) => <li key={String(m['metric_key'])}>{measureLine(m)}</li>)}</ul>
            <p style={muted}>A share is shown only at or above k: {cohortShare(0, 3)} is how three people read. A measure may block readiness (marked misleading); it never releases it.</p>
            {gate.measures.length > 0 ? <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Cited in readiness: {gate.measures.map((m) => `${String(m['metric_key'])} — ${String(m['state'])}`).join(' · ')}</p> : null}
          </Panel>

          <Panel title="Shadow workflows">
            {detail.shadow.findings.length === 0 ? <p>No shadow finding recorded.</p> : (
              <ul style={{ fontSize: 'var(--eye-type-body-sm)' }}>{detail.shadow.findings.map((f) => (
                <li key={String(f['finding_id'])} style={f['state'] === 'resolved' ? approvedStyle : proposedStyle}>{fmtInstant(f['recorded_at'])} — {String(f['source_key'])}: {String((f['attempt'] as Row)['refusal'])} · <strong>{String(f['state'])}</strong>
                  {f['remediation'] !== null ? ` · remediation: ${String(f['remediation'])}` : ''}</li>))}</ul>)}
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>Shadow-process reviews: {detail.shadow.reviews.length === 0 ? 'none declared' : detail.shadow.reviews.map((r) => `${fmtInstant(r['reviewed_at'])} by ${String(r['reviewed_by_name'])} (${String(r['open_findings'])} open)`).join(' · ')}</p>
          </Panel>

          <Panel title="The programme's parts, changes and history">
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>{String(detail.programme.plan['objective'] ?? '')} · owner {detail.programme.owner_name ?? detail.programme.owner_principal_id} · opened {fmtInstant(detail.programme.opened_at)} · v{detail.programme.version} effective {fmtInstant(detail.programme.effective_from)} · <Mono>{detail.programme.digest.slice(0, 12)}…</Mono>
              {detail.programme.held_reasons.length > 0 ? ` · held: ${detail.programme.held_reasons.join('; ')}` : ''}</p>
            <ScrollBox label="programme parts">
              <table style={tableStyle}><thead><tr><Th>Kind</Th><Th>Key</Th><Th>Title</Th><Th>Attributes</Th><Th>Version</Th></tr></thead>
                <tbody>{detail.items.map((i) => (
                  <tr key={String(i['item_id'])}><Td>{String(i['kind'])}</Td><Td mono>{String(i['item_key'])}</Td><Td>{String(i['title'])}{i['state'] === 'retired' ? ' (retired)' : ''}</Td>
                    <Td>{i['kind'] === 'milestone' ? `due ${dayText((i['attributes'] as Row)['due_on'])} · ${String((i['attributes'] as Row)['status'])}` : <Mono>{JSON.stringify(i['attributes'])}</Mono>}</Td><Td>v{String(i['version'])}</Td></tr>))}</tbody></table>
            </ScrollBox>
            <ul aria-label="changes" style={{ fontSize: 'var(--eye-type-body-sm)' }}>
              {detail.changes.map((c) => (
                <li key={String(c['change_id'])} style={c['state'] === 'approved' ? approvedStyle : proposedStyle}>
                  {c['state'] === 'proposed' ? 'PROPOSED' : String(c['state']).toUpperCase()} — {String(c['title'])} (by {String(c['proposed_by_name'])}{c['decided_by_name'] !== null ? `; decided by ${String(c['decided_by_name'])}` : ''}) · <Mono>{String(c['digest']).slice(0, 12)}…</Mono>
                  {c['state'] === 'proposed' && (ctx.roles.includes('customer_sponsor') || ctx.roles.includes('onboarding_authority')) && !ctx.roles.includes('implementation_lead') ? (
                    <GovernedButton label="Approve change" pendingLabel="approving" variant="quiet" disabled={reason.trim().length < 8}
                      onRun={async () => after(await acts.decideChange(t!, String(c['change_id']), { decision: 'approve', digest: String(c['digest']), reason: reason.trim() }))} />) : null}
                </li>))}
            </ul>
            <details><summary>Ledger ({detail.ledger.length})</summary>
              <ol style={{ fontSize: 'var(--eye-type-label-sm)' }}>{detail.ledger.map((e) => <li key={String(e['event_id'])}>{fmtInstant(e['occurred_at'])} — {String(e['event'])} · {String(e['subject_kind'])} · {String(e['actor_name'] ?? '')}</li>)}</ol>
            </details>
            <p style={muted}>{detail.boundary}</p>
          </Panel>
        </>
      )}
    </>
  );
}
