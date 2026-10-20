'use client';
/**
 * Source registry.
 *
 * Provenance rides at LIST DENSITY: authority class, acquisition mode, data
 * origin and rights state are present on every row, so nobody discovers by
 * clicking that they were reading an observational source or a synthetic record.
 *
 * B80 §CL-D (F-P7-E-05: UX-22-001…-005, PAT-18): the register is the shared DataTable (sort, filter, group, density, exact counts, the labelled
 * export of the DISPLAYED rows) with BulkSelection over `observation.source.transition`: before anything runs the page states which selected
 * contracts are INCLUDED, which are EXCLUDED and why (a live-mode contract — its lifecycle also moves its collection schedule, so it is acted on
 * alone from its own page; a contract not in the state the action applies to; a principal without collection_manager here), which the filter
 * HIDES and which CHANGED since they were selected. The action is reviewed in a consequential dialog binding the exact items, then runs ONE
 * GOVERNED WRITE PER ITEM — each answered by its own receipt or its refusal in the server's words; an item with no answer is UNKNOWN. The PDP and
 * the port decide every item; the exclusions here only keep the principal from sending what the page already knows will not apply.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { observation, type SourceWithReadiness } from '../../../lib/observation';
import { AuthorityBadge, ModeBadge, Mono, RightsBadge, SyntheticMarker } from '../../../components/observation';
import { ErrorNote } from '../../../components/ui';
import { BulkSelection, DataTable, type DataColumn } from '../../../components/data';
import { Dialog } from '../../../components/layers';
import { applyView, defaultView, type TableView } from '../../../lib/table-b80';
/* B81 re: the register's view saved per person (UX-22-002) */ import { SavedViewControl } from './saved-view-b81'; /* end B81 re */
import {
  acceptCommitted, acceptCurrent, actionGate, assess, clearRows, consequenceDigest, emptySelection, headerState, isSelected, runPerItem, selectExactly, toggle,
  type Candidate, type ItemOutcome, type Selection,
} from '../../../lib/selection-b80';

const VERDICT: Record<SourceWithReadiness['readiness']['verdict'], { label: string; tone: 'success' | 'critical' | 'muted' }> = {
  'live': { label: 'LIVE', tone: 'success' },
  'live-unscheduled': { label: 'LIVE — UNSCHEDULED', tone: 'critical' },
  'replay': { label: 'REPLAY', tone: 'muted' },
  'operator-upload': { label: 'OPERATOR UPLOAD', tone: 'muted' },
  'blocked-rights': { label: 'BLOCKED — RIGHTS', tone: 'critical' },
  'blocked-credential': { label: 'BLOCKED — CREDENTIAL', tone: 'critical' },
  'inactive': { label: 'INACTIVE', tone: 'muted' },
};

/**
 * AUTOMATIC collection, three facts kept apart: the configured schedule (a stored
 * intention), the runtime (scheduler flag, worker, Redis scheduler and next fire), and
 * the observed attempts the worker recorded — the only evidence a scheduled run ran.
 */
function AutomaticCell({ a, mode, lifecycle }: { a: SourceWithReadiness['readiness']['automatic']; mode: string; lifecycle: string }) {
  if (lifecycle !== 'active' || mode !== 'live') return <span className="eye-src-muted">not applicable</span>;
  const fmt = (t: string | null) => (t ? t.slice(0, 16).replace('T', ' ') + 'Z' : '—');
  const rt = a.runtime;
  const last = a.last_attempt;
  return (
    <div className="eye-src-stack">
      <div>
        <strong>{a.schedule_entry ? `configured · every ${a.schedule_entry.cadence_seconds} s` : 'no schedule entry'}</strong>
      </div>
      <div className="eye-src-muted">
        {rt.scheduler_enabled ? (rt.worker_running ? 'worker running here' : 'scheduler on · no worker here') : 'scheduler off in this deployment'}
        {rt.redis_scheduler.state === 'present' ? ` · next fire ${fmt(rt.redis_scheduler.next_at)}`
          : rt.redis_scheduler.state === 'absent' ? ' · not materialized in Redis'
          : rt.redis_scheduler.state === 'unknown' ? ' · Redis lookup failed: scheduler state unknown' : ''}
      </div>
      <div className="eye-src-muted">
        {last === null
          ? 'no automatic run observed'
          : <>
              <span className={last.outcome === 'finished' ? 'eye-src-tone-success' : 'eye-src-tone-critical'}>{last.outcome.toUpperCase()}</span>
              {` ${fmt(last.finished_at)} · ${last.admitted} admitted · ${last.noop} unchanged`}
              {last.reason ? ` · ${last.reason}` : ''}
              {` · all ${a.attempts.total} attempts: ${a.attempts.finished} ok / ${a.attempts.failed + a.attempts.cancelled + a.attempts.budget_exceeded} failed / ${a.attempts.faulted} faulted / ${a.attempts.refused} refused`}
            </>}
      </div>
    </div>
  );
}

