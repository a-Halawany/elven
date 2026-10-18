'use client';
/**
 * THE RECOVERY COMPONENTS — B81 §DG (F-P7-E-19: CMP-071 the degraded banner's contract, CMP-072 RecoveryPanel, PAT-22 ResidualState, PAT-29
 * PartialResult, PAT-32 StaleDeclaration, V00-T-106 FailureState, HX-16 / UX-ADR-018 / CNT-12 the degraded contract). Each renders what
 * lib/degraded-b81.ts decides; none decides anything itself.
 *
 *   · DegradedBanner (ui.tsx — a B107 inventory key) is COMPOSED, never edited: DegradedContractView renders it above the contracts in force.
 *   · A degraded state is persistent until the owner records the exit evidence (the server's mode `awaiting_exit` stays shown and in force).
 *   · A tone is a glyph + an UPPERCASE word + a token colour (B80's InlineMessage classes) — never colour alone; a stale or partial result is
 *     NEVER styled as current or complete; a residual state never implies rollback; a refusal is shown in the server's words.
 *   · Lists are semantic (dl / ul), headings are real headings, the live regions are polite (status) except a critical message (alert).
 *     Logical properties only (RTL mirrors); forced-colors and 200% zoom keep the B80 classes' handling.
 */
import type { ReactNode } from 'react';
import type { Audience } from '../lib/b81-seams';
import {
  bannerOf, contractLines, copy, failureOf, modeView, partialText, staleOfSource, undeclaredLines,
  type ContractState, type DegradedState, type FailureKind, type PartialDeclaration, type RecoveryModel, type ResidualView, type StaleView,
} from '../lib/degraded-b81';
import { DegradedBanner } from './ui';
import { InlineMessage } from './feedback';
import { Digest, Timestamp } from './text';

const toneClass = (tone: 'critical' | 'warning' | 'unknown' | 'info') => `eye-message eye-message--${tone}`;

