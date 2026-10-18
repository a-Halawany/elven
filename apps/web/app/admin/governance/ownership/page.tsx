'use client';
/**
 * DATA GOVERNANCE AND OWNERSHIP — CP-6 B107 §DR (0115_b107_x_dr; F-P7D-25: V00-T-082, ES-04/-11, DP-01/-04/-55, DAT-GV-01..10, PER-19).
 * Status FIRST: the domain's governance mode, the ownership gaps that HOLD (new consumption and authoritative changes stop), the overdue
 * stewardship cases; then the data authorities (each resolved live; a proposal never styled like a ratification; the named owner's
 * acceptance and another human's ratification on the exact digest), the stewardship queue (the review preview: eligibility, the digest, the
 * consequence), the domain's registry entry, the responsibility portal (customer and platform duties, approvals, evidence), the data
 * product registry view. A PLATFORM session sees the vendor side: the data capability inventory, component ownership and its SIGNED
 * transfers, the PLATFORM gaps and the owned-contract lint.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words; unsafe actions are disabled with the reason. On a
 * demonstration every persona and record is SYNTHETIC; an attested evidence record is demonstration evidence — production admission is R1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../../lib/api';
import { authorityStateText, capabilityStateText, caseConsequenceLines, caseStateText, conditionsOf, dayText, daysAfter, dr, dutyText, gapText, isGapDuty, isLiveGap, latestOnly,
  resolutionText, shortDigest, transferConsequenceLines, type AssetRead, type CasePreview, type PlatformRead, type Portal, type Receipt as Rcpt, type TransferPreview } from '../../../../lib/governance-dr-b107';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, ScrollBox, fmtInstant } from '../../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
type Answer = { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } };
const proposalStyle = { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' };
const inForceStyle = { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const gapStyle = { color: 'var(--eye-color-critical)', fontWeight: 600 };
const small = { fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' };

/* ───────────────────────── the loop-stage header (B107's own pages; the general context bar stays B80's) ───────────────────────── */
function StageHeader({ stage }: { stage: string }) {
  return <p style={small}>Governance loop: register → resolve → <strong>{stage}</strong> → decide (a named human) → evidence → review</p>;
}

export default function OwnershipPage() {
  const session = getSession();
  const platform = session?.scope?.scope === 'PLATFORM';
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Data governance and ownership</h1>
      {platform ? <PlatformView /> : <DomainView />}
    </>
  );
}

