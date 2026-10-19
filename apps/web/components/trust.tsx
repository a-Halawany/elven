'use client';
/**
 * B82 §PX — THE TRUST AND EXPLANATION LIBRARY (LIBRARY_B82.trust; F-P7-E-07 chapters 27 and 57, F-P7-E-01's C-047). Eight components, each
 * arriving `proposed` (the DSA approves it in the act); the decisions are lib/trust-b82.ts's (pure, tested); a component only renders them:
 *
 *   TrustIndicator          (CMP-022, UX-57-001) the envelope's FACETS side by side — signature, lineage, custody, policy, evaluation,
 *                           correction, rights, freshness — each a glyph AND a word with what was checked, NEVER A SCORE; the provenance
 *                           strength with its reasons; TRUST INDETERMINATE with the constrained use; the attestations as statements of
 *                           inspection (never approvals); the accessible trust summary a screen reader hears first. It enables no command.
 *   ProvenanceTrail         (CMP-029, V00-T-077, C-047) BOTH directions: the backward path drawn by §GM's ProvenanceGraph (its table
 *                           alternative always rendered) with B50's ExplainPath as the ordered table, and the FORWARD preview (what names
 *                           this version today); the strength and what the trail cannot say (gaps, truncation, carried boundaries).
 *   ExplanationLayers       (V00-T-104, V01-T-035) executive → analyst → auditor over B35's contract keys (no new table, D12): the executive
 *                           layer open, the others one activation away — B80's Disclosure keeps authority and uncertainty in every summary.
 *   AlternativeExplanations (HX-04) competing hypotheses with their review state ("independent review required" when none) and the
 *                           counter-evidence.
 *   DissentList             (HX-05) dissent with its position, rationale, evidence (§EV's CitationLink), status and disposition; the
 *                           decision-ready gate's words while dissent is hidden.
 *   MethodDisclosure        (HX-06) method, model (weights digest, prompt, runtime), policy artifact, assumptions, evaluation — an unresolved
 *                           method CONSTRAINS decision use, said so.
 *   TruthComparison         (UX-27-001/002/005) state, confidence, uncertainty, support, alternatives, dissent and permitted use side by side,
 *                           each row's CONSERVATIVE state (INDETERMINATE with reasons — never a promotion).
 *   SupportComparison       (UX-27-003) the evidence support, the uncertainty drivers, the disagreement and the fitness of what is relied on now
 *                           and of what the act would rely on — B81's ConsequencePreview, so it sits inside the act's CommandReview.
 *
 * Accessibility: every state is a word (forced colours and 200 % zoom keep it); tables have captions and header cells; native controls;
 * logical properties only; no raw colour (tokens via globals.css `B82 px`). Nothing optimistic: every answer is the server's.
 * THREE CLAIMS: construction (these components and their tests); demonstrated operation is the act's; real acceptance — never claimed.
 */
import { useId, type ReactNode } from 'react';
import type { ExplainView } from '../lib/provenance-b50';
import {
  STRENGTH_WORDS, conservativeState, dissentGate, methodDisclosureView, provenanceTrailView, supportComparison, trustIndicatorView, truthComparisonRows,
  type AlternativesView, type DissentRow, type EnvelopeView, type Layer, type MethodInput, type StrengthView, type SupportSide, type TruthRowInput,
} from '../lib/trust-b82';
import type { Scope } from '../lib/evidence-api-b82';
import { ProvenanceGraph } from './canvas';
import { ExplainPath } from './knowledge';
import { Disclosure } from './layers';
import { ConsequencePreview } from './authority';
import { CitationLink } from './evidence';

