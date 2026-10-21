'use client';
/**
 * CP-6 B40 §VA — THE AUTHENTICITY LIBRARY (proposed; the Design System Authority approves each in the act): the outcome in words, the publisher
 * key table, one evidence object's authenticity and attributes, the inherited obligations and the per-tenant retention register. Every state
 * is a glyph and a WORD (never colour alone); every table has a caption, header cells and a keyboard-scrollable region; numbers are counts,
 * shown as the server gave them. Nothing here acts: the acts are the pages' (CommandReview / GovernedButton), and nothing is optimistic.
 */
import { useId, type ReactNode } from 'react';
import {
  OUTCOME_WORDS, attributeValueText, decisionUse, schemeStatement,
  type AuthenticityOutcome, type DomainRegisterView, type EvidenceVersionAuthenticity, type KeyView, type ObligationView, type SourceKeysView,
} from '../lib/authenticity-b40';

const short = (v: string | null | undefined, n = 8): string => (v === null || v === undefined || v === '' ? '—' : v.length > n + 1 ? `${v.slice(0, n)}…` : v);
const say = (v: string | number | null | undefined): string => (v === null || v === undefined || v === '' ? '—' : String(v));

/** One authenticity outcome: its glyph and WORD, the sentence for a screen reader and a reader of the page. */
export function AuthenticityOutcomeBadge({ outcome, withSentence }: { outcome: AuthenticityOutcome; withSentence?: boolean }) {
  const w = OUTCOME_WORDS[outcome];
  return (
    <span className="eye-ev-outcome" data-outcome={outcome === 'failed' ? 'unverifiable' : outcome === 'verified' ? 'resolved' : 'withdrawn'} title={w.sentence}>
      <span aria-hidden="true">{w.glyph}</span> {w.word}{withSentence === true ? <span className="eye-ev-note"> — {w.sentence}</span> : null}
    </span>
  );
}

