'use client';
/**
 * The graph overview.
 *
 * Two numbers on this page are the ones that matter, and they are deliberately
 * shown side by side: how many resolutions the system made ON ITS OWN, and how
 * many are waiting for a person. A memory layer that quietly merged everything
 * would show a large first number and a zero second one — and an operator should
 * be able to see that at a glance rather than discover it later.
 *
 * Since CP-6 B20 (0080) the page also says WHERE EACH COUNT CAME FROM. The counts
 * are read from the six derived projections — the index tier — and a section
 * whose projection is WITHDRAWN is counted from the event log instead and
 * captioned so; the Projections row shows each partition's condition from the
 * flag, and the block's label when the state is not current.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from './layout';
import { graph, projectionNote, type GraphOverview } from '../../lib/graph';
import { Empty, LiveStatus, Mono, cardStyle, UnknownNote, fmtInstant } from '../../components/observation';

/** B20: a section counted from the event log because its projection is withdrawn says so beside its heading. */
function From({ from }: { from?: 'log' | 'projection' }) {
  if (from !== 'log') return null;
  return <span style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)', fontWeight: 400 }}> (from the event log — the projection is withdrawn)</span>;
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div style={{ ...cardStyle, minInlineSize: '10rem' }}>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--eye-type-heading-1)', fontFamily: 'var(--eye-font-mono)' }}>
        {value}
      </div>
      {note === undefined ? null : (
        <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
          {note}
        </div>
      )}
    </div>
  );
}

export default function GraphOverviewPage() {
  const { scope } = useShell();
  const [overview, setOverview] = useState<GraphOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await graph.overview(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the graph overview could not be read');
        return;
      }
      setOverview(r.data.overview);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (overview === null) return <Empty>reading the graph…</Empty>;
  // B20: the six partitions and the block's wording, from the flag.
  const partitions = overview.projection?.partitions ?? [];
  const note = projectionNote(overview.projection);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Graph</h1>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Entities<From from={overview.entities.from} /></h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        <Stat label="Entities" value={overview.entities.total} />
        <Stat label="Active" value={overview.entities.active} />
        <Stat label="From a split" value={overview.entities.split}
              note="created by separating a wrong merge" />
      </div>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Resolutions<From from={overview.resolutions.from} /></h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        <Stat label="Accepted" value={overview.resolutions.accepted} />
        <Stat label="Automatic" value={overview.resolutions.automatic}
              note="authoritative identifier match only" />
        <Stat label="Awaiting a person" value={overview.resolutions.queued} />
        <Stat label="Model-assisted" value={overview.resolutions.modelAssisted}
              note="ranked candidates, never decided" />
        <Stat label="Rejected" value={overview.resolutions.rejected} />
        <Stat label="Superseded" value={overview.resolutions.superseded}
              note="moved by a split; not deleted" />
      </div>
      <UnknownNote>
        An <strong>automatic</strong> resolution can only ever be an exact match on an
        authoritative external identifier. A name match, a fuzzy match and a model ranking are all
        structurally incapable of resolving themselves: they reach the{' '}
        <Link href="/graph/resolutions">resolution queue</Link> and wait for a person who is not the
        agent that proposed them.
      </UnknownNote>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Edges<From from={overview.edges.from} /></h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        <Stat label="Asserted" value={overview.edges.asserted} />
        <Stat label="Retracted" value={overview.edges.retracted}
              note="no longer believed; the past is intact" />
      </div>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Strategy Graph<From from={overview.strategy.from} /></h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        <Stat label="Objectives" value={overview.strategy.objectives} />
        <Stat label="Assumptions" value={overview.strategy.assumptions} />
        <Stat label="Decisions" value={overview.strategy.decisions} />
        <Stat label="Commitments" value={overview.strategy.commitments} />
        <Stat label="Outcomes" value={overview.strategy.outcomes} />
        <Stat label="Unverified" value={overview.strategy.unverified}
              note="nobody has re-checked these" />
      </div>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Invalidations<From from={overview.invalidations.from} /></h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        <Stat label="Assessed" value={overview.invalidations.assessed} />
      </div>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        Every assessment is listed under <Link href="/graph/impact">Impact</Link>, with the
        objectives and commitments it reported and the <Mono>invalidation</Mono> that recorded them.
      </p>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Projections</h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-12)', flexWrap: 'wrap' }}>
        {partitions.map((p) => (
          <Stat key={p.projection} label={p.projection} value={p.condition}
                note={p.condition === 'withdrawn' ? `since ${fmtInstant(p.withdrawn_since)}${p.reason !== null ? ` — ${p.reason}` : ''}`
                      : p.representation_ok ? undefined : `representation ${p.representation_version} (current ${p.representation_current})`} />
        ))}
      </div>
      {note === null ? (
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          The six derived projections these counts are read from — the index tier — are verified against their event logs by the
          retrieval subscriber and are current. Their state and the acts on them are under{' '}
          <Link href="/graph/subscriptions">Subscriptions</Link>.
        </p>
      ) : (
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          <strong>Projection {note.condition}.</strong> {note.text}
          {note.code !== null ? <> · code <Mono>{note.code}</Mono></> : null}
          {' '}— the partitions and the acts on them are under <Link href="/graph/subscriptions">Subscriptions</Link>.
        </p>
      )}
    </>
  );
}
