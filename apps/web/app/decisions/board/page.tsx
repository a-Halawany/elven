'use client';
/**
 * The BOARD — the governing body's surface (CP-6 B36, 0094 §G8; F-P6-04 l4; PER-01).
 *
 * The board-class packages of the domain (reserved by an executive, 0090 §G6) as the server serves them: the title and the statement, the
 * uniform gate state (the same badge every gate wears), the board's charter and quorum, the live approvals against it, each approval with
 * its signature (VERIFIED as the server verified it) and "recused" where the member withdrew, the open challenge, the decision's
 * signatures after commitment. A board member decides a board-class package ONLY through the gate — approve or reject on the digest read,
 * or defer with a next review — each its own governed write (decision.board.<act>); a standard package is never theirs (the server refuses
 * it; the PDP admits the role no standard action). Every refusal is shown as the server states it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { gatesB36 as api, boardActsFor, type BoardPackage } from '../../../lib/gates-b36';
/* B81 ha: the ONE gate state, the signature receipts and the board act through the COMMAND REVIEW (the library's) */
import { CommandReview, GateStatus, SignatureReceipt } from '../../../components/authority';
import { consequenceStated, deferIntake, eligibility } from '../../../lib/authority-b81';
/* end B81 ha */
/* B81 har: the CONTEST PATH on each board decision (HX-14) */
import { rolesIn } from '../../../lib/authority-b81';
import { mayRead } from '../../../lib/authority-har-b81';
import { SubjectContest } from '../contest-panel';
/* end B81 har */
import { Empty, LiveStatus, Mono, cardStyle, fmtInstant } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const LABEL = { approve: 'Approve this digest', reject: 'Reject', defer: 'Defer with a next review' } as const;

