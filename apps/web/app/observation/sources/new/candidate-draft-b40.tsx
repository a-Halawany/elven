'use client';
/**
 * CP-6 B40 §RG — REGISTER FROM A DISCOVERED CANDIDATE (JRN-02: discover → rights → contract). Reached from Source discovery with
 * `?candidate=<id>`: the server's PREFILLED SRC@v4 draft (the candidate's name, publisher, terms and purposes; conservative defaults —
 * active content, macros, embedded files and hidden instructions quarantined; rights pending) and what a polled kind still lacks (its
 * endpoints, never invented). The promotion registers the completed draft as a DRAFT contract and promotes the candidate in one governed
 * transaction; a collection manager who is not the registrar evaluates and approves it. Rendered only with a candidate; the four-step form
 * below it is the v1–v3 registration, unchanged.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DefinitionRow, Empty } from '../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../components/ui';
import { Field } from '../../../../components/forms';
import { ReviewedRequest } from '../../../../components/source-registry';
import { registryApi } from '../../../../lib/sources-api-b40';
import { registryEffect, roleEligibility, type Binding } from '../../../../lib/sources-b40';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CandidateDraft({ scope, me }: { scope: { tenantId: string; domainId: string }; me: { bindings: Binding[] } }) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [kind, setKind] = useState('upload');
  const [endpoint, setEndpoint] = useState('');
  const [draft, setDraft] = useState<{ contract: Row; missing: string[]; state: string } | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [registered, setRegistered] = useState<{ sourceId: string; contractVersion: number } | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('candidate');
    setCandidateId(id !== null && UUID.test(id) ? id : null);
  }, []);
  useEffect(() => {
    if (candidateId === null) return;
    let live = true;
    void registryApi.draft(scope, candidateId, kind).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) { setDraft(r.data.draft); setError(null); } else { setDraft(null); setError(r.error ?? null); }
    });
    return () => { live = false; };
  }, [scope, candidateId, kind]);

  if (candidateId === null) return null;
  const contract: Row | null = draft === null ? null : {
    ...draft.contract,
    identity: { ...(draft.contract['identity'] as Row), endpoints: kind === 'upload' || endpoint.trim() === '' ? [] : [endpoint.trim()] },
  };
  const missing = (draft?.missing ?? []).filter((m) => !(m.startsWith('identity.endpoints') && kind !== 'upload' && /^https:\/\/\S{3,}$/.test(endpoint.trim())));
  const registrar = roleEligibility(me.bindings, ['domain_analyst', 'collection_manager', 'domain_admin'], { domainId: scope.domainId }, 'Registering a source contract');
  const ar = (contract?.['authority_and_rights'] ?? {}) as Row;

  return (
    <section aria-labelledby="from-candidate" className="eye-registry">
      <h2 id="from-candidate">Register the contract from a discovered source</h2>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {registered !== null ? (
        <p role="status">Registered as an SRC@v4 contract awaiting its evaluation and approval — <Link href={`/observation/sources/${registered.sourceId}`}>open the source</Link>. You cannot approve your own registration.</p>
      ) : draft === null ? <Empty>Reading the prefilled contract…</Empty> : (
        <>
          <dl>
            <DefinitionRow term="Source">{String(contract?.['name'] ?? '')} — {String(contract?.['publisher'] ?? '')}</DefinitionRow>
            <DefinitionRow term="Proposed purposes">{Array.isArray(ar['purposes']) ? (ar['purposes'] as string[]).join(', ') : ''}</DefinitionRow>
            <DefinitionRow term="Licence and basis">{String(ar['licence'] ?? '')} · {String(ar['legal_basis'] ?? '')}</DefinitionRow>
            <DefinitionRow term="Rights">{String(ar['rights_state'] ?? '')} until the evaluation and the approval</DefinitionRow>
            <DefinitionRow term="Content policy">active content, macros, embedded files and hidden instructions are quarantined (the SRC@v4 default)</DefinitionRow>
            <DefinitionRow term="Candidate state">{draft.state}</DefinitionRow>
          </dl>
          <label htmlFor="cand-kind">Connector kind</label>
          <select id="cand-kind" className="eye-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="upload">upload (an operator supplies the files)</option>
            <option value="rss">rss (a polled feed)</option>
            <option value="rest">rest (a polled API)</option>
          </select>
          {kind !== 'upload' ? <Field id="cand-endpoint" label="Endpoint (https)" value={endpoint} onChange={setEndpoint} required /> : null}
          {missing.length > 0 ? <ul aria-label="What the contract still lacks">{missing.map((m) => <li key={m}>{m}</li>)}</ul> : null}
          {contract !== null ? (
            <ReviewedRequest action="observation.source.register" object={{ type: 'SRC', id: candidateId, version: 1, title: String(contract['name'] ?? 'source contract') }}
              payload={{ contract }} eligibility={registrar} consequence={registryEffect('observation.source.register')} extraReasons={missing.length > 0 ? ['complete what the contract still lacks'] : []}
              actionLabel="Register the contract" pendingLabel="Registering"
              onRun={async () => {
                const r = await registryApi.promote(scope, candidateId, contract);
                if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
                setReceipt(r.data.receipt); setRegistered(r.data.source);
              }} />
          ) : null}
        </>
      )}
    </section>
  );
}
