'use client';
/**
 * THE CONTEXT SWITCHER (CP-6 B36, 0094 §0 / §H6; CAP-EO-02) — since B80 §CB a CONSUMER of the operating context bar's switch
 * (components/context-bar.tsx ContextSwitchDialog, inline): the organisation is the shell's domain; the objective (a graph OBJ), the
 * horizon, the scenario, the classification ceiling and the effective instant are chosen, the IMPACT is previewed (0118's
 * executive.context_impact — the changed dimensions, the affected open work, the approvals unaffected) and only then committed
 * (executive.commit_context under executive.context.set — never a silent switch). The choices come from the server WITH their staleness:
 * a retired / closed objective or a closed scenario is offered disabled and, were it sent, refused (`context rejected (stale)`) — the page
 * shows the refusal as stated. Every section of the home re-reads under the new context and names it by its digest.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../decisions/layout';
import { contextLine, type HomeContextRef, type HomeRead } from '../../lib/home';
import { refusalWords, type BarRead } from '../../lib/context-b80';
import { contextApi } from '../../lib/context-api-b80';
import { ContextSwitchDialog } from '../../components/context-bar';
import { LiveStatus } from '../../components/observation';

export function ContextSwitcher({ context, ceiling, onChanged }: { context: HomeContextRef | null; ceiling: HomeRead['ceiling'] | null; onChanged: (receipt: { policyDecisionId: string; auditSeq: number }) => void }) {
  const { scope } = useShell();
  const [bar, setBar] = useState<BarRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const read = useCallback(async () => {
    const r = await contextApi.read(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusalWords(r, 'the operating context could not be read')); return; }
    setProblem(null); setBar(r.data.bar);
  }, [scope]);
  useEffect(() => { void read(); }, [read, context?.digest]);
  return (
    <section aria-labelledby="context-switcher" data-testid="context-switcher" className="eye-context-home">
      <h2 id="context-switcher" className="eye-context-switch-title">Context</h2>
      <p className="eye-context-note" aria-label="the active context"><strong>Active context:</strong> {contextLine(context, ceiling)}</p>
      {problem !== null && <p role="alert" className="eye-context-refusal">{problem}</p>}
      {bar === null ? <LiveStatus>reading the choices…</LiveStatus> : (
        <ContextSwitchDialog inline scope={scope} bar={bar} open onClose={() => undefined}
          onCommitted={(c) => { void read(); onChanged(c.receipt); }} />
      )}
    </section>
  );
}
