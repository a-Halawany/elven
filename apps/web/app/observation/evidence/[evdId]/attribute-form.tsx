'use client';
/**
 * B40 §VA — a DATA STEWARD's override of one evidence attribute (geographic scope, language, sensitivity, licence) with a reason: it SUPERSEDES
 * the current value, the earlier one kept in the history (observation.evidence.attribute.set, human-gated; the PDP and the port decide — a role
 * without it sees the server's refusal in its own words). A side ledger: no header field changes (D11 / D22). The request id is minted once per
 * form and kept across a retry, so a retry answers the recorded act. Nothing optimistic: the answer shown is the server's, with its receipt.
 */
import { useId, useState } from 'react';
import { authenticityApi, type Receipt, type Scope } from '../../../../lib/authenticity-api-b40';
import { attributeFormProblems, attributeValue } from '../../../../lib/authenticity-b40';
import { GovernedButton, textareaStyle } from '../../../../components/observation';
import { Disclosure } from '../../../../components/layers';
import { ErrorNote, inputStyle } from '../../../../components/ui';

const ATTRIBUTES = [
  { code: 'geographic_scope', label: 'Geographic scope (places, one per line or comma separated)' },
  { code: 'language', label: 'Language (a BCP 47 tag: en, fr, de-DE, und)' },
  { code: 'sensitivity', label: 'Sensitivity (none, commercial, personal, special_category)' },
  { code: 'licence', label: 'Licence (a statement of the licence that applies)' },
] as const;

export function AttributeOverrideForm({ scope, evdId, version, onChanged }: { scope: Scope; evdId: string; version: number; onChanged: () => void }) {
  const id = useId();
  const [attribute, setAttribute] = useState<string>('language');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [answer, setAnswer] = useState<{ text: string; receipt: Receipt } | null>(null);
  if (!Number.isInteger(version) || version < 1) return null;
  const problems = attributeFormProblems({ attribute, value, reason });
  return (
    <Disclosure title="Set an evidence attribute of this version" authority="a data steward, as a named person (human-gated)"
      uncertainty="an override supersedes the current value; the earlier value stays in the history, and no header field changes">
      <label htmlFor={`${id}-att`} className="eye-text-label">Attribute</label>
      <select id={`${id}-att`} value={attribute} onChange={(e) => setAttribute(e.target.value)} style={inputStyle}>
        {ATTRIBUTES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
      </select>
      <label htmlFor={`${id}-val`} className="eye-text-label">Value</label>
      <textarea id={`${id}-val`} value={value} onChange={(e) => setValue(e.target.value)} rows={2} style={textareaStyle} />
      <label htmlFor={`${id}-rsn`} className="eye-text-label">Reason — why the declared value does not hold for this version</label>
      <textarea id={`${id}-rsn`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={textareaStyle} />
      {problems.length > 0 && <ul className="eye-cld-reasons" aria-label="Why setting the attribute is not available yet">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <GovernedButton label="Set the evidence attribute" pendingLabel="Setting the evidence attribute" disabled={problems.length > 0}
        onRun={async () => {
          setError(null);
          const r = await authenticityApi.setAttribute(scope, evdId, { version, attribute, value: attributeValue(attribute, value), reason: reason.trim(), requestId });
          if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
          setAnswer({ text: `Recorded: ${attribute.replace(/_/g, ' ')} of v${version} — superseding the earlier value, which is kept${r.data.attribute['replayed'] === true ? ' (this request was already recorded; its answer is repeated)' : ''}`, receipt: r.data.receipt });
          setRequestId(crypto.randomUUID()); setValue(''); setReason('');
          onChanged();
        }} />
      <ErrorNote error={error} />
      {answer !== null && <p role="status" className="eye-ev-note">{answer.text} · policy decision {answer.receipt.policyDecisionId.slice(0, 13)}…, audit seq {answer.receipt.auditSeq}</p>}
    </Disclosure>
  );
}
