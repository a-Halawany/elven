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
 *
 * B50 §CI (0120): the walk also reaches decision packages, publications, export packages, evaluation datasets and lessons; every product
 * an assessed walk reached is CLASSED by the server (current, stale, challenged, withdrawn, recompute, human review — affected-class@1) and
 * read here per assessment; the seven impact TRIGGERS (a legal request, a model incident, an ontology correction, a data-quality finding,
 * a rights change, an integrity failure, a human challenge) are recorded behind the Command Review by their steward and walked by the
 * domain's propagation agent — the page shows the walk's outcome in the server's words. Nothing here classes, walks or rewrites anything.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { graph, type ImpactResult, type AffectedObject } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, UnknownNote, GovernedButton,
  fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';
/* B50 ci */
import { CommandReview } from '../../../components/authority';
import { AffectedProductList } from '../../../components/knowledge';
import { eligibility, rolesIn } from '../../../lib/authority-b81';
import { impactB50, type TriggerWalkAnswer } from '../../../lib/impact-b50-api';
import { TRIGGERS, TRIGGER_KINDS, parseAffected, triggerFormProblems, triggerPayload, triggerStateText, walkOutcomeText, type TriggerKind } from '../../../lib/impact-b50';
import type { AffectedProduct } from '../../../lib/b50-seams';
/* end B50 ci */

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

/* B50 ci: the walk's new buckets, as the preview and the propagation answer them (absent from a server before 0120) */
const NEW_BUCKETS: ReadonlyArray<[string, string, string]> = [
  ['decisionPackages', 'Decision packages', 'package versions whose option cites what changed, or that are for a reached decision — their owners review them'],
  ['publications', 'Publications', 'publication versions that publish a reached briefing or package'],
  ['exportPackages', 'Export packages', 'export packages that shipped a manifest of the changed evidence — an amendment is the record authority\'s act'],
  ['evaluationDatasets', 'Evaluation datasets', 'frozen information sets, backtests and method validations of a reached series'],
  ['lessons', 'Lessons', 'lessons learned from a reached package'],
];
/* end B50 ci */

