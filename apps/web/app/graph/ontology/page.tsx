'use client';
/**
 * Ontology — the domain's versioned vocabulary (CP-6 B9, migration 0066 §7, L4-I05 OntologyChangeProposed).
 *
 * The ONTOLOGY is a VERSIONED set of ENTITY TYPES and PREDICATES, each predicate with the entity types it admits at
 * either end. A change is PROPOSED as the next FULL version with its rationale and alternatives — not a diff: what a
 * proposal omits is removed. The COMPATIBILITY ANALYSIS is the write's, computed over what the domain holds: the
 * asserted edges a removed or narrowed predicate would strand, the entities of a removed type, the strategy objects
 * resting on those edges — ADDITIVE when nothing existing is affected, BREAKING otherwise — and four reviews open on it
 * (compatibility, migration, domain, governance).
 *
 * The STEWARD decides, never the proposer, and a breaking change is refused while any edge it would strand is still
 * asserted (the migration comes first). Approval activates the version and supersedes the prior one; once a domain has
 * an active version, the builder's port admits only its predicates. A rejected proposal keeps its number.
 *
 * Nothing here predicts a result: every version is rendered as the list returned it, the analysis is the server's, and
 * a refusal is shown verbatim — the proposer's own approval, a breaking proposal while edges stand, a second open
 * proposal in the namespace — as the server stated it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { graph, type OntologyDecided, type OntologyProposal, type OntologyProposed, type OntologyReviews,
  type OntologyVersionRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton,
  fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
/** The four reviews the proposing write opens; the steward records an outcome on any of them with the decision. */
const REVIEW_KEYS = ['compatibility', 'migration', 'domain', 'governance'] as const;
type ReviewKey = (typeof REVIEW_KEYS)[number];
/** '' leaves the review as the proposal opened it (the key is not sent). */
type ReviewChoice = '' | 'passed' | 'failed';
const NO_REVIEWS: Record<ReviewKey, ReviewChoice> = { compatibility: '', migration: '', domain: '', governance: '' };
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).join(', ') || '(none)' : '—');
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter((x) => x.length > 0);
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

interface PredicateDraft { predicate: string; subjectTypes: string; objectTypes: string }
interface Draft { namespace: string; entityTypes: string; predicates: PredicateDraft[]; rationale: string; alternatives: string; migrationPlan: string }
const EMPTY: Draft = { namespace: 'domain', entityTypes: '', predicates: [], rationale: '', alternatives: '', migrationPlan: '' };
const draftOk = (d: Draft) =>
  d.namespace.trim() !== '' && csv(d.entityTypes).length > 0 && d.predicates.length > 0
  && d.predicates.every((p) => p.predicate.trim() !== '') && d.rationale.trim().length >= 8;
/**
 * An empty types field OMITS the key rather than sending `[]`: the server's narrowing test (0066 §7) only compares a
 * key present on both versions, so an absent key is "not declared" (no restriction, never a narrowing), whereas `[]`
 * would narrow a declared list to nothing and make the change breaking — and the served row renders an absent key as
 * "any (not declared)", which is what the field's label promises.
 */
