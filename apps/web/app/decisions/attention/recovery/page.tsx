'use client';
/**
 * Attention recovery — B36 (0094 §A4; UX-44-005): THE DEGRADED STATES of the attention queue and A RECOVERY ROUTE PER STATE.
 *
 * The server enumerates the states from its ledgers — delivery_sink_down, tick_stalled, policy_invalid, evaluation_stale, hold — each with
 * what it means, its route and the last run's outcome. A named person (executive, executive operator or an administrator — the server
 * decides) runs a route; every run is recorded with the state before and after. The hold's route is the executive's release on the
 * attention page. The SYNTHETIC settle-fault fixture is how a settle failure is reproduced; it closes nothing on its own.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { attentionB36 as api, degradedMark, outcomeWords, RECOVERY_ROLES, type DegradedStateRow, type RecoveryRoute } from '../../../../lib/attention-b36';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, UnknownNote, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type Row = Record<string, unknown>;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const detailLine = (d: Row): string => Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('; ') || '—';

export default function AttentionRecoveryPage() {
  const { scope, me } = useShell();
  const [states, setStates] = useState<DegradedStateRow[] | null>(null);
  const [routes, setRoutes] = useState<RecoveryRoute[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [fixture, setFixture] = useState<Row | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const load = async () => {
    const r = await api.degradedStates(scope);
    if (!r.ok || r.data === undefined) { setStates(null); setProblem(refusal(r, 'the degraded states could not be read')); return; }
    setProblem(null); setStates(r.data.states); setRoutes(r.data.routes); setAsOf(r.data.as_of); setFixture(r.data.fixtures.settle_fault);
  };
  useEffect(() => { void load(); }, [scope]);
  const mayRun = me.bindings.some((b) => (RECOVERY_ROLES as readonly string[]).includes(b.roleCode) && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const degraded = (states ?? []).filter((s) => s.active).length;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Attention recovery</h1>
      <UnknownNote>
        The queue can degrade in five ways the server detects from its own ledgers: a synthetic channel&apos;s sink refusing every attempt, the
        timer not ticking, the active policy no longer passing the validator, the queue not evaluated within the staleness ceiling, and a
        hold raised by the evaluation. Each state names <strong>what it means</strong> and <strong>its route</strong>; a run is recorded with
        the state before and after and its outcome — the page shows the server&apos;s record, never a status it inferred. Only
        <Mono> {RECOVERY_ROLES.join(', ')}</Mono> may run a route{mayRun ? '' : '; you hold none of these, so the server will refuse'}.
      </UnknownNote>
      <section aria-labelledby="states-h" style={cardStyle}>
        <h2 id="states-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Degraded states{states === null ? '' : ` — ${degraded} of ${states.length} active`}{asOf !== null && <span style={muted}> (as of {fmtInstant(asOf)})</span>}</h2>
        {problem !== null && <LiveStatus assertive><span style={critical}>not read — {problem}</span></LiveStatus>}
        <label>Note for the run (optional) <input style={{ ...inputStyle, inlineSize: '24rem' }} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {states === null ? (problem === null ? <Empty>reading the states…</Empty> : null) : (
          <ScrollBox label="degraded states">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>State</Th><Th>Status</Th><Th>What it means</Th><Th>Detail</Th><Th>Route</Th><Th>Last outcome</Th></tr></thead>
              <tbody>{states.map((s) => {
                const m = degradedMark(s);
                return (
                  <tr key={s.state} data-testid={`state-${s.state}`}>
                    <Td mono>{s.state}</Td>
                    <Td><span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span></Td>
                    <Td>{s.meaning}</Td>
                    <Td><span style={muted}>{detailLine(s.detail)}</span></Td>
                    <Td>
                      <div><Mono>{s.route}</Mono> — {s.route_does}</div>
                      {s.state === 'hold' ? <span style={muted}>released on the attention page by the executive</span> : (
                        <GovernedButton label={`Run ${s.route}`} pendingLabel="running" variant="quiet"
                          onRun={async () => {
                            setSaid(null);
                            const r = await api.recover(scope, s.state, note);
                            await load();
                            if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the route was refused'); setSaid(msg); throw new Error(msg); }
                            setReceipt(r.data.receipt); setSaid(`${s.route}: ${outcomeWords(r.data.recovery.outcome)}`);
                          }} />
                      )}
                    </Td>
                    <Td>{s.last_route === null ? '—' : <>{outcomeWords(s.last_route.outcome)} — {fmtInstant(s.last_route.run_at)} by <Mono>{s.last_route.run_by.slice(0, 8)}…</Mono></>}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}
        {said !== null && <p role="status">{said}</p>}
        <Receipt receipt={receipt} />
      </section>
      <section aria-labelledby="runs-h" style={cardStyle}>
        <h2 id="runs-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Route runs</h2>
        {routes.length === 0 ? <Empty>No route has been run in this domain.</Empty> : (
          <ScrollBox label="route runs">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Run</Th><Th>State</Th><Th>Route</Th><Th>Before</Th><Th>After</Th><Th>Outcome</Th><Th>By</Th></tr></thead>
              <tbody>{routes.map((r) => (
                <tr key={r.route_id} data-testid="route-run"><Td>{fmtInstant(r.run_at)}</Td><Td mono>{r.degraded_state}</Td><Td mono>{r.route}</Td>
                  <Td><span style={muted}>{detailLine(r.before_state)}</span></Td><Td><span style={muted}>{detailLine(r.after_state)}</span></Td><Td>{outcomeWords(r.outcome)}{r.note !== null && <> — “{r.note}”</>}</Td><Td mono>{r.run_by.slice(0, 8)}…</Td></tr>
              ))}</tbody>
            </table>
          </ScrollBox>
        )}
      </section>
      <section aria-labelledby="fixture-h" style={cardStyle}>
        <h2 id="fixture-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Synthetic fixture: a settle fault</h2>
        <p style={muted}>
          Arms a one-shot fault in this API process: the next act&apos;s settle fails after its governed action committed, so the resume route can be
          exercised. SYNTHETIC — an audited act of an administrator or the executive operator; it closes no clause on its own.
          {fixture !== null && <strong> Armed by <Mono>{String(fixture['by']).slice(0, 8)}…</Mono> at {fmtInstant(fixture['at'])}.</strong>}
        </p>
        <GovernedButton label="Arm the settle fault (synthetic)" pendingLabel="arming" variant="quiet"
          onRun={async () => {
            setSaid(null);
            const r = await api.armSettleFault(scope);
            await load();
            if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the fixture was refused'); setSaid(msg); throw new Error(msg); }
            setReceipt(r.data.receipt); setSaid('armed: the next act\'s settle in this process fails once');
          }} />
      </section>
    </>
  );
}
