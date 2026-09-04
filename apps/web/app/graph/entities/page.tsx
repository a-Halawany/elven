'use client';
/**
 * Entities — the registry, an entity's whole history, and the split that undoes a
 * wrong merge.
 *
 * AN ENTITY'S HISTORY IS THE LIST OF MENTIONS THAT RESOLVED TO IT. Each keeps its
 * own claim, its own evidence and its own confidence, and the row says by what
 * method and at what score it was resolved — and whether a person decided it or
 * an authoritative identifier did. Superseded and rejected resolutions are shown
 * WITH the live ones, because an entity's history includes the mentions taken
 * away from it.
 *
 * KNOWN-AT IS A RECORD-TIME QUESTION and the screen asks it as one: "what did this
 * entity hold on 14 January?" is answered from when each resolution was accepted
 * and when it stopped being the answer.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type EntityRow, type EntityDetail, type ResolutionRow }
  from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote,
  GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

const METHOD_LABEL: Record<string, string> = {
  deterministic_identifier: 'authoritative identifier',
  deterministic_name: 'normalised name',
  model_assisted: 'model-ranked candidate',
  human: 'a person',
};

function MethodBadge({ method }: { method: string }) {
  const automatic = method === 'deterministic_identifier';
  return (
    <span
      style={{
        display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline',
        fontSize: 'var(--eye-type-label-sm)',
        color: automatic ? 'var(--eye-color-success)' : 'var(--eye-color-warning-strong)',
      }}
    >
      <span aria-hidden="true">{automatic ? '⦿' : '⚖'}</span>
      <span>{METHOD_LABEL[method] ?? method}</span>
    </span>
  );
}

export default function EntitiesPage() {
  const { scope, isResolutionManager } = useShell();
  const [entities, setEntities] = useState<EntityRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [knownAt, setKnownAt] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [splitName, setSplitName] = useState('');
  const [splitReason, setSplitReason] = useState('');
  const [splitPick, setSplitPick] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const r = await graph.listEntities(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the entities could not be read');
      return;
    }
    setEntities(r.data.entities);
  };
  useEffect(() => { void load(); }, [scope]);

  const openEntity = async (id: string, at?: string) => {
    setOpen(id); setDetail(null); setSplitPick([]);
    const r = await graph.getEntity(scope, id, at === undefined || at === '' ? undefined : at);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'that entity could not be read');
      return;
    }
    setDetail(r.data);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (entities === null) return <Empty>reading entities…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Entities</h1>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockEnd: 'var(--eye-space-16)' }}>
        <GovernedButton
          label="Run the resolver" pendingLabel="resolving"
          onRun={async () => {
            const r = await graph.resolve(scope, 200, null);
            if (!r.ok) throw new Error(r.error?.message ?? 'the resolver run failed');
            await load();
          }}
        />
        <GovernedButton
          label="Build edges" pendingLabel="building" variant="quiet"
          onRun={async () => {
            const r = await graph.buildEdges(scope);
            if (!r.ok) throw new Error(r.error?.message ?? 'the edge build failed');
          }}
        />
      </div>

      {entities.length === 0 ? <Empty>No entities have been resolved yet.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start',
                            color: 'var(--eye-color-ink-muted)' }}>
            {entities.length} entity(ies)
          </caption>
          <thead>
            <tr>
              <Th>Name</Th><Th>Type</Th><Th>Mentions</Th><Th>State</Th><Th>Origin</Th><Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.entity_id}>
                <Td>
                  <button
                    type="button" onClick={() => void openEntity(e.entity_id, knownAt)}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: 'var(--eye-color-accent-default)', cursor: 'pointer',
                             textDecoration: 'underline', textAlign: 'start' }}
                  >
                    {e.canonical_name}
                  </button>
                </Td>
                <Td>{e.entity_type}</Td>
                <Td mono>{e.mention_count ?? 0}</Td>
                <Td>{e.lifecycle_state}</Td>
                <Td>{e.split_from === null ? 'resolved' : 'split from another entity'}</Td>
                <Td>{fmtInstant(e.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null ? null : detail === null ? <Empty>reading that entity…</Empty> : (
        <section aria-labelledby="ent-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="ent-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {detail.entity.canonical_name}
          </h2>
          <dl>
            <DefinitionRow term="Type">{detail.entity.entity_type}</DefinitionRow>
            <DefinitionRow term="Normalised name"><Mono>{detail.entity.normalized_name}</Mono></DefinitionRow>
            <DefinitionRow term="State">{detail.entity.lifecycle_state}</DefinitionRow>
            <DefinitionRow term="Split from">
              {detail.entity.split_from === null ? 'not a split' :
                <Mono>{detail.entity.split_from.slice(0, 18)}…</Mono>}
            </DefinitionRow>
            <DefinitionRow term="Identifiers">
              {detail.identifiers.length === 0 ? 'none — this entity resolves by name only' : (
                <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
                  {detail.identifiers.map((i) => (
                    <li key={String(i['identifier_id'])}>
                      <Mono>{String(i['system_key'])}</Mono>{' '}
                      <Mono>{String(i['identifier_value'])}</Mono>
                    </li>
                  ))}
                </ul>
              )}
            </DefinitionRow>
          </dl>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Known at</h3>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            <label htmlFor="knownAt" style={{ alignSelf: 'center' }}>
              What did this entity hold at
            </label>
            <input
              id="knownAt" type="datetime-local" style={inputStyle} value={knownAt}
              onChange={(e) => setKnownAt(e.target.value)}
            />
            <GovernedButton
              label="Ask" pendingLabel="asking" variant="quiet"
              onRun={async () => {
                await openEntity(detail.entity.entity_id,
                  knownAt === '' ? undefined : new Date(knownAt).toISOString());
              }}
            />
          </div>
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            {detail.knownAt === null
              ? 'Showing what this entity holds now.'
              : `Showing what this entity held at ${fmtInstant(detail.knownAt)} — no hindsight.`}
          </p>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>
            Mentions ({detail.mentions.length})
          </h3>
          {detail.mentions.length === 0 ? <Empty>No mentions at that instant.</Empty> : (
            <table className="eye-table" style={tableStyle}>
              <thead>
                <tr>
                  {isResolutionManager ? <Th>Move</Th> : null}
                  <Th>Mention</Th><Th>Resolved by</Th><Th>Score</Th><Th>Accepted</Th><Th>Decided by</Th>
                </tr>
              </thead>
              <tbody>
                {detail.mentions.map((m: ResolutionRow) => (
                  <tr key={m.resolution_id}>
                    {isResolutionManager ? (
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`move ${m.mention_text} to a new entity`}
                          checked={splitPick.includes(m.resolution_id)}
                          onChange={(e) => setSplitPick(
                            e.target.checked
                              ? [...splitPick, m.resolution_id]
                              : splitPick.filter((x) => x !== m.resolution_id))}
                        />
                      </Td>
                    ) : null}
                    <Td>{m.mention_text}</Td>
                    <Td><MethodBadge method={m.method} /></Td>
                    <Td mono>{Number(m.score).toFixed(2)}</Td>
                    <Td>{m.accepted_at === null ? '—' : fmtInstant(m.accepted_at)}</Td>
                    <Td>
                      {m.decided_by === null
                        ? 'no person — an authoritative identifier resolved it'
                        : <Mono>{m.decided_by.slice(0, 8)}…</Mono>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>
            Full resolution history ({detail.resolutions.length})
          </h3>
          <UnknownNote>
            Superseded and rejected resolutions are listed here with the live ones. An entity&rsquo;s
            history includes the mentions taken away from it and the proposals a person turned down;
            hiding either would make this a summary of the present rather than a record.
          </UnknownNote>
          <table className="eye-table" style={tableStyle}>
            <thead>
              <tr><Th>Mention</Th><Th>State</Th><Th>Method</Th><Th>Rule</Th><Th>Reason</Th></tr>
            </thead>
            <tbody>
              {detail.resolutions.map((m: ResolutionRow) => (
                <tr key={m.resolution_id}>
                  <Td>{m.mention_text}</Td>
                  <Td>{m.state}</Td>
                  <Td><MethodBadge method={m.method} /></Td>
                  <Td mono>{m.rule_id}@{m.rule_version}</Td>
                  <Td>{m.decision_reason ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          {isResolutionManager && splitPick.length > 0 ? (
            <section aria-labelledby="split-h" style={{ ...cardStyle,
              marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="split-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>
                Split {splitPick.length} mention(s) onto a new entity
              </h3>
              <UnknownNote>
                Nothing is deleted. The resolutions that put these mentions here are{' '}
                <strong>superseded</strong>, keeping their reason and their score, and a known-at
                query positioned before the split still reproduces the merged view.
              </UnknownNote>
              <label htmlFor="sname">New entity name</label>
              <input id="sname" style={inputStyle} value={splitName}
                     onChange={(e) => setSplitName(e.target.value)} />
              <label htmlFor="sreason">Why they are not the same thing</label>
              <input id="sreason" style={inputStyle} value={splitReason}
                     onChange={(e) => setSplitReason(e.target.value)} />
              <GovernedButton
                label="Split" pendingLabel="splitting" variant="critical"
                disabled={splitName.trim().length < 1 || splitReason.trim().length < 8}
                onRun={async () => {
                  const r = await graph.split(scope, detail.entity.entity_id, {
                    resolutionIds: splitPick, canonicalName: splitName,
                    entityType: detail.entity.entity_type, reason: splitReason });
                  if (!r.ok || r.data === undefined) {
                    throw new Error(r.error?.message ?? 'the split was refused');
                  }
                  setReceipt(r.data.receipt);
                  setSplitPick([]); setSplitName(''); setSplitReason('');
                  await load();
                  await openEntity(detail.entity.entity_id);
                }}
              />
              <Receipt receipt={receipt} />
            </section>
          ) : null}

          <ScrollBox label="The entity's event log">
            {JSON.stringify(detail.events, null, 2)}
          </ScrollBox>
        </section>
      )}
    </>
  );
}
