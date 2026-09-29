'use client';
/**
 * THE CONTEXT SWITCHER (CP-6 B36, 0094 §0 / §H6; CAP-EO-02) — reusable: the organisation is the shell's domain; the objective (a graph
 * OBJ), the horizon, the scenario, the classification ceiling and the effective instant are set through §0's executive.set_context
 * (a governed write, executive.context.set). The choices come from the server WITH their staleness: a retired / closed objective or a
 * closed scenario is offered disabled and, were it sent, refused (`context rejected (stale)`) — the page shows the refusal as stated.
 * Every section of the home re-reads under the new context and names it by its digest.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../decisions/layout';
import { home as api, choiceLabel, contextLine, CLASSIFICATIONS, HORIZONS, type ContextChoices, type HomeContextRef, type HomeRead } from '../../lib/home';
import { GovernedButton, LiveStatus } from '../../components/observation';
import { inputStyle } from '../../components/ui';

type Row = Record<string, unknown>;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) => `HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const localInstant = (v: string): string | null => (v === '' ? null : new Date(v).toISOString());

export function ContextSwitcher({ context, ceiling, onChanged }: { context: HomeContextRef | null; ceiling: HomeRead['ceiling'] | null; onChanged: (receipt: { policyDecisionId: string; auditSeq: number }) => void }) {
  const { scope } = useShell();
  const [choices, setChoices] = useState<ContextChoices | null>(null);
  const [objective, setObjective] = useState('');
  const [scenario, setScenario] = useState('');
  const [horizon, setHorizon] = useState('90d');
  const [classification, setClassification] = useState('internal');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const r = await api.choices(scope);
      if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the choices could not be read')); return; }
      setChoices(r.data.choices);
      const cur = (r.data.choices.current ?? null) as Row | null;
      if (cur !== null) { setObjective(String(cur['objective_id'] ?? '')); setScenario(String(cur['scenario_id'] ?? '')); setHorizon(String(cur['horizon'] ?? '90d')); setClassification(String(cur['classification'] ?? 'internal')); }
    })();
  }, [scope, context?.digest]);
  const staleChosen = (choices?.objectives.find((o) => o.id === objective)?.stale === true) || (choices?.scenarios.find((s) => s.id === scenario)?.stale === true);
  return (
    <section aria-labelledby="context-switcher" data-testid="context-switcher" style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-16)', marginBlockEnd: 'var(--eye-space-16)', background: 'var(--eye-color-surface-primary)' }}>
      <h2 id="context-switcher" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Context</h2>
      <p style={small} aria-label="the active context"><strong>Active context:</strong> {contextLine(context, ceiling)}</p>
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      {choices === null ? <LiveStatus>reading the choices…</LiveStatus> : (
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', alignItems: 'end' }}>
          <label>Objective<br />
            <select aria-label="objective" style={{ ...inputStyle, inlineSize: '100%' }} value={objective} onChange={(e) => setObjective(e.target.value)}>
              <option value="">the whole domain</option>
              {choices.objectives.map((o) => <option key={o.id} value={o.id} disabled={o.stale}>{choiceLabel(o)}</option>)}
            </select></label>
          <label>Scenario<br />
            <select aria-label="scenario" style={{ ...inputStyle, inlineSize: '100%' }} value={scenario} onChange={(e) => setScenario(e.target.value)}>
              <option value="">none</option>
              {choices.scenarios.map((s) => <option key={s.id} value={s.id} disabled={s.stale}>{choiceLabel(s)}</option>)}
            </select></label>
          <label>Horizon<br />
            <select aria-label="horizon" style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)}>{HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <label>Classification ceiling<br />
            <select aria-label="classification ceiling" style={inputStyle} value={classification} onChange={(e) => setClassification(e.target.value)}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label>Effective at (blank = now)<br />
            <input aria-label="effective at" type="datetime-local" style={inputStyle} value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} /></label>
          <GovernedButton label="Set the context" pendingLabel="setting" disabled={staleChosen} onRun={async () => {
            const r = await api.setContext(scope, { objectiveId: objective === '' ? null : objective, horizon, scenarioId: scenario === '' ? null : scenario, classification, effectiveAt: localInstant(effectiveAt) });
            if (!r.ok || r.data === undefined) { setProblem(`Set the context refused — ${refusal(r, 'no answer')}`); return; }
            setProblem(null); onChanged(r.data.receipt);
          }} />
        </div>
      )}
      {staleChosen ? <p role="alert" style={{ ...small, ...critical }}>A stale objective or scenario cannot be set; the server refuses it (context rejected (stale)).</p> : null}
    </section>
  );
}
