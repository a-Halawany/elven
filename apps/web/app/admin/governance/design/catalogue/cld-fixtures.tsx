'use client';
/**
 * CP-6 B80 §CL-D — the catalogue's fixtures for the DATA and LAYER components (components/data.tsx, components/layers.tsx) and the foundation
 * rows verified here (CMP-001 focus ring, CMP-003 scroll area). Every value is a SYNTHETIC fixture; no server is called from this file — a
 * fixture "action" says so in its own words and never shows a governed receipt. The catalogue walk (e2e/phase6-b80-catalogue.demo.spec.ts)
 * reads these states through the accessibility tree, in light, dark, forced colours, print and at 200 % zoom. Construction evidence only.
 */
import { useMemo, useState } from 'react';
import { ScrollBox } from '../../../../../components/observation';
import {
  BulkSelection, ComparisonMatrix, DataTable, DefinitionList, DiffViewer, Metric, StatisticalSummary, StructuredList, TreeGrid, type DataColumn,
} from '../../../../../components/data';
import { Dialog, Disclosure, Divider, Drawer, Panel, Popover, Surface } from '../../../../../components/layers';
import { emptyDrafts, onLayerClosed, restoreDraft, type DraftStore } from '../../../../../lib/layers-b80';
import { actionGate, assess, consequenceDigest, emptySelection, headerState, isSelected, selectExactly, toggle, clearRows, type Candidate } from '../../../../../lib/selection-b80';
import { defaultView, type TableView } from '../../../../../lib/table-b80';

interface Fx { id: string; key: string; corridor: string; mode: 'replay' | 'live'; lifecycle: 'active' | 'suspended' | 'draft'; evidence: number | null; readAt: string | null }
const CORRIDORS = ['Red Sea', 'Suez', 'Malacca', 'Panama', 'Bosporus'];
const fixtureRows = (n: number): Fx[] => Array.from({ length: n }, (_, i) => ({
  id: `fx-${i}`, key: `synthetic-source-${String(i).padStart(6, '0')}`, corridor: CORRIDORS[i % CORRIDORS.length]!,
  mode: i % 4 === 0 ? 'live' : 'replay', lifecycle: i % 7 === 0 ? 'suspended' : i % 11 === 0 ? 'draft' : 'active',
  evidence: i % 9 === 0 ? null : (i * 37) % 500, readAt: i % 13 === 0 ? null : new Date(Date.UTC(2026, 9, 1 + (i % 16), 6, 0, 0)).toISOString(),
}));
const COLS: Array<DataColumn<Fx>> = [
  { key: 'key', label: 'Source (SYNTHETIC)', value: (r) => r.key },
  { key: 'corridor', label: 'Corridor', value: (r) => r.corridor, groupable: true },
  { key: 'mode', label: 'Mode', value: (r) => r.mode, groupable: true },
  { key: 'lifecycle', label: 'Lifecycle', value: (r) => r.lifecycle, groupable: true },
  { key: 'evidence', label: 'Evidence objects', kind: 'number', value: (r) => r.evidence },
  { key: 'readAt', label: 'Last read', kind: 'instant', value: (r) => r.readAt },
];
const LABEL = { scope: 'catalogue fixture (no tenant, no domain)', classificationCeiling: 'none — SYNTHETIC fixture rows', asOf: '2026-10-17T00:00:00.000Z' };

