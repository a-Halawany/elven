'use client';
/**
 * B82 §EV — the RIGHTS TERMS acts on the evidence page (DESIGN D10; CMP-031, UX-26-002): declare or revise the terms of this evidence's source
 * contract version (expiry — none means "no expiry declared" —, purposes, prohibited uses, attribution, the reason), or withdraw them. A data
 * steward's or a collection manager's act, human-gated; the PDP and the port decide (a role without it sees the server's refusal in its own
 * words). The request id is minted once per form and kept across a retry, so a retry answers the recorded act. Nothing optimistic: the
 * answer shown is the server's, with its receipt.
 */
import { useId, useState } from 'react';
import { evidenceApi, type Receipt, type Scope } from '../../../../lib/evidence-api-b82';
import type { RightsTerms } from '../../../../lib/b82-seams';
import { GovernedButton, textareaStyle } from '../../../../components/observation';
import { Disclosure } from '../../../../components/layers';
import { ErrorNote, inputStyle } from '../../../../components/ui';

const lines = (v: string): string[] => v.split('\n').map((x) => x.trim()).filter((x) => x !== '');

export function RightsTermsForm({ scope, sourceId, contractVersion, current, onChanged }: {
  scope: Scope; sourceId: string | null; contractVersion: number | null; current: RightsTerms | null; onChanged: () => void;
}) {
  const id = useId();
  const [expires, setExpires] = useState('');
  const [purposes, setPurposes] = useState(current?.purposes.join('\n') ?? '');
  const [prohibited, setProhibited] = useState(current?.prohibitedUses.join('\n') ?? '');
  const [attribution, setAttribution] = useState(current?.attribution ?? '');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [answer, setAnswer] = useState<{ text: string; receipt: Receipt } | null>(null);
  if (sourceId === null || contractVersion === null) return <p className="eye-ev-note">The source contract of this evidence is not resolved on this read; rights terms cannot be declared from here.</p>;
  const expected = current?.version ?? 0;
  const blocked = lines(purposes).length === 0 ? 'state at least one purpose' : reason.trim().length < 8 ? 'state the reason (8 characters or more)' : null;
  return (
    <Disclosure title="Declare or withdraw this source's rights terms" authority="a data steward or a collection manager, as a named person (human-gated)"
      uncertainty={current === null ? 'no rights terms are declared for this contract version — no expiry declared' : `terms v${current.version} are ${current.state.replace('_', ' ')}`}>
      <p className="eye-ev-note">Source {sourceId.slice(0, 8)}… contract v{contractVersion}. You are {current === null ? 'declaring version 1' : `revising version ${current.version}`}; the record keeps every version.</p>
      <label htmlFor={`${id}-exp`} className="eye-text-label">Expiry (your local time; leave empty for “no expiry declared”)</label>
      <input id={`${id}-exp`} type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} style={inputStyle} />
      <label htmlFor={`${id}-pur`} className="eye-text-label">Purposes the evidence may be used for (one per line)</label>
      <textarea id={`${id}-pur`} value={purposes} onChange={(e) => setPurposes(e.target.value)} rows={3} style={textareaStyle} />
      <label htmlFor={`${id}-pro`} className="eye-text-label">Prohibited uses (one per line; may be empty)</label>
      <textarea id={`${id}-pro`} value={prohibited} onChange={(e) => setProhibited(e.target.value)} rows={2} style={textareaStyle} />
      <label htmlFor={`${id}-att`} className="eye-text-label">Attribution the terms require (may be empty)</label>
      <input id={`${id}-att`} type="text" value={attribution} onChange={(e) => setAttribution(e.target.value)} style={inputStyle} />
      <label htmlFor={`${id}-rsn`} className="eye-text-label">Reason — where the terms come from (the licence, the agreement, the notice)</label>
      <textarea id={`${id}-rsn`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={textareaStyle} />
      {blocked !== null && <p className="eye-ev-note" id={`${id}-why`}>Declaring is not available yet: {blocked}.</p>}
      <GovernedButton label="Declare the rights terms" pendingLabel="Declaring the rights terms" disabled={blocked !== null}
        onRun={async () => {
          setError(null);
          const r = await evidenceApi.declareRights(scope, { sourceId, contractVersion, expectedVersion: expected, expiresAt: expires === '' ? null : new Date(expires).toISOString(),
            purposes: lines(purposes), prohibitedUses: lines(prohibited), attribution: attribution.trim() === '' ? null : attribution.trim(), reason: reason.trim(), requestId });
          if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
          setAnswer({ text: `Recorded: rights terms v${String(r.data.terms['version'])} — ${String(r.data.terms['state']).replace('_', ' ')} · ${String(r.data.terms['expiry_statement'])}${r.data.terms['replayed'] === true ? ' (this request was already recorded; its answer is repeated)' : ''}`, receipt: r.data.receipt });
          setRequestId(crypto.randomUUID()); setReason('');
          onChanged();
        }} />
      {current !== null && current.state !== 'withdrawn' && (
        <>
          <p className="eye-ev-note">Withdrawing records a new version in state withdrawn: the terms’ history is kept, the evidence of this contract version is then refused at every decision-active use, and a later declaration grants the rights again.</p>
          <GovernedButton label="Withdraw the rights terms" pendingLabel="Withdrawing the rights terms" variant="critical" disabled={reason.trim().length < 8}
            onRun={async () => {
              setError(null);
              const r = await evidenceApi.withdrawRights(scope, current.termsId, { expectedVersion: current.version, reason: reason.trim(), requestId });
              if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
              setAnswer({ text: `Recorded: rights terms v${String(r.data.terms['version'])} — withdrawn`, receipt: r.data.receipt });
              setRequestId(crypto.randomUUID()); setReason('');
              onChanged();
            }} />
        </>
      )}
      <ErrorNote error={error} />
      {answer !== null && <p role="status" className="eye-ev-note">{answer.text} · policy decision {answer.receipt.policyDecisionId.slice(0, 13)}…, audit seq {answer.receipt.auditSeq}</p>}
    </Disclosure>
  );
}
