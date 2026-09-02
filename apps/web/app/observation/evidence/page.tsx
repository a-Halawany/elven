'use client';
/**
 * Evidence browser.
 *
 * The list shows the CURRENT version of each object. Every earlier version is
 * retained and reachable from the detail view and from a known-at query — but a
 * list that showed v1 and v2 as two rows would present one corrected object as
 * two pieces of evidence, and an operator acting on the list would act on both.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { observation } from '../../../lib/observation';
import {
  Empty, Mono, ScrollBox, SyntheticMarker, badgeRowStyle, fmtBytes, fmtInstant,
} from '../../../components/observation';
import { ErrorNote, TruthBadge } from '../../../components/ui';

export default function EvidencePage() {
  const { scope } = useShell();
  const params = useSearchParams();
  const sourceFilter = params.get('source');
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);

  const load = useCallback(async () => {
    const r = await observation.listEvidence(scope, sourceFilter);
    if (r.ok && r.data !== undefined) { setRows(r.data.evidence); setError(null); }
    else setError(r.error ?? null);
  }, [scope, sourceFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Evidence</h1>
      {sourceFilter !== null && (
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
          Filtered to one source. <Link href="/observation/evidence" style={{ color: 'var(--eye-color-accent-default)' }}>Show all</Link>
        </p>
      )}
      <ErrorNote error={error} />

      {rows === null ? <Empty>Loading evidence…</Empty>
        : rows.length === 0 ? <Empty>No evidence has been admitted in this domain.</Empty> : (
        <ScrollBox label="Admitted evidence">
          <table className="eye-table">
            <caption>
              Admitted evidence objects, current version of each. The bytes are preserved exactly as they arrived
              and their digest is re-verified on every read.
            </caption>
            <thead>
              <tr>
                <th scope="col">Evidence</th>
                <th scope="col">Truth state</th>
                <th scope="col">Bytes</th>
                <th scope="col">Method lineage</th>
                <th scope="col">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const payload = (e['payload'] ?? {}) as Record<string, unknown>;
                return (
                  <tr key={String(e['object_id'])}>
                    <td data-label="Evidence">
                      <Link href={`/observation/evidence/${String(e['object_id'])}`} style={{ color: 'var(--eye-color-accent-default)' }}>
                        <Mono>{String(e['object_id']).slice(0, 8)}…</Mono>
                      </Link>
                      <div style={{ ...badgeRowStyle, marginBlockStart: 'var(--eye-space-4)' }}>
                        <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                          v{Number(e['object_version'])} · {String(e['lifecycle_state'])}
                        </span>
                        <SyntheticMarker synthetic={e['synthetic_state'] === true} />
                        {payload['active_content_risk'] === true && (
                          <span
                            style={{ color: 'var(--eye-color-warning)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}
                            title="This file carries active-content markers. It is stored opaque and is never parsed or rendered."
                          >
                            ⚠ ACTIVE CONTENT
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Truth state"><TruthBadge state={String(e['truth_state'])} /></td>
                    <td data-label="Bytes">
                      {fmtBytes(payload['byte_length'])}
                      <div><Mono>{String(payload['content_digest'] ?? '').slice(0, 12)}…</Mono></div>
                    </td>
                    <td data-label="Method lineage"><Mono>{String(e['method_ref'] ?? 'none')}</Mono></td>
                    <td data-label="Recorded"><Mono>{fmtInstant(e['recorded_at'])}</Mono></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}
