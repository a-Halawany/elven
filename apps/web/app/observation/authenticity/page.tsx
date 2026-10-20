'use client';
/**
 * CP-6 B40 §VA (0123_b40_x_va; F-P1-02: L1-C06, ES-29-002) — PUBLISHER KEYS AND CONTENT AUTHENTICITY.
 *
 *   THE KEY REGISTER (observation.authenticity.read — metadata only, D9): each source with the scheme its contract declares, its keys (state in
 *   words), the key ledger and the outcomes recorded at intake. A data steward or a collection manager DECLARES a key (an Ed25519 public key or a
 *   TLS SPKI pin; a rotation names the key it replaces) and RETIRES one through the Command Review, which binds the key's FINGERPRINT the person
 *   reviewed — the port refuses a retirement whose fingerprint is not the key's (server-enforced, stale otherwise). An agent never acts here.
 *   THE TRANSFORMATION RULES (ES-29-002): a data steward PROPOSES; the privacy officer APPROVES or rejects (never the proposer) and RETIRES —
 *   each decision through the Command Review on the rule's DIGEST, bound by the port. A proposed rule relaxes nothing.
 *   THE INHERITED OBLIGATIONS of a product (objects.obligations.read): the most restrictive obligations through its recorded lineage, against its
 *   header and the approved rules; D22's meaningful NULL stated as "carried".
 *
 * One h1 in every state; a refusal is the server's, in its words; nothing optimistic — after an act the page reads the register again.
 * THREE CLAIMS: construction (this page); demonstrated operation (the act, SYNTHETIC personas) and real acceptance — never claimed here.
 */
import { useCallback, useEffect, useId, useState } from 'react';
import { useShell } from '../layout';
import { authenticityApi, type Receipt as ReceiptT } from '../../../lib/authenticity-api-b40';
import {
  keyFormProblems, ruleFormProblems, toKeyRegister, toObligations, toRules, typesOf,
  type KeyView, type RuleView, type SourceKeysView,
} from '../../../lib/authenticity-b40';
import { eligibility, rolesIn, type ConsequenceView } from '../../../lib/authority-b81';
import { InheritedObligationsPanel, PublisherKeyTable } from '../../../components/authenticity';
import { CommandReview } from '../../../components/authority';
import { Empty, GovernedButton, cardStyle, textareaStyle } from '../../../components/observation';
import { Disclosure } from '../../../components/layers';
import { ErrorNote, Receipt, inputStyle } from '../../../components/ui';

type Problem = { code: string; message: string; correlationId: string };
const RETIRE_EFFECT: ConsequenceView = {
  effect: 'retires this publisher key: it verifies nothing admitted after now — an item signed only with it is quarantined as an unknown signer', affected: ['this key'],
  users: ['the source’s collection', 'the readers of its evidence'], reversibility: 'not reversed — the key’s record and its history are kept; a key is declared again as a new row',
  residualRisk: 'evidence already admitted keeps its recorded outcome', audit: 'key.retired on the key ledger and the audit chain', source: 'stated', blockers: [],
};
const ruleEffect = (decision: 'approve' | 'reject' | 'retire', r: RuleView): ConsequenceView => ({
  effect: decision === 'approve' ? `approves the rule: a ${r.types.join('/')} may carry ${r.obligation} ${r.to} where it inherits ${r.from} (${r.transformation})`
    : decision === 'reject' ? 'rejects the rule: it never relaxes anything' : 'retires the rule: it stops relaxing anything from now',
  affected: [`rule ${r.ruleId.slice(0, 8)}…`, ...r.types.map((t) => `${t} products`)], users: ['the owners of the derived products', 'their readers'],
  reversibility: decision === 'approve' ? 'retired later by the privacy officer; the record is kept' : 'not reversed — the rule and its ledger are kept; a new rule is proposed instead',
  residualRisk: decision === 'approve' ? 'derived products relaxed under it read "relaxed by rule" with the rule cited' : 'products relaxed under it read "not satisfied" again',
  audit: `rule.${decision === 'retire' ? 'retired' : decision === 'approve' ? 'approved' : 'rejected'} on the rule ledger and the audit chain`, source: 'stated', blockers: [],
});