function TableFixtures() {
  const rows = useMemo(() => fixtureRows(60), []);
  const big = useMemo(() => fixtureRows(100_000), []);
  const [view, setView] = useState<TableView>(defaultView());
  const [sel, setSel] = useState(emptySelection('catalogue'));
  const cand = (r: Fx): Candidate => ({ id: r.id, label: r.key, fingerprint: `${r.lifecycle} · ${r.mode}`,
    eligibility: r.mode === 'live' ? { ok: false, reason: 'live-mode (fixture rule)' } : r.lifecycle !== 'active' ? { ok: false, reason: `it is ${r.lifecycle}; the fixture action applies to active` } : { ok: true } });
  const shownIds = useMemo(() => new Set(rows.filter((r) => view.filter === '' || COLS.some((c) => String(c.value(r) ?? 'unknown').toLowerCase().includes(view.filter.toLowerCase()))).map((r) => r.id)), [rows, view.filter]);
  return (
    <>
      <Panel title="DataTable — sort, filter, group, density, selection, export (60 SYNTHETIC rows)">
        <DataTable label="Catalogue fixture table" columns={COLS} rows={rows} rowId={(r) => r.id} view={view} onViewChange={setView} noun="fixture rows"
          selection={{ isSelected: (id) => isSelected(sel, id), onToggle: (r) => setSel(toggle(sel, cand(r))), onToggleShown: (rs, s) => setSel(s ? selectExactly(sel, rs.map(cand)) : clearRows(sel, rs.map((r) => r.id))), header: headerState(sel, [...shownIds]), rowLabel: (r) => r.key }}
          exportAs={{ name: 'Catalogue fixture table', label: LABEL }} />
        {sel.items.length > 0 && (() => {
          const a = assess(sel, rows.map(cand), shownIds);
          return <BulkSelection noun="fixture rows" assessment={a} gate={actionGate(a, { requiredParams: {}, confirmedDigest: null, digest: consequenceDigest({ key: 'fixture', params: {} }, a) })}
            reviewLabel={`Review the fixture action on ${a.counts.included} rows`} onAcceptCurrent={() => undefined} onReview={() => undefined} onClear={() => setSel(emptySelection('catalogue'))} />;
        })()}
      </Panel>
      <Panel title="DataTable — windowed keyboard grid (100,000 SYNTHETIC rows)">
        <DataTable label="Windowed fixture grid" columns={COLS} rows={big} rowId={(r) => r.id} grid noun="fixture rows" viewportHeight={320} />
      </Panel>
      <Panel title="DataTable — empty states">
        <DataTable label="Empty fixture table" columns={COLS} rows={[]} rowId={(r) => r.id} noun="fixture rows" empty={{ scope: 'a fixture scope with no record', permission: 'full', nextStep: 'register a source', evidence: 'not_collected' }} />
        <DataTable label="Filtered fixture table" columns={COLS} rows={rows.slice(0, 6)} rowId={(r) => r.id} noun="fixture rows" view={{ ...defaultView(), filter: 'no-such-fixture' }} />
      </Panel>
    </>
  );
}

function BulkFixture() {
  const sel = selectExactly(emptySelection('bulk-fixture'), ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: `synthetic-${id}@v1`, fingerprint: 'active · replay' })));
  const current: Candidate[] = [
    { id: 'a', label: 'synthetic-a@v1', fingerprint: 'active · replay', eligibility: { ok: true } },
    { id: 'b', label: 'synthetic-b@v1', fingerprint: 'active · replay', eligibility: { ok: false, reason: 'live-mode contract — act on it alone' } },
    { id: 'c', label: 'synthetic-c@v1', fingerprint: 'suspended · replay', eligibility: { ok: false, reason: 'it is suspended; suspend applies to active' } },
    { id: 'd', label: 'synthetic-d@v1', fingerprint: 'active · replay', eligibility: { ok: true } },
  ];
  const a = assess(sel, current, new Set(['a', 'b', 'c']));
  return (
    <Panel title="BulkSelection — included / excluded / hidden / changed / missing, before the action">
      <BulkSelection noun="fixture contracts" assessment={a} gate={actionGate(a, { requiredParams: { reason: '' }, confirmedDigest: null, digest: consequenceDigest({ key: 'suspend', params: {} }, a) })}
        reviewLabel="Review the fixture suspension" onAcceptCurrent={() => undefined} onReview={() => undefined} onClear={() => undefined}
        outcomes={[
          { id: 'a', label: 'synthetic-a@v1', outcome: 'refused', error: { code: 'EYE-FIXTURE', message: 'source rejected (state): a SYNTHETIC catalogue refusal, shown in the words given', correlationId: 'fixture' } },
          { id: 'd', label: 'synthetic-d@v1', outcome: 'unknown', error: { code: 'EYE-DEP-001', message: 'API unreachable (fixture) — the outcome is unknown', correlationId: 'fixture' } },
        ]} />
    </Panel>
  );
}

