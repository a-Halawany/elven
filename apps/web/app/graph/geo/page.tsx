'use client';
/**
 * GEOGRAPHY — CP-6 B82 §GM (F-P7-E-21: CMP-064, VIZ-16, VIZ-18; DESIGN D4). The governed geographic-reference register and the corridor map
 * it draws. NO GEOGRAPHY EXISTED before B82: every position on this page was TYPED by a named data steward (EPSG:4326, with its positional
 * uncertainty, its source and its licence) — never imported, never fetched; there is no basemap, no tile and no network request for a map.
 *
 *   Context    what the map is and is not; the register's counts and the instant of the read.
 *   Primary    the corridor map (GeospatialMap — MapCanvas over the declared references) with its table alternative.
 *   Actions    DECLARE a reference (graph.geo.declare — a data steward, human-gated; the port re-checks the role and every rule) through the
 *              Command Review; the person's own draft of the form (PAT-03 — never a submission).
 *   Inspector  the selected reference's versions (its history) and its RETIREMENT (graph.geo.retire — the next version, retired; the history
 *              is kept; not undone — a new reference is declared instead).
 *
 * Every refusal is shown in the server's words; nothing is optimistic (the register is re-read after each act). Every reference the act or a
 * harness declares is SYNTHETIC. CONSTRUCTION only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShell } from '../layout';
import { geoApi, type GeoLayerRead, type Receipt as ReceiptT } from '../../../lib/geo-api-b82';
import { GEO_KIND_WORDS, geoReferenceOf, geometryFromForm, type GeoKind } from '../../../lib/canvas-specs-b82';
import { geometryText } from '../../../lib/canvas-b82';
import type { GeoReference } from '../../../lib/b82-seams';
import { GeospatialMap } from '../../../components/canvas';
import { Composition } from '../../../components/layout';
import { CommandReview } from '../../../components/authority';
import { Field, FormDraft, Select, TextArea } from '../../../components/forms';
import { DataTable } from '../../../components/data';
import { GovernedButton, LiveStatus } from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
const KINDS = Object.keys(GEO_KIND_WORDS) as GeoKind[];
const EMPTY = { kind: 'chokepoint' as GeoKind, key: '', label: '', positions: '', uncertaintyM: '', sourceStatement: '', licenceStatement: '', chokepointKey: '', linkedType: '', linkedId: '', reason: '' };
type Form = typeof EMPTY;
/** A request id (the command identity a retry reuses — PAT-20); a new act takes a new one. */
const newRequestId = () => crypto.randomUUID();

