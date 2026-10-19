'use client';
/**
 * B82 §EV — THE EVIDENCE LIBRARY (LIBRARY_B82.evidence; F-P7-E-07 chapter 26). Eight components, each arriving `proposed` (the DSA approves
 * it in the act); the decisions are lib/evidence-b82.ts's (pure, tested); a component only renders them:
 *
 *   EvidenceCard        (CMP-025) source, truth, authority, rights, digest, custody, freshness, tier — each stated, never blank
 *   CitationLink        (CMP-026) a citation with its outcome in a glyph and a WORD; activating it opens the citation in a Drawer ON THE CITING
 *                       PAGE (the point of use is kept, UX-26-003, UX-ADR-006): the resolution, each evidence leaf's card, viewer and rights
 *   SourcePreview       (CMP-027) a Popover of the resolution's metadata (source, version, span, digest state, rights) — never bytes
 *   EvidenceViewer      (CMP-028) the cited byte span HIGHLIGHTED in place (<mark>) within its context, read only through the governed segment
 *                       read under the EXISTING evidence-read authority (DESIGN D9) when a person asks — a reader without it sees the server's
 *                       refusal and keeps the resolution; media and geospatial kinds stated as B83's (chapter 31)
 *   CustodyTimeline     (CMP-030) every custody event in order (an ordered list now — §CF's EventTimeline at the fold) + its table
 *   RightsNotice        (CMP-031) the governed rights terms ("no expiry declared" when none) beside the contract's own statement; B80's
 *                       RightsBadge composed, not edited
 *   VerificationPanel   (CMP-032) VERIFIED / FAILED / UNAVAILABLE / NOT CHECKED per facet — never verified by inference; the policy decision
 *   EvidenceDisclosure  (HX-01) sources, citations, versions, cutoff, omissions, the policy-filtered scope — B80's Disclosure, so authority and
 *                       uncertainty stay in the always-visible summary; unresolved → "viewable, not decision-ready"
 *
 * Accessibility: every state is a word (forced colours and 200 % zoom keep it); native buttons and the B80 Drawer / Popover keyboard paths;
 * logical properties only; no raw colour (tokens via globals.css `B82 ev`). Nothing optimistic: every answer is the server's.
 * THREE CLAIMS: construction (these components and their walk); demonstrated operation is the act's; real acceptance — never claimed.
 */
import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { CitationRef } from '../lib/b82-seams';
import {
  OUTCOME_WORDS, VERIFICATION_WORDS, base64ToBytes, citationHref, citationLabel, citationLine, custodySummary, custodyTimeline, evidenceCard, rightsNotice,
  segmentRequestOf, splitSegment, toResolution, verificationSummary, viewerKind, viewerStatement,
  type ContractRights, type CustodyRow, type ResolutionView, type ResolvedLeaf, type VerificationFacet, type evidenceDisclosure,
} from '../lib/evidence-b82';
import { evidenceApi, type Receipt, type Scope, type SegmentView } from '../lib/evidence-api-b82';
import { Disclosure, Drawer, Popover } from './layers';
import { GovernedButton, RightsBadge } from './observation';
import { ErrorNote } from './ui';

type ApiError = { code: string; message: string; correlationId: string };

/* ───────────────────────── EvidenceCard (CMP-025) ───────────────────────── */
export function EvidenceCard({ leaf, now, children }: { leaf: ResolvedLeaf; now?: Date; children?: ReactNode }) {
  const c = evidenceCard(leaf, now ?? new Date());
  const id = useId();
  return (
    <article className="eye-ev-card" aria-labelledby={id} data-outcome={leaf.outcome}>
      <p id={id} className="eye-ev-card-title"><span className="eye-text-label">{c.title}</span> <span className="eye-ev-outcome" data-outcome={leaf.outcome}>{c.outcome}</span></p>
      <dl className="eye-ev-dl">
        {c.lines.map((l) => (<div key={l.term} className="eye-ev-dl-row"><dt>{l.term}</dt><dd>{l.value}</dd></div>))}
      </dl>
      {leaf.detail !== null && <p className="eye-ev-note">{leaf.detail}</p>}
      {children}
    </article>
  );
}