function LayerFixtures() {
  const [plain, setPlain] = useState(false);
  const [conseq, setConseq] = useState(false);
  const [variant, setVariant] = useState(1);
  const [second, setSecond] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftStore>(emptyDrafts());
  const [note, setNote] = useState('');
  const [last, setLast] = useState<string>('no layer closed yet');
  const [answer, setAnswer] = useState<string | null>(null);
  const fields = [{ term: 'Action', value: 'fixture.transition → suspended' }, { term: 'Items', value: variant === 1 ? 'synthetic-a@v1, synthetic-d@v1' : 'synthetic-a@v1' }, { term: 'Reason', value: 'catalogue fixture' }];
  const digest = consequenceDigest({ key: 'fixture', params: { v: String(variant) } }, { included: [], excluded: [], hidden: [], changed: [], missing: [], counts: { selected: 0, included: 0, excluded: 0, hidden: 0, changed: 0, missing: 0 } });
  return (
    <Panel title="Dialog, Drawer, Popover, Disclosure">
      <p role="status" className="eye-dt-counts">Last close: {last}</p>
      <div className="eye-cld-badges">
        <button type="button" id="cat-open-plain" className="eye-cld-btn-quiet" onClick={() => setPlain(true)}>Open a plain dialog</button>
        <button type="button" id="cat-open-conseq" className="eye-cld-btn-quiet" onClick={() => { setVariant(1); setAnswer(null); setConseq(true); }}>Open a consequential dialog</button>
        <button type="button" id="cat-open-draft" className="eye-cld-btn-quiet" onClick={() => { setNote(String(restoreDraft(drafts, 'draft-dialog')?.value ?? '')); setDraftOpen(true); }}>Open a dialog with a draft</button>
        <button type="button" id="cat-open-drawer" className="eye-cld-btn-quiet" onClick={() => setDrawer(true)}>Open a drawer</button>
        <Popover label="Fixture popover" triggerLabel="Open a popover"><p>A supporting popover (SYNTHETIC). Escape closes it and returns focus to its trigger.</p></Popover>
      </div>
      <Dialog open={plain} title="A plain fixture dialog" description="Escape, the close button or the backdrop close it — none of them is consent."
        onClose={(c) => { setPlain(false); setLast(`${c.how} · consent ${String(c.consent)}`); }}>
        <p>Nested layers: one blocking dialog at a time.</p>
        <button type="button" className="eye-cld-btn-quiet" onClick={() => setSecond(true)}>Try to open a second dialog</button>
        <Dialog open={second} title="A second fixture dialog" onClose={() => setSecond(false)}><p>Never shown while the first is open.</p></Dialog>
      </Dialog>
      <Dialog open={conseq} title="A consequential fixture dialog" size="lg"
        description="The full digest is shown; the deliberate action is enabled only once THIS digest is acknowledged. This fixture calls no server."
        onClose={(c) => { setConseq(false); setLast(`${c.how} · consent ${String(c.consent)}`); }}
        consequence={{ fields, digest, actionLabel: 'Run the fixture action', pendingLabel: 'Running the fixture', variant: 'critical',
          onConfirm: async () => { setAnswer(null); await new Promise((r) => setTimeout(r, 400)); setAnswer('REFUSED — a SYNTHETIC catalogue refusal; no server was called, nothing changed'); throw new Error('fixture refusal'); } }}>
        {answer !== null && <p role="status" className="eye-layer-refused">{answer}</p>}
        <button type="button" className="eye-cld-btn-quiet" onClick={() => setVariant((v) => (v === 1 ? 2 : 1))}>Change the digest (fixture)</button>
        <p className="eye-dt-counts">The fixture action always ends REFUSED (no server is called), so nothing here can look committed.</p>
      </Dialog>
      <Dialog open={draftOpen} title="A fixture dialog with a draft" description="Type, then press Escape: the text is kept and offered back when the dialog reopens."
        onClose={(c) => { setDrafts(onLayerClosed(drafts, 'draft-dialog', c.how === 'refused' ? 'dismiss' : c.how, note, new Date().toISOString())); setDraftOpen(false); setLast(`${c.how} · consent ${String(c.consent)} · draft ${note === '' ? 'empty' : 'kept'}`); }}>
        <label className="eye-cld-field">Fixture note<input id="cat-draft-note" className="eye-cld-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="eye-cld-badges">
          <button type="button" className="eye-cld-btn-quiet" onClick={() => { setDrafts(onLayerClosed(drafts, 'draft-dialog', 'discard', null, '')); setNote(''); setDraftOpen(false); setLast('discard · consent false · draft discarded'); }}>Discard the draft</button>
        </div>
      </Dialog>
      <Drawer open={drawer} title="A fixture drawer" onClose={(how) => { setDrawer(false); setLast(`${how} · consent false`); }}>
        <p>A supporting layer at the inline end — it mirrors under RTL. The page behind stays usable.</p>
      </Drawer>
      <Disclosure title="A disclosure with its authority and uncertainty" authority="Observational — a SYNTHETIC publisher" uncertainty="±12 % (80 % interval, fixture)">
        <p>The secondary detail, deferred. The authority and the uncertainty above are never inside the fold.</p>
      </Disclosure>
      <Disclosure title="A disclosure missing both" authority={null} uncertainty="" defaultOpen>
        <p>Absent authority and uncertainty are STATED as not stated — never omitted.</p>
      </Disclosure>
    </Panel>
  );
}

