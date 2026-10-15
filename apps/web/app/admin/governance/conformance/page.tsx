'use client';
/**
 * CONFORMANCE — CP-6 B107 §CM (0115_b107_x_cm; F-P7D-25). Status FIRST: the build identity, whether the committed component manifest is the
 * registered one, the open findings of the local conformance monitor, the release candidates (assembled / conformant / refused / held /
 * attested — visibly distinct; a candidate is NEVER a release) with their evidence items and ages, their holds and their attestation; then the
 * attestation (eligibility, the exact digest, the consequence preview), the assembly of a candidate, the state per component (never inferred),
 * the closure gap report, the manifest browsed by layer, the monitor's runs and the ledger.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words; a DATE renders as the day it names. On a
 * demonstration every persona and record is SYNTHETIC; an attested candidate is not a release (B65), not production admission (R1), not real
 * acceptance (R2).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, ScrollBox } from '../../../../components/observation';
import { attestDisabledReason, candidateStateText, checkLine, cm, componentStateText, dayText, evidenceAge, latestOnly, parseEvidence, shortDigest, syncText,
  type Candidate, type ManifestView, type Preview, type Receipt as Rcpt, type Workspace } from '../../../../lib/governance-cm-b107';

type Err = { code: string; message: string; correlationId: string } | null;
const LAYERS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'];
const KINDS = ['api_module', 'worker', 'web_app', 'package', 'infrastructure_service', 'api_composition_root'];
const STATE_STYLE: Record<string, React.CSSProperties> = {
  assembled: { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-4)' },
  conformant: { borderInlineStart: '4px solid var(--eye-color-accent-default)', paddingInlineStart: 'var(--eye-space-8)' },
  attested: { borderInlineStart: '4px solid var(--eye-color-accent-strong)', paddingInlineStart: 'var(--eye-space-8)', fontWeight: 600 },
  refused: { color: 'var(--eye-color-critical)', fontWeight: 600 },
  held: { color: 'var(--eye-color-warning)', fontWeight: 600 },
  withdrawn: { color: 'var(--eye-color-ink-muted)', textDecoration: 'line-through' },
  superseded: { color: 'var(--eye-color-ink-muted)' },
};
const muted = { color: 'var(--eye-color-ink-muted)' };
const today = () => new Date().toISOString().slice(0, 10);

export default function ConformancePage() {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [layer, setLayer] = useState<string>('L1');
  const [kind, setKind] = useState<string>('');
  const [view, setView] = useState<ManifestView | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [form, setForm] = useState({ label: '', periodFrom: today(), periodTo: today(), tenants: '', evidence: '', builders: '', candidateId: '', expectedVersion: 0 });
  const [reviewing, setReviewing] = useState(false);
  const wsGuard = useRef(latestOnly()); const viewGuard = useRef(latestOnly()); const previewGuard = useRef(latestOnly());

  const refresh = useCallback(async () => {
    const n = wsGuard.current.next();
    const r = await cm.workspace();
    if (!wsGuard.current.isLatest(n)) return;
    if (r.ok && r.data !== undefined) setWs(r.data); else setError(r.error ?? null);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const n = viewGuard.current.next();
    void cm.manifest({ layer: layer === '' ? null : layer, kind: kind === '' ? null : kind }).then((r) => {
      if (!viewGuard.current.isLatest(n)) return;   // a later selection answered first: this one is stale
      if (r.ok && r.data !== undefined) setView(r.data); else { setView(null); setError(r.error ?? null); }
    });
  }, [layer, kind]);
  useEffect(() => {
    setPreview(null); setReason('');
    if (selected === '') return;
    const n = previewGuard.current.next();
    void cm.preview(selected).then((r) => { if (previewGuard.current.isLatest(n)) { if (r.ok && r.data !== undefined) setPreview(r.data); else setError(r.error ?? null); } });
  }, [selected]);

  const act = async <T extends { receipt: Rcpt }>(p: Promise<{ ok: boolean; data?: T; error?: { code: string; message: string; correlationId: string } }>) => {
    setError(null);
    const r = await p;
    if (r.ok && r.data !== undefined) setReceipt(r.data.receipt); else setError(r.error ?? null);
    await refresh();
    return r.ok;
  };

  const live = (ws?.candidates ?? []).filter((c) => c.state !== 'superseded');
  const sel = live.find((c) => c.candidate_id === selected) ?? null;
  const evidence = parseEvidence(form.evidence);
  const openFindings = (ws?.findings ?? []).filter((f) => f.state === 'open');
  const registerDisabled = ws === null ? 'loading' : ws.sync.state === 'in_sync' ? `the committed manifest is registered (v${String(ws.manifest?.['version'] ?? '')})` : ws.sync.state === 'unreadable' ? 'the committed manifest cannot be read' : null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Conformance</h1>
      <p style={muted}>
        The generated component manifest, the release-candidate record and its evidence check, the local conformance monitor. A release candidate is a
        local conformance record — <strong>never a release</strong> (B65), never production admission (R1), never real acceptance (R2). SLO targets are declared,
        not computed (B64).
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Status">
        {ws === null ? <p style={muted}>reading…</p> : (
          <ul>
            <li>Head <Mono>{shortDigest(ws.identity.head_sha)}</Mono> ({ws.identity.head_source}) · migration head <Mono>{ws.migration_head ?? 'unknown'}</Mono> · policy bundle {ws.identity.policy_bundle.version} <Mono>{shortDigest(ws.identity.policy_bundle.digest)}</Mono></li>
            <li style={ws.sync.state === 'in_sync' ? undefined : STATE_STYLE['held']}>Manifest: {syncText(ws.sync)}{ws.committed.unmapped.length > 0 ? ` · UNMAPPED units: ${ws.committed.unmapped.join(', ')}` : ''}</li>
            <li style={openFindings.length > 0 ? STATE_STYLE['held'] : undefined}>{openFindings.length} open conformance finding(s) · last conformant candidate: {ws.last_conformant === null ? 'none' : `${ws.last_conformant.label} v${ws.last_conformant.version} (${ws.last_conformant.state})`}</li>
            <li>Components: {Object.entries(ws.component_totals).map(([k, v]) => `${componentStateText(k)} ${v}`).join(' · ')}</li>
          </ul>
        )}
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <GovernedButton label="Register the committed manifest" pendingLabel="Registering…" disabled={registerDisabled !== null} onRun={async () => { await act(cm.register()); }} />
          <GovernedButton label="Run the conformance monitor now" pendingLabel="Observing…" variant="quiet" onRun={async () => { await act(cm.monitor()); }} />
        </div>
        {registerDisabled !== null && <p style={muted}>Registration: {registerDisabled}</p>}
      </Panel>

      <Panel title="Open findings (the local conformance monitor)">
        {openFindings.length === 0 ? <p style={muted}>No open finding. (The monitor watches this local runtime — production monitoring is R1.)</p> : (
          <table style={tableStyle} aria-label="open findings">
            <thead><tr><Th>Kind</Th><Th>Finding</Th><Th>Opened</Th></tr></thead>
            <tbody>{openFindings.map((f) => <tr key={f.finding_id}><Td><strong>{f.kind}</strong></Td><Td>{f.summary}</Td><Td>{String(f.opened_at)}</Td></tr>)}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Release candidates — not releases">
        <table style={tableStyle} aria-label="release candidates">
          <thead><tr><Th>Candidate</Th><Th>State</Th><Th>Bound to</Th><Th>Evidence</Th><Th>Holds</Th><Th>Check</Th></tr></thead>
          <tbody>
            {live.map((c: Candidate) => (
              <tr key={`${c.candidate_id}-${c.version}`} aria-selected={c.candidate_id === selected}>
                <Td><button style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => setSelected(c.candidate_id)}>{c.label} v{c.version}</button><br /><span style={muted}>{dayText(c.period_from)} → {dayText(c.period_to)} · {c.customer_scope.kind} · by {c.proposed_by_name ?? c.proposed_by}</span></Td>
                <Td><span style={STATE_STYLE[c.state]}>{candidateStateText(c.state)}</span>{c.signatures.map((s) => <div key={s.signature_id} style={muted}>signed {s.signer_role} {s.verified ? '✓ verified' : '✗ NOT verified'}</div>)}</Td>
                <Td><Mono>{shortDigest(c.head_sha)}</Mono><br />{c.migration_head}<br />manifest v{c.manifest_version}</Td>
                <Td>{c.evidence.map((e) => <div key={e.item}>{e.family}: {e.ref} <span style={muted}>({evidenceAge(e, ws?.read_at ?? new Date().toISOString())})</span></div>)}</Td>
                <Td>{c.open_holds.length === 0 ? '—' : c.open_holds.map((h) => <div key={h.hold_id} style={STATE_STYLE['held']}>{h.reason_kind}: {h.reason}</div>)}</Td>
                <Td>{checkLine(c.check_result)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {sel !== null && (
        <Panel title={`${sel.label} v${sel.version}`}>
          <p>Digest <Mono>{sel.digest}</Mono> · {candidateStateText(sel.state)}</p>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockEnd: 'var(--eye-space-8)' }}>
            <GovernedButton label="Run the evidence check" pendingLabel="Checking…" disabled={!['assembled', 'conformant', 'refused', 'held'].includes(sel.state)} onRun={async () => { await act(cm.check(sel.candidate_id, sel.version)); }} />
          </div>
          <div style={{ border: '1px solid var(--eye-color-border-default)', padding: 'var(--eye-space-8)' }}>
            <strong>Attest (independent assurance)</strong>
            {preview === null ? <p style={muted}>reading the preview…</p> : (
              <>
                <p>Exact digest: <Mono>{preview.digest}</Mono></p>
                <p style={muted}>{preview.consequence}</p>
                <p>{preview.eligibility.can_attest ? 'You may attest.' : `You may not attest: ${preview.eligibility.reasons.join('; ')}`}</p>
                <label htmlFor="cm-attest-reason">Reason (8+ characters)</label>
                <input id="cm-attest-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} />
                <GovernedButton label="Attest and sign" pendingLabel="Signing…" disabled={attestDisabledReason(preview, reason) !== null}
                  onRun={async () => { if (await act(cm.attest(sel.candidate_id, { version: sel.version, digest: preview.digest, reason }))) setSelected(''); }} />
                {attestDisabledReason(preview, reason) !== null && <p style={muted}>Disabled: {attestDisabledReason(preview, reason)}</p>}
              </>
            )}
          </div>
          <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <label htmlFor="cm-withdraw-reason">Withdrawal reason</label>
            <input id="cm-withdraw-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
            <GovernedButton label="Withdraw the candidate" pendingLabel="Withdrawing…" variant="critical" disabled={withdrawReason.trim().length < 8 || ['withdrawn', 'superseded'].includes(sel.state)}
              onRun={async () => { if (await act(cm.withdraw(sel.candidate_id, { version: sel.version, reason: withdrawReason }))) setWithdrawReason(''); }} />
          </div>
        </Panel>
      )}

      <Panel title="Assemble a release candidate (or amend one over renewed evidence)">
        {!reviewing ? (
          <div style={{ maxInlineSize: '48rem' }}>
            {[['label', 'Label'], ['periodFrom', 'Period from (YYYY-MM-DD)'], ['periodTo', 'Period to (YYYY-MM-DD)'], ['tenants', 'Customer scope — tenant ids (comma-separated; empty = platform)'],
              ['builders', 'Declared builders — principal ids (comma-separated)'], ['candidateId', 'Amend candidate id (empty = a new candidate)']].map(([k, l]) => (
              <div key={k} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                <label htmlFor={`cm-${k}`} style={{ display: 'block' }}>{l}</label>
                <input id={`cm-${k}`} style={{ ...inputStyle, inlineSize: '100%' }} value={String(form[k as keyof typeof form])} onChange={(e) => setForm({ ...form, [k as string]: e.target.value })} />
              </div>
            ))}
            <label htmlFor="cm-evidence" style={{ display: 'block' }}>Evidence (JSON list: family, kind, ref, digest, bound_head_sha, captured_at, valid_until)</label>
            <textarea id="cm-evidence" rows={6} style={{ ...inputStyle, inlineSize: '100%', fontFamily: 'var(--eye-font-mono)' }} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
            {!evidence.ok && form.evidence !== '' && <p style={STATE_STYLE['refused']}>{evidence.reason}</p>}
            <button style={{ ...inputStyle, cursor: 'pointer' }} disabled={form.label.length < 3 || !evidence.ok} onClick={() => setReviewing(true)}>Review</button>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--eye-color-warning)' }}>
              A candidate is assembled with THIS server&apos;s build identity (head {shortDigest(ws?.identity.head_sha)}, policy {ws?.identity.policy_bundle.version}, the registered manifest).
              It is checked separately; it is never a release.
            </p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
              <GovernedButton label="Assemble" pendingLabel="Assembling…" onRun={async () => {
                const tenants = form.tenants.split(',').map((x) => x.trim()).filter((x) => x !== '');
                const ok = await act(cm.assemble({ candidateId: form.candidateId.trim() === '' ? null : form.candidateId.trim(), expectedVersion: Number(live.find((c) => c.candidate_id === form.candidateId.trim())?.version ?? 0),
                  label: form.label, periodFrom: form.periodFrom, periodTo: form.periodTo, scope: tenants.length === 0 ? { kind: 'platform' } : { kind: 'tenants', tenants },
                  evidence: evidence.ok ? evidence.items : [], builders: form.builders.split(',').map((x) => x.trim()).filter((x) => x !== '') }));
                setReviewing(false); if (ok) setForm({ ...form, label: '', evidence: '', candidateId: '' });
              }} />
              <GovernedButton label="Cancel" pendingLabel="…" variant="quiet" onRun={async () => setReviewing(false)} />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="State per component (the conformance service — never inferred)">
        <label htmlFor="cm-state-filter">Show </label>
        <select id="cm-state-filter" style={inputStyle} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">every state</option>
          {Object.keys(ws?.component_totals ?? {}).map((s) => <option key={s} value={s}>{componentStateText(s)}</option>)}
        </select>
        <ScrollBox label="component states">
          <table style={tableStyle} aria-label="component states">
            <thead><tr><Th>Component</Th><Th>Kind</Th><Th>Deployed by</Th><Th>State</Th><Th>Basis</Th></tr></thead>
            <tbody>{(ws?.components ?? []).filter((c) => stateFilter === '' || c.state === stateFilter).slice(0, 400).map((c) => (
              <tr key={c.component_id}><Td mono>{c.component_id}</Td><Td>{c.kind}{c.layer !== null ? ` · ${c.layer}` : ''}</Td><Td>{c.deployed_by.join(', ') || '—'}</Td><Td>{componentStateText(c.state)}</Td><Td>{c.basis}</Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      </Panel>

      <Panel title="Closure gap report (V04-T-018, V07-T-004)">
        {ws?.closure === null || ws === null ? <p style={muted}>unavailable: the committed manifest cannot be read</p> : (
          <>
            <p>{ws.closure.statement}</p>
            <ul>{Object.entries(ws.closure.totals).map(([d, n]) => <li key={d}>{d}: {n} of 92 logical components open</li>)}</ul>
          </>
        )}
      </Panel>

      <Panel title="The component manifest (generated from source)">
        <label htmlFor="cm-layer">Layer </label>
        <select id="cm-layer" style={inputStyle} value={layer} onChange={(e) => setLayer(e.target.value)}>
          <option value="">every layer</option>{LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label htmlFor="cm-kind"> Unit kind </label>
        <select id="cm-kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">every kind</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        {view === null ? <p style={muted}>reading…</p> : (
          <>
            <p style={muted}>File <Mono>{shortDigest(view.file_digest)}</Mono> · {String(view.summary['deployable_units'] ?? '')} units · {String(view.summary['logical_components'] ?? '')} logical components</p>
            <table style={tableStyle} aria-label="deployable units">
              <thead><tr><Th>Unit</Th><Th>Kind</Th><Th>Layers</Th><Th>Components</Th><Th>State boundary</Th><Th>Depends on</Th></tr></thead>
              <tbody>{view.units.map((u) => (
                <tr key={String(u['path'])}><Td mono>{String(u['unit_id'] ?? u['path'])}</Td><Td>{String(u['kind'])}</Td><Td>{((u['layers'] ?? []) as string[]).join(', ') || '—'}</Td>
                  <Td>{((u['component_ids'] ?? []) as string[]).length}</Td><Td>{(((u['state_boundary'] ?? {}) as Record<string, unknown>)['schemas'] as string[] | undefined ?? []).join(', ') || 'no owned state'}</Td>
                  <Td>{((u['dependencies'] ?? []) as string[]).join(', ') || '—'}</Td></tr>
              ))}</tbody>
            </table>
            <ScrollBox label="service manifests">
              <table style={tableStyle} aria-label="service manifests">
                <thead><tr><Th>Component</Th><Th>State class</Th><Th>Contracts</Th><Th>Declared SLO (B64 computes)</Th><Th>Recovery — product semantics</Th></tr></thead>
                <tbody>{view.logical_components.map((c) => {
                  const contracts = (c['contracts'] ?? {}) as Record<string, unknown>; const slo = (c['slo'] ?? {}) as Record<string, unknown>;
                  return (
                    <tr key={String(c['component_id'])}><Td><Mono>{String(c['component_id'])}</Mono> {String(c['name'])}</Td><Td>{String(c['state_class'])}</Td>
                      <Td>{((contracts['interfaces'] ?? []) as string[]).join(' ')} · {((contracts['schema_types'] ?? []) as string[]).join(' ')}</Td>
                      <Td>{((slo['targets'] ?? []) as Array<Record<string, unknown>>).map((t) => `${String(t['indicator'])} ${String(t['target'])}`).join('; ')}</Td>
                      <Td>{String(((c['recovery'] ?? {}) as Record<string, unknown>)['affected_product_semantics'] ?? '')}</Td></tr>
                  );
                })}</tbody>
              </table>
            </ScrollBox>
          </>
        )}
      </Panel>

      <Panel title="Monitor runs and the ledger">
        <ul>{(ws?.runs ?? []).slice(0, 10).map((r) => <li key={String(r['run_id'])}>{String(r['recorded_at'])} · {String(r['via'])} · opened {String(r['opened'])} · resolved {String(r['resolved'])} · open after {String(r['open_after'])}</li>)}</ul>
        <ScrollBox label="ledger">
          <ul>{(ws?.ledger ?? []).slice(0, 60).map((e) => <li key={String(e['event_id'])}>{String(e['occurred_at'])} · {String(e['event'])} {e['version'] !== null ? `v${String(e['version'])}` : ''} · {String(e['actor_name'] ?? e['actor_principal_id'])}</li>)}</ul>
        </ScrollBox>
        <p style={muted}>{ws?.boundary}</p>
      </Panel>
    </>
  );
}
