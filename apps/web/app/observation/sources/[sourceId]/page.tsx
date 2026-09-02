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

/** URLs are shown without their query string, exactly as they are stored. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}${u.search === '' ? '' : '?[redacted]'}`;
  } catch {
    return url;
  }
}
