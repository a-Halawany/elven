'use client';
/**
 * CP-6 B40 §RG — THE SOURCE REGISTRY LIBRARY (F-P1-01; arrives `proposed` — the Design System Authority approves each in the act):
 *
 *   ReviewedRequest   a consequential registry act through B81's CommandReview, with the BINDING it actually has said in words: a rights
 *                     change binds the contract version it read (SERVER-ENFORCED — the port refuses a stale version); every other act binds
 *                     the exact request body by a CLIENT-SIDE payload review (its digest shown at "Review this request"; a body changed after
 *                     the review holds the act — the server binds no digest for it). Nothing optimistic: the act resolves on the server.
 *   CandidateTable    the discovered candidates (how found, publisher, terms, purposes, state, the source a promotion registered)
 *   ImpactList        what rests on a source's evidence — products, claims, options, briefings, publications — each with its OWNER; the
 *                     markers with their cause; the decision-active use in the server's words (never content — D9)
 *   RegistryVersions  per contract version: the approval gate (v4) or "not recorded before B40" (v1–v3), the evaluations, the customer approvals
 *   RightsHistory     the rights lifecycle's ledger (withdraw / restore / narrow, via, reason, evidence, what it opened)
 *   IncidentList      the source incidents with their owners (PER-11)
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { CommandReview } from './authority';
import { Button } from './actions';
import { Empty, Mono, ScrollBox, fmtInstant } from './observation';
import type { ConsequenceView, Eligibility } from '../lib/authority-b81';
import { contentDigest } from '../lib/jcs';
import { impactRows, impactSummary, kindLabel, markerCauseLabel, ownerName, registryNote, useStatement } from '../lib/sources-b40';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const short = (v: unknown): string => (typeof v === 'string' && v.length > 8 ? `${v.slice(0, 8)}…` : String(v ?? ''));

/* ───────────────────────── ReviewedRequest ───────────────────────── */

export function ReviewedRequest({ action, object, payload, binding, eligibility, consequence, extraReasons, actionLabel, pendingLabel, variant, onRun, receipt, children }: {
  /** the governed action (its PDP name) */ action: string;
  object: { type: string; id: string; version: number | null; title: string; state?: string | null };
  /** the exact request body the act sends (the payload review binds it) */ payload: Row;
  /** a SERVER-ENFORCED version binding (the version shown in the preview, the version the act carries now); absent → the client-side payload review */
  binding?: { shown: string | null; current: string | null } | null;
  eligibility: Eligibility; consequence: ConsequenceView | null; extraReasons?: readonly string[];
  actionLabel: string; pendingLabel: string; variant?: 'primary' | 'critical';
  /** resolves on the server's answer (throw on refusal — the page shows the server's words) */ onRun: (payload: Row) => Promise<void>;
  receipt?: ReceiptT; children?: ReactNode;
}) {
  const id = useId();
  const [current, setCurrent] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const body = JSON.stringify(payload);
  useEffect(() => { let live = true; void contentDigest(payload).then((d) => { if (live) setCurrent(d); }); return () => { live = false; }; }, [body]); // eslint-disable-line react-hooks/exhaustive-deps
  const server = binding !== undefined && binding !== null;
  return (
    <div className="eye-registry-request" aria-describedby={`${id}-binding`}>
      <p id={`${id}-binding`} className="eye-authority-small">
        {server
          ? <>Binding: <strong>server-enforced</strong> — the act carries {binding.current ?? 'no contract version'}; the server refuses it when the source has moved to a newer version since this review ({binding.shown ?? 'nothing read yet'}).</>
          : <>Binding: <strong>client-side payload review</strong> — the server binds no digest for this act; the review below binds the exact request body you read (a body changed after the review holds the act).</>}
      </p>
      {!server ? (
        <Button label="Review this request" variant="quiet" onClick={() => setShown(current)} disabledReason={current === null ? 'the request body is being digested' : null} />
      ) : null}
      <CommandReview action={action} object={object} digest={server ? binding.shown : shown} currentDigest={server ? binding.current : current} eligibility={eligibility}
        consequence={consequence} extraReasons={extraReasons} actionLabel={actionLabel} pendingLabel={pendingLabel} variant={variant}
        onRun={async () => { await onRun(payload); setShown(null); }} receipt={receipt ?? null}>
        {children}
      </CommandReview>
    </div>
  );
}

/* ───────────────────────── CandidateTable ───────────────────────── */

