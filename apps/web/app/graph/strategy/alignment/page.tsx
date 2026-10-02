'use client';
/**
 * Strategy alignment — CP-6 B32 (0089 §G; F-P6-09: PR-37-001..006, CAP-DS-08, AT-37, PER-09).
 *
 * THE GAP MATRIX: each active objective against each capability that supports it, with the five criteria of alignment_rule@1 SHOWN
 * one by one and the count met — a count, never a weighted score, so a missing component is never averaged away (ES-47-002). A row a
 * detection holds says HELD and makes no claim.
 *
 * THE DETECTIONS: conflict, stale measure, dependency cycle (with its path) and missing owner, each with its DECLARED CONTINUITY in
 * words and a glyph (never colour alone) and whom it is routed to.
 *
 * THE HUMAN AUTHORITY: setting an objective, approving a measure or a trade-off, allocating a resource are a named human's acts on the
 * DIGEST of the version this screen showed — the server refuses a stale digest, the declarer, and anyone the policy does not name.
 * Nothing here is computed on the client: every judgement is the server's, AS OF the instant the answer states.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { graph, type StrategyRow } from '../../../../lib/graph';
import { alignment, CLAIM_LABEL, CONTINUITY_LABEL, REASON_LABEL, criteriaLine, freshnessLine,
  type AlignmentKind, type AlignmentRow, type AuthorityAct, type Detection, type Gaps, type MeasureRow,
  /* B36 (0094 §S) strategy */ strategyCompletion, actStanding, raisedLine, type AuthorityActRow, type PlanLinks, type RaisedDetection /* end B36 strategy */ } from '../../../../lib/strategy-alignment';
