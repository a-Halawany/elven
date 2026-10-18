'use client';
/**
 * WS-19 shared components — semantic token variables only (UX-ADR-010),
 * logical CSS properties (RTL-safe), three-channel state display
 * (color + UPPERCASE label + symbol — Vol 9 TS-01…TS-10, HX-02).
 */
import type { CSSProperties, ReactNode } from 'react';
/* B80 clf */ import * as LIBRARY_STYLES from '../lib/styles-b80'; /* end B80 clf */
/* B81 ob */ import { lifecycleOf } from '../lib/object-b81'; /* end B81 ob */

const TRUTH_SYMBOLS: Record<string, string> = {
  observed: '●', asserted: '▢', extracted: '⌕', inferred: '⧉', assessed: '◇',
  synthetic: '⬡', decided: '☑', disputed: '⚑', withdrawn: '⊘',
};

export function TruthBadge({ state }: { state: string }) {
  const token = `--eye-color-${state in TRUTH_SYMBOLS ? state : 'uncertain'}`;
  return (
    <span
      style={{
        color: `var(${token})`,
        border: `1px solid var(${token})`,
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
      aria-label={`truth state ${state}`}
    >
      {TRUTH_SYMBOLS[state] ?? '?'} {state.toUpperCase()}
    </span>
  );
}

/* B81 ob — a B107 CONTRIBUTION to `web.ui.lifecycle-badge` (CMP-020; the act records it through B107's contribution queue, proposer ≠ DSA):
   the badge is bound to the LS-01…12 catalogue (lib/object-b81.ts) — the LS glyph and title-case label with its definition, from the SERVER's
   own state word (never from a truth state); a word with no catalogue equivalent renders exactly as before. Props kept (`state`; `type` is an
   added OPTIONAL prop naming the object type whose map applies — the canonical object store's by default). */
export function LifecycleBadge({ state, type }: { state: string; type?: string }) {
  const ls = lifecycleOf(type ?? '', state);
  return (
    <span
      style={{
        color: 'var(--eye-color-ink-muted)',
        border: '1px solid var(--eye-color-border-default)',
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        textTransform: 'capitalize',
      }}
      title={ls.code === null ? undefined : `${ls.code} ${ls.label} — ${ls.definition}`}
      data-ls={ls.code ?? 'none'}
    >
      {ls.code === null ? state : <><span aria-hidden="true">{ls.glyph}</span> {ls.label}</>}
    </span>
  );
}
/* end B81 ob */

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--eye-color-surface-primary)',
        border: '1px solid var(--eye-color-border-default)',
        borderRadius: 'var(--eye-radius-lg)',
        padding: 'var(--eye-space-16)',
        marginBlockEnd: 'var(--eye-space-16)',
      }}
    >
      <h2 style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)', color: 'var(--eye-color-ink-strong)' }}>{title}</h2>
      {children}
    </section>
  );
}

export function ErrorNote({ error }: { error: { code: string; message: string; correlationId: string } | null }) {
  if (error === null) return null;
  return (
    <div
      role="alert"
      style={{
        color: 'var(--eye-color-critical)',
        border: '1px solid var(--eye-color-critical)',
        borderRadius: 'var(--eye-radius-md)',
        padding: 'var(--eye-space-8)',
        marginBlock: 'var(--eye-space-8)',
        fontSize: 'var(--eye-type-body-sm)',
      }}
    >
      <strong>{error.code}</strong> — {error.message}
      <div style={{ color: 'var(--eye-color-ink-muted)', fontFamily: 'var(--eye-font-mono)', fontSize: 'var(--eye-type-mono-sm)' }}>
        correlation: {error.correlationId}
      </div>
    </div>
  );
}

/** Immutable receipt (PAT-19): rendered only from the authoritative response. */
export function Receipt({ receipt }: { receipt: { policyDecisionId: string; auditSeq: number } | null }) {
  if (receipt === null) return null;
  return (
    <div
      style={{
        color: 'var(--eye-color-success)',
        fontFamily: 'var(--eye-font-mono)',
        fontSize: 'var(--eye-type-mono-sm)',
        marginBlock: 'var(--eye-space-8)',
      }}
    >
      ✓ committed — POL {receipt.policyDecisionId.slice(0, 13)}… · audit seq {receipt.auditSeq}
    </div>
  );
}

export function DegradedBanner({ visible, detail }: { visible: boolean; detail: string }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      style={{
        background: 'var(--eye-color-degraded)',
        color: 'var(--eye-color-canvas)',
        padding: 'var(--eye-space-8) var(--eye-space-16)',
        fontWeight: 600,
      }}
    >
      DEGRADED — {detail}. New consequential actions are constrained (fail closed).
    </div>
  );
}

export const inputStyle: CSSProperties = LIBRARY_STYLES.inputStyle; /* B80 clf: the library owns it (lib/styles-b80.ts; states in globals.css) */

export const buttonStyle: CSSProperties = LIBRARY_STYLES.buttonStyle; /* B80 clf: the library owns it (lib/styles-b80.ts; states in globals.css) */

export const tableStyle: CSSProperties = LIBRARY_STYLES.tableStyle; /* B80 clf: the library owns it (lib/styles-b80.ts; states in globals.css) */

export function Th({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'start',
        borderBlockEnd: '1px solid var(--eye-color-border-strong)',
        padding: 'var(--eye-space-4) var(--eye-space-8)',
        color: 'var(--eye-color-ink-muted)',
        fontSize: 'var(--eye-type-label-sm)',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </th>
  );
}

export function Td({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <td
      style={{
        borderBlockEnd: '1px solid var(--eye-color-border-default)',
        padding: 'var(--eye-space-4) var(--eye-space-8)',
        fontFamily: mono === true ? 'var(--eye-font-mono)' : undefined,
        fontSize: mono === true ? 'var(--eye-type-mono-sm)' : undefined,
      }}
    >
      {children}
    </td>
  );
}
