'use client';
/**
 * CP-6 B40 §AP — THE ACQUISITION POLICY LIBRARY (F-P1-04). Five components, each arriving `proposed` (the DSA approves it in the act); the
 * decisions are lib/acquisition-b40.ts's (pure, tested); a component only renders them:
 *
 *   AcquisitionDeclaration  one contract version's declared policy — rate, the contract's backoff, robots, the window, residency — or "not
 *                           declared before SRC@v4" (D8: no back-fill)
 *   CoverageGapList         the rate-limited / unavailable intervals with the contract's backoff, and the stream's incomplete ranges — each
 *                           holding / open / resolved in WORDS; a throttled interval is a stated gap, never a silent one (DP-10-005)
 *   AuthorizationLedger     the authorization each run cited — authorized, or refused with its class in words — and its verdicts
 *   RobotsCacheList         the robots.txt fetches per contract version and origin (outcome, groups, how fetched) — never the text
 *   CoverageGapPanel        the panel the SOURCE PAGE mounts at the fold: it reads the policy itself (observation.acquisition.read), states
 *                           the gaps and links to the acquisition page; a refusal is the server's, in its words
 *
 * Accessibility: tables with captions and header scopes inside a focusable, labelled scroll region; every state is a word (forced colours and
 * 200 % zoom keep it); logical properties only; no raw colour. Read-only: no command here, nothing optimistic — every answer is the server's.
 * THREE CLAIMS: construction (these components); demonstrated operation is the act's (SYNTHETIC); real acceptance — never claimed.
 */
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { coverageGaps, type AuthorizationView, type GapView, type VersionView } from '../lib/acquisition-b40';
import { acquisitionApi, type Scope } from '../lib/acquisition-api-b40';
import { DefinitionList } from './data';
import { Empty, Mono, cardStyle } from './observation';
import { ErrorNote } from './ui';

type Problem = { code: string; message: string; correlationId: string };
const h3 = { fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 } as const;
const STATE_GLYPH: Readonly<Record<GapView['state'], string>> = { holding: '◐', open: '○', resolved: '●' };

/* ───────────────────────── AcquisitionDeclaration ───────────────────────── */
export function AcquisitionDeclaration({ version }: { version: VersionView }) {
  const id = useId();
  return (
    <section style={cardStyle} aria-labelledby={id}>
      <h3 id={id} style={h3}>Contract version {version.contractVersion} — {version.schema}</h3>
      <p className="eye-ev-note">{version.lifecycle} · rights {version.rights} · {version.mode} · residency {version.residency}
        {version.credentialRef === null ? ' · no credential named' : <> · credential by reference <Mono>{version.credentialRef}</Mono></>}</p>
      <p className="eye-ev-note">{version.statement}</p>
      {version.declared ? <DefinitionList label={`The acquisition policy of contract version ${version.contractVersion}`} items={version.lines.map((l) => ({ term: l.term, value: l.value }))} /> : null}
    </section>
  );
}

/* ───────────────────────── CoverageGapList ───────────────────────── */
export function CoverageGapList({ gaps, label }: { gaps: GapView[]; label: string }) {
  if (gaps.length === 0) return <p className="eye-ev-note">No rate-limited interval or incomplete range is recorded for this source.</p>;
  return (
    <div className="eye-ev-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="eye-table">
        <caption>{label} — newest first; each gap is an explicit interval with its cause and state</caption>
        <thead><tr>{['State', 'From', 'To', 'Cause', 'The contract\'s backoff', 'Detail'].map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
        <tbody>{gaps.map((g) => (
          <tr key={`${g.kind}:${g.id}`}>
            <th scope="row"><span aria-hidden="true">{STATE_GLYPH[g.state]} </span>{g.stateWords}</th>
            <td>{g.from}</td><td>{g.to}</td><td>{g.cause}</td><td>{g.backoff ?? 'not applicable — a stream range'}</td><td>{g.detail}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── AuthorizationLedger ───────────────────────── */
export function AuthorizationLedger({ rows }: { rows: AuthorizationView[] }) {
  if (rows.length === 0) return <p className="eye-ev-note">No run of an SRC@v4 contract version of this source has been authorized yet; earlier versions record none (not recorded before SRC@v4).</p>;
  return (
    <ol className="eye-ev-lines" aria-label="The acquisition authorizations, newest first">
      {rows.map((a) => (
        <li key={a.id}>
          <p><strong>{a.decisionWords}</strong> · contract version {a.contractVersion} · {a.form} run <Mono>{a.runId}</Mono> · {a.decidedAt}</p>
          <p className="eye-ev-note">{a.reason}</p>
          <DefinitionList label={`The verdicts of authorization ${a.id}`} items={a.verdicts.map((v) => ({ term: v.facet, value: v.words }))} />
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── RobotsCacheList ───────────────────────── */
export function RobotsCacheList({ rows }: { rows: Array<{ contractVersion: number; origin: string; outcome: string; groups: number; via: string; fetchedAt: string; detail: string }> }) {
  if (rows.length === 0) return <p className="eye-ev-note">robots.txt has not been fetched for this source (a contract that declares robots not applicable never fetches it).</p>;
  return (
    <div className="eye-ev-scroll" role="region" aria-label="The robots.txt fetches of this source" tabIndex={0}>
      <table className="eye-table">
        <caption>robots.txt per contract version and origin — parsed groups only, never the text; an unavailable fetch is never served as the cache</caption>
        <thead><tr>{['Contract version', 'Origin', 'Outcome', 'Groups', 'Fetched', 'At', 'Detail'].map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={`${r.origin}:${r.fetchedAt}:${i}`}>
            <th scope="row">v{r.contractVersion}</th><td><Mono>{r.origin}</Mono></td><td>{r.outcome}</td><td>{String(r.groups)}</td><td>{r.via}</td><td>{r.fetchedAt}</td><td>{r.detail}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── CoverageGapPanel (mounted by the source page at the fold) ───────────────────────── */
export function CoverageGapPanel({ scope, sourceId }: { scope: Scope; sourceId: string }) {
  const id = useId();
  const [state, setState] = useState<{ kind: 'reading' } | { kind: 'refused'; problem: Problem } | { kind: 'ready'; gaps: ReturnType<typeof coverageGaps> }>({ kind: 'reading' });
  useEffect(() => {
    let live = true;
    void acquisitionApi.read(scope, sourceId).then((r) => {
      if (!live) return;
      if (!r.ok || r.data === undefined) setState({ kind: 'refused', problem: r.error ?? { code: `HTTP ${r.status}`, message: 'The coverage gaps were not read; open the acquisition page to read them again.', correlationId: '' } });
      else setState({ kind: 'ready', gaps: coverageGaps(r.data.acquisition) });
    });
    return () => { live = false; };
  }, [scope, sourceId]);
  return (
    <section style={cardStyle} aria-labelledby={id}>
      <h3 id={id} style={h3}>Coverage gaps — rate-limited and incomplete intervals</h3>
      {state.kind === 'reading' ? <Empty>Reading the recorded gaps of this source…</Empty>
        : state.kind === 'refused' ? <ErrorNote error={state.problem} />
        : (
          <>
            <p className="eye-ev-note">{state.gaps.statement}</p>
            <CoverageGapList gaps={state.gaps.gaps.slice(0, 5)} label="The latest coverage gaps of this source" />
          </>
        )}
      <p><Link href={`/observation/sources/${sourceId}/acquisition`}>Open the acquisition policy of this source</Link></p>
    </section>
  );
}
