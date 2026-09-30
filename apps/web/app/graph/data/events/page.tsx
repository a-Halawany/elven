'use client';
/**
 * Event products and subscriptions — CP-6 B90 part `events` (0095 §E; F-P7-F-09's event half; V7 ch43 DP-43-001..006; DZ-16).
 *
 * THE EVENT PRODUCT: a released product of kind event with its event declaration — the versioned schema and its fields, the source ledger
 * (one of the platform's own), the subject kind, the ordering key, pull delivery, the retention and its floor instant, the replay policy —
 * its STREAM HEAD and the rows by kind, the latest lag observations. ITS SUBSCRIPTIONS (the owner's view): each consumer's purpose, grant,
 * state in words, checkpoint against the head, lag against the policy; the owner's (or the steward's) authorize / pause / resume / revoke,
 * each with a reason where the port asks one. MY SUBSCRIPTION (the consumer's own): register under the authority boundary (the fields, the
 * consequence class, the window, the lag policy, the capabilities), read the events served after the checkpoint (each payload projected by
 * the server), acknowledge through a sequence, declare conformance when paused or lagging, replay from a sequence with a reason.
 * Nothing here is computed on the client: every state, head, lag and served row is the server's, AS OF the instant the answer states.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { events, eventLine, grantLine, kindGlyph, lagLine, omittedLine, retentionLine, subscriptionStateMark, type EventProductView, type ReadResult, type SubscriptionView } from '../../../../lib/events-b90';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, Receipt } from '../../strategy/form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const CONSEQUENCES = ['C0', 'C1', 'C2', 'C3', 'C4'];
/** A datetime-local value → the instant (ISO-8601) the server takes; empty → null. */
const instantOf = (local: string): string | null => (local === '' ? null : new Date(local).toISOString());

