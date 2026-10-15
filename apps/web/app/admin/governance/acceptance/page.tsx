'use client';
/**
 * ACCEPTANCE RECORDS — CP-6 B107 §AR (0115_b107_x_ar; F-R0-04, ES-71-*, IA/DP-71-*, PAT-48, OBJ-40, JRN-24, FEX-31). Status FIRST: for each
 * subject, its standing in THIS domain (accepted / CONSTRAINED to the unaffected scope / suspended / lapsed / not accepted — never inferred),
 * whether expansion is held; then the records (a PROPOSAL is never styled like an acceptance), OBJ-40's attestation (the exact version and
 * digest, the caller's eligibility per obligation in the server's words, the consequence preview, a deliberate digest confirmation, the
 * receipt), the evidence vault with each item's age and validity, the review triggers and expansion holds, the attestation tasks and
 * attention, the vendor's enforce_acceptance register, the ledger.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words. Every record is claim = demonstration; on a
 * demonstration the attesters are SYNTHETIC personas; real acceptance by named independent and customer authorities is R2.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../../lib/api';
import { ar, confirmsDigest, dayText, evidenceText, inForce, latestOnly, latestVersions, list, scopeText, shortDigest, stateText, tone, unmet,
  type Preview, type Receipt as Rcpt, type RecordVersion, type Workspace } from '../../../../lib/governance-ar-b107';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, ScrollBox, fmtInstant } from '../../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
const proposalStyle = { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' };
const inForceStyle = { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const restrictedStyle = { borderInlineStart: '4px solid var(--eye-color-critical)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const warnStyle = { color: 'var(--eye-color-critical)', fontWeight: 600 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const styleOf = (state: string) => { const t = tone(state); return t === 'in_force' ? inForceStyle : t === 'restricted' ? restrictedStyle : t === 'proposal' ? proposalStyle : undefined; };

export default function AcceptancePage() {
  const session = getSession();
  const sessionDomains = useMemo(() => [...new Set([session?.scope?.domainId ?? null, ...(session?.bindings ?? []).map((b) => b.domainId)].filter((x): x is string => typeof x === 'string'))], [session]);
  const roles = (session?.bindings ?? []).map((b) => `${b.roleCode}@${b.scope}`);
  const [tenantId, setTenantId] = useState<string>(session?.scope?.tenantId ?? (session?.bindings ?? []).find((b) => b.tenantId !== null)?.tenantId ?? '');
  const [domainId, setDomainId] = useState<string>(sessionDomains[0] ?? '');
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [selected, setSelected] = useState<{ id: string; version: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const guard = useRef(latestOnly());
  const ready = UUID.test(tenantId) && UUID.test(domainId);

  const load = useCallback(async () => {
    if (!ready) return;
    setError(null);
    const n = guard.current.next();
    const r = await ar.workspace(tenantId, domainId);
    if (!guard.current.isLatest(n)) return;
    if (r.ok && r.data !== undefined) setWs(r.data); else { setWs(null); setError(r.error ?? null); }
  }, [tenantId, domainId, ready]);
  useEffect(() => { void load(); }, [load]);

  // OBJ-40's preview, loaded by selection — only the newest answer is applied (a stale response never shows another version's digest)
  const pguard = useRef(latestOnly());
  useEffect(() => {
    if (selected === null || !ready) { setPreview(null); return; }
    const n = pguard.current.next();
    setPreview(null); setTyped(''); setReason('');
    void ar.preview(tenantId, domainId, selected.id, selected.version).then((r) => {
      if (!pguard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null);
    });
  }, [selected, tenantId, domainId, ready]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); setTyped(''); const s = selected; setSelected(null); await load(); if (s !== null) setSelected(s); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const readAt = ws?.read_at ?? new Date().toISOString();
  const latest = latestVersions(ws?.records ?? []);
  const reasonOk = reason.trim().length >= 8;
  const digestOk = preview !== null && confirmsDigest(typed, preview.record.digest);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Acceptance records</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }} data-testid="context">
        Scope-specific acceptance: an acceptance names its exact tenant, domain, journeys, roles, versions, configuration, consequence class and period —
        nothing outside it is accepted. Your roles {roles.join(', ') || 'none'} · read {fmtInstant(ws?.read_at)}
      </p>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlock: 'var(--eye-space-8)' }}>
        <label>Tenant <input aria-label="tenant" style={{ ...inputStyle, minInlineSize: '20rem' }} value={tenantId} onChange={(e) => { setTenantId(e.target.value.trim()); setSelected(null); }} /></label>
        <label>Domain {sessionDomains.length > 1 ? (
          <select aria-label="domain" style={inputStyle} value={domainId} onChange={(e) => { setDomainId(e.target.value); setSelected(null); }}>{sessionDomains.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        ) : <input aria-label="domain" style={{ ...inputStyle, minInlineSize: '20rem' }} value={domainId} onChange={(e) => { setDomainId(e.target.value.trim()); setSelected(null); }} />}</label>
      </div>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {!ready ? <p>Name the tenant and the domain whose acceptance you are reading (ids).</p> : ws === null ? <p>Loading the acceptance records…</p> : (
        <>
          <Panel title="Status in this domain">
            {ws.scopes.length === 0 ? <p>No capability, release or design subject has an acceptance record in this domain — nothing here is accepted.</p> : (
              <ul data-testid="scopes">{ws.scopes.map((s) => (
                <li key={s.subject} style={tone(s.state) === 'restricted' || tone(s.state) === 'none' ? warnStyle : undefined}>
                  <strong>{s.subject}</strong>: {scopeText(s)}
                  {s.state === 'constrained' && s.removed !== null ? <> — removed: journeys {list((s.removed as Row)['journeys'])}, roles {list((s.removed as Row)['roles'])}, data {list((s.removed as Row)['data'])}</> : null}
                  {s.enforcement !== null && (s.enforcement as Row)['enforced'] === true ? <> · requests gated (enforce_acceptance: {list((s.enforcement as Row)['prefixes'])})</> : null}
                </li>))}</ul>
            )}
            <p>Open attention: {ws.items.length} · attestations awaited: {ws.tasks.length} · open expansion holds: {ws.holds.filter((h) => h['lifted_at'] === null).length}</p>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{ws.boundary}</p>
          </Panel>

          <Panel title="Records">
            {latest.length === 0 ? <p>No acceptance record in this domain.</p> : latest.map((r) => {
              const live = inForce(ws.records, r.record_id);
              return (
                <div key={r.record_id} style={styleOf(r.state)} data-testid="record">
                  <p><strong>{r.title}</strong> · {r.kind} · <Mono>{r.subject_key}</Mono> · v{r.version}: {stateText(r)}</p>
                  {live !== null && live.version !== r.version ? <p style={styleOf(live.state)}>In force meanwhile: v{live.version} — {stateText(live)}</p> : null}
                  <p>Scope: journeys {list(r.scope_tuple['journeys'])} · roles {list(r.scope_tuple['roles'])} · profile {String(r.scope_tuple['deployment_profile'])} · class ≤ {String(r.scope_tuple['consequence_class'])} · period {dayText((r.scope_tuple['period'] as Row)?.['from'])} → {dayText((r.scope_tuple['period'] as Row)?.['to'])}</p>
                  <p>Obligations: {r.obligations.map((o) => `${o}${unmet(r).includes(o) ? ' (awaited)' : ' ✓'}`).join(', ')} · proposed by {r.proposed_by_name ?? r.proposed_by} · digest <Mono title={r.digest}>{shortDigest(r.digest)}</Mono></p>
                  {r.constrained_reasons.length > 0 ? <p style={warnStyle}>Why: {r.constrained_reasons.map((x) => `${String(x['kind'])}${x['evidence_kind'] ? ` (${String(x['evidence_kind'])})` : ''}`).join('; ')}</p> : null}
                  <p>Journey (JRN-24): {(((ws.journeys[`${r.record_id}:${r.version}`] ?? {}) as Row)['stages'] as Row[] | undefined ?? []).map((s) => `${String(s['stage']).replace('_', ' ')} ${s['done'] === true ? '✓' : '○'}`).join(' → ')}</p>
                  <button type="button" onClick={() => setSelected({ id: r.record_id, version: r.version })} aria-pressed={selected?.id === r.record_id && selected.version === r.version}>
                    {r.state === 'proposed' ? 'review and attest' : 'open'}</button>
                </div>);
            })}
          </Panel>

          {selected !== null && preview === null ? <p>Loading the version…</p> : null}
          {preview !== null && selected !== null && preview.record.record_id === selected.id && preview.record.version === selected.version ? (
            <Panel title={`Version ${preview.record.version} of “${preview.record.title}”`}>
              <div style={preview.record.state === 'proposed' ? proposalStyle : styleOf(preview.record.state)} data-testid="preview">
                <p><strong>{stateText(preview.record)}</strong></p>
                <p>Exact digest: <Mono title={preview.record.digest}>{preview.record.digest}</Mono></p>
                <ul>{preview.consequence.map((l) => <li key={l}>{l}</li>)}</ul>
                {preview.findings.length > 0 ? <p style={warnStyle}>The sweep finds now: {preview.findings.map((f) => String(f['kind'])).join(', ')}</p> : null}
                <ScrollBox label="obligations"><table style={tableStyle}><thead><tr><Th>Obligation</Th><Th>Attested by</Th><Th>Your eligibility</Th></tr></thead>
                  <tbody>{preview.eligibility.obligations.map((o) => (
                    <tr key={o.obligation}><Td>{o.obligation} ({o.roles.join(' or ')})</Td>
                      <Td>{o.attested !== null ? `${String(o.attested['decision'])} — ${String(o.attested['name'] ?? o.attested['by'])} (${String(o.attested['role'])}) ${fmtInstant(o.attested['at'])}` : 'awaited'}</Td>
                      <Td>{o.can_attest ? 'you may attest this obligation' : <span style={warnStyle}>{o.reasons.join('; ')}</span>}</Td></tr>))}</tbody></table></ScrollBox>
                {preview.record.state === 'proposed' ? (
                  <>
                    <label>Reason / findings<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="what you read and why (8+ characters)" /></label>{' '}
                    <label>Confirm the digest (its first 8 characters)<input type="text" style={inputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={shortDigest(preview.record.digest).slice(0, 8)} /></label>
                    <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlock: 'var(--eye-space-8)' }}>
                      {preview.eligibility.can_verify ? (
                        <GovernedButton label="Verify as the customer" pendingLabel="verifying" disabled={!reasonOk || !digestOk}
                          onRun={async () => after(await ar.verify(tenantId, domainId, preview.record.record_id, { version: preview.record.version, digest: preview.record.digest, outcome: 'verified', findings: reason.trim() }))} />
                      ) : null}
                      {preview.eligibility.obligations.filter((o) => o.can_attest).map((o) => (
                        <span key={o.obligation} style={{ display: 'inline-flex', gap: 'var(--eye-space-4)' }}>
                          <GovernedButton label={`Attest ${o.obligation.replace('_', ' ')} (signed)`} pendingLabel="signing" disabled={!reasonOk || !digestOk}
                            onRun={async () => after(await ar.attest(tenantId, domainId, preview.record.record_id, { version: preview.record.version, obligation: o.obligation, decision: 'attest', digest: preview.record.digest, reason: reason.trim() }))} />
                          <GovernedButton label={`Withhold ${o.obligation.replace('_', ' ')}`} pendingLabel="withholding" variant="critical" disabled={!reasonOk || !digestOk}
                            onRun={async () => after(await ar.attest(tenantId, domainId, preview.record.record_id, { version: preview.record.version, obligation: o.obligation, decision: 'withhold', digest: preview.record.digest, reason: reason.trim() }))} />
                        </span>))}
                    </div>
                    {preview.eligibility.obligations.every((o) => !o.can_attest) && !preview.eligibility.can_verify ? <p>Nothing here is yours to attest — the reasons are listed per obligation.</p> : null}
                    {!reasonOk || !digestOk ? <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>An attestation states its reason (8+ characters) and confirms the exact digest it was shown.</p> : null}
                  </>
                ) : ['accepted', 'constrained', 'suspended', 'lapsed'].includes(preview.record.state) ? (
                  <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label>Reason<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why it is withdrawn (8+ characters)" /></label>
                    <GovernedButton label="Withdraw this acceptance" pendingLabel="withdrawing" variant="critical" disabled={!reasonOk}
                      onRun={async () => after(await ar.withdraw(tenantId, domainId, preview.record.record_id, reason.trim()))} />
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel title="Evidence vault">
            {ws.evidence.length === 0 ? <p>No evidence item in this domain.</p> : (
              <ScrollBox label="evidence"><table style={tableStyle}><thead><tr><Th>Kind</Th><Th>Title</Th><Th>References</Th><Th>Captured</Th><Th>Validity</Th><Th>Recorded by</Th></tr></thead>
                <tbody>{ws.evidence.map((e) => (
                  <tr key={String(e['evidence_id'])}><Td>{String(e['kind'])}</Td><Td>{String(e['title'])}</Td><Td><Mono title={String(e['subject_digest'])}>{String(e['subject_kind'])} {shortDigest(e['subject_digest'])}</Mono></Td>
                    <Td>{fmtInstant(e['captured_at'])}</Td>
                    <Td><span style={e['current'] === true ? undefined : warnStyle}>{evidenceText({ valid_until: String(e['valid_until']), outcome: String(e['outcome']), renewed_by: (e['renewed_by'] as string | null) ?? null }, readAt)}</span></Td>
                    <Td>{String(e['recorded_by_name'] ?? e['recorded_by'])}</Td></tr>))}</tbody></table></ScrollBox>
            )}
          </Panel>

          <Panel title="Review triggers and expansion holds">
            {ws.triggers.length === 0 ? <p>No review trigger.</p> : (
              <ul>{ws.triggers.map((t) => <li key={String(t['trigger_id'])}>{fmtInstant(t['raised_at'])} · {String(t['kind'])} → {String(t['policy'])} ({String(t['source'])}) · record <Mono>{String(t['record_id'])}</Mono> v{String(t['version'])}</li>)}</ul>
            )}
            {ws.holds.length === 0 ? <p>No expansion hold.</p> : (
              <ul>{ws.holds.map((h) => <li key={String(h['hold_id'])} style={h['lifted_at'] === null ? warnStyle : undefined}>{h['lifted_at'] === null ? 'OPEN' : `lifted ${fmtInstant(h['lifted_at'])} (${String(h['lift_reason'])})`} — {String(h['reason'])}</li>)}</ul>
            )}
            <GovernedButton label="Reconcile now" pendingLabel="reconciling" variant="quiet" onRun={async () => after(await ar.sweep(tenantId, domainId))} />
          </Panel>

          <Panel title="Attestations awaited and attention">
            {ws.tasks.length === 0 ? <p>No attestation awaited.</p> : <ul>{ws.tasks.map((t) => <li key={String(t['task_id'])}>{String(t['title'])} — candidate roles {list(t['candidate_roles'])}</li>)}</ul>}
            {ws.items.length === 0 ? <p>No open acceptance attention.</p> : <ul>{ws.items.map((i) => <li key={String(i['item_id'])} style={warnStyle}>{String(i['title'])} ({String(i['state'])})</li>)}</ul>}
          </Panel>

          <Panel title="Requests gated by acceptance (the vendor's register)">
            {ws.enforcement.length === 0 ? <p>No capability is marked enforce_acceptance: acceptance restricts expansion, never requests.</p> : (
              <ul>{ws.enforcement.map((e) => <li key={String(e['capability_key'])}>{String(e['capability_key'])} v{String(e['version'])}: {e['enforced'] === true ? `gated — ${list(e['action_prefixes'])}` : 'not gated'} · by {String(e['set_by_name'] ?? e['set_by'])} · {String(e['reason'])}</li>)}</ul>
            )}
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Never gated: reads, corrections, withdrawals, attention, warnings, the mandatory controls and every human gate.</p>
          </Panel>

          <Panel title="Ledger">
            <ScrollBox label="ledger"><table style={tableStyle}><thead><tr><Th>When</Th><Th>Event</Th><Th>Subject</Th><Th>By</Th></tr></thead>
              <tbody>{ws.ledger.map((e) => <tr key={String(e['event_id'])}><Td>{fmtInstant(e['occurred_at'])}</Td><Td>{String(e['event'])}</Td><Td><Mono>{String(e['subject_id'])}</Mono>{e['version'] !== null ? ` v${String(e['version'])}` : ''}</Td><Td>{String(e['actor_name'] ?? e['actor_principal_id'])}</Td></tr>)}</tbody></table></ScrollBox>
          </Panel>
        </>
      )}
    </>
  );
}
