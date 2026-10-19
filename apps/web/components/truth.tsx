'use client';
/**
 * CP-6 B82 §TS — TRUTH, UNCERTAINTY, NUMBERS, THE AI NOTICE AND FRESHNESS of the shared library (F-P7-E-07: CMP-021, CMP-023, HX-02, HX-03,
 * HX-11, HX-15, NUM-01/02/03/09/11, CNT-08/09, TS-06/08/10, UX-ADR-005/-009, REL-06/-07/-09). The decisions are lib/truth-b82.ts's and
 * lib/numbers-b82.ts's (pure, unit-tested); this file only renders them:
 *
 *   TruthStateLabel      the DISPLAY truth (objects.display_truth — RECOMMENDED / CORRECTED / INDETERMINATE derived, never stored) through B80's
 *                        TruthBadge, WRAPPED and never edited (DESIGN D6 — a B107 inventory key), inside B81's Term (the definition on hover
 *                        and focus, per audience); the stored state beside it when it differs, the correction links (to the preserved original
 *                        / the correction), the reasons and the constrained use; an unread display truth shows the stored state and says so.
 *   UncertaintyStatement form, magnitude or class in plain words, drivers, calibration, unsupported precision (alternatives, dissent); partial
 *                        or abstaining said.
 *   ProbabilityValue     0–100 % or 0–1 by the domain contract with its definition, calibration, horizon, cutoff and uncertainty.
 *   ConfidenceClass      a named calibrated class or an interval — never a bare number, never authority; "confidence not calibrated".
 *   RangeValue           lower–upper with units and the method / confidence / scenario basis.
 *   EstimateValue        "~" or "Estimated" with the basis and the revision state.
 *   AiNotice             THE ONE WORDING — "AI recommends, forecasts, simulates, reasons and explains; it does not decide" — naming the agent
 *                        or model, the output's state (PROPOSED / RECOMMENDED / SYNTHETIC — not a decision), where it is explained and contested.
 *   FreshnessWatermark   the cutoff, the source health, the missing intervals and the projection watermark — composing B81's StaleDeclaration
 *                        and PartialResult; stale or partial says which consequential commands are held.
 *
 * Nothing here calls a port except the display-truth READ the hook `useDisplayTruth` makes for a page (audited, objects.display_truth.read);
 * nothing is optimistic; a refusal is shown in the server's words. Tokens only; logical properties (RTL mirrors); forced colours keep the
 * borders and the words (the B82 ts block of app/globals.css). CONSTRUCTION only — each component arrives `proposed`; the DSA approves it in the
 * act; nothing here is accepted.
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import type { Audience } from '../lib/b81-seams';
import { TruthBadge } from './ui';
import { Term } from './help';
import { PartialResult, StaleDeclaration } from './recovery';
import { objectHref } from '../lib/object-b81';
import type { Scope } from '../lib/observation';
import {
  aiNoticeView, displayTruthOf, freshnessView, refKey, sourceHealthOf, truthApi, truthBatches, truthLabelView,
  type AiOutputState, type AiProducer, type FreshnessInput, type SourceHealth, type TruthInput, type TruthRef,
} from '../lib/truth-b82';
import { degraded } from '../lib/degraded-b81';
import {
  confidenceView, estimateView, probabilityView, rangeView, uncertaintyView,
  type ConfidenceInput, type EstimateInput, type ProbabilityInput, type RangeInput, type UncertaintyInput,
} from '../lib/numbers-b82';

/** 'CLM:<id>@2' → the in-app page of exactly that version, or null (then it is shown as text — a link opens exactly what it names). */
function hrefOfRef(ref: string): string | null {
  const m = /^([A-Z]{3}):([0-9a-f-]{36})@(\d+)$/i.exec(ref);
  return m === null ? null : objectHref({ type: m[1]!, id: m[2]!.toLowerCase(), version: Number(m[3]), asOf: null });
}

/**
 * THE DISPLAY TRUTH OF A PAGE'S OBJECTS — one audited read per ≤ 200 refs (objects.display_truth.read). Returns, per ref key, the server's
 * row or `{ stored, unread }` with the server's words when it could not be read (the page then shows the STORED state, said so). Never a
 * guessed display state. `stored` gives each ref's stored state for that fallback.
 */
