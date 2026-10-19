'use client';
/**
 * CP-6 B50 §LC — THE LIFECYCLE REGISTER (F-P3-02: PR-06-002, CAP-AU-07, ADR-006; F-P3-01: V04-T-006): every canonical type's declared lifecycle
 * (its states, each mapped to the canonical word and B81's catalogue code, its transitions with their actor class, kind and separation, and
 * the port that owns it — a module-owned type keeps its own), and the domain's RECONCILIATION: every object whose module state and canonical
 * record disagree, every work-object version written outside the lifecycle ledger, listed with its reason — never resolved silently.
 * This page reads only.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { CANONICAL_LS, lifecycle, type ServerProfile } from '../../../lib/lifecycle-b50';
import { ErrorNote, Receipt } from '../../../components/ui';
import { Empty, GovernedButton } from '../../../components/observation';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;

export default function LifecycleRegisterPage() {
  const { scope } = useShell();
  const [profiles, setProfiles] = useState<ServerProfile[] | null>(null);
  const [rec, setRec] = useState<Row | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [err, setErr] = useState<Err>(null);
  const load = useCallback(async () => {
    const p = await lifecycle.profiles(scope);
    if (!p.ok || p.data === undefined) { setErr(p.error ?? null); return; }
    setProfiles(p.data.profiles); setReceipt(p.data.receipt); setErr(null);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const code = (word: string) => { const m = CANONICAL_LS[word]; return typeof m === 'string' ? m : 'no catalogue code'; };
  return (
    <>
      <h1>Lifecycle register</h1>
      <p className="eye-help">One work-object lifecycle (draft, reviewed, approved, published, corrected, withdrawn, archived, retired). Each type declares how its own states map onto it and which port moves it; assessments move through it here, every other type keeps its own port.</p>
      {err === null ? null : <ErrorNote error={err} />}
      {receipt === null ? null : <Receipt receipt={receipt} />}
      {profiles === null && err === null ? <Empty>reading the profiles…</Empty> : null}
      {profiles?.map((p) => (
        <section key={p.object_type} aria-labelledby={`lc-${p.object_type}`}>
          <h2 id={`lc-${p.object_type}`}>{p.object_type} — profile v{p.version}</h2>
          <p>{p.description} <span className="eye-help">Moved by <code>{p.owning_port}</code>{p.schema_ref === null ? '' : ` (the ${p.schema_ref} form)`}; its state is read from {p.module_read}.</span></p>
          <table className="eye-table">
            <caption>{p.object_type}: its states and their canonical reading</caption>
            <thead><tr><th scope="col">Its state</th><th scope="col">Canonical word</th><th scope="col">Catalogue</th></tr></thead>
            <tbody>{p.states.map((s) => <tr key={s}><td><bdi className="eye-mono">{s}</bdi></td><td>{p.canonical_map[s] ?? '—'}</td><td>{code(p.canonical_map[s] ?? '')}</td></tr>)}</tbody>
          </table>
          <ul className="eye-help" aria-label={`${p.object_type} transitions`}>
            {p.transitions.map((t) => <li key={t.action}>{t.action}: {t.from.join(', ') || 'new'} → {t.to} · the {t.actor}{(t.separation ?? []).length === 0 ? '' : `, never the ${(t.separation ?? []).join(' or the ')}`}{t.kind === 'forward' ? '' : ` · ${t.kind.replace(/_/g, ' ')}${(t.reentry_reasons ?? []).length === 0 ? '' : ` (${(t.reentry_reasons ?? []).join(', ')})`}`}</li>)}
          </ul>
        </section>
      ))}

      <section aria-labelledby="rec-h">
        <h2 id="rec-h">Reconciliation of this domain</h2>
        <p className="eye-help">Reading the reconciliation changes nothing: a disagreement is resolved by a person on the owning port.</p>
        <GovernedButton label="Read the reconciliation" pendingLabel="reading…" variant="quiet"
          onRun={async () => {
            const r = await lifecycle.reconcile(scope);
            if (!r.ok || r.data === undefined) { setErr(r.error ?? null); return; }
            setRec(r.data.reconciliation); setReceipt(r.data.receipt);
          }} />
        {rec === null ? null : (
          <>
            <p role="status">{Number(rec['total_disagreements'] ?? 0) === 0 ? 'No disagreement: every profiled object\'s lifecycle agrees with its record.' : `${String(rec['total_disagreements'])} disagreement(s) — the first 200 below.`}</p>
            <table className="eye-table">
              <caption>Objects whose lifecycle does not agree with their record</caption>
              <thead><tr><th scope="col">Object</th><th scope="col">Canonical record</th><th scope="col">Module / ledger</th><th scope="col">Why</th></tr></thead>
              <tbody>{((rec['disagreements'] ?? []) as Row[]).map((d) => (
                <tr key={`${String(d['object_type'])}-${String(d['object_id'])}`}>
                  <td>{d['object_type'] === 'ASM' ? <Link href={`/graph/lifecycle/ASM/${String(d['object_id'])}`}>{String(d['object_type'])} {String(d['object_id']).slice(0, 8)}…</Link> : `${String(d['object_type'])} ${String(d['object_id']).slice(0, 8)}…`}</td>
                  <td>v{String(d['version'])} {String(d['canonical_state'])}</td>
                  <td>{String(d['module_state'] ?? d['ledger_state'] ?? '—')}</td>
                  <td>{String(d['problem'])}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </section>
    </>
  );
}
