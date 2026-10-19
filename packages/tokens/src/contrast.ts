/**
 * B80 §TK (F-P7-E-03: UX-17-001/-002/-006, UX-68-006, REL-16, PAT-41) — THE CONTRAST MATRIX: WCAG 2.x relative luminance and contrast
 * ratio, CIE L*a*b* colour difference (ΔE76) for distinguishability, and colour-vision simulation (Machado et al. 2009, severity 1.0, in
 * linear sRGB) — pure functions, no dependency, deterministic. The SAME algorithm and the SAME pair rules are implemented in SQL by
 * 0118 §TK (governance.theme_matrix) so a certification is recomputed IN THE PORT from the stored mapping and never trusted from a client;
 * the integration harness phase6-themes-b80 proves the two agree pair by pair.
 *
 * THE PAIR RULES (CONTRAST_RULES_VERSION):
 *   text      4.5:1 — the inks (ink.strong/default/muted, accent.default/strong) on every surface (canvas, the three surfaces, selection);
 *             every status and truth-state ink on the four work surfaces (a status is read as text in its badge).
 *   non_text  3:1   — the focus ring on every surface; every status and truth-state ink on the SELECTION surface (on a selected row the
 *             status is carried by its symbol and its label in ink.default — the status colour paints the glyph only).
 *   distinct  ΔE76 ≥ 25 — the accent (default) against every STATUS colour (critical, warning, success, info, degraded, withdrawn) and the
 *             decided state, and the recommended state against the decided state (CLR-023: never resembles a decision).
 *   distinct_cvd ΔE76 ≥ 12 — the accent against critical and warning under protan, deutan and tritan simulation (colour-vision).
 *   Forced colours: the system palette (two reference schemes) — CanvasText/Canvas, LinkText/Canvas, HighlightText/Highlight,
 *             ButtonText/ButtonFace (text 4.5:1), Highlight/Canvas (non_text 3:1); colour carries no meaning there (UX-17-004: the symbol
 *             and the label do), so the distinctness rules do not apply.
 * Disabled ink (color.disabled.ink) is exempt (WCAG 1.4.3: inactive components) and borders are structural (no control is identified by
 * its border alone — every control has a label): neither is a pair. A ratio is compared UNROUNDED; it is DISPLAYED floored to two
 * decimals (4.499 shows 4.49 and fails — never rounded up into a pass).
 */

export const CONTRAST_RULES_VERSION = 'b80-tk-contrast-1';
export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3;
export const DISTINCT_MIN = 25;
export const DISTINCT_CVD_MIN = 12;

export type Rgb = readonly [number, number, number];
const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** `#RRGGBB` → [r, g, b] 0–255; null for anything else (a theme value is validated before it is used). */
export function parseHex(hex: string): Rgb | null {
  if (!HEX6.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const must = (hex: string): Rgb => { const v = parseHex(hex); if (v === null) throw new Error(`not a #RRGGBB colour: ${hex}`); return v; };
/** sRGB channel (0–255) → linear (0–1), WCAG 2.x. */
export const linearise = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const linearOf = (hex: string): Rgb => { const [r, g, b] = must(hex); return [linearise(r), linearise(g), linearise(b)]; };
const lumLinear = (l: Rgb): number => 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];

/** WCAG 2.x relative luminance of `#RRGGBB`. */
export function relativeLuminance(hex: string): number { return lumLinear(linearOf(hex)); }
/** WCAG 2.x contrast ratio (1–21), unrounded. */
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a); const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** A ratio or a difference as DISPLAYED: floored to two decimals (never rounded up into a pass). */
export const floor2 = (v: number): number => Math.floor(v * 100) / 100;

