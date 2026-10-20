'use client';
/**
 * CP-6 B81 §DG — THE DEGRADED DEPENDENCIES ON A CORRIDOR VIEW (HX-16, PAT-32; the act's scene 2: "every corridor view shows the
 * StaleDeclaration and the contract naming the owner"). The rehearsal of the B81 act found the library's DegradedContractView and
 * StaleDeclaration mounted on no page: this places them on the operations room and the warning page, reading the domain's degraded state
 * through the EXISTING governed read (`shell.degraded.read` — the server evaluates every signal by the database clock; nothing here decides
 * anything). A refused read is said in the server's words; a healthy domain renders nothing.
 */
import { useEffect, useState } from 'react';
import { DegradedContractView, StaleDeclaration } from '../../../components/recovery';
import { degraded, dependencyLabel, type DegradedState } from '../../../lib/degraded-b81';

export function DegradedDependencies({ scope, purpose }: { scope: { tenantId: string; domainId: string }; purpose: string }) {
  const [state, setState] = useState<DegradedState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void degraded.state(scope, purpose).then((r) => {
      if (!live) return;
      if (r.ok && r.data !== undefined) { setState(r.data.degraded); setProblem(null); }
      else setProblem(`The degraded state could not be read: HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'no answer'}`);
    });
    return () => { live = false; };
  }, [scope, purpose]);
  if (problem !== null) return <p role="status" className="eye-help">{problem}</p>;
  if (state === null) return null;
  const stale = [...state.contracts.filter((c) => c.in_force).map((c) => ({ key: `c:${c.contract_id}`, dep: c.dependency, signal: c.signal })),
    ...state.undeclared.map((u) => ({ key: `u:${u.dependency.kind}:${u.dependency.key}`, dep: u.dependency, signal: u.signal }))]
    .filter((x) => x.dep.kind === 'source');
  return (
    <>
      <DegradedContractView state={state} />
      {stale.map((x) => <StaleDeclaration key={x.key} signal={x.signal} label={dependencyLabel(x.dep)} />)}
    </>
  );
}
