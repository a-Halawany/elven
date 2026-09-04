'use client';
/**
 * The Intelligence overview.
 *
 * Every count that describes extracted output is split by MODE. A single "claims:
 * 118" would hide the only thing a reader needs to know first — whether a model
 * actually ran, or whether a recorded response answered for it.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from './layout';
import { intelligence, type IntelligenceOverview } from '../../lib/intelligence';
import { cardStyle, Empty, LiveStatus, Mono, UnknownNote } from '../../components/observation';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div style={{ ...cardStyle, minInlineSize: '10rem' }}>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--eye-type-heading-2)', fontWeight: 650 }}>{value}</div>
      {hint === undefined ? null : (
        <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{hint}</div>
      )}
    </div>
  );
}

export default function IntelligenceOverviewPage() {
  const { scope } = useShell();
  const [ov, setOv] = useState<IntelligenceOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await intelligence.overview(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the overview could not be read');
        return;
      }
      setOv(r.data.overview);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (ov === null) return <Empty>reading the intelligence state…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Intelligence</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', maxInlineSize: '60ch' }}>
        Extraction turns preserved evidence into attributable claims. Every claim carries the method,
        the model and its weights digest, the prompt version, the decoding configuration, the{' '}
        <strong>mode</strong> it ran in, and the exact evidence bytes it rests on.
      </p>

      <section aria-labelledby="claims-h" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="claims-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Claims</h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
          <Stat label="claims" value={ov.claims.total} />
          <Stat label="from recorded responses" value={ov.claims.replay} hint="mode: replay" />
          <Stat label="from a local model" value={ov.claims.liveLocal} hint="mode: local-live" />
        </div>
        {ov.claims.liveLocal === 0 && ov.claims.total > 0 ? (
          <UnknownNote>
            Every claim here was produced in <strong>replay</strong>: a response recorded earlier
            answered the request, and no model executed for it. That is what makes the demonstration
            reproducible, and it is not the same as a model having run.
          </UnknownNote>
        ) : null}
      </section>

      <section aria-labelledby="review-h" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="review-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Review</h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
          <Stat label="queued" value={ov.review.queued} />
          <Stat label="abstentions" value={ov.review.abstentions} hint="the model declined" />
          <Stat label="decided" value={ov.review.decided} />
        </div>
        <p style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <Link href="/intelligence/review">Open the review queue →</Link>
        </p>
      </section>

      <section aria-labelledby="gw-h" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="gw-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Model gateway</h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
          <Stat label="calls" value={ov.gateway.calls} />
          <Stat label="replay" value={ov.gateway.replay} />
          <Stat label="local-live" value={ov.gateway.liveLocal} />
          <Stat label="abstained" value={ov.gateway.abstained} />
          <Stat label="refused" value={ov.gateway.refused} hint="did not match the contract" />
          <Stat label="failed" value={ov.gateway.failed} />
        </div>
      </section>

      <section aria-labelledby="m-h" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="m-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Methods and runs</h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
          <Stat label="methods" value={ov.methods.total} />
          <Stat label="active" value={ov.methods.active} />
          <Stat label="draft" value={ov.methods.draft} />
          <Stat label="runs" value={ov.runs.total} hint={`replay ${ov.runs.replay} · local-live ${ov.runs.liveLocal}`} />
        </div>
        <p style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <Link href="/intelligence/methods">Methods registry →</Link>{' · '}
          <Link href="/intelligence/gateway">Gateway <Mono>calls</Mono> →</Link>
        </p>
      </section>
    </>
  );
}
