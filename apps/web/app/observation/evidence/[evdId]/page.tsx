'use client';
/**
 * Evidence detail — chain of custody, the four times, and the four authenticity
 * concepts.
 *
 * The authenticity block is the reason this screen exists. Most systems would
 * show a padlock here. This shows FOUR SEPARATE ANSWERS, and the fourth —
 * whether the content genuinely originates from the claimed source — is
 * `unknown`, because TLS and a digest do not establish it and no cohort-1
 * publisher offers a signature mechanism.
 *
 * The download is attachment-only and is a CONSEQUENTIAL READ: the policy
 * decision and audit event are durable before a byte moves, and the digest is
 * re-verified on the way out.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { observation } from '../../../../lib/observation';
import {
  DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, ScrollBox, SyntheticMarker,
  UnknownNote, badgeRowStyle, cardStyle, fmtBytes, fmtInstant,
} from '../../../../components/observation';
import { ErrorNote, Receipt, TruthBadge } from '../../../../components/ui';

const AUTHENTICITY_LABEL: Record<string, string> = {
  transport_endpoint: 'Transport endpoint',
  byte_integrity: 'Byte integrity',
  source_origin: 'Source origin',
  content_authenticity: 'Content authenticity',
};

const AUTHENTICITY_NOTE: Record<string, string> = {
  transport_endpoint: 'whether the TLS certificate of the endpoint we connected to verified',
  byte_integrity: 'whether the stored bytes still hash to the digest recorded when they arrived',
  source_origin: 'whether the endpoint was the contract’s authorised origin',
  content_authenticity:
    'whether the content genuinely originates from the claimed real-world source. TLS and a digest do not establish this.',
};

export default function EvidenceDetailPage() {
  const { scope } = useShell();
  const params = useParams<{ evdId: string }>();
  const evdId = params.evdId;
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [knownAt, setKnownAt] = useState('');
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [download, setDownload] = useState<{ byteLength: number; contentDigest: string; integrity: string; preview: string } | null>(null);

  const load = useCallback(async (at: string | null) => {
    const r = await observation.getEvidence(scope, evdId, at);
    if (r.ok && r.data !== undefined) { setD(r.data as Record<string, unknown>); setError(null); }
    else setError(r.error ?? null);
  }, [scope, evdId]);

  useEffect(() => { void load(null); }, [load]);

  if (error !== null && d === null) return <><h1>Evidence</h1><ErrorNote error={error} /></>;
  if (d === null) return <Empty>Loading evidence…</Empty>;

  const evd = d['evidence'] as Record<string, unknown>;
  const obs = d['observation'] as Record<string, unknown> | null;
  const source = d['source'] as Record<string, unknown> | null;
  const run = d['run'] as Record<string, unknown> | null;
  const manifest = d['manifest'] as Record<string, unknown> | null;
  const custody = (d['custody'] ?? []) as Array<Record<string, unknown>>;
  const times = d['fourTimes'] as Record<string, unknown>;
  const versions = (d['versionHistory'] ?? []) as Array<Record<string, unknown>>;
  const payload = (evd['payload'] ?? {}) as Record<string, unknown>;
  const obsPayload = (obs?.['payload'] ?? {}) as Record<string, unknown>;
  const transport = (obsPayload['transport'] ?? {}) as Record<string, unknown>;
  const authenticity = (payload['authenticity'] ?? {}) as Record<string, string>;
  const withdrawn = String(evd['lifecycle_state']) === 'withdrawn';

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>
        Evidence <Mono>{evdId.slice(0, 8)}…</Mono>
      </h1>
      <div style={badgeRowStyle}>
        <TruthBadge state={String(evd['truth_state'])} />
        <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
          v{Number(evd['object_version'])} · {String(evd['lifecycle_state'])}
        </span>
        <SyntheticMarker synthetic={evd['synthetic_state'] === true} />
        {source !== null && (
          <Link href={`/observation/sources/${String(source['source_id'])}`} style={{ color: 'var(--eye-color-accent-default)' }}>
            {String(source['name'])}
          </Link>
        )}
      </div>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      {withdrawn && (
        <UnknownNote>
          <strong>This evidence has been withdrawn.</strong>{' '}
          {String(evd['withdrawal_reason'] ?? 'No reason was recorded.')} The record and every earlier version remain
          retrievable; the bytes are no longer served.
        </UnknownNote>
      )}

      {/* ── the four times ─────────────────────────────────────────── */}
      <section aria-labelledby="times" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="times" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Four times</h2>
        <dl style={{ margin: 0 }}>
          <DefinitionRow term="Event">
            <Mono>{fmtInstant(times['event'])}</Mono>
            <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              {' '}— the publisher’s own time for this item
            </span>
          </DefinitionRow>
          <DefinitionRow term="Observation">
            <Mono>{fmtInstant(times['observation'])}</Mono>
            <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              {' '}— when we observed it
            </span>
          </DefinitionRow>
          <DefinitionRow term="Valid">
            <Mono>{fmtInstant((times['valid'] as Record<string, unknown>)?.['from'])}</Mono>
            <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              {' '}— Phase 1 makes no claim about an item’s validity interval
            </span>
          </DefinitionRow>
          <DefinitionRow term="Record">
            <Mono>{fmtInstant(times['record'])}</Mono>
            <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              {' '}— when the committing component wrote it
            </span>
          </DefinitionRow>
        </dl>
      </section>

      {/* ── authenticity ───────────────────────────────────────────── */}
      <section aria-labelledby="authenticity" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="authenticity" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>
          Authenticity — four separate concepts
        </h2>
        <dl style={{ margin: 0 }}>
          {(['transport_endpoint', 'byte_integrity', 'source_origin', 'content_authenticity'] as const).map((k) => {
            const v = authenticity[k] ?? 'unknown';
            const good = v === 'verified';
            const na = v === 'not_applicable';
            return (
              <DefinitionRow key={k} term={AUTHENTICITY_LABEL[k] as string}>
                <span
                  style={{
                    color: good ? 'var(--eye-color-success)' : na ? 'var(--eye-color-ink-muted)' : 'var(--eye-color-uncertain)',
                    fontWeight: 650, fontSize: 'var(--eye-type-label-sm)',
                  }}
                >
                  {good ? '✓ VERIFIED' : na ? '— NOT APPLICABLE' : v === 'unverified' ? '◍ UNVERIFIED' : '◍ UNKNOWN'}
                </span>
                <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                  {AUTHENTICITY_NOTE[k]}
                </div>
              </DefinitionRow>
            );
          })}
        </dl>
        <UnknownNote>
          Content authenticity is <strong>unknown</strong>, and that is the honest answer rather than a gap. This
          publisher offers no signature mechanism; TLS establishes which endpoint we reached and the digest
          establishes that the stored bytes are the bytes that arrived. Neither establishes that the content is
          genuinely the publisher’s.
        </UnknownNote>
      </section>

      {/* ── chain of custody ───────────────────────────────────────── */}
      <section aria-labelledby="custody" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="custody" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Chain of custody</h2>
        <dl style={{ margin: 0, marginBlockEnd: 'var(--eye-space-12)' }}>
          <DefinitionRow term="Source contract">
            {source === null ? 'not resolvable' : (
              <>
                {String(source['name'])} @v{Number(source['contract_version'])} ({String(source['lifecycle_state'])})
                <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                  approved by <Mono>{String(source['approver_principal_id'] ?? 'not approved').slice(0, 8)}…</Mono>
                </div>
              </>
            )}
          </DefinitionRow>
          <DefinitionRow term="Agent">
            {run === null ? 'not resolvable' : (
              <>
                <Mono>{String(run['connector'])}@{String(run['agent_version'])}</Mono>
                <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                  code digest <Mono>{String(run['code_digest']).slice(0, 16)}…</Mono>
                </div>
              </>
            )}
          </DefinitionRow>
          <DefinitionRow term="Endpoint">
            <Mono>{String(transport['endpoint'] ?? 'none — supplied by an operator')}</Mono>
            <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              HTTP {String(transport['http_status'] ?? '—')} · method lineage <Mono>{String(transport['method_ref'] ?? '')}</Mono>
            </div>
          </DefinitionRow>
          <DefinitionRow term="Bytes">
            {fmtBytes(payload['byte_length'])} · <Mono>{String(payload['content_digest'] ?? '')}</Mono>
            <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              verified before storage, after storage, and again on every read
            </div>
          </DefinitionRow>
          <DefinitionRow term="Vault">
            {manifest === null ? 'no manifest — the bytes are unreachable' : (
              <>
                {String(manifest['vault'])} · <Mono>{String(manifest['locator'])}</Mono>
                <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                  quarantine and evidence are separate volumes, not separate folders
                </div>
              </>
            )}
          </DefinitionRow>
          {payload['fragment'] != null && (
            <DefinitionRow term="Fragment of parent">
              bytes {String((payload['fragment'] as Record<string, unknown>)['byte_start'])}–
              {String((payload['fragment'] as Record<string, unknown>)['byte_end'])} of the preserved parent payload,
              framed by <Mono>{String((payload['fragment'] as Record<string, unknown>)['method_ref'])}</Mono>
            </DefinitionRow>
          )}
        </dl>

        <ScrollBox label="Custody events">
          <table className="eye-table">
            <caption>Every custody event on this object, in order.</caption>
            <thead>
              <tr><th scope="col">Event</th><th scope="col">Actor</th><th scope="col">Digest verified</th><th scope="col">When</th></tr>
            </thead>
            <tbody>
              {custody.map((c) => (
                <tr key={String(c['event_id'])}>
                  <td data-label="Event">{String(c['event']).replace('custody.', '')}</td>
                  <td data-label="Actor"><Mono>{String(c['actor'])}</Mono></td>
                  <td data-label="Digest verified">
                    {c['digest_verified'] === true ? '✓ yes' : c['digest_verified'] === false ? '✕ NO' : '— not applicable'}
                  </td>
                  <td data-label="When"><Mono>{fmtInstant(c['occurred_at'])}</Mono></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      </section>

      {/* ── original bytes ─────────────────────────────────────────── */}
      <section aria-labelledby="bytes" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="bytes" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Original bytes</h2>
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlockStart: 0 }}>
          Retrieval is attachment-only and is never rendered inline. It is a consequential read: the policy decision
          and the audit event are durable before a byte moves, and the digest is verified again on the way out.
        </p>
        <GovernedButton
          label="Retrieve the original bytes" pendingLabel="Retrieving"
          disabled={withdrawn}
          onRun={async () => {
            const r = await observation.downloadEvidence(scope, evdId);
            if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
            setReceipt(r.data.receipt);
            const dl = r.data.download;
            const text = typeof atob === 'function' ? atob(dl.base64) : '';
            setDownload({
              byteLength: dl.byteLength, contentDigest: dl.contentDigest, integrity: dl.integrity,
              preview: text.slice(0, 600),
            });
          }}
        />
        {withdrawn && (
          <LiveStatus>This evidence is withdrawn: its bytes are no longer served.</LiveStatus>
        )}
        {download !== null && (
          <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
            <LiveStatus>
              {fmtBytes(download.byteLength)} retrieved · integrity {download.integrity} · digest{' '}
              <Mono>{download.contentDigest.slice(0, 16)}…</Mono>
            </LiveStatus>
            <ScrollBox label="Retrieved bytes">
              <pre
                style={{
                  background: 'var(--eye-color-surface-secondary)',
                  border: '1px solid var(--eye-color-border-default)',
                  borderRadius: 'var(--eye-radius-md)',
                  padding: 'var(--eye-space-8)',
                  fontFamily: 'var(--eye-font-mono)',
                  fontSize: 'var(--eye-type-mono-sm)',
                  margin: 0,
                  maxBlockSize: '18rem',
                  overflow: 'auto',
                }}
              >
                {download.preview}
              </pre>
            </ScrollBox>
          </div>
        )}
      </section>

      {/* ── history & known-at ─────────────────────────────────────── */}
      <section aria-labelledby="history" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="history" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>History</h2>
        <ScrollBox label="Version history">
          <table className="eye-table">
            <caption>Every version. A correction is a new version; nothing is overwritten.</caption>
            <thead>
              <tr><th scope="col">Version</th><th scope="col">Lifecycle</th><th scope="col">Truth state</th><th scope="col">Recorded</th><th scope="col">Correction of</th></tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={String(v['object_version'])}>
                  <td data-label="Version">v{Number(v['object_version'])}</td>
                  <td data-label="Lifecycle">{String(v['lifecycle_state'])}</td>
                  <td data-label="Truth state">{String(v['truth_state'])}</td>
                  <td data-label="Recorded"><Mono>{fmtInstant(v['recorded_at'])}</Mono></td>
                  <td data-label="Correction of"><Mono>{String(v['correction_of'] ?? '—')}</Mono></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>

        <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
          <label htmlFor="known-at" style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' }}>
            Reproduce what was known at an instant
          </label>
          <div style={{ ...badgeRowStyle, marginBlockStart: 'var(--eye-space-4)' }}>
            <input
              id="known-at"
              type="datetime-local"
              value={knownAt}
              onChange={(e) => setKnownAt(e.target.value)}
              style={{
                blockSize: 'var(--eye-size-control-md)',
                border: '1px solid var(--eye-color-border-default)',
                borderRadius: 'var(--eye-radius-md)',
                paddingInline: 'var(--eye-space-8)',
                background: 'var(--eye-color-surface-primary)',
                color: 'var(--eye-color-ink-default)',
              }}
            />
            <GovernedButton
              label="Show the state at that instant" pendingLabel="Querying" variant="quiet"
              disabled={knownAt === ''}
              onRun={() => load(new Date(knownAt).toISOString())}
            />
            <GovernedButton
              label="Show current" pendingLabel="Querying" variant="quiet"
              onRun={() => load(null)}
            />
          </div>
          {d['knownAt'] != null && (
            <LiveStatus>
              Showing the state of knowledge at <Mono>{fmtInstant(d['knownAt'])}</Mono> — later corrections are
              invisible from here, which is what makes a past decision defensible.
            </LiveStatus>
          )}
        </div>
      </section>
    </>
  );
}
