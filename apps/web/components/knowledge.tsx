/**
 * B50 — THE KNOWLEDGE CORE'S LIBRARY COMPONENTS (lib/b50-seams.ts LIBRARY_B50 declares the exports): one file, a marked block per part
 * (`/* B50 <part> *\/ … /* end B50 <part> *\/`), folded at integration. They arrive `proposed`; the Design System Authority approves them in the
 * act. Each renders what its pure model (lib/<name>-b50.ts) decides — presentation never changes meaning; nothing is shown fit, current or
 * complete by inference; an outcome is always a word, never colour alone. Records shown in tests are SYNTHETIC.
 */
import type { ReactNode } from 'react';

/* B50 pv */
import { boundaryCoverage, completenessNote, explainPath, fitnessNote, nodeLine, outcomeSummary, type ExplainView, type FitnessView } from '../lib/provenance-b50';

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
