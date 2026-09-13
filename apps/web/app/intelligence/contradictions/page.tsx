'use client';
/**
 * Contradictions — the incompatible assertions of the domain (0066 §5, interface L2-I03 ContradictionDetected).
 *
 * Two admitted assertions about the same SUBJECT and PREDICATE whose values are incompatible are a CONTRADICTION. The
 * product LINKS them and collapses neither: the row names both (object id and version each), the newer assertion is
 * queued for a person's review with the reason `contradiction`, and each assertion keeps its own truth state. Three acts
 * happen here, every one of them the server's to grant or refuse:
 *
 *  * an ADJUDICATION records how the two stand (both stand; one withdrawn; superseded) — it is the only mutation the
 *    row ever takes, and neither assertion is deleted by it;
 *  * the REVIEW CASE the detection opened is decided through the review route (approve, reject, or correct with a
 *    corrected value — a correction admits a new version of the claim; the prior version stays retrievable);
 *  * a CHALLENGE opens a review case on any admitted claim version with a reason (V00-T-037).
 *
 * Nothing here predicts a result: every row, assertion, case and receipt is rendered as the server returned it, and a
 * refusal is shown with the code and the message the server stated (UX-ADR-017).
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { intelligence, type Adjudication, type ClaimRow, type ContradictionRow, type ReviewCase } from '../../../lib/intelligence';
import { Empty, GovernedButton, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote,
  fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt, TruthBadge, LifecycleBadge } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Side = 'a' | 'b';
const STATES = ['all', 'open', 'adjudicated'] as const;
const ADJUDICATIONS: readonly Adjudication[] = ['both_stand', 'a_withdrawn', 'b_withdrawn', 'superseded'];
const ADJUDICATION_MEANING: Record<Adjudication, string> = {
  both_stand: 'both assertions stand, each with its own truth state',
  a_withdrawn: 'assertion A is withdrawn; B stands',
  b_withdrawn: 'assertion B is withdrawn; A stands',
  superseded: 'one assertion was superseded (corrected) so that the two agree',
};
const DECISIONS = ['approve', 'correct', 'reject'] as const;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

/** What was read about one assertion: the claim's versions and cases, or the server's refusal, verbatim. */
interface AssertionRead { versions: ClaimRow[]; current: ClaimRow | null; cases: ReviewCase[] }
interface Reads { a: AssertionRead | null; aProblem: string | null; b: AssertionRead | null; bProblem: string | null }

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const linkButton = { font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

/**
 * One assertion of the pair, as the contradiction row names it and as the claim route served it. The version the row
 * names is the one shown; when the claim has moved on since, the current version is stated beside it — the row's link
 * is to the version, not to whatever the claim says today.
 */
function Assertion({ side, c, read, problem }: { side: Side; c: ContradictionRow; read: AssertionRead | null; problem: string | null }) {
  const objectId = side === 'a' ? c.a_object_id : c.b_object_id;
  const version = Number(side === 'a' ? c.a_version : c.b_version);
  const value = side === 'a' ? c.a_value : c.b_value;
  const named = read === null ? null : read.versions.find((v) => Number(v.object_version) === version) ?? null;
  const current = read === null ? null : read.current;
  const basisTruth = side === 'a' ? c.basis['a_truth_state'] : undefined;
  return (
    <div style={{ ...cardStyle, background: 'var(--eye-color-surface-secondary)' }}>
      <h4 style={{ ...h3, marginBlockStart: 0 }}>Assertion {side.toUpperCase()} {side === 'a' ? '— the one that stood' : '— the one admitted against it'}</h4>
      <dl style={{ margin: 0 }}>
        <DefinitionRow term="Claim"><Mono title={objectId}>{objectId}</Mono> @ version <Mono>{String(version)}</Mono></DefinitionRow>
        <DefinitionRow term="Subject">{str(c.subject)}</DefinitionRow>
        <DefinitionRow term="Predicate"><Mono>{str(c.predicate)}</Mono></DefinitionRow>
        <DefinitionRow term="Value (as linked)"><strong>{value === null ? '(no value)' : value}</strong></DefinitionRow>
        {problem !== null && (
          <DefinitionRow term="Truth state"><span style={critical}>not served — {problem}</span></DefinitionRow>
        )}
        {problem === null && read === null && <DefinitionRow term="Truth state"><span style={muted}>reading the claim…</span></DefinitionRow>}
        {read !== null && named === null && (
          <DefinitionRow term="Truth state">
            <span style={muted}>the claim route served {read.versions.length} version(s) and none is version {version}</span>
            {basisTruth !== undefined ? <> · the basis recorded <TruthBadge state={String(basisTruth)} /> at detection</> : null}
          </DefinitionRow>
        )}
        {named !== null && (
          <>
            <DefinitionRow term="Truth state"><TruthBadge state={String(named.truth_state)} /> <LifecycleBadge state={String(named.lifecycle_state)} /> · <Mono>{str(named.object_type)}</Mono> · {str(named.payload.claim_kind)}</DefinitionRow>
            <DefinitionRow term="Value at that version">{str(named.payload.object_value)}{named.payload.subject !== c.subject || named.payload.predicate !== c.predicate ? <span style={muted}> · the version states {str(named.payload.subject)} / {str(named.payload.predicate)}</span> : null}</DefinitionRow>
            <DefinitionRow term="Recorded">{fmtInstant(named.recorded_at)}{named.event_time !== null ? <> · event time {fmtInstant(named.event_time)}</> : null}</DefinitionRow>
            <DefinitionRow term="Confidence"><Mono>{str(named.payload.confidence)}</Mono> · mode <Mono>{str(named.payload.lineage?.mode)}</Mono> · method <Mono>{str(named.payload.lineage?.method_key)}</Mono></DefinitionRow>
            <DefinitionRow term="Review on the claim">{str(named.payload.review?.state)}{named.payload.review?.reason !== null && named.payload.review?.reason !== undefined ? <> — {String(named.payload.review.reason)}</> : null}</DefinitionRow>
          </>
        )}
        {current !== null && Number(current.object_version) !== version && (
          <DefinitionRow term="Since then">
            the claim is now version <Mono>{String(current.object_version)}</Mono> — <TruthBadge state={String(current.truth_state)} /> <LifecycleBadge state={String(current.lifecycle_state)} />, value {str(current.payload.object_value)}; the link is to version {version} and stays
          </DefinitionRow>
        )}
      </dl>
    </div>
  );
}

/** The review case as the claim route served it (a case is served with the claim it is on; there is no case route). */
function CaseDetail({ k }: { k: ReviewCase }) {
  return (
    <dl style={{ margin: 0 }}>
      <DefinitionRow term="Case"><Mono>{k.case_id}</Mono> · state <strong>{k.state}</strong></DefinitionRow>
      <DefinitionRow term="Queued because"><Mono>{k.queued_reason}</Mono>{k.confidence !== null ? <> · confidence <Mono>{Number(k.confidence).toFixed(2)}</Mono></> : null}</DefinitionRow>
      <DefinitionRow term="On claim">{k.claim_object_id === null ? 'no claim' : <><Mono>{k.claim_object_id}</Mono> @ version <Mono>{str(k.claim_version)}</Mono></>}</DefinitionRow>
      <DefinitionRow term="Opened">{fmtInstant(k.opened_at)} · run <Mono>{short(k.run_id)}</Mono> · method <Mono>{short(k.method_id)}</Mono></DefinitionRow>
      <DefinitionRow term="Decided">{k.decided_at === null ? 'not yet' : <>{fmtInstant(k.decided_at)}{k.decision_reason !== null ? <> — {k.decision_reason}</> : null}{k.superseded_to_version !== null ? <> · the claim became version <Mono>{String(k.superseded_to_version)}</Mono></> : null}</>}</DefinitionRow>
    </dl>
  );
}

export default function ContradictionsPage() {
  const { scope, isExtractionManager } = useShell();
  const [filter, setFilter] = useState<(typeof STATES)[number]>('all');
  const [rows, setRows] = useState<ContradictionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * The selected row is kept as the server last served it, not derived from the filtered list alone: an adjudication
   * made from the `open` filter takes the row out of that list, and the served result and receipt must stay on screen.
   */
  const [selectedRow, setSelectedRow] = useState<ContradictionRow | null>(null);
  const selected = selectedRow === null ? null : selectedRow.contradiction_id;
  const [reads, setReads] = useState<Reads>({ a: null, aProblem: null, b: null, bProblem: null });
  // adjudication (the contradiction route)
  const [adjudication, setAdjudication] = useState<Adjudication>('both_stand');
  const [adjReason, setAdjReason] = useState('');
  const [adjReceipt, setAdjReceipt] = useState<ReceiptT>(null);
  const [adjudicated, setAdjudicated] = useState<Row | null>(null);
  const [adjProblem, setAdjProblem] = useState<string | null>(null);
  // the review case's decision (the review route)
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]>('approve');
  const [decReason, setDecReason] = useState('');
  const [corrected, setCorrected] = useState('');
  const [decReceipt, setDecReceipt] = useState<ReceiptT>(null);
  const [decided, setDecided] = useState<Row | null>(null);
  const [decProblem, setDecProblem] = useState<string | null>(null);
  // a challenge (the review request route)
  const [chClaim, setChClaim] = useState('');
  const [chVersion, setChVersion] = useState('1');
  const [chReason, setChReason] = useState('');
  const [chReceipt, setChReceipt] = useState<ReceiptT>(null);
  const [challenged, setChallenged] = useState<Row | null>(null);
  const [chProblem, setChProblem] = useState<string | null>(null);

  const load = async (state: (typeof STATES)[number]) => {
    setLoading(true);
    try {
      const r = await intelligence.listContradictions(scope, state === 'all' ? undefined : state);
      if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the contradictions could not be listed')); return; }
      const listed = r.data.contradictions;
      setProblem(null); setRows(listed);
      // Refresh the selection from what was served when it is still listed; otherwise keep it as last served.
      setSelectedRow((prev) => (prev === null ? null : listed.find((x) => x.contradiction_id === prev.contradiction_id) ?? prev));
    } finally {
      setLoading(false);
    }
  };
  /** Both assertions, each by its own governed read of the claim route; a refusal on one does not hide the other. */
  const loadAssertions = async (c: ContradictionRow) => {
    const [ra, rb] = await Promise.all([intelligence.getClaim(scope, c.a_object_id), intelligence.getClaim(scope, c.b_object_id)]);
    setReads({
      a: ra.ok && ra.data !== undefined ? { versions: ra.data.versions, current: ra.data.current, cases: ra.data.cases } : null,
      aProblem: ra.ok && ra.data !== undefined ? null : refusal(ra, 'the claim could not be read'),
      b: rb.ok && rb.data !== undefined ? { versions: rb.data.versions, current: rb.data.current, cases: rb.data.cases } : null,
      bProblem: rb.ok && rb.data !== undefined ? null : refusal(rb, 'the claim could not be read'),
    });
  };
  const select = (c: ContradictionRow) => {
    setSelectedRow(c); setReads({ a: null, aProblem: null, b: null, bProblem: null });
    setAdjudication('both_stand'); setAdjReason(''); setAdjReceipt(null); setAdjudicated(null); setAdjProblem(null);
    setDecision('approve'); setDecReason(''); setCorrected(''); setDecReceipt(null); setDecided(null); setDecProblem(null);
    void loadAssertions(c);
  };
  useEffect(() => { void load(filter); }, [scope, filter]);

  if (problem !== null && rows === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the contradictions…</Empty>;

  const current = selectedRow;
  const listedNow = current !== null && rows.some((r) => r.contradiction_id === current.contradiction_id);
  // The case that adjudicates: the row names it; the claim route serves it with the claim it is on (B's, the queued one, or A's).
  const reviewCase = current === null || current.review_case_id === null ? null
    : [...(reads.b?.cases ?? []), ...(reads.a?.cases ?? [])].find((k) => k.case_id === current.review_case_id) ?? null;
  const openCount = rows.filter((r) => r.state === 'open').length;
  const caseId = current === null ? null : current.review_case_id;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Contradictions</h1>
      <UnknownNote>
        Two admitted assertions about the same <strong>subject</strong> and <strong>predicate</strong> whose values are
        incompatible are a contradiction. The product <strong>links</strong> them and collapses neither: each keeps its own
        truth state, the newer one is queued for review with the reason <Mono>contradiction</Mono>, and a person records how
        the two stand — an <strong>adjudication</strong>, the only change the link ever takes. A <strong>challenge</strong> opens
        a review case on any admitted claim version. What the server refuses is shown here as it states it.
      </UnknownNote>
      {problem !== null && <LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus>}

      <section aria-labelledby="list-h" style={cardStyle}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Contradictions ({rows.length}{filter === 'all' ? `, ${openCount} open` : ''})</h2>
        <div style={rowStyle}>
          <Field id="state" label="State">
            {(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={filter} onChange={(e) => setFilter(e.target.value as (typeof STATES)[number])}>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
          </Field>
        </div>
        {loading && <LiveStatus>reading the {filter === 'all' ? '' : `${filter} `}contradictions…</LiveStatus>}
        {rows.length === 0 ? <Empty>No {filter === 'all' ? '' : `${filter} `}contradiction is recorded in this domain.</Empty> : (
          <ScrollBox label="contradictions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Subject</Th><Th>Predicate</Th><Th>A says</Th><Th>B says</Th><Th>Kind</Th><Th>State</Th><Th>Adjudication</Th><Th>Review case</Th><Th>Detected</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = r.contradiction_id === selected;
                  return (
                    <tr key={r.contradiction_id} aria-selected={isSel}>
                      <Td><button type="button" aria-pressed={isSel} onClick={() => select(r)} style={linkButton}>{isSel ? 'selected' : 'select'}</button></Td>
                      <Td>{str(r.subject)}</Td>
                      <Td mono>{str(r.predicate)}</Td>
                      <Td>{r.a_value === null ? '(no value)' : r.a_value} <Mono title={r.a_object_id}>@{String(r.a_version)} {short(r.a_object_id)}</Mono></Td>
                      <Td>{r.b_value === null ? '(no value)' : r.b_value} <Mono title={r.b_object_id}>@{String(r.b_version)} {short(r.b_object_id)}</Mono></Td>
                      <Td mono>{str(r.kind)}</Td>
                      <Td><strong>{str(r.state)}</strong></Td>
                      <Td mono>{r.adjudication === null ? '—' : r.adjudication}</Td>
                      <Td mono>{r.review_case_id === null ? 'none opened' : short(r.review_case_id)}</Td>
                      <Td>{fmtInstant(r.detected_at)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {current !== null && selected !== null && (
        <>
          <section aria-labelledby="ctr-h" style={cardStyle}>
            <h2 id="ctr-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Contradiction <Mono>{selected}</Mono></h2>
            {!listedNow && <p style={muted}>no longer listed under <Mono>{filter}</Mono>; shown as last served</p>}
            <p style={muted}>
              kind <Mono>{current.kind}</Mono> · detected {fmtInstant(current.detected_at)} by <Mono>{short(current.detected_by)}</Mono> · correlation <Mono>{short(current.correlation_id)}</Mono>
            </p>
            <div style={rowStyle}>
              <Assertion side="a" c={current} read={reads.a} problem={reads.aProblem} />
              <Assertion side="b" c={current} read={reads.b} problem={reads.bProblem} />
            </div>
            <h3 style={h3}>Basis</h3>
            <dl style={{ margin: 0 }}>
              {Object.entries(current.basis).length === 0 ? <DefinitionRow term="Basis">none recorded</DefinitionRow>
                : Object.entries(current.basis).map(([k, v]) => (
                  <DefinitionRow key={k} term={k.replace(/_/g, ' ')}>
                    {k === 'a_truth_state' ? <TruthBadge state={String(v)} /> : k === 'a_recorded_at' ? fmtInstant(v) : typeof v === 'string' ? v : <Mono>{JSON.stringify(v)}</Mono>}
                  </DefinitionRow>
                ))}
            </dl>
            <h3 style={h3}>State</h3>
            <dl style={{ margin: 0 }}>
              <DefinitionRow term="State"><strong>{current.state}</strong></DefinitionRow>
              {current.state === 'adjudicated' && (
                <>
                  <DefinitionRow term="Adjudication"><Mono>{str(current.adjudication)}</Mono>{current.adjudication !== null ? <> — {ADJUDICATION_MEANING[current.adjudication]}</> : null}</DefinitionRow>
                  <DefinitionRow term="Reason">{str(current.adjudication_reason)}</DefinitionRow>
                  <DefinitionRow term="Adjudicated">{fmtInstant(current.adjudicated_at)} by <Mono>{str(current.adjudicated_by)}</Mono></DefinitionRow>
                </>
              )}
            </dl>
            <h3 style={h3}>The review case that adjudicates</h3>
            {current.review_case_id === null ? <Empty>The detection opened no review case (the row names none).</Empty>
              : reviewCase !== null ? <CaseDetail k={reviewCase} />
              : reads.a === null && reads.b === null && reads.aProblem === null && reads.bProblem === null ? <Empty>reading the case with its claim…</Empty>
              : <p style={muted}>The row names case <Mono>{current.review_case_id}</Mono>; the claim route served {(reads.b?.cases.length ?? 0) + (reads.a?.cases.length ?? 0)} case(s) on the two claims and none is it{reads.bProblem !== null || reads.aProblem !== null ? ' (a claim read was refused above)' : ''}.</p>}
          </section>

          <section aria-labelledby="adj-h" style={cardStyle}>
            <h2 id="adj-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Adjudicate</h2>
            <p style={muted}>
              Records how the two assertions stand. Neither is deleted by this act; the link is immutable afterwards. The server
              refuses an adjudication of a contradiction that is not open and one from a person without the review authority.
              {!isExtractionManager && <> This session does not hold <Mono>extraction_manager</Mono> in this domain; the server's answer is shown as it states it.</>}
            </p>
            {current.state === 'adjudicated' && <LiveStatus>This contradiction is adjudicated (<Mono>{str(current.adjudication)}</Mono>); the server refuses a second adjudication.</LiveStatus>}
            <div style={rowStyle}>
              <Field id="adj" label="Adjudication">
                {(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={adjudication} onChange={(e) => setAdjudication(e.target.value as Adjudication)}>{ADJUDICATIONS.map((a) => <option key={a} value={a}>{a} — {ADJUDICATION_MEANING[a]}</option>)}</select>}
              </Field>
            </div>
            <Field id="adj-reason" label="Reason (at least 8 characters, required)">
              {(id) => <textarea id={id} style={textareaStyle} rows={2} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />}
            </Field>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Adjudicate" pendingLabel="adjudicating" disabled={adjReason.trim().length < 8}
                onRun={async () => {
                  setAdjProblem(null);
                  const r = await intelligence.adjudicateContradiction(scope, selected, adjudication, adjReason.trim());
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the adjudication was not answered'); setAdjProblem(m); throw new Error(m); }
                  setAdjudicated(r.data.contradiction as unknown as Row); setAdjReceipt(r.data.receipt); setAdjReason('');
                  await load(filter);
                }} />
            </div>
            {adjProblem !== null && <LiveStatus assertive><span style={critical}>not adjudicated — {adjProblem}</span></LiveStatus>}
            {adjudicated !== null && <p>contradiction <Mono>{str(adjudicated['contradictionId'])}</Mono> is now {str(adjudicated['state'])}: <Mono>{str(adjudicated['adjudication'])}</Mono></p>}
            <Receipt receipt={adjReceipt} />
          </section>

          {caseId !== null && (
            <section aria-labelledby="dec-h" style={cardStyle}>
              <h2 id="dec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Decide the review case <Mono>{caseId}</Mono></h2>
              <p style={muted}>
                The review route's decision on the case the detection opened{reviewCase !== null ? <> (on claim <Mono>{str(reviewCase.claim_object_id)}</Mono> @ version {str(reviewCase.claim_version)}, state <strong>{reviewCase.state}</strong>)</> : null}.
                A correction admits a new version of that claim with the corrected value; the prior version stays retrievable, and a corrected value that
                still contradicts a standing assertion enters a new contradiction. The server refuses a decision on a case that is not queued.
              </p>
              {reviewCase !== null && reviewCase.state !== 'queued' && <LiveStatus>This case is {reviewCase.state}; the server refuses a further decision on it.</LiveStatus>}
              <div style={rowStyle}>
                <Field id="dec" label="Decision">
                  {(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={decision} onChange={(e) => setDecision(e.target.value as (typeof DECISIONS)[number])}>{DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
                </Field>
                <Field id="dec-value" label="Corrected value (object_value; only for a correction)">
                  {(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={corrected} onChange={(e) => setCorrected(e.target.value)} disabled={decision !== 'correct'} />}
                </Field>
              </div>
              <Field id="dec-reason" label="Reason (at least 8 characters, required)">
                {(id) => <textarea id={id} style={textareaStyle} rows={2} value={decReason} onChange={(e) => setDecReason(e.target.value)} />}
              </Field>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label={decision === 'correct' ? 'Correct — admits a new version' : decision === 'reject' ? 'Reject' : 'Approve as extracted'} pendingLabel="deciding"
                  variant={decision === 'reject' ? 'critical' : 'primary'}
                  disabled={decReason.trim().length < 8 || (decision === 'correct' && corrected.trim() === '')}
                  onRun={async () => {
                    setDecProblem(null);
                    const r = await intelligence.decideReview(scope, caseId, decision, decReason.trim(),
                      decision === 'correct' ? { object_value: corrected.trim() } : undefined);
                    if (!r.ok || r.data === undefined) { const m = refusal(r, 'the decision was not answered'); setDecProblem(m); throw new Error(m); }
                    setDecided(r.data.review as unknown as Row); setDecReceipt(r.data.receipt); setDecReason(''); setCorrected('');
                    await load(filter); await loadAssertions(current);
                  }} />
              </div>
              {decProblem !== null && <LiveStatus assertive><span style={critical}>not decided — {decProblem}</span></LiveStatus>}
              {decided !== null && (
                <p>
                  case <Mono>{str(decided['caseId'])}</Mono> is now {str(decided['state'])}
                  {decided['newVersion'] !== null && decided['newVersion'] !== undefined ? <> — the claim is now version <Mono>{String(decided['newVersion'])}</Mono>; the prior version is unchanged</> : null}
                  {' · '}{str(decided['contradictions'])} contradiction(s) entered by this decision
                </p>
              )}
              <Receipt receipt={decReceipt} />
            </section>
          )}
        </>
      )}

      <section aria-labelledby="ch-h" style={cardStyle}>
        <h2 id="ch-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Challenge a claim version</h2>
        <p style={muted}>
          Opens a review case on an admitted claim version with a reason; the case queues as <Mono>challenged</Mono> and is decided
          through the review route. A correction there re-derives what rests on the claim. The server refuses a version already queued
          and a claim it cannot find, and its reason is shown here.
          {current !== null && <> Name an assertion of the selected contradiction: <button type="button" style={linkButton} onClick={() => { setChClaim(current.a_object_id); setChVersion(String(current.a_version)); }}>A ({short(current.a_object_id)} @{String(current.a_version)})</button>{' · '}<button type="button" style={linkButton} onClick={() => { setChClaim(current.b_object_id); setChVersion(String(current.b_version)); }}>B ({short(current.b_object_id)} @{String(current.b_version)})</button></>}
        </p>
        <div style={rowStyle}>
          <Field id="ch-claim" label="Claim object id">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={chClaim} onChange={(e) => setChClaim(e.target.value)} />}</Field>
          <Field id="ch-version" label="Claim version">{(id) => <input id={id} type="number" min={1} step={1} style={{ ...inputStyle, inlineSize: '100%' }} value={chVersion} onChange={(e) => setChVersion(e.target.value)} />}</Field>
        </div>
        <Field id="ch-reason" label="Reason (at least 8 characters, required)">
          {(id) => <textarea id={id} style={textareaStyle} rows={2} value={chReason} onChange={(e) => setChReason(e.target.value)} />}
        </Field>
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label="Request a review" pendingLabel="requesting"
            disabled={chClaim.trim() === '' || !Number.isInteger(Number(chVersion)) || Number(chVersion) < 1 || chReason.trim().length < 8}
            onRun={async () => {
              setChProblem(null);
              const r = await intelligence.requestReview(scope, chClaim.trim(), Number(chVersion), chReason.trim());
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the challenge was not answered'); setChProblem(m); throw new Error(m); }
              setChallenged(r.data.review as unknown as Row); setChReceipt(r.data.receipt); setChReason('');
              if (current !== null && (chClaim.trim() === current.a_object_id || chClaim.trim() === current.b_object_id)) await loadAssertions(current);
            }} />
        </div>
        {chProblem !== null && <LiveStatus assertive><span style={critical}>not requested — {chProblem}</span></LiveStatus>}
        {challenged !== null && <p>case <Mono>{str(challenged['caseId'])}</Mono> opened on claim <Mono>{str(challenged['claimObjectId'])}</Mono> @ version {str(challenged['claimVersion'])} — {str(challenged['state'])}, reason <Mono>{str(challenged['reason'])}</Mono>; it is decided from <Link href="/intelligence/review" style={{ color: 'var(--eye-color-accent-strong)' }}>Review</Link></p>}
        <Receipt receipt={chReceipt} />
      </section>
    </>
  );
}
