'use client';
/**
 * Source registry.
 *
 * Provenance rides at LIST DENSITY: authority class, acquisition mode, data
 * origin and rights state are present on every row, so nobody discovers by
 * clicking that they were reading an observational source or a synthetic record.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { observation, type SourceWithReadiness } from '../../../lib/observation';
import {
  AuthorityBadge, Empty, ModeBadge, Mono, RightsBadge, ScrollBox, SyntheticMarker,
  badgeRowStyle,
} from '../../../components/observation';
import { ErrorNote } from '../../../components/ui';

const VERDICT: Record<SourceWithReadiness['readiness']['verdict'], { label: string; color: string }> = {
  'live': { label: 'LIVE', color: 'var(--eye-color-success)' },
  'live-unscheduled': { label: 'LIVE — UNSCHEDULED', color: 'var(--eye-color-critical)' },
  'replay': { label: 'REPLAY', color: 'var(--eye-color-ink-muted)' },
  'operator-upload': { label: 'OPERATOR UPLOAD', color: 'var(--eye-color-ink-muted)' },
  'blocked-rights': { label: 'BLOCKED — RIGHTS', color: 'var(--eye-color-critical)' },
  'blocked-credential': { label: 'BLOCKED — CREDENTIAL', color: 'var(--eye-color-critical)' },
  'inactive': { label: 'INACTIVE', color: 'var(--eye-color-ink-muted)' },
};

/** The verdict in words the operator can act on, with the reason under it. */
function ReadinessCell({ r, lifecycle }: { r: SourceWithReadiness['readiness']; lifecycle: string }) {
  const v = VERDICT[r.verdict];
  return (
    <div>
      <strong style={{ color: v.color }}>{v.label}</strong>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)', maxInlineSize: '28ch' }}>{r.reason}{lifecycle !== 'active' ? '' : ` · ${r.credential}`}</div>
    </div>
  );
}

export default function SourcesPage() {
  const { scope } = useShell();
  const [sources, setSources] = useState<SourceWithReadiness[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await observation.sourcesReadiness(scope);
    if (r.ok && r.data !== undefined) { setSources(r.data.sources); setError(null); }
    else setError(r.error ?? null);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Sources</h1>
        <Link
          href="/observation/sources/new"
          style={{
            color: 'var(--eye-color-accent-default)',
            marginInlineStart: 'auto',
            fontWeight: 600,
          }}
        >
          Register a source
        </Link>
      </div>
      <ErrorNote error={error} />

      {sources === null ? <Empty>Loading the registry…</Empty>
        : sources.length === 0 ? <Empty>No source has been registered in this domain.</Empty> : (
        <ScrollBox label="Registered sources">
          <table className="eye-table">
            <caption>
              Every registered source contract, and what it is right now: LIVE (polled on a schedule), REPLAY (a frozen
              set; live collection needs a new contract version), an OPERATOR UPLOAD, or BLOCKED — by unresolved reuse
              rights, or by a credential this deployment does not bind. Read from stored records; nothing here activates anything.
            </caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Publisher authority</th>
                <th scope="col">Connector</th>
                <th scope="col">Mode</th>
                <th scope="col">Status</th>
                <th scope="col">Last governed run</th>
                <th scope="col">Evidence</th>
                <th scope="col">Health</th>
                <th scope="col">Rights</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={`${s.source_id}@${s.contract_version}`}>
                  <td data-label="Source">
                    <Link href={`/observation/sources/${s.source_id}`} style={{ color: 'var(--eye-color-accent-default)' }}>
                      {s.name}
                    </Link>
                    <div style={{ ...badgeRowStyle, marginBlockStart: 'var(--eye-space-4)' }}>
                      <Mono>{s.source_key}@v{s.contract_version}</Mono>
                      <SyntheticMarker synthetic={s.data_origin === 'synthetic'} />
                    </div>
                  </td>
                  <td data-label="Publisher authority"><AuthorityBadge authorityClass={s.authority_class} /></td>
                  <td data-label="Connector">{s.connector_kind}</td>
                  <td data-label="Mode"><ModeBadge mode={s.acquisition_mode} /></td>
                  <td data-label="Status"><ReadinessCell r={s.readiness} lifecycle={s.lifecycle_state} /></td>
                  <td data-label="Last governed run">{s.readiness.last_run === null ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>never</span>
                    : <><Mono>{s.readiness.last_run.finished_at ? s.readiness.last_run.finished_at.slice(0, 16).replace('T', ' ') + 'Z' : s.readiness.last_run.state}</Mono>
                        <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{s.readiness.last_run.mode} · {s.readiness.last_run.state} · {s.readiness.last_run.admitted} admitted{s.readiness.last_run.quarantined ? ` · ${s.readiness.last_run.quarantined} quarantined` : ''}{s.readiness.last_run.failure ? ` · ${s.readiness.last_run.failure}` : ''}</div></>}</td>
                  <td data-label="Evidence"><Mono>{s.readiness.evidence_objects}</Mono></td>
                  <td data-label="Health">{s.readiness.health === null ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>not evaluated</span>
                    : <>{s.readiness.health.state}{s.readiness.health.lag_class && s.readiness.health.lag_class !== 'none' && s.readiness.health.lag_class !== 'unknown' ? ` · ${s.readiness.health.lag_class}` : ''}<div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>as of {s.readiness.health.evaluated_at.slice(0, 10)}</div></>}</td>
                  <td data-label="Rights"><RightsBadge state={s.rights_state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}
