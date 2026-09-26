'use client';
/**
 * CP-6 B28 (0088 §W) — THE WARNING'S LIFECYCLE on the Warnings screen: where the warning came from (its ORIGIN), every report folded into it
 * (the CLUSTER — lead, duplicates, storm members — each with its STANCE: a contradicting report is shown, never dropped), the CONTRADICTING
 * block, the AFFECTED objectives, the FALSIFICATION conditions, the verification / simulation PLAYBOOK, the COVERAGE GAPS the warning rests
 * on, the CLOSURE and the FEEDBACK. The owner sets the context and closes; any named human of the domain gives feedback. The server decides
 * who may; hiding a control it would refuse is courtesy, not security.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Scope, Me } from '../../../lib/observation';
import { CLOSURE_CRITERIA, FEEDBACK_KINDS, closePayload, memberMark, originWords, warningLifecycle as api, type FeedbackKind, type Lifecycle } from '../../../lib/warning-lifecycle';
import { DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, UnknownNote, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

export function LifecyclePanel({ scope, me, warningId, onChanged }: { scope: Scope; me: Me; warningId: string; onChanged: () => Promise<void> }) {
  const [lc, setLc] = useState<Lifecycle | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [condition, setCondition] = useState('');
  const [pbKind, setPbKind] = useState<'verification' | 'simulation'>('simulation');
  const [pbScenario, setPbScenario] = useState('');
  const [criterion, setCriterion] = useState<string>('resolved');
  const [closeReason, setCloseReason] = useState('');
  const [closeCondition, setCloseCondition] = useState('');
  const [duplicateOf, setDuplicateOf] = useState('');
  const [fbKind, setFbKind] = useState<FeedbackKind>('useful');
  const [fbNote, setFbNote] = useState('');

  const load = async () => {
    const r = await api.lifecycle(scope, warningId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the lifecycle could not be read'); return; }
    setLc(r.data.lifecycle); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope, warningId]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (lc === null) return <Empty>reading the warning's lifecycle…</Empty>;
  const w = lc.warning;
  const owner = String(w['routed_to'] ?? '') === me.principalId;
  const open = ['raised', 'acknowledged', 'expired'].includes(String(w['state']));
  const done = async (text: string, rc: { policyDecisionId: string; auditSeq: number } | null) => { setReceipt(rc); setLast(text); await load(); await onChanged(); };

  return (
    <section aria-labelledby="wrn-lc-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id="wrn-lc-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Lifecycle</h3>
      <dl>
        <DefinitionRow term="Origin">{originWords(lc.origin.kind)}{lc.origin.ref && typeof lc.origin.ref['cause_key'] === 'string' ? <> — cause <Mono>{String(lc.origin.ref['cause_key'])}</Mono></> : null}</DefinitionRow>
        {lc.cluster === null ? null : <DefinitionRow term="Deduplication key"><Mono>{lc.cluster.dedup_key}</Mono> — one warning per open key; the reports of the same incident are folded in below</DefinitionRow>}
      </dl>

      {lc.members.length === 0 ? null : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{lc.members.length} report(s) folded into this warning</caption>
          <thead><tr><Th>Member</Th><Th>Report</Th><Th>Origin</Th><Th>Source</Th><Th>Geography · horizon</Th><Th>Joined</Th></tr></thead>
          <tbody>
            {lc.members.map((m) => {
              const mk = memberMark(m.member_kind, m.stance);
              return (
                <tr key={m.member_id}>
                  <Td><span style={{ color: `var(${mk.token})`, fontWeight: m.stance === 'contradicting' ? 650 : 400 }}>{mk.glyph} {mk.text}</span></Td>
                  <Td>{m.title}</Td>
                  <Td>{originWords(m.origin_kind)}</Td>
                  <Td mono>{m.source_id === null ? '—' : `${m.source_id.slice(0, 8)}…`}</Td>
                  <Td>{m.geographies.join(', ') || '—'} · {m.horizon ?? '—'}</Td>
                  <Td>{fmtInstant(m.joined_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {lc.storm === null ? null : (
        <p style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>⚡ STORM — {lc.storm.members} report(s) of {lc.storm.causes.join(', ')} folded into this lead: {lc.storm.note} (rule <Mono>{JSON.stringify(lc.storm.rule)}</Mono>).</p>
      )}

      <dl>
        <DefinitionRow term="Contradicting">
          {lc.contradicting.count === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>no contradicting evidence recorded</span> : (
            <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
              {[...lc.contradicting.members, ...lc.contradicting.context].map((c, i) => (
                <li key={i}><span style={{ color: 'var(--eye-color-critical)' }}>⊘</span> <Mono>{String(c['object_id'] ?? '').slice(0, 8)}…</Mono> {String(c['note'] ?? c['kind'] ?? '')}{c['via'] === 'member' ? ` — a folded report (${originWords(c['origin_kind'])})` : ' — set on the context'}</li>
              ))}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Affected objectives">
          {lc.affected.objectives.length === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>none named</span>
            : lc.affected.objectives.map((o) => <div key={o.objective_id}>{o.title ?? o.objective_id} <span style={{ color: 'var(--eye-color-ink-muted)' }}>({o.status ?? 'unknown'})</span></div>)}
          {(lc.affected.geographies ?? []).length > 0 ? <div>Geographies: {(lc.affected.geographies ?? []).join(', ')}</div> : null}
          {lc.affected.horizon ? <div>Horizon: {lc.affected.horizon}</div> : null}
        </DefinitionRow>
        <DefinitionRow term="Falsification">
          {lc.falsification.length === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>no condition declared — the warning cannot be closed as falsified</span>
            : <ol style={{ margin: 0, paddingInlineStart: '1.2rem' }} start={0}>{lc.falsification.map((f, i) => <li key={i}>{f.condition}</li>)}</ol>}
        </DefinitionRow>
        <DefinitionRow term="Playbook">
          {lc.playbook === null ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>none linked</span> : (
            <>{lc.playbook.kind} — <Link href="/prediction/scenarios">scenario <Mono>{lc.playbook.scenario_id.slice(0, 8)}…</Mono></Link>
              {lc.playbook.branch_id ? <> · branch <Mono>{lc.playbook.branch_id.slice(0, 8)}…</Mono></> : null}
              {lc.playbook.run_id ? <> · run <Mono>{lc.playbook.run_id.slice(0, 8)}…</Mono></> : null}{lc.playbook.note ? ` — ${lc.playbook.note}` : ''}</>
          )}
        </DefinitionRow>
        <DefinitionRow term="Coverage gaps">
          {lc.coverage_gaps.count === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>{lc.coverage_gaps.note}</span> : (
            <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
              {lc.coverage_gaps.markers.map((m) => <li key={m.marker_id}><span style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>◌ {m.health_state.toUpperCase()}</span> source <Mono>{m.source_id.slice(0, 8)}…</Mono> via {m.via}{m.reason ? ` — ${m.reason}` : ''} (since {fmtInstant(m.set_at)})</li>)}
            </ul>
          )}
        </DefinitionRow>
        {lc.closure === null ? null : <DefinitionRow term="Closure">{String(lc.closure['criterion'])} — {String(lc.closure['reason'] ?? '')} ({fmtInstant(lc.closure['at'])})</DefinitionRow>}
        <DefinitionRow term="Feedback">
          {lc.feedback.length === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>none yet</span>
            : lc.feedback.map((f) => <div key={f.feedback_id}><strong>{f.kind}</strong>{f.note ? ` — ${f.note}` : ''} <span style={{ color: 'var(--eye-color-ink-muted)' }}>(<Mono>{f.given_by.slice(0, 8)}…</Mono>, {fmtInstant(f.given_at)}, the warning {f.warning_state})</span></div>)}
        </DefinitionRow>
      </dl>

      {owner && open ? (
        <fieldset style={{ border: 'none', padding: 0 }}>
          <legend style={{ fontWeight: 650 }}>Context (version {lc.context_version})</legend>
          <label htmlFor="wrn-fals">Add a falsification condition</label>
          <input id="wrn-fals" style={inputStyle} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="transits recover above 40 a day for three consecutive days" />
          <label htmlFor="wrn-pb-kind">Playbook</label>
          <select id="wrn-pb-kind" value={pbKind} onChange={(e) => setPbKind(e.target.value as 'verification' | 'simulation')}><option value="simulation">simulation</option><option value="verification">verification</option></select>
          <input aria-label="Playbook scenario id" style={inputStyle} value={pbScenario} onChange={(e) => setPbScenario(e.target.value)} placeholder="scenario id" />
          <GovernedButton label="Save the context" pendingLabel="saving" onRun={async () => {
            const aff = { ...lc.affected, objectives: lc.affected.objectives.map((o) => o.objective_id) };
            const r = await api.setContext(scope, warningId, {
              expected_version: lc.context_version, contradicting: lc.contradicting.context, affected: aff,
              falsification: condition.trim() === '' ? lc.falsification : [...lc.falsification, { condition: condition.trim() }],
              playbook: pbScenario.trim() === '' ? lc.playbook : { kind: pbKind, scenario_id: pbScenario.trim() },
            });
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the context was refused');
            setCondition(''); await done(`context saved at version ${String(r.data.context['context_version'])}`, r.data.receipt);
          }} />
          <legend style={{ fontWeight: 650, marginBlockStart: 'var(--eye-space-16)' }}>Close</legend>
          <label htmlFor="wrn-crit">Criterion</label>
          <select id="wrn-crit" value={criterion} onChange={(e) => setCriterion(e.target.value)}>{CLOSURE_CRITERIA.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select>
          {criterion === 'falsified' ? <input aria-label="The condition that held (its number)" style={inputStyle} value={closeCondition} onChange={(e) => setCloseCondition(e.target.value)} placeholder="0" /> : null}
          {criterion === 'duplicate' ? <input aria-label="The warning this duplicates" style={inputStyle} value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} placeholder="warning id" /> : null}
          <input aria-label="Why it is closed" style={inputStyle} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="why it is closed" />
          <GovernedButton label="Close the warning" pendingLabel="closing" onRun={async () => {
            const r = await api.close(scope, warningId, closePayload({ criterion, reason: closeReason, condition: closeCondition, duplicateOf }));
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the closure was refused');
            await done(`closed — ${criterion.replace(/_/g, ' ')}`, r.data.receipt);
          }} />
        </fieldset>
      ) : null}

      <fieldset style={{ border: 'none', padding: 0, marginBlockStart: 'var(--eye-space-16)' }}>
        <legend style={{ fontWeight: 650 }}>Your feedback</legend>
        <select aria-label="Feedback" value={fbKind} onChange={(e) => setFbKind(e.target.value as FeedbackKind)}>{FEEDBACK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <input aria-label="What was wrong or right" style={inputStyle} value={fbNote} onChange={(e) => setFbNote(e.target.value)} placeholder="what was wrong (required for false, late, missed, duplicated)" />
        <GovernedButton label="Record feedback" pendingLabel="recording" onRun={async () => {
          const r = await api.feedback(scope, warningId, fbKind, fbNote);
          if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the feedback was refused');
          setFbNote(''); await done(r.data.feedback['repeated'] === true ? `already recorded — ${fbKind}` : `feedback recorded — ${fbKind}`, r.data.receipt);
        }} />
      </fieldset>
      <Receipt receipt={receipt} />
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <UnknownNote>Reports of one incident against the same objectives, geography and horizon are <strong>one warning</strong>; a report that disagrees is kept as
        {' '}<strong>contradicting</strong>. When one cause raises more warnings than the storm rule admits, the rest are folded into its lead. The feedback is measured on the
        {' '}<Link href="/prediction/warnings/evaluations">warning evaluation</Link>.</UnknownNote>
    </section>
  );
}