import { Empty, LiveStatus, Mono, cardStyle, UnknownNote, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../form-bits';

const KINDS: Array<{ code: AlignmentKind; label: string }> = [
  { code: 'supports', label: 'supports — objective → the capability it needs' },
  { code: 'builds', label: 'builds — initiative → the capability it builds' },
  { code: 'resources', label: 'resources — resource → the initiative it resources' },
  { code: 'measures', label: 'measures — measure → the objective it measures' },
  { code: 'affects', label: 'affects — stakeholder → the objective that affects them' },
  { code: 'conflicts_with', label: 'conflicts with — objective ↔ objective, initiative ↔ initiative' },
];
const ACTS: Array<{ code: AuthorityAct; label: string }> = [
  { code: 'set_objective', label: 'set an objective' },
  { code: 'approve_measure', label: 'approve a measure definition' },
  { code: 'approve_tradeoff', label: 'approve a trade-off (a conflict)' },
  { code: 'allocate_resource', label: 'allocate a resource (a resources alignment)' },
];

export default function StrategyAlignmentPage() {
  const { scope, isStrategyOwner } = useShell();
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [alignments, setAlignments] = useState<AlignmentRow[]>([]);
  const [objects, setObjects] = useState<StrategyRow[]>([]);
  /* B36 (0094 §S) strategy: the acts (revocable), the schedule's detections, the plan links */
  const [acts, setActs] = useState<AuthorityActRow[]>([]);
  const [raised, setRaised] = useState<RaisedDetection[]>([]);
  const [plans, setPlans] = useState<PlanLinks | null>(null);
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});
  const [revokeProblem, setRevokeProblem] = useState<string | null>(null);
  /* end B36 strategy */
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  // the alignment form
  const [kind, setKind] = useState<AlignmentKind>('supports');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [strength, setStrength] = useState<'weak' | 'moderate' | 'strong'>('moderate');
  const [rationale, setRationale] = useState('');
  // the authority form
  const [act, setAct] = useState<AuthorityAct>('set_objective');
  const [subject, setSubject] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [actRationale, setActRationale] = useState('');

  const load = async () => {
    const [g, d, m, a, s] = await Promise.all([alignment.gaps(scope), alignment.detections(scope), alignment.measures(scope), alignment.list(scope), graph.listStrategy(scope)]);
    if (!g.ok || g.data === undefined) { setProblem(g.error?.message ?? 'the gap view could not be read'); return; }
    setGaps(g.data.gaps);
    setDetections(d.ok && d.data !== undefined ? d.data.detections.detections : []);
    setMeasures(m.ok && m.data !== undefined ? m.data.measures : []);
    setAlignments(a.ok && a.data !== undefined ? a.data.alignments : []);
    setObjects(s.ok && s.data !== undefined ? s.data.strategy.filter((x) => x.status === 'active') : []);
    /* B36 (0094 §S) */
    const [ac, rd, pl] = await Promise.all([strategyCompletion.acts(scope), strategyCompletion.raised(scope), strategyCompletion.planLinks(scope)]);
    setActs(ac.ok && ac.data !== undefined ? ac.data.acts : []);
    setRaised(rd.ok && rd.data !== undefined ? rd.data.detections : []);
    setPlans(pl.ok && pl.data !== undefined ? pl.data.links : null);
    /* end B36 */
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (gaps === null) return <Empty>reading the gap view…</Empty>;

  // the subjects an act may name, each with the DIGEST the screen shows (what the approver read)
  const subjects: Array<{ id: string; label: string; digest: string }> = act === 'set_objective'
    ? [...new Map(gaps.rows.map((r) => [r.objective_id, { id: r.objective_id, label: `OBJ — ${r.objective_title} (v${r.objective_subject.version})`, digest: r.objective_subject.digest }])).values()]
    : act === 'approve_measure'
      ? measures.map((m) => ({ id: m.measure_id, label: `MSR — ${m.title} (definition v${m.definition_version}, ${m.approval_state})`, digest: m.subject.digest }))
      : alignments.filter((x) => x.kind === (act === 'approve_tradeoff' ? 'conflicts_with' : 'resources'))
        .map((x) => ({ id: x.alignment_id, label: `${x.kind} ${x.from_type} → ${x.to_type} (${x.alignment_id.slice(0, 8)}…)`, digest: x.digest }));
  const chosen = subjects.find((x) => x.id === subject);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Strategy alignment</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        As of <Mono>{fmtInstant(gaps.at)}</Mono> · {gaps.rule ?? 'no objective yet'}
      </p>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Gap matrix</h2>
      {gaps.rows.length === 0 ? <Empty>No active objective has been declared.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>
            {gaps.rows.length} row(s) — held rows first, then the fewest criteria met
          </caption>
          <thead><tr><Th>Objective</Th><Th>Capability</Th><Th>Criteria</Th><Th>Gaps</Th><Th>Evidence</Th><Th>Initiatives</Th><Th>Measures</Th><Th>Claim</Th></tr></thead>
          <tbody>
            {gaps.rows.map((r) => (
              <tr key={`${r.objective_id}:${r.capability_id ?? 'none'}:${r.alignment_id ?? ''}`}>
                <Td>{r.objective_title}{r.objective_set.set ? ' · set' : ' · not set'}</Td>
                <Td>{r.capability_title ?? 'none'}</Td>
                <Td>{criteriaLine(r)}</Td>
                <Td>{r.gap_reasons.length === 0 ? 'none' : r.gap_reasons.map((g) => REASON_LABEL[g] ?? g).join('; ')}</Td>
                <Td>{r.capability_id === null ? '—' : `${r.evidence_count} counted, strongest ${r.strongest_truth ?? 'none'}`}</Td>
                <Td>{r.capability_id === null ? '—' : `${r.initiatives_active} active, ${r.initiatives_resourced} resourced`}</Td>
                <Td>{r.measures.length === 0 ? 'none' : r.measures.map((m) => `${m.title}: ${m.approved ? 'approved' : m.approval_state}, ${freshnessLine(m)}`).join('; ')}</Td>
                <Td>{CLAIM_LABEL[r.alignment_claim]}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Detections</h2>
      {detections.length === 0 ? <Empty>No conflict, stale measure, dependency cycle or missing owner.</Empty> : (
        <ul style={{ paddingInlineStart: '1rem' }}>
          {detections.map((d) => (
            <li key={d.detection_key} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
              <strong>{d.detection_kind.replace('_', ' ')}</strong> · {d.state === 'resolved' ? `resolved by act ${d.resolved_by ?? ''}` : 'open'} — {d.detail}
              <br /><span>{CONTINUITY_LABEL[d.continuity]}</span>
              {d.path === null ? null : <><br />path: {d.path.map((x) => `${x.type} "${x.title}"`).join(' → ')}</>}
              <br />routed to: {d.routed_to.length === 0 ? 'nobody holds the planning roles' : d.routed_to.map((x) => <Mono key={x}>{x.slice(0, 8)}… </Mono>)}
            </li>
          ))}
        </ul>
      )}

      {/* B36 (0094 §S7): the detections the SCHEDULE raised and routed — the list above is "as of this read"; these exist without anyone reading the page */}
      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Detections raised by the schedule</h2>
      {raised.length === 0 ? <Empty>The attention tick has raised no strategy detection yet.</Empty> : (
        <ul aria-label="detections raised by the schedule" style={{ paddingInlineStart: '1rem' }}>
          {raised.map((d) => (
            <li key={d.detection_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
              <strong>{raisedLine(d)}</strong> — {d.detail}
              <br /><span style={{ color: 'var(--eye-color-ink-muted)' }}>raised {fmtInstant(d.raised_at)} · subject {d.subject_type} <Mono>{d.subject_id.slice(0, 8)}…</Mono></span>
            </li>
          ))}
        </ul>
      )}

      {/* B36 (0094 §S8): the plan links, only when Part P's planning objects exist in this deployment */}
      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Plans and initiatives</h2>
      {plans === null || !plans.available ? <Empty>{plans?.reason ?? 'no planning objects in this deployment'}</Empty> : plans.initiatives.length === 0 ? <Empty>No initiative is linked to an objective yet.</Empty> : (
        <ul aria-label="plan links" style={{ paddingInlineStart: '1rem' }}>
          {plans.initiatives.map((i, n) => <li key={String(i['initiative_id'] ?? n)}>{String(i['title'] ?? i['initiative_id'] ?? '')} — objective <Mono>{String(i['objective_id'] ?? '').slice(0, 8)}…</Mono>{i['state'] !== undefined ? ` · ${String(i['state'])}` : ''}</li>)}
        </ul>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Measures</h2>
      {measures.length === 0 ? <Empty>No measure is defined.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Measure</Th><Th>Target</Th><Th>Latest</Th><Th>Freshness</Th><Th>Approval</Th></tr></thead>
          <tbody>
            {measures.map((m) => (
              <tr key={m.measure_id}>
                <Td>{m.title}</Td>
                <Td>{String(m.target_value)} {m.unit}{m.target_date === null ? '' : ` by ${m.target_date}`} ({m.direction})</Td>
                <Td>{m.last_value === null ? 'no observation' : `${String(m.last_value)} ${m.unit} at ${fmtInstant(m.last_observed_at)}`}</Td>
                <Td>{freshnessLine(m)}</Td>
                <Td>{m.approved_now ? `approved (definition v${m.definition_version})` : `${m.approval_state} — not a health input`}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isStrategyOwner ? (
        <UnknownNote>
          Declaring an alignment needs the <Mono>strategy_owner</Mono> role in this domain. An agent may detect misalignment and recommend; it
          never declares an alignment or records an authority act.
        </UnknownNote>
      ) : (
        <section aria-labelledby="aln-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="aln-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare an alignment</h2>
          <label htmlFor="aln-kind">Kind</label>
          <select id="aln-kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as AlignmentKind)}>
            {KINDS.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
          </select>
          <label htmlFor="aln-from">From</label>
          <select id="aln-from" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">— choose —</option>
            {objects.map((o) => <option key={o.strategy_object_id} value={o.strategy_object_id}>{o.object_type} — {o.title}</option>)}
          </select>
          <label htmlFor="aln-to">To</label>
          <select id="aln-to" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">— choose —</option>
            {objects.map((o) => <option key={o.strategy_object_id} value={o.strategy_object_id}>{o.object_type} — {o.title}</option>)}
          </select>
          <label htmlFor="aln-strength">Declared strength</label>
          <select id="aln-strength" style={inputStyle} value={strength} onChange={(e) => setStrength(e.target.value as 'weak' | 'moderate' | 'strong')}>
            <option value="weak">weak</option><option value="moderate">moderate</option><option value="strong">strong</option>
          </select>
          <label htmlFor="aln-why">Why they are aligned (at least 8 characters)</label>
          <input id="aln-why" style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <GovernedButton
            label="Declare" pendingLabel="declaring" disabled={from === '' || to === '' || rationale.trim().length < 8}
            onRun={async () => {
              const r = await alignment.declare(scope, { kind, from, to, strength, rationale });
              if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the alignment was refused');
              setReceipt(r.data.receipt); setRationale('');
              await load();
            }}
          />
        </section>
      )}

      <section aria-labelledby="auth-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="auth-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Human authority</h2>
        <UnknownNote>
          An authority act is recorded by a named human holding executive, decision authority, domain administrator or strategy owner — never
          by whoever declared the subject — on the version shown here (its digest), and it expires in 180 days.
        </UnknownNote>
        <label htmlFor="act-kind">Act</label>
        <select id="act-kind" style={inputStyle} value={act} onChange={(e) => { setAct(e.target.value as AuthorityAct); setSubject(''); }}>
          {ACTS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
        </select>
        <label htmlFor="act-subject">Subject</label>
        <select id="act-subject" style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">— choose —</option>
          {subjects.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {chosen === undefined ? null : <p>Digest read: <Mono>{chosen.digest}</Mono></p>}
        <label htmlFor="act-decision">Decision</label>
        <select id="act-decision" style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value as 'approve' | 'reject')}>
          <option value="approve">approve</option><option value="reject">reject</option>
        </select>
        <label htmlFor="act-why">Rationale (at least 8 characters)</label>
        <input id="act-why" style={inputStyle} value={actRationale} onChange={(e) => setActRationale(e.target.value)} />
        <GovernedButton
          label="Record the act" pendingLabel="recording" disabled={chosen === undefined || actRationale.trim().length < 8}
          onRun={async () => {
            if (chosen === undefined) return;
            const r = await alignment.act(scope, chosen.id, { actKind: act, subjectDigest: chosen.digest, decision, rationale: actRationale,
              expiresAt: new Date(Date.now() + 180 * 86_400_000).toISOString() });
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
            setReceipt(r.data.receipt); setActRationale('');
            await load();
          }}
        />
      </section>
      {/* B36 (0094 §S6): the acts recorded, each with its standing; REVOCATION by the act's issuer or a domain administrator, with a reason — the gap view and the walk see it at once */}
      <section aria-labelledby="acts-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="acts-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Authority acts and their revocation</h2>
        {acts.length === 0 ? <Empty>No authority act has been recorded.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Act</Th><Th>Subject</Th><Th>Decision</Th><Th>Standing</Th><Th>Revoke</Th></tr></thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.act_id}>
                  <Td>{a.act_kind} <span style={{ color: 'var(--eye-color-ink-muted)' }}>by <Mono>{a.approver_principal_id.slice(0, 8)}…</Mono> at {fmtInstant(a.recorded_at)}</span></Td>
                  <Td>{a.subject_kind} <Mono>{a.subject_id.slice(0, 8)}…</Mono> v{a.subject_version}</Td>
                  <Td>{a.decision} — {a.rationale}</Td>
                  <Td>{actStanding(a)}</Td>
                  <Td>{a.revoked_at !== null ? '—' : (
                    <div style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                      <label htmlFor={`rv-${a.act_id}`}>Reason (8+ characters)</label>
                      <input id={`rv-${a.act_id}`} style={inputStyle} value={revokeReason[a.act_id] ?? ''} onChange={(e) => setRevokeReason({ ...revokeReason, [a.act_id]: e.target.value })} />
                      <GovernedButton label={`Revoke ${a.act_kind}`} pendingLabel="revoking" variant="critical" disabled={(revokeReason[a.act_id] ?? '').trim().length < 8} onRun={async () => {
                        const r = await strategyCompletion.revoke(scope, a.act_id, revokeReason[a.act_id] ?? '');
                        if (!r.ok || r.data === undefined) { const m = r.error?.message ?? 'the revocation was refused'; setRevokeProblem(m); throw new Error(m); }
                        setRevokeProblem(null); setReceipt(r.data.receipt); await load();
                      }} />
                    </div>
                  )}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {revokeProblem !== null && <LiveStatus assertive>{revokeProblem}</LiveStatus>}
      </section>
      <Receipt receipt={receipt} />
    </>
  );
}
