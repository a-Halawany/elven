'use client';
/**
 * THE CUSTOMER CONTROL CENTER — CP-6 B94 §SA (0114_b94_x_sa; CAP-TR-12, IA-04-001..006, PR-69-003, PER-20). Status FIRST: who owns support
 * access (a gap is shown as a gap — dependent acts stop), the open responsibility gaps, the grants awaiting a decision and the grants live
 * now; then the approval (eligibility, the exact digest, the consequence preview), the shared-responsibility matrix and its accountable owners,
 * reconciliation, the access log, customer-control drills, joint exercises and the admission record, then exports, signing keys and residency
 * (their own routes, read-only here).
 *
 * Everything renders from the server's answer: who owns what, whether a grant is live and who may decide are the server's (the ports re-check
 * every rule); a refusal is shown in the server's words. A proposal is never styled like an approval. On a demonstration every persona and
 * record is SYNTHETIC; a signed admission record is construction evidence — production admission is R1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../lib/api';
import { consequenceLines, dayText, grantStateText, grantView, isGap, latestOnly, matrixStateText, minutesLeft, ownerText, sa, shortDigest,
  type ControlCenter, type Grant, type Preview, type Receipt as Rcpt } from '../../../lib/delivery-sa-b94';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { GovernedButton, Mono, ScrollBox, fmtInstant } from '../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
const proposalStyle = { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' };
const inForceStyle = { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const gapStyle = { color: 'var(--eye-color-critical)', fontWeight: 600 };

export default function ControlCenterPage() {
  const session = getSession();
  const domains = useMemo(() => [...new Set([session?.scope?.domainId ?? null, ...(session?.bindings ?? []).map((b) => b.domainId)].filter((x): x is string => typeof x === 'string'))], [session]);
  const tenantId = session?.scope?.tenantId ?? (session?.bindings ?? []).find((b) => b.tenantId !== null)?.tenantId ?? '';
  const roles = (session?.bindings ?? []).map((b) => `${b.roleCode}@${b.scope}`);
  const [domainId, setDomainId] = useState<string>(domains[0] ?? '');
  const [cc, setCc] = useState<ControlCenter | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [exportsList, setExports] = useState<Row[] | null>(null);
  const [keys, setKeys] = useState<Row[] | null>(null);
  const guard = useRef(latestOnly());

  const load = useCallback(async () => {
    if (tenantId === '' || domainId === '') return;
    setError(null);
    const r = await sa.controlCenter(tenantId, domainId);
    if (r.ok && r.data !== undefined) setCc(r.data); else setError(r.error ?? null);
    const [e, k] = await Promise.all([sa.exports(tenantId, domainId), sa.signingKeys(tenantId, domainId)]);
    setExports(e.ok && e.data !== undefined ? e.data.actions : null); setKeys(k.ok && k.data !== undefined ? k.data.keys : null);
  }, [tenantId, domainId]);
  useEffect(() => { void load(); }, [load]);

  // the approval's preview, loaded by selection — only the newest answer is applied (a stale response never shows another grant's digest)
  useEffect(() => {
    if (selected === '' || tenantId === '' || domainId === '') { setPreview(null); return; }
    const n = guard.current.next();
    setPreview(null);
    void sa.preview(tenantId, domainId, selected).then((r) => {
      if (!guard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null);
    });
  }, [selected, tenantId, domainId]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); setSelected(''); await load(); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const readAt = cc?.read_at ?? new Date().toISOString();
  const grants = cc?.grants ?? [];
  const pending = grants.filter((g) => grantView(g, readAt) === 'pending');
  const live = grants.filter((g) => grantView(g, readAt) === 'live');
  const expiredOrEnded = grants.filter((g) => ['expired', 'ended'].includes(grantView(g, readAt)));
  const gaps = (cc?.owners ?? []).filter((o) => isGap(o.resolution));
  const reasonOk = reason.trim().length >= 8;
  const proposed = (cc?.matrices ?? []).filter((m) => m['state'] === 'proposed');
  const lastRec = (cc?.reconciliations ?? [])[0] ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Customer control center</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }} data-testid="context">
        Tenant <Mono>{tenantId || 'none'}</Mono> · domain{' '}
        {domains.length > 1 ? (
          <select aria-label="domain" style={inputStyle} value={domainId} onChange={(e) => { setDomainId(e.target.value); setSelected(''); }}>{domains.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        ) : <Mono>{domainId || 'none'}</Mono>} · your roles {roles.join(', ') || 'none'} · profile {cc?.profile ?? 'local-dev'} · read {fmtInstant(cc?.read_at)}
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {cc === null ? <p>{domainId === '' ? 'No domain in this session.' : 'Loading the control center…'}</p> : (
        <>
          <Panel title="Status">
            <p data-testid="support-owner">Accountable owner of support access: <span style={isGap(cc.support_access_owner) ? gapStyle : undefined}>{ownerText(cc.support_access_owner)}</span>
              {cc.support_access_owner.state === 'resolved' ? <> — <Mono>{String(cc.support_access_owner.owner_principal_id ?? cc.support_access_owner.principals?.[0] ?? '')}</Mono></> : null}</p>
            <p data-testid="gaps">Responsibility gaps: {cc.approved === null ? <span style={gapStyle}>no approved responsibility matrix — no owner can be resolved</span>
              : gaps.length === 0 ? 'none' : <span style={gapStyle}>{gaps.map((g) => String(g['responsibility_key'])).join(', ')} — the dependent acts stop until filled</span>}</p>
            <p>Support access: <strong>{pending.length}</strong> awaiting your decision · <strong>{live.length}</strong> live · {expiredOrEnded.length} expired or ended · open items {cc.items.length}</p>
          </Panel>

          <Panel title="Support access awaiting a decision">
            {pending.length === 0 ? <p>No request awaits a decision.</p> : (
              <ScrollBox label="pending support grants"><table style={tableStyle}><thead><tr><Th>Case</Th><Th>Engineer</Th><Th>Purpose</Th><Th>Actions</Th><Th>Requested</Th><Th>Review</Th></tr></thead>
                <tbody>{pending.map((g) => (
                  <tr key={g.grant_id}><Td>{g.case_ref} ({g.severity})</Td><Td>{g.engineer_name ?? g.engineer_principal_id}</Td><Td>{g.purpose}</Td><Td>{g.action_scope.join(', ')}</Td><Td>{fmtInstant(g.requested_at)}</Td>
                    <Td><button type="button" onClick={() => setSelected(g.grant_id)} aria-pressed={selected === g.grant_id}>{selected === g.grant_id ? 'reviewing' : 'review'}</button></Td></tr>))}</tbody></table></ScrollBox>
            )}
            {selected !== '' && preview === null ? <p>Loading the preview…</p> : null}
            {preview !== null && preview.grant.grant_id === selected ? (
              <div style={proposalStyle} data-testid="grant-preview">
                <p><strong>REQUEST — not access until you approve.</strong> Digest you decide on: <Mono title={preview.grant.request_digest}>{preview.grant.request_digest}</Mono></p>
                <ul>{consequenceLines(preview.grant).map((l) => <li key={l}>{l}</li>)}</ul>
                <p>Sources: {(preview.grant.sources ?? []).map((s) => `${s.name} (${s.source_key})`).join(', ') || 'none'}</p>
                <p>Eligibility: {preview.eligibility.can_decide ? 'you may decide this request' : <span style={gapStyle}>you cannot approve — {preview.eligibility.reasons.join('; ')}</span>}</p>
                <label>Reason<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
                  <GovernedButton label="Approve support access" pendingLabel="approving" disabled={!preview.eligibility.can_decide || !reasonOk}
                    onRun={async () => after(await sa.decideGrant(tenantId, domainId, preview.grant.grant_id, { decision: 'approve', digest: preview.grant.request_digest, reason: reason.trim() }))} />
                  <GovernedButton label="Deny" pendingLabel="denying" variant="critical" disabled={!reasonOk}
                    onRun={async () => after(await sa.decideGrant(tenantId, domainId, preview.grant.grant_id, { decision: 'deny', digest: preview.grant.request_digest, reason: reason.trim() }))} />
                </div>
                {!reasonOk ? <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>A decision states its reason (8+ characters).</p> : null}
              </div>
            ) : null}
          </Panel>

          <Panel title="Live support access">
            {live.length === 0 ? <p>No support access is live.</p> : live.map((g: Grant) => (
              <div key={g.grant_id} style={inForceStyle} data-testid="live-grant">
                <p><strong>{grantStateText(g, readAt)}</strong> · {minutesLeft(g, readAt)} min left · {g.case_ref} · {g.engineer_name ?? g.engineer_principal_id} · {g.action_scope.join(', ')} · reads {g.reads_allowed ?? 0} allowed / {g.reads_refused ?? 0} refused</p>
                <label>Reason<input type="text" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>{' '}
                <GovernedButton label="Revoke now" pendingLabel="revoking" variant="critical" disabled={!reasonOk} onRun={async () => after(await sa.revokeGrant(tenantId, domainId, g.grant_id, reason.trim()))} />{' '}
                <GovernedButton label="Run a control drill (revoke and prove denial)" pendingLabel="drilling" variant="quiet" disabled={!reasonOk}
                  onRun={async () => after(await sa.runDrill(tenantId, domainId, { kind: 'revoke_live_grant', grantId: g.grant_id, reason: reason.trim() }))} />
              </div>
            ))}
          </Panel>

          <Panel title="Expired and ended support access">
            {expiredOrEnded.length === 0 ? <p>None.</p> : (
              <ScrollBox label="ended support grants"><table style={tableStyle}><thead><tr><Th>State</Th><Th>Case</Th><Th>Engineer</Th><Th>Window</Th><Th>Ended</Th></tr></thead>
                <tbody>{expiredOrEnded.map((g) => <tr key={g.grant_id}><Td>{grantStateText(g, readAt)}</Td><Td>{g.case_ref}</Td><Td>{g.engineer_name ?? g.engineer_principal_id}</Td>
                  <Td>{fmtInstant(g.starts_at)} → {fmtInstant(g.expires_at)}</Td><Td>{fmtInstant(g.ended_at)}</Td></tr>)}</tbody></table></ScrollBox>
            )}
          </Panel>

          <Panel title="Shared-responsibility matrix and accountable owners">
            {cc.approved === null ? <p style={gapStyle}>No approved matrix for {cc.profile}.</p> : (
              <div style={inForceStyle} data-testid="matrix-in-force">
                <p><strong>v{String(cc.approved['version'])} · {matrixStateText(cc.approved)}</strong> · digest <Mono title={String(cc.approved['digest'])}>{shortDigest(cc.approved['digest'])}</Mono> · signed by {String(cc.approved['decided_by_name'] ?? cc.approved['decided_by'])}</p>
                <ScrollBox label="accountable owners"><table style={tableStyle}><thead><tr><Th>Responsibility</Th><Th>Owner role</Th><Th>Owner</Th><Th>Operator</Th><Th>Customer authority</Th><Th>Escalation</Th></tr></thead>
                  <tbody>{cc.owners.map((o) => <tr key={String(o['responsibility_key'])}><Td>{String(o['responsibility_key'])} — {String(o['title'])}</Td><Td>{String(o['owner_role'])}</Td>
                    <Td><span style={isGap(o.resolution) ? gapStyle : undefined}>{ownerText(o.resolution)}</span></Td><Td>{String(o['operator_role'])}</Td><Td>{String(o['customer_authority'])}</Td><Td>{String(o['escalation_path'])}</Td></tr>)}</tbody></table></ScrollBox>
              </div>
            )}
            {proposed.map((m) => (
              <div key={`${String(m['matrix_id'])}-${String(m['version'])}`} style={proposalStyle} data-testid="matrix-proposal">
                <p><strong>v{String(m['version'])} · {matrixStateText(m)}</strong> · proposed by {String(m['proposed_by_name'] ?? m['proposed_by'])} · digest you decide on <Mono>{String(m['digest'])}</Mono> · {String(m['row_count'])} responsibilities</p>
                <label>Reason<input type="text" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>{' '}
                <GovernedButton label="Approve and sign" pendingLabel="signing" disabled={!reasonOk}
                  onRun={async () => after(await sa.decideMatrix(tenantId, domainId, String(m['matrix_id']), { version: Number(m['version']), decision: 'approve', digest: String(m['digest']), reason: reason.trim() }))} />{' '}
                <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={!reasonOk}
                  onRun={async () => after(await sa.decideMatrix(tenantId, domainId, String(m['matrix_id']), { version: Number(m['version']), decision: 'reject', digest: String(m['digest']), reason: reason.trim() }))} />
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Only a named onboarding authority — never its proposer, never an implementation lead — approves; the server re-checks.</p>
              </div>
            ))}
          </Panel>

          <Panel title="Reconciliation (desired vs observed)">
            {lastRec === null ? <p>Never reconciled.</p> : (
              <>
                <p>Last recorded {fmtInstant(lastRec['recorded_at'])} against matrix v{String(lastRec['matrix_version'] ?? '—')} · {String(lastRec['gaps'])} gap(s), {String(lastRec['drift'])} drift finding(s) · observed <Mono>{shortDigest(lastRec['observed_digest'])}</Mono></p>
                <ul>{((lastRec['findings'] ?? []) as Row[]).map((f, i) => <li key={i} style={f['class'] === 'gap' ? gapStyle : undefined}>{String(f['class']).toUpperCase()} · {String(f['kind'])}{f['key'] !== null ? ` (${String(f['key'])})` : ''} — {String(f['detail'])}</li>)}</ul>
              </>
            )}
            <GovernedButton label="Reconcile now" pendingLabel="reconciling" variant="quiet" onRun={async () => after(await sa.reconcile(tenantId, domainId))} />
          </Panel>

          <Panel title="Access log (every read under a grant, allowed or refused)">
            <ScrollBox label="access log"><table style={tableStyle}><thead><tr><Th>At</Th><Th>Who</Th><Th>Action</Th><Th>Object</Th><Th>Outcome</Th><Th>Grant</Th></tr></thead>
              <tbody>{cc.access_log.map((l) => <tr key={String(l['log_id'])}><Td>{fmtInstant(l['at'])}</Td><Td>{String(l['principal_name'] ?? l['principal_id'])}</Td><Td>{String(l['action'])}</Td>
                <Td>{String(l['object_kind'] ?? '')} <Mono>{String(l['object_id'] ?? '')}</Mono></Td><Td>{String(l['outcome']) === 'refused' ? <span style={gapStyle}>refused — {String((l['detail'] as Row)?.['why'] ?? ((l['detail'] as Row)?.['drill'] !== undefined ? 'drill probe' : ''))}</span> : 'allowed'}</Td>
                <Td><Mono>{String(l['grant_id'] ?? 'none')}</Mono></Td></tr>)}</tbody></table></ScrollBox>
          </Panel>

          <Panel title="Customer-control drills and joint exercises">
            <ul>{cc.drills.map((d) => <li key={String(d['drill_id'])}>{fmtInstant(d['run_at'])} · {String(d['kind'])} · <strong>{String(d['outcome']).toUpperCase()}</strong> · grant <Mono>{String(d['grant_id'])}</Mono> — {String(d['reason'])}</li>)}</ul>
            <ul>{cc.exercises.map((e) => <li key={String(e['exercise_id'])}>{dayText(e['held_on'])} · {String(e['title'])} · {String(e['outcome'])} · {String(e['claim'])}</li>)}</ul>
          </Panel>

          <Panel title="Admission record (production admission itself is R1)">
            {cc.admissions.length === 0 ? <p>No admission record.</p> : cc.admissions.map((a) => (
              <div key={`${String(a['admission_id'])}-${String(a['version'])}`} style={a['state'] === 'signed' ? inForceStyle : proposalStyle} data-testid="admission">
                <p><strong>v{String(a['version'])} · {String(a['state']).toUpperCase()}</strong> · {String(a['deployment_profile'])} · period {dayText(a['period_from'])} → {dayText(a['period_to'])} · baseline <Mono>{shortDigest(a['baseline_digest'])}</Mono> · digest <Mono>{String(a['digest'])}</Mono></p>
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{String(a['production_admission'])}</p>
                {a['state'] === 'proposed' ? (<>
                  <label>Reason<input type="text" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (8+ characters)" /></label>{' '}
                  <GovernedButton label="Sign" pendingLabel="signing" disabled={!reasonOk}
                    onRun={async () => after(await sa.decideAdmission(tenantId, domainId, String(a['admission_id']), { version: Number(a['version']), decision: 'sign', digest: String(a['digest']), reason: reason.trim() }))} />
                </>) : null}
              </div>
            ))}
          </Panel>

          <Panel title="Exports, signing keys and residency (read-only here)">
            <p>Residency: tenant {String(cc.residency['tenant_residency'] ?? '—')} · domain {String(cc.residency['domain_residency'] ?? '—')} ({String(cc.residency['domain_status'] ?? '—')})</p>
            <p>Exports ({cc.links.exports.note}): {exportsList === null ? 'not readable with your roles' : `${exportsList.length} recent export action(s)`} — <Mono>{cc.links.exports.route}</Mono></p>
            <p>Signing keys ({cc.links.signing_keys.note}): {keys === null ? 'not readable with your roles' : keys.map((k) => String(k['key_id'] ?? k['key_ref'] ?? '')).join(', ') || 'none declared'}
              {cc.links.executive_signer !== null ? <> · executive signer <Mono>{String(cc.links.executive_signer.key_id ?? '')}</Mono></> : null}</p>
          </Panel>

          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{cc.boundary}</p>
        </>
      )}
    </>
  );
}
