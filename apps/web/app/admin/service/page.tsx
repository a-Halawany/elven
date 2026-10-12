'use client';
/**
 * THE SERVICE PORTAL — CP-6 B94 §SV (0114_b94_x_sv; CAP-DL-09, PR-69-001/002/005/006; WS-20 the product-delivery workspace; carryover a: premium
 * support routed from the live licence).
 *
 * The global context first (tenant, domain, the roles you hold here). Then STATUS: the cases with their state, severity, routing tier and SLA
 * objectives (met / met late / breached / running — said, never inferred), the breaches and drills; then the routing every severity would get
 * from the live licence (premium never weakens governance; opening a case is never licence-gated). ONE CASE, chosen: its state and version, the
 * routing it recorded, the objectives, what support proposed (a PROPOSAL — never styled as done) and what the customer executed (with its
 * receipt), the acts the state admits (the others disabled with the reason), the evidence bundles (each item included, redacted or withheld
 * with the reason; the digest), the commitments, the support grants (read only — the control center decides them), the access log, the
 * ledger. The closure is the CUSTOMER's confirmation: the button shows who may confirm, the version it confirms and what happens. Problems,
 * known errors (reusable on a case) and changes below. Refusals are the server's words. SYNTHETIC records demonstrate the software only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSession } from '../../../lib/api';
import {
  ACT_FROM, ROUTING_GOVERNANCE, actReason, bundleItemLine, dispositionMark, instantUtc, objectiveLine, objectiveMark, progressReason, routingLine, selectionGuard, service, stateMark,
  type CaseAct, type CaseDetail, type CaseRow, type CaseState, type Mark, type Receipt as Rcpt, type Routing, type Scope,
} from '../../../lib/delivery-sv-b94';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { Empty, GovernedButton, Mono, ScrollBox, textareaStyle } from '../../../components/observation';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' } as const;
const PROGRESS_TARGETS = ['awaiting_access', 'diagnosing', 'cannot_reproduce', 'degraded_guidance', 'resolved'] as const;

function MarkText({ m }: { m: Mark }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
function Disabled({ reason }: { reason: string | null }) {
  return reason === null ? null : <span style={{ ...muted, marginInlineStart: 'var(--eye-space-8)' }}>— {reason}</span>;
}

export default function ServicePortalPage() {
  const session = getSession();
  const own = session?.scope ?? null;
  const [domainId, setDomainId] = useState<string>(own?.domainId ?? '');
  const scope: Scope | null = own?.tenantId !== null && own?.tenantId !== undefined && domainId !== '' ? { tenantId: own.tenantId, domainId } : null;
  const roles = useMemo(() => new Set((session?.bindings ?? []).filter((b) => b.scope === 'TENANT' || b.domainId === domainId).map((b) => b.roleCode)), [session, domainId]);
  const [list, setList] = useState<{ cases: CaseRow[]; breaches: Row[]; routing: Record<string, Routing>; policies: Row[]; read_at: string } | null>(null);
  const [problems, setProblems] = useState<{ problems: Row[]; known_errors: Row[]; changes: Row[]; links: Row[] } | null>(null);
  const [caseId, setCaseId] = useState('');
  const [view, setView] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const guard = useMemo(() => selectionGuard(), []);
  // forms
  const [oTitle, setOTitle] = useState(''); const [oSev, setOSev] = useState('S2'); const [oCap, setOCap] = useState('observation'); const [oSources, setOSources] = useState(''); const [oDesc, setODesc] = useState('');
  const [text, setText] = useState(''); const [to, setTo] = useState<string>('diagnosing'); const [regrade, setRegrade] = useState('');
  const [waAction, setWaAction] = useState(''); const [waObject, setWaObject] = useState(''); const [decisionId, setDecisionId] = useState('');
  const [keId, setKeId] = useState(''); const [cKind, setCKind] = useState('update'); const [cDue, setCDue] = useState('');

  const loadList = useCallback(async () => {
    if (scope === null) return;
    const r = await service.list(scope);
    if (r.ok && r.data !== undefined) setList(r.data); else setError(r.error ?? null);
    const pr = await service.problems(scope);
    if (pr.ok && pr.data !== undefined) setProblems(pr.data);
  }, [scope?.tenantId, scope?.domainId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const loadCase = useCallback(async () => {
    const token = guard.begin();
    if (scope === null || caseId === '') { setView(null); return; }
    const r = await service.read(scope, caseId);
    if (!guard.current(token)) return;   // a slower answer for an earlier choice is dropped
    if (r.ok && r.data !== undefined) setView(r.data); else { setView(null); setError(r.error ?? null); }
  }, [scope?.tenantId, scope?.domainId, caseId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadCase(); }, [loadCase]);

  /** Every act: the receipt on success, the server's words on a refusal, then everything read again. */
  const act = async (r: { ok: boolean; data?: { receipt?: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok) { setError(null); setReceipt(r.data?.receipt ?? null); setText(''); await loadList(); await loadCase(); return; }
    setError(r.error ?? null); throw new Error(r.error?.message ?? 'refused');
  };

  const c = view?.case ?? null;
  const why = (a: CaseAct) => (c === null ? 'choose a case' : actReason(a, c.state, roles));
  const isCustomer = !roles.has('support_engineer') && roles.size > 0;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Service portal</h1>
      <p style={muted}>Cases, SLA objectives and escalation, problems and known errors, changes, evidence bundles. Support acts only under a live, customer-approved grant; a workaround is executed by the customer&apos;s own role; closure is the customer&apos;s confirmation. Every record shown here is SYNTHETIC.</p>
      <Panel title="Context">
        <p>Tenant <Mono>{own?.tenantId ?? '—'}</Mono> · domain {own?.scope === 'DOMAIN' ? <Mono>{domainId}</Mono> : (
          <input aria-label="domain id" style={inputStyle} value={domainId} onChange={(e) => setDomainId(e.target.value.trim())} placeholder="the domain id" />)}
          {' '}· your roles here: {roles.size === 0 ? 'none' : [...roles].join(', ')}</p>
      </Panel>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {scope === null ? <Empty>No domain in this session — enter the domain id above.</Empty> : list === null ? <Empty>Reading the cases…</Empty> : (
        <>
          <Panel title="Cases — status first">
            <ScrollBox label="cases">
              <table style={tableStyle}>
                <thead><tr><Th>Case</Th><Th>State</Th><Th>Severity</Th><Th>Routing</Th><Th>Response</Th><Th>Resolution</Th><Th>Opened</Th></tr></thead>
                <tbody>{list.cases.map((x) => (
                  <tr key={x.case_id} onClick={() => setCaseId(x.case_id)} style={{ cursor: 'pointer', background: x.case_id === caseId ? 'var(--eye-color-surface-secondary)' : undefined }}>
                    <Td><button type="button" onClick={() => setCaseId(x.case_id)} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>{x.case_ref}</button> {x.title}</Td>
                    <Td><MarkText m={stateMark(x.state)} /></Td><Td>{x.severity}</Td><Td>{x.routing.tier}</Td>
                    {(x.sla ?? []).map((o) => <Td key={o.objective}><MarkText m={objectiveMark(o)} /></Td>)}
                    <Td>{instantUtc(x.opened_at)}</Td>
                  </tr>))}</tbody>
              </table>
            </ScrollBox>
            <p style={muted}>{list.cases.length} case(s) · {list.breaches.filter((b) => b['drill'] !== true).length} SLA breach(es) recorded · {list.breaches.filter((b) => b['drill'] === true).length} drill(s) · read {instantUtc(list.read_at)}</p>
          </Panel>
          <Panel title="Routing from the live licence">
            <ul>{Object.values(list.routing).map((r) => <li key={r.severity}>{routingLine(r)} <span style={muted}>— {r.reason}</span></li>)}</ul>
            <p style={muted}>{ROUTING_GOVERNANCE}</p>
          </Panel>
          <Panel title="Open a case (a customer role — never licence-gated)">
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '44rem' }}>
              <label>Title<input style={inputStyle} value={oTitle} onChange={(e) => setOTitle(e.target.value)} /></label>
              <label>Severity<select style={inputStyle} value={oSev} onChange={(e) => setOSev(e.target.value)}>{['S1', 'S2', 'S3', 'S4'].map((s) => <option key={s}>{s}</option>)}</select></label>
              <label>Affected capability<input style={inputStyle} value={oCap} onChange={(e) => setOCap(e.target.value)} /></label>
              <label>Affected sources (ids, comma-separated)<input style={inputStyle} value={oSources} onChange={(e) => setOSources(e.target.value)} /></label>
              <label>What happened<textarea style={textareaStyle} value={oDesc} onChange={(e) => setODesc(e.target.value)} /></label>
              <p style={muted}>Consequence: the case is routed {list.routing[oSev]?.tier ?? '—'} ({list.routing[oSev] === undefined ? '' : routingLine(list.routing[oSev])}); both SLA timers start; the domain&apos;s service owners are notified under the published attention policy.</p>
              <GovernedButton label="Open the case" pendingLabel="opening" disabled={!isCustomer || oTitle.trim().length < 4 || oDesc.trim().length < 8}
                onRun={async () => act(await service.open(scope, { title: oTitle.trim(), severity: oSev, capability: oCap.trim(), description: oDesc.trim(),
                  objects: oSources.split(',').map((x) => x.trim()).filter((x) => x !== '').map((id) => ({ kind: 'source', id })) }))} />
              {!isCustomer ? <Disabled reason="a customer role of the domain opens a case; support never does" /> : null}
            </div>
          </Panel>
          {c === null ? <Empty>Choose a case above.</Empty> : (
            <>
              <Panel title={`${c.case_ref} — ${c.title}`}>
                <p><MarkText m={stateMark(c.state)} /> · version {c.version} · {c.severity} · {c.affected_capability} · reopened {c.reopen_count}× · opened {instantUtc(c.opened_at)} by {c.opened_by_name ?? c.opened_by}</p>
                <p>Routing recorded at opening: {routingLine(c.routing)}<br /><span style={muted}>{c.routing.reason}</span></p>
                <ul aria-label="SLA objectives">{view!.sla.map((o) => <li key={o.objective}><MarkText m={objectiveMark(o)} /> {objectiveLine(o)}</li>)}</ul>
                {c.guidance !== null && c.state === 'degraded_guidance' ? <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>Degraded — safe guidance: {c.guidance}</p> : null}
                {c.workaround !== null ? (
                  <div style={{ borderInlineStart: '3px dashed var(--eye-color-warning)', paddingInlineStart: 'var(--eye-space-8)' }}>
                    <p><strong>PROPOSED workaround</strong> ({String(c.workaround['source'])}, by {String(c.workaround['side'])}): {String(c.workaround['steps'])}</p>
                    <p style={muted}>The act the CUSTOMER performs: <Mono>{JSON.stringify(c.workaround['act'])}</Mono>{c.workaround['risk'] !== null ? ` · risk: ${String(c.workaround['risk'])}` : ''}</p>
                  </div>) : null}
                {c.workaround_executed !== null ? <p style={{ borderInlineStart: '3px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)' }}><strong>EXECUTED by the customer</strong>: {String(c.workaround_executed['action'])} · receipt POL <Mono>{String(c.workaround_executed['policy_decision_id'])}</Mono> at {instantUtc(c.workaround_executed['decided_at'])}</p> : null}
                {c.resolution !== null ? <p>Resolution: {c.resolution}</p> : null}
                {c.closure !== null ? <p>Closure: {String(c.closure['outcome'])} — {String(c.closure['note'])} (confirmed by the customer {instantUtc(c.closure['confirmed_at'])})</p> : null}
              </Panel>
              <Panel title="Acts on this case">
                <label>Note / statement<textarea style={textareaStyle} value={text} onChange={(e) => setText(e.target.value)} /></label>
                <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
                  <div><GovernedButton label="Add a note" pendingLabel="noting" variant="quiet" disabled={why('note') !== null || text.trim().length < 4} onRun={async () => act(await service.note(scope, c.case_id, { body: text.trim() }))} /><Disabled reason={why('note')} /></div>
                  <div>
                    <label>Re-grade (optional)<select style={inputStyle} value={regrade} onChange={(e) => setRegrade(e.target.value)}><option value="">keep {c.severity}</option>{['S1', 'S2', 'S3', 'S4'].map((s) => <option key={s}>{s}</option>)}</select></label>
                    <GovernedButton label={`Triage (v${c.version})`} pendingLabel="triaging" disabled={why('triage') !== null || text.trim().length < 8}
                      onRun={async () => act(await service.triage(scope, c.case_id, { expectedVersion: c.version, severity: regrade === '' ? null : regrade, note: text.trim() }))} /><Disabled reason={why('triage')} />
                  </div>
                  <div>
                    <label>Move to<select style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)}>{PROGRESS_TARGETS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></label>
                    <GovernedButton label={`Progress (v${c.version})`} pendingLabel="moving" disabled={why('progress') !== null || progressReason(to, c.state) !== null || text.trim().length < 12}
                      onRun={async () => act(await service.progress(scope, c.case_id, { expectedVersion: c.version, to, statement: text.trim() }))} /><Disabled reason={why('progress') ?? progressReason(to, c.state)} />
                  </div>
                  <div>
                    <label>Workaround act (the customer&apos;s action)<input style={inputStyle} value={waAction} onChange={(e) => setWaAction(e.target.value)} placeholder="e.g. observation.source.transition" /></label>
                    <label>on object<input style={inputStyle} value={waObject} onChange={(e) => setWaObject(e.target.value)} /></label>
                    <GovernedButton label="Propose the workaround" pendingLabel="proposing" variant="quiet" disabled={why('workaround.propose') !== null || text.trim().length < 12 || waAction === ''}
                      onRun={async () => act(await service.proposeWorkaround(scope, c.case_id, { expectedVersion: c.version, steps: text.trim(), act: { action: waAction.trim(), ...(waObject === '' ? {} : { object_id: waObject.trim() }) } }))} /><Disabled reason={why('workaround.propose')} />
                  </div>
                  <div>
                    <label>The receipt (policy decision) of the act you performed<input style={inputStyle} value={decisionId} onChange={(e) => setDecisionId(e.target.value.trim())} /></label>
                    <GovernedButton label="Record that I executed it" pendingLabel="recording" disabled={why('workaround.execute') !== null || decisionId === ''}
                      onRun={async () => act(await service.executeWorkaround(scope, c.case_id, { expectedVersion: c.version, policyDecisionId: decisionId, note: text.trim() === '' ? null : text.trim() }))} /><Disabled reason={why('workaround.execute')} />
                  </div>
                  <div>
                    <label>Known error<select style={inputStyle} value={keId} onChange={(e) => setKeId(e.target.value)}><option value="">choose</option>{(problems?.known_errors ?? []).filter((k) => k['state'] === 'published').map((k) => <option key={String(k['known_error_id'])} value={String(k['known_error_id'])}>{String(k['ke_ref'])} {String(k['title'])}</option>)}</select></label>
                    <GovernedButton label="Reuse the known error" pendingLabel="reusing" variant="quiet" disabled={why('known_error.reuse') !== null || keId === ''}
                      onRun={async () => act(await service.reuseKnownError(scope, c.case_id, { expectedVersion: c.version, knownErrorId: keId }))} /><Disabled reason={why('known_error.reuse')} />
                  </div>
                  <div><GovernedButton label="Assemble an evidence bundle" pendingLabel="assembling" variant="quiet" disabled={why('bundle') !== null} onRun={async () => act(await service.bundle(scope, c.case_id))} /><Disabled reason={why('bundle')} /></div>
                  <div>
                    <label>Commitment<select style={inputStyle} value={cKind} onChange={(e) => setCKind(e.target.value)}>{['update', 'workaround', 'fix', 'review', 'other'].map((k) => <option key={k}>{k}</option>)}</select></label>
                    <label>due<input type="datetime-local" style={inputStyle} value={cDue} onChange={(e) => setCDue(e.target.value)} /></label>
                    <GovernedButton label="Record the commitment" pendingLabel="recording" variant="quiet" disabled={why('commitment') !== null || cDue === '' || text.trim().length < 8}
                      onRun={async () => act(await service.commit(scope, c.case_id, { kind: cKind, statement: text.trim(), dueAt: new Date(cDue).toISOString() }))} /><Disabled reason={why('commitment')} />
                  </div>
                  <div style={{ borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlockStart: 'var(--eye-space-8)' }}>
                    <p><strong>Confirm the closure</strong> — the customer&apos;s act (a named human of a customer role; never support). Eligible: {isCustomer ? 'you' : 'not you'}. It confirms case {c.case_ref} at version {c.version} ({c.state === 'cannot_reproduce' ? 'not reproduced' : 'resolved'}). Consequence: the case closes, its closure task completes, its routed items close; it can be reopened on a regression. Refused while a commitment is open.</p>
                    <GovernedButton label={`Confirm closure (v${c.version})`} pendingLabel="confirming" disabled={why('close') !== null || text.trim().length < 8}
                      onRun={async () => act(await service.close(scope, c.case_id, { expectedVersion: c.version, outcome: c.state === 'cannot_reproduce' ? 'not_reproduced' : 'resolved', note: text.trim() }))} /><Disabled reason={why('close')} />
                    <GovernedButton label="Reopen on a regression" pendingLabel="reopening" variant="critical" disabled={why('reopen') !== null || text.trim().length < 12}
                      onRun={async () => act(await service.reopen(scope, c.case_id, { expectedVersion: c.version, regression: text.trim() }))} /><Disabled reason={why('reopen')} />
                  </div>
                  <div><GovernedButton label="Run an SLA escalation drill (response)" pendingLabel="scheduling" variant="quiet" disabled={why('drill') !== null || text.trim().length < 8}
                    onRun={async () => act(await service.drill(scope, c.case_id, { objective: 'response', reason: text.trim() }))} /><Disabled reason={why('drill')} /></div>
                </div>
                <p style={muted}>Acts by state: {Object.entries(ACT_FROM).filter(([, s]) => s.includes(c.state as CaseState)).map(([a]) => a).join(', ')}.</p>
              </Panel>
              <Panel title="Evidence bundles">
                {view!.bundles.length === 0 ? <Empty>No bundle assembled.</Empty> : view!.bundles.map((b) => (
                  <div key={b.bundle_id} style={{ marginBlockEnd: 'var(--eye-space-12)' }}>
                    <p>{b.side === 'support' ? 'Support' : 'Customer'} bundle · case v{b.case_version} · {instantUtc(b.assembled_at)} · digest <Mono>{b.digest}</Mono>{b.grant_id !== null ? <> · grant <Mono>{b.grant_id}</Mono></> : null}</p>
                    <ul>{b.items.map((i, n) => <li key={n}><MarkText m={dispositionMark(i.disposition)} /> {bundleItemLine(i)}</li>)}</ul>
                  </div>))}
              </Panel>
              <Panel title="Commitments, breaches, timers and routed items">
                <ul>{view!.commitments.map((m) => <li key={String(m['commitment_id'])}>{String(m['kind'])} — {String(m['statement'])} · due {instantUtc(m['due_at'])} · <strong>{String(m['state'])}</strong>{m['late'] === true ? ' (late)' : ''}</li>)}</ul>
                <ul>{view!.breaches.map((b) => <li key={String(b['breach_id'])}>{b['drill'] === true ? 'DRILL — ' : ''}{String(b['objective'])} breached (due {instantUtc(b['due_at'])}, found by {String(b['found_by'])}) · item {String((b['item'] as Row)['state'] ?? '')}</li>)}</ul>
                <ul style={muted}>{view!.timers.map((t) => <li key={String(t['timer_id'])}>{String(t['kind'])} due {instantUtc(t['due_at'])} — {t['fired_at'] !== null ? `fired (${String(t['outcome'] ?? '')})` : t['cancelled_at'] !== null ? 'cancelled' : 'pending'}</li>)}</ul>
                <ul style={muted}>{view!.items.map((i) => <li key={String(i['item_id'])}>{String(i['title'])} · {String(i['state'])} ({String(i['outcome'])})</li>)}</ul>
              </Panel>
              <Panel title="Support access (read only — the control center approves and revokes)">
                <ul>{view!.grants.map((g) => <li key={String(g['grant_id'])}>grant <Mono>{String(g['grant_id']).slice(0, 8)}</Mono> · {String(g['state'])}{g['live'] === true ? ' · LIVE' : ''} · until {instantUtc(g['expires_at'])} · {(g['action_scope'] as string[]).join(', ')}</li>)}</ul>
                <ScrollBox label="access log"><table style={tableStyle}><thead><tr><Th>At</Th><Th>Act</Th><Th>Object</Th><Th>Outcome</Th><Th>Grant</Th></tr></thead>
                  <tbody>{view!.access_log.map((l) => <tr key={String(l['log_id'])}><Td>{instantUtc(l['at'])}</Td><Td>{String(l['action'])}</Td><Td>{String(l['object_kind'])}</Td><Td>{String(l['outcome'])}</Td><Td>{l['grant_id'] === null ? 'none' : String(l['grant_id']).slice(0, 8)}</Td></tr>)}</tbody></table></ScrollBox>
              </Panel>
              <Panel title="Ledger (replay)">
                <ol style={muted}>{view!.ledger.map((e) => <li key={String(e['event_id'])}>{instantUtc(e['occurred_at'])} — {String(e['event'])} (v{String(e['version'] ?? '–')}) by {String(e['actor_name'] ?? e['actor_principal_id'])}</li>)}</ol>
                <p style={muted}>{view!.boundary}</p>
              </Panel>
            </>
          )}
          <Panel title="Problems, known errors and changes">
            {problems === null ? <Empty>Reading…</Empty> : (
              <>
                <ul>{problems.problems.map((p) => <li key={String(p['problem_id'])}>{String(p['problem_ref'])} {String(p['title'])} · <strong>{String(p['state'])}</strong> · {problems.links.filter((l) => l['problem_id'] === p['problem_id']).map((l) => String(l['case_ref'])).join(', ')}</li>)}</ul>
                <ul>{problems.known_errors.map((k) => <li key={String(k['known_error_id'])}>{String(k['ke_ref'])} {String(k['title'])} · {String(k['state'])} · reused {String(k['uses'])}× · <Mono>{String(k['digest']).slice(0, 12)}</Mono></li>)}</ul>
                <ul>{problems.changes.map((x) => <li key={String(x['change_id'])}>{String(x['change_ref'])} {String(x['title'])} · <strong>{String(x['state'])}</strong>{x['state'] === 'proposed' ? ' (a proposal — decided by another domain admin)' : ''}</li>)}</ul>
              </>)}
          </Panel>
        </>
      )}
    </>
  );
}
