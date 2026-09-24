'use client';
/**
 * Source detail — contract, approval trail, health, coverage and runs.
 *
 * The health panel is where this product either earns trust or loses it, so two
 * things are never compressed:
 *
 *   PUBLISHER LAG IS DISPLAYED DISTINCTLY FROM COLLECTION FAILURE. A source whose
 *   newest item is old but whose last run succeeded is lagging behind its
 *   publisher; a source whose runs are failing is not collecting. Conflating them
 *   is how an operator learns to ignore a panel.
 *
 *   `unknown` IS RENDERED, WITH ITS REASON. Every dimension that could not be
 *   measured says why, in a sentence, at the same visual weight as a measurement.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { observation, type HealthState, type Measurement } from '../../../../lib/observation';
// B23 (0084) stream
import type { AcquisitionStream, IncompleteRange, StreamRunAnswer } from '../../../../lib/observation';
import {
  AuthorityBadge, DefinitionRow, Empty, GovernedButton, HealthBadge, LiveStatus,
  MeasurementState, ModeBadge, Mono, RightsBadge, ScrollBox, SyntheticMarker,
  UnknownNote, badgeRowStyle, cardStyle, fmtInstant,
} from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';

interface SourceDetail {
  source: Record<string, unknown>;
  approvalTrail: Array<Record<string, unknown>>;
  agents: Array<Record<string, unknown>>;
  health: { state: HealthState | null; measurements: Measurement[] };
  runs: Array<Record<string, unknown>>;
  schedule: Record<string, unknown> | null;
  receipt: { policyDecisionId: string; auditSeq: number };
}

export default function SourceDetailPage() {
  const { scope, isCollectionManager } = useShell();
  const params = useParams<{ sourceId: string }>();
  const sourceId = params.sourceId;
  const [d, setD] = useState<SourceDetail | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [replay, setReplay] = useState<{ timeline: Array<Record<string, unknown>>; deterministic: boolean } | null>(null);

  const load = useCallback(async () => {
    const r = await observation.getSource(scope, sourceId);
    if (r.ok && r.data !== undefined) { setD(r.data as unknown as SourceDetail); setError(null); }
    else setError(r.error ?? null);
  }, [scope, sourceId]);

  useEffect(() => { void load(); }, [load]);

  if (error !== null && d === null) return <><h1>Source</h1><ErrorNote error={error} /></>;
  if (d === null) return <Empty>Loading the source contract…</Empty>;

  const s = d.source;
  const contract = (s['contract'] ?? {}) as Record<string, Record<string, unknown>>;
  const version = Number(s['contract_version']);
  const lifecycle = String(s['lifecycle_state']);
  const registrar = String(s['registrar_principal_id'] ?? '');
  const approver = s['approver_principal_id'] === null ? null : String(s['approver_principal_id']);

  /** Every governed action here resolves on the SERVER's answer, never before. */
  const run = async (fn: () => Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string; correlationId: string } }>) => {
    setNotice(null); setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
    const rec = (r.data as { receipt?: { policyDecisionId: string; auditSeq: number } } | undefined)?.receipt;
    if (rec !== undefined) setReceipt(rec);
    await load();
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{String(s['name'])}</h1>
      <div style={badgeRowStyle}>
        <Mono>{String(s['source_key'])}@v{version}</Mono>
        <AuthorityBadge authorityClass={String(s['authority_class'])} />
        <ModeBadge mode={String(s['acquisition_mode'])} />
        <SyntheticMarker synthetic={String(s['data_origin']) === 'synthetic'} />
        <RightsBadge state={String(s['rights_state'])} />
        <HealthBadge state={(d.health.state ?? 'unknown') as HealthState} />
      </div>

      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {notice !== null && <LiveStatus>{notice}</LiveStatus>}

      {/* ── contract ───────────────────────────────────────────────── */}
      <section aria-labelledby="contract" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="contract" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Contract</h2>
        <dl style={{ margin: 0 }}>
          <DefinitionRow term="Publisher">{String(s['publisher'])}</DefinitionRow>
          <DefinitionRow term="Lifecycle">{lifecycle}</DefinitionRow>
          <DefinitionRow term="Legal basis">{String(contract['authority_and_rights']?.['legal_basis'] ?? 'not recorded')}</DefinitionRow>
          <DefinitionRow term="Licence">{String(contract['authority_and_rights']?.['licence'] ?? 'not recorded')}</DefinitionRow>
          <DefinitionRow term="Purposes">{(contract['authority_and_rights']?.['purposes'] as string[] ?? []).join(', ')}</DefinitionRow>
          <DefinitionRow term="Residency">{String(s['residency'])}</DefinitionRow>
          <DefinitionRow term="Classification ceiling">{String(s['classification_ceiling'])}</DefinitionRow>
          <DefinitionRow term="Correction channel">
            {String(contract['security_and_operations']?.['correction_channel'] ?? 'not recorded')}
          </DefinitionRow>
          <DefinitionRow term="Endpoints">
            {(s['endpoints'] as string[] ?? []).length === 0
              ? 'none — bytes are supplied by an operator'
              : (s['endpoints'] as string[]).map((e) => <div key={e}><Mono>{redact(e)}</Mono></div>)}
          </DefinitionRow>
          <DefinitionRow term="Schedule">
            {d.schedule === null ? 'not scheduled'
              : `${String(d.schedule['cadence_seconds'])}s cadence · ${String(d.schedule['status'])}`}
          </DefinitionRow>
        </dl>
      </section>

      {/* ── approvals ──────────────────────────────────────────────── */}
      <section aria-labelledby="approvals" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="approvals" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Approval trail</h2>
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlockStart: 0 }}>
          Registered by <Mono>{registrar.slice(0, 8)}…</Mono>
          {approver !== null
            ? <> · approved by <Mono>{approver.slice(0, 8)}…</Mono> — the registrar may never approve their own registration, and the rule is enforced on the acting principal rather than by hiding a button.</>
            : <> · not yet approved. It cannot be approved by the operator who registered it.</>}
        </p>
        <ScrollBox label="Approval trail">
          <table className="eye-table">
            <caption>Every lifecycle event on this contract, in order.</caption>
            <thead>
              <tr><th scope="col">Event</th><th scope="col">Actor</th><th scope="col">When</th><th scope="col">Detail</th></tr>
            </thead>
            <tbody>
              {d.approvalTrail.map((e) => (
                <tr key={String(e['event_id'])}>
                  <td data-label="Event">{String(e['event'])}</td>
                  <td data-label="Actor"><Mono>{String(e['actor_principal_id']).slice(0, 8)}…</Mono></td>
                  <td data-label="When"><Mono>{fmtInstant(e['occurred_at'])}</Mono></td>
                  <td data-label="Detail" style={{ maxInlineSize: '28rem' }}>
                    {String((e['details'] as Record<string, unknown>)?.['reason'] ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      </section>

      {/* ── governed actions ───────────────────────────────────────── */}
      <section aria-labelledby="actions" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="actions" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Governed actions</h2>
        {!isCollectionManager && (
          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
            You hold no <strong>collection_manager</strong> binding in this domain, so approval, lifecycle changes and
            rights confirmation are not yours to make. The controls are shown because the rule lives in the pipeline,
            not in this interface — attempting one will be refused with a reason.
          </p>
        )}
        <label htmlFor="action-reason" style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' }}>
          Reason (recorded with the decision)
        </label>
        <input
          id="action-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            inlineSize: '100%', blockSize: 'var(--eye-size-control-md)',
            border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)',
            paddingInline: 'var(--eye-space-8)', marginBlockEnd: 'var(--eye-space-8)',
            background: 'var(--eye-color-surface-primary)', color: 'var(--eye-color-ink-default)',
          }}
        />
        <div style={badgeRowStyle}>
          {lifecycle === 'draft' && (
            <>
              <GovernedButton
                label="Approve" pendingLabel="Approving"
                onRun={() => run(() => observation.approveSource(scope, sourceId, version, 'approve', reason))}
              />
              <GovernedButton
                label="Reject" pendingLabel="Rejecting" variant="critical"
                onRun={() => run(() => observation.approveSource(scope, sourceId, version, 'reject', reason))}
              />
            </>
          )}
          {lifecycle === 'approved' && (
            <GovernedButton
              label="Activate" pendingLabel="Activating"
              onRun={() => run(() => observation.transitionSource(scope, sourceId, version, 'active', reason))}
            />
          )}
          {lifecycle === 'active' && (
            <>
              <GovernedButton
                label="Suspend" pendingLabel="Suspending" variant="quiet"
                onRun={() => run(() => observation.transitionSource(scope, sourceId, version, 'suspended', reason))}
              />
              <GovernedButton
                label="Collect now" pendingLabel="Collecting"
                onRun={async () => {
                  const r = await observation.collect(scope, sourceId, version);
                  if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
                  const run_ = r.data?.run;
                  setNotice(run_ === undefined ? 'collection returned no run'
                    : `run ${run_.state}: ${run_.admitted} admitted · ${run_.quarantined} quarantined · ${run_.noop} no-op${run_.reason !== undefined ? ` — ${run_.reason}` : ''}`);
                  await load();
                }}
              />
            </>
          )}
          {lifecycle === 'suspended' && (
            <GovernedButton
              label="Reactivate" pendingLabel="Reactivating"
              onRun={() => run(() => observation.transitionSource(scope, sourceId, version, 'active', reason))}
            />
          )}
          {String(s['rights_state']) !== 'confirmed' && (
            <GovernedButton
              label="Confirm reuse rights" pendingLabel="Confirming" variant="quiet"
              onRun={() => run(() => observation.setRights(scope, sourceId, version, 'confirmed', reason))}
            />
          )}
          <GovernedButton
            label="Evaluate coverage" pendingLabel="Evaluating" variant="quiet"
            onRun={() => run(() => observation.evaluate(scope, sourceId, {}))}
          />
        </div>
      </section>

      {/* B23 (0084) stream — the stream form of Acquire, next to Collect now */}
      {lifecycle === 'active' && String(s['connector_kind']) === 'rest' && (
        <StreamPanel
          scope={scope} sourceId={sourceId} version={version}
          defaultPartitionKey={`${String(s['source_key'])}:${String(s['acquisition_mode']) === 'live' ? 'backfill' : ''}`}
          onError={(e) => setError(e)} onReceipt={(r) => setReceipt(r)} onChanged={load}
        />
      )}
      {/* end B23 stream */}

      {/* ── health & coverage ──────────────────────────────────────── */}
      <section aria-labelledby="health" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="health" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Freshness, coverage and authenticity</h2>
        {d.health.measurements.length === 0 ? (
          <Empty>No coverage evaluation has been recorded for this source yet.</Empty>
        ) : (
          <>
            <ScrollBox label="Coverage dimensions">
              <table className="eye-table">
                <caption>
                  Each dimension carries the instant it was evaluated at, the window, the denominator and its
                  derivation. Nothing here is computed from an unstored clock.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Dimension</th>
                    <th scope="col">State</th>
                    <th scope="col">Value</th>
                    <th scope="col">Denominator</th>
                    <th scope="col">Evaluated at</th>
                  </tr>
                </thead>
                <tbody>
                  {d.health.measurements.map((m) => (
                    <tr key={m.dimension}>
                      <td data-label="Dimension">{m.dimension.replace(/_/g, ' ')}</td>
                      <td data-label="State"><MeasurementState state={m.state} /></td>
                      <td data-label="Value" style={{ maxInlineSize: '34rem' }}>
                        {m.value_numeric !== null ? <strong>{Number(m.value_numeric)}</strong> : null}
                        {m.value_text !== null && (
                          <div style={{ color: 'var(--eye-color-ink-default)', fontSize: 'var(--eye-type-body-sm)' }}>
                            {m.value_text}
                          </div>
                        )}
                        {m.not_applicable_reason !== null && (
                          <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                            contract-approved exemption: {m.not_applicable_reason}
                          </div>
                        )}
                      </td>
                      <td data-label="Denominator">
                        {m.denominator === null ? '—' : Number(m.denominator)}
                        {/* The derivation explains the denominator, so it is shown
                            only where there is one to explain. */}
                        {m.denominator !== null && m.denominator_derivation !== null && (
                          <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                            {m.denominator_derivation}
                          </div>
                        )}
                      </td>
                      <td data-label="Evaluated at">
                        <Mono>{fmtInstant(m.evaluated_at)}</Mono>
                        <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                          universe {m.coverage_universe_version} · calc {m.calc_version}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>

            <UnknownNote>
              <strong>Content authenticity is unknown for every source in this phase.</strong> TLS establishes which
              endpoint we connected to and the digest establishes that the stored bytes are the bytes that arrived.
              Neither establishes that the content genuinely originates from the claimed source. No source here
              publishes a signature mechanism, so the honest answer is `unknown` — and it is recorded as an answer,
              not left blank.
            </UnknownNote>
          </>
        )}

        <div style={{ marginBlockStart: 'var(--eye-space-12)', ...badgeRowStyle }}>
          <GovernedButton
            label="Replay the health timeline" pendingLabel="Replaying" variant="quiet"
            onRun={async () => {
              const r = await observation.replayHealth(scope, sourceId);
              if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
              setReplay({ timeline: r.data.timeline, deterministic: r.data.deterministic });
            }}
          />
          {replay !== null && (
            <LiveStatus>
              {replay.timeline.length} transition{replay.timeline.length === 1 ? '' : 's'} replayed from stored events —{' '}
              {replay.deterministic ? 'identical on both runs' : 'THE TWO RUNS DIFFERED'}
            </LiveStatus>
          )}
        </div>
        {replay !== null && replay.timeline.length > 0 && (
          <ScrollBox label="Health timeline">
            <table className="eye-table">
              <caption>The health timeline, derived from stored events and measurements alone.</caption>
              <thead><tr><th scope="col">Evaluated at</th><th scope="col">State</th><th scope="col">Reason</th></tr></thead>
              <tbody>
                {replay.timeline.map((t, i) => (
                  <tr key={i}>
                    <td data-label="Evaluated at"><Mono>{fmtInstant(t['evaluated_at'])}</Mono></td>
                    <td data-label="State"><HealthBadge state={String(t['state']) as HealthState} /></td>
                    <td data-label="Reason" style={{ maxInlineSize: '40rem' }}>{String(t['reason'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {/* ── runs ───────────────────────────────────────────────────── */}
      <section aria-labelledby="runs" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="runs" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Collection runs</h2>
        {d.runs.length === 0 ? <Empty>No run has been recorded for this source.</Empty> : (
          <ScrollBox label="Collection runs">
            <table className="eye-table">
              <caption>Each run, the agent instance that performed it, and what it admitted.</caption>
              <thead>
                <tr>
                  <th scope="col">Run</th><th scope="col">Agent</th><th scope="col">State</th>
                  <th scope="col">Admitted</th><th scope="col">Quarantined</th><th scope="col">Started</th>
                </tr>
              </thead>
              <tbody>
                {d.runs.map((r) => (
                  <tr key={String(r['run_id'])}>
                    <td data-label="Run"><Mono>{String(r['run_id']).slice(0, 8)}…</Mono></td>
                    <td data-label="Agent">
                      <Mono>{String(r['connector'])}@{String(r['agent_version'])}</Mono>
                      <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                        code <Mono>{String(r['code_digest']).slice(0, 12)}…</Mono>
                      </div>
                    </td>
                    <td data-label="State">{String(r['state'])}</td>
                    <td data-label="Admitted">{String(r['items_admitted'])}</td>
                    <td data-label="Quarantined">{String(r['items_quarantined'])}</td>
                    <td data-label="Started"><Mono>{fmtInstant(r['started_at'])}</Mono></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        )}
        <p style={{ marginBlockEnd: 0 }}>
          <Link href={`/observation/evidence?source=${sourceId}`} style={{ color: 'var(--eye-color-accent-default)' }}>
            Browse this source’s evidence
          </Link>
        </p>
      </section>
    </>
  );
}

/* B23 (0084) stream */
type ApiError = { code: string; message: string; correlationId: string };
const inputStyle = {
  blockSize: 'var(--eye-size-control-md)', border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-8)', background: 'var(--eye-color-surface-primary)', color: 'var(--eye-color-ink-default)',
} as const;
const labelStyle = { display: 'block', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' } as const;

/**
 * THE STREAM FORM of Acquire (L1-I02), beside Collect now. A stream is SEGMENT PULL WITH CREDIT-BASED FLOW CONTROL over the
 * connector's pages under a stable partition key — not a socket. Every state shown here is the server's: a stream's state,
 * its cursor and its incomplete ranges are rendered as the server returned them, and an incomplete range is shown as what it
 * is — a gap the stream moved past, never a collected window.
 */
function StreamPanel({ scope, sourceId, version, defaultPartitionKey, onError, onReceipt, onChanged }: {
  scope: { tenantId: string; domainId: string }; sourceId: string; version: number; defaultPartitionKey: string;
  onError: (e: ApiError | null) => void; onReceipt: (r: { policyDecisionId: string; auditSeq: number }) => void; onChanged: () => Promise<void>;
}) {
  const [streams, setStreams] = useState<AcquisitionStream[]>([]);
  const [partitionKey, setPartitionKey] = useState(defaultPartitionKey);
  const [credit, setCredit] = useState('2');
  const [maxSegments, setMaxSegments] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ streamId: string; ranges: IncompleteRange[]; segments: number } | null>(null);

  const refresh = useCallback(async () => {
    const r = await observation.listStreams(scope, sourceId);
    if (r.ok && r.data !== undefined) setStreams(r.data.streams);
  }, [scope, sourceId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const limit = maxSegments.trim() === '' ? null : Number(maxSegments);
  const report = async (r: { ok: boolean; data?: StreamRunAnswer; error?: ApiError }) => {
    if (!r.ok || r.data === undefined) { onError(r.error ?? null); throw new Error('refused'); }
    onError(null); onReceipt(r.data.receipt);
    const run = r.data.run;
    setNotice(`run ${run.state}: ${run.segments} segment(s) acknowledged · ${run.admitted} admitted · ${run.noop} no-op · ${run.quarantined} quarantined · `
      + `${run.backpressureSignals} backpressure signal(s) · ${run.incompleteRanges} incomplete range(s) — stream ${r.data.stream?.state ?? 'not opened'}`
      + `${run.reason !== undefined ? ` — ${run.reason}` : ''}`);
    await refresh(); await onChanged();
  };
  const show = async (streamId: string) => {
    const r = await observation.getStream(scope, streamId);
    if (!r.ok || r.data === undefined) { onError(r.error ?? null); throw new Error('refused'); }
    setDetail({ streamId, ranges: r.data.incompleteRanges, segments: r.data.segments.length });
  };

  return (
    <section aria-labelledby="stream" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="stream" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Stream acquisition</h2>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlockStart: 0 }}>
        The connector&apos;s pages are pulled one segment at a time; no more than <strong>credit</strong> segments are held
        unacknowledged, and the stream waits (backpressure) until one is admitted. An interrupted stream resumes from its cursor
        without admitting anything twice. A page the publisher did not serve is declared an <strong>incomplete range</strong>,
        and such a stream closes incomplete — never complete.
      </p>
      {notice !== null && <LiveStatus>{notice}</LiveStatus>}
      <div style={{ ...badgeRowStyle, alignItems: 'flex-end' }}>
        <div>
          <label htmlFor="stream-partition" style={labelStyle}>Partition key</label>
          <input id="stream-partition" value={partitionKey} onChange={(e) => setPartitionKey(e.target.value)} style={{ ...inputStyle, inlineSize: '22rem' }} />
        </div>
        <div>
          <label htmlFor="stream-credit" style={labelStyle}>Credit</label>
          <input id="stream-credit" type="number" min={1} max={64} value={credit} onChange={(e) => setCredit(e.target.value)} style={{ ...inputStyle, inlineSize: '5rem' }} />
        </div>
        <div>
          <label htmlFor="stream-max" style={labelStyle}>Segments this pull (optional)</label>
          <input id="stream-max" type="number" min={1} value={maxSegments} onChange={(e) => setMaxSegments(e.target.value)} style={{ ...inputStyle, inlineSize: '7rem' }} />
        </div>
        <GovernedButton
          label="Open stream" pendingLabel="Streaming"
          onRun={async () => report(await observation.openStream(scope, sourceId, { contractVersion: version, partitionKey, credit: Number(credit), maxSegments: limit }))}
        />
      </div>
      <label htmlFor="stream-reason" style={{ ...labelStyle, marginBlockStart: 'var(--eye-space-8)' }}>Interrupt reason (recorded)</label>
      <input id="stream-reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, inlineSize: '100%', marginBlockEnd: 'var(--eye-space-8)' }} />
      {streams.length === 0 ? <Empty>No stream has been opened for this source.</Empty> : (
        <ScrollBox label="Streams">
          <table className="eye-table">
            <caption>Each stream of this source: its stable partition key, its state and cursor as the server holds them.</caption>
            <thead>
              <tr><th scope="col">Partition</th><th scope="col">State</th><th scope="col">Range</th><th scope="col">Next segment</th>
                  <th scope="col">Covered to</th><th scope="col">Credit</th><th scope="col">Actions</th></tr>
            </thead>
            <tbody>
              {streams.map((st) => (
                <tr key={st.stream_id}>
                  <td data-label="Partition"><Mono>{st.partition_key}</Mono></td>
                  <td data-label="State">{st.state}{st.interrupt_requested !== null && st.interrupt_requested !== false ? ' · interrupt requested' : ''}</td>
                  <td data-label="Range"><Mono>{st.range_from} → {st.range_to}</Mono></td>
                  <td data-label="Next segment">{st.next_seq}</td>
                  <td data-label="Covered to"><Mono>{st.high_water ?? '—'}</Mono></td>
                  <td data-label="Credit">{st.credit}</td>
                  <td data-label="Actions">
                    <div style={badgeRowStyle}>
                      <GovernedButton label="Details" pendingLabel="Reading" variant="quiet" onRun={() => show(st.stream_id)} />
                      {!['completed', 'closed_incomplete'].includes(st.state) && (
                        <>
                          <GovernedButton
                            label="Resume" pendingLabel="Resuming" variant="quiet" disabled={st.state === 'running' || st.state === 'backpressured'}
                            onRun={async () => report(await observation.resumeStream(scope, st.stream_id, { credit: Number(credit), maxSegments: limit }))}
                          />
                          <GovernedButton
                            label="Interrupt" pendingLabel="Interrupting" variant="critical" disabled={st.state === 'interrupted'}
                            onRun={async () => {
                              const r = await observation.interruptStream(scope, st.stream_id, reason);
                              if (!r.ok || r.data === undefined) { onError(r.error ?? null); throw new Error('refused'); }
                              onError(null); onReceipt(r.data.receipt);
                              setNotice(r.data.stream.requested === true
                                ? 'interrupt requested — the running stream stops at its next segment boundary'
                                : `stream ${r.data.stream.state} at its cursor`);
                              await refresh();
                            }}
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
      {detail !== null && (
        <ScrollBox label="Incomplete ranges">
          <table className="eye-table">
            <caption>
              Stream <Mono>{detail.streamId.slice(0, 8)}…</Mono> — {detail.segments} segment(s) acknowledged. The ranges it did NOT collect,
              declared explicitly; a resolved one was re-covered by the segment named.
            </caption>
            <thead><tr><th scope="col">Range</th><th scope="col">Class</th><th scope="col">Detail</th><th scope="col">Resolved by</th></tr></thead>
            <tbody>
              {detail.ranges.length === 0 ? (
                <tr><td colSpan={4}>No incomplete range was declared on this stream.</td></tr>
              ) : detail.ranges.map((r, i) => (
                <tr key={i}>
                  <td data-label="Range"><Mono>{r.range_from} → {r.range_to}</Mono></td>
                  <td data-label="Class">{r.reason_class.replace(/_/g, ' ')}</td>
                  <td data-label="Detail" style={{ maxInlineSize: '32rem' }}>{r.detail}</td>
                  <td data-label="Resolved by">{r.resolved_by_seq === null ? 'unresolved' : `segment ${r.resolved_by_seq}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}
/* end B23 stream */

/** URLs are shown without their query string, exactly as they are stored. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}${u.search === '' ? '' : '?[redacted]'}`;
  } catch {
    return url;
  }
}
