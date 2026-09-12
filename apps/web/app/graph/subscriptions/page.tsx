'use client';
/**
 * Subscriptions — who is told when the graph or the memory changes, and what they did about it.
 *
 * CP-6 batch B6 (migration 0063). A graph change (a resolution accepted, an entity split, an edge
 * asserted or retracted, a strategy object declared, an invalidation assessed) and a memory change
 * (evidence or a claim corrected) each publish an event in the same transaction as the change; every
 * REGISTERED SUBSCRIBER — twins, forecasts, scenarios, decisions, retrieval, memory mappings — receives
 * it through a durable ledger and updates its own world under its own action, with no operator act.
 *
 * WHAT A PERSON DOES HERE. Registers, pauses, resumes, revokes or replays a subscription (governed
 * acts by role); reads the delivery ledger of an event; and DECIDES a mapping reconciliation the
 * memory-mappings consumer proposed — a subscriber never moves an identifier, an edge or a resolution
 * itself (resolver rule 7).
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Status = NonNullable<Awaited<ReturnType<typeof graph.subscriptionStatus>>['data']>['subscriptions'];
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings'] as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : String(v ?? '—'));
const str = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

export default function SubscriptionsPage() {
  const { scope } = useShell();
  const [status, setStatus] = useState<Status | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('twins');
  const [ownerId, setOwnerId] = useState('');
  const [backlog, setBacklog] = useState<'replay' | 'leave'>('leave');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const [ledger, setLedger] = useState<{ deliveries: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> } | null>(null);
  const [mappingReason, setMappingReason] = useState('');

  const load = async () => {
    const r = await graph.subscriptionStatus(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the subscriptions could not be read'); return; }
    setStatus(r.data.subscriptions);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (status === null) return <Empty>reading subscriptions…</Empty>;

  const live = status.subscriptions.filter((s) => s['status'] !== 'revoked');
  const proposals = status.mapping_reconciliations.filter((m) => m['state'] === 'proposed');
  const reasonOk = reason.trim().length >= 8;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Subscriptions</h1>
      <UnknownNote>
        A graph or memory change publishes <strong>GraphChanged</strong> or <strong>MemoryCorrected</strong> in the same
        transaction as the change. Each registered subscriber updates its own world from it — a citing twin version goes
        unverified, a forecast and a scenario are marked for attention, an invalidated input is recorded on a decision
        package, the retrieval projections are re-verified, a mapping reconciliation is <strong>proposed</strong> — and
        nothing is decided by a subscriber: what to do about it stays with a person.
      </UnknownNote>

      <section aria-labelledby="runtime-h" style={cardStyle}>
        <h2 id="runtime-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>This process</h2>
        <p>
          scheduler {status.runtime.scheduler_enabled ? 'enabled' : 'disabled'} · domain queue <Mono>{status.runtime.redis_queue}</Mono>{' '}
          {status.runtime.worker_running ? 'served by this process' : 'not served by this process'}
        </p>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          consumers registered here: {status.consumers.filter((c) => c.registeredInThisProcess).map((c) => c.kind).join(', ') || 'none'}
          {status.runtime.last_failure !== null && <> · last failure {fmtInstant(status.runtime.last_failure.at)}: {status.runtime.last_failure.where} — {status.runtime.last_failure.message}</>}
        </p>
        {status.runtime.serving !== undefined && (
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            served by <Mono>{status.runtime.serving.holder ?? 'nobody'}</Mono>{status.runtime.serving.served_here ? ' (this process)' : ` (this process is ${status.runtime.serving.this_process})`}
            {status.runtime.serving.claimed_until !== null && <> · claim until {fmtInstant(String(status.runtime.serving.claimed_until))}, renewed {String(status.runtime.serving.renewals ?? 0)} time(s)</>}
          </p>
        )}
        {(status.telemetry.partitions ?? []).map((p) => (
          <p key={String(p['partition_key'])} style={{ color: 'var(--eye-color-ink-muted)' }}>
            partition <Mono>{String(p['partition_key'])}</Mono>: last sequence {String(p['last_seq'])}, pending {String(p['pending'])}
            {p['blocked'] === true ? <>, <strong>waiting behind its head</strong> (sequence {String(p['head_seq'])}, attempt {String(p['head_attempts'])})</> : null}
            , dead letters {String(p['dead_letters'])}, retained from sequence {String(p['retained_from_seq'])} ({String(p['retention_policy'])})
          </p>
        ))}
      </section>

      <section aria-labelledby="subs-h" style={cardStyle}>
        <h2 id="subs-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Registered subscribers ({live.length})</h2>
        {live.length === 0 ? <Empty>No subscriber is registered in this domain: graph and memory changes are published and consumed by nobody.</Empty> : (
          <ScrollBox label="subscriptions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Kind</Th><Th>Status</Th><Th>Consumer</Th><Th>Events</Th><Th>Checkpoint</Th><Th>Replays</Th><Th>Control</Th></tr></thead>
              <tbody>
                {live.map((s) => {
                  const id = String(s['subscription_id']);
                  return (
                    <tr key={id}>
                      <Td>{str(s['consumer_kind'])}</Td>
                      <Td>{str(s['status'])}</Td>
                      <Td mono>{str(s['consumer_version'])} {short(s['code_digest'])}</Td>
                      <Td mono>{Array.isArray(s['event_types']) ? (s['event_types'] as string[]).join(', ') : '—'}</Td>
                      <Td mono>{s['checkpoint_event_id'] === null ? 'none yet' : short(s['checkpoint_event_id'])}</Td>
                      <Td mono>{str(s['replay_seq'])}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                          {s['status'] === 'active' && (
                            <GovernedButton label="Pause" pendingLabel="pausing" variant="quiet" disabled={!reasonOk}
                              onRun={async () => { const r = await graph.controlSubscription(scope, id, 'pause', reason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                          )}
                          {s['status'] === 'paused' && (
                            <GovernedButton label="Resume" pendingLabel="resuming" variant="quiet" disabled={!reasonOk}
                              onRun={async () => { const r = await graph.controlSubscription(scope, id, 'resume', reason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                          )}
                          {s['status'] === 'active' && (
                            <GovernedButton label="Replay from the beginning" pendingLabel="replaying" variant="quiet" disabled={!reasonOk}
                              onRun={async () => { const r = await graph.replaySubscription(scope, id, reason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                          )}
                          <GovernedButton label="Revoke" pendingLabel="revoking" variant="critical" disabled={!reasonOk}
                            onRun={async () => { const r = await graph.controlSubscription(scope, id, 'revoke', reason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
        <label htmlFor="reason">Reason for a control or a replay (at least 8 characters)</label>
        <input id="reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this subscription is paused, resumed, revoked or replayed" />
        <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Register a subscriber</h3>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          The tenant or platform administrator's act: a principal of the kind's role is created on the identity authority
          and the subscription on the commit authority. One live subscription per kind and domain.
        </p>
        <label htmlFor="kind">Consumer kind</label>
        <select id="kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <label htmlFor="owner">Accountable owner (a human principal id)</label>
        <input id="owner" style={inputStyle} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="the principal who answers for this subscriber" />
        <label htmlFor="backlog">Past events</label>
        <select id="backlog" style={inputStyle} value={backlog} onChange={(e) => setBacklog(e.target.value as 'replay' | 'leave')}>
          <option value="leave">leave — served from now on</option>
          <option value="replay">replay — every published event is re-driven to the new subscriber</option>
        </select>
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label="Register" pendingLabel="registering" disabled={ownerId.trim().length < 8}
            onRun={async () => { const r = await graph.registerSubscription(scope, kind, ownerId.trim(), backlog); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the registration was refused'); await load(); }} />
        </div>
        <Receipt receipt={receipt} />
      </section>

      <section aria-labelledby="open-h" style={cardStyle}>
        <h2 id="open-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Deliveries in a failure state ({status.telemetry.open_failure_states.length})</h2>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          Each carries its class and the route it is sent down: <strong>unresolved</strong> work (a projection mismatch) is re-checked at every
          re-drive and applied only when a check passes after the operator's repair; a <strong>refused</strong> delivery is a governance answer
          (authority disputed, consumer unavailable, budget) re-driven by a registration, a resume or a replay; a <strong>failed</strong> one is
          infrastructure, retried.
        </p>
        {status.telemetry.open_failure_states.length === 0 ? <Empty>None open.</Empty> : (
          <ScrollBox label="open failure states">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Event</Th><Th>Consumer</Th><Th>State</Th><Th>Class</Th><Th>Disposition</Th><Th>Unresolved items</Th><Th>Since</Th><Th>Retries</Th></tr></thead>
              <tbody>
                {status.telemetry.open_failure_states.map((o) => (
                  <tr key={`${String(o['event_id'])}:${String(o['consumer_kind'])}`}>
                    <Td mono>{short(o['event_id'])}</Td>
                    <Td>{str(o['consumer_kind'])}</Td>
                    <Td>{str(o['state'])}</Td>
                    <Td>{str(o['failure_class'])}</Td>
                    <Td>{str(o['disposition'])}</Td>
                    <Td mono>{str(o['items_unresolved'])}</Td>
                    <Td>{o['unresolved_since'] === null || o['unresolved_since'] === undefined ? '—' : fmtInstant(o['unresolved_since'])}</Td>
                    <Td mono>{str(o['retries'])}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      <section aria-labelledby="deliveries-h" style={cardStyle}>
        <h2 id="deliveries-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Recent deliveries ({status.deliveries.length})</h2>
        {status.deliveries.length === 0 ? <Empty>Nothing has been delivered yet.</Empty> : (
          <ScrollBox label="deliveries">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Seq</Th><Th>Event</Th><Th>Type</Th><Th>Change</Th><Th>Consumer</Th><Th>State</Th><Th>Deliveries</Th><Th>Items</Th><Th>Applied</Th><Th>Unresolved</Th><Th>Last</Th></tr></thead>
              <tbody>
                {status.deliveries.map((d) => {
                  const key = `${String(d['event_id'])}:${String(d['subscription_id'])}`;
                  return (
                    <tr key={key}>
                      <Td mono>{str(d['partition_seq'])}</Td>
                      <Td mono><button type="button" style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0 }}
                        onClick={() => { const id = String(d['event_id']); setLedgerFor(id); void graph.subscriptionDelivery(scope, id).then((r) => { if (r.ok && r.data !== undefined) setLedger({ deliveries: r.data.deliveries, events: r.data.events }); }); }}>{short(d['event_id'])}</button></Td>
                      <Td>{str(d['event_type'])}</Td>
                      <Td>{str(d['change_kind'])}</Td>
                      <Td>{str(d['consumer_kind'])}</Td>
                      <Td>{str(d['state'])}{d['failure_class'] ? ` (${String(d['failure_class'])} → ${String(d['disposition'])})` : ''}{d['last_error'] !== null && d['last_error'] !== undefined ? ` — ${String(d['last_error'])}` : ''}</Td>
                      <Td mono>{str(d['deliveries'])} / {str(d['attempts'])}</Td>
                      <Td mono>{Array.isArray(d['items']) ? (d['items'] as unknown[]).length : 0}</Td>
                      <Td mono>{Array.isArray(d['items_applied']) ? (d['items_applied'] as unknown[]).length : 0}</Td>
                      <Td mono>{Array.isArray(d['items_unresolved']) ? (d['items_unresolved'] as unknown[]).length : 0}</Td>
                      <Td>{fmtInstant(d['last_delivered_at'])}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
        {ledgerFor !== null && ledger !== null && (
          <>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>The ledger of event <Mono>{ledgerFor}</Mono></h3>
            {ledger.deliveries.map((d) => (
              <p key={String(d['subscription_id'])}>
                <strong>{str(d['consumer_kind'])}</strong> — {str(d['state'])}; items {Array.isArray(d['items']) ? (d['items'] as string[]).join(', ') || '(none)' : '—'};
                effects {Array.isArray(d['items_applied']) ? (d['items_applied'] as Array<{ item: string; effect: string }>).map((x) => `${x.item} → ${x.effect}`).join('; ') || '(none)' : '—'}
              </p>
            ))}
            <p style={{ color: 'var(--eye-color-ink-muted)' }}>events: {ledger.events.map((e) => `${str(e['event'])} (${fmtInstant(e['occurred_at'])})`).join(' → ')}</p>
          </>
        )}
      </section>

      <section aria-labelledby="mappings-h" style={cardStyle}>
        <h2 id="mappings-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Mapping reconciliations awaiting a person ({proposals.length})</h2>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>
          Proposed by the memory-mappings consumer when the basis of an identifier, an edge or a resolution moved. Decided
          under the resolution manager's authority; nothing is moved by the proposal.
        </p>
        {proposals.length === 0 ? <Empty>No proposal is open.</Empty> : (
          <>
            <label htmlFor="mreason">Reason for the decision (at least 8 characters)</label>
            <input id="mreason" style={inputStyle} value={mappingReason} onChange={(e) => setMappingReason(e.target.value)} placeholder="why the mapping is accepted or rejected" />
            <ScrollBox label="mapping reconciliations">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Subject</Th><Th>From</Th><Th>To</Th><Th>Basis</Th><Th>Cause</Th><Th>Decide</Th></tr></thead>
                <tbody>
                  {proposals.map((m) => {
                    const id = String(m['reconciliation_id']);
                    return (
                      <tr key={id}>
                        <Td mono>{str(m['subject_kind'])} {short(m['subject_id'])}</Td>
                        <Td mono>{short(m['from_entity_id'])}</Td>
                        <Td mono>{m['to_entity_id'] === null ? 'a person names it' : short(m['to_entity_id'])}</Td>
                        <Td>{str(m['basis'])}</Td>
                        <Td mono>{short(m['cause_event_id'])}</Td>
                        <Td>
                          <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
                            <GovernedButton label="Accept" pendingLabel="accepting" disabled={mappingReason.trim().length < 8}
                              onRun={async () => { const r = await graph.decideMapping(scope, id, 'accept', mappingReason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                            <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={mappingReason.trim().length < 8}
                              onRun={async () => { const r = await graph.decideMapping(scope, id, 'reject', mappingReason.trim()); if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'refused'); setReceipt(r.data.receipt); await load(); }} />
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollBox>
          </>
        )}
      </section>

      <section aria-labelledby="checks-h" style={cardStyle}>
        <h2 id="checks-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Retrieval checks ({status.retrieval_checks.length})</h2>
        {status.retrieval_checks.length === 0 ? <Empty>No check recorded yet.</Empty> : (
          <ScrollBox label="retrieval checks">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Checked</Th><Th>Event</Th><Th>Mismatched rows</Th><Th>Touched</Th></tr></thead>
              <tbody>
                {status.retrieval_checks.map((c) => (
                  <tr key={String(c['check_id'])}>
                    <Td>{fmtInstant(c['checked_at'])}</Td>
                    <Td mono>{short(c['outbox_event_id'])}</Td>
                    <Td mono>{str(c['mismatched'])}</Td>
                    <Td>{(() => { const t = (c['touched'] ?? {}) as Record<string, unknown>; return `${str(t['event_type'])}/${str(t['change_kind'])}: ${['entities', 'edges', 'claims', 'evidence'].map((k) => `${k} ${Array.isArray(t[k]) ? (t[k] as unknown[]).length : 0}`).join(', ')}`; })()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>
    </>
  );
}
