'use client';
/**
 * Memory — the Enterprise Memory workspace (CP-6 B9/B10, migration 0066 §3).
 *
 * A MEMORY ITEM is an institutional or strategic record with a SOURCE, an AUDIENCE (classification, roles, purposes),
 * a VALIDITY in world time and a RETENTION declared at record time. Every version is a canonical MEM object: a
 * superseded version stays replayable as of an instant.
 *
 * THE LISTING SHOWS RECORDS WITHOUT CONTENT. The statement and the source reference are served only by a RETRIEVAL —
 * a governed, AUDITED read under a DECLARED purpose (the one the item was admitted for or one its audience declares):
 * the access is recorded (who, which version, which purpose, as of when) and the server's refusal is shown verbatim.
 * Nothing here predicts a result: the served version is rendered as the server returned it and nothing else.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { graph, type MemoryIntake, type MemoryRetrieval, type MemoryRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton,
  fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const PURPOSES = ['memory', 'graph', 'decision', 'briefing', 'prediction'] as const;
const RECORD_CLASSES = ['institutional', 'strategic'] as const;
const SOURCE_KINDS = ['human', 'document', 'communication', 'telemetry'] as const;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
const CITE_KINDS = ['evidence', 'claim', 'strategy', 'entity', 'edge', 'forecast', 'warning'] as const;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String).join(', ') || '(none)' : '—');
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
/** A datetime-local value → an ISO instant (null when empty); the server validates the instant. */
const toIso = (local: string): string | null => (local.trim() === '' ? null : new Date(local).toISOString());
/** An instant the server returned → the datetime-local form, so a prefilled field carries the served value. */
const toLocal = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

interface Cite { kind: (typeof CITE_KINDS)[number]; id: string; version: string; rationale: string }
interface Draft {
  recordClass: MemoryIntake['recordClass']; title: string; statement: string;
  sourceKind: MemoryIntake['source']['kind']; sourceRef: string;
  classification: MemoryIntake['audience']['classification']; roles: string; purposes: string;
  validFrom: string; validTo: string; retentionProfile: string; retainUntil: string; retentionBasis: string;
  cites: Cite[]; decisionId: string; objectiveId: string;
  /** The served instants, kept VERBATIM (the datetime-local field holds minutes only) until the person edits that field. */
  served: { validFrom: string | null; validTo: string | null; retainUntil: string | null };
}
const NO_SERVED: Draft['served'] = { validFrom: null, validTo: null, retainUntil: null };
const EMPTY: Draft = {
  recordClass: 'institutional', title: '', statement: '', sourceKind: 'human', sourceRef: '',
  classification: 'internal', roles: '', purposes: '', validFrom: '', validTo: '',
  retentionProfile: '', retainUntil: '', retentionBasis: '', cites: [], decisionId: '', objectiveId: '', served: NO_SERVED,
};
const draftOk = (d: Draft) =>
  d.title.trim().length >= 3 && d.statement.trim().length >= 8 && d.validFrom.trim() !== '' && d.retentionProfile.trim() !== ''
  && d.cites.every((c) => c.id.trim() !== '' && c.rationale.trim().length >= 8);