export default function AuthenticityPage() {
  const { scope, me } = useShell();
  const roles = rolesIn(me.bindings, scope);
  const [sources, setSources] = useState<SourceKeysView[] | null>(null);
  const [rules, setRules] = useState<RuleView[] | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [rev, setRev] = useState(0);
  const load = useCallback(async () => {
    const r = await authenticityApi.keys(scope, null);
    if (!r.ok || r.data === undefined) { setProblem(r.error ?? { code: `HTTP ${r.status}`, message: 'The key register was not read; reload the page to read it again.', correlationId: '' }); return; }
    setProblem(null); setReceipt(r.data.receipt); setSources(toKeyRegister(r.data.keys).sources);
    const rr = await authenticityApi.rules(scope);
    setRules(rr.ok && rr.data !== undefined ? toRules(rr.data.rules) : []);
  }, [scope]);
  useEffect(() => { void load(); }, [load, rev]);
  const changed = () => setRev((x) => x + 1);
  return (
    <>
      <h1>Publisher keys and content authenticity</h1>
      <p className="eye-ev-note">The keys each source’s publisher signs with, and what intake recorded for each item: verified, authenticity failed (admitted marked, readable,
        refused at every decision-active use), unsigned, not checkable, or an unknown signer (quarantined). Key metadata only — evidence is read on its own page.</p>
      {problem !== null ? <ErrorNote error={problem} /> : sources === null ? <Empty>Reading the key register…</Empty> : (
        <>
          <Receipt receipt={receipt} />
          <DeclareKeyForm sources={sources} onChanged={changed} />
          {sources.length === 0 ? <Empty>No source is recorded in this domain yet; keys are declared for a registered source.</Empty>
            : sources.map((s) => <SourceKeys key={s.sourceId} source={s} roles={roles} onChanged={changed} />)}
          <RulesSection rules={rules ?? []} roles={roles} onChanged={changed} />
          <ObligationsLookup />
        </>
      )}
    </>
  );
}

function SourceKeys({ source, roles, onChanged }: { source: SourceKeysView; roles: string[]; onChanged: () => void }) {
  const { scope, me } = useShell();
  const [selected, setSelected] = useState<KeyView | null>(null);
  const [reason, setReason] = useState('');
  const [answer, setAnswer] = useState<{ text: string; receipt: ReceiptT } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const current = selected === null ? null : source.keys.find((k) => k.keyId === selected.keyId) ?? null;
  return (
    <section style={cardStyle} aria-label={`Keys of ${source.name}`}>
      <PublisherKeyTable source={source} actFor={(k) => k.state === 'retired' ? '—' : (
        <GovernedButton label={`Review the retirement of ${k.keyRef}`} pendingLabel="Opening the review" variant="quiet" onRun={async () => { setSelected(k); setAnswer(null); setProblem(null); }} />
      )} />
      {selected === null ? null : (
        <CommandReview action="observation.authenticity.key.retire"
          object={{ type: 'PBK', id: selected.keyId, version: null, title: `${source.name} — key ${selected.keyRef}`, state: current?.state ?? selected.state }}
          digest={selected.fingerprint} currentDigest={current?.fingerprint ?? null}
          eligibility={eligibility({ action: 'observation.authenticity.key.retire', me: me.principalId, isHuman: me.kind === 'human', roles, requiredRoles: ['data_steward', 'collection_manager'],
            state: current?.state ?? 'retired', openStates: ['in_force', 'not_yet_valid', 'expired'] })}
          consequence={RETIRE_EFFECT}
          rationale={{ value: reason, onChange: setReason, min: 8, label: 'The reason for retiring this key (recorded with your name)' }}
          actionLabel="Retire this publisher key (its record is kept)" pendingLabel="Retiring the publisher key" variant="critical"
          onRun={async () => {
            setProblem(null);
            const r = await authenticityApi.retireKey(scope, selected.keyId, { fingerprint: selected.fingerprint, reason: reason.trim() });
            if (!r.ok || r.data === undefined) { setProblem(`${r.error?.code ?? `HTTP ${r.status}`} — ${r.error?.message ?? 'the retirement was not recorded'}`); throw new Error('refused'); }
            setAnswer({ text: `Recorded: key ${selected.keyRef} retired — it verifies nothing new; its record and history are kept`, receipt: r.data.receipt });
            setReason(''); setSelected(null); onChanged();
          }}
          problem={problem}>
          <p className="eye-ev-note">The review binds the key’s fingerprint you read here ({selected.fingerprint}); the server refuses a retirement whose fingerprint is not this key’s.</p>
        </CommandReview>
      )}
      {answer !== null && <p role="status" className="eye-ev-note">{answer.text} · policy decision {answer.receipt.policyDecisionId.slice(0, 13)}…, audit seq {answer.receipt.auditSeq}</p>}
    </section>
  );
}