/** CIE L*a*b* (D65) from linear sRGB. */
function labOfLinear(l: Rgb): [number, number, number] {
  const x = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047;
  const y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  const z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a: Rgb, b: Rgb): number => { const p = labOfLinear(a); const q = labOfLinear(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
/** ΔE76 between two `#RRGGBB` colours. */
export function deltaE76(a: string, b: string): number { return dE(linearOf(a), linearOf(b)); }

export type CvdKind = 'protan' | 'deutan' | 'tritan';
/** Machado, Oliveira & Fernandes (2009), severity 1.0 — applied to linear sRGB, clamped to [0, 1]. */
export const CVD_MATRICES: Readonly<Record<CvdKind, readonly (readonly [number, number, number])[]>> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
function simulateLinear(l: Rgb, kind: CvdKind): Rgb {
  const m = CVD_MATRICES[kind];
  const row = (i: number) => { const r = m[i]!; return clamp01(r[0] * l[0] + r[1] * l[1] + r[2] * l[2]); };
  return [row(0), row(1), row(2)];
}
/** ΔE76 between two colours as seen under a colour-vision deficiency. */
export function deltaE76Cvd(a: string, b: string, kind: CvdKind): number { return dE(simulateLinear(linearOf(a), kind), simulateLinear(linearOf(b), kind)); }

/* ── THE PAIRS ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const SURFACES = ['color.canvas', 'color.surface.primary', 'color.surface.secondary', 'color.surface.elevated'] as const;
export const SELECTION = 'color.selection';
export const PRIMARY_INKS = ['color.ink.strong', 'color.ink.default', 'color.ink.muted', 'color.accent.default', 'color.accent.strong'] as const;
export const STATUS_INKS = ['color.info', 'color.success', 'color.warning', 'color.critical', 'color.uncertain', 'color.observed', 'color.asserted', 'color.inferred',
  'color.assessed', 'color.synthetic', 'color.recommended', 'color.decided', 'color.corrected', 'color.withdrawn', 'color.classification', 'color.degraded'] as const;
/** The status colours the accent must never resemble (with the decided state). */
export const DISTINCT_FROM_ACCENT = ['color.critical', 'color.warning', 'color.success', 'color.info', 'color.degraded', 'color.withdrawn', 'color.decided'] as const;
export const CVD_DISTINCT_FROM_ACCENT = ['color.critical', 'color.warning'] as const;
export const CVD_KINDS: readonly CvdKind[] = ['protan', 'deutan', 'tritan'];

export type ColourMode = 'light' | 'dark' | 'print';
export type ForcedMode = 'forced_colors_black' | 'forced_colors_white';
export type Mode = ColourMode | ForcedMode;
export const MODES: readonly Mode[] = ['light', 'dark', 'print', 'forced_colors_black', 'forced_colors_white'];
export type PairKind = 'text' | 'non_text' | 'distinct' | 'distinct_cvd';
export interface PairRule { kind: PairKind; fg: string; bg: string; required: number; cvd?: CvdKind }

/** The rules of one colour mode (light, dark, print) — over the token names. Deterministic order. */
export function colourModeRules(): PairRule[] {
  const out: PairRule[] = [];
  for (const fg of PRIMARY_INKS) for (const bg of [...SURFACES, SELECTION]) out.push({ kind: 'text', fg, bg, required: TEXT_MIN });
  for (const fg of STATUS_INKS) for (const bg of SURFACES) out.push({ kind: 'text', fg, bg, required: TEXT_MIN });
  for (const bg of [...SURFACES, SELECTION]) out.push({ kind: 'non_text', fg: 'color.focus', bg, required: NON_TEXT_MIN });
  for (const fg of STATUS_INKS) out.push({ kind: 'non_text', fg, bg: SELECTION, required: NON_TEXT_MIN });
  for (const bg of DISTINCT_FROM_ACCENT) out.push({ kind: 'distinct', fg: 'color.accent.default', bg, required: DISTINCT_MIN });
  out.push({ kind: 'distinct', fg: 'color.recommended', bg: 'color.decided', required: DISTINCT_MIN });
  for (const cvd of CVD_KINDS) for (const bg of CVD_DISTINCT_FROM_ACCENT) out.push({ kind: 'distinct_cvd', fg: 'color.accent.default', bg, required: DISTINCT_CVD_MIN, cvd });
  return out;
}

/** The forced-colours system palette keys and their rules. */
export const SYSTEM_KEYS = ['Canvas', 'CanvasText', 'LinkText', 'GrayText', 'Highlight', 'HighlightText', 'ButtonFace', 'ButtonText'] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];
export function forcedModeRules(): PairRule[] {
  return [
    { kind: 'text', fg: 'CanvasText', bg: 'Canvas', required: TEXT_MIN },
    { kind: 'text', fg: 'LinkText', bg: 'Canvas', required: TEXT_MIN },
    { kind: 'text', fg: 'HighlightText', bg: 'Highlight', required: TEXT_MIN },
    { kind: 'text', fg: 'ButtonText', bg: 'ButtonFace', required: TEXT_MIN },
    { kind: 'non_text', fg: 'Highlight', bg: 'Canvas', required: NON_TEXT_MIN },
  ];
}

export interface PairResult { mode: Mode; kind: PairKind; fg: string; bg: string; fgValue: string; bgValue: string; value: number; shown: number; required: number; pass: boolean; cvd?: CvdKind }
export interface MatrixResult {
  rulesVersion: string;
  outcome: 'pass' | 'fail';
  pairs: number;
  failing: PairResult[];
  modes: Array<{ mode: Mode; pairs: number; failing: number; minText: number }>;
  results: PairResult[];
}

/** Evaluate one rule over a resolved palette (token or system key → `#RRGGBB`). */
export function evaluate(mode: Mode, rule: PairRule, palette: Readonly<Record<string, string>>): PairResult {
  const fgValue = palette[rule.fg]; const bgValue = palette[rule.bg];
  if (fgValue === undefined || bgValue === undefined) throw new Error(`the ${mode} palette lacks ${fgValue === undefined ? rule.fg : rule.bg}`);
  const value = rule.kind === 'distinct' ? deltaE76(fgValue, bgValue)
    : rule.kind === 'distinct_cvd' ? deltaE76Cvd(fgValue, bgValue, rule.cvd ?? 'deutan')
    : contrastRatio(fgValue, bgValue);
  const r: PairResult = { mode, kind: rule.kind, fg: rule.fg, bg: rule.bg, fgValue: fgValue.toUpperCase(), bgValue: bgValue.toUpperCase(), value, shown: floor2(value), required: rule.required, pass: value >= rule.required };
  if (rule.cvd !== undefined) r.cvd = rule.cvd;
  return r;
}

/** THE MATRIX over the five modes' palettes. The outcome is `pass` only when every pair passes. */
export function contrastMatrix(palettes: Readonly<Record<Mode, Readonly<Record<string, string>>>>): MatrixResult {
  const results: PairResult[] = [];
  const modes: MatrixResult['modes'] = [];
  for (const mode of MODES) {
    const rules = mode === 'forced_colors_black' || mode === 'forced_colors_white' ? forcedModeRules() : colourModeRules();
    const rs = rules.map((rule) => evaluate(mode, rule, palettes[mode]));
    results.push(...rs);
    const texts = rs.filter((x) => x.kind === 'text').map((x) => x.value);
    modes.push({ mode, pairs: rs.length, failing: rs.filter((x) => !x.pass).length, minText: floor2(texts.length === 0 ? 0 : Math.min(...texts)) });
  }
  const failing = results.filter((x) => !x.pass);
  return { rulesVersion: CONTRAST_RULES_VERSION, outcome: failing.length === 0 ? 'pass' : 'fail', pairs: results.length, failing, modes, results };
}

/** A failing pair in words (the certification refusal names the pair and its number). */
export function pairText(p: Pick<PairResult, 'mode' | 'kind' | 'fg' | 'bg' | 'shown' | 'required' | 'cvd'>): string {
  const what = p.kind === 'distinct' || p.kind === 'distinct_cvd'
    ? `${p.fg} vs ${p.bg} ΔE ${p.shown.toFixed(2)} < ${p.required}${p.cvd === undefined ? '' : ` (${p.cvd} simulation)`}`
    : `${p.fg} on ${p.bg} ${p.shown.toFixed(2)}:1 < ${p.required}:1`;
  return `${p.mode}: ${what}`;
}
