'use client';
/**
 * Overview — the standing picture.
 *
 * Calm by default. The only thing that moves is the collection-status line when
 * a figure actually changes, and it is announced politely rather than flashing.
 *
 * The replay/live ratio is shown as TWO figures side by side, by object and by
 * bytes, because one 9 MB sanctions file would otherwise dominate the by-bytes
 * number and flatter it. Collapsing them into one would be the more comfortable
 * design and the less honest one.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from './layout';
import { observation, type Overview } from '../../lib/observation';
import {
  AuthorityBadge, Empty, HealthBadge, LiveStatus, ModeBadge, Mono, RightsBadge,
  ScrollBox, SyntheticMarker, UnknownNote, badgeRowStyle, cardStyle,
} from '../../components/observation';
import { ErrorNote } from '../../components/ui';

export default function ObservationOverview() {
  const { scope } = useShell();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await observation.overview(scope);
    if (r.ok && r.data !== undefined) { setData(r.data); setError(null); }
    else setError(r.error ?? null);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Overview</h1>
      <ErrorNote error={error} />

      {data === null ? <Empty>Loading the standing picture…</Empty> : (
        <>
          <section aria-labelledby="collection-status">
            <h2 id="collection-status" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Collection status</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                gap: 'var(--eye-space-12)',
              }}
            >
              <Stat label="Sources" value={data.counts.sources} />
              <Stat label="Active" value={data.counts.active} />
              <Stat label="Draft" value={data.counts.draft} />
              <Stat label="Rights unverified" value={data.counts.unconfirmedRights} warn={data.counts.unconfirmedRights > 0} />
              <Stat label="Evidence objects" value={data.counts.evidenceObjects} />
            </div>

            <div style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-12)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)', color: 'var(--eye-color-ink-muted)', textTransform: 'uppercase' }}>
                Replay share
              </h3>
              <p style={{ margin: 0, marginBlockStart: 'var(--eye-space-4)' }}>
                <strong style={{ fontSize: 'var(--eye-type-numeric-md)' }}>
                  {data.replayRatio.byObject === null ? 'unknown' : `${data.replayRatio.byObject}%`}
                </strong>{' '}
                <span style={{ color: 'var(--eye-color-ink-muted)' }}>by object</span>
                {'  ·  '}
                <strong style={{ fontSize: 'var(--eye-type-numeric-md)' }}>
                  {data.replayRatio.byBytes === null ? 'unknown' : `${data.replayRatio.byBytes}%`}
                </strong>{' '}
                <span style={{ color: 'var(--eye-color-ink-muted)' }}>by bytes</span>
              </p>
              <p style={{ margin: 0, marginBlockStart: 'var(--eye-space-4)', color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                {data.replayRatio.measuredFrom}. Both figures are reported: one large payload would otherwise
                dominate the by-bytes number.
              </p>
            </div>
          </section>

          <section aria-labelledby="source-health" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="source-health" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Source health</h2>
            <LiveStatus>
              {data.counts.active} of {data.counts.sources} sources active
            </LiveStatus>
            <ScrollBox label="Source health table">
              <table className="eye-table">
                <caption>
                  Every source with its authority class, acquisition mode and health. `unknown` is a state, not a
                  blank: a source we cannot measure is a fact about our coverage.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Authority</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Rights</th>
                    <th scope="col">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.source_id}>
                      <td data-label="Source">
                        <Link href={`/observation/sources/${s.source_id}`} style={{ color: 'var(--eye-color-accent-default)' }}>
                          {s.name}
                        </Link>
                        <div style={{ ...badgeRowStyle, marginBlockStart: 'var(--eye-space-4)' }}>
                          <Mono>{s.source_key}</Mono>
                          <SyntheticMarker synthetic={s.data_origin === 'synthetic'} />
                        </div>
                      </td>
                      <td data-label="Authority"><AuthorityBadge authorityClass={s.authority_class} /></td>
                      <td data-label="Mode"><ModeBadge mode={s.acquisition_mode} /></td>
                      <td data-label="Lifecycle">{s.lifecycle_state}</td>
                      <td data-label="Rights"><RightsBadge state={s.rights_state} /></td>
                      <td data-label="Health"><HealthBadge state={s.health_state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>
          </section>

          <section aria-labelledby="attention" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="attention" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Needs attention</h2>
            {data.counts.openQuarantineCases === 0 && data.counts.openCorrections === 0 && data.counts.unconfirmedRights === 0 ? (
              <Empty>Nothing is waiting on an operator.</Empty>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)' }}>
                {data.counts.openQuarantineCases > 0 && (
                  <li>
                    <Link href="/observation/quarantine" style={{ color: 'var(--eye-color-accent-default)' }}>
                      {data.counts.openQuarantineCases} item{data.counts.openQuarantineCases === 1 ? '' : 's'} quarantined
                    </Link>
                  </li>
                )}
                {data.counts.openCorrections > 0 && (
                  <li>
                    <Link href="/observation/corrections" style={{ color: 'var(--eye-color-accent-default)' }}>
                      {data.counts.openCorrections} correction{data.counts.openCorrections === 1 ? '' : 's'} awaiting review
                    </Link>
                  </li>
                )}
                {data.counts.unconfirmedRights > 0 && (
                  <li>
                    {data.counts.unconfirmedRights} source contract
                    {data.counts.unconfirmedRights === 1 ? '' : 's'} with unverified reuse rights —{' '}
                    <Link href="/observation/sources" style={{ color: 'var(--eye-color-accent-default)' }}>review the contracts</Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          <UnknownNote>
            This layer records what arrived, from whom, when, and whether it was corrected afterwards. It performs
            no extraction, builds no graph, makes no forecast and recommends nothing — those extend this same
            picture in later phases, and nothing here stands in for them.
          </UnknownNote>
        </>
      )}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--eye-type-numeric-lg)',
          fontWeight: 600,
          color: warn === true ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-strong)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
