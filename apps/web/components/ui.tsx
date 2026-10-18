'use client';
/**
 * WS-19 shared components — semantic token variables only (UX-ADR-010),
 * logical CSS properties (RTL-safe), three-channel state display
 * (color + UPPERCASE label + symbol — Vol 9 TS-01…TS-10, HX-02).
 */
import type { CSSProperties, ReactNode } from 'react';
/* B80 clf */ import * as LIBRARY_STYLES from '../lib/styles-b80'; /* end B80 clf */
/* B81 re */ import { truthBadgeView } from '../lib/controls-b81'; /* end B81 re */

/* B81 re: TruthBadge's glyphs are the SYMBOL SET's (packages/tokens SYMBOLS via lib/controls-b81.ts truthBadgeView) — a contribution to
   web.ui.truth-badge through B107's queue; the props (state), the accessible name `truth state <state>` and the UPPERCASE word kept */
export function TruthBadge({ state }: { state: string }) {
  const v = truthBadgeView(state);
  return (
    <span
      style={{
        color: v.colourVar,
        border: `1px solid ${v.colourVar}`,
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
      aria-label={v.ariaLabel}
      data-symbol={v.glyph.id}
    >
      <svg className="eye-truth-glyph" viewBox="0 0 24 24" width="12" height="12" focusable="false" aria-hidden="true">
        {v.glyph.paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} stroke={p.fill ? 'none' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            {...(p.dashed === true ? { strokeDasharray: '3 2' } : {})} />
        ))}
      </svg>{' '}{v.text}
    </span>
  );
}
/* end B81 re */

export function LifecycleBadge({ state }: { state: string }) {
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
    >
      {state}
    </span>
  );
}

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