function toIntake(d: Draft): MemoryIntake {
  return {
    recordClass: d.recordClass, title: d.title.trim(), statement: d.statement.trim(),
    source: { kind: d.sourceKind, ref: d.sourceRef.trim() === '' ? null : d.sourceRef.trim() },
    audience: { classification: d.classification, roles: csv(d.roles), purposes: csv(d.purposes) },
    validity: { from: d.served.validFrom ?? toIso(d.validFrom) ?? '', to: d.served.validTo ?? toIso(d.validTo) },
    retention: { profile: d.retentionProfile.trim(), retainUntil: d.served.retainUntil ?? toIso(d.retainUntil), basis: d.retentionBasis.trim() === '' ? null : d.retentionBasis.trim() },
    cites: d.cites.map((c) => ({ kind: c.kind, id: c.id.trim(), rationale: c.rationale.trim(), ...(c.version.trim() === '' ? {} : { version: Number(c.version) }) })),
    related: { decisionId: d.decisionId.trim() === '' ? null : d.decisionId.trim(), objectiveId: d.objectiveId.trim() === '' ? null : d.objectiveId.trim() },
  };
}
/** The served version's payload → a draft, so a supersession starts from what was served (never from a guess). */
function fromPayload(p: Row): Draft {
  const source = rec(p['source']); const audience = rec(p['audience']); const validity = rec(p['validity']);
  const retention = rec(p['retention']); const related = rec(p['related']);
  const cites = Array.isArray(p['cites']) ? (p['cites'] as Row[]) : [];
  const as = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;
  const iso = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  return {
    recordClass: as(p['record_class'], RECORD_CLASSES, 'institutional'), title: str(p['title']) === '—' ? '' : String(p['title']),
    statement: str(p['statement']) === '—' ? '' : String(p['statement']),
    sourceKind: as(source['kind'], SOURCE_KINDS, 'human'), sourceRef: source['ref'] === null || source['ref'] === undefined ? '' : String(source['ref']),
    classification: as(audience['classification'], CLASSIFICATIONS, 'internal'),
    roles: Array.isArray(audience['roles']) ? (audience['roles'] as unknown[]).map(String).join(', ') : '',
    purposes: Array.isArray(audience['purposes']) ? (audience['purposes'] as unknown[]).map(String).join(', ') : '',
    validFrom: toLocal(validity['from']), validTo: toLocal(validity['to']),
    retentionProfile: retention['profile'] === undefined || retention['profile'] === null ? '' : String(retention['profile']),
    retainUntil: toLocal(retention['retain_until']), retentionBasis: retention['basis'] === null || retention['basis'] === undefined ? '' : String(retention['basis']),
    cites: cites.map((c) => ({ kind: as(c['kind'], CITE_KINDS, 'evidence'), id: str(c['id']) === '—' ? '' : String(c['id']),
      version: c['version'] === null || c['version'] === undefined ? '' : String(c['version']), rationale: str(c['rationale']) === '—' ? '' : String(c['rationale']) })),
    decisionId: related['decision_id'] === null || related['decision_id'] === undefined ? '' : String(related['decision_id']),
    objectiveId: related['objective_id'] === null || related['objective_id'] === undefined ? '' : String(related['objective_id']),
    served: { validFrom: iso(validity['from']), validTo: iso(validity['to']), retainUntil: iso(retention['retain_until']) },
  };
}

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

