'use client';
/**
 * CP-6 B50 — THE KNOWLEDGE-CORE COMPONENTS of the shared library (one file; B107's inventory reads `^apps/web/components/[^/]+\.tsx$`). Each part
 * of B50 writes ONLY its own marked block (`/* B50 <part> *\/ … /* end B50 <part> *\/`) and exports the names lib/b50-seams.ts LIBRARY_B50
 * declares for it; the blocks are folded at integration. They render what the parts' pure models decide; they call no port; every
 * consequential act stays behind its page's Command Review. They arrive `proposed` (the DSA approves them in the act). Tokens only; logical
 * properties (RTL mirrors); state is never colour alone (a glyph and a word). CONSTRUCTION — the walk demonstrates; nothing here is accepted.
 */

/* B50 lc */
/* §LC (F-P3-02: PR-06-002/005, ADR-006) — the work-object lifecycle:
 *   LifecycleHistory       every recorded version (its LS state read through the server's profile) and every ATTEMPTED transition — accepted,
 *                          REJECTED (in the server's words; the attempt kept with the last authoritative version) or COMPENSATED — oldest first,
 *                          with the replay link of each version's instant. Nothing is hidden: a refused attempt is a row, not a toast.
 *   TransitionOutcomeNote  the answer to the last act in words (role=status): what was written, or that it was refused and kept, or that a
 *                          repeat answered its first result. Never optimistic: it renders the server's answer only. */
import Link from 'next/link';
import { Timestamp } from './text';
import { attemptRows, attemptWords, lifecycleFromProfile, replayInstants, type ServerProfile } from '../lib/lifecycle-b50';

type LcRow = Record<string, unknown>;
const OUTCOME_MARK: Readonly<Record<string, { glyph: string; word: string }>> = {
  accepted: { glyph: '✓', word: 'Accepted' }, rejected: { glyph: '⊘', word: 'Rejected — kept' }, compensated: { glyph: '↺', word: 'Compensated' },
};

export function LifecycleHistory({ type, id, profile, versions, transitions, caption }: {
  type: string; id: string; profile: ServerProfile | null; versions: readonly LcRow[]; transitions: readonly LcRow[];
  /** the table's caption (default: the lifecycle of the object) */ caption?: string;
}) {
  const instants = replayInstants(versions, type, id);
  const attempts = attemptRows(transitions);
  return (
    <section className="eye-lifecycle-history" aria-label="Lifecycle history">
      <table className="eye-table">
        <caption>{caption ?? 'Recorded versions — each opens the state recorded at its instant'}</caption>
        <thead><tr><th scope="col">Version</th><th scope="col">Lifecycle</th><th scope="col">Recorded</th><th scope="col">Replay</th></tr></thead>
        <tbody>
          {instants.map((v) => {
            const r = lifecycleFromProfile(profile, v.state);
            return (
              <tr key={v.version}>
                <td>v{v.version}</td>
                <td><span aria-hidden="true">{r.glyph}</span> {r.label}{r.code === null ? null : ` (${r.code})`}{r.serverState !== null && r.serverState !== r.label.toLowerCase() ? <span className="eye-help"> · server state <bdi className="eye-mono">{r.serverState}</bdi></span> : null}</td>
                <td><Timestamp value={v.at} /></td>
                <td><Link href={v.href}>Open the state at v{v.version}</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="eye-table">
        <caption>Every attempted transition, oldest first — a refused attempt is kept with the version that stayed authoritative</caption>
        <thead><tr><th scope="col">Outcome</th><th scope="col">Transition</th><th scope="col">By</th><th scope="col">Recorded</th></tr></thead>
        <tbody>
          {attempts.length === 0 ? <tr><td colSpan={4}>No transition is recorded for this object (it is moved by its own module&apos;s port).</td></tr> : attempts.map((a) => {
            const m = OUTCOME_MARK[a.outcome] ?? { glyph: '·', word: a.outcome };
            return (
              <tr key={a.id} data-outcome={a.outcome}>
                <td><span aria-hidden="true">{m.glyph}</span> {m.word}{a.kind === 'forward' ? null : <span className="eye-help"> ({a.kind.replace(/_/g, ' ')})</span>}</td>
                <td>{a.words}</td>
                <td><bdi dir="ltr" className="eye-mono-wrap">{a.by.slice(0, 8)}…</bdi></td>
                <td><Timestamp value={a.at} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function TransitionOutcomeNote({ outcome, problem }: { outcome: LcRow | null; /** a refusal in the server's words (the attempt is kept when the port recorded it) */ problem?: string | null }) {
  if (problem !== undefined && problem !== null) {
    return <p role="alert" className="eye-authority-critical"><strong>Not done.</strong> {problem} The attempt is kept in the record below when the server recorded it; read it, then decide again.</p>;
  }
  if (outcome === null) return null;
  const refusal = (outcome['refusal'] ?? null) as LcRow | null;
  const words = attemptWords({
    outcome: String(outcome['outcome']) as 'accepted' | 'rejected' | 'compensated', from: (outcome['from'] as string | null) ?? null, to: (outcome['to'] as string | null) ?? null,
    objectVersion: outcome['object_version'] === null || outcome['object_version'] === undefined ? null : Number(outcome['object_version']),
    lastAuthoritativeVersion: Number(outcome['last_authoritative_version'] ?? 0), attemptedAction: String(outcome['attempted_action'] ?? outcome['action'] ?? 'the act'),
    refusal: refusal === null ? null : { class: String(refusal['class']), message: String(refusal['message']) }, repeated: outcome['repeated'] === true,
  });
  return <p role="status" className="eye-shell-meta">{words}</p>;
}
/* end B50 lc */