/** The verdict in words the operator can act on, with the reason under it. */
function ReadinessCell({ r, lifecycle }: { r: SourceWithReadiness['readiness']; lifecycle: string }) {
  const v = VERDICT[r.verdict];
  return (
    <div>
      <strong className={`eye-src-tone-${v.tone}`}>{v.label}</strong>
      <div className="eye-src-muted eye-src-reason">{r.reason}{lifecycle !== 'active' ? '' : ` · ${r.credential}`}</div>
    </div>
  );
}

const rowId = (s: SourceWithReadiness) => `${s.source_id}@${s.contract_version}`;
const rowLabel = (s: SourceWithReadiness) => `${s.source_key}@v${s.contract_version}`;
/** What "changed since selection" compares: the facts the bulk action depends on. */
const fingerprint = (s: SourceWithReadiness) => `${s.lifecycle_state} · ${s.acquisition_mode} · rights ${s.rights_state}`;

const COLUMNS: Array<DataColumn<SourceWithReadiness>> = [
  { key: 'source', label: 'Source', value: (s) => `${s.name} ${rowLabel(s)}${s.data_origin === 'synthetic' ? ' synthetic' : ''}`,
    render: (s) => (
      <>
        <Link href={`/observation/sources/${s.source_id}`} className="eye-src-link">{s.name}</Link>
        <div className="eye-src-badges">
          <Mono>{rowLabel(s)}</Mono>
          <SyntheticMarker synthetic={s.data_origin === 'synthetic'} />
        </div>
      </>
    ) },
  { key: 'authority', label: 'Publisher authority', value: (s) => s.authority_class, groupable: true, render: (s) => <AuthorityBadge authorityClass={s.authority_class} /> },
  { key: 'connector', label: 'Connector', value: (s) => s.connector_kind, groupable: true },
  { key: 'mode', label: 'Mode', value: (s) => s.acquisition_mode, groupable: true, render: (s) => <ModeBadge mode={s.acquisition_mode} /> },
  { key: 'status', label: 'Status', value: (s) => VERDICT[s.readiness.verdict].label, groupable: true, render: (s) => <ReadinessCell r={s.readiness} lifecycle={s.lifecycle_state} /> },
  { key: 'run', label: 'Last governed run', kind: 'instant', value: (s) => s.readiness.last_run?.finished_at ?? null,
    render: (s) => s.readiness.last_run === null ? <span className="eye-src-muted">never</span>
      : <><Mono>{s.readiness.last_run.finished_at ? s.readiness.last_run.finished_at.slice(0, 16).replace('T', ' ') + 'Z' : s.readiness.last_run.state}</Mono>
          <div className="eye-src-muted">{s.readiness.last_run.mode} · {s.readiness.last_run.state} · {s.readiness.last_run.admitted} admitted{s.readiness.last_run.quarantined ? ` · ${s.readiness.last_run.quarantined} quarantined` : ''}{s.readiness.last_run.failure ? ` · ${s.readiness.last_run.failure}` : ''}</div></> },
  { key: 'automatic', label: 'Automatic', kind: 'number', align: 'start', value: (s) => s.readiness.automatic.schedule_entry?.cadence_seconds ?? null,
    render: (s) => <AutomaticCell a={s.readiness.automatic} mode={s.acquisition_mode} lifecycle={s.lifecycle_state} /> },
  { key: 'evidence', label: 'Evidence', kind: 'number', value: (s) => s.readiness.evidence_objects, render: (s) => <Mono>{s.readiness.evidence_objects}</Mono> },
  { key: 'health', label: 'Health', value: (s) => s.readiness.health?.state ?? null, groupable: true,
    render: (s) => s.readiness.health === null ? <span className="eye-src-muted">not evaluated</span>
      : <>{s.readiness.health.state}{s.readiness.health.lag_class && s.readiness.health.lag_class !== 'none' && s.readiness.health.lag_class !== 'unknown' ? ` · ${s.readiness.health.lag_class}` : ''}<div className="eye-src-muted">as of {s.readiness.health.evaluated_at.slice(0, 10)}</div></> },
  { key: 'rights', label: 'Rights', value: (s) => s.rights_state, groupable: true, render: (s) => <RightsBadge state={s.rights_state} /> },
];

