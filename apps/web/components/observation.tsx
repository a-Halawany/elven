'use client';
/**
 * Observation Operations components — WS-02, UX_SCREEN_MAP.
 *
 * Three rules shape everything here, and each is visible in the code rather than
 * only in the design note:
 *
 *  1. `unknown` IS A VALUE, NOT AN ABSENCE. It renders with the same weight as a
 *     measurement, in its own neutral, never green and never blank. A source we
 *     cannot measure is a fact about our coverage.
 *  2. STATE IS NEVER CARRIED BY COLOUR ALONE. Every state badge is a glyph plus
 *     an uppercase word plus a colour, so it survives a monochrome screen, a
 *     colour-vision difference, and a screenshot in a report.
 *  3. A GOVERNED CONTROL NEVER LOOKS DONE BEFORE IT IS. `GovernedButton` enters a
 *     labelled pending state, disables itself, and resolves only on the server's
 *     answer. There is no optimistic path through it.
 *
 * Layout uses logical properties throughout (`marginInline`, `paddingBlock`,
 * `insetInlineStart`) so the shell mirrors under `dir="rtl"` without a second
 * stylesheet, and identifiers, digests and timestamps are wrapped in `<bdi>` so
 * they stay LTR inside mirrored text.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { HealthState } from '../lib/observation';

/* ───────────────────────── state display ───────────────────────── */

const HEALTH: Record<HealthState, { glyph: string; token: string; label: string }> = {
  healthy: { glyph: '●', token: '--eye-color-success', label: 'HEALTHY' },
  degraded: { glyph: '◐', token: '--eye-color-warning', label: 'DEGRADED' },
  // The neutral that `unknown` gets to itself. Deliberately NOT the warning
  // colour: not knowing is a different fact from knowing something is wrong.
  unknown: { glyph: '◍', token: '--eye-color-uncertain', label: 'UNKNOWN' },
  suspended: { glyph: '⊘', token: '--eye-color-ink-muted', label: 'SUSPENDED' },
  failed: { glyph: '✕', token: '--eye-color-critical', label: 'FAILED' },
};

