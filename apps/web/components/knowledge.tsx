'use client';
/**
 * B50 — THE KNOWLEDGE CORE's library components (B107's inventory reads top-level components/*.tsx; LIBRARY_B50 in lib/b50-seams.ts
 * declares each part's exports). One marked block per part (§HD, §LC, §PV, §CI, §CL, §TL), folded by the integrator; each arrives
 * `proposed` and the DSA approves it in the act. The decisions are each part's pure model (lib/<name>-b50.ts); a component only renders.
 */
import { PRE_B50, fieldText, timeValueText } from '../lib/header-b50';
import { type AffectedProduct, type ClosureRecord, type DeclaredAbsence, type FreezeState, type TimeValue } from '../lib/b50-seams';
import Link from 'next/link';
import { Timestamp } from './text';
import { attemptRows, attemptWords, lifecycleFromProfile, replayInstants, type ServerProfile } from '../lib/lifecycle-b50';
import { type ReactNode } from 'react';
import { boundaryCoverage, completenessNote, explainPath, fitnessNote, nodeLine, outcomeSummary, type ExplainView, type FitnessView } from '../lib/provenance-b50';
import { classSummary, classWord, groupByBucket, pathText, summaryLine } from '../lib/impact-b50';
import { Td, Th, tableStyle } from './ui';
import { closureSummary, consumerStateWord, deadlineWords, freezeMarker, type ClosureConsumer } from '../lib/closure-b50';
import { clockWord, disclosureLines, instantText, partialFromDisclosure, reasonText, stagesOf, traceSummary, type DisclosureView, type Stop, type TraceView } from '../lib/timeline-b50';
import { PartialResult } from './recovery';

/* B50 hd */
/* §HD (F-P3-01; ES-05-001, ES-26-001/-004) — the TIME VALUE text role and the DECLARED ABSENCE text role: what a header carries, in the
   record's own words (lib/header-b50.ts). A time is stated with its kind, bounds (the days they name, in the zone they were stated in),
   precision, zone and source — an unknown, recurring or conflicting time says so and is never shown as an instant. An absence is shown
   with its state and reason — never blank, never "unresolved"; a version recorded before B50 says so. Both are plain text roles on the
   type tokens (.eye-text-*): no colour carries the meaning, so forced-colors and 200% zoom keep it; logical properties only. */

export function TimeValueText({ value, label }: { value: TimeValue; label?: string }) {
  const text = timeValueText(value);
  const instant = value.kind === 'exact' || value.kind === 'approximate' ? value.instant ?? null : value.kind === 'bounded' ? value.earliest ?? null : null;
  return (
    <span className="eye-text-timestamp" data-time-kind={value.kind} aria-label={label === undefined ? text : `${label}: ${text}`}>
      {instant !== null && value.kind !== 'bounded' ? <time dateTime={instant}>{text}</time> : text}
    </span>
  );
}

/** A header field that carries no value: its declared absence in words, or "recorded before B50 — not populated" (`absence` null). */
export function DeclaredAbsenceText({ absence, field }: { absence: DeclaredAbsence | null; field?: string }) {
  const text = absence === null ? PRE_B50 : fieldText({ kind: 'absent', absence });
  return (
    <span className="eye-text-fact" data-absence={absence === null ? 'pre_b50' : absence.state} aria-label={field === undefined ? text : `${field}: ${text}`}>
      {text}
    </span>
  );
}
/* end B50 hd */

/* B50 lc */
/* §LC (F-P3-02: PR-06-002/005, ADR-006) — the work-object lifecycle:
 *   LifecycleHistory       every recorded version (its LS state read through the server's profile) and every ATTEMPTED transition — accepted,
 *                          REJECTED (in the server's words; the attempt kept with the last authoritative version) or COMPENSATED — oldest first,
 *                          with the replay link of each version's instant. Nothing is hidden: a refused attempt is a row, not a toast.
 *   TransitionOutcomeNote  the answer to the last act in words (role=status): what was written, or that it was refused and kept, or that a
 *                          repeat answered its first result. Never optimistic: it renders the server's answer only. */

