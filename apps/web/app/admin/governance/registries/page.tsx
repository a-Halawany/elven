'use client';
/**
 * THE REGISTRIES AND THE TRACE / IMPACT EXPLORER — CP-6 B107 §RG (0115_b107_x_rg; F-P7D-25, F-P7-F-12: ES-02-001, ES-06-001..005, PR-08-001/-002,
 * CAP-AU-09, V04-T-012, DP-67-002/-005). Status FIRST: the build identity, every source reconciled against the repository (in sync / drifted /
 * never imported), the orphans by rule (listed, never hidden), the lint, the open holds; then the TRACE EXPLORER (an artifact up to its
 * authorities and down to its dependents, as of any instant), the IMPACT EXPLORER (preview with its digest → record on that digest; a
 * proposal is never styled like a change), the verification records (the review shows eligibility, the exact digest and the consequence),
 * the fixtures, the engineering exceptions imported from EXCEPTIONS.md (reported, never closed here) and the ledger.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words. The repository's registers are read-only and stay
 * authoritative. The admission check is the construction half — production admission is R1. Demonstration records are SYNTHETIC.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../../lib/api';
import {
  buildTree, dayText, exceptionText, fixtureEligibility, holdText, impactConsequence, impactGroups, latestOnly, lifecycleText, reviewEligibility, rg, shortDigest, sourceStateText,
  verificationText, type Impact, type Overview, type Receipt as Rcpt, type Trace, type TreeNode,
} from '../../../../lib/governance-rg-b107';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../../components/ui';
import { GovernedButton, Mono, ScrollBox } from '../../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Row = Record<string, unknown>;
const proposalStyle = { border: '1px dashed var(--eye-color-border-strong)', padding: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' };
const changeStyle = { borderInlineStart: '4px solid var(--eye-color-warning)', paddingInlineStart: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' };
const heldStyle = { color: 'var(--eye-color-critical)', fontWeight: 600 };
const muted = { color: 'var(--eye-color-ink-muted)' };

function Tree({ nodes, label }: { nodes: TreeNode[]; label: string }) {
  if (nodes.length === 0) return <p style={muted}>{label}: nothing linked.</p>;
  return (
    <ul aria-label={label}>
      {nodes.map((t) => (
        <li key={t.node.artifact_id}>
          <span style={t.node.stale ? heldStyle : undefined}>{t.node.relation}</span> → <strong>{t.node.kind}</strong> <Mono>{t.node.key}</Mono> v{t.node.version} · {lifecycleText(t.node.lifecycle)}
          {t.node.stale ? <span style={heldStyle}> · STALE — an end moved since the link was asserted</span> : null}
          {t.node.scope === 'DOMAIN' ? <span style={muted}> · a domain's own record</span> : null}
          {t.children.length > 0 ? <Tree nodes={t.children} label={`${label} under ${t.node.key}`} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default function RegistriesPage() {
  const session = getSession();
  const me = useMemo(() => ({ principalId: session?.principalId ?? '', roles: (session?.bindings ?? []).map((b) => `${b.roleCode}@${b.scope}`) }), [session]);
  const isSteward = me.roles.includes('conformance_steward@PLATFORM');
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  // the trace explorer
  const [q, setQ] = useState(''); const [found, setFound] = useState<Row[]>([]); const [selected, setSelected] = useState<string>('');
  const [asOf, setAsOf] = useState(''); const [depth, setDepth] = useState(4); const [trace, setTrace] = useState<Trace | null>(null);
  const [inh, setInh] = useState<Row | null>(null); const [adm, setAdm] = useState<Row | null>(null);
  const traceGuard = useRef(latestOnly());
  // the impact explorer
  const [proposed, setProposed] = useState(''); const [trigger, setTrigger] = useState<'change' | 'proposal'>('proposal');
  const [impact, setImpact] = useState<Impact | null>(null); const impactGuard = useRef(latestOnly());
  // orphans by rule
  const [rule, setRule] = useState<string>(''); const [ruleRows, setRuleRows] = useState<Row[] | null>(null); const ruleGuard = useRef(latestOnly());
  // verification and fixtures
  const [recordId, setRecordId] = useState(''); const [cases, setCases] = useState<Row[] | null>(null); const [reviewReason, setReviewReason] = useState(''); const recGuard = useRef(latestOnly());
  const [fxReason, setFxReason] = useState(''); const [fxClass, setFxClass] = useState('stale');

  const load = useCallback(async () => {
    const r = await rg.overview();
    if (r.ok && r.data !== undefined) { setOv(r.data); setReceipt(r.data.receipt); } else setError(r.error ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // the trace, loaded by selection — only the newest answer is applied
  useEffect(() => {
    if (selected === '') { setTrace(null); setInh(null); setAdm(null); return; }
    const n = traceGuard.current.next();
    setTrace(null); setInh(null); setAdm(null);
    const at = asOf === '' ? null : new Date(asOf).toISOString();
    void Promise.all([rg.trace({ artifactId: selected }, depth, at), rg.inheritance({ artifactId: selected }), rg.admission({ artifactId: selected })]).then(([t, i, a]) => {
      if (!traceGuard.current.isLatest(n)) return;
      if (t.ok && t.data !== undefined) setTrace(t.data.trace); else setError(t.error ?? null);
      setInh(i.ok && i.data !== undefined ? i.data.inheritance : null); setAdm(a.ok && a.data !== undefined ? a.data.admission : null);
    });
  }, [selected, asOf, depth]);

  useEffect(() => {
    if (rule === '') { setRuleRows(null); return; }
    const n = ruleGuard.current.next();
    void rg.orphans(rule, 200, 0).then((r) => {
      if (!ruleGuard.current.isLatest(n)) return;
      if (r.ok && r.data !== undefined) setRuleRows(r.data.orphans.rules[0]?.orphans ?? []); else setError(r.error ?? null);
    });
  }, [rule]);

  useEffect(() => {
    if (recordId === '') { setCases(null); return; }
    const n = recGuard.current.next();
    void rg.verification(recordId).then((r) => { if (recGuard.current.isLatest(n)) setCases(r.ok && r.data !== undefined ? r.data.cases : null); });
  }, [recordId]);

  async function search() {
    setError(null);
    const r = await rg.search(q);
    if (r.ok && r.data !== undefined) setFound(r.data.artifacts); else setError(r.error ?? null);
  }
  async function previewImpact() {
    if (selected === '') return;
    setError(null); setImpact(null);
    const n = impactGuard.current.next();
    const r = await rg.impactPreview([{ artifactId: selected, ...(proposed === '' ? {} : { proposedDigest: proposed }) }]);
    if (!impactGuard.current.isLatest(n)) return;
    if (r.ok && r.data !== undefined) setImpact(r.data.impact); else setError(r.error ?? null);
  }
  const selectedRow = found.find((f) => f['artifact_id'] === selected) ?? null;
  const record = (ov?.verification ?? []).find((v) => v['record_id'] === recordId) ?? null;
  const proposedOk = proposed === '' || /^[0-9a-f]{64}$/.test(proposed);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Registries &amp; traceability</h1>
      <p style={muted}>{ov?.boundary ?? 'The repository\'s registers are imported read-only and stay authoritative.'}</p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Build identity (ES-06-003)">
        {ov === null ? <p style={muted}>loading…</p> : (
          <ul aria-label="build identity">
            <li>Head SHA: {ov.build['head_sha'] === null ? <strong>unstated</strong> : <Mono>{String(ov.build['head_sha'])}</Mono>} <span style={muted}>({String(ov.build['head_sha_source'])})</span></li>
            <li>Migration head: <Mono>{String(ov.database_identity['migration_head'] ?? 'unstated')}</Mono> · policy bundle <Mono>{String(ov.build['policy_bundle'] ?? 'unstated')}</Mono></li>
            <li>Conformance manifest: <Mono title={String(ov.build['manifest_digest'] ?? '')}>{ov.build['manifest_digest'] === null ? 'unreadable' : shortDigest(ov.build['manifest_digest'])}</Mono></li>
            <li>Requirement snapshot: {String(ov.requirement_snapshot['count'])} current · <Mono title={String(ov.requirement_snapshot['digest'])}>{shortDigest(ov.requirement_snapshot['digest'])}</Mono></li>
          </ul>
        )}
      </Panel>

      <Panel title="Sources — the repository reconciled against the registry">
        <table style={tableStyle} aria-label="sources">
          <thead><tr><Th>Source</Th><Th>State</Th><Th>Last import</Th><Th>Rows</Th><Th>Unresolved links</Th></tr></thead>
          <tbody>
            {(ov?.reconciliation ?? []).map((s) => {
              const last = (ov?.sources ?? []).find((x) => x['source_path'] === s.source_path);
              return (
                <tr key={s.source_path}>
                  <Td mono>{s.source_path}</Td>
                  <Td><span style={s.state === 'in_sync' ? undefined : heldStyle}>{sourceStateText(s.state)}</span></Td>
                  <Td>{s.imported_at === null ? '—' : `${String(s.imported_at)} by ${String(last?.['imported_by_name'] ?? 'the steward')}`}</Td>
                  <Td>{last === undefined ? '—' : String(last['row_count'])}</Td>
                  <Td>{last === undefined ? '—' : String((last['counts'] as Row | undefined)?.['unresolved'] ?? 0)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!confirmImport ? (
          <div>
            <button style={{ marginBlockStart: 'var(--eye-space-8)' }} disabled={!isSteward} onClick={() => setConfirmImport(true)}>Review the import</button>
            {!isSteward ? <p style={muted}>Disabled: importing is the conformance steward's act (PLATFORM).</p> : null}
          </div>
        ) : (
          <div style={changeStyle}>
            <p>Reads every source (the repository is never written), writes only the rows that changed (a new version; the old one stays resolvable), retires the rows a
              source no longer declares, and records the change impact of any normative change — which holds the release candidates depending on it.</p>
            <GovernedButton label="Import the registers" pendingLabel="Importing…" onRun={async () => {
              setError(null);
              const r = await rg.importRegisters();
              setConfirmImport(false);
              if (r.ok) await load(); else setError(r.error ?? null);
            }} />
            <button onClick={() => setConfirmImport(false)}>Cancel</button>
          </div>
        )}
      </Panel>

      <Panel title="The registry by kind">
        <table style={tableStyle} aria-label="counts">
          <thead><tr><Th>Kind</Th><Th>Lifecycle</Th><Th>Current</Th></tr></thead>
          <tbody>{(ov?.counts ?? []).map((c) => <tr key={`${c.kind}-${c.lifecycle}`}><Td>{c.kind}</Td><Td>{lifecycleText(c.lifecycle)}</Td><Td>{c.n}</Td></tr>)}</tbody>
        </table>
      </Panel>

      <Panel title={`Orphans — ${ov?.orphans.total ?? '…'} listed, never hidden`}>
        <table style={tableStyle} aria-label="orphan rules">
          <thead><tr><Th>Rule</Th><Th>What is missing</Th><Th>Basis</Th><Th>Count</Th><Th>First</Th></tr></thead>
          <tbody>
            {(ov?.orphans.rules ?? []).map((r) => (
              <tr key={r.rule_id}>
                <Td><button onClick={() => setRule(r.rule_id)} aria-label={`list ${r.rule_id}`}>{r.rule_id}</button></Td>
                <Td>{r.description}</Td><Td>{r.basis}</Td><Td><span style={r.count > 0 ? heldStyle : undefined}>{r.count}</span></Td>
                <Td>{r.orphans.map((o) => String(o['key'])).join(', ')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {ruleRows !== null ? <ScrollBox label={`orphans of ${rule}`}><ul>{ruleRows.map((o) => <li key={String(o['artifact_id'])}><Mono>{String(o['key'])}</Mono> — {String(o['title'])}</li>)}</ul></ScrollBox> : null}
      </Panel>

      <Panel title="The lint — control order, weakening, compound obligations, ownerless artifacts, cycles">
        {ov === null ? null : (
          <ul aria-label="lint">
            {(['control_order', 'weakening', 'compound', 'ownerless', 'circular'] as const).map((k) => (
              <li key={k}><strong>{k.replace('_', ' ')}</strong>: {String(((ov.lint[k] ?? {}) as Row)['count'] ?? 0)}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Holds">
        <ul aria-label="holds">
          {(ov?.holds ?? []).map((h) => <li key={String(h['hold_id'])}><Mono>{String(h['external_key'] ?? h['subject_artifact'])}</Mono> — <span style={h['lifted_at'] === null ? heldStyle : muted}>{holdText(h)}</span>
            {h['origin'] !== null && h['origin'] !== undefined ? <span style={muted}> ({String(h['origin'])})</span> : null}</li>)}
        </ul>
      </Panel>

      <Panel title="Trace explorer — up to the authorities, down to the dependents">
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
          <label htmlFor="rg-q">Key or title<br /><input id="rg-q" style={inputStyle} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button disabled={q.trim().length < 2} onClick={() => void search()}>Search</button>
          <label htmlFor="rg-asof">As of (blank = now)<br /><input id="rg-asof" type="datetime-local" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
          <label htmlFor="rg-depth">Depth<br /><select id="rg-depth" style={inputStyle} value={depth} onChange={(e) => setDepth(Number(e.target.value))}>{[1, 2, 3, 4, 6, 8].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        </div>
        {found.length > 0 ? (
          <label htmlFor="rg-pick">Artifact<br /><select id="rg-pick" style={{ ...inputStyle, inlineSize: '100%' }} value={selected} onChange={(e) => { setSelected(e.target.value); setImpact(null); }}>
            <option value="">choose an artifact</option>
            {found.map((f) => <option key={String(f['artifact_id'])} value={String(f['artifact_id'])}>{String(f['kind'])} · {String(f['external_key'])} · v{String(f['version'])} · {lifecycleText(f['lifecycle'])}</option>)}
          </select></label>
        ) : null}
        {trace !== null ? (
          <div>
            <p><strong>{String(trace.artifact['kind'])}</strong> <Mono>{String(trace.artifact['external_key'])}</Mono> v{String(trace.artifact['version'])} as of {trace.as_of} · authority {String(trace.artifact['authority_class'] ?? 'unstated')}</p>
            {trace.up.truncated || trace.down.truncated ? <p style={heldStyle}>The walk was truncated — nothing beyond it is inferred.</p> : null}
            <h3>Upward (authorities)</h3><Tree nodes={buildTree(trace.up.nodes, selected)} label="upward" />
            <h3>Downward (dependents)</h3><Tree nodes={buildTree(trace.down.nodes, selected)} label="downward" />
            <p style={muted}>Versions: {trace.versions.map((v) => `v${String(v['version'])} ${String(v['lifecycle'])} from ${String(v['effective_from'])}`).join(' · ')}</p>
          </div>
        ) : null}
        {inh !== null ? (
          <div aria-label="inheritance">
            <p>Inheritance: {inh['conformant'] === true ? <strong>chain closed</strong> : <span style={heldStyle}>NOT CONFORMANT — {((inh['findings'] as Row[]) ?? []).map((f) => String(f['class'])).join(', ')}</span>}
              {inh['controlling_authority'] !== null ? <> · controlling authority <Mono>{String((inh['controlling_authority'] as Row)['key'])}</Mono></> : null}</p>
          </div>
        ) : null}
        {adm !== null ? (
          <p aria-label="admission">Admission check (construction half): {adm['admissible'] === true ? <strong>no blocking finding</strong> : <span style={heldStyle}>BLOCKED — {((adm['blocking'] as Row[]) ?? []).map((b) => String(b['class'])).join(', ')}</span>}
            <span style={muted}> · {String(adm['production_admission'])}</span></p>
        ) : null}
      </Panel>

      <Panel title="Impact explorer — deterministic change impact">
        {selected === '' ? <p style={muted}>Choose an artifact in the trace explorer first.</p> : (
          <div>
            <label htmlFor="rg-proposed">Proposed digest (optional, 64 hex)<br /><input id="rg-proposed" style={{ ...inputStyle, inlineSize: '100%' }} value={proposed} onChange={(e) => setProposed(e.target.value.trim())} /></label>
            {!proposedOk ? <p style={heldStyle}>A proposed digest is 64 lower-case hex.</p> : null}
            <button disabled={!proposedOk} onClick={() => void previewImpact()}>Preview the impact of {String(selectedRow?.['external_key'] ?? 'the artifact')}</button>
          </div>
        )}
        {impact !== null ? (
          <div>
            <p>Impact digest <Mono title={impact.digest}>{shortDigest(impact.digest)}</Mono> · {impact.dependents.length} dependents{impact.truncated ? ' (TRUNCATED — nothing inferred beyond)' : ''}</p>
            {impactGroups(impact).map((g) => <p key={g.kind}><strong>{g.kind}</strong> ({g.items.length}): {g.items.map((i) => `${i.key} [depth ${i.depth}]`).join(', ')}</p>)}
            <p>Requirements to re-verify: {impact.requirements_to_reverify.map((r) => String(r['key'])).join(', ') || 'none'}</p>
            <p>Decision-active products: {impact.decision_active.map((r) => String(r['key'])).join(', ') || 'none'}</p>
            <fieldset><legend>Record as</legend>
              <label><input type="radio" name="rg-trigger" checked={trigger === 'proposal'} onChange={() => setTrigger('proposal')} /> a proposal (holds nothing)</label>{' '}
              <label><input type="radio" name="rg-trigger" checked={trigger === 'change'} onChange={() => setTrigger('change')} /> a change (holds dependent release candidates)</label>
            </fieldset>
            <div style={trigger === 'proposal' ? proposalStyle : changeStyle}>
              {impactConsequence(impact, trigger).map((l) => <p key={l}>{l}</p>)}
              <GovernedButton label={trigger === 'proposal' ? 'Record the proposal\'s impact' : 'Record the change\'s impact'} pendingLabel="Recording…" disabled={!isSteward} onRun={async () => {
                setError(null);
                const r = await rg.impactRecord([{ artifactId: selected, ...(proposed === '' ? {} : { proposedDigest: proposed }) }], impact.digest, trigger);
                if (r.ok && r.data !== undefined) { setImpact(r.data.impact); await load(); } else setError(r.error ?? null);
              }} />
              {!isSteward ? <p style={muted}>Disabled: recording an impact is the conformance steward's act.</p> : null}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title="Verification records (V04-T-012)">
        <table style={tableStyle} aria-label="verification records">
          <thead><tr><Th>Record</Th><Th>Kind</Th><Th>Standing</Th><Th>Cases</Th><Th>Valid until</Th></tr></thead>
          <tbody>{(ov?.verification ?? []).map((v) => (
            <tr key={String(v['record_id'])}>
              <Td><button onClick={() => setRecordId(String(v['record_id']))}>{String(v['source_name'])}</button></Td><Td>{String(v['source_kind'])}</Td>
              <Td><span style={v['invalidated'] === true || v['expired'] === true ? heldStyle : undefined}>{verificationText(v)}</span></Td>
              <Td>{String((v['totals'] as Row)['passed'])}/{String((v['totals'] as Row)['cases'])} passed</Td><Td>{String(v['valid_until'])}</Td>
            </tr>))}
          </tbody>
        </table>
        {record !== null && cases !== null ? (
          <div>
            <ScrollBox label="cases"><ul>{cases.map((c) => <li key={String(c['case_no'])}>{String(c['status'])} · {String(c['test_title'])} · verifies {((c['verifies'] as string[]) ?? []).join(', ') || 'nothing named'}</li>)}</ul></ScrollBox>
            {(() => {
              const e = reviewEligibility(record, me);
              return (
                <div style={changeStyle}>
                  <p>The accountable review of <strong>{String(record['source_name'])}</strong> on its exact digest <Mono title={String(record['source_digest'])}>{shortDigest(record['source_digest'])}</Mono>. {e.reason}.</p>
                  <label htmlFor="rg-review-reason">Reason (8+ characters)<br /><input id="rg-review-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={reviewReason} onChange={(ev) => setReviewReason(ev.target.value)} /></label>
                  {(['accepted', 'rejected'] as const).map((d) => (
                    <GovernedButton key={d} label={d === 'accepted' ? 'Accept the record' : 'Reject the record'} pendingLabel="Recording…" disabled={!e.eligible || reviewReason.trim().length < 8} onRun={async () => {
                      setError(null);
                      const r = await rg.review(String(record['record_id']), { decision: d, digest: String(record['source_digest']), reason: reviewReason });
                      if (r.ok) { setReviewReason(''); await load(); } else setError(r.error ?? null);
                    }} />
                  ))}
                </div>
              );
            })()}
          </div>
        ) : null}
      </Panel>

      <Panel title="Fixtures (DP-67-002 / -005)">
        <label htmlFor="rg-fx-reason">Reason (8+ characters)<br /><input id="rg-fx-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={fxReason} onChange={(e) => setFxReason(e.target.value)} /></label>
        <label htmlFor="rg-fx-class">Quarantine class<br /><select id="rg-fx-class" style={inputStyle} value={fxClass} onChange={(e) => setFxClass(e.target.value)}>
          {['stale', 'non_representative', 'contaminated', 'privacy_unsafe', 'irreproducible', 'indistinguishable'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select></label>
        <table style={tableStyle} aria-label="fixtures">
          <thead><tr><Th>Fixture</Th><Th>Lifecycle</Th><Th>Expires</Th><Th>Consumers</Th><Th>Acts</Th></tr></thead>
          <tbody>{(ov?.fixtures ?? []).map((f) => {
            const e = fixtureEligibility(f, me); const a = (f['attributes'] ?? {}) as Row;
            return (
              <tr key={String(f['artifact_id'])}>
                <Td><Mono>{String(f['external_key'])}</Mono> v{String(f['version'])} — {String(f['title'])}<br /><span style={muted}>{String(a['purpose'] ?? '')} · {String(a['classification'] ?? '')} · seed {String(a['seed'] ?? '')}</span></Td>
                <Td><span style={f['lifecycle'] === 'active' ? undefined : heldStyle}>{lifecycleText(f['lifecycle'])}</span></Td>
                <Td>{f['expired'] === true ? <span style={heldStyle}>EXPIRED {String(a['valid_until'])}</span> : String(a['valid_until'] ?? '')}</Td>
                <Td>{String(f['consumers'])}</Td>
                <Td>
                  <GovernedButton label="Approve" pendingLabel="Approving…" disabled={!e.eligible || fxReason.trim().length < 8} onRun={async () => {
                    setError(null);
                    const r = await rg.approveFixture(String(f['artifact_id']), { version: Number(f['version']), digest: String(f['digest']), reason: fxReason });
                    if (r.ok) await load(); else setError(r.error ?? null);
                  }} />
                  <span style={muted}> {e.reason} (digest <Mono>{shortDigest(f['digest'])}</Mono>)</span>
                  <GovernedButton label="Quarantine" pendingLabel="Quarantining…" variant="critical" disabled={!isSteward || f['lifecycle'] === 'quarantined' || fxReason.trim().length < 8} onRun={async () => {
                    setError(null);
                    const r = await rg.quarantineFixture(String(f['artifact_id']), { reasonClass: fxClass, reason: fxReason });
                    if (r.ok) await load(); else setError(r.error ?? null);
                  }} />
                </Td>
              </tr>);
          })}</tbody>
        </table>
        <p style={muted}>Quarantine invalidates every record whose tests consumed the fixture and names the tests to re-run.{!isSteward ? ' Quarantine is the conformance steward\'s act.' : ''}</p>
        <GovernedButton label="Sweep expired fixtures" pendingLabel="Sweeping…" variant="quiet" disabled={!isSteward} onRun={async () => {
          const r = await rg.sweepFixtures(); if (r.ok) await load(); else setError(r.error ?? null);
        }} />
      </Panel>

      <Panel title="Engineering exceptions (EXCEPTIONS.md — read only)">
        <p style={muted}>Imported from the repository; an expired entry is reported here and never closed or renewed by the product — that is the owner's. The in-product exception registry is the workspace's.</p>
        <ul aria-label="engineering exceptions">{(ov?.engineering_exceptions ?? []).map((e) => <li key={String(e['external_key'])}><Mono>{String(e['external_key'])}</Mono> — <span style={e['expired'] === true ? heldStyle : undefined}>{exceptionText(e)}</span></li>)}</ul>
        <p style={muted}>As of {dayText(ov?.today)}.</p>
      </Panel>

      <Panel title="Ledger (recent)">
        <ScrollBox label="ledger"><ul>{(ov?.ledger ?? []).map((l) => <li key={String(l['event_id'])}>{String(l['occurred_at'])} · {String(l['event'])} · {String(l['actor_name'] ?? '')}</li>)}</ul></ScrollBox>
      </Panel>
    </>
  );
}
