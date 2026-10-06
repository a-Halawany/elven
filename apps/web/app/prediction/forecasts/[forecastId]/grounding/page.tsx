'use client';
/**
 * A forecast's GROUNDING (CP-6 B25 part `context`, 0108 §CX; F-P4-03 — V00-T-009, L6-C02, V03-T-319, AI-48-002; V03-T-196).
 *
 * WHAT THE FORECAST KNEW, PINNED: the frozen information set — the graph revision and the cut-off it was read as of, the twin snapshot it
 * used, the evidence versions, the FEATURES (each with its source, its digest and, when scalar, its value), the assumptions with their
 * versions, the policy versions in force, and the coverage gaps NAMED. The ENVIRONMENT the forecast was computed in. THE REPLAY: the
 * forecast owner replays the forecast from its frozen set; the outcome (REPRODUCED | DIVERGED) is the server's derivation, what diverged is
 * named, a differing environment is SAID, and the fresh grounding is reported beside it — never substituted for it. An ungrounded forecast
 * says so. Every instant through fmtInstant; a DATE as the day it names.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { context, divergedLine, environmentFacts, environmentLine, featureGroup, featureValue, freshLine, gapLine, outcomeMark, short,
  type GroundingView, type ReplayAnswer } from '../../../../../lib/context-b25';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, ScrollBox, fmtInstant } from '../../../../../components/observation';
import { tableStyle, Th, Td, Receipt } from '../../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Row = Record<string, unknown>;
const h2 = { fontSize: 'var(--eye-type-heading-2)' } as const;
const GROUPS: Array<{ id: 'evidence' | 'graph' | 'twin' | 'assumption' | 'other'; title: string }> = [
  { id: 'evidence', title: 'Evidence' }, { id: 'graph', title: 'Graph (as of the cut-off)' }, { id: 'twin', title: 'Twin snapshot' },
  { id: 'assumption', title: 'Assumptions' }, { id: 'other', title: 'Other' },
];
const versionOf = (v: unknown): string => (v !== null && typeof v === 'object' && 'version' in (v as Row) ? `v${String((v as Row)['version'])}` : 'none in force');

export default function GroundingPage() {
  const { scope, isForecastOwner } = useShell();
  const params = useParams<{ forecastId: string }>();
  const forecastId = params.forecastId;
  const [view, setView] = useState<GroundingView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [answer, setAnswer] = useState<ReplayAnswer | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = async () => {
    const r = await context.grounding(scope, forecastId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the grounding could not be read'); return; }
    setView(r.data.grounding); setReceipt(r.data.receipt); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope, forecastId]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (view === null) return <Empty>reading the grounding…</Empty>;
  const f = view.forecast; const set = view.set; const m = set?.manifest ?? null;

  return (
    <main style={{ padding: 'var(--eye-space-24)', maxInlineSize: '80rem' }}>
      <p><Link href="/prediction/forecasts">← Forecasts</Link> · <Link href="/prediction/information-sets">Information sets</Link></p>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Grounding — {f.series_key} · {f.horizon_code}</h1>
      <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
        forecast <Mono>{f.forecast_id}</Mono> · <Mono>{f.method}@{f.method_version}</Mono> · {f.state} · validation <strong>{f.validation_state.replace(/_/g, ' ')}</strong> · {f.label === 'live' ? 'live' : 'REPLAY DEMONSTRATION'}
      </p>
      <p>{f.statement}</p>

      <section aria-labelledby="env-h" style={cardStyle}>
        <h2 id="env-h" style={h2}>Environment</h2>
        <p>{environmentFacts(f.environment)}</p>
        {f.environment_digest === null ? null : <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>digest <Mono>{f.environment_digest}</Mono></p>}
      </section>

      {!view.grounded || set === null || m === null ? (
        <UnknownNote><strong>Not grounded.</strong> {view.note}</UnknownNote>
      ) : (
        <>
          <section aria-labelledby="pins-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="pins-h" style={h2}>The frozen information set</h2>
            <dl>
              <DefinitionRow term="Graph revision">revision <strong>{m.graph.revision_head}</strong> at the freeze; read as of <Mono>{fmtInstant(m.graph.known_at)}</Mono> (both time axes) · {m.graph.edge_count} edge(s) · {m.graph.event_count} event(s){m.graph.withdrawn_partitions.length > 0 ? <> · withdrawn partitions not read: {m.graph.withdrawn_partitions.join(', ')}</> : null}</DefinitionRow>
              <DefinitionRow term="Subject">{m.graph.subject === null ? 'none' : <><Mono>{String(m.graph.subject['entity_id'])}</Mono> · {String(m.graph.subject['entity_type'])} · {String(m.graph.subject['lifecycle'])}</>}</DefinitionRow>
              <DefinitionRow term="Twin snapshot">{m.twin === null ? 'none — see the coverage gaps' : <><Mono>{short(m.twin.twin_id)}</Mono> v{m.twin.version} ({m.twin.branch_id ?? '—'}; served as {m.twin.mode ?? '—'}) · state set <Mono>{short(m.twin.state_set_digest, 12)}</Mono> · {m.twin.element_count} element(s){m.twin.synthetic ? ' · SYNTHETIC' : ''}</>}</DefinitionRow>
              <DefinitionRow term="Cut-offs">known at <Mono>{fmtInstant(m.request.known_at)}</Mono> · observed through {m.request.observed_through ?? '—'}</DefinitionRow>
              <DefinitionRow term="Evidence">{m.evidence.length} evidence version(s), digest-bound</DefinitionRow>
              <DefinitionRow term="Policy">ontology {versionOf(m.policy['ontology'])} · attention policy {versionOf(m.policy['attention_policy'])} · decision-use policy {versionOf(m.policy['decision_use_policy'])} · horizon policy {versionOf(m.policy['horizon_policy'])} · PDP <Mono>{String(m.policy['pdp_bundle'] ?? '—')}</Mono></DefinitionRow>
              <DefinitionRow term="Manifest">digest <Mono>{set.manifest_digest}</Mono> · {set.assembler_version} · frozen {fmtInstant(set.frozen_at)} under <Mono>{set.frozen_via}</Mono></DefinitionRow>
              <DefinitionRow term="Coverage gaps">
                {m.coverage_gaps.length === 0 ? 'no coverage gap' : <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>{m.coverage_gaps.map((g) => <li key={g.key}>{gapLine(g)}</li>)}</ul>}
              </DefinitionRow>
            </dl>
          </section>

          <section aria-labelledby="feat-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="feat-h" style={h2}>Features — the model inputs</h2>
            {GROUPS.map((g) => {
              const rows = m.features.filter((x) => featureGroup(x.key) === g.id);
              if (rows.length === 0) return null;
              return (
                <ScrollBox key={g.id} label={g.title}>
                  <table style={tableStyle} aria-label={g.title}>
                    <caption style={{ textAlign: 'start', fontWeight: 650 }}>{g.title}</caption>
                    <thead><tr><Th>Feature</Th><Th>Value</Th><Th>Source</Th><Th>Digest</Th></tr></thead>
                    <tbody>{rows.map((x) => (
                      <tr key={x.key}><Td mono>{x.key}</Td><Td>{featureValue(x)}</Td><Td mono>{x.source}</Td><Td mono>{short(x.digest, 12)}</Td></tr>
                    ))}</tbody>
                  </table>
                </ScrollBox>
              );
            })}
          </section>

          <section aria-labelledby="rpl-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="rpl-h" style={h2}>Replay</h2>
            {isForecastOwner ? (
              <GovernedButton label="Replay from the frozen set" pendingLabel="replaying" onRun={async () => {
                setRefusal(null);
                const r = await context.replay(scope, f.forecast_id);
                if (!r.ok || r.data === undefined) { const msg = `HTTP ${r.status} — ${r.error?.message ?? 'the replay was not answered'}`; setAnswer(null); setRefusal(msg); throw new Error(msg); }
                setAnswer(r.data.replay); setReceipt(r.data.receipt); await load();
              }} />
            ) : <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>a replay is recorded by the forecast owner (or the domain&apos;s administrator)</p>}
            {refusal === null ? null : <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not replayed — {refusal}</span></LiveStatus>}
            {answer === null ? null : (
              <LiveStatus>
                <span style={{ color: `var(${outcomeMark(answer.outcome).token})`, fontWeight: 650 }}><span aria-hidden="true">{outcomeMark(answer.outcome).glyph}</span> {outcomeMark(answer.outcome).text}</span>
                {' · '}{divergedLine(answer.diverged)} · {environmentLine(answer.environment.match, answer.environment.differences)} · {freshLine(answer.fresh, m.graph.revision_head)}
              </LiveStatus>
            )}
            {view.replays.length === 0 ? <Empty>no replay recorded</Empty> : (
              <ScrollBox label="Replays">
                <table style={tableStyle} aria-label="Replays">
                  <thead><tr><Th>Replayed</Th><Th>Outcome</Th><Th>Diverged</Th><Th>Environment</Th><Th>Fresh grounding</Th></tr></thead>
                  <tbody>{view.replays.map((r) => (
                    <tr key={r.replay_id}>
                      <Td>{fmtInstant(r.replayed_at)}</Td>
                      <Td><span style={{ color: `var(${outcomeMark(r.outcome).token})` }}><span aria-hidden="true">{outcomeMark(r.outcome).glyph}</span> {r.outcome}</span></Td>
                      <Td>{divergedLine(r.diverged)}</Td>
                      <Td>{r.environment_match ? 'same' : `different (${((r.detail['environment_differences'] as string[] | undefined) ?? []).join(', ') || 'environment'})`}</Td>
                      <Td>{freshLine(r.fresh, m.graph.revision_head)}</Td>
                    </tr>
                  ))}</tbody>
                </table>
              </ScrollBox>
            )}
          </section>
        </>
      )}
      <Receipt receipt={receipt} />
    </main>
  );
}
