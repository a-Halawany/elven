'use client';
/**
 * THE MIGRATION WORKSPACE — CP-6 B94 §MG (0114 §MG; CAP-DL-06, JRN-23, PR-67-003/-005/-006, UX-66-001/-003/-004/-005, WS-20). In the order
 * UX-66-001 sets: STATUS (the wave, its holds and their routes, the target domain, the accountable owner of data.migration), the MAPPING (the
 * approved version; a proposal shown as a PROPOSAL, never like an approval; automation's suggestions shown as suggestions), READINESS AND
 * CUTOVER (the reconciliation report, the cutover's holds, the approval control with eligibility, separation of duties, the exact digest and
 * a consequence preview; execution, the post-cutover reconciliation, activation), then the secondary detail (the rehearsal diff and the
 * staging rows, the rollback, the acceptance, the ledger and its replay).
 *
 * Everything renders from the server's answer; a refusal shows the server's code and words verbatim; a control that cannot act says why. The
 * page loads by selection and drops a stale answer. Every record shown in a demonstration is SYNTHETIC: an approval or acceptance by a
 * synthetic persona demonstrates the software only — real customer acceptance (AT-67, PR-67-006, UX-66-006) is R2.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getSession } from '../../../../lib/api';
import {
  blockingLine, consequencePreview, countsLine, diffRehearsals, disabledReason, draftFromSuggestions, latestOnly, migration, shortDigest, stateBadge,
  type Blocking, type Mapping, type MappingColumn, type Receipt as Rcpt, type Rehearsal, type Scope, type StagingRow, type WaveDetail,
} from '../../../../lib/delivery-mg-b94';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, fmtInstant } from '../../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
type Result<T> = { ok: boolean; data?: T; error?: { code: string; message: string; correlationId: string } };
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function Badge({ state, held }: { state: string; held?: boolean }) {
  const b = stateBadge(state, held === true);
  return <strong style={{ color: `var(${b.token})` }}><span aria-hidden="true">{b.glyph}</span> {b.text}</strong>;
}
function Held({ items, title }: { items: Blocking[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" style={{ border: '2px solid var(--eye-color-critical)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8) var(--eye-space-12)', marginBlock: 'var(--eye-space-8)' }}>
      <strong style={{ color: 'var(--eye-color-critical)' }}>⏸ {title}</strong>
      <ul style={{ marginBlock: 'var(--eye-space-4)' }}>{items.map((b, i) => <li key={`${b.kind}-${i}`}>{blockingLine(b)}{b.route !== undefined && b.kind !== 'reconciliation' ? <> — <em>{b.route}</em></> : null}</li>)}</ul>
    </div>
  );
}
function Why({ text }: { text: string | null }) {
  return text === null ? null : <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)', marginInlineStart: 'var(--eye-space-8)' }}>{text}</span>;
}
function ProposalBox({ children }: { children: ReactNode }) {
  return <div style={{ border: '1px dashed var(--eye-color-uncertain)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8) var(--eye-space-12)', marginBlock: 'var(--eye-space-8)' }}>{children}</div>;
}
function MappingTable({ m }: { m: Mapping }) {
  return (
    <table style={tableStyle}><thead><tr><Th>Legacy column</Th><Th>Canonical field</Th><Th>Transforms</Th></tr></thead>
      <tbody>{m.spec.columns.map((c) => <tr key={c.column}><Td>{c.column}{c.column === m.spec.key_column ? ' (key)' : ''}</Td><Td>{c.ignore ? 'ignored (declared)' : s(c.field)}</Td><Td mono>{c.transforms.join(' → ') || '—'}</Td></tr>)}</tbody></table>
  );
}

export default function MigrationWorkspacePage() {
  const session = getSession();
  const tenantId = session?.scope?.scope === 'TENANT' || session?.scope?.scope === 'DOMAIN' ? s(session.scope.tenantId) : '';
  const [overview, setOverview] = useState<{ programmes: Row[]; waves: Row[] } | null>(null);
  const [sel, setSel] = useState<{ waveId: string; domainId: string } | null>(null);
  const [d, setD] = useState<WaveDetail | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const guard = useRef(latestOnly());
  // forms
  const [openForm, setOpenForm] = useState({ programmeId: '', domainId: '', sourceId: '', key: '', title: '', identifierSystem: '', identifierAuthority: '' });
  const [evidenceId, setEvidenceId] = useState('');
  const [suggestions, setSuggestions] = useState<Array<MappingColumn & { basis: string }> | null>(null);
  const [specText, setSpecText] = useState('');
  const [basis, setBasis] = useState<'manual' | 'adopted_suggestions'>('manual');
  const [rationale, setRationale] = useState('');
  const [reason, setReason] = useState('');
  const [mappingVersion, setMappingVersion] = useState('');
  const [journeys, setJourneys] = useState('JRN-23');
  const [roles, setRoles] = useState('implementation_lead, onboarding_authority, tenant_admin');
  const [candidate, setCandidate] = useState<{ candidate: Row; digest: string } | null>(null);

  const loadOverview = useCallback(async () => {
    if (tenantId === '') return;
    const r = await migration.overview(tenantId);
    if (r.ok && r.data !== undefined) setOverview({ programmes: r.data.programmes, waves: r.data.waves }); else setError(r.error ?? null);
  }, [tenantId]);
  const loadWave = useCallback(async () => {
    if (sel === null) { setD(null); return; }
    const n = guard.current.next();
    const r = await migration.read({ tenantId, domainId: sel.domainId }, sel.waveId);
    if (!guard.current.isLatest(n)) return;   // a later selection was made: this answer is stale
    if (r.ok && r.data !== undefined) { setD(r.data); setError(null); } else setError(r.error ?? null);
  }, [sel, tenantId]);
  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { setCandidate(null); setSuggestions(null); void loadWave(); }, [loadWave]);

  const scope: Scope | null = sel === null ? null : { tenantId, domainId: sel.domainId };
  const act = async <T extends { receipt: Rcpt }>(p: Promise<Result<T>>, after?: (data: T) => void) => {
    const r = await p;
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setError(null); after?.(r.data); await loadWave(); await loadOverview(); }
    else { setError(r.error ?? null); await loadWave(); throw new Error(r.error?.message ?? 'refused'); }
  };

  if (tenantId === '') return <p>This workspace is a tenant's: sign in with a TENANT- or DOMAIN-scoped session.</p>;
  const wave = d?.wave ?? null;
  const rehearsals = (d?.rehearsals ?? []).filter((r) => r.kind === 'rehearsal');
  const latest: Rehearsal | null = rehearsals[0] ?? null;
  const previous: Rehearsal | null = rehearsals[1] ?? null;
  const proposed = d?.mappings.find((m) => m.state === 'proposed') ?? null;
  const cut = d?.current_cutover ?? null;
  const cutBlocking: Blocking[] = cut === null ? [] : (cut.state === 'requested' ? (d?.cutover_detail?.blocking_now ?? cut.held_reasons) : cut.held_reasons);
  const domainName = s(d?.domain?.['name']);
  const rollbackRehearsal = (d?.rollbacks ?? []).find((b) => b['kind'] === 'rehearsal' && b['cutover_id'] === cut?.cutover_id) ?? null;
  const list = (t: string) => t.split(',').map((x) => x.trim()).filter((x) => x !== '').sort();

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Governed migration</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
        Discover → configure → map → rehearse → reconcile → cut over → accept (JRN-23). The customer&apos;s onboarding authority approves the mapping, the cutover, a rollback and the acceptance on the exact digest — never the proposer, never an implementation lead, never an agent. Automation executes only the approved rows. An approval or acceptance by a SYNTHETIC persona demonstrates the software; real customer acceptance is external (R2).
      </p>
      <p data-testid="global-context" style={{ fontSize: 'var(--eye-type-label-sm)' }}>
        Tenant <Mono>{tenantId}</Mono>{sel !== null ? <> · target domain <Mono>{sel.domainId}</Mono>{domainName !== '' ? ` (${domainName})` : ''}</> : null} · your roles: {(session?.bindings ?? []).map((b) => b.roleCode).join(', ') || 'none'}
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Programmes and waves">
        {overview === null ? <p>Loading…</p> : (
          <table style={tableStyle}><thead><tr><Th>Programme</Th><Th>Wave</Th><Th>State</Th><Th>Target domain</Th><Th>Updated</Th><Th>{null}</Th></tr></thead>
            <tbody>
              {overview.waves.length === 0 ? <tr><Td>No wave yet.</Td><Td>{null}</Td><Td>{null}</Td><Td>{null}</Td><Td>{null}</Td><Td>{null}</Td></tr> : overview.waves.map((w) => (
                <tr key={s(w['wave_id'])}><Td>{s(w['programme_key'])}</Td><Td>{s(w['wave_key'])}</Td><Td><Badge state={s(w['state'])} held={w['held'] === true} /></Td><Td mono>{s(w['domain_id'])}</Td><Td>{fmtInstant(w['updated_at'])}</Td>
                  <Td><button type="button" onClick={() => setSel({ waveId: s(w['wave_id']), domainId: s(w['domain_id']) })} aria-pressed={sel?.waveId === w['wave_id']}>{sel?.waveId === w['wave_id'] ? 'Selected' : 'Open'}</button></Td></tr>
              ))}
            </tbody></table>
        )}
        <details style={{ marginBlockStart: 'var(--eye-space-8)' }}><summary>Open a wave (the implementation lead)</summary>
          <label>Programme <select style={inputStyle} value={openForm.programmeId} onChange={(e) => { const p = overview?.programmes.find((x) => x['programme_id'] === e.target.value); setOpenForm({ ...openForm, programmeId: e.target.value, domainId: s(p?.['target_domain_id']) }); }}>
            <option value="">choose</option>{(overview?.programmes ?? []).map((p) => <option key={s(p['programme_id'])} value={s(p['programme_id'])}>{s(p['programme_key'])} v{s(p['version'])} — {s(p['state'])} → {s(p['target_domain_name'] ?? p['target_domain_id'])}</option>)}</select></label>
          {(['sourceId', 'key', 'title', 'identifierSystem', 'identifierAuthority'] as const).map((k) => <label key={k} style={{ display: 'block' }}>{k} <input style={inputStyle} value={openForm[k]} onChange={(e) => setOpenForm({ ...openForm, [k]: e.target.value })} /></label>)}
          <GovernedButton label="Open the wave" pendingLabel="Opening" disabled={openForm.domainId === ''} onRun={() => act(migration.open({ tenantId, domainId: openForm.domainId }, openForm), (r) => setSel({ waveId: s(r.wave['wave_id']), domainId: openForm.domainId }))} />
          <Why text={openForm.domainId === '' ? 'choose a programme with a target domain' : null} />
        </details>
      </Panel>

      {d === null || wave === null || scope === null ? (sel === null ? <p>Select a wave.</p> : <p>Loading the wave…</p>) : (
        <>
          {/* ── STATUS ─────────────────────────────────────────────────────────── */}
          <Panel title={`Status — wave ${s(wave['wave_key'])}`}>
            <p><Badge state={s(wave['state'])} held={wave['held'] === true} /> · source <Mono>{s(wave['source_id'])}</Mono> · legacy identifier system <Mono>{s(wave['identifier_system'])}</Mono></p>
            <Held title="The wave is held" items={(wave['held_reasons'] as Blocking[] | undefined ?? []).flatMap((h) => (h.kind === 'cutover' ? ((h as unknown as Row)['blocking'] as Blocking[]) : [h]))} />
            <p>Target domain: <strong>{s(d.domain?.['status']).toUpperCase()}</strong>{d.domain?.['activated_at'] ? ` since ${fmtInstant(d.domain['activated_at'])}` : ' — not activated'} · lifecycle: {((d.domain?.['events'] as Row[] | undefined) ?? []).map((e) => s(e['event'])).join(' → ') || 'none'}</p>
            <p>Accountable owner of data.migration: <strong>{s(d.owner?.['state']).toUpperCase()}</strong>{d.owner?.['reason'] ? ` — ${s(d.owner['reason'])}` : ''}{d.owner?.['escalation_path'] ? ` · escalation: ${s(d.owner['escalation_path'])}` : ''}</p>
            <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>Read at {fmtInstant(d.read_at)} (the database&apos;s clock) · receipt POL {d.receipt.policyDecisionId.slice(0, 13)}… · open items: {d.items.filter((i) => i['state'] !== 'closed').map((i) => s(i['signal_class'])).join(', ') || 'none'}</p>
          </Panel>

          {/* ── MAPPING ────────────────────────────────────────────────────────── */}
          <Panel title="Mapping">
            {d.approved_mapping === null ? <p>No approved mapping yet.</p> : (
              <>
                <p><Badge state="approved" /> mapping v{d.approved_mapping.version} · digest <Mono title={d.approved_mapping.digest}>{d.approved_mapping.digest}</Mono> · approved by {s(d.approved_mapping.decided_by_name)} at {fmtInstant(d.approved_mapping.decided_at)} · signed {d.mapping_signatures.length > 0 ? <Mono>{s(d.mapping_signatures[0]?.['key_id'])}</Mono> : 'no'}</p>
                <MappingTable m={d.approved_mapping} />
              </>
            )}
            {proposed === null ? null : (
              <ProposalBox>
                <p><Badge state="proposed" /> mapping v{proposed.version} by {s(proposed.proposed_by_name)} ({proposed.proposed_by_kind}; basis {proposed.basis.replace('_', ' ')}) — {proposed.rationale}</p>
                <MappingTable m={proposed} />
                <p><strong>Approval</strong> — eligibility: {d.viewer.approve_mapping.eligible ? 'you may decide' : 'you may not decide'} ({d.viewer.approve_mapping.reason}). Separation of duties: {d.approval_rule}.</p>
                <p>The exact digest you approve: <Mono>{proposed.digest}</Mono></p>
                <p>Consequence: approving makes v{proposed.version} the mapping every later rehearsal and the cutover read{d.approved_mapping !== null ? `; v${d.approved_mapping.version} is superseded` : ''}. Nothing is migrated by this approval.</p>
                <label>Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
                <GovernedButton label={`Approve v${proposed.version} (sign)`} pendingLabel="Approving" disabled={!d.viewer.approve_mapping.eligible || reason.length < 8}
                  onRun={() => act(migration.decide(scope, s(wave['wave_id']), proposed.version, { digest: proposed.digest, decision: 'approve', reason }), () => setReason(''))} />{' '}
                <GovernedButton label="Reject" pendingLabel="Rejecting" variant="critical" disabled={!d.viewer.approve_mapping.eligible || reason.length < 8}
                  onRun={() => act(migration.decide(scope, s(wave['wave_id']), proposed.version, { digest: proposed.digest, decision: 'reject', reason }), () => setReason(''))} />
                <Why text={disabledReason(d.viewer.approve_mapping, reason.length < 8 ? 'state a reason (8+ characters)' : null)} />
              </ProposalBox>
            )}
            <details><summary>Propose a mapping version (the implementation lead)</summary>
              <label>Evidence of the source <select style={inputStyle} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}><option value="">choose</option>
                {d.evidences.map((e) => <option key={s(e['evidence_id'])} value={s(e['evidence_id'])}>{s(e['item_key'])} · {shortDigest(e['bytes_digest'])} · {fmtInstant(e['created_at'])}</option>)}</select></label>{' '}
              <GovernedButton label="Suggest (automation)" pendingLabel="Reading the header" variant="quiet" disabled={evidenceId === ''}
                onRun={async () => { const r = await migration.suggest(scope, s(wave['wave_id']), evidenceId); if (r.ok && r.data !== undefined) { setSuggestions(r.data.suggestions); setError(null); } else { setError(r.error ?? null); throw new Error('refused'); } }} />
              {suggestions === null ? null : (
                <ProposalBox>
                  <p><strong>SUGGESTIONS of automation — none is approved; nothing is proposed until you propose it.</strong></p>
                  <table style={tableStyle}><thead><tr><Th>Column</Th><Th>Suggested field</Th><Th>Transforms</Th><Th>Basis</Th></tr></thead>
                    <tbody>{suggestions.map((x) => <tr key={x.column}><Td>{x.column}</Td><Td>{x.field ?? '— (you decide: map or ignore)'}</Td><Td mono>{x.transforms.join(' → ')}</Td><Td>{x.basis}</Td></tr>)}</tbody></table>
                  <button type="button" onClick={() => { setSpecText(JSON.stringify(draftFromSuggestions(suggestions), null, 2)); setBasis('adopted_suggestions'); }}>Use as a draft to review</button>
                </ProposalBox>
              )}
              <label style={{ display: 'block' }}>Mapping spec (JSON: key_column, columns[column, field, transforms, ignore])
                <textarea style={{ ...inputStyle, blockSize: '12rem', inlineSize: '100%', fontFamily: 'var(--eye-font-mono)' }} value={specText} onChange={(e) => setSpecText(e.target.value)} /></label>
              <label>Basis <select style={inputStyle} value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}><option value="manual">manual</option><option value="adopted_suggestions">adopted suggestions</option></select></label>{' '}
              <label>Rationale <input style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} /></label>{' '}
              <GovernedButton label="Propose" pendingLabel="Proposing" disabled={!d.viewer.operate.eligible || specText === '' || rationale.length < 8}
                onRun={async () => { let spec: Mapping['spec']; try { spec = JSON.parse(specText) as Mapping['spec']; } catch { setError({ code: 'EYE-REQ-001', message: 'the mapping spec is not JSON', correlationId: '-' }); throw new Error('json'); }
                  await act(migration.propose(scope, s(wave['wave_id']), { spec, basis, rationale })); }} />
              <Why text={disabledReason(d.viewer.operate, rationale.length < 8 ? 'state a rationale (8+ characters)' : null)} />
            </details>
          </Panel>

          {/* ── READINESS AND CUTOVER ──────────────────────────────────────────── */}
          <Panel title="Readiness and cutover">
            {latest === null ? <p>No rehearsal yet.</p> : (
              <>
                <p>Latest rehearsal #{latest.seq} (mapping v{latest.mapping_version}, {s(latest.mapping_state)}) by {s(latest.ran_by_name)} ({latest.ran_by_kind}) at {fmtInstant(latest.ran_at)}: <strong style={{ color: latest.blocking > 0 ? 'var(--eye-color-critical)' : 'var(--eye-color-success)' }}>{latest.blocking > 0 ? `${latest.blocking} BLOCKING` : 'CLEAN'}</strong></p>
                <p data-testid="reconciliation-report">{countsLine(latest.counts)}{latest.unmapped_columns.length > 0 ? ` — unmapped: ${latest.unmapped_columns.join(', ')}` : ''}</p>
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Plan digest <Mono>{latest.plan_digest}</Mono> · input digest <Mono>{s(latest.input_digest)}</Mono> · evidence <Mono>{s(latest.input['evidence_object_id'])}</Mono> (formula-risk cells recorded, never evaluated: {s(latest.counts['formula_cells_recorded'])})</p>
              </>
            )}
            <div>
              <label>Evidence <select style={inputStyle} value={evidenceId} onChange={(e) => setEvidenceId(e.target.value)}><option value="">choose</option>
                {d.evidences.map((e) => <option key={s(e['evidence_id'])} value={s(e['evidence_id'])}>{s(e['item_key'])}</option>)}</select></label>{' '}
              <label>Mapping version <input style={{ ...inputStyle, inlineSize: '5rem' }} value={mappingVersion} placeholder="latest" onChange={(e) => setMappingVersion(e.target.value)} /></label>{' '}
              <GovernedButton label="Rehearse (dry run)" pendingLabel="Rehearsing" variant="quiet" disabled={!d.viewer.operate.eligible || evidenceId === ''}
                onRun={() => act(migration.rehearse(scope, s(wave['wave_id']), { evidenceId, mappingVersion: mappingVersion === '' ? null : Number(mappingVersion) }))} />{' '}
              <GovernedButton label="Request the cutover on the latest rehearsal" pendingLabel="Requesting" variant="quiet" disabled={!d.viewer.operate.eligible || latest === null}
                onRun={() => act(migration.request(scope, s(wave['wave_id']), s(latest?.rehearsal_id)))} />
              <Why text={disabledReason(d.viewer.operate, latest === null ? 'rehearse first' : null)} />
            </div>
            {cut === null ? null : (
              <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                <p>Cutover <Mono>{cut.cutover_id}</Mono>: <Badge state={cut.state} held={cut.held || (cut.state === 'requested' && cutBlocking.length > 0)} /> · requested by {s(cut.requested_by_name)} at {fmtInstant(cut.requested_at)}{cut.approved_by_name ? ` · approved by ${cut.approved_by_name} at ${fmtInstant(cut.approved_at)}` : ''}{cut.execution ? ` · executed (${s(cut.executed_by_kind)}): ${JSON.stringify(cut.execution)}` : ''}</p>
                <Held title="The cutover is held — the approval is refused until every item closes" items={cutBlocking} />
                {cut.state === 'requested' ? (
                  <div style={{ border: '1px solid var(--eye-color-border-strong)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8) var(--eye-space-12)' }}>
                    <p><strong>Cutover approval (the data transfer)</strong> — eligibility: {d.viewer.approve_cutover.eligible ? 'you may approve' : 'you may not approve'} ({d.viewer.approve_cutover.reason}).</p>
                    <p>The exact digest you approve (the rehearsal&apos;s plan): <Mono>{cut.plan_digest}</Mono></p>
                    <p data-testid="consequence-preview">Consequence: {consequencePreview(rehearsals.find((r) => r.rehearsal_id === cut.rehearsal_id) ?? null, domainName)}</p>
                    <label>Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
                    <GovernedButton label="Approve the cutover (sign)" pendingLabel="Approving" disabled={!d.viewer.approve_cutover.eligible || reason.length < 8 || cutBlocking.length > 0}
                      onRun={() => act(migration.approve(scope, cut.cutover_id, { digest: cut.plan_digest, reason }), () => setReason(''))} />{' '}
                    <GovernedButton label="Re-check the holds" pendingLabel="Re-checking" variant="quiet" onRun={() => act(migration.recheck(scope, cut.cutover_id))} />
                    <Why text={disabledReason(d.viewer.approve_cutover, cutBlocking.length > 0 ? 'held: the blocking items above must close first' : reason.length < 8 ? 'state a reason (8+ characters)' : null)} />
                  </div>
                ) : null}
                {cut.state === 'approved' ? <><GovernedButton label="Execute inside the approved plan" pendingLabel="Executing" disabled={!d.viewer.operate.eligible} onRun={() => act(migration.execute(scope, cut.cutover_id))} /><Why text={disabledReason(d.viewer.operate)} /></> : null}
                {cut.state === 'executed' || cut.state === 'verified' ? (
                  <p>Post-cutover: {d.cutover_detail?.post_observed ? `${s(d.cutover_detail.post_observed['observed'])} of ${s(d.cutover_detail.post_observed['expected'])} observed, ${s(d.cutover_detail.post_observed['failed'])} failed, ${s(d.cutover_detail.post_observed['unexpected'])} unexpected — ${d.cutover_detail.post_observed['equal'] === true ? 'EQUAL' : 'NOT EQUAL'}` : 'not read'}{' '}
                    <GovernedButton label="Reconcile (post-cutover)" pendingLabel="Reconciling" variant="quiet" disabled={!d.viewer.operate.eligible} onRun={() => act(migration.reconcile(scope, cut.cutover_id))} />{' '}
                    <GovernedButton label="Activate the domain" pendingLabel="Activating" disabled={!d.viewer.activate.eligible || cut.state !== 'verified'} onRun={() => act(migration.activate(scope, cut.cutover_id))} />
                    <Why text={disabledReason(d.viewer.activate, cut.state !== 'verified' ? 'the post-cutover reconciliation must equal the rehearsal first' : null)} /></p>
                ) : null}
              </div>
            )}
          </Panel>

          {/* ── SECONDARY DETAIL ───────────────────────────────────────────────── */}
          <Panel title="Rehearsal diff and staging">
            {latest === null ? <p>No rehearsal.</p> : (
              <>
                {previous === null ? <p>One rehearsal so far — no diff.</p> : (
                  <>
                    <p>Rehearsal #{previous.seq} → #{latest.seq}: rows whose disposition changed</p>
                    <table style={tableStyle}><thead><tr><Th>Row</Th><Th>Legacy id</Th><Th>Before</Th><Th>After</Th><Th>Reasons before</Th></tr></thead>
                      <tbody>{diffRehearsals((d.staging[previous.rehearsal_id] ?? []) as StagingRow[], (d.staging[latest.rehearsal_id] ?? []) as StagingRow[]).map((x) => (
                        <tr key={x.row_no}><Td>{x.row_no}</Td><Td mono>{s(x.legacy_id)}</Td><Td>{s(x.before) || '—'}</Td><Td>{s(x.after) || '—'}</Td><Td>{x.reasons.join('; ')}</Td></tr>))}</tbody></table>
                  </>
                )}
                <details><summary>The staging rows of rehearsal #{latest.seq}</summary>
                  <table style={tableStyle}><thead><tr><Th>Row</Th><Th>Legacy id</Th><Th>Name</Th><Th>Disposition</Th><Th>Reasons</Th><Th>Risk rating</Th><Th>Last review</Th></tr></thead>
                    <tbody>{((d.staging[latest.rehearsal_id] ?? []) as StagingRow[]).map((r) => (
                      <tr key={r.row_no}><Td>{r.row_no}</Td><Td mono>{s(r.legacy_id)}</Td><Td>{s(r.name)}{r.match_name ? ` ↔ ${r.match_name}` : ''}</Td><Td>{r.disposition.replace('_', ' ')}</Td><Td>{r.reasons.join('; ')}{r.formula_cells.length > 0 ? ` [${r.formula_cells.join(', ')}]` : ''}</Td>
                        <Td>{s(r.values['risk_rating'])}</Td><Td>{s(r.values['last_review_on'])}</Td></tr>))}</tbody></table>
                </details>
              </>
            )}
          </Panel>

          <Panel title="Rollback">
            {cut === null || !['executed', 'verified', 'activated'].includes(cut.state) ? <p>Nothing has been migrated: there is nothing to roll back.</p> : (
              <>
                <p>Rollback plan (read live): retire {((d.cutover_detail?.rollback_plan?.['retire'] as Row[] | undefined) ?? []).length} created entities; keep {((d.cutover_detail?.rollback_plan?.['keep_identifiers'] as Row[] | undefined) ?? []).length} identifier(s) on matched entities as history; the domain {s((d.cutover_detail?.rollback_plan?.['domain'] as Row | undefined)?.['status'])} → {s((d.cutover_detail?.rollback_plan?.['domain'] as Row | undefined)?.['revert_to'])}. Append-only: nothing is deleted.</p>
                <GovernedButton label="Rehearse the rollback (record the proof)" pendingLabel="Rehearsing" variant="quiet" disabled={!d.viewer.operate.eligible} onRun={() => act(migration.rehearseRollback(scope, cut.cutover_id))} />{' '}
                {rollbackRehearsal === null ? <Why text="the rollback is executed on a rehearsed plan's digest" /> : (
                  <>
                    <span>Rehearsed plan digest <Mono>{s(rollbackRehearsal['digest'])}</Mono></span>{' '}
                    <GovernedButton label="Execute the rollback" pendingLabel="Rolling back" variant="critical" disabled={!d.viewer.execute_rollback.eligible || reason.length < 8}
                      onRun={() => act(migration.executeRollback(scope, cut.cutover_id, { rehearsalId: s(rollbackRehearsal['rollback_id']), digest: s(rollbackRehearsal['digest']), reason }), () => setReason(''))} />
                    <Why text={disabledReason(d.viewer.execute_rollback, reason.length < 8 ? 'state a reason (8+ characters) above' : null)} />
                  </>
                )}
              </>
            )}
            {d.rollbacks.length > 0 ? <ul>{d.rollbacks.map((b) => <li key={s(b['rollback_id'])}>{s(b['kind'])} by {s(b['recorded_by_name'])} at {fmtInstant(b['recorded_at'])} — digest <Mono>{shortDigest(b['digest'])}</Mono></li>)}</ul> : null}
          </Panel>

          <Panel title="Acceptance (PR-67-006)">
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>An acceptance binds the exact mapping, rehearsals, post-cutover reconciliation, cutover, baseline, licence, journeys and roles. Its claim is <strong>demonstration</strong> — a SYNTHETIC persona demonstrates the software; real customer acceptance is R2. Withholding keeps the prior safe operation.</p>
            <label>Journeys <input style={inputStyle} value={journeys} onChange={(e) => setJourneys(e.target.value)} /></label>{' '}
            <label>Roles exercised <input style={{ ...inputStyle, inlineSize: '24rem' }} value={roles} onChange={(e) => setRoles(e.target.value)} /></label>{' '}
            <GovernedButton label="Read the candidate" pendingLabel="Reading" variant="quiet"
              onRun={async () => { const r = await migration.candidate(scope, s(wave['wave_id']), { journeys: list(journeys), roles: list(roles), baselineDigest: null }); if (r.ok && r.data !== undefined) { setCandidate(r.data); setError(null); } else { setError(r.error ?? null); throw new Error('refused'); } }} />
            {candidate === null ? null : (
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <p>Candidate digest <Mono>{candidate.digest}</Mono> — eligibility: {d.viewer.accept.reason}</p>
                <pre style={{ fontSize: 'var(--eye-type-mono-sm)', maxBlockSize: '14rem', overflow: 'auto' }}>{JSON.stringify(candidate.candidate, null, 2)}</pre>
                <GovernedButton label="Accept (sign)" pendingLabel="Accepting" disabled={!d.viewer.accept.eligible || reason.length < 8}
                  onRun={() => act(migration.decideAcceptance(scope, s(wave['wave_id']), { decision: 'accept', journeys: list(journeys), roles: list(roles), baselineDigest: null, digest: candidate.digest, reason }), () => { setReason(''); setCandidate(null); })} />{' '}
                <GovernedButton label="Withhold" pendingLabel="Withholding" variant="critical" disabled={!d.viewer.accept.eligible || reason.length < 8}
                  onRun={() => act(migration.decideAcceptance(scope, s(wave['wave_id']), { decision: 'withhold', journeys: list(journeys), roles: list(roles), baselineDigest: null, digest: candidate.digest, reason }), () => setReason(''))} />
                <label> Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <Why text={disabledReason(d.viewer.accept, reason.length < 8 ? 'state a reason (8+ characters)' : null)} />
              </div>
            )}
            {d.acceptances.length > 0 ? <ul>{d.acceptances.map((a) => <li key={s(a['acceptance_id'])}><Badge state={s(a['decision']) === 'accepted' ? 'accepted' : 'withheld'} /> by {s(a['decided_by_name'])} at {fmtInstant(a['decided_at'])} — claim {s(a['claim'])}, digest <Mono>{shortDigest(a['digest'])}</Mono></li>)}</ul> : null}
          </Panel>

          <Panel title="Ledger and replay">
            <p>Replay (from the ledger alone): wave {s(d.replay['wave_state'])}{d.replay['wave_held'] === true ? ' (held)' : ''} · approved mapping v{s(d.replay['approved_mapping'])} · domain {d.replay['domain_activated'] === true ? 'activated' : 'not activated'} · acceptance {s(d.replay['acceptance']) || 'none'} — {s(d.replay['wave_state']) === s(wave['state']) ? 'agrees with the recorded state' : 'DIFFERS from the recorded state'}</p>
            <ol style={{ fontSize: 'var(--eye-type-body-sm)' }}>{d.ledger.map((e) => <li key={s(e['event_id'])}>{fmtInstant(e['occurred_at'])} — <strong>{s(e['event'])}</strong> by {s(e['actor_name'] ?? e['actor_principal_id'])}</li>)}</ol>
          </Panel>
        </>
      )}
    </>
  );
}