/* ═════════════════════════ the customer's side (DOMAIN) ═════════════════════════ */
function DomainView() {
  const session = getSession();
  const domains = useMemo(() => [...new Set([session?.scope?.domainId ?? null, ...(session?.bindings ?? []).map((b) => b.domainId)].filter((x): x is string => typeof x === 'string'))], [session]);
  const tenantId = session?.scope?.tenantId ?? (session?.bindings ?? []).find((b) => b.tenantId !== null)?.tenantId ?? '';
  const [domainId, setDomainId] = useState<string>(domains[0] ?? '');
  const [p, setP] = useState<Portal | null>(null);
  const [products, setProducts] = useState<Row[] | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [asset, setAsset] = useState<string>(''); const [assetRead, setAssetRead] = useState<AssetRead | null>(null);
  const [caseId, setCaseId] = useState<string>(''); const [preview, setPreview] = useState<CasePreview | null>(null);
  const [reason, setReason] = useState(''); const [conditions, setConditions] = useState(''); const [expiresDays, setExpiresDays] = useState('30'); const [untilDays, setUntilDays] = useState('14');
  const assetGuard = useRef(latestOnly()); const caseGuard = useRef(latestOnly());

  const load = useCallback(async () => {
    if (tenantId === '' || domainId === '') return;
    setError(null);
    const r = await dr.portal(tenantId, domainId);
    if (r.ok && r.data !== undefined) setP(r.data); else setError(r.error ?? null);
    const pr = await dr.products(tenantId, domainId);
    setProducts(pr.ok && pr.data !== undefined ? pr.data.products : null);
  }, [tenantId, domainId]);
  useEffect(() => { void load(); }, [load]);
  // selections load their own reads — only the newest answer is applied (a stale response never shows another subject's digest)
  useEffect(() => {
    if (asset === '' || tenantId === '' || domainId === '') { setAssetRead(null); return; }
    const n = assetGuard.current.next(); setAssetRead(null);
    void dr.asset(tenantId, domainId, asset).then((r) => { if (!assetGuard.current.isLatest(n)) return; if (r.ok && r.data !== undefined) setAssetRead(r.data); else setError(r.error ?? null); });
  }, [asset, tenantId, domainId]);
  useEffect(() => {
    if (caseId === '' || tenantId === '' || domainId === '') { setPreview(null); return; }
    const n = caseGuard.current.next(); setPreview(null);
    void dr.casePreview(tenantId, domainId, caseId).then((r) => { if (!caseGuard.current.isLatest(n)) return; if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null); });
  }, [caseId, tenantId, domainId]);

  const after = async (r: Answer) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); await load(); const a = asset; setAsset(''); setTimeout(() => setAsset(a), 0); const c = caseId; setCaseId(''); setTimeout(() => setCaseId(c), 0); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const reasonOk = reason.trim().length >= 8;
  const readAt = p?.read_at ?? new Date().toISOString();
  const liveGaps = (p?.gaps ?? []).filter(isLiveGap);
  const heldGaps = liveGaps.filter((g) => g['held'] === true);
  const overdue = (p?.cases ?? []).filter((c) => caseStateText(c, readAt).startsWith('OVERDUE'));
  const dom = p?.portal.domain ?? {};
  const entry = (p?.domain_entries ?? []);
  const proposedEntry = entry.find((e) => e['state'] === 'proposed');
  const res = assetRead?.resolution ?? null;

  return (
    <>
      <StageHeader stage="resolve ownership" />
      {domains.length > 1 ? (
        <label>Domain <select style={inputStyle} value={domainId} onChange={(e) => { setDomainId(e.target.value); setAsset(''); setCaseId(''); }}>{domains.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
      ) : null}
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {p === null ? <p>Loading…</p> : (
        <>
          <Panel title="Status">
            <p>Domain {String(dom['name'] ?? domainId)} · governance mode <strong>{String(dom['governance_mode'] ?? '—')}</strong>{dom['governance_mode'] === 'enforced' ? ' (a missing authority HOLDS its asset)' : dom['governance_mode'] === 'observed' ? ' (a missing authority is listed, not held)' : ' (no ratified registry entry — the tick does not reconcile)'}</p>
            <p style={heldGaps.length > 0 ? gapStyle : undefined}>{heldGaps.length} ownership gap(s) HOLDING an asset · {liveGaps.length} open in all · {overdue.length} stewardship case(s) overdue</p>
            <GovernedButton label="Reconcile ownership now" pendingLabel="reconciling" variant="quiet" onRun={async () => after(await dr.reconcile(tenantId, domainId))} />
          </Panel>

          <Panel title="Ownership gaps (visible until resolved or accepted)">
            {(p.gaps ?? []).filter((g) => g['state'] !== 'resolved').length === 0 ? <p>No ownership gap.</p> : (
              <ScrollBox label="ownership gaps"><table style={tableStyle}><thead><tr><Th>Subject</Th><Th>Standing</Th><Th>Escalation path</Th><Th>Opened</Th><Th>Accept the residual</Th></tr></thead>
                <tbody>{(p.gaps ?? []).filter((g) => g['state'] !== 'resolved').map((g) => (
                  <tr key={String(g['gap_id'])}><Td>{String(g['subject_label'])}</Td><Td><span style={isLiveGap(g) ? gapStyle : undefined}>{gapText(g)}</span></Td><Td>{String(g['escalation_path'])}</Td><Td>{fmtInstant(g['opened_at'])}</Td>
                    <Td>{isLiveGap(g) ? <GovernedButton label={`Accept until ${dayText(daysAfter(readAt, Number(untilDays) || 0))}`} pendingLabel="accepting" variant="critical" disabled={!reasonOk || !(Number(untilDays) > 0 && Number(untilDays) <= 90)}
                      onRun={async () => after(await dr.acceptGap(tenantId, domainId, String(g['gap_id']), { until: daysAfter(readAt, Number(untilDays)), reason: reason.trim() }))} /> : '—'}</Td></tr>))}</tbody></table></ScrollBox>
            )}
            <label>Days (1–90)<input type="number" min={1} max={90} style={{ ...inputStyle, inlineSize: '6rem' }} value={untilDays} onChange={(e) => setUntilDays(e.target.value)} /></label>{' '}
            <label>Reason and compensating control<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why (12+ characters)" /></label>
            <p style={small}>Only the domain or tenant administrator — never the one who opened the gap, never the subject&apos;s owner — accepts a residual; the hold lifts, the gap stays listed until its date. The server re-checks.</p>
          </Panel>

          <Panel title="Data authorities (DAT-GV-01/-04): owner, steward, custodian, producer, consumers, policy and quality authorities">
            <ScrollBox label="data authorities"><table style={tableStyle}><thead><tr><Th>Asset</Th><Th>Standing</Th><Th>Owner</Th><Th>Steward</Th><Th>Recertification</Th><Th>Gaps</Th><Th>Open</Th></tr></thead>
              <tbody>{p.portal.customer_duties.data_authorities.map((a) => (
                <tr key={String(a['asset_id'])}><Td>{String(a['kind'])} · {String(a['title'])}</Td><Td><span style={a['state'] === 'undeclared' ? gapStyle : undefined}>{authorityStateText(a['state'], a['proposal_owner_accepted'] === true)}</span></Td>
                  <Td>{String(a['owner_name'] ?? a['owner'] ?? '—')}</Td><Td>{String(a['steward_name'] ?? a['steward'] ?? '—')}</Td><Td>{a['recertify_by'] === null || a['recertify_by'] === undefined ? '—' : `${String(a['recertification'])} · by ${dayText(a['recertify_by'])}`}</Td>
                  <Td>{String(a['gaps'] ?? 0)}</Td><Td><button type="button" aria-pressed={asset === a['asset_id']} onClick={() => setAsset(String(a['asset_id']))}>{asset === a['asset_id'] ? 'open' : 'resolve'}</button></Td></tr>))}</tbody></table></ScrollBox>
            {asset !== '' && assetRead === null ? <p>Resolving…</p> : null}
            {res !== null && res.authority_id === asset ? (
              <div data-testid="authority-resolution">
                <p><strong>{resolutionText(res)}</strong> · asset trusted {String(res.asset['trusted'])} · catalog owner agreement {String(res.catalog_agreement?.['state'] ?? '—')}</p>
                {res.ratified !== null ? (
                  <div style={inForceStyle}>
                    <p><strong>v{String(res.ratified['version'])} · {authorityStateText('ratified')}</strong> · ratified by {String(res.ratified['decided_by_name'] ?? res.ratified['decided_by'])} · digest <Mono title={String(res.ratified['digest'])}>{shortDigest(res.ratified['digest'])}</Mono></p>
                    <ScrollBox label="duties"><table style={tableStyle}><thead><tr><Th>Duty</Th><Th>Resolved live</Th></tr></thead>
                      <tbody>{['owner', 'steward', 'custodian', 'producer', 'consumer', 'policy_authority', 'quality_authority'].map((k) => (
                        <tr key={k}><Td>{k.replace(/_/g, ' ')}</Td><Td><span style={isGapDuty(res.duties[k]) ? gapStyle : undefined}>{dutyText(res.duties[k])}</span></Td></tr>))}</tbody></table></ScrollBox>
                    <p>Escalation: {String(res.escalation_path ?? '—')} · recertification {String(res.recertification?.['state'] ?? '—')} (by {dayText(res.recertification?.['recertify_by'])})</p>
                    <GovernedButton label="Recertify my ownership" pendingLabel="recertifying" variant="quiet" disabled={res.ratified['owner_principal_id'] !== session?.principalId}
                      onRun={async () => after(await dr.recertify(tenantId, domainId, asset))} />
                    {res.ratified['owner_principal_id'] !== session?.principalId ? <span style={small}> only the named owner recertifies</span> : null}
                  </div>
                ) : null}
                {res.proposal !== null ? (
                  <div style={proposalStyle} data-testid="authority-proposal">
                    <p><strong>v{String(res.proposal['version'])} · {authorityStateText('proposed', res.proposal['owner_accepted_at'] !== null)}</strong> · proposed by {String(res.proposal['proposed_by_name'] ?? res.proposal['proposed_by'])}</p>
                    <p>Names owner <strong>{String(res.proposal['owner_name'] ?? res.proposal['owner_principal_id'])}</strong>, steward {String(res.proposal['steward_name'] ?? res.proposal['steward_principal_id'])}, custodian role {String(res.proposal['custodian_role'])}, policy authority {String(res.proposal['policy_authority_role'])}, quality authority {String(res.proposal['quality_authority_role'])}.</p>
                    <p>Digest you act on: <Mono title={String(res.proposal['digest'])}>{String(res.proposal['digest'])}</Mono></p>
                    <ul><li>Accepting makes you the SINGULAR accountable owner of {String(res.asset['title'])} (only the named owner accepts).</li>
                      <li>Ratifying puts it in force and supersedes the prior version; never by its proposer or the owner it appoints.</li></ul>
                    <GovernedButton label="Accept ownership" pendingLabel="accepting" disabled={res.proposal['owner_principal_id'] !== session?.principalId || res.proposal['owner_accepted_at'] !== null}
                      onRun={async () => after(await dr.acceptAuthority(tenantId, domainId, asset, { version: Number(res.proposal?.['version']), digest: String(res.proposal?.['digest']) }))} />{' '}
                    <GovernedButton label="Ratify" pendingLabel="ratifying" disabled={!reasonOk || res.proposal['owner_accepted_at'] === null || res.proposal['proposed_by'] === session?.principalId || res.proposal['owner_principal_id'] === session?.principalId}
                      onRun={async () => after(await dr.decideAuthority(tenantId, domainId, asset, { version: Number(res.proposal?.['version']), digest: String(res.proposal?.['digest']), decision: 'ratify', reason: reason.trim() }))} />{' '}
                    <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={!reasonOk || res.proposal['proposed_by'] === session?.principalId}
                      onRun={async () => after(await dr.decideAuthority(tenantId, domainId, asset, { version: Number(res.proposal?.['version']), digest: String(res.proposal?.['digest']), decision: 'reject', reason: reason.trim() }))} />
                    {res.proposal['owner_accepted_at'] === null ? <p style={small}>Ratification waits for the named owner&apos;s acceptance.</p> : null}
                    {!reasonOk ? <p style={small}>A decision states its reason (8+ characters) — the reason field above.</p> : null}
                  </div>
                ) : null}
                {res.ratified === null && res.proposal === null ? <p style={gapStyle}>No authority is declared for this asset — a steward proposes one.</p> : null}
              </div>
            ) : null}
          </Panel>

          <Panel title="Stewardship cases (DAT-GV-07): the queue">
            {(p.cases ?? []).length === 0 ? <p>No case.</p> : (
              <ScrollBox label="stewardship cases"><table style={tableStyle}><thead><tr><Th>Case</Th><Th>Kind</Th><Th>Subject</Th><Th>Standing</Th><Th>Owner</Th><Th>Review</Th></tr></thead>
                <tbody>{(p.cases ?? []).map((c) => (
                  <tr key={String(c['case_id'])}><Td>{String(c['case_ref'])} · {String(c['consequence'])}</Td><Td>{String(c['kind']).replace(/_/g, ' ')}</Td><Td>{String(c['subject_label'])}</Td>
                    <Td><span style={caseStateText(c, readAt).startsWith('OVERDUE') || c['state'] === 'expired' ? gapStyle : undefined}>{caseStateText(c, readAt)}</span></Td>
                    <Td>{String(c['owner_name'] ?? (c['owner_principal_id'] === null ? 'NONE' : c['owner_principal_id']))}</Td>
                    <Td><button type="button" aria-pressed={caseId === c['case_id']} onClick={() => setCaseId(String(c['case_id']))}>{caseId === c['case_id'] ? 'reviewing' : 'review'}</button></Td></tr>))}</tbody></table></ScrollBox>
            )}
            {caseId !== '' && preview === null ? <p>Loading the preview…</p> : null}
            {preview !== null && preview.case['case_id'] === caseId ? (
              <div style={proposalStyle} data-testid="case-preview">
                <p><strong>{caseStateText(preview.case, preview.read_at)}</strong> · digest you decide on <Mono title={String(preview.case['digest'])}>{String(preview.case['digest'])}</Mono></p>
                <ul>{caseConsequenceLines(preview.case).map((l) => <li key={l}>{l}</li>)}</ul>
                <p>Evidence: {((preview.case['evidence'] ?? []) as Row[]).map((e) => `${String(e['kind'])}: ${String(e['ref'])}`).join(' · ')}</p>
                <p>Eligibility: {preview.eligibility.can_review && preview.eligibility.reasons.length === 0 ? 'you may review this case' : <span style={gapStyle}>{preview.eligibility.reasons.join('; ')}</span>}</p>
                <label>Grounds<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="8+ characters" /></label>
                <label style={{ display: 'block' }}>Conditions (one per line)<textarea style={{ ...inputStyle, inlineSize: '100%', blockSize: '4rem' }} value={conditions} onChange={(e) => setConditions(e.target.value)} /></label>
                <label>Expires in days{String(preview.case['kind']) === 'data_exception' ? ' (required)' : ' (optional)'}<input type="number" min={1} max={366} style={{ ...inputStyle, inlineSize: '6rem' }} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} /></label>
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
                  <GovernedButton label="Approve" pendingLabel="approving" disabled={!preview.eligibility.can_review || preview.eligibility.reasons.length > 0 || !reasonOk}
                    onRun={async () => after(await dr.reviewCase(tenantId, domainId, caseId, { digest: String(preview.case['digest']), outcome: 'approve', note: reason.trim(), conditions: conditionsOf(conditions),
                      expiresAt: Number(expiresDays) > 0 ? daysAfter(preview.read_at, Number(expiresDays)) : null }))} />
                  <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={!preview.eligibility.can_review || !reasonOk}
                    onRun={async () => after(await dr.reviewCase(tenantId, domainId, caseId, { digest: String(preview.case['digest']), outcome: 'reject', note: reason.trim(), conditions: null, expiresAt: null }))} />
                  <GovernedButton label="Close with this evidence" pendingLabel="closing" variant="quiet" disabled={!['approved', 'rejected', 'expired'].includes(String(preview.case['state'])) || !reasonOk}
                    onRun={async () => after(await dr.closeCase(tenantId, domainId, caseId, { note: reason.trim(), evidence: conditionsOf(conditions).map((ref) => ({ kind: 'note', ref })) }))} />
                </div>
                <p style={small}>Holds on the subject: {preview.holds.filter((h) => h['lifted_at'] === null).map((h) => String(h['reason_kind'])).join(', ') || 'none'}</p>
              </div>
            ) : null}
          </Panel>

          <Panel title="The domain's registry entry (DAT-GV-02)">
            {entry.filter((e) => e['state'] === 'ratified').map((e) => (
              <div key={String(e['version'])} style={inForceStyle}><p><strong>v{String(e['version'])} · RATIFIED</strong> · leader {String(e['leader_name'] ?? e['accountable_leader'])} · mode {String(e['governance_mode'])} · contract {String(((e['extension_contract'] ?? {}) as Row)['version'] ?? '')} ({((((e['extension_contract'] ?? {}) as Row)['extension_points'] ?? []) as string[]).join(', ')})</p><p>{String(e['boundary'])}</p></div>))}
            {proposedEntry !== undefined ? (
              <div style={proposalStyle} data-testid="domain-proposal">
                <p><strong>v{String(proposedEntry['version'])} · PROPOSED — not in force</strong> · leader {String(proposedEntry['leader_name'] ?? proposedEntry['accountable_leader'])} · mode {String(proposedEntry['governance_mode'])} · digest <Mono>{String(proposedEntry['digest'])}</Mono></p>
                <GovernedButton label="Ratify" pendingLabel="ratifying" disabled={!reasonOk || proposedEntry['proposed_by'] === session?.principalId || proposedEntry['accountable_leader'] === session?.principalId}
                  onRun={async () => after(await dr.decideDomain(tenantId, domainId, { version: Number(proposedEntry['version']), digest: String(proposedEntry['digest']), decision: 'ratify', reason: reason.trim() }))} />
                <p style={small}>The customer sponsor or the tenant administrator ratifies — never the proposer, never the leader it appoints.</p>
              </div>
            ) : null}
            {entry.length === 0 ? <p style={gapStyle}>No registry entry: the domain&apos;s leader and extension contract are undeclared.</p> : null}
          </Panel>

          <Panel title="Responsibility portal (DAT-GV-10): duties, approvals, evidence, escalation">
            <p>Customer matrix: {String(p.portal.customer_duties.matrix['state'])}{p.portal.customer_duties.matrix['version'] !== undefined ? ` v${String(p.portal.customer_duties.matrix['version'])}` : ''}</p>
            <ul>{p.portal.customer_duties.responsibilities.map((r) => <li key={String(r['key'])}>{String(r['key'])} — {String(r['title'])} · owner role {String(r['owner_role'])} · <span style={((r['resolution'] ?? {}) as Row)['state'] !== 'resolved' ? gapStyle : undefined}>{String(((r['resolution'] ?? {}) as Row)['state'])}</span> · escalation {String(r['escalation_path'])}</li>)}</ul>
            <p>Platform duties: {p.portal.platform_duties.components.length} owned component(s); {p.portal.platform_duties.operator_rule}</p>
            <ul>{p.portal.platform_duties.components.map((c) => <li key={String(c['component'])}>{String(c['component'])} · {String(c['owning_team'])} v{String(c['version'])} · contacts {String(c['primary_name'] ?? '—')} / {String(c['secondary_name'] ?? '—')} · operator {String(c['operator_role'])}</li>)}</ul>
            <p>Approvals (latest): {p.portal.approvals.slice(0, 8).map((a) => `${String(a['event'])} by ${String(a['actor_name'] ?? a['actor'])}`).join(' · ') || 'none'}</p>
            {(p.evidence ?? []).map((e) => (
              <div key={String(e['record_id'])} style={e['state'] === 'attested' ? inForceStyle : proposalStyle} data-testid="evidence-record">
                <p><strong>{String(e['state']).toUpperCase()}</strong> · {dayText(e['period_from'])} → {dayText(e['period_to'])} · claim {String(e['claim'])} · digest <Mono title={String(e['digest'])}>{shortDigest(e['digest'])}</Mono></p>
                <p style={small}>{String(e['production_admission'])}</p>
                {e['state'] === 'assembled' ? <GovernedButton label="Attest and sign" pendingLabel="signing" disabled={!reasonOk || e['assembled_by'] === session?.principalId}
                  onRun={async () => after(await dr.attest(tenantId, domainId, String(e['record_id']), { digest: String(e['digest']), decision: 'attest', reason: reason.trim() }))} /> : null}
              </div>))}
          </Panel>

          <Panel title="Data product registry view (DAT-GV-03)">
            {products === null ? <p>Not readable with your roles.</p> : (
              <ScrollBox label="data products"><table style={tableStyle}><thead><tr><Th>Product</Th><Th>State</Th><Th>Purpose</Th><Th>Consumers</Th><Th>Owner (authority)</Th><Th>Holds</Th></tr></thead>
                <tbody>{products.map((x) => { const g = (x['governance'] ?? {}) as Row; const a = (g['authority'] ?? null) as Row | null; const holds = ((g['holds'] ?? []) as Row[]);
                  return <tr key={String(x['product_id'])}><Td>{String(x['product_key'])} ({String(x['kind'])})</Td><Td><span style={x['state'] === 'degraded' ? gapStyle : undefined}>{String(x['state'])}{x['degraded_reason'] !== null && x['degraded_reason'] !== undefined ? ` — ${String(x['degraded_reason'])}` : ''}</span></Td>
                    <Td>{String(x['purpose'])}</Td><Td>{String(((x['consumers'] ?? {}) as Row)['accepted'] ?? 0)} accepted</Td><Td>{a === null ? <span style={gapStyle}>no ratified authority</span> : String(a['owner_name'] ?? a['owner'])}</Td>
                    <Td><span style={holds.length > 0 ? gapStyle : undefined}>{holds.map((h) => String(h['reason_kind'])).join(', ') || 'none'}</span></Td></tr>; })}</tbody></table></ScrollBox>
            )}
          </Panel>
          <p style={small}>{p.boundary}</p>
        </>
      )}
    </>
  );
}

