'use client';
/**
 * CP-6 B50 — THE KNOWLEDGE-CORE COMPONENTS of the shared library (one file; B107's inventory reads `^apps/web/components/[^/]+\.tsx$`). Each part
 * of B50 writes ONLY its own marked block (`/* B50 <part> *\/ … /* end B50 <part> *\/`) and exports the names lib/b50-seams.ts LIBRARY_B50
 * declares for it; the blocks are folded at integration. They render what the parts' pure models decide; they call no port; every
 * consequential act stays behind its page's Command Review. They arrive `proposed` (the DSA approves them in the act). Tokens only; logical
 * properties (RTL mirrors); state is never colour alone (a glyph and a word). CONSTRUCTION — the walk demonstrates; nothing here is accepted.
 */
import Link from 'next/link';
import { Timestamp } from './text';
import { attemptRows, attemptWords, lifecycleFromProfile, replayInstants, type ServerProfile } from '../lib/lifecycle-b50';
import { boundaryCoverage, completenessNote, explainPath, fitnessNote, nodeLine, outcomeSummary, type ExplainView, type FitnessView } from '../lib/provenance-b50';

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