/** The fields of a memory item — the record form and the supersede form share them; `idp` keeps every label bound to its own input. */
function ItemFields({ idp, d, set }: { idp: string; d: Draft; set: (next: Draft) => void }) {
  const up = (patch: Partial<Draft>) => set({ ...d, ...patch });
  const upCite = (i: number, patch: Partial<Cite>) => up({ cites: d.cites.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const sel = (id: string, value: string, options: readonly string[], onChange: (v: string) => void) => (
    <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
    <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
  );
  /** A datetime-local field prefilled from a served instant: the served instant is submitted verbatim until the field is edited. */
  const when = (id: string, value: string, servedIso: string | null, onChange: (v: string) => void) => (
    <>
      {txt(id, value, onChange, 'datetime-local')}
      {servedIso !== null && <span style={muted}>the served instant {fmtInstant(servedIso)} (<Mono>{servedIso}</Mono>) is submitted as served; editing the field replaces it</span>}
    </>
  );
  return (
    <>
      <div style={rowStyle}>
        <Field id={`${idp}-class`} label="Record class">{(id) => sel(id, d.recordClass, RECORD_CLASSES, (v) => up({ recordClass: v as Draft['recordClass'] }))}</Field>
        <Field id={`${idp}-title`} label="Title (3–200 characters)">{(id) => txt(id, d.title, (v) => up({ title: v }))}</Field>
      </div>
      <Field id={`${idp}-stmt`} label="Statement (at least 8 characters)">
        {(id) => <textarea id={id} style={textareaStyle} value={d.statement} onChange={(e) => up({ statement: e.target.value })} />}
      </Field>
      <h4 style={h3}>Source</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-skind`} label="Source kind">{(id) => sel(id, d.sourceKind, SOURCE_KINDS, (v) => up({ sourceKind: v as Draft['sourceKind'] }))}</Field>
        <Field id={`${idp}-sref`} label="Source reference (optional)">{(id) => txt(id, d.sourceRef, (v) => up({ sourceRef: v }))}</Field>
      </div>
      <h4 style={h3}>Audience</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-cls`} label="Classification">{(id) => sel(id, d.classification, CLASSIFICATIONS, (v) => up({ classification: v as Draft['classification'] }))}</Field>
        <Field id={`${idp}-roles`} label="Roles (comma-separated; empty = any role with clearance)">{(id) => txt(id, d.roles, (v) => up({ roles: v }))}</Field>
        <Field id={`${idp}-purp`} label="Purposes the audience may read under (comma-separated)">{(id) => txt(id, d.purposes, (v) => up({ purposes: v }))}</Field>
      </div>
      <h4 style={h3}>Validity (world time)</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-vfrom`} label="Holds from (required)">{(id) => when(id, d.validFrom, d.served.validFrom, (v) => up({ validFrom: v, served: { ...d.served, validFrom: null } }))}</Field>
        <Field id={`${idp}-vto`} label="Holds until (optional)">{(id) => when(id, d.validTo, d.served.validTo, (v) => up({ validTo: v, served: { ...d.served, validTo: null } }))}</Field>
      </div>
      <h4 style={h3}>Retention (declared at record time)</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-rprof`} label="Retention profile (required)">{(id) => txt(id, d.retentionProfile, (v) => up({ retentionProfile: v }))}</Field>
        <Field id={`${idp}-runtil`} label="Retain until (optional)">{(id) => when(id, d.retainUntil, d.served.retainUntil, (v) => up({ retainUntil: v, served: { ...d.served, retainUntil: null } }))}</Field>
        <Field id={`${idp}-rbasis`} label="Retention basis (optional)">{(id) => txt(id, d.retentionBasis, (v) => up({ retentionBasis: v }))}</Field>
      </div>
      <h4 style={h3}>Cites ({d.cites.length})</h4>
      <p style={muted}>Each cite is an object id with a rationale of at least 8 characters; the cites become the item's dependencies.</p>
      {d.cites.map((c, i) => (
        <div key={i} style={{ ...rowStyle, marginBlockEnd: 'var(--eye-space-8)' }}>
          <Field id={`${idp}-c${i}-kind`} label={`Cite ${i + 1} kind`}>{(id) => sel(id, c.kind, CITE_KINDS, (v) => upCite(i, { kind: v as Cite['kind'] }))}</Field>
          <Field id={`${idp}-c${i}-id`} label={`Cite ${i + 1} object id`}>{(id) => txt(id, c.id, (v) => upCite(i, { id: v }))}</Field>
          <Field id={`${idp}-c${i}-ver`} label={`Cite ${i + 1} version (optional)`}>{(id) => txt(id, c.version, (v) => upCite(i, { version: v }), 'number')}</Field>
          <Field id={`${idp}-c${i}-why`} label={`Cite ${i + 1} rationale`}>{(id) => txt(id, c.rationale, (v) => upCite(i, { rationale: v }))}</Field>
          <div style={{ alignSelf: 'end' }}>
            <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => up({ cites: d.cites.filter((_, j) => j !== i) })}>Remove cite {i + 1}</button>
          </div>
        </div>
      ))}
      <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => up({ cites: [...d.cites, { kind: 'evidence', id: '', version: '', rationale: '' }] })}>Add a cite</button>
      <h4 style={h3}>Related</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-dec`} label="Decision id (optional)">{(id) => txt(id, d.decisionId, (v) => up({ decisionId: v }))}</Field>
        <Field id={`${idp}-obj`} label="Objective id (optional)">{(id) => txt(id, d.objectiveId, (v) => up({ objectiveId: v }))}</Field>
      </div>
    </>
  );
}

/** The served version, VERBATIM. */
function ServedVersion({ r }: { r: MemoryRetrieval }) {
  const p = r.version.payload; const source = rec(p['source']); const audience = rec(p['audience']);
  const validity = rec(p['validity']); const retention = rec(p['retention']); const sup = p['supersession'] === undefined ? null : rec(p['supersession']);
  const related = rec(p['related']); const cites = Array.isArray(p['cites']) ? (p['cites'] as Row[]) : [];
  const a = r.availability;
  return (
    <>
      <p>
        <strong>version {a.current_version} of {a.versions} is current; you were served version {r.versionServed}</strong>
        {a.served_is_current ? ' (the current one)' : ' (a superseded version, replayed)'} · item {a.state}
        {a.attention_state !== null && a.attention_state !== 'none' ? <> · attention: {String(a.attention_state)}</> : null}
        {' · '}superseded {a.superseded_versions} time(s){a.last_superseded_at !== null ? <>, last {fmtInstant(a.last_superseded_at)}</> : null}
        {' · '}as of {r.asOf === null ? 'now' : fmtInstant(r.asOf)} · access recorded as <Mono>{r.accessId}</Mono>
      </p>
      <dl>
        <DefinitionRow term="Version served"><Mono>{String(r.version.object_version)}</Mono> · recorded {fmtInstant(r.version.recorded_at)} · {str(r.version.lifecycle_state)} · truth {str(r.version.truth_state)}</DefinitionRow>
        <DefinitionRow term="Admitted for purpose"><Mono>{str(r.version.purpose_scope)}</Mono></DefinitionRow>
        <DefinitionRow term="Classification">{str(r.version.classification)}</DefinitionRow>
        <DefinitionRow term="Class / title"><Mono>{str(p['record_class'])}</Mono> — {str(p['title'])}</DefinitionRow>
        <DefinitionRow term="Statement"><span style={{ whiteSpace: 'pre-wrap' }}>{str(p['statement'])}</span></DefinitionRow>
        <DefinitionRow term="Source">{str(source['kind'])} · {str(source['ref'])}</DefinitionRow>
        <DefinitionRow term="Audience">{str(audience['classification'])} · roles {list(audience['roles'])} · purposes {list(audience['purposes'])}</DefinitionRow>
        <DefinitionRow term="Validity">from {fmtInstant(validity['from'])} to {validity['to'] === null || validity['to'] === undefined ? 'open' : fmtInstant(validity['to'])}</DefinitionRow>
        <DefinitionRow term="Retention">{str(retention['profile'])} · until {retention['retain_until'] === null || retention['retain_until'] === undefined ? 'not set' : fmtInstant(retention['retain_until'])} · basis {str(retention['basis'])}</DefinitionRow>
        <DefinitionRow term="Cites">
          {cites.length === 0 ? 'none' : (
            <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
              {cites.map((c, i) => <li key={i}><Mono>{str(c['kind'])}</Mono> <Mono>{str(c['id'])}</Mono>{c['version'] !== null && c['version'] !== undefined ? <> @{String(c['version'])}</> : null} — {str(c['rationale'])}</li>)}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Related">decision {str(related['decision_id'])} · objective {str(related['objective_id'])}</DefinitionRow>
        <DefinitionRow term="Supersedes">{r.version.supersedes === null ? 'nothing (the first version)' : <Mono>{String(r.version.supersedes)}</Mono>}</DefinitionRow>
        <DefinitionRow term="Supersession">{sup === null ? 'none on this version' : <>{str(sup['reason'])} · effective {sup['effective_at'] === null || sup['effective_at'] === undefined ? 'at record' : fmtInstant(sup['effective_at'])}</>}</DefinitionRow>
        <DefinitionRow term="Accountable owner"><Mono>{str(r.version.accountable_owner)}</Mono></DefinitionRow>
        <DefinitionRow term="Content digest"><Mono>{str(r.version.content_digest)}</Mono></DefinitionRow>
      </dl>
    </>
  );
}

export default function MemoryPage() {
  const { scope } = useShell();
  const [rows, setRows] = useState<MemoryRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [record, setRecord] = useState<{ item: MemoryRow; events: Row[]; access: Row[]; dependencies: Row[] } | null>(null);
  const [recordProblem, setRecordProblem] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]>('memory');
  const [asOf, setAsOf] = useState('');
  const [served, setServed] = useState<MemoryRetrieval | null>(null);
  const [retrieveProblem, setRetrieveProblem] = useState<string | null>(null);
  const [retrieveReceipt, setRetrieveReceipt] = useState<ReceiptT>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [recordReceipt, setRecordReceipt] = useState<ReceiptT>(null);
  const [recorded, setRecorded] = useState<Row | null>(null);
  const [newProblem, setNewProblem] = useState<string | null>(null);
  const [supDraft, setSupDraft] = useState<Draft>(EMPTY);
  const [supReason, setSupReason] = useState('');
  const [supEffective, setSupEffective] = useState('');
  const [supReceipt, setSupReceipt] = useState<ReceiptT>(null);
  const [superseded, setSuperseded] = useState<Row | null>(null);
  const [supProblem, setSupProblem] = useState<string | null>(null);
  const [wdReason, setWdReason] = useState('');
  const [wdReceipt, setWdReceipt] = useState<ReceiptT>(null);
  const [withdrawn, setWithdrawn] = useState<Row | null>(null);
  const [wdProblem, setWdProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await graph.listMemory(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the memory could not be listed'); return; }
    setRows(r.data.memory);
  };
  const loadRecord = async (itemId: string) => {
    const r = await graph.getMemory(scope, itemId);
    if (!r.ok || r.data === undefined) { setRecord(null); setRecordProblem(r.error?.message ?? 'the record could not be read'); return; }
    setRecordProblem(null);
    setRecord({ item: r.data.item, events: r.data.events, access: r.data.access, dependencies: r.data.dependencies });
  };
  const select = (itemId: string) => {
    setSelected(itemId); setServed(null); setRetrieveProblem(null); setRetrieveReceipt(null);
    setSupDraft(EMPTY); setSupReason(''); setSupEffective(''); setSupReceipt(null); setSuperseded(null); setSupProblem(null);
    setWdReason(''); setWdReceipt(null); setWithdrawn(null); setWdProblem(null);
    void loadRecord(itemId);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the memory…</Empty>;

  const current = selected === null ? null : rows.find((r) => String(r['item_id']) === selected) ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Memory</h1>
      <UnknownNote>
        A memory item is an <strong>institutional</strong> or <strong>strategic</strong> record with a source, an audience
        (classification, roles, purposes), a validity in world time and a retention declared when it is recorded. The listing
        below shows each item's <strong>record without its content</strong>. The statement is served only by a
        <strong> retrieval under a declared purpose</strong> — a governed, audited read: who read which version, under which
        purpose, as of when, is recorded on the item. A superseded version stays replayable as of an instant.
      </UnknownNote>

      <section aria-labelledby="list-h" style={cardStyle}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Items ({rows.length})</h2>
        {rows.length === 0 ? <Empty>No memory item is recorded in this domain.</Empty> : (
          <ScrollBox label="memory items">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Title</Th><Th>Class</Th><Th>Current version</Th><Th>Classification</Th><Th>Audience purposes</Th><Th>State</Th><Th>Attention</Th><Th>Retained under</Th><Th>Recorded at</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r['item_id']); const isSel = id === selected;
                  return (
                    <tr key={id} aria-selected={isSel}>
                      <Td>
                        <button type="button" aria-pressed={isSel} onClick={() => select(id)}
                          style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          {isSel ? 'selected' : 'select'}
                        </button>
                      </Td>
                      <Td>{str(r['title'])}</Td>
                      <Td mono>{str(r['record_class'])}</Td>
                      <Td mono>{str(r['object_version'])}{Number(r['superseded_versions'] ?? 0) > 0 ? ` (${String(r['superseded_versions'])} superseded)` : ''}</Td>
                      <Td>{str(r['classification'])}</Td>
                      <Td mono>{list(r['audience_purposes'])}</Td>
                      <Td>{str(r['state'])}</Td>
                      <Td>{str(r['attention_state'])}{r['attention_reason'] !== null && r['attention_reason'] !== undefined ? ` — ${String(r['attention_reason'])}` : ''}</Td>
                      <Td mono>{str(r['retention_profile'])}{r['retain_until'] !== null && r['retain_until'] !== undefined ? ` until ${fmtInstant(r['retain_until'])}` : ''}</Td>
                      <Td>{fmtInstant(r['recorded_at'])}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {current !== null && selected !== null && (
        <>
          <section aria-labelledby="retrieve-h" style={cardStyle}>
            <h2 id="retrieve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Retrieve — {str(current['title'])}</h2>
            <p style={muted}>
              Item <Mono>{selected}</Mono> · admitted for the purposes {list(current['audience_purposes'])} on its current version; the listing says
              nothing of its content: {str(current['content'])}
            </p>
            <p>
              <strong>A retrieval is an audited read.</strong> The read is made under the purpose <Mono>{purpose}</Mono>; the access —
              you, the version served, that purpose, the as-of instant — is recorded on the item and named in the audit record. The server
              refuses a purpose the item is not admitted for and a reader outside its audience, and its reason is shown here as it states it.
            </p>
            <div style={rowStyle}>
              <Field id="purpose" label="Declared purpose">
                {(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={purpose} onChange={(e) => setPurpose(e.target.value as (typeof PURPOSES)[number])}>{PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}</select>}
              </Field>
              <Field id="asof" label="As of (optional; the version current at that instant is served)">
                {(id) => <input id={id} type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={asOf} onChange={(e) => setAsOf(e.target.value)} />}
              </Field>
            </div>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Retrieve under purpose" pendingLabel="retrieving"
                onRun={async () => {
                  setRetrieveProblem(null);
                  const iso = toIso(asOf);
                  const r = await graph.retrieveMemory(scope, selected, purpose, iso === null ? undefined : iso);
                  if (!r.ok || r.data === undefined) {
                    const m = refusal(r, 'the retrieval was not answered');
                    setServed(null); setRetrieveReceipt(null); setRetrieveProblem(m); await loadRecord(selected); throw new Error(m);
                  }
                  setServed(r.data.memory); setRetrieveReceipt(r.data.receipt);
                  setSupDraft(fromPayload(r.data.memory.version.payload));
                  await loadRecord(selected);
                }} />
            </div>
            {retrieveProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not served — {retrieveProblem}</span></LiveStatus>}
            {served !== null && <ServedVersion r={served} />}
            <Receipt receipt={retrieveReceipt} />
          </section>

          <section aria-labelledby="record-h" style={cardStyle}>
            <h2 id="record-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The item's record</h2>
            {recordProblem !== null && <LiveStatus assertive>{recordProblem}</LiveStatus>}
            {record === null ? (recordProblem === null ? <Empty>reading the record…</Empty> : null) : (
              <>
                <p style={muted}>
                  owner <Mono>{str(record.item['owner_principal_id'])}</Mono> · roles {list(record.item['audience_roles'])} · valid from {fmtInstant(record.item['valid_from'])}
                  {' '}to {record.item['valid_to'] === null || record.item['valid_to'] === undefined ? 'open' : fmtInstant(record.item['valid_to'])}
                  {' · '}last superseded {fmtInstant(record.item['last_superseded_at'])}
                </p>
                <h3 style={h3}>Events ({record.events.length})</h3>
                {record.events.length === 0 ? <Empty>No event.</Empty> : (
                  <ScrollBox label="memory item events">
                    <table className="eye-table" style={tableStyle}>
                      <thead><tr><Th>Event</Th><Th>Version</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
                      <tbody>{record.events.map((e) => (
                        <tr key={String(e['event_id'])}>
                          <Td>{str(e['event'])}</Td><Td mono>{str(e['object_version'])}</Td><Td mono>{short(e['actor_principal_id'])}</Td>
                          <Td>{fmtInstant(e['occurred_at'])}</Td><Td mono>{JSON.stringify(e['details'] ?? {})}</Td>
                        </tr>))}</tbody>
                    </table>
                  </ScrollBox>
                )}
                <h3 style={h3}>Access history ({record.access.length})</h3>
                {record.access.length === 0 ? <Empty>Nobody has retrieved this item.</Empty> : (
                  <ScrollBox label="memory item access history">
                    <table className="eye-table" style={tableStyle}>
                      <thead><tr><Th>Version</Th><Th>Purpose</Th><Th>Reader</Th><Th>Read as of</Th><Th>Accessed at</Th><Th>Policy decision</Th></tr></thead>
                      <tbody>{record.access.map((a) => (
                        <tr key={String(a['access_id'])}>
                          <Td mono>{str(a['object_version'])}</Td><Td mono>{str(a['purpose_id'])}</Td><Td mono>{short(a['reader_principal_id'])}</Td>
                          <Td>{a['read_as_of'] === null || a['read_as_of'] === undefined ? 'now (at access)' : fmtInstant(a['read_as_of'])}</Td>
                          <Td>{fmtInstant(a['accessed_at'])}</Td><Td mono>{short(a['policy_decision_id'])}</Td>
                        </tr>))}</tbody>
                    </table>
                  </ScrollBox>
                )}
                <h3 style={h3}>Rests on ({record.dependencies.length})</h3>
                {record.dependencies.length === 0 ? <Empty>The item cites nothing.</Empty> : (
                  <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
                    {record.dependencies.map((d) => (
                      <li key={String(d['dependency_id'])}>
                        <Mono>{str(d['depends_on_kind'])}</Mono> <Mono>{str(d['depends_on_id'])}</Mono> — {str(d['rationale'])} · state <strong>{str(d['state'])}</strong>
                        {' '}(created {fmtInstant(d['created_at'])}{d['removed_at'] !== null && d['removed_at'] !== undefined ? <>, removed {fmtInstant(d['removed_at'])}</> : null})
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="sup-h" style={cardStyle}>
            <h2 id="sup-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Supersede — {str(current['title'])}</h2>
            <p style={muted}>
              The record authority's act, human-gated: the next version is recorded with its reason and the prior version stays replayable.
              {served === null ? ' Retrieve the item first to start from the served version; the fields below are otherwise empty.' : ` The fields are prefilled from version ${served.versionServed} as it was served.`}
            </p>
            <ItemFields idp="sup" d={supDraft} set={setSupDraft} />
            <h4 style={h3}>Supersession</h4>
            <div style={rowStyle}>
              <Field id="sup-reason" label="Reason (at least 8 characters, required)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={supReason} onChange={(e) => setSupReason(e.target.value)} />}</Field>
              <Field id="sup-eff" label="Effective at (optional)">{(id) => <input id={id} type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={supEffective} onChange={(e) => setSupEffective(e.target.value)} />}</Field>
            </div>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Supersede" pendingLabel="superseding" disabled={!draftOk(supDraft) || supReason.trim().length < 8}
                onRun={async () => {
                  setSupProblem(null);
                  const r = await graph.supersedeMemory(scope, selected, { ...toIntake(supDraft), supersession: { reason: supReason.trim(), effectiveAt: toIso(supEffective) } });
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the supersession was not answered'); setSupProblem(m); throw new Error(m); }
                  setSuperseded(r.data.memory as unknown as Row); setSupReceipt(r.data.receipt); setServed(null);
                  await load(); await loadRecord(selected);
                }} />
            </div>
            {supProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not recorded — {supProblem}</span></LiveStatus>}
            {superseded !== null && <p>recorded version <Mono>{str(superseded['version'])}</Mono> of <Mono>{str(superseded['itemId'])}</Mono>, superseding version {str(superseded['priorVersion'])}; {str(superseded['cites'])} cite(s); digest <Mono>{str(superseded['contentDigest'])}</Mono></p>}
            <Receipt receipt={supReceipt} />
          </section>

          <section aria-labelledby="wd-h" style={cardStyle}>
            <h2 id="wd-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Withdraw — {str(current['title'])}</h2>
            <Field id="wd-reason" label="Reason (at least 8 characters, required)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={wdReason} onChange={(e) => setWdReason(e.target.value)} />}</Field>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={wdReason.trim().length < 8}
                onRun={async () => {
                  setWdProblem(null);
                  const r = await graph.withdrawMemory(scope, selected, wdReason.trim());
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the withdrawal was not answered'); setWdProblem(m); throw new Error(m); }
                  setWithdrawn(r.data.memory as unknown as Row); setWdReceipt(r.data.receipt);
                  await load(); await loadRecord(selected);
                }} />
            </div>
            {wdProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not withdrawn — {wdProblem}</span></LiveStatus>}
            {withdrawn !== null && <p>item <Mono>{str(withdrawn['itemId'])}</Mono> is now {str(withdrawn['state'])}</p>}
            <Receipt receipt={wdReceipt} />
          </section>
        </>
      )}

      <section aria-labelledby="new-h" style={cardStyle}>
        <h2 id="new-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Record a memory item</h2>
        <p style={muted}>
          The knowledge owner's act, under the purpose <Mono>memory</Mono>: the first canonical version, its projection and its cites as
          dependencies. The audience purposes declare who may later retrieve it and under what.
        </p>
        <ItemFields idp="new" d={draft} set={setDraft} />
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label="Record" pendingLabel="recording" disabled={!draftOk(draft)}
            onRun={async () => {
              setNewProblem(null);
              const r = await graph.recordMemory(scope, toIntake(draft));
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the record was not answered'); setNewProblem(m); throw new Error(m); }
              setRecorded(r.data.memory as unknown as Row); setRecordReceipt(r.data.receipt); setDraft(EMPTY);
              await load();
            }} />
        </div>
        {newProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not recorded — {newProblem}</span></LiveStatus>}
        {recorded !== null && <p>recorded item <Mono>{str(recorded['itemId'])}</Mono> version <Mono>{str(recorded['version'])}</Mono>; {str(recorded['cites'])} cite(s); digest <Mono>{str(recorded['contentDigest'])}</Mono></p>}
        <Receipt receipt={recordReceipt} />
      </section>
    </>
  );
}
