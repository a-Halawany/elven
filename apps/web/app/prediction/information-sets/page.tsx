'use client';
/**
 * Information sets (CP-6 B25 part `context`, 0108 §CX; V03-T-319, AI-48-002): the domain's FROZEN information sets, newest first — each
 * the cut-off, the graph revision and the twin snapshot it pinned, its coverage gaps and its manifest digest; opening one lists the
 * forecasts that pin it, each linking to its grounding (and its replay). Every value is the server's, as of the instant the answer states.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { context, gapLine, short, type ReplayRow, type SetListRow, type SetView } from '../../../lib/context-b25';
import { Empty, LiveStatus, Mono, cardStyle, ScrollBox, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td, Receipt, buttonStyle } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Row = Record<string, unknown>;
type SetRow = SetListRow;

export default function InformationSetsPage() {
  const { scope } = useShell();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [at, setAt] = useState('');
  const [open, setOpen] = useState<(SetView & { replays: ReplayRow[] }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);

  const load = async () => {
    const r = await context.listSets(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the information sets could not be read'); return; }
    setSets(r.data.sets); setAt(r.data.at); setReceipt(r.data.receipt); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope]);
  const openOne = async (id: string) => {
    const r = await context.getSet(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the information set could not be read'); return; }
    setOpen(r.data.informationSet); setReceipt(r.data.receipt);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (sets === null) return <Empty>reading the information sets…</Empty>;
  return (
    <main style={{ padding: 'var(--eye-space-24)', maxInlineSize: '80rem' }}>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Information sets</h1>
      <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        what a grounded forecast knew at its cut-off, frozen — as of <Mono>{fmtInstant(at)}</Mono>
      </p>
      {sets.length === 0 ? <Empty>no information set has been frozen in this domain</Empty> : (
        <ScrollBox label="Information sets">
          <table style={tableStyle} aria-label="Information sets">
            <thead><tr><Th>Frozen</Th><Th>Series</Th><Th>Known at</Th><Th>Graph revision</Th><Th>Twin</Th><Th>Coverage gaps</Th><Th>Manifest</Th><Th> </Th></tr></thead>
            <tbody>{sets.map((s) => (
              <tr key={s.information_set_id}>
                <Td>{fmtInstant(s.frozen_at)}</Td><Td mono>{s.series_key}</Td><Td>{fmtInstant(s.known_at)}</Td><Td>{s.revision_head}</Td>
                <Td>{s.twin_id === null ? 'none' : <><Mono>{short(s.twin_id)}</Mono> v{s.twin_version}</>}</Td>
                <Td>{s.coverage_gaps.length === 0 ? 'none' : s.coverage_gaps.map((g) => gapLine(g)).join(' · ')}</Td>
                <Td mono>{short(s.manifest_digest, 12)}</Td>
                <Td><button type="button" style={buttonStyle} onClick={() => void openOne(s.information_set_id)}>Open {short(s.information_set_id)}</button></Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
      {open === null ? null : (
        <section aria-labelledby="set-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="set-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Set <Mono>{open.information_set_id}</Mono></h2>
          <p>{open.manifest.features.length} feature(s) · {open.manifest.evidence.length} evidence version(s) · revision {open.revision_head} · frozen under <Mono>{open.frozen_via}</Mono></p>
          {open.forecasts.length === 0 ? <Empty>no forecast pins this set</Empty> : (
            <ul>{open.forecasts.map((x) => (
              <li key={String(x['forecast_id'])}>
                <Link href={`/prediction/forecasts/${String(x['forecast_id'])}/grounding`}>{String(x['horizon_code'])} · {String(x['method'])}@{String(x['method_version'])} · {String(x['state'])}</Link>
              </li>
            ))}</ul>
          )}
        </section>
      )}
      <Receipt receipt={receipt} />
    </main>
  );
}
