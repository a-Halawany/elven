'use client';
/**
 * Attention — the domain's ATTENTION QUEUE and the POLICY it is judged under (CP-6 B22, migration 0083; interface L10-I05
 * AttentionPolicyChanged).
 *
 * The queue is fed by the consumers (forecast.unfit, scenario.incoherent, warning.raised, source.coverage_loss,
 * proposal.review): each signal becomes one item, evaluated under the policy version active when it arrived over TRANSPARENT
 * dimensions (consequence, confidence, hours to the response window — ES-47-002: no opaque score creates urgency). Each row
 * shows the outcome, the engine's REASONS and that version. A below-threshold or abstained item is DEPRIORITIZED and a
 * suppressed one is SUPPRESSED: both are listed here with their reasons, never hidden. Acknowledge is a RECEIPT, never an
 * agreement (OBJ-20). A suppression carries a reason and an expiry within the class's maximum, and it lapses. The overdue are
 * escalated to the class's roles.
 *
 * The policy is a versioned object set by a named human (domain_admin, executive or platform_admin — the server decides; the form
 * is shown to everyone and the server's refusal is shown as it states it). Nothing on this page predicts a result: every row,
 * verdict and answer is the server's.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  attention as api, ITEM_STATES, SIGNAL_CLASSES, FIRST_POLICY_TEMPLATE, POLICY_PUBLISHER_ROLES,
  canAcknowledge, canClose, canSuppress, parseRules, ruleLines, stateMark, whyLine,
  type Acknowledged, type AttentionItem, type Closed, type Escalation, type ItemCounts, type PolicyVersion, type PublishedPolicy, type Suppressed,
} from '../../../lib/attention';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';
/* B23 (0084) attention: the governed reviews (L10-I03) beside the queue */
import { reviewSubjectOf } from '../../../lib/attention';
import { ReviewsPanel, type ConvenePrefill } from './reviews-panel';
/* end B23 attention */

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** A datetime-local value → an ISO instant (null when empty); the server validates the instant. */
const toIso = (local: string): string | null => (local.trim() === '' ? null : new Date(local).toISOString());

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const linkButton = { font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' } as const;
const chip = (active: boolean) => ({
  font: 'inherit', fontSize: 'var(--eye-type-label-sm)', cursor: 'pointer', borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-8)', paddingBlock: 'var(--eye-space-4)',
  border: `1px solid ${active ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-border-default)'}`,
  background: active ? 'var(--eye-color-selection)' : 'var(--eye-color-surface-primary)', color: active ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-default)', fontWeight: active ? 650 : 400,
}) as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text', placeholder?: string) => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
);
const sel = (id: string, value: string, options: readonly string[], onChange: (v: string) => void, blank?: string) => (
  <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>
    {blank !== undefined && <option value="">{blank}</option>}
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

/** A state, three channels: glyph, uppercase word, colour — OVERDUE on a live item past its deadline. */
function StateBadge({ state, overdue }: { state: string; overdue?: boolean }) {
  const s = stateMark(state, overdue === true);
  return <span style={{ color: `var(${s.token})`, border: `1px solid var(${s.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}><span aria-hidden="true">{s.glyph}</span> {s.text}</span>;
}
function OutcomeWord({ outcome }: { outcome: string }) {
  const token = outcome === 'material' ? '--eye-color-critical' : outcome === 'abstained' ? '--eye-color-uncertain' : '--eye-color-ink-muted';
  return <span style={{ color: `var(${token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)' }}>{outcome.replace('_', ' ').toUpperCase()}</span>;
}
function Roles({ roles }: { roles: string[] | null | undefined }) {
  const r = Array.isArray(roles) ? roles : [];
  return r.length === 0 ? <>—</> : <Mono>{r.join(', ')}</Mono>;
}

export default function AttentionPage() {
  const { scope, me } = useShell();
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [counts, setCounts] = useState<ItemCounts | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttentionItem | null>(null);
  const [detailProblem, setDetailProblem] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState('');
  const [supUntil, setSupUntil] = useState('');
  const [supReason, setSupReason] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [actAnswer, setActAnswer] = useState<{ kind: 'acknowledged'; r: Acknowledged } | { kind: 'suppressed'; r: Suppressed } | { kind: 'closed'; r: Closed } | null>(null);
  const [actReceipt, setActReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [escReceipt, setEscReceipt] = useState<ReceiptT>(null);
  const [escProblem, setEscProblem] = useState<string | null>(null);
  const [active, setActive] = useState<PolicyVersion | null>(null);
  const [history, setHistory] = useState<PolicyVersion[] | null>(null);
  const [policyProblem, setPolicyProblem] = useState<string | null>(null);
  const [rulesText, setRulesText] = useState('');
  const [rulesSeeded, setRulesSeeded] = useState(false);
  const [pubReason, setPubReason] = useState('');
  const [published, setPublished] = useState<PublishedPolicy | null>(null);
  const [pubReceipt, setPubReceipt] = useState<ReceiptT>(null);
  const [pubProblem, setPubProblem] = useState<string | null>(null);
  /* B23 (0084) attention */
  const [prefill, setPrefill] = useState<ConvenePrefill | null>(null);
  /* end B23 attention */

  const load = async () => {
    const r = await api.items(scope, { state: stateFilter, signalClass: classFilter });
    if (!r.ok || r.data === undefined) { setItems(null); setCounts(null); setProblem(refusal(r, 'the queue could not be read')); return; }
    setProblem(null); setItems(r.data.items); setCounts(r.data.counts);
  };
  const loadDetail = async (id: string) => {
    const r = await api.item(scope, id);
    if (!r.ok || r.data === undefined) { setDetail(null); setDetailProblem(refusal(r, 'the item could not be read')); return; }
    setDetailProblem(null); setDetail(r.data.item);
  };
  const loadPolicy = async (reseed: boolean) => {
    const r = await api.policy(scope);
    if (!r.ok || r.data === undefined) { setPolicyProblem(refusal(r, 'the attention policy could not be read')); return; }
    setPolicyProblem(null); setActive(r.data.policy.active); setHistory(r.data.policy.history);
    if (reseed || !rulesSeeded) { setRulesText(JSON.stringify(r.data.policy.active?.rules ?? FIRST_POLICY_TEMPLATE, null, 2)); setRulesSeeded(true); }
  };
  const toggle = (id: string) => {
    setActAnswer(null); setActReceipt(null); setActProblem(null); setAckNote(''); setSupUntil(''); setSupReason(''); setCloseNote('');
    if (open === id) { setOpen(null); setDetail(null); setDetailProblem(null); return; }
    setOpen(id); setDetail(null); setDetailProblem(null); void loadDetail(id);
  };
  useEffect(() => { void load(); }, [scope, stateFilter, classFilter]);
  useEffect(() => { void loadPolicy(false); }, [scope]);

  const mayPublish = me.bindings.some((b) => (POLICY_PUBLISHER_ROLES as readonly string[]).includes(b.roleCode) && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const total = counts === null ? null : ITEM_STATES.reduce((n, s) => n + (counts[s] ?? 0), 0);
  /** The suppression rule of the item's OWN policy version (the server bounds the expiry by it, not by the active one). */
  const itemVersion = detail === null ? null : (history ?? []).find((h) => h.version === detail.policy_version) ?? null;
  const itemSuppression = detail === null || itemVersion === null ? null : itemVersion.rules.classes[detail.signal_class]?.suppression ?? null;
  const parsed = parseRules(rulesText);
  /** One act on the open item: the answer kept verbatim, the refusal in the server's words; the queue and the item re-read after. */
  const afterAct = async (id: string) => { await loadDetail(id); await load(); };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Attention</h1>
      <UnknownNote>
        Each item is one signal: an unfit forecast, an incoherent scenario, a raised warning, a loss of source coverage or a proposal
        awaiting review. The server judged it under the <strong>policy version</strong> active when it arrived, over transparent
        dimensions (consequence, confidence, hours to the response window). Its outcome and the engine's <strong>reasons</strong> are
        shown on every row. A <strong>deprioritized</strong> item fell below the thresholds or the engine abstained. A
        <strong> suppressed</strong> item was muted by a person, with a reason, until an instant. Both are listed here and never hidden.
        <strong> Acknowledge</strong> records receipt, not agreement. An item past its deadline is flagged <strong>OVERDUE</strong> by the
        server and escalated to the class's roles.
      </UnknownNote>

      <section aria-labelledby="queue-h" style={cardStyle}>
        <h2 id="queue-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Queue{total === null ? '' : ` (${total} in the domain)`}</h2>
        {counts !== null && (
          <div role="group" aria-label="items by state" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', marginBlockEnd: 'var(--eye-space-8)' }}>
            <button type="button" aria-pressed={stateFilter === ''} style={chip(stateFilter === '')} onClick={() => setStateFilter('')}>all states · {total}</button>
            {ITEM_STATES.map((s) => (
              <button key={s} type="button" aria-pressed={stateFilter === s} style={chip(stateFilter === s)} onClick={() => setStateFilter(stateFilter === s ? '' : s)}>
                <span aria-hidden="true">{stateMark(s).glyph}</span> {s} · {counts[s] ?? 0}
              </button>
            ))}
          </div>
        )}
        <div style={rowStyle}>
          <Field id="f-state" label="State">{(id) => sel(id, stateFilter, ITEM_STATES, setStateFilter, 'any state')}</Field>
          <Field id="f-class" label="Signal class">{(id) => sel(id, classFilter, SIGNAL_CLASSES, setClassFilter, 'any class')}</Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
          <GovernedButton label="Escalate overdue" pendingLabel="escalating" variant="quiet"
            onRun={async () => {
              setEscProblem(null); setEscalation(null);
              const r = await api.escalateDue(scope);
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the escalation was not answered'); setEscProblem(m); throw new Error(m); }
              setEscalation(r.data.escalation); setEscReceipt(r.data.receipt);
              await load(); if (open !== null) await loadDetail(open);
            }} />
          <span style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>
            The overdue are escalated to the class's escalation roles (bounded), and lapsed suppressions reopen. The attention subscriber does
            this at every delivery. The server admits this act from domain_admin, executive or platform_admin.
          </span>
        </div>
        {escProblem !== null && <LiveStatus assertive><span style={critical}>not escalated — {escProblem}</span></LiveStatus>}
        {escalation !== null && <p>escalated <Mono>{escalation.escalated}</Mono> · suppressions lapsed <Mono>{escalation.lapsed}</Mono> · escalation exhausted <Mono>{escalation.exhausted}</Mono> — at {fmtInstant(escalation.at)}</p>}
        <Receipt receipt={escReceipt} />

        {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
        {items === null ? (problem === null ? <Empty>reading the queue…</Empty> : null) : items.length === 0 ? <Empty>No item matches in this domain.</Empty> : (
          <ScrollBox label="attention items">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Item</Th><Th>Class</Th><Th>Title</Th><Th>State</Th><Th>Outcome</Th><Th>Why (policy version)</Th><Th>Owner</Th><Th>Routed roles</Th><Th>Due</Th><Th>Escalations</Th><Th>Suppressed until</Th></tr></thead>
              <tbody>
                {items.map((it) => {
                  const isOpen = it.item_id === open;
                  return (
                    <tr key={it.item_id} aria-selected={isOpen}>
                      <Td><button type="button" aria-expanded={isOpen} onClick={() => toggle(it.item_id)} style={linkButton}>{isOpen ? 'collapse' : 'expand'}</button></Td>
                      <Td mono>{it.signal_class}</Td>
                      <Td>{it.title}</Td>
                      <Td><StateBadge state={it.state} overdue={it.overdue} /></Td>
                      <Td><OutcomeWord outcome={it.outcome} /></Td>
                      <Td>
                        <span style={it.state === 'deprioritized' ? muted : undefined}>{it.state === 'deprioritized' ? <><strong>why deprioritized:</strong> </> : null}{whyLine(it)}</span>
                      </Td>
                      <Td mono>{short(it.owner_principal_id)}{it.owner_principal_id !== null && it.owner_principal_id === me.principalId ? ' (you)' : ''}</Td>
                      <Td><Roles roles={it.route_roles} /></Td>
                      <Td>{it.due_at === null ? '—' : <span style={it.overdue ? critical : undefined}>{fmtInstant(it.due_at)}{it.overdue ? ' — OVERDUE' : ''}</span>}</Td>
                      <Td mono>{it.escalations}</Td>
                      <Td>{it.suppressed_until === null ? '—' : fmtInstant(it.suppressed_until)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {open !== null && (
        <section aria-labelledby="item-h" style={cardStyle}>
          <h2 id="item-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Item <Mono>{open}</Mono>{detail !== null ? <> — {detail.title}</> : null}</h2>
          {detailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {detailProblem}</span></LiveStatus>}
          {detail === null ? (detailProblem === null ? <Empty>reading the item…</Empty> : null) : (
            <>
              <dl style={{ margin: 0 }}>
                <DefinitionRow term="Class / subject"><Mono>{detail.signal_class}</Mono> · {detail.subject_kind} <Mono>{detail.subject_id}</Mono></DefinitionRow>
                <DefinitionRow term="State"><StateBadge state={detail.state} overdue={detail.overdue} /></DefinitionRow>
                <DefinitionRow term="Outcome"><OutcomeWord outcome={detail.outcome} /> under {detail.policy_version === null ? 'no policy version (the engine abstained)' : <>policy version <Mono>{detail.policy_version}</Mono></>}</DefinitionRow>
                <DefinitionRow term="Reasons">
                  {(detail.evaluation?.reasons ?? []).length === 0 ? 'none recorded' : <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{detail.evaluation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                </DefinitionRow>
                <DefinitionRow term="Dimensions (as judged)"><Mono>{JSON.stringify(detail.evaluation?.dimensions ?? {})}</Mono></DefinitionRow>
                <DefinitionRow term="Thresholds (of that version)">{detail.evaluation?.thresholds === null || detail.evaluation?.thresholds === undefined ? 'none — no rule applied' : <Mono>{JSON.stringify(detail.evaluation.thresholds)}</Mono>}</DefinitionRow>
                <DefinitionRow term="Owner"><Mono>{str(detail.owner_principal_id)}</Mono>{detail.owner_principal_id !== null && detail.owner_principal_id === me.principalId ? ' (you)' : ''}</DefinitionRow>
                <DefinitionRow term="Routed roles"><Roles roles={detail.route_roles} /></DefinitionRow>
                <DefinitionRow term="Due">{detail.due_at === null ? 'no deadline (not routed)' : <span style={detail.overdue ? critical : undefined}>{fmtInstant(detail.due_at)}{detail.overdue ? ' — OVERDUE' : ''}</span>}</DefinitionRow>
                <DefinitionRow term="Escalations"><Mono>{detail.escalations}</Mono></DefinitionRow>
                <DefinitionRow term="Suppressed until">{detail.suppressed_until === null ? 'not suppressed' : fmtInstant(detail.suppressed_until)}</DefinitionRow>
                <DefinitionRow term="Acknowledged">{detail.acknowledged_at === null ? 'not acknowledged' : <>{fmtInstant(detail.acknowledged_at)} by <Mono>{str(detail.acknowledged_by)}</Mono> (receipt, not agreement)</>}</DefinitionRow>
                <DefinitionRow term="Closed">{detail.closed_at === null ? 'not closed' : <>{fmtInstant(detail.closed_at)} by <Mono>{str(detail.closed_by)}</Mono></>}</DefinitionRow>
                <DefinitionRow term="Cause"><Mono>{detail.cause_event_type}</Mono> · <Mono>{detail.cause_event_id}</Mono></DefinitionRow>
                <DefinitionRow term="Details"><Mono>{JSON.stringify(detail.details ?? {})}</Mono></DefinitionRow>
                <DefinitionRow term="Created / updated">{fmtInstant(detail.created_at)} · {fmtInstant(detail.updated_at)}</DefinitionRow>
              </dl>

              <h3 style={h3}>History ({(detail.events ?? []).length})</h3>
              {(detail.events ?? []).length === 0 ? <Empty>No event.</Empty> : (
                <ScrollBox label="item events">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Event</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
                    <tbody>{(detail.events ?? []).map((e, i) => (
                      <tr key={i}><Td mono>{e.event}</Td><Td mono>{short(e.actor)}</Td><Td>{fmtInstant(e.occurred_at)}</Td><Td mono>{JSON.stringify(e.details ?? {})}</Td></tr>
                    ))}</tbody>
                  </table>
                </ScrollBox>
              )}

              <p style={muted}>
                The owner or a holder of a routed role acts on an item. The server also admits domain_admin and platform_admin, and refuses
                anyone else in its own words.
              </p>
              {canAcknowledge(detail.state) && (
                <>
                  <h3 style={h3}>Acknowledge</h3>
                  <p style={muted}>Records that you have seen the item. It does not record agreement. The server notes whether it came within the deadline.</p>
                  <Field id="ack-note" label="Note (optional)">{(id) => txt(id, ackNote, setAckNote)}</Field>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Acknowledge receipt — not agreement" pendingLabel="acknowledging"
                      onRun={async () => {
                        setActProblem(null); setActAnswer(null);
                        const r = await api.acknowledge(scope, detail.item_id, ackNote);
                        if (!r.ok || r.data === undefined) { const m = `not acknowledged — ${refusal(r, 'the acknowledgement was not answered')}`; setActProblem(m); throw new Error(m); }
                        setActAnswer({ kind: 'acknowledged', r: r.data.item }); setActReceipt(r.data.receipt); await afterAct(detail.item_id);
                      }} />
                  </div>
                </>
              )}
              {canSuppress(detail.state) && (
                <>
                  <h3 style={h3}>Suppress</h3>
                  <p style={muted}>
                    Mutes the item until an instant, with a reason of at least 8 characters. The item stays listed as suppressed and reopens
                    when the suppression lapses. The expiry is bounded by the class's rule in the item's own policy version
                    {detail.policy_version === null ? ' (none — the server refuses)' : <> (v{detail.policy_version}: {itemSuppression === null ? (itemVersion === null ? 'rule not read' : 'not allowed') : itemSuppression.allowed ? `allowed, at most ${str(itemSuppression.max_hours)} h` : 'not allowed'})</>}.
                  </p>
                  <div style={rowStyle}>
                    <Field id="sup-until" label="Until (required; in the future)">{(id) => txt(id, supUntil, setSupUntil, 'datetime-local')}</Field>
                    <Field id="sup-reason" label="Reason (at least 8 characters)">{(id) => txt(id, supReason, setSupReason)}</Field>
                  </div>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Suppress" pendingLabel="suppressing" variant="quiet" disabled={supUntil.trim() === '' || supReason.trim().length < 8}
                      onRun={async () => {
                        setActProblem(null); setActAnswer(null);
                        const until = toIso(supUntil);
                        if (until === null) return;
                        const r = await api.suppress(scope, detail.item_id, until, supReason.trim());
                        if (!r.ok || r.data === undefined) { const m = `not suppressed — ${refusal(r, 'the suppression was not answered')}`; setActProblem(m); throw new Error(m); }
                        setActAnswer({ kind: 'suppressed', r: r.data.item }); setActReceipt(r.data.receipt); await afterAct(detail.item_id);
                      }} />
                  </div>
                </>
              )}
              {canClose(detail.state) && (
                <>
                  <h3 style={h3}>Close</h3>
                  <p style={muted}>A note of at least 4 characters saying why the item is done. The person closing it decides that; a closed item remains in the history.</p>
                  <Field id="close-note" label="Note (at least 4 characters)">{(id) => txt(id, closeNote, setCloseNote)}</Field>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Close" pendingLabel="closing" variant="critical" disabled={closeNote.trim().length < 4}
                      onRun={async () => {
                        setActProblem(null); setActAnswer(null);
                        const r = await api.close(scope, detail.item_id, closeNote.trim());
                        if (!r.ok || r.data === undefined) { const m = `not closed — ${refusal(r, 'the closure was not answered')}`; setActProblem(m); throw new Error(m); }
                        setActAnswer({ kind: 'closed', r: r.data.item }); setActReceipt(r.data.receipt); await afterAct(detail.item_id);
                      }} />
                  </div>
                </>
              )}
              {/* B23 (0084) attention: a material change on a decision (or an incoherent scenario) → a governed review of its subject, from this item */}
              {reviewSubjectOf(detail) !== null && (
                <>
                  <h3 style={h3}>Convene a review</h3>
                  <p style={muted}>Opens a governed review of this {reviewSubjectOf(detail)} (the form below the item, pre-filled from it). The server decides who may convene.</p>
                  <button type="button" style={linkButton} onClick={() => { setPrefill({ kind: reviewSubjectOf(detail) as string, subjectId: detail.subject_id, causeItemId: detail.item_id, title: detail.title }); document.getElementById('reviews-h')?.scrollIntoView(); }}>
                    Convene a review of this {reviewSubjectOf(detail)}
                  </button>
                </>
              )}
              {/* end B23 attention */}
              {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
              {actAnswer?.kind === 'acknowledged' && <p>item <Mono>{actAnswer.r.item_id}</Mono> acknowledged (from {actAnswer.r.from_state}) at {fmtInstant(actAnswer.r.acknowledged_at)}; within the deadline: <Mono>{String(actAnswer.r.within_deadline)}</Mono>. This is a receipt, not agreement.</p>}
              {actAnswer?.kind === 'suppressed' && <p>item <Mono>{actAnswer.r.item_id}</Mono> suppressed (from {actAnswer.r.from_state}) until {fmtInstant(actAnswer.r.until)}: {actAnswer.r.reason}</p>}
              {actAnswer?.kind === 'closed' && <p>item <Mono>{actAnswer.r.item_id}</Mono> closed (from {actAnswer.r.from_state}) at {fmtInstant(actAnswer.r.closed_at)}</p>}
              <Receipt receipt={actReceipt} />
            </>
          )}
        </section>
      )}

      {/* B23 (0084) attention */}
      <ReviewsPanel scope={scope} me={me} prefill={prefill} />
      {/* end B23 attention */}

      <section aria-labelledby="policy-h" style={cardStyle}>
        <h2 id="policy-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Policy{active === null ? '' : <> — version <Mono>{active.version}</Mono></>}</h2>
        {policyProblem !== null && <LiveStatus assertive><span style={critical}>not read — {policyProblem}</span></LiveStatus>}
        {history === null ? (policyProblem === null ? <Empty>reading the policy…</Empty> : null) : active === null ? (
          <Empty>No attention policy is published for this domain. Until one is, every signal is recorded as deprioritized with the engine's abstention.</Empty>
        ) : (
          <>
            <dl style={{ margin: 0 }}>
              <DefinitionRow term="Set by / effective"><Mono>{active.set_by}</Mono>{active.set_by === me.principalId ? ' (you)' : ''} · {fmtInstant(active.effective_at)}</DefinitionRow>
              <DefinitionRow term="Why"><span style={{ whiteSpace: 'pre-wrap' }}>{active.reason}</span></DefinitionRow>
              <DefinitionRow term="Supersedes">{active.supersedes === null ? 'nothing — the first version' : <>version <Mono>{active.supersedes}</Mono></>}</DefinitionRow>
              <DefinitionRow term="Rules digest"><Mono>{active.rules_digest}</Mono></DefinitionRow>
              <DefinitionRow term="Overload">{active.rules.overload === undefined ? 'no overload rule' : <>at most <Mono>{active.rules.overload.max_open_per_role}</Mono> open per role</>}</DefinitionRow>
            </dl>
            <ScrollBox label="policy classes">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Class</Th><Th>Thresholds</Th><Th>Routed to</Th><Th>Deadline</Th><Th>Escalation</Th><Th>Suppression</Th><Th>Channel</Th></tr></thead>
                <tbody>{SIGNAL_CLASSES.map((c) => {
                  const l = ruleLines(active.rules.classes[c]);
                  return (
                    <tr key={c}><Td mono>{c}</Td><Td>{l.thresholds}</Td><Td mono>{l.routing}</Td><Td>{l.deadline}</Td><Td>{l.escalation}</Td><Td>{l.suppression}</Td><Td mono>{l.channel}</Td></tr>
                  );
                })}</tbody>
              </table>
            </ScrollBox>
          </>
        )}

        {history !== null && history.length > 0 && (
          <>
            <h3 style={h3}>History ({history.length})</h3>
            <ScrollBox label="policy history">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Version</Th><Th>State</Th><Th>Changed sections</Th><Th>Changed classes</Th><Th>Set by</Th><Th>Why</Th><Th>Effective</Th><Th>Superseded</Th></tr></thead>
                <tbody>{history.map((h) => (
                  <tr key={h.policy_id}>
                    <Td mono>{h.version}</Td>
                    <Td mono>{h.state}</Td>
                    <Td mono>{(h.changed_sections ?? []).join(', ') || '—'}</Td>
                    <Td mono>{(h.changed_classes ?? []).join(', ') || '—'}</Td>
                    <Td mono>{short(h.set_by)}{h.set_by === me.principalId ? ' (you)' : ''}</Td>
                    <Td>{h.reason}</Td>
                    <Td>{fmtInstant(h.effective_at)}</Td>
                    <Td>{h.superseded_at === null ? '—' : fmtInstant(h.superseded_at)}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </ScrollBox>
          </>
        )}

        <h3 style={h3}>Publish a new version</h3>
        <p style={muted}>
          A new version supersedes the active one; no version is rewritten. The server admits only <Mono>domain_admin</Mono>, <Mono>executive</Mono>
          {' '}or <Mono>platform_admin</Mono> in this domain{mayPublish ? '' : '. You hold none of these, so the server will refuse'}. It validates
          the rules whole: every key, every role, the thresholds, the deadlines, the suppression bounds and the channel (<Mono>in_app</Mono>).
          It refuses rules that are unchanged. Live items are re-evaluated under the new version by the attention subscriber.
          {active === null ? ' The rules below are a starting template, not a published version.' : ' The rules below are the active version\'s.'}
        </p>
        <Field id="pub-rules" label="Rules (JSON: {classes: {<signal class>: {materiality, route_roles, ack_within_minutes, escalate_to_roles?, max_escalations?, suppression?, notify?}}, overload?})">
          {(id) => <textarea id={id} style={{ ...textareaStyle, minBlockSize: '18rem', fontFamily: 'var(--eye-font-mono)' }} spellCheck={false} value={rulesText} onChange={(e) => setRulesText(e.target.value)} />}
        </Field>
        {!parsed.ok && rulesText.trim() !== '' && <p style={critical}>{parsed.message}</p>}
        <Field id="pub-reason" label="Reason (at least 8 characters — why the policy changes)">{(id) => txt(id, pubReason, setPubReason)}</Field>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <GovernedButton label="Publish the version" pendingLabel="publishing" disabled={!parsed.ok || pubReason.trim().length < 8}
            onRun={async () => {
              setPubProblem(null); setPublished(null);
              if (!parsed.ok) return;
              const r = await api.publish(scope, parsed.rules, pubReason.trim());
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the publication was not answered'); setPubProblem(m); throw new Error(m); }
              setPublished(r.data.policy); setPubReceipt(r.data.receipt); setPubReason('');
              await loadPolicy(true); await load();
            }} />
          <button type="button" style={linkButton} onClick={() => setRulesText(JSON.stringify(active?.rules ?? FIRST_POLICY_TEMPLATE, null, 2))}>reset to {active === null ? 'the template' : 'the active version'}</button>
        </div>
        {pubProblem !== null && <LiveStatus assertive><span style={critical}>not published — {pubProblem}</span></LiveStatus>}
        {published !== null && (
          <p>
            version <Mono>{published.version}</Mono> published{published.supersedes === null ? '' : <>, superseding version <Mono>{published.supersedes}</Mono></>}; changed
            sections <Mono>{published.changed_sections.join(', ') || '—'}</Mono>, classes <Mono>{published.changed_classes.join(', ') || '—'}</Mono>; digest <Mono>{short(published.rules_digest)}</Mono>.
          </p>
        )}
        <Receipt receipt={pubReceipt} />
      </section>
    </>
  );
}