/** The two bulk transitions (Q9): suspend an active replay contract; reactivate a suspended one. */
const ACTIONS = {
  suspend: { from: 'active', target: 'suspended', verb: 'Suspend', pending: 'Suspending', noun: 'suspension' },
  reactivate: { from: 'suspended', target: 'active', verb: 'Reactivate', pending: 'Reactivating', noun: 'reactivation' },
} as const;
type ActionKey = keyof typeof ACTIONS;

export default function SourcesPage() {
  const { scope, isCollectionManager } = useShell();
  const [sources, setSources] = useState<SourceWithReadiness[] | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [view, setView] = useState<TableView>(defaultView());
  const [selection, setSelection] = useState<Selection>(emptySelection('observation.sources'));
  const [action, setAction] = useState<ActionKey>('suspend');
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<ItemOutcome[] | null>(null);

  const load = useCallback(async () => {
    const r = await observation.sourcesReadiness(scope);
    if (r.ok && r.data !== undefined) { setSources(r.data.sources); setReadAt(new Date().toISOString()); setError(null); }
    else setError(r.error ?? null);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const a = ACTIONS[action];
  const candidate = useCallback((s: SourceWithReadiness): Candidate => {
    const base = { id: rowId(s), label: rowLabel(s), fingerprint: fingerprint(s) };
    if (s.acquisition_mode !== 'replay') return { ...base, eligibility: { ok: false, reason: 'live-mode contract — its lifecycle also moves its collection schedule; act on it alone from its own page' } };
    if (!isCollectionManager) return { ...base, eligibility: { ok: false, reason: 'not this principal’s to act on — no collection_manager binding in this domain (the pipeline would refuse it)' } };
    if (s.lifecycle_state !== a.from) return { ...base, eligibility: { ok: false, reason: `not in a state this action applies to — it is ${s.lifecycle_state}; ${a.verb.toLowerCase()} applies to ${a.from}` } };
    return { ...base, eligibility: { ok: true } };
  }, [a, isCollectionManager]);

  const all = sources ?? [];
  const candidates = useMemo(() => all.map(candidate), [all, candidate]);
  const shown = useMemo(() => applyView(all, COLUMNS, view, rowId).rows, [all, view]);
  const shownIds = useMemo(() => new Set(shown.map(rowId)), [shown]);
  const assessment = assess(selection, candidates, shownIds);
  const params = { reason: reason.trim(), target: a.target };
  const digest = consequenceDigest({ key: `observation.source.transition:${a.target}`, params }, assessment);
  const running = progress !== null && reviewing;
  const gate = actionGate(assessment, { requiredParams: { reason }, confirmedDigest: null, digest, busy: running });
  const byId = useMemo(() => new Map(all.map((s) => [rowId(s), s])), [all]);

  const run = async () => {
    setOutcomes(null);
    const items = assessment.included;
    setProgress(`0 of ${items.length} answered`);
    const out = await runPerItem(items, async (item) => {
      const s = byId.get(item.id)!;
      const r = await observation.transitionSource(scope, s.source_id, s.contract_version, a.target, reason.trim());
      return { ok: r.ok, status: r.status, receipt: r.data?.receipt, error: r.error };
    }, { onItem: (_o, done) => setProgress(`${done} of ${items.length} answered`) });
    setOutcomes(out);
    setProgress(null);
    committed.current = out.filter((o) => o.outcome === 'committed').map((o) => o.id);
    await load();
  };
  /* after the re-read, the items THIS run committed are re-snapshotted at the state the server returned; any other change stays "changed" */
  const committed = useRef<string[]>([]);
  useEffect(() => {
    if (committed.current.length === 0 || sources === null) return;
    const ids = committed.current; committed.current = [];
    setSelection((sel) => acceptCommitted(sel, sources.map(candidate), ids));
  }, [sources, candidate]);

  return (
    <>
      <div className="eye-src-head">
        <h1 className="eye-src-h1">Sources</h1>
        <Link href="/observation/sources/new" className="eye-src-link eye-src-register">Register a source</Link>
      </div>
      <ErrorNote error={error} />

      {sources === null ? <p className="eye-src-muted">Loading the registry…</p> : (
        <>
          {selection.items.length > 0 && (
            <BulkSelection
              noun="source contracts" assessment={assessment} gate={gate}
              reviewLabel={`Review the ${a.noun} of ${assessment.counts.included} contract${assessment.counts.included === 1 ? '' : 's'}`}
              onAcceptCurrent={() => setSelection(acceptCurrent(selection, candidates))}
              onReview={() => setReviewing(true)}
              onClear={() => { setSelection(emptySelection('observation.sources')); setOutcomes(null); }}
              outcomes={outcomes}
            >
              <div className="eye-cld-badges">
                <label className="eye-cld-field">
                  <span>Action</span>
                  <select className="eye-cld-input" aria-label="Bulk action" value={action} onChange={(e) => setAction(e.target.value === 'reactivate' ? 'reactivate' : 'suspend')}>
                    <option value="suspend">Suspend (active → suspended)</option>
                    <option value="reactivate">Reactivate (suspended → active)</option>
                  </select>
                </label>
                <label className="eye-cld-field eye-src-reason-field">
                  <span>Reason (recorded with every item’s decision)</span>
                  <input className="eye-cld-input" aria-label="Reason for the bulk action" value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </div>
            </BulkSelection>
          )}
          {/* B81 re: the person's own view of this register — restored on arrival, saved when they ask (never the selection) */}
          <SavedViewControl scope={scope} workspace="observation" route="/observation/sources" title="Registered sources" tableKey="sources"
            columnKeys={COLUMNS.map((c) => c.key)} view={view} onRestore={setView} />
          {/* end B81 re */}
          <DataTable
            label="Registered sources"
            caption={<>
              Every registered source contract, and what it is right now: LIVE (a schedule entry exists; the Automatic column says whether anything serves it), REPLAY (a frozen
              set; live collection needs a new contract version), an OPERATOR UPLOAD, or BLOCKED — by unresolved reuse
              rights, or by a credential this deployment does not bind. Read from stored records; nothing here activates anything.
            </>}
            columns={COLUMNS} rows={sources} rowId={rowId} view={view} onViewChange={setView} noun="sources"
            selection={{
              isSelected: (id) => isSelected(selection, id),
              onToggle: (s) => setSelection(toggle(selection, candidate(s))),
              onToggleShown: (rows, select) => setSelection(select ? selectExactly(selection, rows.map(candidate)) : clearRows(selection, rows.map(rowId))),
              header: headerState(selection, shown.map(rowId)),
              rowLabel,
            }}
            exportAs={readAt === null ? null : {
              name: 'Registered sources',
              label: { scope: `tenant ${scope.tenantId} / domain ${scope.domainId}`, classificationCeiling: 'not declared by the source registry read (a source contract carries no classification label)', asOf: readAt },
            }}
            empty={{ scope: 'the source contracts registered in this domain', permission: isCollectionManager ? 'full' : 'partial', nextStep: 'register a source', evidence: 'none_recorded' }}
          />
        </>
      )}

      <Dialog
        open={reviewing}
        title={`${a.verb} ${assessment.counts.included} source contract${assessment.counts.included === 1 ? '' : 's'}`}
        description="Each contract below is its own governed write (observation.source.transition) with its own receipt or refusal. Closing this dialog is not consent; nothing is sent until you act."
        onClose={() => { if (!running) setReviewing(false); }}
        consequence={{
          fields: [
            { term: 'Action', value: `observation.source.transition → ${a.target} (from ${a.from})` },
            { term: 'Items', value: assessment.included.map((x) => x.label).join(', ') },
            { term: 'Count', value: String(assessment.counts.included) },
            { term: 'Not acted on', value: `${assessment.counts.excluded} excluded · ${assessment.counts.hidden} hidden by the filter · ${assessment.counts.missing} no longer in the read`, required: false },
            { term: 'Scope', value: `tenant ${scope.tenantId} / domain ${scope.domainId}` },
            { term: 'Reason', value: reason.trim() },
          ],
          digest, actionLabel: `${a.verb} ${assessment.counts.included} — one governed write each`, pendingLabel: a.pending,
          variant: action === 'suspend' ? 'critical' : 'primary',
          onConfirm: run,
        }}
      >
        {progress !== null && <p role="status">{progress} — each answer is the server’s.</p>}
      </Dialog>
    </>
  );
}
