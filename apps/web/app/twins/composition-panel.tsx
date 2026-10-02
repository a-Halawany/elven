'use client';
/**
 * CP-6 B29 §A (0092) — a twin's COMPOSITION: its family measures, its dependency completeness (L5-C06), its published contract (the
 * interface and the approved uses), its live links, and the coupling proposals its upstreams' admissions made. Only the twin's owner
 * applies or declines a proposal (the server refuses anyone else — shown in its words); applying opens or extends a draft the owner
 * then admits on the twin itself. Nothing here is derived on the client: every figure is the server's.
 */
import { useEffect, useState } from 'react';
import type { Scope } from '../../lib/observation';
import { composition as api, completenessLabel, familyWords, measureText, proposalLines, upstreamLine,
         type Completeness, type Contract, type FamilyMeasures, type Link, type Proposal } from '../../lib/composition';
import { DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, cardStyle, fmtInstant, textareaStyle } from '../../components/observation';
import { Receipt } from '../../components/ui';

export function CompositionPanel({ scope, twinId, isTwinOwner }: { scope: Scope; twinId: string; isTwinOwner: boolean }) {
  const [completeness, setCompleteness] = useState<Completeness | null>(null);
  const [measures, setMeasures] = useState<FamilyMeasures | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const [c, m, k, l, p] = await Promise.all([api.completeness(scope, twinId), api.measures(scope, twinId), api.contracts(scope, twinId), api.links(scope, twinId), api.proposals(scope, twinId)]);
    const failed = [c, m, k, l, p].find((r) => !r.ok);
    setProblem(failed ? (failed.error?.message ?? 'the composition could not be read') : null);
    setCompleteness(c.data?.completeness ?? null);
    setMeasures(m.data?.measures ?? null);
    setContract((k.data?.contracts ?? []).find((x) => x.state === 'current') ?? null);
    setLinks((l.data?.links ?? []).filter((x) => x.state === 'live'));
    setProposals(p.data?.proposals ?? []);
  };
  useEffect(() => { void load(); }, [scope, twinId]);

  const act = async (run: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>, done: string) => {
    const r = await run();
    if (!r.ok) { setStatus(`refused — ${r.error?.message ?? 'the server gave no reason'}`); return; }
    setReceipt(r.data?.receipt ?? null); setStatus(done); setReason('');
    await load();
  };
  const badge = completenessLabel(completeness);
  const pending = proposals.filter((p) => p.state === 'proposed');
  const upstream = links.filter((l) => l.downstream_twin_id === twinId);
  const downstream = links.filter((l) => l.upstream_twin_id === twinId);

  return (
    <section aria-labelledby="composition-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id="composition-h" style={{ marginBlockStart: 0 }}>Composition</h3>
      {problem ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <dl>
        <DefinitionRow term="Dependency completeness">
          <span style={{ color: `var(${badge.token})`, fontWeight: 650 }}><span aria-hidden="true">{badge.glyph}</span> {badge.text}</span>
          {completeness && completeness.required.length > 0 ? (
            <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
              required: {completeness.required.map(familyWords).join('; ')} · linked (directly or through an upstream): {completeness.linked.join(', ') || 'none'}
            </div>
          ) : null}
        </DefinitionRow>
        <DefinitionRow term={`Family measures${measures?.version ? ` (v${measures.version}${measures.as_of ? `, as of ${measures.as_of}` : ''})` : ''}`}>
          {measures === null || Object.keys(measures.measures).length === 0 ? 'none — this kind derives no measures, or nothing is admitted yet'
            : Object.entries(measures.measures).map(([k, v]) => <div key={k}><Mono>{k}</Mono>: {measureText(k, v)}</div>)}
        </DefinitionRow>
        <DefinitionRow term="Contract (interface)">
          {contract === null ? 'no contract published — nothing may depend on this twin, and runs are not restricted by approved uses' : (
            <>
              <div>version {contract.contract_version} · published {fmtInstant(contract.published_at)}</div>
              {Object.entries(contract.exposed).map(([k, e]) => <div key={k}><Mono>{k}</Mono> — {e.unit ?? 'no unit'} · {e.cadence}</div>)}
              <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                approved methods: {contract.approved_uses.method_families.join(', ') || 'none'} · approved decisions: {contract.approved_uses.decision_classes.join(', ') || 'none'}
              </div>
            </>
          )}
        </DefinitionRow>
        <DefinitionRow term="Depends on (live links)">
          {upstream.length === 0 ? 'none' : upstream.map((l) => (
            <div key={l.link_id}><Mono>{l.upstream_twin_id.slice(0, 8)}…</Mono> for {l.use_class}: {l.mapping.map((m) => `${m.from} → ${m.to}`).join('; ')}</div>
          ))}
        </DefinitionRow>
        <DefinitionRow term="Depended on by">
          {downstream.length === 0 ? 'none' : downstream.map((l) => <div key={l.link_id}><Mono>{l.downstream_twin_id.slice(0, 8)}…</Mono> for {l.use_class}</div>)}
        </DefinitionRow>
      </dl>
      <h4>Coupling proposals</h4>
      {pending.length === 0 ? <Empty>No proposal is waiting. An upstream twin&apos;s next admission proposes its contracted values here.</Empty> : null}
      {pending.map((p) => (
        <div key={p.proposal_id} style={{ borderBlockStart: '1px solid var(--eye-color-border-subtle)', paddingBlock: 'var(--eye-space-8)' }}>
          <div>from {upstreamLine(p)} · proposed {fmtInstant(p.proposed_at)}</div>
          {proposalLines(p).map((line) => <div key={line}><Mono>{line}</Mono></div>)}
          {isTwinOwner ? (
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Apply to a draft of this twin" pendingLabel="applying" onRun={() => act(() => api.apply(scope, p.proposal_id), 'applied — admit the draft on the twin to take it into its state')} />
              <label style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>Reason for declining (at least 8 characters)</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={textareaStyle} />
              </label>
              <GovernedButton label="Decline" pendingLabel="declining" variant="quiet" disabled={reason.trim().length < 8}
                onRun={() => act(() => api.decline(scope, p.proposal_id, reason.trim()), 'declined — the next upstream admission proposes again')} />
            </div>
          ) : <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>Only this twin&apos;s owner applies or declines a proposal.</div>}
        </div>
      ))}
      {proposals.some((p) => p.state !== 'proposed') ? (
        <details><summary>Decided proposals ({proposals.filter((p) => p.state !== 'proposed').length})</summary>
          {proposals.filter((p) => p.state !== 'proposed').map((p) => (
            <div key={p.proposal_id}>{upstreamLine(p)} — <strong>{p.state}</strong>{p.applied_version ? ` into v${p.applied_version}` : ''}{p.decision_note ? ` · ${p.decision_note}` : ''}</div>
          ))}
        </details>
      ) : null}
      {status ? <LiveStatus>{status}</LiveStatus> : null}
      <Receipt receipt={receipt} />
    </section>
  );
}
