'use client';
/**
 * Revisions — commit a CHANGE SET as ONE graph revision (CP-6 B23, migration 0084, L4-I02 CommitGraphRevision).
 *
 * The domain's graph has a REVISION: one step per committed graph transaction. A change set — new entities (nodes), identifiers and
 * edges, each naming the claim version it rests on — is made AGAINST the head the person read, names the domain's active ontology
 * version, and is committed under an IDEMPOTENCY KEY. The server validates every item and applies all of them or none; the same key
 * with the same change set answers the first result (a retry after a lost answer is safe), and a head that moved since the read is a
 * conflict: the page says so and offers to reload the head — it never re-bases a change set on its own.
 *
 * Nothing here predicts a result: the revision, the ids and the counts are rendered as the server returned them, and a refusal is
 * shown verbatim (status, code, message).
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type RevisionChangeSet, type RevisionCommitted, type RevisionHead } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
/** A failed call, as the server answered it. */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const newKey = () => `revision/${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())}`;

/** A starting change set naming the active ontology version — the shape, not a guess at the person's facts. */
function template(head: RevisionHead | null): string {
  const cs: RevisionChangeSet = {
    ontology: { version_id: head?.ontology[0]?.version_id ?? null },
    nodes: [{ ref: 'supplier', entity_type: 'organization', canonical_name: '', provenance: { claim_object_id: '', claim_version: 1 } }],
    identifiers: [],
    edges: [{ subject: { ref: 'supplier' }, predicate: '', object: { entity_id: '' }, valid_from: new Date().toISOString().slice(0, 10), provenance: { claim_object_id: '', claim_version: 1 } }],
  };
  return JSON.stringify(cs, null, 2);
}

