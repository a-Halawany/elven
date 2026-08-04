'use client';
/**
 * Audit ledger viewer — sanitized projection only (mask_secret_metadata
 * obligation is enforced server-side; the UI displays what the evidence
 * boundary returns). Editable views of the event stream are prohibited.
 * Chain verification surfaces integrity state; a tampered partition shows
 * an incident and is never re-sealed.
 */
import { useCallback, useEffect, useState } from 'react';
import { call } from '../../../lib/api';
import { ErrorNote, Panel, Receipt, Td, Th, buttonStyle, inputStyle, tableStyle } from '../../../components/ui';
import { t, defaultLocale } from '../../../lib/i18n';

interface AuditRow {
  partition_id: string; audit_seq: string | number; scope: string;
  tenant_id: string | null; event_type: string; outcome: string; actor: string;
  action: string; result_code: string; correlation_id: string; occurred_at: string;
  row_hash: string; hash_alg_version: string;
}
interface VerifyReport {
  partitionId: string; checked: number; ok: boolean;
  brokenAtSeq: number | null; headMatches: boolean | null; incidentId: string | null;
}
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

const OUTCOME_TOKEN: Record<string, string> = {
  success: '--eye-color-success', denied: '--eye-color-critical',
  indeterminate: '--eye-color-uncertain', failure: '--eye-color-warning',
};

export default function AuditPage() {
  const locale = defaultLocale;
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [obligations, setObligations] = useState<string[]>([]);
  const [partition, setPartition] = useState('platform');
  const [report, setReport] = useState<VerifyReport | null>(null);

  const refresh = useCallback(async () => {
    const r = await call<{ events: AuditRow[]; receipt: { policyDecisionId: string; auditSeq: number }; obligationsApplied: Array<{ type: string }> }>(
      '/v1/platform/audit/query',
      { scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none' },
      { limit: 50 },
    );
    if (r.ok && r.data !== undefined) {
      setEvents(r.data.events);
      setReceipt(r.data.receipt);
      setObligations(r.data.obligationsApplied.map((o) => o.type));
    } else setError(r.error ?? null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function verify() {
    setReport(null);
    const r = await call<{ report: VerifyReport }>(
      '/v1/platform/audit/verify',
      { scope: 'PLATFORM', action: 'audit.read', object_type: 'AUD', side_effect_class: 'none' },
      { partitionId: partition },
    );
    if (r.ok && r.data !== undefined) setReport(r.data.report);
    else setError(r.error ?? null);
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>{t('audit.title', locale)}</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {obligations.length > 0 && (
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
          Obligations enforced on this view: {obligations.join(', ')}
        </p>
      )}

      <Panel title={t('audit.verify', locale)}>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center' }}>
          <input style={inputStyle} value={partition} onChange={(e) => setPartition(e.target.value)} />
          <button style={buttonStyle} onClick={() => void verify()}>{t('audit.verify', locale)}</button>
          {report !== null && (
            <span style={{ color: report.ok ? 'var(--eye-color-success)' : 'var(--eye-color-critical)', fontWeight: 650 }}>
              {report.ok
                ? `✓ chain intact — ${report.checked} events, head matches`
                : `✗ INTEGRITY FAILURE at seq ${report.brokenAtSeq ?? '?'} — partition frozen, incident ${report.incidentId?.slice(0, 13) ?? ''}… (range will not be re-sealed)`}
            </span>
          )}
        </div>
      </Panel>

      <Panel title="Events (sanitized projection)">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Partition</Th><Th>Seq</Th><Th>Type</Th><Th>Outcome</Th><Th>Actor</Th>
              <Th>Action</Th><Th>Result</Th><Th>Occurred</Th><Th>Hash</Th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={`${e.partition_id}:${e.audit_seq}`}>
                <Td mono>{e.partition_id.slice(0, 16)}</Td>
                <Td mono>{String(e.audit_seq)}</Td>
                <Td>{e.event_type}</Td>
                <Td>
                  <span style={{ color: `var(${OUTCOME_TOKEN[e.outcome] ?? '--eye-color-ink-default'})`, fontWeight: 600 }}>
                    {e.outcome.toUpperCase()}
                  </span>
                </Td>
                <Td mono>{e.actor.slice(0, 24)}</Td>
                <Td mono>{e.action}</Td>
                <Td mono>{e.result_code}</Td>
                <Td mono>{e.occurred_at.slice(0, 19)}Z</Td>
                <Td mono>{e.row_hash.slice(0, 10)}…</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
