'use client';
/**
 * Search across evidence, claims and entities.
 *
 * Two rules are visible on this screen because they are the criterion, not an
 * implementation detail:
 *
 *   * EVERY HIT SAYS WHY IT MATCHED. A result a reader cannot explain is a
 *     suggestion, and this system does not make suggestions it cannot defend.
 *   * AN EMPTY RESULT MEANS NOTHING MATCHED — that the caller may see. There is
 *     no "3 results hidden" anywhere, because that line would turn search into an
 *     existence oracle for objects the caller has no right to know about. The
 *     scope note says so in words rather than leaving it to be inferred.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { graph, type SearchResult, type SearchHit } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, UnknownNote, cardStyle, fmtInstant }
  from '../../../components/observation';
import { inputStyle, buttonStyle } from '../../../components/ui';

function HitRow({ hit }: { hit: SearchHit }) {
  return (
    <li style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-8)' }}>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap',
                    alignItems: 'baseline' }}>
        {hit.kind === 'entity' ? (
          <Link href={`/graph/entities?open=${hit.id}`} style={{ fontWeight: 650 }}>{hit.label}</Link>
        ) : (
          <strong>{hit.label}</strong>
        )}
        <span style={{ color: 'var(--eye-color-ink-muted)',
                       fontSize: 'var(--eye-type-label-sm)' }}>{hit.detail}</span>
      </div>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        matched because <em>{hit.matched_on}</em>
        {hit.recorded_at === null ? null : <> · {fmtInstant(hit.recorded_at)}</>}
      </div>
      <ScrollBox label="What the server returned for this hit">
        {JSON.stringify(hit.extra, null, 2)}
      </ScrollBox>
    </li>
  );
}

export default function SearchPage() {
  const { scope } = useShell();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setProblem(null);
    const r = await graph.search(scope, query);
    setBusy(false);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the search could not be run');
      return;
    }
    setResult(r.data.search);
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Search</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); void run(); }}
        style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap',
                 marginBlockEnd: 'var(--eye-space-16)' }}
      >
        <label htmlFor="q" style={{ alignSelf: 'center' }}>Query</label>
        <input
          id="q" style={{ ...inputStyle, minInlineSize: '18rem' }} value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="an entity, a claim or an evidence locator"
        />
        <button type="submit" style={buttonStyle} disabled={busy || query.trim().length < 2}>
          {busy ? 'searching…' : 'Search'}
        </button>
      </form>

      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      {result === null ? <Empty>Enter at least two characters.</Empty> : (
        <>
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            {result.total} result(s) for <Mono>{result.query}</Mono>
            {result.normalized === result.query.toLowerCase() ? null
              : <> · normalised to <Mono>{result.normalized}</Mono></>}
          </p>
          <UnknownNote>{result.scope_note}</UnknownNote>

          {result.total === 0 ? (
            <Empty>Nothing you may see matched this query.</Empty>
          ) : (
            <>
              {result.entities.length === 0 ? null : (
                <>
                  <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Entities</h2>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {result.entities.map((h) => <HitRow key={h.id} hit={h} />)}
                  </ul>
                </>
              )}
              {result.claims.length === 0 ? null : (
                <>
                  <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Claims</h2>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {result.claims.map((h) => <HitRow key={h.id} hit={h} />)}
                  </ul>
                </>
              )}
              {result.evidence.length === 0 ? null : (
                <>
                  <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Evidence</h2>
                  <UnknownNote>
                    Search reads <strong>metadata</strong>. Reading the preserved bytes is
                    a different governed action — <Mono>observation.evidence.retrieve</Mono> —
                    with its own decision and its own custody record.
                  </UnknownNote>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {result.evidence.map((h) => <HitRow key={h.id} hit={h} />)}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
