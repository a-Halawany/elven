/**
 * WARNING LEVELS (migration 0061; register R-4 (1)) as the screen states them.
 *
 * A warning raised since the derivation exists carries a level — low, normal, high, critical —
 * derived from the C0–C4 class of the consequence its flip reaches under a VERSIONED rule, and
 * the version it was derived under. A warning raised before any derivation carries none, and the
 * screen says so rather than inventing one. The level is a display label: it is stated beside the
 * class it came from and beside the C0–C4 class of the operation that raised it, and it never
 * changes the authority a response requires.
 *
 * GLB-09: every level is glyph + text + colour token — never colour alone.
 */
export type WarningLevel = 'low' | 'normal' | 'high' | 'critical';
export type LevelState = WarningLevel | 'none';

export function levelOf(w: { level?: string | null }): LevelState {
  if (w.level === 'low' || w.level === 'normal' || w.level === 'high' || w.level === 'critical') return w.level;
  return 'none';
}

export const LEVEL_GLYPH: Readonly<Record<LevelState, string>> = Object.freeze({ low: '○', normal: '●', high: '▲', critical: '◆', none: '◌' });
export const LEVEL_LABEL: Readonly<Record<LevelState, string>> = Object.freeze({
  low: 'LOW', normal: 'NORMAL', high: 'HIGH', critical: 'CRITICAL', none: 'no level — raised before derivation v1',
});
export const LEVEL_TOKEN: Readonly<Record<LevelState, string>> = Object.freeze({
  low: '--eye-color-ink-muted', normal: '--eye-color-accent-default', high: '--eye-color-warning', critical: '--eye-color-critical', none: '--eye-color-ink-muted',
});
export const URGENCY_LABEL: Readonly<Record<string, string>> = Object.freeze({
  routine: 'routine — answer inside the response window', prompt: 'prompt — the response window is the product',
  urgent: 'urgent — answer before the decision deadline', immediate: 'immediate — act at once',
});
/** The badge text: glyph and label together, so the level reads without its colour. */
export function levelBadge(w: { level?: string | null; level_version?: number | null }): string {
  const l = levelOf(w);
  return l === 'none' ? `${LEVEL_GLYPH.none} ${LEVEL_LABEL.none}` : `${LEVEL_GLYPH[l]} ${LEVEL_LABEL[l]} · derivation v${w.level_version ?? '?'}`;
}