export function useDisplayTruth(scope: Scope | null, refs: ReadonlyArray<TruthRef & { stored: string }>): ReadonlyMap<string, TruthInput> {
  const [map, setMap] = useState<ReadonlyMap<string, TruthInput>>(new Map());
  const key = refs.map((r) => refKey(r)).join(',');
  useEffect(() => {
    if (scope === null || refs.length === 0) { setMap(new Map()); return; }
    let live = true;
    void (async () => {
      const out = new Map<string, TruthInput>();
      const storedOf = new Map(refs.map((r) => [refKey(r), r.stored]));
      for (const batch of truthBatches(refs)) {
        const r = await truthApi.read(scope, batch);
        if (!r.ok || r.data === undefined) {
          const why = `HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}`;
          for (const x of batch) out.set(refKey(x), { stored: storedOf.get(refKey(x)) ?? 'unknown', unread: why });
          continue;
        }
        batch.forEach((x, i) => {
          const d = displayTruthOf(r.data!.truth[i] ?? {});
          out.set(refKey(x), d ?? { stored: storedOf.get(refKey(x)) ?? 'unknown', unread: 'the server answered a state this page does not know' });
        });
      }
      if (live) setMap(out);
    })();
    return () => { live = false; };
  }, [scope?.tenantId, scope?.domainId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

/**
 * THE SOURCE HEALTH of a domain for a FreshnessWatermark — B81 §DG's governed read (shell.degraded.read; the server evaluates every signal on
 * the database clock). `read: false` with the server's words when it could not be read (the watermark then says source health was not read).
 */
export function useSourceHealth(scope: Scope | null, purpose: string): { sources: SourceHealth[]; read: boolean; problem: string | null } {
  const [out, setOut] = useState<{ sources: SourceHealth[]; read: boolean; problem: string | null }>({ sources: [], read: false, problem: null });
  useEffect(() => {
    if (scope === null) return;
    let live = true;
    void degraded.state(scope, purpose).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) setOut({ sources: sourceHealthOf(r.data.degraded), read: true, problem: null });
      else setOut({ sources: [], read: false, problem: `source health not read — HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}` });
    });
    return () => { live = false; };
  }, [scope?.tenantId, scope?.domainId, purpose]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** CMP-021 — the truth-state label: TruthBadge (wrapped) inside Term, the stored state when it differs, the corrections, the constrained use. */
export function TruthStateLabel({ truth, audience = 'analyst', detail = 'full' }: {
  truth: TruthInput; audience?: Audience;
  /** `compact` (a table cell): the badge, the stored note, the correction links and the constrained use; `full` adds the reasons and the basis */
  detail?: 'full' | 'compact';
}) {
  const v = truthLabelView(truth);
  // the badge carries the glyph and the UPPERCASE word itself (the symbol set) — the term is given as a concept so the glyph is not doubled
  const term = v.term === null ? null : { ...v.term, category: 'concept' as const };
  return (
    <span className="eye-truth-label" data-display={v.badge} data-derived={v.derived ? 'true' : 'false'}>
      {term === null ? <TruthBadge state={v.badge} /> : <Term term={term} audience={audience}><TruthBadge state={v.badge} /></Term>}
      {v.storedNote !== null ? <span className="eye-truth-stored"> ({v.storedNote})</span> : null}
      {v.correction.map((c) => {
        const href = hrefOfRef(c.ref);
        return <span key={c.ref} className="eye-truth-correction"> · {href === null ? <>{c.label} <bdi className="eye-mono">{c.ref}</bdi></> : <Link href={href}>{c.label}</Link>}</span>;
      })}
      {v.constrainedUse !== null ? <span className="eye-truth-constrained"> — {v.constrainedUse}</span> : null}
      {v.unread !== null ? <span className="eye-truth-unread"> — {v.unread}</span> : null}
      {detail === 'full' && v.reasons.length > 0 ? <ul className="eye-truth-reasons" aria-label="Why this display state">{v.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
      {detail === 'full' && v.derived ? <span className="eye-truth-basis">{v.basis}{v.ruleVersion !== null ? ` (rule ${v.ruleVersion})` : ''}</span> : null}
    </span>
  );
}

function Facts({ lines, label }: { lines: ReadonlyArray<{ term: string; value: string }>; label: string }) {
  return (
    <dl className="eye-num-facts" aria-label={label}>
      {lines.map((l) => <div key={l.term}><dt>{l.term}</dt><dd>{l.value}</dd></div>)}
    </dl>
  );
}
function Problems({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) return null;
  return <ul className="eye-num-problems" aria-label="What this value does not state">{problems.map((p) => <li key={p}>{p}</li>)}</ul>;
}

/** HX-03 — the uncertainty statement. */
export function UncertaintyStatement({ uncertainty, label = 'Uncertainty' }: { uncertainty: UncertaintyInput; label?: string }) {
  const v = uncertaintyView(uncertainty);
  const id = useId();
  return (
    <section className="eye-uncertainty" aria-labelledby={id}>
      <p className="eye-uncertainty-headline"><span id={id} className="eye-uncertainty-term">{label}:</span> {v.headline}</p>
      <Facts lines={v.lines} label={`${label} — the declarations`} />
      <Problems problems={v.problems} />
    </section>
  );
}

/** NUM-01 — a probability on its contract's scale, with what it is of, the calibration, the horizon, the cutoff and the uncertainty. */
export function ProbabilityValue({ probability, detail = 'full' }: { probability: ProbabilityInput; detail?: 'full' | 'compact' }) {
  const v = probabilityView(probability);
  return (
    <span className="eye-num-prob">
      <data className="eye-num-value" value={v.exact ?? ''} title={v.exact === null ? undefined : `recorded value ${v.exact}`}>{v.text}</data>
      {detail === 'compact'
        ? <span className="eye-num-inline"> — {v.lines.filter((l) => l.term !== 'Precision').map((l) => `${l.term.toLowerCase()} ${l.value}`).join('; ')}</span>
        : <><Facts lines={v.lines} label="Probability — the declarations" /><Problems problems={v.problems} /></>}
    </span>
  );
}

/** NUM-02 — a named class or an interval; never a bare number, never authority. */
export function ConfidenceClass({ confidence }: { confidence: ConfidenceInput }) {
  const v = confidenceView(confidence);
  return (
    <span className="eye-num-confidence" data-calibrated={v.calibrated ? 'true' : 'false'}>
      <span className="eye-num-value">{v.text}</span>
      {v.definition !== null ? <span className="eye-help"> ({v.definition})</span> : null}
      <span className="eye-visually-hidden"> {v.note}</span>
      <Problems problems={v.problems} />
    </span>
  );
}

/** NUM-03 — lower to upper with the unit and its basis. */
export function RangeValue({ range }: { range: RangeInput }) {
  const v = rangeView(range);
  return (
    <span className="eye-num-range">
      <span className="eye-num-value">{v.text}</span> <span className="eye-help">({v.basis}{v.unsupportedPrecision ? '; shown at the precision its evidence supports' : ''})</span>
      <Problems problems={v.problems} />
    </span>
  );
}

/** NUM-11 — an estimate marked "~" or "Estimated", with its basis and revision state. */
export function EstimateValue({ estimate }: { estimate: EstimateInput }) {
  const v = estimateView(estimate);
  return (
    <span className="eye-num-estimate">
      {estimate.mark === 'tilde'
        ? <span className="eye-num-value"><abbr title="estimated">~</abbr>{v.text.slice(1)}</span>
        : <span className="eye-num-value">{v.text}</span>}
      <span className="eye-help"> (estimate — basis: {v.basis}; {v.revision})</span>
      <Problems problems={v.problems} />
    </span>
  );
}

/** HX-11 / UX-ADR-009 / REL-06 — the AI non-authority notice: one wording, the producer named, explained and contestable. */
export function AiNotice({ output, producer, contestHref, explainHref }: { output: AiOutputState; producer: AiProducer | null; contestHref?: string | null; explainHref?: string | null }) {
  const v = aiNoticeView({ output, producer, contestHref: contestHref ?? null, explainHref: explainHref ?? null });
  return (
    <aside className="eye-ai-notice" role="note" aria-label="AI notice" data-output={output}>
      <p className="eye-ai-notice-statement"><strong>AI notice.</strong> {v.statement}</p>
      <p className="eye-ai-notice-output">{v.output}</p>
      <p className="eye-help">{v.producer}
        {v.explain !== null ? <> · <Link href={v.explain}>Read how it was produced</Link></> : null}
        {v.contest !== null ? <> · <Link href={v.contest}>Contest this output</Link></> : null}
      </p>
      <Problems problems={v.problems} />
    </aside>
  );
}

/** CMP-023 / HX-15 — the freshness watermark: cutoff, source health, missing intervals, projection watermark; stale or partial held. */
export function FreshnessWatermark({ freshness, label = 'Freshness' }: { freshness: FreshnessInput; label?: string }) {
  const v = freshnessView(freshness);
  return (
    <section className="eye-freshness" aria-label={label} data-state={v.state}>
      <p className="eye-freshness-mark" role="status"><span aria-hidden="true">{v.state === 'current' ? '◷ ' : v.state === 'unknown' ? '? ' : '⚠ '}</span>{v.watermark}</p>
      <ul className="eye-freshness-lines">{v.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {v.stale.map((s) => <StaleDeclaration key={s.label} view={s.view} label={s.label} />)}
      <PartialResult declaration={v.partial} />
      {v.constrains !== null ? <p className="eye-freshness-held">Held: {v.constrains}.</p> : null}
    </section>
  );
}
