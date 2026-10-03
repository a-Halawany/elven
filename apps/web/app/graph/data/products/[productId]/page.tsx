'use client';
/**
 * A data product's page (CP-6 B90 part `products`, 0095 §0 + §R; F-P7-F-09; DP-05-006, DP-41-002/-005/-006).
 *
 * THE PRODUCT: its identity, owner, state and declaration digest. THE SCORECARD (the schedule's, never computed on read): the verdict
 * with its reasons, the SLO attainment per measure against the declared floor, the reviews, the consumers, the contract tests, lineage
 * and policy closure, the latest cost. THE LEDGERS: versions, reviews, consumers, contract tests, SLO observations, cost, events.
 * THE ACTS — each the person's own: the owner releases a reviewed version, degrades (with a reason), restores (through evidence),
 * withdraws (with a reason; the last released version stays valid), retires (no accepted consumer, a retirement review); the steward
 * reviews, degrades and computes; a CONSUMER registers itself and ACCEPTS the contract — nobody accepts for it. Every state here is the
 * server's, as of the instant the answer states; a DATE (a cost period) renders as the day it names; an instant through fmtInstant.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { products, actsOf, attainmentLine, costLine, CONSUMER_STATE_LABEL, OVERALL_LABEL, STATE_LABEL, short, type ProductView, type ReviewKind, type ScorecardView } from '../../../../../lib/products-b90';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, GovernedButton, fmtInstant } from '../../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../strategy/form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const h2 = { fontSize: 'var(--eye-type-heading-2)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;

export default function ProductPage() {
  const { scope, me } = useShell();
  const params = useParams<{ productId: string }>();
  const productId = params.productId;
  const [at, setAt] = useState('');
  const [product, setProduct] = useState<ProductView | null>(null);
  const [card, setCard] = useState<ScorecardView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the acts' inputs
  const [reason, setReason] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [reviewVersion, setReviewVersion] = useState(''); const [reviewKind, setReviewKind] = useState<ReviewKind>('admission'); const [reviewOutcome, setReviewOutcome] = useState('accepted'); const [reviewNotes, setReviewNotes] = useState('');
  const [consumerPurpose, setConsumerPurpose] = useState(''); const [consumerImpact, setConsumerImpact] = useState('');
  const [testVersion, setTestVersion] = useState(''); const [testOutcome, setTestOutcome] = useState<'pass' | 'fail'>('pass');
  const [periodStart, setPeriodStart] = useState(''); const [periodEnd, setPeriodEnd] = useState(''); const [amount, setAmount] = useState(''); const [currency, setCurrency] = useState('EUR'); const [basis, setBasis] = useState('');
  const [declaration, setDeclaration] = useState('');

  const load = async () => {
    const r = await products.view(scope, productId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the product could not be read'); return; }
    setProduct(r.data.product); setCard(r.data.scorecard); setAt(r.data.at); setProblem(null);
    setReleaseVersion((prev) => (prev === '' ? String(r.data!.product.current_version) : prev));
    setReviewVersion((prev) => (prev === '' ? String(r.data!.product.current_version) : prev));
    setTestVersion((prev) => (prev === '' ? String(r.data!.product.released_version ?? r.data!.product.current_version) : prev));
  };
  useEffect(() => { void load(); }, [scope, productId]);
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await load();
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (product === null || card === null) return <Empty>reading the product…</Empty>;

  const isOwner = product.owner_principal_id === me.principalId;
  const isSteward = me.bindings.some((b) => ['platform_admin', 'domain_admin', 'data_steward'].includes(b.roleCode));
  const isReviewer = !isOwner && me.bindings.some((b) => ['platform_admin', 'domain_admin', 'data_steward', 'executive'].includes(b.roleCode));
  const mine = card.consumers.filter((c) => c.consumer_principal_id === me.principalId);
  const myLive = mine.find((c) => c.state === 'registered' || c.state === 'accepted') ?? null;
  const acts = actsOf(product.state);
  const s = card.scorecard;
  const reasonOk = reason.trim().length >= 8;

  return (
    <>
      <p><Link href="/graph/data/products">← Data products</Link></p>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{product.title}</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>Every state here is the server&apos;s, as of {fmtInstant(at)}.</p>

      <section aria-labelledby="product-h" style={cardStyle}>
        <h2 id="product-h" style={{ ...h2, marginBlockStart: 0 }}>The product</h2>
        <dl>
          <DefinitionRow term="Key · kind"><Mono>{product.product_key}</Mono> · {product.kind}</DefinitionRow>
          <DefinitionRow term="Purpose">{product.purpose}</DefinitionRow>
          <DefinitionRow term="State"><span aria-label="product state">{STATE_LABEL[product.state]}</span></DefinitionRow>
          <DefinitionRow term="Owner"><Mono>{short(product.owner_principal_id)}</Mono>{isOwner ? ' (you)' : ''} · registered by <Mono>{short(product.registered_by)}</Mono> at {fmtInstant(product.registered_at)}</DefinitionRow>
          <DefinitionRow term="Versions">{product.released_version === null ? 'none released' : `v${product.released_version} released`}{product.current_version > (product.released_version ?? 0) ? ` · v${product.current_version} declared, not released` : ''}{product.declaration_digest ? <> · digest <Mono>{product.declaration_digest.slice(0, 16)}…</Mono></> : null}</DefinitionRow>
          {product.state === 'degraded' ? <DefinitionRow term="Degraded"><span aria-label="degradation">{product.degraded_reason} — at {fmtInstant(product.degraded_at)}</span></DefinitionRow> : null}
          {product.withdrawn_at !== null ? <DefinitionRow term="Withdrawn"><span aria-label="withdrawal">{product.withdrawal_reason} — by <Mono>{short(product.withdrawn_by)}</Mono> at {fmtInstant(product.withdrawn_at)}; the last valid version is v{product.released_version}</span></DefinitionRow> : null}
          {product.retired_at !== null ? <DefinitionRow term="Retired">by <Mono>{short(product.retired_by)}</Mono> at {fmtInstant(product.retired_at)}</DefinitionRow> : null}
        </dl>
        <p aria-label="authority banner" style={{ color: 'var(--eye-color-ink-muted)' }}>
          {acts.length === 0 ? 'Next: nothing — the product is retired.' : `Next: ${acts.map((a) => `${a.act} (${a.by})`).join('; ')}.`}
        </p>
      </section>

      <h2 style={h2}>Scorecard</h2>
      {s === null ? <Empty>No scorecard yet — the schedule computes one per tick on a released product; the owner or the steward may compute one now.</Empty> : (
        <section aria-labelledby="scorecard-h" style={cardStyle}>
          <h3 id="scorecard-h" style={{ ...h3, marginBlockStart: 0 }}><span aria-label="scorecard verdict">{OVERALL_LABEL[s.overall]}</span></h3>
          <dl>
            <DefinitionRow term="Computed">{fmtInstant(s.computed_at)} by <Mono>{short(s.computed_by)}</Mono> · window {s.window_days} day(s) · the product stood {s.state_at} · digest <Mono>{s.digest.slice(0, 16)}…</Mono></DefinitionRow>
            <DefinitionRow term="SLO"><span aria-label="attainment line">{attainmentLine(s)}</span></DefinitionRow>
            <DefinitionRow term="Reviews">{Object.keys(s.reviews).length === 0 ? 'none' : Object.entries(s.reviews).map(([k, v]) => `${k}: ${v.outcome} (v${v.version}, ${fmtInstant(v.reviewed_at)})`).join(' · ')}</DefinitionRow>
            <DefinitionRow term="Consumers">{s.consumers.accepted} accepted · {s.consumers.registered} registered · {s.consumers.revoked} revoked · {s.consumers.migrated} migrated</DefinitionRow>
            <DefinitionRow term="Contract tests">{s.contract_tests.pass} pass · {s.contract_tests.fail} fail on v{s.contract_tests.version ?? '—'}</DefinitionRow>
            <DefinitionRow term="Closure">lineage {s.lineage_closed ? 'closed' : 'OPEN'} · policy {s.policy_closed ? 'closed' : 'OPEN'}</DefinitionRow>
            <DefinitionRow term="Cost">{s.cost === null ? 'no attribution' : costLine(s.cost)}</DefinitionRow>
          </dl>
          {s.reasons.length > 0 ? <ul aria-label="scorecard reasons" style={{ paddingInlineStart: '1rem' }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
          {Object.keys(s.slo).length > 0 ? (
            <table style={tableStyle} aria-label="slo measures">
              <thead><tr><Th>Measure</Th><Th>Observations</Th><Th>Met</Th><Th>Attainment</Th><Th>Last value</Th><Th>Threshold</Th><Th>Last observed</Th></tr></thead>
              <tbody>{Object.entries(s.slo).map(([m, v]) => <tr key={m}><Td mono>{m}</Td><Td>{v.observations}</Td><Td>{v.met}</Td><Td>{v.attainment_pct}%</Td><Td>{v.last_value}</Td><Td>{v.threshold ?? '—'}</Td><Td>{fmtInstant(v.last_observed_at)}</Td></tr>)}</tbody>
            </table>
          ) : null}
        </section>
      )}
      {card.scorecards.length > 1 ? (
        <ul aria-label="scorecard history" style={{ paddingInlineStart: '1rem' }}>
          {card.scorecards.map((x) => <li key={x.scorecard_id}>{fmtInstant(x.computed_at)}: {x.overall} · {x.attainment_pct === null ? 'attainment unknown' : `${x.attainment_pct}% vs ${x.floor_pct}%${x.below_floor ? ' (under)' : ''}`} · by <Mono>{short(x.computed_by)}</Mono></li>)}
        </ul>
      ) : null}
      {(isOwner || isSteward) && (product.state === 'released' || product.state === 'degraded') ? (
        <div><GovernedButton label="Compute scorecard now" pendingLabel="computing" variant="quiet" onRun={run(() => products.compute(scope, productId))} /></div>
      ) : null}

      {(isOwner || isSteward) && product.state !== 'retired' ? (
        <section aria-labelledby="acts-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="acts-h" style={{ ...h2, marginBlockStart: 0 }}>{isOwner ? 'Your acts as the owner' : 'Your acts as a steward'}</h2>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
            <label htmlFor="reason">Reason (every act says why; 8 characters or more)</label>
            <input id="reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
            {isOwner && product.state !== 'withdrawn' ? (
              <>
                <label htmlFor="release-version">Version to release (declared and reviewed; newer than the released one)</label>
                <select id="release-version" style={inputStyle} value={releaseVersion} onChange={(e) => setReleaseVersion(e.target.value)}>
                  {product.versions.map((v) => <option key={v.version} value={String(v.version)}>v{v.version}{v.released_at === null ? '' : ' (released)'}</option>)}
                </select>
              </>
            ) : null}
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
              {isOwner && product.state !== 'withdrawn' ? <GovernedButton label="Release version" pendingLabel="releasing" disabled={releaseVersion === ''} onRun={run(() => products.release(scope, productId, Number(releaseVersion)))} /> : null}
              {product.state === 'released' ? <GovernedButton label="Degrade" pendingLabel="degrading" variant="critical" disabled={!reasonOk} onRun={run(() => products.degrade(scope, productId, reason))} /> : null}
              {isOwner && product.state === 'degraded' ? <GovernedButton label="Restore" pendingLabel="restoring" disabled={!reasonOk} onRun={run(() => products.restore(scope, productId, reason))} /> : null}
              {isOwner && (product.state === 'released' || product.state === 'degraded') ? <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={!reasonOk} onRun={run(() => products.withdraw(scope, productId, reason))} /> : null}
              {isOwner ? <GovernedButton label="Retire" pendingLabel="retiring" variant="critical" onRun={run(() => products.retire(scope, productId))} /> : null}
            </div>
            {product.state !== 'withdrawn' ? (
              <>
                <label htmlFor="declaration">Declare a version (JSON: contract, serving_modes, inputs, outputs, slo, policy, cost, quality)</label>
                <textarea id="declaration" style={{ ...inputStyle, minBlockSize: '6rem', fontFamily: 'var(--eye-font-mono)' }} value={declaration} onChange={(e) => setDeclaration(e.target.value)} />
                <div><GovernedButton label="Declare version" pendingLabel="declaring" variant="quiet" disabled={declaration.trim() === ''} onRun={run(() => products.declare(scope, productId, JSON.parse(declaration) as Record<string, unknown>))} /></div>
              </>
            ) : null}
            <label htmlFor="cost-start">Cost period start (a day)</label>
            <input id="cost-start" type="date" style={inputStyle} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            <label htmlFor="cost-end">Cost period end (a later day)</label>
            <input id="cost-end" type="date" style={inputStyle} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            <label htmlFor="cost-amount">Amount (a decimal string with at most two places)</label>
            <input id="cost-amount" style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <label htmlFor="cost-currency">Currency (ISO-4217)</label>
            <input id="cost-currency" style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)} />
            <label htmlFor="cost-basis">Basis</label>
            <input id="cost-basis" style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value)} />
            <div><GovernedButton label="Attribute cost" pendingLabel="attributing" variant="quiet" disabled={periodStart === '' || periodEnd === '' || !/^\d{1,16}(\.\d{1,2})?$/.test(amount) || basis.trim().length < 2}
              onRun={run(() => products.cost(scope, productId, { periodStart, periodEnd, amount, currency: currency.trim().toUpperCase(), basis: basis.trim() }))} /></div>
          </div>
        </section>
      ) : null}

      {isReviewer && product.versions.length > 0 && product.state !== 'retired' ? (
        <section aria-labelledby="review-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="review-h" style={{ ...h2, marginBlockStart: 0 }}>Record a review (you are not the owner)</h2>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
            <label htmlFor="review-version">Version</label>
            <select id="review-version" style={inputStyle} value={reviewVersion} onChange={(e) => setReviewVersion(e.target.value)}>{product.versions.map((v) => <option key={v.version} value={String(v.version)}>v{v.version}</option>)}</select>
            <label htmlFor="review-kind">Kind</label>
            <select id="review-kind" style={inputStyle} value={reviewKind} onChange={(e) => setReviewKind(e.target.value as ReviewKind)}><option value="admission">admission</option><option value="domain">domain</option><option value="retirement">retirement</option></select>
            <label htmlFor="review-outcome">Outcome</label>
            <select id="review-outcome" style={inputStyle} value={reviewOutcome} onChange={(e) => setReviewOutcome(e.target.value)}><option value="accepted">accepted</option><option value="rejected">rejected</option><option value="deferred">deferred</option></select>
            <label htmlFor="review-notes">Notes (8 characters or more)</label>
            <input id="review-notes" style={inputStyle} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
            <div><GovernedButton label="Record review" pendingLabel="recording" disabled={reviewVersion === '' || reviewNotes.trim().length < 8}
              onRun={run(() => products.review(scope, productId, { version: Number(reviewVersion), kind: reviewKind, outcome: reviewOutcome, notes: reviewNotes.trim() }))} /></div>
          </div>
        </section>
      ) : null}

      <h2 style={h2}>Consumers</h2>
      {card.consumers.length === 0 ? <Empty>No consumer is registered on this product.</Empty> : (
        <table style={tableStyle} aria-label="consumers">
          <thead><tr><Th>Consumer</Th><Th>State</Th><Th>Contract</Th><Th>Purpose · impact</Th><Th>Since</Th></tr></thead>
          <tbody>
            {card.consumers.map((c) => (
              <tr key={c.consumer_id}>
                <Td mono>{short(c.consumer_principal_id)}{c.consumer_principal_id === me.principalId ? ' (you)' : ''}</Td>
                <Td><span aria-label="consumer state">{CONSUMER_STATE_LABEL[c.state]}</span>{c.state === 'revoked' ? ` — ${c.revocation_reason}` : ''}</Td>
                <Td>v{c.contract_version}</Td>
                <Td>{c.purpose}{c.impact ? ` · impact: ${c.impact}` : ''}</Td>
                <Td>{fmtInstant(c.registered_at)}{c.accepted_at ? ` · accepted ${fmtInstant(c.accepted_at)}` : ''}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(product.state === 'released' || product.state === 'degraded') ? (
        <section aria-labelledby="consumer-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h3 id="consumer-h" style={{ ...h3, marginBlockStart: 0 }}>{myLive === null ? 'Register yourself as a consumer' : myLive.state === 'registered' ? 'Accept the contract (your own act)' : 'Your registration'}</h3>
          {myLive === null ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <label htmlFor="consumer-purpose">Purpose (8 characters or more)</label>
              <input id="consumer-purpose" style={inputStyle} value={consumerPurpose} onChange={(e) => setConsumerPurpose(e.target.value)} />
              <label htmlFor="consumer-impact">Downstream impact when this product breaks</label>
              <input id="consumer-impact" style={inputStyle} value={consumerImpact} onChange={(e) => setConsumerImpact(e.target.value)} />
              <div><GovernedButton label="Register as consumer" pendingLabel="registering" disabled={consumerPurpose.trim().length < 8}
                onRun={run(() => products.registerConsumer(scope, productId, { purpose: consumerPurpose.trim(), ...(consumerImpact.trim() === '' ? {} : { impact: consumerImpact.trim() }) }))} /></div>
            </div>
          ) : myLive.state === 'registered' ? (
            <div><GovernedButton label={`Accept contract v${product.released_version ?? ''}`} pendingLabel="accepting" disabled={product.released_version === null}
              onRun={run(() => products.accept(scope, productId, myLive.consumer_id, product.released_version ?? 0))} /></div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <p>You accepted v{myLive.contract_version}.{product.released_version !== null && product.released_version > myLive.contract_version ? ` v${product.released_version} is released: record a passing contract test on it, then migrate.` : ''}</p>
              <label htmlFor="test-version">Contract test — version</label>
              <select id="test-version" style={inputStyle} value={testVersion} onChange={(e) => setTestVersion(e.target.value)}>{product.versions.map((v) => <option key={v.version} value={String(v.version)}>v{v.version}</option>)}</select>
              <label htmlFor="test-outcome">Outcome</label>
              <select id="test-outcome" style={inputStyle} value={testOutcome} onChange={(e) => setTestOutcome(e.target.value as 'pass' | 'fail')}><option value="pass">pass</option><option value="fail">fail</option></select>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                <GovernedButton label="Record contract test" pendingLabel="recording" variant="quiet" disabled={testVersion === ''} onRun={run(() => products.contractTest(scope, productId, myLive.consumer_id, { version: Number(testVersion), outcome: testOutcome }))} />
                {product.released_version !== null && product.released_version > myLive.contract_version ? <GovernedButton label={`Migrate to v${product.released_version}`} pendingLabel="migrating" onRun={run(() => products.migrate(scope, productId, myLive.consumer_id, product.released_version ?? 0))} /> : null}
                <GovernedButton label="Revoke my registration" pendingLabel="revoking" variant="critical" disabled={!reasonOk} onRun={run(() => products.revokeConsumer(scope, productId, myLive.consumer_id, reason))} />
              </div>
              {!reasonOk ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>A revocation needs the reason field above (8 characters or more).</span> : null}
            </div>
          )}
        </section>
      ) : null}

      <h2 style={h2}>Versions and reviews</h2>
      {product.versions.length === 0 ? <Empty>No version is declared.</Empty> : (
        <ul aria-label="versions" style={{ paddingInlineStart: '1rem' }}>
          {product.versions.map((v) => <li key={v.version}>v{v.version} — digest <Mono>{v.digest.slice(0, 16)}…</Mono> · declared by <Mono>{short(v.declared_by)}</Mono> at {fmtInstant(v.declared_at)}{v.released_at === null ? ' · not released' : <> · RELEASED by <Mono>{short(v.released_by)}</Mono> at {fmtInstant(v.released_at)}</>}</li>)}
        </ul>
      )}
      {product.reviews.length === 0 ? <Empty>No review is recorded.</Empty> : (
        <ul aria-label="reviews" style={{ paddingInlineStart: '1rem' }}>
          {product.reviews.map((r) => <li key={r.review_id}>{r.kind} review of v{r.version}: <strong>{r.outcome}</strong> by <Mono>{short(r.reviewer_principal_id)}</Mono> at {fmtInstant(r.reviewed_at)} — {r.notes}</li>)}
        </ul>
      )}

      <h2 style={h2}>Contract tests</h2>
      {card.contract_tests.length === 0 ? <Empty>No contract test is recorded.</Empty> : (
        <ul aria-label="contract tests" style={{ paddingInlineStart: '1rem' }}>
          {card.contract_tests.map((t) => <li key={t.test_id}>v{t.version}: <strong>{t.outcome}</strong> by consumer <Mono>{short(t.consumer_id)}</Mono>, recorded by <Mono>{short(t.recorded_by)}</Mono> at {fmtInstant(t.recorded_at)}</li>)}
        </ul>
      )}

      <h2 style={h2}>SLO observations</h2>
      {card.observations.length === 0 ? <Empty>Nothing has been observed on this product.</Empty> : (
        <table style={tableStyle} aria-label="slo observations">
          <thead><tr><Th>Measure</Th><Th>Value</Th><Th>Threshold</Th><Th>Met</Th><Th>Source</Th><Th>Observed</Th></tr></thead>
          <tbody>{card.observations.map((o) => <tr key={o.observation_id}><Td mono>{o.measure}</Td><Td>{o.value}</Td><Td>{o.threshold ?? '—'}</Td><Td>{o.met ? 'met' : 'MISSED'}</Td><Td>{o.source}</Td><Td>{fmtInstant(o.observed_at)}</Td></tr>)}</tbody>
        </table>
      )}

      <h2 style={h2}>Cost</h2>
      {card.cost.length === 0 ? <Empty>No cost is attributed.</Empty> : (
        <ul aria-label="cost attributions" style={{ paddingInlineStart: '1rem' }}>
          {card.cost.map((c) => <li key={c.attribution_id}>{costLine(c)} · by <Mono>{short(c.attributed_by)}</Mono> at {fmtInstant(c.attributed_at)}</li>)}
        </ul>
      )}

      <h2 style={h2}>Events</h2>
      {card.events.length === 0 ? <Empty>No event.</Empty> : (
        <ul aria-label="product events" style={{ paddingInlineStart: '1rem' }}>
          {card.events.map((e) => <li key={e.event_id}><Mono>{e.event}</Mono> at {fmtInstant(e.occurred_at)} by <Mono>{short(e.actor_principal_id)}</Mono>{typeof e.details['reason'] === 'string' ? ` — ${String(e.details['reason'])}` : ''}{typeof e.details['overall'] === 'string' ? ` — ${String(e.details['overall'])}` : ''}</li>)}
        </ul>
      )}
      <Receipt receipt={receipt} />
    </>
  );
}
