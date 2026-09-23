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
 *
 * CP-6 batch B20 (migration 0080) adds THE PROJECTIONS — the index tier. The six derived projections
 * a domain's graph and memory reads serve from (entities, resolutions, edges, strategy,
 * invalidations, memory items) are PARTITIONS, each `serving` or `withdrawn`. The retrieval
 * subscriber re-verifies each against its event log after every change — symmetrically: drifted
 * rows, rows the log has and the projection lacks, rows the projection has and the log lacks
 * (poisoned), an outdated representation — and WITHDRAWS a partition that fails; an administrator
 * withdraws one on suspicion, with a reason. A withdrawn partition is served from its log, labelled
 * and constrained, until the REBUILD — the administrator's human-gated act, the only way back to
 * service — writes the rows the log derives (or refuses, naming what it cannot rebuild and what a
 * derived row still holds). The table shows each partition's condition from the flag (current,
 * lagging, unverified, withdrawn), the derived watermark (the revision, the sequence verified
 * through, the verification lag), the withdrawal and the last rebuild and check; the answers of the
 * two acts are shown verbatim and every refusal in the server's words.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, projectionNote, type ProjectionStateRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Status = NonNullable<Awaited<ReturnType<typeof graph.subscriptionStatus>>['data']>['subscriptions'];
type Row = Record<string, unknown>;
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'] as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : String(v ?? '—'));
const str = (v: unknown) => (v === null || v === undefined ? '—' : String(v));
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code) — the memory page's idiom. */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** The last check's counts for one projection, as recorded: mismatched / missing / unexpected, the representation, whether the row failed. */
const checkCounts = (c: Row | null): string =>
  c === null ? '—'
  : `${str(c['mismatched'])} / ${str(c['missing'])} / ${str(c['unexpected'])}${c['representation_ok'] === false ? ' · representation outdated' : ''}${c['failed'] === true ? ' · failed' : ''}`;
