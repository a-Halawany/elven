'use client';
/**
 * CP-6 B82-F §RT (0122_b82f_x_rt) — THE RIGHTS TERMS FOR THEIR DECLARERS (B82 §EV's follow-up; DESIGN D10; CMP-031, UX-26-002).
 *
 * The data steward and the collection manager DECLARE and WITHDRAW a source's rights terms; this page lets them READ what they act on,
 * without any evidence read: `observation.rights.terms.read` (exactly the declare rule's roles at DOMAIN) answers the domain's sources with
 * their rights METADATA only — the source's name, the contract version, the contract's own rights statement, the terms' state and version,
 * purposes, prohibited uses, attribution, expiry, every version and the ledger. Never evidence content, bytes, segments or payloads.
 * Each series hosts the EXISTING RightsTermsForm (the existing declare / withdraw routes, human-gated; the PDP and the port decide). The
 * evidence page keeps its form for the roles that reach it.
 *
 * One h1 in every state (loading, refusal, empty, ready); a refusal is the server's, in its words; nothing optimistic — after an act the
 * page reads the register again. THREE CLAIMS: construction (this page); demonstrated operation and real acceptance — never claimed.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../layout';
import { evidenceApi, type Receipt as ReceiptT } from '../../../lib/evidence-api-b82';
import { toRights, type ContractRights } from '../../../lib/evidence-b82';
import { RightsNotice } from '../../../components/evidence';
import { Empty, Mono, cardStyle } from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';
import { RightsTermsForm } from '../evidence/[evdId]/rights-form';

type Row = Record<string, unknown>;
type Problem = { code: string; message: string; correlationId: string };
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
const s = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v));
const h2 = { fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 } as const;

function contractOf(c: Row | undefined): ContractRights | null {
  if (c === undefined) return null;
  return { rightsState: typeof c['rights_state'] === 'string' ? c['rights_state'] as string : null, licence: typeof c['licence'] === 'string' ? c['licence'] as string : null,
    permittedUse: strs(c['permitted_use']), attribution: typeof c['attribution'] === 'string' ? c['attribution'] as string : null,
    retention: typeof c['retention'] === 'string' ? c['retention'] as string : null };
}

function Series({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { scope } = useShell();
  const sourceId = String(row['source_id']);
  const cv = Number(row['contract_version']);
  const current = toRights(row['current']);
  const history = arr(row['history']);
  const events = arr(row['events']);
  const id = `rt-${sourceId}-${cv}`;
  return (
    <section style={cardStyle} aria-labelledby={id}>
      <h2 id={id} style={h2}>{s(row['source_name'])} — contract v{cv}</h2>
      <p className="eye-ev-note">Source <Mono>{sourceId}</Mono> · contract {s(row['contract_state'])} · {s(row['statement'])}</p>
      <RightsNotice terms={current} contract={contractOf(row['contract_rights'] as Row | undefined)} />
      {history.length === 0 ? <p className="eye-ev-note">No version of rights terms is recorded for this contract version.</p> : (
        <div className="eye-ev-scroll" role="region" aria-label={`Rights terms versions of ${s(row['source_name'])} contract v${cv}`} tabIndex={0}>
          <table className="eye-table">
            <caption>Every version of the rights terms, oldest first — the record keeps each one</caption>
            <thead><tr>{['Version', 'State', 'Expiry', 'Purposes', 'Prohibited uses', 'Attribution', 'Declared by', 'Declared at', 'Reason'].map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
            <tbody>{history.map((v) => (
              <tr key={s(v['version'])}>
                <th scope="row">v{s(v['version'])}</th><td>{s(v['state']).replace('_', ' ')}</td><td>{s(v['expiry_statement'])}</td>
                <td>{strs(v['purposes']).join('; ') || 'none stated'}</td><td>{strs(v['prohibited_uses']).join('; ') || 'none declared'}</td><td>{s(v['attribution'])}</td>
                <td><Mono>{s(v['declared_by'])}</Mono></td><td>{s(v['declared_at'])}</td><td>{s(v['reason'])}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {events.length === 0 ? null : (
        <ul className="eye-ev-lines" aria-label={`The ledger of ${s(row['source_name'])} contract v${cv}`}>
          {events.map((e, i) => <li key={i}>{s(e['at'])} · {s(e['event'])} (terms v{s(e['terms_version'])}) by <Mono>{s(e['actor'])}</Mono></li>)}
        </ul>
      )}
      <RightsTermsForm key={`${sourceId}:${cv}:${current?.version ?? 0}`} scope={scope} sourceId={sourceId} contractVersion={Number.isInteger(cv) ? cv : null} current={current} onChanged={onChanged} />
    </section>
  );
}

export default function RightsTermsPage() {
  const { scope } = useShell();
  const [data, setData] = useState<{ series: Row[]; truncated: boolean; asOf: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [rev, setRev] = useState(0);
  const load = useCallback(async () => {
    const r = await evidenceApi.rightsTerms(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error ?? { code: `HTTP ${r.status}`, message: 'The rights terms were not read; reload the page to read them again.', correlationId: '' });
      return;
    }
    setProblem(null); setReceipt(r.data.receipt);
    setData({ series: arr(r.data.terms.series), truncated: r.data.terms.truncated === true, asOf: s(r.data.terms.as_of) });
  }, [scope]);
  useEffect(() => { void load(); }, [load, rev]);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Rights terms</h1>
      <p className="eye-ev-note">The rights terms of this domain&apos;s sources, for the people who declare them — a data steward or a collection manager.
        Rights metadata only: the evidence itself is read on its own page, by the roles that read evidence.</p>
      {problem !== null ? <ErrorNote error={problem} />
        : data === null ? <Empty>Reading the rights terms of this domain&apos;s sources…</Empty>
        : (
          <>
            <p className="eye-ev-note">Read at {data.asOf}.{data.truncated ? ' The first 200 source contract versions are shown; the rest are not listed on this read.' : ''}</p>
            <Receipt receipt={receipt} />
            {data.series.length === 0 ? <Empty>No source is recorded in this domain yet; rights terms are declared for a registered source contract.</Empty>
              : data.series.map((row) => <Series key={`${String(row['source_id'])}:${String(row['contract_version'])}`} row={row} onChanged={() => setRev((x) => x + 1)} />)}
          </>
        )}
    </>
  );
}
