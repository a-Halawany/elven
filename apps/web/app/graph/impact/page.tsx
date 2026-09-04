'use client';
/**
 * Impact — what does this correction affect?
 *
 * This is the screen that retires a sentence Phase 1 had to carry from the
 * beginning: "downstream consumers not yet present (KG/dependency graph arrives
 * Phase 3)". It answers the question that sentence could not.
 *
 * IT REPORTS; IT DOES NOT DECIDE. Every affected assumption is marked
 * UNVERIFIED — not false, not withdrawn — because an assumption whose evidence
 * changed is one nobody has re-checked yet. Objectives, decisions and commitments
 * are LISTED and left exactly as they were: what to do about them is a person's
 * judgement, and the screen says so rather than implying the system concluded
 * something.
 *
 * PREVIEW FIRST. The walk can be run as a read, so a person can look at what a
 * propagation would touch before committing to it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type ImpactResult, type AffectedObject } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, UnknownNote, GovernedButton,
  fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

function Affected({ title, rows, note }: {
  title: string; rows: AffectedObject[]; note: string;
}) {
  return (
    <>
      <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>{title} ({rows.length})</h3>
      {rows.length === 0 ? <Empty>None.</Empty> : (
        <>
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>{note}</p>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Title</Th><Th>Reached because it</Th><Th>Hops</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.strategy_object_id}>
                  <Td>{r.title}</Td>
                  <Td>{r.reached_via}</Td>
                  <Td mono>{r.hop}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export default function ImpactPage() {
  const { scope } = useShell();
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const [trigger, setTrigger] = useState('');
  const [triggerKind, setTriggerKind] = useState('claim_correction');
  const [caseId, setCaseId] = useState('');
  const [preview, setPreview] = useState<ImpactResult | null>(null);
  const [applied, setApplied] = useState<ImpactResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const r = await graph.listImpact(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the invalidations could not be read');
      return;
    }
    setHistory(r.data.invalidations);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (history === null) return <Empty>reading invalidations…</Empty>;

  const shown = applied ?? preview;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Impact</h1>
      <UnknownNote>
        A correction or a withdrawal walks the dependency graph and marks every assumption resting
        on the changed object <strong>unverified</strong> — never false, never withdrawn. The
        objectives, decisions and commitments above them are <strong>listed for a person</strong>
        {' '}and left as they are.
      </UnknownNote>

      <section aria-labelledby="run-h" style={cardStyle}>
        <h2 id="run-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
          Walk the dependency graph
        </h2>
        <label htmlFor="kind">What changed</label>
        <select id="kind" style={inputStyle} value={triggerKind}
                onChange={(e) => setTriggerKind(e.target.value)}>
          <option value="claim_correction">a claim was corrected</option>
          <option value="claim_withdrawal">a claim was withdrawn</option>
          <option value="edge_retraction">an edge was retracted</option>
          <option value="entity_split">an entity was split</option>
          <option value="manual">a person asked</option>
        </select>
        <label htmlFor="trigger">Its object id</label>
        <input id="trigger" style={inputStyle} value={trigger}
               onChange={(e) => setTrigger(e.target.value)}
               placeholder="the claim, edge or entity that changed" />
        <label htmlFor="case">
          The Phase 1 correction case this belongs to (optional)
        </label>
        <input id="case" style={inputStyle} value={caseId}
               onChange={(e) => setCaseId(e.target.value)}
               placeholder="naming it replaces that case's propagation statement" />
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)',
                      marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton
            label="Preview" pendingLabel="walking" variant="quiet"
            disabled={trigger.trim().length < 8}
            onRun={async () => {
              const r = await graph.previewImpact(scope, trigger.trim(), triggerKind);
              if (!r.ok || r.data === undefined) {
                throw new Error(r.error?.message ?? 'the walk could not be run');
              }
              setPreview(r.data.impact); setApplied(null);
            }}
          />
          <GovernedButton
            label="Propagate" pendingLabel="propagating" variant="critical"
            disabled={trigger.trim().length < 8}
            onRun={async () => {
              const r = await graph.propagate(scope, trigger.trim(), triggerKind,
                caseId.trim() === '' ? null : caseId.trim());
              if (!r.ok || r.data === undefined) {
                throw new Error(r.error?.message ?? 'the propagation was refused');
              }
              setApplied(r.data.impact); setReceipt(r.data.receipt);
              await load();
            }}
          />
        </div>
        <Receipt receipt={receipt} />
      </section>

      {shown === null ? null : (
        <section aria-labelledby="res-h" style={{ ...cardStyle,
          marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="res-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {applied === null ? 'What this would affect' : 'What this affected'}
          </h2>
          {shown.statement === undefined ? null : (
            <p><Mono>{shown.statement}</Mono></p>
          )}
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>
            reached {shown.reachedEntities.length} entity(ies) and {shown.reachedEdges.length} edge(s)
            on the way
          </p>
          <Affected
            title="Assumptions" rows={shown.assumptions}
            note={applied === null
              ? 'these would be marked unverified — nobody would have re-checked them'
              : 'these are now unverified: nobody has re-checked them since the change'} />
          <Affected
            title="Objectives" rows={shown.objectives}
            note="reported for a person to look at; nothing about them was changed" />
          <Affected
            title="Decisions" rows={shown.decisions}
            note="reported for a person to look at; nothing about them was changed" />
          <Affected
            title="Commitments" rows={shown.commitments}
            note="reported for a person to look at; nothing about them was changed" />
        </section>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Assessments</h2>
      {history.length === 0 ? <Empty>Nothing has been propagated yet.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead>
            <tr><Th>Trigger</Th><Th>State</Th><Th>Statement</Th><Th>Correction case</Th><Th>Opened</Th></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={String(h['invalidation_id'])}>
                <Td>{String(h['trigger_kind'])}</Td>
                <Td>{String(h['state'])}</Td>
                <Td>{String(h['statement'])}</Td>
                <Td mono>
                  {h['correction_case_id'] === null ? '—'
                    : String(h['correction_case_id']).slice(0, 12) + '…'}
                </Td>
                <Td>{fmtInstant(h['opened_at'])}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {history.length === 0 ? null : (
        <ScrollBox label="The assessments as stored">
          {JSON.stringify(history, null, 2)}
        </ScrollBox>
      )}
    </>
  );
}
