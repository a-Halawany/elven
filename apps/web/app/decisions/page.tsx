'use client';
/**
 * Decisions — packages by state; a package's options side by side on their common
 * baseline with SYNTHETIC on every simulated consequence and the uncertainty in
 * words; the choice; dissent; approvers and their approvals; the commitment; the
 * monitoring conditions, breaches and outcomes; and Replay — five layers under their
 * cut-offs, unavailable artefacts marked. State is never told by colour alone;
 * receipts come only from authoritative responses.
 */
import { useEffect, useState } from 'react';
import { useShell } from './layout';
import { decisions as api, type Package, type PackageVersion, type Option, type Replay } from '../../lib/decisions';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant } from '../../components/observation';
import { tableStyle, Th, Td, buttonStyle, Receipt as ReceiptNote, ErrorNote } from '../../components/ui';

const STATE_TEXT: Record<string, string> = { draft: '◌ DRAFT', proposed: '◍ PROPOSED', under_review: '◍ UNDER REVIEW', approved: '● APPROVED', committed: '■ COMMITTED', monitoring: '◉ MONITORING', closed: '□ CLOSED', rejected: '✕ REJECTED', withdrawn: '✕ WITHDRAWN' };
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : v === null || v === undefined ? '—' : String(v).slice(0, 10));
const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

function Uncertainty({ o }: { o: Option }) {
  const u = o.uncertainty ?? {};
  const parts: string[] = [];
  if (!o.simulated) parts.push(`UNSIMULATED — ${o.unsimulated_reason ?? 'no reason recorded'}`);
  if ((u.synthetic_inputs ?? 0) > 0) parts.push(`${u.synthetic_inputs} synthetic input(s)`);
  if ((u.unvalidated_runs ?? 0) > 0) parts.push(`${u.unvalidated_runs} run(s) not validated`);
  if ((u.outside_envelope_runs ?? 0) > 0) parts.push(`${u.outside_envelope_runs} run(s) outside the model envelope`);
  if ((u.truth_states ?? []).length > 0) parts.push(`truth states: ${(u.truth_states ?? []).join(', ')}`);
  return <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>{parts.length === 0 ? 'no uncertainty derived' : parts.join(' · ')}</span>;
}

