'use client';
/**
 * The claims browser.
 *
 * A claim is shown WITH the mode that produced it and the confidence it carries.
 * Neither is a decoration: a reader deciding whether to act on "transits fell
 * 51%" needs to know it came from a recorded response at 0.62 confidence and is
 * queued for review, and needs it in the same glance as the number.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { intelligence, type ClaimRow } from '../../../lib/intelligence';
import { Empty, LiveStatus, Mono, ModeBadge, ScrollBox, cardStyle,
  DefinitionRow, UnknownNote, fmtInstant } from '../../../components/observation';
/* B81 ob — the claim on the canonical object header; the claim is addressable (`?claim=<id>[&v=<n>]`) */
import { ObjectHeader } from '../../../components/object';
import { ErrorNote } from '../../../components/ui';
import { routeId, routeVersion, type ObjectHeaderInput } from '../../../lib/object-b81';
import { LINK_OUTCOME_WORDS } from '../../../lib/shell-b80';
type ClaimRead = { versions: Array<Record<string, unknown>>; row: Record<string, unknown>; receipt: { policyDecisionId: string; auditSeq: number } };
/** The claim's header from its FULL canonical row (the get route's) — the list's row carries no owner or classification. */
function claimHeader(c: ClaimRow, read: ClaimRead | null): ObjectHeaderInput {
  const row = read?.row ?? null;
  const str = (k: string) => (row === null || row[k] === undefined || row[k] === null ? null : String(row[k]));
  return {
    type: 'CLM', id: c.object_id, title: `${c.payload.subject} ${c.payload.predicate} ${c.payload.object_value}`, version: Number(c.object_version),
    versionCount: read === null ? null : read.versions.length, latestVersion: read === null ? null : Math.max(...read.versions.map((v) => Number(v['object_version']))),
    owner: read === null ? 'reading…' : str('accountable_owner'), ownerRole: 'accountable owner', serverState: c.lifecycle_state, truth: c.truth_state,
    synthetic: row === null ? null : row['synthetic_state'] === true, classification: str('classification'),
    time: [{ label: 'Recorded', value: fmtInstant(c.recorded_at) }, { label: 'Event', value: c.event_time === null ? null : fmtInstant(c.event_time) }],
    trust: `confidence ${c.payload.confidence.toFixed(2)} · ${c.payload.lineage.mode} · review ${c.payload.review?.state ?? 'not_required'}`,
    authority: c.payload.review?.decider ? `Reviewed by ${c.payload.review.decider} (${c.payload.review.state}).` : 'Admitted by extraction under intelligence.claim.admit; no approval exists for a claim.',
    relationships: [{ label: 'its contradictions', href: '/intelligence/contradictions' }],
    provenance: [{ label: `evidence ${c.payload.lineage.evidence_object_id.slice(0, 8)}… bytes ${c.payload.lineage.byte_start}–${c.payload.lineage.byte_end}`, href: `/observation/evidence/${c.payload.lineage.evidence_object_id}` },
      { label: `method ${c.payload.lineage.method_key} · prompt ${c.payload.lineage.prompt_version}`, href: null }],
    receipt: read?.receipt ?? null, effective: { support: 'live_only', asOf: null },
  };
}
/* end B81 ob */

const TYPE_LABEL: Record<string, string> = {
  ENT: 'entity', EVT: 'event', CLM: 'claim', REL: 'relationship', ASM: 'assessment',
};

function ConfidenceBadge({ value, review }: { value: number; review: string }) {
  const queued = review === 'queued';
  return (
    <span
      style={{
        display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline',
        fontFamily: 'var(--eye-font-mono)', fontSize: 'var(--eye-type-label-sm)',
        color: queued ? 'var(--eye-color-warning-strong)' : 'var(--eye-color-ink-default)',
      }}
    >
      <span aria-hidden="true">{queued ? '⚖' : '•'}</span>
      <span>{value.toFixed(2)}</span>
      <span>{queued ? '(queued for review)' : ''}</span>
    </span>
  );
}

