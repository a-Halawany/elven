'use client';
/**
 * DESIGN GOVERNANCE — CP-6 B107 §DG (0115_b107_x_dg; F-P7-E-17: UX-01/02/03/08/72, UX-ADR-001/002/023/024, REL-01/02/23/24). Status FIRST:
 * the Design System Authority, the controlling design baseline and the conformance state with every reason it is withheld (never shown
 * conformant by inference), the owners and their gaps; then the baseline's versions (attest / reject / compare), the assets and their
 * accountable owners, the principles and the lint, the narrow expiring exceptions, the contribution queue, the design trace (orphans and
 * contradictions stated), and — in a domain — the design acceptance records with their obligations, the experience-learning intakes, B92's
 * telemetry governance as evidence and the independent conformance packages (UNSIGNED — R2).
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words; an approval control shows eligibility, the exact
 * digest and the consequence, and needs a deliberate confirmation; a proposal is never styled like an approval. On a demonstration every
 * persona and record is SYNTHETIC; real acceptance by named independent authorities is R2 / H3. MET-034 stays unsupported (B108 → H3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, fmtInstant } from '../../../../components/observation';
import { LoopStageHeader } from '../../../../components/loop-stage-b107';
import { acceptanceStateText, ageText, assetOwnerText, baselineStateText, conformanceText, dayText, dg, endOfDay, exceptionStateText, isId, latestOnly, shortDigest, stageText,
  type DomainRead, type Preview, type Receipt as Rcpt, type Workspace } from '../../../../lib/governance-dg-b107';
/* B81 re: the library's Field (its control slot) — the local Field helper migrated (UX-ADR-011; dg-lint-2's ratchet) */ import { Field } from '../../../../components/forms';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;
type Selection = { what: 'baseline' | 'contribution' | 'exception' | 'asset'; id: string; version?: number } | null;
const proposalStyle = { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' };
const inForceStyle = { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const gapStyle = { color: 'var(--eye-color-critical)', fontWeight: 600 };
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' };


export default function DesignGovernancePage() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [pick, setPick] = useState<Selection>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [owner, setOwner] = useState('');
  const [evidenceJson, setEvidenceJson] = useState('{}');
  const [xForm, setXForm] = useState({ principle: '', assetId: '', reason: '', compensating: '', expires: '' });
  const [query, setQuery] = useState('');
  const [trace, setTrace] = useState<Row | null>(null);
  const [compare, setCompare] = useState<Row | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [dom, setDom] = useState<DomainRead | null>(null);
  const [pkg, setPkg] = useState<Row | null>(null);
  const guard = useRef(latestOnly());

  const load = useCallback(async () => {
    const r = await dg.workspace();
    if (r.ok && r.data !== undefined) setWs(r.data); else setError(r.error ?? null);
  }, []);
  useEffect(() => { void load(); setFrom(new URLSearchParams(window.location.search).get('from')); }, [load]);
  const loadDomain = useCallback(async () => {
    if (!isId(tenantId) || !isId(domainId)) { setDom(null); return; }
    const r = await dg.domain(tenantId.trim(), domainId.trim());
    if (r.ok && r.data !== undefined) setDom(r.data); else setError(r.error ?? null);
  }, [tenantId, domainId]);

  // the approval's preview, loaded by selection — only the newest answer is applied (a stale response never shows another subject's digest)
  useEffect(() => {
    setConfirmed(false); setPreview(null);
    if (pick === null) return;
    const n = guard.current.next();
    void dg.preview(pick.what, pick.id, pick.version).then((r) => {
      if (!guard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null);
    });
  }, [pick]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setReason(''); setConfirmed(false); setPick(null); setError(null); await load(); await loadDomain(); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const reasonOk = reason.trim().length >= 8;
  const readAt = ws?.read_at ?? new Date().toISOString();
  const conf = ws?.conformance;
  const attested = (ws?.baselines ?? []).find((b) => b['state'] === 'attested') ?? null;
  const latestLint = (ws?.evaluations ?? []).find((e) => e['source'] === 'lint') ?? null;
  const gaps = ws?.orphans.assets_without_owner ?? [];
  const contributions = ws?.contributions ?? [];
  const selectedC = pick?.what === 'contribution' ? contributions.find((c) => c['contribution_id'] === pick.id) ?? null : null;

  /** The approval control: eligibility, the exact digest, the consequence, a deliberate confirmation — or the reason it is disabled. */
  const approvalBox = (title: string, acts: Array<{ label: string; run: () => Promise<void>; critical?: boolean }>) => {
    if (preview === null) return <p style={muted}>Reading the preview…</p>;
    const blocked = preview.eligibility.length > 0;
    return (
      <div style={inForceStyle} data-testid="approval">
        <strong>{title}</strong>
        <div>Exact digest: <Mono>{preview.digest}</Mono></div>
        <ul>{preview.consequence.map((c) => <li key={c}>{c}</li>)}</ul>
        {(preview.blockers ?? []).length > 0 ? <div style={gapStyle}>HELD by: {(preview.blockers ?? []).map((b) => b.reason).join('; ')}</div> : null}
        {blocked ? <div role="status" style={gapStyle}>You cannot take this act: {preview.eligibility.join('; ')}</div> : null}
        <Field id="dg-reason" label="Reason (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I have read the digest and the consequence; this is my act, signed with my key</label>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
          {acts.map((a) => <GovernedButton key={a.label} label={a.label} pendingLabel={`${a.label}…`} variant={a.critical === true ? 'critical' : 'primary'}
            disabled={blocked || !reasonOk || !confirmed} onRun={a.run} />)}
        </div>
      </div>
    );
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Design governance</h1>
      <LoopStageHeader stage="Learn" from={from}
        upstream={[{ label: 'an attested design baseline', present: attested !== null }, { label: 'a lint evaluation of the web source', present: latestLint !== null }]}
        next={{ label: 'review the contribution queue', gate: contributions.some((c) => c['stage'] === 'in_review') ? 'an accepted contribution is the Design System Authority\'s signed act — a named human' : null }} />
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Authority, baseline and conformance (UX-01)">
        <div data-testid="authority">Design System Authority: {(ws?.authority.holders ?? []).length === 0 ? <span style={gapStyle}>⊘ nobody holds the role — design conformance cannot be approved</span>
          : (ws?.authority.holders ?? []).map((x) => x.name ?? x.principal_id).join(', ')}. Product meaning: {ws?.authority.product_meaning}.</div>
        <div style={attested === null ? gapStyle : inForceStyle}>{attested === null ? '⊘ No attested design baseline' : `${String(attested['title'])} v${String(attested['version'])} — ${baselineStateText(attested)} · ${String(attested['design_system_version'])}`}</div>
        {conf !== undefined ? <div data-testid="conformance"><strong>{conformanceText(conf)}</strong><ul>{conf.reasons.map((x, i) => <li key={i}>{x.class}: {x.reason}</li>)}</ul><p style={muted}>{conf.note}</p></div> : null}
        <div>Ownership gaps: {gaps.length === 0 ? 'none' : <span style={gapStyle}>{gaps.map((g) => String(g['key'])).join(', ')}</span>}</div>
      </Panel>

      <Panel title="Design baseline versions (UX-01-003)">
        <table style={tableStyle} aria-label="baselines"><thead><tr><Th>Baseline</Th><Th>Version</Th><Th>State</Th><Th>Members</Th><Th>Digest</Th><Th>Act</Th></tr></thead>
          <tbody>{(ws?.baselines ?? []).map((b) => (
            <tr key={`${String(b['baseline_id'])}-${String(b['version'])}`}>
              <Td>{String(b['title'])}</Td><Td>v{String(b['version'])}</Td>
              <Td><span style={b['state'] === 'proposed' ? proposalStyle : undefined}>{baselineStateText(b)}</span></Td>
              <Td>{(b['members'] as Row[]).map((m) => `${String(m['key'])}@v${String(m['version'])}`).join(', ')}</Td><Td mono>{shortDigest(b['digest'])}</Td>
              <Td>{b['state'] === 'proposed' ? <button onClick={() => setPick({ what: 'baseline', id: String(b['baseline_id']), version: Number(b['version']) })}>Review to decide</button> : null}
                {Number(b['version']) > 1 ? <button onClick={() => void dg.compare(String(b['baseline_id']), Number(b['version']) - 1, Number(b['version'])).then((r) => (r.ok && r.data !== undefined ? setCompare(r.data.comparison) : setError(r.error ?? null)))}>Compare with v{Number(b['version']) - 1}</button> : null}</Td>
            </tr>))}</tbody></table>
        {compare !== null ? <pre data-testid="compare" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(compare, null, 2)}</pre> : null}
        {pick?.what === 'baseline' ? approvalBox(`Attest or reject baseline v${String(pick.version)}`, [
          { label: 'Attest (sign)', run: async () => after(await dg.decideBaseline(pick.id, { version: pick.version ?? 0, decision: 'attest', digest: preview?.digest ?? '', reason })) },
          { label: 'Reject', critical: true, run: async () => after(await dg.decideBaseline(pick.id, { version: pick.version ?? 0, decision: 'reject', digest: preview?.digest ?? '', reason })) },
        ]) : null}
      </Panel>

      <Panel title="Design assets and their accountable owners (REL-01)">
        <GovernedButton label="Read the repository's inventory" pendingLabel="Registering…" variant="quiet" onRun={async () => after(await dg.registerInventory())} />
        <table style={tableStyle} aria-label="assets"><thead><tr><Th>Asset</Th><Th>Kind</Th><Th>Version</Th><Th>Owner · status</Th><Th>Consumers</Th><Th>Holds</Th><Th>Act</Th></tr></thead>
          <tbody>{(ws?.assets ?? []).map((a) => (
            <tr key={String(a['asset_id'])}>
              <Td>{String(a['asset_key'])}<div style={muted}>{String(a['source_ref'])}</div></Td><Td>{String(a['kind'])}</Td><Td>v{String(a['version'])} · {String(a['package_version'])}</Td>
              <Td><span style={a['owner_principal_id'] === null ? gapStyle : undefined}>{assetOwnerText(a)}</span></Td><Td>{(a['consumers'] as unknown[]).length}</Td>
              <Td>{(a['holds'] as Row[]).map((h) => `${String(h['reason_kind'])}`).join(', ') || '—'}</Td>
              <Td>{a['status'] === 'proposed' ? <button onClick={() => setPick({ what: 'asset', id: String(a['asset_id']) })}>Review to approve</button> : null}</Td>
            </tr>))}</tbody></table>
        {pick?.what === 'asset' ? (<>
          <Field id="dg-owner" label="Accountable owner (principal id, a named human)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={owner} onChange={(e) => setOwner(e.target.value)} />}</Field>
          {approvalBox('Approve the asset and name its one accountable owner', [{ label: 'Approve', run: async () => {
            if (!isId(owner)) { setError({ code: 'EYE-REQ-001', message: 'the owner is a principal id', correlationId: '' }); throw new Error('owner'); }
            await after(await dg.approveAsset(pick.id, { version: Number(preview?.subject['version'] ?? 0), ownerPrincipalId: owner.trim(), digest: preview?.digest ?? '', reason }));
          } }])}</>) : null}
      </Panel>

      <Panel title="Principles, prohibitions and the lint (UX-03, UX-ADR-002)">
        <GovernedButton label="Run the lint over the web source" pendingLabel="Linting…" variant="quiet" onRun={async () => after(await dg.runLint())} />
        <ul>{(ws?.principles ?? []).map((p) => <li key={String(p['principle_key'])}><strong>{String(p['principle_key'])}</strong> ({String(p['kind'])}{p['unwaivable'] === true ? ' · UNWAIVABLE' : ''}{p['lint_rule'] !== null ? ` · lint ${String(p['lint_rule'])}` : ''}) — {String(p['statement'])}</li>)}</ul>
        <table style={tableStyle} aria-label="evaluations"><thead><tr><Th>When</Th><Th>Source</Th><Th>Verdict</Th><Th>Open / excepted</Th><Th>By</Th></tr></thead>
          <tbody>{(ws?.evaluations ?? []).slice(0, 8).map((e) => (
            <tr key={String(e['evaluation_id'])}><Td>{fmtInstant(e['evaluated_at'])}</Td><Td>{String(e['source'])}</Td>
              <Td><span style={e['verdict'] === 'nonconformant' ? gapStyle : undefined}>{String(e['verdict']).toUpperCase()}</span></Td>
              <Td>{String((e['counts'] as Row)['open'] ?? 0)} / {String((e['counts'] as Row)['excepted'] ?? 0)}</Td><Td>{String(e['evaluated_by_name'] ?? e['evaluated_by_kind'])}</Td></tr>))}</tbody></table>
      </Panel>

      <Panel title="Narrow, expiring design exceptions (UX-03-003)">
        <table style={tableStyle} aria-label="exceptions"><thead><tr><Th>Principle</Th><Th>Asset</Th><Th>State</Th><Th>Act</Th></tr></thead>
          <tbody>{(ws?.exceptions ?? []).map((x) => (
            <tr key={String(x['exception_id'])}><Td>{String(x['principle_key'])}</Td><Td>{String(x['asset_key'] ?? x['asset_id'])} v{String(x['asset_version'])}</Td>
              <Td><span style={x['state'] === 'requested' ? proposalStyle : undefined}>{exceptionStateText(x, readAt)}</span></Td>
              <Td>{x['state'] === 'requested' ? <button onClick={() => setPick({ what: 'exception', id: String(x['exception_id']) })}>Review to decide</button> : null}</Td></tr>))}</tbody></table>
        {pick?.what === 'exception' ? approvalBox('Decide the exception (never the asset\'s owner)', [
          { label: 'Approve (sign)', run: async () => after(await dg.decideException(pick.id, { decision: 'approve', digest: preview?.digest ?? '', reason })) },
          { label: 'Reject', critical: true, run: async () => after(await dg.decideException(pick.id, { decision: 'reject', digest: preview?.digest ?? '', reason })) },
        ]) : null}
        <div style={proposalStyle}>
          <strong>Request an exception (a proposal)</strong>
          <Field id="dgx-p" label="Principle (never an unwaivable one)">{(id) => <select id={id} style={inputStyle} value={xForm.principle} onChange={(e) => setXForm({ ...xForm, principle: e.target.value })}>
            <option value="">choose</option>{(ws?.principles ?? []).filter((p) => p['unwaivable'] !== true && p['state'] === 'active').map((p) => <option key={String(p['principle_key'])} value={String(p['principle_key'])}>{String(p['principle_key'])}</option>)}</select>}</Field>
          <Field id="dgx-a" label="Asset (its current version)">{(id) => <select id={id} style={inputStyle} value={xForm.assetId} onChange={(e) => setXForm({ ...xForm, assetId: e.target.value })}>
            <option value="">choose</option>{(ws?.assets ?? []).map((a) => <option key={String(a['asset_id'])} value={String(a['asset_id'])}>{String(a['asset_key'])}</option>)}</select>}</Field>
          <Field id="dgx-r" label="Why conformance cannot yet be achieved (12+)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={xForm.reason} onChange={(e) => setXForm({ ...xForm, reason: e.target.value })} />}</Field>
          <Field id="dgx-c" label="Compensating control (8+)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={xForm.compensating} onChange={(e) => setXForm({ ...xForm, compensating: e.target.value })} />}</Field>
          <Field id="dgx-e" label="Expires at the end of (a day within 90 days)">{(id) => <input id={id} type="date" style={inputStyle} value={xForm.expires} onChange={(e) => setXForm({ ...xForm, expires: e.target.value })} />}</Field>
          <GovernedButton label="Request" pendingLabel="Requesting…" variant="quiet" disabled={xForm.principle === '' || xForm.assetId === '' || endOfDay(xForm.expires) === null}
            onRun={async () => after(await dg.requestException({ principle: xForm.principle, assetId: xForm.assetId, reason: xForm.reason, compensating: xForm.compensating, expiresAt: endOfDay(xForm.expires) ?? '' }))} />
        </div>
      </Panel>

      <Panel title="The contribution queue (UX-72, UX-ADR-024)">
        <table style={tableStyle} aria-label="contributions"><thead><tr><Th>Contribution</Th><Th>Kind · origin</Th><Th>Stage</Th><Th>Blockers</Th><Th>Proposed by</Th><Th>Act</Th></tr></thead>
          <tbody>{contributions.map((c) => (
            <tr key={String(c['contribution_id'])}><Td>{String(c['summary'])}<div style={muted}>rev {String(c['revision'])} · {String(c['target_key'] ?? 'no target')}</div></Td>
              <Td>{String(c['kind'])} · {String(c['origin'])}</Td>
              <Td><span style={['proposed', 'held', 'in_review'].includes(String(c['stage'])) ? proposalStyle : undefined}>{stageText(c['stage'])}</span></Td>
              <Td>{((c['blockers'] ?? []) as Row[]).map((b) => String(b['reason'])).join('; ') || '—'}</Td>
              <Td>{String(c['proposed_by_name'] ?? c['proposed_by'])} ({String(c['proposed_by_kind'])})</Td>
              <Td>{((c['next_steps'] ?? []) as string[]).length > 0 ? <button onClick={() => setPick({ what: 'contribution', id: String(c['contribution_id']) })}>Steps</button> : '—'}</Td></tr>))}</tbody></table>
        {selectedC !== null ? (
          <div data-testid="contribution-steps">
            <Field id="dg-ev" label="Evidence (adopt: {adopted, divergent} · measure: {measures:[{kind, ref}]} · migrate: {migrated})">{(id) => <textarea id={id} style={{ ...inputStyle, inlineSize: '100%' }} rows={3} value={evidenceJson} onChange={(e) => setEvidenceJson(e.target.value)} />}</Field>
            {((selectedC['next_steps'] ?? []) as string[]).includes('accept') ? approvalBox('Accept the contribution (signed) — or, for a constitutional amendment, ratify it as the product authority', [
              { label: 'Accept (sign)', run: async () => after(await dg.step(String(selectedC['contribution_id']), 'accept', { revision: Number(selectedC['revision']), digest: preview?.digest ?? '', reason })) }]) : null}
            {((selectedC['next_steps'] ?? []) as string[]).filter((s) => s !== 'accept').map((s) => (
              <GovernedButton key={s} label={`${s[0]!.toUpperCase()}${s.slice(1)}`} pendingLabel={`${s}…`} variant={s === 'reject' || s === 'retire' ? 'critical' : 'quiet'} disabled={!reasonOk}
                onRun={async () => { let ev: Row = {}; try { ev = JSON.parse(evidenceJson) as Row; } catch { setError({ code: 'EYE-REQ-001', message: 'the evidence is JSON', correlationId: '' }); throw new Error('json'); }
                  await after(await dg.step(String(selectedC['contribution_id']), s, { revision: Number(selectedC['revision']), reason, evidence: ev })); }} />))}
            {!reasonOk ? <p style={muted}>A step states its reason (8+ characters) — the field above the confirmation.</p> : null}
          </div>) : null}
      </Panel>

      <Panel title="The design trace (UX-08, REL-02)">
        <Field id="dg-q" label="Find an artifact (key or title)">{(id) => <input id={id} style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} />}</Field>
        <button onClick={() => void dg.trace({ query }).then((r) => (r.ok && r.data !== undefined ? setTrace(r.data as unknown as Row) : setError(r.error ?? null)))}>Search</button>
        {trace !== null && Array.isArray(trace['matches']) ? <ul>{(trace['matches'] as Row[]).map((m) => <li key={String(m['artifact_id'])}>
          <button onClick={() => void dg.trace({ artifactId: String(m['artifact_id']), depth: 2 }).then((r) => (r.ok && r.data !== undefined ? setTrace(r.data as unknown as Row) : setError(r.error ?? null)))}>{String(m['kind'])} · {String(m['external_key'])}</button></li>)}</ul> : null}
        {trace !== null && trace['trace'] !== null && trace['trace'] !== undefined ? <div data-testid="trace">
          <ul>{((trace['trace'] as Row)['nodes'] as Row[]).map((n) => <li key={String(n['artifact_id'])}>{'—'.repeat(Number(n['depth']))} {String(n['kind'])} · {String(n['key'] ?? n['artifact_id'])} ({String(n['lifecycle'] ?? 'unknown')})</li>)}</ul>
          <p style={muted}>{((trace['trace'] as Row)['edges'] as Row[]).length} link(s), both directions.</p></div> : null}
        <div data-testid="orphans">Orphans and contradictions (stated, never hidden): {ws === null ? '' : `${ws.orphans.assets_without_requirement.length} asset(s) trace to no requirement · ${ws.orphans.requirements_without_design.length} design requirement(s) without a design artifact · ${ws.orphans.contradictions.length} contradiction(s)`}</div>
      </Panel>

      <Panel title="In a domain: design acceptance, experience learning, telemetry evidence, conformance packages">
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <Field id="dg-t" label="Tenant id">{(id) => <input id={id} style={inputStyle} value={tenantId} onChange={(e) => setTenantId(e.target.value)} />}</Field>
          <Field id="dg-d" label="Domain id">{(id) => <input id={id} style={inputStyle} value={domainId} onChange={(e) => setDomainId(e.target.value)} />}</Field>
        </div>
        <button disabled={!isId(tenantId) || !isId(domainId)} onClick={() => void loadDomain()}>Read the domain</button>
        {dom !== null ? (<div data-testid="domain">
          <h3>Design acceptance records (UX-ADR-023, REL-24)</h3>
          {dom.acceptances.map((r) => (
            <div key={`${String(r['acceptance_id'])}-${String(r['version'])}`} style={r['state'] === 'accepted' ? inForceStyle : proposalStyle}>
              <strong>{String((r['tuple'] as Row)['capability'])} · {String((r['tuple'] as Row)['journey'])} · v{String(r['version'])}</strong> — {acceptanceStateText(r)}
              <div style={muted}>Tuple: {Object.entries(r['tuple'] as Row).map(([k, v]) => `${k}=${k.startsWith('period') ? dayText(v) : String(v)}`).join(' · ')} · digest <Mono>{shortDigest(r['digest'])}</Mono></div>
              <div style={muted}>Evidence: {(r['evidence'] as Row[]).map((e) => `${String(e['kind'])} until ${String(e['validUntil'])}`).join(' · ')}</div>
              <div style={muted}>Accessibility: {String((r['accessibility'] as Row)['status']).toUpperCase()} ({String((r['accessibility'] as Row)['metric'])} — {String((r['accessibility'] as Row)['carrier'])})</div>
              <ul>{r.attest.map((o) => <li key={o.obligation}>{o.obligation} ({o.role}): {o.attested ? '☑ attested and signed' : o.eligibility.length > 0 ? `not by you — ${o.eligibility.join('; ')}` : (
                <span>
                  <input aria-label={`reason for ${o.obligation}`} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (8+)" />
                  <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> digest {shortDigest(r['digest'])} read; my signed act</label>
                  <GovernedButton label={`Attest ${o.obligation} (sign)`} pendingLabel="Attesting…" disabled={!reasonOk || !confirmed}
                    onRun={async () => after(await dg.attest(tenantId.trim(), domainId.trim(), String(r['acceptance_id']), { version: Number(r['version']), obligation: o.obligation, digest: String(r['digest']), reason }))} />
                </span>)}</li>)}</ul>
            </div>))}
          <h3>Experience learning (UX-ADR-024)</h3>
          <p style={muted}>A B92 action decided as a design_change_proposal opens a contribution PROPOSAL — telemetry never modifies a pattern.</p>
          <GovernedButton label={`Take in ${dom.pending_actions.length} pending action(s)`} pendingLabel="Taking in…" variant="quiet" disabled={dom.pending_actions.length === 0}
            onRun={async () => after(await dg.intake(tenantId.trim(), domainId.trim()))} />
          <ul>{dom.intakes.map((i) => <li key={String(i['intake_id'])}>{String(i['journey_key'] ?? 'unattached')}: {String(i['statement'])} → {stageText(i['contribution_stage'])}</li>)}</ul>
          <h3>Telemetry governance as evidence (REL-23)</h3>
          <div style={muted}>Purposes {((dom.telemetry['purposes'] ?? []) as unknown[]).length} · event definitions {((dom.telemetry['lineage'] ?? []) as unknown[]).length} · journeys {((dom.telemetry['coverage'] ?? []) as unknown[]).length} · MET-034: {String(((dom.telemetry['metric_governance'] as Row)?.['met_034'] as Row | null)?.['supported'] === true ? 'supported' : 'UNSUPPORTED (B108 → H3)')}</div>
          <h3>Independent conformance packages (UX-70-006, UX-66-006) — UNSIGNED (R2)</h3>
          {(['UX-70-006', 'UX-66-006'] as const).map((t) => <GovernedButton key={t} label={`Generate for ${t}`} pendingLabel="Generating…" variant="quiet"
            onRun={async () => { const r = await dg.generatePackage(tenantId.trim(), domainId.trim(), { target: t, acceptanceId: (dom.acceptances.find((a) => a['state'] === 'accepted')?.['acceptance_id'] as string | undefined) ?? null });
              if (r.ok && r.data !== undefined) setPkg(r.data.package); await after(r); }} />)}
          <table style={tableStyle} aria-label="packages"><thead><tr><Th>Target</Th><Th>Generated</Th><Th>Evidence</Th><Th>Findings</Th><Th>Signature</Th></tr></thead>
            <tbody>{dom.packages.map((k) => <tr key={String(k['package_id'])}><Td>{String(k['target'])}</Td><Td>{fmtInstant(k['generated_at'])}</Td><Td>{String(k['evidence_count'])}</Td><Td>{String(k['findings_count'])}</Td>
              <Td>UNSIGNED — {String(k['signature_required'])}</Td></tr>)}</tbody></table>
          {pkg !== null ? <div data-testid="package"><strong>Package {shortDigest(pkg['digest'])}</strong> — UNSIGNED
            <ul>{(((pkg['content'] as Row)?.['evidence'] ?? []) as Row[]).slice(0, 20).map((e, i) => <li key={i}>{String(e['kind'])} · {ageText(e['age_days'])}{e['expired'] === true ? ' · EXPIRED' : ''}</li>)}</ul>
            <ul>{(((pkg['content'] as Row)?.['findings'] ?? []) as Row[]).map((f, i) => <li key={i}>{String(f['class'])}: {String(f['finding'])}</li>)}</ul></div> : null}
        </div>) : null}
      </Panel>

      <Panel title="Ledger">
        <ul>{(ws?.ledger ?? []).slice(0, 30).map((e) => <li key={String(e['event_id'])}>{fmtInstant(e['occurred_at'])} · {String(e['event'])} · {String(e['actor_name'] ?? e['actor_principal_id'])}</li>)}</ul>
        <p style={muted}>{ws?.boundary}</p>
      </Panel>
    </>
  );
}
