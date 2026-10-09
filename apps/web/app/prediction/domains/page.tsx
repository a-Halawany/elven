'use client';
/**
 * Domains — the Domain Intelligence workspace (WS-10; UX-36-001..006) — CP-6 B33 §PK (0111 §PK; F-P4-15 ch.31/36).
 *
 * THE PACKAGES: each domain package with its state, its active certified version, its last conformance and health runs, its open migrations.
 * ONE PACKAGE, in the order the chapter asks: SCOPE (tenant, domain, purpose, geography, horizon, classification, effective time, freshness,
 * provenance — explicit), the PORTFOLIO (versions, the five sections and who approved each at which digest, the runs), EVIDENCE AND
 * ASSESSMENTS (source diversity, approved / limited, as-of replay), OPTIONS AND MONITORING (watchlists with their coverage, alerts, events,
 * links), then the COMMANDS — resolve, map, compare, assess, forecast, alert, update, replay — each through its own governed route with a
 * receipt. A disabled function is shown DISABLED with its reason; a conflict is a banner. Refusals are the server's words. Nothing here
 * certifies, measures or decides: the response to what a package shows is a decision of the decision layer.
 * BOUNDARY: signing / publisher identity → B77; all-layer namespaces → B78; marketplace → B112; parity → B111; signed acceptance → R2.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import {
  FUNCTIONS, SECTIONS, coverageLine, dayOf, diversityLine, gateMark, measuredLine, packages, runLine, sectionLine, versionMark,
  type AssessmentRow, type Definition, type PackageRow, type PackageView, type RunRow,
} from '../../../lib/packages-b33';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Row = Record<string, unknown>;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;

export default function DomainsPage() {
  return <Suspense fallback={null}><Domains /></Suspense>;
}

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function Domains() {
  const { scope, me } = useShell();
  const params = useSearchParams();
  const roles = new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope === 'TENANT').map((b) => b.roleCode));
  const isSpecialist = roles.has('domain_specialist'); const isAnalyst = roles.has('domain_analyst');
  const [list, setList] = useState<PackageRow[] | null>(null);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [packageId, setPackageId] = useState<string>(params.get('package') ?? '');
  const [view, setView] = useState<PackageView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [reason, setReason] = useState('');
  const [asOf, setAsOf] = useState(''); const [replayId, setReplayId] = useState(''); const [replay, setReplay] = useState<Row | null>(null);
  // assessment form (an analyst's proposal through the governed route)
  const [tpl, setTpl] = useState(''); const [statement, setStatement] = useState(''); const [confidence, setConfidence] = useState('0.6');
  const [subjects, setSubjects] = useState(''); const [evidence, setEvidence] = useState('');

  const loadList = async () => {
    const r = await packages.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the packages could not be read'); return; }
    setList(r.data.packages); setDefinitions(r.data.definitions);
    setPackageId((prev) => (prev === '' ? (r.data?.packages[0]?.package_id ?? '') : prev));
  };
  // the package chosen LAST wins: a slower answer for an earlier choice is dropped (the B25 walk's lesson)
  const wanted = useRef<string>('');
  const loadPackage = async () => {
    wanted.current = packageId;
    if (packageId === '') { setView(null); return; }
    const asked = packageId;
    const r = await packages.read(scope, asked);
    if (wanted.current !== asked) return;
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the package could not be read'); return; }
    setProblem(null); setView(r.data);
  };
  useEffect(() => { void loadList(); }, [scope]);
  useEffect(() => { setReplay(null); void loadPackage(); }, [scope, packageId]);

  /** Every command: the server's words on a refusal, the receipt on success, the package read again. */
  const act = async (fn: () => Promise<{ ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt?: ReceiptT } }>, what: string) => {
    const r = await fn();
    if (!r.ok) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`); throw new Error(what); }
    setProblem(null); setReceipt(r.data?.receipt ?? null);
    await loadList(); await loadPackage();
  };

  if (list === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading the domain packages…</Empty>;
  const v = view;
  const active = v?.versions.find((x) => x.state === 'active') ?? null;
  const open = v?.versions.find((x) => x.state === 'proposed' || x.state === 'certified') ?? null;
  const m = (active ?? open ?? v?.versions[0])?.manifest as Row | undefined;
  const controls = (m?.['controls'] ?? {}) as Row; const scopeDecl = (controls['scope'] ?? {}) as Row;
  const blocked = v === null ? [] : Object.entries(v.gates).filter(([fn, g]) => fn !== 'package' && (g.state === 'disabled' || g.state === 'conflicted'));
  const lastRun = (mode: string): RunRow | undefined => v?.runs.find((r) => r.mode === mode);
  const certRun = lastRun('certification'); const healthRun = lastRun('health'); const accRun = lastRun('acceptance');
  const owner = v !== null && v.package.owner_principal_id === me.principalId;
  const reasonOk = reason.trim().length >= 8;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Domains</h1>
      <p style={muted}>
        A domain package extends the core — sources, an ontology extension mapped onto the core&apos;s types, indicators, models, assessment
        templates, watchlists, controls — without forking its evidence, graph, forecasts, scenarios or decisions. A named domain specialist certifies
        each section; a conformance run must pass; the owner activates. An incompatible function is disabled with its reason while what the
        package recorded stays readable. AI proposes; named people approve; the response is decided in the decision layer.
      </p>
      <p style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>Boundary: package signing and publisher identity (B77), extension namespaces in every layer (B78), marketplace and purchase (B112), cross-profile parity (B111) and the signed acceptance record (R2) are not part of this workspace.</p>
      <p><Link href="/prediction/domains/competitors">Competitor intelligence →</Link></p>

      <section aria-labelledby="dm-list" style={section}>
        <h2 id="dm-list" style={h2}>Packages</h2>
        {list.length === 0 ? <Empty>No domain package is declared in this domain.</Empty> : (
          <ScrollBox label="Domain packages">
            <table style={tableStyle}>
              <thead><tr><Th>Package</Th><Th>Kind</Th><Th>Active version</Th><Th>Latest</Th><Th>Conformance</Th><Th>Health</Th><Th>Migrations</Th></tr></thead>
              <tbody>{list.map((p) => (
                <tr key={p.package_id}>
                  <Td><button type="button" onClick={() => setPackageId(p.package_id)} aria-pressed={p.package_id === packageId} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>{p.title}</button> <Mono>{p.package_key}</Mono>{p.state === 'retired' ? <> — RETIRED</> : null}</Td>
                  <Td>{p.domain_kind}</Td>
                  <Td>{p.active === null ? 'none' : `v${p.active.version} (${p.active.semver})`}{p.active !== null && Object.keys(p.active.disabled_functions ?? {}).length > 0 ? <> — <Mark m={gateMark('disabled')} /> {Object.keys(p.active.disabled_functions).join(', ')}</> : null}{p.active?.conflict ? <> — <Mark m={gateMark('conflicted')} /></> : null}</Td>
                  <Td>{p.latest === null ? '—' : <><Mark m={versionMark(p.latest.state)} /> v{p.latest.version}</>}</Td>
                  <Td>{p.conformance === null ? 'not run' : `${p.conformance.mode} ${p.conformance.passed ? 'passed' : 'FAILED'} · ${fmtInstant(p.conformance.ran_at)}`}</Td>
                  <Td>{p.health === null ? 'not re-checked' : `${p.health.passed ? 'sound' : 'FAULTS'} · ${fmtInstant(p.health.ran_at)}`}</Td>
                  <Td>{p.open_migrations}</Td>
                </tr>))}</tbody>
            </table>
          </ScrollBox>
        )}
        <label htmlFor="dm-package" style={{ display: 'block', marginBlockStart: 'var(--eye-space-12)' }}>Package</label>
        <select id="dm-package" style={inputStyle} value={packageId} onChange={(e) => setPackageId(e.target.value)}>
          <option value="">— choose a package —</option>
          {list.map((p) => <option key={p.package_id} value={p.package_id}>{p.title} ({p.package_key})</option>)}
        </select>
      </section>

      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      {v === null ? <Empty>No package chosen.</Empty> : (
        <>
          {blocked.length > 0 ? (
            <div role="alert" style={{ ...section, borderColor: 'var(--eye-color-critical)' }}>
              <strong>Incompatible functions — disabled until the cause is repaired, the health re-run passes and a domain specialist re-enables them:</strong>
              <ul>{blocked.map(([fn, g]) => <li key={fn}><Mark m={gateMark(g.state)} /> {fn} — {g.reason}</li>)}</ul>
              <p style={muted}>What the package recorded stays readable; its migration is routed to the package&apos;s owner and the domain specialists.</p>
            </div>
          ) : null}

          <section aria-labelledby="dm-scope" style={section}>
            <h2 id="dm-scope" style={h2}>{v.package.title}</h2>
            <p role="status"><Mark m={gateMark(v.gates['package']?.state ?? 'not_installed')} /> — {v.gates['package']?.reason}</p>
            <DefinitionRow term="Scope">tenant <Mono>{scope.tenantId.slice(0, 8)}…</Mono> · domain <Mono>{scope.domainId.slice(0, 8)}…</Mono> · kind {v.package.domain_kind} · owner {v.package.owner_name ?? v.package.owner_principal_id}</DefinitionRow>
            <DefinitionRow term="Purpose">{Array.isArray(controls['purposes']) ? (controls['purposes'] as string[]).join(', ') : '—'}</DefinitionRow>
            <DefinitionRow term="Geography">{Array.isArray(scopeDecl['geography']) ? (scopeDecl['geography'] as string[]).join(', ') : 'not declared'}</DefinitionRow>
            <DefinitionRow term="Horizon">{String(scopeDecl['horizon'] ?? 'not declared')}</DefinitionRow>
            <DefinitionRow term="Classification">{String(controls['classification_ceiling'] ?? '—')} ceiling · retention {String(controls['retention'] ?? '—')}</DefinitionRow>
            <DefinitionRow term="Effective">{active === null ? 'no active version' : `v${active.version} (${active.semver}) active since ${fmtInstant(active.activated_at)}`}</DefinitionRow>
            <DefinitionRow term="Freshness">{healthRun === undefined ? 'not re-checked yet' : `${runLine(healthRun)} · ${fmtInstant(healthRun.ran_at)}`}</DefinitionRow>
            <DefinitionRow term="Provenance">{active === null ? '—' : <>DPG object v{String(active.object_version ?? '—')} · certified by {active.certified_by_name ?? active.certified_by ?? '—'} · manifest <Mono>{active.manifest_digest.slice(0, 12)}…</Mono></>}</DefinitionRow>
            {(() => { const inputs = controls['inputs'] as { real_public?: string[]; synthetic?: string[]; licensed_for_acceptance?: string[] } | undefined; return inputs === undefined ? null : (
              <DefinitionRow term="Inputs">real public feeds: {(inputs.real_public ?? []).join(', ') || 'none'} · SYNTHETIC: {(inputs.synthetic ?? []).join(', ') || 'none'} · a real-provider acceptance needs: {(inputs.licensed_for_acceptance ?? []).join('; ')}</DefinitionRow>); })()}
          </section>

          <section aria-labelledby="dm-portfolio" style={section}>
            <h2 id="dm-portfolio" style={h2}>Portfolio — versions, sections, runs</h2>
            <ScrollBox label="Versions">
              <table style={tableStyle}>
                <thead><tr><Th>Version</Th><Th>State</Th><Th>Proposed</Th><Th>Certified</Th><Th>Disabled</Th></tr></thead>
                <tbody>{v.versions.map((x) => (
                  <tr key={x.version}><Td>v{x.version} ({x.semver})</Td><Td><Mark m={versionMark(x.state)} /></Td><Td>{x.proposed_by_name ?? '—'} · {fmtInstant(x.proposed_at)}</Td>
                    <Td>{x.certified_at === null ? '—' : `${x.certified_by_name ?? '—'} · ${fmtInstant(x.certified_at)}`}</Td>
                    <Td>{Object.keys(x.disabled_functions ?? {}).length === 0 ? (x.conflict ? `conflict: ${String(x.conflict['reason'])}` : 'none') : Object.entries(x.disabled_functions).map(([fn, d]) => `${fn}: ${String((d as Row)['reason'])}`).join('; ')}</Td></tr>))}</tbody>
              </table>
            </ScrollBox>
            {open !== null ? (
              <>
                <h3>Version {open.version} ({open.semver}) — the five sections</h3>
                <ul>{SECTIONS.map((s) => { const st = v.sections[String(open.version)]?.[s]; return (
                  <li key={s}>{sectionLine(s, st)} <Mono>{st?.digest.slice(0, 12)}…</Mono>
                    {isSpecialist && open.state === 'proposed' && st !== undefined && st.state !== 'approved' ? (
                      <> <GovernedButton label={`Approve ${s}`} pendingLabel="approving" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.approve(scope, v.package.package_id, { version: open.version, section: s, digest: st.digest, decision: 'approved', reason: reason.trim() }), 'the approval was refused')} /></>
                    ) : null}
                  </li>); })}</ul>
                <p>{certRun === undefined ? 'No certification run yet.' : `${runLine(certRun)} · ${fmtInstant(certRun.ran_at)}`}</p>
              </>
            ) : null}
            <label htmlFor="dm-reason" style={{ display: 'block' }}>Reason (stated with every decision, 8+ characters)</label>
            <textarea id="dm-reason" style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
              {open !== null && open.state === 'proposed' ? <GovernedButton label="Run the conformance suite" pendingLabel="running" onRun={() => act(() => packages.conformance(scope, v.package.package_id, open.version, 'certification'), 'the run was refused')} /> : null}
              {open !== null && open.state === 'proposed' && isSpecialist ? <GovernedButton label={`Certify v${open.version}`} pendingLabel="certifying" disabled={!reasonOk} onRun={() => act(() => packages.certify(scope, v.package.package_id, open.version, reason.trim()), 'the certification was refused')} /> : null}
              {open !== null && open.state === 'certified' && owner ? <GovernedButton label={`Activate v${open.version}`} pendingLabel="activating" onRun={() => act(() => packages.activate(scope, v.package.package_id, open.version), 'the activation was refused')} /> : null}
              {open !== null && owner ? <GovernedButton label={`Withdraw v${open.version}`} pendingLabel="withdrawing" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.withdraw(scope, v.package.package_id, open.version, reason.trim()), 'the withdrawal was refused')} /> : null}
              {active !== null ? <GovernedButton label="Re-check health" pendingLabel="checking" variant="quiet" onRun={() => act(() => packages.health(scope, v.package.package_id), 'the health re-check was refused')} /> : null}
              {active !== null ? <GovernedButton label="Measure the acceptance focus" pendingLabel="measuring" variant="quiet" onRun={() => act(() => packages.acceptance(scope, v.package.package_id), 'the acceptance run was refused')} /> : null}
              {active !== null && isSpecialist && (Object.keys(active.disabled_functions ?? {}).length > 0 || active.conflict !== null) ? (
                <GovernedButton label="Re-enable (after a passing re-run)" pendingLabel="re-enabling" disabled={!reasonOk} onRun={() => act(() => packages.enable(scope, v.package.package_id, active.version, { functions: Object.keys(active.disabled_functions ?? {}), clearConflict: active.conflict !== null, reason: reason.trim() }), 'the re-enablement was refused')} />
              ) : null}
            </div>
            {accRun !== undefined ? <RunChecks run={accRun} title="Acceptance focus (measured)" /> : null}
            {healthRun !== undefined && !healthRun.passed ? <RunChecks run={healthRun} title="Last health re-check" /> : null}
            {v.migrations.length > 0 ? (
              <>
                <h3>Migrations</h3>
                <ul>{v.migrations.map((mg) => <li key={mg.migration_id}>{mg.state.toUpperCase()} — {mg.reason}{mg.close_reason === null ? null : <> ({mg.close_reason})</>}</li>)}</ul>
              </>
            ) : null}
          </section>

          <section aria-labelledby="dm-evidence" style={section}>
            <h2 id="dm-evidence" style={h2}>Evidence and assessments</h2>
            {v.assessments.length === 0 ? <Empty>No assessment in this package.</Empty> : (
              <ScrollBox label="Assessments">
                <table style={tableStyle}>
                  <thead><tr><Th>Assessment</Th><Th>State</Th><Th>Source diversity</Th><Th>Subjects</Th><Th>Decided</Th><Th>Act</Th></tr></thead>
                  <tbody>{v.assessments.map((a: AssessmentRow) => (
                    <tr key={`${a.assessment_id}-${a.version}`}>
                      <Td>{a.template} v{a.version}{a.material ? ' · material' : ''} — {a.statement} <span style={muted}>(confidence {a.confidence}; proposed by {a.proposed_by_kind === 'agent' ? 'the Domain Intelligence Agent' : a.proposed_by_name ?? 'a person'})</span></Td>
                      <Td>{a.state.toUpperCase()}{a.limited_reason === null ? null : <> — {a.limited_reason}</>}</Td>
                      <Td>{diversityLine(a.source_diversity)}</Td>
                      <Td>{a.subjects.map((s) => s.name).join(', ')}</Td>
                      <Td>{a.decided_at === null ? '—' : `${a.decided_by_name ?? '—'} · ${fmtInstant(a.decided_at)}`}</Td>
                      <Td>
                        {a.state === 'proposed' && (isAnalyst || isSpecialist) ? <><GovernedButton label="Approve" pendingLabel="approving" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.decideAssessment(scope, a.assessment_id, a.version, 'approve', reason.trim()), 'the approval was refused')} /> <GovernedButton label="Reject" pendingLabel="rejecting" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.decideAssessment(scope, a.assessment_id, a.version, 'reject', reason.trim()), 'the rejection was refused')} /></> : null}
                        {a.state === 'approved' && (isAnalyst || isSpecialist) ? <GovernedButton label="Mark limited" pendingLabel="limiting" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.limitAssessment(scope, a.assessment_id, reason.trim()), 'the limitation was refused')} /> : null}
                      </Td>
                    </tr>))}</tbody>
                </table>
              </ScrollBox>
            )}
            <h3 id="dm-replay">Replay — what stood at an instant</h3>
            <label htmlFor="dm-replay-id" style={{ display: 'block' }}>Assessment</label>
            <select id="dm-replay-id" style={inputStyle} value={replayId} onChange={(e) => setReplayId(e.target.value)}>
              <option value="">— choose —</option>
              {[...new Map(v.assessments.map((a) => [a.assessment_id, a])).values()].map((a) => <option key={a.assessment_id} value={a.assessment_id}>{a.template} — {a.statement.slice(0, 60)}</option>)}
            </select>
            <label htmlFor="dm-asof" style={{ display: 'block' }}>As of</label>
            <input id="dm-asof" type="datetime-local" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            <GovernedButton label="Replay" pendingLabel="replaying" variant="quiet" disabled={replayId === '' || asOf === ''} onRun={async () => {
              const r = await packages.readAssessment(scope, replayId, new Date(asOf).toISOString());
              if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the replay was refused'); throw new Error('replay'); }
              setReplay(r.data.as_of ?? { none: true });
            }} />
            {replay === null ? null : <p role="status">{replay['none'] === true ? 'Nothing stood at that instant (not yet approved).' : `Version ${String(replay['version'])} stood, ${String(replay['state_then']).toUpperCase()} then (${String(replay['state_now'])} now): ${String(replay['statement'])}`}</p>}
            <h3 id="dm-assess">Assess — propose an assessment</h3>
            <label htmlFor="dm-tpl" style={{ display: 'block' }}>Template</label>
            <select id="dm-tpl" style={inputStyle} value={tpl} onChange={(e) => setTpl(e.target.value)}>
              <option value="">— choose —</option>
              {(Array.isArray(m?.['assessment_templates']) ? (m?.['assessment_templates'] as Row[]) : []).map((t) => <option key={String(t['key'])} value={String(t['key'])}>{String(t['title'] ?? t['key'])}</option>)}
            </select>
            <label htmlFor="dm-statement" style={{ display: 'block' }}>Statement</label>
            <textarea id="dm-statement" style={textareaStyle} value={statement} onChange={(e) => setStatement(e.target.value)} />
            <label htmlFor="dm-conf" style={{ display: 'block' }}>Confidence (0–1)</label>
            <input id="dm-conf" style={inputStyle} inputMode="decimal" value={confidence} onChange={(e) => setConfidence(e.target.value)} />
            <label htmlFor="dm-subjects" style={{ display: 'block' }}>Subject entity ids (comma-separated)</label>
            <input id="dm-subjects" style={inputStyle} value={subjects} onChange={(e) => setSubjects(e.target.value)} />
            <label htmlFor="dm-evidence-in" style={{ display: 'block' }}>Evidence citations (JSON: [{'{'}kind, id, version, digest{'}'}])</label>
            <textarea id="dm-evidence-in" style={textareaStyle} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            <GovernedButton label="Propose the assessment" pendingLabel="proposing" disabled={tpl === '' || statement.trim().length < 8} onRun={async () => {
              let cites: Row[] = [];
              try { cites = JSON.parse(evidence || '[]') as Row[]; } catch { setProblem('the evidence citations are not JSON'); throw new Error('json'); }
              await act(() => packages.proposeAssessment(scope, { packageKey: String(v.package.package_key), template: tpl, statement: statement.trim(), confidence: Number(confidence),
                subjects: subjects.split(',').map((x) => x.trim()).filter((x) => x !== ''), evidence: cites }), 'the proposal was refused');
            }} />
          </section>

          <section aria-labelledby="dm-monitor" style={section}>
            <h2 id="dm-monitor" style={h2}>Options and monitoring</h2>
            <h3>Watchlists</h3>
            {v.watchlists.length === 0 ? <Empty>No watchlist.</Empty> : (
              <ul>{v.watchlists.map((w) => { const c = coverageLine(w); return (
                <li key={w.watchlist_id}><strong>{w.title}</strong> (v{w.version}, {w.state}) — owner {w.owner_name ?? w.owner_principal_id} — <span style={c.stale ? { color: 'var(--eye-color-warning)', fontWeight: 650 } : muted}>{c.text}</span>
                  {w.state === 'active' && w.owner_principal_id === me.principalId && v.alerts.some((a) => a.watchlist_id === w.watchlist_id && a.state === 'raised') ? (
                    <> <GovernedButton label="Resolve its alerts" pendingLabel="resolving" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.resolveAlerts(scope, w.watchlist_id, reason.trim()), 'the resolution was refused')} /></>) : null}
                </li>); })}</ul>
            )}
            <h3>Alerts</h3>
            {v.alerts.length === 0 ? <Empty>No alert.</Empty> : (
              <ul>{v.alerts.map((a) => (
                <li key={a.alert_id}>{a.state.toUpperCase()} — {a.title}{a.withheld_reason === null ? null : <> — WITHHELD: {a.withheld_reason}</>}
                  {a.item_state_now === null ? null : <> · attention item {a.item_state_now} (to {(a.item_route_roles ?? []).join(', ') || 'the named owner'}; owner {a.owner_name ?? '—'})</>}
                  {a.adjudication === null ? null : <> · adjudicated {a.adjudication.replace('_', ' ')}</>}
                  {a.adjudication === null && a.state !== 'withheld' && (isAnalyst || isSpecialist) ? <> <GovernedButton label="True positive" pendingLabel="recording" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.adjudicate(scope, a.alert_id, 'true_positive', reason.trim()), 'the adjudication was refused')} /> <GovernedButton label="False positive" pendingLabel="recording" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.adjudicate(scope, a.alert_id, 'false_positive', reason.trim()), 'the adjudication was refused')} /></> : null}
                </li>))}</ul>
            )}
            <h3>Events</h3>
            {v.events.length === 0 ? <Empty>No event.</Empty> : (
              <ul>{v.events.map((e) => (
                <li key={e.event_id}>{dayOf(e.occurred_on)} — {e.kind}: {e.title} ({e.state}{e.proposed_by_kind === 'agent' ? ', proposed by the Domain Intelligence Agent' : ''})
                  {e.state === 'proposed' && (isAnalyst || isSpecialist) ? <> <GovernedButton label="Confirm" pendingLabel="confirming" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.confirmEvent(scope, e.event_id, 'confirm', reason.trim()), 'the confirmation was refused')} /> <GovernedButton label="Reject" pendingLabel="rejecting" variant="quiet" disabled={!reasonOk} onRun={() => act(() => packages.confirmEvent(scope, e.event_id, 'reject', reason.trim()), 'the rejection was refused')} /></> : null}
                </li>))}</ul>
            )}
            <h3>Links to the core</h3>
            {v.links.length === 0 ? <Empty>No link.</Empty> : (
              <ul>{v.links.map((l) => <li key={l.link_id}>{l.link_kind} <Mono>{l.target_id.slice(0, 8)}…</Mono> — {l.note} ({l.state})</li>)}</ul>
            )}
          </section>

          <section aria-labelledby="dm-commands" style={section}>
            <h2 id="dm-commands" style={h2}>Commands</h2>
            <p style={muted}>Each command is the governed route that owns it — navigation, inspection, drafting, review and approval stay distinct; each answers with a receipt.</p>
            <ul>
              <li><Link href="/graph">Resolve</Link> — entity resolution in the graph (proposed, decided by the resolution manager)</li>
              <li><Link href="/twins/supply">Map</Link> — the supply network and its disruption map</li>
              <li><Link href="/prediction/domains/competitors">Compare</Link> — comparative assessments on a declared basis</li>
              <li><a href="#dm-assess">Assess</a> — propose an assessment (an analyst or specialist approves a material one)</li>
              <li><Link href="/prediction/ensembles">Forecast</Link> — a portfolio forecast on the package&apos;s targets</li>
              <li><Link href="/decisions/attention">Alert</Link> — the routed items (domain.alert, domain.package) under the published policy</li>
              <li><a href="#dm-portfolio">Update</a> — a new version: proposed, certified section by section, activated by the owner</li>
              <li><a href="#dm-replay">Replay</a> — what an assessment stood at, at an instant</li>
            </ul>
            <h3>The gate per function</h3>
            <ul>{['package', ...FUNCTIONS].map((fn) => { const g = v.gates[fn]; return g === undefined ? null : <li key={fn}>{fn}: <Mark m={gateMark(g.state)} /> — {g.reason}</li>; })}</ul>
          </section>

          <section aria-labelledby="dm-ledger" style={section}>
            <h2 id="dm-ledger" style={h2}>Ledger</h2>
            <ScrollBox label="The package's ledger"><ul>{v.ledger.slice(0, 40).map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {e.event}{e.version === null ? '' : ` (v${e.version})`} — {e.actor_name ?? 'an agent'}</li>)}</ul></ScrollBox>
          </section>
        </>
      )}

      <section aria-labelledby="dm-defs" style={section}>
        <h2 id="dm-defs" style={h2}>The four package definitions</h2>
        <p style={muted}>Tenant data declared through the package routes — each states which inputs are real public feeds, which are SYNTHETIC, and which licensed provider a real-provider acceptance would need. A public feed demonstrates the software; it never stands in for a licensed source.</p>
        <ul>{definitions.map((d) => (
          <li key={d.key}><strong>{d.title}</strong> — {d.clause}; acceptance focus: {d.focus}. Real public: {(d.inputs?.real_public ?? []).join(', ') || 'none'}; SYNTHETIC: {(d.inputs?.synthetic ?? []).join(', ') || 'none'}; licensed for a real acceptance: {(d.inputs?.licensed_for_acceptance ?? []).join('; ')}</li>))}</ul>
      </section>
    </>
  );
}

function RunChecks({ run, title }: { run: RunRow; title: string }) {
  return (
    <>
      <h3>{title}</h3>
      <p>{runLine(run)} · {fmtInstant(run.ran_at)}</p>
      <ul>{run.checks.map((c) => (
        <li key={c.check}><Mark m={c.passed ? gateMark('active') : (c.severity === 'blocking' ? gateMark('disabled') : gateMark('uncertified'))} /> {c.check.replace(/_/g, ' ')} ({c.severity}){c.findings.length === 0 ? null : <> — {c.findings.join('; ')}</>}{c.measured === undefined ? null : <span style={{ color: 'var(--eye-color-ink-muted)' }}> [{measuredLine(c.measured)}]</span>}</li>))}</ul>
    </>
  );
}
