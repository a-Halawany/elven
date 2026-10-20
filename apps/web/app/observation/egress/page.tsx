'use client';
/**
 * CP-6 B40 §CR — EGRESS RECEIPTS (IA-28-001, IA-28-005; D9). Every request a connector cell asked the egress gateway for — allowed, refused
 * or blocked — with the destination's identity (the resolved and pinned addresses and the TLS key, or the replay set), the purpose and
 * data class, the request and response digests and byte counts, and whether the gateway injected a credential (by reference). Read from
 * observation.egress.read; never content. Optionally narrowed to one source or one run (from the address: ?source=…&run=…).
 * One h1 in every state; a refusal in the server's words; nothing optimistic. CONSTRUCTION only.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { connectorsApi, type Receipt as ReceiptT } from '../../../lib/connectors-api-b40';
import { receiptCounts, toReceipt, type ReceiptView } from '../../../lib/connectors-b40';
import { CellBoundaryNote, EgressReceiptTable } from '../../../components/connector-cell';
import { Empty, fmtInstant } from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';

type Problem = { code: string; message: string; correlationId: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EgressReceiptsPage() {
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Egress receipts</h1>
      <Suspense fallback={<p role="status" className="eye-help">Reading the egress receipts…</p>}><Receipts /></Suspense>
    </>
  );
}

function Receipts() {
  const { scope } = useShell();
  const params = useSearchParams();
  const sourceId = UUID_RE.test(params.get('source') ?? '') ? params.get('source') : null;
  const runId = UUID_RE.test(params.get('run') ?? '') ? params.get('run') : null;
  const [data, setData] = useState<{ receipts: ReceiptView[]; counts: Array<{ key: string; label: string; n: number }>; asOf: string; limit: number } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const load = useCallback(async () => {
    const r = await connectorsApi.receipts(scope, { sourceId, runId, limit: 500 });
    if (!r.ok || r.data === undefined) { setProblem(r.error ?? { code: `HTTP ${r.status}`, message: 'The receipts were not read; reload the page to read them again.', correlationId: '' }); return; }
    const e = r.data.egress;
    setProblem(null); setReceipt(r.data.receipt);
    setData({ receipts: (Array.isArray(e['receipts']) ? e['receipts'] as Record<string, unknown>[] : []).map(toReceipt), counts: receiptCounts(e['counts']),
      asOf: String(e['as_of'] ?? ''), limit: Number(e['limit'] ?? 500) });
  }, [scope, sourceId, runId]);
  useEffect(() => { void load(); }, [load]);
  const scopeLabel = `tenant ${scope.tenantId.slice(0, 8)}… / domain ${scope.domainId.slice(0, 8)}…${sourceId === null ? '' : ` / source ${sourceId.slice(0, 8)}…`}${runId === null ? '' : ` / run ${runId.slice(0, 8)}…`}`;
  return (
    <>
      <p className="eye-help">Every request a connector cell made through its run&apos;s egress gateway, newest first — what was asked, where it went (or why it did not), and the digests that prove it. {sourceId !== null || runId !== null ? <Link href="/observation/egress">Show every source</Link> : <Link href="/observation/connectors">Open the connectors</Link>}</p>
      <CellBoundaryNote />
      {problem !== null ? <ErrorNote error={problem} /> : data === null ? <Empty>Reading the egress receipts…</Empty> : (
        <>
          <p className="eye-help">Read at {fmtInstant(data.asOf)} · at most {data.limit} receipts are listed.</p>
          <Receipt receipt={receipt} />
          {data.counts.length === 0 ? null : (
            <ul aria-label="The receipts by decision" className="eye-help">{data.counts.map((c) => <li key={c.key}>{c.n} {c.label}</li>)}</ul>
          )}
          <EgressReceiptTable receipts={data.receipts} label="Transfer receipts" asOf={data.asOf} scopeLabel={scopeLabel} />
        </>
      )}
    </>
  );
}