type LcRow = Record<string, unknown>;
const OUTCOME_MARK: Readonly<Record<string, { glyph: string; word: string }>> = {
  accepted: { glyph: '✓', word: 'Accepted' }, rejected: { glyph: '⊘', word: 'Rejected — kept' }, compensated: { glyph: '↺', word: 'Compensated' },
};

export function LifecycleHistory({ type, id, profile, versions, transitions, caption }: {
  type: string; id: string; profile: ServerProfile | null; versions: readonly LcRow[]; transitions: readonly LcRow[];
  /** the table's caption (default: the lifecycle of the object) */ caption?: string;
}) {
  const instants = replayInstants(versions, type, id);
  const attempts = attemptRows(transitions);
  return (
    <section className="eye-lifecycle-history" aria-label="Lifecycle history">
      <table className="eye-table">
        <caption>{caption ?? 'Recorded versions — each opens the state recorded at its instant'}</caption>
        <thead><tr><th scope="col">Version</th><th scope="col">Lifecycle</th><th scope="col">Recorded</th><th scope="col">Replay</th></tr></thead>
        <tbody>
          {instants.map((v) => {
            const r = lifecycleFromProfile(profile, v.state);
            return (
              <tr key={v.version}>
                <td>v{v.version}</td>
                <td><span aria-hidden="true">{r.glyph}</span> {r.label}{r.code === null ? null : ` (${r.code})`}{r.serverState !== null && r.serverState !== r.label.toLowerCase() ? <span className="eye-help"> · server state <bdi className="eye-mono">{r.serverState}</bdi></span> : null}</td>
                <td><Timestamp value={v.at} /></td>
                <td><Link href={v.href}>Open the state at v{v.version}</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="eye-table">
        <caption>Every attempted transition, oldest first — a refused attempt is kept with the version that stayed authoritative</caption>
        <thead><tr><th scope="col">Outcome</th><th scope="col">Transition</th><th scope="col">By</th><th scope="col">Recorded</th></tr></thead>
        <tbody>
          {attempts.length === 0 ? <tr><td colSpan={4}>No transition is recorded for this object (it is moved by its own module&apos;s port).</td></tr> : attempts.map((a) => {
            const m = OUTCOME_MARK[a.outcome] ?? { glyph: '·', word: a.outcome };
            return (
              <tr key={a.id} data-outcome={a.outcome}>
                <td><span aria-hidden="true">{m.glyph}</span> {m.word}{a.kind === 'forward' ? null : <span className="eye-help"> ({a.kind.replace(/_/g, ' ')})</span>}</td>
                <td>{a.words}</td>
                <td><bdi dir="ltr" className="eye-mono-wrap">{a.by.slice(0, 8)}…</bdi></td>
                <td><Timestamp value={a.at} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function TransitionOutcomeNote({ outcome, problem }: { outcome: LcRow | null; /** a refusal in the server's words (the attempt is kept when the port recorded it) */ problem?: string | null }) {
  if (problem !== undefined && problem !== null) {
    return <p role="alert" className="eye-authority-critical"><strong>Not done.</strong> {problem} The attempt is kept in the record below when the server recorded it; read it, then decide again.</p>;
  }
  if (outcome === null) return null;
  const refusal = (outcome['refusal'] ?? null) as LcRow | null;
  const words = attemptWords({
    outcome: String(outcome['outcome']) as 'accepted' | 'rejected' | 'compensated', from: (outcome['from'] as string | null) ?? null, to: (outcome['to'] as string | null) ?? null,
    objectVersion: outcome['object_version'] === null || outcome['object_version'] === undefined ? null : Number(outcome['object_version']),
    lastAuthoritativeVersion: Number(outcome['last_authoritative_version'] ?? 0), attemptedAction: String(outcome['attempted_action'] ?? outcome['action'] ?? 'the act'),
    refusal: refusal === null ? null : { class: String(refusal['class']), message: String(refusal['message']) }, repeated: outcome['repeated'] === true,
  });
  return <p role="status" className="eye-shell-meta">{words}</p>;
}
/* end B50 lc */

/* B50 pv */

const pvTone = (t: 'neutral' | 'attention' | 'critical'): string =>
  t === 'critical' ? 'var(--eye-color-critical)' : t === 'attention' ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-muted)';

/**
 * ExplainPath (§PV; V03-T-194, ES-28-004): the backward PATH of one product version — each node once at its nearest depth, indented by
 * depth (logical inline padding, so it mirrors in RTL), its outcome a WORD; the path's completeness said first; the boundaries crossed with
 * the TOOL boundary carried (B70); the nodes the path does not reach listed apart, never dropped. A list (role list), keyboard reachable as text.
 */
export function ExplainPath({ view, heading = 'The backward path', renderRef }: { view: ExplainView; heading?: string; renderRef?: (ref: string) => ReactNode }) {
  const path = explainPath(view);
  const done = completenessNote(view);
  const bounds = boundaryCoverage(view.boundaries);
  return (
    <section aria-labelledby="pv-path-h" className="eye-pv-path">
      <h2 id="pv-path-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>{heading}</h2>
      <p role="status" style={{ color: done.complete ? 'var(--eye-color-ink-default)' : 'var(--eye-color-critical)' }}><strong>{done.complete ? 'Complete' : 'Incomplete'}:</strong> {done.text}</p>
      <p>What did not succeed: {outcomeSummary(view.nodes)}.</p>
      <ol aria-label="The explanation path, from the product backward" style={{ listStyle: 'none', paddingInlineStart: 0, margin: 0 }}>
        {path.rows.map((r) => {
          const l = nodeLine(r.node);
          return (
            <li key={r.node.nodeId} style={{ paddingInlineStart: `calc(${r.depth} * var(--eye-space-16))`, borderInlineStart: '2px solid var(--eye-color-border-default)', marginBlockEnd: 'var(--eye-space-4)' }}>
              <span style={{ fontWeight: 600, color: pvTone(l.tone) }}>[{l.outcome}]</span>{' '}
              <span>{l.title}</span>{' '}
              <span style={{ color: 'var(--eye-color-ink-muted)' }}>— {l.meta}</span>
              {renderRef === undefined ? null : <> · {renderRef(r.node.ref)}</>}
            </li>
          );
        })}
      </ol>
      {path.unreached.length === 0 ? null : (
        <details>
          <summary>{path.unreached.length} node{path.unreached.length === 1 ? '' : 's'} the path does not reach (shown, never dropped)</summary>
          <ul>{path.unreached.map((n) => { const l = nodeLine(n); return <li key={n.nodeId}><strong>[{l.outcome}]</strong> {l.title} — {l.meta}</li>; })}</ul>
        </details>
      )}
      <h3 style={{ fontSize: 'var(--eye-type-body-lg)' }}>The boundaries crossed</h3>
      <dl>
        {bounds.map((b) => (
          <div key={b.boundary} style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
            <dt style={{ minInlineSize: '8rem' }}>{b.boundary}</dt><dd style={{ margin: 0 }}>{b.statement}</dd>
          </div>
        ))}
      </dl>
      {view.carried.length === 0 ? null : <p>Carried: {view.carried.map((c) => `${c.what} — ${c.carrier}`).join('; ')}.</p>}
    </section>
  );
}

/**
 * FitnessNote (§PV; DP-23-005): the RECORDED mark first (it alone refuses consequential use and export), the evaluation beside it — never
 * merged, never "fit" by inference; the gaps listed as the server words them; the mark history kept.
 */
export function FitnessNote({ fitness }: { fitness: FitnessView }) {
  const n = fitnessNote(fitness);
  return (
    <section aria-labelledby="pv-fit-h">
      <h2 id="pv-fit-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Fitness</h2>
      <p role="status"><strong style={{ color: pvTone(n.tone) }}>{n.headline}</strong></p>
      <p>{n.evaluation}.</p>
      {fitness.evaluation.gaps.length === 0 ? null : (
        <ul aria-label="The gaps the evaluation found">{fitness.evaluation.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      )}
      {fitness.history.length === 0 ? null : (
        <details>
          <summary>The marks recorded ({fitness.history.length}; none is erased)</summary>
          <ol>{fitness.history.map((m) => <li key={m.mark_id}>{m.verdict}{m.reasons.length > 0 ? ` (${m.reasons.join(', ')})` : ''} — {m.marked_at} by {m.marked_by}{m.route === null ? '' : `, routed to ${m.route}`}</li>)}</ol>
        </details>
      )}
    </section>
  );
}
/* end B50 pv */

/* B50 ci */

/**
 * §CI AffectedClassBadge — ONE affected-product class (AI-06-004): a glyph AND a word (never colour alone), the meaning as its accessible
 * description; an unknown class is the server's word, flagged ("not a known class"), never the nearest known one.
 */
export function AffectedClassBadge({ cls }: { cls: string }) {
  const w = classWord(cls);
  return (
    <span className="eye-impact-class" data-class={cls} data-known={w.known ? 'true' : 'false'} title={`${w.meaning} ${w.next}`}>
      <span aria-hidden="true">{w.glyph}</span> {w.label}
      <span className="eye-visually-hidden">: {w.meaning} {w.next}</span>
    </span>
  );
}

/**
 * §CI AffectedProductList — the classed products of a walk or a case (AffectedProduct, b50-seams), grouped by the walk's bucket, each row
 * with its class, its owner, how it was reached and its path from the changed object; the summary line first (the counts per class).
 * It shows what the server recorded and nothing else: no class is computed here and no product is hidden.
 */
export function AffectedProductList({ products, caption, ownerName }: {
  products: ReadonlyArray<AffectedProduct & { title?: string; reachedVia?: string; hop?: number }>;
  /** the table's caption (names the walk or the case) */ caption: string;
  /** a principal id in words, when the page knows the person; otherwise the id is shown */ ownerName?: (id: string) => string;
}) {
  const groups = groupByBucket(products.map((p) => ({ ...p, hop: p.hop ?? 0 })));
  return (
    <section aria-label={caption} className="eye-impact-products">
      <p role="status">{summaryLine(products)}</p>
      {classSummary(products).length === 0 ? null : (
        <ul className="eye-impact-summary" aria-label="Products per class">
          {classSummary(products).map(({ cls, n }) => <li key={cls}><AffectedClassBadge cls={cls} /> <span>{n}</span></li>)}
        </ul>
      )}
      {groups.map((g) => (
        <table key={g.bucket} className="eye-table" style={tableStyle}>
          <caption>{g.label} ({g.rows.length})</caption>
          <thead><tr><Th>Product</Th><Th>Class</Th><Th>Owner</Th><Th>Reached because</Th><Th>Path from the change</Th></tr></thead>
          <tbody>
            {g.rows.map((p) => (
              <tr key={`${p.ref}:${p.invalidationId}`}>
                <Td><span title={p.ref}>{p.title ?? p.ref}</span></Td>
                <Td><AffectedClassBadge cls={p.class} /></Td>
                <Td mono>{p.owner === null ? 'no owner recorded' : (ownerName?.(p.owner) ?? `${p.owner.slice(0, 8)}…`)}</Td>
                <Td>{p.reachedVia ?? 'reached by the walk'}</Td>
                <Td><span title={p.path.join(' → ')}>{pathText(p.path)}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="eye-impact-rule">Classed by the server under {products[0]?.ruleVersion ?? 'its rule'}; a recompute is a re-run request to the owner and a human review the owner&apos;s acknowledgement — nothing here rewrites a decision.</p>
    </section>
  );
}
/* end B50 ci */

/* B50 cl */
/* §CL (F-P3-05's closure; V03-T-297, V03-T-301, DP-24-002, DP-24-005, HX-18) — the FREEZE MARKER, the per-consumer ACKNOWLEDGEMENT LIST and the
   CLOSURE RECORD view (lib/closure-b50.ts decides every word). A frozen product stays visible: the marker names the case and links to it; a
   state is a glyph AND a word (never colour alone, so forced-colors and 200% zoom keep it); logical properties only; the acts are the page's,
   behind its Command Review — these components only render what the server recorded. */

/** §CL FreezeMarker — "FROZEN by correction case …" with the case link, or nothing when not frozen (an unfrozen product carries no marker). */
export function FreezeMarker({ state }: { state: FreezeState }) {
  const m = freezeMarker(state);
  if (!m.frozen) return null;
  return (
    <span className="eye-closure-freeze" data-frozen="true" role="note">
      <span aria-hidden="true">❄</span> {m.href === null ? m.text : <Link href={m.href}>{m.text}</Link>}
    </span>
  );
}

/**
 * §CL AcknowledgementList — every consumer of a correction case (affected products and subscription consumers): its class, owner, state,
 * deadline, the latest act (who, when, the note, the re-run record, the exception's reason, expiry and owner) and its freeze. `acts`
 * renders the page's own controls for a row (each behind its Command Review); nothing here is optimistic.
 */
export function AcknowledgementList({ caseId, consumers, contractVersion, caption, ownerName, acts }: {
  caseId: string; consumers: readonly ClosureConsumer[]; contractVersion: number | null;
  /** the table's caption (names the case) */ caption: string;
  /** a principal id in words, when the page knows the person; otherwise the id is shown */ ownerName?: (id: string) => string;
  acts?: (c: ClosureConsumer) => ReactNode;
}) {
  const who = (id: string | null) => (id === null ? 'no owner recorded' : (ownerName?.(id) ?? `${id.slice(0, 8)}…`));
  const open = consumers.filter((c) => !c.closing).length;
  return (
    <section aria-label={caption} className="eye-closure-consumers">
      <p role="status">{consumers.length} consumer(s); {open} still open{open === 0 ? '' : ' — each is acknowledged, recomputed or under a bounded exception before the case closes'}.</p>
      <table className="eye-table" style={tableStyle}>
        <caption>{caption}</caption>
        <thead><tr><Th>Consumer</Th><Th>Class</Th><Th>Owner</Th><Th>State</Th><Th>Deadline</Th><Th>Latest act</Th>{acts === undefined ? null : <Th>Acts</Th>}</tr></thead>
        <tbody>
          {consumers.map((c) => {
            const w = consumerStateWord(String(c.state));
            const e = c.ack?.exception ?? null;
            return (
              <tr key={c.consumer_ref} data-state={String(c.state)}>
                <Td><span title={c.consumer_ref}>{c.title ?? c.consumer_ref}</span>{c.frozen ? <> <FreezeMarker state={{ frozen: true, caseId }} /></> : null}</Td>
                <Td>{c.consumer_kind === 'subscription' ? `subscription${c.failure_class === null ? '' : ` (${c.failure_class.replace(/_/g, ' ')})`}` : String(c.class ?? '—').replace(/_/g, ' ')}</Td>
                <Td mono>{who(c.owner)}</Td>
                <Td><span className="eye-closure-state" data-known={w.known ? 'true' : 'false'}><span aria-hidden="true">{w.glyph}</span> {w.label}</span><span className="eye-visually-hidden">: {w.next}</span></Td>
                <Td>{deadlineWords(c, contractVersion)}</Td>
                <Td>{c.ack === null ? 'none recorded' : (
                  <>{c.ack.state.replace(/_/g, ' ')} by <span className="eye-mono-wrap">{who(c.ack.by)}</span> at <Timestamp value={c.ack.at} />
                    {c.ack.note === null ? null : <> — {c.ack.note}</>}{c.ack.recompute_ref === null ? null : <> — re-run {c.ack.recompute_ref}</>}
                    {e === null ? null : <> — exception: {e.reason}; expires <Timestamp value={e.expires_at} />; owned by <span className="eye-mono-wrap">{who(e.owner)}</span></>}</>
                )}</Td>
                {acts === undefined ? null : <Td>{acts(c)}</Td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** §CL ClosureRecordView — the propagation-closure record the server wrote: the summary, the failed deliveries, the residual exposure, every acknowledgement and the audit digest. */
export function ClosureRecordView({ record }: { record: ClosureRecord }) {
  return (
    <section aria-label="The closure record" className="eye-closure-record">
      <p role="status">Closed at <Timestamp value={record.closedAt} /> by <span className="eye-mono-wrap">{record.closedBy.slice(0, 8)}…</span>: {closureSummary(record)}</p>
      <dl>
        <dt>Failed deliveries</dt>
        <dd>{record.failedDeliveries.length === 0 ? 'none' : <ul>{record.failedDeliveries.map((f, i) => <li key={`${f.ref}:${i}`}>{f.ref}: {f.failureClass}</li>)}</ul>}</dd>
        <dt>Residual exposure</dt>
        <dd>{record.residualExposure.length === 0 ? 'none — every material consumer was acknowledged or recomputed' : (
          <ul>{record.residualExposure.map((x) => <li key={x.ref}>{x.ref} ({x.class.replace(/_/g, ' ')}){x.exception === null || x.exception === undefined ? null : <>: {x.exception.reason} — expires <Timestamp value={x.exception.expiresAt} /></>}</li>)}</ul>
        )}</dd>
        <dt>Acknowledgements</dt>
        <dd><ol>{record.acknowledgements.map((a) => <li key={a.ackId ?? a.consumer.ref}>{a.consumer.ref}: {a.state.replace(/_/g, ' ')}{a.at === null ? null : <> at <Timestamp value={a.at} /></>}</li>)}</ol></dd>
        <dt>Audit digest</dt>
        <dd><code className="eye-mono-wrap">{record.auditDigest}</code> (sha256 over the record; the projections {record.projectionsReconciled ? 'reconciled' : 'did not reconcile'} at the close)</dd>
      </dl>
    </section>
  );
}
/* end B50 cl */

/* B50 tl */

const tlTone = (t: 'neutral' | 'attention'): string => (t === 'attention' ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-muted)');

/**
 * TimelineScrubber (§TL; PR-22-001, CAP-UM-10): the AS-OF instant on RECORD time, stepped over the record instants the answer itself carries
 * (never an instant the server did not state) — a native range input (arrow keys move one record), its value said in words, two steps
 * and the live read. Choosing an instant reads again; nothing here changes what was recorded.
 */
export function TimelineScrubber({ stops, index, onChange, label = 'As of (record time)' }: { stops: readonly Stop[]; index: number; onChange: (i: number) => void; label?: string }) {
  const at = stops[index] ?? stops[stops.length - 1] ?? { at: 'now', label: 'now — the live read' };
  const last = Math.max(0, stops.length - 1);
  return (
    <div className="eye-tl-scrubber" role="group" aria-labelledby="tl-scrub-l">
      <label id="tl-scrub-l" htmlFor="tl-scrub" style={{ display: 'block', fontWeight: 600 }}>{label}</label>
      <input id="tl-scrub" type="range" min={0} max={last} step={1} value={Math.min(index, last)} aria-valuetext={at.label}
        onChange={(e) => onChange(Number(e.target.value))} style={{ inlineSize: '100%' }} />
      <output htmlFor="tl-scrub" aria-live="polite" style={{ display: 'block' }}>{at.label}</output>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-4)' }}>
        <button type="button" disabled={index <= 0} onClick={() => onChange(Math.max(0, index - 1))}>Step back one record</button>
        <button type="button" disabled={index >= last} onClick={() => onChange(Math.min(last, index + 1))}>Step forward one record</button>
        <button type="button" disabled={index >= last} onClick={() => onChange(last)}>Return to the live read</button>
      </div>
    </div>
  );
}

/**
 * TimelineDisclosureNote (§TL; PR-22-003): what the timeline does NOT show, said first and always — one line per kind (a zero says "none"):
 * missing intervals, policy filtering (counts, never content), clock skew, broken lineage, later corrections, versions with no time on the
 * axis, the bound; the details under each; B81's PartialResult when anything is incomplete. A view never conceals: this note is never omitted.
 */
export function TimelineDisclosureNote({ disclosure, heading = 'What this timeline does not show' }: { disclosure: DisclosureView; heading?: string }) {
  const lines = disclosureLines(disclosure);
  return (
    <section aria-labelledby="tl-disc-h" className="eye-tl-disclosure">
      <h2 id="tl-disc-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>{heading}</h2>
      <PartialResult declaration={partialFromDisclosure(disclosure)} />
      <ul aria-label="The disclosures of this read" style={{ paddingInlineStart: 'var(--eye-space-16)' }}>
        {lines.map((l) => (
          <li key={l.key} data-disclosure={l.key}>
            <span aria-hidden="true" style={{ color: tlTone(l.tone) }}>{l.tone === 'attention' ? '▲ ' : '· '}</span>{l.text}
            {l.detail.length === 0 ? null : <ul>{l.detail.map((d, i) => <li key={`${l.key}-${i}`}>{d}</li>)}</ul>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * TraceView (§TL; PR-22-001/005, AT-22): the source-to-product trace as the server staged it — sources, evidence, claims, products,
 * decisions — each node with its clock (a glyph AND a word), its outcome, its later correction and whether it is visible to you (a node
 * withheld is kept, its content not shown); the completeness first with every reason; the edges that do not resolve, kept; the
 * decision-time snapshots; the production steps beside the objects they made. A list per stage; keyboard reachable as text.
 */
export function TraceView({ trace, renderRef }: { trace: TraceView; renderRef?: (ref: string) => ReactNode }) {
  const sum = traceSummary(trace);
  return (
    <section aria-labelledby="tl-trace-h" className="eye-tl-trace">
      <h2 id="tl-trace-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>From the sources to the product</h2>
      <p role="status" style={{ color: sum.complete ? 'var(--eye-color-ink-default)' : 'var(--eye-color-critical)' }}><strong>{sum.complete ? 'Complete' : 'Incomplete'}:</strong> {sum.text}.</p>
      {stagesOf(trace.nodes).map((g) => (
        <div key={g.stage}>
          <h3 style={{ fontSize: 'var(--eye-type-body-lg)' }}>{g.label} ({g.nodes.length})</h3>
          {g.nodes.length === 0 ? <p>none recorded at this stage</p> : (
            <ol aria-label={`${g.label} of the trace`} style={{ listStyle: 'none', paddingInlineStart: 0, margin: 0 }}>
              {g.nodes.map((n) => {
                const c = clockWord(n.clock);
                return (
                  <li key={n.nodeId} data-stage={n.stage} style={{ borderInlineStart: '2px solid var(--eye-color-border-default)', paddingInlineStart: 'var(--eye-space-8)', marginBlockEnd: 'var(--eye-space-4)' }}>
                    <span style={{ fontWeight: 600 }}>[{n.outcome}]</span>{' '}
                    <span>{n.label}</span>{' '}
                    <span title={c.meaning}><span aria-hidden="true">{c.glyph}</span> {c.word}</span>
                    <span style={{ color: 'var(--eye-color-ink-muted)' }}> — recorded {instantText(n.recordedAt)}</span>
                    {n.correctedLater === null ? null : <span> — corrected on {instantText(String(n.correctedLater['at']))} (version {String(n.correctedLater['version'])})</span>}
                    {n.visible ? null : <span> — not visible to you; kept</span>}
                    {renderRef === undefined ? null : <> · {renderRef(n.ref)}</>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ))}
      <h3 style={{ fontSize: 'var(--eye-type-body-lg)' }}>Edges that do not resolve ({trace.unresolvedEdges.length})</h3>
      {trace.unresolvedEdges.length === 0 ? <p>none — every edge resolves</p> : (
        <ul aria-label="The unresolved edges, kept">{trace.unresolvedEdges.map((e, i) => <li key={i}>{String(e['from'])} cites {String(e['ref'])} ({String(e['basis'])}) — unresolved, kept</li>)}</ul>
      )}
      {trace.decisionSnapshots.length === 0 ? null : (
        <>
          <h3 style={{ fontSize: 'var(--eye-type-body-lg)' }}>Decision-time snapshots ({trace.decisionSnapshots.length})</h3>
          <ul>{trace.decisionSnapshots.map((s) => <li key={String(s['node_id'])}>{String(s['label'])}</li>)}</ul>
        </>
      )}
      {trace.reasons.length === 0 ? null : <ul aria-label="Why the trace is incomplete">{trace.reasons.map((r) => <li key={r.reason}>{reasonText(r)}</li>)}</ul>}
      <details>
        <summary>{trace.steps.length} production and contest step{trace.steps.length === 1 ? '' : 's'} (methods, runs, model calls, reviews, approvals, policy decisions)</summary>
        <ul>{trace.steps.map((s) => <li key={s.nodeId}><strong>[{s.outcome}]</strong> {s.label} — of {s.of.length} object(s)</li>)}</ul>
      </details>
    </section>
  );
}
/* end B50 tl */
