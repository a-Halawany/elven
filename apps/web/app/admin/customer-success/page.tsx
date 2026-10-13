'use client';
/**
 * THE CUSTOMER-SUCCESS WORKSPACE — CP-6 B94 §SV (0114_b94_x_sv; CAP-DL-10; WS-20). What the records say about operating health (the
 * strategic health snapshots as computed — none is "healthy" by inference), adoption (the ADP-* measures; below k they are indeterminate,
 * shown honestly), outcomes (the other approved measures' latest results), REALIZED VALUE (MET-040 — unsupported until B76, said so), the
 * licence and its term (as recorded; no renewal-risk score is inferred) and the cases (open, breaches, drills, commitments).
 *
 * THE VALUE REVIEW: recorded on the view you read (its inputs digest — refused as stale when the records moved), then acknowledged or withheld
 * by ANOTHER named human on the review's digest. Its claim is ALWAYS `demonstration`: joint value-review acceptance is R2.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSession } from '../../../lib/api';
import { dayOf, instantUtc, routingLine, service, valueLine, type Receipt as Rcpt, type Scope, type Success } from '../../../lib/delivery-sv-b94';
import { ErrorNote, Panel, Receipt, inputStyle } from '../../../components/ui';
import { Empty, GovernedButton, Mono, textareaStyle } from '../../../components/observation';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' } as const;

export default function CustomerSuccessPage() {
  const session = getSession();
  const own = session?.scope ?? null;
  const [domainId, setDomainId] = useState<string>(own?.domainId ?? '');
  const scope: Scope | null = own?.tenantId !== null && own?.tenantId !== undefined && domainId !== '' ? { tenantId: own.tenantId, domainId } : null;
  const roles = useMemo(() => new Set((session?.bindings ?? []).filter((b) => b.scope === 'TENANT' || b.domainId === domainId).map((b) => b.roleCode)), [session, domainId]);
  const [s, setS] = useState<{ success: Success; inputs_digest: string } | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [outcomes, setOutcomes] = useState(''); const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (scope === null) return;
    const r = await service.success(scope);
    if (r.ok && r.data !== undefined) setS(r.data); else setError(r.error ?? null);
  }, [scope?.tenantId, scope?.domainId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  const act = async (r: { ok: boolean; data?: { receipt?: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok) { setError(null); setReceipt(r.data?.receipt ?? null); setNote(''); await load(); return; }
    setError(r.error ?? null); throw new Error(r.error?.message ?? 'refused');
  };
  const canRecord = roles.has('domain_admin') || roles.has('executive');
  const me = session?.principalId ?? '';

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Customer success</h1>
      <p style={muted}>Operating health, adoption, outcomes, value and the licence as the records say them. Nothing is shown healthy, adopted or valuable by inference. Every figure is SYNTHETIC.</p>
      <Panel title="Context">
        <p>Tenant <Mono>{own?.tenantId ?? '—'}</Mono> · domain {own?.scope === 'DOMAIN' ? <Mono>{domainId}</Mono> : (
          <input aria-label="domain id" style={inputStyle} value={domainId} onChange={(e) => setDomainId(e.target.value.trim())} placeholder="the domain id" />)} · your roles here: {roles.size === 0 ? 'none' : [...roles].join(', ')}</p>
      </Panel>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {scope === null ? <Empty>No domain in this session.</Empty> : s === null ? <Empty>Reading the customer-success view…</Empty> : (
        <>
          <Panel title="Status">
            <p>Open cases: <strong>{s.success.cases.open}</strong> (S1 {s.success.cases.by_severity['S1'] ?? 0} · S2 {s.success.cases.by_severity['S2'] ?? 0} · S3 {s.success.cases.by_severity['S3'] ?? 0} · S4 {s.success.cases.by_severity['S4'] ?? 0}) · SLA breaches {s.success.cases.breaches} · drills {s.success.cases.drills} · commitments open {s.success.cases.commitments_open}, breached {s.success.cases.commitments_breached}</p>
            <p>Licence: {String((s.success.licence.standing ?? {})['state'] ?? 'unknown')}{s.success.licence.term_end !== null ? ` · term ends ${dayOf(s.success.licence.term_end)} (${s.success.licence.days_to_term_end} days)` : ' · no term end'} — <span style={muted}>{s.success.licence.note}</span></p>
            {s.success.licence.routing !== null ? <p>Support routing now (S2): {routingLine(s.success.licence.routing)}</p> : null}
          </Panel>
          <Panel title="Operating health">
            <p><strong>{s.success.health.state}</strong> — <span style={muted}>{s.success.health.note}</span></p>
            <ul>{s.success.health.snapshots.map((h) => <li key={String(h['snapshot_id'])}>definition v{String(h['definition_version'])} · {String(h['status'])} · {h['aggregate'] === null ? 'no aggregate (indeterminate)' : `aggregate ${String(h['aggregate'])}`} · coverage {String(h['coverage'])} · {instantUtc(h['computed_at'])}</li>)}</ul>
          </Panel>
          <Panel title="Adoption">
            <p style={muted}>{s.success.adoption.note} — determinate {s.success.adoption.determinate}, indeterminate {s.success.adoption.indeterminate}.</p>
            <ul>{s.success.adoption.measures.map((a) => <li key={String(a['metric_key'])}>{String(a['metric_key'])} v{String(a['version'])} · {a['state'] === null || a['state'] === undefined ? 'not computed' : String(a['state'])}{a['state'] === 'determinate' ? ` · ${String(a['value'])} ${String(a['unit'] ?? '')}` : ` — ${JSON.stringify(a['reasons'] ?? [])}`}</li>)}</ul>
          </Panel>
          <Panel title="Outcomes and realized value">
            <ul>{s.success.outcomes.results.map((a) => <li key={String(a['metric_key'])}>{String(a['metric_key'])} · {a['state'] === null || a['state'] === undefined ? 'not computed' : String(a['state'])}{a['state'] === 'determinate' ? ` · ${String(a['value'])} ${String(a['unit'] ?? '')}` : ''}</li>)}</ul>
            <p role="note"><strong>{valueLine(s.success.value)}</strong></p>
          </Panel>
          <Panel title="Value reviews">
            <p style={muted}>A review is recorded on the view above (inputs digest <Mono>{s.inputs_digest}</Mono>) — refused as stale if the records moved since you read them. Its claim is always DEMONSTRATION: joint value-review acceptance is R2.</p>
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
              <label>Period from (a day)<input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>to<input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></label>
              <label>Outcomes observed<textarea style={textareaStyle} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} /></label>
              <GovernedButton label="Record the value review" pendingLabel="recording" disabled={!canRecord || from === '' || to === '' || outcomes.trim().length < 12}
                onRun={async () => act(await service.recordReview(scope, { periodFrom: from, periodTo: to, outcomes: outcomes.trim(), inputsDigest: s.inputs_digest }))} />
              {!canRecord ? <span style={muted}>— a domain admin or an executive records a review</span> : null}
            </div>
            {s.success.reviews.length === 0 ? <Empty>No value review recorded.</Empty> : s.success.reviews.map((r: Row) => {
              const own = r['recorded_by'] === me;
              const decidable = r['state'] === 'recorded' && !own && canRecord;
              return (
                <div key={String(r['review_id'])} style={{ borderInlineStart: `3px ${r['state'] === 'recorded' ? 'dashed var(--eye-color-warning)' : 'solid var(--eye-color-accent-strong)'}`, paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-12)' }}>
                  <p>{dayOf(r['period_from'])} – {dayOf(r['period_to'])} · <strong>{String(r['state'])}</strong> · claim {String(r['claim'])} · value {String((r['value_status'] as Row)['state'])} · recorded by {String(r['recorded_by_name'] ?? r['recorded_by'])} {instantUtc(r['recorded_at'])}</p>
                  <p>{String(r['outcomes'])}</p>
                  <p style={muted}>Digest <Mono>{String(r['digest'])}</Mono>{r['decided_at'] !== null ? ` · ${String(r['state'])} by ${String(r['decided_by_name'] ?? r['decided_by'])}: ${String(r['decision_note'])}` : ''}</p>
                  {r['state'] === 'recorded' ? (
                    <>
                      <p style={muted}>Eligible to acknowledge: {decidable ? 'you' : own ? 'not you — the recorder never acknowledges' : 'an executive or a domain admin other than the recorder'}. Consequence: the review is marked acknowledged (or withheld) on this digest — a demonstration, not the joint acceptance (R2).</p>
                      <label>Note<input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                      <GovernedButton label="Acknowledge" pendingLabel="acknowledging" disabled={!decidable || note.trim().length < 8}
                        onRun={async () => act(await service.decideReview(scope, String(r['review_id']), { digest: String(r['digest']), decision: 'acknowledged', note: note.trim() }))} />
                      <GovernedButton label="Withhold" pendingLabel="withholding" variant="quiet" disabled={!decidable || note.trim().length < 8}
                        onRun={async () => act(await service.decideReview(scope, String(r['review_id']), { digest: String(r['digest']), decision: 'withheld', note: note.trim() }))} />
                    </>) : null}
                </div>);
            })}
            <p style={muted}>{s.success.boundary} · read {instantUtc(s.success.read_at)}</p>
          </Panel>
        </>
      )}
    </>
  );
}