export default function ImpactPage() {
  const { scope, /* B50 ci */ me /* end B50 ci */ } = useShell();
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const [trigger, setTrigger] = useState('');
  const [triggerKind, setTriggerKind] = useState('claim_correction');
  const [caseId, setCaseId] = useState('');
  const [preview, setPreview] = useState<ImpactResult | null>(null);
  const [applied, setApplied] = useState<ImpactResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  /* B50 ci */
  const [classed, setClassed] = useState<{ invalidationId: string; products: AffectedProduct[]; dropped: number } | null>(null);
  const [triggers, setTriggers] = useState<Array<Record<string, unknown>> | null>(null);
  const [kind, setKind] = useState<TriggerKind>('data_quality_finding');
  const [objectType, setObjectType] = useState('EVD');
  const [objectId, setObjectId] = useState('');
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState<Record<string, string>>({});
  const [walk, setWalk] = useState<TriggerWalkAnswer | null>(null);
  const [triggerReceipt, setTriggerReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [triggerProblem, setTriggerProblem] = useState<string | null>(null);
  const [closing, setClosing] = useState<Record<string, unknown> | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [closeProblem, setCloseProblem] = useState<string | null>(null);
  const loadTriggers = async () => {
    const r = await impactB50.triggers(scope);
    setTriggers(r.ok && r.data !== undefined ? r.data.triggers : []);
  };
  const readClasses = async (invalidationId: string) => {
    const r = await impactB50.affected(scope, { invalidationId });
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the classes could not be read; try again');
    const p = parseAffected(r.data.products);
    setClassed({ invalidationId, products: p.products, dropped: p.dropped });
  };
  /* end B50 ci */

  const load = async () => {
    const r = await graph.listImpact(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the invalidations could not be read');
      return;
    }
    setHistory(r.data.invalidations);
  };
  useEffect(() => { void load(); /* B50 ci */ void loadTriggers(); /* end B50 ci */ }, [scope]);

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
          {/* B50 ci: the new buckets — classed by the server when the walk is recorded (read them under Assessments) */}
          {NEW_BUCKETS.map(([key, title, note]) => {
            const rows = ((shown as unknown as Record<string, AffectedObject[] | undefined>)[key]) ?? null;
            return rows === null ? null : <Affected key={key} title={title} rows={rows} note={applied === null ? `${note}; classed when the walk is recorded` : `${note}; read their classes under Assessments`} />;
          })}
          {/* end B50 ci */}
        </section>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Assessments</h2>
      {history.length === 0 ? <Empty>Nothing has been propagated yet.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead>
            <tr><Th>Trigger</Th><Th>State</Th><Th>Statement</Th><Th>Correction case</Th><Th>Opened</Th>{/* B50 ci */}<Th>Classes</Th>{/* end B50 ci */}</tr>
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
                {/* B50 ci */}
                <Td>{h['state'] !== 'assessed' ? 'not assessed' : (
                  <GovernedButton label="Read the classes" pendingLabel="reading" variant="quiet" onRun={() => readClasses(String(h['invalidation_id']))} />
                )}</Td>
                {/* end B50 ci */}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* B50 ci */}
      {classed === null ? null : (
        <section aria-labelledby="classes-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="classes-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Classed products of assessment <Mono>{classed.invalidationId.slice(0, 12)}…</Mono></h2>
          {classed.dropped > 0 ? <LiveStatus assertive>{classed.dropped} row(s) of the answer were malformed and are not shown; reload the assessment to read them again.</LiveStatus> : null}
          <AffectedProductList products={classed.products} caption={`The products assessment ${classed.invalidationId.slice(0, 8)} reached`} />
        </section>
      )}

      <section aria-labelledby="trig-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="trig-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Impact triggers</h2>
        <UnknownNote>
          Besides a correction, six other things can make a conclusion unsafe, and a person may challenge one. Each is recorded by its steward and
          then <strong>walked by the domain&apos;s propagation agent</strong> — the trigger stays recorded; nothing it reaches is rewritten.
        </UnknownNote>
        <label htmlFor="tkind">What happened</label>
        <select id="tkind" style={inputStyle} value={kind} onChange={(e) => { const k = e.target.value as TriggerKind; setKind(k); setObjectType(TRIGGERS[k].types[0] ?? ''); setBasis({}); setWalk(null); setTriggerProblem(null); }}>
          {TRIGGER_KINDS.map((k) => <option key={k} value={k}>{TRIGGERS[k].label}</option>)}
        </select>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>Recorded by {TRIGGERS[kind].steward}.</p>
        <label htmlFor="ttype">The object it names</label>
        <select id="ttype" style={inputStyle} value={objectType} onChange={(e) => setObjectType(e.target.value)}>
          {TRIGGERS[kind].types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label htmlFor="tid">Its object id</label>
        <input id="tid" style={inputStyle} value={objectId} onChange={(e) => setObjectId(e.target.value)} placeholder="the id of the object the trigger names" />
        <label htmlFor="treason">Reason</label>
        <input id="treason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why this makes conclusions unsafe, in your words" />
        {TRIGGERS[kind].basis.map((b) => (
          <div key={b.key}>
            <label htmlFor={`tb-${b.key}`}>{b.label}</label>
            {b.options === undefined
              ? <input id={`tb-${b.key}`} style={inputStyle} value={basis[b.key] ?? ''} onChange={(e) => setBasis({ ...basis, [b.key]: e.target.value })} placeholder={b.help} aria-describedby={`tb-${b.key}-h`} />
              : (
                <select id={`tb-${b.key}`} style={inputStyle} value={basis[b.key] ?? ''} onChange={(e) => setBasis({ ...basis, [b.key]: e.target.value })} aria-describedby={`tb-${b.key}-h`}>
                  <option value="">choose…</option>
                  {b.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
            <span id={`tb-${b.key}-h`} style={{ color: 'var(--eye-color-ink-muted)' }}>{b.help}</span>
          </div>
        ))}
        <CommandReview
          action={`graph.impact.trigger.${kind}`}
          object={{ type: objectType, id: objectId.trim() === '' ? 'not named yet' : objectId.trim(), version: null, title: TRIGGERS[kind].label }}
          digest={null}
          eligibility={eligibility({ action: `graph.impact.trigger.${kind}`, me: me.principalId, isHuman: me.kind === 'human', roles: rolesIn(me.bindings, scope), requiredRoles: TRIGGERS[kind].roles })}
          consequence={{ source: 'stated', effect: `records the ${TRIGGERS[kind].label.toLowerCase()} on the object; the domain's propagation agent then walks what rests on it and every product it reaches is classed`,
            affected: [`${objectType} ${objectId.trim() === '' ? '(not named yet)' : objectId.trim().slice(0, 8)}`, 'what rests on it'], users: ['the owners of the reached products'],
            reversibility: 'the trigger stays recorded; nothing it reaches is rewritten', residualRisk: 'a domain with no propagation agent walks it once one is registered', audit: 'the trigger, its walk and its classes are recorded', blockers: [] }}
          extraReasons={triggerFormProblems({ kind, objectType, objectId, reason, basis })}
          actionLabel="Record the trigger" pendingLabel="recording"
          receipt={triggerReceipt} problem={triggerProblem}
          onRun={async () => {
            setTriggerProblem(null);
            const r = await impactB50.record(scope, kind, triggerPayload({ kind, objectType, objectId, reason, basis }));
            if (!r.ok || r.data === undefined) { const m = r.error?.message ?? 'the trigger was not recorded; check the fields and try again'; setTriggerProblem(m); throw new Error(m); }
            setWalk(r.data.walk); setTriggerReceipt(r.data.receipt);
            await load(); await loadTriggers();
          }} />
        {walk === null ? null : <LiveStatus>{walkOutcomeText(walk)}</LiveStatus>}

        <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Recorded triggers ({triggers?.length ?? 0})</h3>
        {triggers === null ? <Empty>reading the triggers…</Empty> : triggers.length === 0 ? <Empty>No trigger has been recorded in this domain.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Trigger</Th><Th>Object</Th><Th>Walk</Th><Th>Reason</Th><Th>Recorded</Th><Th>Challenge</Th></tr></thead>
            <tbody>
              {triggers.map((t) => (
                <tr key={String(t['trigger_id'])}>
                  <Td>{TRIGGERS[String(t['trigger_kind']) as TriggerKind]?.label ?? String(t['trigger_kind'])}</Td>
                  <Td mono>{String(t['object_type'])} {String(t['object_id']).slice(0, 8)}…</Td>
                  <Td>{triggerStateText(t)}</Td>
                  <Td>{String(t['reason'])}</Td>
                  <Td>{fmtInstant(t['recorded_at'])}</Td>
                  <Td>{t['trigger_kind'] !== 'human_challenge' || t['closed_at'] ? '—' : (
                    <GovernedButton label="Review the challenge closure" pendingLabel="opening" variant="quiet" onRun={async () => { setClosing(t); setCloseReason(''); setCloseProblem(null); }} />
                  )}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {closing === null ? null : (
          <CommandReview
            action="graph.impact.trigger.close"
            object={{ type: 'ITR', id: String(closing['trigger_id']), version: null, title: `Human challenge on ${String(closing['object_type'])} ${String(closing['object_id']).slice(0, 8)}…`, state: 'open' }}
            digest={null}
            eligibility={eligibility({ action: 'graph.impact.trigger.close', me: me.principalId, isHuman: me.kind === 'human', roles: rolesIn(me.bindings, scope), requiredRoles: ['knowledge_owner', 'domain_admin'],
              excluded: [{ principal: String(closing['recorded_by']), why: 'you opened this challenge — the deciding person closes it' }] })}
            consequence={{ source: 'stated', effect: 'closes the challenge: what rests on the object is no longer classed challenged at the next walk', affected: [`${String(closing['object_type'])} ${String(closing['object_id']).slice(0, 8)}`],
              users: ['the challenge\'s opener', 'the owners of the reached products'], reversibility: 'the challenge stays recorded with its closure; the walks already recorded are kept', residualRisk: 'none named', audit: 'the closure and its reason are recorded', blockers: [] }}
            rationale={{ value: closeReason, onChange: setCloseReason, min: 8, label: 'Why the challenge is closed' }}
            actionLabel="Close the challenge" pendingLabel="closing"
            problem={closeProblem}
            onRun={async () => {
              setCloseProblem(null);
              const r = await impactB50.close(scope, String(closing['trigger_id']), closeReason.trim());
              if (!r.ok) { const m = r.error?.message ?? 'the challenge was not closed; check the reason and try again'; setCloseProblem(m); throw new Error(m); }
              setClosing(null); await loadTriggers();
            }} />
        )}
      </section>
      {/* end B50 ci */}

      {history.length === 0 ? null : (
        <ScrollBox label="The assessments as stored">
          {JSON.stringify(history, null, 2)}
        </ScrollBox>
      )}
    </>
  );
}
