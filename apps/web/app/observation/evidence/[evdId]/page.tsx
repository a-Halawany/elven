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
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { observation } from '../../../../lib/observation';
import {
  DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, ScrollBox, SyntheticMarker,
  UnknownNote, badgeRowStyle, cardStyle, fmtBytes, fmtInstant,
} from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';
/* B82 ev */ import type { ResolutionState, Scope } from '../../../../lib/evidence-api-b82'; /* end B82 ev */
/* B81 ob */ import { ObjectHeader } from '../../../../components/object'; /* end B81 ob */
/* B82 ev */
import { CustodyTimeline, EvidenceCard, EvidenceDisclosure, EvidenceViewer, RightsNotice, VerificationPanel, type ViewerRead } from '../../../../components/evidence';
import { evidenceApi, useCitationResolutions } from '../../../../lib/evidence-api-b82';
import { bytesVerification, evidenceDisclosure, type ContractRights, type CustodyRow, type VerificationFacet } from '../../../../lib/evidence-b82';
import type { CitationRef } from '../../../../lib/b82-seams';
import { RightsTermsForm } from './rights-form';
/* end B82 ev */
/* B40 va */
import { EvidenceAuthenticityPanel } from '../../../../components/authenticity';
import { authenticityApi } from '../../../../lib/authenticity-api-b40';
import { UNKNOWN_NOTE, contentAuthenticityNote, toEvidenceAuthenticity, type EvidenceVersionAuthenticity } from '../../../../lib/authenticity-b40';
import { AttributeOverrideForm } from './attribute-form';
/* end B40 va */
/* B40 integration (§IN): the inspection verdicts of this version, mounted here */
import { InspectionPanel } from '../../../../components/intake';
/* end B40 integration */

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
  /** B21.2: `preview` is null and `degraded` set when the tier's root could not be reached — the record served, the bytes not (EYE-DEG-001). */
  const [download, setDownload] = useState<{ byteLength: number; contentDigest: string; integrity: string; tier: string; availability: string; preview: string | null; degraded: { root: string; label: string } | null } | null>(null);

  /* B82 ev — this evidence's own citation resolved (graph.provenance.read), the last governed read of its bytes (the verification's bytes facet) */
  const [lastRead, setLastRead] = useState<ViewerRead | null>(null);
  const ownRef = useMemo<CitationRef[]>(() => {
    const e = d?.['evidence'] as Record<string, unknown> | undefined;
    const v = Number(e?.['object_version']);
    return e === undefined || !Number.isInteger(v) ? [] : [{ kind: 'evidence', id: String(e['object_id'] ?? evdId), version: v, digest: typeof e['content_digest'] === 'string' ? e['content_digest'] as string : null }];
  }, [d, evdId]);
  const [rev, setRev] = useState(0);
  const resolved = useCitationResolutions(scope, ownRef, rev);
  /* end B82 ev */
  /* B40 va — the recorded publisher-signature outcome and the evidence attributes of each version (metadata only; observation.authenticity.read) */
  const [authn, setAuthn] = useState<{ versions: EvidenceVersionAuthenticity[] } | { refused: { code: string; message: string; correlationId: string } } | null>(null);
  const [authnRev, setAuthnRev] = useState(0);
  useEffect(() => {
    let live = true;
    void authenticityApi.evidence(scope, evdId).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) setAuthn({ versions: toEvidenceAuthenticity(r.data.authenticity) });
      else setAuthn({ refused: r.error ?? { code: `HTTP ${r.status}`, message: 'The authenticity of this evidence was not read; reload the page to read it again.', correlationId: '' } });
    });
    return () => { live = false; };
  }, [scope, evdId, authnRev]);
  /* end B40 va */

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
      {/* B81 ob — the canonical object header (F-P7-E-06): the truth badge, version and lifecycle moved into it (one place, the same grammar) */}
      <ObjectHeader input={{
        type: 'EVD', id: String(evd['object_id'] ?? evdId), title: `Evidence ${evdId.slice(0, 8)}…`, version: Number.isInteger(Number(evd['object_version'])) ? Number(evd['object_version']) : null,
        versionCount: versions.length === 0 ? null : versions.length,
        latestVersion: versions.length === 0 ? null : Math.max(...versions.map((v) => Number(v['object_version']))),
        owner: evd['accountable_owner'] === undefined || evd['accountable_owner'] === null ? null : String(evd['accountable_owner']), ownerRole: 'accountable owner',
        serverState: evd['lifecycle_state'] === undefined ? null : String(evd['lifecycle_state']), truth: evd['truth_state'] === undefined ? null : String(evd['truth_state']),
        synthetic: evd['synthetic_state'] === true, classification: evd['classification'] === undefined || evd['classification'] === null ? null : String(evd['classification']),
        time: [{ label: 'Recorded', value: fmtInstant(times['record']) }, { label: 'Observed', value: fmtInstant(times['observation']) }],
        trust: `integrity recorded ${String(payload['content_digest'] ?? evd['content_digest'] ?? 'not recorded').slice(0, 16)}… · content authenticity ${String(authenticity['content_authenticity'] ?? 'unknown')}`,
        authority: 'Evidence is admitted by collection under its source contract; no approval exists for evidence.',
        relationships: source === null ? [] : [{ label: `its source — ${String(source['name'])}`, href: `/observation/sources/${String(source['source_id'])}` }],
        provenance: [{ label: `${custody.length} custody event(s) — the chain below`, href: null }],
        receipt: (d['receipt'] as { policyDecisionId: string; auditSeq: number } | undefined) ?? null,
        effective: d['knownAt'] != null ? { support: 'honoured', asOf: String(d['knownAt']) } : { support: 'immutable', asOf: null },
      }} version={{ compare: { label: 'Open the version history', anchor: 'history' } }} />
      {/* end B81 ob */}
      <div style={badgeRowStyle}>
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
        {/* B40 va: the content-authenticity sentence — for an item with no recorded outcome EXACTLY the hosted journey 7's words (D8); a
            recorded outcome (an SRC@v4 source) says what it is, FAILED included (admitted marked, readable, refused at decision-active use) */}
        {(() => {
          const v = authn !== null && 'versions' in authn ? authn.versions.find((x) => x.version === Number(evd['object_version'])) ?? null : null;
          const note = contentAuthenticityNote(v);
          return note.kind === 'unknown' && authenticity['content_authenticity'] !== 'verified'
            ? <UnknownNote>{UNKNOWN_NOTE.lead} <strong>{UNKNOWN_NOTE.strong}</strong>{UNKNOWN_NOTE.rest}</UnknownNote>
            : <UnknownNote>{note.kind === 'recorded' ? note.text : 'Content authenticity is verified: the publisher’s signature verified at admission.'}</UnknownNote>;
        })()}
        {authn !== null && 'refused' in authn ? <ErrorNote error={authn.refused} /> : null}
        {authn !== null && 'versions' in authn ? <EvidenceAuthenticityPanel versions={authn.versions} /> : null}
        <AttributeOverrideForm scope={scope} evdId={String(evd['object_id'] ?? evdId)} version={Number(evd['object_version'])} onChanged={() => setAuthnRev((n) => n + 1)} />
        {/* end B40 va */}
      </section>

      {/* B82 ev — THE CITED SPAN, ITS VERIFICATION, ITS RIGHTS (CMP-025/028/031/032, UX-26-001/003/005): the resolution of this version (short of
          the bytes), the bytes read only when a person asks (the EXISTING evidence-read authority — D9), a fragment shown highlighted in its parent */}
      <B82Evidence scope={scope} evd={evd} payload={payload} source={source} resolved={resolved} lastRead={lastRead} setLastRead={setLastRead} onChanged={() => setRev((n) => n + 1)}
        /* B40 va */ recorded={authn !== null && 'versions' in authn ? authn.versions.find((x) => x.version === Number(evd['object_version'])) ?? null : null} /* end B40 va */ />
      {/* end B82 ev */}

      {/* B40 integration (§IN, D2, D9) — every engine's verdict on this version with its identity, findings by code and offset (never content),
          read on demand under observation.inspection.read; an item admitted before B40 or under a v1–v3 contract says "not recorded" */}
      <section aria-labelledby="inspection" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="inspection" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Inspection</h2>
        <InspectionPanel scope={scope} evdId={String(evd['object_id'] ?? evdId)} version={Number.isFinite(Number(evd['object_version'])) ? Number(evd['object_version']) : null} />
      </section>
      {/* end B40 integration */}

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
          {/* B11's tier ledger as the detail carries it (evidence.service.ts's `availability` block); B21.2 says what it does NOT carry. */}
          <DefinitionRow term="Availability">
            {String((d['availability'] as Record<string, unknown> | null | undefined)?.['state'] ?? 'hot')} · tier {String((d['availability'] as Record<string, unknown> | null | undefined)?.['tier'] ?? 'hot')}
            <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              Whether the tier’s root is reachable is declared by a retrieval, not by this record
            </div>
          </DefinitionRow>
          {payload['fragment'] != null && (
            <DefinitionRow term="Fragment of parent">
              bytes {String((payload['fragment'] as Record<string, unknown>)['byte_start'])}–
              {String((payload['fragment'] as Record<string, unknown>)['byte_end'])} of the preserved parent payload,
              framed by <Mono>{String((payload['fragment'] as Record<string, unknown>)['method_ref'])}</Mono>
            </DefinitionRow>
          )}
        </dl>

        {/* B82 ev: the custody events as the library's timeline and its table (CMP-030; §CF's EventTimeline at the fold) */}
        <CustodyTimeline caption="Custody events" rows={custody.map((c): CustodyRow => ({ eventId: String(c['event_id']), event: String(c['event']), actor: c['actor'] == null ? null : String(c['actor']),
          occurredAt: c['occurred_at'] == null ? null : new Date(String(c['occurred_at'])).toISOString(), digestVerified: c['digest_verified'] === true ? true : c['digest_verified'] === false ? false : null,
          details: (c['details'] ?? null) as Record<string, unknown> | null }))} />
        {/* end B82 ev */}
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
            const text = dl.base64 === null ? null : (typeof atob === 'function' ? atob(dl.base64) : '');
            setDownload({
              byteLength: dl.byteLength, contentDigest: dl.contentDigest, integrity: dl.integrity, tier: dl.tier, availability: dl.availability,
              preview: text === null ? null : '', degraded: dl.degraded ?? null,
            });
          }}
        />
        {withdrawn && (
          <LiveStatus>This evidence is withdrawn: its bytes are no longer served.</LiveStatus>
        )}
        {/* B21.2: rendered FROM THE FLAG — a served read keeps the line below byte for byte; an unreachable tier root is the degraded block. */}
        {download !== null && download.availability !== 'unreachable' && (
          <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
            <LiveStatus>
              {fmtBytes(download.byteLength)} retrieved · integrity {download.integrity} · digest{' '}
              <Mono>{download.contentDigest.slice(0, 16)}…</Mono>
            </LiveStatus>
            {/* B82 ev: the 600-character preview is replaced by the viewer above (the cited span, highlighted, through the governed segment read) */}
            <p className="eye-ev-note">The download is an attachment; the bytes are shown in place only by the viewer above, through the governed segment read.</p>
            {/* end B82 ev */}
          </div>
        )}
        {download !== null && download.availability === 'unreachable' && (
          <UnknownNote>
            <strong>Bytes unavailable — the {download.degraded?.root} root of the vault could not be reached.</strong>{' '}
            The record is served — {fmtBytes(download.byteLength)} recorded under digest <Mono>{download.contentDigest.slice(0, 16)}…</Mono>, tier {download.tier} —
            and the bytes are not; nothing about them was verified or refuted (EYE-DEG-001). {download.degraded?.label}
          </UnknownNote>
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

/* B82 ev */
/** The page's §EV section: the resolution of THIS version, the cited bytes (own; a fragment highlighted in its parent), verification, rights. */
function B82Evidence({ scope, evd, payload, source, resolved, lastRead, setLastRead, onChanged, /* B40 va */ recorded /* end B40 va */ }: {
  scope: Scope; evd: Record<string, unknown>; payload: Record<string, unknown>; source: Record<string, unknown> | null; resolved: ResolutionState;
  lastRead: ViewerRead | null; setLastRead: (r: ViewerRead) => void; onChanged: () => void;
  /* B40 va */ recorded: EvidenceVersionAuthenticity | null; /* end B40 va */
}) {
  const [verifyError, setVerifyError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const r = resolved.state === 'ready' ? [...resolved.byKey.values()][0] ?? null : null;
  const leaf = r?.leaves[0] ?? null;
  const fragment = (payload['fragment'] ?? null) as Record<string, unknown> | null;
  const parentId = typeof payload['parent_evd_id'] === 'string' ? payload['parent_evd_id'] as string : null;
  const ar = ((source?.['contract'] as Record<string, unknown> | undefined)?.['authority_and_rights'] ?? {}) as Record<string, unknown>;
  const contract: ContractRights | null = source === null ? null : {
    rightsState: typeof source['rights_state'] === 'string' ? source['rights_state'] as string : null, licence: typeof ar['licence'] === 'string' ? ar['licence'] as string : null,
    permittedUse: Array.isArray(ar['permitted_use']) ? (ar['permitted_use'] as unknown[]).map(String) : [], attribution: typeof ar['attribution'] === 'string' ? ar['attribution'] as string : null,
    retention: typeof ar['retention'] === 'string' ? ar['retention'] as string : null,
  };
  const authenticity = (payload['authenticity'] ?? {}) as Record<string, string>;
  const facets: VerificationFacet[] = [
    bytesVerification(lastRead),
    /* B40 va: the recorded outcome (a FAILED signature is a failed facet; no record keeps B82's words) */
    { facet: 'Publisher signature (content authenticity)', outcome: authenticity['content_authenticity'] === 'verified' ? 'verified' : recorded?.outcome === 'failed' ? 'failed' : 'unavailable',
      detail: authenticity['content_authenticity'] === 'verified' ? 'the publisher’s signature verified at admission'
        : recorded !== null && recorded.outcome !== 'not_recorded' ? (recorded.statement ?? recorded.outcome) : 'this publisher offers no signature mechanism; the content’s origin is neither verified nor refuted',
      checkedAt: recorded?.recordedAt ?? null },
    /* end B40 va */
  ];
  const sourceId = leaf?.sourceId ?? (/^SRC:([0-9a-f-]{36})@/.exec(String(evd['provenance_ref'] ?? ''))?.[1] ?? null);
  const contractVersion = leaf?.contractVersion ?? (Number(/@(\d+)$/.exec(String(evd['provenance_ref'] ?? ''))?.[1]) || null);
  const length = Number(payload['byte_length']);
  return (
    <section aria-labelledby="b82-ev" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="b82-ev" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>The cited bytes, their verification and their rights</h2>
      {resolved.state === 'loading' && <p className="eye-ev-note">Resolving this version…</p>}
      {resolved.state === 'refused' && <ErrorNote error={resolved.error} />}
      {r !== null && <EvidenceDisclosure model={evidenceDisclosure([r], { digest: resolved.state === 'ready' ? resolved.digests[0] ?? null : null })} />}
      {leaf !== null && <EvidenceCard leaf={leaf} />}
      {leaf !== null && <EvidenceViewer leaf={leaf} scope={scope} onRead={setLastRead} label="This version’s bytes" contextBytes={0} />}
      {fragment !== null && parentId !== null && (
        <EvidenceViewer scope={scope} label="This fragment, highlighted in its parent’s bytes"
          leaf={{ evidence: { id: parentId, version: 0, digest: '', byteStart: Number(fragment['byte_start']), byteEnd: Number(fragment['byte_end']), mediaType: leaf?.evidence?.mediaType ?? null } }} />
      )}
      <RightsNotice terms={leaf?.rights ?? null} contract={contract} />
      <RightsTermsForm scope={scope} sourceId={sourceId} contractVersion={contractVersion} current={leaf?.rights ?? null} onChanged={onChanged} />
      <VerificationPanel facets={facets} receipt={lastRead?.receipt ?? null}
        onVerifyAgain={leaf === null || !Number.isFinite(length) || length < 1 ? undefined : async () => {
          setVerifyError(null);
          const x = await evidenceApi.segment(scope, String(evd['object_id']), { version: Number(evd['object_version']), byteStart: 0, byteEnd: Math.min(length, 65_536), context: 0 });
          const at = new Date().toISOString();
          if (!x.ok || x.data === undefined) {
            setVerifyError(x.error ?? null);
            if (x.status === 409) setLastRead({ integrity: 'failed', contentDigest: null, at, detail: x.error?.message ?? null, receipt: null });
            throw new Error('refused');
          }
          setLastRead({ integrity: x.data.segment.integrity, contentDigest: x.data.segment.contentDigest, at, detail: x.data.segment.degraded?.label ?? null, receipt: x.data.receipt });
        }} />
      <ErrorNote error={verifyError} />
    </section>
  );
}
/* end B82 ev */