/* ───────────────────────── TrustIndicator (CMP-022) ───────────────────────── */
export function TrustIndicator({ envelope, nameOf, heading = 'Trust — facets, never a score', level = 2, children }: {
  envelope: EnvelopeView; nameOf?: (principal: string) => string; heading?: string; level?: 2 | 3;
  /** the page's own commands (verify again, attest, investigate) — each a CommandReview the server decides */ children?: ReactNode;
}) {
  const v = trustIndicatorView(envelope, nameOf);
  const id = useId();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className="eye-px-trust" aria-labelledby={`${id}-h`} aria-describedby={`${id}-sum`} data-state={v.state}>
      <H id={`${id}-h`} className="eye-px-heading">{heading}</H>
      <p id={`${id}-sum`} className="eye-visually-hidden">{v.summary}</p>
      <p className="eye-px-headline" role="status"><strong>{v.headline}</strong></p>
      {v.constrainedUse !== null ? <p className="eye-px-constrained">{v.constrainedUse}</p> : null}
      <div className="eye-px-scroll" role="region" aria-label="The trust facets" tabIndex={0}>
        <table className="eye-table eye-px-facets">
          <caption>The facets of {v.subject} — each says what was checked; an unavailable check is never shown as failed; nothing here is a score</caption>
          <thead><tr><th scope="col">Facet</th><th scope="col">Outcome</th><th scope="col">What was checked</th><th scope="col">Basis</th><th scope="col">When</th></tr></thead>
          <tbody>
            {v.facets.map((f) => (
              <tr key={f.facet} data-outcome={f.word}>
                <th scope="row"><span title={f.question}>{f.label}</span></th>
                <td><strong>{f.glyph} {f.word}</strong></td><td>{f.detail}</td><td>{f.basis}</td><td>{f.checked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eye-px-strength"><span className="eye-px-term">Provenance strength:</span> <strong>{v.strength.glyph} {v.strength.word}</strong> — {v.strength.sentence}</p>
      {v.strength.reasons.length > 0 ? <ul className="eye-px-reasons" aria-label="Why this provenance strength">{v.strength.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      <h3 className="eye-px-subheading">Attestations — statements of inspection, never approvals</h3>
      {v.attestations.length === 0 ? <p className="eye-px-note">No attestation is recorded on this version.</p> : (
        <ul className="eye-px-attestations">{v.attestations.map((a, i) => <li key={i}><strong>{a.by}</strong> inspected {a.facets} at {a.at} — {a.state}<br /><span className="eye-px-note">“{a.statement}”</span></li>)}</ul>
      )}
      <p className="eye-px-note">The indicator informs; an accountable person decides. No command reads these facets to become available.</p>
      {children}
    </section>
  );
}

/* ───────────────────────── ProvenanceTrail (CMP-029) ───────────────────────── */
export function ProvenanceTrail({ view, strength, renderRef, onOpen }: {
  view: ExplainView; strength: StrengthView | null; renderRef?: (ref: string) => ReactNode; onOpen?: Parameters<typeof ProvenanceGraph>[0]['onOpen'];
}) {
  const t = provenanceTrailView(view, strength);
  const id = useId();
  const s = strength === null ? STRENGTH_WORDS.unknown : STRENGTH_WORDS[strength.strength];
  return (
    <section className="eye-px-trail" aria-labelledby={`${id}-h`} data-strength={strength?.strength ?? 'unknown'}>
      <h2 id={`${id}-h`} className="eye-px-heading">Provenance trail — {view.product.type} v{view.product.version}</h2>
      <ul className="eye-px-lines">{t.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {strength !== null && strength.reasons.length > 0 ? (
        <ul className="eye-px-reasons" aria-label={`Why the provenance is ${s.word}`}>{strength.reasons.map((r, i) => <li key={i}>{r.detail}</li>)}</ul>
      ) : null}
      {t.limits.length > 0 ? <div className="eye-px-limits"><p className="eye-px-term">What this trail cannot say</p><ul>{t.limits.map((l) => <li key={l}>{l}</li>)}</ul></div> : null}
      <ProvenanceGraph view={view} {...(onOpen === undefined ? {} : { onOpen })} />
      <ExplainPath view={view} heading="The backward path, in order (the table)" {...(renderRef === undefined ? {} : { renderRef })} />
      <section aria-labelledby={`${id}-fwd`} className="eye-px-forward">
        <h3 id={`${id}-fwd`} className="eye-px-subheading">Forward — what names this version today (a preview, never a recorded walk)</h3>
        {t.forward.map((b) => (
          <div key={b.key}>
            <p className="eye-px-term">{b.label}</p>
            {b.refs.length === 0 ? <p className="eye-px-note">none recorded</p> : (
              <ul>{b.refs.map((r, i) => <li key={`${b.key}-${i}`}>{renderRef === undefined || !/^[A-Z]{3}:/.test(r.ref) ? <bdi className="eye-mono-wrap">{r.ref}</bdi> : renderRef(r.ref)} {r.note === '' ? null : <span className="eye-px-note">— {r.note}</span>}</li>)}</ul>
            )}
          </div>
        ))}
      </section>
    </section>
  );
}

/* ───────────────────────── ExplanationLayers (V00-T-104) ───────────────────────── */
const STATE_WORDS: Readonly<Record<string, string>> = { present: '', none: 'NONE RECORDED', inapplicable: 'NOT APPLICABLE', missing: 'MISSING' };
export function ExplanationLayers({ layers, authority, uncertainty, heading = 'The explanation in three layers' }: {
  layers: readonly Layer[];
  /** who stands behind it (a named person, or the agent with its notice on the page) — always in every layer's summary */ authority: string;
  /** the material uncertainty in one line — always in every layer's summary */ uncertainty: string | null;
  heading?: string;
}) {
  const id = useId();
  return (
    <section className="eye-px-layers" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="eye-px-heading">{heading}</h2>
      {layers.map((l) => (
        <Disclosure key={l.audience} title={l.title} authority={authority} uncertainty={uncertainty} defaultOpen={l.audience === 'executive'}>
          <p className="eye-px-note">{l.lead}</p>
          <dl className="eye-px-dl">
            {l.entries.map((e) => (
              <div key={e.key} className="eye-px-dl-row" data-state={e.state}>
                <dt>{e.label}</dt>
                <dd>{STATE_WORDS[e.state] === '' ? null : <strong>{STATE_WORDS[e.state]} </strong>}{e.state === 'present' ? e.text : e.text.replace(/^(MISSING|None recorded|Not applicable) — /, '')}
                  {e.items.length > 0 ? <ul className="eye-px-items">{e.items.map((i) => <li key={i.id}><bdi className="eye-mono">{i.id}</bdi> {i.statement}</li>)}</ul> : null}
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      ))}
    </section>
  );
}

/* ───────────────────────── AlternativeExplanations (HX-04) ───────────────────────── */
export function AlternativeExplanations({ view }: { view: AlternativesView }) {
  const id = useId();
  return (
    <section className="eye-px-alternatives" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="eye-px-subheading">Alternative explanations and counter-evidence</h3>
      {view.note !== null ? <p className="eye-px-constrained">{view.note}</p> : null}
      {view.alternatives.length === 0 ? null : (
        <ul>{view.alternatives.map((a) => <li key={a.id}><bdi className="eye-mono">{a.id}</bdi> {a.statement} <span className="eye-px-note">— {a.review}</span></li>)}</ul>
      )}
      <p className="eye-px-term">Counter-evidence</p>
      {view.counter.length === 0 ? <p className="eye-px-note">none recorded</p> : <ul>{view.counter.map((c) => <li key={c.id}><bdi className="eye-mono">{c.id}</bdi> {c.statement}</li>)}</ul>}
    </section>
  );
}

/* ───────────────────────── DissentList (HX-05) ───────────────────────── */
export function DissentList({ rows, shown, scope, nameOf, caption = 'Recorded dissent' }: {
  rows: readonly DissentRow[]; /** how many the current view shows (a filter may hide some — then decision-ready is withheld, said so) */ shown?: number;
  /** with a scope, each dissent's evidence opens through §EV's CitationLink (resolved when opened) */ scope: Scope | null;
  nameOf?: (principal: string) => string; caption?: string;
}) {
  const gate = dissentGate({ recorded: rows.length, shown: shown ?? rows.length });
  const name = nameOf ?? ((p: string) => p);
  return (
    <section className="eye-px-dissent" aria-label={caption}>
      <h3 className="eye-px-subheading">{caption}</h3>
      {gate !== null ? <p className="eye-px-constrained" role="status">{gate}</p> : null}
      {rows.length === 0 ? <p className="eye-px-note">No dissent is recorded.</p> : (
        <div className="eye-px-scroll" role="region" aria-label={`${caption} — the table`} tabIndex={0}>
          <table className="eye-table">
            <caption>{caption}: position, who, rationale, evidence, status and disposition — dissent is never dropped by a summary</caption>
            <thead><tr><th scope="col">Position</th><th scope="col">Who</th><th scope="col">Rationale</th><th scope="col">Evidence</th><th scope="col">Status</th><th scope="col">Disposition</th></tr></thead>
            <tbody>
              {rows.slice(0, shown ?? rows.length).map((d) => (
                <tr key={d.id}>
                  <th scope="row">{d.position}</th><td>{name(d.by)}<br /><span className="eye-px-note">{d.recordedAt}</span></td><td>{d.rationale}</td>
                  <td>{d.citation === null ? 'none cited' : <CitationLink citation={d.citation} resolution="on_open" scope={scope} />}</td>
                  <td>{d.status}</td><td>{d.disposition ?? 'not yet recorded'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── MethodDisclosure (HX-06) ───────────────────────── */
export function MethodDisclosure({ method, heading = 'Method disclosure' }: { method: MethodInput; heading?: string }) {
  const v = methodDisclosureView(method);
  const id = useId();
  return (
    <section className="eye-px-method" aria-labelledby={`${id}-h`} data-constrained={v.constrained === null ? 'false' : 'true'}>
      <h3 id={`${id}-h`} className="eye-px-subheading">{heading}</h3>
      {v.constrained !== null ? <p className="eye-px-constrained">{v.constrained}</p> : null}
      <dl className="eye-px-dl">{v.lines.map((l) => <div key={l.term} className="eye-px-dl-row"><dt>{l.term}</dt><dd>{l.value}</dd></div>)}</dl>
    </section>
  );
}

/* ───────────────────────── TruthComparison (UX-27-001/005) ───────────────────────── */
export function TruthComparison({ rows, caption = 'Truth, confidence, uncertainty, support, alternatives and dissent — side by side' }: { rows: readonly TruthRowInput[]; caption?: string }) {
  const view = truthComparisonRows(rows);
  const together = conservativeState(rows.map((r) => r.truth), rows[0] ?? { confidence: null, uncertainty: null, support: null, alternatives: 0, dissent: { recorded: 0, shown: 0 }, permittedUse: null });
  return (
    <section className="eye-px-compare" aria-label="Truth comparison">
      {rows.length > 1 ? <p className="eye-px-headline" role="status"><strong>Read together: {together.state.toUpperCase()}</strong>{together.reasons.length > 0 ? ` — ${together.reasons.join('; ')}` : ''}</p> : null}
      <div className="eye-px-scroll" role="region" aria-label="Truth comparison — the table" tabIndex={0}>
        <table className="eye-table">
          <caption>{caption} (the conservative state: a conflict, an uncalibrated confidence, an omitted uncertainty or hidden dissent reads INDETERMINATE)</caption>
          <thead><tr><th scope="col">What</th><th scope="col">State</th><th scope="col">Confidence</th><th scope="col">Uncertainty</th><th scope="col">Support</th><th scope="col">Alternatives</th><th scope="col">Dissent</th><th scope="col">Permitted use</th></tr></thead>
          <tbody>{view.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td><strong>{r.state}</strong></td><td>{r.confidence}</td><td>{r.uncertainty}</td><td>{r.support}</td><td>{r.alternatives}</td><td>{r.dissent}</td><td>{r.permitted}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────────────────────── SupportComparison (UX-27-003) ───────────────────────── */
export function SupportComparison({ current, proposed, act, children }: { current: SupportSide; proposed: SupportSide; act: string; children?: ReactNode }) {
  const v = supportComparison(current, proposed, act);
  return (
    <ConsequencePreview view={v} label={`Support compared before: ${act}`}>
      {v.blockers.length > 0 ? <p className="eye-px-constrained">{v.blockers.join('; ')}</p> : null}
      {children}
    </ConsequencePreview>
  );
}