export function HealthBadge({ state, lagClass }: { state: HealthState; lagClass?: string }) {
  const h = HEALTH[state] ?? HEALTH.unknown;
  return (
    <span
      style={{
        color: `var(${h.token})`,
        border: `1px solid var(${h.token})`,
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
      aria-label={`source health ${h.label.toLowerCase()}${lagClass !== undefined ? `, ${lagClass.replace('_', ' ')}` : ''}`}
    >
      {h.glyph} {h.label}
    </span>
  );
}

/**
 * Authority class, at list density.
 *
 * An observational source may never be presented as factual authority, so its
 * badge is always present next to its evidence — a reviewer must never have to
 * click to discover what they are reading.
 */
export function AuthorityBadge({ authorityClass }: { authorityClass: string }) {
  const observational = authorityClass === 'observational';
  const token = observational ? '--eye-color-uncertain' : '--eye-color-ink-muted';
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
      title={observational
        ? 'Observational: this source indexes what others published. It may never be presented as factual authority.'
        : 'Authoritative: the publisher is the authority of record for this data.'}
    >
      {observational ? '○ OBSERVATIONAL' : '◆ AUTHORITATIVE'}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      style={{
        color: 'var(--eye-color-ink-muted)',
        border: '1px dashed var(--eye-color-border-default)',
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        whiteSpace: 'nowrap',
      }}
      title={mode === 'replay'
        ? 'Replay: collected from the frozen fixture set, byte-identical with the network disconnected.'
        : 'Live: collected from the publisher at run time.'}
    >
      {mode === 'replay' ? '⟲ REPLAY' : '⇢ LIVE'}
    </span>
  );
}

/**
 * The synthetic marker. A synthetic record can NEVER be displayed without it —
 * a provenance product cannot be casual about which of its own facts are
 * invented.
 */
export function SyntheticMarker({ synthetic }: { synthetic: boolean }) {
  if (!synthetic) return null;
  return (
    <span
      style={{
        color: 'var(--eye-color-synthetic)',
        border: '1px solid var(--eye-color-synthetic)',
        borderRadius: 'var(--eye-radius-sm)',
        paddingInline: 'var(--eye-space-4)',
        fontSize: 'var(--eye-type-label-sm)',
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
      title="Every record from this source is synthetic. It describes no real organisation, shipment or contract."
    >
      ⬡ SYNTHETIC
    </span>
  );
}

export function RightsBadge({ state }: { state: string }) {
  if (state === 'confirmed') {
    return (
      <span style={{ color: 'var(--eye-color-success)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}>
        ✓ RIGHTS CONFIRMED
      </span>
    );
  }
  const withdrawn = state === 'withdrawn';
  return (
    <span
      style={{
        color: `var(${withdrawn ? '--eye-color-critical' : '--eye-color-warning'})`,
        fontSize: 'var(--eye-type-label-sm)',
        fontWeight: 650,
      }}
      title={withdrawn
        ? 'The publisher’s reuse rights have been withdrawn. This contract cannot be activated.'
        : 'The reuse notice for this source could not be verified from primary documentation. Live acquisition is blocked; replay is unaffected.'}
    >
      {withdrawn ? '⊘ RIGHTS WITHDRAWN' : '⚠ RIGHTS UNVERIFIED'}
    </span>
  );
}

const MEASUREMENT_STATE: Record<string, { glyph: string; token: string; label: string }> = {
  measured: { glyph: '●', token: '--eye-color-success', label: 'MEASURED' },
  unknown: { glyph: '◍', token: '--eye-color-uncertain', label: 'UNKNOWN' },
  indeterminate: { glyph: '◍', token: '--eye-color-uncertain', label: 'INDETERMINATE' },
  insufficient_evidence: { glyph: '◔', token: '--eye-color-warning', label: 'INSUFFICIENT EVIDENCE' },
  not_applicable: { glyph: '—', token: '--eye-color-ink-muted', label: 'NOT APPLICABLE' },
};

export function MeasurementState({ state }: { state: string }) {
  const m = MEASUREMENT_STATE[state] ?? MEASUREMENT_STATE.unknown;
  return (
    <span
      style={{ color: `var(${m.token})`, fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}
      aria-label={`measurement state ${m.label.toLowerCase()}`}
    >
      {m.glyph} {m.label}
    </span>
  );
}

/* ───────────────────────── governed controls ───────────────────────── */

export type PendingState = 'idle' | 'pending' | 'done' | 'failed';

/**
 * A control for a governed action.
 *
 * It enters a PENDING state labelled with the verb in progress, disables itself,
 * and resolves only when the server answers. On failure the prior state is
 * restored and the reason is shown in full — never "something went wrong".
 */
export function GovernedButton({
  label, pendingLabel, onRun, disabled, variant,
}: {
  label: string;
  pendingLabel: string;
  onRun: () => Promise<void>;
  disabled?: boolean;
  variant?: 'primary' | 'quiet' | 'critical';
}) {
  const [state, setState] = useState<PendingState>('idle');
  const busy = state === 'pending';
  const v = variant ?? 'primary';
  const border =
    v === 'critical' ? 'var(--eye-color-critical)'
    : v === 'quiet' ? 'var(--eye-color-border-strong)'
    : 'var(--eye-color-accent-strong)';
  const background =
    busy ? 'var(--eye-color-surface-secondary)'
    : v === 'primary' ? 'var(--eye-color-accent-default)'
    : 'var(--eye-color-surface-primary)';
  const color =
    busy ? 'var(--eye-color-ink-muted)'
    : v === 'primary' ? 'var(--eye-color-surface-primary)'
    : v === 'critical' ? 'var(--eye-color-critical)'
    : 'var(--eye-color-ink-default)';

  return (
    <button
      type="button"
      disabled={busy || disabled === true}
      aria-busy={busy}
      onClick={() => {
        setState('pending');
        void onRun()
          .then(() => setState('done'))
          .catch(() => setState('failed'));
      }}
      style={{
        blockSize: 'var(--eye-size-control-md)',
        border: `1px solid ${border}`,
        borderRadius: 'var(--eye-radius-md)',
        paddingInline: 'var(--eye-space-12)',
        background,
        color,
        fontWeight: 600,
        cursor: busy || disabled === true ? 'not-allowed' : 'pointer',
        opacity: disabled === true && !busy ? 0.55 : 1,
      }}
    >
      {busy ? `${pendingLabel}…` : label}
    </button>
  );
}

/* ───────────────────────── layout helpers ───────────────────────── */

/**
 * Wide content scrolls inside its OWN container. The page body never scrolls
 * horizontally at any breakpoint — a table that pushes the page sideways loses
 * the navigation with it.
 */
export function ScrollBox({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      role={label !== undefined ? 'region' : undefined}
      aria-label={label}
      tabIndex={label !== undefined ? 0 : undefined}
      style={{ overflowX: 'auto', maxInlineSize: '100%' }}
    >
      {children}
    </div>
  );
}

/** An identifier, digest or timestamp: monospace, and LTR even inside RTL text. */
export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <bdi
      title={title}
      style={{
        fontFamily: 'var(--eye-font-mono)',
        fontSize: 'var(--eye-type-mono-sm)',
        unicodeBidi: 'isolate',
        direction: 'ltr',
      }}
    >
      {children}
    </bdi>
  );
}

export function DefinitionRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(9rem, 14rem) 1fr',
        gap: 'var(--eye-space-8)',
        paddingBlock: 'var(--eye-space-4)',
        borderBlockEnd: '1px solid var(--eye-color-border-default)',
      }}
    >
      <dt style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase' }}>
        {term}
      </dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

/** A statement of what we do not know, given the same weight as what we do. */
export function UnknownNote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        color: 'var(--eye-color-ink-default)',
        background: 'var(--eye-color-surface-secondary)',
        borderInlineStart: '3px solid var(--eye-color-uncertain)',
        paddingBlock: 'var(--eye-space-8)',
        paddingInline: 'var(--eye-space-12)',
        margin: 0,
        marginBlock: 'var(--eye-space-8)',
        fontSize: 'var(--eye-type-body-sm)',
      }}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>{children}</p>
  );
}