/* ═════════════════════════ the vendor's side (PLATFORM) ═════════════════════════ */
function PlatformView() {
  const session = getSession();
  const [v, setV] = useState<PlatformRead | null>(null);
  const [lint, setLint] = useState<Row | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [transfer, setTransfer] = useState(''); const [tp, setTp] = useState<TransferPreview | null>(null);
  const [reason, setReason] = useState(''); const [untilDays, setUntilDays] = useState('30');
  const guard = useRef(latestOnly());
  const load = useCallback(async () => {
    setError(null);
    const r = await dr.platform();
    if (r.ok && r.data !== undefined) setV(r.data); else setError(r.error ?? null);
    const l = await dr.lint();
    setLint(l.ok && l.data !== undefined ? l.data.lint : null);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (transfer === '') { setTp(null); return; }
    const n = guard.current.next(); setTp(null);
    void dr.transferPreview(transfer).then((r) => { if (!guard.current.isLatest(n)) return; if (r.ok && r.data !== undefined) setTp(r.data); else setError(r.error ?? null); });
  }, [transfer]);
  const after = async (r: Answer) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); await load(); const t = transfer; setTransfer(''); setTimeout(() => setTransfer(t), 0); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const reasonOk = reason.trim().length >= 8;
  const readAt = v?.read_at ?? new Date().toISOString();
  return (
    <>
      <StageHeader stage="own the platform" />
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      <label>Reason (decisions and acceptances)<input type="text" style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="8+ characters" /></label>
      {v === null ? <p>Loading…</p> : (
        <>
          <Panel title="Data capability inventory (DP-01-001/-002/-005/-006) — imported read-only from v07.csv">
            <ScrollBox label="data capabilities"><table style={tableStyle}><thead><tr><Th>DAT</Th><Th>Capability</Th><Th>Layer · class</Th><Th>Lifecycle</Th><Th>Owner</Th><Th>Standing</Th><Th>Acts</Th></tr></thead>
              <tbody>{v.capabilities.map((c) => (
                <tr key={String(c['capability_id'])}><Td mono>{String(c['dat_key'])}</Td><Td>{String(c['title'])}</Td><Td>{String(c['layer'])} · {String(c['authority_class'])}</Td><Td>{String(c['lifecycle'])} v{String(c['version'])}</Td>
                  <Td><span style={c['owner_principal_id'] === null ? gapStyle : undefined}>{String(c['owner_name'] ?? (c['owner_principal_id'] === null ? 'NO OWNER' : c['owner_principal_id']))}{c['owner_accepted_at'] === null || c['owner_accepted_at'] === undefined ? '' : ' (accepted)'}</span></Td>
                  <Td><span style={c['conformance'] !== 'conformant' ? gapStyle : undefined}>{capabilityStateText(c)}</span></Td>
                  <Td>
                    <GovernedButton label="Reconcile" pendingLabel="reconciling" variant="quiet" onRun={async () => after(await dr.reconcileCapability(String(c['capability_id'])))} />{' '}
                    <GovernedButton label="Accept ownership" pendingLabel="accepting" variant="quiet" disabled={c['owner_principal_id'] !== session?.principalId || (c['owner_accepted_at'] !== null && c['owner_accepted_at'] !== undefined)}
                      onRun={async () => after(await dr.acceptCapability(String(c['capability_id']), { version: Number(c['version']), digest: String(c['digest']) }))} />{' '}
                    <GovernedButton label="Admit" pendingLabel="admitting" disabled={!reasonOk || c['conformance'] !== 'conformant' || c['admission'] === 'admitted' || c['owner_principal_id'] === session?.principalId}
                      onRun={async () => after(await dr.admitCapability(String(c['capability_id']), { version: Number(c['version']), digest: String(c['digest']), reason: reason.trim() }))} />
                  </Td></tr>))}</tbody></table></ScrollBox>
            <p style={small}>Admission to the governed inventory needs a conformant reconciliation after the declaration, the owner&apos;s acceptance and no hold — the server refuses otherwise and keeps the disputed state. Production admission is R1.</p>
          </Panel>

          <Panel title="Component ownership (ES-04-001, ES-11-001/-005) and transfers in flight">
            <ScrollBox label="components"><table style={tableStyle}><thead><tr><Th>Component</Th><Th>Owning team</Th><Th>Contacts</Th><Th>Owned contracts</Th><Th>Gaps</Th><Th>Transfer</Th></tr></thead>
              <tbody>{v.components.map((c) => { const o = (c['ownership'] ?? null) as Row | null; const t = (c['transfer'] ?? null) as Row | null; const gaps = (c['gaps'] ?? []) as Row[];
                return <tr key={String(c['component_artifact'])}><Td>{String(c['external_key'])} · {String(c['title'])}</Td>
                  <Td>{o === null ? <span style={gapStyle}>NO RATIFIED OWNER</span> : `${String(o['owning_team'])} v${String(o['version'])} (${String(o['accountable_name'] ?? o['accountable_principal_id'])})`}</Td>
                  <Td>{o === null ? '—' : `${String(o['primary_name'] ?? '—')} / ${String(o['secondary_name'] ?? '—')} · operator ${String(o['operator_role'])}`}</Td>
                  <Td>{o === null ? '—' : ((o['owned_contracts'] ?? []) as string[]).join(', ')}</Td>
                  <Td><span style={gaps.length > 0 ? gapStyle : undefined}>{gaps.map((g) => `${String(g['gap_kind'])} (${String(g['state'])})`).join(', ') || 'none'}</span></Td>
                  <Td>{t === null ? '—' : <button type="button" aria-pressed={transfer === t['transfer_id']} onClick={() => setTransfer(String(t['transfer_id']))}>{String(t['state'])} → {String(t['to_name'] ?? '')}</button>}</Td></tr>; })}</tbody></table></ScrollBox>
            {transfer !== '' && tp === null ? <p>Loading the transfer…</p> : null}
            {tp !== null && tp.transfer['transfer_id'] === transfer ? (
              <div style={proposalStyle} data-testid="transfer-preview">
                <p><strong>TRANSFER {String(tp.transfer['state']).toUpperCase()} — not in force until ratified</strong> · digest you act on <Mono title={String(tp.transfer['digest'])}>{String(tp.transfer['digest'])}</Mono></p>
                <ul>{transferConsequenceLines(tp.transfer).map((l) => <li key={l}>{l}</li>)}</ul>
                <p>Eligibility: {tp.eligibility.can_ratify ? 'you may ratify this transfer' : tp.eligibility.can_accept ? 'you are the receiving owner: you may accept it' : <span style={gapStyle}>{tp.eligibility.reasons.join('; ')}</span>}</p>
                <GovernedButton label="Accept the handover" pendingLabel="accepting" disabled={!tp.eligibility.can_accept} onRun={async () => after(await dr.acceptTransfer(transfer, String(tp.transfer['digest'])))} />{' '}
                <GovernedButton label="Ratify and sign" pendingLabel="signing" disabled={!tp.eligibility.can_ratify || !reasonOk}
                  onRun={async () => after(await dr.decideTransfer(transfer, { digest: String(tp.transfer['digest']), decision: 'ratify', reason: reason.trim() }))} />{' '}
                <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={!reasonOk || tp.transfer['proposed_by'] === session?.principalId}
                  onRun={async () => after(await dr.decideTransfer(transfer, { digest: String(tp.transfer['digest']), decision: 'reject', reason: reason.trim() }))} />
                <p style={small}>Signatures: {tp.signatures.map((s) => `${String(s['signer_role'])} ${String(s['key_id'])}`).join(', ') || 'none yet'}</p>
              </div>
            ) : null}
          </Panel>

          <Panel title="PLATFORM ownership gaps">
            {v.gaps.filter((g) => g['state'] !== 'resolved').length === 0 ? <p>No PLATFORM gap.</p> : (
              <ul>{v.gaps.filter((g) => g['state'] !== 'resolved').map((g) => (
                <li key={String(g['gap_id'])}><span style={isLiveGap(g) ? gapStyle : undefined}>{String(g['subject_label'])} · {gapText(g)}</span>{' '}
                  {isLiveGap(g) ? <GovernedButton label={`Accept until ${dayText(daysAfter(readAt, Number(untilDays) || 0))}`} pendingLabel="accepting" variant="critical" disabled={reason.trim().length < 12 || !(Number(untilDays) > 0 && Number(untilDays) <= 90)}
                    onRun={async () => after(await dr.acceptPlatformGap(String(g['gap_id']), { until: daysAfter(readAt, Number(untilDays)), reason: reason.trim() }))} /> : null}</li>))}</ul>
            )}
            <label>Days (1–90)<input type="number" min={1} max={90} style={{ ...inputStyle, inlineSize: '6rem' }} value={untilDays} onChange={(e) => setUntilDays(e.target.value)} /></label>
          </Panel>

          <Panel title="Owned-contract lint (ES-11-002): this API's routes against the ratified owned route prefixes">
            {lint === null ? <p>Not readable.</p> : (
              <>
                <p>{String(lint['routes'])} routes · {String((lint['covered'] as unknown[] ?? []).length)} covered · <span style={Number(lint['unowned_count']) > 0 ? gapStyle : undefined}>{String(lint['unowned_count'])} UNOWNED</span> · {String((lint['ambiguous'] as unknown[] ?? []).length)} ambiguous · {String(lint['prefixes'])} owned prefixes</p>
                <ScrollBox label="unowned routes"><ul>{((lint['unowned'] ?? []) as Row[]).slice(0, 40).map((r) => <li key={`${String(r['method'])} ${String(r['path'])}`}><Mono>{String(r['method'])} {String(r['path'])}</Mono></li>)}</ul></ScrollBox>
              </>
            )}
          </Panel>
          <p style={small}>{v.boundary}</p>
        </>
      )}
    </>
  );
}