function Row({ term, children }: { term: string; children: ReactNode }) {
  return <div className="eye-dl-row"><dt>{term}</dt><dd>{children}</dd></div>;
}
function Lines({ items }: { items: string[] }) {
  return items.length === 1 ? <>{items[0]}</> : <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** ONE contract (HX-16): available / unavailable / limitations / owner / duration / exit — each always said; the mode in words. */
function ContractCard({ c }: { c: ContractState }) {
  const v = modeView(c); const l = contractLines(c);
  const headingId = `eye-dg-${c.contract_id}`;
  return (
    <section className={toneClass(v.tone)} role={v.tone === 'critical' ? 'alert' : 'status'} aria-labelledby={headingId}>
      <h3 id={headingId} style={{ marginBlock: 0, fontSize: 'var(--eye-type-heading-3)' }}>{v.glyph} {v.word} — {v.headline}</h3>
      <p className="eye-help">{c.signal.reason}{l.since !== null ? <> (since <Timestamp value={l.since} />)</> : null}</p>
      <dl className="eye-dl">
        <Row term={copy('b81.dg.contract.available')}><Lines items={l.available} /></Row>
        <Row term={copy('b81.dg.contract.unavailable')}><Lines items={l.unavailable} /></Row>
        <Row term={copy('b81.dg.contract.limitations')}><Lines items={l.limitations} /></Row>
        <Row term={copy('b81.dg.contract.owner')}>{l.owner}</Row>
        <Row term={copy('b81.dg.contract.duration')}>{l.duration}</Row>
        <Row term={copy('b81.dg.contract.exit')}>{l.exit}</Row>
      </dl>
      {v.persistent && <p className="eye-help">{copy('b81.dg.contract.persistent')}</p>}
      <p className="eye-help">Degraded contract v{c.version} · declared by {c.declared_by.name ?? c.declared_by.principal_id} · <Timestamp value={c.declared_at} />
        {c.last_exit !== null && <> · last verified exit <Timestamp value={c.last_exit.recorded_at} /> by {c.last_exit.recorded_by.name ?? c.last_exit.recorded_by.principal_id}</>}</p>
    </section>
  );
}

/**
 * CMP-071 / HX-16 — the degraded banner WITH its contracts: DegradedBanner (B107's key, composed) when anything is in force, undeclared, or
 * /readyz reports degraded; under it every contract in force (active or awaiting its exit) and every undeclared degraded dependency.
 * `showNormal` adds the contracts not in force (the contract page).
 */
export function DegradedContractView({ state, readyzDegraded, showNormal }: { state: DegradedState | null; readyzDegraded?: boolean; showNormal?: boolean }) {
  const b = bannerOf(state, readyzDegraded === true);
  const contracts = (state?.contracts ?? []).filter((c) => showNormal === true || c.in_force || c.mode === 'unknown');
  const undeclared = state?.undeclared ?? [];
  if (!b.visible && contracts.length === 0) return null;
  return (
    <div className="eye-stack" aria-label={copy('b81.dg.banner.title')}>
      <DegradedBanner visible={b.visible} detail={b.detail} />
      {contracts.map((c) => <ContractCard key={c.contract_id} c={c} />)}
      {undeclared.map((u) => {
        const l = undeclaredLines(u);
        return (
          <InlineMessage key={`${u.dependency.kind}:${u.dependency.key}`} tone="critical" title={copy('b81.dg.undeclared.title')}>
            <p>{l.headline}</p><p className="eye-help">{l.reason}</p><p className="eye-help">{l.unknowns}</p>
          </InlineMessage>
        );
      })}
    </div>
  );
}

/** PAT-32 — a stale declaration: source revision, watermark, age, threshold, refresh path. Never current-styled (a warning surface, always). */
export function StaleDeclaration({ view, signal, label }: { view?: StaleView | null; signal?: ContractState['signal'] | null; label?: string }) {
  const v = view ?? (signal ? staleOfSource(signal) : null);
  if (v === null || !v.stale) return null;
  return (
    <section className={toneClass('warning')} role="status" aria-label={`${copy('b81.dg.stale.title')}${label ? ` — ${label}` : ''}`}>
      <strong>◷ STALE{label ? ` — ${label}` : ''}</strong> <span className="eye-help">({copy('b81.dg.stale.title')}; not current)</span>
      <dl className="eye-dl">
        {v.revision !== null && <Row term="Source revision">{v.revision}</Row>}
        <Row term="Watermark">{v.watermark === null ? 'none recorded' : <Timestamp value={v.watermark} />} <span className="eye-help">({v.watermarkBasis})</span></Row>
        <Row term="Age">{v.age}{v.threshold !== null ? ` (threshold ${v.threshold})` : ''}</Row>
        <Row term={copy('b81.dg.stale.refresh')}>{v.refreshPath}</Row>
      </dl>
      <p className="eye-help">{v.reason}</p>
    </section>
  );
}

/** PAT-29 — a partial result: missing sources, intervals, filters, bounds, withdrawn partitions, impact. Never complete-styled; nothing when complete. */
export function PartialResult({ declaration }: { declaration: PartialDeclaration }) {
  const p = partialText(declaration);
  if (p === null) return null;
  return (
    <InlineMessage tone="warning" title={p.title}>
      <ul>{p.lines.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </InlineMessage>
  );
}

/** PAT-22 — a cancellation's residual state: new work stopped; completed effects stay recorded and are NOT rolled back. */
export function ResidualState({ residual }: { residual: ResidualView | null }) {
  if (residual === null) return null;
  return (
    <section className={toneClass('warning')} role="status" aria-label={copy('b81.dg.residual.title')}>
      <strong>⊘ {residual.summary}</strong>
      <ul>{residual.effects.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {residual.outputsDigest !== null && <p className="eye-help">Outputs digest <Digest value={residual.outputsDigest} /></p>}
      {residual.reason !== null && <p className="eye-help">Reason given: {residual.reason}</p>}
    </section>
  );
}

/** V00-T-106 — a failure state in the reader's words (executive / analyst / operator), naming the read that evaluates it or that none does. */
export function FailureState({ kind, audience, detail }: { kind: FailureKind; audience: Audience; detail?: string | null }) {
  const f = failureOf(kind, audience, detail);
  return (
    <InlineMessage tone={kind === 'policy_denial' ? 'critical' : kind === 'unknown_outcome' ? 'unknown' : 'warning'} title={f.title}>
      <p>{f.body}</p><p className="eye-help">{f.read}</p><p className="eye-help">{f.next}</p>
    </InlineMessage>
  );
}

/**
 * CMP-072 — the recovery panel: what happened, what is preserved, the residual effects, the safe next steps (retry with the same command
 * identity, check first, reload, correct, return to the last verified location). A step is a link or the caller's handler; a disabled step
 * carries its reason. The panel itself executes nothing.
 */
export function RecoveryPanel({ model, onStep }: { model: RecoveryModel | null; onStep?: (kind: RecoveryModel['steps'][number]['kind']) => void }) {
  if (model === null) return null;
  return (
    <section className="eye-panel" aria-label={copy('b81.dg.recovery.title')}>
      <h3 className="eye-panel-title">{copy('b81.dg.recovery.title')}</h3>
      <p role="status">{model.happened}</p>
      <dl className="eye-dl">
        <Row term={copy('b81.dg.recovery.preserved')}><Lines items={model.preserved} /></Row>
        <Row term={copy('b81.dg.recovery.residual')}><Lines items={model.residual} /></Row>
      </dl>
      {model.steps.length > 0 && (
        <nav aria-label={copy('b81.dg.recovery.next')}>
          <ul className="eye-panel-actions" style={{ listStyle: 'none', paddingInlineStart: 0, display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)' }}>
            {model.steps.map((s, i) => (
              <li key={i}>
                {s.href !== undefined
                  ? <a className="eye-button eye-button--secondary eye-button--sm" href={s.href}>{s.label}</a>
                  : <button type="button" className="eye-button eye-button--secondary eye-button--sm" disabled={s.disabled === true}
                      aria-describedby={s.disabled === true && s.reason ? `eye-dg-step-${i}` : undefined} onClick={() => onStep?.(s.kind)}>{s.label}</button>}
                {s.disabled === true && s.reason ? <span id={`eye-dg-step-${i}`} className="eye-help"> — unavailable: {s.reason}</span> : null}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