function InspectionFixtures() {
  return (
    <>
      <Panel title="TreeGrid, StructuredList, DefinitionList">
        <TreeGrid label="Corridor tree (SYNTHETIC)" columns={[{ key: 'sources', label: 'Sources' }, { key: 'warnings', label: 'Open warnings' }]} defaultExpanded={['red']}
          nodes={[
            { id: 'red', label: 'Red Sea', values: { sources: 6, warnings: 2 }, children: [{ id: 'bab', label: 'Bab el-Mandeb', values: { sources: 3, warnings: 2 } }, { id: 'suez', label: 'Suez', values: { sources: 3, warnings: null }, children: [{ id: 'said', label: 'Port Said', values: { sources: 1, warnings: 0 } }] }] },
            { id: 'mal', label: 'Malacca', values: { sources: 2, warnings: 0 } },
          ]} />
        <Divider label="lists" />
        <StructuredList label="Fixture list" items={[
          { id: '1', title: 'synthetic-source-000001', meta: 'replay · active', description: 'A SYNTHETIC fixture item.' },
          { id: '2', title: 'synthetic-source-000002', meta: 'live · suspended' },
        ]} />
        <StructuredList label="Empty fixture list" items={[]} />
        <DefinitionList label="Fixture definitions" items={[
          { term: 'Contract', value: 'synthetic-source-000001@v3', mono: true, copy: 'synthetic-source-000001@v3' },
          { term: 'Digest', value: 'sha256:' + '0f'.repeat(32), mono: true, copy: 'sha256:' + '0f'.repeat(32) },
          { term: 'Authority', value: 'Observational (SYNTHETIC)' },
        ]} />
      </Panel>
      <Panel title="Metric and StatisticalSummary">
        <div className="eye-bulk-grid">
          <Metric label="Transit delay (fixture)" value={1234.5} unit="h" state="measured" basis="SYNTHETIC daily transits" asOf="2026-10-16" uncertainty={{ low: 1100, high: 1400, level: '80 %' }} digits={1} />
          <Metric label="Insurer withdrawals (fixture)" value={3} state="estimated" basis="SYNTHETIC advisories" asOf="2026-10-15" uncertainty={{ text: 'range not assessed' }} />
          <Metric label="Port dwell (fixture)" value={null} unit="d" state="unknown" basis={null} asOf={null} />
          <Metric label="Contract value (fixture)" value={9} state="withheld" basis="above your clearance" asOf="2026-10-17" />
        </div>
        <StatisticalSummary label="Delay samples (n = 7, two missing; SYNTHETIC)" values={[4, 1, null, 3, 2, undefined, 5, 8, 13]} unit="h" />
        <StatisticalSummary label="A single sample (SYNTHETIC)" values={[7]} />
        <StatisticalSummary label="No sample (SYNTHETIC)" values={[]} />
      </Panel>
      <Panel title="ComparisonMatrix and DiffViewer">
        <ComparisonMatrix label="Reroute options (SYNTHETIC)" options={[{ id: 'cape', label: 'Via the Cape' }, { id: 'hold', label: 'Hold at Jeddah' }, { id: 'air', label: 'Air freight' }]}
          criteria={[{ key: 'cost', label: 'Cost', better: 'lower' }, { key: 'days', label: 'Delay', better: 'lower' }, { key: 'risk', label: 'Risk' }]}
          cells={{
            cape: { cost: { value: 1.2, basis: 'Q1 plan', unit: 'M EUR', uncertainty: '±0.2' }, days: { value: 14, basis: 'carrier', unit: 'd' }, risk: { value: 'medium', basis: 'b' } },
            hold: { cost: { value: 0.4, basis: 'Q1 plan', unit: 'M EUR', dissent: 'a SYNTHETIC reviewer: understates line stoppage' }, days: { value: 30, basis: 'insurer', unit: 'd' } },
            air: { cost: { value: 3.1, basis: 'Q1 plan', unit: 'M EUR' } },
          }} />
        <DiffViewer label="Option v1 → v2 (SYNTHETIC)" fields={[{ key: 'title', label: 'Title' }, { key: 'owner', label: 'Owner' }]}
          before={{ record: { title: 'Reroute via the Cape', owner: 'a SYNTHETIC owner', cost: 1.2, note: 'draft' }, title: 'v1', source: 'fixture', author: 'SYNTHETIC author', at: '2026-10-15T09:00:00Z', authority: 'proposed' }}
          after={{ record: { title: 'Reroute via the Cape of Good Hope', owner: 'a SYNTHETIC owner', cost: 1.2, added: true }, title: 'v2', source: 'fixture', author: null, at: null, authority: 'proposed' }} />
      </Panel>
    </>
  );
}

