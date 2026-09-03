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
  DefinitionRow, fmtInstant } from '../../../components/observation';

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

  useEffect(() => {
    void (async () => {
      const r = await intelligence.listClaims(scope);
      if (!r.ok || r.data === undefined) {
        setProblem(r.error?.message ?? 'the claims could not be read');
        return;
      }
      setClaims(r.data.claims);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (claims === null) return <Empty>reading claims…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Claims</h1>
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
                    onClick={() => setOpen(c)}
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
            <DefinitionRow term="Truth state"><Mono>{open.truth_state}</Mono></DefinitionRow>
            <DefinitionRow term="Recorded">{fmtInstant(open.recorded_at)}</DefinitionRow>
            <DefinitionRow term="Review">
              {open.payload.review?.state ?? 'not_required'}
              {open.payload.review?.reason === null || open.payload.review?.reason === undefined
                ? '' : ` — ${open.payload.review.reason}`}
            </DefinitionRow>
          </dl>
          <ScrollBox label="The claim as stored">
            {JSON.stringify(open.payload, null, 2)}
          </ScrollBox>
        </section>
      )}
    </>
  );
}
