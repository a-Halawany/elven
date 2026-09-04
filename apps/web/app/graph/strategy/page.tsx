'use client';
/**
 * The Strategy Graph — objectives, assumptions, decisions, commitments, outcomes.
 *
 * ONLY AN ASSUMPTION CARRIES A VERIFICATION STATE, and the screen says so rather
 * than showing four types with an empty column. An objective is not "verified";
 * it rests on assumptions that are, and when one of those stops being verified
 * this is where a reader sees it.
 *
 * EVERY OBJECT MUST NAME WHAT IT RESTS ON. The form will not submit without at
 * least one dependency and a rationale for it — because an objective linked to
 * nothing is an objective no correction can ever reach, which is precisely the
 * failure this phase exists to remove.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type StrategyRow, type EntityRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton,
  fmtInstant } from '../../../components/observation';
import { inputStyle, textareaStyleFallback, tableStyle, Th, Td, Receipt } from './form-bits';

const TYPES: Array<{ code: StrategyRow['object_type']; label: string }> = [
  { code: 'OBJ', label: 'Objective' },
  { code: 'ASU', label: 'Assumption' },
  { code: 'DEC', label: 'Decision' },
  { code: 'CMT', label: 'Commitment' },
  { code: 'OUT', label: 'Outcome' },
];

function VerificationBadge({ state, type }: { state: string; type: string }) {
  if (type !== 'ASU') {
    return (
      <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
        not applicable — only an assumption is verified
      </span>
    );
  }
  const map: Record<string, { glyph: string; token: string; label: string }> = {
    verified: { glyph: '●', token: '--eye-color-success', label: 'VERIFIED' },
    unverified: { glyph: '◍', token: '--eye-color-warning', label: 'UNVERIFIED' },
    invalidated: { glyph: '✕', token: '--eye-color-critical', label: 'INVALIDATED' },
    not_applicable: { glyph: '—', token: '--eye-color-ink-muted', label: 'NOT APPLICABLE' },
  };
  const v = map[state] ?? map['unverified'] as { glyph: string; token: string; label: string };
  return (
    <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'baseline',
                   color: `var(${v.token})`, fontSize: 'var(--eye-type-label-sm)' }}>
      <span aria-hidden="true">{v.glyph}</span><span>{v.label}</span>
    </span>
  );
}

export default function StrategyPage() {
  const { scope, isStrategyOwner } = useShell();
  const [rows, setRows] = useState<StrategyRow[] | null>(null);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<StrategyRow | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const [objectType, setObjectType] = useState<StrategyRow['object_type']>('OBJ');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [restsOnKind, setRestsOnKind] = useState<'entity' | 'strategy'>('entity');
  const [restsOnId, setRestsOnId] = useState('');
  const [rationale, setRationale] = useState('');

  const load = async () => {
    const [s, e] = await Promise.all([graph.listStrategy(scope), graph.listEntities(scope)]);
    if (!s.ok || s.data === undefined) {
      setProblem(s.error?.message ?? 'the Strategy Graph could not be read');
      return;
    }
    setRows(s.data.strategy);
    const list = e.ok ? e.data?.entities : undefined;
    if (list !== undefined) {
      setEntities(list);
      setRestsOnId((prev) => (prev === '' ? (list[0]?.entity_id ?? '') : prev));
    }
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the Strategy Graph…</Empty>;

  const targets = restsOnKind === 'entity'
    ? entities.map((x) => ({ id: x.entity_id, label: x.canonical_name }))
    : rows.map((x) => ({ id: x.strategy_object_id, label: `${x.object_type} — ${x.title}` }));

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Strategy Graph</h1>

      {rows.length === 0 ? <Empty>Nothing has been declared yet.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start',
                            color: 'var(--eye-color-ink-muted)' }}>
            {rows.length} object(s)
          </caption>
          <thead>
            <tr><Th>Type</Th><Th>Title</Th><Th>Status</Th><Th>Verification</Th>
                <Th>Rests on</Th><Th>Declared</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strategy_object_id}>
                <Td mono>{r.object_type}</Td>
                <Td>
                  <button
                    type="button" onClick={() => setOpen(r)}
                    style={{ background: 'none', border: 'none', padding: 0,
                             color: 'var(--eye-color-accent-default)', cursor: 'pointer',
                             textDecoration: 'underline', textAlign: 'start' }}
                  >{r.title}</button>
                </Td>
                <Td>{r.status}</Td>
                <Td><VerificationBadge state={r.verification_state} type={r.object_type} /></Td>
                <Td mono>{r.dependencies?.length ?? 0}</Td>
                <Td>{fmtInstant(r.declared_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null ? null : (
        <section aria-labelledby="stg-h" style={{ ...cardStyle,
          marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="stg-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {open.title}
          </h2>
          <dl>
            <DefinitionRow term="Type"><Mono>{open.object_type}</Mono></DefinitionRow>
            <DefinitionRow term="Statement">{open.statement}</DefinitionRow>
            <DefinitionRow term="Status">{open.status}</DefinitionRow>
            <DefinitionRow term="Verification">
              <VerificationBadge state={open.verification_state} type={open.object_type} />
              {open.verification_reason === null ? null : <> — {open.verification_reason}</>}
            </DefinitionRow>
            <DefinitionRow term="Rests on">
              {(open.dependencies ?? []).length === 0 ? 'nothing' : (
                <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
                  {(open.dependencies ?? []).map((d) => (
                    <li key={d.dependency_id}>
                      <Mono>{d.depends_on_kind}</Mono>{' '}
                      <Mono>{d.depends_on_id.slice(0, 12)}…</Mono> — {d.rationale}
                    </li>
                  ))}
                </ul>
              )}
            </DefinitionRow>
          </dl>
        </section>
      )}

      {!isStrategyOwner ? (
        <UnknownNote>
          Declaring a Strategy Graph object needs the <Mono>strategy_owner</Mono> role in this
          domain. Nothing automatic can write an objective, an assumption or a commitment: nothing
          automatic has standing to say what an organisation intends.
        </UnknownNote>
      ) : (
        <section aria-labelledby="new-h" style={{ ...cardStyle,
          marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="new-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            Declare
          </h2>
          <label htmlFor="type">Type</label>
          <select id="type" style={inputStyle} value={objectType}
                  onChange={(e) => setObjectType(e.target.value as StrategyRow['object_type'])}>
            {TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
          <label htmlFor="title">Title</label>
          <input id="title" style={inputStyle} value={title}
                 onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="stmt">Statement</label>
          <textarea id="stmt" style={textareaStyleFallback} value={statement}
                    onChange={(e) => setStatement(e.target.value)} />
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>What it rests on (required)</h3>
          <label htmlFor="kind">Kind</label>
          <select id="kind" style={inputStyle} value={restsOnKind}
                  onChange={(e) => { setRestsOnKind(e.target.value as 'entity' | 'strategy');
                                     setRestsOnId(''); }}>
            <option value="entity">an entity</option>
            <option value="strategy">another strategy object</option>
          </select>
          <label htmlFor="target">Which one</label>
          <select id="target" style={inputStyle} value={restsOnId}
                  onChange={(e) => setRestsOnId(e.target.value)}>
            <option value="">— choose —</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label htmlFor="rationale">Why it rests on it (at least 8 characters)</label>
          <input id="rationale" style={inputStyle} value={rationale}
                 onChange={(e) => setRationale(e.target.value)} />
          <GovernedButton
            label="Declare" pendingLabel="declaring"
            disabled={title.trim().length < 2 || statement.trim().length < 2
              || restsOnId === '' || rationale.trim().length < 8}
            onRun={async () => {
              const r = await graph.declareStrategy(scope, {
                objectType, title, statement, status: 'active',
                restsOn: [{ kind: restsOnKind, id: restsOnId, rationale }],
              });
              if (!r.ok || r.data === undefined) {
                throw new Error(r.error?.message ?? 'the declaration was refused');
              }
              setReceipt(r.data.receipt);
              setTitle(''); setStatement(''); setRationale('');
              await load();
            }}
          />
          <Receipt receipt={receipt} />
        </section>
      )}
    </>
  );
}
