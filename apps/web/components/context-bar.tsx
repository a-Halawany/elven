'use client';
/**
 * B80 §CB — THE OPERATING CONTEXT BAR (CMP-010) AND THE CONTEXT SWITCH (PAT-02) — F-P7-E-01: UX-10-001…005, UX-ADR-003, REL-03.
 *
 * GlobalContextBar — rendered by the shell under its header on EVERY workspace (AppShellSlots.contextBar, b80-seams): the active scope first
 *   (tenant, domain, role; the PLATFORM workspace says PLATFORM and its deployment), then every dimension that changes meaning — objective,
 *   horizon, scenario, classification ceiling, effective time, policy — and the context's version and digest. Each dimension is in a STATE:
 *   set, the stated default, UNRESOLVED (reconciled on read: a context naming a subject no longer live — said with a symbol and a word, never
 *   colour alone, never shown current) or not applied (a page reading live data only declares the effective time not applied, Q11).
 *   While the scope is unresolved or unreadable the bar keeps the last valid read and says that consequential commands are held.
 * ContextSwitchDialog — on the library's Dialog (modal; the trigger gets the focus back) or inline (the home's switcher): choose → PREVIEW (the
 *   server's executive.context_impact: the changed dimensions, the affected open work, the approvals UNAFFECTED, the client-held previews
 *   this switch invalidates and the queries / selections the person keeps or discards) → the deliberate COMMIT of exactly what was previewed
 *   (executive.commit_context; GovernedButton — pending until the receipt, nothing optimistic) → the receipt. A stale choice is offered
 *   disabled with its reason; a refusal is shown in the server's words (`context rejected (stale)` — preview again).
 *
 * A context switch is PRESENTATION: it never alters an approval, never re-scopes work, never discards a draft. Native controls (the hosted
 * suites select native <select>s by label); logical properties (RTL mirrors); the classes in globals.css (the B80 cb block) carry forced
 * colours and 200% zoom (the bar wraps; nothing scrolls sideways). The library's Dialog (§CL-D) carries the modal (swapped at the
 * fold — the contract is the same.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../lib/observation';
import type { ContextDimensions, EffectiveTimeSupport, ShellScope, WorkspaceKey } from '../lib/b80-seams';
import {
  affectedLines, barStatus, changedLines, CLASSIFICATIONS, commitGate, commitPayload, contextChannel, contextKeyOf, dimensionLines, dimensionsOf,
  HORIZONS, instantWords, localToInstant, previewRegistry, proposalFrom, refusalWords, staleChoice,
  type BarRead, type CommittedSwitch, type Disposition, type ImpactRead, type ProposedContext,
} from '../lib/context-b80';
import { contextApi } from '../lib/context-api-b80';
import { GovernedButton, LiveStatus } from './observation';
import { Receipt } from './ui';
import { Dialog } from './layers';

type ReceiptT = { policyDecisionId: string; auditSeq: number };
const STATE_MARK: Record<string, string> = { set: '', default: '○', unresolved: '⚠', not_applied: '⊘' };
const STATE_WORD: Record<string, string> = { set: '', default: 'default', unresolved: 'unresolved', not_applied: 'not applied' };

function rolesIn(me: Me, scope: ShellScope | null): string[] {
  const out = me.bindings.filter((b) => b.scope === 'PLATFORM' || b.scope === 'TENANT' ? scope === null || b.tenantId === null || b.tenantId === scope.tenantId : scope !== null && b.domainId === scope.domainId)
    .map((b) => b.roleCode);
  return [...new Set(out)].sort();
}
const choiceText = (c: { title: string; stale: boolean; status?: string; state?: string }) => (c.stale ? `${c.title} (stale: ${c.status ?? c.state ?? 'not active'})` : c.title);
const toLocalInput = (iso: string | null): string => {
  if (iso === null) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ───────────── THE BAR ───────────── */