/* ───────────────────────── SourcePreview (CMP-027) ───────────────────────── */
export function SourcePreview({ resolution }: { resolution: ResolutionView }) {
  const label = citationLabel(resolution.ref);
  const l = citationLine(resolution);
  return (
    <Popover label={`Source preview — ${label}`} triggerLabel="Preview the source">
      <dl className="eye-ev-dl">
        <div className="eye-ev-dl-row"><dt>Cited</dt><dd>{label} · {l.binds}</dd></div>
        <div className="eye-ev-dl-row"><dt>Outcome</dt><dd>{l.outcome}{l.detail === null ? '' : ` — ${l.detail}`}</dd></div>
        {resolution.leaves.slice(0, 5).map((leaf, i) => (
          <div key={`${leaf.path.join('>')}#${i}`} className="eye-ev-dl-row">
            <dt>Evidence {i + 1}</dt>
            <dd>
              {leaf.evidence === null ? 'no evidence bytes reached' : `${leaf.evidence.id.slice(0, 8)}… v${leaf.evidence.version} · bytes ${leaf.evidence.byteStart}–${leaf.evidence.byteEnd}`}
              {' · '}{leaf.digestOk === true ? 'recorded digests agree' : leaf.digestOk === false ? 'DIGESTS DISAGREE OR INTEGRITY FAILED' : 'digest not checked'}
              {' · '}{leaf.rights === null ? 'no rights terms declared' : `rights ${leaf.rights.state.replace('_', ' ')}`}
              {leaf.sourceId === null ? '' : ` · source ${leaf.sourceId.slice(0, 8)}…`}
            </dd>
          </div>
        ))}
        {resolution.leaves.length > 5 && <div className="eye-ev-dl-row"><dt>More</dt><dd>{resolution.leaves.length - 5} further evidence leaf(s) — open the citation</dd></div>}
      </dl>
      <p className="eye-ev-note">No bytes are shown here: the cited bytes are read only through the governed segment read, by a person who reads evidence.</p>
    </Popover>
  );
}

/* ───────────────────────── EvidenceViewer (CMP-028) ───────────────────────── */
export interface ViewerRead { integrity: 'verified' | 'failed' | 'unavailable'; contentDigest: string | null; at: string; detail: string | null; receipt: Receipt | null }
export function EvidenceViewer({ leaf, scope, segment: given, onRead, contextBytes, label }: {
  leaf: Pick<ResolvedLeaf, 'evidence'>;
  /** with a scope the viewer offers the governed read (a person's act); without one it renders the segment it is given, or says why none */
  scope: Scope | null;
  segment?: SegmentView | null;
  onRead?: (r: ViewerRead) => void;
  contextBytes?: number;
  /** what the region is called (default "Cited evidence bytes") */
  label?: string;
}) {
  const [seg, setSeg] = useState<SegmentView | null>(given ?? null);
  const [error, setError] = useState<ApiError | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const req = segmentRequestOf(leaf, contextBytes);
  const kind = viewerKind(leaf.evidence?.mediaType ?? null);
  const statement = viewerStatement(kind);
  const regionLabel = label ?? 'Cited evidence bytes';
  const shown = seg !== null && seg.base64 !== null && seg.highlight !== null ? splitSegment(base64ToBytes(seg.base64), seg.highlight, kind) : null;
  return (
    <section className="eye-ev-viewer" aria-label={regionLabel} data-kind={kind}>
      {'problem' in req ? <p className="eye-ev-note">{req.problem}</p> : (
        <p className="eye-ev-note">
          Cited: bytes {req.byteStart}–{req.byteEnd} of evidence {req.evdId.slice(0, 8)}… {req.version === null ? "(its current version)" : `v${req.version}`}{req.note === null ? '' : ` — ${req.note}`}.
        </p>
      )}
      {statement !== null && <p className="eye-ev-note" data-viewer-carrier={kind === 'media' || kind === 'geo' ? 'B83' : undefined}>{statement}</p>}
      {scope !== null && !('problem' in req) && (
        <GovernedButton label={seg === null ? 'Read the cited bytes' : 'Read the cited bytes again'} pendingLabel="Reading the cited bytes" variant="quiet"
          onRun={async () => {
            setError(null);
            const r = await evidenceApi.segment(scope, req.evdId, { version: req.version, byteStart: req.byteStart, byteEnd: req.byteEnd, context: req.context });
            const at = new Date().toISOString();
            if (!r.ok || r.data === undefined) {
              const e = r.error ?? { code: 'EYE-INT-001', message: 'the read was not answered', correlationId: '', retry: 'no' };
              setError(e);
              if (r.status === 409 && /integrity/i.test(e.message)) onRead?.({ integrity: 'failed', contentDigest: null, at, detail: e.message, receipt: null });
              throw new Error('refused');
            }
            setSeg(r.data.segment); setReceipt(r.data.receipt);
            onRead?.({ integrity: r.data.segment.integrity, contentDigest: r.data.segment.contentDigest, at, detail: r.data.segment.degraded?.label ?? null, receipt: r.data.receipt });
          }} />
      )}
      {error !== null && (
        <>
          <ErrorNote error={error} />
          <p className="eye-ev-note">The citation’s resolution above stays available. Reading the bytes needs the evidence-read authority this role holds today (observation.evidence.retrieve); nothing was widened for this page.</p>
        </>
      )}
      {seg !== null && seg.integrity === 'unavailable' && (
        <p className="eye-ev-degraded" role="status"><strong>◌ Bytes unavailable — {seg.degraded?.code ?? 'EYE-DEG-001'}.</strong> {seg.degraded?.label ?? 'the tier could not be reached'} Nothing about the bytes was verified or refuted.</p>
      )}
      {shown !== null && seg !== null && (
        <>
          <p role="status" className="eye-ev-note">
            {shown.citedBytes} cited byte(s) {seg.cited.start}–{seg.cited.end} shown highlighted within bytes {seg.served?.start}–{seg.served?.end} of {seg.byteLength} ·
            digest re-verified on this read ({seg.contentDigest.slice(0, 16)}…){shown.encoding === 'hex' ? ' · shown as hexadecimal' : ''}{shown.lossy ? ' · a character at the window’s edge could not be decoded (shown as �)' : ''}
            {receipt === null ? '' : ` · read under policy decision ${receipt.policyDecisionId.slice(0, 13)}…, audit seq ${receipt.auditSeq}`}
          </p>
          <pre className="eye-ev-bytes" tabIndex={0} aria-label={`${regionLabel}: the cited span is marked`}>
            <span className="eye-ev-context">{shown.before}</span><mark className="eye-ev-cited" aria-label="cited span">{shown.cited}</mark><span className="eye-ev-context">{shown.after}</span>
          </pre>
        </>
      )}
      {seg === null && scope === null && <p className="eye-ev-note">No bytes are shown: none were read on this page.</p>}
    </section>
  );
}