function toProposal(d: Draft): OntologyProposal {
  return {
    namespace: d.namespace.trim(), entityTypes: csv(d.entityTypes),
    predicates: d.predicates.map((p) => ({
      predicate: p.predicate.trim(),
      ...(csv(p.subjectTypes).length === 0 ? {} : { subject_types: csv(p.subjectTypes) }),
      ...(csv(p.objectTypes).length === 0 ? {} : { object_types: csv(p.objectTypes) }),
    })),
    rationale: d.rationale.trim(), alternatives: lines(d.alternatives),
    migrationPlan: d.migrationPlan.trim() === '' ? null : d.migrationPlan.trim(),
  };
}
/** A served version's vocabulary → a draft, so the next proposal starts from what is active (never from a guess); the rationale is the person's. */
function fromVersion(v: OntologyVersionRow): Draft {
  return {
    namespace: v.namespace, entityTypes: v.entity_types.join(', '),
    predicates: v.predicates.map((p) => ({ predicate: str(p['predicate']) === '—' ? '' : String(p['predicate']),
      subjectTypes: arr(p['subject_types']).map(String).join(', '), objectTypes: arr(p['object_types']).map(String).join(', ') })),
    rationale: '', alternatives: '', migrationPlan: '',
  };
}

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const linkButton = { font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

/** A version's vocabulary as served: the entity types, and the predicates with the types each admits at either end. */
function Vocabulary({ entityTypes, predicates, label }: { entityTypes: unknown; predicates: unknown; label: string }) {
  const preds = arr(predicates).map(rec);
  return (
    <>
      <p><strong>Entity types ({arr(entityTypes).length}):</strong> <Mono>{list(entityTypes)}</Mono></p>
      {preds.length === 0 ? <Empty>No predicate.</Empty> : (
        <ScrollBox label={label}>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Predicate</Th><Th>Subject types</Th><Th>Object types</Th></tr></thead>
            <tbody>{preds.map((p, i) => (
              <tr key={`${str(p['predicate'])}-${i}`}>
                <Td mono>{str(p['predicate'])}</Td>
                <Td mono>{p['subject_types'] === undefined || p['subject_types'] === null ? 'any (not declared)' : list(p['subject_types'])}</Td>
                <Td mono>{p['object_types'] === undefined || p['object_types'] === null ? 'any (not declared)' : list(p['object_types'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

/** The reviews as the server holds them — every key it returned, in the order it opened them first. */
function Reviews({ reviews }: { reviews: unknown }) {
  const r = rec(reviews);
  const keys = [...REVIEW_KEYS.filter((k) => k in r), ...Object.keys(r).filter((k) => !(REVIEW_KEYS as readonly string[]).includes(k))];
  if (keys.length === 0) return <>none recorded</>;
  return <>{keys.map((k, i) => <span key={k}>{i > 0 ? ' · ' : ''}{k} <strong>{str(r[k])}</strong></span>)}</>;
}

/** The change the write computed against the version active at proposal time (against nothing for the first version). */
function Change({ change }: { change: unknown }) {
  const c = rec(change); const added = rec(c['added']); const removed = rec(c['removed']); const narrowed = arr(c['narrowed']).map(rec);
  const predNames = (v: unknown) => arr(v).map((p) => str(rec(p)['predicate'])).join(', ') || '(none)';
  return (
    <dl>
      <DefinitionRow term="Added">entity types <Mono>{list(added['entity_types'])}</Mono> · predicates <Mono>{predNames(added['predicates'])}</Mono></DefinitionRow>
      <DefinitionRow term="Removed">entity types <Mono>{list(removed['entity_types'])}</Mono> · predicates <Mono>{predNames(removed['predicates'])}</Mono></DefinitionRow>
      <DefinitionRow term="Narrowed">
        {narrowed.length === 0 ? 'none' : (
          <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
            {narrowed.map((n, i) => {
              const from = rec(n['from']); const to = rec(n['to']);
              return (
                <li key={i}>
                  <Mono>{str(n['predicate'])}</Mono>: subjects <Mono>{list(from['subject_types'])}</Mono> → <Mono>{list(to['subject_types'])}</Mono>
                  {'; '}objects <Mono>{list(from['object_types'])}</Mono> → <Mono>{list(to['object_types'])}</Mono>
                </li>
              );
            })}
          </ul>
        )}
      </DefinitionRow>
    </dl>
  );
}

/** The compatibility analysis as the write computed it: what a removed or narrowed predicate, or a removed type, would strand. */
function Analysis({ analysis }: { analysis: unknown }) {
  const a = rec(analysis); const edges = rec(a['edges']); const sample = arr(edges['sample']).map(rec); const count = num(edges['count']);
  return (
    <>
      <dl>
        <DefinitionRow term="Class"><strong>{str(a['class'])}</strong> — version {str(a['from_version']) === '—' ? 'none (the first version)' : str(a['from_version'])} → {str(a['to_version'])}</DefinitionRow>
        <DefinitionRow term="Edges stranded">
          <strong>{count}</strong> asserted edge(s) on a predicate the proposal removes or narrows
          {count > sample.length ? ` (the first ${sample.length} named below)` : ''}
        </DefinitionRow>
        <DefinitionRow term="Entities of removed types"><strong>{num(a['entities_of_removed_types'])}</strong></DefinitionRow>
        <DefinitionRow term="Strategy resting on those edges"><strong>{num(a['strategy_dependencies_on_edges'])}</strong> active dependency(ies)</DefinitionRow>
      </dl>
      {sample.length > 0 && (
        <ScrollBox label="edges the proposal would strand">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Edge</Th><Th>Predicate</Th></tr></thead>
            <tbody>{sample.map((e) => <tr key={String(e['edge_id'])}><Td mono>{str(e['edge_id'])}</Td><Td mono>{str(e['predicate'])}</Td></tr>)}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

export default function OntologyPage() {
  const { scope, me } = useShell();
  const [rows, setRows] = useState<OntologyVersionRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [decReason, setDecReason] = useState('');
  const [decReviews, setDecReviews] = useState<Record<ReviewKey, ReviewChoice>>(NO_REVIEWS);
  const [decProblem, setDecProblem] = useState<string | null>(null);
  const [decReceipt, setDecReceipt] = useState<ReceiptT>(null);
  const [decided, setDecided] = useState<OntologyDecided | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [propProblem, setPropProblem] = useState<string | null>(null);
  const [propReceipt, setPropReceipt] = useState<ReceiptT>(null);
  const [proposed, setProposed] = useState<OntologyProposed | null>(null);

  const load = async () => {
    const r = await graph.listOntology(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the ontology could not be listed'); return; }
    setRows(r.data.versions);
  };
  const select = (versionId: string) => {
    setSelected(versionId); setDecision('approve'); setDecReason(''); setDecReviews(NO_REVIEWS);
    setDecProblem(null); setDecReceipt(null); setDecided(null);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the ontology…</Empty>;

  const actives = rows.filter((v) => v.state === 'active');
  const open = rows.filter((v) => v.state === 'proposed');
  const current = selected === null ? null : rows.find((v) => v.version_id === selected) ?? null;
  /** Courtesy only — the server refuses regardless: the decision is the steward's (or a domain/platform admin's), never the proposer's. */
  const holdsSteward = me.bindings.some((b) => b.roleCode === 'ontology_steward' && b.domainId === me.homeDomainId);
  const up = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const upPred = (i: number, patch: Partial<PredicateDraft>) => up({ predicates: draft.predicates.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const txt = (id: string, value: string, onChange: (v: string) => void) => (
    <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
  );
  const reviewsToSend = (): OntologyReviews => {
    const out: OntologyReviews = {};
    for (const k of REVIEW_KEYS) { const c = decReviews[k]; if (c !== '') out[k] = c; }
    return out;
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Ontology</h1>
      <UnknownNote>
        The domain's vocabulary is <strong>versioned</strong>: entity types, and predicates with the entity types each admits at
        either end. A change is <strong>proposed as the next full version</strong> — what a proposal omits is removed — with its
        rationale and alternatives. The server computes the <strong>compatibility analysis</strong> inside the write (the asserted
        edges a removed or narrowed predicate would strand, the strategy resting on them): <strong>additive</strong> when nothing
        existing is affected, <strong>breaking</strong> otherwise. Four reviews open on it. The <strong>ontology steward</strong> decides,
        never the proposer; a breaking change is refused while any edge it would strand is still asserted. Approval activates the
        version and supersedes the prior one; with an active version the graph admits only its predicates.
        {actives.length === 0 && <> <strong>No version is active in this domain</strong>: until one is proposed and approved, the graph refuses no predicate.</>}
      </UnknownNote>

      <section aria-labelledby="active-h" style={cardStyle}>
        <h2 id="active-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Active version{actives.length > 1 ? 's' : ''}</h2>
        {actives.length === 0 ? <Empty>No ontology version is active. The vocabulary is implicit until a proposal is approved.</Empty> : actives.map((v) => (
          <div key={v.version_id}>
            <p style={muted}>
              namespace <Mono>{v.namespace}</Mono> · version <Mono>{String(v.version)}</Mono> · <Mono>{v.version_id}</Mono>
              {' · '}activated {fmtInstant(v.activated_at)} by <Mono>{short(v.decided_by)}</Mono> · proposed {fmtInstant(v.proposed_at)} by <Mono>{short(v.proposed_by)}</Mono>
              {' · '}<button type="button" style={linkButton} onClick={() => select(v.version_id)}>open its record</button>
            </p>
            <Vocabulary entityTypes={v.entity_types} predicates={v.predicates} label={`active ontology version ${String(v.version)} predicates`} />
          </div>
        ))}
      </section>

      <section aria-labelledby="list-h" style={cardStyle}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Versions ({rows.length})</h2>
        {rows.length === 0 ? <Empty>No ontology version has been proposed in this domain.</Empty> : (
          <ScrollBox label="ontology versions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Version</Th><Th>Namespace</Th><Th>State</Th><Th>Compatibility</Th><Th>Types</Th><Th>Predicates</Th><Th>Edges stranded</Th><Th>Reviews</Th><Th>Proposed at</Th><Th>Decided at</Th></tr></thead>
              <tbody>
                {rows.map((v) => {
                  const isSel = v.version_id === selected;
                  return (
                    <tr key={v.version_id} aria-selected={isSel}>
                      <Td><button type="button" aria-pressed={isSel} onClick={() => select(v.version_id)} style={linkButton}>{isSel ? 'selected' : 'select'}</button></Td>
                      <Td mono>{String(v.version)}</Td>
                      <Td mono>{v.namespace}</Td>
                      <Td><strong>{v.state}</strong></Td>
                      <Td>{v.compatibility}</Td>
                      <Td mono>{v.entity_types.length}</Td>
                      <Td mono>{v.predicates.length}</Td>
                      <Td mono>{num(rec(v.analysis['edges'])['count'])}</Td>
                      <Td><Reviews reviews={v.reviews} /></Td>
                      <Td>{fmtInstant(v.proposed_at)}</Td>
                      <Td>{v.decided_at === null ? '—' : fmtInstant(v.decided_at)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {current !== null && (
        <>
          <section aria-labelledby="version-h" style={cardStyle}>
            <h2 id="version-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Version {String(current.version)} — {current.state}</h2>
            <dl>
              <DefinitionRow term="Version id"><Mono>{current.version_id}</Mono> · namespace <Mono>{current.namespace}</Mono></DefinitionRow>
              <DefinitionRow term="State"><strong>{current.state}</strong> · compatibility <strong>{current.compatibility}</strong></DefinitionRow>
              <DefinitionRow term="Proposed">{fmtInstant(current.proposed_at)} by <Mono>{current.proposed_by}</Mono>{current.proposed_by === me.principalId ? ' (you)' : ''}</DefinitionRow>
              <DefinitionRow term="Rationale"><span style={{ whiteSpace: 'pre-wrap' }}>{str(current.rationale)}</span></DefinitionRow>
              <DefinitionRow term="Alternatives">
                {current.alternatives.length === 0 ? 'none stated' : <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{current.alternatives.map((a, i) => <li key={i}>{String(a)}</li>)}</ul>}
              </DefinitionRow>
              <DefinitionRow term="Migration plan">{current.migration_plan === null ? 'none stated' : <span style={{ whiteSpace: 'pre-wrap' }}>{current.migration_plan}</span>}</DefinitionRow>
              <DefinitionRow term="Reviews"><Reviews reviews={current.reviews} /></DefinitionRow>
              <DefinitionRow term="Decided">
                {current.decided_at === null ? 'not yet' : <>{fmtInstant(current.decided_at)} by <Mono>{str(current.decided_by)}</Mono> — {str(current.decision_reason)}</>}
              </DefinitionRow>
              <DefinitionRow term="Activated">{current.activated_at === null ? '—' : fmtInstant(current.activated_at)}</DefinitionRow>
              <DefinitionRow term="Superseded">{current.superseded_at === null ? '—' : fmtInstant(current.superseded_at)}</DefinitionRow>
              <DefinitionRow term="Correlation"><Mono>{current.correlation_id}</Mono></DefinitionRow>
            </dl>
            <h3 style={h3}>Change against the version active at proposal</h3>
            <Change change={current.change} />
            <h3 style={h3}>Compatibility analysis</h3>
            <Analysis analysis={current.analysis} />
            <h3 style={h3}>This version's vocabulary</h3>
            <Vocabulary entityTypes={current.entity_types} predicates={current.predicates} label={`ontology version ${String(current.version)} predicates`} />
          </section>

          <section aria-labelledby="decide-h" style={cardStyle}>
            <h2 id="decide-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Decide — version {String(current.version)}</h2>
            {current.state !== 'proposed' ? (
              <p style={muted}>This version is <strong>{current.state}</strong>; only an open proposal is decided.</p>
            ) : (
              <>
                <p>
                  <strong>The steward's act, human-gated.</strong> Approval activates the version and supersedes the active one; a rejection
                  keeps the number. A breaking change is approved only after its compatibility and migration reviews passed and while no
                  asserted edge remains on what it removes or narrows — the server refuses otherwise and its reason is shown here verbatim.
                </p>
                <p style={muted}>
                  {current.proposed_by === me.principalId
                    ? 'You proposed this version: the proposer of an ontology change does not decide it; the server refuses regardless of role.'
                    : holdsSteward
                      ? 'You hold ontology_steward in this domain.'
                      : 'You do not hold ontology_steward in this domain; the server decides whether another authority you hold admits the decision.'}
                </p>
                <div style={rowStyle}>
                  <Field id="dec-decision" label="Decision">
                    {(id) => (
                      <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={decision} onChange={(e) => setDecision(e.target.value as 'approve' | 'reject')}>
                        <option value="approve">approve</option><option value="reject">reject</option>
                      </select>
                    )}
                  </Field>
                  <Field id="dec-reason" label="Reason (at least 8 characters, required)">{(id) => txt(id, decReason, setDecReason)}</Field>
                </div>
                <h4 style={h3}>Reviews recorded with the decision</h4>
                <p style={muted}>Each review left as "(as opened)" is not sent and keeps what the proposal opened it at: currently <Reviews reviews={current.reviews} />.</p>
                <div style={rowStyle}>
                  {REVIEW_KEYS.map((k) => (
                    <Field key={k} id={`dec-rev-${k}`} label={`${k} review`}>
                      {(id) => (
                        <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={decReviews[k]} onChange={(e) => setDecReviews({ ...decReviews, [k]: e.target.value as ReviewChoice })}>
                          <option value="">(as opened: {str(rec(current.reviews)[k])})</option>
                          <option value="passed">passed</option>
                          <option value="failed">failed</option>
                        </select>
                      )}
                    </Field>
                  ))}
                </div>
                <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                  <GovernedButton label={decision === 'approve' ? 'Approve and activate' : 'Reject'} pendingLabel="deciding"
                    variant={decision === 'reject' ? 'critical' : 'primary'} disabled={decReason.trim().length < 8}
                    onRun={async () => {
                      setDecProblem(null);
                      const r = await graph.decideOntology(scope, current.version_id, decision, decReason.trim(), reviewsToSend());
                      if (!r.ok || r.data === undefined) { const m = refusal(r, 'the decision was not answered'); setDecProblem(m); throw new Error(m); }
                      setDecided(r.data.ontology); setDecReceipt(r.data.receipt);
                      await load();
                    }} />
                </div>
              </>
            )}
            {decProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not decided — {decProblem}</span></LiveStatus>}
            {decided !== null && (
              <p>
                version <Mono>{str(decided.version_id)}</Mono> is now <strong>{str(decided.state)}</strong>
                {decided.state === 'active' ? <> as version {str(decided.version)}; supersedes {decided.supersedes === null || decided.supersedes === undefined ? 'nothing (the first active version)' : <Mono>{String(decided.supersedes)}</Mono>}</> : null}
              </p>
            )}
            <Receipt receipt={decReceipt} />
          </section>
        </>
      )}

      <section aria-labelledby="propose-h" style={cardStyle}>
        <h2 id="propose-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Propose a version</h2>
        <p style={muted}>
          Under the purpose <Mono>graph</Mono>: the next <strong>full</strong> vocabulary — every entity type and predicate the domain is to
          admit. Anything the active version has that the proposal omits is a removal, which makes the change breaking. The server
          computes the analysis, opens the reviews and publishes OntologyChangeProposed; one proposal is open per namespace at a time.
        </p>
        {open.length > 0 && (
          <p style={muted}>
            Open in this domain: {open.map((v, i) => <span key={v.version_id}>{i > 0 ? ', ' : ''}version {String(v.version)} in <Mono>{v.namespace}</Mono></span>)}.
            The server refuses a second proposal in the same namespace until it is decided.
          </p>
        )}
        {actives.map((v) => (
          <p key={v.version_id}>
            <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => setDraft({ ...fromVersion(v), rationale: draft.rationale, alternatives: draft.alternatives, migrationPlan: draft.migrationPlan })}>
              Start from active version {String(v.version)} ({v.namespace}): {v.entity_types.length} type(s), {v.predicates.length} predicate(s)
            </button>
          </p>
        ))}
        <div style={rowStyle}>
          <Field id="p-ns" label="Namespace">{(id) => txt(id, draft.namespace, (v) => up({ namespace: v }))}</Field>
          <Field id="p-types" label="Entity types (comma-separated, required)">{(id) => txt(id, draft.entityTypes, (v) => up({ entityTypes: v }))}</Field>
        </div>
        <h4 style={h3}>Predicates ({draft.predicates.length})</h4>
        <p style={muted}>Each predicate names itself; the subject and object types are the entity types it admits at either end (comma-separated; empty declares no restriction).</p>
        {draft.predicates.map((p, i) => (
          <div key={i} style={{ ...rowStyle, marginBlockEnd: 'var(--eye-space-8)' }}>
            <Field id={`p-${i}-pred`} label={`Predicate ${i + 1}`}>{(id) => txt(id, p.predicate, (v) => upPred(i, { predicate: v }))}</Field>
            <Field id={`p-${i}-subj`} label={`Predicate ${i + 1} subject types`}>{(id) => txt(id, p.subjectTypes, (v) => upPred(i, { subjectTypes: v }))}</Field>
            <Field id={`p-${i}-obj`} label={`Predicate ${i + 1} object types`}>{(id) => txt(id, p.objectTypes, (v) => upPred(i, { objectTypes: v }))}</Field>
            <div style={{ alignSelf: 'end' }}>
              <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => up({ predicates: draft.predicates.filter((_, j) => j !== i) })}>Remove predicate {i + 1}</button>
            </div>
          </div>
        ))}
        <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => up({ predicates: [...draft.predicates, { predicate: '', subjectTypes: '', objectTypes: '' }] })}>Add a predicate</button>
        <h4 style={h3}>Rationale and alternatives</h4>
        <Field id="p-why" label="Rationale (at least 8 characters, required)">
          {(id) => <textarea id={id} style={textareaStyle} value={draft.rationale} onChange={(e) => up({ rationale: e.target.value })} />}
        </Field>
        <Field id="p-alt" label="Alternatives considered (one per line)">
          {(id) => <textarea id={id} style={textareaStyle} value={draft.alternatives} onChange={(e) => up({ alternatives: e.target.value })} />}
        </Field>
        <Field id="p-mig" label="Migration plan (optional; a breaking change is approved only after its migration review passed)">
          {(id) => <textarea id={id} style={textareaStyle} value={draft.migrationPlan} onChange={(e) => up({ migrationPlan: e.target.value })} />}
        </Field>
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label="Propose" pendingLabel="proposing" disabled={!draftOk(draft)}
            onRun={async () => {
              setPropProblem(null);
              const r = await graph.proposeOntology(scope, toProposal(draft));
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the proposal was not answered'); setPropProblem(m); throw new Error(m); }
              setProposed(r.data.ontology); setPropReceipt(r.data.receipt); setDraft(EMPTY);
              await load(); select(r.data.ontology.version_id);
            }} />
        </div>
        {propProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not proposed — {propProblem}</span></LiveStatus>}
        {proposed !== null && (
          <>
            <p>
              proposed <Mono>{str(proposed.version_id)}</Mono> as version <strong>{str(proposed.to_version)}</strong> of <Mono>{str(proposed.namespace)}</Mono>
              {' '}(from {proposed.from_version === null ? 'no active version' : `version ${String(proposed.from_version)}`}) · <strong>{str(proposed.compatibility)}</strong>
              {' · '}reviews opened: <Reviews reviews={proposed.reviews} />
            </p>
            <h4 style={h3}>The change as computed</h4>
            <Change change={proposed.change} />
            <h4 style={h3}>The analysis as computed</h4>
            <Analysis analysis={proposed.analysis} />
          </>
        )}
        <Receipt receipt={propReceipt} />
      </section>
    </>
  );
}
