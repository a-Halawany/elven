'use client';
/**
 * Graph exploration — neighbourhood, path, and as-of.
 *
 * BOTH INSTANTS ARE ON SCREEN AT ALL TIMES, because a graph view without them is
 * ambiguous in a way that matters:
 *
 *   * KNOWN AT — what we BELIEVED at that instant.
 *   * VALID AT — what HELD in the world at that instant.
 *
 * Moving "known at" backwards removes edges we had not asserted yet: that is the
 * absence of hindsight, and it is the point of the control. Moving "valid at"
 * backwards removes edges whose relationship had not begun. The two are never
 * mixed and the answer always names both.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type EdgeRow, type EntityRow, type AsOf } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ModeBadge, cardStyle, UnknownNote, GovernedButton,
  fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td } from '../../../components/ui';

function local(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

export default function ExplorePage() {
  const { scope } = useShell();
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [depth, setDepth] = useState(2);
  const [knownAt, setKnownAt] = useState(local(new Date().toISOString()));
  const [validAt, setValidAt] = useState(local(new Date().toISOString()));
  const [edges, setEdges] = useState<EdgeRow[] | null>(null);
  const [asOf, setAsOf] = useState<AsOf | null>(null);
  const [neighbours, setNeighbours] = useState<EntityRow[]>([]);
  const [path, setPath] = useState<{ edges: EdgeRow[] | null; note: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await graph.listEntities(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the entities could not be read');
        return;
      }
      setEntities(r.data.entities);
      setFrom(r.data.entities[0]?.entity_id ?? '');
      setTo(r.data.entities[1]?.entity_id ?? '');
    })();
  }, [scope]);

  const at = () => ({
    knownAt: new Date(knownAt).toISOString(), validAt: new Date(validAt).toISOString() });

  const byId = new Map((entities ?? []).map((e) => [e.entity_id, e]));
  const name = (id: string): string => byId.get(id)?.canonical_name ?? `${id.slice(0, 12)}…`;

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (entities === null) return <Empty>reading entities…</Empty>;
  if (entities.length === 0) {
    return <Empty>No entities have been resolved yet, so there is no graph to explore.</Empty>;
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Explore</h1>

      <section aria-labelledby="asof-h" style={cardStyle}>
        <h2 id="asof-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
          The instant this answer is for
        </h2>
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
          <div>
            <label htmlFor="known">Known at — what we believed then</label>
            <input id="known" type="datetime-local" style={inputStyle} value={knownAt}
                   onChange={(e) => setKnownAt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="valid">Valid at — what held in the world then</label>
            <input id="valid" type="datetime-local" style={inputStyle} value={validAt}
                   onChange={(e) => setValidAt(e.target.value)} />
          </div>
        </div>
        <UnknownNote>
          These are different questions. An edge asserted last week about a period two years ago is
          visible when you ask about <em>now</em> and invisible when you ask what we knew
          <em> then</em> — which is exactly what &ldquo;no hindsight&rdquo; means here.
        </UnknownNote>
      </section>

      <section aria-labelledby="all-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="all-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
          The graph at that instant
        </h2>
        <GovernedButton
          label="Show the graph" pendingLabel="reading" variant="quiet"
          onRun={async () => {
            const r = await graph.listEdges(scope, at());
            if (!r.ok || r.data === undefined) {
              throw new Error(r.error?.message ?? 'the edges could not be read');
            }
            setEdges(r.data.edges); setAsOf(r.data.asOf); setNeighbours([]);
          }}
        />
        {asOf === null ? null : (
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            known at {fmtInstant(asOf.knownAt)} · valid at {fmtInstant(asOf.validAt)}
          </p>
        )}
      </section>

      <section aria-labelledby="nb-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="nb-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
          Neighbourhood
        </h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <label htmlFor="nbfrom" style={{ alignSelf: 'center' }}>Around</label>
          <select id="nbfrom" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)}>
            {entities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>{e.canonical_name}</option>
            ))}
          </select>
          <label htmlFor="depth" style={{ alignSelf: 'center' }}>Hops</label>
          <input id="depth" type="number" min={1} max={4} style={{ ...inputStyle, inlineSize: '5rem' }}
                 value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
          <GovernedButton
            label="Walk" pendingLabel="walking" variant="quiet"
            onRun={async () => {
              const r = await graph.neighbourhood(scope, from, depth, at());
              if (!r.ok || r.data === undefined) {
                throw new Error(r.error?.message ?? 'the neighbourhood could not be read');
              }
              setEdges(r.data.neighbourhood.edges);
              setNeighbours(r.data.neighbourhood.entities);
              setAsOf(r.data.asOf);
            }}
          />
        </div>
        {neighbours.length === 0 ? null : (
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            {neighbours.length} entity(ies) reachable: {neighbours.map((e) => e.canonical_name).join(' · ')}
          </p>
        )}
      </section>

      <section aria-labelledby="path-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="path-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
          Path
        </h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <select aria-label="from" style={inputStyle} value={from}
                  onChange={(e) => setFrom(e.target.value)}>
            {entities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>{e.canonical_name}</option>
            ))}
          </select>
          <select aria-label="to" style={inputStyle} value={to}
                  onChange={(e) => setTo(e.target.value)}>
            {entities.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>{e.canonical_name}</option>
            ))}
          </select>
          <GovernedButton
            label="Find a path" pendingLabel="searching" variant="quiet"
            onRun={async () => {
              const r = await graph.path(scope, from, to, at());
              if (!r.ok || r.data === undefined) {
                throw new Error(r.error?.message ?? 'the path could not be read');
              }
              setPath({ edges: r.data.path, note: r.data.note });
              setAsOf(r.data.asOf);
            }}
          />
        </div>
        {path === null ? null : path.edges === null ? (
          <UnknownNote>{path.note}</UnknownNote>
        ) : path.edges.length === 0 ? (
          <Empty>Those are the same entity.</Empty>
        ) : (
          <p>
            {path.edges.map((e, i) => (
              <span key={e.edge_id}>
                {i === 0 ? name(e.direction === 'out' ? e.subject_entity_id : e.object_entity_id) : ''}
                {' → '}<Mono>{e.predicate}</Mono>{' → '}
                {name(e.direction === 'out' ? e.object_entity_id : e.subject_entity_id)}
              </span>
            ))}
          </p>
        )}
      </section>

      {edges === null ? null : edges.length === 0 ? (
        <Empty>No edges were visible at that instant.</Empty>
      ) : (
        <table className="eye-table" style={{ ...tableStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <caption style={{ captionSide: 'top', textAlign: 'start',
                            color: 'var(--eye-color-ink-muted)' }}>
            {edges.length} edge(s) visible at this instant
          </caption>
          <thead>
            <tr>
              <Th>Subject</Th><Th>Predicate</Th><Th>Object</Th><Th>Valid from</Th>
              <Th>Valid to</Th><Th>Asserted</Th><Th>Mode</Th><Th>Confidence</Th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => (
              <tr key={e.edge_id}>
                <Td>{name(e.subject_entity_id)}</Td>
                <Td mono>{e.predicate}</Td>
                <Td>{name(e.object_entity_id)}</Td>
                <Td>{fmtInstant(e.valid_from)}</Td>
                <Td>{e.valid_to === null ? 'open' : fmtInstant(e.valid_to)}</Td>
                <Td>{fmtInstant(e.asserted_at)}</Td>
                <Td><ModeBadge mode={e.mode} /></Td>
                <Td mono>{Number(e.confidence).toFixed(2)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
