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
 *
 * Since B19 (0079) a record is either a PERSON'S OWN (source kind human — typed into the record form) or DERIVED from a
 * claim version or a warning (source kind document, communication or telemetry — "Derive from a source"): the person
 * names the basis and declares the class, the title, the audience, the validity and the retention; the SERVER reads the
 * basis, computes the statement by the method memory-derive@1.0.0, inherits the controls of the basis and its evidence
 * (the most restrictive classification applies and is said as declared / inherited / applied), cites them and keeps the
 * derivation on the version. The listing's Source column names the basis; a retrieval serves the derivation block and the
 * basis's state (current / corrected / withdrawn — a withdrawn basis is served with the declaration, never refused); a
 * derived record is RE-DERIVED on supersession (the basis named again, the statement recomputed), never re-stated.
 *
 * Since B20 (0080) the workspace says which TIER answered. The METADATA tier is the memory projection (the listing, the
 * availability of a retrieval); the CONTENT tier is the canonical versions (the statement a retrieval serves). Every listing
 * row carries its `index_state` — `projected`, or `stale` while the memory projection is WITHDRAWN and the rows are served
 * from their event log, labelled — and every retrieval says the projection's condition beside the version served. When the
 * content tier does not answer, a retrieval is a 200 with `content 'unavailable'`: the item's metadata (its state, versions
 * and audience) is shown with the server's label, NO version is served and NO access is recorded; the supersede and derive
 * forms are not prefilled from it. A retrieval refused while the projection is withdrawn AND the content tier does not
 * answer (503 EYE-DEG-001) is shown as every refusal is — `not served — HTTP 503 EYE-DEG-001 — …`, verbatim.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { graph, projectionNote, type MemoryDeriveIntake, type MemoryDerived, type MemoryIntake, type MemoryRetrieval, type MemoryRow } from '../../../lib/graph';
import { CONTEXT_SUBJECT_KINDS, type ContextSubjectKind, type MemoryContext } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton,
  fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const PURPOSES = ['memory', 'graph', 'decision', 'briefing', 'prediction'] as const;