export default function EventProductsPage() {
  const { scope, me } = useShell();
  const isSteward = me.bindings.some((b) => (b.roleCode === 'data_steward' || b.roleCode === 'domain_admin') && (b.domainId === me.homeDomainId || b.scope === 'PLATFORM'));
  const [products, setProducts] = useState<EventProductView[] | null>(null);
  const [productId, setProductId] = useState('');
  const [view, setView] = useState<EventProductView | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [mine, setMine] = useState<SubscriptionView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [lastRead, setLastRead] = useState<ReadResult | null>(null);
  // the owner's inputs
  const [ownerReason, setOwnerReason] = useState('');
  // the consumer's inputs
  const [purpose, setPurpose] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [consequence, setConsequence] = useState('C2');
  const [windowFrom, setWindowFrom] = useState(''); const [windowTo, setWindowTo] = useState('');
  const [maxLagEvents, setMaxLagEvents] = useState('2'); const [maxLagSeconds, setMaxLagSeconds] = useState('86400');
  const [handlesCorrections, setHandlesCorrections] = useState(true); const [handlesReplays, setHandlesReplays] = useState(true);
  const [ackSequence, setAckSequence] = useState('');
  const [conformNote, setConformNote] = useState('');
  const [replayFrom, setReplayFrom] = useState('0'); const [replayReason, setReplayReason] = useState('');

  const loadProducts = async () => {
    const r = await events.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the event products could not be read'); return; }
    setProducts(r.data.event_products);
    setProductId((prev) => (prev === '' ? (r.data?.event_products[0]?.product_id ?? '') : prev));
  };
  const loadView = async () => {
    if (productId === '') { setView(null); setMine(null); return; }
    const [v, m] = await Promise.all([events.read(scope, productId), events.mine(scope, productId)]);
    if (!v.ok || v.data === undefined) { setProblem(v.error?.message ?? 'the event product could not be read'); return; }
    setView(v.data.event_product); setAt(v.data.at);
    setFields((prev) => (prev.length === 0 ? v.data!.event_product.event.schema_fields : prev));
    // the consumer's own subscription on this product (the read is bounded to the reader's roles; a refusal simply leaves none)
    setMine(m.ok && m.data !== undefined ? (m.data.subscriptions[0] ?? null) : null);
  };
  useEffect(() => { void loadProducts(); }, [scope]);
  useEffect(() => { void loadView(); }, [scope, productId]);
  const reload = async () => { await loadProducts(); await loadView(); };
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await reload();
  };
  const ownerReasonOr = (): string => { if (ownerReason.trim().length < 8) throw new Error('a reason of 8+ characters is required'); return ownerReason.trim(); };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (products === null) return <Empty>reading the event products…</Empty>;
  const isOwner = view !== null && view.owner_principal_id === me.principalId;
  const mayGovern = isOwner || isSteward;
  const mark = mine === null ? null : subscriptionStateMark(mine.state, mine.paused_reason);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Event products</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        A released product of kind event streams one of the platform&apos;s own ledgers as a dense sequence; a consumer subscribes under the authority boundary
        (only the declared fields, purpose, window, tenant and consequence class); the owner authorizes, pauses, resumes and revokes; a subscription lagging
        beyond its policy is paused with its offset preserved until the consumer conforms and the owner resumes. Every state here is the server&apos;s, as of{' '}
        {at === null ? 'the read' : fmtInstant(at)}.
      </p>

      <label htmlFor="event-product">Event product</label>
      <select id="event-product" style={inputStyle} value={productId} onChange={(e) => { setProductId(e.target.value); setLastRead(null); setFields([]); }}>
        <option value="">— choose —</option>
        {products.map((x) => <option key={x.product_id} value={x.product_id}>{x.title} · {x.product_key} · {x.state} · schema {x.event.schema_version}</option>)}
      </select>

      {view === null ? <Empty>{products.length === 0 ? 'No event product is declared in this domain yet.' : 'Choose an event product.'}</Empty> : (
        <>
          <section aria-labelledby="ep-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="ep-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{view.title}</h2>
            <dl>
              <DefinitionRow term="Purpose · state">{view.purpose} · <span aria-label="product state">{view.state}{view.released_version !== null ? ` v${view.released_version}` : ''}</span></DefinitionRow>
              <DefinitionRow term="Owner"><Mono>{view.owner_principal_id.slice(0, 8)}…</Mono>{isOwner ? ' (you)' : ''}</DefinitionRow>
              <DefinitionRow term="Schema"><span aria-label="schema line">{view.event.schema_version} ({view.event.compatibility}) — fields {view.event.schema_fields.join(', ')}</span></DefinitionRow>
              <DefinitionRow term="Source ledger"><Mono>{view.event.source.ledger}</Mono>{view.event.source.kinds && view.event.source.kinds.length > 0 ? ` · ${view.event.source.kinds.join(', ')}` : ''} · since {fmtInstant(view.event.source.since ?? null)}{view.emits_corrections ? ' · carries corrections' : ''}</DefinitionRow>
              <DefinitionRow term="Subject · ordering key · delivery">{view.event.subject_kind} · {view.event.ordering_key} · {view.event.delivery}</DefinitionRow>
              <DefinitionRow term="Retention"><span aria-label="retention line">{retentionLine(view.event.retention_days, fmtInstant(view.retention_floor))}</span> · replay {view.event.replay_policy.allowed ? 'allowed' : 'not allowed'}</DefinitionRow>
              <DefinitionRow term="Stream head"><span aria-label="stream head">{view.head}</span> · {view.stream.within_retention} row(s) within retention of {view.stream.rows} · {Object.entries(view.stream.by_kind).map(([k, n]) => `${kindGlyph(k)} ${k} ${n}`).join(' · ') || 'no rows yet'}</DefinitionRow>
              <DefinitionRow term="Lag SLO (latest)">
                {view.slo.lag_events === undefined ? 'not yet observed' : <span aria-label="lag slo">{view.slo.lag_events.met ? '● met' : '✕ missed'} — {view.slo.lag_events.value} event(s) against {view.slo.lag_events.threshold ?? '—'} at {fmtInstant(view.slo.lag_events.observed_at)} ({view.slo.lag_events.source})</span>}
              </DefinitionRow>
            </dl>
          </section>

          <section aria-labelledby="subs-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="subs-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Subscriptions</h2>
            {mayGovern ? (
              <>
                <label htmlFor="owner-reason">Reason (for a pause or a revocation)</label>
                <input id="owner-reason" style={inputStyle} value={ownerReason} onChange={(e) => setOwnerReason(e.target.value)} placeholder="why the owner pauses or revokes (8+ characters)" />
              </>
            ) : null}
            {view.subscriptions.length === 0 ? <Empty>No subscription on this product yet.</Empty> : (
              <ul aria-label="subscriptions" style={{ paddingInlineStart: '1rem' }}>
                {view.subscriptions.map((s) => {
                  const m = subscriptionStateMark(s.state, s.paused_reason);
                  return (
                    <li key={s.subscription_id} style={{ marginBlockEnd: 'var(--eye-space-12)' }}>
                      <div>consumer <Mono>{s.consumer_principal_id.slice(0, 8)}…</Mono>{s.consumer_principal_id === me.principalId ? ' (you)' : ''} · {s.purpose} · schema {s.schema_version}</div>
                      <div aria-label="subscription state" style={{ color: `var(${m.token})` }}>{m.glyph} {m.text}</div>
                      <div aria-label="subscription lag">{lagLine({ checkpoint_sequence: s.checkpoint_sequence, head: view.head, lag_events: s.lag_events ?? Math.max(view.head - s.checkpoint_sequence, 0), lag_policy: s.lag_policy })}</div>
                      <div style={{ color: 'var(--eye-color-ink-muted)' }}>{grantLine(s.granted)} · corrections {s.handles_corrections ? 'handled' : 'NOT handled'} · replays {s.handles_replays ? 'handled' : 'NOT handled'}</div>
                      {s.pause_note !== null ? <div style={{ color: 'var(--eye-color-ink-muted)' }}>pause: {s.pause_note}{s.conformed_at !== null && s.paused_at !== null && s.conformed_at >= s.paused_at ? ' · conformance declared' : ''}</div> : null}
                      {s.revocation_reason !== null ? <div style={{ color: 'var(--eye-color-ink-muted)' }}>revoked: {s.revocation_reason}</div> : null}
                      {mayGovern ? (
                        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)' }}>
                          {s.state === 'registered' ? <GovernedButton label="Authorize" pendingLabel="Authorizing" onRun={run(() => events.authorize(scope, s.subscription_id))} /> : null}
                          {s.state === 'active' ? <GovernedButton label="Pause" pendingLabel="Pausing" variant="quiet" onRun={run(() => events.pause(scope, s.subscription_id, ownerReasonOr()))} /> : null}
                          {s.state === 'paused' || s.state === 'lagging' ? <GovernedButton label="Resume" pendingLabel="Resuming" onRun={run(() => events.resume(scope, s.subscription_id))} /> : null}
                          {s.state !== 'revoked' ? <GovernedButton label="Revoke" pendingLabel="Revoking" variant="critical" onRun={run(() => events.revoke(scope, s.subscription_id, ownerReasonOr()))} /> : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="mine-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="mine-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>My subscription</h2>
            {mine === null || mark === null ? (
              view.state !== 'released' && view.state !== 'degraded' ? <Empty>The product is {view.state}; a subscription is registered on a released event product.</Empty> : (
                <form onSubmit={(e) => e.preventDefault()} aria-label="register subscription">
                  <label htmlFor="sub-purpose">Purpose (one of the product&apos;s policy purposes)</label>
                  <input id="sub-purpose" style={inputStyle} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={String(((view.declaration?.['policy'] as Record<string, unknown> | undefined)?.['purposes'] as string[] | undefined)?.join(', ') ?? 'purpose')} />
                  <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-12)' }}>
                    <legend>Fields granted (a subset of the schema&apos;s)</legend>
                    {view.event.schema_fields.map((f) => (
                      <label key={f} style={{ display: 'inline-flex', gap: 'var(--eye-space-4)', marginInlineEnd: 'var(--eye-space-12)' }}>
                        <input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)))} />{f}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor="sub-consequence">Consequence class</label>
                  <select id="sub-consequence" style={inputStyle} value={consequence} onChange={(e) => setConsequence(e.target.value)}>{CONSEQUENCES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <label htmlFor="sub-from">Window from</label>
                  <input id="sub-from" type="datetime-local" style={inputStyle} value={windowFrom} onChange={(e) => setWindowFrom(e.target.value)} />
                  <label htmlFor="sub-to">Window to</label>
                  <input id="sub-to" type="datetime-local" style={inputStyle} value={windowTo} onChange={(e) => setWindowTo(e.target.value)} />
                  <label htmlFor="sub-lag-events">Max lag (events)</label>
                  <input id="sub-lag-events" style={inputStyle} inputMode="numeric" value={maxLagEvents} onChange={(e) => setMaxLagEvents(e.target.value)} />
                  <label htmlFor="sub-lag-seconds">Max lag (seconds)</label>
                  <input id="sub-lag-seconds" style={inputStyle} inputMode="numeric" value={maxLagSeconds} onChange={(e) => setMaxLagSeconds(e.target.value)} />
                  <label style={{ display: 'block' }}><input type="checkbox" checked={handlesCorrections} onChange={(e) => setHandlesCorrections(e.target.checked)} /> I can process corrections</label>
                  <label style={{ display: 'block', marginBlockEnd: 'var(--eye-space-12)' }}><input type="checkbox" checked={handlesReplays} onChange={(e) => setHandlesReplays(e.target.checked)} /> I can process replays</label>
                  <GovernedButton label="Register subscription" pendingLabel="Registering" onRun={run(() => events.register(scope, {
                    productId: view.product_id, purpose: purpose.trim(), granted: { fields, consequence, from: instantOf(windowFrom), to: instantOf(windowTo) }, schemaVersion: view.event.schema_version,
                    lagPolicy: { max_lag_events: Number(maxLagEvents), max_lag_seconds: Number(maxLagSeconds) }, handlesCorrections, handlesReplays,
                  }))} />
                </form>
              )
            ) : (
              <>
                <dl>
                  <DefinitionRow term="State"><span aria-label="my subscription state" style={{ color: `var(${mark.token})` }}>{mark.glyph} {mark.text}</span></DefinitionRow>
                  <DefinitionRow term="Checkpoint · lag"><span aria-label="my lag">{lagLine({ checkpoint_sequence: mine.checkpoint_sequence, head: mine.head, lag_events: mine.lag_events, lag_policy: mine.lag_policy })}</span></DefinitionRow>
                  <DefinitionRow term="Grant">{grantLine(mine.granted)}</DefinitionRow>
                  <DefinitionRow term="Purpose · schema">{mine.purpose} · {mine.schema_version}</DefinitionRow>
                  {mine.pause_note !== null ? <DefinitionRow term="Pause">{mine.pause_note}</DefinitionRow> : null}
                  {mine.replays.length > 0 ? <DefinitionRow term="Replays">{mine.replays.map((r) => `${r.from_sequence} → ${r.to_sequence} (${r.reason})`).join(' · ')}</DefinitionRow> : null}
                </dl>
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
                  <GovernedButton label="Read events" pendingLabel="Reading" onRun={async () => {
                    const r = await events.readEvents(scope, mine.subscription_id, null);
                    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the read was refused');
                    setLastRead(r.data.read); setReceipt(r.data.receipt); setAckSequence(String(r.data.read.next_after));
                  }} />
                  <div>
                    <label htmlFor="ack-seq">Acknowledge through</label>
                    <input id="ack-seq" style={inputStyle} inputMode="numeric" value={ackSequence} onChange={(e) => setAckSequence(e.target.value)} />
                  </div>
                  <GovernedButton label="Acknowledge" pendingLabel="Acknowledging" variant="quiet" disabled={mine.state !== 'active' && mine.state !== 'lagging'} onRun={run(() => events.checkpoint(scope, mine.subscription_id, Number(ackSequence)))} />
                </div>
                {mine.state === 'paused' || mine.state === 'lagging' ? (
                  <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                    <label htmlFor="conform-note">Conformance note</label>
                    <input id="conform-note" style={inputStyle} value={conformNote} onChange={(e) => setConformNote(e.target.value)} placeholder="caught up and able to process" />
                    <GovernedButton label="Declare conformance" pendingLabel="Declaring" onRun={run(() => events.conform(scope, mine.subscription_id, {
                      caught_up: true, can_process: true, ...(conformNote.trim() ? { note: conformNote.trim() } : {}), ...(mine.paused_reason === 'schema' ? { schema_version: mine.product.schema_version } : {}),
                    }))} />
                  </div>
                ) : null}
                {mine.state === 'active' && mine.handles_replays ? (
                  <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                    <label htmlFor="replay-from">Replay from sequence</label>
                    <input id="replay-from" style={inputStyle} inputMode="numeric" value={replayFrom} onChange={(e) => setReplayFrom(e.target.value)} />
                    <label htmlFor="replay-reason">Replay reason</label>
                    <input id="replay-reason" style={inputStyle} value={replayReason} onChange={(e) => setReplayReason(e.target.value)} />
                    <GovernedButton label="Replay" pendingLabel="Replaying" variant="quiet" onRun={run(() => events.replay(scope, mine.subscription_id, Number(replayFrom), replayReason.trim()))} />
                  </div>
                ) : null}
                {lastRead !== null ? (
                  <section aria-labelledby="served-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
                    <h3 id="served-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Events served</h3>
                    <p style={{ color: 'var(--eye-color-ink-muted)' }}>
                      <span aria-label="served line">{lastRead.served} served after {lastRead.after} (next after {lastRead.next_after}) · head {lastRead.head} · checkpoint {lastRead.checkpoint}</span>
                      {omittedLine(lastRead) !== null ? <> · <span aria-label="omitted line">{omittedLine(lastRead)}</span></> : null}
                    </p>
                    {lastRead.events.length === 0 ? <Empty>Nothing to serve after the checkpoint within the window and the retention.</Empty> : (
                      <ul aria-label="served events" style={{ paddingInlineStart: '1rem' }}>
                        {lastRead.events.map((e) => (
                          <li key={e.sequence}>
                            <div>{eventLine(e)}</div>
                            <div style={{ color: 'var(--eye-color-ink-muted)' }}>subject <Mono>{e.subject_id.slice(0, 8)}…</Mono> ({e.subject_kind}) · key {e.ordering_key ?? '—'} · schema {e.schema_version}</div>
                            <pre style={{ margin: 0, fontSize: 'var(--eye-type-body-sm)', whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.payload)}</pre>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
      <Receipt receipt={receipt} />
    </>
  );
}
