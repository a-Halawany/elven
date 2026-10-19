'use client';
/**
 * CP-6 B50 §HD — AN OBJECT'S HEADER, version by version (F-P3-01: ES-05-001, ES-26-001/-004, V03-T-051): `/graph/header/<TYPE>/<id>` opens
 * EXACTLY the object it names (objects.read) — or says why the link cannot. B81's ObjectHeader of the latest version carries §HD's adapter
 * (lib/header-b50.ts adaptHeader: the trust fields stated or their declared absences, the time axes from the qualifiers); then every version:
 * whether its header is STATED (a side-ledger row) or RECORDED BEFORE B50 (nothing back-filled); the B50 fields in words (DeclaredAbsenceText —
 * never blank, never "unresolved"); the time qualifiers (TimeValueText — kind, bounds as days, precision, zone, source); the operation (the
 * bound action, the idempotency key and the trace id with their basis); the inherited controls with their basis; the limitations stated.
 * This page reads only.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { call } from '../../../../../lib/api';
import { routeId, type ObjectHeaderInput } from '../../../../../lib/object-b81';
import { B50_FIELDS, adaptHeader, fieldText, headerField, qualifierValue, type QualifierRow } from '../../../../../lib/header-b50';
import { ObjectHeader } from '../../../../../components/object';
import { DeclaredAbsenceText, TimeValueText } from '../../../../../components/knowledge';
import { Empty, LiveStatus, Mono, cardStyle } from '../../../../../components/observation';

type Row = Record<string, unknown>;
type Receipt = { policyDecisionId: string; auditSeq: number };
interface HeaderRead { objectId: string; objectType: string; identity: Row; versions: Array<{ version: number; recordedAt: string; lifecycleState: string; header: string; operation: Row | null; time: QualifierRow[] }> }
/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): the ready page is titled by B81's ObjectHeader (level 1); every other branch here. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const FIELD_LABEL: Record<string, string> = { confidence: 'Confidence', uncertainty: 'Uncertainty', quality_state: 'Quality', freshness_state: 'Freshness', ontology_ref: 'Ontology', quality_profile: 'Quality profile', provenance_ref: 'Provenance' };
const CONTROL_LABEL: Record<string, string> = { rights_profile: 'Rights', residency_profile: 'Residency', retention_profile: 'Retention', access_policy_ref: 'Access policy' };

function read<T>(s: { tenantId: string; domainId: string }, path: string, id: string, payload: Row = {}) {
  return call<T>(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/objects/${id}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action: 'objects.read', object_type: 'OBJ', object_id: id,
    purpose_id: 'observation', side_effect_class: 'none', consequence_class: 'C1',
  }, payload);
}

/** One B50 field of one version: its value, or its declared absence (the library's text role), or "recorded before B50". */
function FieldCell({ row, field, stated }: { row: Row; field: string; stated: boolean }) {
  const f = headerField(row, field, stated);
  if (f.kind === 'pre_b50') return <DeclaredAbsenceText absence={null} field={FIELD_LABEL[field]} />;
  if (f.kind === 'absent') return <DeclaredAbsenceText absence={f.absence} field={FIELD_LABEL[field]} />;
  return <span className="eye-text-fact">{fieldText(f)}</span>;
}