const RECORD_CLASSES = ['institutional', 'strategic'] as const;
/** Every source kind the payload may carry (the parse of a served version); the FORMS offer the two classes apart. */
const SOURCE_KINDS = ['human', 'document', 'communication', 'telemetry'] as const;
/** A person's own record: the only kind the record form (and a human record's supersede form) offers. */
const HUMAN_SOURCE_KINDS = ['human'] as const;
/** A derived record's kinds — declared by the person on "Derive from a source"; a warning basis is telemetry only (the server refuses the rest). */
const DERIVED_SOURCE_KINDS = ['document', 'communication', 'telemetry'] as const;
const BASIS_KINDS = ['claim', 'warning'] as const;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
const CITE_KINDS = ['evidence', 'claim', 'strategy', 'entity', 'edge', 'forecast', 'warning'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

/**
 * B19: what the person DECLARES for a derived record — the basis and the fields the server does not compute. No statement
 * (the method computes it), no source reference (the basis's evidence names its contract), no cites (the basis and its
 * evidence are cited by the server). An empty validity or retention field is sent as null: the server inherits.
 */
interface DeriveDraft {
  basisKind: (typeof BASIS_KINDS)[number]; basisId: string; basisVersion: string;
  sourceKind: (typeof DERIVED_SOURCE_KINDS)[number];
  recordClass: MemoryIntake['recordClass']; title: string;
  classification: MemoryIntake['audience']['classification']; roles: string; purposes: string;
  validFrom: string; validTo: string; retentionProfile: string; retainUntil: string; retentionBasis: string;
  decisionId: string; objectiveId: string;
  /** As on a person's draft: a served instant is submitted verbatim until the person edits that field. */
  served: Draft['served'];
}
const EMPTY_DERIVE: DeriveDraft = {
  basisKind: 'claim', basisId: '', basisVersion: '', sourceKind: 'document', recordClass: 'institutional', title: '',
  classification: 'internal', roles: '', purposes: '', validFrom: '', validTo: '', retentionProfile: '', retainUntil: '', retentionBasis: '',
  decisionId: '', objectiveId: '', served: NO_SERVED,
};
/** The client's own gate is the shape only (an object id, a title, a version when given); every other refusal is the server's, shown verbatim. */
const deriveOk = (d: DeriveDraft) =>
  UUID.test(d.basisId.trim()) && d.title.trim().length >= 3 && (d.basisVersion.trim() === '' || /^[1-9][0-9]*$/.test(d.basisVersion.trim()));
function toDeriveIntake(d: DeriveDraft): MemoryDeriveIntake {
  const blank = (s: string): string | null => (s.trim() === '' ? null : s.trim());
  return {
    basis: { kind: d.basisKind, id: d.basisId.trim(), ...(d.basisVersion.trim() === '' ? {} : { version: Number(d.basisVersion.trim()) }) },
    sourceKind: d.sourceKind, recordClass: d.recordClass, title: d.title.trim(),
    audience: { classification: d.classification, roles: csv(d.roles), purposes: csv(d.purposes) },
    validity: { from: d.served.validFrom ?? toIso(d.validFrom), to: d.served.validTo ?? toIso(d.validTo) },
    retention: { profile: blank(d.retentionProfile), retainUntil: d.served.retainUntil ?? toIso(d.retainUntil), basis: blank(d.retentionBasis) },
    cites: [], related: { decisionId: blank(d.decisionId), objectiveId: blank(d.objectiveId) },
  };
}
/**
 * A served DERIVED version's payload → the re-derivation's draft: the basis kind and id from the served derivation (the
 * version EMPTY = the latest, so a corrected basis is re-derived at its current version), the source kind as served, the
 * declared fields as served (the classification is the APPLIED one — the server lifts it again if the basis requires).
 */
function fromDerivedPayload(p: Row): DeriveDraft {
  const human = fromPayload(p);
  const derivation = rec(p['derivation']); const basis = rec(derivation['basis']);
  const as = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;
  return {
    basisKind: as(basis['kind'], BASIS_KINDS, 'claim'), basisId: str(basis['id']) === '—' ? '' : String(basis['id']), basisVersion: '',
    sourceKind: as(human.sourceKind, DERIVED_SOURCE_KINDS, 'document'),
    recordClass: human.recordClass, title: human.title, classification: human.classification, roles: human.roles, purposes: human.purposes,
    validFrom: human.validFrom, validTo: human.validTo, retentionProfile: human.retentionProfile, retainUntil: human.retainUntil, retentionBasis: human.retentionBasis,
    decisionId: human.decisionId, objectiveId: human.objectiveId, served: human.served,
  };
}
/** The listing row's derivation (the basis and the source, no content) → the draft a re-derivation starts from before anything is served. */
function fromListedDerivation(r: MemoryRow): DeriveDraft {
  const basis = rec(rec(r['derivation'])['basis']);
  const as = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : fallback;
  return { ...EMPTY_DERIVE, basisKind: as(basis['kind'], BASIS_KINDS, 'claim'), basisId: str(basis['id']) === '—' ? '' : String(basis['id']),
    sourceKind: as(r['source_kind'], DERIVED_SOURCE_KINDS, 'document'), title: str(r['title']) === '—' ? '' : String(r['title']) };
}
/** A listing row or a served payload carries `derivation` as an object for a derived record and nothing (or null) for a person's own. */
const isDerived = (v: unknown): boolean => v !== null && typeof v === 'object';

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
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

/**
 * The fields of a PERSON'S memory item — the record form and a human record's supersede form share them; `idp` keeps every
 * label bound to its own input. `sourceKinds` is what the Source kind select offers: `human` alone since B19 (a document,
 * communication or telemetry record is derived, never typed).
 */
function ItemFields({ idp, d, set, sourceKinds }: { idp: string; d: Draft; set: (next: Draft) => void; sourceKinds: readonly string[] }) {
  const up = (patch: Partial<Draft>) => set({ ...d, ...patch });
  const upCite = (i: number, patch: Partial<Cite>) => up({ cites: d.cites.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
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
        <Field id={`${idp}-skind`} label='Source kind (a document, communication or telemetry record is derived — see "Derive from a source")'>{(id) => sel(id, d.sourceKind, sourceKinds, (v) => up({ sourceKind: v as Draft['sourceKind'] }))}</Field>
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

/**
 * B19: the fields of a DERIVED record — the derive form and a derived record's supersede form (the re-derivation) share
 * them. The basis is named (a claim version or a warning; the version empty = the latest); the kind, class, title, audience,
 * validity, retention and related are declared. No statement, no source reference, no cites: the server computes the
 * statement, names the source from the basis's evidence and cites the basis and its evidence.
 */
function DeriveFields({ idp, d, set }: { idp: string; d: DeriveDraft; set: (next: DeriveDraft) => void }) {
  const up = (patch: Partial<DeriveDraft>) => set({ ...d, ...patch });
  return (
    <>
      <h4 style={h3}>Basis</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-bkind`} label="Basis kind">{(id) => sel(id, d.basisKind, BASIS_KINDS, (v) => up({ basisKind: v as DeriveDraft['basisKind'] }))}</Field>
        <Field id={`${idp}-bid`} label="Basis object id">{(id) => txt(id, d.basisId, (v) => up({ basisId: v }))}</Field>
        <Field id={`${idp}-bver`} label="Basis version (empty = the latest)">{(id) => txt(id, d.basisVersion, (v) => up({ basisVersion: v }), 'number')}</Field>
        <Field id={`${idp}-skind`} label="Source kind (a warning is telemetry; telemetry names a source with a registered series)">{(id) => sel(id, d.sourceKind, DERIVED_SOURCE_KINDS, (v) => up({ sourceKind: v as DeriveDraft['sourceKind'] }))}</Field>
      </div>
      <h4 style={h3}>Record</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-class`} label="Record class">{(id) => sel(id, d.recordClass, RECORD_CLASSES, (v) => up({ recordClass: v as DeriveDraft['recordClass'] }))}</Field>
        <Field id={`${idp}-title`} label="Title (3–200 characters)">{(id) => txt(id, d.title, (v) => up({ title: v }))}</Field>
      </div>
      <h4 style={h3}>Audience</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-cls`} label="Declared classification (lifted to the basis's when the basis is more restrictive)">{(id) => sel(id, d.classification, CLASSIFICATIONS, (v) => up({ classification: v as DeriveDraft['classification'] }))}</Field>
        <Field id={`${idp}-roles`} label="Roles (comma-separated; empty = any role with clearance)">{(id) => txt(id, d.roles, (v) => up({ roles: v }))}</Field>
        <Field id={`${idp}-purp`} label="Purposes the audience may read under (comma-separated)">{(id) => txt(id, d.purposes, (v) => up({ purposes: v }))}</Field>
      </div>
      <h4 style={h3}>Validity (world time)</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-vfrom`} label="Holds from (empty = the basis's event time)">{(id) => when(id, d.validFrom, d.served.validFrom, (v) => up({ validFrom: v, served: { ...d.served, validFrom: null } }))}</Field>
        <Field id={`${idp}-vto`} label="Holds until (optional)">{(id) => when(id, d.validTo, d.served.validTo, (v) => up({ validTo: v, served: { ...d.served, validTo: null } }))}</Field>
      </div>
      <h4 style={h3}>Retention (declared at record time)</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-rprof`} label="Retention profile (empty = the basis's, else its evidence's)">{(id) => txt(id, d.retentionProfile, (v) => up({ retentionProfile: v }))}</Field>
        <Field id={`${idp}-runtil`} label="Retain until (optional)">{(id) => when(id, d.retainUntil, d.served.retainUntil, (v) => up({ retainUntil: v, served: { ...d.served, retainUntil: null } }))}</Field>
        <Field id={`${idp}-rbasis`} label="Retention basis (optional)">{(id) => txt(id, d.retentionBasis, (v) => up({ retentionBasis: v }))}</Field>
      </div>
      <h4 style={h3}>Related</h4>
      <div style={rowStyle}>
        <Field id={`${idp}-dec`} label="Decision id (optional)">{(id) => txt(id, d.decisionId, (v) => up({ decisionId: v }))}</Field>
        <Field id={`${idp}-obj`} label="Objective id (optional)">{(id) => txt(id, d.objectiveId, (v) => up({ objectiveId: v }))}</Field>
      </div>
    </>
  );
}

/** What a derivation answered, VERBATIM: the record, the basis as read, the lift said, the statement and its digest, the source. */
function DerivedAnswer({ m }: { m: MemoryDerived }) {
  const b = m.basis; const s = m.source; const inh = m.inherited; const c = m.classification;
  return (
    <>
      <p>
        derived item <Mono>{m.itemId}</Mono> version <Mono>{String(m.version)}</Mono> from <Mono>{b.object_type}:{b.id}@{String(b.version)}</Mono> ({b.truth_state}, review {b.review_state});
        {' '}{String(m.cites)} cite(s); classification declared {c.declared}, inherited {c.inherited}, applied <strong>{c.applied}</strong>;
        {' '}synthetic {String(inh['synthetic_state'])}; retention {str(inh['retention_profile'])} ({str(inh['retention_from'])});
        {' '}holds from {fmtInstant(inh['valid_from'])} ({str(inh['valid_from_source'])}); digest <Mono>{m.contentDigest}</Mono>
      </p>
      <dl>
        <DefinitionRow term="Derived statement"><span style={{ whiteSpace: 'pre-wrap' }}>{m.statement}</span></DefinitionRow>
        <DefinitionRow term="Statement digest"><Mono>{m.statementDigest}</Mono></DefinitionRow>
        <DefinitionRow term="Source">
          {str(s['source_key'])}@{str(s['contract_version'])} · {str(s['connector_kind'])} · {s['media_type'] === null || s['media_type'] === undefined ? '—' : String(s['media_type'])} · {str(s['authority_class'])} · {str(s['data_origin'])}
          {m.seriesKeys.length > 0 ? ` · series ${m.seriesKeys.join(', ')}` : ''}
        </DefinitionRow>
        <DefinitionRow term="Evidence">
          {m.evidence.length === 0 ? 'none named' : (
            <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
              {m.evidence.map((e, i) => <li key={i}>EVD <Mono>{str(e['object_id'])}</Mono>@{str(e['version'])} · bytes <Mono>{str(e['digest'])}</Mono>{e['byte_start'] !== null && e['byte_start'] !== undefined ? ` · span ${String(e['byte_start'])}–${String(e['byte_end'])}` : ''}</li>)}
            </ul>
          )}
        </DefinitionRow>
      </dl>
    </>
  );
}

/** The served DERIVATION block, as recorded on the version: the basis, the method, the source, the evidence versions and the statement digest. */
function DerivationRow({ d }: { d: Row }) {
  const basis = rec(d['basis']); const source = rec(d['source']); const indicator = rec(d['indicator']);
  const evidence = Array.isArray(d['evidence']) ? (d['evidence'] as Row[]) : [];
  const series = Array.isArray(d['series_keys']) ? (d['series_keys'] as unknown[]).map(String) : [];
  return (
    <DefinitionRow term="Derivation">
      <div>
        basis <Mono>{str(basis['object_type'])}:{str(basis['id'])}@{str(basis['version'])}</Mono> ({str(d['truth_state_of_basis'])}, review {str(d['review_state_of_basis'])})
        {' · '}method <Mono>{str(d['method_ref'])}</Mono> · derived {fmtInstant(d['derived_at'])}
        {' · '}source {str(source['source_key'])}@{str(source['contract_version'])} ({str(source['connector_kind'])}, {str(source['media_type'])}, {str(source['authority_class'])}, {str(source['data_origin'])})
        {series.length > 0 ? ` · series ${series.join(', ')}` : ''}
        {isDerived(d['indicator']) ? ` · indicator ${str(indicator['rule'])}` : ''}
      </div>
      <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
        {evidence.map((e, i) => <li key={i}>EVD <Mono>{str(e['object_id'])}</Mono>@{str(e['version'])} · bytes <Mono>{str(e['digest'])}</Mono>{e['byte_start'] !== null && e['byte_start'] !== undefined ? ` · span ${String(e['byte_start'])}–${String(e['byte_end'])}` : ''}</li>)}
      </ul>
      <div>statement digest <Mono>{str(d['statement_digest'])}</Mono></div>
    </DefinitionRow>
  );
}

/**
 * B20: the projection's condition beside what was served — from the FLAG (`condition`), the server's label as the wording,
 * a fallback so a non-current state is never silent. The index state (`projected` / `stale`) is the availability's.
 */
function ProjectionLine({ r }: { r: MemoryRetrieval }) {
  const note = projectionNote(r.projection);
  if (note === null) return null;
  return (
    <p style={muted}>
      <strong>Projection {note.condition}.</strong> {note.text}
      {note.code !== null ? <> · code <Mono>{note.code}</Mono></> : null}
    </p>
  );
}

/** The served version, VERBATIM — or, when the content tier did not answer (B20), the item's metadata alone with the server's label. */
function ServedVersion({ r }: { r: MemoryRetrieval }) {
  const a = r.availability;
  const availability = (
    <>
      {' · '}item {a.state}
      {a.attention_state !== null && a.attention_state !== 'none' ? <> · attention: {String(a.attention_state)}</> : null}
      {a.basis_state !== null && a.basis_state !== undefined ? <> · basis {String(a.basis_state)}</> : null}
      {' · '}superseded {a.superseded_versions} time(s){a.last_superseded_at !== null ? <>, last {fmtInstant(a.last_superseded_at)}</> : null}
      {' · '}as of {r.asOf === null ? 'now' : fmtInstant(r.asOf)}
    </>
  );
  const index = (
    <>
      {' · '}projection {r.projection.condition} · index {a.index_state}
      {a.projected === false ? ' (the item is in the log, not in the projection)' : ''}
      {a.drift !== null && a.drift !== undefined ? <> · drifted: the projection says {a.drift.projected}, the log says {a.drift.log} (the log's is served)</> : null}
    </>
  );
  if (r.content === 'unavailable' || r.version === null) {
    // THE CONTENT TIER DID NOT ANSWER: the metadata tier alone — no version, no statement, no access recorded. The label is the server's.
    const d = r.degraded;
    return (
      <>
        <p>
          <strong>version {a.current_version} of the item is current; no version was served; no access was recorded</strong>
          {availability}{index}
        </p>
        <ProjectionLine r={r} />
        <LiveStatus assertive>
          <strong>Content unavailable.</strong> {d?.label ?? 'the content tier did not answer; this is the item\'s metadata — the statement is not served'}
          {' '}(<Mono>{d?.code ?? 'EYE-DEG-001'}</Mono>){d !== undefined && d.detail !== '' ? <> — {d.detail}</> : null}
        </LiveStatus>
      </>
    );
  }
  const p = r.version.payload; const source = rec(p['source']); const audience = rec(p['audience']);
  const validity = rec(p['validity']); const retention = rec(p['retention']); const sup = p['supersession'] === undefined ? null : rec(p['supersession']);
  const related = rec(p['related']); const cites = Array.isArray(p['cites']) ? (p['cites'] as Row[]) : [];
  return (
    <>
      <p>
        <strong>version {a.current_version} of {a.versions} is current; you were served version {r.versionServed}</strong>
        {a.served_is_current ? ' (the current one)' : ' (a superseded version, replayed)'}
        {availability} · access recorded as <Mono>{r.accessId}</Mono>{index}
      </p>
      <ProjectionLine r={r} />
      <dl>
        <DefinitionRow term="Version served"><Mono>{String(r.version.object_version)}</Mono> · recorded {fmtInstant(r.version.recorded_at)} · {str(r.version.lifecycle_state)} · truth {str(r.version.truth_state)} · synthetic {String(r.version.synthetic_state)}</DefinitionRow>
        <DefinitionRow term="Admitted for purpose"><Mono>{str(r.version.purpose_scope)}</Mono></DefinitionRow>
        <DefinitionRow term="Classification">{str(r.version.classification)}</DefinitionRow>
        <DefinitionRow term="Class / title"><Mono>{str(p['record_class'])}</Mono> — {str(p['title'])}</DefinitionRow>
        <DefinitionRow term="Statement"><span style={{ whiteSpace: 'pre-wrap' }}>{str(p['statement'])}</span></DefinitionRow>
        <DefinitionRow term="Source">{str(source['kind'])} · {str(source['ref'])}</DefinitionRow>
        {isDerived(p['derivation']) && <DerivationRow d={rec(p['derivation'])} />}
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

/* B23 (0084) context */
/**
 * CONTEXT FOR A PURPOSE (L3-I02): ONE governed, audited query about a SUBJECT (an entity such as a corridor, a claim, an edge, a
 * strategy object, an evidence object, a warning or a forecast) under a DECLARED purpose — the items whose served version names the
 * subject and that the purpose, your clearance and the audience roles admit, each with the links that explain why it is served. The
 * answer states its PRODUCT STATE from the server's flag — complete, stale (lagging / unverified / served from the log) or partial
 * (what was left out is named, with its reason) — and the revision it is for. What the policy withholds is never shown or counted:
 * the server says only that policy filtering applied. Every served item version is an access recorded on the item. B23-F1 (0085):
 * the same holds for what the answer reports as left out; an answer served from the event log says, once, that rows the log cannot
 * vouch for are neither served nor counted.
 */
function ContextPanel({ scope }: { scope: { tenantId: string; domainId: string } }) {
  const [purpose, setPurpose] = useState('sourcing decision');
  const [kind, setKind] = useState<ContextSubjectKind>('entity');
  const [subjectId, setSubjectId] = useState('');
  const [asOf, setAsOf] = useState('');
  const [answer, setAnswer] = useState<MemoryContext | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const note = answer === null ? null : answer.product_state === 'complete' ? null
    : { text: answer.label ?? projectionNote(answer.projection)?.text ?? `the answer is ${answer.product_state}`, code: answer.code };
  return (
    <section aria-labelledby="context-h" style={cardStyle}>
      <h2 id="context-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Context for a purpose</h2>
      <p style={muted}>
        One audited query: the memory about a subject that your declared purpose, your clearance and the items' audiences admit, with the
        links that explain each item. The answer says whether it is complete, stale or partial — and names what a partial answer left out.
      </p>
      <div style={rowStyle}>
        <Field id="ctx-purpose" label="Declared purpose">
          {(id) => <><input id={id} list="ctx-purposes" style={{ ...inputStyle, inlineSize: '100%' }} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            <datalist id="ctx-purposes">{['sourcing decision', ...PURPOSES].map((p) => <option key={p} value={p} />)}</datalist></>}
        </Field>
        <Field id="ctx-kind" label="Subject kind">
          {(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={kind} onChange={(e) => setKind(e.target.value as ContextSubjectKind)}>{CONTEXT_SUBJECT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>}
        </Field>
        <Field id="ctx-subject" label="Subject id">
          {(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={subjectId} onChange={(e) => setSubjectId(e.target.value.trim())} placeholder="the object id" />}
        </Field>
        <Field id="ctx-asof" label="As of (optional)">
          {(id) => <input id={id} type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={asOf} onChange={(e) => setAsOf(e.target.value)} />}
        </Field>
      </div>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Retrieve the context" pendingLabel="retrieving" disabled={!UUID.test(subjectId)}
          onRun={async () => {
            setProblem(null);
            const iso = toIso(asOf);
            const r = await graph.memoryContext(scope, purpose, { kind, id: subjectId }, iso === null ? undefined : iso);
            if (!r.ok || r.data === undefined) {
              const m = refusal(r, 'the context was not answered');
              setAnswer(null); setReceipt(null); setProblem(m); throw new Error(m);
            }
            setAnswer(r.data.context); setReceipt(r.data.receipt);
          }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not served — {problem}</span></LiveStatus>}
      {answer !== null && (
        <>
          <p>
            <strong>{answer.product_state === 'complete' ? 'Complete.' : answer.product_state === 'stale' ? 'Stale.' : 'Partial.'}</strong>{' '}
            For revision <Mono>{str(answer.revision)}</Mono> · verified through <Mono>{str(answer.verified_seq)}</Mono> · {answer.lag_events} change(s) not yet verified ·
            projection {answer.condition} · served from the {answer.source}{answer.as_of !== null ? <> · as of {fmtInstant(answer.as_of)}</> : null}
          </p>
          {note !== null && (
            <LiveStatus>
              <span style={muted}>{note.text}{note.code !== null ? <> · code <Mono>{note.code}</Mono></> : null}</span>
            </LiveStatus>
          )}
          {answer.omitted.length > 0 && (
            <ul aria-label="left out of this answer">
              {answer.omitted.map((o, i) => <li key={i}><Mono>{o.projection}</Mono>{o.rows !== null ? ` (${o.rows})` : ''} — {o.reason}</li>)}
            </ul>
          )}
          <p style={muted}>{answer.policy}. {answer.consistency}.{answer.bound.truncated ? ` The answer is bounded at ${answer.bound.limit} items; more were admitted.` : ''}</p>
          {/* B23-F1 (0085): the log-sourced answer's one constant note (it counts nothing and names no record) */}
          {answer.log_note !== null && answer.log_note !== undefined && <p style={muted}>{answer.log_note}.</p>}
          {answer.items.length === 0 ? <Empty>No item is served for this subject under this purpose.</Empty> : answer.items.map((it) => (
            <article key={it.item_id} aria-label={it.title} style={{ borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlock: 'var(--eye-space-8)' }}>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)', marginBlock: 0 }}>{it.title}</h3>
              <p style={muted}>
                <Mono>{it.item_id}</Mono> · version {it.version}{it.served_is_current ? ' (current)' : ` (current is ${it.current_version})`} · {it.classification} · {it.truth_state} · index {it.index_state}
                {it.basis_state !== null ? ` · basis ${it.basis_state}` : ''}{it.drift !== null ? ` · drifted: the projection says ${it.drift.projected}, the log says ${it.drift.log}` : ''}
              </p>
              <p>{it.statement}</p>
              <p style={muted}>Why it is served:</p>
              <ul aria-label={`explanation links of ${it.title}`}>
                {it.explanation_links.map((l, i) => (
                  <li key={i}>
                    <Mono>{l.via}</Mono> → {l.kind} {l.label !== undefined ? <strong>{l.label}</strong> : null} <Mono>{short(l.id)}</Mono>
                    {l.version !== undefined ? `@${l.version}` : ''}{l.state !== undefined ? ` (${l.state})` : ''}{l.names_subject === true ? ' — the subject' : ''}
                    {l.rationale !== undefined ? ` — ${l.rationale}` : ''}{l.digest !== undefined ? <> · <Mono>{short(l.digest)}</Mono></> : null}
                  </li>
                ))}
              </ul>
              {it.withheld_links.edges_current + it.withheld_links.entities_current > 0 && (
                <p style={muted}>{it.withheld_links.edges_current + it.withheld_links.entities_current} link(s) left out (named above).</p>
              )}
            </article>
          ))}
        </>
      )}
      <Receipt receipt={receipt} />
    </section>
  );
}
/* end B23 context */

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
  /** B19: the re-derivation's draft — a derived record is superseded by naming its basis again, never by a typed statement. */
  const [supDerive, setSupDerive] = useState<DeriveDraft>(EMPTY_DERIVE);
  const [supReason, setSupReason] = useState('');
  const [supEffective, setSupEffective] = useState('');
  const [supReceipt, setSupReceipt] = useState<ReceiptT>(null);
  const [superseded, setSuperseded] = useState<Row | null>(null);
  const [supProblem, setSupProblem] = useState<string | null>(null);
  const [wdReason, setWdReason] = useState('');
  const [wdReceipt, setWdReceipt] = useState<ReceiptT>(null);
  const [withdrawn, setWithdrawn] = useState<Row | null>(null);
  const [wdProblem, setWdProblem] = useState<string | null>(null);
  const [deriveDraft, setDeriveDraft] = useState<DeriveDraft>(EMPTY_DERIVE);
  const [deriveReceipt, setDeriveReceipt] = useState<ReceiptT>(null);
  const [derived, setDerived] = useState<MemoryDerived | null>(null);
  const [deriveProblem, setDeriveProblem] = useState<string | null>(null);

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
    const row = rows?.find((r) => String(r['item_id']) === itemId);
    setSelected(itemId); setServed(null); setRetrieveProblem(null); setRetrieveReceipt(null);
    setSupDraft(EMPTY); setSupDerive(row !== undefined && isDerived(row['derivation']) ? fromListedDerivation(row) : EMPTY_DERIVE);
    setSupReason(''); setSupEffective(''); setSupReceipt(null); setSuperseded(null); setSupProblem(null);
    setWdReason(''); setWdReceipt(null); setWithdrawn(null); setWdProblem(null);
    void loadRecord(itemId);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the memory…</Empty>;

  const current = selected === null ? null : rows.find((r) => String(r['item_id']) === selected) ?? null;
  /**
   * The supersede form's class: the served version decides when one is served, else the listing row's derivation (the server's,
   * not a guess). B20: a metadata-only answer served no version and decides nothing — the listing row's derivation stands.
   */
  const supIsDerived = served !== null && served.version !== null ? isDerived(served.version.payload['derivation']) : current !== null && isDerived(current['derivation']);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Memory</h1>
      <UnknownNote>
        A memory item is an <strong>institutional</strong> or <strong>strategic</strong> record with a source, an audience
        (classification, roles, purposes), a validity in world time and a retention declared when it is recorded. The listing
        below shows each item's <strong>record without its content</strong>. The statement is served only by a
        <strong> retrieval under a declared purpose</strong> — a governed, audited read: who read which version, under which
        purpose, as of when, is recorded on the item. A superseded version stays replayable as of an instant. A record is a
        person's own (source kind <strong>human</strong>) or <strong>derived</strong> from a claim version or a warning (document,
        communication, telemetry): its statement is computed by the server, its controls inherited from the basis and its evidence,
        and its derivation kept on the version; the listing names the basis and a retrieval says the basis's state. The Index
        column says which tier serves each row — <strong>projected</strong> by the memory projection, or <strong>stale</strong> from
        the item's event log while that projection is withdrawn — and a retrieval says the projection's condition beside the
        version served; when the content tier does not answer, the retrieval shows the item's metadata alone and says so.
      </UnknownNote>

      <section aria-labelledby="list-h" style={cardStyle}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Items ({rows.length})</h2>
        {rows.length === 0 ? <Empty>No memory item is recorded in this domain.</Empty> : (
          <ScrollBox label="memory items">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Title</Th><Th>Class</Th><Th>Source</Th><Th>Current version</Th><Th>Classification</Th><Th>Audience purposes</Th><Th>State</Th><Th>Attention</Th><Th>Retained under</Th><Th>Recorded at</Th><Th>Index</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r['item_id']); const isSel = id === selected;
                  // B19: a derived record's listing row carries its derivation without content — the basis it was derived from is named beside the kind.
                  const basis = isDerived(r['derivation']) ? rec(rec(r['derivation'])['basis']) : null;
                  // B20: `stale` while the memory projection is withdrawn (the row is the log's); a row the projection lacks, or one the two disagree on, is marked.
                  const drift = isDerived(r['drift']) ? rec(r['drift']) : null;
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
                      <Td mono>{str(r['source_kind'])}{basis !== null ? ` ← ${str(basis['object_type'])}:${short(basis['id'])}@${str(basis['version'])}` : ''}</Td>
                      <Td mono>{str(r['object_version'])}{Number(r['superseded_versions'] ?? 0) > 0 ? ` (${String(r['superseded_versions'])} superseded)` : ''}</Td>
                      <Td>{str(r['classification'])}</Td>
                      <Td mono>{list(r['audience_purposes'])}</Td>
                      <Td>{str(r['state'])}</Td>
                      <Td>{str(r['attention_state'])}{r['attention_reason'] !== null && r['attention_reason'] !== undefined ? ` — ${String(r['attention_reason'])}` : ''}</Td>
                      <Td mono>{str(r['retention_profile'])}{r['retain_until'] !== null && r['retain_until'] !== undefined ? ` until ${fmtInstant(r['retain_until'])}` : ''}</Td>
                      <Td>{fmtInstant(r['recorded_at'])}</Td>
                      <Td>
                        {str(r['index_state'])}
                        {r['projected'] === false ? <> — <em>log-only</em> (the projection lacks this item)</> : null}
                        {drift !== null ? <> — <em>drifted</em>: the projection says {str(drift['projected'])}, the log says {str(drift['log'])}</> : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {/* B23 (0084) context */}
      <ContextPanel scope={scope} />
      {/* end B23 context */}

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
                  // B20: the supersede and derive forms start from a SERVED version only — a metadata-only answer (the content tier did not answer) prefills nothing.
                  const version = r.data.memory.content === 'unavailable' ? null : r.data.memory.version;
                  if (version !== null) {
                    setSupDraft(fromPayload(version.payload));
                    setSupDerive(isDerived(version.payload['derivation']) ? fromDerivedPayload(version.payload) : EMPTY_DERIVE);
                  }
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
              {supIsDerived
                ? ' A derived record is re-derived: the record authority names the basis version (empty = the latest); the statement is recomputed by the server and the controls inherited again.'
                : ''}
              {served === null
                ? (supIsDerived ? " Retrieve the item first to start from the served version; the basis below is the listing's, the other fields are empty." : ' Retrieve the item first to start from the served version; the fields below are otherwise empty.')
                : ` The fields are prefilled from version ${served.versionServed} as it was served.`}
            </p>
            {supIsDerived ? <DeriveFields idp="sup" d={supDerive} set={setSupDerive} /> : <ItemFields idp="sup" d={supDraft} set={setSupDraft} sourceKinds={HUMAN_SOURCE_KINDS} />}
            <h4 style={h3}>Supersession</h4>
            <div style={rowStyle}>
              <Field id="sup-reason" label="Reason (at least 8 characters, required)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={supReason} onChange={(e) => setSupReason(e.target.value)} />}</Field>
              <Field id="sup-eff" label="Effective at (optional)">{(id) => <input id={id} type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={supEffective} onChange={(e) => setSupEffective(e.target.value)} />}</Field>
            </div>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Supersede" pendingLabel="superseding" disabled={(supIsDerived ? !deriveOk(supDerive) : !draftOk(supDraft)) || supReason.trim().length < 8}
                onRun={async () => {
                  setSupProblem(null);
                  const supersession = { reason: supReason.trim(), effectiveAt: toIso(supEffective) };
                  const r = await graph.supersedeMemory(scope, selected, supIsDerived ? { ...toDeriveIntake(supDerive), supersession } : { ...toIntake(supDraft), supersession });
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the supersession was not answered'); setSupProblem(m); throw new Error(m); }
                  setSuperseded(r.data.memory as unknown as Row); setSupReceipt(r.data.receipt); setServed(null);
                  await load(); await loadRecord(selected);
                }} />
            </div>
            {supProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not recorded — {supProblem}</span></LiveStatus>}
            {superseded !== null && (
              <>
                <p>
                  recorded version <Mono>{str(superseded['version'])}</Mono> of <Mono>{str(superseded['itemId'])}</Mono>, superseding version {str(superseded['priorVersion'])}; {str(superseded['cites'])} cite(s); digest <Mono>{str(superseded['contentDigest'])}</Mono>
                  {typeof superseded['statement'] === 'string' ? ' — statement recomputed' : ''}
                </p>
                {typeof superseded['statement'] === 'string' && (
                  <dl>
                    <DefinitionRow term="Derived statement"><span style={{ whiteSpace: 'pre-wrap' }}>{String(superseded['statement'])}</span></DefinitionRow>
                    <DefinitionRow term="Basis"><Mono>{str(rec(superseded['basis'])['object_type'])}:{str(rec(superseded['basis'])['id'])}@{str(rec(superseded['basis'])['version'])}</Mono> ({str(rec(superseded['basis'])['truth_state'])}, review {str(rec(superseded['basis'])['review_state'])}) · classification declared {str(rec(superseded['classification'])['declared'])}, inherited {str(rec(superseded['classification'])['inherited'])}, applied <strong>{str(rec(superseded['classification'])['applied'])}</strong></DefinitionRow>
                  </dl>
                )}
              </>
            )}
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
          The knowledge owner's act, under the purpose <Mono>memory</Mono>: a person's own record (source kind <Mono>human</Mono>) — the first
          canonical version, its projection and its cites as dependencies. The audience purposes declare who may later retrieve it and under
          what. A document, communication or telemetry record is not typed here: it is derived from its source below.
        </p>
        <ItemFields idp="new" d={draft} set={setDraft} sourceKinds={HUMAN_SOURCE_KINDS} />
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

      <section aria-labelledby="derive-h" style={cardStyle}>
        <h2 id="derive-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Derive from a source</h2>
        <p style={muted}>
          The knowledge owner's act, human-gated, under the purpose <Mono>memory</Mono>: name a claim version or a warning; the server reads it,
          computes the statement by the method <Mono>memory-derive@1.0.0</Mono>, inherits the controls of the basis and its evidence (the most
          restrictive classification applies and is said), refuses a basis still queued for review, rejected, corrected, withdrawn or imported,
          and records the first version with its derivation. The basis and its evidence are cited by the server; a derivation whose inherited
          classification your clearance in this domain does not cover is refused (you could not read the record). The kind is your declaration
          with one verified rule: <Mono>telemetry</Mono> names a source with a registered series, and a warning is telemetry only.
        </p>
        <DeriveFields idp="derive" d={deriveDraft} set={setDeriveDraft} />
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label="Derive" pendingLabel="deriving" disabled={!deriveOk(deriveDraft)}
            onRun={async () => {
              setDeriveProblem(null);
              const r = await graph.deriveMemory(scope, toDeriveIntake(deriveDraft));
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the derivation was not answered'); setDeriveProblem(m); throw new Error(m); }
              setDerived(r.data.memory); setDeriveReceipt(r.data.receipt); setDeriveDraft(EMPTY_DERIVE);
              await load();
            }} />
        </div>
        {deriveProblem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not derived — {deriveProblem}</span></LiveStatus>}
        {derived !== null && <DerivedAnswer m={derived} />}
        <Receipt receipt={deriveReceipt} />
      </section>
    </>
  );
}
