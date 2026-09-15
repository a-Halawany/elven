'use client';
/**
 * Retention — the governed retention workspace (CP-6 B9/B10; migrations 0066 §4, 0067 §1, 0068 §2/§6; ES-29-004).
 *
 * A RETENTION ACTION is a durable workflow, not a delete: OPENED (by a person, or by the evaluation of a SCHEDULE for
 * what fell due), its SCOPE RESOLVED (every item the action would touch, each with a disposition — execute, held by a
 * legal hold, excluded, blocking — and a DIGEST of that ordered scope), APPROVED by the retention authority on the digest
 * they read (never by the opener), EXECUTED by the steward (never by an approver) in one transaction — a hold placed since
 * the approval rolls the whole execution back and pauses the action — and VERIFIED check by check against what the vault
 * observes. A review records that the item was reviewed and touches no bytes; only a deletion tombstones, and its bytes go
 * after the record committed; a log-floor move retires the outbox history below the served points. Since B11 (0070) an
 * archive moves the bytes to the archive tier and a customer export builds a signed package under the export namespace —
 * read and revoked through their own routes; a deletion whose evidence version is load-bearing pauses with the dependents named.
 * Since B12 (0072) a restore moves archived bytes back to the hot tier (opened on demand, never by a schedule), and the COLD-TIER
 * MANAGER — a per-domain policy: a daily byte budget, the opens per evaluation, the attempts before escalation, the escalation
 * age, the restore window — is read by the execution and the evaluation; its state and its declaration have a section here.
 *
 * Nothing here predicts a state: every row, count, digest and check is rendered as the server returned it, and every
 * refusal — the opener's own approval, a wrong digest, an unresolved scope, a review's failed check, a budget exhausted —
 * is shown in the server's own words with its code.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  retention, RETENTION_CLASSIFICATIONS, RETENTION_KINDS, RETENTION_TARGET_KINDS,
  type RetentionActionDetail, type RetentionClassification, type RetentionEvaluation, type RetentionExecutionResult, type RetentionExportDetail, type RetentionKind, type RetentionOpenIntake,
  type RetentionRow, type RetentionScheduleIntake, type RetentionScopeSummary, type RetentionTargetKind, type RetentionTierPolicyIntake, type RetentionTierState, type RetentionVaultInventory, type RetentionVerdict,
} from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const json = (v: unknown) => JSON.stringify(v ?? {});
const yes = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : str(v));
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** An interval as the driver serves it: a string, or an object of non-zero units ({ days: 90 } → "90 days"). */
const fmtInterval = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const parts = Object.entries(v as Row).filter(([, n]) => typeof n === 'number' && n !== 0).map(([k, n]) => `${String(n)} ${k}`);
    return parts.length === 0 ? '0 seconds' : parts.join(' ');
  }
  return String(v);
};
/** A selector as the server stores it: manifest_id / source_id / manifest_ids (a chosen object set), the export's classification_ceiling and destination, or partition_key / to_seq. */
const selectorText = (v: unknown): string => {
  const s = rec(v);
  const parts = (['manifest_id', 'source_id', 'manifest_ids', 'classification_ceiling', 'destination', 'partition_key', 'to_seq'] as const)
    .filter((k) => s[k] !== undefined && s[k] !== null)
    .map((k) => `${k} ${Array.isArray(s[k]) ? `${(s[k] as unknown[]).length} id(s): ${(s[k] as unknown[]).map(String).join(', ')}` : String(s[k])}`);
  return parts.length === 0 ? (Object.keys(s).length === 0 ? '(none)' : json(s)) : parts.join(' · ');
};
/** A blocking item's dependents (B11): kind:ref each, as the resolution named them. */
const dependentsText = (v: unknown): string => arr(v).map((d) => `${str(d['kind'])}:${str(d['ref'])}`).join(', ');
const residualsText = (v: unknown): string => {
  const rs = arr(v);
  return rs.length === 0 ? 'none' : rs.map((x) => `${str(x['kind'])} ×${str(x['count'])} (${str(x['status'])})`).join(', ');
};
/** The scope summary the resolution recorded: items / execute / held / blocking / excluded (since B11), and the residual inventory by kind. */
const scopeText = (v: unknown): string => {
  const s = rec(v);
  if (Object.keys(s).length === 0) return 'not resolved';
  return `${str(s['items'])} item(s): ${str(s['execute'])} execute, ${str(s['held'])} held, ${str(s['blocking'])} blocking${s['excluded'] !== undefined ? `, ${str(s['excluded'])} excluded` : ''}; residuals ${residualsText(s['residuals'])}`;
};
const failureText = (a: Row): string => {
  if (a['failure_class'] === null || a['failure_class'] === undefined) return '—';
  return `${str(a['failure_class'])} → ${str(a['disposition'])}${a['failure_reason'] !== null && a['failure_reason'] !== undefined ? ` — ${String(a['failure_reason'])}` : ''}`;
};
/** A schedule's last evaluation as the evaluation recorded it (B12): { at, opened, deferred }; `{}` until one has run. */
const lastEvaluationText = (v: unknown): string => {
  const e = rec(v);
  if (Object.keys(e).length === 0) return 'none recorded';
  return `opened ${str(e['opened'])}, deferred ${str(e['deferred'])} at ${fmtInstant(e['at'])}`;
};
/** A blob root's inventory as the controller listed it: the counts, or the error the listing raised (nulls then). */
const inventoryText = (i: RetentionVaultInventory | undefined): string =>
  i === undefined ? '—' : i.error !== undefined ? `not listed — ${i.error}` : `${str(i.blobs)} blob(s), ${str(i.staged)} staged, ${str(i.temp)} temp`;

interface Outcome<T> { result: T | null; receipt: ReceiptT; problem: string | null }
const none = <T,>(): Outcome<T> => ({ result: null, receipt: null, problem: null });

interface OpenDraft { kind: RetentionKind; targetKind: RetentionTargetKind; manifestId: string; sourceId: string; manifestIds: string; classificationCeiling: RetentionClassification; partitionKey: string; toSeq: string; retentionProfile: string }
/** A chosen object set (B11): one id per line, blanks ignored — an archive's, a customer export's or (B12) a restore's selector. */
const manifestIdsOf = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
const takesObjectSet = (kind: RetentionKind) => kind === 'archive' || kind === 'customer_export' || kind === 'restore';
const openOk = (d: OpenDraft) =>
  d.targetKind === 'evidence'
    ? d.manifestId.trim() !== '' || d.sourceId.trim() !== '' || (takesObjectSet(d.kind) && manifestIdsOf(d.manifestIds).length > 0)
    : d.partitionKey.trim() !== '' && d.toSeq.trim() !== '' && Number.isInteger(Number(d.toSeq));
function toOpenIntake(d: OpenDraft): RetentionOpenIntake {
  const profile = d.retentionProfile.trim() === '' ? {} : { retentionProfile: d.retentionProfile.trim() };
  if (d.targetKind === 'log_partition') return { kind: d.kind, targetKind: 'log_partition', selector: { partitionKey: d.partitionKey.trim(), toSeq: Number(d.toSeq) }, ...profile };
  const ids = takesObjectSet(d.kind) ? manifestIdsOf(d.manifestIds) : [];
  return {
    kind: d.kind, targetKind: 'evidence',
    selector: {
      ...(d.manifestId.trim() === '' ? {} : { manifestId: d.manifestId.trim() }), ...(d.sourceId.trim() === '' ? {} : { sourceId: d.sourceId.trim() }),
      ...(ids.length === 0 ? {} : { manifestIds: ids }),
      ...(d.kind === 'customer_export' ? { classificationCeiling: d.classificationCeiling, destination: 'export' as const } : {}),
    },
    ...profile,
  };
}

