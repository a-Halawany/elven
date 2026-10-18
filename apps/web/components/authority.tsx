'use client';
/**
 * CP-6 B81 §HA (F-P7-E-20) — THE HUMAN-AUTHORITY COMPONENTS of the shared library. Each renders what lib/authority-b81.ts decides; the server
 * decides everything that matters and refuses in its own words (shown as it says it). They COMPOSE GovernedButton (observation.tsx) and
 * Receipt (ui.tsx) — B107 inventory keys — and never edit them.
 *
 *   CommandReview       CMP-044: identity, authority, exact state + digest, consequence, the deliberate act, the receipt — the act DISABLED
 *                       with every unmet condition named (not eligible, digest not frozen, consequence not read, no rationale, the typed
 *                       phrase not matched); the palette / intent hand off to it (?review=<action>) and nothing else acts.
 *   ConsequencePreview  CMP-045 / HX-13 / PAT-17: effect, affected objects and people, reversibility, residual risk, audit — the SERVER's
 *                       preview, or the effect STATED by the command catalogue (said as such, never as computed); rendered whole, inline,
 *                       before the control (never behind a disclosure).
 *   AuthorityBanner     CMP-046 / HX-09: eligibility, required reviewers, delegation, recusal, the current gate.
 *   DecisionDigest      CMP-047: the frozen version (question, options, evidence, recommendation, dissent, conditions) with its digest; a
 *                       newer version named, never shown in place.
 *   SignatureReceipt    CMP-048: actor, command, object, time, result, signature (signer, key, VERIFIED as the server verified it); copyable.
 *   GateStatus          CMP-075: the ONE gate state (ADR-003) — B36's GateStateBadge promoted (same markup, data-testid="gate-state").
 *   TypedConfirmation   PAT-16: type the short digest (or the name) for an irreversible act — the server's own digest binding refuses a
 *                       mismatch; re-authentication step-up is B61 / B84's.
 *   ReviewRecord        PAT-06: reviewer, version, evidence, findings — "not decision authority".
 *   ContestPath         HX-14: challenge, evidence, reviewer, status, escalation, outcome (B36 challenges, B35 appeal cases).
 *
 * Accessibility: every control has its accessible name; disabled reasons are text tied by aria-describedby; state is never colour alone (a
 * glyph and a word); logical properties (RTL mirrors); forced colours keep the borders (globals.css B81 ha). CONSTRUCTION — the walk
 * demonstrates (SYNTHETIC personas); real acceptance is H3's.
 */
import { useId, useState, type ReactNode } from 'react';
import { GovernedButton } from './observation';
import { Receipt } from './ui';
import { Digest, Timestamp } from './text';
import { gateStateMark, signatureLine, type GateStateRow } from '../lib/gates-b36';
import {
  actionClassOf, commandReviewGate, isConsequential, isIrreversible, shortDigest, shortId, signatureReceiptView, typedState,
  type ConsequenceView, type ContestRoute, type ContestRow, type DigestView, type Eligibility, type ReviewRecordModel,
} from '../lib/authority-b81';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;

/* ───────────────────────── CMP-075: the ONE gate state ───────────────────────── */

/** The ONE badge (ADR-003): a glyph, a word and the token — for a decision version, a source contract or a merge alike. */
export function GateStatus({ gate }: { gate: GateStateRow | null }) {
  if (gate === null) return <span className="eye-authority-small">gate state unknown</span>;
  const m = gateStateMark(gate.state);
  return (
    <span data-testid="gate-state" className="eye-authority-gate" style={{ color: `var(${m.token})`, borderColor: `var(${m.token})` }}
      title={`${gate.kind} ${gate.id} — ${gate.basis ?? ''}`}>
      <span aria-hidden="true">{m.glyph}</span> {m.text}{gate.since ? <> · since <Timestamp value={gate.since} /></> : null}{gate.by ? ` by ${shortId(gate.by)}` : ''}
    </span>
  );
}

/* ───────────────────────── CMP-046 / HX-09: the authority banner ───────────────────────── */