export default function DecisionsPage() {
  const { scope, isApprover, isAuthority, isDecisionOwner, isExecutive } = useShell();
  const [rows, setRows] = useState<Package[] | null>(null);
  const [open, setOpen] = useState<Package | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [monitoring, setMonitoring] = useState<{ outcomes: Array<Record<string, unknown>>; breaches: Array<Record<string, unknown>> } | null>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the packages could not be read'); return; }
    setRows(r.data.packages);
  };
  useEffect(() => { void load(); }, [scope]);
  const openPackage = async (id: string) => {
    const r = await api.get(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the package could not be read'); return; }
    setOpen(r.data.package); setReplay(null); setError(null); setReceipt(null);
    setVersion(r.data.package.committed_version ?? r.data.package.current_version ?? null);
    const m = await api.outcomes(scope, id);
    setMonitoring(m.ok && m.data !== undefined ? { outcomes: m.data.outcomes, breaches: m.data.breaches } : null);
  };
  const act = async (fn: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } } | undefined; error?: { code: string; message: string; correlationId: string } | null }>) => {
    setBusy(true); setError(null); setReceipt(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? { code: 'EYE-UNKNOWN', message: 'refused', correlationId: '' }); return false; }
    setReceipt(r.data.receipt);
    return true;
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading decisions…</Empty>;
  const v: PackageVersion | null = open === null || version === null ? null : open.versions.find((x) => x.version === version) ?? null;
  const chosen = v?.choice?.option_key ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Decisions</h1>
      <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        A package is complete or refused; what is approved is the <strong>choice</strong>, never a menu; a commitment is one exact C3 act by a named human authority who is not an approver. No model recommends an option here.
      </p>
      {rows.length === 0 ? <Empty>No decision package has been declared.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} package(s)</caption>
          <thead><tr><Th>Package</Th><Th>State</Th><Th>World</Th><Th>Version</Th><Th>Decided</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.package_id}>
                <Td><button type="button" onClick={() => void openPackage(r.package_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{r.title}</button></Td>
                <Td>{STATE_TEXT[r.state] ?? r.state}</Td>
                <Td>{r.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC</strong> : 'observed world'}</Td>
                <Td mono>{r.committed_version !== null ? `v${r.committed_version} committed` : r.current_version !== null ? `v${r.current_version}` : '—'}</Td>
                <Td mono>{r.decided_at ? fmtInstant(r.decided_at) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open === null ? null : (
        <section aria-labelledby="dpk-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="dpk-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.title}</h2>
          <p>{open.statement}</p>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
            {open.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC DECISION — </strong> : null}
            state <strong>{STATE_TEXT[open.state] ?? open.state}</strong> · decides <strong>{open.decision?.title ?? short(open.decision_object_id)}</strong> · owner <Mono>{short(open.owner_principal_id)}</Mono>
            {open.decided_at ? <> · decided at <Mono>{fmtInstant(open.decided_at)}</Mono></> : null}
          </p>
          <dl>
            <DefinitionRow term="Versions">
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                {open.versions.map((x) => (
                  <button key={x.version} type="button" onClick={() => { setVersion(x.version); setReplay(null); }}
                    style={{ border: `1px solid var(${x.version === version ? '--eye-color-accent-default' : '--eye-color-border-default'})`, background: 'none', padding: '4px 8px', cursor: 'pointer', borderRadius: 6 }}>
                    v{x.version} · {x.state}{x.supersedes ? ` (supersedes v${x.supersedes})` : ''}
                  </button>
                ))}
              </div>
            </DefinitionRow>
          </dl>
          {v === null ? <Empty>No version.</Empty> : (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Version {v.version} · {v.state}</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                <strong>Cut-offs:</strong> observations through <Mono>{day(v.observed_through)}</Mono>, read at record time <Mono>{fmtInstant(v.known_at)}</Mono>
                {' · '}baseline {v.baseline_run_id ? <Mono>{short(v.baseline_run_id)}</Mono> : 'none'} · digest <Mono>{v.version_digest ? `${v.version_digest.slice(0, 16)}…` : 'not yet bound'}</Mono>
                {' · '}approver policy: quorum {v.approver_policy.quorum ?? '—'} of {[...(v.approver_policy.principals ?? []).map((x) => `principal ${x.slice(0, 8)}…`), ...(v.approver_policy.roles ?? []).map((x) => `role ${x}`)].join(', ') || 'nobody named'}
              </p>
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Options on one baseline</h4>
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Option</Th><Th>Kind</Th><Th>Consequences</Th><Th>Uncertainty</Th><Th>Choice</Th></tr></thead>
                <tbody>
                  {v.options.map((o) => (
                    <tr key={o.option_id}>
                      <Td>{o.title} <Mono>{o.key}</Mono></Td>
                      <Td>{o.kind === 'status_quo' ? 'status quo (do nothing)' : 'intervention'}</Td>
                      <Td>
                        {o.consequences.length === 0 ? '—' : o.consequences.map((c) => (
                          <div key={`${c.kind}:${c.id}@${c.version}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                            {c.kind === 'run' ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC </strong> : null}{c.kind} <Mono>{short(c.id)}@{c.version}</Mono>
                          </div>
                        ))}
                        {o.synthetic_state ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)', fontWeight: 650 }}>SYNTHETIC</div> : null}
                      </Td>
                      <Td><Uncertainty o={o} /></Td>
                      <Td>{chosen === o.key ? <strong>■ CHOSEN</strong> : ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {v.choice === null ? <UnknownNote>No choice yet: a menu of alternatives is not a proposal.</UnknownNote> : (
                <dl>
                  <DefinitionRow term="The choice">option <Mono>{v.choice.option_key}</Mono> — “{v.choice.rationale}”</DefinitionRow>
                  <DefinitionRow term="Deadline · action owner">{v.choice.decision_deadline} · principal <Mono>{short(v.choice.action_owner)}</Mono></DefinitionRow>
                  <DefinitionRow term="Accepted trade-offs">{v.choice.accepted_trade_offs.join('; ') || 'none stated'}</DefinitionRow>
                  <DefinitionRow term="Outcome criteria">{v.choice.outcome_criteria.map((k) => `${k.quantity} ${k.comparator} ${k.target} ${k.unit} by ${k.by} (observed on ${k.observed_on}${k.twin_id ? ` of twin ${k.twin_id.slice(0, 8)}…` : ''}${k.period ? `, ${k.period.from} to ${k.period.to}` : ''})`).join('; ')}</DefinitionRow>
                  <DefinitionRow term="Monitoring">{v.monitoring_conditions.map((m, i) => <span key={i}>{String(m['kind'])}{m['every_days'] ? ` every ${String(m['every_days'])} days` : ''} → owner <Mono>{short(m['owner'])}</Mono>; </span>)}</DefinitionRow>
                </dl>
              )}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Dissent (every version of this package — never removed by approval or by a change of choice)</h4>
              {open.versions.every((x) => x.dissent.length === 0) ? <Empty>No dissent recorded.</Empty> : open.versions.flatMap((x) => x.dissent.map((d) => (
                <p key={d.dissent_id} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>{d.position}</strong> — {d.rationale} <span style={{ color: 'var(--eye-color-ink-muted)' }}>(on v{x.version}, principal {short(d.principal_id)}, {fmtInstant(d.recorded_at)})</span></p>
              )))}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Approvals</h4>
              {v.approvals.length === 0 ? <Empty>No approval recorded.</Empty> : (
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Approver</Th><Th>Decision</Th><Th>Standing</Th><Th>Expires</Th><Th>Recorded</Th></tr></thead>
                  <tbody>{v.approvals.map((a) => (
                    <tr key={a.approval_id}><Td mono>{short(a.approver_principal_id)}</Td><Td>{a.decision}</Td>
                      <Td>{a.revoked_at ? `REVOKED — ${a.revoked_reason ?? ''}` : a.live ? '● live' : 'not counted (expired, another digest, or the approver is no longer eligible)'}</Td>
                      <Td mono>{fmtInstant(a.expires_at)}</Td><Td mono>{fmtInstant(a.recorded_at)}</Td></tr>
                  ))}</tbody>
                </table>
              )}
              {open.commitment ? (
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>■ COMMITTED</strong> under <Mono>{String(open.commitment['bound_action'])}</Mono> at class <Mono>{String(open.commitment['op_class'])}</Mono> by principal <Mono>{short(open.commitment['committed_by'])}</Mono> at <Mono>{fmtInstant(open.commitment['committed_at'])}</Mono>; the CMT <Mono>{short(open.commitment['commitment_id'])}</Mono> names the approved option.</p>
              ) : null}
              {monitoring !== null && (monitoring.breaches.length > 0 || monitoring.outcomes.length > 0) ? (
                <>
                  <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Monitoring and outcomes</h4>
                  {monitoring.breaches.map((b) => <p key={String(b['breach_id'])} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>⚠ BREACH</strong> condition {String(b['condition_index'])} · warning <Mono>{short(b['warning_id'])}</Mono> · routed to <Mono>{short(b['routed_to'])}</Mono> · window closes <Mono>{fmtInstant(b['response_window_closes_at'])}</Mono></p>)}
                  {monitoring.outcomes.map((o) => <p key={String(o['outcome_id'])} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>{o['met'] === true ? '● OUTCOME MET' : '○ OUTCOME NOT MET'}</strong> {String(o['criterion_key'])}: observed <Mono>{String(o['observed_value'])} {String(o['unit'] ?? '')}</Mono> against target {String(o['comparator'])} {String(o['target'])}{o['reconciliation_id'] ? <> · reconciled against the chosen run (<Mono>{short(o['reconciliation_id'])}</Mono>)</> : null}</p>)}
                </>
              ) : null}
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-16)' }}>
                {isApprover && ['proposed', 'under_review', 'approved'].includes(v.state) && v.version_digest !== null ? (
                  <>
                    <input aria-label="Approval rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="your rationale, in your own words" style={{ minInlineSize: 'min(28rem, 100%)' }} />
                    <button type="button" style={buttonStyle} disabled={busy || rationale.trim().length < 8} onClick={() => void act(() => api.approve(scope, open.package_id, v.version, { decision: 'approve', versionDigest: v.version_digest as string, rationale })).then((ok) => { if (ok) void openPackage(open.package_id); })}>Approve this digest</button>
                  </>
                ) : null}
                {isAuthority && v.state === 'approved' && v.version_digest !== null ? (
                  <button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.commit(scope, open.package_id, v.version, v.version_digest as string)).then((ok) => { if (ok) void openPackage(open.package_id); })}>Commit (decision.commit, C3)</button>
                ) : null}
                {(isExecutive || isDecisionOwner || isApprover || isAuthority) && open.committed_version === v.version ? (
                  <button type="button" style={buttonStyle} disabled={busy} onClick={() => void (async () => { setBusy(true); const r = await api.replay(scope, open.package_id, v.version, null); setBusy(false); if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; } setReplay(r.data.replay); setReceipt(r.data.receipt); })()}>Replay what we knew</button>
                ) : null}
              </div>
              <ErrorNote error={error} />
              <ReceiptNote receipt={receipt} />
              {replay === null ? null : (
                <section aria-labelledby="rpl-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
                  <h3 id="rpl-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Replay — five layers under their cut-offs</h3>
                  <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                    known / believed: recorded at or before <Mono>{String(replay.cutoffs['known_at'])}</Mono>, observed through <Mono>{String(replay.cutoffs['observed_through'] ?? '—')}</Mono> · tested / decided: at or before <Mono>{String(replay.cutoffs['decided_at'])}</Mono> · observed: after that and at or before <Mono>{String(replay.cutoffs['as_of'])}</Mono>
                    {' · '}content digest <Mono>{replay.contentDigest.slice(0, 16)}…</Mono> (the same for anyone under these cut-offs)
                  </p>
                  {replay.unavailable.length > 0 ? <UnknownNote><strong>UNAVAILABLE NOW.</strong> {replay.unavailable.map((u, i) => <span key={i}>{String(u['layer'])}: {String(u['id']).slice(0, 8)}…@{String(u['version'])} — {String(u['reason'])}; </span>)} Nothing later was substituted.</UnknownNote> : null}
                  <dl>
                    <DefinitionRow term="Known">{replay.layers.known.length} evidence version(s): {replay.layers.known.map((k) => <Mono key={`${String(k['id'])}@${String(k['version'])}`}>{String(k['id']).slice(0, 8)}…@{String(k['version'])} ({String(k['truth_state'])}{k['synthetic_state'] === true ? ', SYNTHETIC' : ''}) </Mono>)}</DefinitionRow>
                    <DefinitionRow term="Believed">
                      {(replay.layers.believed['assumptions'] ?? []).map((a) => <span key={String(a['id'])}>assumption {String(a['id']).slice(0, 8)}… was <strong>{String(a['verification_at_known_at'])}</strong>; </span>)}
                      {(replay.layers.believed['branches'] ?? []).map((b) => <span key={String(b['branch_id'])}>branch {String(b['name'])} was <strong>{String(b['state_as_of'])}</strong>; </span>)}
                      {(replay.layers.believed['twins'] ?? []).map((t) => <span key={String(t['twin_id'])}>twin <strong>{String(t['validation_status'])}</strong>; </span>)}
                      {(replay.layers.believed['forecasts'] ?? []).map((f) => <span key={String(f['id'])}>forecast {String(f['id']).slice(0, 8)}… <strong>{String(f['validation_state'] ?? f['truth_state'])}</strong>; </span>)}
                    </DefinitionRow>
                    <DefinitionRow term="Tested">{(replay.layers.tested['runs'] ?? []).length} run(s) with their digests · {(replay.layers.tested['reproductions'] ?? []).length} reproduction verdict(s) before the decision · twin version(s) {(replay.layers.tested['twin_versions'] ?? []).map((t) => `${String(t['twin_id']).slice(0, 8)}…@${String(t['version'])} (${String(t['verification_at_decided_at'])})`).join(', ')}</DefinitionRow>
                    <DefinitionRow term="Decided">version digest <Mono>{String((replay.layers.decided['version'] as Record<string, unknown>)?.['version_digest'] ?? '').slice(0, 16)}…</Mono> · {((replay.layers.decided['dissent'] as unknown[]) ?? []).length} dissent on this version, {((replay.layers.decided['prior_dissent'] as unknown[]) ?? []).length} on earlier versions · {((replay.layers.decided['approvals'] as unknown[]) ?? []).length} approval(s) · commitment at class <Mono>{String((replay.layers.decided['commitment'] as Record<string, unknown>)?.['op_class'])}</Mono> · policy decision <Mono>{short((replay.layers.decided['policy'] as Record<string, unknown> | null)?.['policy_decision_id'])}</Mono> · audit seq <Mono>{String((replay.layers.decided['audit'] as Record<string, unknown> | null)?.['audit_seq'] ?? '—')}</Mono></DefinitionRow>
                    <DefinitionRow term="Observed (after the decision)">{Object.entries(replay.layers.observed).filter(([, arr]) => arr.length > 0).map(([k, arr]) => `${k}: ${arr.length}`).join(' · ') || 'nothing yet'}</DefinitionRow>
                  </dl>
                </section>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