export function CandidateTable({ candidates, caption, action }: { candidates: readonly Row[]; caption?: string; /** a per-row act, rendered in the row's last cell */ action?: (c: Row) => ReactNode }) {
  if (candidates.length === 0) return <Empty>No source has been proposed in this domain yet.</Empty>;
  return (
    <ScrollBox label="Source candidates">
      <table className="eye-table">
        <caption>{caption ?? 'Every proposed source: how it was found, its publisher and terms, the purposes proposed, its state and the contract a promotion registered.'}</caption>
        <thead><tr><th scope="col">Source</th><th scope="col">How found</th><th scope="col">Purposes</th><th scope="col">State</th><th scope="col">Proposed</th>{action ? <th scope="col">Act</th> : null}</tr></thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={String(c['candidate_id'])}>
              <td data-label="Source"><strong>{String(c['name'])}</strong><div className="eye-authority-small">{String(c['publisher'])}{c['terms_url'] ? <> · terms <Mono>{String(c['terms_url'])}</Mono></> : ' · no terms recorded'}</div></td>
              <td data-label="How found" style={{ maxInlineSize: '24rem' }}>{String(c['how_found'])}<div className="eye-authority-small">Assessment: {String(c['assessment'])}</div></td>
              <td data-label="Purposes">{Array.isArray(c['proposed_purposes']) ? (c['proposed_purposes'] as string[]).join(', ') : ''}</td>
              <td data-label="State">{String(c['state'])}{c['state'] === 'promoted' ? <div className="eye-authority-small">registered as {String(c['source_name'] ?? short(c['promoted_source_id']))} v{String(c['promoted_contract_version'])}</div> : null}
                {c['state'] === 'declined' ? <div className="eye-authority-small">declined: {String(c['decision_reason'] ?? '')}</div> : null}</td>
              <td data-label="Proposed"><Mono>{fmtInstant(c['proposed_at'])}</Mono><div className="eye-authority-small">by {ownerName(c['proposer'])}</div></td>
              {action ? <td data-label="Act">{action(c)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

/* ───────────────────────── ImpactList ───────────────────────── */

export function ImpactList({ impact, heading = 'What rests on this source', level = 2 }: { impact: Row | null; heading?: string; level?: 2 | 3 }) {
  const r = impactRows(impact);
  const H = level === 2 ? 'h2' : 'h3';
  const markers = rows(impact?.['markers']);
  return (
    <section aria-label={heading}>
      <H style={{ marginBlockStart: 0 }}>{heading}</H>
      <p>{impactSummary(impact)}</p>
      <p className="eye-authority-small" role="status">{useStatement(impact)}</p>
      {r.length === 0 ? <Empty>Nothing rests on this source&apos;s evidence yet.</Empty> : (
        <ScrollBox label="Resting products and their owners">
          <table className="eye-table">
            <caption>Each product, claim and reference resting on the source&apos;s evidence, with its owner and how it rests — references and owners only, never the evidence content.</caption>
            <thead><tr><th scope="col">Kind</th><th scope="col">Product</th><th scope="col">Owner</th><th scope="col">How it rests</th></tr></thead>
            <tbody>{r.map((x) => (
              <tr key={`${x.group}:${x.ref}`}><td data-label="Kind">{x.kind}</td><td data-label="Product">{x.title}<div className="eye-authority-small"><Mono>{short(x.ref)}</Mono></div></td>
                <td data-label="Owner">{x.owner}</td><td data-label="How it rests">{x.via}</td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
      {markers.length > 0 ? (
        <ul aria-label="Active impact markers">
          {markers.map((m) => <li key={String(m['marker_id'])}>{kindLabel(String(m['kind']))} <Mono>{short(m['id'])}</Mono> — {String(m['health_state'])} · cause {markerCauseLabel(m['cause'])}</li>)}
        </ul>
      ) : <p className="eye-authority-small">No active impact marker on this source.</p>}
    </section>
  );
}

/* ───────────────────────── RegistryVersions ───────────────────────── */

export function RegistryVersions({ versions }: { versions: readonly Row[] }) {
  if (versions.length === 0) return <Empty>No contract version is recorded.</Empty>;
  return (
    <ScrollBox label="Contract versions in the registry">
      <table className="eye-table">
        <caption>Per contract version: the approval gate it is under, its latest evaluation and the customer&apos;s approval of its use.</caption>
        <thead><tr><th scope="col">Version</th><th scope="col">Gate</th><th scope="col">Latest evaluation</th><th scope="col">Customer approval</th></tr></thead>
        <tbody>{versions.map((v) => {
          const ev = rows(v['evaluations'])[0];
          const ca = rows(v['customer_approvals'])[0];
          return (
            <tr key={String(v['contract_version'])}>
              <td data-label="Version">v{String(v['contract_version'])} · {String(v['schema_ref'] ?? 'SRC')}<div className="eye-authority-small">rights {String(v['rights_state'])}</div></td>
              <td data-label="Gate">{registryNote(v)}</td>
              <td data-label="Latest evaluation">{ev === undefined ? (v['v4'] === true ? 'none recorded — the approval waits for one' : 'not recorded before B40')
                : <>{String(ev['recommendation'])} by {ownerName(ev['evaluator'])} at <Mono>{fmtInstant(ev['evaluated_at'])}</Mono><div className="eye-authority-small">{String(ev['reason'])}</div></>}</td>
              <td data-label="Customer approval">{ca === undefined ? 'none recorded'
                : <>{String(ca['decision'])} by {ownerName(ca['approver'])} ({String(ca['claim'])})<div className="eye-authority-small">{String(ca['scope_statement'])}</div></>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </ScrollBox>
  );
}

/* ───────────────────────── RightsHistory ───────────────────────── */

export function RightsHistory({ changes }: { changes: readonly Row[] }) {
  if (changes.length === 0) return <Empty>No rights change has been recorded through the rights lifecycle.</Empty>;
  return (
    <ScrollBox label="Rights lifecycle">
      <table className="eye-table">
        <caption>Every narrowing, withdrawal and restoration, newest first — nothing is rewritten; a restoration names the withdrawal it reverses.</caption>
        <thead><tr><th scope="col">Change</th><th scope="col">Reason and evidence</th><th scope="col">What it did</th><th scope="col">Who, when</th></tr></thead>
        <tbody>{changes.map((c) => (
          <tr key={String(c['change_id'])}>
            <td data-label="Change">{String(c['operation'])}<div className="eye-authority-small">via {String(c['via']).replace(/_/g, ' ')}{c['reverses'] ? <> · reverses <Mono>{short(c['reverses'])}</Mono></> : null}</div></td>
            <td data-label="Reason and evidence" style={{ maxInlineSize: '24rem' }}>{String(c['reason'])}{c['evidence'] ? <div className="eye-authority-small">Evidence: {String(c['evidence'])}</div> : null}</td>
            <td data-label="What it did">{c['suspended_version'] ? `suspended v${String(c['suspended_version'])}; ` : ''}{c['reactivated_version'] ? `resumed v${String(c['reactivated_version'])}; ` : ''}
              {c['retention_action_id'] ? 'opened a retention action (deletion, awaiting the retention authority); ' : ''}{c['incident_id'] ? 'opened a rights incident; ' : ''}
              {Number(c['attention_items'] ?? 0) > 0 ? `${String(c['attention_items'])} owner item(s) routed` : ''}
              <div className="eye-authority-small">{String(c['impact_statement'] ?? '')}</div></td>
            <td data-label="Who, when">{ownerName(c['actor'])}<div><Mono>{fmtInstant(c['recorded_at'])}</Mono></div></td>
          </tr>
        ))}</tbody>
      </table>
    </ScrollBox>
  );
}

/* ───────────────────────── IncidentList ───────────────────────── */

export function IncidentList({ incidents, action }: { incidents: readonly Row[]; action?: (i: Row) => ReactNode }) {
  if (incidents.length === 0) return <Empty>No incident has been recorded on this source.</Empty>;
  return (
    <ScrollBox label="Source incidents">
      <table className="eye-table">
        <caption>Incidents on this source; each is owned by a collection manager (who answers for the operational response).</caption>
        <thead><tr><th scope="col">Incident</th><th scope="col">Owner</th><th scope="col">State</th>{action ? <th scope="col">Act</th> : null}</tr></thead>
        <tbody>{incidents.map((i) => (
          <tr key={String(i['incident_id'])}>
            <td data-label="Incident">{String(i['kind'])} — {String(i['statement'])}<div className="eye-authority-small">opened <Mono>{fmtInstant(i['opened_at'])}</Mono></div></td>
            <td data-label="Owner">{ownerName(i['owner'])}</td>
            <td data-label="State">{String(i['state'])}{i['resolution'] ? <div className="eye-authority-small">{String(i['resolution'])}</div> : null}</td>
            {action ? <td data-label="Act">{i['state'] === 'open' ? action(i) : null}</td> : null}
          </tr>
        ))}</tbody>
      </table>
    </ScrollBox>
  );
}
