/**
 * B80 §TK (F-P7-E-03: UX-17-001…004, UX-68-001, REL-16) — THE TOKEN INSPECTION as a pure function: for every colour token its meaning, its
 * light and dark values, whether a customer theme may map it (the allowed-key whitelist) or never (semantic and status), its NON-COLOUR CUE
 * (the symbol that carries its meaning when colour cannot), and — for an ink — its contrast on every surface in light and dark with the
 * surfaces it is PERMITTED on (the pairs that pass the rule that applies). The page /admin/governance/design/tokens renders exactly this.
 */
import { ALLOWED_COLOUR_KEYS, COLOR_TOKENS, CORE_DARK, CORE_LIGHT, NON_TEXT_MIN, PRIMARY_INKS, SELECTION, STATUS_INKS, SURFACES, SYMBOLS, TEXT_MIN, contrastRatio, floor2 } from '@eye/tokens';

export interface ColourInspection {
  id: string; token: string; role: string; light: string; dark: string; mappable: boolean; cue: string | null; kind: 'surface' | 'ink' | 'status' | 'other';
  contrast: Array<{ mode: 'light' | 'dark'; surface: string; ratio: number; required: number; permitted: boolean }>;
}

export function inspectColours(): ColourInspection[] {
  const surfaces = [...SURFACES, SELECTION];
  return COLOR_TOKENS.map((t) => {
    const isInk = (PRIMARY_INKS as readonly string[]).includes(t.token); const isStatus = (STATUS_INKS as readonly string[]).includes(t.token);
    const kind: ColourInspection['kind'] = (surfaces as readonly string[]).includes(t.token) ? 'surface' : isInk ? 'ink' : isStatus ? 'status' : 'other';
    const contrast: ColourInspection['contrast'] = [];
    if (isInk || isStatus) {
      for (const mode of ['light', 'dark'] as const) {
        const pal = mode === 'light' ? CORE_LIGHT : CORE_DARK;
        for (const s of surfaces) {
          const required = isStatus && s === SELECTION ? NON_TEXT_MIN : TEXT_MIN;
          const ratio = contrastRatio(pal[t.token]!, pal[s]!);
          contrast.push({ mode, surface: s, ratio: floor2(ratio), required, permitted: ratio >= required });
        }
      }
    }
    const sym = SYMBOLS.find((x) => x.token === t.token && !x.id.startsWith('GEN'));
    return { id: t.id, token: t.token, role: t.role, light: t.light, dark: t.dark, mappable: (ALLOWED_COLOUR_KEYS as readonly string[]).includes(t.token), cue: sym === undefined ? null : `${sym.label} (${sym.shape})`, kind, contrast };
  });
}