function HeaderBody() {
  const { scope } = useShell();
  const params = useParams<{ type: string; id: string }>();
  const type = typeof params.type === 'string' && /^[A-Z]{3}$/.test(params.type) ? params.type : null;
  const id = routeId(params.id);
  const [head, setHead] = useState<HeaderRead | null>(null); const [rows, setRows] = useState<Row[] | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null); const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (type === null || id === null) return;
    const [h, g] = await Promise.all([read<{ header: HeaderRead; receipt: Receipt }>(scope, '/header', id), read<{ history: Row[]; receipt: Receipt }>(scope, '/get', id, { history: true })]);
    if (!h.ok || h.data === undefined || h.data.header.objectType !== type) { setProblem(`The header was not read — HTTP ${h.status}${h.error?.code === undefined ? '' : ` ${h.error.code}`}: ${h.error?.message ?? (h.ok ? `the answer names a ${h.data?.header.objectType ?? '?'} object, not ${type}` : 'no answer')}`); return; }
    if (!g.ok || g.data === undefined) { setProblem(`The versions were not read — HTTP ${g.status}: ${g.error?.message ?? 'no answer'}`); return; }
    setHead(h.data.header); setRows(g.data.history); setReceipt(h.data.receipt); setProblem(null);
  }, [scope, type, id]);
  useEffect(() => { void load(); }, [load]);

  if (type === null || id === null) return (<><PageTitle>Object header</PageTitle><LiveStatus assertive>This link cannot open a header: it names no object type (three capitals, e.g. EVD) or no object id (a uuid).</LiveStatus><p><Link href="/graph/timeline">Open the timeline instead</Link></p></>);
  if (problem !== null) return (<><PageTitle>Header of {type} {id.slice(0, 8)}…</PageTitle><LiveStatus assertive>{problem}</LiveStatus><p><Link href="/graph/timeline">Open the timeline</Link> (the nearest safe state).</p></>);
  if (head === null || rows === null) return (<><PageTitle>Header of {type} {id.slice(0, 8)}…</PageTitle><Empty>reading the header…</Empty></>);

  const latest = rows[rows.length - 1] ?? {};
  const latestRead = head.versions[head.versions.length - 1] ?? null;
  const a = adaptHeader(latest, latestRead === null ? null : { version: latestRead.version, header: latestRead.header, time: latestRead.time });
  const payload = (latest['payload'] ?? null) as Row | null;
  const input: ObjectHeaderInput = {
    type, id, title: typeof payload?.['title'] === 'string' ? String(payload['title']) : typeof payload?.['filename'] === 'string' ? String(payload['filename']) : null,
    version: Number(latest['object_version'] ?? head.versions.length), versionCount: head.versions.length, latestVersion: head.versions.length,
    owner: typeof latest['accountable_owner'] === 'string' ? String(latest['accountable_owner']) : null, ownerRole: 'accountable owner', serverState: typeof latest['lifecycle_state'] === 'string' ? String(latest['lifecycle_state']) : null,
    truth: typeof latest['truth_state'] === 'string' ? String(latest['truth_state']) : null, synthetic: latest['synthetic_state'] === true, classification: typeof latest['classification'] === 'string' ? String(latest['classification']) : null,
    time: a.time, trust: a.trust,
    authority: 'No approval is read here: the header states what the record carries and approves, certifies or changes nothing.',
    relationships: [{ label: 'its timeline — every version, as known at any instant', href: `/graph/timeline?type=${type}&id=${id}&axis=record` },
                    { label: 'its source-to-product trace', href: `/graph/trace/${type}/${id}?version=${String(latest['object_version'] ?? 1)}` }],
    provenance: [{ label: typeof latest['provenance_ref'] === 'string' ? `provenance: ${String(latest['provenance_ref'])}` : 'no provenance reference recorded', href: null }],
    receipt, effective: { support: 'live_only', asOf: null },
  };
  return (
    <>
      <p className="eye-shell-meta"><Link href="/graph/timeline">← Timeline and as-of explorer</Link></p>
      <ObjectHeader input={input} />
      <section style={cardStyle} aria-labelledby="hd-versions-h">
        <h2 id="hd-versions-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Every version&apos;s header ({head.versions.length})</h2>
        <p className="eye-help">A version admitted since B50 carries its STATED header: each field a value or its declared absence, its time qualifiers, its operation. A version recorded before B50 is never back-filled — it says so.</p>
        <ol aria-label="The versions of this object, oldest first">
          {head.versions.map((v) => {
            const row = rows.find((r) => Number(r['object_version']) === v.version) ?? {};
            const stated = v.header === 'stated';
            const basis = ((v.operation?.['basis'] ?? null) as Row | null);
            const controls = ((basis?.['controls'] ?? {}) as Record<string, Row>);
            const limits = ((basis?.['limitations'] ?? []) as unknown[]).map(String);
            return (
              <li key={v.version} data-header={stated ? 'stated' : 'pre_b50'}>
                <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Version {v.version} — {v.lifecycleState}: {stated ? 'header stated' : v.header}</h3>
                <dl>
                  {B50_FIELDS.map((f) => <div key={f}><dt>{FIELD_LABEL[f]}</dt><dd><FieldCell row={row} field={f} stated={stated} /></dd></div>)}
                  {stated ? (
                    <>
                      <div><dt>Time qualifiers</dt><dd>{v.time.length === 0 ? 'none stated' : (
                        <ul aria-label={`The time qualifiers of version ${v.version}`}>{v.time.map((t) => <li key={t.axis}>{t.axis.replace(/_/g, ' ')}: <TimeValueText value={qualifierValue(t)} label={t.axis} />{t.declared ? ' — declared by the writer' : ' — derived from the header'}</li>)}</ul>)}</dd></div>
                      <div><dt>Operation</dt><dd>{String(v.operation?.['boundAction'] ?? '—')} · idempotency key <Mono>{String(v.operation?.['idempotencyKey'] ?? '—')}</Mono> ({String(v.operation?.['idempotencyBasis'] ?? '—')}) · trace <Mono>{String(v.operation?.['traceId'] ?? '—')}</Mono> ({String(v.operation?.['traceSource'] ?? '—')})</dd></div>
                      <div><dt>Controls and their basis</dt><dd><ul aria-label={`The controls of version ${v.version}`}>{Object.entries(CONTROL_LABEL).map(([k, label]) => {
                        const c = controls[k] ?? null;
                        return <li key={k}>{label}: {c === null ? 'no basis recorded' : `${c['value'] === null || c['value'] === undefined ? 'none stated' : String(c['value'])} — from ${String(c['from'] ?? '?')}${c['ref'] === undefined ? '' : ` (${String(c['ref'])})`}${c['reason'] === undefined ? '' : `: ${String(c['reason'])}`}`}</li>;
                      })}</ul></dd></div>
                      <div><dt>Limitations stated</dt><dd>{limits.length === 0 ? 'none' : <ul aria-label={`The limitations of version ${v.version}`}>{limits.map((l) => <li key={l}>{l}</li>)}</ul>}</dd></div>
                    </>
                  ) : <div><dt>Time qualifiers, operation, controls</dt><dd><DeclaredAbsenceText absence={null} field="the side ledgers" /></dd></div>}
                </dl>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

export default function HeaderPage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><HeaderBody /></Suspense>;
}
