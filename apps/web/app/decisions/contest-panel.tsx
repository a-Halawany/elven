'use client';
/**
 * CP-6 B81 §HA-R (HX-14) — the CONTEST PATH on one decision-active subject, composed from the library's ContestPath (components/authority.tsx;
 * never forked): the B36 challenges on a package version (its gate record) and the B35 appeal cases on the subject (the appeals list, matched
 * by the subject's id), in the six fields — challenge, evidence, reviewer, status, escalation, outcome — with the deep link that opens the
 * appeal form on this subject. A read the person's roles do not admit is not made (courtesy — the server decides every read) and is SAID;
 * a refused read is shown in the server's words. It acts on nothing itself. Records shown in tests are SYNTHETIC.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContestPath } from '../../components/authority';
import { contestPathFor, contestRows } from '../../lib/authority-b81';
import { appealsOn, contestHref, mayRead } from '../../lib/authority-har-b81';
import { explanationB35, type AppealCase } from '../../lib/explanation-b35';
import { gatesB36 } from '../../lib/gates-b36';
import type { Scope } from '../../lib/observation';

type Row = Record<string, unknown>;
const said = (r: { status: number; error?: { message: string } }, what: string) => `${what} not read — HTTP ${r.status}: ${r.error?.message ?? 'no answer'}`;

export function SubjectContest({ scope, roles, type, appealKind, subjectId, explanation, challenges, cases }: {
  scope: Scope; /** the person's role codes in this domain */ roles: readonly string[];
  /** the contest registry's type (lib/authority-b81 CONTEST_PATHS) and the B35 appeal subject kind */ type: string; appealKind: string; subjectId: string;
  /** the explanations page's subject (its kind, and the version for a package) — the deep link to open an appeal */ explanation: { kind: string; version: number | null };
  /** the B36 challenges: read from the package version's gate record, or given (with what they are), or none for a subject that has none */
  challenges?: { packageId: string; version: number } | { rows: Row[]; note: string } | null;
  /** the appeal cases when the page reads them once for many subjects: the cases, what stopped the read, or 'loading' (no read here) */
  cases?: readonly AppealCase[] | { note: string } | 'loading';
}) {
  const route = contestPathFor(type);
  const [chRows, setChRows] = useState<Row[]>([]);
  const [apRows, setApRows] = useState<AppealCase[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const gateKey = challenges !== undefined && challenges !== null && 'packageId' in challenges ? `${challenges.packageId}:${challenges.version}` : '';
  useEffect(() => {
    let live = true;
    void (async () => {
      const n: string[] = [];
      let ch: Row[] = [];
      if (challenges !== undefined && challenges !== null) {
        if ('rows' in challenges) { ch = challenges.rows; n.push(challenges.note); }
        else if (!mayRead('decision.read', roles)) n.push('the challenges on this version are in the gate record, which your roles here do not read (decision.read)');
        else {
          const r = await gatesB36.record(scope, challenges.packageId, challenges.version);
          if (r.ok && r.data !== undefined) ch = r.data.record.challenges; else n.push(said(r, 'the challenges'));
        }
      }
      let ap: AppealCase[] = [];
      if (cases === 'loading') { /* the page is reading them */ }
      else if (cases !== undefined && 'note' in cases) n.push(cases.note);
      else if (cases !== undefined) ap = appealsOn(cases, appealKind, subjectId);
      else if (!mayRead('decision.appeal.read', roles)) n.push('the appeal cases are not in your reading roles here (decision.appeal.read) — the appeal form is on the explanations page (the server decides who may open one)');
      else {
        const r = await explanationB35.appeals(scope, { subjectKind: appealKind });
        if (r.ok && r.data !== undefined) ap = appealsOn(r.data.cases, appealKind, subjectId); else n.push(said(r, 'the appeal cases'));
      }
      if (live) { setChRows(ch); setApRows(ap); setNotes(n); }
    })();
    return () => { live = false; };
  }, [scope.tenantId, scope.domainId, type, appealKind, subjectId, gateKey, cases]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ContestPath route={route} rows={contestRows(chRows, apRows as unknown as Row[])}>
      {notes.length === 0 ? null : <ul className="eye-authority-list" aria-label="what the contest path could not read">{notes.map((x) => <li key={x}>{x}</li>)}</ul>}
      <p className="eye-authority-small"><Link href={contestHref(explanation.kind, subjectId, explanation.version)}>Open an appeal on this {route?.label ?? 'subject'}</Link> — the appeal form, with your grounds and evidence, on the explanations page.</p>
    </ContestPath>
  );
}
