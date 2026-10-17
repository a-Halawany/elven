'use client';
/**
 * THE LOOP-STAGE HEADER — CP-6 B107 §DG (UX-02-001…005; F-P7-E-17), on B107's own pages. Observe → Understand → Predict → Simulate → Decide →
 * Learn as ONE loop: the current stage, the upstream evidence the handoff needs (a missing one is a BROKEN handoff — shown, the last
 * coherent state kept), the next governed action (never offered past a required review, evidence or human gate — the reason is shown), and
 * a deterministic return path. The model is lib/governance-dg-b107.ts `loopHeader` (pure, tested). The general context bar (objective,
 * horizon, scenario, classification, effective time on every surface) is B80's, not this header's.
 */
import Link from 'next/link';
import { loopHeader, type LoopInput } from '../lib/governance-dg-b107';

export function LoopStageHeader(props: LoopInput) {
  const h = loopHeader(props);
  return (
    <nav aria-label="strategic intelligence loop" data-testid="loop-stage" style={{
      border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)', marginBlockEnd: 'var(--eye-space-16)',
      background: 'var(--eye-color-surface-primary)',
    }}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', listStyle: 'none', margin: 0, padding: 0 }}>
        {h.stages.map((s) => (
          <li key={s.stage} aria-current={s.current ? 'step' : undefined} style={{
            paddingInline: 'var(--eye-space-8)', borderRadius: 'var(--eye-radius-sm)',
            border: s.current ? '2px solid var(--eye-color-accent-strong)' : '1px solid var(--eye-color-border-default)',
            color: s.current ? 'var(--eye-color-accent-strong)' : 'var(--eye-color-ink-muted)', fontWeight: s.current ? 650 : 400,
          }}>{s.current ? '● ' : ''}{s.stage}</li>
        ))}
      </ol>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', marginBlockStart: 'var(--eye-space-8)', color: 'var(--eye-color-ink-default)' }}>
        Upstream evidence: {props.upstream.length === 0 ? 'none required' : props.upstream.map((u) => `${u.present ? '●' : '⊘ MISSING'} ${u.label}`).join(' · ')}
      </div>
      {h.broken.length > 0 ? <div role="status" style={{ color: 'var(--eye-color-warning)', fontSize: 'var(--eye-type-label-sm)' }}>⚠ Broken handoff: {h.broken.join(', ')} — the last coherent loop state is kept.</div> : null}
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: h.next.allowed ? 'var(--eye-color-ink-default)' : 'var(--eye-color-ink-muted)' }}>
        Next governed action: <strong>{h.next.label}</strong>{h.next.allowed ? '' : ` — not yet: ${String(h.next.reason)}`}
      </div>
      {h.returnPath !== null ? <div style={{ fontSize: 'var(--eye-type-label-sm)' }}><Link href={h.returnPath}>↩ Return to where you came from</Link></div> : null}
    </nav>
  );
}
