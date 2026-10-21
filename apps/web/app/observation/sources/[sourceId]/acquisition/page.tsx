'use client';
/**
 * CP-6 B40 §AP (F-P1-04) — THE ACQUISITION POLICY OF A SOURCE: per contract version the declared policy (rate, the contract's backoff,
 * robots, the collection window, residency) or "not declared before SRC@v4"; the COVERAGE GAPS — every rate-limited or unavailable interval
 * with the contract's backoff (holding, open, resolved by a later run) and the stream's incomplete ranges — so a throttled interval is a
 * stated gap, never a silent one (DP-10-005); the authorization each run cited (V03-T-266); the robots.txt fetches. Read through
 * observation.acquisition.read (exact; metadata only — no evidence content, no credential value, no robots text).
 *
 * One h1 in every state (reading, refused, ready); a refusal is the server's, in its words; read-only — nothing optimistic. THREE CLAIMS:
 * construction (this page); demonstrated operation is the act's (SYNTHETIC); real acceptance — never claimed.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { toAcquisition, type AcquisitionView } from '../../../../../lib/acquisition-b40';
import { acquisitionApi, type Receipt as ReceiptT } from '../../../../../lib/acquisition-api-b40';
import { AcquisitionDeclaration, AuthorizationLedger, CoverageGapList, RobotsCacheList } from '../../../../../components/acquisition-policy';
import { Empty, Mono, cardStyle } from '../../../../../components/observation';
import { ErrorNote, Receipt } from '../../../../../components/ui';

type Problem = { code: string; message: string; correlationId: string };
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;

export default function AcquisitionPolicyPage() {
  const { scope } = useShell();
  const params = useParams<{ sourceId: string }>();
  const sourceId = params.sourceId;
  const [view, setView] = useState<AcquisitionView | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [rev, setRev] = useState(0);
  const load = useCallback(async () => {
    const r = await acquisitionApi.read(scope, sourceId);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error ?? { code: `HTTP ${r.status}`, message: 'The acquisition policy was not read; read it again with the button below.', correlationId: '' });
      return;
    }
    setProblem(null); setReceipt(r.data.receipt); setView(toAcquisition(r.data.acquisition));
  }, [scope, sourceId]);
  useEffect(() => { void load(); }, [load, rev]);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Acquisition policy</h1>
      <p className="eye-ev-note">How this source may be collected — the rate, the contract&apos;s backoff, robots, the collection window and residency — what each run
        was authorized to do, and every interval collection was held back. Metadata only: the evidence itself is read on its own page by the roles that read evidence.</p>
      <p><Link href={`/observation/sources/${sourceId}`}>Back to the source</Link> · <button type="button" className="eye-cld-btn-quiet" onClick={() => setRev((x) => x + 1)}>Read the policy again</button></p>
      {problem !== null ? <ErrorNote error={problem} />
        : view === null ? <Empty>Reading the acquisition policy of this source…</Empty>
        : (
          <>
            <p className="eye-ev-note">{view.sourceName} (<Mono>{view.sourceKey}</Mono>) · read at {view.asOf}
              {view.hold === null ? ' · no backoff hold in force' : ` · collection held by the contract's backoff until ${view.hold.until} (attempt ${view.hold.attempt})`}</p>
            <Receipt receipt={receipt} />
            <section style={cardStyle} aria-labelledby="ap-gaps">
              <h2 id="ap-gaps" style={h2}>Coverage gaps</h2>
              <p className="eye-ev-note">{view.gaps.statement}</p>
              <CoverageGapList gaps={view.gaps.gaps} label="The coverage gaps of this source" />
            </section>
            <section aria-labelledby="ap-decl">
              <h2 id="ap-decl" style={h2}>The declared policy, per contract version</h2>
              {view.versions.length === 0 ? <p className="eye-ev-note">No contract version of this source is recorded in this domain.</p>
                : view.versions.map((v) => <AcquisitionDeclaration key={v.contractVersion} version={v} />)}
            </section>
            <section style={cardStyle} aria-labelledby="ap-auth">
              <h2 id="ap-auth" style={h2}>Acquisition authorizations</h2>
              <AuthorizationLedger rows={view.authorizations} />
            </section>
            <section style={cardStyle} aria-labelledby="ap-robots">
              <h2 id="ap-robots" style={h2}>robots.txt</h2>
              <RobotsCacheList rows={view.robots} />
            </section>
          </>
        )}
    </>
  );
}
