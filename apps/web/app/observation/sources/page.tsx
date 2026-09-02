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
import { observation, type SourceSummary } from '../../../lib/observation';
import {
  AuthorityBadge, Empty, ModeBadge, Mono, RightsBadge, ScrollBox, SyntheticMarker,
  badgeRowStyle,
} from '../../../components/observation';
import { ErrorNote } from '../../../components/ui';

export default function SourcesPage() {
  const { scope } = useShell();
  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await observation.listSources(scope);
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
              Every registered source contract. A contract enters as a draft, is approved by an operator who did
              not register it, and only then may be activated.
            </caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Publisher authority</th>
                <th scope="col">Connector</th>
                <th scope="col">Mode</th>
                <th scope="col">Lifecycle</th>
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
                  <td data-label="Lifecycle">{s.lifecycle_state}</td>
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
