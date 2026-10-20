'use client';
/**
 * CP-6 B40 §RG — SOURCE DISCOVERY (JRN-02 "Discover → rights → contract → validate → approve → collect → monitor"; V00-T-032, V01-T-009).
 * A domain analyst or collection manager proposes a source it found — how it was found, the publisher, the terms, the purposes, an
 * assessment — before any contract exists. A proposed candidate is registered from a PREFILLED SRC@v4 draft on the registration page (the
 * promotion registers a DRAFT contract; a collection manager who is not the registrar evaluates and approves it) or declined with a reason.
 * Every act goes through the Command Review; its binding is the client-side payload review (the server binds no digest for these acts).
 * Nothing optimistic: the list is the server's after each act.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../../layout';
import { Empty, LiveStatus } from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';
import { Field, TextArea } from '../../../../components/forms';
import { CandidateTable, ReviewedRequest } from '../../../../components/source-registry';
import { registryApi } from '../../../../lib/sources-api-b40';
import { candidatePayload, candidateProblems, registryEffect, roleEligibility, type CandidateForm } from '../../../../lib/sources-b40';

type Row = Record<string, unknown>;
type ErrorT = { code: string; message: string; correlationId: string } | null;
const EMPTY: CandidateForm = { name: '', publisher: '', howFound: '', termsUrl: '', purposes: '', assessment: '' };

export default function SourceDiscoveryPage() {
  const { scope, me } = useShell();
  const [list, setList] = useState<Row[] | null>(null);
  const [error, setError] = useState<ErrorT>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<CandidateForm>(EMPTY);
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [declineId, setDeclineId] = useState('');
  const [declineReason, setDeclineReason] = useState('');

  const load = useCallback(async () => {
    const r = await registryApi.candidates(scope);
    if (r.ok && r.data !== undefined) { setList(r.data.candidates); setError(null); } else setError(r.error ?? null);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const proposer = roleEligibility(me.bindings, ['domain_analyst', 'collection_manager'], { domainId: scope.domainId }, 'Proposing a source');
  const manager = roleEligibility(me.bindings, ['domain_analyst', 'collection_manager'], { domainId: scope.domainId }, 'Declining a candidate');
  const problems = candidateProblems(form);
  const payload = { ...candidatePayload(form), requestId };
  const open = (list ?? []).filter((c) => c['state'] === 'proposed');
  const set = (k: keyof CandidateForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <h1 className="eye-page-title">Source discovery</h1>
      <p>
        A source found but not yet contracted. Proposing one registers nothing and collects nothing: its contract is registered from a
        prefilled SRC@v4 draft, evaluated and approved by a collection manager who is not its registrar. <Link href="/observation/sources">Back to the sources</Link>
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {notice !== null && <LiveStatus>{notice}</LiveStatus>}

      <section aria-labelledby="candidates">
        <h2 id="candidates">Proposed sources</h2>
        {list === null ? <Empty>Reading the candidates…</Empty> : (
          <CandidateTable candidates={list} action={(c) => c['state'] === 'proposed'
            ? <Link href={`/observation/sources/new?candidate=${String(c['candidate_id'])}`}>Register the contract from this candidate</Link> : null} />
        )}
      </section>

      <section aria-labelledby="propose">
        <h2 id="propose">Propose a source</h2>
        <Field id="cand-name" label="Source name" value={form.name} onChange={set('name')} required />
        <Field id="cand-publisher" label="Publisher" value={form.publisher} onChange={set('publisher')} required />
        <Field id="cand-how" label="How it was found" value={form.howFound} onChange={set('howFound')} required />
        <Field id="cand-terms" label="Terms address (https, or empty)" value={form.termsUrl} onChange={set('termsUrl')} />
        <TextArea id="cand-purposes" label="Proposed purposes (one per line)" value={form.purposes} onChange={set('purposes')} required maxChars={2000} rows={3} />
        <TextArea id="cand-assessment" label="Your assessment" value={form.assessment} onChange={set('assessment')} required maxChars={4000} rows={4} />
        <ReviewedRequest action="observation.source.discover" object={{ type: 'SRC', id: requestId, version: null, title: form.name.trim() === '' ? 'a new source candidate' : form.name.trim() }}
          payload={payload} eligibility={proposer} consequence={registryEffect('observation.source.discover')} extraReasons={problems}
          actionLabel="Propose the source" pendingLabel="Proposing"
          onRun={async (p) => {
            const r = await registryApi.propose(scope, p as Row & { requestId: string });
            if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
            setReceipt(r.data?.receipt ?? null);
            setNotice(`Proposed: ${String(r.data?.candidate['name'] ?? '')} (${String(r.data?.candidate['state'] ?? '')}).`);
            setForm(EMPTY); setRequestId(crypto.randomUUID());
            await load();
          }} />
      </section>

      <section aria-labelledby="decline">
        <h2 id="decline">Decline a candidate</h2>
        {open.length === 0 ? <Empty>No proposed candidate is waiting.</Empty> : (
          <>
            <label htmlFor="decline-which">Candidate to decline</label>
            <select id="decline-which" className="eye-input" value={declineId} onChange={(e) => setDeclineId(e.target.value)}>
              <option value="">Choose a proposed candidate</option>
              {open.map((c) => <option key={String(c['candidate_id'])} value={String(c['candidate_id'])}>{String(c['name'])}</option>)}
            </select>
            <TextArea id="decline-reason" label="Why it is declined" value={declineReason} onChange={setDeclineReason} required maxChars={2000} rows={3} />
            <ReviewedRequest action="observation.source.discover" object={{ type: 'SRC', id: declineId === '' ? 'none' : declineId, version: null, title: 'decline a source candidate', state: 'proposed' }}
              payload={{ candidateId: declineId, reason: declineReason.trim() }} eligibility={manager}
              consequence={{ effect: 'declines the candidate — it is not registered; the proposal and your reason stay in the record', affected: ['the candidate'], users: ['its proposer'],
                reversibility: 'not reversed — a new proposal is made instead', residualRisk: 'none', audit: 'candidate.declined and the audit chain', source: 'stated', blockers: [] }}
              extraReasons={[...(declineId === '' ? ['choose the candidate to decline'] : []), ...(declineReason.trim().length < 8 ? ['state why it is declined (8+ characters)'] : [])]}
              actionLabel="Decline the candidate" pendingLabel="Declining" variant="critical"
              onRun={async () => {
                const r = await registryApi.decline(scope, declineId, declineReason.trim());
                if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
                setReceipt(r.data?.receipt ?? null); setNotice('Declined — the candidate and your reason stay in the record.');
                setDeclineId(''); setDeclineReason(''); await load();
              }} />
          </>
        )}
      </section>
    </>
  );
}
