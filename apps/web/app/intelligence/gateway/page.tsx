'use client';
/**
 * The model gateway view.
 *
 * Every model call the platform has made, with the mode it ran in and what came
 * back. A recorded response and a live one look DIFFERENT here on purpose: the
 * whole point of the gateway is that a reader can tell which they are looking at.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { intelligence, type GatewayCall } from '../../../lib/intelligence';
import { Empty, LiveStatus, Mono, ModeBadge, UnknownNote, fmtInstant } from '../../../components/observation';

function Outcome({ outcome }: { outcome: GatewayCall['outcome'] }) {
  const glyph = outcome === 'completed' ? '✓' : outcome === 'abstained' ? '⊘'
    : outcome === 'refused' ? '✕' : '!';
  return (
    <span style={{ display: 'inline-flex', gap: '0.35rem' }}>
      <span aria-hidden="true">{glyph}</span><span>{outcome}</span>
    </span>
  );
}

export default function GatewayPage() {
  const { scope } = useShell();
  const [calls, setCalls] = useState<GatewayCall[] | null>(null);
  const [recorded, setRecorded] = useState<Array<Record<string, string>>>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await intelligence.gatewayCalls(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the gateway log could not be read');
        return;
      }
      setCalls(r.data.calls);
      setRecorded(r.data.recorded as unknown as Array<Record<string, string>>);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (calls === null) return <Empty>reading the gateway log…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Model gateway</h1>
      <UnknownNote>
        Two modes, and they are never conflated. <strong>replay</strong> answers from a response
        recorded earlier for exactly this request — no model executes. <strong>local-live</strong> runs
        a local open-weights model over loopback. No hosted model API is used in this phase, and a
        replay miss fails rather than quietly becoming a live call.
      </UnknownNote>

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Calls</h2>
      {calls.length === 0 ? <Empty>No model call has been made.</Empty> : (
        <table className="eye-table" style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th scope="col">When</th><th scope="col">Mode</th><th scope="col">Outcome</th>
              <th scope="col">Model</th><th scope="col">Prompt</th>
              <th scope="col">Request digest</th><th scope="col">Latency</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.call_id}>
                <td data-label="When">{fmtInstant(c.occurred_at)}</td>
                <td data-label="Mode"><ModeBadge mode={c.mode} /></td>
                <td data-label="Outcome"><Outcome outcome={c.outcome} /></td>
                <td data-label="Model"><Mono>{c.model_id}</Mono></td>
                <td data-label="Prompt"><Mono>{c.prompt_version}</Mono></td>
                <td data-label="Request digest">
                  <Mono title={c.request_digest}>{c.request_digest.slice(0, 16)}…</Mono>
                </td>
                <td data-label="Latency"><Mono>{c.latency_ms} ms</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 'var(--eye-space-24)' }}>
        Recorded responses
      </h2>
      {recorded.length === 0 ? <Empty>No response is recorded.</Empty> : (
        <table className="eye-table" style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th scope="col">Request digest</th><th scope="col">Recorded from</th>
              <th scope="col">Model</th><th scope="col">Runtime</th><th scope="col">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((r) => (
              <tr key={r.request_digest}>
                <td data-label="Request digest">
                  <Mono title={r.request_digest}>{r.request_digest.slice(0, 20)}…</Mono>
                </td>
                <td data-label="Recorded from">{r.recorded_from}</td>
                <td data-label="Model"><Mono>{r.model_id}</Mono></td>
                <td data-label="Runtime"><Mono>{r.runtime_version}</Mono></td>
                <td data-label="Recorded">{fmtInstant(r.recorded_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
