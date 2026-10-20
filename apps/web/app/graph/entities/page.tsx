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
/* B81 ob — the entity on the canonical object header; the entity is addressable (`?entity=<id>[&at=<ISO instant>]`) */
import { ObjectHeader } from '../../../components/object';
import { isoInstant, routeId, type ObjectHeaderInput } from '../../../lib/object-b81';
import { LINK_OUTCOME_WORDS } from '../../../lib/shell-b80';
/** The entity's header: its record carries no owner (its resolution decisions are the resolution manager's); a projection that disagrees
 *  with its event log, or an answer served from the log while the projection is withdrawn, is an INCONSISTENCY the header names. */
function entityHeader(d: EntityDetail, isResolutionManager: boolean): ObjectHeaderInput {
  const e = d.entity;
  const inconsistencies = [
    ...(e.drift === undefined ? [] : [`the entities projection says ${e.drift.projected}, its event log says ${e.drift.log} — the log's state is served, the projection is unresolved`]),
    ...(e.projected === false ? ['the projection lacks this entity (served from the event log, metadata only)'] : []),
  ];
  return {
    type: 'ENT', id: e.entity_id, title: e.canonical_name, version: null, versionCount: null,
    owner: null, ownerRole: 'owner', ownerNotApplicable: 'no owner on an entity\'s record — its resolutions and splits are the resolution manager\'s acts',
    serverState: e.lifecycle_state, truth: null, synthetic: null, classification: null,
    time: [{ label: 'Created', value: fmtInstant(e.created_at) }, { label: 'Updated', value: fmtInstant(e.updated_at) }],
    trust: `${d.mentions.length} mention(s) resolved to it · ${d.identifiers.length} authoritative identifier(s)${d.projection.degraded ? ` · DEGRADED projection (${d.projection.label ?? d.projection.code ?? 'declared'})` : ''}`,
    authority: 'An entity is created by resolution; a merge is undone by a split, decided by a resolution manager.',
    relationships: [{ label: `${d.claims.length} claim(s) about it`, href: null }, ...(e.split_from === null ? [] : [{ label: 'the entity it was split from', href: `/graph/entities?entity=${e.split_from}` }]),
      ...(e.superseded_by === null ? [] : [{ label: 'the entity that superseded it', href: `/graph/entities?entity=${e.superseded_by}` }])],
    provenance: [{ label: `${d.resolutions.length} resolution(s) — method and score each (below)`, href: null }],
    receipt: d.receipt, effective: { support: 'honoured', asOf: d.knownAt }, inconsistencies,
    eligible: { correct: { can: isResolutionManager, reason: isResolutionManager ? null : 'you hold no resolution_manager binding in this domain' } },
  };
}
/* end B81 ob */

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
  /* B81 ob */ const [linkErr, setLinkErr] = useState<string | null>(null); /* end B81 ob */

  const load = async () => {
    const r = await graph.listEntities(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the entities could not be read');
      return;
    }
    setEntities(r.data.entities);
  };
  useEffect(() => {
    void (async () => {
      await load();
      /* B81 ob: a deep link opens exactly the entity (as of the instant) it names, or says it cannot — never another entity */
      const q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
      if (!q.has('entity')) return;
      const id = routeId(q.get('entity')); const at = q.get('at') === null ? null : isoInstant(q.get('at'));
      if (id === null || (q.get('at') !== null && at === null)) { setLinkErr(LINK_OUTCOME_WORDS.invalid); return; }
      const r = await graph.getEntity(scope, id, at ?? undefined);
      if (!r.ok || r.data === undefined || r.data.entity.entity_id !== id) { setLinkErr(`${LINK_OUTCOME_WORDS.unavailable}${r.error ? ` (${r.error.message})` : ''}`); return; }
      setOpen(id); setDetail(r.data);
      /* end B81 ob */
    })();
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* B81 ob */}{linkErr === null ? null : <p role="alert"><strong>Not opened.</strong> {linkErr}</p>}{/* end B81 ob */}
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
        <section aria-label={`Entity ${detail.entity.canonical_name}`} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          {/* B81 ob: the canonical object header (its h2 is the entity's canonical name, as before) */}<ObjectHeader level={2} input={entityHeader(detail, isResolutionManager)} />{/* end B81 ob */}
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
