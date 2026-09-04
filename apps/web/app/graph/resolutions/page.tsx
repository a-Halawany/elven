'use client';
/**
 * The resolution queue.
 *
 * Everything the resolver could not resolve on its own authority arrives here.
 * The screen shows, for every candidate, WHAT MATCHED and BY HOW MUCH — and, for
 * a model-assisted proposal, the mode it ran in, the model, the weights digest,
 * the runtime, the prompt and decoding digests and every candidate it ranked.
 *
 * A MODEL PROPOSAL IS EVIDENCE, NOT A DECISION. The screen says so and the server
 * enforces it: no proposal, however confident, can become an acceptance without a
 * person who is not the agent that proposed it, and that person must write a
 * reason.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type ResolutionRow, type EntityRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ModeBadge, ScrollBox, cardStyle, DefinitionRow,
  UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

const METHOD_LABEL: Record<string, string> = {
  deterministic_identifier: 'authoritative identifier',
  deterministic_name: 'normalised name',
  model_assisted: 'model-ranked candidate',
  human: 'a person',
};

export default function ResolutionsPage() {
  const { scope, isResolutionManager } = useShell();
  const [queue, setQueue] = useState<ResolutionRow[] | null>(null);
  const [open, setOpen] = useState<ResolutionRow | null>(null);
  const [reason, setReason] = useState('');
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [target, setTarget] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const [r, e] = await Promise.all([graph.queue(scope), graph.listEntities(scope)]);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the resolution queue could not be read');
      return;
    }
    setQueue(r.data.queue);
    const list = e.ok ? e.data?.entities : undefined;
    if (list !== undefined) setEntities(list);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (queue === null) return <Empty>reading the queue…</Empty>;

  const decide = async (decision: 'accept' | 'reject') => {
    if (open === null) return;
    const r = await graph.decide(scope, open.resolution_id, decision, reason,
      decision === 'accept' && target !== '' && target !== open.entity_id ? target : null);
    if (!r.ok || r.data === undefined) {
      throw new Error(r.error?.message ?? 'the decision was refused');
    }
    setReceipt(r.data.receipt);
    setOpen(null); setReason(''); setTarget('');
    await load();
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>
        Resolution queue
      </h1>
      <UnknownNote>
        Only an exact match on an <strong>authoritative external identifier</strong> resolves
        automatically. Everything here matched on a name, or was ranked by a model, or found
        nothing at all — and none of those may merge without a person.
      </UnknownNote>

      {queue.length === 0 ? (
        <Empty>Nothing is waiting for a decision.</Empty>
      ) : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start',
                            color: 'var(--eye-color-ink-muted)' }}>
            {queue.length} candidate(s), least certain first
          </caption>
          <thead>
            <tr>
              <Th>Mention</Th><Th>Proposed entity</Th><Th>Matched on</Th>
              <Th>Score</Th><Th>Mode</Th><Th>Proposed</Th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.resolution_id}>
                <Td>
                  <button
                    type="button" onClick={() => { setOpen(q); setReason(''); setTarget(q.entity_id); }}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: 'var(--eye-color-accent-default)', cursor: 'pointer',
                             textDecoration: 'underline', textAlign: 'start' }}
                  >
                    {q.mention_text}
                  </button>
                </Td>
                <Td>{q.entity?.canonical_name ?? <Mono>{q.entity_id.slice(0, 18)}…</Mono>}</Td>
                <Td>{METHOD_LABEL[q.method] ?? q.method}</Td>
                <Td mono>{Number(q.score).toFixed(2)}</Td>
                <Td>{q.mode === null ? '—' : <ModeBadge mode={q.mode} />}</Td>
                <Td>{fmtInstant(q.proposed_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null ? null : (
        <section aria-labelledby="res-h" style={{ ...cardStyle,
          marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="res-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {open.mention_text}
          </h2>
          <dl>
            <DefinitionRow term="Proposed entity">
              {open.entity?.canonical_name ?? <Mono>{open.entity_id}</Mono>}
            </DefinitionRow>
            <DefinitionRow term="Method">{METHOD_LABEL[open.method] ?? open.method}</DefinitionRow>
            <DefinitionRow term="Rule">
              <Mono>{open.rule_id}@{open.rule_version}</Mono>
            </DefinitionRow>
            <DefinitionRow term="Score"><Mono>{Number(open.score).toFixed(2)}</Mono></DefinitionRow>
            <DefinitionRow term="Proposed by">
              <Mono>{open.proposer_principal_id.slice(0, 8)}…</Mono>{' '}
              <span style={{ color: 'var(--eye-color-ink-muted)' }}>
                — this principal may not decide it
              </span>
            </DefinitionRow>
            <DefinitionRow term="Evidence">
              <Mono title={open.evidence_object_id}>{open.evidence_object_id.slice(0, 18)}…</Mono>{' '}
              <Mono title={open.evidence_digest}>{open.evidence_digest.slice(0, 24)}…</Mono>
            </DefinitionRow>
          </dl>

          {open.method !== 'model_assisted' ? null : (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>
                Model lineage — this ranking is evidence, not a decision
              </h3>
              <dl>
                <DefinitionRow term="Mode">
                  <ModeBadge mode={open.mode ?? 'replay'} />
                </DefinitionRow>
                <DefinitionRow term="Model"><Mono>{open.model_id}</Mono></DefinitionRow>
                <DefinitionRow term="Weights digest">
                  <Mono title={open.model_weights_digest ?? ''}>
                    {(open.model_weights_digest ?? '').slice(0, 32)}…
                  </Mono>
                </DefinitionRow>
                <DefinitionRow term="Runtime"><Mono>{open.runtime_version}</Mono></DefinitionRow>
                <DefinitionRow term="Prompt digest">
                  <Mono title={open.prompt_digest ?? ''}>
                    {(open.prompt_digest ?? '').slice(0, 32)}…
                  </Mono>
                </DefinitionRow>
                <DefinitionRow term="Decoding digest">
                  <Mono title={open.decoding_digest ?? ''}>
                    {(open.decoding_digest ?? '').slice(0, 32)}…
                  </Mono>
                </DefinitionRow>
                <DefinitionRow term="Model confidence">
                  <Mono>{open.model_confidence ?? '—'}</Mono>
                </DefinitionRow>
              </dl>
            </>
          )}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>What matched</h3>
          <ScrollBox label="The resolver's own evidence">
            {JSON.stringify(open.match_evidence, null, 2)}
          </ScrollBox>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>
            Every candidate considered ({open.candidate_set.length})
          </h3>
          <ScrollBox label="The candidate set, including the ones not chosen">
            {JSON.stringify(open.candidate_set, null, 2)}
          </ScrollBox>

          {!isResolutionManager ? (
            <UnknownNote>
              Deciding a resolution needs the <Mono>resolution_manager</Mono> role in this domain.
              The server refuses the decision regardless of what this interface offers.
            </UnknownNote>
          ) : (
            <>
              <label htmlFor="dtarget">
                Resolve it to
              </label>
              <select id="dtarget" style={inputStyle} value={target}
                      onChange={(e) => setTarget(e.target.value)}>
                {entities.map((e) => (
                  <option key={e.entity_id} value={e.entity_id}>
                    {e.canonical_name}
                    {e.entity_id === open.entity_id ? ' — as proposed' : ' — instead of the proposal'}
                  </option>
                ))}
              </select>
              {target === open.entity_id ? null : (
                <UnknownNote>
                  You are resolving this mention to an entity the resolver did not propose. The
                  record will say a <strong>person</strong> chose it, keep your reason, and preserve
                  the resolver&rsquo;s original proposal inside the match evidence.
                </UnknownNote>
              )}
              <label htmlFor="dreason">
                Why (at least 8 characters — a decision without a reason is not a decision)
              </label>
              <input id="dreason" style={inputStyle} value={reason}
                     onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)',
                            marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton
                  label="Accept" pendingLabel="accepting" disabled={reason.trim().length < 8}
                  onRun={() => decide('accept')} />
                <GovernedButton
                  label="Reject" pendingLabel="rejecting" variant="critical"
                  disabled={reason.trim().length < 8} onRun={() => decide('reject')} />
              </div>
            </>
          )}
          <Receipt receipt={receipt} />
        </section>
      )}
    </>
  );
}
