'use client';
/**
 * THE PRODUCT-GOVERNANCE WORKSPACE — CP-6 B107 §PG (0115_b107_x_pg; CAP-AU-12, PR-72-001, PR-01-001). The vendor's (PLATFORM) home of product
 * governance. Status FIRST: the posture (every dimension conformant / non-conformant / UNKNOWN — never inferred), what is HELD and why (the
 * release candidates an expired exception or a conflict holds, at the last conformant candidate), then what awaits a decision — with the
 * approval's eligibility, the exact digest and the consequence preview —, the product baseline and its inventory (owners, boundaries,
 * orphans, duplicates, lapses), the decision rights, THE ONE exception registry with its ageing and repeat reviews (beside the READ-ONLY
 * engineering and supply-chain registers: an expired EXCEPTIONS.md entry is REPORTED, never governed here), the conflicts, the change
 * proposals with their impact, the governance records, the ledger.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words; a proposal is never styled like an approval; an
 * unsafe act is disabled with its reason. On a demonstration every persona and record is SYNTHETIC; a signed baseline is construction
 * evidence — the real executive attestation and the independent release authorities are H3.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { GovernedButton, Mono, ScrollBox, fmtInstant } from '../../../components/observation';
import { bucketLine, dayText, decisionsOf, dimensionText, engineeringLine, exceptionStateText, holdText, latestOnly, pg, rightsRowText, shortDigest, standingText, supplyChainLine,
  toneOf, versionStateText, type DecisionKind, type Preview, type Receipt as Rcpt, type Row, type Tone, type Workspace } from '../../../lib/governance-pg-b107';

type Err = { code: string; message: string; correlationId: string } | null;
const TONE: Record<Tone, CSSProperties> = {
  proposal: { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' },
  in_force: { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' },
  held: { borderInlineStart: '4px solid var(--eye-color-critical)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)', color: 'var(--eye-color-critical)' },
  ended: { color: 'var(--eye-color-ink-muted)', marginBlock: 'var(--eye-space-4)' },
};
const critical = { color: 'var(--eye-color-critical)', fontWeight: 600 };
type Pending = { key: string; kind: DecisionKind; id: string; version: number; title: string; state: string };

export default function GovernanceWorkspacePage() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [selected, setSelected] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const guard = useRef(latestOnly());

  const load = useCallback(async () => {
    const r = await pg.read();
    if (r.ok && r.data !== undefined) setWs(r.data); else setError(r.error ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // the approval's preview, loaded by selection — only the newest answer is applied
  useEffect(() => {
    if (selected === null) { setPreview(null); return; }
    const n = guard.current.next();
    setPreview(null);
    void pg.preview(selected.kind, selected.id, selected.version).then((r) => {
      if (!guard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null);
    });
  }, [selected]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); setSelected(null); setError(null); await load(); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const reasonOk = reason.trim().length >= 8;

  const pending: Pending[] = ws === null ? [] : [
    ...ws.baselines.filter((b) => b['state'] === 'proposed').map((b) => ({ kind: 'baseline' as const, id: String(b['baseline_id']), version: Number(b['version']), title: `${String(b['ref'])} — ${String(b['title'])}`, state: versionStateText('baseline', b) })),
    ...ws.rights.filter((b) => b['state'] === 'proposed').map((b) => ({ kind: 'rights' as const, id: String(b['matrix_id']), version: Number(b['version']), title: `${String(b['ref'])} — decision-rights matrix`, state: versionStateText('rights', b) })),
    ...ws.exceptions.filter((e) => e['state'] === 'proposed').map((e) => ({ kind: 'exception' as const, id: String(e['exception_id']), version: Number(e['version']), title: `${String(e['ref'])} v${String(e['version'])}${e['renewal_of'] !== null ? ' (renewal)' : ''} — ${String(e['title'])}`, state: exceptionStateText(e) })),
    ...ws.changes.filter((c) => c['state'] === 'proposed').map((c) => ({ kind: 'change' as const, id: String(c['proposal_id']), version: Number(c['version']), title: `${String(c['ref'])} v${String(c['version'])} — ${String(c['title'])}`, state: versionStateText('change', c) })),
    ...ws.records.filter((r) => r['state'] === 'proposed').map((r) => ({ kind: 'record' as const, id: String(r['record_id']), version: Number(r['version']), title: `${String(r['ref'])} v${String(r['version'])} — ${String(r['title'])}`, state: versionStateText('record', r) })),
    ...ws.conflicts.filter((c) => c['state'] === 'open').map((c) => ({ kind: 'conflict' as const, id: String(c['conflict_id']), version: 1, title: `${String(c['ref'])} — ${String(c['title'])}`, state: 'OPEN — the affected releases are HELD' })),
  ].map((p) => ({ ...p, key: `${p.kind}:${p.id}:${p.version}` }));
  const openHolds = ws?.holds.filter((h) => h.lifted_at === null) ?? [];
  const liftedHolds = ws?.holds.filter((h) => h.lifted_at !== null).slice(0, 20) ?? [];
  const signed = ws?.baselines.find((b) => b['state'] === 'signed') ?? null;
  const rightsInForce = ws?.rights.find((r) => r['state'] === 'approved') ?? null;
  const conflictOf = (id: string) => ws?.conflicts.find((c) => c['conflict_id'] === id) ?? null;

  async function decide(kind: DecisionKind, decision: string) {
    if (selected === null || preview === null) return;
    if (kind === 'conflict') {
      const c = conflictOf(selected.id);
      await after(await pg.resolveConflict(selected.id, { mode: 'closure', prevailing: String(c?.['highest_authority'] ?? ''), rationale: reason.trim(), digest: preview.digest }));
      return;
    }
    await after(await pg.decide(kind, selected.id, { version: selected.version, decision, digest: preview.digest, reason: reason.trim() }));
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Product governance</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }} data-testid="context">
        PLATFORM · the vendor&apos;s product registries · your roles {ws?.caller.roles.join(', ') || 'none'}{ws !== null && !ws.caller.human ? ' (an agent: prepares, never approves)' : ''} · read {fmtInstant(ws?.read_at)}
        {' '}· signer {ws === null ? '—' : ws.signer.bound ? <Mono>{String(ws.signer.key_id ?? '')}</Mono> : <span style={critical}>NOT BOUND — every signed approval is refused</span>}
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {ws === null ? <p>Loading the workspace…</p> : (
        <>
          <Panel title="Posture (declared vs observed)">
            <ul data-testid="posture">{Object.entries(ws.posture.dimensions).map(([k, d]) => (
              <li key={k} style={d.state === 'non_conformant' ? critical : d.state === 'unknown' ? { color: 'var(--eye-color-ink-muted)' } : undefined}>{dimensionText(k, d)}</li>))}</ul>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{ws.posture.rule}</p>
            <GovernedButton label="Record a posture snapshot" pendingLabel="recording" variant="quiet" disabled={!ws.caller.roles.includes('conformance_steward')} onRun={async () => after(await pg.recordPosture())} />
            {!ws.caller.roles.includes('conformance_steward') ? <span style={{ fontSize: 'var(--eye-type-label-sm)' }}> the conformance steward records snapshots</span> : null}
          </Panel>

          <Panel title="Held — what cannot be promoted, and why">
            {openHolds.length === 0 ? <p>Nothing is held.</p> : openHolds.map((h) => <p key={h.hold_id} style={TONE.held} data-testid="hold">{holdText(h)} · since {fmtInstant(h.opened_at)} — {h.reason}</p>)}
            <ScrollBox label="release candidates"><table style={tableStyle}><thead><tr><Th>Release candidate (not a release — B65 substituted)</Th><Th>Standing</Th></tr></thead>
              <tbody>{ws.release_candidates.map((rc) => <tr key={String(rc['artifact_id'])}><Td>{String(rc['external_key'])} — {String(rc['title'])}</Td>
                <Td>{((rc['open_holds'] ?? []) as Row[]).length === 0 ? 'no open hold (the server decides conformance — §CM)' : <span style={critical}>HELD: {((rc['open_holds'] ?? []) as Row[]).map((x) => String(x['reason_kind'])).join(', ')}</span>}</Td></tr>)}</tbody></table></ScrollBox>
            {liftedHolds.length > 0 ? <details><summary>Lifted holds ({liftedHolds.length})</summary>{liftedHolds.map((h) => <p key={h.hold_id} style={TONE.ended}>{holdText(h)} · {fmtInstant(h.lifted_at)}</p>)}</details> : null}
            <GovernedButton label="Sweep expired exceptions" pendingLabel="sweeping" variant="quiet" disabled={!ws.caller.roles.includes('conformance_steward')} onRun={async () => after(await pg.sweep())} />
          </Panel>

          <Panel title="Awaiting a decision">
            {pending.length === 0 ? <p>Nothing awaits a decision.</p> : (
              <ScrollBox label="awaiting a decision"><table style={tableStyle}><thead><tr><Th>Kind</Th><Th>Subject</Th><Th>Standing</Th><Th>Review</Th></tr></thead>
                <tbody>{pending.map((p) => <tr key={p.key}><Td>{p.kind}</Td><Td>{p.title}</Td><Td>{p.state}</Td>
                  <Td><button type="button" onClick={() => { setSelected(p); setReason(''); }} aria-pressed={selected?.key === p.key}>{selected?.key === p.key ? 'reviewing' : 'review'}</button></Td></tr>)}</tbody></table></ScrollBox>
            )}
            {selected !== null && preview === null ? <p>Loading the preview…</p> : null}
            {selected !== null && preview !== null ? (
              <div style={TONE.proposal} data-testid="decision-preview">
                <p><strong>{selected.kind.toUpperCase()} — nothing changes until you decide.</strong> Digest you decide on: <Mono title={preview.digest}>{preview.digest}</Mono>
                  {preview.signature_kind !== null ? <> · your decision is SIGNED ({preview.signature_kind})</> : null}</p>
                <p>Consequence: {preview.consequence}</p>
                {preview.awaiting !== undefined ? <p>Awaiting: {preview.awaiting.join(', ') || 'none'}</p> : null}
                <p>Eligibility: {preview.eligibility.can_decide ? 'you may decide this' : <span style={critical}>you cannot decide — {preview.eligibility.reasons.join('; ')}</span>}</p>
                <label>{selected.kind === 'conflict' ? 'Rationale (20+ characters)' : 'Reason (8+ characters)'}<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
                  {decisionsOf(selected.kind).map((d) => (
                    <GovernedButton key={d.decision} label={d.label} pendingLabel="deciding" variant={d.critical ? 'critical' : undefined}
                      disabled={(!d.critical && !preview.eligibility.can_decide) || !reasonOk || (selected.kind === 'conflict' && reason.trim().length < 20)}
                      onRun={async () => decide(selected.kind, d.decision)} />))}
                </div>
                {!reasonOk ? <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>A decision states its reason.</p> : null}
                {selected.kind === 'conflict' ? <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Here the closure keeps the highest authority; an amendment (another artifact prevails) names an approved change proposal through the API.</p> : null}
              </div>
            ) : null}
          </Panel>

          <Panel title="The product baseline">
            {signed === null ? <p style={critical}>No signed product baseline — the baseline is UNKNOWN, never assumed.</p> : (
              <div style={TONE.in_force} data-testid="baseline-signed">
                <p><strong>{String(signed['ref'])} v{String(signed['version'])} · {versionStateText('baseline', signed)}</strong> · signed by {String(signed['decided_by_name'] ?? signed['decided_by'])} {fmtInstant(signed['decided_at'])} · digest <Mono title={String(signed['digest'])}>{shortDigest(signed['digest'])}</Mono></p>
                <p>Bound to: {Object.entries((signed['scope_tuple'] ?? {}) as Row).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('/') : String(v)}`).join(' · ')}</p>
              </div>
            )}
            {ws.baselines.filter((b) => b['state'] === 'proposed').map((b) => (
              <p key={`${String(b['baseline_id'])}-${String(b['version'])}`} style={TONE.proposal}>{String(b['ref'])} v{String(b['version'])} · {versionStateText('baseline', b)} · proposed by {String(b['proposed_by_name'] ?? b['proposed_by'])}</p>))}
            <p data-testid="inventory">Inventory: {ws.inventory.count} capabilities · {ws.inventory.domains.map((d) => `${String(d['domain_boundary'])} (${String(d['capabilities'])})`).join(' · ') || 'no domain boundary'}
              {ws.inventory.orphans.length > 0 ? <span style={critical}> · ORPHANS {ws.inventory.orphans.join(', ')}</span> : null}
              {ws.inventory.lapsed.length > 0 ? <span style={critical}> · LAPSED OWNERS {ws.inventory.lapsed.join(', ')}</span> : null}
              {ws.inventory.duplicates.length > 0 ? <span style={critical}> · DUPLICATE IDENTITIES {ws.inventory.duplicates.map((d) => (d['keys'] as string[]).join(' = ')).join('; ')}</span> : null}</p>
            <ScrollBox label="capability inventory"><table style={tableStyle}><thead><tr><Th>Capability</Th><Th>Domain boundary</Th><Th>Accountable owner</Th><Th>Authority</Th></tr></thead>
              <tbody>{ws.inventory.capabilities.map((c) => <tr key={String(c['capability_id'])}><Td>{String(c['key'])} — {String(c['title'])}</Td><Td>{String(c['domain_boundary'] ?? '—')}</Td>
                <Td><span style={c['standing'] !== 'owned' ? critical : undefined}>{standingText(c)}</span></Td><Td>{String(c['authority_class'] ?? '—')} · {String(c['controlling_volume'] ?? '—')}</Td></tr>)}</tbody></table></ScrollBox>
          </Panel>

          <Panel title="Decision rights (propose · review · approve · operate · audit)">
            {rightsInForce === null ? <p>No approved decision-rights matrix — each act falls back to its own role rule (stated, not hidden).</p> : (
              <div style={TONE.in_force}><p><strong>{String(rightsInForce['ref'])} v{String(rightsInForce['version'])} · {versionStateText('rights', rightsInForce)}</strong> · approved by {String(rightsInForce['decided_by_name'] ?? '')}</p>
                <ul>{((rightsInForce['rows'] ?? []) as Row[]).map((r, i) => <li key={i}>{rightsRowText(r)}</li>)}</ul></div>
            )}
          </Panel>

          <Panel title="Exceptions — the one product registry">
            <p>Ageing: in force {String(ws.ageing.totals['in_force'])} · expired {String(ws.ageing.totals['expired'])} · proposed {String(ws.ageing.totals['proposed'])} · closed {String(ws.ageing.totals['closed'])} · expiring within 14 days {String(ws.ageing.totals['expiring_14d'])} · renewals {String(ws.ageing.totals['renewals'])} · {bucketLine(ws.ageing.buckets)}</p>
            {ws.exceptions.map((e) => (
              <div key={`${String(e['exception_id'])}-${String(e['version'])}`} style={TONE[toneOf(String(e['effective_state']))]} data-testid="exception">
                <p><strong>{String(e['ref'])} v{String(e['version'])}</strong> · {exceptionStateText(e)}</p>
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{String(e['title'])} · against {String(e['requirement_ref'])} (contract {String(e['contract_key'])}) · owner {String(e['owner_name'] ?? e['owner_principal_id'])} · risk {String((e['risk'] as Row)?.['level'] ?? '')}
                  {' '}· controls {((e['compensating_controls'] ?? []) as string[]).length} · exit: {String(e['exit_criteria'])}</p>
              </div>))}
            {ws.reviews.length > 0 ? <ul>{ws.reviews.map((r) => <li key={String(r['review_id'])} style={r['state'] === 'open' ? critical : undefined}>{String(r['ref'])} · repeated exceptions against {String(r['contract_key'])} · {String(r['state']).toUpperCase()}
              {r['state'] === 'open' ? ' — every approval on the contract is HELD until the product authority decides remediation or a formal change review' : ` by ${String(r['decided_by_name'] ?? '')}`}</li>)}</ul> : null}
            <h3>Engineering exceptions — EXCEPTIONS.md (read only)</h3>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{ws.repository_registers.engineering.note}{ws.repository_registers.engineering.available ? <> · digest <Mono>{shortDigest(ws.repository_registers.engineering.digest)}</Mono> · read on {dayText(ws.repository_registers.read_on)}</> : null}</p>
            <ul data-testid="engineering-register">{ws.repository_registers.engineering.entries.map((e) => <li key={String(e['id'])} style={e['expired'] === true ? critical : undefined}>{engineeringLine(e)}</li>)}</ul>
            <h3>Supply-chain dispositions — C15 SCX (read only)</h3>
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{ws.repository_registers.supply_chain.note}</p>
            <ul data-testid="supply-chain-register">{ws.repository_registers.supply_chain.entries.map((d) => <li key={String(d['id'])}>{supplyChainLine(d)}</li>)}</ul>
          </Panel>

          <Panel title="Conformance conflicts">
            {ws.conflicts.length === 0 ? <p>No conflict raised.</p> : ws.conflicts.map((c) => (
              <div key={String(c['conflict_id'])} style={c['state'] === 'open' ? TONE.held : TONE.ended} data-testid="conflict">
                <p><strong>{String(c['ref'])} · {String(c['state']).toUpperCase()}</strong> · {String(c['title'])} · highest authority {String(((c['ranking'] ?? []) as Row[])[0]?.['key'] ?? '—')}
                  {c['state'] === 'open' ? <> · releases held {((c['affected_releases'] ?? []) as string[]).length} · last conformant candidate {String(c['last_conformant_key'] ?? 'none recorded')}</> : <> · resolved by {String(c['resolved_by_name'] ?? '')} ({String((c['resolution'] as Row)?.['mode'] ?? '')}) — the trace closed</>}</p>
              </div>))}
          </Panel>

          <Panel title="Change proposals">
            {ws.changes.length === 0 ? <p>No change proposed.</p> : ws.changes.map((c) => (
              <div key={`${String(c['proposal_id'])}-${String(c['version'])}`} style={TONE[toneOf(String(c['state']))]}>
                <p><strong>{String(c['ref'])} v{String(c['version'])}</strong> · {versionStateText('change', c)} · {String(c['change_class'])} · impact {String((c['impact'] as Row)?.['count'] ?? 0)} dependents <Mono>{shortDigest(c['impact_digest'])}</Mono>
                  {c['cross_volume'] === true ? ' · CROSS-VOLUME (the authority chain)' : ''} · {((c['approvals'] ?? []) as Row[]).map((a) => `${String(a['role'])} ${String(a['decision'])}d`).join(', ')}</p>
              </div>))}
          </Panel>

          <Panel title="Governance records (decisions, standards, debt, deprecations)">
            <ScrollBox label="governance records"><table style={tableStyle}><thead><tr><Th>Record</Th><Th>Kind</Th><Th>Standing</Th><Th>Owner · approving authority</Th></tr></thead>
              <tbody>{ws.records.map((r) => <tr key={`${String(r['record_id'])}-${String(r['version'])}`}><Td>{String(r['ref'])} v{String(r['version'])} — {String(r['title'])}</Td><Td>{String(r['kind'])}</Td>
                <Td><span style={r['review_overdue'] === true ? critical : undefined}>{versionStateText('record', r)}</span></Td><Td>{String(r['owner_name'] ?? '')} · {String(r['approving_role'])}</Td></tr>)}</tbody></table></ScrollBox>
          </Panel>

          <Panel title="Ledger (latest)">
            <ScrollBox label="governance ledger"><table style={tableStyle}><thead><tr><Th>At</Th><Th>Event</Th><Th>Subject</Th><Th>By</Th></tr></thead>
              <tbody>{ws.ledger.slice(0, 50).map((l) => <tr key={String(l['event_id'])}><Td>{fmtInstant(l['occurred_at'])}</Td><Td>{String(l['event'])}</Td><Td>{String(l['subject_kind'])} <Mono>{String(l['subject_id'])}</Mono> v{String(l['version'] ?? '—')}</Td>
                <Td>{String(l['actor_name'] ?? l['actor_principal_id'])}</Td></tr>)}</tbody></table></ScrollBox>
          </Panel>

          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{ws.boundary}</p>
        </>
      )}
    </>
  );
}