interface ScheduleDraft { retentionProfile: string; targetKind: RetentionTargetKind; actionKind: RetentionKind; dueAfter: string; sourceId: string; ownerPrincipalId: string }
const EMPTY_SCHEDULE: ScheduleDraft = { retentionProfile: '', targetKind: 'evidence', actionKind: 'review', dueAfter: '', sourceId: '', ownerPrincipalId: '' };
const scheduleOk = (d: ScheduleDraft) => d.retentionProfile.trim() !== '' && d.dueAfter.trim() !== '';
function toScheduleIntake(d: ScheduleDraft): RetentionScheduleIntake {
  return {
    retentionProfile: d.retentionProfile.trim(), targetKind: d.targetKind, actionKind: d.actionKind, dueAfter: d.dueAfter.trim(),
    ...(d.sourceId.trim() === '' ? {} : { selector: { source_id: d.sourceId.trim() } }),
    ...(d.ownerPrincipalId.trim() === '' ? {} : { ownerPrincipalId: d.ownerPrincipalId.trim() }),
  };
}

/** The cold tier's policy as a person drafts it (B12): the five fields, shown with the server's defaults; a blank budget is sent as null (unbounded). */
interface PolicyDraft { budgetBytesPerDay: string; maxOpensPerEvaluation: string; maxAttempts: string; escalateAfter: string; restoreHotFor: string }
const DEFAULT_POLICY: PolicyDraft = { budgetBytesPerDay: '', maxOpensPerEvaluation: '200', maxAttempts: '3', escalateAfter: '7 days', restoreHotFor: '30 days' };
const isInt = (s: string) => s.trim() !== '' && Number.isInteger(Number(s));
const policyOk = (d: PolicyDraft) =>
  (d.budgetBytesPerDay.trim() === '' || isInt(d.budgetBytesPerDay)) && isInt(d.maxOpensPerEvaluation) && isInt(d.maxAttempts)
  && d.escalateAfter.trim() !== '' && d.restoreHotFor.trim() !== '';