/** The B20 (C8) report lists rendered as ids with their reasons: nothing is summarised away. */
function IdList({ label, rows, line }: { label: string; rows: Row[]; line: (r: Row) => string }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p style={{ margin: 0 }}>{label} ({rows.length})</p>
      <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
        {rows.map((r, i) => <li key={`${String(r['id'] ?? i)}`}><Mono>{str(r['id'])}</Mono> — {line(r)}</li>)}
      </ul>
    </>
  );
}

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
  // B20: the projections' reason, the last act's answer (verbatim), its refusal (the server's words) and its receipt.
  const [preason, setPreason] = useState('');
  const [pAnswer, setPAnswer] = useState<{ kind: 'withdrawn' | 'rebuild'; r: Row } | null>(null);
  const [pProblem, setPProblem] = useState<string | null>(null);
  const [pReceipt, setPReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

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
  const preasonOk = preason.trim().length >= 8;
  const partitions: ProjectionStateRow[] = status.projections ?? [];
  const pevents: Row[] = status.projection_events ?? [];
  /** The watermark is the domain's (the same on every row): read from the first. */
  const mark = partitions[0] ?? null;
  /** The whole domain's block: its condition from the flag, its label as the wording (the six partitions' worst). */
  const domainNote = projectionNote(status.projection);
  /** One governed act on a partition: the refusal is kept verbatim (`not withdrawn — HTTP …` / `not rebuilt — HTTP …`); the table is re-read from the server after. */
  const act = async (kind: 'withdrawn' | 'rebuild', projection: string) => {
    setPProblem(null); setPAnswer(null);
    const why = preason.trim();
    const r = kind === 'withdrawn' ? await graph.withdrawProjection(scope, projection, why) : await graph.rebuildProjection(scope, projection, why);
    if (!r.ok || r.data === undefined) {
      const m = `${kind === 'withdrawn' ? 'not withdrawn' : 'not rebuilt'} — ${refusal(r, `the ${kind === 'withdrawn' ? 'withdrawal' : 'rebuild'} was not answered`)}`;
      setPProblem(m); await load(); throw new Error(m);
    }
    setPAnswer({ kind, r: kind === 'withdrawn' ? (r.data as { projection: Row }).projection : (r.data as { rebuild: Row }).rebuild });
    setPReceipt(r.data.receipt);
    await load();
  };
  const answered = pAnswer?.r ?? null;
  const attempted = answered === null ? null : rec(answered['attempted']);
  const check = answered === null || answered['check'] === null ? null : rec(answered['check']);

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

      <section aria-labelledby="projections-h" style={cardStyle}>
        <h2 id="projections-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Projections (the index tier)</h2>
        <UnknownNote>
          The six derived projections a domain&rsquo;s reads serve from. The retrieval subscriber re-verifies each against its event
          log after every change and <strong>withdraws</strong> a partition that fails (drifted, missing or poisoned rows; an outdated
          representation); an administrator withdraws one on suspicion. A withdrawn partition is served from its log, labelled and
          constrained, until the rebuild — the administrator&rsquo;s act — returns it to service.
        </UnknownNote>
        {mark !== null && (
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            revision <Mono>{str(mark.revision_seq)}</Mono> · verified through <Mono>{str(mark.verified_seq)}</Mono>
            {mark.verified_at !== null ? <> (at {fmtInstant(mark.verified_at)}{mark.verified_check_id !== null ? <>, check <Mono>{short(mark.verified_check_id)}</Mono></> : null})</> : null}
            {' · '}checkpoint <Mono>{str(mark.checkpoint_seq)}</Mono> · lag {str(mark.lag_events)} change(s) · {str(mark.unresolved_deliveries)} unresolved delivery(ies)
            {' · '}retrieval subscription {mark.subscription_id === null ? 'none' : <><Mono>{short(mark.subscription_id)}</Mono> ({str(mark.subscription_status)})</>}
            {' · '}representation current <Mono>{str(mark.representation_current)}</Mono>
          </p>
        )}
        {domainNote !== null && (
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            <strong>Projection {domainNote.condition}.</strong> {domainNote.text}
            {domainNote.code !== null ? <> · code <Mono>{domainNote.code}</Mono></> : null}
          </p>
        )}
        {partitions.length === 0 ? <Empty>The server answered no partition rows for this domain.</Empty> : (
          <ScrollBox label="projections">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Projection</Th><Th>Condition</Th><Th>State</Th><Th>Revision / verified through / lag</Th><Th>Withdrawn since</Th><Th>Reason</Th><Th>Representation</Th><Th>Last rebuild</Th><Th>Last check (mismatched / missing / unexpected)</Th><Th>Act</Th></tr></thead>
              <tbody>
                {partitions.map((p) => {
                  // The withdrawal's instant and reason: the block's names, or the port's columns (the status folds both over each row).
                  const since = p.withdrawn_since ?? p.withdrawn_at ?? null;
                  const why = p.reason ?? p.withdrawn_reason ?? null;
                  return (
                    <tr key={p.projection}>
                      <Td mono>{p.projection}</Td>
                      <Td>{p.condition === 'withdrawn' ? <strong>withdrawn</strong> : str(p.condition)}</Td>
                      <Td>{str(p.state)}</Td>
                      <Td mono>{str(p.revision_seq)} / {str(p.verified_seq)} / {str(p.lag_events)}</Td>
                      <Td>{since === null ? '—' : fmtInstant(since)}</Td>
                      <Td>{str(why)}{p.withdrawn_by_check !== null && p.withdrawn_by_check !== undefined ? <> (by the retrieval check <Mono>{short(p.withdrawn_by_check)}</Mono>)</> : null}</Td>
                      <Td mono>{str(p.representation_version)}{p.representation_ok === false ? ` (outdated — current ${str(p.representation_current)})` : ''}</Td>
                      <Td>{p.last_rebuild_id === null || p.last_rebuild_id === undefined ? '—' : <><Mono>{short(p.last_rebuild_id)}</Mono> at {fmtInstant(p.rebuilt_at)}</>}</Td>
                      <Td mono>{checkCounts(p.last_check === null || p.last_check === undefined ? null : rec(p.last_check))}</Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                          <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={!preasonOk}
                            onRun={() => act('withdrawn', p.projection)} />
                          <GovernedButton label="Rebuild" pendingLabel="rebuilding" variant="quiet" disabled={!preasonOk}
                            onRun={() => act('rebuild', p.projection)} />
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
        <label htmlFor="preason">Reason for a withdrawal or a rebuild (at least 8 characters)</label>
        <input id="preason" style={inputStyle} value={preason} onChange={(e) => setPreason(e.target.value)} placeholder="why this partition is taken out of service, or rebuilt" />
        {pProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{pProblem}</span></LiveStatus>}
        {pAnswer !== null && answered !== null && pAnswer.kind === 'withdrawn' && (
          <p role="status">
            withdrawn {str(answered['projection'])} ({answered['changed'] === true ? 'the state changed' : 'already withdrawn — a second reason recorded'}) since {fmtInstant(answered['withdrawn_since'])}: {str(answered['reason'])}
            {answered['second_reason'] !== null && answered['second_reason'] !== undefined ? <> — the second reason: {String(answered['second_reason'])}</> : null}
            {answered['withdrawn_by_check'] !== null && answered['withdrawn_by_check'] !== undefined ? <> (withdrawn by the retrieval check <Mono>{short(answered['withdrawn_by_check'])}</Mono>)</> : null}
            {' · '}event <Mono>{short(answered['event_id'])}</Mono>
          </p>
        )}
        {pAnswer !== null && answered !== null && pAnswer.kind === 'rebuild' && answered['outcome'] === 'refused' && (
          <>
            <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not rebuilt — {str(answered['refusal'])}</span></LiveStatus>
            <p style={{ color: 'var(--eye-color-ink-muted)' }}>
              rebuild <Mono>{short(answered['rebuild_id'])}</Mono> of {str(answered['projection'])} refused; the partition stays {str(answered['state'])}
              {attempted !== null ? <> · attempted: updated {str(attempted['updated'])}, inserted {str(attempted['inserted'])}, removed {str(attempted['removed'])} (rolled back)</> : null}
              {check !== null ? <> · the check after the attempt: {checkCounts(check)}</> : null}
            </p>
            <IdList label="Rows the log has that cannot be written (unrebuildable)" rows={arr(answered['unrebuildable'])} line={(r) => str(r['reason'])} />
            <IdList label="Poisoned rows still held by other rows (a person decides)" rows={arr(answered['referenced'])}
              line={(r) => `${str(r['canonical_name'] ?? r['title'])} — held by ${arr(r['referenced_by']).map((h) => `${str(h['kind'])} ${str(h['id'])}${h['state'] !== undefined ? ` (${str(h['state'])}${h['derived'] === false ? ', itself unexpected' : ''})` : ''}`).join(', ') || 'nothing named'}; derived holders ${str(r['held_by_derived'])}, poisoned holders ${str(r['held_by_poisoned'])}`} />
            <IdList label="References that would dangle after a removal (named, left in place)" rows={arr(answered['dangling'])}
              line={(r) => `${str(r['kind'])}${r['dependent'] !== undefined ? ` of ${str(r['dependent'])}` : ''}${r['depends_on'] !== undefined ? ` on ${str(r['depends_on_kind'])} ${str(r['depends_on'])}` : ''}${r['subject_entity_id'] !== undefined ? ` on entity ${str(r['subject_entity_id'])}` : ''}`} />
          </>
        )}
        {pAnswer !== null && answered !== null && pAnswer.kind === 'rebuild' && answered['outcome'] !== 'refused' && (
          <>
            <p role="status">
              rebuild of {str(answered['projection'])}: {str(answered['outcome'])} — updated {str(answered['updated'])}, inserted {str(answered['inserted'])}, removed {str(answered['removed'])}; representation {str(answered['representation_version'])}
              {' · '}rebuild <Mono>{short(answered['rebuild_id'])}</Mono> · the partition is {str(answered['state'])}
              {check !== null ? <> · the check after the rebuild: {checkCounts(check)}</> : null}
              {answered['withdrawn_since'] !== null && answered['withdrawn_since'] !== undefined ? <> · it had been withdrawn since {fmtInstant(answered['withdrawn_since'])}{answered['withdrawn_reason'] !== null && answered['withdrawn_reason'] !== undefined ? ` (${String(answered['withdrawn_reason'])})` : ''}</> : null}
            </p>
            <IdList label={`Rows whose state the rebuild changed${answered['restored_truncated'] === true ? ' (the first 200; the ledger keeps the whole list)' : ''}`} rows={arr(answered['restored'])}
              line={(r) => `${str(r['change'])}${r['from'] !== undefined ? ` from ${str(r['from'])}` : ''}${r['to'] !== undefined ? ` to ${str(r['to'])}` : ''}`} />
            <IdList label={`References that dangle after the removal (named, left in place)${answered['dangling_truncated'] === true ? ' (the first 200)' : ''}`} rows={arr(answered['dangling'])}
              line={(r) => `${str(r['kind'])}${r['dependent'] !== undefined ? ` of ${str(r['dependent'])}` : ''}${r['depends_on'] !== undefined ? ` on ${str(r['depends_on_kind'])} ${str(r['depends_on'])}` : ''}${r['subject_entity_id'] !== undefined ? ` on entity ${str(r['subject_entity_id'])}` : ''}`} />
          </>
        )}
        <Receipt receipt={pReceipt} />
        <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Projection events ({pevents.length})</h3>
        {pevents.length === 0 ? <Empty>No withdrawal, rebuild, restoration or refused rebuild has been recorded in this domain.</Empty> : (
          <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
            {pevents.map((e) => {
              const d = rec(e['details']);
              return (
                <li key={String(e['event_id'])}>
                  <Mono>{str(e['event'])}</Mono> {str(e['projection'])} {fmtInstant(e['occurred_at'])} — {str(d['reason'] ?? d['refusal'] ?? '')}
                  {d['by'] !== undefined ? ` (${str(d['by'])}${d['changed'] === false ? ', the state unchanged' : ''})` : ''}
                </li>
              );
            })}
          </ul>
        )}
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
          Each carries its class and the route it is sent down: <strong>unresolved</strong> work (a projection mismatch — the failed partition is
          withdrawn by the check itself) is re-checked at every re-drive and applied only when a check passes after the administrator's rebuild;
          a <strong>refused</strong> delivery is a governance answer
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
              <thead><tr><Th>Checked</Th><Th>Event</Th><Th>Mismatched rows</Th><Th>Missing</Th><Th>Unexpected</Th><Th>Representation</Th><Th>Withdrawn</Th><Th>Touched</Th></tr></thead>
              <tbody>
                {status.retrieval_checks.map((c) => {
                  // B20 (0080): the recorded `mismatched` is the SUM (drifted + missing + unexpected + an outdated representation); the per-projection rows carry each part.
                  const rows = arr(c['projections']);
                  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
                  const failed = rows.filter((r) => r['failed'] === true).map((r) => str(r['projection']));
                  return (
                    <tr key={String(c['check_id'])}>
                      <Td>{fmtInstant(c['checked_at'])}</Td>
                      <Td mono>{short(c['outbox_event_id'])}</Td>
                      <Td mono>{str(c['mismatched'])}</Td>
                      <Td mono>{rows.length === 0 ? '—' : sum('missing')}</Td>
                      <Td mono>{rows.length === 0 ? '—' : sum('unexpected')}</Td>
                      <Td>{rows.length === 0 ? '—' : rows.every((r) => r['representation_ok'] !== false) ? 'ok' : `outdated: ${rows.filter((r) => r['representation_ok'] === false).map((r) => str(r['projection'])).join(', ')}`}</Td>
                      <Td mono>{failed.length === 0 ? '—' : failed.join(', ')}</Td>
                      <Td>{(() => { const t = (c['touched'] ?? {}) as Record<string, unknown>; return `${str(t['event_type'])}/${str(t['change_kind'])}: ${['entities', 'edges', 'claims', 'evidence'].map((k) => `${k} ${Array.isArray(t[k]) ? (t[k] as unknown[]).length : 0}`).join(', ')}`; })()}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>
    </>
  );
}
