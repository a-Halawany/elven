'use client';
/**
 * CP-6 B40 §RG — the source page's REGISTRY section (mounted in a marked block of the source page): the registry record per contract version
 * (the v4 approval gate or "not recorded before B40"), the evaluation before approval (D5), the customer approval (D13), the stewardship,
 * the economics against the run meter, the source incidents (PER-11), and THE RIGHTS LIFECYCLE (DESIGN D4) — narrow, withdraw and restore
 * through the Command Review with the server's change preview; the act binds the contract version it read (server-enforced: a stale version
 * is refused). Every refusal is shown in the server's words; nothing optimistic — the record is read again after each act.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DefinitionRow, Empty, LiveStatus } from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';
import { Field, TextArea } from '../../../../components/forms';
import { Button } from '../../../../components/actions';
import { IncidentList, RegistryVersions, ReviewedRequest, RightsHistory } from '../../../../components/source-registry';
import { registryApi } from '../../../../lib/sources-api-b40';
import {
  INCIDENT_KINDS, RECOMMENDATIONS, RIGHTS_OPERATIONS, STEWARDSHIP_STATES, TEST_OUTCOMES, economicsLine, evaluationPayload, evaluationProblems, ownerName, registryEffect,
  rightsConsequence, rightsPayload, rightsProblems, roleEligibility, versionBinding, type Binding, type EvaluationForm, type RightsForm, type RightsOperation,
} from '../../../../lib/sources-b40';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
type ErrorT = { code: string; message: string; correlationId: string } | null;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const EVAL: EvaluationForm = { authority: '', rightsEvidence: '', coverageFit: '', cost: '', risks: '', tests: [{ name: '', outcome: 'pass', note: '' }], recommendation: 'approve', reason: '' };
const RIGHTS: RightsForm = { operation: 'withdraw', reason: '', evidence: '', deletionObligation: '', purposes: '' };

export function RegistrySection({ scope, sourceId, me, onChanged }: { scope: Scope; sourceId: string; me: { principalId: string; bindings: Binding[] }; onChanged: () => Promise<void> }) {
  const [rec, setRec] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [error, setError] = useState<ErrorT>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ev, setEv] = useState<EvaluationForm>(EVAL);
  const [rf, setRf] = useState<RightsForm>(RIGHTS);
  const [ca, setCa] = useState({ decision: 'approve', scope: '', reason: '' });
  const [st, setSt] = useState({ steward: me.principalId, state: 'assigned', reviewDue: '', reason: '' });
  const [inc, setInc] = useState({ kind: 'quality', statement: '', owner: '' });
  const [resolution, setResolution] = useState('');
  const [ids, setIds] = useState(() => ({ ev: crypto.randomUUID(), rights: crypto.randomUUID(), ca: crypto.randomUUID(), st: crypto.randomUUID(), inc: crypto.randomUUID() }));
  const fresh = (k: keyof typeof ids) => setIds((x) => ({ ...x, [k]: crypto.randomUUID() }));

  const load = useCallback(async () => {
    const r = await registryApi.record(scope, sourceId);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setRec(r.data.registry); setError(null);
  }, [scope, sourceId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let live = true;
    void registryApi.preview(scope, sourceId, rf.operation === 'narrow' ? { operation: 'narrow', purposes: rf.purposes.split(/\n|,/).map((x) => x.trim()).filter(Boolean) } : { operation: rf.operation })
      .then((p) => { if (live) setPreview(p.ok && p.data !== undefined ? p.data.preview : null); });
    return () => { live = false; };
  }, [scope, sourceId, rf.operation, rf.purposes, rec]);

  const settle = async (r: { ok: boolean; data?: { receipt?: { policyDecisionId: string; auditSeq: number } }; error?: { code: string; message: string; correlationId: string; retry?: string } }, said: string) => {
    if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
    setReceipt(r.data?.receipt ?? null); setNotice(said); setError(null);
    await load(); await onChanged();
  };

  if (rec === null) return error !== null ? <ErrorNote error={error} /> : <Empty>Reading the registry record…</Empty>;
  const versions = rows(rec['versions']);
  const latest = versions[0] ?? null;
  const latestVersion = latest === null ? null : Number(latest['contract_version']);
  const draftV4 = latest !== null && latest['lifecycle_state'] === 'draft' && latest['v4'] === true;
  const withdrawn = rec['outstanding_withdrawal'] !== null && rec['outstanding_withdrawal'] !== undefined;
  const purposes = latest === null ? [] : (Array.isArray(latest['purposes']) ? (latest['purposes'] as string[]) : []);
  const where = { domainId: scope.domainId };
  const manager = roleEligibility(me.bindings, ['collection_manager'], where, 'A rights change');
  const evaluator = roleEligibility(me.bindings, ['collection_manager'], where, 'Evaluating a contract');
  const sponsor = roleEligibility(me.bindings, ['customer_sponsor', 'tenant_admin'], { ...where, tenantScope: true }, 'The customer approval');
  const steward = roleEligibility(me.bindings, ['data_steward', 'collection_manager'], where, 'Changing the stewardship');
  const reporter = roleEligibility(me.bindings, ['collection_manager', 'domain_analyst'], where, 'Opening a source incident');
  const stewardship = (rec['stewardship'] ?? null) as Row | null;
  const binding = versionBinding(latestVersion);
  const previewBinding = versionBinding(preview === null ? null : Number(preview['latest_version']));
  /* the lifecycle is the page header's (LS-bound); the review names the object and the version only */
  const object = { type: 'SRC', id: sourceId, version: latestVersion, title: String(latest?.['schema_ref'] ?? 'source contract') };

  return (
    <section aria-labelledby="registry" className="eye-registry">
      <h2 id="registry">Registry, stewardship and rights</h2>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {notice !== null && <LiveStatus>{notice}</LiveStatus>}
      <RegistryVersions versions={versions} />
      <dl>
        <DefinitionRow term="Economics">{economicsLine(rec['economics'] as Row | null)}</DefinitionRow>
        <DefinitionRow term="Steward">{stewardship === null ? 'no stewardship recorded' : `${ownerName(stewardship['steward'])} · ${String(stewardship['state']).replace(/_/g, ' ')} · review due ${String(stewardship['review_due'])}${stewardship['review_overdue'] === true ? ' (overdue)' : ''}`}</DefinitionRow>
        <DefinitionRow term="Discovered as">{rec['candidate'] ? `${String((rec['candidate'] as Row)['name'])} — proposed by ${ownerName((rec['candidate'] as Row)['proposer'])}` : 'not recorded before B40, or registered directly'}</DefinitionRow>
        <DefinitionRow term="Revocation impact"><Link href={`/observation/sources/${sourceId}/impact`}>Read what rests on this source</Link></DefinitionRow>
      </dl>

      {draftV4 && latestVersion !== null && (
        <section aria-labelledby="evaluation">
          <h3 id="evaluation">Evaluate contract version {latestVersion}</h3>
          <p>An SRC@v4 contract is approved only on its latest evaluation recommending approval. You may not evaluate a version you registered.</p>
          <TextArea id="ev-authority" label="Publisher's authority" value={ev.authority} onChange={(v) => setEv({ ...ev, authority: v })} maxChars={2000} required />
          <TextArea id="ev-rights" label="Rights and purpose evidence" value={ev.rightsEvidence} onChange={(v) => setEv({ ...ev, rightsEvidence: v })} maxChars={2000} required />
          <TextArea id="ev-coverage" label="Coverage fit against the declared universe" value={ev.coverageFit} onChange={(v) => setEv({ ...ev, coverageFit: v })} maxChars={2000} required />
          <Field id="ev-cost" label="Cost" value={ev.cost} onChange={(v) => setEv({ ...ev, cost: v })} required />
          <TextArea id="ev-risks" label="Risks (one per line)" value={ev.risks} onChange={(v) => setEv({ ...ev, risks: v })} maxChars={2000} />
          {ev.tests.map((t, i) => (
            <div key={i} className="eye-registry-test">
              <Field id={`ev-test-${i}`} label={`Contract test ${i + 1}`} value={t.name} onChange={(v) => setEv({ ...ev, tests: ev.tests.map((x, j) => (j === i ? { ...x, name: v } : x)) })} />
              <label htmlFor={`ev-test-${i}-outcome`}>Outcome of test {i + 1}</label>
              <select id={`ev-test-${i}-outcome`} className="eye-input" value={t.outcome} onChange={(e) => setEv({ ...ev, tests: ev.tests.map((x, j) => (j === i ? { ...x, outcome: e.target.value } : x)) })}>
                {TEST_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
              </select>
            </div>
          ))}
          <Button label="Add a contract test" variant="quiet" onClick={() => setEv({ ...ev, tests: [...ev.tests, { name: '', outcome: 'pass', note: '' }] })} />
          <label htmlFor="ev-recommendation">Recommendation</label>
          <select id="ev-recommendation" className="eye-input" value={ev.recommendation} onChange={(e) => setEv({ ...ev, recommendation: e.target.value })}>
            {RECOMMENDATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <TextArea id="ev-reason" label="Reason for the recommendation" value={ev.reason} onChange={(v) => setEv({ ...ev, reason: v })} maxChars={2000} required />
          <ReviewedRequest action="observation.source.evaluate" object={object} payload={{ ...evaluationPayload(ev, latestVersion), requestId: ids.ev }} eligibility={evaluator}
            consequence={registryEffect('observation.source.evaluate')} extraReasons={evaluationProblems(ev)} actionLabel="Record the evaluation" pendingLabel="Recording"
            onRun={async (p) => { await settle(await registryApi.evaluate(scope, sourceId, p as Row & { requestId: string }), 'Evaluation recorded.'); setEv(EVAL); fresh('ev'); }} />
        </section>
      )}

      <section aria-labelledby="rights">
        <h3 id="rights">The rights lifecycle</h3>
        <p>
          {withdrawn ? 'The rights stand WITHDRAWN: collection is stopped and the decision-active use of this source\'s evidence is refused until they are restored — reading stays as it was.'
            : 'The rights stand. A withdrawal stops collection, removes the schedule, marks every resting product and refuses the decision-active use of the evidence until a restoration.'}
        </p>
        <RightsHistory changes={rows(rec['rights_changes'])} />
        <label htmlFor="rights-op">Rights change</label>
        <select id="rights-op" className="eye-input" value={rf.operation} onChange={(e) => setRf({ ...rf, operation: e.target.value as RightsOperation })}>
          {RIGHTS_OPERATIONS.map((o) => <option key={o} value={o}>{o === 'withdraw' ? 'Withdraw the rights' : o === 'restore' ? 'Restore the rights' : 'Narrow the purposes'}</option>)}
        </select>
        <TextArea id="rights-reason" label="Reason" value={rf.reason} onChange={(v) => setRf({ ...rf, reason: v })} maxChars={2000} required />
        {rf.operation !== 'narrow' ? <TextArea id="rights-evidence" label="Evidence (the notice, the agreement, the confirmation)" value={rf.evidence} onChange={(v) => setRf({ ...rf, evidence: v })} maxChars={4000} required /> : null}
        {rf.operation === 'withdraw' ? <TextArea id="rights-deletion" label={`Deletion obligation (empty for none; the contract declares: ${String(latest?.['deletion_obligation'] ?? 'not recorded')})`} value={rf.deletionObligation} onChange={(v) => setRf({ ...rf, deletionObligation: v })} maxChars={1000} /> : null}
        {rf.operation === 'narrow' ? <TextArea id="rights-purposes" label={`Purposes kept (one per line; in force: ${purposes.join(', ')})`} value={rf.purposes} onChange={(v) => setRf({ ...rf, purposes: v })} maxChars={2000} required /> : null}
        {latestVersion !== null ? (
          <ReviewedRequest action="observation.source.change_rights" object={object} payload={{ ...rightsPayload(rf, latestVersion), requestId: ids.rights }}
            binding={{ shown: previewBinding, current: binding }} eligibility={manager} consequence={rightsConsequence(preview, rf.operation)}
            extraReasons={rightsProblems(rf, { purposes, withdrawn })}
            actionLabel={rf.operation === 'withdraw' ? 'Withdraw the rights' : rf.operation === 'restore' ? 'Restore the rights' : 'Narrow the purposes'}
            pendingLabel={rf.operation === 'withdraw' ? 'Withdrawing' : rf.operation === 'restore' ? 'Restoring' : 'Narrowing'} variant={rf.operation === 'withdraw' ? 'critical' : 'primary'}
            onRun={async (p) => {
              const r = await registryApi.rights(scope, sourceId, p as Row & { requestId: string });
              await settle(r, rf.operation === 'withdraw' ? `Rights withdrawn — the history is kept; ${String(r.data?.change['deletion_statement'] ?? '')}` : rf.operation === 'restore' ? `Rights restored${r.data?.change['reactivated'] === true ? ' — the suspended version resumed' : ''}. ${String(r.data?.change['note'] ?? '')}` : 'Purposes narrowed.');
              setRf(RIGHTS); fresh('rights');
            }} />
        ) : null}
      </section>

      {latestVersion !== null && (
        <section aria-labelledby="customer">
          <h3 id="customer">The customer&apos;s approval of its use</h3>
          <p>Recorded by the tenant&apos;s customer sponsor or tenant administrator — never the registrar or the approver. A record the admission cites, not a gate; it claims a demonstration, never real acceptance.</p>
          <label htmlFor="ca-decision">Customer decision</label>
          <select id="ca-decision" className="eye-input" value={ca.decision} onChange={(e) => setCa({ ...ca, decision: e.target.value })}>
            <option value="approve">approve</option><option value="decline">decline</option>
          </select>
          <TextArea id="ca-scope" label="The use approved for the tenant" value={ca.scope} onChange={(v) => setCa({ ...ca, scope: v })} maxChars={1000} required />
          <TextArea id="ca-reason" label="Reason" value={ca.reason} onChange={(v) => setCa({ ...ca, reason: v })} maxChars={2000} required />
          <ReviewedRequest action="observation.source.customer_approve" object={object}
            payload={{ contractVersion: latestVersion, decision: ca.decision, scopeStatement: ca.scope.trim(), reason: ca.reason.trim(), claim: 'demonstration', requestId: ids.ca }}
            eligibility={sponsor} consequence={registryEffect('observation.source.customer_approve')}
            extraReasons={[...(ca.scope.trim().length < 8 ? ['state the use approved (8+ characters)'] : []), ...(ca.reason.trim().length < 8 ? ['state the reason (8+ characters)'] : [])]}
            actionLabel="Record the customer decision" pendingLabel="Recording"
            onRun={async (p) => { await settle(await registryApi.customerApproval(scope, sourceId, p as Row & { requestId: string }), 'Customer decision recorded.'); setCa({ decision: 'approve', scope: '', reason: '' }); fresh('ca'); }} />
        </section>
      )}

      <section aria-labelledby="stewardship">
        <h3 id="stewardship">Stewardship</h3>
        <Field id="st-steward" label="Steward (principal id)" value={st.steward} onChange={(v) => setSt({ ...st, steward: v })} required />
        <label htmlFor="st-state">Stewardship state</label>
        <select id="st-state" className="eye-input" value={st.state} onChange={(e) => setSt({ ...st, state: e.target.value })}>
          {STEWARDSHIP_STATES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
        </select>
        <Field id="st-review" label="Next review due" type="date" value={st.reviewDue} onChange={(v) => setSt({ ...st, reviewDue: v })} required />
        <TextArea id="st-reason" label="Reason" value={st.reason} onChange={(v) => setSt({ ...st, reason: v })} maxChars={2000} required />
        <ReviewedRequest action="observation.source.stewardship" object={object}
          payload={{ expectedVersion: stewardship === null ? 0 : Number(stewardship['version']), steward: st.steward.trim(), state: st.state, reviewDue: st.reviewDue, reason: st.reason.trim(), requestId: ids.st }}
          eligibility={steward} consequence={registryEffect('observation.source.stewardship')}
          extraReasons={[...(/^\d{4}-\d{2}-\d{2}$/.test(st.reviewDue) ? [] : ['choose the review date']), ...(st.reason.trim().length < 8 ? ['state the reason (8+ characters)'] : [])]}
          actionLabel="Record the stewardship" pendingLabel="Recording"
          onRun={async (p) => { await settle(await registryApi.stewardship(scope, sourceId, p as Row & { requestId: string }), 'Stewardship recorded.'); fresh('st'); }} />
      </section>

      <section aria-labelledby="incidents">
        <h3 id="incidents">Source incidents</h3>
        <IncidentList incidents={rows(rec['incidents'])} action={(i) => (
          <>
            <TextArea id={`res-${String(i['incident_id'])}`} label="Resolution" value={resolution} onChange={setResolution} maxChars={2000} />
            <ReviewedRequest action="observation.source.incident" object={{ type: 'SRC', id: String(i['incident_id']), version: null, title: `incident: ${String(i['kind'])}`, state: 'open' }}
              payload={{ incidentId: String(i['incident_id']), resolution: resolution.trim() }} eligibility={manager} consequence={registryEffect('observation.source.incident')}
              extraReasons={resolution.trim().length < 8 ? ['state the resolution (8+ characters)'] : []} actionLabel="Resolve the incident" pendingLabel="Resolving"
              onRun={async () => { await settle(await registryApi.resolveIncident(scope, String(i['incident_id']), resolution.trim()), 'Incident resolved.'); setResolution(''); }} />
          </>
        )} />
        <label htmlFor="inc-kind">Incident kind</label>
        <select id="inc-kind" className="eye-input" value={inc.kind} onChange={(e) => setInc({ ...inc, kind: e.target.value })}>
          {INCIDENT_KINDS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <TextArea id="inc-statement" label="What happened" value={inc.statement} onChange={(v) => setInc({ ...inc, statement: v })} maxChars={2000} required />
        <Field id="inc-owner" label="Owner (a collection manager's principal id)" value={inc.owner} onChange={(v) => setInc({ ...inc, owner: v })} required />
        <ReviewedRequest action="observation.source.incident" object={object}
          payload={{ kind: inc.kind, statement: inc.statement.trim(), owner: inc.owner.trim(), requestId: ids.inc }} eligibility={reporter} consequence={registryEffect('observation.source.incident')}
          extraReasons={[...(inc.statement.trim().length < 8 ? ['state what happened (8+ characters)'] : []), ...(inc.owner.trim() === '' ? ['name the owning collection manager'] : [])]}
          actionLabel="Open the incident" pendingLabel="Opening"
          onRun={async (p) => { await settle(await registryApi.openIncident(scope, sourceId, p as Row & { requestId: string }), 'Incident opened.'); setInc({ kind: 'quality', statement: '', owner: '' }); fresh('inc'); }} />
      </section>
    </section>
  );
}