function toPolicyIntake(d: PolicyDraft): RetentionTierPolicyIntake {
  return {
    budgetBytesPerDay: d.budgetBytesPerDay.trim() === '' ? null : Number(d.budgetBytesPerDay),
    maxOpensPerEvaluation: Number(d.maxOpensPerEvaluation), maxAttempts: Number(d.maxAttempts),
    escalateAfter: d.escalateAfter.trim(), restoreHotFor: d.restoreHotFor.trim(),
  };
}

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const controlRow = { marginBlockStart: 'var(--eye-space-8)' } as const;
const wide = { ...inputStyle, inlineSize: '100%' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
function Sel<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select id={id} style={wide} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Txt({ id, value, onChange, type }: { id: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <input id={id} type={type ?? 'text'} style={wide} value={value} onChange={(e) => onChange(e.target.value)} />;
}
function Problem({ verb, problem }: { verb: string; problem: string | null }) {
  return problem === null ? null : <LiveStatus assertive><span style={critical}>{verb} — {problem}</span></LiveStatus>;
}

/** The verdict a verification returned, VERBATIM: each check and, on a pass, the scope the DeletionVerified event carries. */
function Verdict({ v }: { v: RetentionVerdict }) {
  return (
    <>
      <p>
        <strong>{v.verified ? 'verified' : 'not verified'}</strong> · the action is now <Mono>{str(v.state)}</Mono>
        {v.executed !== undefined && <> · executed {String(v.executed)}, held {String(v.held)}, excluded {String(v.excluded)}</>}
        {v.authorized_by !== undefined && <> · authorised by {v.authorized_by.length === 0 ? 'no live approval' : v.authorized_by.map((a) => short(a)).join(', ')}</>}
        {v.residual !== undefined && <> · residual {residualsText(v.residual)}</>}
        {v.kind === 'review' && v.verified && <> · a review's verification is its own record: no DeletionVerified is published for it</>}
      </p>
      {v.checks.length === 0 ? <Empty>The verification ran no check.</Empty> : (
        <ScrollBox label="verification checks">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>Kind</Th><Th>Disposition</Th><Th>Passed</Th></tr></thead>
            <tbody>{v.checks.map((c, i) => (
              <tr key={i}><Td mono>{str(c.item)}</Td><Td>{str(c.kind)}</Td><Td>{str(c.disposition)}</Td><Td><strong>{yes(c.passed)}</strong></Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

function Execution({ e }: { e: RetentionExecutionResult }) {
  if (e.retried === true) {
    return (
      <p>
        the action was already executed: its <strong>pending bytes residuals</strong> ({String(e.pending)}) were tried again —
        {' '}removed {e.bytes.removed.length === 0 ? 'none' : e.bytes.removed.map((l) => <Mono key={l}>{l} </Mono>)},
        {' '}failed {e.bytes.failed.length === 0 ? 'none' : e.bytes.failed.map((l) => <Mono key={l}>{l} </Mono>)}; verification closes what is gone
      </p>
    );
  }
  return (
    <p>
      executed <strong>{String(e.executed)}</strong>, held {String(e.held)}, refused {String(e.refused)}
      {e.floor !== null && <> · the floor of <Mono>{str(e.floor['partition_key'])}</Mono> moved from {str(e.floor['floor_before'])} to {str(e.floor['floor_after'])} (next sequence {str(e.floor['next_seq'])})</>}
      {e.package !== null && e.package !== undefined && <> · the package built under <Mono>{str(e.package['locator_prefix'])}</Mono>: {str(e.package['objects'])} object(s), {str(e.package['excluded'])} excluded, {str(e.package['bytes'])} bytes, package digest <Mono>{str(e.package['package_digest'])}</Mono></>}
      {' · '}bytes removed after the commit: {e.bytes.removed.length === 0 ? 'none' : e.bytes.removed.map((l) => <Mono key={l}>{l} </Mono>)}
      {e.bytes.failed.length > 0 && <>; <span style={critical}>the vault refused {e.bytes.failed.length} removal(s)</span>, recorded as pending residuals on the action: {e.bytes.failed.map((l) => <Mono key={l}>{l} </Mono>)}</>}
    </p>
  );
}

function Resolved({ s }: { s: RetentionScopeSummary }) {
  return (
    <p>
      the scope resolved to <strong>{str(s.state)}</strong> · {String(s.items)} item(s): {String(s.execute)} execute, {String(s.held)} held, {String(s.blocking)} blocking{s.excluded !== undefined && <>, {String(s.excluded)} excluded</>}
      {' · '}residuals {residualsText(s.residuals)} · digest <Mono>{str(s.scope_digest)}</Mono>
    </p>
  );
}

/** The action's record as the get route serves it: the scope items in dependency order, approvals, executions, residuals, verifications, events. */
function ActionRecord({ d }: { d: RetentionActionDetail }) {
  const a = d.action;
  return (
    <>
      <dl>
        <DefinitionRow term="Action"><Mono>{str(a['action_id'])}</Mono> · <strong>{str(a['kind'])}</strong> on {str(a['target_kind'])} · state <strong>{str(a['state'])}</strong></DefinitionRow>
        <DefinitionRow term="Selector"><Mono>{selectorText(a['selector'])}</Mono></DefinitionRow>
        <DefinitionRow term="Retention profile">{str(a['retention_profile'])}{a['schedule_id'] !== null && a['schedule_id'] !== undefined ? <> · schedule <Mono>{String(a['schedule_id'])}</Mono></> : ' · opened by a person, not a schedule'}</DefinitionRow>
        <DefinitionRow term="Opened">by <Mono>{short(a['opened_by'])}</Mono> at {fmtInstant(a['opened_at'])} · due from {fmtInstant(a['due_from'])}</DefinitionRow>
        <DefinitionRow term="Timeline">resolved {fmtInstant(a['resolved_at'])} · approved {fmtInstant(a['approved_at'])} · executed {fmtInstant(a['executed_at'])} · verified {fmtInstant(a['verified_at'])} · closed {fmtInstant(a['closed_at'])}</DefinitionRow>
        <DefinitionRow term="Scope">{scopeText(a['scope_summary'])}</DefinitionRow>
        <DefinitionRow term="Scope digest">{a['scope_digest'] === null || a['scope_digest'] === undefined ? 'none — the scope has not been resolved' : <Mono>{String(a['scope_digest'])}</Mono>}</DefinitionRow>
        <DefinitionRow term="Failure">{failureText(a)}</DefinitionRow>
        <DefinitionRow term="Attempts">{str(a['attempts'])} execution(s) begun under the tier policy (a re-resolution of an escalated action restarts the count)</DefinitionRow>
        <DefinitionRow term="Escalated">{a['escalated_at'] === null || a['escalated_at'] === undefined ? 'no' : <>{fmtInstant(a['escalated_at'])} — for human review; the approvals were revoked</>}</DefinitionRow>
        <DefinitionRow term="Residual summary">{arr(a['residual_summary']).length === 0 ? 'none recorded' : arr(a['residual_summary']).map((x, i) => <span key={i}>{str(x['kind'])} ×{str(x['count'])} ({str(x['status'])}){x['note'] !== null && x['note'] !== undefined ? ` — ${String(x['note'])}` : ''}; </span>)}</DefinitionRow>
      </dl>

      <h3 style={h3}>Scope items ({d.items.length})</h3>
      {d.items.length === 0 ? <Empty>No scope item: the scope has not been resolved, or the selector resolves to nothing.</Empty> : (
        <ScrollBox label="retention scope items">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Order</Th><Th>Kind</Th><Th>Ref</Th><Th>Disposition</Th><Th>Hold</Th><Th>Tier</Th><Th>Reason</Th><Th>Dependents</Th><Th>Details</Th></tr></thead>
            <tbody>{d.items.map((i) => (
              <tr key={String(i['item_id'])}>
                <Td mono>{str(i['dependency_order'])}</Td><Td>{str(i['item_kind'])}</Td><Td mono>{str(i['ref'])}</Td>
                <Td><strong>{str(i['disposition'])}</strong></Td><Td mono>{i['hold_id'] === null || i['hold_id'] === undefined ? '—' : String(i['hold_id'])}</Td>
                <Td>{str(rec(i['details'])['tier'])}</Td>
                <Td>{str(i['reason'])}</Td><Td mono>{i['disposition'] === 'blocking' ? dependentsText(rec(i['details'])['dependents']) : '—'}</Td><Td mono>{json(i['details'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Approvals ({d.approvals.length})</h3>
      {d.approvals.length === 0 ? <Empty>No approval is recorded.</Empty> : (
        <ScrollBox label="retention approvals">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Approval</Th><Th>Approver</Th><Th>Digest approved</Th><Th>Rationale</Th><Th>Recorded</Th><Th>Expires</Th><Th>Revoked</Th></tr></thead>
            <tbody>{d.approvals.map((p) => (
              <tr key={String(p['approval_id'])}>
                <Td mono>{short(p['approval_id'])}</Td><Td mono>{short(p['approver_principal_id'])}</Td><Td mono>{str(p['scope_digest'])}</Td><Td>{str(p['rationale'])}</Td>
                <Td>{fmtInstant(p['recorded_at'])}</Td><Td>{fmtInstant(p['expires_at'])}</Td>
                <Td>{p['revoked_at'] === null || p['revoked_at'] === undefined ? 'live' : `${fmtInstant(p['revoked_at'])} — ${str(p['revoke_reason'])}`}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Executions ({d.executions.length})</h3>
      {d.executions.length === 0 ? <Empty>Nothing has been executed.</Empty> : (
        <ScrollBox label="retention executions">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>Port</Th><Th>Outcome</Th><Th>Evidence</Th><Th>Executed by</Th><Th>Executed at</Th></tr></thead>
            <tbody>{d.executions.map((e) => (
              <tr key={String(e['execution_id'])}>
                <Td mono>{e['item_id'] === null || e['item_id'] === undefined ? '—' : short(e['item_id'])}</Td><Td mono>{str(e['port'])}</Td>
                <Td><strong>{str(e['outcome'])}</strong></Td><Td mono>{json(e['evidence'])}</Td>
                <Td mono>{short(e['executed_by'])}</Td><Td>{fmtInstant(e['executed_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Residual inventory ({d.residuals.length})</h3>
      {d.residuals.length === 0 ? <Empty>No residual: nothing the action leaves behind is recorded.</Empty> : (
        <ScrollBox label="retention residual inventory">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Kind</Th><Th>Ref</Th><Th>Count</Th><Th>Status</Th><Th>Note</Th><Th>Recorded</Th></tr></thead>
            <tbody>{d.residuals.map((x) => (
              <tr key={String(x['residual_id'])}>
                <Td>{str(x['kind'])}</Td><Td mono>{str(x['ref'])}</Td><Td mono>{str(x['count'])}</Td><Td><strong>{str(x['status'])}</strong></Td><Td>{str(x['note'])}</Td><Td>{fmtInstant(x['recorded_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Verifications ({d.verifications.length})</h3>
      {d.verifications.length === 0 ? <Empty>No verification check is recorded.</Empty> : (
        <ScrollBox label="retention verifications">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Check</Th><Th>Expected</Th><Th>Observed</Th><Th>Passed</Th><Th>Verified by</Th><Th>Verified at</Th></tr></thead>
            <tbody>{d.verifications.map((v) => (
              <tr key={String(v['verification_id'])}>
                <Td>{str(v['check_name'])}</Td><Td mono>{json(v['expected'])}</Td><Td mono>{json(v['observed'])}</Td>
                <Td><strong>{yes(v['passed'])}</strong></Td><Td mono>{short(v['verified_by'])}</Td><Td>{fmtInstant(v['verified_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Events ({d.events.length})</h3>
      {d.events.length === 0 ? <Empty>No event.</Empty> : (
        <ScrollBox label="retention action events">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Event</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
            <tbody>{d.events.map((e) => (
              <tr key={String(e['event_id'])}>
                <Td>{str(e['event'])}</Td><Td mono>{short(e['actor_principal_id'])}</Td><Td>{fmtInstant(e['occurred_at'])}</Td><Td mono>{json(e['details'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

export default function RetentionPage() {
  const { scope } = useShell();
  const [schedules, setSchedules] = useState<RetentionRow[] | null>(null);
  const [scheduleProblem, setScheduleProblem] = useState<string | null>(null);
  const [actions, setActions] = useState<RetentionRow[] | null>(null);
  const [partitions, setPartitions] = useState<Row[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RetentionActionDetail | null>(null);
  const [detailProblem, setDetailProblem] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_SCHEDULE);
  const [declared, setDeclared] = useState<Outcome<{ scheduleId: string }>>(none);
  const [evaluated, setEvaluated] = useState<Outcome<RetentionEvaluation>>(none);
  const [tier, setTier] = useState<RetentionTierState | null>(null);
  const [tierProblem, setTierProblem] = useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(DEFAULT_POLICY);
  const [policyDeclared, setPolicyDeclared] = useState<Outcome<Row>>(none);
  const [openDraft, setOpenDraft] = useState<OpenDraft>(() => ({ kind: 'review', targetKind: 'evidence', manifestId: '', sourceId: '', manifestIds: '', classificationCeiling: 'internal', partitionKey: `tenant:${scope.tenantId}`, toSeq: '', retentionProfile: '' }));
  const [opened, setOpened] = useState<Outcome<{ actionId: string; kind: string; targetKind: string; state: string }>>(none);
  const [resolved, setResolved] = useState<Outcome<RetentionScopeSummary>>(none);
  const [rationale, setRationale] = useState('');
  const [approved, setApproved] = useState<Outcome<{ approvalId: string; actionId: string; state: string }>>(none);
  const [executed, setExecuted] = useState<Outcome<RetentionExecutionResult>>(none);
  const [verified, setVerified] = useState<Outcome<RetentionVerdict>>(none);
  const [wdReason, setWdReason] = useState('');
  const [withdrawn, setWithdrawn] = useState<Outcome<{ actionId: string; state: string }>>(none);
  const [exported, setExported] = useState<{ detail: RetentionExportDetail | null; problem: string | null }>({ detail: null, problem: null });
  const [rvReason, setRvReason] = useState('');
  const [revoked, setRevoked] = useState<Outcome<{ revocation: Record<string, unknown>; bytes: { removed: boolean; error?: string } }>>(none);

  const loadSchedules = async () => {
    const r = await retention.listSchedules(scope);
    if (!r.ok || r.data === undefined) { setScheduleProblem(refusal(r, 'the schedules could not be listed')); return; }
    setScheduleProblem(null); setSchedules(r.data.schedules);
  };
  const loadActions = async () => {
    const r = await retention.listActions(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the retention actions could not be listed')); return; }
    setProblem(null); setActions(r.data.actions); setPartitions(r.data.partitions);
  };
  /** B12: the cold tier's state — read with the lists and again after every act (an execution moves bytes and spends budget; an evaluation defers and escalates; a declaration changes the policy in force). */
  const loadTier = async () => {
    const r = await retention.tierState(scope);
    if (!r.ok || r.data === undefined) { setTierProblem(refusal(r, 'the cold tier\'s state could not be read')); return; }
    setTierProblem(null); setTier(r.data.state);
  };
  /** B11: the export package of a customer-export action — read beside the record; a revoked package answers 409, kept as the server's words. */
  const loadExport = async (actionId: string, kind: unknown) => {
    if (kind !== 'customer_export') { setExported({ detail: null, problem: null }); return; }
    const r = await retention.getExport(scope, actionId);
    if (!r.ok || r.data === undefined) { setExported({ detail: null, problem: refusal(r, 'the export package could not be read') }); return; }
    setExported({ detail: r.data, problem: null });
  };
  const loadDetail = async (actionId: string) => {
    const r = await retention.getAction(scope, actionId);
    if (!r.ok || r.data === undefined) { setDetail(null); setDetailProblem(refusal(r, 'the action could not be read')); return; }
    setDetailProblem(null); setDetail(r.data);
    await loadExport(actionId, r.data.action['kind']);
  };
  const select = (actionId: string) => {
    setSelected(actionId); setDetail(null); setDetailProblem(null); setExported({ detail: null, problem: null });
    setResolved(none()); setRationale(''); setApproved(none()); setExecuted(none()); setVerified(none()); setWdReason(''); setWithdrawn(none()); setRvReason(''); setRevoked(none());
    void loadDetail(actionId);
  };
  useEffect(() => { void loadSchedules(); void loadActions(); void loadTier(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (actions === null) return <Empty>reading the retention actions…</Empty>;

  const current = selected === null ? null : actions.find((a) => String(a['action_id']) === selected) ?? null;
  const servedDigest = detail !== null && typeof detail.action['scope_digest'] === 'string' ? detail.action['scope_digest'] : null;

  /** One governed act on the selected action: the refusal is kept verbatim; the list, the record and the cold tier's state are re-read from the server after. */
  const act = async <T,>(set: (o: Outcome<T>) => void, verb: string, run: () => Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT } & Record<string, unknown>; error?: { code: string; message: string } }>, pick: (d: Record<string, unknown>) => T) => {
    set(none());
    const r = await run();
    if (!r.ok || r.data === undefined) {
      const m = refusal(r, `the ${verb} was not answered`);
      set({ result: null, receipt: null, problem: m });
      if (selected !== null) await loadDetail(selected);
      await loadActions();
      await loadTier();
      throw new Error(m);
    }
    set({ result: pick(r.data), receipt: r.data.receipt, problem: null });
    await loadActions();
    if (selected !== null) await loadDetail(selected);
    await loadTier();
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Retention</h1>
      <UnknownNote>
        A retention action is a <strong>durable workflow</strong>, not a delete. It is <strong>opened</strong> (by a person or by a schedule's
        evaluation), its <strong>scope resolved</strong> — every item it would touch with a disposition: execute, held by a legal hold,
        excluded, blocking — under a <strong>digest</strong> of that ordered scope; <strong>approved</strong> by the retention authority on the
        digest they read (never by the opener); <strong>executed</strong> by the steward (never by an approver) in one transaction — a hold placed
        since the approval rolls the execution back whole and pauses the action; and <strong>verified</strong> check by check against what the
        vault observes. A review records the review and touches no bytes; a deletion tombstones, its bytes removed after the record committed;
        a log-floor move retires outbox history below the served points; an archive moves bytes to the cold tier and a <strong>restore</strong> moves
        them back. The <strong>cold-tier manager</strong> is the domain's policy — a daily byte budget, the opens per evaluation, the attempts before
        escalation, the escalation age, the restore window — read by every execution and evaluation. Every count, digest and refusal below is the server's.
      </UnknownNote>

      <section aria-labelledby="sched-h" style={cardStyle}>
        <h2 id="sched-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Schedules ({schedules === null ? '…' : schedules.length})</h2>
        {scheduleProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {scheduleProblem}</span></LiveStatus>}
        {schedules === null ? (scheduleProblem === null ? <Empty>reading the schedules…</Empty> : null) : schedules.length === 0 ? <Empty>No schedule is declared in this domain: nothing falls due on its own.</Empty> : (
          <ScrollBox label="retention schedules">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Schedule</Th><Th>Retention profile</Th><Th>Target</Th><Th>Action kind</Th><Th>Due after</Th><Th>Selector</Th><Th>State</Th><Th>Owner</Th><Th>Declared</Th><Th>Last evaluated</Th><Th>Last evaluation</Th></tr></thead>
              <tbody>{schedules.map((s) => (
                <tr key={String(s['schedule_id'])}>
                  <Td mono>{short(s['schedule_id'])}</Td><Td mono>{str(s['retention_profile'])}</Td><Td>{str(s['target_kind'])}</Td><Td>{str(s['action_kind'])}</Td>
                  <Td mono>{fmtInterval(s['due_after'])}</Td><Td mono>{selectorText(s['selector'])}</Td><Td>{str(s['state'])}</Td><Td mono>{short(s['owner_principal_id'])}</Td>
                  <Td>{fmtInstant(s['declared_at'])}</Td><Td>{fmtInstant(s['last_evaluated_at'])}</Td><Td>{lastEvaluationText(s['last_evaluation'])}</Td>
                </tr>))}</tbody>
            </table>
          </ScrollBox>
        )}

        <h3 style={h3}>Evaluate the schedules</h3>
        <p style={muted}>
          The steward's act: every evidence manifest of a schedule's profile past its due-after that no open action of that kind covers raises an
          action (a RetentionActionDue each) — oldest due first, at most the tier policy's opens per evaluation per schedule, the rest deferred to
          the next evaluation; a restored manifest falls due for its archive schedule at the restore's instant plus the restore window. Nothing is
          deleted by an evaluation. Only evidence schedules are evaluated. The cold-tier manager's pass rides the same act: an action paused for
          retry longer than the policy's escalate-after is escalated for human review (its approvals revoked).
        </p>
        <div style={controlRow}>
          <GovernedButton label="Evaluate schedules" pendingLabel="evaluating"
            onRun={async () => {
              try {
                await act(setEvaluated, 'evaluation', () => retention.evaluateSchedules(scope), (d) => d['evaluation'] as RetentionEvaluation);
              } finally {
                // The evaluation stamps last_evaluated_at and last_evaluation on every active schedule: the schedules are re-read whether or not the act was answered.
                await loadSchedules();
              }
            }} />
        </div>
        <Problem verb="not evaluated" problem={evaluated.problem} />
        {evaluated.result !== null && (
          <>
            {evaluated.result.opened.length === 0 ? <p>the evaluation opened no action: nothing of any active schedule fell due that an open action does not already cover · deferred {str(evaluated.result.deferred)}</p> : (
              <>
                <p>the evaluation opened <strong>{evaluated.result.opened.length}</strong> action(s) · deferred <strong>{str(evaluated.result.deferred)}</strong> to the next evaluation (the policy's opens per evaluation):</p>
                <ScrollBox label="actions opened by the evaluation">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Action</Th><Th>Kind</Th><Th>Target</Th><Th>Selector</Th><Th>Schedule</Th><Th>Retention profile</Th><Th>Due from</Th></tr></thead>
                    <tbody>{evaluated.result.opened.map((o) => (
                      <tr key={String(o['action_id'])}>
                        <Td mono>{str(o['action_id'])}</Td><Td>{str(o['kind'])}</Td><Td>{str(o['target_kind'])}</Td><Td mono>{selectorText(o['selector'])}</Td>
                        <Td mono>{short(o['schedule_id'])}</Td><Td mono>{str(o['retention_profile'])}</Td><Td>{fmtInstant(o['due_from'])}</Td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              </>
            )}
            {evaluated.result.escalated.length === 0 ? <p>the cold-tier manager escalated no action: none paused for retry is older than the policy's escalate-after</p> : (
              <>
                <p>the cold-tier manager escalated <strong>{evaluated.result.escalated.length}</strong> action(s) for human review:</p>
                <ScrollBox label="actions escalated by the evaluation">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Action</Th><Th>Kind</Th><Th>Paused at</Th><Th>Reason</Th></tr></thead>
                    <tbody>{evaluated.result.escalated.map((o) => (
                      <tr key={String(o['action_id'])}>
                        <Td mono>{str(o['action_id'])}</Td><Td>{str(o['kind'])}</Td><Td>{fmtInstant(o['paused_at'])}</Td><Td>{str(o['reason'])}</Td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              </>
            )}
          </>
        )}
        <Receipt receipt={evaluated.receipt} />

        <h3 style={h3}>Declare a schedule</h3>
        <p style={muted}>A domain admin's act. The due-after is an interval such as <Mono>90 days</Mono> (seconds, minutes, hours, days, months or years); the owner defaults to the declarer. A restore is opened on demand, never by a schedule: the server refuses that kind here.</p>
        <div style={rowStyle}>
          <Field id="sd-profile" label="Retention profile (required)">{(id) => <Txt id={id} value={scheduleDraft.retentionProfile} onChange={(v) => setScheduleDraft({ ...scheduleDraft, retentionProfile: v })} />}</Field>
          <Field id="sd-target" label="Target kind">{(id) => <Sel id={id} value={scheduleDraft.targetKind} options={RETENTION_TARGET_KINDS} onChange={(v) => setScheduleDraft({ ...scheduleDraft, targetKind: v })} />}</Field>
          <Field id="sd-kind" label="Action kind">{(id) => <Sel id={id} value={scheduleDraft.actionKind} options={RETENTION_KINDS} onChange={(v) => setScheduleDraft({ ...scheduleDraft, actionKind: v })} />}</Field>
          <Field id="sd-due" label="Due after (required, e.g. 90 days)">{(id) => <Txt id={id} value={scheduleDraft.dueAfter} onChange={(v) => setScheduleDraft({ ...scheduleDraft, dueAfter: v })} />}</Field>
          <Field id="sd-source" label="Source id (optional; narrows the evaluation to that source's manifests)">{(id) => <Txt id={id} value={scheduleDraft.sourceId} onChange={(v) => setScheduleDraft({ ...scheduleDraft, sourceId: v })} />}</Field>
          <Field id="sd-owner" label="Owner principal id (optional)">{(id) => <Txt id={id} value={scheduleDraft.ownerPrincipalId} onChange={(v) => setScheduleDraft({ ...scheduleDraft, ownerPrincipalId: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare schedule" pendingLabel="declaring" disabled={!scheduleOk(scheduleDraft)}
            onRun={async () => {
              await act(setDeclared, 'declaration', () => retention.declareSchedule(scope, toScheduleIntake(scheduleDraft)), (d) => rec(d['schedule']) as unknown as { scheduleId: string });
              setScheduleDraft(EMPTY_SCHEDULE);
              await loadSchedules();
            }} />
        </div>
        <Problem verb="not declared" problem={declared.problem} />
        {declared.result !== null && <p>declared schedule <Mono>{str(declared.result.scheduleId)}</Mono></p>}
        <Receipt receipt={declared.receipt} />
      </section>

      <section aria-labelledby="tier-h" style={cardStyle}>
        <h2 id="tier-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Cold tier</h2>
        <p style={muted}>
          The cold-tier manager's observable state, as the server returned it: the policy in force (the defaults until one is declared), the
          manifests and bytes per tier, the moves of the last 24 hours, the daily byte budget and the instant its rolling window frees, the
          actions by state, the restored manifests awaiting their re-archive, and the vault's inventory of both roots. An audited read.
        </p>
        {tierProblem !== null && <LiveStatus assertive><span style={critical}>not read — {tierProblem}</span></LiveStatus>}
        {tier === null ? (tierProblem === null ? <Empty>reading the cold tier's state…</Empty> : null) : (
          <>
            <dl>
              <DefinitionRow term="Policy in force">
                {tier.policy.declared ? <>version <strong>{str(tier.policy.version)}</strong>{tier.policy.policy_id !== undefined && tier.policy.policy_id !== null ? <> · <Mono>{short(tier.policy.policy_id)}</Mono></> : null}</> : <>the defaults — no policy is declared for this domain</>}
                {' · '}budget {tier.policy.budget_bytes_per_day === null ? 'unbounded (null)' : `${str(tier.policy.budget_bytes_per_day)} bytes per day`}
                {' · '}opens per evaluation {str(tier.policy.max_opens_per_evaluation)} · attempts {str(tier.policy.max_attempts)}
                {' · '}escalate after <Mono>{fmtInterval(tier.policy.escalate_after)}</Mono> · restore window <Mono>{fmtInterval(tier.policy.restore_hot_for)}</Mono>
              </DefinitionRow>
              <DefinitionRow term="Tiers">hot {str(tier.tiers.hot.manifests)} manifest(s), {str(tier.tiers.hot.bytes)} bytes · archive {str(tier.tiers.archive.manifests)} manifest(s), {str(tier.tiers.archive.bytes)} bytes</DefinitionRow>
              <DefinitionRow term="Moves, last 24 hours">archived {str(tier.moves_24h.archived.count)} ({str(tier.moves_24h.archived.bytes)} bytes) · restored {str(tier.moves_24h.restored.count)} ({str(tier.moves_24h.restored.bytes)} bytes)</DefinitionRow>
              <DefinitionRow term="Budget">
                {tier.budget.bytes_per_day === null ? 'unbounded (null)' : `${str(tier.budget.bytes_per_day)} bytes per day`} · used {str(tier.budget.used_24h)}
                {' · '}remaining {tier.budget.remaining === null ? 'unbounded (null)' : str(tier.budget.remaining)} · window resets {tier.budget.window_resets_at === null ? 'never (nothing moved in the window)' : fmtInstant(tier.budget.window_resets_at)}
              </DefinitionRow>
              <DefinitionRow term="Actions">
                executing {str(tier.actions.executing)} · paused for retry {str(tier.actions.paused_retry)} · paused for human review {str(tier.actions.paused_human_review)}
                {' · '}escalated <strong>{str(tier.actions.escalated)}</strong> · pending bytes residuals {str(tier.actions.pending_bytes_residuals)}
              </DefinitionRow>
              <DefinitionRow term="Restored, awaiting re-archive">{str(tier.restored_awaiting_rearchive)} hot manifest(s) whose latest tier record is a restore</DefinitionRow>
              <DefinitionRow term="Vault inventory">evidence root: {inventoryText(tier.vault.evidence)} · archive root: {inventoryText(tier.vault.archive)}</DefinitionRow>
            </dl>
            <h3 style={h3}>Schedules as the manager sees them ({tier.schedules.length})</h3>
            {tier.schedules.length === 0 ? <Empty>No schedule: nothing returns to the cold tier on its own.</Empty> : (
              <ScrollBox label="cold tier schedules">
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Schedule</Th><Th>Action kind</Th><Th>Retention profile</Th><Th>Due after</Th><Th>State</Th><Th>Last evaluated</Th><Th>Last evaluation</Th></tr></thead>
                  <tbody>{tier.schedules.map((s) => (
                    <tr key={String(s.schedule_id)}>
                      <Td mono>{short(s.schedule_id)}</Td><Td>{str(s.action_kind)}</Td><Td mono>{str(s.retention_profile)}</Td><Td mono>{fmtInterval(s.due_after)}</Td>
                      <Td>{str(s.state)}</Td><Td>{fmtInstant(s.last_evaluated_at)}</Td><Td>{lastEvaluationText(s.last_evaluation)}</Td>
                    </tr>))}</tbody>
                </table>
              </ScrollBox>
            )}
          </>
        )}

        <h3 style={h3}>Declare the tier policy</h3>
        <p style={muted}>
          A domain admin's act (the tenant's or the platform's admin as well), the next version of this domain's policy. The budget is the bytes an
          archive or a restore may move in a rolling day (blank: unbounded; an execution above it is refused before it begins and the action paused for
          retry, the instant the window frees named); the opens per evaluation bound what an evaluation opens per schedule (1–200, oldest due first);
          the attempts bound the executions begun before an action is escalated for human review (1–10); the escalate-after is the age at which an
          action paused for retry is escalated by the evaluation; the restore window is how long a restored record stays hot before its archive
          schedule takes it back. Intervals are spelled as a due-after. The defaults are shown; the server states what it refuses.
        </p>
        <div style={rowStyle}>
          <Field id="tp-budget" label="Budget, bytes per day (blank: unbounded)">{(id) => <Txt id={id} type="number" value={policyDraft.budgetBytesPerDay} onChange={(v) => setPolicyDraft({ ...policyDraft, budgetBytesPerDay: v })} />}</Field>
          <Field id="tp-opens" label="Opens per evaluation (1 to 200)">{(id) => <Txt id={id} type="number" value={policyDraft.maxOpensPerEvaluation} onChange={(v) => setPolicyDraft({ ...policyDraft, maxOpensPerEvaluation: v })} />}</Field>
          <Field id="tp-attempts" label="Attempts before escalation (1 to 10)">{(id) => <Txt id={id} type="number" value={policyDraft.maxAttempts} onChange={(v) => setPolicyDraft({ ...policyDraft, maxAttempts: v })} />}</Field>
          <Field id="tp-escalate" label="Escalate after (e.g. 7 days)">{(id) => <Txt id={id} value={policyDraft.escalateAfter} onChange={(v) => setPolicyDraft({ ...policyDraft, escalateAfter: v })} />}</Field>
          <Field id="tp-window" label="Restore window (e.g. 30 days)">{(id) => <Txt id={id} value={policyDraft.restoreHotFor} onChange={(v) => setPolicyDraft({ ...policyDraft, restoreHotFor: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare tier policy" pendingLabel="declaring" disabled={!policyOk(policyDraft)}
            onRun={async () => {
              await act(setPolicyDeclared, 'declaration', () => retention.declareTierPolicy(scope, toPolicyIntake(policyDraft)), (d) => rec(d['policy']));
              setPolicyDraft(DEFAULT_POLICY);
            }} />
        </div>
        <Problem verb="not declared" problem={policyDeclared.problem} />
        {policyDeclared.result !== null && (
          <p>
            declared tier policy version <strong>{str(policyDeclared.result['version'])}</strong> <Mono>{short(policyDeclared.result['policy_id'])}</Mono>
            {' · '}budget {policyDeclared.result['budget_bytes_per_day'] === null ? 'unbounded (null)' : `${str(policyDeclared.result['budget_bytes_per_day'])} bytes per day`}
            {' · '}opens per evaluation {str(policyDeclared.result['max_opens_per_evaluation'])} · attempts {str(policyDeclared.result['max_attempts'])}
            {' · '}escalate after <Mono>{fmtInterval(policyDeclared.result['escalate_after'])}</Mono> · restore window <Mono>{fmtInterval(policyDeclared.result['restore_hot_for'])}</Mono>
            {' · '}declared at {fmtInstant(policyDeclared.result['declared_at'])}
          </p>
        )}
        <Receipt receipt={policyDeclared.receipt} />
      </section>

      <section aria-labelledby="acts-h" style={cardStyle}>
        <h2 id="acts-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Actions ({actions.length})</h2>
        {partitions.map((p) => (
          <p key={String(p['partition_key'])} style={muted}>
            log partition <Mono>{str(p['partition_key'])}</Mono>: last sequence {str(p['last_seq'])}, pending {str(p['pending'])}, dead letters {str(p['dead_letters'])},
            {' '}retained from sequence <strong>{str(p['retained_from_seq'])}</strong> ({str(p['retention_policy'])}){p['retention_note'] !== null && p['retention_note'] !== undefined ? <> — {String(p['retention_note'])}</> : null}
          </p>
        ))}
        {actions.length === 0 ? <Empty>No retention action has been opened in this domain.</Empty> : (
          <ScrollBox label="retention actions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Kind</Th><Th>Target</Th><Th>Selector</Th><Th>State</Th><Th>Scope</Th><Th>Failure</Th><Th>Profile</Th><Th>Opened by</Th><Th>Opened at</Th><Th>Closed</Th></tr></thead>
              <tbody>
                {actions.map((a) => {
                  const id = String(a['action_id']); const isSel = id === selected;
                  return (
                    <tr key={id} aria-selected={isSel}>
                      <Td>
                        <button type="button" aria-pressed={isSel} onClick={() => select(id)}
                          style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          {isSel ? 'selected' : 'select'}
                        </button>
                      </Td>
                      <Td mono>{str(a['kind'])}</Td><Td>{str(a['target_kind'])}</Td><Td mono>{selectorText(a['selector'])}</Td>
                      <Td><strong>{str(a['state'])}</strong></Td><Td>{scopeText(a['scope_summary'])}</Td><Td>{failureText(a)}</Td>
                      <Td mono>{str(a['retention_profile'])}{a['schedule_id'] !== null && a['schedule_id'] !== undefined ? ' (scheduled)' : ''}</Td>
                      <Td mono>{short(a['opened_by'])}</Td><Td>{fmtInstant(a['opened_at'])}</Td><Td>{fmtInstant(a['closed_at'])}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {current !== null && selected !== null && (
        <>
          <section aria-labelledby="rec-h" style={cardStyle}>
            <h2 id="rec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The action's record — {str(current['kind'])} on {str(current['target_kind'])}</h2>
            {detailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {detailProblem}</span></LiveStatus>}
            {detail === null ? (detailProblem === null ? <Empty>reading the record…</Empty> : null) : <ActionRecord d={detail} />}
            {current['kind'] === 'customer_export' && (
              <>
                <h3 style={h3}>The export package</h3>
                {exported.problem !== null && <p><span style={critical}>not read — {exported.problem}</span></p>}
                {exported.detail === null ? (exported.problem === null ? <Empty>No package is recorded: the export has not executed.</Empty> : null) : (
                  <dl>
                    <DefinitionRow term="Package"><Mono>{str(exported.detail.package['locator_prefix'])}</Mono> · {str(exported.detail.package['object_count'])} object(s), {str(exported.detail.package['excluded_count'])} excluded, {str(exported.detail.package['byte_total'])} bytes · ceiling {str(exported.detail.package['classification_ceiling'])}</DefinitionRow>
                    <DefinitionRow term="Digests">package <Mono>{str(exported.detail.package['package_digest'])}</Mono> · manifest.json <Mono>{str(exported.detail.package['manifest_digest'])}</Mono> · scheme {str(rec(exported.detail.package['signature'])['scheme'])}</DefinitionRow>
                    <DefinitionRow term="Built">by <Mono>{short(exported.detail.package['built_by'])}</Mono> at {fmtInstant(exported.detail.package['built_at'])} under approval <Mono>{short(exported.detail.package['approval_id'])}</Mono></DefinitionRow>
                    <DefinitionRow term="Revoked">{exported.detail.package['revoked_at'] === null || exported.detail.package['revoked_at'] === undefined ? 'no' : `${fmtInstant(exported.detail.package['revoked_at'])} — ${str(exported.detail.package['revoke_reason'])}`}</DefinitionRow>
                    <DefinitionRow term="Files">{exported.detail.files.length === 0 ? 'none on disk' : exported.detail.files.map((f) => <Mono key={f}>{f} </Mono>)}</DefinitionRow>
                  </dl>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="resolve-h" style={cardStyle}>
            <h2 id="resolve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Resolve the scope</h2>
            <p style={muted}>
              The steward's act: every item the action would touch is recorded with its disposition — execute, held (a legal hold takes precedence),
              excluded (a deletion retires corrected, superseded or withdrawn evidence only; a restore moves archived bytes only, so a manifest already
              in the hot tier is excluded), blocking (a cursor or unpublished row below a floor) — and the digest the approval signs is computed over
              that ordered scope. A paused, held or escalated action is resolved again by the same act; the re-resolution of an escalated one restarts
              its attempts (recorded on the resolution's event).
            </p>
            <div style={controlRow}>
              <GovernedButton label="Resolve scope" pendingLabel="resolving"
                onRun={() => act(setResolved, 'resolution', () => retention.resolveAction(scope, selected), (d) => d['scope'] as RetentionScopeSummary)} />
            </div>
            <Problem verb="not resolved" problem={resolved.problem} />
            {resolved.result !== null && <Resolved s={resolved.result} />}
            <Receipt receipt={resolved.receipt} />
          </section>

          <section aria-labelledby="approve-h" style={cardStyle}>
            <h2 id="approve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Approve</h2>
            <p style={muted}>
              The retention authority's act, human-gated, on the digest of the resolved scope as this page read it: the server refuses a digest that is
              not the resolved scope's, a scope that is not resolved (paused, held), the opener's own approval, and a principal without the authority.
              An approval expires after 30 days and is revoked when an execution is rolled back.
            </p>
            <p>
              Digest submitted: {servedDigest === null ? <span style={critical}>none — the scope has not been resolved, so there is nothing to approve</span> : <Mono>{servedDigest}</Mono>}
            </p>
            <Field id="ap-why" label="Rationale (at least 8 characters, required)">{(id) => <Txt id={id} value={rationale} onChange={setRationale} />}</Field>
            <div style={controlRow}>
              <GovernedButton label="Approve on this digest" pendingLabel="approving" disabled={servedDigest === null || rationale.trim().length < 8}
                onRun={() => act(setApproved, 'approval', () => retention.approveAction(scope, selected, servedDigest ?? '', rationale.trim()), (d) => rec(d['approval']) as unknown as { approvalId: string; actionId: string; state: string })} />
            </div>
            <Problem verb="not approved" problem={approved.problem} />
            {approved.result !== null && <p>approval <Mono>{str(approved.result.approvalId)}</Mono> recorded; the action is now <strong>{str(approved.result.state)}</strong></p>}
            <Receipt receipt={approved.receipt} />
          </section>

          <section aria-labelledby="exec-h" style={cardStyle}>
            <h2 id="exec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Execute</h2>
            <p style={muted}>
              The steward's act, human-gated; an approver never executes. The approved scope runs in one transaction: a review records each item as reviewed
              and removes nothing; a deletion tombstones each executing manifest and its bytes go after the commit; a log-floor move declares the floor.
              A hold placed since the approval refuses the item, and the whole execution is rolled back and the action paused for re-resolution (a 409).
              Every kind executes: an archive moves the bytes to the archive tier; a restore moves them back to the hot tier; a customer export builds a
              signed package under the export namespace. The cold-tier manager refuses, before anything moves, an archive or a restore above the domain's
              daily byte budget (the action paused for retry, the instant the window frees named) and any execution past the policy's attempts (the action
              escalated for human review; a re-resolution restarts the count) — each a 409 in the server's words.
              On an already executed action this act retries the pending bytes residuals.
            </p>
            <div style={controlRow}>
              <GovernedButton label="Execute the approved scope" pendingLabel="executing" variant="critical"
                onRun={() => act(setExecuted, 'execution', () => retention.executeAction(scope, selected), (d) => d['execution'] as RetentionExecutionResult)} />
            </div>
            <Problem verb="not executed" problem={executed.problem} />
            {executed.result !== null && <Execution e={executed.result} />}
            <Receipt receipt={executed.receipt} />
          </section>

          <section aria-labelledby="verify-h" style={cardStyle}>
            <h2 id="verify-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Verify</h2>
            <p style={muted}>
              Only an executed action is verified. Each item is checked against what the vault observes: a deleted manifest tombstoned and its bytes gone; a held
              one untouched and its bytes present; a reviewed one untouched, its bytes present and the review recorded; a moved floor standing at its sequence;
              a restored one recorded hot, its bytes in the hot tier under its digest, absent from the archive tier and no staged copy in either root.
              A pass closes the action verified (with residuals when bytes are still pending) and, for a deletion or a floor move, publishes DeletionVerified;
              a review's verification is its own record and publishes none.
            </p>
            <div style={controlRow}>
              <GovernedButton label="Verify" pendingLabel="verifying"
                onRun={() => act(setVerified, 'verification', () => retention.verifyAction(scope, selected), (d) => d['verification'] as RetentionVerdict)} />
            </div>
            <Problem verb="not verified" problem={verified.problem} />
            {verified.result !== null && <Verdict v={verified.result} />}
            <Receipt receipt={verified.receipt} />
          </section>

          <section aria-labelledby="wd-h" style={cardStyle}>
            <h2 id="wd-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Withdraw</h2>
            <p style={muted}>An opened, resolved, held, paused or approved action is withdrawn with a reason; an executing or executed one is not.</p>
            <Field id="wd-reason" label="Reason (at least 8 characters, required)">{(id) => <Txt id={id} value={wdReason} onChange={setWdReason} />}</Field>
            <div style={controlRow}>
              <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={wdReason.trim().length < 8}
                onRun={() => act(setWithdrawn, 'withdrawal', () => retention.withdrawAction(scope, selected, wdReason.trim()), (d) => rec(d['action']) as unknown as { actionId: string; state: string })} />
            </div>
            <Problem verb="not withdrawn" problem={withdrawn.problem} />
            {withdrawn.result !== null && <p>action <Mono>{str(withdrawn.result.actionId)}</Mono> is now <strong>{str(withdrawn.result.state)}</strong></p>}
            <Receipt receipt={withdrawn.receipt} />
          </section>

          {current['kind'] === 'customer_export' && (
            <section aria-labelledby="rv-h" style={cardStyle}>
              <h2 id="rv-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Revoke the export package</h2>
              <p style={muted}>The retention authority's act, human-gated: the package is revoked once with a reason and its bytes are removed after the commit; the read route refuses it from then on.</p>
              <Field id="rv-reason" label="Reason (at least 8 characters, required)">{(id) => <Txt id={id} value={rvReason} onChange={setRvReason} />}</Field>
              <div style={controlRow}>
                <GovernedButton label="Revoke the package" pendingLabel="revoking" variant="critical" disabled={rvReason.trim().length < 8}
                  onRun={() => act(setRevoked, 'revocation', () => retention.revokeExport(scope, selected, rvReason.trim()), (d) => ({ revocation: rec(d['revocation']), bytes: rec(d['bytes']) as unknown as { removed: boolean; error?: string } }))} />
              </div>
              <Problem verb="not revoked" problem={revoked.problem} />
              {revoked.result !== null && <p>package <Mono>{str(revoked.result.revocation['package_digest'])}</Mono> revoked at {fmtInstant(revoked.result.revocation['revoked_at'])}; bytes removed: {yes(revoked.result.bytes.removed)}{revoked.result.bytes.error !== undefined ? ` — ${revoked.result.bytes.error}` : ''}</p>}
              <Receipt receipt={revoked.receipt} />
            </section>
          )}
        </>
      )}

      <section aria-labelledby="open-h" style={cardStyle}>
        <h2 id="open-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Open an action</h2>
        <p style={muted}>
          The steward's act, under the purpose <Mono>retention</Mono>: the workflow's first durable state, announced by RetentionActionDue. An evidence
          selector names a manifest id or a source id (that source's superseded versions) — an archive, a restore or a customer export may name a chosen
          object set instead (manifest ids, one per line; a restore names the archived manifests to move back to the hot tier), and a customer export names
          its classification ceiling (its redaction gate; the export namespace is its destination); a log partition names this tenant's partition key and
          the sequence the floor moves to, and takes the <Mono>log_floor</Mono> kind only. The server states what it refuses.
        </p>
        <div style={rowStyle}>
          <Field id="op-kind" label="Kind">{(id) => <Sel id={id} value={openDraft.kind} options={RETENTION_KINDS} onChange={(v) => setOpenDraft({ ...openDraft, kind: v })} />}</Field>
          <Field id="op-target" label="Target kind">{(id) => <Sel id={id} value={openDraft.targetKind} options={RETENTION_TARGET_KINDS} onChange={(v) => setOpenDraft({ ...openDraft, targetKind: v })} />}</Field>
          <Field id="op-profile" label="Retention profile (optional)">{(id) => <Txt id={id} value={openDraft.retentionProfile} onChange={(v) => setOpenDraft({ ...openDraft, retentionProfile: v })} />}</Field>
        </div>
        {openDraft.targetKind === 'evidence' ? (
          <div style={rowStyle}>
            <Field id="op-manifest" label={takesObjectSet(openDraft.kind) ? 'Manifest id (or a source id, or manifest ids below)' : 'Manifest id (one of the two)'}>{(id) => <Txt id={id} value={openDraft.manifestId} onChange={(v) => setOpenDraft({ ...openDraft, manifestId: v })} />}</Field>
            <Field id="op-source" label={takesObjectSet(openDraft.kind) ? 'Source id (or a manifest id, or manifest ids below)' : 'Source id (one of the two)'}>{(id) => <Txt id={id} value={openDraft.sourceId} onChange={(v) => setOpenDraft({ ...openDraft, sourceId: v })} />}</Field>
            {takesObjectSet(openDraft.kind) && (
              <Field id="op-manifest-ids" label="Manifest ids (a chosen object set — an archive's, a restore's or a customer export's; one id per line, 1 to 200)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem' }} value={openDraft.manifestIds} onChange={(e) => setOpenDraft({ ...openDraft, manifestIds: e.target.value })} />}</Field>
            )}
            {openDraft.kind === 'customer_export' && (
              <Field id="op-ceiling" label="Classification ceiling (the redaction gate: objects above it are excluded)">{(id) => <Sel id={id} value={openDraft.classificationCeiling} options={RETENTION_CLASSIFICATIONS} onChange={(v) => setOpenDraft({ ...openDraft, classificationCeiling: v })} />}</Field>
            )}
          </div>
        ) : (
          <div style={rowStyle}>
            <Field id="op-partition" label="Partition key (this tenant's, from the session's scope)">{(id) => <Txt id={id} value={openDraft.partitionKey} onChange={(v) => setOpenDraft({ ...openDraft, partitionKey: v })} />}</Field>
            <Field id="op-toseq" label="To sequence (the floor moves to it; 2 or more)">{(id) => <Txt id={id} type="number" value={openDraft.toSeq} onChange={(v) => setOpenDraft({ ...openDraft, toSeq: v })} />}</Field>
          </div>
        )}
        <div style={controlRow}>
          <GovernedButton label="Open action" pendingLabel="opening" disabled={!openOk(openDraft)}
            onRun={async () => {
              await act(setOpened, 'opening', () => retention.openAction(scope, toOpenIntake(openDraft)), (d) => rec(d['action']) as unknown as { actionId: string; kind: string; targetKind: string; state: string });
            }} />
        </div>
        <Problem verb="not opened" problem={opened.problem} />
        {opened.result !== null && (
          <p>
            opened action <Mono>{str(opened.result.actionId)}</Mono> — {str(opened.result.kind)} on {str(opened.result.targetKind)}, state <strong>{str(opened.result.state)}</strong>
            {' '}<button type="button" onClick={() => { if (opened.result !== null) select(opened.result.actionId); }}
              style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>select it</button>
          </p>
        )}
        <Receipt receipt={opened.receipt} />
      </section>
    </>
  );
}