export function AuthorityBanner({ act, eligibility, reviewers, quorum, delegations, recusals, gate, children }: {
  /** the act the banner speaks for, in words (e.g. "approve this version") */ act: string;
  eligibility: Eligibility;
  /** the required reviewers / approvers the policy names, in words */ reviewers: readonly string[];
  quorum?: { live: number; required: number } | null;
  delegations?: ReadonlyArray<Row>; recusals?: ReadonlyArray<Row>;
  gate?: GateStateRow | null; children?: ReactNode;
}) {
  const live = (delegations ?? []).filter((d) => d['live'] === true);
  return (
    <section aria-label="Authority" className="eye-authority-banner" data-eligible={eligibility.can ? 'yes' : 'no'}>
      <p className="eye-authority-line">
        <strong>{eligibility.can ? '● You may ' : '⊘ You may not '}{act}</strong>
        {eligibility.can ? <> — {eligibility.basis}</> : <> — {eligibility.reason}</>}
      </p>
      <dl className="eye-dl">
        <div className="eye-dl-row"><dt>Required reviewers</dt><dd>{reviewers.length === 0 ? 'nobody named — the act cannot be approved' : reviewers.join(', ')}{quorum ? ` · quorum ${quorum.required}, ${quorum.live} live` : ''}</dd></div>
        <div className="eye-dl-row"><dt>Delegation</dt><dd>{live.length === 0 ? 'no live delegation' : live.map((d) => `${shortId(d['delegator_principal_id'])} → ${shortId(d['delegate_principal_id'])} until ${String(d['expires_at'] ?? '—')}`).join('; ')}</dd></div>
        <div className="eye-dl-row"><dt>Recusal</dt><dd>{(recusals ?? []).length === 0 ? 'no recusal recorded' : (recusals ?? []).map((r) => `${shortId(r['approver_principal_id'])} recused (${String(r['reason'] ?? 'no reason')})`).join('; ')}</dd></div>
        {gate === undefined ? null : <div className="eye-dl-row"><dt>Current gate</dt><dd><GateStatus gate={gate} /></dd></div>}
      </dl>
      {children}
    </section>
  );
}

/* ───────────────────────── CMP-047: the decision digest ───────────────────────── */