/** The keys of one source: kind, reference, fingerprint, validity, state (in words), why — and, per row, the page's own act (a retirement). */
export function PublisherKeyTable({ source, actFor }: { source: SourceKeysView; actFor?: (k: KeyView) => ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <p id={id} className="eye-text-label">{source.name} — publisher keys</p>
      <p className="eye-ev-note">{schemeStatement(source)}. Outcomes recorded: {source.outcomes.verified} verified · {source.outcomes.failed} authenticity failed ·
        {' '}{source.outcomes.unsigned} unsigned · {source.outcomes.unavailable} not checkable · {source.outcomes.unknown_signer} unknown signer (quarantined).</p>
      {source.keys.length === 0 ? <p className="eye-ev-note">No publisher key is declared for this source. A signed item arriving now has no signer in force: it is quarantined (unknown signer).</p> : (
        <div className="eye-ev-scroll" role="region" aria-label={`Publisher keys of ${source.name}`} tabIndex={0}>
          <table className="eye-table">
            <caption>Every key of this source, newest first — a retired key is kept and verifies nothing new</caption>
            <thead><tr>{['Key reference', 'Kind', 'Fingerprint', 'Valid', 'State', 'Declared', 'Reason', ...(actFor === undefined ? [] : ['Act'])].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{source.keys.map((k) => (
              <tr key={k.keyId}>
                <th scope="row">{k.keyRef}</th>
                <td>{k.kind === 'signing_key' ? `signing key (${k.algorithm})` : 'TLS SPKI pin (declared; the gateway checks it)'}</td>
                <td><code className="eye-mono-wrap" title={k.fingerprint}>{k.fingerprint}</code></td>
                <td>{say(k.validFrom)} → {k.validTo ?? 'open'}</td>
                <td>{k.state === 'in_force' ? '● in force' : k.state === 'retired' ? `○ retired ${say(k.retiredAt)}${k.retireReason === null ? '' : ` — ${k.retireReason}`}` : `◌ ${k.state.replace(/_/g, ' ')}`}</td>
                <td>{say(k.declaredAt)} by <code className="eye-mono-wrap">{short(k.declaredBy)}</code>{k.rotatedFrom === null ? '' : ` · rotated from ${short(k.rotatedFrom)}`}</td>
                <td>{say(k.reason)}</td>
                {actFor === undefined ? null : <td>{actFor(k)}</td>}
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {source.events.length === 0 ? null : (
        <ul className="eye-ev-lines" aria-label={`The key ledger of ${source.name}`}>
          {source.events.slice(0, 20).map((e, i) => <li key={i}>{say(e.at)} · {e.event} · key <code className="eye-mono-wrap">{short(e.keyId)}</code> by <code className="eye-mono-wrap">{short(e.actor)}</code>{e.reason === null ? '' : ` — ${e.reason}`}</li>)}
        </ul>
      )}
    </section>
  );
}

/** One evidence object's authenticity and attributes, per version: the outcome, the key, the signature digest; the attributes with their basis. */
export function EvidenceAuthenticityPanel({ versions }: { versions: readonly EvidenceVersionAuthenticity[] }) {
  const id = useId();
  if (versions.length === 0) return <p className="eye-ev-note">No version of this evidence is recorded in this domain.</p>;
  return (
    <section aria-labelledby={id}>
      <p id={id} className="eye-text-label">The publisher signature and the evidence attributes, per version</p>
      {versions.map((v) => (
        <article key={v.version} aria-label={`Version ${v.version}`} className="eye-ev-card" data-outcome={v.outcome}>
          <p className="eye-ev-card-title"><span className="eye-text-label">v{v.version}</span> <AuthenticityOutcomeBadge outcome={v.outcome} /></p>
          <dl className="eye-ev-dl">
            <div className="eye-ev-dl-row"><dt>Outcome</dt><dd>{v.statement ?? OUTCOME_WORDS[v.outcome].sentence}</dd></div>
            <div className="eye-ev-dl-row"><dt>Decision-active use</dt><dd>{decisionUse(v.outcome) === 'refused' ? '✕ refused (authenticity failed) — the evidence stays admitted and readable'
              : decisionUse(v.outcome) === 'established' ? '✓ the content is established as the publisher’s' : '◍ usable; the content is not established as the publisher’s'}</dd></div>
            <div className="eye-ev-dl-row"><dt>Scheme</dt><dd>{v.v4 ? say(v.scheme) : 'none declared (SRC@v1–v3)'} · payload content authenticity {say(v.payloadContentAuthenticity)}</dd></div>
            {v.key === null ? null : <div className="eye-ev-dl-row"><dt>Key</dt><dd><code className="eye-mono-wrap">{v.key.fingerprint}</code> ({v.key.keyRef}) — {v.key.state.replace(/_/g, ' ')}</dd></div>}
            {v.signatureDigest === null ? null : <div className="eye-ev-dl-row"><dt>Signature presented</dt><dd>sha256 <code className="eye-mono-wrap" title={v.signatureDigest}>{short(v.signatureDigest, 16)}</code> (kept with the transport evidence)</dd></div>}
            {v.recordedAt === null ? null : <div className="eye-ev-dl-row"><dt>Recorded</dt><dd>{v.recordedAt}</dd></div>}
          </dl>
          {!v.attributes.recorded ? <p className="eye-ev-note">{v.attributes.statement ?? 'No evidence attribute is recorded for this version.'}</p> : (
            <div className="eye-ev-scroll" role="region" aria-label={`Evidence attributes of version ${v.version}`} tabIndex={0}>
              <table className="eye-table">
                <caption>The evidence attributes of v{v.version} — each with its basis; an override supersedes, the earlier value is kept</caption>
                <thead><tr>{['Attribute', 'Value', 'Basis', 'Reason', 'Recorded'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{v.attributes.current.map((a) => (
                  <tr key={a.attribute}>
                    <th scope="row">{a.attribute.replace(/_/g, ' ')}</th><td>{attributeValueText(a)}</td>
                    <td>{a.basis === 'steward' ? `a data steward’s override (${short(a.basisRef?.replace(/^principal:/, '') ?? null)})` : `the source contract ${say(a.basisRef)}`}</td>
                    <td>{say(a.reason)}</td><td>{say(a.recordedAt)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {v.attributes.history.length > v.attributes.current.length ? (
            <ul className="eye-ev-lines" aria-label={`Attribute history of version ${v.version}`}>
              {v.attributes.history.map((h, i) => <li key={i}>{say(h.recordedAt)} · {h.attribute.replace(/_/g, ' ')} = {attributeValueText(h)} ({h.basis === 'steward' ? `override: ${say(h.reason)}` : 'from the contract'})</li>)}
            </ul>
          ) : null}
        </article>
      ))}
    </section>
  );
}

/** The most restrictive obligations a product inherits through its recorded lineage, against its own header and the approved rules. */
export function InheritedObligationsPanel({ view }: { view: { ref: string; obligations: readonly ObligationView[]; openFindings: number; inputs: { objects: number; evidence: number; truncated: boolean }; basis: string; limitations: readonly string[] } }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <p id={id} className="eye-text-label">Inherited obligations of {view.ref}</p>
      <p className="eye-ev-note">{view.inputs.objects} upstream object(s), {view.inputs.evidence} evidence version(s){view.inputs.truncated ? ' — the walk reached its bounds; what lies beyond is not folded' : ''}.
        {' '}{view.openFindings === 0 ? 'No open finding.' : `${view.openFindings} open finding(s) — shown here, never silently corrected.`}</p>
      <div className="eye-ev-scroll" role="region" aria-label={`Inherited obligations of ${view.ref}`} tabIndex={0}>
        <table className="eye-table">
          <caption>Most restrictive first: what the inputs impose, what the header carries, and the status</caption>
          <thead><tr>{['Obligation', 'Inherited', 'Header', 'Status', 'Why'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{view.obligations.map((o) => (
            <tr key={o.obligation} data-status={o.status}>
              <th scope="row">{o.obligation}</th><td>{o.inherited}</td><td>{o.header ?? 'NULL (no narrower control in the header — D22)'}</td>
              <td>{o.statusWords}</td><td>{o.detail}{o.imposedBy.length === 0 ? '' : ` · imposed by ${o.imposedBy.slice(0, 4).join(', ')}${o.imposedBy.length > 4 ? ` and ${o.imposedBy.length - 4} more` : ''}`}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="eye-ev-note">Header basis: {view.basis}.</p>
      {view.limitations.length === 0 ? null : <ul className="eye-ev-lines" aria-label="What this read does not fold">{view.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
    </section>
  );
}

/** The per-tenant retention register: each domain's schedules with the evidence under each, the overdue, the next expiry, the holds. */
export function TenantRetentionRegister({ domains, asOf }: { domains: readonly DomainRegisterView[]; asOf: string | null }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <p id={id} className="eye-text-label">The tenant’s retention register{asOf === null ? '' : ` — read at ${asOf}`}</p>
      {domains.length === 0 ? <p className="eye-ev-note">No domain of this tenant is recorded.</p> : domains.map((d) => (
        <div key={d.domainId}>
          <p className="eye-ev-note"><strong>{d.name}</strong> ({d.status}) · {d.evidence} evidence manifest(s) held · {d.holds} active legal hold(s)</p>
          {d.schedules.length === 0 ? <p className="eye-ev-note">No schedule is declared in this domain.</p> : (
            <div className="eye-ev-scroll" role="region" aria-label={`Retention schedules of ${d.name}`} tabIndex={0}>
              <table className="eye-table">
                <caption>Schedules of {d.name} — the evidence under each, the overdue and the next expiry</caption>
                <thead><tr>{['Profile', 'Action', 'Due after', 'State', 'Evidence', 'Overdue', 'Next expiry', 'Held', 'Open actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{d.schedules.map((s) => (
                  <tr key={s.scheduleId}>
                    <th scope="row">{s.profile}</th><td>{s.actionKind} ({s.targetKind.replace(/_/g, ' ')})</td><td>{s.dueAfter}</td>
                    <td>{s.state === 'active' ? '● active' : `○ ${s.state}${s.retiredAt === null ? '' : ` ${s.retiredAt}`}`}</td>
                    <td>{s.evidence}</td><td>{s.overdue}</td><td>{s.nextExpiry ?? 'none ahead'}</td><td>{s.held}</td><td>{s.openActions}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {d.unscheduled.length === 0 ? null : (
            <ul className="eye-ev-lines" aria-label={`Profiles no active schedule governs in ${d.name}`}>
              {d.unscheduled.map((u) => <li key={u.profile}>{u.profile}: {u.evidence} evidence manifest(s), the oldest {say(u.oldest)} — no active schedule governs it; it is retained until a schedule or an action reaches it</li>)}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