export default function RevisionsPage() {
  const { scope } = useShell();
  const [head, setHead] = useState<RevisionHead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [key, setKey] = useState(newKey);
  const [expected, setExpected] = useState<number | null>(null);
  const [result, setResult] = useState<RevisionCommitted | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [commitProblem, setCommitProblem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async (resetText: boolean) => {
    const r = await graph.revisionHead(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the revision head could not be read')); return; }
    setProblem(null); setHead(r.data.head); setExpected(r.data.head.revision); setConflict(false);
    if (resetText) setText(template(r.data.head));
  }, [scope]);
  useEffect(() => { void load(true); }, [load]);

  let parsed: RevisionChangeSet | null = null; let parseProblem: string | null = null;
  try { parsed = text.trim() === '' ? null : (JSON.parse(text) as RevisionChangeSet); } catch (e) { parseProblem = `the change set is not JSON: ${(e as Error).message}`; }

  if (problem !== null && head === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (head === null) return <Empty>reading the revision head…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Revisions</h1>
      <UnknownNote>
        A <strong>change set</strong> — new entities, identifiers and edges, each resting on a claim version — is committed as <strong>one
        revision</strong>, all or nothing, against the head you read. Retrying under the same key answers the first result; a head that
        moved since your read is a conflict: reload the head and review your change set.
      </UnknownNote>

      <section style={cardStyle} aria-labelledby="rev-head">
        <h2 id="rev-head" style={h3}>The head</h2>
        <dl>
          <DefinitionRow term="Revision"><Mono>{head.revision}</Mono>{head.updatedAt === null ? ' (no graph write since revisions began)' : ` · since ${fmtInstant(head.updatedAt)}`}</DefinitionRow>
          <DefinitionRow term="Active ontology">
            {head.ontology.length === 0 ? 'none — the change set names none (version_id null)'
              : head.ontology.map((o) => <span key={o.version_id}><Mono>{o.namespace} v{o.version}</Mono> <Mono>{o.version_id}</Mono> — types <Mono>{o.entity_types.join(', ')}</Mono></span>)}
          </DefinitionRow>
        </dl>
        <GovernedButton label="Reload the head" pendingLabel="reading" variant="quiet" onRun={() => load(false)} />
      </section>

      <section style={cardStyle} aria-labelledby="rev-commit">
        <h2 id="rev-commit" style={h3}>Commit a revision</h2>
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
          <div>
            <label htmlFor="rev-key" style={{ display: 'block' }}>Idempotency key (keep it to retry; a new change set takes a new key)</label>
            <input id="rev-key" style={{ ...inputStyle, inlineSize: '100%' }} value={key} maxLength={200} onChange={(e) => setKey(e.target.value)} />
            <button type="button" style={{ marginBlockStart: 'var(--eye-space-4)' }} onClick={() => setKey(newKey())}>New key</button>
          </div>
          <p style={muted}>Expected revision: <Mono>{expected ?? '—'}</Mono> (the head as read)</p>
          <label htmlFor="rev-json">Change set (JSON: ontology, nodes, identifiers, edges)</label>
          <textarea id="rev-json" style={{ ...textareaStyle, minBlockSize: '18rem', fontFamily: 'var(--eye-font-mono)' }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          {parseProblem === null ? null : <LiveStatus>{parseProblem}</LiveStatus>}
          <GovernedButton label="Commit the revision" pendingLabel="committing" disabled={parsed === null || expected === null || key.length === 0}
            onRun={async () => {
              if (parsed === null || expected === null) return;
              setCommitProblem(null); setConflict(false);
              const r = await graph.commitRevision(scope, key, expected, parsed);
              if (!r.ok || r.data === undefined) {
                const m = refusal(r, 'the commit was not answered');
                setCommitProblem(m); setConflict(r.status === 409 && /\(conflict\)/.test(r.error?.message ?? ''));
                throw new Error(m);
              }
              setResult(r.data.revision); setReceipt(r.data.receipt);
              await load(false);
            }} />
          {commitProblem === null ? null : <LiveStatus assertive>{commitProblem}</LiveStatus>}
          {conflict ? (
            <p role="alert">
              The domain moved past the revision this change set was made against. Reload the head, check that your change set still holds,
              and commit again (a new key if you change it). <GovernedButton label="Reload the head" pendingLabel="reading" variant="quiet" onRun={() => load(false)} />
            </p>
          ) : null}
        </div>
      </section>

      {result === null ? null : (
        <section style={cardStyle} aria-labelledby="rev-result">
          <h2 id="rev-result" style={h3}>Revision {result.revision}{result.repeated ? ' (a repeat — the first answer)' : ''}</h2>
          <Receipt receipt={receipt} />
          <dl>
            <DefinitionRow term="Revision id"><Mono>{result.revision_id}</Mono></DefinitionRow>
            <DefinitionRow term="Made against">revision <Mono>{result.expected}</Mono> · key <Mono>{result.idempotency_key}</Mono></DefinitionRow>
            <DefinitionRow term="Counts">
              nodes {result.counts.nodes} · identifiers {result.counts.identifiers} (already attached {result.counts.identifiers_already}) · edges {result.counts.edges} · superseded {result.counts.superseded}
            </DefinitionRow>
          </dl>
          <ScrollBox label="The ids written">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Kind</Th><Th>Name</Th><Th>Id</Th></tr></thead>
              <tbody>
                {result.node_ids.map((n) => <tr key={n.entity_id}><Td>entity ({n.entity_type})</Td><Td>{n.ref} — {n.canonical_name}</Td><Td mono>{n.entity_id}</Td></tr>)}
                {result.edge_ids.map((e) => <tr key={e.edge_id}><Td>edge</Td><Td mono>{e.predicate}</Td><Td mono>{e.edge_id}</Td></tr>)}
                {result.superseded_edges.map((e) => <tr key={e.edge_id}><Td>superseded edge</Td><Td>by {e.superseded_by.slice(0, 8)}…</Td><Td mono>{e.edge_id}</Td></tr>)}
              </tbody>
            </table>
          </ScrollBox>
        </section>
      )}

      <section style={cardStyle} aria-labelledby="rev-recent">
        <h2 id="rev-recent" style={h3}>Latest revisions</h2>
        {head.recent.length === 0 ? <Empty>No revision committed yet.</Empty> : (
          <ScrollBox label="Latest revisions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Revision</Th><Th>Committed</Th><Th>Key</Th><Th>Counts</Th></tr></thead>
              <tbody>{head.recent.map((r) => (
                <tr key={r.revision_id}>
                  <Td mono>{r.revision}</Td><Td>{fmtInstant(r.committed_at)}</Td><Td mono>{r.idempotency_key}</Td>
                  <Td>{Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}</Td>
                </tr>))}</tbody>
            </table>
          </ScrollBox>
        )}
      </section>
    </>
  );
}