export function DecisionDigest({ digest }: { digest: DigestView }) {
  const list = (items: readonly string[], none: string) => (items.length === 0 ? none : <ul className="eye-authority-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>);
  return (
    <section aria-label="Decision digest" className="eye-authority-digest">
      <p className="eye-authority-line"><strong>{digest.frozen ? '■ Frozen version' : '◌ Not frozen'} {digest.version}</strong> — {digest.note}</p>
      {digest.newer !== null ? <p role="note" className="eye-authority-warn">A newer version (v{digest.newer}) exists. This digest is version {digest.version}’s: a review binds the version it shows, never a later one.</p> : null}
      <dl className="eye-dl">
        <div className="eye-dl-row"><dt>Question</dt><dd>{digest.question}</dd></div>
        <div className="eye-dl-row"><dt>Options</dt><dd>{list(digest.options, 'no option')}</dd></div>
        <div className="eye-dl-row"><dt>Evidence</dt><dd>{list(digest.evidence, 'no evidence cited')}</dd></div>
        <div className="eye-dl-row"><dt>Recommendation</dt><dd>{digest.recommendation}</dd></div>
        <div className="eye-dl-row"><dt>Dissent</dt><dd>{list(digest.dissent, 'no dissent recorded')}</dd></div>
        <div className="eye-dl-row"><dt>Conditions</dt><dd>{list(digest.conditions, 'no constraint or missing information declared')}</dd></div>
        <div className="eye-dl-row"><dt>Version digest</dt><dd>{digest.digest === null ? 'not bound' : <Digest value={digest.digest} max={24} />}</dd></div>
      </dl>
    </section>
  );
}

/* ───────────────────────── CMP-045 / HX-13 / PAT-17: the consequence preview ───────────────────────── */

export function ConsequencePreview({ view, label, children }: { view: ConsequenceView; /** the region's name (default "Consequence preview") */ label?: string; children?: ReactNode }) {
  return (
    <section aria-label={label ?? 'Consequence preview'} className="eye-authority-consequence">
      <p className="eye-authority-small">{view.source === 'server' ? 'Computed and recorded by the server for you.' : 'Stated by the command catalogue — no server preview exists for this act.'}</p>
      <p><strong>Intended effect:</strong> {view.effect}</p>
      <p><strong>Affected:</strong> {view.affected.join(', ') || 'nothing named'} · <strong>people:</strong> {view.users.join(', ')} · <strong>reversibility:</strong> {view.reversibility}</p>
      <p><strong>Residual risk:</strong> {view.residualRisk} · <strong>audit:</strong> {view.audit}</p>
      {view.source === 'server' ? (view.blockers.length > 0 ? <p className="eye-authority-critical"><strong>Would not commit now:</strong> {view.blockers.join('; ')}</p> : <p><strong>● Would commit.</strong></p>) : null}
      {children}
    </section>
  );
}

/* ───────────────────────── PAT-16: the typed confirmation ───────────────────────── */

export function TypedConfirmation({ phrase, value, onChange, what }: { phrase: string; value: string; onChange: (v: string) => void; /** the act, e.g. "the commitment" */ what: string }) {
  const id = useId();
  const st = typedState(phrase, value);
  return (
    <div className="eye-authority-typed">
      <label htmlFor={`${id}-in`}>Type <code data-testid="typed-phrase" className="eye-mono-wrap">{phrase}</code> to confirm {what} (it cannot be undone)</label>
      <input id={`${id}-in`} className="eye-authority-input" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby={`${id}-st`} aria-invalid={value !== '' && !st.ok ? true : undefined} />
      <span id={`${id}-st`} role="status" className="eye-authority-small">{st.ok ? '✓ the phrase matches — the server still checks the digest it binds' : st.reason}</span>
    </div>
  );
}

/* ───────────────────────── CMP-044: the command review ───────────────────────── */

export function CommandReview({ action, object, digest, currentDigest, eligibility, consequence, consequenceRead, rationale, typedPhrase, extraReasons, actionLabel, pendingLabel, variant, onRun, receipt, problem, children }: {
  /** the governed action (PDP name) */ action: string;
  object: { type: string; id: string; version: number | null; title: string; state?: string | null };
  /** the digest SHOWN to the person (frozen at the review) and the digest the command carries now */ digest: string | null; currentDigest?: string | null;
  eligibility: Eligibility;
  /** the consequence (server preview or stated); null = none available, the act stays disabled */ consequence: ConsequenceView | null;
  /** PAT-17: a server preview must be OBTAINED; a stated one is read here, rendered whole above the control */ consequenceRead?: boolean;
  rationale?: { value: string; onChange: (v: string) => void; min: number; label: string } | null;
  /** PAT-16: the phrase to type for an irreversible act (from typedPhrase) */ typedPhrase?: string | null;
  /** the page's own unmet conditions (a field it holds), in words — each keeps the act disabled */ extraReasons?: readonly string[];
  actionLabel: string; pendingLabel: string; variant?: 'primary' | 'critical';
  /** the governed act: resolves on the server's answer (throw on refusal — the page shows the server's words) */ onRun: () => Promise<void>;
  receipt?: ReceiptT; problem?: string | null; children?: ReactNode;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const irreversible = isIrreversible(action);
  /* PAT-17: a consequential act needs its consequence read; a review-class act (review, acknowledge, ready) records a reading only */
  const read = consequence !== null ? (consequenceRead ?? consequence.source === 'stated') : !isConsequential(actionClassOf(action));
  const g0 = commandReviewGate({ action }, {
    eligibility, shownDigest: digest, currentDigest: currentDigest === undefined ? digest : currentDigest, consequenceRead: read,
    rationale: rationale ? { value: rationale.value, min: rationale.min } : null,
    typed: irreversible ? (typedPhrase ? { phrase: typedPhrase, value: typed } : null) : null,
    source: 'deliberate',
  });
  const gate = { enabled: g0.enabled && (extraReasons ?? []).length === 0, reasons: [...g0.reasons, ...(extraReasons ?? [])] };
  /* the deliberate controls sit UNDER the consequence they act on (the preview's region holds them) */
  const controls = (
    <>
      {children}
      {rationale ? <input aria-label={rationale.label} className="eye-authority-input eye-authority-wide" value={rationale.value} onChange={(e) => rationale.onChange(e.target.value)} placeholder="your rationale, in your own words" /> : null}
      {irreversible && typedPhrase ? <TypedConfirmation phrase={typedPhrase} value={typed} onChange={setTyped} what={actionLabel.toLowerCase()} /> : null}
      <span aria-describedby={gate.enabled ? undefined : `${id}-why`}>
        <GovernedButton label={actionLabel} pendingLabel={pendingLabel} variant={variant ?? 'primary'} disabled={!gate.enabled}
          onRun={async () => { await onRun(); setTyped(''); }} />
      </span>
      {!gate.enabled ? <ul id={`${id}-why`} className="eye-cld-reasons" aria-label="Why the action is not available">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
      {problem ? <p role="alert" className="eye-authority-critical">{problem}</p> : null}
    </>
  );
  return (
    <section aria-label={`Command review: ${actionLabel}`} className="eye-authority-review" data-action={action}>
      <p className="eye-authority-line">
        <strong>{object.title}</strong> · {object.type} <span className="eye-mono-wrap">{shortId(object.id)}</span>{object.version !== null ? ` v${object.version}` : ''}{object.state ? ` · ${object.state.replace(/_/g, ' ')}` : ''}
        {' · '}digest {digest === null ? 'not bound' : <span className="eye-mono-wrap" title={digest}>{shortDigest(digest)}</span>}
        {' · '}<span className="eye-authority-small">{action}{irreversible ? ' — cannot be undone' : ''}</span>
      </p>
      <p className="eye-authority-small">{eligibility.can ? `Your authority: ${eligibility.basis}.` : `Not available to you: ${eligibility.reason}`}</p>
      {consequence === null ? <>{isConsequential(actionClassOf(action)) ? <p className="eye-authority-small">No consequence preview is available yet for this act.</p> : null}{controls}</> : (
        <ConsequencePreview view={consequence} label={consequence.source === 'server' ? 'Consequence preview' : `Consequence: ${actionLabel}`}>{controls}</ConsequencePreview>
      )}
      {receipt !== undefined ? <Receipt receipt={receipt} /> : null}
    </section>
  );
}

/* ───────────────────────── CMP-048: the signature receipt ───────────────────────── */

export function SignatureReceipt({ signature, command, object, role, receipt }: { signature: Row; command: string; object: string; role?: string | null; receipt?: ReceiptT }) {
  const v = signatureReceiptView(signature, { command, object, role: role ?? null });
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <span className="eye-authority-signature" data-verified={v.verified ? 'yes' : 'no'}>
      {signatureLine(signature)}
      <details className="eye-authority-details">
        <summary>Signature receipt</summary>
        <dl className="eye-dl">
          <div className="eye-dl-row"><dt>Actor</dt><dd className="eye-mono-wrap">{v.signer}{v.role ? ` (${v.role})` : ''}</dd></div>
          <div className="eye-dl-row"><dt>Command</dt><dd className="eye-mono-wrap">{v.command}</dd></div>
          <div className="eye-dl-row"><dt>Object</dt><dd className="eye-mono-wrap">{v.object}</dd></div>
          <div className="eye-dl-row"><dt>Time</dt><dd><Timestamp value={v.signedAt === '' ? null : v.signedAt} /></dd></div>
          <div className="eye-dl-row"><dt>Result</dt><dd>{v.result}</dd></div>
          <div className="eye-dl-row"><dt>Key</dt><dd className="eye-mono-wrap">{v.keyId}</dd></div>
          <div className="eye-dl-row"><dt>Digest signed</dt><dd>{v.digest === '' ? 'not stated' : <Digest value={v.digest} max={24} />}</dd></div>
        </dl>
        <button type="button" className="eye-copy" aria-label="Copy the whole signature receipt" onClick={() => { void navigator.clipboard.writeText(v.copy).then(() => setCopied('copied'), () => setCopied('failed')); }}>
          {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy receipt'}
        </button>
      </details>
      {receipt !== undefined ? <Receipt receipt={receipt} /> : null}
    </span>
  );
}

/* ───────────────────────── PAT-06: the review record ───────────────────────── */

export function ReviewRecord({ record }: { record: ReviewRecordModel }) {
  return (
    <article aria-label={`Review record by ${shortId(record.reviewer)}`} className="eye-authority-record">
      <p className="eye-authority-line"><strong>{record.act}</strong> by <span className="eye-mono-wrap">{shortId(record.reviewer)}</span>{record.version !== null ? ` on v${record.version}` : ''}{record.at ? <> at <Timestamp value={record.at} /></> : null}
        {' · '}<span className="eye-authority-tag">{record.authority}</span></p>
      <p className="eye-authority-small"><strong>Evidence:</strong> {record.evidence} · <strong>Findings:</strong> {record.findings}</p>
    </article>
  );
}

/* ───────────────────────── HX-14: the contest path ───────────────────────── */

export function ContestPath({ route, rows, children }: { route: ContestRoute | null; rows: readonly ContestRow[]; children?: ReactNode }) {
  return (
    <section aria-label="Contest and correction path" className="eye-authority-contest">
      <p className="eye-authority-small">
        {route === null ? 'No contest path is registered for this object type.' : <>
          Contest this {route.label}: {route.challenge !== null ? <>raise a <strong>challenge</strong> on the version (a member, before or after the commitment)</> : null}
          {route.challenge !== null && route.appeal !== null ? ' or ' : null}
          {route.appeal !== null ? <>open an <strong>appeal</strong> with your evidence (<a href={route.page}>appeals</a>)</> : null}. The owner or an assigned adjudicator reviews it; an overdue response escalates; the outcome is recorded and never erases the original.
        </>}
      </p>
      {rows.length === 0 ? <p className="eye-authority-small">No challenge or appeal on this object.</p> : (
        <ul className="eye-authority-list" aria-label="contest cases">
          {rows.map((r) => (
            <li key={`${r.kind}:${r.id}`}><strong>{r.kind === 'challenge' ? 'Challenge' : 'Appeal'}</strong> by {r.raisedBy} — evidence: {r.evidence} · reviewer: {r.reviewer} · status: {r.status} · escalation: {r.escalation} · outcome: {r.outcome}</li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