function DeclareKeyForm({ sources, onChanged }: { sources: SourceKeysView[]; onChanged: () => void }) {
  const { scope } = useShell();
  const id = useId();
  const [sourceId, setSourceId] = useState('');
  const [keyRef, setKeyRef] = useState('');
  const [kind, setKind] = useState('signing_key');
  const [pem, setPem] = useState('');
  const [pin, setPin] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [rotatedFrom, setRotatedFrom] = useState('');
  const [reason, setReason] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<Problem | null>(null);
  const [answer, setAnswer] = useState<{ text: string; receipt: ReceiptT } | null>(null);
  const problems = keyFormProblems({ sourceId, keyRef, kind, pem, pin, reason });
  const active = (sources.find((s) => s.sourceId === sourceId)?.keys ?? []).filter((k) => k.state !== 'retired' && k.kind === kind);
  return (
    <Disclosure title="Declare a publisher key" authority="a data steward or a collection manager, as a named person (human-gated); never an agent"
      uncertainty="a declared key verifies items admitted while it is in force; it never re-judges evidence already admitted">
      <label htmlFor={`${id}-src`} className="eye-text-label">Source</label>
      <select id={`${id}-src`} value={sourceId} onChange={(e) => { setSourceId(e.target.value); setRotatedFrom(''); }} style={inputStyle}>
        <option value="">Choose the source whose publisher signs</option>
        {sources.map((s) => <option key={s.sourceId} value={s.sourceId}>{s.name}</option>)}
      </select>
      <label htmlFor={`${id}-ref`} className="eye-text-label">Key reference (the name the contract’s authenticity.key_refs lists)</label>
      <input id={`${id}-ref`} value={keyRef} onChange={(e) => setKeyRef(e.target.value)} style={inputStyle} autoComplete="off" />
      <label htmlFor={`${id}-kind`} className="eye-text-label">Kind</label>
      <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
        <option value="signing_key">A signing key (Ed25519 public key, PEM)</option>
        <option value="tls_spki_pin">A TLS SPKI pin (base64 sha256)</option>
      </select>
      {kind === 'signing_key' ? (<>
        <label htmlFor={`${id}-pem`} className="eye-text-label">The publisher’s public key (PEM)</label>
        <textarea id={`${id}-pem`} value={pem} onChange={(e) => setPem(e.target.value)} rows={4} style={textareaStyle} spellCheck={false} />
      </>) : (<>
        <label htmlFor={`${id}-pin`} className="eye-text-label">The TLS SPKI pin</label>
        <input id={`${id}-pin`} value={pin} onChange={(e) => setPin(e.target.value)} style={inputStyle} autoComplete="off" spellCheck={false} />
      </>)}
      <label htmlFor={`${id}-from`} className="eye-text-label">Valid from (your local time; empty: now)</label>
      <input id={`${id}-from`} type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} style={inputStyle} />
      <label htmlFor={`${id}-to`} className="eye-text-label">Valid until (your local time; empty: open)</label>
      <input id={`${id}-to`} type="datetime-local" value={validTo} onChange={(e) => setValidTo(e.target.value)} style={inputStyle} />
      <label htmlFor={`${id}-rot`} className="eye-text-label">Rotates (retires) the key</label>
      <select id={`${id}-rot`} value={rotatedFrom} onChange={(e) => setRotatedFrom(e.target.value)} style={inputStyle}>
        <option value="">No rotation — a new key beside the keys in force</option>
        {active.map((k) => <option key={k.keyId} value={k.keyId}>{k.keyRef} — {k.fingerprint}</option>)}
      </select>
      <label htmlFor={`${id}-rsn`} className="eye-text-label">Reason — where the key comes from (the publisher’s key page, its notice, the exchange)</label>
      <textarea id={`${id}-rsn`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={textareaStyle} />
      {problems.length > 0 && <ul className="eye-cld-reasons" aria-label="Why declaring the key is not available yet">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <GovernedButton label="Declare the publisher key" pendingLabel="Declaring the publisher key" disabled={problems.length > 0}
        onRun={async () => {
          setError(null);
          const r = await authenticityApi.declareKey(scope, { sourceId, keyRef: keyRef.trim(), kind, publicKeyPem: kind === 'signing_key' ? `${pem.trim()}\n` : null, pin: kind === 'tls_spki_pin' ? pin.trim() : null,
            validFrom: validFrom === '' ? null : new Date(validFrom).toISOString(), validTo: validTo === '' ? null : new Date(validTo).toISOString(),
            rotatedFrom: rotatedFrom === '' ? null : rotatedFrom, reason: reason.trim(), requestId });
          if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
          setAnswer({ text: `Recorded: key ${String(r.data.key['key_ref'])} — fingerprint ${String(r.data.key['fingerprint'])}, ${String(r.data.key['state']).replace(/_/g, ' ')}${r.data.key['replayed'] === true ? ' (this request was already recorded; its answer is repeated)' : ''}`, receipt: r.data.receipt });
          setRequestId(crypto.randomUUID()); setReason(''); setPem(''); setPin(''); setRotatedFrom('');
          onChanged();
        }} />
      <ErrorNote error={error} />
      {answer !== null && <p role="status" className="eye-ev-note">{answer.text} · policy decision {answer.receipt.policyDecisionId.slice(0, 13)}…, audit seq {answer.receipt.auditSeq}</p>}
    </Disclosure>
  );
}

function RulesSection({ rules, roles, onChanged }: { rules: RuleView[]; roles: string[]; onChanged: () => void }) {
  const { scope, me } = useShell();
  const id = useId();
  const [obligation, setObligation] = useState('classification');
  const [transformation, setTransformation] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [types, setTypes] = useState('');
  const [rationale, setRationale] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<Problem | null>(null);
  const [answer, setAnswer] = useState<{ text: string; receipt: ReceiptT } | null>(null);
  const [selected, setSelected] = useState<{ rule: RuleView; act: 'approve' | 'reject' | 'retire' } | null>(null);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const problems = ruleFormProblems({ obligation, transformation, from, to, types, rationale });
  const current = selected === null ? null : rules.find((r) => r.ruleId === selected.rule.ruleId) ?? null;
  return (
    <section style={cardStyle} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="eye-text-label">Transformation rules (ES-29-002)</h2>
      <p className="eye-ev-note">A derived object inherits the most restrictive obligations of its inputs unless an APPROVED rule lets it carry less. A data steward proposes; the privacy
        officer approves or rejects — never the proposer — and retires. A proposed or rejected rule relaxes nothing.</p>
      {rules.length === 0 ? <p className="eye-ev-note">No transformation rule is recorded in this domain.</p> : (
        <div className="eye-ev-scroll" role="region" aria-label="Transformation rules" tabIndex={0}>
          <table className="eye-table">
            <caption>Every rule, newest first — the record keeps each one and its ledger</caption>
            <thead><tr>{['Obligation', 'From → to', 'Transformation', 'Types', 'State', 'Rationale', 'Act'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.ruleId}>
                <th scope="row">{r.obligation}</th><td>{r.from} → {r.to}</td><td>{r.transformation}</td><td>{r.types.join(', ')}</td>
                <td>{r.state}{r.decisionReason === null ? '' : ` — ${r.decisionReason}`}</td><td>{r.rationale}</td>
                <td>{r.state === 'proposed' ? (<>
                  <GovernedButton label="Review the approval" pendingLabel="Opening the review" variant="quiet" onRun={async () => { setSelected({ rule: r, act: 'approve' }); setProblem(null); }} />
                  <GovernedButton label="Review the rejection" pendingLabel="Opening the review" variant="quiet" onRun={async () => { setSelected({ rule: r, act: 'reject' }); setProblem(null); }} />
                </>) : r.state === 'approved' ? <GovernedButton label="Review the retirement" pendingLabel="Opening the review" variant="quiet" onRun={async () => { setSelected({ rule: r, act: 'retire' }); setProblem(null); }} /> : '—'}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {selected === null ? null : (
        <CommandReview action={selected.act === 'retire' ? 'objects.transformation_rule.retire' : 'objects.transformation_rule.decide'}
          object={{ type: 'TRR', id: selected.rule.ruleId, version: null, title: `${selected.rule.obligation}: ${selected.rule.from} → ${selected.rule.to} (${selected.rule.transformation})`, state: current?.state ?? null }}
          digest={selected.rule.digest} currentDigest={current?.digest ?? null}
          eligibility={eligibility({ action: selected.act === 'retire' ? 'objects.transformation_rule.retire' : 'objects.transformation_rule.decide', me: me.principalId, isHuman: me.kind === 'human', roles,
            requiredRoles: ['privacy_officer'], state: current?.state ?? null, openStates: selected.act === 'retire' ? ['approved'] : ['proposed'],
            excluded: selected.rule.proposedBy === null || selected.act === 'retire' ? [] : [{ principal: selected.rule.proposedBy, why: 'you proposed this rule — its decision is another person’s' }] })}
          consequence={ruleEffect(selected.act, selected.rule)}
          rationale={{ value: reason, onChange: setReason, min: 8, label: 'The reason for this decision (recorded with your name)' }}
          actionLabel={selected.act === 'approve' ? 'Approve this transformation rule' : selected.act === 'reject' ? 'Reject this transformation rule (its record is kept)' : 'Retire this transformation rule (its record is kept)'}
          pendingLabel="Recording the decision" variant={selected.act === 'approve' ? 'primary' : 'critical'}
          onRun={async () => {
            setProblem(null);
            const r = selected.act === 'retire'
              ? await authenticityApi.retireRule(scope, selected.rule.ruleId, { digest: selected.rule.digest ?? '', reason: reason.trim() })
              : await authenticityApi.decideRule(scope, selected.rule.ruleId, { digest: selected.rule.digest ?? '', decision: selected.act, reason: reason.trim() });
            if (!r.ok || r.data === undefined) { setProblem(`${r.error?.code ?? `HTTP ${r.status}`} — ${r.error?.message ?? 'the decision was not recorded'}`); throw new Error('refused'); }
            setAnswer({ text: `Recorded: the rule is ${String(r.data.rule['state'])}`, receipt: r.data.receipt });
            setReason(''); setSelected(null); onChanged();
          }}
          problem={problem}>
          <p className="eye-ev-note">The review binds the rule’s digest you read here; the server refuses a decision on any other rule content.</p>
        </CommandReview>
      )}
      <Disclosure title="Propose a transformation rule" authority="a data steward, as a named person (human-gated)" uncertainty="nothing is relaxed until the privacy officer approves it">
        <label htmlFor={`${id}-obl`} className="eye-text-label">Obligation the rule relaxes</label>
        <select id={`${id}-obl`} value={obligation} onChange={(e) => setObligation(e.target.value)} style={inputStyle}>
          {['classification', 'residency', 'rights', 'sensitivity', 'licence'].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label htmlFor={`${id}-tr`} className="eye-text-label">Transformation (lower case: aggregation, anonymisation, summary …)</label>
        <input id={`${id}-tr`} value={transformation} onChange={(e) => setTransformation(e.target.value)} style={inputStyle} autoComplete="off" />
        <label htmlFor={`${id}-from`} className="eye-text-label">Inherited value it applies to</label>
        <input id={`${id}-from`} value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} autoComplete="off" />
        <label htmlFor={`${id}-to`} className="eye-text-label">Value the derived object may carry instead</label>
        <input id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} autoComplete="off" />
        <label htmlFor={`${id}-ty`} className="eye-text-label">Derived object types (three capitals each, comma separated: CLM, FCT …)</label>
        <input id={`${id}-ty`} value={types} onChange={(e) => setTypes(e.target.value)} style={inputStyle} autoComplete="off" />
        <label htmlFor={`${id}-rat`} className="eye-text-label">Rationale — why the transformation removes what the obligation protects</label>
        <textarea id={`${id}-rat`} value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} style={textareaStyle} />
        {problems.length > 0 && <ul className="eye-cld-reasons" aria-label="Why proposing the rule is not available yet">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <GovernedButton label="Propose the transformation rule" pendingLabel="Proposing the transformation rule" disabled={problems.length > 0}
          onRun={async () => {
            setError(null);
            const r = await authenticityApi.proposeRule(scope, { obligation, transformation: transformation.trim(), from: from.trim(), to: to.trim(), objectTypes: typesOf(types), rationale: rationale.trim(), requestId });
            if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
            setAnswer({ text: `Recorded: rule ${String(r.data.rule['rule_id']).slice(0, 8)}… proposed — it relaxes nothing until the privacy officer approves it`, receipt: r.data.receipt });
            setRequestId(crypto.randomUUID()); setRationale(''); onChanged();
          }} />
        <ErrorNote error={error} />
      </Disclosure>
      {answer !== null && <p role="status" className="eye-ev-note">{answer.text} · policy decision {answer.receipt.policyDecisionId.slice(0, 13)}…, audit seq {answer.receipt.auditSeq}</p>}
    </section>
  );
}

function ObligationsLookup() {
  const { scope } = useShell();
  const id = useId();
  const [type, setType] = useState('CLM');
  const [objectId, setObjectId] = useState('');
  const [version, setVersion] = useState('1');
  const [view, setView] = useState<ReturnType<typeof toObligations> | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const ok = /^[A-Z]{3}$/.test(type) && /^[0-9a-f-]{36}$/i.test(objectId.trim()) && /^[1-9][0-9]{0,8}$/.test(version);
  return (
    <section style={cardStyle} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="eye-text-label">Inherited obligations of a product (ES-29-002)</h2>
      <p className="eye-ev-note">The most restrictive classification, residency, rights, sensitivity and licence a product inherits through its recorded lineage — compared with its own
        header and the approved rules. A read: it refuses nothing and changes nothing.</p>
      <label htmlFor={`${id}-t`} className="eye-text-label">Object type (three capitals)</label>
      <input id={`${id}-t`} value={type} onChange={(e) => setType(e.target.value.toUpperCase())} style={inputStyle} autoComplete="off" />
      <label htmlFor={`${id}-i`} className="eye-text-label">Object id</label>
      <input id={`${id}-i`} value={objectId} onChange={(e) => setObjectId(e.target.value)} style={inputStyle} autoComplete="off" spellCheck={false} />
      <label htmlFor={`${id}-v`} className="eye-text-label">Version</label>
      <input id={`${id}-v`} value={version} onChange={(e) => setVersion(e.target.value)} style={inputStyle} inputMode="numeric" />
      <GovernedButton label="Read the inherited obligations" pendingLabel="Reading the inherited obligations" disabled={!ok}
        onRun={async () => {
          setError(null);
          const r = await authenticityApi.obligations(scope, { type, id: objectId.trim().toLowerCase(), version: Number(version) });
          if (!r.ok || r.data === undefined) { setError(r.error ?? null); setView(null); throw new Error('refused'); }
          setView(toObligations(r.data.obligations));
        }} />
      <ErrorNote error={error} />
      {view !== null && <InheritedObligationsPanel view={view} />}
    </section>
  );
}