/* ───────────────────────── CustodyTimeline (CMP-030) ───────────────────────── */
export function CustodyTimeline({ rows, caption }: { rows: readonly CustodyRow[]; caption?: string }) {
  const t = custodyTimeline(rows);
  const id = useId();
  return (
    <section className="eye-ev-custody" aria-labelledby={id}>
      <p id={id} className="eye-text-label">{caption ?? 'Chain of custody'}</p>
      <p className="eye-ev-note">{custodySummary(rows)}</p>
      {t.length > 0 && (
        <ol className="eye-ev-timeline">
          {t.map((x) => (
            <li key={x.key} data-alarm={x.alarm ? 'true' : undefined}>
              <span aria-hidden="true" className="eye-ev-glyph">{x.glyph}</span> <strong>{x.word}</strong>{' — '}
              {x.at === null ? 'time not recorded' : <time dateTime={x.at}>{x.at}</time>} · {x.actor} · {x.verified}{x.note === null ? '' : ` · ${x.note}`}
            </li>
          ))}
        </ol>
      )}
      {t.length > 0 && (
        <div className="eye-ev-scroll" role="region" aria-label={`${caption ?? 'Chain of custody'} as a table`} tabIndex={0}>
          <table className="eye-table">
            <caption>{caption ?? 'Chain of custody'} — every event, oldest first</caption>
            <thead><tr><th scope="col">Event</th><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Digest</th><th scope="col">Note</th></tr></thead>
            <tbody>{t.map((x) => (<tr key={x.key}><td>{x.word}</td><td>{x.at ?? 'not recorded'}</td><td>{x.actor}</td><td>{x.verified}</td><td>{x.note ?? '—'}</td></tr>))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── RightsNotice (CMP-031) ───────────────────────── */
export function RightsNotice({ terms, contract, now }: { terms: ResolvedLeaf['rights']; contract: ContractRights | null; now?: Date }) {
  const n = rightsNotice({ terms, contract, now: now ?? new Date() });
  const id = useId();
  return (
    <section className="eye-ev-rights" aria-labelledby={id} data-state={n.state}>
      <p id={id} className="eye-text-label">Rights</p>
      {contract !== null && contract.rightsState !== null && <p><RightsBadge state={contract.rightsState} /> <span className="eye-ev-note">(the source contract’s own statement)</span></p>}
      <p className="eye-ev-rights-headline"><strong>{n.headline}</strong> · {n.expiry}</p>
      <ul className="eye-ev-lines">{n.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {n.blocksDecisionUse && <p className="eye-ev-note">Evidence under these terms is refused at every decision-active use (an option, a publication, an export, a gate) until rights are declared again.</p>}
    </section>
  );
}

/* ───────────────────────── VerificationPanel (CMP-032) ───────────────────────── */
export function VerificationPanel({ facets, receipt, onVerifyAgain, verifyLabel }: {
  facets: readonly VerificationFacet[];
  /** the policy decision the checks were read under (the receipt of the read) */
  receipt?: Receipt | null;
  /** "verify again" — a governed act the page supplies (the bytes: the segment read; §PX records trust verifications) */
  onVerifyAgain?: () => Promise<void>;
  verifyLabel?: string;
}) {
  const s = verificationSummary(facets);
  const id = useId();
  return (
    <section className="eye-ev-verify" aria-labelledby={id} data-outcome={s.outcome}>
      <p id={id} className="eye-text-label">Verification</p>
      <p><strong>{VERIFICATION_WORDS[s.outcome].glyph} {VERIFICATION_WORDS[s.outcome].word}</strong> overall · {s.text}</p>
      <div className="eye-ev-scroll" role="region" aria-label="Verification checks" tabIndex={0}>
        <table className="eye-table">
          <caption>Each check on this page — an unavailable check is never shown as failed</caption>
          <thead><tr><th scope="col">Check</th><th scope="col">Outcome</th><th scope="col">Detail</th><th scope="col">Checked at</th></tr></thead>
          <tbody>
            {facets.map((f, i) => (
              <tr key={`${f.facet}#${i}`} data-outcome={f.outcome}>
                <td>{f.facet}</td><td><strong>{VERIFICATION_WORDS[f.outcome].glyph} {VERIFICATION_WORDS[f.outcome].word}</strong></td><td>{f.detail}</td><td>{f.checkedAt ?? 'not checked'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="eye-ev-note">{receipt === null || receipt === undefined ? 'No policy decision is recorded for these checks on this page yet.' : `Read under policy decision ${receipt.policyDecisionId} (bundle-v1), audit seq ${receipt.auditSeq}.`}</p>
      {onVerifyAgain !== undefined && <GovernedButton label={verifyLabel ?? 'Verify the bytes again'} pendingLabel="Verifying the bytes" variant="quiet" onRun={onVerifyAgain} />}
    </section>
  );
}

/* ───────────────────────── EvidenceDisclosure (HX-01) ───────────────────────── */
export function EvidenceDisclosure({ model, defaultOpen }: { model: ReturnType<typeof evidenceDisclosure>; defaultOpen?: boolean }) {
  return (
    <div className="eye-ev-disclosure" data-ready={model.decisionReady ? 'true' : 'false'}>
      <p className="eye-ev-ready"><strong>{model.decisionReady ? '✓ Decision-ready evidence' : '◍ Viewable, not decision-ready'}</strong>{model.decisionReady ? '' : ` — ${model.reasons.length === 0 ? 'nothing resolved yet' : model.reasons.join('; ')}`}</p>
      <Disclosure title="Evidence disclosure — sources, citations, versions, cutoff, omissions, scope"
        authority="evidence is admitted under its source contracts; the citations are resolved under graph.provenance.read"
        uncertainty={model.decisionReady ? 'every citation resolves to exact, verifiable evidence' : `${model.reasons.length} citation(s) do not resolve cleanly`} defaultOpen={defaultOpen}>
        <dl className="eye-ev-dl">
          <div className="eye-ev-dl-row"><dt>Sources</dt><dd>{model.sources}</dd></div>
          <div className="eye-ev-dl-row"><dt>Citations</dt><dd>{model.citations}</dd></div>
          <div className="eye-ev-dl-row"><dt>Versions</dt><dd>{model.versions.length === 0 ? 'none cited' : <ul className="eye-ev-lines">{model.versions.map((v) => <li key={v}>{v}</li>)}</ul>}</dd></div>
          <div className="eye-ev-dl-row"><dt>Cutoff</dt><dd>{model.cutoff}</dd></div>
          <div className="eye-ev-dl-row"><dt>Omissions</dt><dd><ul className="eye-ev-lines">{model.omissions.map((o) => <li key={o}>{o}</li>)}</ul></dd></div>
          <div className="eye-ev-dl-row"><dt>Scope</dt><dd>{model.policyScope}</dd></div>
          <div className="eye-ev-dl-row"><dt>Resolution</dt><dd>{model.digest}</dd></div>
        </dl>
      </Disclosure>
    </div>
  );
}

/* ───────────────────────── CitationLink (CMP-026) ───────────────────────── */
export function CitationLink({ citation, resolution: given, scope, label }: {
  citation: CitationRef;
  /** the page's batch resolution of this citation: undefined while it is read, null when this read did not resolve it, 'on_open' to resolve it
   *  only when the citation is opened (a page with hundreds of citations — the outcome is then stated as "resolved when opened") */
  resolution: ResolutionView | null | undefined | 'on_open';
  /** with a scope, the drawer's viewers offer the governed read of the cited bytes */
  scope: Scope | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [lazy, setLazy] = useState<ResolutionView | null | undefined>(undefined);
  const [lazyError, setLazyError] = useState<ApiError | null>(null);
  const resolution = given === 'on_open' ? lazy : given;
  const text = label ?? citationLabel(citation);
  const href = citationHref(citation);
  const w = resolution === undefined || resolution === null ? null : OUTCOME_WORDS[resolution.outcome];
  const line = resolution === undefined || resolution === null ? null : citationLine(resolution);
  const onOpen = () => {
    setOpen(true);
    if (given === 'on_open' && lazy === undefined && scope !== null) {
      void evidenceApi.resolve(scope, [citation]).then((r) => {
        if (!r.ok || r.data === undefined) { setLazy(null); setLazyError(r.error ?? null); return; }
        const row = r.data.resolutions[0];
        setLazy(row === undefined ? null : toResolution(row));
      });
    }
  };
  const status = resolution === undefined ? (given === 'on_open' ? (open ? 'resolving…' : 'resolved when opened') : 'resolving…') : resolution === null ? '— not resolved on this read' : `${w!.glyph} ${w!.word}`;
  return (
    <span className="eye-ev-citation" data-outcome={resolution?.outcome ?? (resolution === null ? 'not_resolved' : 'resolving')}>
      <button type="button" className="eye-cld-btn-quiet eye-ev-citation-btn" onClick={onOpen} aria-haspopup="dialog">
        Open the citation {text}
      </button>{' '}
      <span className="eye-ev-outcome" data-outcome={resolution?.outcome}>{status}</span>
      {resolution !== undefined && resolution !== null && <> <SourcePreview resolution={resolution} /></>}
      <Drawer open={open} title={`Citation — ${text}`} onClose={() => setOpen(false)}>
        <div className="eye-ev-drawer">
          {lazyError !== null && <ErrorNote error={lazyError} />}
          {line === null ? <p className="eye-ev-note">{resolution === undefined ? 'The citation is being resolved…' : 'This read did not resolve the citation; the reason is stated on the page or above.'}</p> : (
            <>
              <p><strong>{line.outcome}</strong> · {line.binds}{line.ready ? ' · decision-ready' : ' · viewable, not decision-ready'}</p>
              {line.detail !== null && <p className="eye-ev-note">{line.detail}</p>}
              {resolution!.own.object !== null && <p className="eye-ev-note">{resolution!.own.object.type} “{resolution!.own.object.title}” · {resolution!.own.object.lifecycle} · {resolution!.own.object.truthState}{resolution!.own.object.synthetic ? ' · SYNTHETIC' : ''}</p>}
              {resolution!.truncated && <p className="eye-ev-note">The lineage was cut at {resolution!.depth} steps; not every evidence leaf is listed.</p>}
              {resolution!.leaves.map((leaf, i) => (
                <EvidenceCard key={`${leaf.path.join('>')}#${i}`} leaf={leaf}>
                  <p className="eye-ev-note">Path: {leaf.path.join(' → ')}{leaf.spanBasis === 'claim_lineage' ? ' (the span the claim’s lineage records)' : ''}</p>
                  {leaf.evidence !== null && <EvidenceViewer leaf={leaf} scope={scope} />}
                  {leaf.evidence !== null && <RightsNotice terms={leaf.rights} contract={leaf.contractRightsState === null ? null : { rightsState: leaf.contractRightsState, licence: null, permittedUse: [], attribution: null, retention: null }} />}
                </EvidenceCard>
              ))}
            </>
          )}
          {href !== null && <p><Link href={href}>Open the cited {citation.kind === 'evidence' ? 'evidence' : 'object'} on its own page</Link></p>}
        </div>
      </Drawer>
    </span>
  );
}