function FoundationFixtures() {
  const levels = ['base', 'raised', 'overlay'] as const;
  const states = ['rest', 'selected', 'disabled', 'critical', 'degraded'] as const;
  return (
    <Panel title="Foundation — focus ring, scroll area, surface, divider">
      <p className="eye-dt-counts">Tab through these: every control shows the focus ring (CMP-001) — in forced colours as the system highlight.</p>
      <div className="eye-cld-badges">
        <button type="button" className="eye-cld-btn">A focusable button</button>
        <a href="#catalogue-foundation" className="eye-src-link">A focusable link</a>
        <input aria-label="A focusable input" className="eye-cld-input" defaultValue="fixture" />
      </div>
      <ScrollBox label="Keyboard-scrollable wide fixture">
        <p className="eye-cat-wide">{'A wide SYNTHETIC line that scrolls inside its own container, never the page — '.repeat(6)}</p>
      </ScrollBox>
      <Divider />
      <div className="eye-bulk-grid">
        {levels.map((l) => states.map((s) => <Surface key={`${l}-${s}`} level={l} state={s} label={`Surface ${l} ${s}`}><strong>{l}</strong> · {s.toUpperCase()}</Surface>))}
      </div>
      <div className="eye-cld-badges"><span>left group</span><Divider orientation="vertical" label="separates the groups" /><span>right group</span></div>
    </Panel>
  );
}

/** §CL-D's section of the catalogue. */
export function CldCatalogue() {
  return (
    <section aria-labelledby="catalogue-cld" id="catalogue-foundation" className="eye-cat-root">
      <h2 id="catalogue-cld" className="eye-panel-title">Data, layers and foundation (§CL-D)</h2>
      <FoundationFixtures />
      <TableFixtures />
      <BulkFixture />
      <LayerFixtures />
      <InspectionFixtures />
    </section>
  );
}