export function GlobalContextBar({ workspace, me, scope, roles, effectiveTime = 'honoured', deployment = 'local-dev', onDimensions, fixture }: {
  workspace: WorkspaceKey;
  me: Me;
  /** null for the PLATFORM workspace */ scope: ShellScope | null;
  /** the role codes bound in the working scope (defaults to the principal's bindings there) */ roles?: string[];
  /** what this page does with the effective time (Q11) */ effectiveTime?: EffectiveTimeSupport;
  deployment?: string;
  /** the shell's ShellBase.context (b80-seams) */ onDimensions?: (d: ContextDimensions | null) => void;
  /** the catalogue's fixture (§CL-D's catalogue walk renders every state without a server): the read, a failure, loading */
  fixture?: { bar: BarRead | null; failure?: { status: number; message: string } | null; loading?: boolean };
}) {
  const [bar, setBar] = useState<BarRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const roleList = roles ?? rolesIn(me, scope);
  const platform = workspace === 'admin' || scope === null;
  const tenantId = scope?.tenantId ?? null; const domainId = scope?.domainId ?? null;
  const fixtureKey = fixture === undefined ? null : JSON.stringify(fixture); // by value: an inline fixture object never re-triggers the read

  const load = useCallback(async () => {
    if (fixtureKey !== null) { const f = JSON.parse(fixtureKey) as NonNullable<typeof fixture>; setBar(f.bar); setFailure(f.failure ?? null); setLoading(f.loading === true); return; }
    if (tenantId === null || domainId === null || workspace === 'admin') return;
    setLoading(true);
    const r = await contextApi.read({ tenantId, domainId });
    setLoading(false);
    // UX-10-005: a failed read keeps the LAST VALID context on screen (never cleared to look current) and says why
    if (!r.ok || r.data === undefined) { setFailure({ status: r.status, message: refusalWords(r, 'the operating context could not be read') }); return; }
    setFailure(null); setBar(r.data.bar);
  }, [tenantId, domainId, workspace, fixtureKey]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => contextChannel.subscribe((c) => { if (c.tenantId === tenantId && c.domainId === domainId) void load(); }), [load, tenantId, domainId]);
  useEffect(() => { onDimensions?.(bar === null ? null : dimensionsOf(bar, roleList)); }, [bar]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = barStatus({ workspace: platform ? 'admin' : workspace, bar, loading, failure });
  const lines = dimensionLines({ workspace: platform ? 'admin' : workspace, bar, roles: roleList, deployment, effectiveTime });
  return (
    <section className="eye-context-bar" aria-label="Operating context" data-testid="global-context-bar" data-state={status.state}>
      <dl className="eye-context-dims">
        {lines.map((l) => (
          <div key={l.key} className="eye-context-dim" data-dimension={l.key} data-state={l.state}>
            <dt>{l.label}</dt>
            <dd title={l.note}>
              {STATE_MARK[l.state] !== '' ? <span aria-hidden="true" className="eye-context-mark">{STATE_MARK[l.state]} </span> : null}
              <bdi>{l.value}</bdi>
              {STATE_WORD[l.state] !== '' && l.state !== 'unresolved' ? <span className="eye-context-state"> ({STATE_WORD[l.state]})</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="eye-context-actions">
        {status.state === 'loading' ? <LiveStatus>reading the operating context…</LiveStatus> : null}
        {status.state === 'degraded' || status.state === 'unavailable' || status.state === 'error' ? (
          <p role="status" className="eye-context-held" data-testid="context-held">
            <span aria-hidden="true">⚠ </span>{status.state === 'degraded' ? status.message : `The operating context is not available here (${status.message}) — ${bar === null ? 'no context is applied' : 'the last valid context is kept'}; consequential commands that depend on it are held.`}
          </p>
        ) : null}
        {!platform && bar !== null && status.maySwitch ? (
          <button ref={trigger} type="button" className="eye-context-switch" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
            Switch context…
          </button>
        ) : null}
        {!platform && bar !== null && !bar.may_set ? <span className="eye-context-note">You hold no role that sets a context in this domain.</span> : null}
      </div>
      {open && bar !== null && scope !== null ? (
        <ContextSwitchDialog scope={scope} bar={bar} open={open} onClose={() => { setOpen(false); trigger.current?.focus(); }}
          onCommitted={() => undefined /* the channel re-reads the bar */} />
      ) : null}
    </section>
  );
}

/* ───────────── THE SWITCH ───────────── */
export function ContextSwitchDialog({ scope, bar, open, onClose, onCommitted, inline = false, intro }: {
  scope: ShellScope;
  bar: BarRead;
  open: boolean;
  onClose: () => void;
  onCommitted: (c: CommittedSwitch) => void;
  /** render in place (the home's switcher) instead of the library's modal Dialog */ inline?: boolean;
  intro?: ReactNode;
}) {
  const headingId = useId(); const gateId = useId();
  const [p, setP] = useState<ProposedContext>(() => proposalFrom(bar));
  const [effLocal, setEffLocal] = useState(() => toLocalInput(proposalFrom(bar).effectiveAt));
  const [preview, setPreview] = useState<ImpactRead | null>(null);
  const [previewedFor, setPreviewedFor] = useState<ProposedContext | null>(null);
  const [choices, setChoices] = useState<Record<string, Disposition>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [held, setHeld] = useState(() => previewRegistry.list());
  useEffect(() => previewRegistry.subscribe(() => setHeld(previewRegistry.list())), []);
  useEffect(() => { // the bar re-read under a new context: the dialog starts again from it
    setP(proposalFrom(bar)); setEffLocal(toLocalInput(proposalFrom(bar).effectiveAt)); setPreview(null); setPreviewedFor(null);
  }, [bar.current?.digest]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScreen: ProposedContext = { ...p, effectiveAt: localToInstant(effLocal) };
  const stale = staleChoice(bar, onScreen);
  const gate = commitGate({ preview, previewedFor, onScreen, maySet: bar.may_set });
  const plan = preview === null ? null : previewRegistry.plan(preview.proposed.digest);
  const set = (patch: Partial<ProposedContext>) => { setP((x) => ({ ...x, ...patch })); setReceipt(null); };

  const body = (
    <div className="eye-context-switch-body" data-testid="context-switch">
      {inline && <h2 id={headingId} className="eye-context-switch-title">Switch the operating context</h2>}
      {intro}
      <p className="eye-context-note">The switch changes what you see and how work is ordered; it alters no approval, re-scopes no work and discards no draft. You see its impact before anything is committed.</p>
      <div className="eye-context-fields">
        <label>Objective<br />
          <select aria-label="objective" value={p.objectiveId ?? ''} onChange={(e) => set({ objectiveId: e.target.value === '' ? null : e.target.value })}>
            <option value="">the whole domain</option>
            {bar.choices.objectives.map((o) => <option key={o.id} value={o.id} disabled={o.stale}>{choiceText(o)}</option>)}
          </select></label>
        <label>Scenario<br />
          <select aria-label="scenario" value={p.scenarioId ?? ''} onChange={(e) => set({ scenarioId: e.target.value === '' ? null : e.target.value })}>
            <option value="">no scenario</option>
            {bar.choices.scenarios.map((s) => <option key={s.id} value={s.id} disabled={s.stale}>{choiceText(s)}</option>)}
          </select></label>
        <label>Horizon<br />
          <select aria-label="horizon" value={p.horizon} onChange={(e) => set({ horizon: e.target.value })}>{HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
        <label>Classification ceiling<br />
          <select aria-label="classification ceiling" value={p.classification} onChange={(e) => set({ classification: e.target.value })}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label>Effective at (your local time; blank = live)<br />
          <input aria-label="effective at" type="datetime-local" value={effLocal} onChange={(e) => { setEffLocal(e.target.value); setReceipt(null); }} /></label>
      </div>
      {stale !== null ? <p role="alert" className="eye-context-refusal">{stale} — the server refuses it (context rejected (stale)).</p> : null}
      <div className="eye-context-buttons">
        <GovernedButton label="Preview the switch" pendingLabel="previewing" variant="quiet" disabled={stale !== null} onRun={async () => {
          const r = await contextApi.impact(scope, onScreen);
          if (!r.ok || r.data === undefined) { setProblem(`Preview refused — ${refusalWords(r, 'no answer')}`); setPreview(null); setPreviewedFor(null); return; }
          setProblem(null); setPreview(r.data.impact); setPreviewedFor(onScreen); setChoices({});
        }} />
        <GovernedButton label="Set the context" pendingLabel="setting" disabled={!gate.allowed} onRun={async () => {
            if (preview === null) return;
            const keys = previewRegistry.plan(preview.proposed.digest);
            const invalidated = [...keys.invalidated.map((i) => i.key), ...keys.choosable.filter((i) => (choices[i.key] ?? 'keep') === 'discard').map((i) => i.key)];
            const r = await contextApi.commit(scope, commitPayload(onScreen, preview, invalidated));
            if (!r.ok || r.data === undefined) {
              setProblem(`Set the context refused — ${refusalWords(r, 'no answer')}`);
              if (r.status === 409) { setPreview(null); setPreviewedFor(null); } // stale: the person previews again
              return;
            }
            // only now — after the server's receipt — the client-held previews bound to the old context are dropped
            previewRegistry.apply(r.data.context.digest, choices);
            setProblem(null); setReceipt(r.data.receipt); setPreview(null); setPreviewedFor(null);
            const c: CommittedSwitch = { tenantId: scope.tenantId, domainId: scope.domainId, contextId: r.data.context.context_id, digest: r.data.context.digest, version: r.data.context.version, receipt: r.data.receipt };
            contextChannel.publish(c);
            onCommitted(c);
          }} />
        {!inline ? <button type="button" className="eye-context-cancel" onClick={onClose}>{receipt === null ? 'Cancel' : 'Close'}</button> : null}
      </div>
      <p id={gateId} className="eye-context-note" aria-live="polite">{gate.reason ?? 'Ready: this commits exactly the previewed switch.'}</p>
      {problem !== null ? <p role="alert" className="eye-context-refusal">{problem}</p> : null}
      <Receipt receipt={receipt} />
      {preview !== null ? (
        <section aria-label="the impact preview" className="eye-context-preview" data-testid="context-impact">
          <h3>Before you commit — the impact</h3>
          <p className="eye-context-note">As of {instantWords(preview.as_of)} · over {preview.basis === null ? 'no context (the stated default)' : `context ${preview.basis.digest.slice(0, 12)}…`} · impact {preview.impact_digest.slice(0, 12)}…</p>
          <h4>What changes</h4>
          {preview.unchanged ? <p>Nothing — this is the current context.</p> : <ul aria-label="changed dimensions">{changedLines(preview).map((l) => <li key={l}>{l}</li>)}</ul>}
          {preview.stale.length > 0 ? <ul aria-label="stale choices">{preview.stale.map((s) => <li key={s.dimension}><span aria-hidden="true">⚠ </span>{s.reason}</li>)}</ul> : null}
          <h4>Your open work</h4>
          <ul aria-label="affected work">
            {affectedLines(preview).map((a) => <li key={a.key} data-affected={a.key}><strong>{a.count}</strong> {a.label} — {a.effect}</li>)}
          </ul>
          {preview.approvals.items.length > 0 ? (
            <ul aria-label="approvals unaffected">{preview.approvals.items.map((x) => <li key={String(x['approval_id'])}>approval of package {String(x['package_id']).slice(0, 8)}… v{String(x['version'])} — binds digest <bdi>{String(x['version_digest']).slice(0, 12)}…</bdi>: unaffected</li>)}</ul>
          ) : null}
          <h4>Held on this page</h4>
          {plan === null || (plan.invalidated.length === 0 && plan.choosable.length === 0) ? <p className="eye-context-note">Nothing held on this page is bound to the old context{held.length > 0 ? ` (${held.length} held item(s) already under the new one)` : ''}.</p> : (
            <>
              {plan.invalidated.length > 0 ? <ul aria-label="previews invalidated">{plan.invalidated.map((i) => <li key={i.key}>{i.label} ({i.kind}) — invalidated: it was computed under the old context</li>)}</ul> : null}
              {plan.choosable.map((i) => (
                <fieldset key={i.key} className="eye-context-choice">
                  <legend>{i.label} ({i.kind})</legend>
                  <label><input type="radio" name={`keep-${i.key}`} checked={(choices[i.key] ?? 'keep') === 'keep'} onChange={() => setChoices((c) => ({ ...c, [i.key]: 'keep' }))} /> keep</label>{' '}
                  <label><input type="radio" name={`keep-${i.key}`} checked={choices[i.key] === 'discard'} onChange={() => setChoices((c) => ({ ...c, [i.key]: 'discard' }))} /> discard</label>
                </fieldset>
              ))}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
  if (inline) return body;
  return (
    /* B80 integration: the library's blocking Dialog (§CL-D — one modal at a time, focus returned to the trigger, dismissal never consent) */
    <Dialog open={open} title="Switch the operating context" onClose={() => onClose()} size="lg">
      <div className="eye-context-dialog">{body}</div>
    </Dialog>
  );
}