export default function GeographyPage() {
  const { scope, me } = useShell();
  const steward = me.kind === 'human' && me.bindings.some((b) => b.roleCode === 'data_steward' && b.domainId === scope.domainId);
  const [layer, setLayer] = useState<GeoLayerRead | null>(null);
  const [retired, setRetired] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const [retireReason, setRetireReason] = useState('');
  const [retireRequest, setRetireRequest] = useState(newRequestId);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);

  const read = useCallback(async () => {
    const r = await geoApi.layer(scope, { includeRetired: retired });
    if (!r.ok || r.data === undefined) { setProblem(`The register could not be read: HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}. Read the page again, or ask for a role that reads the graph.`); return; }
    setProblem(null); setLayer(r.data.layer);
  }, [scope, retired]);
  useEffect(() => { void read(); }, [read]);
  const refs = useMemo<GeoReference[]>(() => (layer?.references ?? []).map(geoReferenceOf), [layer]);
  const uncertainty = useMemo(() => Object.fromEntries((layer?.references ?? []).map((r) => [String(r['key']), Number(r['uncertainty_m'])])), [layer]);
  const sel = refs.find((r) => r.referenceId === selected) ?? null;
  useEffect(() => {
    if (selected === null) { setHistory(null); return; }
    void geoApi.layer(scope, { referenceId: selected }).then((r) => setHistory(r.ok && r.data !== undefined ? (r.data.layer.history ?? []) : null));
  }, [scope, selected, layer]);

  const set = (k: keyof Form) => (v: string) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const geo = geometryFromForm({ kind: form.kind, positions: form.positions });
  const u = Number(form.uncertaintyM);
  const holds: string[] = [
    ...(form.key.trim() === '' ? ['name the reference key (e.g. chokepoint.bab-el-mandeb)'] : []),
    ...(form.label.trim().length < 2 ? ['give the label a reader sees'] : []),
    ...(geo.problem === null ? [] : [geo.problem]),
    ...(form.uncertaintyM.trim() === '' || !Number.isFinite(u) || u < 0 ? ['state the positional uncertainty in metres (0 or more)'] : []),
    ...(form.sourceStatement.trim().length < 8 ? ['state where the position comes from (8 characters or more)'] : []),
    ...(form.licenceStatement.trim().length < 8 ? ['state the licence the position may be used under (8 characters or more)'] : []),
    ...(form.reason.trim().length < 8 ? ['state why the reference is declared (8 characters or more)'] : []),
    ...((form.linkedType.trim() === '') !== (form.linkedId.trim() === '') ? ['name the linked object by its type and its id together, or neither'] : []),
  ];
  const eligibility = steward ? { can: true, reason: null, role: 'data_steward', basis: 'you hold the data steward role in this domain; the server re-checks it' }
    : { can: false, reason: 'declaring and retiring a geographic reference is a named data steward\'s act — you hold no data_steward role in this domain', role: null, basis: 'not eligible' };

  const regions = {
    context: (
      <div className="eye-canvas">
        <p className="eye-canvas-meta">Positions are typed by a named data steward in EPSG:4326 (longitude, latitude in degrees), each with its positional uncertainty, its source and its licence. No coastline, boundary, tile or network layer exists here; the choropleth stays a catalogue specimen until a boundary dataset is admitted.</p>
        {layer !== null && <p className="eye-canvas-meta" role="status">{layer.counts.active} active and {layer.counts.retired} retired reference(s) listed · rule {layer.rule_version} · read at {layer.as_of}</p>}
        <label className="eye-canvas-meta"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} /> List retired references too (they are never drawn)</label>
      </div>
    ),
    primary: (
      <div>
        {problem !== null && <p role="alert">{problem}</p>}
        {layer === null && problem === null && <LiveStatus>reading the register…</LiveStatus>}
        {layer !== null && (refs.length === 0
          ? <p className="eye-help">No reference is declared in this domain yet: the map draws nothing. A data steward declares the corridor's places and routes below.</p>
          : <GeospatialMap refs={refs} title="Corridor map — declared references" asOf={layer.as_of} uncertaintyM={uncertainty}
              dash={Object.fromEntries(refs.filter((x) => x.key.includes('cape')).map((x) => [x.key, 'dashed' as const]))} />)}
        {refs.length > 0 && (
          <DataTable<GeoReference> label="The register" columns={[
            { key: 'label', label: 'Reference', kind: 'text', value: (r) => r.label, sortable: true },
            { key: 'key', label: 'Key', kind: 'text', value: (r) => r.key, sortable: true },
            { key: 'position', label: 'Coordinates', kind: 'text', value: (r) => geometryText(r.geometry) },
            { key: 'state', label: 'State', kind: 'text', value: (r) => `v${r.version} · ${r.state}`, sortable: true },
            { key: 'open', label: 'Inspect', kind: 'text', value: (r) => r.referenceId, render: (r) => (
              <button type="button" className="eye-cmdenv-row" aria-pressed={selected === r.referenceId} onClick={() => setSelected(r.referenceId)}>{`Inspect ${r.label}`}</button>) },
          ]} rows={refs} rowId={(r) => r.referenceId} exportAs={null} noun="references" />
        )}
      </div>
    ),
    action: (
      <section aria-label="Declare a geographic reference">
        <h2>Declare a reference</h2>
        <FormDraft scope={scope} purpose="graph" formKey="graph.geo.declare" schemaVersion="b82-gm-geo-1" payload={form as unknown as Row}
          summary={form.label.trim() === '' ? null : `${form.kind} ${form.label}`} step={null} dirty={dirty}
          onResume={(p) => { setForm({ ...EMPTY, ...(p as Partial<Form>) }); setDirty(false); }} onSaved={() => setDirty(false)} />
        <div className="eye-geo-form">
          <Select id="geo-kind" label="Kind" value={form.kind} onChange={(v) => set('kind')(v)} options={KINDS.map((k) => [k, GEO_KIND_WORDS[k]] as const)} />
          <Field id="geo-key" label="Key" help="lower-case, e.g. chokepoint.bab-el-mandeb" value={form.key} onChange={set('key')} />
          <Field id="geo-label" label="Label" value={form.label} onChange={set('label')} />
          <Field id="geo-positions" label="Positions (longitude, latitude)" help='one position for a place; several separated by ";" for a route or an area' value={form.positions} onChange={set('positions')} />
          <Field id="geo-uncertainty" label="Positional uncertainty (m)" type="number" inputMode="decimal" min={0} value={form.uncertaintyM} onChange={set('uncertaintyM')} />
          <Field id="geo-chokepoint" label="Chokepoint key (optional)" help="e.g. portwatch:chokepoint4" value={form.chokepointKey} onChange={set('chokepointKey')} />
          <Field id="geo-linked-type" label="Linked object type (optional)" help="three capitals, e.g. ENT" value={form.linkedType} onChange={set('linkedType')} />
          <Field id="geo-linked-id" label="Linked object id (optional)" value={form.linkedId} onChange={set('linkedId')} />
        </div>
        <TextArea id="geo-source" label="Source statement" value={form.sourceStatement} onChange={set('sourceStatement')} maxChars={1000} rows={2} />
        <TextArea id="geo-licence" label="Licence statement" value={form.licenceStatement} onChange={set('licenceStatement')} maxChars={1000} rows={2} />
        <TextArea id="geo-reason" label="Reason" value={form.reason} onChange={set('reason')} maxChars={2000} rows={2} />
        {geo.geometry !== null && <p className="eye-canvas-meta">Will be recorded as: {geometryText(geo.geometry)} (EPSG:4326).</p>}
        <CommandReview action="graph.geo.declare" object={{ type: 'GEO', id: 'new', version: null, title: form.label.trim() === '' ? 'a new geographic reference' : form.label.trim() }}
          digest={null} eligibility={eligibility} extraReasons={holds}
          consequence={{ effect: 'Records version 1 of a geographic reference in this domain; every map of the domain draws it from the next read.', affected: ['the corridor map', 'the operations room\'s corridor region'],
            users: ['every reader of the domain\'s graph'], reversibility: 'Not undone: a mistyped reference is retired (its history is kept) and a corrected one declared.', residualRisk: 'A position typed wrongly is drawn wrongly until it is retired.',
            audit: 'Recorded with your identity in the register\'s ledger and the audit trail.', source: 'stated', blockers: [] }}
          actionLabel="Declare the reference" pendingLabel="Declaring the reference" problem={error === null ? null : `${error.code}: ${error.message}`}
          onRun={async () => {
            if (geo.geometry === null) return;
            const r = await geoApi.declare(scope, { requestId, expectedVersion: 0, key: form.key.trim(), label: form.label.trim(), kind: form.kind, geometry: geo.geometry, crs: 'EPSG:4326',
              uncertaintyM: u, sourceStatement: form.sourceStatement.trim(), licenceStatement: form.licenceStatement.trim(),
              linked: form.linkedType.trim() === '' ? null : { type: form.linkedType.trim(), id: form.linkedId.trim() }, chokepointKey: form.chokepointKey.trim() === '' ? null : form.chokepointKey.trim(), reason: form.reason.trim() });
            if (!r.ok || r.data === undefined) { setError(r.error ?? { code: `HTTP ${r.status}`, message: 'the server gave no answer — read the register again before retrying', correlationId: '' }); throw new Error('refused'); }
            setError(null); setReceipt(r.data.receipt); setForm(EMPTY); setDirty(false); setRequestId(newRequestId()); setSelected(String(r.data.reference['reference_id']));
            await read();
          }} />
        <Receipt receipt={receipt} />
      </section>
    ),
    inspector: sel === null ? <p className="eye-help">Nothing is selected. Inspect a reference in the register to see its versions.</p> : (
      <section aria-label={`The reference ${sel.label}`}>
        <h2>{sel.label}</h2>
        <p className="eye-canvas-meta">{sel.key} · v{sel.version} · {sel.state} · {geometryText(sel.geometry)}{sel.chokepointKey === null ? '' : ` · ${sel.chokepointKey}`}</p>
        <p className="eye-canvas-meta">Source: {sel.sourceStatement} · Licence: {sel.licenceStatement}</p>
        {history === null ? <LiveStatus>reading its versions…</LiveStatus> : (
          <ol className="eye-canvas-meta" aria-label="Versions of this reference">
            {history.map((h) => <li key={String(h['version'])}>{`v${String(h['version'])} · ${String(h['state'])} · ${String(h['declared_at'])} · ${String(h['reason'])}`}</li>)}
          </ol>
        )}
        {sel.state === 'active' && (
          <CommandReview action="graph.geo.retire" object={{ type: 'GEO', id: sel.referenceId, version: sel.version, title: sel.label, state: sel.state }} digest={null} eligibility={eligibility}
            rationale={{ value: retireReason, onChange: setRetireReason, min: 8, label: 'Why this reference is retired' }}
            consequence={{ effect: `Records version ${sel.version + 1} of ${sel.key} as retired; maps stop drawing it and its key is free for a new reference.`, affected: ['the corridor map'], users: ['every reader of the domain\'s graph'],
              reversibility: 'Not undone: every earlier version is kept in the history; a corrected reference is declared new.', residualRisk: 'A view that relied on this place shows it no more.',
              audit: 'Recorded with your identity in the register\'s ledger.', source: 'stated', blockers: [] }}
            actionLabel="Retire the reference" pendingLabel="Retiring the reference" variant="critical" problem={error === null ? null : `${error.code}: ${error.message}`}
            onRun={async () => {
              const r = await geoApi.retire(scope, sel.referenceId, { requestId: retireRequest, expectedVersion: sel.version, reason: retireReason.trim() });
              if (!r.ok || r.data === undefined) { setError(r.error ?? { code: `HTTP ${r.status}`, message: 'the server gave no answer — read the register again before retrying', correlationId: '' }); throw new Error('refused'); }
              setError(null); setReceipt(r.data.receipt); setRetireReason(''); setRetireRequest(newRequestId());
              await read();
            }} />
        )}
        <GovernedButton variant="quiet" label="Close the inspector" pendingLabel="Closing the inspector" onRun={async () => { setSelected(null); }} />
      </section>
    ),
  };

  return (
    <>
      <h1 className="eye-src-h1">Geographic references</h1>
      <ErrorNote error={error} />
      <Composition regions={regions} label="Geographic references" selection={sel === null ? null : { label: sel.label, version: sel.version }} consequentialGate />
    </>
  );
}