function BoardCard({ p, onDone }: { p: BoardPackage; onDone: (receipt: ReceiptT) => void }) {
  const { scope, me, isBoardMember } = useShell();
  const [act, setAct] = useState<'approve' | 'reject' | 'defer'>('approve');
  const [rationale, setRationale] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  /* B81 ha */ const [conditions, setConditions] = useState(''); /* end B81 ha */
  const v = p.version;
  const acts = isBoardMember && v !== null ? boardActsFor(String(v['state']), p.own_approval, p.own_recusal) : [];
  const offered = acts.includes(act) ? act : acts[0];
  /* B81 ha: the defer's intake (the next review's owner is the deferring board member) */
  const deferBody = offered === 'defer' ? deferIntake({ rationale, nextReviewAt: nextReview, conditions: conditions.split('\n'), owner: '' }) : null;
  /* end B81 ha */
  return (
    <section aria-labelledby={`board-${p.package_id}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h2 id={`board-${p.package_id}`} style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>{p.title} <GateStatus gate={p.gate} /></h2>
      <p>{p.statement}</p>
      <p style={small}>{p.synthetic_state === true ? <strong style={critical}>SYNTHETIC DECISION — </strong> : null}reserved for <strong>{String(p.board?.['charter'] ?? 'the board')}</strong> · quorum {p.quorum} · {p.live_approvals} live approval(s) · package {p.state}{v !== null ? <> · version {String(v['version'])} {String(v['state'])}{v['version_digest'] ? <> · digest <Mono>{String(v['version_digest']).slice(0, 16)}…</Mono></> : null}</> : ' · no version yet'}{p.decided_at ? ` · decided ${fmtInstant(p.decided_at)}` : ''}</p>
      <ul style={small} aria-label="board approvals">
        {p.approvals.length === 0 ? <li>no approval yet</li> : p.approvals.map((a) => (
          <li key={String(a['approval_id'])}>{short(a['approver'])}: {String(a['decision'])}{a['live'] === true ? ' (live)' : a['revoked_at'] ? ' (voided)' : ' (not counted)'}{a['recused'] === true ? <strong style={critical}> — RECUSED</strong> : null}
            {(a['signatures'] as Row[]).map((s) => <span key={String(s['signature_id'])}> · <SignatureReceipt signature={s} command="decision.sign.approval" object={`board approval ${short(a['approval_id'])}`} role="board member" /></span>)}</li>
        ))}
      </ul>
      {(p.decision_signatures as Row[] | undefined)?.length ? <div style={small}><strong>The decision signed:</strong> {(p.decision_signatures as Row[]).map((s) => <span key={String(s['signature_id'])}> · <SignatureReceipt signature={s} command="decision.sign.decision" object={`decision on ${p.title}`} /></span>)}</div> : null}
      {p.open_challenge !== null ? <p style={small}><strong style={critical}>CHALLENGE OPEN</strong> by {short(p.open_challenge['challenger_principal_id'])}: {String(p.open_challenge['reason'])} — the commitment is held until the owner resolves it.</p> : null}
      {p.own_recusal ? <p style={small}>You recused from this version.</p> : p.own_approval !== null ? <p style={small}>Your standing decision: <strong>{p.own_approval}</strong>.</p> : null}
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      {offered !== undefined && v !== null ? (
        /* B81 ha: the board member's act through the COMMAND REVIEW — the exact digest, the stated consequence, eligibility; the defer with
           its conditions and the next review (PAT-08) */
        <CommandReview action={`decision.board.${offered}`} object={{ type: 'board decision', id: p.package_id, version: Number(v['version']), title: p.title, state: String(v['state']) }}
          digest={typeof v['version_digest'] === 'string' ? v['version_digest'] : null}
          eligibility={eligibility({ action: `decision.board.${offered}`, me: me.principalId, isHuman: true, roles: isBoardMember ? ['board_member'] : [], requiredRoles: ['board_member'] })}
          consequence={consequenceStated(`decision.board.${offered}`)}
          extraReasons={[...(rationale.trim().length < 8 ? ['state your rationale (8+ characters, recorded with your name)'] : []), ...(offered === 'defer' && rationale.trim().length >= 8 && typeof deferBody === 'string' ? [deferBody] : [])]}
          actionLabel={LABEL[offered]} pendingLabel="recording" variant={offered === 'reject' ? 'critical' : 'primary'} problem={problem}
          onRun={async () => {
            const payload: Row = offered === 'defer' && typeof deferBody === 'object' && deferBody !== null ? deferBody : { decision: offered, versionDigest: v['version_digest'], rationale };
            const r = await api.boardAct(scope, p.package_id, Number(v['version']), offered, payload);
            if (!r.ok || r.data === undefined) { setProblem(`${LABEL[offered]} refused — ${refusal(r, 'no answer')}`); throw new Error('refused'); }
            setProblem(null); setRationale(''); setConditions(''); onDone(r.data.receipt);
          }}>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
            <label htmlFor={`act-${p.package_id}`}>Board act (each its own recorded action, through the gate)</label>
            <select id={`act-${p.package_id}`} value={offered} onChange={(e) => setAct(e.target.value as typeof act)} style={inputStyle}>{acts.map((a) => <option key={a} value={a}>{LABEL[a]}</option>)}</select>
            <label htmlFor={`why-${p.package_id}`}>Rationale (8+ characters; recorded with your name)</label>
            <input id={`why-${p.package_id}`} style={{ ...inputStyle, inlineSize: '100%' }} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            {offered === 'defer' ? (<>
              <label htmlFor={`next-${p.package_id}`}>Next review</label><input id={`next-${p.package_id}`} type="datetime-local" style={inputStyle} value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
              <label htmlFor={`cond-${p.package_id}`}>Conditions for the next review (one per line, at least one)</label>
              <textarea id={`cond-${p.package_id}`} rows={3} style={{ ...inputStyle, inlineSize: '100%', blockSize: 'auto' }} value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </>) : null}
            <p style={small}>Signed in as <Mono>{me.principalId.slice(0, 8)}…</Mono>. A board member never decides a standard package; the server refuses it.</p>
          </div>
        </CommandReview>
        /* end B81 ha */
      ) : null}
      {/* B81 har: the CONTEST PATH (HX-14) — the challenges (the gate record's, or the board surface's open one where the gate record is not
          in the reader's roles) and the appeal cases on the package; an appeal opens on the explanations page */}
      {v === null ? null : (() => {
        const roles = rolesIn(me.bindings, scope);
        return <SubjectContest scope={scope} roles={roles} type="DPK" appealKind="package" subjectId={p.package_id} explanation={{ kind: 'package_version', version: Number(v['version']) }}
          challenges={mayRead('decision.read', roles) ? { packageId: p.package_id, version: Number(v['version']) }
            : { rows: p.open_challenge === null ? [] : [p.open_challenge], note: 'the board surface serves the OPEN challenge only — the full history is in the gate record, which your roles here do not read (decision.read)' }} />;
      })()}
      {/* end B81 har */}
    </section>
  );
}

export default function BoardPage() {
  const { scope } = useShell();
  const [rows, setRows] = useState<BoardPackage[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const load = async () => {
    const r = await api.board(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the board surface could not be read')); return; }
    setProblem(null); setRows(r.data.board);
  };
  useEffect(() => { void load(); }, [scope]);
  if (problem !== null) return <><h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Board</h1><LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus></>;
  if (rows === null) return <Empty>reading the board surface…</Empty>;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Board</h1>
      <p style={{ ...small, color: 'var(--eye-color-ink-muted)' }}>The decisions reserved for the governing body (PER-01): never overridden, never delegated, decided only through the gate at the board's quorum; the same gate-state badge every gate wears (ADR-003).</p>
      {rows.length === 0 ? <Empty>No decision is reserved for the board in this domain.</Empty> : rows.map((p) => <BoardCard key={p.package_id} p={p} onDone={(r) => { setReceipt(r); void load(); }} />)}
      <Receipt receipt={receipt} />
    </>
  );
}