export default function ClaimsPage() {
  const { scope } = useShell();
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [open, setOpen] = useState<ClaimRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* B81 ob */ const [read, setRead] = useState<ClaimRead | null>(null);
  const [linkErr, setLinkErr] = useState<{ words: string; error: { code: string; message: string; correlationId: string } | null } | null>(null);
  const openClaim = async (id: string, version: number | null) => {
    setRead(null); setLinkErr(null);
    const r = await intelligence.getClaim(scope, id);
    const rows = (r.data?.versions ?? []) as unknown as Array<Record<string, unknown>>;
    if (!r.ok || r.data === undefined || r.data.current === null || r.data.current.object_id !== id) { setOpen(null); setLinkErr({ words: LINK_OUTCOME_WORDS.unavailable, error: r.error ?? null }); return; }
    const pick = version === null ? rows[rows.length - 1] : rows.find((x) => Number(x['object_version']) === version);
    if (pick === undefined) { setOpen(null); setLinkErr({ words: `The link names version ${String(version)}, which this claim does not record (${rows.length} version(s) are recorded). No other version is shown in its place.`, error: null }); return; }
    setOpen(pick as unknown as ClaimRow); setRead({ versions: rows, row: pick, receipt: r.data.receipt });
  };
  /* end B81 ob */

  useEffect(() => {
    void (async () => {
      const r = await intelligence.listClaims(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the claims could not be read');
        return;
      }
      setClaims(r.data.claims);
      /* B81 ob: a deep link opens exactly the claim (and version) it names, or says it cannot */
      const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
      if (q.has('claim')) {
        const id = routeId(q.get('claim')); const v = q.get('v') === null ? null : routeVersion(q.get('v'));
        if (id === null || v === 'latest' || (q.get('v') !== null && v === null)) setLinkErr({ words: LINK_OUTCOME_WORDS.invalid, error: null });
        else await openClaim(id, v);
      }
      /* end B81 ob */
    })();
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (claims === null) return <Empty>reading claims…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Claims</h1>
      {/* B81 ob */}{linkErr === null ? null : <><p role="alert"><strong>Not opened.</strong> {linkErr.words}</p><ErrorNote error={linkErr.error} /></>}{/* end B81 ob */}
      {claims.length === 0 ? (
        <Empty>No claims have been extracted yet.</Empty>
      ) : (
        <table className="eye-table" style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>
            {claims.length} claim(s), current version of each
          </caption>
          <thead>
            <tr>
              <th scope="col">Kind</th><th scope="col">Subject</th><th scope="col">Predicate</th>
              <th scope="col">Value</th><th scope="col">Confidence</th><th scope="col">Mode</th>
              <th scope="col">Version</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.object_id}>
                <td data-label="Kind">{TYPE_LABEL[c.object_type] ?? c.object_type}</td>
                <td data-label="Subject">
                  <button
                    type="button"
                    onClick={() => { setOpen(c); /* B81 ob */ void openClaim(c.object_id, c.object_version); /* end B81 ob */ }}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: 'var(--eye-color-accent-default)', cursor: 'pointer',
                             textDecoration: 'underline', textAlign: 'start' }}
                  >
                    {c.payload.subject}
                  </button>
                </td>
                <td data-label="Predicate">{c.payload.predicate}</td>
                <td data-label="Value">{c.payload.object_value}</td>
                <td data-label="Confidence">
                  <ConfidenceBadge value={c.payload.confidence} review={c.payload.review?.state ?? ''} />
                </td>
                <td data-label="Mode"><ModeBadge mode={c.payload.lineage.mode} /></td>
                <td data-label="Version"><Mono>v{c.object_version}</Mono></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null ? null : (
        <section aria-labelledby="lin-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          {/* B81 ob */}<ObjectHeader level={2} input={claimHeader(open, read)} />{/* end B81 ob */}
          <h2 id="lin-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            Lineage — how this claim was produced
          </h2>
          <dl>
            <DefinitionRow term="Mode"><ModeBadge mode={open.payload.lineage.mode} /></DefinitionRow>
            <DefinitionRow term="Method"><Mono>{open.payload.lineage.method_key}</Mono></DefinitionRow>
            <DefinitionRow term="Model">
              <Mono>{open.payload.lineage.model_id}</Mono>
            </DefinitionRow>
            <DefinitionRow term="Weights digest">
              <Mono title={open.payload.lineage.model_weights_digest}>
                {open.payload.lineage.model_weights_digest.slice(0, 32)}…
              </Mono>
            </DefinitionRow>
            <DefinitionRow term="Runtime"><Mono>{open.payload.lineage.runtime_version}</Mono></DefinitionRow>
            <DefinitionRow term="Prompt version"><Mono>{open.payload.lineage.prompt_version}</Mono></DefinitionRow>
            <DefinitionRow term="Decoding digest">
              <Mono title={open.payload.lineage.decoding_digest}>
                {open.payload.lineage.decoding_digest.slice(0, 32)}…
              </Mono>
            </DefinitionRow>
            <DefinitionRow term="Extraction identity">
              <Mono title={open.payload.lineage.extraction_identity}>
                {open.payload.lineage.extraction_identity.slice(0, 32)}…
              </Mono>
            </DefinitionRow>
            <DefinitionRow term="Evidence">
              <Mono title={open.payload.lineage.evidence_object_id}>
                {open.payload.lineage.evidence_object_id.slice(0, 18)}…
              </Mono>{' '}
              bytes {open.payload.lineage.byte_start}–{open.payload.lineage.byte_end}
            </DefinitionRow>
            <DefinitionRow term="Evidence digest">
              <Mono title={open.payload.lineage.evidence_digest}>
                {open.payload.lineage.evidence_digest.slice(0, 32)}…
              </Mono>
            </DefinitionRow>
            <DefinitionRow term="Read authorised by">
              <Mono title={open.payload.lineage.retrieval_decision_id}>
                POL {String(open.payload.lineage.retrieval_decision_id ?? '').slice(0, 8)}…
              </Mono>{' '}
              <span style={{ color: 'var(--eye-color-ink-muted)' }}>
                audit #{open.payload.lineage.retrieval_audit_seq} — the
                {' '}<Mono>observation.evidence.retrieve</Mono> decision that permitted reading these bytes
              </span>
            </DefinitionRow>
            <DefinitionRow term="Truth state"><Mono>{open.truth_state}</Mono></DefinitionRow>
            <DefinitionRow term="Recorded">{fmtInstant(open.recorded_at)}</DefinitionRow>
            <DefinitionRow term="Review">
              {open.payload.review?.state ?? 'not_required'}
              {open.payload.review?.reason === null || open.payload.review?.reason === undefined
                ? '' : ` — ${open.payload.review.reason}`}
            </DefinitionRow>
          </dl>
          <UnknownNote>
            Reading the evidence and writing this claim were <strong>two separate decisions</strong>.
            The read ran under <Mono>observation.evidence.retrieve</Mono> and left its own custody
            entry; the write ran under <Mono>intelligence.claim.admit</Mono>, which authorises writing
            claims and does not authorise reading raw bytes.
          </UnknownNote>
          <ScrollBox label="The claim as stored">
            {JSON.stringify(open.payload, null, 2)}
          </ScrollBox>
        </section>
      )}
    </>
  );
}