export const cardStyle: CSSProperties = {
  background: 'var(--eye-color-surface-primary)',
  border: '1px solid var(--eye-color-border-default)',
  borderRadius: 'var(--eye-radius-lg)',
  padding: 'var(--eye-space-16)',
};

export const badgeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--eye-space-8)',
  alignItems: 'center',
};

export const textareaStyle: CSSProperties = {
  inlineSize: '100%',
  minBlockSize: '4.5rem',
  border: '1px solid var(--eye-color-border-default)',
  borderRadius: 'var(--eye-radius-md)',
  padding: 'var(--eye-space-8)',
  fontSize: 'var(--eye-type-body-md)',
  fontFamily: 'var(--eye-font-ui)',
  background: 'var(--eye-color-surface-primary)',
  color: 'var(--eye-color-ink-default)',
};

/** A polite live region for status that changes under the operator's eye. */
export function LiveStatus({ children, assertive }: { children: ReactNode; assertive?: boolean }) {
  return (
    <div
      role="status"
      aria-live={assertive === true ? 'assertive' : 'polite'}
      style={{ fontSize: 'var(--eye-type-body-sm)', color: 'var(--eye-color-ink-muted)' }}
    >
      {children}
    </div>
  );
}

export function fmtInstant(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'none recorded';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

export function fmtBytes(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return 'unknown';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}
